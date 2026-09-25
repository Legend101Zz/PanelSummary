/**
 * Scene composer: turns one PanelSpec into page-space SVG inside its panel
 * polygon — environment, fx, figures (framed by shot/angle/slot/depth and
 * staged on each other or on environment features), props — and reports
 * page-space head/mouth anchors for lettering.
 *
 * Rigs and props draw in figure space (ground at y=0, facing right, adult
 * = 100 units). The composer scales them with lineWidth = pageStroke / scale
 * so ink weight is the same in every shot.
 *
 * Order of work:
 *  1. probe every figure at scale 1 and resolve its staging (staging.ts);
 *  2. frame the independent figures (ground shots by SHOT_GUIDE height,
 *     close-range shots around the face; lying figures horizontally);
 *  3. draw the environment, reframing it (a zoom/pan of the same camera)
 *     when a statue must stand on its column or, at eye level, so the
 *     horizon passes through the main figure's eyes;
 *  4. keep faces clear (safety.ts), then place figures staged on others;
 *  5. draw back → mid → fore with seats, beds, speaker halos and props.
 */
import type {
  Angle,
  Box,
  CastMember,
  Depth,
  EnvFeature,
  FigureSpec,
  LocationSpec,
  PanelSpec,
  Point,
  Pose,
  PropId,
  Shot,
  Slot,
  Tone,
  ValidationIssue,
} from "../contracts.js";
import type { DrawContext, EnvironmentDrawing, FigureAnchors, FigureDrawing, FigureRequest, PropDrawing } from "../internal.js";
import { rig } from "../rig/index.js";
import { environments } from "../env/index.js";
import { props as propModule } from "../props/index.js";
import { fx as fxModule } from "../fx/index.js";
import { hashString, mulberry32 } from "../prng.js";
import { INK, PAPER, STROKE, toneDefs, toneFill } from "../style.js";
import { n, polyPath } from "../svg.js";
import { adoptFragment, rescaleTones } from "./ids.js";
import { clearShift, covers, shifted, type Placement } from "./safety.js";
import { ADULT_SEAT_Y, bedFor, BED_HEIGHT, GROUND_SHOTS, resolveStaging, seatContact, seatKindFor, type Staging } from "./staging.js";

export interface SceneBook {
  cast: readonly CastMember[];
  locations: readonly LocationSpec[];
}

export interface ComposeInput {
  panel: PanelSpec;
  /** Panel index on the page (0-based), used for unique ids. */
  index: number;
  polygon: Point[];
  bbox: Box;
  book: SceneBook;
  idPrefix: string;
  /** Number of balloons/boxes that will be lettered here. */
  textLoad: number;
  /**
   * Estimated page-space area (px²) the lettering needs. The composer keeps
   * a band this big free above close-range figures. Defaults from textLoad.
   */
  textArea?: number;
  /** Reading direction: slots are mirrored for rtl pages. */
  rtl?: boolean;
}

export interface FigurePlacement {
  character: string;
  figureIndex: number;
  head: Point;
  headRadius: number;
  mouth: Point;
  body: Box;
  scale: number;
  /** Level of detail requested from the rig. */
  detail: "full" | "reduced" | "silhouette";
  /** How the figure was staged: "ground", "on:<cast id>:<part>" or "on:<feature>". */
  staging: string;
}

export interface ComposedPanel {
  /** Content to draw inside the panel clip (page space). */
  content: string;
  /** Defs to hoist into the page <defs> (clip path + module defs). */
  defs: string;
  clipId: string;
  figures: FigurePlacement[];
  focus: Point;
  /** Other things lettering should avoid covering (e.g. the insert prop). */
  obstacles: Box[];
  /** Staging and legibility warnings (FACE_COVERED, SPEAKER_TOO_SMALL, ...). */
  issues: ValidationIssue[];
}

export const MAX_FIGURES = 4;
export const MAX_PROPS = 4;
export const MAX_FX = 3;

/** On-page head radius floors (page units). */
export const SPEAKER_MIN_HEAD_RADIUS = 22;
export const LOD_FULL_RADIUS = 30;
export const LOD_REDUCED_RADIUS = 18;

/** Figure height targets for ground shots (fraction of the panel height, ±25%). */
export const SHOT_HEIGHT: Partial<Record<Shot, number>> = { establishing: 0.22, wide: 0.4, full: 0.74 };

const SLOT_X: Record<Slot, number> = {
  left: 0.2,
  center_left: 0.36,
  center: 0.5,
  center_right: 0.64,
  right: 0.8,
};

const AIRBORNE_POSES = new Set<Pose>(["fly", "jump", "fall", "perch", "lie"]);
/** Headwear that rises above the head circle (lettering keeps clear of it). */
const TALL_HEADWEAR = new Set(["top_hat", "crown", "wide_hat", "helmet", "hood", "wreath", "bonnet"]);
const SPEAKING = new Set(["speech", "thought", "shout", "whisper"]);

function depthOf(f: { depth?: Depth }): Depth {
  return f.depth ?? "mid";
}

function slotFrac(slot: Slot, rtl: boolean): number {
  const f = SLOT_X[slot] ?? 0.5;
  return rtl ? 1 - f : f;
}

function slotX(slot: Slot, box: Box, rtl: boolean): number {
  return box.x + box.w * slotFrac(slot, rtl);
}

function ctxFor(prefix: string, seed: number): DrawContext {
  return { idPrefix: prefix, rand: mulberry32(seed) };
}

function clamp(v: number, lo: number, hi: number): number {
  return hi < lo ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v));
}

/** Small extra scale for close-range shots by angle (ground shots use groundAngleScale). */
function closeAngleScale(angle: Angle): number {
  return angle === "worms_eye" ? 1.06 : angle === "low" ? 1.03 : angle === "birds_eye" ? 0.95 : angle === "high" ? 0.97 : 1;
}

/** Angle factor on ground-shot figure height (kept inside the ±25% band). */
function groundAngleScale(angle: Angle): number {
  switch (angle) {
    case "high":
      return 0.92;
    case "birds_eye":
      return 0.85;
    case "low":
      return 1.06;
    case "worms_eye":
      return 1.12;
    default:
      return 1;
  }
}

interface Framing {
  scale: number;
  originX: number;
  originY: number;
}

interface FigureInfo {
  spec: FigureSpec;
  index: number;
  cast: CastMember;
  seed: number;
  /** Anchors at scale 1 for the pose actually drawn. */
  probe: FigureAnchors;
  pose: Pose;
  nominal: number;
  /** Standing-equivalent height used for shot framing (figure units). */
  height: number;
  staging: Staging;
  mirror: boolean;
  lying: boolean;
}

/**
 * Fraction of the panel height kept clear above close-range figures for
 * lettering: the band needed to hold the estimated balloon area side by side.
 */
function headroomFor(textLoad: number, textArea: number | undefined, box: Box): number {
  if (textLoad <= 0) return 0.08;
  const area = textArea ?? textLoad * 14000;
  const band = area / (box.w * 0.82) + 22;
  return clamp(band / box.h, 0.16, 0.48);
}

/**
 * Vertical placement for a width-bound close-range frame (a tall or narrow
 * panel): keep the lettering band above the head and split the spare height,
 * a little more below; never lift the feet (figure y=0) above the bottom edge.
 */
