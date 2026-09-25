/**
 * Expression faces shared by every non-human rig. A face is eyes + brows +
 * mouth (or a beak/muzzle drawn by the rig using `EXPR[e].open/curve`).
 *
 * Eyes are cut by lid lines (clamping sampled ellipse points to a half
 * plane), so one mechanism gives angry, sad, smug, tired and happy eyes.
 * Everything is sized from the eye radius so faces scale with the body.
 */
import type { Expression, Point } from "../../contracts.js";
import { EXPRESSIONS } from "../../contracts.js";
import { n, polyPath } from "../../svg.js";
import {
  INK,
  PAPER,
  P,
  type Pen,
  clampAbove,
  clampBelow,
  dropD,
  ellipsePts,
  heartD,
  lerp,
  lineD,
  quadD,
  rotP,
  curveD,
  blobD,
} from "./common.js";
import { toneFill } from "../../style.js";

export type EyeKind =
  | "open"
  | "wide"
  | "narrow"
  | "firm"
  | "half"
  | "sad"
  | "smile"
  | "soft"
  | "arcUp"
  | "arcDown"
  | "squeeze"
  | "heart";

export type MouthKind =
  | "flat"
  | "small"
  | "smile"
  | "grin"
  | "frown"
  | "o"
  | "shout"
  | "wavy"
  | "smirk"
  | "grit"
  | "wail"
  | "talk"
  | "pout"
  | "blow";

export interface ExprLook {
  eye: EyeKind;
  /** Pupil look direction, in units of the eye radius (-1..1). */
  look: [number, number];
  /** Brow tilt: + inner end down (angry), - inner end up (sad). */
  tilt: number;
  /** Brow raise in eye radii (+ up). */
  raise: number;
  /** Near brow extra raise (thinking / smug). */
  asym: number;
  mouth: MouthKind;
  /** Beak / muzzle: how open (0..1) and corner curve (-1 frown .. 1 smile). */
  open: number;
  curve: number;
  tears?: boolean;
  sweat?: boolean;
  blush?: boolean;
  /** Small pupils (fear, surprise). */
  pin?: boolean;
}

export const EXPR: Record<Expression, ExprLook> = {
  neutral: { eye: "open", look: [0.15, 0], tilt: 0, raise: 0, asym: 0, mouth: "flat", open: 0, curve: 0 },
  happy: { eye: "smile", look: [0.1, 0], tilt: -0.15, raise: 0.25, asym: 0, mouth: "smile", open: 0.15, curve: 1 },
  laugh: { eye: "arcUp", look: [0, 0], tilt: -0.25, raise: 0.4, asym: 0, mouth: "grin", open: 0.8, curve: 1 },
  gentle: { eye: "soft", look: [0.1, 0.1], tilt: -0.3, raise: 0.1, asym: 0, mouth: "small", open: 0, curve: 0.6, blush: true },
  sad: { eye: "sad", look: [0, 0.35], tilt: -0.9, raise: 0.15, asym: 0, mouth: "frown", open: 0, curve: -1 },
  cry: { eye: "arcDown", look: [0, 0], tilt: -1, raise: 0.2, asym: 0, mouth: "wail", open: 0.7, curve: -1, tears: true },
  angry: { eye: "narrow", look: [0.2, 0], tilt: 1.1, raise: -0.15, asym: 0, mouth: "grit", open: 0.3, curve: -0.8 },
  shout: { eye: "wide", look: [0.2, 0], tilt: 1.1, raise: 0, asym: 0, mouth: "shout", open: 1, curve: -0.3 },
  surprised: { eye: "wide", look: [0, 0], tilt: -0.25, raise: 0.9, asym: 0, mouth: "o", open: 0.6, curve: 0, pin: true },
  afraid: { eye: "wide", look: [-0.25, 0.1], tilt: -0.95, raise: 0.55, asym: 0, mouth: "wavy", open: 0.35, curve: -0.6, sweat: true, pin: true },
  determined: { eye: "firm", look: [0.25, 0], tilt: 0.65, raise: -0.2, asym: 0, mouth: "flat", open: 0, curve: -0.35 },
  thinking: { eye: "open", look: [0.45, -0.55], tilt: 0.25, raise: 0.1, asym: 0.55, mouth: "pout", open: 0, curve: -0.2 },
  worried: { eye: "open", look: [-0.15, 0.2], tilt: -0.8, raise: 0.3, asym: 0, mouth: "wavy", open: 0.1, curve: -0.5, sweat: true },
  smug: { eye: "half", look: [0.35, 0], tilt: 0.3, raise: 0, asym: 0.45, mouth: "smirk", open: 0, curve: 0.7 },
  tired: { eye: "half", look: [0, 0.35], tilt: -0.4, raise: -0.1, asym: 0, mouth: "flat", open: 0.1, curve: -0.3 },
  asleep: { eye: "arcDown", look: [0, 0], tilt: -0.1, raise: 0, asym: 0, mouth: "small", open: 0, curve: 0.1 },
  pain: { eye: "squeeze", look: [0, 0], tilt: -0.9, raise: 0.1, asym: 0, mouth: "grit", open: 0.4, curve: -0.8, sweat: true },
  love: { eye: "heart", look: [0, 0], tilt: -0.3, raise: 0.3, asym: 0, mouth: "grin", open: 0.4, curve: 1, blush: true },
};

