/**
 * Geometry kit for the human rig: 2D/3D vectors, a tiny affine "pen" that
 * transforms local drawings into figure space while tracking bounds, and
 * path builders (Catmull-Rom with corners, capsules, hulls).
 *
 * Screen/figure space: y grows downward. Body space (V3): f = forward,
 * u = up, l = the figure's left side.
 */
import { n } from "../../svg.js";

export interface V2 {
  x: number;
  y: number;
}
/** A path point; `c` marks a sharp corner. */
export interface CPt extends V2 {
  c?: boolean;
}
export interface V3 {
  f: number;
  u: number;
  l: number;
}

export const D2R = Math.PI / 180;
export const v = (x: number, y: number): V2 => ({ x, y });
export const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: V2, k: number): V2 => ({ x: a.x * k, y: a.y * k });
export const lerp = (a: V2, b: V2, t: number): V2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const len = (a: V2): number => Math.hypot(a.x, a.y);
export const dist = (a: V2, b: V2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: V2): V2 => {
  const l = Math.hypot(a.x, a.y);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: -1 };
};
/** Rotate 90° clockwise on screen (y down). */
export const perp = (a: V2): V2 => ({ x: -a.y, y: a.x });
export const dot = (a: V2, b: V2): number => a.x * b.x + a.y * b.y;
/** Rotate by `deg`; positive = clockwise on screen. */
export const rot = (a: V2, deg: number): V2 => {
  const c = Math.cos(deg * D2R);
  const s = Math.sin(deg * D2R);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
};
/** Angle (deg) of a screen vector measured clockwise from "up". */
export const upAngle = (a: V2): number => Math.atan2(a.x, -a.y) / D2R;
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export const v3 = (f: number, u: number, l: number): V3 => ({ f, u, l });
export const add3 = (a: V3, b: V3): V3 => ({ f: a.f + b.f, u: a.u + b.u, l: a.l + b.l });
export const sub3 = (a: V3, b: V3): V3 => ({ f: a.f - b.f, u: a.u - b.u, l: a.l - b.l });
export const mul3 = (a: V3, k: number): V3 => ({ f: a.f * k, u: a.u * k, l: a.l * k });
export const dot3 = (a: V3, b: V3): number => a.f * b.f + a.u * b.u + a.l * b.l;
export const len3 = (a: V3): number => Math.hypot(a.f, a.u, a.l);
export const norm3 = (a: V3): V3 => {
  const l = len3(a);
  return l > 1e-9 ? mul3(a, 1 / l) : v3(0, 1, 0);
};
/** Cross product treating (f, u, l) as (x, y, z). */
export const cross3 = (a: V3, b: V3): V3 => ({
  f: a.u * b.l - a.l * b.u,
  u: a.l * b.f - a.f * b.l,
  l: a.f * b.u - a.u * b.f,
});
export const lerp3 = (a: V3, b: V3, t: number): V3 => add3(a, mul3(sub3(b, a), t));

/**
 * Direction of a limb segment from two world angles. `swing` rotates from
 * straight down (0) toward forward (90) and up (180); `spread` swings the
 * segment out sideways, away from the body on `side` (+1 left, -1 right).
 */
export function dir3(swing: number, spread = 0, side = 1): V3 {
  const s = swing * D2R;
  const a = spread * D2R;
  return { f: Math.sin(s) * Math.cos(a), u: -Math.cos(s) * Math.cos(a), l: side * Math.sin(a) };
}

/** Two-bone IK: elbow/knee position bending toward `pole`. */
export function twoBone(root: V3, target: V3, a: number, b: number, pole: V3): { mid: V3; end: V3 } {
  const d0 = sub3(target, root);
  const raw = len3(d0);
  const x = raw > 1e-6 ? mul3(d0, 1 / raw) : v3(0, -1, 0);
  const d = clamp(raw, Math.abs(a - b) + 1e-3, a + b - 1e-3);
  const e = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - e * e));
  let y = sub3(pole, mul3(x, dot3(pole, x)));
  if (len3(y) < 1e-6) y = Math.abs(x.u) < 0.9 ? v3(0, -1, 0) : v3(1, 0, 0);
  y = norm3(y);
  return { mid: add3(root, add3(mul3(x, e), mul3(y, h))), end: add3(root, mul3(x, d)) };
}

// ---------------------------------------------------------------------------
// Affine transforms
// ---------------------------------------------------------------------------

