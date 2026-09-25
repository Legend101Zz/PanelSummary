/**
 * Manga effects in page space. Each effect returns an `under` fragment
 * (between the background and the figures) and an `over` fragment (on top of
 * the figures). Effects that attach to characters use `request.heads`.
 */
import type { Box, FxId, Point } from "../contracts.js";
import type { DrawContext, FxModule, FxRequest } from "../internal.js";
import { INK, PAPER, toneFill } from "../style.js";
import { n, smoothPath } from "../svg.js";
import { between, hashString, seeded } from "../prng.js";

interface Out {
  under: string;
  over: string;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** Compact closed polygon path data. */
function pd(pts: readonly Point[]): string {
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
  return `${d}z`;
}

function path(d: string, attrs: string): string {
  return d ? `<path d="${d}" ${attrs}/>` : "";
}

/** Thin spindle: tapered at both ends, widest at `peak` (0..1). */
function spindle(a: Point, b: Point, w: number, peak = 0.5): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  const m = { x: a.x + dx * peak, y: a.y + dy * peak };
  return pd([a, { x: m.x + nx, y: m.y + ny }, b, { x: m.x - nx, y: m.y - ny }]);
}

/** Wedge: wide at `a`, point at `b`. */
function wedge(a: Point, b: Point, w: number): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  return pd([{ x: a.x + nx, y: a.y + ny }, b, { x: a.x - nx, y: a.y - ny }]);
}

function star4(x: number, y: number, r: number, thin = 0.2): string {
  const q = r * thin;
  return pd([
    { x, y: y - r },
    { x: x + q, y: y - q },
    { x: x + r, y },
    { x: x + q, y: y + q },
    { x, y: y + r },
    { x: x - q, y: y + q },
    { x: x - r, y },
    { x: x - q, y: y - q },
  ]);
}

function circleD(x: number, y: number, r: number): string {
  return `M${n(x - r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0z`;
}

function rectD(b: Box, pad = 0): string {
  return `M${n(b.x - pad)} ${n(b.y - pad)}h${n(b.w + pad * 2)}v${n(b.h + pad * 2)}h${n(-b.w - pad * 2)}z`;
}

/** Ray from p toward angle a, clipped to the box edge (plus margin). */
function toEdge(p: Point, a: number, b: Box, margin = 4): Point {
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const tx = dx > 0 ? (b.x + b.w + margin - p.x) / dx : dx < 0 ? (b.x - margin - p.x) / dx : Infinity;
  const ty = dy > 0 ? (b.y + b.h + margin - p.y) / dy : dy < 0 ? (b.y - margin - p.y) / dy : Infinity;
  const t = Math.max(0, Math.min(tx, ty));
  return { x: p.x + dx * t, y: p.y + dy * t };
}

const INKF = `fill="${INK}"`;

type Drawer = (r: FxRequest, rand: () => number, id: string, p: string) => Out;

const speedLines: Drawer = (r, rand) => {
  const b = r.box;
  const f = r.focus;
  // horizontal motion lines; clear band around the focus
  const clearR = Math.min(b.w, b.h) * 0.24;
  const count = Math.round(b.h / 1.5);
  let d = "";
  for (let i = 0; i < count; i += 1) {
    const y = b.y + rand() * b.h;
    const dist = Math.abs(y - f.y) / clearR;
    // denser away from the focus band
    if (dist < 1 && rand() > dist * dist * 0.5) continue;
    const w = between(rand, 0.7, 3) * r.lineWidth * (dist > 1.6 ? 1.35 : 1);
    let x0 = b.x - 10 + rand() * b.w * 0.2;
    let x1 = b.x + b.w * between(rand, 0.6, 1.08);
    if (dist < 1.1) {
      // stop short of the focus on either side
      const half = clearR * Math.sqrt(Math.max(0, 1.2 - dist * dist)) * 1.1;
      if (rand() < 0.5) x1 = Math.min(x1, f.x - half);
      else x0 = Math.max(x0, f.x + half);
      if (x1 - x0 < 20) continue;
    }
    d += spindle({ x: x0, y }, { x: x1, y: y + between(rand, -0.6, 0.6) }, w, between(rand, 0.3, 0.7));
  }
  return { under: path(d, INKF), over: "" };
};

