/**
 * types.ts — Video DSL Type Definitions
 * ========================================
 * TypeScript interfaces matching the Python Video DSL spec.
 */

export interface VideoDSL {
  version: string;
  canvas: Canvas;
  fonts: string[];
  palette: Palette;
  scenes: Scene[];
  meta: Meta;
}

export interface Canvas {
  width: number;
  height: number;
  fps: number;
  background: string;
}

export interface Palette {
  bg: string;
  fg: string;
  accent: string;
  accent2: string;
  muted: string;
}

export interface Scene {
  id: string;
  duration_ms: number;
  transition: Transition;
  camera?: Camera;
  layers: Layer[];
  timeline: TimelineEntry[];
}

export interface Transition {
  type:
    | "cut"
    | "fade"
    | "wipe"
    | "zoom"
    | "glitch"
    | "ink_wash"
    | "slide"
    | "iris";
  duration_ms?: number;
  direction?: "up" | "down" | "left" | "right";
  color?: string;
}

export interface Camera {
  zoom?: [number, number];
  pan?: { x: [number, number]; y: [number, number] };
  rotate?: [number, number];
  easing?: string;
}

export interface Layer {
  id: string;
  type:
    | "background"
    | "text"
    | "counter"
    | "speech_bubble"
    | "effect"
    | "sprite"
    | "data_block"
    | "shape"
    | "illustration";
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
  easing?: string;
}

export interface Meta {
  title: string;
  book_title: string;
  total_duration_ms: number;
  mood: string;
  source_content_ids?: string[];
}
