/**
 * Balloon placement: searches positions inside the panel for each text in
 * reading order, never covering a head, never overlapping another balloon,
 * keeping reading order (earlier = higher / toward the reading start), and
 * preferring the top band and short tails. Text is never shrunk below the
 * kind's minimum and never truncated: when nothing fits, the caller reports
 * TEXT_DOES_NOT_FIT.
 */
import type { Box, Point, TextKind } from "../contracts.js";
import {
  boxesOverlapArea,
  circleHitsConvex,
  convexOverlap,
  distPointSegment,
  insetConvex,
  insideConvex,
  rayExit,
  segmentHitsConvex,
} from "../layout/geometry.js";
import { measure } from "./fonts.js";
import { countWords } from "./breaking.js";
import { boundaryToward, gapTo, hullAt, layoutBalloon, type BalloonLayout, type TailSpec } from "./shapes.js";
import { KIND_STYLES } from "./styles.js";

export interface HeadCircle {
  character?: string;
  center: Point;
  radius: number;
}

export interface SpeakerAnchor {
  character: string;
  head: Point;
  headRadius: number;
  mouth: Point;
  body: Box;
}

export interface PlacementPanel {
  polygon: Point[];
  bbox: Box;
  heads: readonly HeadCircle[];
  bodies: readonly Box[];
  /** Key art that lettering should not cover (e.g. the insert prop). */
  obstacles?: readonly Box[];
  rtl: boolean;
}

export interface Placed {
  index: number;
  kind: TextKind;
  center: Point;
  layout: BalloonLayout;
  hull: Point[];
  box: Box;
  tail?: TailSpec;
  /** Placement cost (lower is better); used by the beam search. */
  cost: number;
}

export type TailTarget =
  | { type: "speaker"; anchor: SpeakerAnchor }
  | { type: "offpanel"; toward?: Point }
  | { type: "none" };

const HEAD_GAP = 6;
const BALLOON_GAP = 9;