const focusLines: Drawer = (r, rand) => {
  const b = r.box;
  const f = r.focus;
  const r0 = Math.min(b.w, b.h) * 0.3;
  const count = Math.round((b.w + b.h) / 5.5);
  let d = "";
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + between(rand, -0.5, 0.5) * ((Math.PI * 2) / count);
    const outer = toEdge(f, a, b, 8);
    const inner = r0 * between(rand, 0.85, 1.45);
    const tip = { x: f.x + Math.cos(a) * inner, y: f.y + Math.sin(a) * inner };
    const reach = Math.hypot(outer.x - f.x, outer.y - f.y);
    if (reach <= inner + 8) continue;
    const w = between(rand, 1.2, 4.2) * r.lineWidth * (reach / 260 + 0.6);
    d += wedge(outer, tip, w);
  }
  return { under: path(d, INKF), over: "" };
};

const impactBurst: Drawer = (r, rand) => {
  const b = r.box;
  const f = r.focus;
  const R = Math.min(b.w, b.h) * 0.46;
  const spikes = 18;
  const outer: Point[] = [];
  const inner: Point[] = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const a = (i / (spikes * 2)) * Math.PI * 2 + between(rand, -0.04, 0.04);
    const long = i % 2 === 0;
    const ro = long ? R * between(rand, 0.85, 1.25) : R * between(rand, 0.45, 0.58);
    outer.push({ x: f.x + Math.cos(a) * ro, y: f.y + Math.sin(a) * ro * 0.85 });
    const ri = long ? ro * 0.68 : ro * 0.72;
    inner.push({ x: f.x + Math.cos(a) * ri, y: f.y + Math.sin(a) * ri * 0.85 });
  }
  const under =
    path(pd(outer), `fill="${INK}" stroke="${INK}" stroke-width="${n(r.lineWidth * 1.5)}" stroke-linejoin="miter"`) +
    path(pd(inner), `fill="${PAPER}" stroke="${INK}" stroke-width="${n(r.lineWidth)}" stroke-linejoin="miter"`);
  // a few debris flecks
  let flecks = "";
  for (let i = 0; i < 8; i += 1) {
    const a = rand() * Math.PI * 2;
    const d = R * between(rand, 1.1, 1.5);
    flecks += star4(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.85, between(rand, 3, 7), 0.3);
  }
  return { under: under + path(flecks, INKF), over: "" };
};

const sparkleFx: Drawer = (r, rand) => {
  const b = r.box;
  const f = r.focus;
  const S = Math.min(b.w, b.h);
  let big = "";
  let dots = "";
  const count = 7;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + between(rand, -0.3, 0.3);
    const d = S * between(rand, 0.18, 0.42);
    const x = f.x + Math.cos(a) * d;
    const y = f.y + Math.sin(a) * d * 0.8;
    const rr = S * (i % 3 === 0 ? between(rand, 0.05, 0.075) : between(rand, 0.022, 0.04));
    big += star4(x, y, rr, 0.16);
    if (i % 2 === 0) dots += circleD(x + rr * 1.3, y - rr * 0.9, Math.max(1.2, rr * 0.16));
  }
  return {
    under: "",
    over: path(big, `fill="${PAPER}" stroke="${INK}" stroke-width="${n(r.lineWidth)}" stroke-linejoin="round"`) + path(dots, `fill="${PAPER}" stroke="${INK}" stroke-width="${n(r.lineWidth * 0.7)}"`),
  };
};

function headsOrFocus(r: FxRequest): { point: Point; radius: number }[] {
  if (r.heads.length) return r.heads;
  return [{ point: r.focus, radius: Math.min(r.box.w, r.box.h) * 0.08 }];
}