function bandPlacement(box: Box, headroom: number, visible: number, headTopUnits: number, scale: number): number {
  const band = headroom * box.h;
  const spare = Math.max(0, box.h - visible - band);
  const headTop = box.y + band + spare * 0.4;
  return Math.max(headTop - headTopUnits * scale, box.y + box.h);
}

/**
 * Own framing of a figure for close-range shots (medium / close / extreme
 * close). Frames are built around the HEAD anchor, not the drawing's top, so
 * raised arms, leaves or a bowing pose never push the face out of frame:
 * - medium: from just above the head down to the waist (waist on the bottom edge);
 * - close: from just above the head to below the shoulders;
 * - extreme close: the head circle fills the panel.
 */
function closeFraming(shot: Shot, a: FigureAnchors, box: Box, headroom: number, textLoad: number, x: number, count = 1): Framing {
  // faces share the panel width when several characters are framed together
  const cnt = Math.max(1, count);
  const r = Math.max(0.5, a.headRadius);
  const bodyW = Math.max(1, a.right - a.left);
  const headTopUnits = a.head.y - r * 1.15;
  if (shot === "medium") {
    const bottom = Math.max(a.waist, a.head.y + r * 2.6);
    const span = Math.max(1, bottom - headTopUnits);
    const heightScale = ((1 - headroom) * box.h) / span;
    // sides may crop in a medium shot, so the body-width limit is loose
    const scale = Math.min(heightScale, (Math.min(0.44, 0.85 / cnt) * box.w) / (2 * r), (1.4 * box.w) / bodyW);
    if (scale >= heightScale * 0.999) return { scale, originX: x, originY: box.y + box.h - bottom * scale };
    return { scale, originX: x, originY: bandPlacement(box, headroom, span * scale, headTopUnits, scale) };
  }
  if (shot === "close") {
    const bottom = Math.max(a.shoulders, a.head.y + r * 1.4);
    const span = Math.max(1, bottom - headTopUnits);
    const heightScale = ((0.88 - headroom) * box.h) / span;
    const scale = Math.min(heightScale, (Math.min(0.6, 0.88 / cnt) * box.w) / (2 * r));
    if (scale >= heightScale * 0.999) {
      // height-bound: shoulders near the bottom edge, lettering band above
      return { scale, originX: x, originY: box.y + box.h * 0.9 - bottom * scale };
    }
    return { scale, originX: x, originY: bandPlacement(box, headroom, span * scale * 1.35, headTopUnits, scale) };
  }
  // extreme close: the face fills the panel below the lettering band (all of it when wordless)
  if (textLoad <= 0) {
    const scale = (0.98 * Math.min(box.h, (box.w * 1.1) / Math.sqrt(cnt))) / (2 * r);
    return { scale, originX: x, originY: box.y + box.h * 0.52 - a.head.y * scale };
  }
  const avail = box.h * (1 - Math.min(0.5, headroom * 0.85));
  const scale = (0.92 * Math.min(avail, (box.w * 0.95) / Math.sqrt(cnt))) / (2 * r);
  const headY = box.y + box.h - avail * 0.48;
  return { scale, originX: x, originY: headY - a.head.y * scale };
}

/**
 * Close-range framing of a LYING figure: framed horizontally around the
 * head. The face sits in the panel's upper middle (below the lettering band)
 * and the body runs out of the panel on the side away from the head.
 */
function lieFraming(shot: Shot, a: FigureAnchors, mirror: boolean, box: Box, headroom: number, x: number): Framing {
  const r = Math.max(0.5, a.headRadius);
  const hx = mirror ? -a.head.x : a.head.x;
  const dir = hx >= 0 ? 1 : -1;
  const bodyLen = Math.max(1, a.right - a.left);
  const band = headroom * box.h;
  const avail = Math.max(box.h * 0.4, box.h - band);
  let scale: number;
  let headFrac: number;
  if (shot === "medium") {
    scale = Math.min((0.95 * box.w) / Math.max(1, r * 1.3 + bodyLen * 0.55), (0.5 * avail) / (2 * r));
    headFrac = 0.42;
  } else if (shot === "close") {
    scale = Math.min((0.95 * box.w) / (r * 3.6), (0.62 * avail) / (2 * r));
    headFrac = 0.45;
  } else {
    scale = (0.72 * Math.min(avail, box.w)) / (2 * r);
    headFrac = 0.5;
  }
  const hr = r * scale;
  const headY = box.y + band + avail * headFrac;
  // lean the head toward its own side so more of the body shows
  const headX = clamp(x + dir * box.w * 0.12, box.x + hr * 1.25, box.x + box.w - hr * 1.25);
  return { scale, originX: headX - hx * scale, originY: headY - a.head.y * scale };
}

function reframeBox(B: Box, anchor: Point, target: Point, k: number): Box {
  const W = B.w * k;
  const H = B.h * k;
  const X = clamp(target.x - (anchor.x - B.x) * k, B.x + B.w - W, B.x);
  const Y = clamp(target.y - (anchor.y - B.y) * k, B.y + B.h - H, B.y);
  return { x: X, y: Y, w: W, h: H };
}

function mapPoint(B: Box, B2: Box, p: Point): Point {
  return { x: B2.x + ((p.x - B.x) / B.w) * B2.w, y: B2.y + ((p.y - B.y) / B.h) * B2.h };
}

/** Figure heights by pose for framing: a lying figure is framed by its standing height. */
function framingHeight(nominal: number, a: FigureAnchors, lying: boolean): number {
  return lying ? nominal : Math.max(nominal, -a.top);
}

