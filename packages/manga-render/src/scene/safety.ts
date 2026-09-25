/**
 * Face safety: no figure may cover another figure's head. The composer
 * places figures, then checks every figure drawn LATER (on top) against the
 * heads of the figures drawn before it and shifts the later figure sideways
 * until the face is clear. Shifts are deterministic (slot direction first).
 */
import type { Box, Point } from "../contracts.js";

export interface Placement {
  head: Point;
  r: number;
  body: Box;
}

/**
 * Share of a head circle (0..1) covered by a box, sampled on a fixed 9×9
 * grid. With `faceOnly`, only the face (below the top 30% of the circle,
 * where hair and hats are) counts.
 */
export function circleCoverage(c: Point, r: number, b: Box, faceOnly = false): number {
  if (b.x > c.x + r || b.x + b.w < c.x - r || b.y > c.y + r || b.y + b.h < c.y - r) return 0;
  let inside = 0;
  let total = 0;
  const steps = 9;
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const x = c.x + r * (((i + 0.5) / steps) * 2 - 1);
      const y = c.y + r * (((j + 0.5) / steps) * 2 - 1);
      if ((x - c.x) ** 2 + (y - c.y) ** 2 > r * r) continue;
      if (faceOnly && y < c.y - r * 0.4) continue;
      total += 1;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) inside += 1;
    }
  }
  return total ? inside / total : 0;
}

/** Body boxes are loose (arms, wings, tails): shrink them a little before testing faces. */
export function coreBox(b: Box, head: Point, r: number): Box {
  // keep the head region itself; trim the sides by 8%
  const dx = b.w * 0.08;
  const x0 = Math.min(b.x + dx, head.x - r);
  const x1 = Math.max(b.x + b.w - dx, head.x + r);
  return { x: x0, y: b.y, w: x1 - x0, h: b.h };
}

/** Does `later` (drawn on top) cover the face of `earlier`? */
export function covers(later: Placement, earlier: Placement, threshold = 0.22): boolean {
  const d = Math.hypot(later.head.x - earlier.head.x, later.head.y - earlier.head.y);
  if (d < (later.r + earlier.r) * 0.92) return true;
  const core = coreBox(later.body, later.head, later.r);
  return circleCoverage(earlier.head, earlier.r, core) > threshold || circleCoverage(earlier.head, earlier.r, core, true) > threshold * 0.6;
}

/**
 * Horizontal shift that clears `later` off `earlier`'s face, in direction
 * `dir` (+1 right, -1 left). Returns the smallest such shift (page units).
 */
export function clearShift(later: Placement, earlier: Placement, dir: 1 | -1, gap = 4): number {
  const core = coreBox(later.body, later.head, later.r);
  // body box edge past the earlier head circle
  const bodyShift = dir > 0 ? earlier.head.x + earlier.r + gap - core.x : core.x + core.w - (earlier.head.x - earlier.r - gap);
  // head-to-head separation
  const dy = later.head.y - earlier.head.y;
  const need = later.r + earlier.r + gap;
  const dxHead = Math.sqrt(Math.max(0, need * need - dy * dy));
  const headShift = dir > 0 ? earlier.head.x + dxHead - later.head.x : later.head.x - (earlier.head.x - dxHead);
  // the body test is only needed when the body actually reaches the head's height
  const bodyReaches = core.y <= earlier.head.y + earlier.r && core.y + core.h >= earlier.head.y - earlier.r;
  return Math.max(0, headShift, bodyReaches ? bodyShift : 0);
}

export function shifted(p: Placement, dx: number): Placement {
  return { head: { x: p.head.x + dx, y: p.head.y }, r: p.r, body: { ...p.body, x: p.body.x + dx } };
}
