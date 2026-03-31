/**
 * living-panel-types.ts — Living Manga Panel DSL Type Definitions
 * ================================================================
 * This is the "language" that LLMs generate and the rendering engine
 * interprets. Every living panel is a JSON document conforming to
 * these types.
 *
 * DESIGN PRINCIPLES:
 * 1. Flat-ish structure (LLM-friendly, max 3 levels deep)
 * 2. Timeline-based animations (keyframes, not imperative code)
 * 3. Layer-based compositing (z-order via array position)
 * 4. Event-driven interactions (onClick, onVisible, onLoad)
 * 5. Extensible via new element types + animation presets
 */

// ============================================================
// CORE DSL SCHEMA
// ============================================================

/** The root document for a Living Manga Panel */
export interface LivingPanelDSL {
  version: "1.0";
  canvas: CanvasConfig;
  layers: Layer[];
  timeline: TimelineStep[];
  events?: EventBinding[];
  meta?: PanelMeta;
}

/** Canvas dimensions and base styling */
export interface CanvasConfig {
  width: number;          // logical width (scales responsively)
  height: number;         // logical height
  background: string;     // CSS color or gradient
  overflow?: "hidden" | "visible";
  mood?: VisualMoodPreset;
}

/** Metadata for the panel (used by orchestration, not rendering) */
export interface PanelMeta {
  panel_id?: string;
  chapter_index?: number;
  page_index?: number;
  position?: string;
  content_type?: string;
  narrative_context?: string;
}

// ============================================================
// LAYER TYPES
// ============================================================

export type LayerType =
  | "background"
  | "sprite"
  | "text"
  | "speech_bubble"
  | "effect"
  | "shape"
  | "data_block"
  | "scene_transition";

export interface LayerBase {
  id: string;
  type: LayerType;
  visible?: boolean;       // default true
  opacity?: number;        // 0-1, default 1
  x?: number | string;     // position (number=px, string=percentage like "50%")
  y?: number | string;
  width?: number | string;
  height?: number | string;
  zIndex?: number;         // explicit z-order override
  rotate?: number;         // degrees
  scale?: number;          // default 1.0
  origin?: string;         // transform-origin, e.g. "center center"
}

// ── Background Layer ────────────────────────────────────────

export interface BackgroundLayer extends LayerBase {
  type: "background";
  props: {
    gradient?: string[];    // array of color stops
    gradientAngle?: number; // degrees, default 160
    image?: string;         // URL or asset key
    pattern?: "halftone" | "crosshatch" | "dots" | "lines" | "noise";
    patternColor?: string;
    patternOpacity?: number;
    parallaxSpeed?: number; // 0-1, for scroll-based parallax
  };
}

// ── Sprite Layer (character avatar) ─────────────────────────

export interface SpriteLayer extends LayerBase {
  type: "sprite";
  props: {
    character: string;           // character name from manga bible
    expression: ExpressionType;
    size?: number;               // avatar size in px, default 64
    showName?: boolean;          // show name label below, default true
    silhouette?: boolean;        // render as dark silhouette
    glowColor?: string;          // optional glow ring
  };
}

// ── Text Layer ──────────────────────────────────────────────

export interface TextLayer extends LayerBase {
  type: "text";
  props: {
    content: string;
    fontSize?: number | string;  // px or "clamp(1rem, 4vw, 3rem)"
    fontFamily?: "display" | "body" | "label" | "mono";
    color?: string;
    textAlign?: "left" | "center" | "right";
    maxWidth?: number | string;
    lineHeight?: number;
    textShadow?: string;
    letterSpacing?: string;
    highlight?: string;          // color for text highlight/underline
    typewriter?: boolean;        // animate text character by character
    typewriterSpeed?: number;    // ms per character, default 40
  };
}

// ── Speech Bubble Layer ─────────────────────────────────────

export interface SpeechBubbleLayer extends LayerBase {
  type: "speech_bubble";
  props: {
    text: string;
    character?: string;          // who's speaking
    style: "speech" | "thought" | "shout" | "whisper" | "narrator";
    tailDirection?: "left" | "right" | "bottom" | "top" | "none";
    backgroundColor?: string;
    textColor?: string;
    borderColor?: string;
    maxWidth?: number;
    typewriter?: boolean;
    typewriterSpeed?: number;
  };
}

// ── Effect Layer ────────────────────────────────────────────

export interface EffectLayer extends LayerBase {
  type: "effect";
  props: {
    effect: EffectType;
    color?: string;
    intensity?: number;          // 0-1
    count?: number;              // particle count, line count, etc.
    speed?: number;              // animation speed multiplier
    direction?: "up" | "down" | "left" | "right" | "radial" | "random";
  };
}

// ── Shape Layer ─────────────────────────────────────────────

