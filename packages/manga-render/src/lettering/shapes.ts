/**
 * Balloon geometry: fits a shape around a broken text block, produces a
 * convex hull for collision tests, and draws the inked outline, tail and
 * lettering. All coordinates are page space once a centre is chosen.
 */
import type { Point } from "../contracts.js";
import { INK, PAPER, STROKE } from "../style.js";
import { esc, n, polyPath, smoothPath } from "../svg.js";
import { faceAttrs, measure, metrics, type FontFace } from "./fonts.js";
import { breakBalanced, type LineBlock } from "./breaking.js";
import { KIND_STYLES, TAIL_HALF_BASE, type BalloonShape } from "./styles.js";
import type { TextKind } from "../contracts.js";

export interface BalloonLayout {
  kind: TextKind;
  shape: BalloonShape;
  face: FontFace;
  fontSize: number;
  lineHeight: number;
  block: LineBlock;
  /** Half extents of the drawn body (ellipse semi-axes or box half size). */
  rx: number;
  ry: number;
  /** Convex collision hull relative to the centre. */
  hull: Point[];
  /** Half extents of the hull's bbox. */
  hw: number;
  hh: number;
  /** For sfx: rotation in degrees. */
  rotate: number;
}

const HULL_STEPS = 28;

function ellipseHull(rx: number, ry: number, steps = HULL_STEPS): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    pts.push({ x: Math.cos(t) * rx, y: Math.sin(t) * ry });
  }
  return pts;
}

function boxHull(hw: number, hh: number): Point[] {
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
}

function rotatePts(pts: readonly Point[], deg: number): Point[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
}

/** Smallest axis-aligned ellipse (centred) containing the padded line boxes. */
function fitEllipse(block: LineBlock, lh: number, halfGlyph: number, padX: number, padY: number): { rx: number; ry: number } {
  const k = block.lines.length;
  const pts: Point[] = [];
  block.widths.forEach((w, i) => {
    const yc = (i - (k - 1) / 2) * lh;
    const top = Math.abs(yc - halfGlyph) + padY;
    const bot = Math.abs(yc + halfGlyph) + padY;
    const x = w / 2 + padX;
    pts.push({ x, y: top }, { x, y: bot });
  });
  const maxY = Math.max(...pts.map((p) => p.y));
  let best = { rx: 0, ry: 0, score: Infinity };
  for (let s = 0; s <= 80; s += 1) {
    const ry = maxY * (1.02 + s * 0.03);
    let rx = 0;
    for (const p of pts) rx = Math.max(rx, p.x / Math.sqrt(1 - (p.y / ry) ** 2));
    // area with a gentle pull toward a 1.45:1 balloon
    const aspect = rx / ry;
    const score = rx * ry * (1 + 0.18 * Math.abs(Math.log(aspect / 1.45)));
    if (score < best.score) best = { rx, ry, score };
  }
  return { rx: best.rx, ry: best.ry };
}