/** x' = a·x + c·y + e ; y' = b·x + d·y + f */
export interface Mat {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}
export const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
export const apply = (m: Mat, p: V2): V2 => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
/** Transform a direction (no translation). */
export const applyDir = (m: Mat, p: V2): V2 => ({ x: m.a * p.x + m.c * p.y, y: m.b * p.x + m.d * p.y });
/** m1 ∘ m2 — apply m2 first. */
export function compose(m1: Mat, m2: Mat): Mat {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}
export const translate = (x: number, y: number): Mat => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });
export const scaleM = (sx: number, sy = sx): Mat => ({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
export function rotateM(deg: number): Mat {
  const c = Math.cos(deg * D2R);
  const s = Math.sin(deg * D2R);
  return { a: c, b: s, c: -s, d: c, e: 0, f: 0 };
}
/** Frame from an origin and two axis vectors (local x → ax, local y → ay). */
export const frameM = (o: V2, ax: V2, ay: V2): Mat => ({ a: ax.x, b: ax.y, c: ay.x, d: ay.y, e: o.x, f: o.y });
export const matScale = (m: Mat): number => Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

export class Bounds {
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;
  add(p: V2, pad = 0): void {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error("non-finite point in human rig");
    if (p.x - pad < this.minX) this.minX = p.x - pad;
    if (p.y - pad < this.minY) this.minY = p.y - pad;
    if (p.x + pad > this.maxX) this.maxX = p.x + pad;
    if (p.y + pad > this.maxY) this.maxY = p.y + pad;
  }
  merge(o: Bounds): void {
    if (o.minX === Infinity) return;
    this.add({ x: o.minX, y: o.minY });
    this.add({ x: o.maxX, y: o.maxY });
  }
}

// ---------------------------------------------------------------------------
// Path builders
// ---------------------------------------------------------------------------

export function signedArea(pts: readonly V2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Orient so the signed area is positive (clockwise on a y-down screen). */
export function orient<T extends V2>(pts: T[]): T[] {
  return signedArea(pts) < 0 ? [...pts].reverse() : pts;
}

/**
 * Catmull-Rom curve through points. Points flagged `c` are sharp corners.
 * `tension` scales the handles (1 = classic Catmull-Rom).
 */
export function curveD(pts: readonly CPt[], closed = true, tension = 1): string {
  const count = pts.length;
  if (count === 0) return "";
  if (count < 3) return polyD(pts, closed);
  const at = (i: number): CPt => (closed ? pts[(i + count) % count] : pts[clamp(i, 0, count - 1)]);
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
  const segs = closed ? count : count - 1;
  const k = tension / 6;
  for (let i = 0; i < segs; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const k1 = p1.c || (!closed && i === 0) ? 0 : k;
    const k2 = p2.c || (!closed && i === segs - 1) ? 0 : k;
    const c1x = p1.x + (p2.x - p0.x) * k1;
    const c1y = p1.y + (p2.y - p0.y) * k1;
    const c2x = p2.x - (p3.x - p1.x) * k2;
    const c2y = p2.y - (p3.y - p1.y) * k2;
    if (k1 === 0 && k2 === 0) d += `L${n(p2.x)} ${n(p2.y)}`;
    else d += `C${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(p2.x)} ${n(p2.y)}`;
  }
  return closed ? `${d}Z` : d;
}

export function polyD(pts: readonly V2[], closed = true): string {
  if (pts.length === 0) return "";
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 1; i < pts.length; i += 1) d += `L${n(pts[i].x)} ${n(pts[i].y)}`;
  return closed ? `${d}Z` : d;
}

/** Quadratic segment path: M a Q c b. */
export function quadD(a: V2, c: V2, b: V2): string {
  return `M${n(a.x)} ${n(a.y)}Q${n(c.x)} ${n(c.y)} ${n(b.x)} ${n(b.y)}`;
}

/**
 * Tapered capsule outline from a (radius ra) to b (radius rb), oriented
 * clockwise so several capsules can share one nonzero-filled path.
 */
export function capsuleD(a: V2, ra: number, b: V2, rb: number): string {
  let dd = dist(a, b);
  if (dd < 1e-4) {
    const r = Math.max(ra, rb);
    return `M${n(a.x - r)} ${n(a.y)}A${n(r)} ${n(r)} 0 1 1 ${n(a.x + r)} ${n(a.y)}A${n(r)} ${n(r)} 0 1 1 ${n(a.x - r)} ${n(a.y)}Z`;
  }
  // Keep one circle from swallowing the other (no external tangent).
  if (Math.abs(ra - rb) > dd * 0.95) {
    if (ra > rb) rb = ra - dd * 0.95;
    else ra = rb - dd * 0.95;
  }
  dd = dist(a, b);
  const u = norm(sub(b, a));
  const p = perp(u);
  const sa = (ra - rb) / dd;
  const ca = Math.sqrt(Math.max(0, 1 - sa * sa));
  const n1 = add(mul(p, ca), mul(u, sa));
  const n2 = add(mul(p, -ca), mul(u, sa));
  const a1 = add(a, mul(n1, ra));
  const b1 = add(b, mul(n1, rb));
  const b2 = add(b, mul(n2, rb));
  const a2 = add(a, mul(n2, ra));
  // Arc at b passes through b + u·rb, arc at a through a − u·ra.
  const largeB = sa < 0 ? 1 : 0;
  const largeA = sa > 0 ? 1 : 0;
  const crossB = n1.x * u.y - n1.y * u.x;
  const sweep = crossB > 0 ? 1 : 0;
  const quad = [a1, b1, b2, a2];
  const ccw = signedArea(quad) < 0;
  if (!ccw) {
    return `M${n(a1.x)} ${n(a1.y)}L${n(b1.x)} ${n(b1.y)}A${n(rb)} ${n(rb)} 0 ${largeB} ${sweep} ${n(b2.x)} ${n(b2.y)}L${n(a2.x)} ${n(a2.y)}A${n(ra)} ${n(ra)} 0 ${largeA} ${sweep} ${n(a1.x)} ${n(a1.y)}Z`;
  }
  // Reverse traversal for a consistent (positive) winding.
  const rs = sweep ? 0 : 1;
  return `M${n(a1.x)} ${n(a1.y)}A${n(ra)} ${n(ra)} 0 ${largeA} ${rs} ${n(a2.x)} ${n(a2.y)}L${n(b2.x)} ${n(b2.y)}A${n(rb)} ${n(rb)} 0 ${largeB} ${rs} ${n(b1.x)} ${n(b1.y)}Z`;
}

/** Convex hull (monotone chain), positive orientation. */
export function hull(points: readonly V2[]): V2[] {
  const pts = [...points].sort((p, q) => (p.x === q.x ? p.y - q.y : p.x - q.x));
  if (pts.length < 3) return pts;
  const cross = (o: V2, a: V2, b: V2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: V2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: V2[] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return orient(lower.concat(upper));
}

/** Points on an ellipse (rotation in degrees, clockwise). */
export function ellipsePts(c: V2, rx: number, ry: number, rotDeg = 0, count = 12, start = 0): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = ((i / count) * 360 + start) * D2R;
    out.push(add(c, rot({ x: Math.cos(t) * rx, y: Math.sin(t) * ry }, rotDeg)));
  }
  return out;
}

/** Densify a closed polygon so no edge exceeds `step`. */
export function densify(pts: readonly V2[], step: number, closed = true): V2[] {
  const out: V2[] = [];
  const count = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < count; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const k = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let j = 0; j < k; j += 1) out.push(lerp(a, b, j / k));
  }
  if (!closed) out.push(pts[pts.length - 1]);
  return out;
}