function hullBox(hull: readonly Point[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of hull) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Candidate layouts (different line counts) for one text at one size. */
export function candidateLayouts(kind: TextKind, text: string, size: number, bbox: Box, rotate = 0): BalloonLayout[] {
  const style = KIND_STYLES[kind];
  const m = (s: string) => measure(s, style.face, size) * 1.02;
  const natural = m(text);
  const longestWord = Math.max(...text.split(/\s+/).filter(Boolean).map(m));
  const pad = 2 * style.padX * size;
  const maxAllowed = Math.max(size * 2, bbox.w * (kind === "sfx" ? 0.92 : 0.9) - pad - 12);
  // Never break inside a word unless the word alone is wider than the panel allows.
  const minWidth = Math.min(maxAllowed, longestWord + 0.5);
  const seen = new Set<string>();
  const out: BalloonLayout[] = [];
  const widths: number[] = [];
  if (kind === "narration" || kind === "caption") {
    for (const f of [0.92, 0.75, 0.6, 0.48, 0.38]) widths.push(bbox.w * f - pad - 20);
  }
  for (let k = 1; k <= 9; k += 1) widths.push((natural / k) * 1.08 + size * 0.4);
  for (const w0 of widths) {
    const w = Math.min(maxAllowed, Math.max(minWidth, w0));
    const layout = layoutBalloon(kind, text, size, w, rotate);
    if (!layout) continue;
    const key = layout.block.lines.join("\n");
    if (seen.has(key)) continue;
    seen.add(key);
    if (layout.hw * 2 > bbox.w - 8 || layout.hh * 2 > bbox.h - 8) continue;
    if (kind === "sfx" && layout.block.lines.length > 2) continue;
    out.push(layout);
  }
  return out;
}

/** Does `later` read after `earlier`? (LTR: lower, or same band and to the right.) */
export function readsAfter(earlier: Box, later: Box, rtl: boolean): boolean {
  if (later.y < earlier.y - 6) return false;
  const overlap = Math.min(earlier.y + earlier.h, later.y + later.h) - Math.max(earlier.y, later.y);
  const minH = Math.min(earlier.h, later.h);
  if (overlap > minH * 0.3) {
    const ec = earlier.x + earlier.w / 2;
    const lc = later.x + later.w / 2;
    return rtl ? lc <= ec : lc >= ec;
  }
  return true;
}

/** Tail tip for a speaker: where the line mouth→balloon leaves the head (plus a gap). */
export function speakerTip(anchor: SpeakerAnchor, from: Point): Point {
  const m = anchor.mouth;
  const dx = from.x - m.x;
  const dy = from.y - m.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const r = anchor.headRadius + Math.max(4, anchor.headRadius * 0.08);
  // solve |m + t u - h| = r for the exit t
  const ox = m.x - anchor.head.x;
  const oy = m.y - anchor.head.y;
  const b = ox * ux + oy * uy;
  const c = ox * ox + oy * oy - r * r;
  const disc = b * b - c;
  let t = 14;
  if (c < 0 && disc >= 0) {
    t = -b + Math.sqrt(disc);
  }
  // Stay near the mouth: never further than 1.25 head radii (+ gap) from it.
  t = Math.max(12, Math.min(t, anchor.headRadius * 1.25 + 10, len * 0.9));
  return { x: m.x + ux * t, y: m.y + uy * t };
}

/**
 * Where an off-panel tail ends: on the panel edge that faces the speaker
 * (the edge crossed by the ray from the panel centre toward `toward`), at the
 * point of that edge nearest the balloon; without a hint, the nearest side
 * edge. The tip sits just over the border line.
 */
export function offPanelTip(polygon: readonly Point[], bbox: Box, c: Point, toward?: Point): Point {
  const edges = polygon.map((a, i) => [a, polygon[(i + 1) % polygon.length]] as const);
  let edge: readonly [Point, Point] | undefined;
  if (toward) {
    const centre = { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 };
    const dx = toward.x - centre.x;
    const dy = toward.y - centre.y;
    const len = Math.hypot(dx, dy) || 1;
    const hit = rayExit(polygon, centre, { x: dx / len, y: dy / len });
    if (hit) {
      let best = Infinity;
      for (const e of edges) {
        const d = distPointSegment(hit, e[0], e[1]);
        if (d < best) {
          best = d;
          edge = e;
        }
      }
    }
  }
  if (!edge) {
    // nearest mostly-vertical (side) edge
    let best = Infinity;
    for (const e of edges) {
      const vertical = Math.abs(e[1].y - e[0].y) > Math.abs(e[1].x - e[0].x);
      const d = distPointSegment(c, e[0], e[1]) * (vertical ? 1 : 1.8);
      if (d < best) {
        best = d;
        edge = e;
      }
    }
  }
  if (!edge) return { x: c.x, y: c.y - 40 };
  const [a, b] = edge;
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const l2 = ex * ex + ey * ey || 1;
  // keep the tip away from the corners so it reads as "that side"
  const t = Math.max(0.12, Math.min(0.88, ((c.x - a.x) * ex + (c.y - a.y) * ey) / l2));
  const p = { x: a.x + ex * t, y: a.y + ey * t };
  // outward normal of a clockwise (y-down) polygon edge
  const el = Math.sqrt(l2);
  const ox = ey / el;
  const oy = -ex / el;
  return { x: p.x + ox * 3, y: p.y + oy * 3 };
}

export interface PlaceRequest {
  index: number;
  kind: TextKind;
  text: string;
  target: TailTarget;
  /** 0 when this is the first non-sfx text of the panel. */
  order: number;
  rotate?: number;
  /**
   * Where a narration/caption box wants to sit: tucked into the reading-start
   * corner, the reading-end corner (closing the panel), or flowing in reading
   * order like a balloon. Ignored for balloons and SFX.
   */
  boxAnchor?: "start" | "end" | "flow";
}

interface Scored {
  cost: number;
  center: Point;
  layout: BalloonLayout;
  hull: Point[];
  tail?: TailSpec;
}

function gridSteps(lo: number, hi: number, step: number): number[] {
  if (hi < lo) return [];
  const count = Math.max(1, Math.floor((hi - lo) / step));
  const out: number[] = [];
  for (let i = 0; i <= count; i += 1) out.push(lo + ((hi - lo) * i) / count);
  return out;
}

/**
 * How strictly to place: "strict" is the real rule set. The relaxed modes are
 * only used to draw an overflowing text for the preview after the
 * TEXT_DOES_NOT_FIT error has been recorded: "no_order" drops reading order,
 * "no_heads" also allows covering faces, "loose" also allows overlaps.
 */
export type PlaceMode = "strict" | "no_order" | "no_heads" | "loose";

/** Find the best position for one text (undefined when nothing fits). */
export function placeOne(
  req: PlaceRequest,
  panel: PlacementPanel,
  placed: readonly Placed[],
  sizes: readonly number[],
  mode: PlaceMode = "strict",
): Placed | undefined {
  return placeCandidates(req, panel, placed, sizes, mode, 1)[0];
}

/**
 * Up to `limit` good, mutually distinct positions for one text, best first,
 * at the largest font size that fits anywhere.
 */
export function placeCandidates(
  req: PlaceRequest,
  panel: PlacementPanel,
  placed: readonly Placed[],
  sizes: readonly number[],
  mode: PlaceMode = "strict",
  limit = 4,
): Placed[] {
  const { bbox } = panel;
  const isSfx = req.kind === "sfx";
  const isBox = req.kind === "narration" || req.kind === "caption";
  const margin = isSfx ? 4 : isBox ? 9 : 7;
  const inner = insetConvex(panel.polygon, margin);
  if (inner.length < 3) return [];
  const innerBox = hullBox(inner);
  const step = Math.max(6, Math.min(bbox.w, bbox.h) / 30);
  const priorOrdered = placed.filter((p) => p.kind !== "sfx");
  const checkHeads = mode === "strict" || mode === "no_order";
  const checkBalloons = mode !== "loose";
  const checkOrder = mode === "strict";

  for (const size of sizes) {
    const layouts = candidateLayouts(req.kind, req.text, size, bbox, req.rotate ?? 0);
    const found: Scored[] = [];
    for (const layout of layouts) {
      const xs = gridSteps(innerBox.x + layout.hw, innerBox.x + innerBox.w - layout.hw, step);
      const ys = gridSteps(innerBox.y + layout.hh, innerBox.y + innerBox.h - layout.hh, step);
      for (const y of ys) {
        for (const x of xs) {
          const center = { x, y };
          const hull = hullAt(layout, center);
          if (!hull.every((p) => insideConvex(inner, p))) continue;
          const hb = hullBox(hull);
          let blocked = false;
          if (checkHeads) {
            for (const h of panel.heads) {
              const r = h.radius + HEAD_GAP;
              if (h.center.x + r < hb.x || h.center.x - r > hb.x + hb.w || h.center.y + r < hb.y || h.center.y - r > hb.y + hb.h) continue;
              if (circleHitsConvex(h.center, r, hull)) {
                blocked = true;
                break;
              }
            }
            if (blocked) continue;
          }
          if (checkBalloons) {
            for (const p of placed) {
              const g = BALLOON_GAP;
              if (p.box.x - g > hb.x + hb.w || p.box.x + p.box.w + g < hb.x || p.box.y - g > hb.y + hb.h || p.box.y + p.box.h + g < hb.y) continue;
              if (convexOverlap(hull, p.hull, g)) {
                blocked = true;
                break;
              }
            }
            if (blocked) continue;
          }
          if (checkOrder && !isSfx) {
            for (const p of priorOrdered) {
              if (!readsAfter(p.box, hb, panel.rtl)) {
                blocked = true;
                break;
              }
            }
            if (blocked) continue;
          }
          found.push(score(req, layout, center, hull, hb, panel, placed));
        }
      }
    }
    if (found.length === 0) continue;
    found.sort((a, b) => a.cost - b.cost || a.center.y - b.center.y || a.center.x - b.center.x);
    const picked: Scored[] = [];
    for (const f of found) {
      const distinct = picked.every(
        (p) => p.layout.block.lines.length !== f.layout.block.lines.length || Math.hypot(p.center.x - f.center.x, p.center.y - f.center.y) > 60,
      );
      if (distinct) picked.push(f);
      if (picked.length >= limit) break;
    }
    return picked.map((best) => ({
      index: req.index,
      kind: req.kind,
      center: best.center,
      layout: best.layout,
      hull: best.hull,
      box: hullBox(best.hull),
      tail: best.tail,
      cost: best.cost,
    }));
  }
  return [];
}

function score(
  req: PlaceRequest,
  layout: BalloonLayout,
  center: Point,
  hull: Point[],
  hb: Box,
  panel: PlacementPanel,
  placed: readonly Placed[],
): Scored {
  const { bbox, rtl } = panel;
  const xRel = (center.x - bbox.x) / bbox.w;
  const readX = rtl ? 1 - xRel : xRel;
  const topRel = (hb.y - bbox.y) / bbox.h;
  const area = hb.w * hb.h;
  let cost = 0;
  let tail: TailSpec | undefined;

  if (req.kind === "sfx") {
    const cyRel = (center.y - bbox.y) / bbox.h;
    cost += 40 * Math.abs(cyRel - 0.62) + 18 * Math.abs(xRel - 0.5);
    for (const b of panel.bodies) cost += (30 * boxesOverlapArea(hb, b)) / Math.max(1, area);
    for (const b of panel.obstacles ?? []) cost += (60 * boxesOverlapArea(hb, b)) / Math.max(1, area);
    return { cost, center, layout, hull };
  }

  if (req.kind === "narration" || req.kind === "caption") {
    const anchor = req.boxAnchor ?? "start";
    if (anchor === "start") {
      const cornerX = rtl ? bbox.x + bbox.w - (hb.x + hb.w) : hb.x - bbox.x;
      cost += 0.9 * cornerX + 1.2 * (hb.y - bbox.y);
    } else if (anchor === "end") {
      const cornerX = rtl ? hb.x - bbox.x : bbox.x + bbox.w - (hb.x + hb.w);
      cost += 0.9 * cornerX + 1.2 * (bbox.y + bbox.h - (hb.y + hb.h));
    } else {
      // flow: next in reading order, as high as the order allows, against a side
      const side = Math.min(hb.x - bbox.x, bbox.x + bbox.w - (hb.x + hb.w));
      cost += 90 * topRel + 0.4 * side;
    }
    cost += 60 * Math.max(0, hb.w / bbox.w - 0.66);
    cost += 2 * (layout.block.lines.length - 1) + 3 * Math.max(0, layout.block.lines.length - 3) ** 2;
    for (const b of panel.bodies) cost += (25 * boxesOverlapArea(hb, b)) / Math.max(1, area);
    for (const b of panel.obstacles ?? []) cost += (70 * boxesOverlapArea(hb, b)) / Math.max(1, area);
    return { cost, center, layout, hull };
  }

  // speaking balloons: top band first, then short sensible tails
  cost += 90 * topRel;
  if (req.order === 0) cost += 10 * readX;
  const aspect = hb.w / Math.max(1, hb.h);
  cost += 14 * Math.max(0, Math.abs(Math.log(aspect / 1.6)) - 0.3);
  const lines = layout.block.lines;
  if (lines.length > 1 && countWords(req.text) >= 3) {
    // a lone short word on a line reads as a stutter
    for (const l of lines) if (!l.includes(" ")) cost += 5;
  }
  cost += 3 * Math.max(0, lines.length - 4);
  for (const b of panel.bodies) cost += (22 * boxesOverlapArea(hb, b)) / Math.max(1, area);
  for (const b of panel.obstacles ?? []) cost += (70 * boxesOverlapArea(hb, b)) / Math.max(1, area);

  if (req.target.type === "speaker") {
    const anchor = req.target.anchor;
    const tip = speakerTip(anchor, center);
    const len = gapTo(layout, center, tip);
    cost += 0.05 * len + 0.3 * Math.max(0, len - 120) + 4 * Math.max(0, 16 - len);
    cost += 0.06 * Math.abs(center.x - anchor.head.x);
    // tail must not pass through other faces or balloons
    const base = boundaryToward(layout, center, tip);
    for (const h of panel.heads) {
      if (h.character === anchor.character) continue;
      if (distPointSegment(h.center, base, tip) < h.radius) cost += 400;
    }
    for (const p of placed) {
      if (segmentHitsConvex(base, tip, p.hull)) cost += 300;
      if (p.tail) {
        const pb = boundaryToward(p.layout, p.center, p.tail.tip);
        if (segmentHitsConvex(pb, p.tail.tip, hull)) cost += 300;
      }
    }
    // tails pointing up into a balloon read badly: prefer balloons above/beside the head
    if (tip.y < center.y - layout.hh * 0.2 && tip.y < hb.y) cost += 40;
    tail = { tip, offPanel: false };
  } else if (req.target.type === "offpanel") {
    const tip = offPanelTip(panel.polygon, bbox, center, req.target.toward);
    const len = gapTo(layout, center, tip);
    cost += 0.9 * Math.max(0, len - 18);
    const base = boundaryToward(layout, center, tip);
    for (const p of placed) {
      if (segmentHitsConvex(base, tip, p.hull)) cost += 300;
    }
    for (const h of panel.heads) {
      if (distPointSegment(h.center, base, tip) < h.radius) cost += 400;
    }
    tail = { tip, offPanel: true };
  }
  return { cost, center, layout, hull, tail };
}
