/**
 * Body primitives: the torso as a projected generalized cylinder (elliptic
 * cross-sections along the spine), limbs as merged tapered capsules, hands
 * and shoes as small local shapes placed on the projected joints.
 */
import {
  add,
  add3,
  D2R,
  dot,
  frameM,
  len,
  lerp3,
  mul,
  mul3,
  norm,
  perp,
  rot,
  sub,
  v,
  type CPt,
  type Mat,
  type Pen,
  type V2,
  type V3,
} from "./geom.js";
import { projectDir, screenSpine, type ArmJ, type LegJ, type P2, type Skeleton } from "./skeleton.js";
import type { HandShape } from "./pose.js";
import { line, shape, uni, type Ink } from "./paint.js";

// ---------------------------------------------------------------------------
// Torso
// ---------------------------------------------------------------------------

interface Row {
  s: number;
  w: number;
  d: number;
  cf: number;
}

export class Torso {
  readonly rows: Row[];
  readonly spine2: V2;
  readonly perp2: V2;
  constructor(readonly sk: Skeleton) {
    const m = sk.m;
    const H = m.H;
    const ua = m.r.upperArm;
    this.rows = [
      { s: -0.26, w: m.hipW * 0.5, d: m.hipD * 0.5, cf: -m.seat * 0.2 },
      { s: -0.13, w: m.hipW * 0.9, d: m.hipD * 0.9, cf: -m.seat },
      { s: 0.02, w: m.hipW, d: m.hipD, cf: -m.seat * 0.7 },
      { s: 0.17, w: (m.hipW + m.waistW) / 2 + m.belly * 0.35, d: (m.hipD + m.waistD) / 2 + m.belly * 0.6, cf: m.belly * 0.55 },
      { s: 0.33, w: m.waistW + m.belly * 0.45, d: m.waistD + m.belly, cf: m.belly * 0.85 },
      { s: 0.52, w: m.chestW * 0.94 + m.belly * 0.2, d: m.chestD + m.belly * 0.5 + m.bust * 0.5, cf: m.bust * 0.4 + m.belly * 0.35 },
      { s: 0.68, w: m.chestW, d: m.chestD + m.bust, cf: m.bust * 0.6 },
      { s: 0.82, w: m.shoulderHalf + ua * 0.8, d: m.chestD * 0.92, cf: 0 },
      { s: 0.9, w: m.shoulderHalf + ua * 0.5, d: m.chestD * 0.76, cf: -0.004 * H },
      { s: 0.955, w: m.shoulderHalf * 0.82, d: m.chestD * 0.62, cf: -0.004 * H },
      { s: 0.995, w: m.shoulderHalf * 0.45 + m.r.neck * 0.5, d: m.chestD * 0.5, cf: -0.003 * H },
      { s: 1.03, w: m.r.neck * 1.05, d: m.r.neck, cf: 0 },
    ];
    this.spine2 = screenSpine(sk);
    this.perp2 = perp(this.spine2);
  }

  row(s: number): Row {
    const r = this.rows;
    if (s <= r[0].s) return { ...r[0], s };
    for (let i = 1; i < r.length; i += 1) {
      if (s <= r[i].s) {
        const t = (s - r[i - 1].s) / (r[i].s - r[i - 1].s);
        return {
          s,
          w: r[i - 1].w + (r[i].w - r[i - 1].w) * t,
          d: r[i - 1].d + (r[i].d - r[i - 1].d) * t,
          cf: r[i - 1].cf + (r[i].cf - r[i - 1].cf) * t,
        };
      }
    }
    return { ...r[r.length - 1], s };
  }

  centre3(s: number): V3 {
    const r = this.row(s);
    return add3(add3(this.sk.pelvis, mul3(this.sk.spine, s * this.sk.m.torsoLen)), mul3(this.sk.fwd, r.cf));
  }

