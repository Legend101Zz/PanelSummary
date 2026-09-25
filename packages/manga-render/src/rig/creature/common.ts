/**
 * Shared drawing kit for every non-human rig (birds, animals, insects,
 * objects, plants, spirits, emblems).
 *
 * The core idea is the manga "silhouette sandwich": every filled part is
 * first drawn as a fat ink backing (the outer outline), then every part is
 * filled on top with a thin detail edge. The union of the parts therefore
 * gets one confident thick outline while overlaps inside it get thin lines.
 * `Sketch.layer()` starts a new sandwich on top, so a front arm or a held
 * item gets its own full-weight outline over the body.
 *
 * All geometry is built from points in JS (no SVG transforms) so anchors and
 * bounds are exact. Paths only use M/L/C/Z so bounds can be read back.
 */
import type { Point, Tone } from "../../contracts.js";
import { INK, PAPER, STROKE, toneFill } from "../../style.js";
import { n, polyPath, smoothPath } from "../../svg.js";
import type { FigureAnchors } from "../../internal.js";
import { mulberry32, hashString } from "../../prng.js";

export { INK, PAPER };

export const P = (x: number, y: number): Point => ({ x, y });
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function lerpP(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}
export function addP(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}
export function polar(o: Point, r: number, a: number): Point {
  return { x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r };
}
export function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
export function rotP(p: Point, a: number, o: Point = { x: 0, y: 0 }): Point {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = p.x - o.x;
  const dy = p.y - o.y;
  return { x: o.x + dx * c - dy * s, y: o.y + dx * s + dy * c };
}
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** A point transform (local frame → figure space). */
export type Xf = (p: Point) => Point;
export const identity: Xf = (p) => p;

/** translate(x,y) · rotate(rot) · scale(sx,sy), applied to a local point. */
export function affine(o: { x?: number; y?: number; rot?: number; sx?: number; sy?: number }): Xf {
  const tx = o.x ?? 0;
  const ty = o.y ?? 0;
  const c = Math.cos(o.rot ?? 0);
  const s = Math.sin(o.rot ?? 0);
  const sx = o.sx ?? 1;
  const sy = o.sy ?? 1;
  return (p) => ({ x: tx + p.x * sx * c - p.y * sy * s, y: ty + p.x * sx * s + p.y * sy * c });
}
export function compose(outer: Xf, inner: Xf): Xf {
  return (p) => outer(inner(p));
}
export function mapPts(points: readonly Point[], f: Xf): Point[] {
  return points.map(f);
}

/** Deterministic per-character randomness, independent of the page. */
export function charRand(seed: number, salt: string): () => number {
  return mulberry32((hashString(salt) ^ (seed >>> 0)) >>> 0);
}

// ---------------------------------------------------------------------------
// Pens and fills
// ---------------------------------------------------------------------------

export interface Pen {
  /** Outer silhouette weight (figure units). */
  lw: number;
  /** Inner detail weight. */
  dw: number;
  /** Fine texture weight. */
  fw: number;
  prefix: string;
  /** Level of detail (FigureRequest.detail). */
  detail?: "full" | "reduced" | "silhouette";
  /** Paper knockout rim width under the outer outline (figure units); 0 = none. */
  rim?: number;
  /**
   * Eye state for this appearance (FigureRequest.eyes). Faces drawn with this
   * pen override the expression's eyes: "closed" lids, "blind" blank eyes
   * with no pupil, "dead" slack closed lines. Plants read it as their
   * condition ("closed" buds, "dead" frost-bitten).
   */
  eyes?: "open" | "closed" | "blind" | "dead";
}

/** Page-space width of the paper knockout rim (matches the human rig). */
export const RIM_PAGE = 3.6;

export function makePen(
  lineWidth: number,
  prefix: string,
  req?: { detail?: "full" | "reduced" | "silhouette"; rim?: boolean; eyes?: "open" | "closed" | "blind" | "dead" },
): Pen {
  const lw = Math.max(lineWidth, 1e-4);
  const ratio = STROKE.figureDetail / STROKE.figureOutline;
  const rim = req?.rim === false ? 0 : (RIM_PAGE * lw) / STROKE.figureOutline;
  const pen: Pen = { lw, dw: lw * ratio, fw: lw * ratio * 0.62, prefix, detail: req?.detail ?? "full", rim };
  if (req?.eyes && req.eyes !== "open") pen.eyes = req.eyes;
  return pen;
}