/** Lay out one text at one font size and max line width. */
export function layoutBalloon(kind: TextKind, text: string, fontSize: number, maxWidth: number, rotate = 0): BalloonLayout | null {
  const style = KIND_STYLES[kind];
  const face = style.face;
  const m = (s: string) => measure(s, face, fontSize) * 1.02; // small safety margin for renderer kerning differences
  const block = breakBalanced(text, maxWidth, m, style.profile);
  if (!block) return null;
  const met = metrics(face, fontSize);
  const lh = fontSize * style.lineHeight;
  const halfGlyph = met.capHeight / 2 + met.descent * 0.35;
  const padX = style.padX * fontSize;
  const padY = style.padY * fontSize;
  const k = block.lines.length;
  switch (style.shape) {
    case "ellipse":
    case "dashed": {
      const { rx, ry } = fitEllipse(block, lh, halfGlyph, padX, padY);
      const hull = ellipseHull(rx + 3, ry + 3);
      return { kind, shape: style.shape, face, fontSize, lineHeight: lh, block, rx, ry, hull, hw: rx + 3, hh: ry + 3, rotate: 0 };
    }
    case "cloud": {
      const { rx, ry } = fitEllipse(block, lh, halfGlyph, padX, padY);
      const bump = Math.max(9, fontSize * 0.42);
      const hull = ellipseHull(rx + bump, ry + bump);
      return { kind, shape: "cloud", face, fontSize, lineHeight: lh, block, rx, ry, hull, hw: rx + bump, hh: ry + bump, rotate: 0 };
    }
    case "burst": {
      const { rx, ry } = fitEllipse(block, lh, halfGlyph, padX, padY);
      const spike = Math.max(16, fontSize * 0.75);
      const hull = ellipseHull(rx + spike, ry + spike);
      return { kind, shape: "burst", face, fontSize, lineHeight: lh, block, rx, ry, hull, hw: rx + spike, hh: ry + spike, rotate: 0 };
    }
    case "box":
    case "caption": {
      const hw = block.width / 2 + padX;
      const hh = ((k - 1) * lh) / 2 + halfGlyph + padY;
      return { kind, shape: style.shape, face, fontSize, lineHeight: lh, block, rx: hw, ry: hh, hull: boxHull(hw + 2, hh + 2), hw: hw + 2, hh: hh + 2, rotate: 0 };
    }
    case "sfx": {
      const stroke = fontSize * 0.14;
      const hw = block.width / 2 + stroke;
      const hh = ((k - 1) * lh) / 2 + met.capHeight / 2 + stroke;
      const hull = rotatePts(boxHull(hw, hh), rotate);
      const xs = hull.map((p) => Math.abs(p.x));
      const ys = hull.map((p) => Math.abs(p.y));
      return { kind, shape: "sfx", face, fontSize, lineHeight: lh, block, rx: hw, ry: hh, hull, hw: Math.max(...xs), hh: Math.max(...ys), rotate };
    }
  }
}

export function hullAt(layout: BalloonLayout, c: Point): Point[] {
  return layout.hull.map((p) => ({ x: p.x + c.x, y: p.y + c.y }));
}

/** Point on the balloon body boundary in the direction of `toward`. */
export function boundaryToward(layout: BalloonLayout, c: Point, toward: Point, shrink = 1): Point {
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (layout.shape === "box" || layout.shape === "caption") {
    const sx = dx === 0 ? Infinity : layout.rx / Math.abs(dx);
    const sy = dy === 0 ? Infinity : layout.ry / Math.abs(dy);
    const s = Math.min(sx, sy) * shrink;
    return { x: c.x + dx * s, y: c.y + dy * s };
  }
  const t = Math.atan2(dy / layout.ry, dx / layout.rx);
  return { x: c.x + Math.cos(t) * layout.rx * shrink, y: c.y + Math.sin(t) * layout.ry * shrink };
}

/** Distance from the body boundary (toward p) to p. */
export function gapTo(layout: BalloonLayout, c: Point, p: Point): number {
  const b = boundaryToward(layout, c, p);
  const full = Math.hypot(p.x - c.x, p.y - c.y);
  const inner = Math.hypot(b.x - c.x, b.y - c.y);
  return full - inner;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function ellipseOutline(c: Point, rx: number, ry: number, rand: () => number): string {
  const steps = 18;
  const pts: Point[] = [];
  const phase = rand() * Math.PI * 2;
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    // gentle hand-inked wobble: low-frequency, under 1.5%
    const wob = 1 + 0.012 * Math.sin(t * 2 + phase) + (rand() - 0.5) * 0.008;
    pts.push({ x: c.x + Math.cos(t) * rx * wob, y: c.y + Math.sin(t) * ry * wob });
  }
  return smoothPath(pts, true, 0.5);
}

