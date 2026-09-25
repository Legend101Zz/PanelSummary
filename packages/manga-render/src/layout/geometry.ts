/**
 * Convex-polygon geometry used by the layout compiler, the scene composer and
 * the lettering engine. Page space: y grows downward. "Clockwise" means
 * visually clockwise on the page (positive shoelace area with y down).
 */
import type { Box, Point } from "../contracts.js";

export function signedArea(poly: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Visually clockwise on a y-down page, starting at the top-left-most vertex. */
export function normalizePolygon(poly: readonly Point[]): Point[] {
  let pts = dedupe(poly);
  if (pts.length < 3) return pts;
  if (signedArea(pts) < 0) pts = [...pts].reverse();
  let start = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[start];
    if (a.x + a.y < b.x + b.y - 1e-9) start = i;
  }
  return [...pts.slice(start), ...pts.slice(0, start)].map((p) => ({ x: round3(p.x), y: round3(p.y) }));
}

function round3(v: number): number {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

function dedupe(poly: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.01) out.push({ x: p.x, y: p.y });
  }
  while (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= 0.01) out.pop();
  // drop collinear vertices
  const clean: Point[] = [];
  for (let i = 0; i < out.length; i += 1) {
    const a = out[(i - 1 + out.length) % out.length];
    const b = out[i];
    const c = out[(i + 1) % out.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > 1e-6 || out.length <= 3) clean.push(b);
  }
  return clean;
}

/**
 * Keep the part of a convex polygon where nx*x + ny*y <= c
 * (Sutherland–Hodgman against one half-plane).
 */
export function clipHalfPlane(poly: readonly Point[], nx: number, ny: number, c: number): Point[] {
  const out: Point[] = [];
  const inside = (p: Point) => nx * p.x + ny * p.y <= c + 1e-9;
  for (let i = 0; i < poly.length; i += 1) {
    const cur = poly[i];
    const prev = poly[(i - 1 + poly.length) % poly.length];
    const ci = inside(cur);
    const pi = inside(prev);
    if (ci !== pi) {
      const dc = nx * cur.x + ny * cur.y - c;
      const dp = nx * prev.x + ny * prev.y - c;
      const t = dp / (dp - dc);
      out.push({ x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t });
    }
    if (ci) out.push(cur);
  }
  return dedupe(out);
}

export function bboxOf(poly: readonly Point[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function centroid(poly: readonly Point[]): Point {
  const a = signedArea(poly);
  if (Math.abs(a) < 1e-9) {
    const b = bboxOf(poly);
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/**
 * Width and length of a convex polygon: the minimum extent over edge normals
 * (the true minimum width of a convex polygon) and the extent perpendicular
 * to that direction.
 */
export function convexDimensions(poly: readonly Point[]): { short: number; long: number } {
  if (poly.length < 3) return { short: 0, long: 0 };
  let best = Infinity;
  let bestLong = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const nx = -uy;
    const ny = ux;
    let minN = Infinity;
    let maxN = -Infinity;
    let minU = Infinity;
    let maxU = -Infinity;
    for (const p of poly) {
      const dn = p.x * nx + p.y * ny;
      const du = p.x * ux + p.y * uy;
      minN = Math.min(minN, dn);
      maxN = Math.max(maxN, dn);
      minU = Math.min(minU, du);
      maxU = Math.max(maxU, du);
    }
    const width = maxN - minN;
    if (width < best) {
      best = width;
      bestLong = maxU - minU;
    }
  }
  return { short: best, long: Math.max(bestLong, best) };
}

/** Point-in-convex-polygon for a clockwise (y-down) polygon, with optional margin. */
export function insideConvex(poly: readonly Point[], p: Point, margin = 0): boolean {
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    // inward normal of a clockwise y-down polygon: rotate edge by +90° (x,y) -> (-y, x)
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const d = (p.x - a.x) * nx + (p.y - a.y) * ny;
    if (d < margin - 1e-9) return false;
  }
  return true;
}

/** Inward offset of a convex clockwise polygon (y-down) by d. */
export function insetConvex(poly: readonly Point[], d: number): Point[] {
  let out: Point[] = [
    { x: -1e5, y: -1e5 },
    { x: 1e5, y: -1e5 },
    { x: 1e5, y: 1e5 },
    { x: -1e5, y: 1e5 },
  ];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    // keep (p - a)·n >= d  <=>  (-n)·p <= -(a·n + d)
    out = clipHalfPlane(out, -nx, -ny, -(a.x * nx + a.y * ny + d));
    if (out.length < 3) return [];
  }
  return out;
}

export function distPointSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Distance from a point to a polygon's boundary (0 if inside is not considered). */
export function distPointPolygonEdge(p: Point, poly: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    best = Math.min(best, distPointSegment(p, poly[i], poly[(i + 1) % poly.length]));
  }
  return best;
}

/** Does a circle intersect (or lie inside) a convex polygon? */
export function circleHitsConvex(center: Point, r: number, poly: readonly Point[]): boolean {
  if (insideConvex(poly, center)) return true;
  return distPointPolygonEdge(center, poly) < r;
}

/** Separating-axis overlap test for two convex polygons (any winding). */
export function convexOverlap(a: readonly Point[], b: readonly Point[], gap = 0): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      if (len < 1e-9) continue;
      const nx = -(q.y - p.y) / len;
      const ny = (q.x - p.x) / len;
      let aMin = Infinity;
      let aMax = -Infinity;
      for (const v of a) {
        const d = v.x * nx + v.y * ny;
        aMin = Math.min(aMin, d);
        aMax = Math.max(aMax, d);
      }
      let bMin = Infinity;
      let bMax = -Infinity;
      for (const v of b) {
        const d = v.x * nx + v.y * ny;
        bMin = Math.min(bMin, d);
        bMax = Math.max(bMax, d);
      }
      if (aMax + gap <= bMin || bMax + gap <= aMin) return false;
    }
  }
  return true;
}

export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

export function segmentHitsConvex(a: Point, b: Point, poly: readonly Point[]): boolean {
  if (insideConvex(poly, a) || insideConvex(poly, b)) return true;
  for (let i = 0; i < poly.length; i += 1) {
    if (segmentsIntersect(a, b, poly[i], poly[(i + 1) % poly.length])) return true;
  }
  return false;
}

/**
 * First intersection of the ray origin + t*dir (t>0) with a convex polygon's
 * boundary, for an origin inside the polygon.
 */
export function rayExit(poly: readonly Point[], origin: Point, dir: Point): Point | undefined {
  let bestT = Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = dir.x * ey - dir.y * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a.x - origin.x) * ey - (a.y - origin.y) * ex) / den;
    const u = ((a.x - origin.x) * dir.y - (a.y - origin.y) * dir.x) / den;
    if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && t < bestT) bestT = t;
  }
  if (!Number.isFinite(bestT)) return undefined;
  return { x: origin.x + dir.x * bestT, y: origin.y + dir.y * bestT };
}

export function boxPolygon(b: Box): Point[] {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
}

export function boxesOverlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