export function composePanel(input: ComposeInput): ComposedPanel {
  const { panel, bbox: box, polygon, idPrefix, book, index } = input;
  const rtl = input.rtl === true;
  const issues: ValidationIssue[] = [];
  const ipath = `panel ${panel.id}`;
  const clipId = `${idPrefix}clip-${index}`;
  const defs: string[] = [`<clipPath id="${clipId}"><path d="${polyPath(polygon)}"/></clipPath>`];
  const scope = (s: string) => `p${index}${s}`;
  const tones = toneDefs(idPrefix);
  /** Adopt a fragment that will be drawn inside a scale(s) group. */
  const adoptScaled = (svg: string, tag: string, scale: number) => {
    const f = adoptFragment(svg, idPrefix, scope(tag));
    const t = rescaleTones(f.body, idPrefix, scope(tag), scale, tones);
    return { body: t.body, defs: f.defs + t.defs };
  };
  const location = book.locations.find((l) => l.id === panel.location);
  const shot: Shot = panel.shot;
  const angle: Angle = panel.angle;
  const groundShot = GROUND_SHOTS.includes(shot);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const textLoad = input.textLoad;
  const headroom = headroomFor(textLoad, input.textArea, box);
  const speakers = new Set(panel.text.filter((t) => SPEAKING.has(t.kind) && typeof t.speaker === "string").map((t) => t.speaker as string));

  // Dutch angle: rotate the whole scene; draw the environment over a larger box.
  const dutch = angle === "dutch";
  const dutchDeg = dutch ? ((hashString(`${panel.id}|dutch`) & 1) === 0 ? -8 : 8) : 0;
  const envBase: Box = dutch
    ? { x: box.x - box.w * 0.18, y: box.y - box.h * 0.18, w: box.w * 1.36, h: box.h * 1.36 }
    : box;

  // --- figures: probe anchors and staging -------------------------------------
  let figureSpecs = shot === "insert" ? [] : panel.figures.slice(0, MAX_FIGURES);
  // an extreme close-up frames ONE face: the first figure (validation warns)
  if (shot === "extreme_close" && figureSpecs.length > 1) figureSpecs = figureSpecs.slice(0, 1);
  const infos: FigureInfo[] = [];
  figureSpecs.forEach((spec, i) => {
    const cast = book.cast.find((c) => c.id === spec.character);
    if (!cast) return;
    const seed = hashString(`cast:${cast.id}`);
    const probe = safeDraw(cast, spec, spec.pose, 1, seed, idPrefix);
    if (!probe) return;
    const nominal = safeNominal(cast);
    const lying = spec.pose === "lie";
    infos.push({
      spec,
      index: i,
      cast,
      seed,
      probe: probe.anchors,
      pose: spec.pose,
      nominal,
      height: framingHeight(nominal, probe.anchors, lying),
      staging: { type: "ground" },
      mirror: (spec.facing === "left") !== rtl,
      lying,
    });
  });
  const staging = resolveStaging(
    infos.map((f) => ({
      character: f.cast.id,
      pose: f.spec.pose,
      on: f.spec.on as { target?: unknown; part?: unknown } | undefined,
      cast: f.cast,
      height: f.height,
      small: ["bird", "insect", "animal"].includes(f.cast.look.kind),
    })),
    location,
    shot,
  );
  infos.forEach((f, i) => {
    f.staging = staging[i];
    // a bird perched ON someone or something stands on it (no twig of its own)
    if (f.staging.type !== "ground" && f.spec.pose === "perch") {
      const poses = safePoses(f.cast);
      if (poses.includes("stand")) {
        const re = safeDraw(f.cast, f.spec, "stand", 1, f.seed, idPrefix);
        if (re) {
          f.pose = "stand";
          f.probe = re.anchors;
        }
      }
    }
  });
  for (const f of infos) {
    if (!f.lying) continue;
    const sf = slotFrac(f.spec.slot, rtl);
    if (Math.abs(sf - 0.5) < 1e-6) continue;
    const wantHeadRight = sf < 0.5;
    f.mirror = f.probe.head.x >= 0 !== wantHeadRight;
  }
  const byChar = new Map(infos.map((f) => [f.cast.id, f]));
  const isDependent = (f: FigureInfo) => f.staging.type === "figure";
  const wantsColumn = (f: FigureInfo) => f.staging.type === "feature" && f.staging.feature === "statue_column" && groundShot;
  /** Figures actually stood on the column top (their place is fixed by the environment). */
  const onColumnSet = new Set<number>();
  /** Statues stood on a column top the composer draws itself. */
  const ownColumn = new Set<number>();
  /** Figures sitting on the environment's bed (no seat of their own). */
  const onBed = new Set<number>();
  const onColumn = (f: FigureInfo) => onColumnSet.has(f.index);
  const independents = infos.filter((f) => !isDependent(f));

  // --- environment (first pass) ------------------------------------------------
  const envSeed = hashString(`loc:${location?.id ?? panel.location}`);
  /** Features drawn by the environment (the composer may draw the statue's column itself). */
  let envFeatures: readonly EnvFeature[] = location?.features ?? [];
  const drawEnv = (b: Box): EnvironmentDrawing =>
    environments.draw(
      {
        environment: location?.environment ?? "void",
        features: envFeatures,
        box: b,
        shot,
        angle,
        time: panel.time ?? "day",
        weather: panel.weather ?? "clear",
        lineWidth: STROKE.environment,
        seed: envSeed,
      },
      ctxFor(idPrefix, hashString(`loc:${location?.id ?? panel.location}|${panel.id}`)),
    );
  let envBox = envBase;
  let env = drawEnv(envBox);

  // --- framing ---------------------------------------------------------------
  const framings = new Map<number, Framing>();
  const aScale = closeAngleScale(angle);
  /** Ground plane of a ground shot (props stand on the same plane as the figures). */
  let groundModel: { horizon: number; feet: number; scale: number; maxMul: number } | undefined;
  let worldScale = 0;

  if (independents.length > 0 && groundShot) {
    const frac = SHOT_HEIGHT[shot] ?? 0.4;
    const ground = independents.filter((f) => !wantsColumn(f));
    const refH = Math.max(1, ...independents.map((f) => f.height));
    const depthMul = (f: FigureInfo) => (depthOf(f.spec) === "fore" ? 1.2 : depthOf(f.spec) === "back" ? 0.62 : 1);
    const maxMul = Math.max(0.62, ...ground.map(depthMul));
    let world = ((frac * box.h) / refH) * groundAngleScale(angle);
    const defaultFeet = shot === "full" ? 0.94 : shot === "wide" ? 0.88 : 0.9;
    let feetPrimary = box.y + box.h * defaultFeet;
    // keep the tallest head below the lettering band (full and wide shots),
    // but never below 75% of the shot's figure height
    if (shot === "full" || shot === "wide") world = Math.max(Math.min(world, (feetPrimary - (box.y + box.h * headroom)) / refH), (0.75 * frac * box.h) / refH);
    worldScale = world;
    const scaleOf = (f: FigureInfo) => {
      let s = (world * depthMul(f)) / maxMul;
      const widthUnits = Math.max(1, f.probe.right - f.probe.left);
      s = Math.min(s, (0.95 * box.w) / widthUnits);
      return s;
    };
    const primary = ground.length ? ground.reduce((a, b) => (scaleOf(b) * b.height > scaleOf(a) * a.height ? b : a)) : undefined;

    // statue on its column: zoom/pan the same camera so the column top and a
    // readable statue are in frame, then stand the statue on the column top
    const statue = independents.find(wantsColumn);
    let reframed = false;
    if (statue && env.anchors?.statue_top) {
      const T0 = env.anchors.statue_top;
      const C0 = env.anchors.statue_crown;
      // natural statue height: the env's crown hint, else ~30% of the column
      const statuePx0 = C0 && C0.y < T0.y ? T0.y - C0.y : 0.3 * Math.max(0.12 * box.h, (env.groundY - T0.y) * 0.9);
      const desired = (shot === "establishing" ? 0.2 : shot === "wide" ? 0.3 : 0.5) * box.h;
      const k = clamp(desired / statuePx0, 1, 5);
      const statueTop = box.y + Math.max(headroom, 0.06) * box.h;
      const target = {
        x: clamp(slotX(statue.spec.slot, box, rtl), box.x + box.w * 0.25, box.x + box.w * 0.75),
        y: Math.min(statueTop + desired * 1.03, box.y + box.h * 0.82),
      };
      const B2 = reframeBox(envBox, T0, target, k);
      const env2 = drawEnv(B2);
      const T1 = env2.anchors?.statue_top ?? mapPoint(envBox, B2, T0);
      const C1 = env2.anchors?.statue_crown;
      const statuePx1 = C1 && C1.y < T1.y ? T1.y - C1.y : statuePx0 * k;
      // the column top must be in frame with room for the statue above it
      const room = T1.y - (box.y + box.h * 0.03);
      if (room >= box.h * 0.12 && T1.y <= box.y + box.h * 0.95 && T1.x > box.x + box.w * 0.05 && T1.x < box.x + box.w * 0.95) {
        envBox = B2;
        env = env2;
        reframed = true;
        const statueScale = Math.min(statuePx1, room) / Math.max(1, statue.height);
        framings.set(statue.index, { scale: statueScale, originX: T1.x, originY: T1.y });
        onColumnSet.add(statue.index);
      }
    }
    if (statue && !onColumnSet.has(statue.index)) {
      // the camera cannot see the column top here (a full shot, a high angle):
      // leave the column out of the background and stand the statue on a column
      // top drawn under its feet, running down out of the panel
      envFeatures = envFeatures.filter((ft) => ft !== "statue_column");
      envBox = envBase;
      env = drawEnv(envBox);
      reframed = true;
      const frac = shot === "full" ? 0.6 : shot === "wide" ? 0.34 : 0.2;
      const statueScale = (frac * box.h) / Math.max(1, statue.height);
      const feetFrac = shot === "full" ? 0.8 : shot === "wide" ? 0.66 : 0.6;
      const feet = Math.max(box.y + box.h * feetFrac, box.y + Math.max(headroom, 0.05) * box.h + frac * box.h);
      framings.set(statue.index, { scale: statueScale, originX: clamp(slotX(statue.spec.slot, box, rtl), box.x + box.w * 0.25, box.x + box.w * 0.75), originY: Math.min(feet, box.y + box.h * 0.9) });
      onColumnSet.add(statue.index);
      ownColumn.add(statue.index);
    }
    // a column that is not in view: the statue stands with everyone else
    for (const f of independents) if (wantsColumn(f) && !onColumnSet.has(f.index)) ground.push(f);

    // eye level: the horizon passes through the main figure's eyes (wide/full)
    if (!reframed && primary && angle === "eye" && (shot === "wide" || shot === "full") && !AIRBORNE_POSES.has(primary.spec.pose)) {
      const s = scaleOf(primary);
      const eyeY = feetPrimary + (primary.probe.head.y - primary.probe.headRadius * 0.1) * s;
      const B = envBox;
      const v = (env.horizonY - B.y) / B.h;
      if (Number.isFinite(v) && v > 0.05 && v < 0.95 && Math.abs(eyeY - env.horizonY) > box.h * 0.03) {
        const k = Math.max(1, (eyeY - B.y) / (v * B.h), (B.y + B.h - eyeY) / ((1 - v) * B.h));
        if (k <= 2.4) {
          const B2: Box = { x: B.x + B.w / 2 - (B.w * k) / 2, y: eyeY - v * B.h * k, w: B.w * k, h: B.h * k };
          envBox = B2;
          env = drawEnv(B2);
        }
      }
    }

    const horizonY = Number.isFinite(env.horizonY) ? env.horizonY : box.y + box.h * 0.55;
    // low angles: the horizon near knee level; worms-eye: at the feet
    if (primary && !primary.lying) {
      const H = scaleOf(primary) * primary.height;
      if (angle === "low") feetPrimary = clamp(horizonY + 0.27 * H, box.y + box.h * 0.8, box.y + box.h * 0.97);
      else if (angle === "worms_eye") feetPrimary = clamp(horizonY + 0.06 * H, box.y + box.h * 0.85, box.y + box.h * 0.985);
    }
    const horizon = clamp(horizonY, box.y + box.h * 0.15, feetPrimary - box.h * 0.04);
    const primaryScale = primary ? scaleOf(primary) : world;
    groundModel = { horizon, feet: feetPrimary, scale: primaryScale, maxMul };
    for (const f of ground) {
      if (f.staging.type === "feature" && f.staging.feature !== "table" && f.staging.feature !== "bed") {
        // fountain / bridge / (column outside ground shots): stand or sit on the env anchor
        const a = env.anchors?.[f.staging.feature];
        if (a) {
          const s = scaleOf(f);
          const lift = f.spec.pose === "sit" ? -seatContact(f.nominal) * s : 0;
          framings.set(f.index, { scale: s, originX: a.x, originY: a.y + lift });
          continue;
        }
      }
      const s = scaleOf(f);
      const rho = s / Math.max(1e-6, primaryScale);
      // perspective: ground contact moves toward the horizon as the figure gets smaller
      let feet = horizon + (feetPrimary - horizon) * rho;
      feet = Math.min(feet, box.y + box.h * 1.02);
      let x = slotX(f.spec.slot, box, rtl);
      if (f.staging.type === "feature" && f.staging.feature === "table") {
        // at the table: beside its near corner on the figure's side
        const left = slotFrac(f.spec.slot, rtl) < 0.5;
        const corner = left ? env.anchors?.table_left : env.anchors?.table_right;
        const t = env.anchors?.table;
        const half = ((f.probe.right - f.probe.left) / 2) * s;
        if (corner) x = corner.x + (left ? -1 : 1) * half * 0.9;
        else if (t) x = t.x + (left ? -1 : 1) * box.w * 0.14;
      }
      let originY = feet;
      if (f.staging.type === "feature" && f.staging.feature === "bed" && !f.lying && f.spec.pose === "sit" && env.anchors?.bed) {
        // sitting on the edge of the room's bed
        const b = env.anchors.bed;
        framings.set(f.index, { scale: s, originX: b.x, originY: b.y - seatContact(f.nominal) * s });
        onBed.add(f.index);
        continue;
      }
      if (f.staging.type === "feature" && f.staging.feature === "bed" && f.lying) {
        const bh = env.anchors?.bed_head;
        const bf = env.anchors?.bed_foot;
        if (bh && bf) {
          // lie on the env's mattress: head at the pillow end
          const len = Math.hypot(bf.x - bh.x, bf.y - bh.y);
          const sc = Math.min(s, (0.95 * len) / Math.max(1, f.probe.right - f.probe.left));
          // mirror so the head points at the pillow end
          const wantHeadRight = bf.x < bh.x;
          const mirror = f.probe.head.x >= 0 !== wantHeadRight;
          f.mirror = mirror;
          const hx = (mirror ? -f.probe.head.x : f.probe.head.x) * sc;
          framings.set(f.index, { scale: sc, originX: bh.x - hx, originY: bh.y });
          continue;
        }
        originY = feet - BED_HEIGHT * s;
      }
      if (f.spec.pose === "fly" || f.spec.pose === "jump") {
        // airborne: lift off the ground, keeping the head below the lettering band
        const top = originY + f.probe.top * s;
        const room = top - (box.y + box.h * Math.max(headroom, 0.08));
        originY -= clamp(box.h * 0.14, 0, Math.max(0, room));
      }
      framings.set(f.index, { scale: s, originX: x, originY });
    }
    if (!worldScale) worldScale = primaryScale;
  } else if (independents.length > 0) {
    // One world scale for the panel: the figure that needs the smallest
    // scale to fit its own framing sets it (a bird beside a prince stays
    // bird-sized); smaller characters keep the reference figure's eye line.
    const own = independents.map((f) =>
      f.lying && shot !== "insert"
        ? lieFraming(shot, f.probe, f.mirror, box, headroom, slotX(f.spec.slot, box, rtl))
        : closeFraming(shot, f.probe, box, headroom, textLoad, slotX(f.spec.slot, box, rtl), independents.filter((g) => !g.lying).length),
    );
    let ref = 0;
    own.forEach((o, i) => {
      if (o.scale < own[ref].scale) ref = i;
    });
    const refFrame = own[ref];
    const refHeadY = refFrame.originY + independents[ref].probe.head.y * refFrame.scale;
    independents.forEach((f, i) => {
      const d = depthOf(f.spec);
      const mul = d === "fore" ? 1.08 : d === "back" ? 0.78 : 1;
      const x = slotX(f.spec.slot, box, rtl);
      const ownHeadY = own[i].originY + f.probe.head.y * own[i].scale;
      const base: Framing =
        own[i].scale <= refFrame.scale * 1.0001
          ? own[i]
          : { scale: refFrame.scale, originX: x, originY: (f.lying ? ownHeadY : refHeadY) - f.probe.head.y * refFrame.scale };
      const scale = base.scale * mul * aScale;
      const headY = base.originY + f.probe.head.y * base.scale;
      const originY = headY - f.probe.head.y * scale;
      const hr = f.probe.headRadius * scale;
      const headOffset = (f.mirror ? -f.probe.head.x : f.probe.head.x) * scale;
      if (f.lying) {
        const ownHeadX = own[i].originX + (f.mirror ? -f.probe.head.x : f.probe.head.x) * own[i].scale;
        const headX = clamp(ownHeadX, box.x + hr * 1.1, box.x + box.w - hr * 1.1);
        framings.set(f.index, { scale, originX: headX - headOffset, originY });
        return;
      }
      // In close-range shots the slot places the FACE (a bow or a lean can
      // throw the head far from the feet); keep most of the head inside.
      const headX = clamp(x, box.x + hr * 0.55, box.x + box.w - hr * 0.55);
      framings.set(f.index, { scale, originX: headX - headOffset, originY });
    });
    const mids = independents.filter((f) => depthOf(f.spec) === "mid");
    worldScale = framings.get((mids[0] ?? independents[0]).index)?.scale ?? 0;
  }

  // --- face safety among independent figures ---------------------------------
  const drawOrder = (list: readonly FigureInfo[]): FigureInfo[] => {
    const rank = (f: FigureInfo) => (depthOf(f.spec) === "back" ? 0 : depthOf(f.spec) === "mid" ? 1 : 2);
    return [...list].sort((a, b) => rank(a) - rank(b) || a.index - b.index);
  };
  const placementOf = (f: FigureInfo, fr: Framing): Placement => {
    const a = f.probe;
    const left = fr.originX + (f.mirror ? -a.right : a.left) * fr.scale;
    const right = fr.originX + (f.mirror ? -a.left : a.right) * fr.scale;
    return {
      head: { x: fr.originX + (f.mirror ? -a.head.x : a.head.x) * fr.scale, y: fr.originY + a.head.y * fr.scale },
      r: a.headRadius * fr.scale,
      body: { x: left, y: fr.originY + a.top * fr.scale, w: right - left, h: -a.top * fr.scale },
    };
  };
  const ordered = drawOrder(independents);
  const headInside = (p: Placement) => p.head.x - p.r * 0.8 >= box.x && p.head.x + p.r * 0.8 <= box.x + box.w;
  ordered.forEach((f, j) => {
    const fr = framings.get(f.index);
    if (!fr || onColumn(f)) return;
    let p = placementOf(f, fr);
    const earlier = ordered.slice(0, j).filter((e) => framings.has(e.index) && !onColumn(e));
    const conflicts = () => earlier.filter((e) => covers(p, placementOf(e, framings.get(e.index) as Framing)));
    if (conflicts().length === 0) return;
    const slotDir: 1 | -1 = slotFrac(f.spec.slot, rtl) > 0.5 ? 1 : slotFrac(f.spec.slot, rtl) < 0.5 ? -1 : f.index % 2 === 0 ? 1 : -1;
    let solved = false;
    for (const dir of [slotDir, -slotDir as 1 | -1]) {
      let trial = p;
      let total = 0;
      for (let step = 0; step < 6; step += 1) {
        const hit = earlier.find((e) => covers(trial, placementOf(e, framings.get(e.index) as Framing)));
        if (!hit) break;
        const dx = clearShift(trial, placementOf(hit, framings.get(hit.index) as Framing), dir) + 1;
        total += dir * dx;
        trial = shifted(p, total);
      }
      if (!earlier.some((e) => covers(trial, placementOf(e, framings.get(e.index) as Framing))) && headInside(trial)) {
        framings.set(f.index, { ...fr, originX: fr.originX + total });
        p = trial;
        solved = true;
        break;
      }
    }
    if (!solved && !groundShot) {
      // a small figure that cannot step aside drops below the other faces
      // (a bird perched at shoulder height instead of in front of a face)
      const small = earlier.every((e) => f.height <= e.height * 0.5);
      if (small) {
        for (let step = 1; step <= 8 && !solved; step += 1) {
          const dy = step * p.r * 0.75;
          const trial: Placement = { head: { x: p.head.x, y: p.head.y + dy }, r: p.r, body: { ...p.body, y: p.body.y + dy } };
          if (trial.head.y + trial.r * 0.6 > box.y + box.h) break;
          if (!earlier.some((e) => covers(trial, placementOf(e, framings.get(e.index) as Framing)))) {
            framings.set(f.index, { ...fr, originY: fr.originY + dy });
            p = trial;
            solved = true;
          }
        }
      }
    }
    if (!solved) {
      // neither can step aside alone: move both apart, half each
      const hit = earlier.find((e) => covers(p, placementOf(e, framings.get(e.index) as Framing)));
      const hfr = hit ? framings.get(hit.index) : undefined;
      const hasDependents = hit ? infos.some((d) => d.staging.type === "figure" && d.staging.target === hit.cast.id) : false;
      if (hit && hfr && !hasDependents) {
        const dir = slotDir;
        const need = clearShift(p, placementOf(hit, hfr), dir) + 2;
        const mine = shifted(p, (dir * need) / 2);
        const theirs = shifted(placementOf(hit, hfr), (-dir * need) / 2);
        const others = earlier.filter((e) => e !== hit).map((e) => placementOf(e, framings.get(e.index) as Framing));
        if (headInside(mine) && headInside(theirs) && !covers(mine, theirs) && !others.some((o) => covers(mine, o) || covers(theirs, o) || covers(o, theirs))) {
          framings.set(f.index, { ...fr, originX: fr.originX + (dir * need) / 2 });
          framings.set(hit.index, { ...hfr, originX: hfr.originX - (dir * need) / 2 });
          p = mine;
          solved = true;
        }
      }
    }
    if (!solved) {
      const names = conflicts().map((e) => `"${e.cast.id}"`).join(", ");
      issues.push({
        code: "FACE_COVERED",
        severity: "warning",
        path: ipath,
        message: `"${f.cast.id}" covers the face of ${names} and there is no room to move it aside in this ${shot} panel. Use different slots (e.g. "left" and "right"), a wider shot, or fewer figures.`,
      });
    }
  });

  // --- figures staged on other figures ----------------------------------------
  const resolved = new Set(independents.map((f) => f.index));
  const pending = infos.filter(isDependent);
  for (let guard = 0; guard < 4 && pending.length > 0; guard += 1) {
    for (let k = pending.length - 1; k >= 0; k -= 1) {
      const f = pending[k];
      if (f.staging.type !== "figure") continue;
      const target = byChar.get(f.staging.target);
      if (!target || !resolved.has(target.index)) continue;
      const tfr = framings.get(target.index);
      pending.splice(k, 1);
      if (!tfr) continue;
      const s = tfr.scale; // scale continuity: the target's world scale
      const tp = placementOf(target, tfr);
      const ta = target.probe;
      const toPageT = (p: Point): Point => ({ x: tfr.originX + (target.mirror ? -p.x : p.x) * s, y: tfr.originY + p.y * s });
      const a = f.probe;
      const myLeft = (f.mirror ? -a.right : a.left) * s; // negative extent
      const myRight = (f.mirror ? -a.left : a.right) * s;
      const fx = slotFrac(f.spec.slot, rtl);
      const tx = slotFrac(target.spec.slot, rtl);
      const facingSide = target.spec.facing === "front" || target.spec.facing === "back" ? 0 : target.mirror ? -1 : 1;
      // a profile's face points one way: perch on the far (back) shoulder, never in front of the face
      const bySlot: 1 | -1 = fx < tx ? -1 : fx > tx ? 1 : 1;
      const side: 1 | -1 = f.staging.part === "shoulder" && facingSide !== 0 ? (-facingSide as 1 | -1) : bySlot;
      let origin: Point;
      switch (f.staging.part) {
        case "shoulder": {
          const y = tfr.originY + ta.shoulders * s;
          // feet on the shoulder, the body clear of the head circle (thin tails may overlap a little)
          const x = side > 0 ? Math.max(tp.head.x + tp.r * 1.1, tp.head.x + tp.r * 1.02 - myLeft * 0.8) : Math.min(tp.head.x - tp.r * 1.1, tp.head.x - tp.r * 1.02 - myRight * 0.8);
          origin = { x, y };
          break;
        }
        case "hand": {
          const hand = ta.hand ? toPageT(ta.hand) : { x: tp.head.x + side * tp.r * 1.1, y: tfr.originY + ta.shoulders * s };
          origin = hand;
          break;
        }
        case "head":
          origin = { x: tp.head.x, y: tp.head.y - tp.r * 0.92 };
          break;
        default: {
          // feet: on the same surface, beside the target's feet
          const tHalf = ((ta.right - ta.left) / 2) * s;
          const x = tfr.originX + side * (tHalf * 0.8 + (side > 0 ? -myLeft : myRight));
          origin = { x, y: tfr.originY };
        }
      }
      framings.set(f.index, { scale: s, originX: origin.x, originY: origin.y });
      resolved.add(f.index);
    }
  }

  // --- draw figures + props by depth ----------------------------------------
  const figures: FigurePlacement[] = [];
  const hatBoxes: Box[] = [];
  const layers: Record<Depth, string[]> = { back: [], mid: [], fore: [] };
  const envFrag = adoptFragment(env.svg, idPrefix, scope("env"));
  defs.push(envFrag.defs);

  let focus: Point = { x: cx, y: cy };
  const firstFr = infos.length ? framings.get(infos[0].index) : undefined;
  if (firstFr && infos[0]) focus = placementOf(infos[0], firstFr).head;

  const toned = panel.time === "night" || isToned(envFrag.body);
  /** Paper halos go under every figure (never over a neighbour's body). */
  const halos: string[] = [];
  let haloDefined = false;
  const haloId = `${idPrefix}${scope("-halo")}`;

  // Draw order: back → mid → fore; a figure staged on another is drawn right after it.
  const layerOf = (f: FigureInfo): Depth => {
    let cur = f;
    for (let g = 0; g < 4 && cur.staging.type === "figure"; g += 1) {
      const t = byChar.get(cur.staging.target);
      if (!t) break;
      cur = t;
    }
    return depthOf(cur.spec);
  };
  const sequence: FigureInfo[] = [];
  const visit = (f: FigureInfo) => {
    if (sequence.includes(f)) return;
    sequence.push(f);
    for (const d of infos) if (d.staging.type === "figure" && d.staging.target === f.cast.id) visit(d);
  };
  drawOrder(independents).forEach(visit);
  for (const f of infos) if (!sequence.includes(f)) sequence.push(f);

  for (const f of sequence) {
    const fr = framings.get(f.index);
    if (!fr) continue;
    const layer = layers[layerOf(f)];
    const headPx = f.probe.headRadius * fr.scale;
    const detail: FigurePlacement["detail"] = headPx >= LOD_FULL_RADIUS ? "full" : headPx >= LOD_REDUCED_RADIUS ? "reduced" : "silhouette";
    const lw = STROKE.figureOutline / fr.scale;
    const drawing = safeDraw(f.cast, f.spec, f.pose, lw, f.seed, idPrefix, detail);
    if (!drawing) continue;
    const frag = adoptScaled(drawing.svg, `f${f.index}`, fr.scale);
    defs.push(frag.defs);
    let held = "";
    if (f.spec.holding) {
      const prop = safeProp(f.spec.holding, lw, hashString(`${panel.id}|held|${f.index}`), idPrefix, f.spec.holding_tone);
      if (prop) {
        const a = drawing.anchors;
        const hand = a.hand ?? { x: a.right * 0.8, y: a.waist };
        const pf = adoptScaled(prop.svg, `h${f.index}`, fr.scale);
        defs.push(pf.defs);
        held = `<g transform="translate(${n(hand.x - prop.grip.x)} ${n(hand.y - prop.grip.y)})">${pf.body}</g>`;
      }
    }
    const sx = f.mirror ? -fr.scale : fr.scale;
    const transform = `translate(${n(fr.originX)} ${n(fr.originY)}) scale(${n4(sx)} ${n4(fr.scale)})`;
    // seat under a sitting human who is not staged on anything
    let under = "";
    let over = "";
    const human = f.cast.look.kind === "human";
    const seatable = f.staging.type === "ground" || (f.staging.type === "feature" && (f.staging.feature === "table" || (f.staging.feature === "bed" && !onBed.has(f.index))));
    if (human && f.spec.pose === "sit" && seatable) {
      const kind = seatKindFor(location?.environment);
      if (kind) {
        // seats are drawn at adult size: scale them to this sitter's seat height
        const contact = seatContact(f.nominal);
        const m0 = contact / ADULT_SEAT_Y;
        const seat = safeSeat(kind, lw / Math.max(0.2, m0), hashString(`${panel.id}|seat|${f.index}`), idPrefix);
        if (seat) {
          const m = contact / seat.seatY;
          const sf = adoptScaled(seat.svg, `st${f.index}`, fr.scale * m);
          defs.push(sf.defs);
          under += `<g transform="scale(${n4(m)})">${sf.body}</g>`;
        }
      }
    }
    if (ownColumn.has(f.index)) {
      const col = adoptScaled(columnTop(lw, idPrefix), `col${f.index}`, fr.scale);
      defs.push(col.defs);
      under += col.body;
    }
    // a lying figure in bed: pillow and mattress under, blanket over
    if (f.lying && f.staging.type === "feature" && f.staging.feature === "bed") {
      const envBed = groundShot && env.anchors?.bed_head && env.anchors?.bed_foot;
      const bed = bedFor(
        { head: drawing.anchors.head, r: drawing.anchors.headRadius, left: drawing.anchors.left, right: drawing.anchors.right, top: drawing.anchors.top },
        lw,
        groundShot && !envBed,
      );
      if (!envBed) under += bed.under;
      over += bed.over;
    }
    const p = placementOf(f, fr);
    // a paper halo behind a speaker's head when the background is toned
    if (speakers.has(f.cast.id) && toned) {
      if (!haloDefined) {
        defs.push(
          `<radialGradient id="${haloId}"><stop offset="0" stop-color="${PAPER}"/><stop offset="0.74" stop-color="${PAPER}"/><stop offset="1" stop-color="${PAPER}" stop-opacity="0"/></radialGradient>`,
        );
        haloDefined = true;
      }
      halos.push(`<circle cx="${n(p.head.x)}" cy="${n(p.head.y)}" r="${n(p.r * 1.5)}" fill="url(#${haloId})"/>`);
    }
    const shadow = groundShot && f.staging.type === "ground" && !AIRBORNE_POSES.has(f.spec.pose) ? castShadow(fr, drawing.anchors, idPrefix) : "";
    // (angle foreshortening would need two clipped copies of the drawing; resvg
    // can panic on clip groups next to far-off environment geometry, so the
    // angle is carried by the horizon, the baseline and a small scale instead)
    layer.push(`${shadow}<g transform="${transform}">${under}${frag.body}${held}${over}</g>`);
    const a = drawing.anchors;
    const toPage = (pt: Point): Point => ({ x: fr.originX + (f.mirror ? -pt.x : pt.x) * fr.scale, y: fr.originY + pt.y * fr.scale });
    const left = fr.originX + (f.mirror ? -a.right : a.left) * fr.scale;
    const right = fr.originX + (f.mirror ? -a.left : a.right) * fr.scale;
    const stagingLabel =
      f.staging.type === "ground" ? "ground" : f.staging.type === "figure" ? `on:${f.staging.target}:${f.staging.part}` : `on:${f.staging.feature}`;
    const look = f.cast.look as { kind: string; headwear?: string };
    if (look.kind === "human" && look.headwear && TALL_HEADWEAR.has(look.headwear)) {
      // lettering keeps off a hat or crown that rises above the head circle
      const hc = toPage(a.head);
      const hr = a.headRadius * fr.scale;
      hatBoxes.push({ x: hc.x - hr * 0.95, y: hc.y - hr * 2.05, w: hr * 1.9, h: hr * 1.2 });
    }
    figures.push({
      character: f.cast.id,
      figureIndex: f.index,
      head: toPage(a.head),
      headRadius: a.headRadius * fr.scale,
      mouth: toPage(a.mouth),
      body: { x: left, y: fr.originY + a.top * fr.scale, w: right - left, h: -a.top * fr.scale },
      scale: fr.scale,
      detail,
      staging: stagingLabel,
    });
  }
  figures.sort((a, b) => a.figureIndex - b.figureIndex);

  // staged figures must not cover anyone's face either (warn; their place is fixed)
  for (const f of infos.filter(isDependent)) {
    const fr = framings.get(f.index);
    if (!fr) continue;
    const p = placementOf(f, fr);
    for (const e of infos) {
      if (e === f) continue;
      const efr = framings.get(e.index);
      if (!efr) continue;
      if (covers(p, placementOf(e, efr), 0.3)) {
        issues.push({
          code: "FACE_COVERED",
          severity: "warning",
          path: ipath,
          message: `"${f.cast.id}" (staged on "${(f.staging as { target: string }).target}") covers the face of "${e.cast.id}". Use another "part" (e.g. "feet" or the other shoulder) or another shot.`,
        });
        break;
      }
    }
  }

  // speakers must be big enough to read as the speaker
  for (const fp of figures) {
    if (!speakers.has(fp.character)) continue;
    if (fp.headRadius < SPEAKER_MIN_HEAD_RADIUS) {
      issues.push({
        code: "SPEAKER_TOO_SMALL",
        severity: "warning",
        path: ipath,
        message: `speaker "${fp.character}" is drawn with a head radius of ${Math.round(fp.headRadius)} units (under ${SPEAKER_MIN_HEAD_RADIUS}) in this ${shot} shot, too small to read as the speaker on a phone. Use a full, medium or close shot for dialogue, or move the line to a caption.`,
      });
    }
  }

  if (worldScale === 0) {
    // no figures: scale of a nominal adult for this shot
    const frac = shot === "full" ? 0.74 : shot === "wide" ? 0.4 : shot === "establishing" ? 0.22 : shot === "medium" ? 1.6 : 3;
    worldScale = (frac * box.h) / 100;
  }

  const groundY = Number.isFinite(env.groundY) ? env.groundY : box.y + box.h * 0.9;
  const horizonY = Number.isFinite(env.horizonY) ? env.horizonY : box.y + box.h * 0.55;
  if (figures[0]) focus = figures[0].head;
  let insertSvg = "";
  const obstacles: Box[] = [...hatBoxes];
  if (shot === "insert") {
    const first = panel.props[0];
    const heldBy = panel.figures.find((f) => f.holding);
    const propId: PropId | undefined = first?.prop ?? heldBy?.holding;
    const tone: Tone | undefined = first ? first.tone : heldBy?.holding_tone;
    if (propId) {
      const probe = safeProp(propId, 1, 1, idPrefix, tone);
      if (probe) {
        const avail = box.h * (1 - (textLoad > 0 ? headroom : 0.1));
        const scale = Math.min((0.8 * avail) / Math.max(1, probe.height), (0.64 * box.w) / Math.max(1, probe.width));
        const drawn = safeProp(propId, STROKE.figureOutline / scale, hashString(`${panel.id}|insert`), idPrefix, tone);
        if (drawn) {
          const pf = adoptScaled(drawn.svg, "ins", scale);
          defs.push(pf.defs);
          const ox = cx;
          const oy = box.y + box.h - avail / 2 + (probe.height * scale) / 2;
          insertSvg = `<g transform="translate(${n(ox)} ${n(oy)}) scale(${n4(scale)})">${pf.body}</g>`;
          focus = { x: ox, y: oy - (probe.height * scale) / 2 };
          const pw = probe.width * scale;
          const ph = probe.height * scale;
          obstacles.push({ x: ox - pw / 2, y: oy - ph, w: pw, h: ph });
        }
      }
    }
  } else {
    panel.props.slice(0, MAX_PROPS).forEach((p, i) => {
      const d = depthOf(p);
      const nominal = safePropNominal(p.prop);
      let scale = worldScale * (d === "fore" ? 1.2 : d === "back" ? 0.62 : 1);
      let base: number;
      if (groundShot && groundModel) {
        // props share the figures' ground plane and depth normalisation
        const gm = groundModel;
        scale /= gm.maxMul;
        base = Math.min(gm.horizon + (gm.feet - gm.horizon) * (scale / Math.max(1e-6, gm.scale)), box.y + box.h * 1.01);
      } else if (groundShot) {
        const midFeet = clamp(groundY, box.y + box.h * 0.66, box.y + box.h * 0.96);
        const horizon = clamp(horizonY, box.y + box.h * 0.15, midFeet - box.h * 0.06);
        base = d === "fore" ? Math.min(midFeet + box.h * 0.07, box.y + box.h) : d === "back" ? horizon + (midFeet - horizon) * 0.4 : midFeet;
      } else {
        scale = Math.min(scale, (0.36 * box.h) / Math.max(1, nominal));
        base = box.y + box.h * 0.995;
      }
      const drawn = safeProp(p.prop, STROKE.figureOutline / scale, hashString(`${panel.id}|prop|${i}`), idPrefix, p.tone);
      if (!drawn) return;
      const pf = adoptScaled(drawn.svg, `pr${i}`, scale);
      defs.push(pf.defs);
      layers[d].unshift(`<g transform="translate(${n(slotX(p.slot, box, rtl))} ${n(base)}) scale(${n4(scale)})">${pf.body}</g>`);
    });
  }

  // --- fx -----------------------------------------------------------------
  const heads = figures.map((f) => ({ point: f.head, radius: f.headRadius }));
  const underFx: string[] = [];
  const overFx: string[] = [];
  panel.fx.slice(0, MAX_FX).forEach((id, i) => {
    try {
      const out = fxModule.draw(
        {
          fx: id,
          box,
          polygon,
          focus,
          heads,
          lineWidth: STROKE.fx,
          seed: hashString(`${panel.id}|fx|${id}|${i}`),
        },
        ctxFor(idPrefix, hashString(`${panel.id}|fxctx|${id}|${i}`)),
      );
      const u = adoptFragment(out.under, idPrefix, scope(`fu${i}`));
      const o = adoptFragment(out.over, idPrefix, scope(`fo${i}`));
      defs.push(u.defs, o.defs);
      underFx.push(u.body);
      overFx.push(o.body);
    } catch {
      // a failing fx never takes the page down; validation reports vocab errors
    }
  });

  let scene = [
    `<path d="${polyPath(polygon)}" fill="${PAPER}"/>`,
    envFrag.body,
    underFx.join(""),
    halos.join(""),
    layers.back.join(""),
    layers.mid.join(""),
    layers.fore.join(""),
    insertSvg,
  ].join("");
  let overSvg = overFx.join("");
  let placedFigures = figures;
  if (dutch) {
    const rot = `rotate(${dutchDeg} ${n(cx)} ${n(cy)})`;
    scene = `<path d="${polyPath(polygon)}" fill="${PAPER}"/><g transform="${rot}">${scene}</g>`;
    overSvg = overSvg ? `<g transform="${rot}">${overSvg}</g>` : "";
    const rp = (p: Point) => rotatePoint(p, { x: cx, y: cy }, dutchDeg);
    placedFigures = figures.map((f) => {
      const corners = [
        { x: f.body.x, y: f.body.y },
        { x: f.body.x + f.body.w, y: f.body.y },
        { x: f.body.x + f.body.w, y: f.body.y + f.body.h },
        { x: f.body.x, y: f.body.y + f.body.h },
      ].map(rp);
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      return {
        ...f,
        head: rp(f.head),
        mouth: rp(f.mouth),
        body: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) },
      };
    });
    focus = rp(focus);
  }
  return {
    content: scene + overSvg,
    defs: defs.join(""),
    clipId,
    figures: placedFigures,
    focus,
    obstacles,
    issues,
  };
}