const sweatDrop: Drawer = (r, rand) => {
  let d = "";
  let shine = "";
  for (const h of headsOrFocus(r)) {
    const R = h.radius;
    const drops: [number, number, number][] = [
      [0.95, -0.55, 0.5],
      [1.25, 0.05, 0.28],
    ];
    for (const [ox, oy, s] of drops) {
      const x = h.point.x + ox * R;
      const y = h.point.y + oy * R;
      const hgt = R * s * 1.5;
      const w = hgt * 0.42;
      d += `M${n(x)} ${n(y - hgt)}C${n(x + w * 0.35)} ${n(y - hgt * 0.55)} ${n(x + w)} ${n(y - hgt * 0.25)} ${n(x + w)} ${n(y)}A${n(w)} ${n(w)} 0 0 1 ${n(x - w)} ${n(y)}C${n(x - w)} ${n(y - hgt * 0.25)} ${n(x - w * 0.35)} ${n(y - hgt * 0.55)} ${n(x)} ${n(y - hgt)}z`;
      shine += `M${n(x - w * 0.45)} ${n(y - w * 0.1)}q${n(-w * 0.05)} ${n(w * 0.45)} ${n(w * 0.3)} ${n(w * 0.65)}`;
    }
    void rand;
  }
  return {
    under: "",
    over:
      path(d, `fill="${PAPER}" stroke="${INK}" stroke-width="${n(r.lineWidth * 1.6)}" stroke-linejoin="round"`) +
      path(shine, `fill="none" stroke="${INK}" stroke-width="${n(r.lineWidth)}" stroke-linecap="round"`),
  };
};

const angerMark: Drawer = (r) => {
  let d = "";
  for (const h of headsOrFocus(r)) {
    const R = h.radius;
    const cx = h.point.x + R * 0.72;
    const cy = h.point.y - R * 0.78;
    const s = R * 0.5;
    // four corner brackets around a cross-shaped gap (the popping vein):
    // each bracket's corner points at the centre, its arms run outward
    for (const [sx, sy] of [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ]) {
      const c = { x: cx + sx * s * 0.3, y: cy + sy * s * 0.3 };
      const p1 = { x: cx + sx * s * 1.0, y: cy + sy * s * 0.26 };
      const p2 = { x: cx + sx * s * 0.26, y: cy + sy * s * 1.0 };
      d += `M${n(p1.x)} ${n(p1.y)}Q${n(c.x)} ${n(c.y)} ${n(p2.x)} ${n(p2.y)}`;
    }
  }
  const w = r.lineWidth * 2.4;
  return {
    under: "",
    over: path(d, `fill="none" stroke="${PAPER}" stroke-width="${n(w * 2.2)}" stroke-linecap="round"`) + path(d, `fill="none" stroke="${INK}" stroke-width="${n(w)}" stroke-linecap="round"`),
  };
};

const shockLines: Drawer = (r, rand) => {
  let lines = "";
  let marks = "";
  for (const h of headsOrFocus(r)) {
    const R = h.radius;
    const top = h.point.y - R * 1.05;
    const count = 9;
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      const x = h.point.x - R * 0.72 + t * R * 1.44;
      const edge = Math.sqrt(Math.max(0, 1 - Math.pow((x - h.point.x) / R, 2)));
      const y0 = h.point.y - R * edge * 0.98;
      const len = R * between(rand, 0.35, 0.75);
      lines += spindle({ x, y: y0 + 1 }, { x, y: y0 + len }, r.lineWidth * 1.4, 0.2);
      void top;
    }
    // jolt marks outside the head
    for (const side of [-1, 1]) {
      for (let j = 0; j < 3; j += 1) {
        const a = -Math.PI / 2 + side * (0.55 + j * 0.28);
        const r0 = R * 1.25;
        const r1 = R * (1.55 + (j === 1 ? 0.2 : 0));
        marks += wedge({ x: h.point.x + Math.cos(a) * r1, y: h.point.y + Math.sin(a) * r1 }, { x: h.point.x + Math.cos(a) * r0, y: h.point.y + Math.sin(a) * r0 }, r.lineWidth * 3.2);
      }
    }
  }
  return { under: "", over: path(lines, INKF) + path(marks, INKF) };
};

