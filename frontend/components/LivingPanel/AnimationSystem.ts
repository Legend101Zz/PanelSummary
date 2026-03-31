/**
 * AnimationSystem.ts — Timeline-based animation interpreter
 * ==========================================================
 * Reads the timeline from a LivingPanelDSL and schedules
 * CSS/Motion animations on the correct layers at the correct times.
 *
 * DESIGN: Uses requestAnimationFrame + setTimeout scheduling.
 * Motion.dev handles the actual interpolation and spring physics.
 * This module is the "conductor" — it tells Motion WHAT to animate WHEN.
 */

import type {
  TimelineStep,
  AnimationProps,
  EasingType,
  EventBinding,
  EventAction,
} from "@/lib/living-panel-types";

// ============================================================
// EASING MAPS (DSL easing → CSS / Motion easing)
// ============================================================

export const EASING_MAP: Record<EasingType, string | number[]> = {
  "linear":      "linear",
  "ease-in":     "easeIn",
  "ease-out":    "easeOut",
  "ease-in-out": "easeInOut",
  "spring":      "spring",       // handled specially by Motion
  "bounce":      [0.36, 1.56, 0.64, 1],
  "elastic":     [0.68, -0.55, 0.265, 1.55],
  "sharp":       [0.4, 0, 0.2, 1],
};

/** Convert DSL easing to Motion.dev transition config */
export function getTransitionConfig(easing?: EasingType, duration?: number) {
  if (easing === "spring") {
    return { type: "spring" as const, stiffness: 200, damping: 20 };
  }
  if (easing === "bounce") {
    return { type: "spring" as const, stiffness: 300, damping: 10 };
  }

  const easingValue = easing ? EASING_MAP[easing] : "easeOut";
  return {
    duration: (duration || 500) / 1000,  // Motion uses seconds
    ease: typeof easingValue === "string" ? easingValue : easingValue,
  };
}

// ============================================================
// TIMELINE SCHEDULER
// ============================================================

export interface ScheduledAnimation {
  step: TimelineStep;
  timerId: ReturnType<typeof setTimeout> | null;
}

/**
 * Schedule all timeline steps and return cleanup function.
 * Each step fires a callback at the specified time with
 * the animation target and properties.
 */
export function scheduleTimeline(
  timeline: TimelineStep[],
  onAnimate: (step: TimelineStep) => void,
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];

  for (const step of timeline) {
    const timerId = setTimeout(() => {
      onAnimate(step);

      // Handle repeating animations
      if (step.repeat && step.repeat !== 0) {
        const repeatCount = step.repeat === -1 ? Infinity : step.repeat;
        let count = 0;
        const interval = setInterval(() => {
          count++;
          onAnimate(step);
          if (count >= repeatCount) clearInterval(interval);
        }, step.duration);
        timers.push(interval as unknown as ReturnType<typeof setTimeout>);
      }
    }, step.at);

    timers.push(timerId);
  }

  // Cleanup function
  return () => {
    timers.forEach(t => clearTimeout(t));
  };
}

// ============================================================
// ANIMATION PROP RESOLVER
// ============================================================

/** Extract the "from" values from AnimationProps */
export function getFromValues(animate: AnimationProps): Record<string, number | string> {
  const from: Record<string, number | string> = {};

  if (animate.x) from.x = animate.x[0];
  if (animate.y) from.y = animate.y[0];
  if (animate.opacity) from.opacity = animate.opacity[0];
  if (animate.scale) from.scale = animate.scale[0];
  if (animate.rotate) from.rotate = animate.rotate[0];

  return from;
}

/** Extract the "to" values from AnimationProps */
export function getToValues(animate: AnimationProps): Record<string, number | string> {
  const to: Record<string, number | string> = {};

  if (animate.x) to.x = animate.x[1];
  if (animate.y) to.y = animate.y[1];
  if (animate.opacity) to.opacity = animate.opacity[1];
  if (animate.scale) to.scale = animate.scale[1];
  if (animate.rotate) to.rotate = animate.rotate[1];

  return to;
}

/** Check if an AnimationProps has special effects */
export function hasSpecialEffect(animate: AnimationProps): boolean {
  return !!(animate.typewriter || animate.shake || animate.pulse || animate.float || animate.glow);
}

// ============================================================
// PRESET RESOLVER
// ============================================================

import type { AnimationPreset } from "@/lib/living-panel-types";

/** Resolve a named preset into timeline-compatible animation props */
export function resolvePreset(preset: AnimationPreset): {
  from: Record<string, number | string>;
  to: Record<string, number | string>;
  duration: number;
  easing: EasingType;
} {
  const presets: Record<AnimationPreset, ReturnType<typeof resolvePreset>> = {
    "enter-left":      { from: { x: "-100%", opacity: 0 }, to: { x: "0%", opacity: 1 }, duration: 600, easing: "ease-out" },
    "enter-right":     { from: { x: "100%", opacity: 0 }, to: { x: "0%", opacity: 1 }, duration: 600, easing: "ease-out" },
    "enter-bottom":    { from: { y: "100%", opacity: 0 }, to: { y: "0%", opacity: 1 }, duration: 600, easing: "ease-out" },
    "enter-top":       { from: { y: "-100%", opacity: 0 }, to: { y: "0%", opacity: 1 }, duration: 600, easing: "ease-out" },
    "fade-in":         { from: { opacity: 0 }, to: { opacity: 1 }, duration: 500, easing: "ease-in" },
    "scale-in":        { from: { scale: 0, opacity: 0 }, to: { scale: 1, opacity: 1 }, duration: 500, easing: "spring" },
    "dramatic-zoom":   { from: { scale: 1.5, opacity: 0 }, to: { scale: 1, opacity: 1 }, duration: 800, easing: "ease-out" },
    "shake-emphasis":  { from: { x: "-5px" }, to: { x: "0px" }, duration: 400, easing: "elastic" },
    "pulse-glow":      { from: { scale: 0.95 }, to: { scale: 1.05 }, duration: 1000, easing: "ease-in-out" },
    "typewriter":      { from: { opacity: 0 }, to: { opacity: 1 }, duration: 1000, easing: "linear" },
    "float-idle":      { from: { y: "-5px" }, to: { y: "5px" }, duration: 2000, easing: "ease-in-out" },
    "spin-in":         { from: { rotate: 360, opacity: 0 }, to: { rotate: 0, opacity: 1 }, duration: 800, easing: "spring" },
    "bounce-in":       { from: { scale: 0, opacity: 0 }, to: { scale: 1, opacity: 1 }, duration: 600, easing: "bounce" },
    "slam-down":       { from: { y: "-200%", scale: 1.2 }, to: { y: "0%", scale: 1 }, duration: 400, easing: "sharp" },
    "stagger-list":    { from: { x: "-20px", opacity: 0 }, to: { x: "0px", opacity: 1 }, duration: 300, easing: "ease-out" },
  };

  return presets[preset] || presets["fade-in"];
}

// ============================================================
// TYPEWRITER EFFECT UTILITY
// ============================================================

/**
 * Returns a function that calls back with progressively
 * longer substrings of `text`, simulating a typewriter.
 */
export function createTypewriter(
  text: string,
  speed: number = 40,
  onUpdate: (visibleText: string) => void,
  onComplete?: () => void,
): () => void {
  let index = 0;
  const interval = setInterval(() => {
    index++;
    onUpdate(text.slice(0, index));
    if (index >= text.length) {
      clearInterval(interval);
      onComplete?.();
    }
  }, speed);

  return () => clearInterval(interval);
}