export function fillOf(tone: Tone, pen: Pen): string {
  return toneFill(tone, pen.prefix);
}

/** True for tones where ink detail drawn on top would disappear. */
export function isDark(tone: Tone): boolean {
  return tone === "black" || tone === "dark" || tone === "dense_dots" || tone === "stripes";
}

/** A lighter companion tone (bellies, inner ears, highlights). */
export function lighter(tone: Tone): Tone {
  switch (tone) {
    case "black":
      return "mid";
    case "dark":
      return "light";
    case "dense_dots":
      return "dots";
    case "mid":
    case "stripes":
    case "check":
      return "light";
    case "stone":
    case "gold":
      return "white";
    default:
      return "white";
  }
}

/** A darker companion tone (shadow sides, markings). */
export function darker(tone: Tone): Tone {
  switch (tone) {
    case "white":
      return "light";
    case "light":
      return "dots";
    case "dots":
    case "flowers":
      return "dense_dots";
    case "mid":
    case "gold":
    case "stone":
      return "dark";
    case "dense_dots":
    case "stripes":
    case "check":
      return "dark";
    default:
      return "black";
  }
}

// ---------------------------------------------------------------------------
// Path builders (M/L/C/Z only)
// ---------------------------------------------------------------------------

const K = 0.5522847498;

export function circleD(c: Point, r: number): string {
  return ellipseD(c, r, r);
}

export function ellipseD(c: Point, rx: number, ry: number): string {
  const { x, y } = c;
  const kx = rx * K;
  const ky = ry * K;
  return (
    `M${n(x + rx)} ${n(y)}` +
    `C${n(x + rx)} ${n(y + ky)} ${n(x + kx)} ${n(y + ry)} ${n(x)} ${n(y + ry)}` +
    `C${n(x - kx)} ${n(y + ry)} ${n(x - rx)} ${n(y + ky)} ${n(x - rx)} ${n(y)}` +
    `C${n(x - rx)} ${n(y - ky)} ${n(x - kx)} ${n(y - ry)} ${n(x)} ${n(y - ry)}` +
    `C${n(x + kx)} ${n(y - ry)} ${n(x + rx)} ${n(y - ky)} ${n(x + rx)} ${n(y)}Z`
  );
}

/** Sampled (possibly rotated) ellipse as points; start angle 0 = +x. */
export function ellipsePts(c: Point, rx: number, ry: number, count = 24, rot = 0, start = 0): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = start + (i / count) * TAU;
    out.push(rotP({ x: c.x + Math.cos(a) * rx, y: c.y + Math.sin(a) * ry }, rot, c));
  }
  return out;
}

export function lineD(points: readonly Point[]): string {
  return polyPath(points, false);
}

export function curveD(points: readonly Point[], tension = 0.5): string {
  return smoothPath(points, false, tension);
}

export function blobD(points: readonly Point[], tension = 0.5): string {
  return smoothPath(points, true, tension);
}

/** Quadratic curve a→b with control c expressed as a cubic (M/C only). */
export function quadD(a: Point, c: Point, b: Point): string {
  const c1 = { x: a.x + ((c.x - a.x) * 2) / 3, y: a.y + ((c.y - a.y) * 2) / 3 };
  const c2 = { x: b.x + ((c.x - b.x) * 2) / 3, y: b.y + ((c.y - b.y) * 2) / 3 };
  return `M${n(a.x)} ${n(a.y)}C${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(b.x)} ${n(b.y)}`;
}

