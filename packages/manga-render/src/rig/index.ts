/**
 * Rig dispatcher: routes a CharacterLook to its kind's rig. Kind rigs live in
 * sibling files and may be replaced independently.
 */
import { ARCHETYPE_SPECIES, LOOK_SCALE_MAX, LOOK_SCALE_MIN, type CharacterLook, type Expression, type Facing, type Point, type Pose } from "../contracts.js";
import type { DrawContext, FigureAnchors, FigureDrawing, FigureRequest, RigModule } from "../internal.js";
import { INK, STROKE, toneFill } from "../style.js";
import { n } from "../svg.js";
import { compactSvg } from "../env/compact.js";
import { humanSeatContact } from "./human/draw.js";
import type { KindRig } from "./kind.js";
import { humanRig } from "./human.js";
import { crowdRig } from "./crowd.js";
import { birdRig } from "./bird.js";
import { animalRig } from "./animal.js";
import { insectRig } from "./insect.js";
import { objectRig } from "./object.js";
import { plantRig } from "./plant.js";
import { spiritRig } from "./spirit.js";
import { emblemRig } from "./emblem.js";

const RIGS: Record<CharacterLook["kind"], KindRig> = {
  human: humanRig as KindRig,
  crowd: crowdRig as KindRig,
  bird: birdRig as KindRig,
  animal: animalRig as KindRig,
  insect: insectRig as KindRig,
  object: objectRig as KindRig,
  plant: plantRig as KindRig,
  spirit: spiritRig as KindRig,
  emblem: emblemRig as KindRig,
};

function rigFor(look: CharacterLook): KindRig {
  const rig = RIGS[look.kind];
  if (!rig) throw new Error(`no rig for look kind ${String((look as { kind?: unknown }).kind)}`);
  return rig;
}

/**
 * Creature acting (craft P1-9): a small whole-body lean by expression for
 * non-human kinds — forward when angry or sad, back when afraid or surprised —
 * plus a slump (sad, tired) or a stretch (surprised, afraid). Side views only
 * for the lean; the pivot is the leading foot so nothing dips below ground.
 * Degrees, + = forward (toward the facing).
 */
const CREATURE_LEAN: Partial<Record<Expression, number>> = {
  sad: 5,
  cry: 6,
  tired: 6,
  asleep: 4,
  angry: 5,
  shout: 4,
  pain: 4,
  afraid: -7,
  surprised: -5,
  laugh: -3,
  happy: -2,
  smug: -3,
  determined: -2,
};
const CREATURE_SQUASH: Partial<Record<Expression, number>> = {
  sad: 0.96,
  cry: 0.96,
  tired: 0.95,
  asleep: 0.95,
  surprised: 1.04,
  afraid: 1.03,
  laugh: 1.02,
};

/** Kinds whose rig has no skeleton of its own for body language. */
const LEANERS = new Set<CharacterLook["kind"]>(["bird", "animal", "insect", "object", "plant", "spirit", "emblem"]);

