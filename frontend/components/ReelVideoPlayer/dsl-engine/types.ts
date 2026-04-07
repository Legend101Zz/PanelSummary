/**
 * Video DSL Types — Browser-side interpreter
 * =============================================
 * Mirrors the backend Video DSL spec exactly.
 * The DSL is the contract between LLM and renderer.
 */

export interface VideoDSL {
  version: "1.0";
  canvas: {
    width: number;
    height: number;
    fps: number;
    background: string;
  };
  fonts?: string[];
  palette: {
    bg: string;
    fg: string;
    accent: string;
    accent2: string;
    muted: string;
  };
  scenes: Scene[];
  meta: {
    title: string;
    book_title: string;
    total_duration_ms: number;
    mood: string;
    source_content_ids?: string[];
  };
}

export interface Scene {
  id: string;
  duration_ms: number;
  transition: {
    type: TransitionType;
    duration_ms?: number;
    direction?: "up" | "down" | "left" | "right";
  };
  camera?: {
    zoom?: [number, number];
    pan?: { x: [number, number]; y: [number, number] };
    rotate?: [number, number];
    easing?: EasingType;
  };
  layers: Layer[];
  timeline: TimelineEntry[];
}

export interface Layer {
  id: string;
  type: LayerType;
  x?: string;
  y?: string;
  opacity?: number;
  scale?: number;
  rotate?: number;
  props: Record<string, any>;
}

export interface TimelineEntry {
  at: number;
  target: string;
  animate: Record<string, any>;
  duration: number;
  easing?: EasingType;
}

export type LayerType =
  | "background"
  | "text"
  | "counter"
  | "speech_bubble"
  | "effect"
  | "sprite"
  | "data_block"
  | "shape"
  | "illustration";

export type TransitionType =
  | "cut"
  | "fade"
  | "wipe"
  | "zoom"
  | "glitch"
  | "ink_wash"
  | "slide"
  | "iris";

export type EasingType =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "spring"
  | "bounce";