const rainFx: Drawer = (r, rand) => {
  const b = r.box;
  const count = Math.round((b.w * b.h) / 900);
  const slant = 0.22;
  let d = "";
  let hi = "";
  for (let i = 0; i < count; i += 1) {
    const x = b.x + rand() * (b.w + b.h * slant);
    const y = b.y + rand() * b.h;
    const len = between(rand, 14, 42);
    const a = { x, y };
    const e = { x: x - len * slant, y: y + len };
    d += spindle(a, e, between(rand, 0.8, 1.6) * r.lineWidth, 0.7);
    if (i % 5 === 0) hi += `M${n(a.x + 1.4)} ${n(a.y)}l${n(-len * slant * 0.6)} ${n(len * 0.6)}`;
  }
  return { under: "", over: path(hi, `fill="none" stroke="${PAPER}" stroke-width="${n(r.lineWidth * 1.2)}"`) + path(d, INKF) };
};

const snowFx: Drawer = (r, rand) => {
  const b = r.box;
  const count = Math.round((b.w * b.h) / 1600);
  let small = "";
  let big = "";
  for (let i = 0; i < count; i += 1) {
    const x = b.x + rand() * b.w;
    const y = b.y + rand() * b.h;
    const fore = rand() < 0.12;
    const rr = fore ? between(rand, 4, 7.5) : between(rand, 1.2, 3.2);
    if (fore) big += circleD(x, y, rr);
    else small += circleD(x, y, rr);
  }
  return {
    under: "",
    over: path(small, `fill="${PAPER}" stroke="${INK}" stroke-width="${n(r.lineWidth * 0.55)}"`) + path(big, `fill="${PAPER}" stroke="#8a8a8a" stroke-width="${n(r.lineWidth * 0.8)}"`),
  };
};

const windFx: Drawer = (r, rand) => {
  const b = r.box;
  const f = r.focus;
  let d = "";
  let leaves = "";
  const count = 6;
  for (let i = 0; i < count; i += 1) {
    // keep the swooshes off the focus
    let y = b.y + b.h * ((i + 0.5) / count) + between(rand, -0.05, 0.05) * b.h;
    if (Math.abs(y - f.y) < b.h * 0.12) y += (y < f.y ? -1 : 1) * b.h * 0.12;
    const x0 = b.x + b.w * between(rand, -0.05, 0.35);
    const len = b.w * between(rand, 0.35, 0.6);
    const amp = b.h * between(rand, 0.03, 0.07);
    d += `M${n(x0)} ${n(y)}c${n(len * 0.3)} ${n(-amp)} ${n(len * 0.65)} ${n(amp)} ${n(len)} ${n(-amp * 0.3)}`;
    d += `c${n(len * 0.12)} ${n(-amp * 0.2)} ${n(len * 0.1)} ${n(-amp * 1.4)} ${n(-len * 0.04)} ${n(-amp * 1.3)}c${n(-len * 0.06)} ${n(amp * 0.05)} ${n(-len * 0.05)} ${n(amp * 0.5)} 0 ${n(amp * 0.55)}`;
    if (i % 2 === 0) {
      const lx = x0 + len * between(rand, 0.3, 0.9);
      const ly = y + between(rand, -1.5, 1.5) * amp;
      const s = Math.min(b.w, b.h) * 0.022;
      const a = rand() * Math.PI;
      const ux = Math.cos(a) * s;
      const uy = Math.sin(a) * s;
      leaves += `M${n(lx - ux)} ${n(ly - uy)}Q${n(lx + uy)} ${n(ly - ux)} ${n(lx + ux)} ${n(ly + uy)}Q${n(lx - uy)} ${n(ly + ux)} ${n(lx - ux)} ${n(ly - uy)}z`;
    }
  }
  return {
    under: "",
    over:
      path(d, `fill="none" stroke="${PAPER}" stroke-width="${n(r.lineWidth * 3.4)}" stroke-linecap="round"`) +
      path(d, `fill="none" stroke="${INK}" stroke-width="${n(r.lineWidth * 1.2)}" stroke-linecap="round"`) +
      path(leaves, `fill="${PAPER}" stroke="${INK}" stroke-width="${n(r.lineWidth)}"`),
  };
};