function actCreature(d: FigureDrawing, request: FigureRequest): FigureDrawing {
  if (!LEANERS.has(request.look.kind)) return d;
  const side = request.facing === "right" || request.facing === "left";
  const k = request.look.kind === "plant" ? 0.5 : 1;
  const deg = side ? (CREATURE_LEAN[request.expression] ?? 0) * k : 0;
  const sy = CREATURE_SQUASH[request.expression] ?? 1;
  if (deg === 0 && sy === 1) return d;
  const a = d.anchors;
  const sx = 1 / Math.sqrt(sy);
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  // forward lean tips over the front foot, backward lean over the back foot
  const px = deg > 0 ? a.right * sx : deg < 0 ? a.left * sx : 0;
  const map = (p: Point): Point => {
    const x = p.x * sx - px;
    const y = p.y * sy;
    return { x: px + x * c - y * s, y: x * s + y * c };
  };
  const corners = [map({ x: a.left, y: a.top }), map({ x: a.right, y: a.top }), map({ x: a.left, y: 0 }), map({ x: a.right, y: 0 })];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const lift = Math.max(0, ...ys);
  const up = (p: Point): Point => ({ x: p.x, y: p.y - lift });
  const anchors: FigureAnchors = {
    head: up(map(a.head)),
    headRadius: a.headRadius * Math.sqrt(sx * sy),
    mouth: up(map(a.mouth)),
    ...(a.hand ? { hand: up(map(a.hand)) } : {}),
    top: Math.min(...ys) - lift,
    left: Math.min(...xs),
    right: Math.max(...xs),
    waist: up(map({ x: (a.left + a.right) / 2, y: a.waist })).y,
    shoulders: up(map({ x: (a.left + a.right) / 2, y: a.shoulders })).y,
  };
  // matrix of: translate(0,-lift) · translate(px,0) · rotate(t) · translate(-px,0) · scale(sx,sy)
  const e = px - px * c;
  const f = -px * s - lift;
  const m = `matrix(${n4(c * sx)} ${n4(s * sx)} ${n4(-s * sy)} ${n4(c * sy)} ${n(e)} ${n(f)})`;
  return { svg: `<g transform="${m}">${d.svg}</g>`, anchors, ...(d.blooms !== undefined ? { blooms: d.blooms } : {}) };
}

/**
 * A lying figure rests ON something: a flat screentone shadow along its
 * whole length at the ground line and a short ground stroke under it, so it
 * never floats against a plain close-up backdrop (the composer casts no
 * shadow for airborne poses, and lying counts as one).
 */
function contactShadow(a: FigureAnchors, lineWidth: number, idPrefix: string): string {
  const w = a.right - a.left;
  if (!(w > 0)) return "";
  const cx = (a.left + a.right) / 2;
  const rx = w * 0.52;
  const ry = Math.max(lineWidth * 1.2, w * 0.045);
  const g0 = a.left - w * 0.06;
  const g1 = a.right + w * 0.06;
  return (
    `<ellipse cx="${n(cx)}" cy="${n(ry * 0.25)}" rx="${n(rx)}" ry="${n(ry)}" fill="${toneFill("dots", idPrefix)}"/>` +
    `<path d="M${n(g0)} ${n(ry * 0.9)}L${n(g1)} ${n(ry * 0.9)}" fill="none" stroke="${INK}" stroke-width="${n(lineWidth * 0.5)}" stroke-linecap="round"/>`
  );
}

function n4(v: number): string {
  const r = Math.round(v * 10000) / 10000;
  return Object.is(r, -0) ? "0" : String(r);
}

/**
 * Figure-space point a figure sitting in `pose` rests on (feet on y=0). For a
 * sitting human it is the underside of the pelvis/thighs — put a seat's
 * surface (props.seat → seatY) there, scaled by `contact.y / seatY`; for any
 * other pose or kind it is the ground point {0, 0}.
 */
export function seatContact(look: CharacterLook, pose: Pose, facing: Facing, seed: number, expression: Expression = "neutral"): Point {
  if (look.kind === "human" && pose === "sit") {
    const c = humanSeatContact(look, facing, seed, expression);
    const k = drawFactor(look);
    return k === 1 ? c : { x: c.x * k, y: c.y * k };
  }
  return { x: 0, y: 0 };
}

/** Smallest scale that is drawn (v0.3 Gate 1 fix A2): a smaller applied scale is drawn at this value. */
export const LOOK_SCALE_FLOOR = 0.12;

/** What the renderer does with a look's `scale` (v0.3 Gate 1 fix A2, D29). */
export interface LookScaleResolution {
  /** The scale that is drawn; absent when the look keeps its usual size. */
  applied?: number;
  /** The look has a scale that the renderer ignores (a named species, or a person of normal size or bigger). */
  ignored: boolean;
  /** The scale was smaller than LOOK_SCALE_FLOOR and is drawn at the floor. */
  floored: boolean;
}