/** Every expression a full face can draw. */
export const ALL_EXPRESSIONS: readonly Expression[] = EXPRESSIONS;

/** Mouth used while talking (poses "talk" / expression shout). */
export function talkMouth(e: Expression): MouthKind {
  const base = EXPR[e].mouth;
  if (base === "grin" || base === "shout" || base === "o" || base === "wail") return base;
  switch (e) {
    case "happy":
    case "gentle":
    case "love":
    case "smug":
      return "grin";
    case "sad":
    case "cry":
    case "afraid":
    case "worried":
    case "tired":
    case "pain":
      return "wail";
    case "angry":
      return "shout";
    default:
      return "talk";
  }
}

export interface FaceOpts {
  /** Midpoint between the eyes (front view) / eye centre (profile). */
  c: Point;
  /** Half distance between eye centres in front view. */
  gap: number;
  /** Eye radius (sclera). */
  eyeR: number;
  /** Eye height/width ratio (default 1.15). */
  eyeAspect?: number;
  /** 0 = front, 0.5 = three-quarter right, 1 = right profile (one eye). */
  turn: number;
  pen: Pen;
  /** Mouth centre offset below c and half width; omit for beaks. */
  mouth?: { dy: number; w: number; dx?: number };
  talking?: boolean;
  /** Face sits on a dark fill: give strokes a paper halo. */
  dark?: boolean;
  /** "round": white sclera + pupil; "bead": solid eye with highlight. */
  style?: "round" | "bead";
  brows?: boolean;
  /** Radius of the head, for sweat drops. */
  headR: number;
  /** Rotation of the whole face around c (radians). */
  rot?: number;
  /** Override the mouth kind (e.g. "blow" for the wind). */
  mouthKind?: MouthKind;
  /** Skip tears/sweat/blush extras. */
  plain?: boolean;
}

interface Mark {
  d: string;
  fill?: string;
  stroke?: number;
  color?: string;
}