const lightRays: Drawer = (r, rand, _id, p) => {
  const b = r.box;
  const src = { x: b.x + b.w * between(rand, 0.3, 0.7), y: b.y - b.h * 0.35 };
  // a toned veil the beams cut through
  let s = path(rectD(b, 2), `fill="${toneFill("dots", p)}" fill-opacity="0.55"`);
  let beams = "";
  let edges = "";
  const count = 6;
  for (let i = 0; i < count; i += 1) {
    const a0 = Math.PI / 2 + ((i - (count - 1) / 2) / count) * 1.5 + between(rand, -0.06, 0.06);
    const spread = between(rand, 0.05, 0.12);
    const e0 = toEdge(src, a0 - spread, { x: b.x, y: b.y, w: b.w, h: b.h }, 6);
    const e1 = toEdge(src, a0 + spread, { x: b.x, y: b.y, w: b.w, h: b.h }, 6);
    beams += pd([src, e0, e1]);
    if (i % 2 === 0) edges += `M${n(src.x)} ${n(src.y)}L${n(e0.x)} ${n(e0.y)}`;
  }
  s += path(beams, `fill="${PAPER}" fill-opacity="0.85"`);
  s += path(edges, `fill="none" stroke="${INK}" stroke-width="${n(r.lineWidth * 0.5)}" stroke-opacity="0.6"`);
  return { under: s, over: "" };
};

/** Donut path: box minus an ellipse (evenodd). */
function vignetteD(b: Box, c: Point, rx: number, ry: number, wobble: number, rand: () => number): string {
  const N = 40;
  const pts: Point[] = [];
  for (let i = 0; i < N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    const k = 1 + (rand() - 0.5) * wobble;
    pts.push({ x: c.x + Math.cos(a) * rx * k, y: c.y + Math.sin(a) * ry * k });
  }
  return rectD(b, 4) + smoothPath(pts, true);
}

const darkMood: Drawer = (r, rand, _id, p) => {
  const b = r.box;
  // centred on the panel, pulled a little toward the focus
  const c = { x: b.x + b.w / 2 + (r.focus.x - b.x - b.w / 2) * 0.3, y: b.y + b.h / 2 + (r.focus.y - b.y - b.h / 2) * 0.3 };
  const rx = b.w * 0.46;
  const ry = b.h * 0.44;
  let s = path(rectD(b, 2), `fill="${toneFill("dots", p)}" fill-opacity="0.55"`);
  s += path(vignetteD(b, c, rx, ry, 0.06, rand), `fill="${toneFill("dense_dots", p)}" fill-rule="evenodd"`);
  s += path(vignetteD(b, c, rx * 1.22, ry * 1.22, 0.08, rand), `fill="${toneFill("dark", p)}" fill-opacity="0.85" fill-rule="evenodd"`);
  s += path(vignetteD(b, c, rx * 1.45, ry * 1.45, 0.1, rand), `fill="${INK}" fill-rule="evenodd"`);
  return { under: s, over: "" };
};

const softGlow: Drawer = (r, rand, id) => {
  const b = r.box;
  const f = r.focus;
  const R = Math.min(b.w, b.h) * 0.55;
  const grad = `<defs><radialGradient id="${id}glow" cx="${n(f.x)}" cy="${n(f.y)}" r="${n(R)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${PAPER}" stop-opacity="1"/><stop offset="0.45" stop-color="${PAPER}" stop-opacity="0.8"/><stop offset="1" stop-color="${PAPER}" stop-opacity="0"/></radialGradient></defs>`;
  let dots = "";
  for (let i = 0; i < 10; i += 1) {
    const a = rand() * Math.PI * 2;
    const d = R * between(rand, 0.5, 0.95);
    dots += circleD(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, between(rand, 1.5, 4));
  }
  return {
    under: grad + `<circle cx="${n(f.x)}" cy="${n(f.y)}" r="${n(R)}" fill="url(#${id}glow)"/>` + path(dots, `fill="${PAPER}" stroke="${INK}" stroke-width="${n(r.lineWidth * 0.4)}"`),
    over: "",
  };
};

