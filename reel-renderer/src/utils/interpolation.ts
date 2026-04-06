/**
 * utils/interpolation.ts — Animate layer properties based on timeline
 *
 * Resolves the current value of every animatable property for a layer,
 * given the current frame within a scene.
 */

import { interpolate, Easing } from "remotion";
import type { Layer, TimelineEntry } from "../types";
import { msToFrame, parsePercent } from "./timing";

/** Map DSL easing names to Remotion Easing functions */
function getEasing(name?: string): ((t: number) => number) {
  switch (name) {
    case "linear":
      return Easing.linear;
    case "ease-in":
      return Easing.in(Easing.ease);
    case "ease-out":
      return Easing.out(Easing.ease);
    case "ease-in-out":
      return Easing.inOut(Easing.ease);
    case "spring":
      return Easing.out(Easing.back(1.4));
    case "bounce":
      return Easing.out(Easing.bounce);
    default:
      return Easing.out(Easing.ease);
  }
}

export interface AnimatedProps {
  opacity: number;
  x: number;    // percentage (0-1)
  y: number;    // percentage (0-1)
  scale: number;
  rotate: number;
  /** For typewriter: how many characters to show */
  typewriterChars: number | null;
  /** For counter: current value */
  counterValue: number | null;
}

/**
 * Compute animated properties for a layer at the given scene-local frame.
 */
export function getAnimatedProps(
  layer: Layer,
  timeline: TimelineEntry[],
  frame: number,
  fps: number,
): AnimatedProps {
  // Start with defaults from the layer itself
  let opacity = layer.opacity ?? 0;
  let x = parsePercent(layer.x, 0);
  let y = parsePercent(layer.y, 0);
  let scale = layer.scale ?? 1;
  let rotate = layer.rotate ?? 0;
  let typewriterChars: number | null = null;
  let counterValue: number | null = null;

  // Collect all timeline entries for this layer, sorted by start time
  const entries = timeline
    .filter((e) => e.target === layer.id)
    .sort((a, b) => a.at - b.at);

  for (const entry of entries) {
    const startFrame = msToFrame(entry.at, fps);
    const durFrames = msToFrame(entry.duration, fps);
    const endFrame = startFrame + durFrames;
    const easing = getEasing(entry.easing);

    const anim = entry.animate;

    // Numeric interpolations
    if (anim.opacity) {
      const [from, to] = anim.opacity;
      opacity = interpolate(frame, [startFrame, endFrame], [from, to], {
        easing,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }

    if (anim.scale) {
      const [from, to] = anim.scale;
      scale = interpolate(frame, [startFrame, endFrame], [from, to], {
        easing,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }

    if (anim.rotate) {
      const [from, to] = anim.rotate;
      rotate = interpolate(frame, [startFrame, endFrame], [from, to], {
        easing,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }

    // Position interpolation (percentage strings)
    if (anim.x) {
      const from = parsePercent(anim.x[0], x);
      const to = parsePercent(anim.x[1], x);
      x = interpolate(frame, [startFrame, endFrame], [from, to], {
        easing,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }

    if (anim.y) {
      const from = parsePercent(anim.y[0], y);
      const to = parsePercent(anim.y[1], y);
      y = interpolate(frame, [startFrame, endFrame], [from, to], {
        easing,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }

    // Typewriter effect
    if (anim.typewriter) {
      const textContent = layer.props?.content || layer.props?.text || "";
      const totalChars = textContent.length;
      typewriterChars = Math.round(
        interpolate(frame, [startFrame, endFrame], [0, totalChars], {
          easing: Easing.linear,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      );
    }

    // Counter animation
    if (anim.countUp) {
      const from = layer.props?.from ?? 0;
      const to = layer.props?.to ?? 100;
      counterValue = Math.round(
        interpolate(frame, [startFrame, endFrame], [from, to], {
          easing,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      );
    }
  }

  return { opacity, x, y, scale, rotate, typewriterChars, counterValue };
}