function cloudOutline(c: Point, rx: number, ry: number, fontSize: number, rand: () => number): string {
  const bump = Math.max(9, fontSize * 0.42);
  const ex = rx + bump * 0.35;
  const ey = ry + bump * 0.35;
  const perim = Math.PI * (3 * (ex + ey) - Math.sqrt((3 * ex + ey) * (ex + 3 * ey)));
  const count = Math.max(8, Math.round(perim / (bump * 2.3)));
  const pts: Point[] = [];
  const phase = rand() * 0.5;
  for (let i = 0; i < count; i += 1) {
    const t = ((i + phase) / count) * Math.PI * 2;
    pts.push({ x: c.x + Math.cos(t) * ex, y: c.y + Math.sin(t) * ey });
  }
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 0; i < count; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % count];
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    const r = chord * (0.56 + rand() * 0.08);
    d += `A${n(r)} ${n(r)} 0 0 1 ${n(b.x)} ${n(b.y)}`;
  }
  return `${d}Z`;
}

function burstOutline(c: Point, rx: number, ry: number, fontSize: number, rand: () => number): string {
  const spike = Math.max(16, fontSize * 0.75);
  const perim = Math.PI * (rx + ry);
  const count = Math.max(12, Math.round(perim / (fontSize * 1.25)));
  const pts: Point[] = [];
  const phase = rand();
  for (let i = 0; i < count * 2; i += 1) {
    const t = ((i + phase) / (count * 2)) * Math.PI * 2;
    const outer = i % 2 === 0;
    const len = outer ? spike * (0.55 + rand() * 0.45) : 0;
    const k = outer ? 1 : 1.02;
    pts.push({ x: c.x + Math.cos(t) * (rx * k + len), y: c.y + Math.sin(t) * (ry * k + len) });
  }
  return polyPath(pts, true);
}

function boxOutline(c: Point, hw: number, hh: number): string {
  return polyPath(boxHull(hw, hh).map((p) => ({ x: p.x + c.x, y: p.y + c.y })), true);
}

export interface TailSpec {
  tip: Point;
  /** Off-panel tails end on the border rather than near a mouth. */
  offPanel: boolean;
}

/** Curved tapered wedge from the balloon body toward the tip. */
function wedgeTail(layout: BalloonLayout, c: Point, tip: Point, curved: boolean, rand: () => number): string {
  const base = boundaryToward(layout, c, tip, 0.86);
  const len = Math.hypot(tip.x - base.x, tip.y - base.y);
  if (len < 1) return "";
  const ux = (tip.x - base.x) / len;
  const uy = (tip.y - base.y) / len;
  const px = -uy;
  const py = ux;
  // one base width for every tail on the page (never a needle, never a wedge)
  const halfBase = Math.min(TAIL_HALF_BASE, Math.min(layout.rx, layout.ry) * 0.5);
  const b1 = { x: base.x + px * halfBase, y: base.y + py * halfBase };
  const b2 = { x: base.x - px * halfBase, y: base.y - py * halfBase };
  if (!curved) {
    return `M${n(b1.x)} ${n(b1.y)}L${n(tip.x)} ${n(tip.y)}L${n(b2.x)} ${n(b2.y)}Z`;
  }
  // bend sideways by ~14% of the length; direction chosen by the seed but
  // biased so tails curve away from the vertical axis (reads as hand-drawn).
  const sign = (ux >= 0 ? 1 : -1) * (rand() < 0.8 ? 1 : -1);
  const bend = Math.min(26, len * 0.14) * sign;
  const mid = { x: base.x + (tip.x - base.x) * 0.55 + px * bend, y: base.y + (tip.y - base.y) * 0.55 + py * bend };
  const c1 = { x: mid.x + px * halfBase * 0.45, y: mid.y + py * halfBase * 0.45 };
  const c2 = { x: mid.x - px * halfBase * 0.45, y: mid.y - py * halfBase * 0.45 };
  return `M${n(b1.x)} ${n(b1.y)}Q${n(c1.x)} ${n(c1.y)} ${n(tip.x)} ${n(tip.y)}Q${n(c2.x)} ${n(c2.y)} ${n(b2.x)} ${n(b2.y)}Z`;
}