/** Catmull-Rom resample of an open polyline (for tapered strokes). */
export function spline(points: readonly Point[], samples = 6): Point[] {
  if (points.length < 3) {
    if (points.length < 2) return [...points];
    const out: Point[] = [];
    for (let i = 0; i <= samples; i += 1) out.push(lerpP(points[0], points[1], i / samples));
    return out;
  }
  const at = (i: number) => points[clamp(i, 0, points.length - 1)];
  const out: Point[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < samples; s += 1) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * A tapered limb/tail/stalk: a closed outline around a spine whose width is
 * interpolated along its length. Round caps unless `cap` is false.
 */
export function taperPts(
  spine: readonly Point[],
  widths: readonly number[],
  opts: { samples?: number; capStart?: boolean; capEnd?: boolean } = {},
): Point[] {
  const dense = spline(spine, opts.samples ?? 6);
  const count = dense.length;
  if (count < 2) return [];
  const widthAt = (t: number) => {
    if (widths.length === 1) return widths[0];
    const f = t * (widths.length - 1);
    const i = Math.min(Math.floor(f), widths.length - 2);
    return lerp(widths[i], widths[i + 1], f - i);
  };
  const left: Point[] = [];
  const right: Point[] = [];
  const normals: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = dense[Math.max(0, i - 1)];
    const b = dense[Math.min(count - 1, i + 1)];
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const nx = -ty;
    const ny = tx;
    normals.push({ x: nx, y: ny });
    const w = widthAt(i / (count - 1)) / 2;
    left.push({ x: dense[i].x + nx * w, y: dense[i].y + ny * w });
    right.push({ x: dense[i].x - nx * w, y: dense[i].y - ny * w });
  }
  const out: Point[] = [...left];
  const capEnd = opts.capEnd ?? true;
  const capStart = opts.capStart ?? true;
  if (capEnd) {
    const e = dense[count - 1];
    const nm = normals[count - 1];
    const w = widthAt(1) / 2;
    const base = Math.atan2(nm.y, nm.x);
    for (let s = 1; s < 6; s += 1) out.push(polar(e, w, base - (s / 6) * Math.PI));
  }
  for (let i = count - 1; i >= 0; i -= 1) out.push(right[i]);
  if (capStart) {
    const e = dense[0];
    const nm = normals[0];
    const w = widthAt(0) / 2;
    const base = Math.atan2(-nm.y, -nm.x);
    for (let s = 1; s < 6; s += 1) out.push(polar(e, w, base - (s / 6) * Math.PI));
  }
  return out;
}

export function taperD(
  spine: readonly Point[],
  widths: readonly number[],
  opts: { samples?: number; capStart?: boolean; capEnd?: boolean } = {},
): string {
  return polyPath(taperPts(spine, widths, opts), true);
}

/**
 * Scalloped "puff" outline (clouds, canopies, bushes, fluff) around an
 * ellipse. `depth` 0..1 controls how round the bumps are.
 */
export function puffD(
  c: Point,
  rx: number,
  ry: number,
  bumps: number,
  depth: number,
  rand?: () => number,
  rot = 0,
  start = -Math.PI / 2,
): string {
  const pts: Point[] = [];
  const outs: Point[] = [];
  for (let i = 0; i < bumps; i += 1) {
    const jitter = rand ? (rand() - 0.5) * (TAU / bumps) * 0.35 : 0;
    const a = start + (i / bumps) * TAU + jitter;
    const rj = rand ? 1 + (rand() - 0.5) * 0.12 : 1;
    const p = { x: c.x + Math.cos(a) * rx * rj, y: c.y + Math.sin(a) * ry * rj };
    pts.push(rotP(p, rot, c));
    outs.push(rotP({ x: Math.cos(a), y: Math.sin(a) * (rx / Math.max(ry, 1e-6)) }, rot));
  }
  const norm = (v: Point) => {
    const l = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / l, y: v.y / l };
  };
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 0; i < bumps; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % bumps];
    const na = norm(outs[i]);
    const nb = norm(outs[(i + 1) % bumps]);
    const h = dist(a, b) * (0.35 + depth * 0.55);
    // bulge outward from the chord, leaning a little toward the chord mid
    d += `C${n(a.x + na.x * h + (b.x - a.x) * 0.08)} ${n(a.y + na.y * h + (b.y - a.y) * 0.08)} ${n(b.x + nb.x * h - (b.x - a.x) * 0.08)} ${n(b.y + nb.y * h - (b.y - a.y) * 0.08)} ${n(b.x)} ${n(b.y)}`;
  }
  return `${d}Z`;
}

