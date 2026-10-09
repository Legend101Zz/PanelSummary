/**
 * Scene composer: turns one PanelSpec into page-space SVG inside its panel
 * polygon — environment, fx, figures (framed by shot/angle/slot/depth and
 * staged on each other or on environment features), props — and reports
 * page-space head/mouth/hand anchors, prop boxes and keep-out zones for
 * lettering.
 *
 * Rigs and props draw in figure space (ground at y=0, facing right, adult
 * = 100 units). The composer scales them with lineWidth = pageStroke / scale
 * so ink weight is the same in every shot.
 *
 * Order of work:
 *  1. plan props (a held prop is drawn once, carriers take props into their
 *     arms, beat-mentioned props are key), merge look variants, probe every
 *     figure at scale 1 and resolve its staging (staging.ts);
 *  2. frame the independent figures (ground shots by SHOT_GUIDE height with
 *     fore-depth boosts for small creatures; close-range shots around the
 *     face; lying figures horizontally). A statue on its column is never at
 *     street level: ground shots stand it on the column top, close-range
 *     shots see it from up at its own height (sky and rooftops behind, no
 *     column rising behind it), and a creature at its feet is framed on the
 *     column top between the statue's feet;
 *  3. draw the environment, reframing it (a zoom/pan of the same camera)
 *     when a statue must stand on its column or, at eye level, so the
 *     horizon passes through the main figure's eyes; an empty column top in
 *     frame carries the location's statue as scenery;
 *  4. keep faces clear (safety.ts), place figures staged on others, keep
 *     every head in frame and zoom close-range shots so each speaker reaches
 *     the readable floor;
 *  5. draw back → mid → fore with seats, beds, ground bands, speaker halos,
 *     held props in the hand and ground props at the figures' scale.
 */
import type {
  Angle,
  Box,
  CastMember,
  CharacterLook,
  Depth,
  EnvFeature,
  Environment,
  EyeState,
  FigureSpec,
  LocationSpec,
  LookVariant,
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
import { castWithVariant } from "./looks.js";
import { resolveLocation } from "./places.js";
import { planProps, type HeldProp } from "./props.js";
import { clearShift, covers, shifted, type Placement } from "./safety.js";
import {
  ADULT_SEAT_Y,
  AIRBORNE,
  bedFor,
  BED_HEIGHT,
  GROUND_SHOTS,
  isStatue,
  locationStatue,
  resolveStaging,
  seatContact,
  seatKindFor,
  statueGone,
  type Staging,
} from "./staging.js";

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
  /**
   * Look variants worn on this page by cast id (the last one given). Used for
   * characters drawn as scenery (the statue on its column when it is not one
   * of the panel's figures), so a stripped statue stays stripped.
   */
  pageVariants?: Readonly<Record<string, LookVariant>>;
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
  /** Pose actually drawn (a perching bird staged on someone stands). */
  pose?: Pose;
  /** Page-space front hand, when the rig reports one. */
  hand?: Point;
  /** The head is deliberately out of frame (a statue seen from its feet). */
  headCropped?: boolean;
}

/** A prop drawn in the panel, in page space. */
export interface PropPlacement {
  prop: PropId;
  box: Box;
  /** Mentioned by the beat, or the insert's subject: lettering never covers it. */
  key: boolean;
  /** Held by this character (in the hand or arms). */
  heldBy?: string;
}

export interface ComposedPanel {
  /** Content to draw inside the panel clip (page space). */
  content: string;
  /** Defs to hoist into the page <defs> (clip path + module defs). */
  defs: string;
  clipId: string;
  figures: FigurePlacement[];
  focus: Point;
  /** Other things lettering should avoid covering (hats, gesturing hands, scenery heads, the insert prop). */
  obstacles: Box[];
  /** Key props (beat-mentioned or the insert's subject): lettering must not cover them. */
  keepOut: Box[];
  /** Every drawn prop with its page box. */
  props: PropPlacement[];
  /** Where the panel's sound comes from (a flying bird, a runner, a key prop), for SFX. */
  sfxSource?: { point: Point; box: Box };
  /** Cast drawn as scenery, not as figures (the statue on an empty column top). */
  scenery: string[];
  /** The environment actually drawn (up high, a statue's panel shows the rooftops). */
  environment: Environment;
  /** Staging and legibility issues (FACE_COVERED, SPEAKER_TOO_SMALL, ...). */
  issues: ValidationIssue[];
}

/** A giant counts at this share of his height when a ground shot picks its figure height. */
export const GIANT_BAND_SHARE = 0.68;

/** A held prop must have at least this share of its box inside the panel (else it is moved or drawn on the ground). */
export const HELD_PROP_MIN_INSIDE = 0.9;

export const MAX_FIGURES = 4;
export const MAX_PROPS = 4;
export const MAX_FX = 3;

/** On-page head radius floors (page units). */
export const SPEAKER_MIN_HEAD_RADIUS = 22;
export const LOD_FULL_RADIUS = 30;
export const LOD_REDUCED_RADIUS = 18;
/** A figure staged on another's hand, shoulder or head must read at least this big (page units). */
export const DEPENDENT_MIN_HEAD_RADIUS = 12;

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
/** Poses whose sound or motion an SFX voices first. */
const NOISY_POSES: readonly Pose[] = ["fly", "jump", "fall", "run", "walk"];
/** Poses whose hand carries the gesture (lettering keeps off it). */
const GESTURE_POSES = new Set<Pose>(["point", "reach", "wave", "hold", "carry"]);
/** Headwear that rises above the head circle (lettering keeps clear of it). */
const TALL_HEADWEAR = new Set(["top_hat", "crown", "wide_hat", "helmet", "hood", "wreath", "bonnet"]);
const SPEAKING = new Set(["speech", "thought", "shout", "whisper"]);
const SMALL_KINDS = new Set(["bird", "insect", "animal"]);

/** Does this character wear headwear that rises well above the head circle? */
function tallHat(cast: CastMember): boolean {
  const look = cast.look as { kind: string; headwear?: string };
  return look.kind === "human" && look.headwear !== undefined && TALL_HEADWEAR.has(look.headwear);
}

