/**
 * Rig dispatcher: routes a CharacterLook to its kind's rig. Kind rigs live in
 * sibling files and may be replaced independently.
 */
import type { CharacterLook, Expression, Facing, Point, Pose } from "../contracts.js";
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
  return { svg: `<g transform="${m}">${d.svg}</g>`, anchors };
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
  if (look.kind === "human" && pose === "sit") return humanSeatContact(look, facing, seed, expression);
  return { x: 0, y: 0 };
}

export const rig: RigModule = {
  supportedPoses: (look: CharacterLook): readonly Pose[] => rigFor(look).supportedPoses(look),
  supportedExpressions: (look: CharacterLook): readonly Expression[] => rigFor(look).supportedExpressions(look),
  nominalHeight: (look: CharacterLook): number => rigFor(look).nominalHeight(look),
  /**
   * Draw through the kind's rig, add creature acting, and compact the path
   * data (relative commands on a grid of 0.01 figure units, 0.1 when the
   * figure is drawn at or below page scale).
   */
  draw: (request: FigureRequest, ctx: DrawContext): FigureDrawing => {
    const d = actCreature(rigFor(request.look).draw(request, ctx), request);
    const dec = request.lineWidth >= STROKE.figureOutline ? 1 : 2;
    const svg = request.pose === "lie" ? contactShadow(d.anchors, request.lineWidth, ctx.idPrefix) + d.svg : d.svg;
    return { svg: compactSvg(svg, dec), anchors: d.anchors };
  },
};