/**
 * `look.scale` is the size of a STAND-IN, not a real-world size. It applies only to
 * (a) the six archetype species (quad_small, quad_medium, quad_large, long_low, swimmer, bird_tall) and
 * (b) a human, and then only to make the person smaller (scale below 1; a bigger person uses `height: giant`).
 * Every other look keeps its readable nominal size and the scale is ignored. An applied scale below
 * LOOK_SCALE_FLOOR is drawn at the floor, so a stand-in is never a speck. The value is clamped to the
 * allowed range first (validation reports a bad value).
 */
export function resolveLookScale(look: CharacterLook): LookScaleResolution {
  const v = (look as { scale?: unknown }).scale;
  if (typeof v !== "number" || !Number.isFinite(v)) return { ignored: false, floored: false };
  const s = Math.min(LOOK_SCALE_MAX, Math.max(LOOK_SCALE_MIN, v));
  const species = (look as { species?: unknown }).species;
  const archetype = (look.kind === "animal" || look.kind === "bird") && typeof species === "string" && (ARCHETYPE_SPECIES as readonly string[]).includes(species);
  const smallPerson = look.kind === "human" && s < 1;
  if (!archetype && !smallPerson) return { ignored: true, floored: false };
  if (s < LOOK_SCALE_FLOOR) return { applied: LOOK_SCALE_FLOOR, ignored: false, floored: true };
  return { applied: s, ignored: false, floored: false };
}

function lookScale(look: CharacterLook): number | undefined {
  return resolveLookScale(look).applied;
}

function targetHeight(look: CharacterLook): number {
  const s = lookScale(look);
  return s !== undefined ? 100 * s : rigFor(look).nominalHeight(look);
}

/** Factor from the height the rig draws at to the height the look has (1 for every look without scale or neutral reuse). */
function drawFactor(look: CharacterLook): number {
  const r = rigFor(look);
  const native = r.nativeHeight ? r.nativeHeight(look) : r.nominalHeight(look);
  const k = targetHeight(look) / native;
  return Number.isFinite(k) && k > 0 && Math.abs(k - 1) > 1e-9 ? k : 1;
}

function scaleDrawing(d: FigureDrawing, k: number): FigureDrawing {
  const a = d.anchors;
  const p = (q: Point): Point => ({ x: q.x * k, y: q.y * k });
  const anchors: FigureAnchors = {
    head: p(a.head),
    headRadius: a.headRadius * k,
    mouth: p(a.mouth),
    ...(a.hand ? { hand: p(a.hand) } : {}),
    top: a.top * k,
    left: a.left * k,
    right: a.right * k,
    waist: a.waist * k,
    shoulders: a.shoulders * k,
  };
  return { ...d, svg: `<g transform="scale(${n4(k)})">${d.svg}</g>`, anchors };
}

export const rig: RigModule = {
  supportedPoses: (look: CharacterLook): readonly Pose[] => rigFor(look).supportedPoses(look),
  supportedExpressions: (look: CharacterLook): readonly Expression[] => rigFor(look).supportedExpressions(look),
  nominalHeight: (look: CharacterLook): number => targetHeight(look),
  /**
   * Draw through the kind's rig, add creature acting, and compact the path
   * data (relative commands on a grid of 0.01 figure units, 0.1 when the
   * figure is drawn at or below page scale). A look with `scale` (and a neutral
   * long_low or swimmer) is drawn at its own size and then scaled, with the line
   * width divided by the factor so the outline keeps its weight.
   */
  draw: (request: FigureRequest, ctx: DrawContext): FigureDrawing => {
    const k = drawFactor(request.look);
    const lineWidth = request.lineWidth / k;
    const inner: FigureRequest = k === 1 ? request : { ...request, lineWidth };
    const d = actCreature(rigFor(request.look).draw(inner, ctx), request);
    const dec = lineWidth >= STROKE.figureOutline ? 1 : 2;
    const svg = request.pose === "lie" ? contactShadow(d.anchors, lineWidth, ctx.idPrefix) + d.svg : d.svg;
    const out: FigureDrawing = { svg: compactSvg(svg, dec), anchors: d.anchors, ...(d.blooms !== undefined ? { blooms: d.blooms } : {}), ...(d.members !== undefined ? { members: d.members } : {}) };
    return k === 1 ? out : scaleDrawing(out, k);
  },
};