function isGiant(f: { cast: CastMember }): boolean {
  const look = f.cast.look as { kind: string; height?: string };
  return look.kind === "human" && look.height === "giant";
}

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
  /** The cast member as drawn in this panel (variant merged into the look). */
  cast: CastMember;
  eyes?: EyeState;
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
  /** A small creature (bird, insect, small animal). */
  small: boolean;
  /** What it holds (the spec's `holding`, or a prop it carries). */
  held?: HeldProp;
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
function closeFraming(shot: Shot, a: FigureAnchors, box: Box, headroom: number, textLoad: number, x: number, count = 1, hat = false): Framing {
  // faces share the panel width when several characters are framed together
  const cnt = Math.max(1, count);
  const r = Math.max(0.5, a.headRadius);
  const bodyW = Math.max(1, a.right - a.left);
  // a top hat or a crown is part of the head for framing (the lettering band sits above it)
  const headTopUnits = a.head.y - r * (hat ? 2.05 : 1.15);
  if (shot === "medium") {
    const bottom = Math.max(a.waist, a.head.y + r * 2.6);
    const span = Math.max(1, bottom - headTopUnits);
    const heightScale = ((1 - headroom) * box.h) / span;
    // sides may crop in a medium shot, so the body-width limit is loose; in a
    // tall panel a long body (a rat, a horse) crops more rather than leave the
    // panel an empty sky above a strip of figures
    const tallness = clamp((box.h / Math.max(1, box.w) - 1.3) / 0.9, 0, 1);
    const scale = Math.min(heightScale, (Math.min(0.44 + 0.16 * tallness, 0.85 / cnt) * box.w) / (2 * r), ((1.4 + 0.9 * tallness) * box.w) / bodyW);
    if (scale >= heightScale * 0.999) return { scale, originX: x, originY: box.y + box.h - bottom * scale };
    return { scale, originX: x, originY: bandPlacement(box, headroom, span * scale, headTopUnits, scale) };
  }
  if (shot === "close") {
    const bottom = Math.max(a.shoulders, a.head.y + r * 1.4);
    const span = Math.max(1, bottom - headTopUnits);
    const heightScale = ((0.88 - headroom) * box.h) / span;
    // a close-up of one face fills most of a narrow panel's width (a medium shot stops at 0.44)
    const scale = Math.min(heightScale, (Math.min(cnt === 1 ? 0.74 : 0.6, 0.88 / cnt) * box.w) / (2 * r));
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

/** Zoom a framing about a page point (a camera push-in: relative sizes and positions keep). */
function zoomAbout(fr: Framing, p: Point, k: number): Framing {
  return { scale: fr.scale * k, originX: p.x + (fr.originX - p.x) * k, originY: p.y + (fr.originY - p.y) * k };
}

function boxArea(b: Box): number {
  return Math.max(0, b.w) * Math.max(0, b.h);
}

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
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
  const location = resolveLocation(book.locations.find((l) => l.id === panel.location));
  const shot: Shot = panel.shot;
  const angle: Angle = panel.angle;
  const beat = typeof panel.beat === "string" ? panel.beat : "";
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
  const propPlan = planProps(panel, figureSpecs, MAX_PROPS);
  issues.push(...propPlan.issues);
  const infos: FigureInfo[] = [];
  figureSpecs.forEach((spec, i) => {
    const base = book.cast.find((c) => c.id === spec.character);
    if (!base) return;
    const cast = castWithVariant(base, spec.variant);
    const eyes = spec.variant?.eyes;
    const seed = hashString(`cast:${cast.id}`);
    const probe = safeDraw(cast.look, spec, spec.pose, 1, seed, idPrefix, "full", eyes);
    if (!probe) return;
    const nominal = safeNominal(cast.look);
    const lying = spec.pose === "lie";
    const held = propPlan.held.get(i);
    infos.push({
      spec,
      index: i,
      cast,
      ...(eyes ? { eyes } : {}),
      seed,
      probe: probe.anchors,
      pose: spec.pose,
      nominal,
      height: framingHeight(nominal, probe.anchors, lying),
      staging: { type: "ground" },
      mirror: (spec.facing === "left") !== rtl,
      lying,
      small: SMALL_KINDS.has(cast.look.kind),
      ...(held ? { held } : {}),
    });
  });
  const staging = resolveStaging(
    infos.map((f) => ({
      character: f.cast.id,
      pose: f.spec.pose,
      on: f.spec.on as { target?: unknown; part?: unknown } | undefined,
      cast: f.cast,
      height: f.height,
      small: f.small,
    })),
    location,
    shot,
    beat,
    speakers,
  );
  infos.forEach((f, i) => {
    f.staging = staging[i];
  });
  const byChar = new Map(infos.map((f) => [f.cast.id, f]));
  const onColumnSpec = (f: FigureInfo) => f.staging.type === "feature" && f.staging.feature === "statue_column";

  // Close-range: a small creature with nothing to stand on, beside a much
  // taller figure, perches on that figure's shoulder instead of floating.
  if (!groundShot && shot !== "insert") {
    for (const f of infos) {
      if (f.staging.type !== "ground" || f.spec.on || !f.small || AIRBORNE.has(f.spec.pose) || f.lying) continue;
      if (f.spec.pose !== "perch" && f.spec.pose !== "stand" && f.spec.pose !== "talk") continue;
      const host = infos
        .filter((g) => g !== f && !g.small && !g.lying && g.staging.type !== "figure" && g.height >= f.height * 3)
        .sort((a, b) => b.height - a.height)[0];
      if (host) f.staging = { type: "figure", target: host.cast.id, part: "shoulder", auto: true };
    }
  }
  /** The beat names a branch to perch on (the rig's twig then reads as that branch). */
  const branchInBeat = /\b(branch|branches|bough|twig|spray|willow|tree|trees|bush|hedge|thorn|rose-tree|oak|holm-oak|nest)\b/i.test(beat);
  infos.forEach((f) => {
    // a bird perched ON someone or something stands on it (no twig of its own);
    // so does a perching bird on the ground of a ground shot, or one with no branch to perch on
    const onSomething = f.staging.type !== "ground";
    if (f.spec.pose === "perch" && (onSomething || groundShot || !branchInBeat)) {
      const poses = safePoses(f.cast.look);
      if (poses.includes("stand")) {
        const re = safeDraw(f.cast.look, f.spec, "stand", 1, f.seed, idPrefix, "full", f.eyes);
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
  const isDependent = (f: FigureInfo) => f.staging.type === "figure";
  const wantsColumn = (f: FigureInfo) => onColumnSpec(f) && groundShot;
  /** Close-range shot of a statue on its column: seen from up at its own height. */
  const upHigh = !groundShot && shot !== "insert" && infos.some((f) => onColumnSpec(f) && !isDependent(f));
  /** Figures actually stood on the column top (their place is fixed by the environment). */
  const onColumnSet = new Set<number>();
  /** Statues stood on a column top the composer draws itself. */
  const ownColumn = new Set<number>();
  /** Figures sitting on the environment's bed (no seat of their own). */
  const onBed = new Set<number>();
  /** Figures whose head is deliberately out of frame (a statue seen from its feet). */
  const headCropped = new Set<number>();
  const onColumn = (f: FigureInfo) => onColumnSet.has(f.index);
  const independents = infos.filter((f) => !isDependent(f));
  const rootOf = (f: FigureInfo): FigureInfo => {
    let cur = f;
    for (let g = 0; g < 4 && cur.staging.type === "figure"; g += 1) {
      const t = byChar.get(cur.staging.target);
      if (!t) break;
      cur = t;
    }
    return cur;
  };

  // --- environment (first pass) ------------------------------------------------
  const envSeed = hashString(`loc:${location?.id ?? panel.location}`);
  /** Environment drawn behind the panel: up high, the rooftops at the statue's height. */
  const envKind: Environment = upHigh ? "rooftops" : (location?.environment ?? "void");
  /** Features drawn by the environment (the composer may draw the statue's column itself). */
  let envFeatures: readonly EnvFeature[] = upHigh ? [] : (location?.features ?? []);
  const drawEnv = (b: Box): EnvironmentDrawing =>
    environments.draw(
      {
        environment: envKind,
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
  /** Scale needed for a figure's head to reach a radius (page units). */
  const scaleForHead = (f: FigureInfo, r: number) => r / Math.max(0.3, f.probe.headRadius);
  /** Head radius floor for a figure staged on another (0 when none applies). */
  const dependentFloor = (f: FigureInfo): number => {
    if (f.staging.type !== "figure") return 0;
    if (speakers.has(f.cast.id)) return SPEAKER_MIN_HEAD_RADIUS + 0.5;
    return f.staging.part === "feet" ? 0 : DEPENDENT_MIN_HEAD_RADIUS;
  };

  if (independents.length > 0 && groundShot) {
    const frac = SHOT_HEIGHT[shot] ?? 0.4;
    const ground = independents.filter((f) => !wantsColumn(f));
    // a giant counts at two thirds of his height: he may stand a third taller than the
    // shot's band, so the people beside him are not specks (see GIANT_BAND_SHARE)
    const refH = Math.max(1, ...independents.map((f) => f.height * (isGiant(f) ? GIANT_BAND_SHARE : 1)));
    const depthMul = (f: FigureInfo) => (depthOf(f.spec) === "fore" ? 1.2 : depthOf(f.spec) === "back" ? 0.62 : 1);
    const maxMul = Math.max(0.62, ...ground.map(depthMul));
    let world = ((frac * box.h) / refH) * groundAngleScale(angle);
    const defaultFeet = shot === "full" ? 0.94 : shot === "wide" ? 0.88 : 0.9;
    let feetPrimary = box.y + box.h * defaultFeet;
    // keep the tallest head below the lettering band (full and wide shots),
    // but never below 75% of the shot's figure height
    if (shot === "full" || shot === "wide") world = Math.max(Math.min(world, (feetPrimary - (box.y + box.h * headroom)) / refH), (0.75 * frac * box.h) / refH);
    // a wide-shot speaker may take the top of the shot's ±25% band to reach the readable floor
    if (shot === "wide") {
      for (const f of ground) {
        if (!speakers.has(f.cast.id) || f.small) continue;
        const need = scaleForHead(f, SPEAKER_MIN_HEAD_RADIUS + 0.5) * (maxMul / depthMul(f));
        world = Math.max(world, Math.min(need, (1.22 * frac * box.h) / refH));
      }
    }
    // a figure held on someone's hand, shoulder or head must read: push the camera in
    for (const d of infos) {
      const floor = dependentFloor(d);
      const root = rootOf(d);
      if (!floor || wantsColumn(root) || root === d) continue;
      const cur = (world * depthMul(root)) / maxMul;
      const need = scaleForHead(d, floor);
      if (need > cur) world = Math.min(world * (need / cur), ((0.9 * box.h) / Math.max(1, root.height)) * (maxMul / depthMul(root)));
    }
    // a giant never rises past the top of the panel
    for (const g of ground.filter(isGiant)) world = Math.min(world, (0.92 * (feetPrimary - box.y) * maxMul) / (depthMul(g) * Math.max(1, g.height)));
    worldScale = world;
    const bigOnes = independents.filter((f) => !f.small);
    const scaleOf = (f: FigureInfo) => {
      let s = (world * depthMul(f)) / maxMul;
      // a small creature in the foreground is near the camera: big enough to read
      if (f.small && depthOf(f.spec) === "fore" && bigOnes.length > 0) {
        const want = scaleForHead(f, speakers.has(f.cast.id) ? SPEAKER_MIN_HEAD_RADIUS + 0.5 : LOD_REDUCED_RADIUS);
        s = Math.max(s, Math.min(want, s * 8, (0.62 * box.h) / Math.max(1, f.height)));
      }
      const widthUnits = Math.max(1, f.probe.right - f.probe.left);
      s = Math.min(s, (0.95 * box.w) / widthUnits);
      return s;
    };
    const groundBig = ground.filter((f) => !f.small);
    const primaryPool = groundBig.length > 0 ? groundBig : ground;
    const primary = primaryPool.length ? primaryPool.reduce((a, b) => (scaleOf(b) * b.height > scaleOf(a) * a.height ? b : a)) : undefined;

    // statue on its column: zoom/pan the same camera so the column top and a
    // readable statue are in frame, then stand the statue on the column top
    const statue = independents.find(wantsColumn);
    let reframed = false;
    if (statue) {
      // a creature on the statue (or a speaker at its feet) must read: a bigger statue
      let depNeed = 0;
      for (const d of infos) {
        if (rootOf(d) !== statue || d === statue) continue;
        const floor = dependentFloor(d) || (d.staging.type === "figure" ? 9 : 0);
        if (floor) depNeed = Math.max(depNeed, scaleForHead(d, floor) * statue.height);
      }
      const baseDesired = (shot === "establishing" ? 0.2 : shot === "wide" ? 0.3 : 0.5) * box.h;
      const desired = Math.min(Math.max(baseDesired, depNeed), 0.62 * box.h);
      if (env.anchors?.statue_top) {
        const T0 = env.anchors.statue_top;
        const C0 = env.anchors.statue_crown;
        // natural statue height: the env's crown hint, else ~30% of the column
        const statuePx0 = C0 && C0.y < T0.y ? T0.y - C0.y : 0.3 * Math.max(0.12 * box.h, (env.groundY - T0.y) * 0.9);
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
        if (room >= box.h * 0.12 && T1.y <= box.y + box.h * 0.95 && T1.x > box.x + box.w * 0.05 && T1.x < box.x + box.w * 0.95 && Math.min(statuePx1, room) >= desired * 0.7) {
          envBox = B2;
          env = env2;
          reframed = true;
          const statueScale = Math.min(statuePx1, room) / Math.max(1, statue.height);
          framings.set(statue.index, { scale: statueScale, originX: T1.x, originY: T1.y });
          onColumnSet.add(statue.index);
        }
      }
      if (!onColumnSet.has(statue.index)) {
        // the camera cannot see the column top here (a full shot, a high angle,
        // or the statue must be bigger than the set allows): leave the column
        // out of the background and stand the statue on a column top drawn
        // under its feet, running down out of the panel
        envFeatures = envFeatures.filter((ft) => ft !== "statue_column");
        envBox = envBase;
        env = drawEnv(envBox);
        reframed = true;
        const fracS = Math.max(desired / box.h, shot === "full" ? 0.6 : shot === "wide" ? 0.34 : 0.2);
        const statueScale = (fracS * box.h) / Math.max(1, statue.height);
        const feetFrac = shot === "full" ? 0.8 : shot === "wide" ? 0.66 : 0.6;
        const feet = Math.max(box.y + box.h * feetFrac, box.y + Math.max(headroom, 0.05) * box.h + fracS * box.h);
        framings.set(statue.index, { scale: statueScale, originX: clamp(slotX(statue.spec.slot, box, rtl), box.x + box.w * 0.25, box.x + box.w * 0.75), originY: Math.min(feet, box.y + box.h * 0.9) });
        onColumnSet.add(statue.index);
        ownColumn.add(statue.index);
      }
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
      // perspective: ground contact moves toward the horizon as the figure gets
      // smaller; a boosted foreground creature stays on the near ground
      const plain = (world * depthMul(f)) / maxMul;
      const rho = Math.min(s, plain) / Math.max(1e-6, primaryScale);
      let feet = horizon + (feetPrimary - horizon) * rho;
      if (s > plain * 1.01) feet = Math.max(feet, feetPrimary + box.h * 0.02);
      feet = Math.min(feet, box.y + box.h * 1.02);
      let x = slotX(f.spec.slot, box, rtl);
      if (f.staging.type === "feature" && f.staging.feature === "table" && f.small && env.anchors?.table) {
        // a small creature on the table: standing on its top
        const t = env.anchors.table;
        framings.set(f.index, { scale: s, originX: t.x, originY: t.y });
        continue;
      }
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
        const bf = env.anchors?.bed_foot;
        let bh = env.anchors?.bed_head;
        if (bh && bf) {
          // lie on the env's mattress, head at the pillow end; a bed cut by the
          // frame edge puts the head just inside the frame, on the visible part
          const edgeIn = box.w * 0.07;
          const inX = (p: Point) => p.x >= box.x + edgeIn && p.x <= box.x + box.w - edgeIn;
          if (!inX(bh) && inX(bf) && Math.abs(bh.x - bf.x) > 1) {
            const edge = bh.x < box.x + edgeIn ? box.x + edgeIn : box.x + box.w - edgeIn;
            const t = (edge - bf.x) / (bh.x - bf.x);
            bh = { x: edge, y: bf.y + (bh.y - bf.y) * t };
          }
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
      if (f.lying) {
        // a lying body stays inside the frame: its whole length on the ground in view
        const half = ((f.probe.right - f.probe.left) / 2) * s;
        x = clamp(x, box.x + half + box.w * 0.02, box.x + box.w - half - box.w * 0.02);
        originY = Math.min(originY, box.y + box.h * 0.96);
      }
      if (f.spec.pose === "fly" || f.spec.pose === "jump") {
        // airborne: lift off the ground, keeping the head below the lettering band
        const top = originY + f.probe.top * s;
        const room = top - (box.y + box.h * Math.max(headroom, 0.08));
        originY -= clamp(box.h * 0.14, 0, Math.max(0, room));
      } else if (f.spec.pose === "fall") {
        // falling: only just off the ground
        const top = originY + f.probe.top * s;
        const room = top - (box.y + box.h * Math.max(headroom, 0.08));
        originY -= clamp(box.h * 0.05, 0, Math.max(0, room));
      }
      framings.set(f.index, { scale: s, originX: x, originY });
    }
    // a giant dwarfs the children beside him, whatever their depth
    for (const g of ground) {
      const look = g.cast.look as { kind: string; height?: string };
      if (look.kind !== "human" || look.height !== "giant") continue;
      const gfr = framings.get(g.index);
      if (!gfr) continue;
      const gH = gfr.scale * g.height;
      for (const f of ground) {
        if (f === g || f.nominal >= g.nominal * 0.6) continue;
        const ffr = framings.get(f.index);
        if (!ffr || ffr.scale * f.height <= gH / 1.6) continue;
        framings.set(f.index, { ...ffr, scale: gH / 1.6 / Math.max(1, f.height) });
      }
    }
    if (!worldScale) worldScale = primaryScale;
  } else if (independents.length > 0) {
    // A statue on its column with a creature at its feet: the camera is up on
    // the column top, framing the creature between the statue's feet (the
    // statue rises out of the top of the panel at the same scale).
    const feetDep = upHigh
      ? infos.find((f) => f.staging.type === "figure" && f.staging.part === "feet" && onColumnSpec(rootOf(f)) && rootOf(f) !== f)
      : undefined;
    if (feetDep) {
      const statue = rootOf(feetDep);
      const own = feetDep.lying
        ? lieFraming(shot, feetDep.probe, feetDep.mirror, box, headroom, slotX(feetDep.spec.slot, box, rtl))
        : closeFraming(shot, feetDep.probe, box, headroom, textLoad, slotX(feetDep.spec.slot, box, rtl), 1);
      const cap = ((shot === "medium" ? 1.6 : shot === "close" ? 2.2 : 3) * box.h) / Math.max(1, statue.height);
      let s = Math.min(own.scale, cap);
      if (speakers.has(feetDep.cast.id)) s = Math.max(s, Math.min(scaleForHead(feetDep, SPEAKER_MIN_HEAD_RADIUS + 0.5), (3.2 * box.h) / Math.max(1, statue.height)));
      const topY = box.y + box.h * 0.9;
      // the statue's feet stand opposite the creature's slot, so the creature is framed beside (or between) them
      const between0 = /\bbetween\b/i.test(beat);
      const fSlot = slotFrac(feetDep.spec.slot, rtl);
      const sx = between0
        ? clamp(slotX(feetDep.spec.slot, box, rtl), box.x + box.w * 0.3, box.x + box.w * 0.7)
        : clamp(box.x + box.w * (fSlot > 0.55 ? fSlot - 0.3 : fSlot < 0.45 ? fSlot + 0.3 : 0.5), box.x + box.w * 0.3, box.x + box.w * 0.7);
      framings.set(statue.index, { scale: s, originX: sx, originY: topY });
      ownColumn.add(statue.index);
      onColumnSet.add(statue.index);
      if (statue.probe.head.y * s + topY + statue.probe.headRadius * s < box.y) headCropped.add(statue.index);
      for (const f of independents) {
        if (f === statue || framings.has(f.index)) continue;
        // anyone else up here shares the column top's scale, standing beside the statue
        const x = slotX(f.spec.slot, box, rtl);
        framings.set(f.index, { scale: s, originX: x, originY: f.spec.pose === "fly" ? topY - box.h * 0.3 : topY });
      }
      worldScale = s;
    } else {
      // One world scale for the panel: the figure that needs the smallest
      // scale to fit its own framing sets it (a bird beside a prince stays
      // bird-sized); smaller characters keep the reference figure's eye line,
      // and small creatures beside one another share its ground line.
      const own = independents.map((f) =>
        f.lying && shot !== "insert"
          ? lieFraming(shot, f.probe, f.mirror, box, headroom, slotX(f.spec.slot, box, rtl))
          : closeFraming(shot, f.probe, box, headroom, textLoad, slotX(f.spec.slot, box, rtl), independents.filter((g) => !g.lying).length, tallHat(f.cast)),
      );
      let ref = 0;
      own.forEach((o, i) => {
        if (o.scale < own[ref].scale) ref = i;
      });
      const refFrame = own[ref];
      const refInfo = independents[ref];
      const refHeadY = refFrame.originY + refInfo.probe.head.y * refFrame.scale;
      independents.forEach((f, i) => {
        const d = depthOf(f.spec);
        const mul = d === "fore" ? 1.08 : d === "back" ? 0.78 : 1;
        const x = slotX(f.spec.slot, box, rtl);
        const ownHeadY = own[i].originY + f.probe.head.y * own[i].scale;
        let base: Framing =
          own[i].scale <= refFrame.scale * 1.0001
            ? own[i]
            : { scale: refFrame.scale, originX: x, originY: (f.lying ? ownHeadY : refHeadY) - f.probe.head.y * refFrame.scale };
        if (i !== ref && f.small && refInfo.small && !AIRBORNE.has(f.spec.pose) && !AIRBORNE.has(refInfo.spec.pose) && !f.lying && !refInfo.lying) {
          // two creatures on the ground: feet on one line, not eye to eye
          base = { scale: refFrame.scale, originX: x, originY: refFrame.originY };
        }
        const scale = base.scale * mul * aScale;
        const headY = base.originY + f.probe.head.y * base.scale;
        const originY = f.small && refInfo.small && i !== ref && !AIRBORNE.has(f.spec.pose) ? base.originY : headY - f.probe.head.y * scale;
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
        severity: "error",
        path: ipath,
        message: `"${f.cast.id}" covers the face of ${names} and there is no room to move it aside in this ${shot} panel. Use different slots (e.g. "left" and "right"), a wider shot, or fewer figures.`,
      });
    }
  });

  // --- personal space: in close-range shots a face never touches another's body
  // (a beak on a rocket's nose reads as a kiss the story does not have)
  if (!groundShot && shot !== "insert") {
    // (a beak or a snout reaches well past the head circle)
    const faceBox = (p: Placement): Box => ({ x: p.head.x - p.r * 2.4, y: p.head.y - p.r * 0.8, w: p.r * 4.8, h: p.r * 1.6 });
    const core = (b: Box): Box => ({ x: b.x + b.w * 0.03, y: b.y + b.h * 0.05, w: b.w * 0.94, h: b.h * 0.9 });
    for (let j = 1; j < ordered.length; j += 1) {
      const f = ordered[j];
      const fr = framings.get(f.index);
      if (!fr || onColumn(f)) continue;
      for (const e of ordered.slice(0, j)) {
        const efr = framings.get(e.index);
        if (!efr || onColumn(e)) continue;
        // people in conversation are kept apart by face safety; this is for beaks and snouts
        if (f.cast.look.kind === "human" && e.cast.look.kind === "human") continue;
        const p = placementOf(f, framings.get(f.index) as Framing);
        const q = placementOf(e, efr);
        const touch = overlapArea(faceBox(p), core(q.body)) > 0 || overlapArea(faceBox(q), core(p.body)) > 0;
        if (!touch || covers(p, q) || covers(q, p)) continue;
        // step the later figure away from the earlier one, if its face stays in frame
        const dir = p.head.x >= q.head.x ? 1 : -1;
        let moved = false;
        for (let step = 1; step <= 6 && !moved; step += 1) {
          const dx = dir * step * p.r * 0.25;
          const trial = shifted(p, dx);
          if (!headInside(trial)) break;
          if (overlapArea(faceBox(trial), core(q.body)) === 0 && overlapArea(faceBox(q), core(trial.body)) === 0) {
            const cur = framings.get(f.index) as Framing;
            framings.set(f.index, { ...cur, originX: cur.originX + dx });
            moved = true;
          }
        }
      }
    }
  }

  // --- two small creatures side by side do not overlap (close-range) --------
  if (!groundShot && shot !== "insert") {
    const smalls = ordered.filter((f) => f.small && framings.has(f.index) && !onColumn(f) && !f.lying);
    for (let j = 1; j < smalls.length; j += 1) {
      const f = smalls[j];
      for (const e of smalls.slice(0, j)) {
        const fr = framings.get(f.index) as Framing;
        const efr = framings.get(e.index) as Framing;
        const p = placementOf(f, fr);
        const q = placementOf(e, efr);
        const ov = overlapArea(p.body, q.body);
        if (ov <= 0.15 * Math.min(boxArea(p.body), boxArea(q.body))) continue;
        // move them apart, half each, as far as their heads stay in frame
        const dir = p.head.x >= q.head.x ? 1 : -1;
        const need = dir > 0 ? q.body.x + q.body.w - p.body.x : p.body.x + p.body.w - q.body.x;
        const mine = clamp(dir * need * 0.5, box.x + p.r * 0.6 - p.head.x, box.x + box.w - p.r * 0.6 - p.head.x);
        const theirs = clamp(-dir * need * 0.5, box.x + q.r * 0.6 - q.head.x, box.x + box.w - q.r * 0.6 - q.head.x);
        framings.set(f.index, { ...fr, originX: fr.originX + mine });
        framings.set(e.index, { ...efr, originX: efr.originX + theirs });
      }
    }
  }

  // --- figures staged on other figures ----------------------------------------
  const resolved = new Set(independents.map((f) => f.index));
  const pending = infos.filter(isDependent);
  const between = /\bbetween\b/i.test(beat);
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
      let side: 1 | -1 = f.staging.part === "shoulder" && facingSide !== 0 ? (-facingSide as 1 | -1) : bySlot;
      const myHeadX = (f.mirror ? -a.head.x : a.head.x) * s;
      // feet ON the shoulder (not beyond it): the shoulder line is about 1.3-1.6
      // head radii out; the perched body may overlap the back of the head a little
      const shoulderHalf = Math.max(tp.r * 1.15, Math.min(tp.r * 1.55, ((ta.right - ta.left) / 2) * s * 0.9));
      const shoulderX = (sd: 1 | -1) => {
        // on the shoulder line, and never past the edge of the body (a 3/4 view is narrow on one side)
        const edge = sd > 0 ? tp.body.x + tp.body.w - tp.r * 0.3 : tp.body.x + tp.r * 0.3;
        const x = sd > 0 ? Math.min(tp.head.x + shoulderHalf, Math.max(edge, tp.head.x + tp.r)) : Math.max(tp.head.x - shoulderHalf, Math.min(edge, tp.head.x - tp.r));
        return sd > 0 ? Math.max(x, tp.head.x + tp.r * 0.25 - myLeft) : Math.min(x, tp.head.x - tp.r * 0.25 - myRight);
      };
      const feetX = (sd: 1 | -1) => {
        const tHalf = ((ta.right - ta.left) / 2) * s;
        return tfr.originX + sd * (tHalf * 0.8 + (sd > 0 ? -myLeft : myRight));
      };
      // the far side is out of frame: use the near side
      const inFrame = (x: number) => x + myHeadX > box.x + a.headRadius * s && x + myHeadX < box.x + box.w - a.headRadius * s;
      // (a profile keeps the bird on its back shoulder: the camera shifts to show it instead)
      if (f.staging.part === "shoulder" && facingSide === 0 && !inFrame(shoulderX(side)) && inFrame(shoulderX(-side as 1 | -1))) side = -side as 1 | -1;
      if ((f.staging.part === "feet" || f.staging.part === undefined) && !inFrame(feetX(side)) && inFrame(feetX(-side as 1 | -1))) side = -side as 1 | -1;
      let origin: Point;
      switch (f.staging.part) {
        case "shoulder": {
          // feet on the shoulder, the body clear of the head circle (thin tails may overlap a little)
          origin = { x: shoulderX(side), y: tfr.originY + ta.shoulders * s };
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
          // feet: on the same surface, beside (or between) the target's feet, inside the frame
          let x = between && onColumn(target) ? tfr.originX - myHeadX * 0.2 : feetX(side);
          const lo = box.x - myLeft + 4;
          const hi = box.x + box.w - myRight - 4;
          if (lo <= hi) x = clamp(x, lo, hi);
          origin = { x, y: tfr.originY };
        }
      }
      framings.set(f.index, { scale: s, originX: origin.x, originY: origin.y });
      resolved.add(f.index);
    }
  }

  // --- close-range: every head in frame, every speaker readable --------------
  if (!groundShot && shot !== "insert" && framings.size > 0) {
    const headOf = (f: FigureInfo) => placementOf(f, framings.get(f.index) as Framing);
    const visibleFigs = infos.filter((f) => framings.has(f.index) && !headCropped.has(f.index));
    /** Translate every framing by (dx, dy), and the environment-free column top with it. */
    const shiftAll = (dx: number, dy: number) => {
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
      for (const [k, fr] of framings) framings.set(k, { ...fr, originX: fr.originX + dx, originY: fr.originY + dy });
    };
    /**
     * Keep `must` heads fully inside the panel (with `nice` pulled in when that
     * costs no `must` head); with `zoomOut`, shrink the group about its centre
     * when the heads cannot fit side by side.
     */
    const fitHeads = (must: FigureInfo[], nice: FigureInfo[], zoomOut: boolean) => {
      if (must.length === 0) return;
      const bounds = (list: FigureInfo[]) => {
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (const f of list) {
          const p = headOf(f);
          x0 = Math.min(x0, p.head.x - p.r * 0.95);
          x1 = Math.max(x1, p.head.x + p.r * 0.95);
          y0 = Math.min(y0, p.head.y - p.r * 1.05);
          y1 = Math.max(y1, p.head.y + p.r * 1.1);
        }
        return { x0, x1, y0, y1 };
      };
      let b = bounds(must);
      if (zoomOut) {
        const k = Math.min(1, (box.w * 0.98) / Math.max(1, b.x1 - b.x0), (box.h * 0.98) / Math.max(1, b.y1 - b.y0));
        if (k < 0.999) {
          const c = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
          for (const [key, fr] of framings) framings.set(key, zoomAbout(fr, c, k));
          b = bounds(must);
        }
      }
      // translation window that keeps every must-head inside
      const dxLo = box.x - b.x0;
      const dxHi = box.x + box.w - b.x1;
      const dyLo = box.y - b.y0;
      const dyHi = box.y + box.h - b.y1;
      let dx = clamp(0, dxLo, dxHi);
      let dy = clamp(0, dyLo, dyHi);
      if (nice.length > 0) {
        const nb = bounds([...must, ...nice]);
        dx = clamp(clamp(0, box.x - nb.x0, box.x + box.w - nb.x1), dxLo, dxHi);
        dy = clamp(clamp(0, box.y - nb.y0, box.y + box.h - nb.y1), dyLo, dyHi);
      }
      shiftAll(dx, dy);
    };
    fitHeads(visibleFigs, [], true);
    // speakers reach the readable floor: push the camera in on the smallest one
    const talking = visibleFigs.filter((f) => speakers.has(f.cast.id));
    if (talking.length > 0) {
      const smallest = talking.reduce((a, b) => (headOf(b).r < headOf(a).r ? b : a));
      const r = headOf(smallest).r;
      if (r < SPEAKER_MIN_HEAD_RADIUS + 0.5) {
        const k = Math.min(3.5, (SPEAKER_MIN_HEAD_RADIUS + 0.5) / Math.max(0.5, r));
        const c = headOf(smallest).head;
        for (const [key, fr] of framings) framings.set(key, zoomAbout(fr, c, k));
        fitHeads(talking, visibleFigs.filter((f) => !talking.includes(f)), false);
      }
    }
    for (const f of visibleFigs) {
      const p = headOf(f);
      if (p.head.y + p.r < box.y || p.head.y - p.r > box.y + box.h || p.head.x + p.r < box.x || p.head.x - p.r > box.x + box.w) headCropped.add(f.index);
    }
    const mids = independents.filter((f) => depthOf(f.spec) === "mid" && framings.has(f.index));
    worldScale = framings.get((mids[0] ?? independents[0])?.index ?? -1)?.scale ?? worldScale;
  }

  // --- draw figures + props by depth ----------------------------------------
  const figures: FigurePlacement[] = [];
  const hatBoxes: Box[] = [];
  const handBoxes: Box[] = [];
  const propPlacements: PropPlacement[] = [];
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
  /** Scenery drawn right over the environment (the statue on an empty column). */
  let scenery = "";
  const sceneryObstacles: Box[] = [];
  const sceneryCast: string[] = [];

  // Draw order: back → mid → fore; a figure staged on another is drawn right after it.
  const layerOf = (f: FigureInfo): Depth => depthOf(rootOf(f).spec);
  const sequence: FigureInfo[] = [];
  const visit = (f: FigureInfo) => {
    if (sequence.includes(f)) return;
    sequence.push(f);
    for (const d of infos) if (d.staging.type === "figure" && d.staging.target === f.cast.id) visit(d);
  };
  drawOrder(independents).forEach(visit);
  for (const f of infos) if (!sequence.includes(f)) sequence.push(f);

  /** Page-space box of the prop a figure holds, at this framing (same maths as the drawing below). */
  const heldPropBox = (f: FigureInfo, held: HeldProp, at: Framing): Box | undefined => {
    const hand = f.probe.hand;
    if (!hand) return undefined;
    const prop = safeProp(held.prop, STROKE.figureOutline / at.scale, hashString(`${panel.id}|held|${f.index}`), idPrefix, held.tone);
    if (!prop) return undefined;
    const ox = hand.x - prop.grip.x;
    const oy = hand.y - prop.grip.y;
    const toPage = (pt: Point): Point => ({ x: at.originX + (f.mirror ? -pt.x : pt.x) * at.scale, y: at.originY + pt.y * at.scale });
    const c1 = toPage({ x: ox - prop.width / 2, y: oy - prop.height });
    const c2 = toPage({ x: ox + prop.width / 2, y: oy });
    return { x: Math.min(c1.x, c2.x), y: Math.min(c1.y, c2.y), w: Math.abs(c2.x - c1.x), h: Math.abs(c2.y - c1.y) };
  };

  // a held prop whose hand is out of frame (a medium shot cuts at the waist, a
  // slot at the panel edge): first slide the figure sideways so the prop is in
  // frame; if that cannot work, put the prop on the ground in frame, where it is seen
  // (a prop the story depends on is never drawn off the panel)
  for (const f of sequence) {
    let fr = framings.get(f.index);
    if (!fr || !f.held || !f.probe.hand) continue;
    const held = f.held;
    const inFrame = (at: Framing): number | undefined => {
      const pb = heldPropBox(f, held, at);
      return pb ? overlapArea(pb, box) / Math.max(1, boxArea(pb)) : undefined;
    };
    const frac = inFrame(fr);
    if (frac === undefined || frac >= HELD_PROP_MIN_INSIDE) continue;
    if (!isDependent(f)) {
      const pb = heldPropBox(f, held, fr)!;
      const room = 6;
      const dx = pb.x < box.x + room ? box.x + room - pb.x : pb.x + pb.w > box.x + box.w - room ? box.x + box.w - room - (pb.x + pb.w) : 0;
      if (dx !== 0) {
        const moved: Framing = { ...fr, originX: fr.originX + dx };
        const mp = placementOf(f, moved);
        const headIn = mp.head.x - mp.r > box.x - mp.r * 0.3 && mp.head.x + mp.r < box.x + box.w + mp.r * 0.3;
        const after = inFrame(moved);
        if (headIn && after !== undefined && after >= HELD_PROP_MIN_INSIDE) {
          framings.set(f.index, moved);
          fr = moved;
          continue;
        }
      }
    }
    const fx = fr.originX;
    const slot: Slot = fx < box.x + box.w * 0.28 ? "left" : fx < box.x + box.w * 0.44 ? "center_left" : fx < box.x + box.w * 0.56 ? "center" : fx < box.x + box.w * 0.72 ? "center_right" : "right";
    if (f.held.adopted && f.held.source) propPlan.ground.push(f.held.source);
    else propPlan.ground.push({ spec: { prop: held.prop, slot, depth: "fore", ...(held.tone ? { tone: held.tone } : {}) }, index: panel.props.length + f.index });
    issues.push({
      code: "HELD_PROP_OFF_FRAME",
      severity: "warning",
      path: ipath,
      message: `the ${held.prop} held by "${f.cast.id}" would be outside the frame of this ${shot} panel, so it is drawn in front of the figure. Use a wider shot, a slot nearer the centre or a "reach" pose to show it in the hand.`,
    });
    delete f.held;
  }

  for (const f of sequence) {
    const fr = framings.get(f.index);
    if (!fr) continue;
    const layer = layers[layerOf(f)];
    const headPx = f.probe.headRadius * fr.scale;
    const detail: FigurePlacement["detail"] = headPx >= LOD_FULL_RADIUS ? "full" : headPx >= LOD_REDUCED_RADIUS ? "reduced" : "silhouette";
    const lw = STROKE.figureOutline / fr.scale;
    const drawing = safeDraw(f.cast.look, f.spec, f.pose, lw, f.seed, idPrefix, detail, f.eyes);
    if (!drawing) continue;
    const frag = adoptScaled(drawing.svg, `f${f.index}`, fr.scale);
    defs.push(frag.defs);
    const a = drawing.anchors;
    const toPage = (pt: Point): Point => ({ x: fr.originX + (f.mirror ? -pt.x : pt.x) * fr.scale, y: fr.originY + pt.y * fr.scale });
    let held = "";
    if (f.held) {
      const prop = safeProp(f.held.prop, lw, hashString(`${panel.id}|held|${f.index}`), idPrefix, f.held.tone);
      if (prop) {
        const hand = a.hand ?? { x: a.right * 0.8, y: a.waist };
        const pf = adoptScaled(prop.svg, `h${f.index}`, fr.scale);
        defs.push(pf.defs);
        const ox = hand.x - prop.grip.x;
        const oy = hand.y - prop.grip.y;
        held = `<g transform="translate(${n(ox)} ${n(oy)})">${pf.body}</g>`;
        const c1 = toPage({ x: ox - prop.width / 2, y: oy - prop.height });
        const c2 = toPage({ x: ox + prop.width / 2, y: oy });
        const pb = { x: Math.min(c1.x, c2.x), y: Math.min(c1.y, c2.y), w: Math.abs(c2.x - c1.x), h: Math.abs(c2.y - c1.y) };
        propPlacements.push({ prop: f.held.prop, box: pb, key: propPlan.key.has(f.held.prop), heldBy: f.cast.id });
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
      const kind = seatKindFor(location?.environment) ?? "bench";
      // seats are drawn at adult size: scale them to this sitter's seat height
      const contact = seatContact(f.nominal);
      const m0 = contact / ADULT_SEAT_Y;
      const seat = safeSeat(kind, lw / Math.max(0.2, m0), hashString(`${panel.id}|seat|${f.index}`), idPrefix);
      if (seat) {
        const m = contact / seat.seatY;
        // a seat shows past the sitter's skirt or coat: at least a little wider than the body
        const bodyW = Math.max(1, drawing.anchors.right - drawing.anchors.left);
        const mx = seat.width > 0 ? clamp((bodyW * 1.2) / seat.width, m, m * 1.6) : m;
        const sf = adoptScaled(seat.svg, `st${f.index}`, fr.scale * m);
        defs.push(sf.defs);
        under += `<g transform="scale(${n4(mx)} ${n4(m)})">${sf.body}</g>`;
      }
    }
    if (ownColumn.has(f.index)) {
      // the shaft runs just past the panel's bottom edge (no far-off geometry)
      const shaftEnd = Math.max(40, (box.y + box.h - fr.originY) / fr.scale + 12);
      const col = adoptScaled(columnTop(lw, idPrefix, shaftEnd), `col${f.index}`, fr.scale);
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
    } else if (f.lying && !groundShot && f.staging.type === "ground") {
      // a lying figure close up rests on the ground: a band of earth under the body
      layer.push(groundBand(box, fr.originY, idPrefix));
    }
    const p = placementOf(f, fr);
    // a paper halo behind a speaker's head when the background is toned
    if (speakers.has(f.cast.id) && toned && !headCropped.has(f.index)) {
      if (!haloDefined) {
        defs.push(
          `<radialGradient id="${haloId}"><stop offset="0" stop-color="${PAPER}"/><stop offset="0.74" stop-color="${PAPER}"/><stop offset="1" stop-color="${PAPER}" stop-opacity="0"/></radialGradient>`,
        );
        haloDefined = true;
      }
      halos.push(`<circle cx="${n(p.head.x)}" cy="${n(p.head.y)}" r="${n(p.r * 1.5)}" fill="url(#${haloId})"/>`);
    }
    const grounded = groundShot && f.staging.type === "ground";
    const shadow = grounded && (!AIRBORNE_POSES.has(f.spec.pose) || f.lying || f.spec.pose === "fall") ? castShadow(fr, drawing.anchors, idPrefix, f.spec.pose === "fall" ? groundUnder(fr, groundModel) : fr.originY) : "";
    // (angle foreshortening would need two clipped copies of the drawing; resvg
    // can panic on clip groups next to far-off environment geometry, so the
    // angle is carried by the horizon, the baseline and a small scale instead)
    layer.push(`${shadow}<g transform="${transform}">${under}${frag.body}${held}${over}</g>`);
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
    } else if (look.kind !== "human" && look.kind !== "crowd" && !f.lying && a.head.y - a.headRadius - a.top > a.headRadius * 0.6) {
      // a creature's or object's crown above its face (a rocket's cap, a crest) is part of the face
      const hc = toPage(a.head);
      const hr = a.headRadius * fr.scale;
      const capH = (a.head.y - a.headRadius - a.top) * fr.scale;
      hatBoxes.push({ x: hc.x - hr * 1.1, y: hc.y - hr - capH, w: hr * 2.2, h: capH });
    }
    const hand = a.hand ? toPage(a.hand) : undefined;
    if (hand && GESTURE_POSES.has(f.pose)) {
      const hr = Math.max(6, a.headRadius * fr.scale * 0.75);
      handBoxes.push({ x: hand.x - hr, y: hand.y - hr, w: hr * 2, h: hr * 2 });
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
      pose: f.pose,
      ...(hand ? { hand } : {}),
      ...(headCropped.has(f.index) ? { headCropped: true } : {}),
    });
  }
  figures.sort((a, b) => a.figureIndex - b.figureIndex);

  // --- the location's statue on an empty column top (a fixed set piece) -------
  const setStatue = locationStatue(book.cast, location);
  const topAnchor = env.anchors?.statue_top;
  const crownAnchor = env.anchors?.statue_crown;
  if (
    setStatue &&
    topAnchor &&
    crownAnchor &&
    crownAnchor.y < topAnchor.y &&
    envFeatures.includes("statue_column") &&
    onColumnSet.size === 0 &&
    !panel.figures.some((f) => f.character === setStatue.id) &&
    !statueGone(beat) &&
    topAnchor.x > box.x - 10 &&
    topAnchor.x < box.x + box.w + 10 &&
    // at least a third of the statue in frame (not a pair of feet under the top border)
    topAnchor.y - box.y > (topAnchor.y - crownAnchor.y) * 0.35 &&
    topAnchor.y < box.y + box.h + 10
  ) {
    const variant = input.pageVariants?.[setStatue.id];
    const cast = castWithVariant(setStatue, variant);
    const spec: FigureSpec = { character: cast.id, pose: "stand", expression: "neutral", facing: "front", slot: "center" };
    const seed = hashString(`cast:${cast.id}`);
    const probe = safeDraw(cast.look, spec, "stand", 1, seed, idPrefix, "full", variant?.eyes);
    if (probe) {
      const height = framingHeight(safeNominal(cast.look), probe.anchors, false);
      const scale = (topAnchor.y - crownAnchor.y) / Math.max(1, height);
      const headPx = probe.anchors.headRadius * scale;
      const detail: FigurePlacement["detail"] = headPx >= LOD_FULL_RADIUS ? "full" : headPx >= LOD_REDUCED_RADIUS ? "reduced" : "silhouette";
      const drawing = safeDraw(cast.look, spec, "stand", STROKE.figureOutline / scale, seed, idPrefix, detail, variant?.eyes);
      if (drawing) {
        const frag = adoptScaled(drawing.svg, "set", scale);
        defs.push(frag.defs);
        scenery = `<g transform="translate(${n(topAnchor.x)} ${n(topAnchor.y)}) scale(${n4(scale)})">${frag.body}</g>`;
        sceneryCast.push(cast.id);
        const a = drawing.anchors;
        sceneryObstacles.push({ x: topAnchor.x + a.left * scale, y: topAnchor.y + a.top * scale, w: (a.right - a.left) * scale, h: -a.top * scale });
      }
    }
  }

  // staged figures must not cover anyone's face either (warn; their place is fixed)
  for (const f of infos.filter(isDependent)) {
    const fr = framings.get(f.index);
    if (!fr) continue;
    const p = placementOf(f, fr);
    for (const e of infos) {
      if (e === f || headCropped.has(e.index)) continue;
      const efr = framings.get(e.index);
      if (!efr) continue;
      if (covers(p, placementOf(e, efr), 0.3)) {
        const automatic = (f.staging as { auto?: boolean }).auto === true;
        issues.push({
          code: "FACE_COVERED",
          // The composer's own automatic perch is a warning; a writer-staged one is an error.
          severity: automatic ? "warning" : "error",
          path: ipath,
          message: `"${f.cast.id}" (staged on "${(f.staging as { target: string }).target}") covers the face of "${e.cast.id}". Use another "part" (e.g. "feet" or the other shoulder) or another shot.`,
        });
        break;
      }
    }
  }

  // speakers must be big enough to read as the speaker (a rejecting error)
  for (const fp of figures) {
    if (!speakers.has(fp.character) || fp.headCropped) continue;
    if (fp.headRadius < SPEAKER_MIN_HEAD_RADIUS) {
      issues.push({
        code: "SPEAKER_TOO_SMALL",
        severity: "error",
        path: ipath,
        message: `speaker "${fp.character}" is drawn with a head radius of ${Math.round(fp.headRadius)} units (under ${SPEAKER_MIN_HEAD_RADIUS}) in this ${shot} shot, too small to read as the speaker on a phone. Use a medium or close shot for dialogue (a full shot for a person), put a small creature that speaks at depth "fore", or move the line to a caption.`,
      });
    }
  }
  // figures the spec asked for must be seen
  for (const fp of figures) {
    const f = infos.find((g) => g.index === fp.figureIndex);
    if (!f || (fp.headCropped === true && onColumnSet.has(f.index))) continue;
    const b = fp.body;
    const inside = overlapArea(b, box) / Math.max(1, boxArea(b));
    const headOut = fp.head.y + fp.headRadius < box.y || fp.head.y - fp.headRadius > box.y + box.h || fp.head.x + fp.headRadius < box.x || fp.head.x - fp.headRadius > box.x + box.w;
    if (inside < 0.02) {
      issues.push({ code: "FIGURE_CLIPPED", severity: "warning", path: ipath, message: `"${fp.character}" ends up outside the frame of this ${shot} panel and is not seen. Use another slot, "on" part or shot.` });
    } else if (headOut && shot !== "extreme_close") {
      issues.push({ code: "FIGURE_HEAD_CLIPPED", severity: "warning", path: ipath, message: `the head of "${fp.character}" falls outside the frame of this ${shot} panel. Use a wider shot or another slot so the face is seen.` });
    } else if (groundShot && inside < 0.7) {
      issues.push({ code: "FIGURE_CLIPPED", severity: "warning", path: ipath, message: `${Math.round((1 - inside) * 100)}% of "${fp.character}" falls outside the frame of this ${shot} panel. Use a slot nearer the centre or a wider shot.` });
    }
  }
  // a figure held on another must read (an establishing shot cannot show a hand-off)
  if (groundShot) {
    for (const fp of figures) {
      const f = infos.find((g) => g.index === fp.figureIndex);
      if (!f || f.staging.type !== "figure" || f.staging.part === "feet") continue;
      if (fp.headRadius < DEPENDENT_MIN_HEAD_RADIUS * 0.8) {
        issues.push({
          code: "SUBJECT_TOO_SMALL",
          severity: "warning",
          path: ipath,
          message: `"${fp.character}" on the ${f.staging.part} of "${f.staging.target}" is drawn with a head radius of ${Math.round(fp.headRadius)} units in this ${shot} shot and will not read. Use a full or medium shot for the two of them.`,
        });
      }
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
  const obstacles: Box[] = [...hatBoxes, ...handBoxes, ...sceneryObstacles];
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
          const pb = { x: ox - pw / 2, y: oy - ph, w: pw, h: ph };
          obstacles.push(pb);
          propPlacements.push({ prop: propId, box: pb, key: true });
        }
      }
    }
  } else {
    // props are sized against the figures: never bigger than the tallest one drawn
    const tallest = figures.reduce((m, f) => Math.max(m, f.body.h), 0);
    for (const { spec: p, index: i } of propPlan.ground) {
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
      if (tallest > 0) scale = Math.min(scale, (tallest * 1.05) / Math.max(1, nominal));
      // the beat lays it on the table: on the table top
      let onTable: Point | undefined;
      if (groundShot && env.anchors?.table && propPlan.key.has(p.prop) && /\b(?:on|onto|upon)\s+(?:the|a|her|his|their)\s+table\b/i.test(beat)) {
        onTable = env.anchors.table;
        base = onTable.y;
      }
      const key = propPlan.key.has(p.prop);
      const drawn = safeProp(p.prop, STROKE.figureOutline / scale, hashString(`${panel.id}|prop|${i}`), idPrefix, p.tone);
      if (!drawn) continue;
      const w = drawn.width * scale;
      const h = drawn.height * scale;
      let x = onTable ? onTable.x : slotX(p.slot, box, rtl);
      if (!groundShot) {
        // close-range: step a prop out from behind a figure's body (never hidden);
        // a key prop, drawn in front, steps off the faces instead
        const hidden = (xx: number) => {
          const pb = { x: xx - w / 2, y: base - h, w, h };
          const body = figures.reduce((sum, f) => sum + overlapArea(pb, f.body), 0) / Math.max(1, w * h);
          const face = figures.reduce((sum, f) => sum + overlapArea(pb, { x: f.head.x - f.headRadius, y: f.head.y - f.headRadius, w: f.headRadius * 2, h: f.headRadius * 2 }), 0) / Math.max(1, w * h);
          return key ? face * 3 + body * 0.2 : body;
        };
        if (hidden(x) > (key ? 0.05 : 0.45)) {
          let best = x;
          let bestH = hidden(x);
          for (let step = 1; step <= 12; step += 1) {
            for (const dir of [1, -1]) {
              const xx = clamp(x + dir * step * box.w * 0.05, box.x + w / 2, box.x + box.w - w / 2);
              const hv = hidden(xx) + step * 0.01;
              if (hv < bestH - 0.05) {
                bestH = hv;
                best = xx;
              }
            }
          }
          x = best;
        }
      }
      const pf = adoptScaled(drawn.svg, `pr${i}`, scale);
      defs.push(pf.defs);
      const g = `<g transform="translate(${n(x)} ${n(base)}) scale(${n4(scale)})">${pf.body}</g>`;
      // the object of the beat is drawn over the figures (not behind an arm or a leg)
      if (key) layers.fore.push(g);
      else layers[d].unshift(g);
      const pb = { x: x - w / 2, y: base - h, w, h };
      propPlacements.push({ prop: p.prop, box: pb, key });
      const inFrame = overlapArea(pb, box) / Math.max(1, boxArea(pb));
      const behind = key ? 0 : figures.reduce((sum, f) => sum + overlapArea(pb, f.body), 0) / Math.max(1, boxArea(pb));
      if (inFrame < 0.4 || behind > 0.75) {
        issues.push({
          code: "PROP_HIDDEN",
          severity: "warning",
          path: `${ipath} prop ${i}`,
          message: `prop "${p.prop}" is ${inFrame < 0.4 ? "mostly outside the frame" : "hidden behind a figure"} in this ${shot} panel. Use another slot or depth, or mention it in the beat so it is drawn in front.`,
        });
      }
    }
  }

  // --- where the panel's sound comes from (for SFX) ---------------------------
  let sfxSource: ComposedPanel["sfxSource"];
  for (const pose of NOISY_POSES) {
    const fp = figures.find((f) => f.pose === pose || infos.find((g) => g.index === f.figureIndex)?.spec.pose === pose);
    if (fp) {
      sfxSource = { point: { x: fp.body.x + fp.body.w / 2, y: fp.body.y + fp.body.h / 2 }, box: fp.body };
      break;
    }
  }
  if (!sfxSource) {
    const kp = propPlacements.find((p) => p.key);
    if (kp) sfxSource = { point: { x: kp.box.x + kp.box.w / 2, y: kp.box.y + kp.box.h / 2 }, box: kp.box };
  }
  const keepOut = propPlacements.filter((p) => p.key).map((p) => p.box);

  // --- fx -----------------------------------------------------------------
  const heads = figures.filter((f) => !f.headCropped).map((f) => ({ point: f.head, radius: f.headRadius }));
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
    scenery,
    underFx.join(""),
    halos.join(""),
    layers.back.join(""),
    layers.mid.join(""),
    layers.fore.join(""),
    insertSvg,
  ].join("");
  let overSvg = overFx.join("");
  let placedFigures = figures;
  let placedProps = propPlacements;
  let placedKeepOut = keepOut;
  let placedObstacles = obstacles;
  let placedSource = sfxSource;
  if (dutch) {
    const rot = `rotate(${dutchDeg} ${n(cx)} ${n(cy)})`;
    scene = `<path d="${polyPath(polygon)}" fill="${PAPER}"/><g transform="${rot}">${scene}</g>`;
    overSvg = overSvg ? `<g transform="${rot}">${overSvg}</g>` : "";
    const rp = (p: Point) => rotatePoint(p, { x: cx, y: cy }, dutchDeg);
    const rb = (b: Box): Box => {
      const corners = [
        { x: b.x, y: b.y },
        { x: b.x + b.w, y: b.y },
        { x: b.x + b.w, y: b.y + b.h },
        { x: b.x, y: b.y + b.h },
      ].map(rp);
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    };
    placedFigures = figures.map((f) => ({ ...f, head: rp(f.head), mouth: rp(f.mouth), body: rb(f.body), ...(f.hand ? { hand: rp(f.hand) } : {}) }));
    placedProps = propPlacements.map((p) => ({ ...p, box: rb(p.box) }));
    placedKeepOut = keepOut.map(rb);
    placedObstacles = obstacles.map(rb);
    placedSource = sfxSource ? { point: rp(sfxSource.point), box: rb(sfxSource.box) } : undefined;
    focus = rp(focus);
  }
  return {
    content: scene + overSvg,
    defs: defs.join(""),
    clipId,
    figures: placedFigures,
    focus,
    obstacles: placedObstacles,
    keepOut: placedKeepOut,
    props: placedProps,
    ...(placedSource ? { sfxSource: placedSource } : {}),
    scenery: sceneryCast,
    environment: envKind,
    issues,
  };
}

/**
 * The top of a statue column in figure space (a statue's feet at y=0): a
 * platform slab, a capital and a shaft that runs down to `shaftEnd` (just
 * past the panel's bottom edge). Used when the environment's own column top
 * is out of frame, and when the camera is up on the column top.
 */
function columnTop(lw: number, idPrefix: string, shaftEnd = 900): string {
  const stone = toneFill("stone", idPrefix);
  const st = `stroke="${INK}" stroke-width="${n(lw * 1.1)}" stroke-linejoin="round"`;
  const end = n(Math.max(30, shaftEnd));
  let s = "";
  // shaft with two flutes
  s += `<path d="M-26 22V${end}H26V22Z" fill="${stone}" ${st}/>`;
  s += `<path d="M-9 26V${end}M9 26V${end}" fill="none" stroke="${INK}" stroke-width="${n(lw * 0.6)}"/>`;
  // capital and platform slab (with a lip)
  s += `<path d="M-40 10L-30 22H30L40 10Z" fill="#e4e4e0" ${st}/>`;
  s += `<path d="M-62 0H62V10H-62Z" fill="#e4e4e0" ${st}/>`;
  s += `<path d="M-58 -4H58V0H-58Z" fill="${PAPER}" ${st}/>`;
  return s;
}

/**
 * Ground under a lying figure in a close-range shot (no set of its own is in
 * view): a flat light band from the body's resting line to the panel bottom,
 * with a firm top edge and a few tufts, so the body lies on something.
 */
function groundBand(box: Box, y: number, idPrefix: string): string {
  const top = clamp(y, box.y + box.h * 0.35, box.y + box.h);
  if (top >= box.y + box.h - 2) return "";
  const x0 = box.x - 4;
  const x1 = box.x + box.w + 4;
  const bottom = box.y + box.h + 4;
  let s = `<path d="M${n(x0)} ${n(top)}H${n(x1)}V${n(bottom)}H${n(x0)}Z" fill="${toneFill("light", idPrefix)}"/>`;
  s += `<path d="M${n(x0)} ${n(top)}H${n(x1)}" fill="none" stroke="${INK}" stroke-width="${n(STROKE.environment * 1.2)}"/>`;
  const rand = mulberry32(hashString(`${n(box.x)}|${n(box.y)}|band`));
  let tufts = "";
  const count = Math.max(3, Math.round(box.w / 70));
  for (let i = 0; i < count; i += 1) {
    const tx = box.x + ((i + 0.3 + rand() * 0.4) / count) * box.w;
    const ty = top + 8 + rand() * Math.max(4, (bottom - top) * 0.6);
    if (ty > box.y + box.h - 4) continue;
    tufts += `M${n(tx - 5)} ${n(ty)}L${n(tx - 2)} ${n(ty - 7)}M${n(tx)} ${n(ty)}L${n(tx + 1)} ${n(ty - 9)}M${n(tx + 4)} ${n(ty)}L${n(tx + 6)} ${n(ty - 6)}`;
  }
  if (tufts) s += `<path d="${tufts}" fill="none" stroke="${INK}" stroke-width="${n(STROKE.environment * 0.7)}" stroke-linecap="round"/>`;
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

/** Where the ground is under a lifted figure (its feet line before the lift). */
function groundUnder(fr: Framing, gm: { horizon: number; feet: number; scale: number } | undefined): number {
  if (!gm) return fr.originY;
  const rho = fr.scale / Math.max(1e-6, gm.scale);
  return Math.max(fr.originY, gm.horizon + (gm.feet - gm.horizon) * rho);
}

function castShadow(fr: Framing, a: FigureAnchors, idPrefix: string, y = fr.originY): string {
  const half = Math.max(4, ((a.right - a.left) / 2) * fr.scale * 0.95);
  const ry = Math.max(2, half * 0.16);
  return `<ellipse cx="${n(fr.originX)}" cy="${n(y)}" rx="${n(half)}" ry="${n(ry)}" fill="${toneFill("dots", idPrefix)}"/>`;
}

function safeDraw(
  look: CharacterLook,
  spec: FigureSpec,
  pose: Pose,
  lineWidth: number,
  seed: number,
  idPrefix: string,
  detail: FigureRequest["detail"] = "full",
  eyes?: EyeState,
): FigureDrawing | undefined {
  try {
    const d = rig.draw(
      { look, pose, expression: spec.expression, facing: spec.facing, lineWidth, seed, detail, rim: true, ...(eyes ? { eyes } : {}) },
      ctxFor(idPrefix, seed),
    );
    if (!validAnchors(d.anchors)) return undefined;
    return d;
  } catch {
    return undefined;
  }
}

function safePoses(look: CharacterLook): readonly Pose[] {
  try {
    return rig.supportedPoses(look);
  } catch {
    return [];
  }
}

function safeNominal(look: CharacterLook): number {
  try {
    const v = rig.nominalHeight(look);
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
