/**
 * The per-call drawing stage for environments: camera, palette, level of
 * detail, and a painter's list of SVG items (layer, then far-to-near depth).
 */
import type { Box, EnvFeature, Environment, Point, Shot, Tone } from "../contracts.js";
import type { EnvironmentRequest } from "../internal.js";
import { INK, PAPER, toneFill } from "../style.js";
import { n, polyPath } from "../svg.js";
import { bboxOf, intersects, project, projectPoly, projectSeg, scaleAt, type Camera, type V3 } from "./camera.js";
import { pathAreaIn } from "./compact.js";

export const LAYER = {
  sky: 0,
  far: 1,
  ground: 2,
  decal: 3,
  stand: 4,
  atmos: 5,
} as const;

export interface Palette {
  ink: string;
  sky: string;
  wall: string;
  shade: string;
  deep: string;
  roof: string;
  glass: string;
  lit: string;
  ground: string;
  foliage: string;
  foliageShade: string;
  wood: string;
  night: boolean;
  dusk: boolean;
}

export interface Item {
  layer: number;
  z: number;
  seq: number;
  svg: string;
}

export interface Stage {
  env: Environment;
  features: ReadonlySet<EnvFeature>;
  cam: Camera;
  box: Box;
  shot: Shot;
  /** 0 = close-up backdrop, 1 = medium, 2 = full, 3 = wide/establishing. */
  lod: number;
  /** Close-up treatment: softer grey strokes, fewer lines. */
  soft: boolean;
  time: EnvironmentRequest["time"];
  weather: EnvironmentRequest["weather"];
  snow: boolean;
  lw: number;
  /** Depth (metres) where mid-depth figures stand. */
  zmid: number;
  rand: () => number;
  p: string;
  pal: Palette;
  items: Item[];
  anchors: Record<string, Point>;
  seed: number;
  /** Shared <symbol>-style definitions (id → markup), emitted once in <defs>. */
  defs?: Map<string, string>;
}

/**
 * Register a reusable definition and return its id. Identical markup is
 * stored once, so repeated parts (windows of one size) share one definition.
 */
export function defineOnce(st: Stage, kind: string, markup: string): string {
  if (!st.defs) st.defs = new Map();
  for (const [id, m] of st.defs) if (m === markup) return id;
  const id = `${st.p}${kind}${st.defs.size.toString(36)}`;
  st.defs.set(id, markup);
  return id;
}

export function palette(time: EnvironmentRequest["time"], weather: EnvironmentRequest["weather"], p: string, soft: boolean, interior = false): Palette {
  const t = (tone: Parameters<typeof toneFill>[0]) => toneFill(tone, p);
  const night = time === "night";
  const dusk = time === "dusk";
  const grey = weather === "rain" || weather === "storm" || weather === "fog" || weather === "snow";
  const base: Palette = {
    ink: soft ? "#6e6e6e" : INK,
    sky: PAPER,
    wall: PAPER,
    shade: t("dots"),
    deep: t("dark"),
    roof: PAPER,
    glass: t("dark"),
    lit: PAPER,
    ground: PAPER,
    foliage: PAPER,
    foliageShade: t("dots"),
    wood: PAPER,
    night,
    dusk,
  };
  if (night && interior) {
    // lamp-lit rooms: flat greys (screentone over a whole room reads as mush
    // behind figures); the floor stays lighter than the walls
    return {
      ...base,
      sky: t("black"),
      wall: t("dark"),
      shade: t("black"),
      deep: t("black"),
      roof: t("dark"),
      glass: t("black"),
      ground: t("mid"),
      foliage: t("mid"),
      foliageShade: t("dark"),
      wood: t("mid"),
    };
  }
  if (night) {
    return {
      ...base,
      sky: t(weather === "storm" ? "dark" : "black"),
      wall: t("dark"),
      shade: t("black"),
      deep: t("black"),
      roof: t("black"),
      glass: t("black"),
      lit: PAPER,
      ground: t("dark"),
      foliage: t("dark"),
      foliageShade: t("black"),
      wood: t("dark"),
    };
  }
  if (dusk) {
    return { ...base, wall: PAPER, shade: t("dense_dots"), roof: t("dots"), glass: t("dark"), ground: PAPER };
  }
  if (grey) {
    return { ...base, sky: weather === "storm" ? t("mid") : t("light") };
  }
  return base;
}

