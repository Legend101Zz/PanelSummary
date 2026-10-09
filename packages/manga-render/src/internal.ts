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
 *   Screentones must stay PAGE-constant: the composer re-emits pattern copies
 *   with patternTransform=scale(1/s) for scaled figure groups (rescaleTones).
 *   Modules must NOT compensate themselves (that would double-correct).
 * - Never emit a raw `opacity` attribute (resvg can panic on it inside clip
 *   groups); use fill-opacity / stroke-opacity.
 * - Props are horizontally centred on x=0 with the ground at y=0.
 * - headRadius must cover the hair silhouette: lettering never covers it and
 *   tails stop at it.
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
  Tone,
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
  /** Plants: how many open blooms were drawn (tests and critique tools read it). */
  blooms?: number;
}

export interface FigureRequest {
  look: CharacterLook;
  pose: Pose;
  expression: Expression;
  facing: Facing;
  lineWidth: number;
  /** Stable per-character seed so a character looks the same on every page. */
  seed: number;
  /**
   * Level of detail chosen by the composer from the on-page head radius:
   * "full" (≥30 page units), "reduced" (18-30: eyes + mouth, fewer inner lines),
   * "silhouette" (<18: shape + thicker outline). Default "full".
   */
  detail?: "full" | "reduced" | "silhouette";
  /** Draw a paper-white knockout rim under the outline (figure–ground separation). Default true. */
  rim?: boolean;
  /**
   * Eye state for this appearance. "blind" = empty/closed sockets with no iris
   * (a statue without its gem eyes), "dead" = closed-line or X eyes, no pupils.
   * Material/tone variants arrive already merged into `look` by the composer.
   */
  eyes?: "open" | "closed" | "blind" | "dead";
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
  /** Optional page-space hints (e.g. statue_top, fountain, moon) for the composer. */
  anchors?: Record<string, Point>;
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

export type SeatKind = "stool" | "chair" | "bench" | "throne";

export interface PropModule {
  /** `tone` recolours the prop's main body (e.g. a ruby "black", a sapphire "mid"). */
  draw(prop: PropId, lineWidth: number, ctx: DrawContext, tone?: Tone): PropDrawing;
  /** Size in figure units (adult human = 100). */
  nominalHeight(prop: PropId): number;
  /**
   * A seat drawn under a sitting figure (figure space, ground y=0, centred on x=0).
   * `seatY` is the (negative) y of the sitting surface.
   */
  seat(kind: SeatKind, lineWidth: number, ctx: DrawContext): PropDrawing & { seatY: number };
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
