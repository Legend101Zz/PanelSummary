/**
 * Internal module seams of the renderer. Each drawing module is pure and
 * deterministic: same inputs + seed → byte-identical SVG.
 *
 * Coordinate conventions
 * - Page space: 0..PAGE_WIDTH × 0..PAGE_HEIGHT, y grows downward.
 * - Figure space (rig, props): origin at the ground point under the figure's
 *   centre, y grows downward, so the figure occupies negative y. One unit =
 *   1/100 of an average adult human's height (an adult is ~100 units tall
 *   including head). The composer scales figure space into page space.
 * - Every drawing takes `lineWidth` in ITS OWN units, so the composer can keep
 *   page-space ink weight constant across shots (lineWidth = pageStroke / scale).
 * - Facing "right" is the canonical drawing; the composer mirrors for "left".
 *   Rigs must still draw "front" and "back" views themselves.
 * - Fills use the tone palette in style.ts only: `fill="url(#<prefix>tone-dots)"`
 *   style references are produced by `toneFill()` so ids stay page-unique.
 */
import type {
  Angle,
  Box,
  CharacterLook,
  EnvFeature,
  Environment,
  Expression,
  Facing,
  FxId,
  Point,
  Pose,
  PropId,
  Shot,
} from "./contracts.js";

/** Per-page drawing context shared by every module. */
export interface DrawContext {
  /** Prefix for every id this page defines (patterns, clip paths, gradients). */
  idPrefix: string;
  /** Deterministic PRNG for this drawing (see prng.ts). */
  rand: () => number;
}

export interface FigureAnchors {
  /** Centre of the head (or the face of a non-human). */
  head: Point;
  headRadius: number;
  /** Mouth / voice origin for speech-bubble tails. */
  mouth: Point;
  /** Front hand (for held props), if the figure has one. */
  hand?: Point;
  /** Highest point of the drawing (negative y). */
  top: number;
  /** Horizontal extent. */
  left: number;
  right: number;
  /** Waist height (negative y) used for medium shots. */
  waist: number;
  /** Shoulder height (negative y) used for close shots. */
  shoulders: number;
}

export interface FigureDrawing {
  /** SVG fragment in figure space. No outer transform. */
  svg: string;
  anchors: FigureAnchors;
}

export interface FigureRequest {
  look: CharacterLook;
  pose: Pose;
  expression: Expression;
  facing: Facing;
  lineWidth: number;
  /** Stable per-character seed so a character looks the same on every page. */
  seed: number;
}

export interface RigModule {
  /** Poses this look can draw. Validation rejects any other pose. */
  supportedPoses(look: CharacterLook): readonly Pose[];
  supportedExpressions(look: CharacterLook): readonly Expression[];
  /** Nominal height in figure units (adult human = 100). */
  nominalHeight(look: CharacterLook): number;
  draw(request: FigureRequest, ctx: DrawContext): FigureDrawing;
}

export interface EnvironmentRequest {
  environment: Environment;
  features: readonly EnvFeature[];
  /** Panel bounding box in page space; draw to cover it (it is clipped later). */
  box: Box;
  shot: Shot;
  angle: Angle;
  time: "day" | "dusk" | "night" | "dawn";
  weather: "clear" | "rain" | "snow" | "wind" | "storm" | "fog";
  lineWidth: number;
  seed: number;
}

export interface EnvironmentDrawing {
  /** SVG fragment in page space. */
  svg: string;
  /** Page-space y of the horizon line. */
  horizonY: number;
  /** Page-space y where standing figures' feet go for depth "mid". */
  groundY: number;
}

export interface EnvironmentModule {
  draw(request: EnvironmentRequest, ctx: DrawContext): EnvironmentDrawing;
}

export interface PropDrawing {
  /** SVG fragment in figure space (ground at y=0), facing right. */
  svg: string;
  width: number;
  height: number;
  /** Grip point when held (figure space). */
  grip: Point;
}

export interface PropModule {
  draw(prop: PropId, lineWidth: number, ctx: DrawContext): PropDrawing;
  /** Size in figure units (adult human = 100). */
  nominalHeight(prop: PropId): number;
}

export interface FxRequest {
  fx: FxId;
  /** Panel box and polygon in page space. */
  box: Box;
  polygon: Point[];
  /** Focus point (e.g. the main figure's head) in page space. */
  focus: Point;
  /** Anchors of figures in page space, for character-attached fx. */
  heads: { point: Point; radius: number }[];
  lineWidth: number;
  seed: number;
}

export interface FxModule {
  /** Page-space SVG fragment. `layer` says whether it goes behind or over figures. */
  draw(request: FxRequest, ctx: DrawContext): { under: string; over: string };
}