export function add(st: Stage, layer: number, z: number, svg: string): void {
  if (!svg) return;
  st.items.push({ layer, z, seq: st.items.length, svg });
}

/**
 * Serialise the painter's list. `patternBudget` is the fraction of the panel
 * that screentone patterns may cover: the smallest patterned shapes (accents,
 * shade sides, foliage) keep their tone and the largest fall back to flat
 * greys once the budget is spent, so no panel drowns in dots.
 */
export function compose(st: Stage, patternBudget = 1): string {
  const sorted = [...st.items].sort((a, b) => a.layer - b.layer || b.z - a.z || a.seq - b.seq);
  let body = sorted.map((i) => i.svg).join("");
  let defs = st.defs && st.defs.size ? [...st.defs].map(([id, m]) => `<g id="${id}">${m}</g>`).join("") : "";
  if (patternBudget < 1) {
    body = limitPatternTone(body, st.box, st.p, patternBudget);
    defs = limitPatternTone(defs, st.box, st.p, patternBudget);
  }
  return `${defs ? `<defs>${defs}</defs>` : ""}<g stroke-linejoin="round" stroke-linecap="round">${body}</g>`;
}

/** Flat grey that stands in for a screentone pattern. */
export const FLAT_FOR_PATTERN: Record<string, Tone> = {
  dots: "light",
  dense_dots: "mid",
  stripes: "mid",
  check: "mid",
  flowers: "light",
  gold: "light",
  stone: "light",
};

function escRe(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function limitPatternTone(svg: string, box: Box, prefix: string, frac: number): string {
  const budget = Math.max(0, frac) * box.w * box.h;
  const el = new RegExp(`<(path|circle|ellipse|rect)\\b([^>]*?)fill="url\\(#${escRe(prefix)}tone-([a-z_]+)\\)"([^>]*)>`, "g");
  const areas: { i: number; area: number }[] = [];
  let i = 0;
  for (const m of svg.matchAll(el)) {
    const tone = m[3];
    const idx = i;
    i += 1;
    if (!FLAT_FOR_PATTERN[tone]) continue;
    const attrs = `${m[2]} ${m[4]}`;
    let area = 0;
    if (m[1] === "path") {
      const d = /\sd="([^"]*)"/.exec(` ${attrs}`);
      area = d ? pathAreaIn(d[1], box) : 0;
    } else {
      const num = (k: string) => Number(new RegExp(`\\s${k}="(-?[\\d.]+)"`).exec(` ${attrs}`)?.[1] ?? 0);
      area = m[1] === "circle" ? Math.PI * num("r") ** 2 : m[1] === "ellipse" ? Math.PI * num("rx") * num("ry") : num("width") * num("height");
      area = Math.min(area, box.w * box.h);
    }
    areas.push({ i: idx, area });
  }
  if (areas.length === 0) return svg;
  const sorted = [...areas].sort((a, b) => a.area - b.area || a.i - b.i);
  const flatten = new Set<number>();
  let used = 0;
  for (const a of sorted) {
    if (used + a.area <= budget) used += a.area;
    else flatten.add(a.i);
  }
  if (flatten.size === 0) return svg;
  let k = 0;
  return svg.replace(el, (all, _tag: string, _a: string, tone: string) => {
    const idx = k;
    k += 1;
    if (!flatten.has(idx) || !FLAT_FOR_PATTERN[tone]) return all;
    return all.replace(`fill="url(#${prefix}tone-${tone})"`, `fill="${toneFill(FLAT_FOR_PATTERN[tone], prefix)}"`);
  });
}

