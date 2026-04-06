/**
 * living-panel-types.ts — Living Manga Panel DSL v2.0
 * =====================================================
 * A cinematic act-based DSL for animated manga panels.
 *
 * KEY CONCEPT: Each panel is a SCENE with ACTS.
 * An act defines a visual state — its layout, sub-panels, layers.
 * The scene transitions between acts over time, so a panel can
 * start as a single narration canvas, then CRACK into a 2x2 grid
 * of sub-panels, each with their own animated content.
 *
 * This is NOT After Effects. This is MANGA that BREATHES.
 */

// ============================================================
// ROOT DSL
// ============================================================

export interface LivingPanelDSL {
  version: "2.0";
  canvas: CanvasConfig;
  acts: Act[];                   // The temporal structure — each act is a visual state
  meta?: PanelMeta;
}

export interface CanvasConfig {
  width: number;
  height: number;
  background: string;
  mood?: string;                 // atmospheric hint for rendering
}

export interface PanelMeta {
  panel_id?: string;
  chapter_index?: number;
  page_index?: number;
  content_type?: string;
  narrative_beat?: string;       // what story moment this panel captures
  duration_ms?: number;          // total runtime hint
}

// ============================================================
// ACTS — temporal scenes within a panel
// ============================================================

export interface Act {
  id: string;
  duration_ms: number;           // how long this act runs before auto-advancing
  transition_in?: TransitionEffect;  // how we enter this act
  layout: ActLayout;             // spatial arrangement
  layers: Layer[];               // layers that fill the WHOLE act (backgrounds, effects)
  cells?: SubPanel[];            // sub-panels within the act (if layout !== "full")
  timeline: TimelineStep[];      // animation sequence within this act
  events?: EventBinding[];       // interactive behaviors
}

/** How the act arranges its sub-panels */
export interface ActLayout {
  type: "full" | "split-h" | "split-v" | "grid-2x2" | "grid-3" |
        "l-shape" | "t-shape" | "diagonal" | "overlap" | "free" | "cuts";
  gap?: number;                  // px between cells
  stagger_ms?: number;           // delay between cell reveals
  cuts?: CutSpec[];              // for type="cuts" — recursive panel divisions
  borderWidth?: number;          // ink border width around panels
}

/**
 * CutSpec — defines how a manga page is divided into panels.
 * Inspired by comfyui_panels: sequential cuts on a page.
 *
 * ALGORITHM:
 * 1. Start with one full-page region [0, 0, 1, 1]
 * 2. Each cut targets a region (by index) and splits it
 * 3. Split creates two new regions, replacing the target
 * 4. Result: array of rectangular regions for panel content
 *
 * The `angle` creates slight tilt on the dividing line
 * for that authentic manga hand-ruled aesthetic.
 */
export interface CutSpec {
  direction: "h" | "v";         // horizontal or vertical cut
  position: number;              // 0.0-1.0, where to cut within the target region
  angle?: number;                // degrees of tilt (-4 to 4) for manga feel
  target?: number;               // which region to cut (0-based, default 0)
}

/** A sub-panel within an act */
export interface SubPanel {
  id: string;
  position: string;              // depends on layout type
  layers: Layer[];               // this sub-panel's content
  timeline: TimelineStep[];      // animations within this sub-panel
  style?: SubPanelStyle;
}

export interface SubPanelStyle {
  background?: string;
  border?: string;
  borderRadius?: number;
  clipPath?: string;             // CSS clip-path for creative shapes
  overflow?: "hidden" | "visible";
}

// ============================================================
// TRANSITIONS between acts
// ============================================================

export interface TransitionEffect {
  type: "cut" | "fade" | "crack" | "shatter" | "morph" |
        "iris" | "ink_wash" | "page_turn" | "zoom_through" |
        "dissolve" | "slide_left" | "slide_up" | "whip_pan";
  duration_ms: number;
  easing?: EasingType;
  color?: string;                // for fade/iris transitions
}

// ============================================================
// LAYER TYPES (same as before, reused within acts & sub-panels)
// ============================================================

