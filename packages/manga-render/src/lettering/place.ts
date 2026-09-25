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
  segmentsIntersect,
} from "../layout/geometry.js";
import { measure } from "./fonts.js";
import { countWords } from "./breaking.js";
import { boundaryToward, gapTo, hullAt, layoutBalloon, type BalloonLayout, type TailSpec } from "./shapes.js";
import { KIND_STYLES, MAX_BALLOON_LINES, TAIL_REACH } from "./styles.js";

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
  /** Pose drawn (for reading the figure's gesture); optional. */
  pose?: string;
}

export interface PlacementPanel {
  polygon: Point[];
  bbox: Box;
  heads: readonly HeadCircle[];
  bodies: readonly Box[];
  /** Key art that lettering should not cover (e.g. the insert prop). */
  obstacles?: readonly Box[];
  rtl: boolean;
  /** Every figure in the panel (thought trails avoid the ones that are not thinking). */
  figures?: readonly SpeakerAnchor[];
  /** SFX may cross the panel border (the panel has impact_burst or speed_lines). */
  sfxBleed?: boolean;
  /** Where the action is (the main figure's head or the insert's subject), for SFX. */
  focus?: Point;
  /** Key props (the beat's object, the insert's subject): no text may cover them. */
  keepOut?: readonly Box[];
  /** Treat keepOut as a (very) costly overlap instead of a hard rule (after the hard rule failed). */
  keepOutSoft?: boolean;
  /** Where the panel's sound comes from: an SFX sits beside it, never on it. */
  sfxSource?: { point: Point; box: Box };
  /** The page's live area: an SFX that breaks its border never leaves it. */
  page?: Box;
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
  /** A name-tag caption: sits by its character, outside the reading-order flow. */
  label?: boolean;
  /** Index of the previous balloon this one is connected to (same speaker). */
  connectTo?: number;
}

export type TailTarget =
  | { type: "speaker"; anchor: SpeakerAnchor }
  | { type: "offpanel"; toward?: Point }
  | { type: "none" };

const HEAD_GAP = 6;
/** Boxes (narration, captions, name tags) keep further off faces than balloons. */
const BOX_HEAD_GAP = 12;
const BALLOON_GAP = 9;
/** Balloons may butt against the panel border; a slightly inset spot is preferred when free. */
const BALLOON_MARGIN = 3;
const BOX_MARGIN = 6;
const PREFERRED_INSET = 10;

/** Axis-aligned rectangle test (most panels): containment is then a bbox test. */
function axisRect(poly: readonly Point[]): Box | undefined {
  if (poly.length !== 4) return undefined;
  const xs = new Set(poly.map((p) => Math.round(p.x * 1000)));
  const ys = new Set(poly.map((p) => Math.round(p.y * 1000)));
  if (xs.size !== 2 || ys.size !== 2) return undefined;
  return hullBox(poly);
}

function boxInside(inner: Box, b: Box): boolean {
  return b.x >= inner.x - 1e-6 && b.y >= inner.y - 1e-6 && b.x + b.w <= inner.x + inner.w + 1e-6 && b.y + b.h <= inner.y + inner.h + 1e-6;
}

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