/**
 * The top of a statue column in figure space (a statue's feet at y=0): a
 * platform slab, a capital and a shaft that runs far below (clipped by the
 * panel). Used when the environment's own column top is out of frame.
 */
function columnTop(lw: number, idPrefix: string): string {
  const stone = toneFill("stone", idPrefix);
  const st = `stroke="${INK}" stroke-width="${n(lw * 1.1)}" stroke-linejoin="round"`;
  let s = "";
  // shaft with two flutes
  s += `<path d="M-26 22V900H26V22Z" fill="${stone}" ${st}/>`;
  s += `<path d="M-9 26V900M9 26V900" fill="none" stroke="${INK}" stroke-width="${n(lw * 0.6)}"/>`;
  // capital and platform slab (with a lip)
  s += `<path d="M-40 10L-30 22H30L40 10Z" fill="#e4e4e0" ${st}/>`;
  s += `<path d="M-62 0H62V10H-62Z" fill="#e4e4e0" ${st}/>`;
  s += `<path d="M-58 -4H58V0H-58Z" fill="${PAPER}" ${st}/>`;
  return s;
}

/**
 * Is a background fragment toned (pattern screentone or a mid/dark fill)?
 * Then speakers' heads get a paper halo.
 */
function isToned(svg: string): boolean {
  if (/url\(#[^)]*tone-(?:dots|dense_dots|stripes|check|flowers)\)/.test(svg)) return true;
  for (const m of svg.matchAll(/fill="#([0-9a-fA-F]{6})"/g)) {
    const v = parseInt(m[1], 16);
    const lum = (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
    if (lum < 0.72) return true;
  }
  return false;
}

function n4(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`non-finite scale ${v}`);
  const r = Math.round(v * 10000) / 10000;
  return Object.is(r, -0) ? "0" : String(r);
}

function rotatePoint(p: Point, c: Point, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) };
}