export interface ShapeLayer extends LayerBase {
  type: "shape";
  props: {
    shape: "circle" | "rect" | "line" | "triangle" | "star" | "polygon";
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    points?: number;             // for polygon/star
    radius?: number;             // for circle
    dash?: string;               // stroke dash pattern
  };
}

// ── Data Block Layer (bold typography for stats/concepts) ───

export interface DataBlockLayer extends LayerBase {
  type: "data_block";
  props: {
    items: DataItem[];
    layout: "list" | "grid" | "stack" | "counter";
    accentColor?: string;
    showIndex?: boolean;
    animateIn?: "stagger" | "cascade" | "pop" | "none";
    staggerDelay?: number;       // ms between each item
  };
}

export interface DataItem {
  label: string;
  value?: string;
  icon?: string;                 // emoji or icon name
  highlight?: boolean;
}

// ── Scene Transition Layer ──────────────────────────────────

export interface SceneTransitionLayer extends LayerBase {
  type: "scene_transition";
  props: {
    transition: TransitionType;
    color?: string;
    text?: string;
    duration?: number;           // ms
  };
}

/** Union of all layer types */
export type Layer =
  | BackgroundLayer
  | SpriteLayer
  | TextLayer
  | SpeechBubbleLayer
  | EffectLayer
  | ShapeLayer
  | DataBlockLayer
  | SceneTransitionLayer;

// ============================================================
// ANIMATION SYSTEM
// ============================================================

/** A single step in the animation timeline */
export interface TimelineStep {
  at: number;                    // start time in ms (0 = panel load)
  target: string;                // layer id to animate
  animate: AnimationProps;
  duration: number;              // ms
  easing?: EasingType;
  repeat?: number;               // -1 = infinite
  yoyo?: boolean;                // reverse on repeat
}

/** Animatable properties — from → to values */
export interface AnimationProps {
  x?: [number | string, number | string];
  y?: [number | string, number | string];
  opacity?: [number, number];
  scale?: [number, number];
  rotate?: [number, number];
  width?: [number | string, number | string];
  height?: [number | string, number | string];
  // Special animations
  typewriter?: boolean;          // text: reveal char by char
  shake?: { intensity: number; count: number };
  pulse?: { minScale: number; maxScale: number };
  float?: { distance: number; speed: number };
  glow?: { color: string; minOpacity: number; maxOpacity: number };
}

// ============================================================
// EVENT SYSTEM
// ============================================================

export interface EventBinding {
  trigger: "onClick" | "onVisible" | "onHover" | "onScroll";
  target: string;                // layer id
  actions: EventAction[];
}

export interface EventAction {
  type: "animate" | "show" | "hide" | "toggle" | "playTimeline";
  target?: string;               // layer id (defaults to event target)
  animate?: AnimationProps;
  duration?: number;
  easing?: EasingType;
}

// ============================================================
// ENUMS & PRESETS
// ============================================================

export type ExpressionType =
  | "neutral" | "curious" | "shocked" | "determined"
  | "wise" | "thoughtful" | "excited" | "sad"
  | "angry" | "smirk" | "fearful" | "triumphant";

export type VisualMoodPreset =
  | "dramatic-dark" | "warm-amber" | "cool-mystery"
  | "intense-red" | "calm-green" | "ethereal-purple"
  | "sunrise-hope" | "storm-tension" | "neon-cyberpunk";

export type EffectType =
  | "particles" | "speed_lines" | "impact_burst"
  | "sparkle" | "rain" | "snow" | "smoke"
  | "screen_shake" | "vignette" | "lens_flare"
  | "floating_kanji" | "ink_splash" | "lightning";

export type TransitionType =
  | "fade_black" | "fade_white" | "wipe_left" | "wipe_right"
  | "iris_in" | "iris_out" | "shatter" | "page_turn"
  | "ink_wash" | "dissolve";

export type EasingType =
  | "linear" | "ease-in" | "ease-out" | "ease-in-out"
  | "spring" | "bounce" | "elastic" | "sharp";

// ============================================================
// ANIMATION PRESETS (LLM can reference these by name)
// ============================================================

export type AnimationPreset =
  | "enter-left"       // slide in from left with fade
  | "enter-right"      // slide in from right with fade
  | "enter-bottom"     // slide up from below
  | "enter-top"        // drop in from above
  | "fade-in"          // simple opacity 0→1
  | "scale-in"         // grow from 0→1
  | "dramatic-zoom"    // scale 1.5→1 with fade
  | "shake-emphasis"   // quick shake animation
  | "pulse-glow"       // pulse with glow
  | "typewriter"       // character-by-character text reveal
  | "float-idle"       // gentle up/down float
  | "spin-in"          // rotate 360° while appearing
  | "bounce-in"        // bouncy entrance
  | "slam-down"        // fast drop with impact
  | "stagger-list";    // items appear one by one