const flashback: Drawer = (r, rand, _id, p) => {
  const b = r.box;
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  // soft tone wash over everything + black frame edges with a wavy inner edge
  let s = path(rectD(b, 2), `fill="${toneFill("dots", p)}" fill-opacity="0.4"`);
  const N = 44;
  const pts: Point[] = [];
  const inset = Math.min(b.w, b.h) * 0.07;
  for (let i = 0; i < N; i += 1) {
    const t = i / N;
    let x: number;
    let y: number;
    const per = 2 * (b.w + b.h);
    const along = t * per;
    if (along < b.w) {
      x = b.x + along;
      y = b.y;
    } else if (along < b.w + b.h) {
      x = b.x + b.w;
      y = b.y + (along - b.w);
    } else if (along < 2 * b.w + b.h) {
      x = b.x + b.w - (along - b.w - b.h);
      y = b.y + b.h;
    } else {
      x = b.x;
      y = b.y + b.h - (along - 2 * b.w - b.h);
    }
    const dx = c.x - x;
    const dy = c.y - y;
    const len = Math.hypot(dx, dy) || 1;
    const k = inset * between(rand, 0.75, 1.35);
    pts.push({ x: x + (dx / len) * k, y: y + (dy / len) * k });
  }
  s += path(rectD(b, 4) + smoothPath(pts, true), `fill="${INK}" fill-rule="evenodd"`);
  // second softer ring
  const pts2 = pts.map((q) => ({ x: q.x + (c.x - q.x) * 0.07, y: q.y + (c.y - q.y) * 0.07 }));
  s += path(smoothPath(pts, true) + smoothPath(pts2, true), `fill="${toneFill("dark", p)}" fill-opacity="0.6" fill-rule="evenodd"`);
  return { under: "", over: s };
};

const DRAWERS: Record<FxId, Drawer> = {
  speed_lines: speedLines,
  focus_lines: focusLines,
  impact_burst: impactBurst,
  sparkle: sparkleFx,
  sweat_drop: sweatDrop,
  anger_mark: angerMark,
  shock_lines: shockLines,
  rain: rainFx,
  snow: snowFx,
  wind: windFx,
  light_rays: lightRays,
  dark_mood: darkMood,
  soft_glow: softGlow,
  flashback,
};

/** Which layer each effect paints into (for callers that want to know up front). */
export const FX_LAYER: Record<FxId, "under" | "over"> = {
  speed_lines: "under",
  focus_lines: "under",
  impact_burst: "under",
  sparkle: "over",
  sweat_drop: "over",
  anger_mark: "over",
  shock_lines: "over",
  rain: "over",
  snow: "over",
  wind: "over",
  light_rays: "under",
  dark_mood: "under",
  soft_glow: "under",
  flashback: "over",
};

export const fx: FxModule = {
  draw(request: FxRequest, ctx: DrawContext): { under: string; over: string } {
    const drawer = DRAWERS[request.fx];
    if (!drawer) throw new Error(`unknown fx ${String(request.fx)}`);
    const b = request.box;
    const key = [request.fx, request.seed, n(b.x), n(b.y), n(b.w), n(b.h)].join("|");
    const rand = seeded("fx", key);
    const id = `${ctx.idPrefix}fx${hashString(key).toString(36)}`;
    const lw = request.lineWidth > 0 ? request.lineWidth : 1.1;
    const out = drawer({ ...request, lineWidth: lw }, rand, id, ctx.idPrefix);
    const wrap = (s: string): string => (s ? `<g stroke-linejoin="round" stroke-linecap="round">${s}</g>` : "");
    return { under: wrap(out.under), over: wrap(out.over) };
  },
};