  /** Surface point: θ = 0 front, 90 = figure's left, 180 back. */
  surf3(s: number, theta: number, out = 0): V3 {
    const r = this.row(s);
    const t = theta * D2R;
    return add3(this.centre3(s), add3(mul3(this.sk.fwd, (r.d + out) * Math.cos(t)), mul3(this.sk.lat, (r.w + out) * Math.sin(t))));
  }
  surf(s: number, theta: number, out = 0): P2 {
    return this.sk.P(this.surf3(s, theta, out));
  }
  /** Depth of the surface normal (positive = faces the viewer). */
  facing(s: number, theta: number): number {
    const r = this.row(s);
    const t = theta * D2R;
    const n3 = add3(mul3(this.sk.fwd, Math.cos(t) / r.d), mul3(this.sk.lat, Math.sin(t) / r.w));
    const P = this.sk.P;
    return P(add3(this.sk.pelvis, n3)).z - P(this.sk.pelvis).z;
  }
  /** θ whose surface faces the viewer most directly. */
  frontTheta(s: number): number {
    let best = 0;
    let bestZ = -Infinity;
    for (let a = -180; a < 180; a += 10) {
      const z = this.facing(s, a);
      if (z > bestZ) {
        bestZ = z;
        best = a;
      }
    }
    return best;
  }
  centre(s: number): P2 {
    return this.sk.P(this.centre3(s));
  }
  /** Silhouette extremes of a section across the screen spine (or `axis`). */
  edges(s: number, out = 0, axis?: V2): { l: P2; r: P2; c: P2 } {
    const across = axis ?? this.perp2;
    const c = this.centre(s);
    let l = c;
    let r = c;
    let lo = Infinity;
    let hi = -Infinity;
    for (let a = 0; a < 360; a += 15) {
      const p = this.surf(s, a, out);
      const k = dot(sub(p, c), across);
      if (k < lo) {
        lo = k;
        l = p;
      }
      if (k > hi) {
        hi = k;
        r = p;
      }
    }
    return { l, r, c };
  }
  /** Visible front arc of a section, ordered screen-left to screen-right. */
  arc(s: number, steps = 8, out = 0): P2[] {
    const f = this.frontTheta(s);
    const pts: P2[] = [];
    for (let i = 0; i <= steps; i += 1) pts.push(this.surf(s, f - 90 + (180 * i) / steps, out));
    if (dot(sub(pts[pts.length - 1], pts[0]), this.perp2) < 0) pts.reverse();
    return pts;
  }
  /** Silhouette polygon from s0 to s1. Bottom is a hem arc or a rounded end. */
  outline(s0: number, s1: number, bottom: "round" | "arc" | "flat", out = 0): CPt[] {
    const ss = [s0, ...this.rows.map((r) => r.s).filter((s) => s > s0 + 0.02 && s < s1 - 0.02), s1];
    const right: CPt[] = [];
    const left: CPt[] = [];
    for (const s of ss) {
      const e = this.edges(s, out);
      right.push(e.r);
      left.push(e.l);
    }
    const pts: CPt[] = [];
    if (bottom === "arc") {
      // Hem: silhouette corner → front arc (inner part) → silhouette corner.
      const a = this.arc(s0, 8, out).slice(2, -2);
      const e = this.edges(s0, out);
      pts.push({ ...e.l, c: true }, ...a, { ...e.r, c: true });
      right.shift();
      left.shift();
    } else if (bottom === "round") {
      const r0 = this.row(s0);
      pts.push(add(this.centre(s0), mul(this.spine2, -r0.d * 0.45)));
    }
    pts.push(...right);
    if (s1 >= 1) pts.push(add(this.centre(s1), mul(this.spine2, this.sk.m.r.neck * 0.3)));
    pts.push(...left.reverse());
    return pts;
  }
}

// ---------------------------------------------------------------------------
// Limbs
// ---------------------------------------------------------------------------

/** Radius after an inset (used for white rim lines inside dark garments). */
const ins = (r: number, inset: number) => Math.max(r * 0.25, r - inset);

export function armD(pen: Pen, sk: Skeleton, arm: ArmJ, scale = 1, upperOnly = false, inset = 0): string {
  const r0 = sk.m.r;
  const r = { upperArm: ins(r0.upperArm, inset), elbow: ins(r0.elbow, inset), wrist: ins(r0.wrist, inset) };
  const s0 = sk.P(arm.shoulder);
  const e = sk.P(arm.elbow);
  const w = sk.P(arm.wrist);
  // Start the sleeve a little down the arm so the cap sits inside the shoulder line.
  const s = { x: s0.x + (e.x - s0.x) * 0.1, y: s0.y + (e.y - s0.y) * 0.1 };
  const up = pen.capsule(s, r.upperArm * scale, e, r.elbow * scale);
  if (upperOnly) return up;
  return up + pen.capsule(e, r.elbow * scale, w, r.wrist * scale);
}

export function foreD(pen: Pen, sk: Skeleton, arm: ArmJ, scale = 1, inset = 0): string {
  const r = sk.m.r;
  return pen.capsule(sk.P(arm.elbow), ins(r.elbow, inset) * scale, sk.P(arm.wrist), ins(r.wrist, inset) * scale);
}

export function legPts(sk: Skeleton, leg: LegJ): { hip: P2; knee: P2; calf: P2; ankle: P2 } {
  return {
    hip: sk.P(leg.hip),
    knee: sk.P(leg.knee),
    calf: sk.P(lerp3(leg.knee, leg.ankle, 0.3)),
    ankle: sk.P(leg.ankle),
  };
}