/** Clamp points so none lies above y = limit(x) (lids, bellies, water lines). */
export function clampBelow(points: readonly Point[], limit: (x: number) => number): Point[] {
  return points.map((p) => ({ x: p.x, y: Math.max(p.y, limit(p.x)) }));
}
export function clampAbove(points: readonly Point[], limit: (x: number) => number): Point[] {
  return points.map((p) => ({ x: p.x, y: Math.min(p.y, limit(p.x)) }));
}

/** Heart shape centred on c, size = overall height. */
export function heartD(c: Point, size: number): string {
  const s = size / 2;
  const top = c.y - s * 0.45;
  return (
    `M${n(c.x)} ${n(c.y + s)}` +
    `C${n(c.x - s * 1.25)} ${n(c.y + s * 0.1)} ${n(c.x - s * 1.05)} ${n(top - s * 0.85)} ${n(c.x)} ${n(top)}` +
    `C${n(c.x + s * 1.05)} ${n(top - s * 0.85)} ${n(c.x + s * 1.25)} ${n(c.y + s * 0.1)} ${n(c.x)} ${n(c.y + s)}Z`
  );
}

/** Teardrop pointing up, centred on the round part. */
export function dropD(c: Point, r: number, rot = 0): string {
  const tip = rotP({ x: c.x, y: c.y - r * 2.2 }, rot, c);
  const l = rotP({ x: c.x - r, y: c.y }, rot, c);
  const rr = rotP({ x: c.x + r, y: c.y }, rot, c);
  const b = rotP({ x: c.x, y: c.y + r }, rot, c);
  const k = r * K;
  const bl = rotP({ x: c.x - k, y: c.y + r }, rot, c);
  const lb = rotP({ x: c.x - r, y: c.y + k }, rot, c);
  const br = rotP({ x: c.x + k, y: c.y + r }, rot, c);
  const rb = rotP({ x: c.x + r, y: c.y + k }, rot, c);
  const lt = rotP({ x: c.x - r, y: c.y - r * 0.9 }, rot, c);
  const rt = rotP({ x: c.x + r, y: c.y - r * 0.9 }, rot, c);
  return (
    `M${n(tip.x)} ${n(tip.y)}` +
    `C${n(rt.x)} ${n(rt.y)} ${n(rr.x)} ${n(rr.y - r * 0.2)} ${n(rr.x)} ${n(rr.y)}` +
    `C${n(rb.x)} ${n(rb.y)} ${n(br.x)} ${n(br.y)} ${n(b.x)} ${n(b.y)}` +
    `C${n(bl.x)} ${n(bl.y)} ${n(lb.x)} ${n(lb.y)} ${n(l.x)} ${n(l.y)}` +
    `C${n(l.x)} ${n(l.y - r * 0.2)} ${n(lt.x)} ${n(lt.y)} ${n(tip.x)} ${n(tip.y)}Z`
  );
}

/** Four-pointed sparkle star. */
export function sparkD(c: Point, r: number, waist = 0.22): string {
  const pts: Point[] = [];
  for (let i = 0; i < 8; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    pts.push(polar(c, i % 2 === 0 ? r : r * waist, a));
  }
  return polyPath(pts, true);
}

// ---------------------------------------------------------------------------
// Sketch: layered silhouette sandwich + bounds
// ---------------------------------------------------------------------------

interface Layer {
  back: string[];
  body: string[];
  /** Back entries with their own stroke width (rimmed separately). */
  wide: { d: string; w: number }[];
}

export interface ShapeOpts {
  /** Inner edge weight; false = no inner edge (seamless merge with neighbours). */
  edge?: number | false;
  /** Contribute to the thick outer silhouette (default true). */
  outline?: boolean;
  /** Extra outline weight multiplier for this part (default 1). */
  weight?: number;
}

export interface LineOpts {
  color?: string;
  /** Also thicken into the silhouette backing (default false). */
  outline?: boolean;
  cap?: "round" | "butt";
  /** Paper-coloured halo under the ink so the line reads on dark fills. */
  halo?: boolean;
}

export class Sketch {
  private layers: Layer[] = [{ back: [], body: [], wide: [] }];
  private ds: string[] = [];
  private extra: Point[] = [];
  constructor(readonly pen: Pen) {}