/** Stroke width for an element at camera depth z (thinner with distance). */
export function wAt(st: Stage, z: number, base = 1): number {
  const k = Math.pow(st.zmid / Math.max(z, 0.3), 0.4);
  const clamped = Math.min(1.3, Math.max(0.35, k));
  return st.lw * base * clamped * (st.soft ? 0.8 : 1);
}

export interface Style {
  fill?: string;
  stroke?: string | null;
  w?: number;
  opacity?: number;
  join?: "round" | "miter";
  evenodd?: boolean;
}

export function pathEl(d: string, style: Style): string {
  if (!d) return "";
  const fill = style.fill ?? "none";
  let s = `<path d="${d}" fill="${fill}"`;
  if (style.evenodd) s += ` fill-rule="evenodd"`;
  if (style.stroke) {
    // round joins/caps come from the wrapping group (see compose)
    s += ` stroke="${style.stroke}" stroke-width="${n(style.w ?? 1)}"${style.join === "miter" ? ` stroke-linejoin="miter"` : ""}`;
  }
  // fill-/stroke-opacity (not opacity): no offscreen layer, which resvg mishandles inside clips
  if (style.opacity !== undefined && style.opacity < 1) {
    if (fill !== "none") s += ` fill-opacity="${n(style.opacity)}"`;
    if (style.stroke) s += ` stroke-opacity="${n(style.opacity)}"`;
  }
  return `${s}/>`;
}

export function visible(st: Stage, pts: readonly Point[], margin = 24): boolean {
  if (pts.length === 0) return false;
  return intersects(bboxOf(pts), st.box, margin);
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** Compact path data using relative moves (same geometry as polyPath, fewer bytes). */
export function relPoly(pts: readonly Point[], close = true): string {
  if (pts.length === 0) return "";
  let px = r2(pts[0].x);
  let py = r2(pts[0].y);
  let d = `M${n(px)} ${n(py)}l`;
  for (let i = 1; i < pts.length; i += 1) {
    const x = r2(pts[i].x);
    const y = r2(pts[i].y);
    d += `${i > 1 ? " " : ""}${n(x - px)} ${n(y - py)}`;
    px = x;
    py = y;
  }
  return close ? `${d}z` : d;
}

/**
 * Guard rectangle: projected geometry is clipped to the panel grown by its
 * own size on every side. Planes that pass close to the camera otherwise
 * project to coordinates in the tens of thousands, which cost bytes and can
 * make the preview rasteriser (resvg) panic.
 */
function guard(st: Stage): { x0: number; y0: number; x1: number; y1: number } {
  const b = st.box;
  const m = Math.max(b.w, b.h);
  return { x0: b.x - m, y0: b.y - m, x1: b.x + b.w + m, y1: b.y + b.h + m };
}

/** Sutherland–Hodgman clip of a polygon to an axis-aligned rectangle. */
export function clipPolygon(pts: readonly Point[], r: { x0: number; y0: number; x1: number; y1: number }): Point[] {
  let out: Point[] = [...pts];
  const edges: [(p: Point) => boolean, (a: Point, b: Point) => Point][] = [
    [(p) => p.x >= r.x0, (a, b) => ({ x: r.x0, y: a.y + ((b.y - a.y) * (r.x0 - a.x)) / (b.x - a.x) })],
    [(p) => p.x <= r.x1, (a, b) => ({ x: r.x1, y: a.y + ((b.y - a.y) * (r.x1 - a.x)) / (b.x - a.x) })],
    [(p) => p.y >= r.y0, (a, b) => ({ x: a.x + ((b.x - a.x) * (r.y0 - a.y)) / (b.y - a.y), y: r.y0 })],
    [(p) => p.y <= r.y1, (a, b) => ({ x: a.x + ((b.x - a.x) * (r.y1 - a.y)) / (b.y - a.y), y: r.y1 })],
  ];
  for (const [inside, cut] of edges) {
    if (out.length === 0) break;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i += 1) {
      const a = input[i];
      const b = input[(i + 1) % input.length];
      const ain = inside(a);
      const bin = inside(b);
      if (ain) out.push(a);
      if (ain !== bin) out.push(cut(a, b));
    }
  }
  return out;
}