/** Eye drawing; `side` +1 = right (near) eye, -1 = left (far) eye. */
function eyeMarks(
  ec: Point,
  rx: number,
  ry: number,
  side: number,
  x: ExprLook,
  o: FaceOpts,
  out: Mark[],
): void {
  const dw = o.pen.dw;
  const heavy = Math.max(dw * 1.55, rx * 0.26);
  const style = o.style ?? "round";
  const kind = x.eye;
  if (kind === "arcUp") {
    out.push({ d: quadD(P(ec.x - rx, ec.y + ry * 0.25), P(ec.x, ec.y - ry * 1.0), P(ec.x + rx, ec.y + ry * 0.25)), stroke: heavy });
    return;
  }
  if (kind === "arcDown") {
    const lift = x.tears ? -side * ry * 0.25 : 0;
    out.push({
      d: quadD(P(ec.x - rx, ec.y - ry * 0.05 + lift * -1), P(ec.x, ec.y + ry * 0.75), P(ec.x + rx, ec.y - ry * 0.05 + lift)),
      stroke: heavy,
    });
    // lashes
    out.push({ d: lineD([P(ec.x + side * rx * 0.95, ec.y), P(ec.x + side * rx * 1.3, ec.y - ry * 0.12)]), stroke: dw });
    return;
  }
  if (kind === "squeeze") {
    const tip = ec.x - side * rx * 0.75; // points inward
    const back = ec.x + side * rx * 0.8;
    out.push({ d: lineD([P(back, ec.y - ry * 0.65), P(tip, ec.y), P(back, ec.y + ry * 0.65)]), stroke: heavy });
    return;
  }
  if (kind === "heart") {
    out.push({ d: heartD(P(ec.x, ec.y + ry * 0.05), ry * 2.1), fill: INK, stroke: 0 });
    out.push({ d: heartD(P(ec.x - rx * 0.25, ec.y - ry * 0.25), ry * 0.55), fill: PAPER, stroke: 0 });
    return;
  }
  const wide = kind === "wide";
  const erx = wide ? rx * 1.18 : rx;
  const ery = wide ? ry * 1.18 : ry;
  let pts = ellipsePts(ec, erx, ery, 28);
  // Lid: y = ec.y + ery*(L0 - L1*u), u = outwardness (-1 inner .. 1 outer).
  let L0 = -2;
  let L1 = 0;
  switch (kind) {
    case "narrow":
      L0 = -0.25;
      L1 = 0.6;
      break;
    case "firm":
      L0 = -0.55;
      L1 = 0.35;
      break;
    case "half":
      L0 = -0.05;
      L1 = -0.1;
      break;
    case "sad":
      L0 = -0.45;
      L1 = -0.55;
      break;
    case "soft":
      L0 = -0.3;
      L1 = -0.15;
      break;
    default:
      break;
  }
  const lid = (px: number) => {
    const u = ((px - ec.x) / erx) * side;
    return ec.y + ery * (L0 - L1 * u);
  };
  const hasLid = L0 > -1.5;
  const lower = kind === "smile" ? (px: number) => {
    const u = (px - ec.x) / erx;
    return ec.y + ery * (0.05 + 0.75 * u * u);
  } : null;
  if (hasLid) pts = clampBelow(pts, lid);
  if (lower) pts = clampAbove(pts, lower);
  const eyeD = polyPath(pts, true);
  if (style === "bead") {
    // solid eye with a highlight; "wide" gets a white ring
    if (wide) {
      out.push({ d: eyeD, fill: PAPER, stroke: dw });
      const ic = P(ec.x + x.look[0] * erx * 0.2, ec.y + x.look[1] * ery * 0.2);
      let ip = ellipsePts(ic, erx * 0.5, ery * 0.5, 18);
      if (hasLid) ip = clampBelow(ip, lid);
      out.push({ d: polyPath(ip, true), fill: INK, stroke: 0 });
    } else {
      out.push({ d: eyeD, fill: INK, stroke: 0 });
    }
    const hl = P(ec.x - erx * 0.28, ec.y - ery * 0.3);
    if (!hasLid || hl.y > lid(hl.x) + ery * 0.15) out.push({ d: ellipseMark(hl, Math.min(erx, ery) * 0.28), fill: PAPER, stroke: 0 });
    if (!hasLid) return;
  } else {
    out.push({ d: eyeD, fill: PAPER, stroke: dw * 1.1 });
    const pupilR = Math.min(erx, ery) * (x.pin ? 0.34 : wide ? 0.42 : 0.62);
    const pc = P(ec.x + x.look[0] * erx * 0.38, ec.y + x.look[1] * ery * 0.38 + (lower ? -ery * 0.12 : 0));
    let pp = ellipsePts(pc, pupilR * 0.92, pupilR * 1.05, 20);
    // keep the pupil inside the (lidded) eye
    pp = pp.map((p) => {
      const dx = (p.x - ec.x) / (erx * 0.97);
      const dy = (p.y - ec.y) / (ery * 0.97);
      const r = Math.hypot(dx, dy);
      return r > 1 ? P(ec.x + (dx / r) * erx * 0.97, ec.y + (dy / r) * ery * 0.97) : p;
    });
    if (hasLid) pp = clampBelow(pp, lid);
    if (lower) pp = clampAbove(pp, lower);
    out.push({ d: polyPath(pp, true), fill: INK, stroke: 0 });
    // highlight (skipped when the lid covers it)
    const hl = P(pc.x - pupilR * 0.32, pc.y - pupilR * 0.38);
    if (!hasLid || hl.y > lid(hl.x) + pupilR * 0.2) {
      out.push({ d: ellipseMark(hl, pupilR * 0.34), fill: PAPER, stroke: 0 });
    }
  }
  // Lid line / lashes on top of the eye
  if (hasLid) {
    const a = P(ec.x - erx * 1.05, lid(ec.x - erx * 1.05));
    const b = P(ec.x + erx * 1.05, lid(ec.x + erx * 1.05));
    const clampY = (p: Point) => P(p.x, Math.max(p.y, ec.y - ery * 1.02));
    out.push({ d: lineD([clampY(a), clampY(b)]), stroke: heavy });
  } else {
    // upper lash: a heavier arc over the top of the eye
    const top: Point[] = [];
    for (let i = 0; i <= 8; i += 1) {
      const a = Math.PI + (i / 8) * Math.PI;
      top.push(P(ec.x + Math.cos(a) * erx * 1.02, ec.y + Math.sin(a) * ery * 1.02));
    }
    if (lower) out.push({ d: lineD(top), stroke: heavy * 0.9 });
    else out.push({ d: lineD(top), stroke: heavy * 0.8 });
  }
}