/**
 * A pen draws local shapes into figure space through an affine transform and
 * records every emitted point in shared bounds.
 */
/**
 * Drop points closer than `step` to the last kept one (corners, the first
 * and the last point always stay). Outlines are sampled densely in body
 * space; once scaled onto the page many samples are under a pixel apart.
 */
export function thin<T extends CPt>(pts: T[], step: number, closed: boolean): T[] {
  if (step <= 0 || pts.length <= 5) return pts;
  const out: T[] = [pts[0]];
  const s2 = step * step;
  for (let i = 1; i < pts.length; i += 1) {
    const p = pts[i];
    const last = out[out.length - 1];
    const isEnd = !closed && i === pts.length - 1;
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (p.c || isEnd || dx * dx + dy * dy >= s2) out.push(p);
  }
  if (closed && out.length > 3) {
    const a = out[out.length - 1];
    const b = out[0];
    if (!a.c && (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < s2) out.pop();
  }
  return out.length >= (closed ? 4 : 2) ? out : pts;
}

export class Pen {
  constructor(
    readonly m: Mat,
    readonly bounds: Bounds,
    /** Minimum spacing of outline samples (figure units); 0 keeps every sample. */
    readonly minStep = 0,
  ) {}
  p(q: V2): V2 {
    return apply(this.m, q);
  }
  get s(): number {
    return matScale(this.m);
  }
  get flipped(): boolean {
    return this.m.a * this.m.d - this.m.b * this.m.c < 0;
  }
  with(m: Mat): Pen {
    return new Pen(compose(this.m, m), this.bounds, this.minStep);
  }
  pts(q: readonly CPt[], pad = 0): CPt[] {
    return q.map((pt) => {
      const t = apply(this.m, pt);
      this.bounds.add(t, pad);
      return pt.c ? { x: t.x, y: t.y, c: true } : t;
    });
  }
  /** Smooth path; `closed` shapes are oriented positively (for union paths). */
  curve(q: readonly CPt[], closed = true, tension = 1, pad = 0): string {
    const t = thin(this.pts(q, pad), this.minStep, closed);
    return curveD(closed ? orient(t) : t, closed, tension);
  }
  poly(q: readonly V2[], closed = true, pad = 0): string {
    const t = thin(this.pts(q, pad), this.minStep, closed);
    return polyD(closed ? orient(t) : t, closed);
  }
  quad(a: V2, c: V2, b: V2, pad = 0): string {
    const [A, C, B] = this.pts([a, c, b], pad);
    return quadD(A, C, B);
  }
  capsule(a: V2, ra: number, b: V2, rb: number): string {
    const A = this.p(a);
    const B = this.p(b);
    const s = this.s;
    this.bounds.add(A, ra * s);
    this.bounds.add(B, rb * s);
    return capsuleD(A, ra * s, B, rb * s);
  }
  circle(c: V2, r: number): { x: number; y: number; r: number } {
    const C = this.p(c);
    const rr = r * this.s;
    this.bounds.add(C, rr);
    return { x: C.x, y: C.y, r: rr };
  }
}