function castShadow(fr: Framing, a: FigureAnchors, idPrefix: string): string {
  const half = Math.max(4, ((a.right - a.left) / 2) * fr.scale * 0.95);
  const ry = Math.max(2, half * 0.16);
  return `<ellipse cx="${n(fr.originX)}" cy="${n(fr.originY)}" rx="${n(half)}" ry="${n(ry)}" fill="${toneFill("dots", idPrefix)}"/>`;
}

function safeDraw(
  cast: CastMember,
  spec: FigureSpec,
  pose: Pose,
  lineWidth: number,
  seed: number,
  idPrefix: string,
  detail: FigureRequest["detail"] = "full",
): FigureDrawing | undefined {
  try {
    const d = rig.draw(
      { look: cast.look, pose, expression: spec.expression, facing: spec.facing, lineWidth, seed, detail, rim: true },
      ctxFor(idPrefix, seed),
    );
    if (!validAnchors(d.anchors)) return undefined;
    return d;
  } catch {
    return undefined;
  }
}

function safePoses(cast: CastMember): readonly Pose[] {
  try {
    return rig.supportedPoses(cast.look);
  } catch {
    return [];
  }
}

function safeNominal(cast: CastMember): number {
  try {
    const v = rig.nominalHeight(cast.look);
    return Number.isFinite(v) && v > 0 ? v : 100;
  } catch {
    return 100;
  }
}