  private get cur(): Layer {
    return this.layers[this.layers.length - 1];
  }

  /** Start a new silhouette layer on top of everything drawn so far. */
  layer(): this {
    if (this.cur.back.length || this.cur.body.length) this.layers.push({ back: [], body: [], wide: [] });
    return this;
  }

  shape(d: string, fill: string, opts: ShapeOpts = {}): this {
    if (!d) return this;
    this.ds.push(d);
    if (opts.outline !== false) {
      const w = this.pen.lw * 2 * (opts.weight ?? 1) * this.outlineK;
      this.cur.back.push(`<path d="${d}"${opts.weight !== undefined ? ` stroke-width="${n(w)}"` : ""}/>`);
      if (opts.weight !== undefined) this.cur.wide.push({ d, w });
    }
    // silhouette LOD: parts merge into one shape (no inner edges; the body
    // groups carry stroke="none" then, see svg())
    if (this.pen.detail === "silhouette") {
      this.cur.body.push(`<path d="${d}" fill="${fill}"/>`);
      return this;
    }
    const edge = opts.edge === undefined ? this.pen.dw : opts.edge;
    if (edge === false) this.cur.body.push(`<path d="${d}" fill="${fill}" stroke="none"/>`);
    else if (Math.abs(edge - this.pen.dw) < 1e-9) this.cur.body.push(`<path d="${d}" fill="${fill}"/>`);
    else this.cur.body.push(`<path d="${d}" fill="${fill}" stroke-width="${n(edge)}"/>`);
    return this;
  }

  line(d: string, width: number, opts: LineOpts = {}): this {
    if (!d) return this;
    this.ds.push(d);
    // level of detail: reduced drops fine texture, silhouette drops every inner line
    if (!opts.outline && this.pen.detail === "silhouette") return this;
    if (!opts.outline && this.pen.detail === "reduced" && width < this.pen.dw * 0.9) return this;
    const color = opts.color ?? INK;
    const cap = opts.cap === "butt" ? ` stroke-linecap="butt"` : "";
    if (opts.outline) {
      const w = width + this.pen.lw * 2 * this.outlineK;
      this.cur.back.push(`<path d="${d}" fill="none" stroke-width="${n(w)}"/>`);
      this.cur.wide.push({ d, w });
    }
    if (opts.halo) {
      this.cur.body.push(`<path d="${d}" fill="none" stroke="${PAPER}" stroke-width="${n(width + this.pen.dw * 1.6)}"${cap}/>`);
    }
    this.cur.body.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${n(width)}"${cap}/>`);
    return this;
  }

  /** Filled mark with no stroke (ink spots, highlights). */
  fill(d: string, fill: string = INK): this {
    if (!d) return this;
    this.ds.push(d);
    this.cur.body.push(`<path d="${d}" fill="${fill}" stroke="none"/>`);
    return this;
  }

  /** Raw pre-built svg in the current body layer; `pts` extend the bounds. */
  raw(svg: string, pts: readonly Point[] = []): this {
    if (!svg) return this;
    this.cur.body.push(svg);
    this.extra.push(...pts);
    for (const m of svg.matchAll(/ d="([^"]+)"/g)) this.ds.push(m[1]);
    return this;
  }

  /** Include points in the bounds without drawing. */
  bound(...pts: Point[]): this {
    this.extra.push(...pts);
    return this;
  }

  /** Outline weight factor: the silhouette LOD carries the figure with a heavier line. */
  private get outlineK(): number {
    return this.pen.detail === "silhouette" ? 1.4 : 1;
  }

