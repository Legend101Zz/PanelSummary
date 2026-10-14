/**
 * The name tag of a neutral prop (PropSpec.label, v0.3 #81): a small caption box
 * beside the prop, drawn with the lettering code and fonts of the name tags of
 * characters. It sits clear of every face and of the prop itself; it may lean on
 * a body, never on a head. Placement is deterministic: the first of a fixed list
 * of positions (below, above, right, left, then the corners) with the lowest cost.
 */
import type { Box, Point } from "../contracts.js";
import { layoutBalloon, drawBalloon } from "../lettering/shapes.js";
import { minFontSize } from "../lettering/styles.js";
import { mulberry32 } from "../prng.js";

export interface LabelContext {
  /** The panel's box (the tag stays inside it). */
  panel: Box;
  /** Heads that the tag never covers. */
  heads: readonly { center: Point; radius: number }[];
  /** Body boxes (lightly avoided). */
  bodies: readonly Box[];
  /** Other props and tags already placed (avoided strongly). */
  taken: readonly Box[];
  seed: number;
}

export interface PlacedLabel {
  svg: string;
  box: Box;
}

const GAP = 6;

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function circleHitsBox(c: Point, r: number, b: Box): boolean {
  const dx = Math.max(b.x - c.x, 0, c.x - (b.x + b.w));
  const dy = Math.max(b.y - c.y, 0, c.y - (b.y + b.h));
  return Math.hypot(dx, dy) < r;
}

/** The tag for `text` beside `prop`, or null when no position keeps it inside the panel and off every face. */
export function placePropLabel(text: string, prop: Box, ctx: LabelContext): PlacedLabel | null {
  const size = minFontSize("caption");
  const maxWidth = Math.max(80, Math.min(300, ctx.panel.w * 0.6));
  const layout = layoutBalloon("caption", text, size, maxWidth);
  if (!layout) return null;
  const hw = layout.hw;
  const hh = layout.hh;
  const cx = prop.x + prop.w / 2;
  const cy = prop.y + prop.h / 2;
  const candidates: Point[] = [
    { x: cx, y: prop.y + prop.h + GAP + hh },
    { x: cx, y: prop.y - GAP - hh },
    { x: prop.x + prop.w + GAP + hw, y: cy },
    { x: prop.x - GAP - hw, y: cy },
    { x: prop.x + prop.w + GAP + hw, y: prop.y - GAP - hh },
    { x: prop.x - GAP - hw, y: prop.y - GAP - hh },
    { x: prop.x + prop.w + GAP + hw, y: prop.y + prop.h + GAP + hh },
    { x: prop.x - GAP - hw, y: prop.y + prop.h + GAP + hh },
  ];
  const p = ctx.panel;
  let best: { c: Point; cost: number } | undefined;
  candidates.forEach((c, i) => {
    // keep the whole tag inside the panel (a little inset); shift along the edge instead of leaving it
    const x = Math.min(p.x + p.w - hw - 4, Math.max(p.x + hw + 4, c.x));
    const y = Math.min(p.y + p.h - hh - 4, Math.max(p.y + hh + 4, c.y));
    const box: Box = { x: x - hw, y: y - hh, w: hw * 2, h: hh * 2 };
    if (box.x < p.x || box.y < p.y || box.x + box.w > p.x + p.w || box.y + box.h > p.y + p.h) return;
    if (overlap(box, prop) > 0) return;
    if (ctx.heads.some((h) => circleHitsBox(h.center, h.radius, box))) return;
    let cost = i * 4 + Math.hypot(x - c.x, y - c.y) * 0.5;
    for (const b of ctx.bodies) cost += (60 * overlap(box, b)) / Math.max(1, box.w * box.h);
    for (const t of ctx.taken) cost += (300 * overlap(box, t)) / Math.max(1, box.w * box.h);
    if (!best || cost < best.cost - 1e-9) best = { c: { x, y }, cost };
  });
  if (!best) return null;
  const c = best.c;
  return {
    svg: drawBalloon(layout, c, undefined, mulberry32(ctx.seed)),
    box: { x: c.x - hw, y: c.y - hh, w: hw * 2, h: hh * 2 },
  };
}