function thoughtBubbles(layout: BalloonLayout, c: Point, tip: Point): string[] {
  const start = boundaryToward(layout, c, tip, 1);
  const bumpOut = Math.max(9, layout.fontSize * 0.42);
  const dx = tip.x - start.x;
  const dy = tip.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 4) return [];
  const ux = dx / len;
  const uy = dy / len;
  const radii = [layout.fontSize * 0.36, layout.fontSize * 0.25, layout.fontSize * 0.16];
  const out: string[] = [];
  let dist = bumpOut + radii[0] + 3;
  for (const r of radii) {
    if (dist + r > len + r * 0.5) break;
    const p = { x: start.x + ux * dist, y: start.y + uy * dist };
    out.push(ellipsePath(p, r * 1.15, r));
    dist += r * 2 + Math.max(5, len * 0.08);
  }
  return out;
}

function ellipsePath(c: Point, rx: number, ry: number): string {
  return `M${n(c.x - rx)} ${n(c.y)}A${n(rx)} ${n(ry)} 0 1 0 ${n(c.x + rx)} ${n(c.y)}A${n(rx)} ${n(ry)} 0 1 0 ${n(c.x - rx)} ${n(c.y)}Z`;
}

function textLines(layout: BalloonLayout, c: Point, fill: string, extra = ""): string {
  const met = metrics(layout.face, layout.fontSize);
  const k = layout.block.lines.length;
  const attrs = faceAttrs(layout.face);
  const weight = attrs.weight ? ` font-weight="${attrs.weight}"` : "";
  const style = attrs.style ? ` font-style="${attrs.style}"` : "";
  const spans = layout.block.lines
    .map((line, i) => {
      const y = c.y + (i - (k - 1) / 2) * layout.lineHeight + met.capHeight / 2;
      return `<tspan x="${n(c.x)}" y="${n(y)}">${esc(line)}</tspan>`;
    })
    .join("");
  return `<text font-family="${attrs.family}"${weight}${style} font-size="${n(layout.fontSize)}" text-anchor="middle" fill="${fill}"${extra}>${spans}</text>`;
}

/**
 * A short neck joining a balloon to the previous balloon of the same speaker
 * (connected balloons: one speaker, one breath, two beats).
 */
function neckPath(from: { layout: BalloonLayout; center: Point }, layout: BalloonLayout, c: Point): string {
  const a = boundaryToward(from.layout, from.center, c, 0.9);
  const b = boundaryToward(layout, c, from.center, 0.9);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1) return "";
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const px = -uy;
  const py = ux;
  const w = Math.min(TAIL_HALF_BASE * 1.05, Math.min(layout.rx, layout.ry, from.layout.rx, from.layout.ry) * 0.3);
  const pinch = 0.72;
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return (
    `M${n(a.x + px * w)} ${n(a.y + py * w)}Q${n(m.x + px * w * pinch)} ${n(m.y + py * w * pinch)} ${n(b.x + px * w)} ${n(b.y + py * w)}` +
    `L${n(b.x - px * w)} ${n(b.y - py * w)}Q${n(m.x - px * w * pinch)} ${n(m.y - py * w * pinch)} ${n(a.x - px * w)} ${n(a.y - py * w)}Z`
  );
}

export interface BalloonDraw {
  layout: BalloonLayout;
  center: Point;
  tail?: TailSpec;
  rand: () => number;
}

interface BalloonParts {
  strokes: string[];
  fills: string[];
  text: string;
}