  /**
   * Serialise. With a rim (the default), every layer's outline group is
   * defined once and referenced twice: first all layers in paper at the
   * outline width plus the rim (a knockout halo under the whole figure), then
   * per layer in ink under that layer's fills.
   */
  svg(): string {
    const lwN = this.pen.lw * 2 * this.outlineK;
    const lw = n(lwN);
    const dw = n(this.pen.dw);
    const bodyAttrs = this.pen.detail === "silhouette" ? `stroke="none"` : `stroke="${INK}" stroke-width="${dw}"`;
    const rim = this.pen.rim ?? 0;
    let out = "";
    if (rim <= 0) {
      for (const l of this.layers) {
        if (l.back.length) {
          out += `<g fill="${INK}" stroke="${INK}" stroke-width="${lw}" stroke-linejoin="round" stroke-linecap="round">${l.back.join("")}</g>`;
        }
        if (l.body.length) {
          out += `<g ${bodyAttrs} stroke-linejoin="round" stroke-linecap="round">${l.body.join("")}</g>`;
        }
      }
      return out;
    }
    const uid = hashString(this.layers.map((l) => l.back.join("")).join("|")).toString(36);
    let defs = "";
    let under = "";
    let wide = "";
    this.layers.forEach((l, i) => {
      if (l.back.length) {
        const id = `${this.pen.prefix}bk${uid}-${i}`;
        defs += `<g id="${id}">${l.back.join("")}</g>`;
        under += `<use href="#${id}" stroke-width="${n(lwN + rim * 2)}"/>`;
        for (const w of l.wide) wide += `<path d="${w.d}" fill="none" stroke-width="${n(w.w + rim * 2)}"/>`;
        out += `<use href="#${id}" fill="${INK}" stroke="${INK}" stroke-width="${lw}"/>`;
      }
      if (l.body.length) {
        out += `<g ${bodyAttrs}>${l.body.join("")}</g>`;
      }
    });
    const rimG = under ? `<g fill="${PAPER}" stroke="${PAPER}">${under}${wide}</g>` : "";
    return `${defs ? `<defs>${defs}</defs>` : ""}<g stroke-linejoin="round" stroke-linecap="round">${rimG}${out}</g>`;
  }

  bounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const take = (x: number, y: number) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };
    for (const d of this.ds) {
      const nums = d.match(/-?\d*\.?\d+(?:e-?\d+)?/g);
      if (!nums) continue;
      for (let i = 0; i + 1 < nums.length; i += 2) take(Number(nums[i]), Number(nums[i + 1]));
    }
    for (const p of this.extra) take(p.x, p.y);
    if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const pad = this.pen.lw;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }
}

/** Build anchors from a sketch's bounds plus rig-supplied landmarks. */
export function anchorsFrom(
  sk: Sketch,
  a: Omit<FigureAnchors, "top" | "left" | "right"> & { top?: number },
): FigureAnchors {
  const b = sk.bounds();
  return {
    head: a.head,
    headRadius: a.headRadius,
    mouth: a.mouth,
    ...(a.hand ? { hand: a.hand } : {}),
    top: Math.min(b.minY, a.top ?? b.minY),
    left: b.minX,
    right: b.maxX,
    waist: a.waist,
    shoulders: a.shoulders,
  };
}

/** Translate every coordinate pair of every path in an SVG fragment. */
export function shiftSvgY(svg: string, dy: number): string {
  if (dy === 0) return svg;
  return svg.replace(/ d="([^"]+)"/g, (_m, d: string) => {
    const moved = d.replace(/(-?\d*\.?\d+) (-?\d*\.?\d+)/g, (_p, xs: string, ys: string) => `${n(Number(xs))} ${n(Number(ys) + dy)}`);
    return ` d="${moved}"`;
  });
}

/**
 * Final step of every creature rig: serialise the sketch and, if any mark
 * dips below the ground line (y > 0), lift the whole figure so it rests on
 * the ground. Anchors move with it.
 */
export function finishFigure(sk: Sketch, anchors: FigureAnchors): { svg: string; anchors: FigureAnchors } {
  const b = sk.bounds();
  const below = b.maxY - sk.pen.lw;
  const svg = sk.svg();
  if (!(below > 1e-6)) return { svg, anchors };
  const dy = -below;
  const mv = (p: Point) => ({ x: p.x, y: p.y + dy });
  return {
    svg: shiftSvgY(svg, dy),
    anchors: {
      ...anchors,
      head: mv(anchors.head),
      mouth: mv(anchors.mouth),
      ...(anchors.hand ? { hand: mv(anchors.hand) } : {}),
      top: anchors.top + dy,
      waist: anchors.waist + dy,
      shoulders: anchors.shoulders + dy,
    },
  };
}