function ellipseMark(c: Point, r: number): string {
  return polyPath(ellipsePts(c, r, r, 12), true);
}

function mouthMarks(kind: MouthKind, m: Point, w: number, squash: number, o: FaceOpts, out: Mark[]): void {
  const dw = o.pen.dw;
  const heavy = Math.max(dw * 1.4, w * 0.13);
  const X = (dx: number) => m.x + dx * w * squash;
  const Y = (dy: number) => m.y + dy * w;
  const tongue = toneFill("mid", o.pen.prefix);
  switch (kind) {
    case "flat":
      out.push({ d: quadD(P(X(-0.55), Y(0)), P(X(0), Y(0.06)), P(X(0.55), Y(-0.02))), stroke: heavy });
      return;
    case "small":
      out.push({ d: quadD(P(X(-0.3), Y(-0.03)), P(X(0), Y(0.14)), P(X(0.3), Y(-0.03))), stroke: heavy });
      return;
    case "smile":
      out.push({ d: quadD(P(X(-0.75), Y(-0.2)), P(X(0), Y(0.55)), P(X(0.75), Y(-0.2))), stroke: heavy });
      return;
    case "frown":
      out.push({ d: quadD(P(X(-0.6), Y(0.25)), P(X(0), Y(-0.3)), P(X(0.6), Y(0.25))), stroke: heavy });
      return;
    case "pout":
      out.push({ d: quadD(P(X(0.05), Y(0.02)), P(X(0.3), Y(-0.12)), P(X(0.5), Y(0.04))), stroke: heavy });
      return;
    case "smirk":
      out.push({ d: curveD([P(X(-0.5), Y(0.05)), P(X(0.1), Y(0.12)), P(X(0.55), Y(-0.18))]), stroke: heavy });
      out.push({ d: lineD([P(X(0.5), Y(-0.28)), P(X(0.62), Y(-0.1))]), stroke: dw });
      return;
    case "wavy": {
      const pts: Point[] = [];
      for (let i = 0; i <= 8; i += 1) {
        const t = i / 8;
        pts.push(P(X(-0.6 + t * 1.2), Y(Math.sin(t * Math.PI * 3) * 0.1)));
      }
      out.push({ d: curveD(pts), stroke: heavy * 0.9 });
      return;
    }
    case "o":
      out.push({ d: ellipseMark2(P(m.x, Y(0.1)), w * 0.24 * squash, w * 0.32), fill: INK, stroke: dw });
      return;
    case "blow":
      out.push({ d: ellipseMark2(P(m.x, Y(0.05)), w * 0.3 * squash, w * 0.3), fill: PAPER, stroke: heavy });
      out.push({ d: ellipseMark2(P(m.x, Y(0.05)), w * 0.13 * squash, w * 0.14), fill: INK, stroke: 0 });
      return;
    case "talk": {
      const d = blobD([P(X(-0.45), Y(-0.05)), P(X(0), Y(-0.1)), P(X(0.45), Y(-0.05)), P(X(0.2), Y(0.4)), P(X(-0.2), Y(0.4))]);
      out.push({ d, fill: INK, stroke: dw });
      out.push({ d: blobD([P(X(-0.18), Y(0.33)), P(X(0), Y(0.2)), P(X(0.18), Y(0.33)), P(X(0), Y(0.4))]), fill: tongue, stroke: 0 });
      return;
    }
    case "grin": {
      const d = `M${n(X(-0.8))} ${n(Y(-0.12))}C${n(X(-0.3))} ${n(Y(0.02))} ${n(X(0.3))} ${n(Y(0.02))} ${n(X(0.8))} ${n(Y(-0.12))}C${n(X(0.6))} ${n(Y(0.75))} ${n(X(-0.6))} ${n(Y(0.75))} ${n(X(-0.8))} ${n(Y(-0.12))}Z`;
      out.push({ d, fill: INK, stroke: dw });
      out.push({ d: blobD([P(X(-0.32), Y(0.46)), P(X(0), Y(0.3)), P(X(0.32), Y(0.46)), P(X(0), Y(0.56))]), fill: tongue, stroke: 0 });
      return;
    }
    case "shout": {
      const d = blobD([P(X(-0.75), Y(-0.3)), P(X(0), Y(-0.38)), P(X(0.75), Y(-0.3)), P(X(0.5), Y(0.75)), P(X(0), Y(0.95)), P(X(-0.5), Y(0.75))], 0.4);
      out.push({ d, fill: INK, stroke: dw });
      out.push({ d: blobD([P(X(-0.55), Y(-0.24)), P(X(0.55), Y(-0.24)), P(X(0.45), Y(-0.08)), P(X(-0.45), Y(-0.08))], 0.2), fill: PAPER, stroke: 0 });
      out.push({ d: blobD([P(X(-0.3), Y(0.72)), P(X(0), Y(0.5)), P(X(0.3), Y(0.72)), P(X(0), Y(0.85))]), fill: tongue, stroke: 0 });
      return;
    }
    case "wail": {
      const d = `M${n(X(-0.6))} ${n(Y(0.45))}C${n(X(-0.55))} ${n(Y(-0.3))} ${n(X(0.55))} ${n(Y(-0.3))} ${n(X(0.6))} ${n(Y(0.45))}C${n(X(0.2))} ${n(Y(0.32))} ${n(X(-0.2))} ${n(Y(0.32))} ${n(X(-0.6))} ${n(Y(0.45))}Z`;
      out.push({ d, fill: INK, stroke: dw });
      return;
    }
    case "grit": {
      const d = blobD([P(X(-0.62), Y(-0.16)), P(X(0), Y(-0.2)), P(X(0.62), Y(-0.16)), P(X(0.58), Y(0.22)), P(X(0), Y(0.26)), P(X(-0.58), Y(0.22))], 0.25);
      out.push({ d, fill: PAPER, stroke: heavy * 0.8 });
      out.push({ d: lineD([P(X(-0.56), Y(0.03)), P(X(0.56), Y(0.03))]), stroke: dw * 0.9 });
      for (const t of [-0.3, 0, 0.3]) out.push({ d: lineD([P(X(t), Y(-0.16)), P(X(t), Y(0.22))]), stroke: dw * 0.8 });
      return;
    }
  }
}