// ============================================================
// SAMPLE DSL FACTORY (for testing)
// ============================================================

export function createSampleLivingPanel(): LivingPanelDSL {
  return {
    version: "1.0",
    canvas: {
      width: 800,
      height: 600,
      background: "#0a0a1a",
      mood: "dramatic-dark",
    },
    layers: [
      {
        id: "bg",
        type: "background",
        props: {
          gradient: ["#0a0a1a", "#1a1025", "#0d0d1e"],
          gradientAngle: 160,
          pattern: "halftone",
          patternColor: "#8080ff",
          patternOpacity: 0.08,
        },
      },
      {
        id: "speed-lines",
        type: "effect",
        opacity: 0,
        props: {
          effect: "speed_lines",
          color: "#00f5ff",
          intensity: 0.6,
          count: 24,
        },
      },
      {
        id: "title",
        type: "text",
        x: "50%",
        y: "25%",
        opacity: 0,
        props: {
          content: "THE POWER OF HABITS",
          fontSize: "clamp(2rem, 6vw, 4rem)",
          fontFamily: "display",
          color: "#ffffff",
          textAlign: "center",
          textShadow: "3px 3px 0 #00f5ff60, 0 0 40px rgba(0,0,0,0.8)",
          letterSpacing: "0.05em",
        },
      },
      {
        id: "kai",
        type: "sprite",
        x: "20%",
        y: "60%",
        opacity: 0,
        scale: 0.8,
        props: {
          character: "Kai",
          expression: "curious",
          size: 64,
          showName: true,
        },
      },
      {
        id: "sage",
        type: "sprite",
        x: "75%",
        y: "55%",
        opacity: 0,
        props: {
          character: "The Sage",
          expression: "wise",
          size: 72,
          showName: true,
          glowColor: "#f5a62340",
        },
      },
      {
        id: "bubble-kai",
        type: "speech_bubble",
        x: "10%",
        y: "42%",
        opacity: 0,
        props: {
          text: "How can something so small change everything?!",
          character: "Kai",
          style: "speech",
          tailDirection: "bottom",
          maxWidth: 220,
          typewriter: true,
          typewriterSpeed: 35,
        },
      },
      {
        id: "bubble-sage",
        type: "speech_bubble",
        x: "55%",
        y: "38%",
        opacity: 0,
        props: {
          text: "Because habits are the compound interest of self-improvement.",
          character: "The Sage",
          style: "thought",
          tailDirection: "bottom",
          maxWidth: 250,
          typewriter: true,
          typewriterSpeed: 30,
        },
      },
      {
        id: "data-concepts",
        type: "data_block",
        x: "50%",
        y: "85%",
        opacity: 0,
        props: {
          items: [
            { label: "Cue → Craving → Response → Reward", highlight: true },
            { label: "1% better every day = 37x in a year" },
            { label: "Systems > Goals" },
          ],
          layout: "stack",
          accentColor: "#00f5ff",
          showIndex: true,
          animateIn: "stagger",
          staggerDelay: 200,
        },
      },
    ],
    timeline: [
      { at: 0, target: "bg", animate: { opacity: [0, 1] }, duration: 600, easing: "ease-in" },
      { at: 200, target: "speed-lines", animate: { opacity: [0, 0.4] }, duration: 400, easing: "ease-out" },
      { at: 300, target: "title", animate: { opacity: [0, 1], scale: [1.3, 1] }, duration: 800, easing: "spring" },
      { at: 1200, target: "kai", animate: { opacity: [0, 1], x: ["-10%", "20%"] }, duration: 600, easing: "ease-out" },
      { at: 1500, target: "sage", animate: { opacity: [0, 1], x: ["110%", "75%"] }, duration: 600, easing: "ease-out" },
      { at: 2200, target: "bubble-kai", animate: { opacity: [0, 1], typewriter: true }, duration: 1200 },
      { at: 3800, target: "bubble-sage", animate: { opacity: [0, 1], typewriter: true }, duration: 1500 },
      { at: 5500, target: "data-concepts", animate: { opacity: [0, 1], y: ["95%", "85%"] }, duration: 600, easing: "ease-out" },
      { at: 6500, target: "sage", animate: { pulse: { minScale: 0.95, maxScale: 1.05 } }, duration: 2000, repeat: -1, yoyo: true },
    ],
    events: [
      {
        trigger: "onClick",
        target: "kai",
        actions: [
          { type: "animate", target: "kai", animate: { shake: { intensity: 4, count: 3 } }, duration: 400 },
        ],
      },
    ],
    meta: {
      panel_id: "sample-001",
      chapter_index: 0,
      content_type: "splash",
      narrative_context: "Introduction to the habit loop concept",
    },
  };
}