function balloonParts(d: BalloonDraw): BalloonParts | string {
  const { layout, center: c, tail, rand } = d;
  const sw = STROKE.balloon;
  const wide = n(sw * 2);
  let body: string;
  let dash = "";
  switch (layout.shape) {
    case "ellipse":
      body = ellipseOutline(c, layout.rx, layout.ry, rand);
      break;
    case "dashed":
      body = ellipseOutline(c, layout.rx, layout.ry, rand);
      dash = ` stroke-dasharray="11 7"`;
      break;
    case "cloud":
      body = cloudOutline(c, layout.rx, layout.ry, layout.fontSize, rand);
      break;
    case "burst":
      body = burstOutline(c, layout.rx, layout.ry, layout.fontSize, rand);
      break;
    case "box":
    case "caption":
      // boxes: a crisp single stroke, square corners
      body = boxOutline(c, layout.rx, layout.ry);
      return `<g><path d="${body}" fill="${PAPER}" stroke="${INK}" stroke-width="${n(sw)}" stroke-linejoin="miter"/>${textLines(layout, c, INK)}</g>`;
    case "sfx":
      return drawSfx(layout, c);
  }
  let tailPath = "";
  const bubbles: string[] = [];
  if (tail) {
    if (layout.shape === "cloud") bubbles.push(...thoughtBubbles(layout, c, tail.tip));
    else tailPath = wedgeTail(layout, c, tail.tip, layout.shape !== "burst", rand);
  }
  const strokeAttrs = `fill="none" stroke="${INK}" stroke-width="${wide}" stroke-linejoin="round"`;
  // stroke everything at double width, then fill on top: a seamless union
  // outline (body + tail) with the visible half of the stroke outside.
  const strokes = [`<path d="${body}" ${strokeAttrs}${dash}/>`];
  if (tailPath) strokes.push(`<path d="${tailPath}" ${strokeAttrs}${dash}/>`);
  const fills = [`<path d="${body}" fill="${PAPER}"/>`];
  if (tailPath) fills.push(`<path d="${tailPath}" fill="${PAPER}"/>`);
  for (const b of bubbles) fills.push(`<path d="${b}" fill="${PAPER}" stroke="${INK}" stroke-width="${n(sw)}"/>`);
  return { strokes, fills, text: textLines(layout, c, INK) };
}

/** Draw a placed balloon (body + tail + lettering). */
export function drawBalloon(layout: BalloonLayout, c: Point, tail: TailSpec | undefined, rand: () => number): string {
  return drawBalloonChain([{ layout, center: c, tail, rand }]);
}

/**
 * Draw connected balloons (one speaker, consecutive lines) as one inked
 * shape: every outline first, then every fill, so the connector necks merge
 * into both bodies without a seam. A chain of one is a plain balloon.
 */
export function drawBalloonChain(chain: readonly BalloonDraw[]): string {
  const parts = chain.map(balloonParts);
  if (parts.length === 1 && typeof parts[0] === "string") return parts[0];
  const strokes: string[] = [];
  const fills: string[] = [];
  const texts: string[] = [];
  const loose: string[] = [];
  const wide = n(STROKE.balloon * 2);
  parts.forEach((p, i) => {
    if (typeof p === "string") {
      loose.push(p);
      return;
    }
    strokes.push(...p.strokes);
    fills.push(...p.fills);
    texts.push(p.text);
    if (i > 0 && typeof parts[i - 1] !== "string") {
      const neck = neckPath({ layout: chain[i - 1].layout, center: chain[i - 1].center }, chain[i].layout, chain[i].center);
      if (neck) {
        strokes.push(`<path d="${neck}" fill="none" stroke="${INK}" stroke-width="${wide}" stroke-linejoin="round"/>`);
        fills.push(`<path d="${neck}" fill="${PAPER}"/>`);
      }
    }
  });
  return `${loose.join("")}<g>${strokes.join("")}${fills.join("")}${texts.join("")}</g>`;
}

function drawSfx(layout: BalloonLayout, c: Point): string {
  const stroke = layout.fontSize * 0.14;
  const rot = layout.rotate ? ` transform="rotate(${n(layout.rotate)} ${n(c.x)} ${n(c.y)})"` : "";
  return textLines(
    layout,
    c,
    PAPER,
    ` stroke="${INK}" stroke-width="${n(stroke)}" stroke-linejoin="round" paint-order="stroke"${rot}`,
  );
}