function validAnchors(a: FigureAnchors): boolean {
  const nums = [a.head.x, a.head.y, a.headRadius, a.mouth.x, a.mouth.y, a.top, a.left, a.right, a.waist, a.shoulders];
  if (a.hand) nums.push(a.hand.x, a.hand.y);
  return nums.every((v) => Number.isFinite(v)) && a.headRadius > 0 && a.top < 0;
}

function safeProp(prop: PropId, lineWidth: number, seed: number, idPrefix: string, tone?: Tone): PropDrawing | undefined {
  try {
    const d = propModule.draw(prop, lineWidth, ctxFor(idPrefix, seed), tone);
    if (![d.width, d.height, d.grip.x, d.grip.y].every((v) => Number.isFinite(v))) return undefined;
    return d;
  } catch {
    return undefined;
  }
}

function safeSeat(kind: Parameters<typeof propModule.seat>[0], lineWidth: number, seed: number, idPrefix: string): (PropDrawing & { seatY: number }) | undefined {
  try {
    if (typeof propModule.seat !== "function") return undefined;
    const d = propModule.seat(kind, lineWidth, ctxFor(idPrefix, seed));
    if (!Number.isFinite(d.seatY) || d.seatY >= 0) return undefined;
    return d;
  } catch {
    return undefined;
  }
}

function safePropNominal(prop: PropId): number {
  try {
    const v = propModule.nominalHeight(prop);
    return Number.isFinite(v) && v > 0 ? v : 12;
  } catch {
    return 12;
  }
}