function ellipseMark2(c: Point, rx: number, ry: number): string {
  return polyPath(ellipsePts(c, rx, ry, 16), true);
}

/** Draw a face. Returns an SVG fragment (stroke attributes inline). */
export function drawFace(o: FaceOpts, expression: Expression): string {
  const x = EXPR[expression];
  const marks: Mark[] = [];
  const t = Math.max(0, Math.min(1, o.turn));
  const r = o.eyeR;
  const ry = r * (o.eyeAspect ?? 1.15);
  const c = o.c;
  const profile = t > 0.85;
  const eyes: { c: Point; rx: number; side: number }[] = [];
  if (profile) {
    eyes.push({ c, rx: r * 0.9, side: 1 });
  } else {
    const shift = o.gap * 0.55 * t;
    eyes.push({ c: P(c.x - o.gap * (1 - 0.55 * t) + shift, c.y), rx: r * (1 - 0.4 * t), side: -1 });
    eyes.push({ c: P(c.x + o.gap * (1 - 0.1 * t) + shift, c.y), rx: r, side: 1 });
  }
  if (o.pen.detail === "silhouette") {
    // silhouette LOD: at most two eye dots
    let dots = "";
    for (const e of eyes) dots += `<path d="${polyPath(ellipsePts(e.c, e.rx * 0.5, ry * 0.5, 10), true)}" fill="${o.dark ? PAPER : INK}"/>`;
    return `<g>${dots}</g>`;
  }
  const reduced = o.pen.detail === "reduced";
  for (const e of eyes) eyeMarks(e.c, e.rx, ry, e.side, x, o, marks);
  // brows
  if (o.brows !== false) {
    const bw = Math.max(o.pen.dw * 1.7, r * 0.34);
    for (const e of eyes) {
      const raise = x.raise + (e.side > 0 ? x.asym : -x.asym * 0.4);
      const by = e.c.y - ry * (1.5 + raise);
      const inner = P(e.c.x - e.side * e.rx * 0.95, by + x.tilt * ry * 0.5);
      const outer = P(e.c.x + e.side * e.rx * 1.05, by - x.tilt * ry * 0.25);
      const mid = P((inner.x + outer.x) / 2, (inner.y + outer.y) / 2 - ry * (x.tilt > 0.5 ? 0.05 : 0.28));
      marks.push({ d: quadD(inner, mid, outer), stroke: bw });
    }
  }
  // mouth
  if (o.mouth) {
    const kind = o.mouthKind ?? (o.talking ? talkMouth(expression) : x.mouth);
    const shift = profile ? 0 : o.gap * 0.62 * t;
    const m = P(c.x + (o.mouth.dx ?? 0) + shift, c.y + o.mouth.dy);
    mouthMarks(kind, m, o.mouth.w, 1 - 0.3 * t, o, marks);
  }
  // extras (reduced LOD keeps tears, drops sweat and blush)
  if (!o.plain) {
    if (x.tears) {
      for (const e of eyes) {
        const s0 = P(e.c.x + e.side * e.rx * 0.55, e.c.y + ry * 0.45);
        const s1 = P(e.c.x + e.side * e.rx * 0.75, e.c.y + ry * 2.0);
        const s2 = P(e.c.x + e.side * e.rx * 0.65, e.c.y + ry * 3.1);
        const w = e.rx * 0.5;
        const d = tearD(s0, s1, s2, w);
        marks.push({ d, fill: PAPER, stroke: o.pen.dw });
      }
    }
    if (x.sweat && !reduced) {
      const sc = P(c.x - o.headR * 0.7 + (profile ? -o.headR * 0.1 : 0), c.y - o.headR * 0.25);
      marks.push({ d: dropD(sc, o.headR * 0.13, -0.35), fill: PAPER, stroke: o.pen.dw });
    }
    if (x.blush && !reduced) {
      for (const e of eyes) {
        const bc = P(e.c.x + e.side * e.rx * 0.3, e.c.y + ry * 1.55);
        for (let i = -1; i <= 1; i += 1) {
          const bx = bc.x + i * e.rx * 0.42;
          marks.push({ d: lineD([P(bx + e.rx * 0.18, bc.y - ry * 0.2), P(bx - e.rx * 0.12, bc.y + ry * 0.25)]), stroke: o.pen.fw });
        }
      }
    }
  }
  // serialize (optional rotation + halo)
  const rot = o.rot ?? 0;
  const out: string[] = [];
  const rotD = rot ? (d: string) => rotatePathD(d, rot, c) : (d: string) => d;
  if (o.dark) {
    for (const mk of marks) {
      const halo = (mk.stroke ?? 0) + o.pen.dw * 1.8;
      out.push(`<path d="${rotD(mk.d)}" fill="${mk.fill ? PAPER : "none"}" stroke="${PAPER}" stroke-width="${n(halo)}"/>`);
    }
  }
  for (const mk of marks) {
    const fill = mk.fill ?? "none";
    const stroke = mk.stroke && mk.stroke > 0 ? ` stroke="${mk.color ?? INK}" stroke-width="${n(mk.stroke)}"` : ` stroke="none"`;
    out.push(`<path d="${rotD(mk.d)}" fill="${fill}"${stroke}/>`);
  }
  return `<g stroke-linecap="round" stroke-linejoin="round">${out.join("")}</g>`;
}

function tearD(a: Point, b: Point, c: Point, w: number): string {
  const l = [P(a.x - w * 0.3, a.y), P(b.x - w * 0.5, b.y), P(c.x - w * 0.55, c.y)];
  const r = [P(c.x + w * 0.55, c.y), P(b.x + w * 0.5, b.y), P(a.x + w * 0.3, a.y)];
  const bottom = P(c.x, c.y + w * 0.7);
  return blobD([...l, bottom, ...r], 0.4);
}

/** Rotate every coordinate pair of an M/L/C/Z path around o. */
export function rotatePathD(d: string, a: number, o: Point): string {
  return d.replace(/(-?\d*\.?\d+) (-?\d*\.?\d+)/g, (_m, xs: string, ys: string) => {
    const p = rotP(P(Number(xs), Number(ys)), a, o);
    return `${n(p.x)} ${n(p.y)}`;
  });
}

/** Mouth openness for beaks / muzzles, respecting talk. */
export function mouthOpen(e: Expression, talking: boolean): number {
  const base = EXPR[e].open;
  return talking ? Math.max(base, 0.55) : base;
}

export { lerp };