function outside(p: Point, r: { x0: number; y0: number; x1: number; y1: number }): boolean {
  return p.x < r.x0 || p.x > r.x1 || p.y < r.y0 || p.y > r.y1;
}

/** Projected polygon path data, or "" when culled. */
export function polyD(st: Stage, pts3: readonly V3[]): string {
  let pts = projectPoly(st.cam, pts3);
  if (pts.length < 3 || !visible(st, pts)) return "";
  const g = guard(st);
  if (pts.some((p) => outside(p, g))) {
    pts = clipPolygon(pts, g);
    if (pts.length < 3) return "";
  }
  return relPoly(pts, true);
}

export function poly3(st: Stage, pts3: readonly V3[], style: Style): string {
  return pathEl(polyD(st, pts3), style);
}

/** Projected segment path data ("M..L.."), or "" when culled. */
export function segD(st: Stage, a: V3, b: V3): string {
  const seg = projectSeg(st.cam, a, b);
  if (!seg) return "";
  if (!visible(st, seg, 4)) return "";
  const g = guard(st);
  if (outside(seg[0], g) || outside(seg[1], g)) {
    const c = clipSegment(seg[0], seg[1], g);
    if (!c) return "";
    return relPoly(c, false);
  }
  return relPoly(seg, false);
}

/** Liang–Barsky clip of a segment to an axis-aligned rectangle. */
function clipSegment(a: Point, b: Point, r: { x0: number; y0: number; x1: number; y1: number }): [Point, Point] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const test = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  if (!test(-dx, a.x - r.x0) || !test(dx, r.x1 - a.x) || !test(-dy, a.y - r.y0) || !test(dy, r.y1 - a.y)) return null;
  return [
    { x: a.x + dx * t0, y: a.y + dy * t0 },
    { x: a.x + dx * t1, y: a.y + dy * t1 },
  ];
}

/** Polyline through world points (open), clipped per segment. */
export function polylineD(st: Stage, pts3: readonly V3[]): string {
  let d = "";
  let last: Point | null = null;
  for (let i = 0; i + 1 < pts3.length; i += 1) {
    const seg = projectSeg(st.cam, pts3[i], pts3[i + 1]);
    if (!seg) {
      last = null;
      continue;
    }
    const [a, b] = seg;
    if (!last || Math.abs(last.x - a.x) > 0.01 || Math.abs(last.y - a.y) > 0.01) d += `M${n(a.x)} ${n(a.y)}`;
    d += `L${n(b.x)} ${n(b.y)}`;
    last = b;
  }
  return d;
}

/** A billboard placement: maps local metres (x right, y up) to page space. */
export interface Place {
  at: (x: number, y: number) => Point;
  /** Page units per metre. */
  k: number;
  /** Camera depth. */
  z: number;
  base: Point;
}

export function place(st: Stage, p: V3): Place | null {
  const base = project(st.cam, p);
  if (!base) return null;
  const k = scaleAt(st.cam, p);
  const z = st.cam.F / k;
  return { at: (x: number, y: number) => ({ x: base.x + x * k, y: base.y - y * k }), k, z, base };
}

/** Quick check whether a billboard of the given size (metres) is on screen. */
export function placeVisible(st: Stage, pl: Place, halfW: number, height: number): boolean {
  const pts = [pl.at(-halfW, 0), pl.at(halfW, height)];
  return visible(st, pts, 10);
}

/**
 * Depth of the backdrop behind the figures, in metres. Upward-looking shots
 * pull the architecture in so it looms overhead instead of sitting at the
 * bottom of the frame.
 */
export function backDist(st: Stage, d: number): number {
  const k = st.cam.s > 0.35 ? 0.38 : st.cam.s > 0.1 ? 0.65 : 1;
  return d * k;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length) % items.length];
}

export function rectD(x: number, y: number, w: number, h: number): string {
  return `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
}

/** Full-box background rect in the given fill. */
export function boxRect(st: Stage, fill: string, opacity?: number, pad = 2): string {
  const b = st.box;
  return pathEl(rectD(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2), { fill, opacity });
}