export type LayerType =
  | "background"
  | "sprite"
  | "text"
  | "speech_bubble"
  | "effect"
  | "shape"
  | "data_block"
  | "scene_transition"
  | "image"
  | "illustration";

export interface LayerBase {
  id: string;
  type: LayerType;
  visible?: boolean;
  opacity?: number;
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  zIndex?: number;
  rotate?: number;
  scale?: number;
  origin?: string;
}

export interface BackgroundLayer extends LayerBase {
  type: "background";
  props: {
    gradient?: string[];
    gradientAngle?: number;
    image?: string;
    pattern?: "halftone" | "crosshatch" | "dots" | "lines" | "noise" | "manga_screen";
    patternColor?: string;
    patternOpacity?: number;
    parallaxSpeed?: number;
  };
}

export type PoseType =
  | "standing" | "thinking" | "action"
  | "dramatic" | "defeated" | "presenting"
  | "pointing" | "celebrating";

export interface SpriteLayer extends LayerBase {
  type: "sprite";
  props: {
    character: string;
    expression: ExpressionType;
    pose?: PoseType;
    size?: number;
    showName?: boolean;
    silhouette?: boolean;
    glowColor?: string;
    facing?: "left" | "right";
    signatureColor?: string;   // character's accent color
    signatureSymbol?: string;  // SVG path for character icon
    aura?: "energy" | "calm" | "dark" | "fire" | "ice" | "none";
  };
}

export interface TextLayer extends LayerBase {
  type: "text";
  props: {
    content: string;
    fontSize?: number | string;
    fontFamily?: "display" | "body" | "label" | "mono";
    color?: string;
    textAlign?: "left" | "center" | "right";
    maxWidth?: number | string;
    lineHeight?: number;
    textShadow?: string;
    letterSpacing?: string;
    highlight?: string;
    typewriter?: boolean;
    typewriterSpeed?: number;
    glitch?: boolean;            // text glitch effect
  };
}

export interface SpeechBubbleLayer extends LayerBase {
  type: "speech_bubble";
  props: {
    text: string;
    character?: string;
    style: "speech" | "thought" | "shout" | "whisper" | "narrator" | "internal";
    tailDirection?: "left" | "right" | "bottom" | "top" | "none";
    backgroundColor?: string;
    textColor?: string;
    borderColor?: string;
    maxWidth?: number;
    typewriter?: boolean;
    typewriterSpeed?: number;
    emphasis?: boolean;          // bold/shake on key words
  };
}

export interface EffectLayer extends LayerBase {
  type: "effect";
  props: {
    effect: EffectType;
    color?: string;
    intensity?: number;
    count?: number;
    speed?: number;
    direction?: "up" | "down" | "left" | "right" | "radial" | "random";
    // SFX (manga sound effect text)
    sfxText?: string;
    sfxSize?: number;
    sfxRotate?: number;
    sfxOutline?: boolean;
  };
}

export interface ShapeLayer extends LayerBase {
  type: "shape";
  props: {
    shape: "circle" | "rect" | "line" | "triangle" | "star" | "polygon";
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    points?: number;
    radius?: number;
    dash?: string;
  };
}

export interface DataBlockLayer extends LayerBase {
  type: "data_block";
  props: {
    items: DataItem[];
    layout: "list" | "grid" | "stack" | "counter";
    accentColor?: string;
    showIndex?: boolean;
    animateIn?: "stagger" | "cascade" | "pop" | "none";
    staggerDelay?: number;
  };
}

export interface DataItem {
  label: string;
  value?: string;
  icon?: string;
  highlight?: boolean;
}

export interface SceneTransitionLayer extends LayerBase {
  type: "scene_transition";
  props: {
    transition: string;
    color?: string;
    text?: string;
    duration?: number;
  };
}

export interface ImageLayer extends LayerBase {
  type: "image";
  props: {
    src: string;
    alt?: string;
    objectFit?: "cover" | "contain" | "fill";
    filter?: string;
    blendMode?: string;
  };
}