export function legD(pen: Pen, sk: Skeleton, leg: LegJ, scale = 1, from = 0, inset = 0): string {
  const r0 = sk.m.r;
  const r = { thigh: ins(r0.thigh, inset), knee: ins(r0.knee, inset), calf: ins(r0.calf, inset), ankle: ins(r0.ankle, inset) };
  const p = legPts(sk, leg);
  let d = "";
  if (from <= 0) d += pen.capsule(p.hip, r.thigh * scale, p.knee, r.knee * scale);
  if (from <= 1) d += pen.capsule(p.knee, r.knee * scale, p.calf, r.calf * scale);
  d += pen.capsule(from > 1 ? lerpP(p.calf, p.ankle, from - 1) : p.calf, r.calf * scale, p.ankle, r.ankle * scale);
  return d;
}

const lerpP = (a: V2, b: V2, t: number): V2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// ---------------------------------------------------------------------------
// Hands
// ---------------------------------------------------------------------------

interface HandArt {
  outline: CPt[];
  caps: [V2, number, V2, number][];
  lines: V2[][];
  grip: V2;
}

function handArt(kind: HandShape): HandArt {
  const hw = 0.3;
  const P = (x: number, y: number, c = false): CPt => (c ? { x, y: y * hw, c } : { x, y: y * hw });
  switch (kind) {
    case "fist":
    case "grip":
      return {
        outline: [P(0, -0.66), P(0.3, -1.02), P(0.6, -0.98), P(0.74, -0.45), P(0.74, 0.4), P(0.62, 0.95), P(0.3, 1.02), P(0, 0.72)],
        caps: [],
        lines: [
          [P(0.24, 0.8), P(0.5, 0.42), P(0.64, 0.3)],
          [P(0.6, -0.42), P(0.7, -0.4)],
        ],
        grip: v(0.38, 0),
      };
    case "point":
      return {
        outline: [P(0, -0.66), P(0.28, -1.0), P(0.56, -0.95), P(0.68, -0.4), P(0.68, 0.3), P(0.55, 0.8), P(0.28, 0.98), P(0, 0.72)],
        caps: [[v(0.45, 0.5 * hw), 0.26 * hw, v(1.28, 0.5 * hw), 0.21 * hw]],
        lines: [[P(0.22, 0.78), P(0.46, 0.22)]],
        grip: v(0.35, 0),
      };
    case "open":
      return {
        outline: [P(0, -0.62), P(0.24, -0.95), P(0.52, -1.0), P(0.6, 0), P(0.52, 0.95), P(0.24, 0.95), P(0, 0.66)],
        caps: [
          ...[
            [-0.72, -17, 0.42],
            [-0.25, -6, 0.52],
            [0.22, 5, 0.54],
            [0.66, 15, 0.46],
          ].map(([y, a, l]): [V2, number, V2, number] => {
            const b = v(0.48, y * hw);
            return [b, 0.2 * hw, add(b, rot(v(l, 0), a)), 0.17 * hw];
          }),
          [v(0.16, 0.7 * hw), 0.26 * hw, v(0.44, 1.62 * hw), 0.2 * hw],
        ],
        lines: [],
        grip: v(0.4, 0),
      };
    case "flat":
      return {
        outline: [P(0, -0.6), P(0.4, -0.92), P(0.95, -0.72), P(1.1, -0.15), P(1.05, 0.45), P(0.72, 0.86), P(0.3, 0.92), P(0, 0.62)],
        caps: [],
        lines: [
          [P(0.62, -0.3), P(1.0, -0.32)],
          [P(0.62, 0.22), P(1.0, 0.2)],
        ],
        grip: v(0.45, 0),
      };
    case "relaxed":
    default:
      return {
        outline: [P(0, -0.62), P(0.35, -0.95), P(0.78, -0.8), P(0.98, -0.3), P(0.95, 0.28), P(0.7, 0.68), P(0.3, 0.76), P(0, 0.62)],
        caps: [[v(0.18, 0.52 * hw), 0.32 * hw, v(0.54, 0.95 * hw), 0.24 * hw]],
        lines: [[P(0.55, 0.02), P(0.86, 0.02)]],
        grip: v(0.42, 0),
      };
  }
}

export interface HandOut {
  svg: string;
  grip: V2;
  sil: string;
}

/**
 * Draw a hand at the wrist. `pref` is the screen direction the thumb should
 * favour (forward in side views, inward in front views).
 */