/** Candidate layouts (different line counts) for one text at one size. `oneLine` keeps a title on one line. */
export function candidateLayouts(kind: TextKind, text: string, size: number, bbox: Box, rotate = 0, oneLine = false): BalloonLayout[] {
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
  if (oneLine) {
    widths.push(natural * 1.04 + size * 0.4);
  } else {
    if (kind === "narration" || kind === "caption") {
      for (const f of [0.92, 0.75, 0.6, 0.48, 0.38]) widths.push(bbox.w * f - pad - 20);
    }
    for (let k = 1; k <= 9; k += 1) widths.push((natural / k) * 1.08 + size * 0.4);
  }
  for (const w0 of widths) {
    const w = Math.min(maxAllowed, Math.max(minWidth, w0));
    const layout = layoutBalloon(kind, text, size, w, rotate);
    if (!layout) continue;
    const key = layout.block.lines.join("\n");
    if (seen.has(key)) continue;
    seen.add(key);
    if (layout.hw * 2 > bbox.w - 8 || layout.hh * 2 > bbox.h - 8) continue;
    if (kind === "sfx" && layout.block.lines.length > 2) continue;
    if (oneLine && layout.block.lines.length > 1) continue;
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

export interface TailGeometry {
  tip: Point;
  /** Distance from the balloon edge to the speaker's head (circle + gap) along the tail line. */
  free: number;
  /** Distance from the balloon edge to the mouth. */
  gap: number;
}

/**
 * Where a speaker's voice comes from, seen from a balloon edge point: just
 * outside the head outline at mouth height, on the balloon's side of the face
 * (a tail aimed at the mouth from above would otherwise end on the crown or
 * the hat).
 */
export function voicePoint(anchor: SpeakerAnchor, from: Point, flip = false): Point {
  const h = anchor.head;
  const m = anchor.mouth;
  const r = anchor.headRadius;
  const dx = from.x - h.x;
  // a balloon straight above or below keeps the mouth's own side of the face
  let side = Math.abs(dx) > r * 0.4 ? Math.sign(dx) : Math.sign(m.x - h.x) || Math.sign(dx) || 1;
  if (flip) side = -side;
  const y = clamp(m.y, h.y - r * 0.2, h.y + r * 0.95);
  return { x: h.x + side * (r + Math.max(4, r * 0.1)), y };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Tail for a speaker, from the balloon edge point `from` toward the voice
 * point beside the mouth: the tip stops TAIL_REACH (about 55%) of the way,
 * and never inside the head (its circle plus a small gap), so a tail points
 * at the speaker's mouth from about halfway out and never runs into a hat or
 * a face.
 */
export function tailToward(anchor: SpeakerAnchor, from: Point, target?: Point): TailGeometry {
  const m = target ?? voicePoint(anchor, from);
  const dx = m.x - from.x;
  const dy = m.y - from.y;
  const gap = Math.hypot(dx, dy) || 1;
  const ux = dx / gap;
  const uy = dy / gap;
  const r = anchor.headRadius + Math.max(4, anchor.headRadius * 0.08);
  const ox = from.x - anchor.head.x;
  const oy = from.y - anchor.head.y;
  const b = ox * ux + oy * uy;
  const c = ox * ox + oy * oy - r * r;
  const disc = b * b - c;
  let free = gap;
  if (c <= 0) free = 0;
  else if (disc >= 0) {
    const enter = -b - Math.sqrt(disc);
    if (enter >= 0) free = Math.min(gap, enter);
  }
  // about halfway, but a long tail (a tall panel) still ends near its speaker
  const near = Math.max(70, anchor.headRadius * 2.6);
  let t = Math.min(Math.max(gap * TAIL_REACH, gap - near), free);
  t = Math.max(t, Math.min(14, gap * 0.5));
  return { tip: { x: from.x + ux * t, y: from.y + uy * t }, free, gap };
}

/**
 * End of a thought trail: just outside the thinker's head on the side facing
 * the balloon, so the trail of bubbles runs all the way to its own thinker.
 */
export function thoughtTip(anchor: SpeakerAnchor, from: Point): Point {
  const h = anchor.head;
  const dx = from.x - h.x;
  const dy = from.y - h.y;
  const d = Math.hypot(dx, dy) || 1;
  const reach = Math.min(d * 0.85, anchor.headRadius * 1.2 + 8);
  return { x: h.x + (dx / d) * reach, y: h.y + (dy / d) * reach };
}

/** Tail tip for a speaker from a balloon edge point (see tailToward). */
export function speakerTip(anchor: SpeakerAnchor, from: Point): Point {
  return tailToward(anchor, from).tip;
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
  /** Name tag: a caption placed beside this head, outside the reading-order flow. */
  label?: HeadCircle;
  /** Connected balloon: joins this earlier balloon of the same speaker (no tail of its own). */
  connect?: Placed;
  /** SFX only: allow overlapping key art (with a high cost) when nothing else fits. */
  softObstacles?: boolean;
  /** A title caption (a section's name): one line, at the top of the panel. */
  title?: boolean;
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
  const bleed = isSfx && panel.sfxBleed === true;
  const margin = isSfx ? (bleed ? -22 : 4) : isBox ? BOX_MARGIN : BALLOON_MARGIN;
  const inner = insetConvex(panel.polygon, margin);
  if (inner.length < 3) return [];
  const preferred = isSfx ? inner : insetConvex(panel.polygon, PREFERRED_INSET);
  const innerBox = hullBox(inner);
  const innerRect = axisRect(inner);
  const preferredRect = axisRect(preferred);
  const step = Math.max(6, Math.min(bbox.w, bbox.h) / 30);
  const priorOrdered = placed.filter((p) => p.kind !== "sfx" && !p.label);
  const checkHeads = mode === "strict" || mode === "no_order";
  const checkBalloons = mode !== "loose";
  const checkOrder = mode === "strict" && !req.label;
  const headGap = isBox ? BOX_HEAD_GAP : HEAD_GAP;
  const hardKeepOut = mode === "strict" && panel.keepOutSoft !== true && !(isSfx && req.softObstacles);
  const keepOut = panel.keepOut ?? [];
  // a bleeding SFX stays in the page's live area and mostly in its own panel
  const pageBox = panel.page;
  const sourceCore = isSfx && panel.sfxSource ? shrinkBox(panel.sfxSource.box, 0.12) : undefined;

  /** Candidates from larger sizes that only fit badly (a tail across a face, a misattributed balloon). */
  let fallback: Scored[] = [];
  for (let si = 0; si < sizes.length; si += 1) {
    const size = sizes[si];
    const layouts = candidateLayouts(req.kind, req.text, size, bbox, req.rotate ?? 0, req.title === true);
    const found: Scored[] = [...fallback];
    for (const layout of layouts) {
      const xs = gridSteps(innerBox.x + layout.hw, innerBox.x + innerBox.w - layout.hw, step);
      const ys = gridSteps(innerBox.y + layout.hh, innerBox.y + innerBox.h - layout.hh, step);
      for (const y of ys) {
        for (const x of xs) {
          const center = { x, y };
          const hull = hullAt(layout, center);
          const hb = hullBox(hull);
          if (innerRect ? !boxInside(innerRect, hb) : !hull.every((p) => insideConvex(inner, p))) continue;
          if (bleed) {
            if (!insideConvex(panel.polygon, center)) continue;
            if (pageBox && !boxInside(pageBox, hb)) continue;
            if (boxesOverlapArea(hb, bbox) < 0.75 * hb.w * hb.h) continue;
          }
          let blocked = false;
          if (checkHeads) {
            for (const h of panel.heads) {
              if (faceHit(h, hull, hb, headGap)) {
                blocked = true;
                break;
              }
            }
            if (blocked) continue;
          }
          if (hardKeepOut) {
            // key props (the object of the beat) are never covered by text
            for (const o of keepOut) {
              if (boxesOverlapArea(hb, { x: o.x - 3, y: o.y - 3, w: o.w + 6, h: o.h + 6 }) > 0 && convexOverlap(hull, boxCorners(o), 3)) {
                blocked = true;
                break;
              }
            }
            if (blocked) continue;
          }
          if (isSfx && mode === "strict" && !req.softObstacles) {
            // never over an insert's subject (or other key art), never on the sound's source
            for (const o of panel.obstacles ?? []) {
              if (boxesOverlapArea(hb, { x: o.x - 4, y: o.y - 4, w: o.w + 8, h: o.h + 8 }) > 0) {
                blocked = true;
                break;
              }
            }
            if (!blocked && sourceCore && boxesOverlapArea(hb, sourceCore) > 0.08 * Math.min(hb.w * hb.h, sourceCore.w * sourceCore.h)) blocked = true;
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
          const scored = score(req, layout, center, hull, hb, panel, placed);
          // butting against the border is allowed, a free inset spot is preferred
          if (!isSfx && !(preferredRect ? boxInside(preferredRect, hb) : preferred.length >= 3 && hull.every((p) => insideConvex(preferred, p)))) scored.cost += 5;
          // a smaller size costs a little (consistent lettering)
          scored.cost += 6 * si;
          found.push(scored);
        }
      }
    }
    if (found.length === 0) continue;
    found.sort((a, b) => a.cost - b.cost || a.center.y - b.center.y || a.center.x - b.center.x);
    // only bad spots at this size (a tail over a face, a line that reads as someone else's):
    // try the next size down before settling
    if (found[0].cost >= 350 && si < sizes.length - 1 && !isSfx) {
      fallback = found.slice(0, 16);
      continue;
    }
    const picked: Scored[] = [];
    for (const f of found) {
      const distinct = picked.every(
        (p) => p.layout.block.lines.length !== f.layout.block.lines.length || Math.hypot(p.center.x - f.center.x, p.center.y - f.center.y) > 60,
      );
      if (distinct) picked.push(f);
      if (picked.length >= limit) break;
    }
    fallback = [];
    return picked.map((best) => {
      const out: Placed = {
        index: req.index,
        kind: req.kind,
        center: best.center,
        layout: best.layout,
        hull: best.hull,
        box: hullBox(best.hull),
        tail: best.tail,
        cost: best.cost,
      };
      if (req.label) out.label = true;
      if (req.connect) out.connectTo = req.connect.index;
      return out;
    });
  }
  if (fallback.length > 0) {
    // nothing better at any size: the least bad spot
    return fallback.slice(0, limit).map((best) => {
      const out: Placed = { index: req.index, kind: req.kind, center: best.center, layout: best.layout, hull: best.hull, box: hullBox(best.hull), tail: best.tail, cost: best.cost };
      if (req.label) out.label = true;
      if (req.connect) out.connectTo = req.connect.index;
      return out;
    });
  }
  return [];
}

function shrinkBox(b: Box, k: number): Box {
  return { x: b.x + b.w * k, y: b.y + b.h * k, w: b.w * (1 - 2 * k), h: b.h * (1 - 2 * k) };
}

function boxCorners(b: Box): Point[] {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
}

/**
 * Does a balloon hull cover a face? The face is the head circle (plus a gap)
 * and a chin zone below it, so a burst or a big balloon never sits on the
 * lower face in a close-up.
 */
export function faceHit(h: HeadCircle, hull: readonly Point[], hb: Box, gap = HEAD_GAP): boolean {
  const r = h.radius + gap;
  const chin = { x: h.center.x, y: h.center.y + h.radius * 0.72 };
  const rc = h.radius * 0.62 + gap * 0.5;
  const top = h.center.y - r;
  const bottom = Math.max(h.center.y + r, chin.y + rc);
  if (h.center.x + r < hb.x || h.center.x - r > hb.x + hb.w || bottom < hb.y || top > hb.y + hb.h) return false;
  return circleHitsConvex(h.center, r, hull) || circleHitsConvex(chin, rc, hull);
}

function boxGap(a: Box, b: Box): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}

function circleBoxGap(c: Point, r: number, b: Box): number {
  const dx = Math.max(b.x - c.x, 0, c.x - (b.x + b.w));
  const dy = Math.max(b.y - c.y, 0, c.y - (b.y + b.h));
  return Math.max(0, Math.hypot(dx, dy) - r);
}

function segmentHitsBox(a: Point, b: Point, box: Box): boolean {
  const poly = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ];
  return segmentHitsConvex(a, b, poly);
}

/** The drawn tail as a segment (balloon edge → tip), for crossing tests. */
export function tailSegment(p: Placed): [Point, Point] | undefined {
  if (!p.tail) return undefined;
  return [boundaryToward(p.layout, p.center, p.tail.tip), p.tail.tip];
}

/** The whole line a tail points along (balloon edge → the speaker): a box on it reads as the tail's target. */
export function tailLine(p: Placed): [Point, Point] | undefined {
  if (!p.tail) return undefined;
  return [boundaryToward(p.layout, p.center, p.tail.tip), p.tail.aim ?? p.tail.tip];
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
  const cover = (boxes: readonly Box[] | undefined, weight: number) => {
    let c = 0;
    for (const b of boxes ?? []) c += (weight * boxesOverlapArea(hb, b)) / Math.max(1, area);
    return c;
  };
  /** Small key things (a hat, a gesturing hand, the statue on its column): cost by how much OF THEM is covered. */
  const hide = (boxes: readonly Box[] | undefined, weight: number) => {
    let c = 0;
    for (const b of boxes ?? []) c += (weight * boxesOverlapArea(hb, b)) / Math.max(1, b.w * b.h);
    return c;
  };
  /** Tails already drawn that this text would sit on (or between a tail and its speaker). */
  const onTails = () => {
    let c = 0;
    for (const p of placed) {
      const seg = tailLine(p);
      if (seg && segmentHitsConvex(seg[0], seg[1], hull)) c += 300;
    }
    return c;
  };
  // key props: a hard rule in strict mode; a heavy cost when it had to be relaxed
  cost += cover(panel.keepOut, 400);

  if (req.kind === "sfx") {
    // the largest free area near the source of the sound: clear of faces, figures and balloons
    let clear = 160;
    for (const h of panel.heads) clear = Math.min(clear, circleBoxGap(h.center, h.radius, hb));
    for (const p of placed) clear = Math.min(clear, boxGap(hb, p.box));
    cost -= 0.22 * clear;
    const cyRel = (center.y - bbox.y) / bbox.h;
    const posWeight = panel.sfxSource ? 0.4 : 1;
    cost += posWeight * (16 * Math.abs(cyRel - 0.58) + 8 * Math.abs(xRel - 0.5));
    cost += cover(panel.bodies, 200);
    cost += cover(panel.obstacles, 80) + hide(panel.obstacles, 60);
    cost += onTails();
    if (panel.sfxSource) {
      // beside what makes the sound (the flapping bird), not across the panel from it
      cost += 0.35 * boxGap(hb, panel.sfxSource.box);
    } else if (panel.focus) cost += (0.05 * Math.hypot(center.x - panel.focus.x, center.y - panel.focus.y) * 400) / Math.max(200, bbox.w);
    return { cost, center, layout, hull };
  }

  if (req.label) {
    // a name tag sits by its character's head: above it, or beside it
    const h = req.label;
    const g = h.radius + 10;
    const above = { x: h.center.x, y: h.center.y - g - layout.hh };
    const left = { x: h.center.x - g - layout.hw, y: h.center.y - h.radius * 0.3 };
    const right = { x: h.center.x + g + layout.hw, y: h.center.y - h.radius * 0.3 };
    const d = (q: Point) => Math.hypot(center.x - q.x, center.y - q.y);
    cost += 0.7 * Math.min(d(above), d(left) + 14, d(right) + 14);
    // a name tag is one short line
    cost += 30 * (layout.block.lines.length - 1);
    // it names ITS character: nearer that face than any other, and clear of other faces
    const own = circleBoxGap(h.center, h.radius, hb);
    for (const o of panel.heads) {
      if (o === h || (o.character !== undefined && o.character === h.character)) continue;
      const og = circleBoxGap(o.center, o.radius, hb);
      if (og < own + 6) cost += 220;
      if (og < 16) cost += 120;
    }
    // over its own character's body is fine; across someone else's it names them
    if (panel.figures && panel.figures.length > 0) {
      for (const f of panel.figures) cost += ((f.character === h.character ? 20 : 220) * boxesOverlapArea(hb, f.body)) / Math.max(1, area);
    } else cost += cover(panel.bodies, 20);
    cost += cover(panel.obstacles, 90) + hide(panel.obstacles, 90);
    cost += onTails();
    return { cost, center, layout, hull };
  }

  const lines = layout.block.lines;
  if (req.kind === "narration" || req.kind === "caption") {
    const anchor = req.title ? "start" : (req.boxAnchor ?? "start");
    // corner pulls are relative to the panel, so an empty region beats covering a figure
    const norm = 260 / Math.max(1, bbox.w + bbox.h);
    if (anchor === "start") {
      const cornerX = rtl ? bbox.x + bbox.w - (hb.x + hb.w) : hb.x - bbox.x;
      cost += norm * (0.9 * cornerX + 1.2 * (hb.y - bbox.y));
    } else if (anchor === "end") {
      const cornerX = rtl ? hb.x - bbox.x : bbox.x + bbox.w - (hb.x + hb.w);
      cost += norm * (0.9 * cornerX + 1.2 * (bbox.y + bbox.h - (hb.y + hb.h)));
    } else {
      // flow: next in reading order, as high as the order allows, against a side
      const side = Math.min(hb.x - bbox.x, bbox.x + bbox.w - (hb.x + hb.w));
      cost += 90 * topRel + 0.4 * side;
    }
    // a title sits on the top edge
    if (req.title) cost += 3 * (hb.y - bbox.y);
    cost += 60 * Math.max(0, hb.w / bbox.w - 0.66);
    cost += 2 * (lines.length - 1) + 3 * Math.max(0, lines.length - 3) ** 2 + 20 * Math.max(0, lines.length - MAX_BALLOON_LINES);
    // no narrow towers of one-word lines
    if (lines.length > 1 && countWords(req.text) >= 4) {
      for (const l of lines) if (!l.includes(" ")) cost += 9;
    }
    cost += 25 * Math.max(0, 1.3 - hb.w / Math.max(1, hb.h));
    cost += cover(panel.bodies, 220);
    cost += cover(panel.obstacles, 120) + hide(panel.obstacles, 90);
    cost += onTails();
    return { cost, center, layout, hull };
  }

  // speaking balloons: top band first (tall panels open at the top), then short sensible tails
  const tall = Math.max(0, Math.min(1, (bbox.h / Math.max(1, bbox.w) - 1.3) / 0.9));
  cost += (90 + (req.order === 0 ? 120 : 40) * tall) * topRel;
  if (req.order === 0) cost += 10 * readX;
  const aspect = hb.w / Math.max(1, hb.h);
  cost += 14 * Math.max(0, Math.abs(Math.log(aspect / 1.6)) - 0.3);
  // widen before stacking: a tall column of short lines reads badly
  cost += 30 * Math.max(0, 1.05 - aspect);
  const words = countWords(req.text);
  if (lines.length > 1 && words >= 3) {
    for (const l of lines) {
      const w = l.split(" ").filter(Boolean).length;
      // widows: a lone word, or two words on a line of a longer balloon
      if (w === 1) cost += 7;
      else if (w === 2 && words >= 7) cost += 3;
    }
  }
  cost += 3 * Math.max(0, lines.length - 3) + 40 * Math.max(0, lines.length - MAX_BALLOON_LINES);
  // a balloon may lean on its own speaker's body; over someone else's it reads badly
  const speakerId = req.target.type === "speaker" ? req.target.anchor.character : undefined;
  if (panel.figures && panel.figures.length > 0) {
    for (const f of panel.figures) cost += ((f.character === speakerId ? 22 : 70) * boxesOverlapArea(hb, f.body)) / Math.max(1, area);
  } else cost += cover(panel.bodies, 22);
  cost += cover(panel.obstacles, 70) + hide(panel.obstacles, 90);

  const crossesTails = (base: Point, tip: Point) => {
    let c = 0;
    for (const p of placed) {
      if (segmentHitsConvex(base, tip, p.hull)) c += 300;
      const seg = tailSegment(p);
      if (seg) {
        if (segmentHitsConvex(seg[0], seg[1], hull)) c += 300;
        if (segmentsIntersect(base, tip, seg[0], seg[1])) c += 250;
      }
    }
    return c;
  };

  if (req.connect) {
    // connected balloon: close to the previous balloon of the same speaker, no tail
    const p = req.connect;
    const a = boundaryToward(p.layout, p.center, center);
    const b = boundaryToward(layout, center, p.center);
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    // a short visible neck between the two: close, but not butted (butting reads as an interruption)
    cost += 1.2 * Math.abs(d - 24) + 10 * Math.max(0, d - 44);
    const seg = tailSegment(p);
    if (seg && segmentHitsConvex(seg[0], seg[1], hull)) cost += 300;
  } else if (req.target.type === "speaker") {
    const anchor = req.target.anchor;
    const thought = layout.shape === "cloud";
    const allowance = 120 + 0.35 * bbox.h * tall;
    /** One way to aim the tail: its tip, its cost (ownership, faces, hats, bodies). */
    const aimAt = (target: Point) => {
      const from = boundaryToward(layout, center, target);
      const t = tailToward(anchor, from, thought ? anchor.head : target);
      let tip = thought ? thoughtTip(anchor, from) : t.tip;
      let c = 0;
      if (!thought) {
        // a tail stops short of a hat or crown in its way (it points past it at the mouth)
        for (const o of panel.obstacles ?? []) {
          const inside = (q: Point) => q.x >= o.x && q.x <= o.x + o.w && q.y >= o.y && q.y <= o.y + o.h;
          if (!inside(tip) || inside(from)) continue;
          let lo = 0;
          let hi = 1;
          for (let k = 0; k < 12; k += 1) {
            const mid = (lo + hi) / 2;
            if (inside({ x: from.x + (tip.x - from.x) * mid, y: from.y + (tip.y - from.y) * mid })) hi = mid;
            else lo = mid;
          }
          const cut = { x: from.x + (tip.x - from.x) * lo, y: from.y + (tip.y - from.y) * lo };
          if (Math.hypot(cut.x - from.x, cut.y - from.y) >= 14) tip = cut;
        }
      }
      const len = t.free;
      c += 0.05 * len + 0.3 * Math.max(0, len - allowance) + 4 * Math.max(0, 16 - len);
      // the tip must end nearer its own speaker than anyone else
      const tipOwn = Math.hypot(tip.x - anchor.head.x, tip.y - anchor.head.y) - anchor.headRadius;
      const base = boundaryToward(layout, center, tip);
      for (const h of panel.heads) {
        if (h.character === anchor.character) continue;
        if (Math.hypot(tip.x - h.center.x, tip.y - h.center.y) - h.radius < tipOwn) c += 600;
        // tail must not pass through other faces
        if (distPointSegment(h.center, base, tip) < h.radius) c += 400;
      }
      if (thought) {
        // a thought trail runs clear of the other figures' bodies
        for (const f of panel.figures ?? []) {
          if (f.character === anchor.character) continue;
          if (segmentHitsBox(base, tip, f.body)) c += 150;
        }
      }
      for (const k of panel.keepOut ?? []) if (segmentHitsBox(base, tip, k)) c += 120;
      // a tail that ends on a hat or a crown points at the hat, not the mouth
      for (const o of panel.obstacles ?? []) {
        if (tip.x >= o.x && tip.x <= o.x + o.w && tip.y >= o.y && tip.y <= o.y + o.h) c += 70;
        else if (segmentHitsBox(base, tip, o)) c += 25;
      }
      c += crossesTails(base, tip);
      // tails pointing up into a balloon read badly: prefer balloons above/beside the head
      if (tip.y < center.y - layout.hh * 0.2 && tip.y < hb.y) c += 40;
      return { tip, cost: c, aim: thought ? anchor.head : target };
    };
    // aim beside the mouth on the balloon's side; else the other side, else at the mouth itself
    const options = thought
      ? [aimAt(anchor.head)]
      : [aimAt(voicePoint(anchor, center)), { ...aimAt(voicePoint(anchor, center, true)), extra: 12 }, { ...aimAt(anchor.mouth), extra: 20 }];
    const best = options.reduce((a, b) => (b.cost + ("extra" in b ? b.extra : 0) < a.cost + ("extra" in a ? a.extra : 0) ? b : a));
    if ("extra" in best) cost += best.extra;
    cost += best.cost;
    cost += 0.06 * Math.abs(center.x - anchor.head.x);
    // the balloon belongs to its speaker: beside that head, not nearer another face
    const own = circleBoxGap(anchor.head, anchor.headRadius, hb);
    // (a tall panel opens with its first balloon at the top, however far the speaker)
    cost += 0.12 * (req.order === 0 ? 1 - 0.85 * tall : 1) * Math.max(0, own - 70);
    const dOwn = Math.hypot(center.x - anchor.head.x, center.y - anchor.head.y);
    for (const h of panel.heads) {
      if (h.character === anchor.character) continue;
      // (a balloon in the band above both heads, tail down to its speaker, is fine)
      const aboveThem = hb.y + hb.h < h.center.y - h.radius * 0.6;
      if (aboveThem) continue;
      if (circleBoxGap(h.center, h.radius, hb) + 4 < own) cost += 260;
      // halfway between two faces reads as either's: clearly nearer its own speaker
      const dOther = Math.hypot(center.x - h.center.x, center.y - h.center.y);
      cost += 220 * Math.max(0, dOwn / Math.max(1, dOther) - 0.78);
    }
    if (center.y > anchor.head.y) {
      // below the speaker's head, over someone else's body, reads as theirs
      for (const f of panel.figures ?? []) if (f.character !== anchor.character) cost += (200 * boxesOverlapArea(hb, f.body)) / Math.max(1, area);
    }
    tail = { tip: best.tip, offPanel: false, aim: best.aim };
  } else if (req.target.type === "offpanel") {
    const tip = offPanelTip(panel.polygon, bbox, center, req.target.toward);
    const len = gapTo(layout, center, tip);
    cost += 0.9 * Math.max(0, len - 18);
    const base = boundaryToward(layout, center, tip);
    for (const h of panel.heads) {
      if (distPointSegment(h.center, base, tip) < h.radius) cost += 400;
    }
    cost += crossesTails(base, tip);
    tail = { tip, offPanel: true };
  }
  return { cost, center, layout, hull, tail };
}