export interface IllustrationLayer extends LayerBase {
  type: "illustration";
  props: {
    /** Pre-built scene component ID (e.g. "laboratory", "digital-realm") */
    scene?: string;
    /** Inline SVG markup for custom illustrations */
    svg?: string;
    /** Art style filter applied to the illustration */
    style?: "manga-ink" | "blueprint" | "watercolor" | "neon";
    /** Color overrides for the scene */
    primaryColor?: string;
    accentColor?: string;
    /** Scene-specific props (floating items, glow points, etc.) */
    elements?: Array<{
      type: string;
      x: string;
      y: string;
      size?: number;
      color?: string;
      label?: string;
    }>;
    /** Description for accessibility */
    description?: string;
  };
}

export type Layer =
  | BackgroundLayer
  | SpriteLayer
  | TextLayer
  | SpeechBubbleLayer
  | EffectLayer
  | ShapeLayer
  | DataBlockLayer
  | SceneTransitionLayer
  | ImageLayer
  | IllustrationLayer;

// ============================================================
// ANIMATION
// ============================================================

export interface TimelineStep {
  at: number;
  target: string;
  animate: AnimationProps;
  duration: number;
  easing?: EasingType;
  repeat?: number;
  yoyo?: boolean;
}

export interface AnimationProps {
  x?: [number | string, number | string];
  y?: [number | string, number | string];
  opacity?: [number, number];
  scale?: [number, number];
  rotate?: [number, number];
  width?: [number | string, number | string];
  height?: [number | string, number | string];
  typewriter?: boolean;
  shake?: { intensity: number; count: number };
  pulse?: { minScale: number; maxScale: number };
  float?: { distance: number; speed: number };
  glow?: { color: string; minOpacity: number; maxOpacity: number };
}

// ============================================================
// EVENTS
// ============================================================

export interface EventBinding {
  trigger: "onClick" | "onVisible" | "onHover" | "onScroll" | "onActEnd";
  target: string;
  actions: EventAction[];
}

export interface EventAction {
  type: "animate" | "show" | "hide" | "toggle" | "nextAct" | "goToAct";
  target?: string;
  animate?: AnimationProps;
  duration?: number;
  easing?: EasingType;
  actId?: string;                // for goToAct
}

// ============================================================
// ENUMS
// ============================================================

export type ExpressionType =
  | "neutral" | "curious" | "shocked" | "determined"
  | "wise" | "thoughtful" | "excited" | "sad"
  | "angry" | "smirk" | "fearful" | "triumphant";

export type EffectType =
  | "particles" | "speed_lines" | "impact_burst"
  | "sparkle" | "rain" | "snow" | "smoke"
  | "screen_shake" | "vignette" | "lens_flare"
  | "floating_kanji" | "ink_splash" | "lightning"
  | "screentone" | "crosshatch" | "sfx";

export type EasingType =
  | "linear" | "ease-in" | "ease-out" | "ease-in-out"
  | "spring" | "bounce" | "elastic" | "sharp";

export type AnimationPreset =
  | "enter-left" | "enter-right" | "enter-bottom" | "enter-top"
  | "fade-in" | "scale-in" | "dramatic-zoom" | "shake-emphasis"
  | "pulse-glow" | "typewriter" | "float-idle" | "spin-in"
  | "bounce-in" | "slam-down" | "stagger-list";

// ============================================================
// LAYOUT POSITION MAPS
// ============================================================

export const ACT_LAYOUT_POSITIONS: Record<string, string[]> = {
  "full":      ["main"],
  "split-h":   ["left", "right"],
  "split-v":   ["top", "bottom"],
  "grid-2x2":  ["tl", "tr", "bl", "br"],
  "grid-3":    ["left", "top-right", "bottom-right"],
  "l-shape":   ["main", "side-top", "side-bottom"],
  "t-shape":   ["top", "bottom-left", "bottom-right"],
  "diagonal":  ["top-left", "bottom-right"],
  "overlap":   ["back", "front"],
  "free":      [],  // positions defined by cells
};