export function drawHand(pen: Pen, sk: Skeleton, arm: ArmJ, fill: string, ink: Ink, pref: V2, scale = 1): HandOut {
  const L = sk.m.handL * scale;
  const art = handArt(arm.hand);
  const wrist = sk.P(arm.wrist);
  const dir2 = projectDir(sk.cam, arm.handDir);
  const ratio = len(dir2);
  let ax: V2;
  let lenK = 1;
  if (ratio < 0.42) {
    // Pointing at/away from the viewer: show the hand upright and shorter.
    const upish = ratio > 0.12 ? norm(dir2) : rot(v(0, -1), sk.cam.roll);
    ax = upish;
    lenK = arm.hand === "open" || arm.hand === "flat" ? 0.9 : 0.72;
  } else {
    ax = norm(dir2);
    lenK = 0.75 + 0.25 * Math.min(1, ratio);
  }
  let ay = perp(ax);
  const want = norm(add(pref, v(0, -0.5)));
  if (dot(ay, want) < 0) ay = mul(ay, -1);
  const m: Mat = frameM(wrist, mul(ax, L * lenK), mul(ay, L));
  const hp = pen.with(m);
  let d = hp.curve(art.outline);
  for (const [a, ra, b, rb] of art.caps) d += hp.capsule(a, ra, b, rb);
  let svg = uni(d, fill, ink.lw * 0.9);
  if (!ink.lite) for (const l of art.lines) svg += line(hp.curve(l, false), ink.dw * 0.9);
  return { svg, grip: hp.p(art.grip), sil: d };
}

// ---------------------------------------------------------------------------
// Feet
// ---------------------------------------------------------------------------

export type ShoeKind = "shoe" | "boot" | "bare" | "slipper";

export interface FootOut {
  svg: string;
  sil: string;
}

export function drawFoot(pen: Pen, sk: Skeleton, leg: LegJ, kind: ShoeKind, fill: string, skin: string, ink: Ink): FootOut {
  const m = sk.m;
  const ankle = sk.P(leg.ankle);
  const fd = projectDir(sk.cam, leg.footDir);
  const fdn = projectDir(sk.cam, leg.footDown);
  const bare = kind === "bare";
  const f = bare ? skin : fill;
  const h = m.ankleH;
  const L = m.footL;
  let d: string;
  let details = "";
  if (len(fd) > 0.45) {
    const mm = frameM(ankle, mul(fd, L), mul(norm(fdn), h));
    const fp = pen.with(mm);
    const pts: CPt[] = bare
      ? [v(-0.1, -0.7), v(-0.2, 0.2), { x: -0.16, y: 1.0, c: true }, v(0.55, 1.0), v(0.78, 0.8), v(0.8, 0.45), v(0.55, 0.15), v(0.25, -0.2), v(0.08, -0.7)]
      : [v(-0.12, -0.95), v(-0.23, 0.15), { x: -0.21, y: 1.02, c: true }, v(0.62, 1.02), v(0.82, 0.9), v(0.86, 0.45), v(0.66, 0.08), v(0.36, -0.22), v(0.12, -0.78)];
    d = fp.curve(pts);
    if (bare) details = line(fp.curve([v(0.62, 0.45), v(0.72, 0.62)], false), ink.dw);
    else if (!ink.lite) details = line(fp.curve([v(-0.19, 0.78), v(0.72, 0.8)], false), ink.dw, fill === "#141414" ? "#ffffff" : "#141414");
  } else {
    const down = norm(fdn.y < 0 ? mul(fdn, -1) : fdn);
    const across = perp(down);
    const mm = frameM(ankle, mul(across, -L * 0.2), mul(down, h));
    const fp = pen.with(mm);
    const pts: CPt[] = [v(-0.85, -0.9), v(0.85, -0.9), v(1.05, 0.35), { x: 0.98, y: 1.08, c: true }, { x: -0.98, y: 1.08, c: true }, v(-1.05, 0.35)];
    d = fp.curve(pts);
    if (!bare && !ink.lite) details = line(fp.curve([v(-0.7, 0.5), v(0, 0.2), v(0.7, 0.5)], false), ink.dw, fill === "#141414" ? "#ffffff" : "#141414");
  }
  return { svg: shape(d, f, ink.lw) + details, sil: d };
}

/** Boot shaft over the lower shin. */
export function bootD(pen: Pen, sk: Skeleton, leg: LegJ, height = 0.45): string {
  const p = legPts(sk, leg);
  const top = lerpP(p.ankle, p.knee, height);
  const r = sk.m.r;
  return pen.capsule(top, r.calf * 1.02, p.ankle, r.ankle * 1.18);
}

/** Unit screen direction a thumb should favour for an arm. */
export function thumbPref(sk: Skeleton, arm: ArmJ): V2 {
  if (sk.view === "side") return sk.mirror ? rot(v(-1, 0), sk.cam.roll) : rot(v(1, 0), sk.cam.roll);
  const c = sk.P(sk.pelvis);
  const w = sk.P(arm.wrist);
  const inward = w.x < c.x ? v(1, 0) : v(-1, 0);
  return sk.view === "front" ? inward : mul(inward, -1);
}

