/** Nature kit: trees, bushes, hedges, flowers, reeds, rocks, water, hills, crowds. */
import type { Point } from "../contracts.js";
import { INK, PAPER, toneFill } from "../style.js";
import { n, polyPath, smoothPath } from "../svg.js";
import { between } from "../prng.js";
import { project, projectPoly, scaleAt, toCam, xRangeAt, type V3 } from "./camera.js";
import { LAYER, add, pathEl, place, placeVisible, segD, visible, wAt, type Stage } from "./stage.js";
import { boxSvg, faceVisible, frame } from "./architecture.js";

/** Scalloped closed blob (tree canopies, bushes, clouds of leaves). */
export function scallop(cx: number, cy: number, rx: number, ry: number, bumps: number, rand: () => number, flatBottom?: number): string {
  const pts: Point[] = [];
  const phase = rand() * Math.PI * 2;
  for (let i = 0; i < bumps; i += 1) {
    const a = phase + (i / bumps) * Math.PI * 2 + (rand() - 0.5) * (0.6 / bumps) * Math.PI;
    const r = 1 + (rand() - 0.5) * 0.14;
    let y = cy + Math.sin(a) * ry * r;
    if (flatBottom !== undefined && y > flatBottom) y = flatBottom;
    pts.push({ x: cx + Math.cos(a) * rx * r, y });
  }
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    const flat = flatBottom !== undefined && Math.abs(a.y - flatBottom) < 0.01 && Math.abs(b.y - flatBottom) < 0.01;
    if (flat) d += `L${n(b.x)} ${n(b.y)}`;
    else d += `A${n(chord * 0.58)} ${n(chord * 0.58)} 0 0 1 ${n(b.x)} ${n(b.y)}`;
  }
  return `${d}Z`;
}

/** Small leaf-cluster ticks inside a canopy (lower-right heavy). */
function leafTicks(cx: number, cy: number, rx: number, ry: number, count: number, rand: () => number): string {
  let d = "";
  for (let i = 0; i < count; i += 1) {
    const a = between(rand, -0.6, 2.4);
    const r = Math.sqrt(rand()) * 0.78;
    const x = cx + Math.cos(a) * rx * r;
    const y = cy + Math.sin(a) * ry * r;
    const s = Math.max(2, rx * between(rand, 0.12, 0.2));
    d += `M${n(x - s)} ${n(y - s * 0.2)}q${n(s * 0.5)} ${n(s * 0.7)} ${n(s)} 0q${n(s * 0.5)} ${n(s * 0.7)} ${n(s)} 0`;
  }
  return d;
}

export type TreeKind = "round" | "pine" | "poplar" | "bare" | "willow";

export function tree(st: Stage, x: number, z: number, opts: { h?: number; kind?: TreeKind; sortZ?: number; layer?: number } = {}): void {
  const kind: TreeKind = opts.kind ?? (st.snow && st.rand() < 0.5 ? "bare" : "round");
  const h = opts.h ?? between(st.rand, 6, 9);
  const pl = place(st, { x, y: 0, z });
  if (!pl) return;
  if (!placeVisible(st, pl, h * 0.5, h * 1.1)) return;
  const k = pl.k;
  const lw = wAt(st, pl.z);
  const P = pl.at;
  const ink = st.pal.ink;
  const fol = st.snow ? PAPER : st.pal.foliage;
  let s = "";
  const trunk = (topY: number, w0: number, w1: number): string => {
    const pts = [P(-w0, 0), P(w0, 0), P(w1, topY), P(-w1, topY)];
    let t = pathEl(polyPath(pts), { fill: st.pal.wood, stroke: ink, w: lw });
    if (w0 * k > 3) {
      t += pathEl(polyPath([P(w0 * 0.2, 0), P(w0, 0), P(w1, topY), P(w1 * 0.2, topY)]), { fill: st.pal.shade });
      t += pathEl(polyPath(pts), { stroke: ink, w: lw });
      // root flare
      t += pathEl(`M${n(P(-w0 * 1.8, 0).x)} ${n(P(0, 0).y)}Q${n(P(-w0, 0).x)} ${n(P(0, 0.1).y)} ${n(P(-w0 * 0.9, 0.5).x)} ${n(P(0, 0.5).y)}M${n(P(w0 * 1.8, 0).x)} ${n(P(0, 0).y)}Q${n(P(w0, 0).x)} ${n(P(0, 0.1).y)} ${n(P(w0 * 0.9, 0.5).x)} ${n(P(0, 0.5).y)}`, {
        stroke: ink,
        w: lw * 0.8,
      });
    }
    return t;
  };
  if (kind === "round" || kind === "willow") {
    const cy = h * 0.62;
    const rx = h * 0.37;
    const ry = h * 0.34;
    s += trunk(cy, h * 0.045, h * 0.03);
    const c = P(0, cy);
    const bumps = Math.max(7, Math.min(13, Math.round(rx * k * 0.12) + 6));
    s += pathEl(scallop(c.x, c.y, rx * k, ry * k, bumps, st.rand), { fill: fol, stroke: ink, w: lw });
    if (rx * k > 10 && !st.snow) {
      s += pathEl(scallop(c.x + rx * k * 0.16, c.y + ry * k * 0.2, rx * k * 0.68, ry * k * 0.66, bumps - 2, st.rand), { fill: st.pal.foliageShade });
    }
    if (rx * k > 16 && st.lod >= 1) s += pathEl(leafTicks(c.x, c.y, rx * k, ry * k, Math.min(14, Math.round(rx * k * 0.25)), st.rand), { stroke: ink, w: lw * 0.55 });
    if (kind === "willow" && rx * k > 8) {
      let d = "";
      for (let i = 0; i < 9; i += 1) {
        const sx = c.x + (i / 8 - 0.5) * rx * k * 1.8;
        const sy = c.y + ry * k * 0.4;
        d += `M${n(sx)} ${n(sy)}q${n(rx * k * 0.08)} ${n(ry * k * 0.5)} ${n(rx * k * 0.02)} ${n(ry * k * 1.1)}`;
      }
      s += pathEl(d, { stroke: ink, w: lw * 0.6 });
    }
  } else if (kind === "poplar") {
    const cy = h * 0.58;
    s += trunk(h * 0.3, h * 0.03, h * 0.02);
    const c = P(0, cy);
    s += pathEl(scallop(c.x, c.y, h * 0.14 * k, h * 0.44 * k, 12, st.rand), { fill: fol, stroke: ink, w: lw });
    if (h * 0.14 * k > 5 && !st.snow) s += pathEl(scallop(c.x + h * 0.04 * k, c.y + h * 0.06 * k, h * 0.08 * k, h * 0.32 * k, 9, st.rand), { fill: st.pal.foliageShade });
  } else if (kind === "pine") {
    s += trunk(h * 0.2, h * 0.035, h * 0.03);
    const tiers = 4;
    let body = "";
    let shade = "";
    for (let t = 0; t < tiers; t += 1) {
      const y0 = h * (0.12 + t * 0.2);
      const y1 = Math.min(h, y0 + h * 0.42);
      const w = h * 0.3 * (1 - t / (tiers + 0.6));
      const teeth = 5;
      const pts: Point[] = [P(0, y1)];
      for (let i = 0; i <= teeth; i += 1) {
        const u = w - (i / teeth) * 2 * w;
        pts.push(P(u, y0 + (i % 2 === 0 ? 0 : h * 0.035)));
      }
      body += polyPath([pts[0], ...pts.slice(1).reverse()]);
      shade += polyPath([P(0, y1), P(w, y0), P(w * 0.1, y0 + h * 0.02)]);
    }
    s += pathEl(body, { fill: fol, stroke: ink, w: lw });
    if (!st.snow) s += pathEl(shade, { fill: st.pal.foliageShade });
    s += pathEl(body, { stroke: ink, w: lw });
  } else {
    // bare branching tree
    const base = h * 0.06;
    let d = "";
    const branch = (x0: number, y0: number, ang: number, len: number, depth: number): void => {
      const x1 = x0 + Math.cos(ang) * len;
      const y1 = y0 + Math.sin(ang) * len;
      const a = P(x0, y0);
      const b = P(x1, y1);
      d += `M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}`;
      if (depth <= 0) return;
      branch(x1, y1, ang + between(st.rand, 0.25, 0.6), len * 0.68, depth - 1);
      branch(x1, y1, ang - between(st.rand, 0.25, 0.6), len * 0.68, depth - 1);
    };
    s += trunk(h * 0.4, base, base * 0.6);
    branch(0, h * 0.4, Math.PI / 2 + 0.3, h * 0.28, 3);
    branch(0, h * 0.4, Math.PI / 2 - 0.35, h * 0.3, 3);
    s += pathEl(d, { stroke: st.pal.night ? PAPER : ink, w: lw * 0.9 });
  }
  add(st, opts.layer ?? LAYER.stand, opts.sortZ ?? pl.z, s);
}

export function bush(st: Stage, x: number, z: number, r = 1, opts: { flowers?: boolean } = {}): void {
  const pl = place(st, { x, y: 0, z });
  if (!pl || !placeVisible(st, pl, r * 1.4, r * 1.6)) return;
  const k = pl.k;
  const lw = wAt(st, pl.z);
  const c = pl.at(0, r * 0.75);
  const base = pl.at(0, 0);
  let s = pathEl(scallop(c.x, c.y, r * 1.35 * k, r * 0.85 * k, 9, st.rand, base.y), { fill: st.snow ? PAPER : st.pal.foliage, stroke: st.pal.ink, w: lw });
  if (r * k > 8 && !st.snow) s += pathEl(scallop(c.x + r * k * 0.25, c.y + r * k * 0.25, r * k * 0.85, r * k * 0.45, 7, st.rand, base.y), { fill: st.pal.foliageShade });
  if (opts.flowers && r * k > 6) s += blossoms(st, c, r * k, lw);
  add(st, LAYER.stand, pl.z, s);
}

function blossoms(st: Stage, c: Point, rpx: number, lw: number): string {
  let d = "";
  let dots = "";
  const count = Math.min(9, Math.round(rpx / 5));
  for (let i = 0; i < count; i += 1) {
    const x = c.x + between(st.rand, -1.1, 1.1) * rpx;
    const y = c.y + between(st.rand, -0.6, 0.2) * rpx;
    const r = Math.max(1.2, rpx * 0.09);
    d += `M${n(x - r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0`;
    dots += `M${n(x - r * 0.3)} ${n(y)}a${n(r * 0.3)} ${n(r * 0.3)} 0 1 0 ${n(r * 0.6)} 0a${n(r * 0.3)} ${n(r * 0.3)} 0 1 0 ${n(-r * 0.6)} 0`;
  }
  return pathEl(d, { fill: PAPER, stroke: INK, w: lw * 0.5 }) + pathEl(dots, { fill: INK });
}

/** Clipped hedge block: box faces, scalloped crests on visible top edges, leaf ticks. */
export function hedge(st: Stage, x0: number, x1: number, z0: number, z1: number, h: number): void {
  const fr = frame("front", 0, 0);
  const nearZ = Math.max(z0, 0.3);
  const zc = Math.max(0.5, toCam(st.cam, { x: (x0 + x1) / 2, y: h / 2, z: nearZ }).z);
  const lw = wAt(st, zc);
  const lit = st.snow ? PAPER : st.pal.foliage;
  let s = boxSvg(st, fr, { a0: x0, a1: x1, y0: 0, y1: h, d0: z0, d1: z1 }, lit, lw, lit);
  const faces: { n: V3; c: V3[] }[] = [
    { n: { x: 0, y: 0, z: -1 }, c: [{ x: x0, y: 0, z: z0 }, { x: x1, y: 0, z: z0 }, { x: x1, y: h, z: z0 }, { x: x0, y: h, z: z0 }] },
    { n: { x: -1, y: 0, z: 0 }, c: [{ x: x0, y: 0, z: z1 }, { x: x0, y: 0, z: z0 }, { x: x0, y: h, z: z0 }, { x: x0, y: h, z: z1 }] },
    { n: { x: 1, y: 0, z: 0 }, c: [{ x: x1, y: 0, z: z0 }, { x: x1, y: 0, z: z1 }, { x: x1, y: h, z: z1 }, { x: x1, y: h, z: z0 }] },
  ];
  let crest = "";
  let ticks = "";
  for (const f of faces) {
    if (!faceVisible(st, f.c[0], f.n)) continue;
    // crest along the top edge c[3] -> c[2]
    const A = f.c[3];
    const B = f.c[2];
    const len = Math.hypot(B.x - A.x, B.z - A.z);
    const steps = Math.min(90, Math.max(2, Math.round(len / 0.45)));
    let d = "";
    let prev: Point | null = null;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const p3 = { x: A.x + (B.x - A.x) * t, y: h, z: A.z + (B.z - A.z) * t };
      if (toCam(st.cam, p3).z < st.cam.near + 0.05) {
        prev = null;
        continue;
      }
      const p = project(st.cam, p3);
      if (!p) continue;
      if (!prev) d += `M${n(p.x)} ${n(p.y)}`;
      else {
        const ch = Math.hypot(p.x - prev.x, p.y - prev.y);
        if (ch > 0.4) d += `A${n(ch * 0.55)} ${n(ch * 0.55)} 0 0 ${p.x >= prev.x ? 1 : 0} ${n(p.x)} ${n(p.y)}`;
      }
      prev = p;
    }
    crest += d;
    // leaf ticks scattered over the face
    const q = f.c.map((c) => project(st.cam, c));
    if (q.some((p) => !p) || st.lod < 1) continue;
    const [p0, p1, p2, p3] = q as Point[];
    const area = Math.abs((p1.x - p0.x) * (p3.y - p0.y) - (p3.x - p0.x) * (p1.y - p0.y));
    const count = Math.min(45, Math.round(area / 260));
    const k = scaleAt(st.cam, { x: (x0 + x1) / 2, y: h / 2, z: (z0 + z1) / 2 });
    for (let i = 0; i < count; i += 1) {
      const u = st.rand();
      const v = between(st.rand, 0.15, 0.92);
      const bx = p0.x + (p1.x - p0.x) * u;
      const by = p0.y + (p1.y - p0.y) * u;
      const tx = p3.x + (p2.x - p3.x) * u;
      const ty = p3.y + (p2.y - p3.y) * u;
      const x = bx + (tx - bx) * v;
      const y = by + (ty - by) * v;
      const sz = Math.max(1.6, Math.min(7, Math.abs(ty - by) * 0.07 + k * 0.02));
      ticks += `M${n(x - sz)} ${n(y - sz * 0.3)}q${n(sz * 0.5)} ${n(sz * 0.8)} ${n(sz)} 0q${n(sz * 0.5)} ${n(sz * 0.8)} ${n(sz)} 0`;
    }
  }
  s += pathEl(crest, { fill: "none", stroke: st.pal.ink, w: lw });
  s += pathEl(ticks, { stroke: st.pal.ink, w: lw * 0.45 });
  add(st, LAYER.stand, zc, s);
}

/** Flower clump centred on (x, z). */
export function flowers(st: Stage, x: number, z: number, spread = 0.8, count = 7): void {
  const pl = place(st, { x, y: 0, z });
  if (!pl || !placeVisible(st, pl, spread, 0.8)) return;
  const k = pl.k;
  const lw = wAt(st, pl.z);
  let stems = "";
  let petals = "";
  let centres = "";
  for (let i = 0; i < count; i += 1) {
    const fx = between(st.rand, -spread, spread);
    const fz = between(st.rand, -spread * 0.5, spread * 0.5);
    const hgt = between(st.rand, 0.25, 0.55);
    const base = project(st.cam, { x: x + fx, y: 0, z: z + fz });
    const top = project(st.cam, { x: x + fx + between(st.rand, -0.05, 0.05), y: hgt, z: z + fz });
    if (!base || !top) continue;
    const kk = scaleAt(st.cam, { x: x + fx, y: hgt, z: z + fz });
    stems += `M${n(base.x)} ${n(base.y)}Q${n(base.x + 2)} ${n((base.y + top.y) / 2)} ${n(top.x)} ${n(top.y)}`;
    const r = Math.max(1, 0.06 * kk);
    if (r < 1.8) {
      centres += `M${n(top.x - r)} ${n(top.y)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0`;
      continue;
    }
    for (let p = 0; p < 5; p += 1) {
      const a = (p / 5) * Math.PI * 2 + i;
      const px = top.x + Math.cos(a) * r;
      const py = top.y + Math.sin(a) * r * 0.85;
      const pr = r * 0.62;
      petals += `M${n(px - pr)} ${n(py)}a${n(pr)} ${n(pr)} 0 1 0 ${n(pr * 2)} 0a${n(pr)} ${n(pr)} 0 1 0 ${n(-pr * 2)} 0`;
    }
    const cr = r * 0.38;
    centres += `M${n(top.x - cr)} ${n(top.y)}a${n(cr)} ${n(cr)} 0 1 0 ${n(cr * 2)} 0a${n(cr)} ${n(cr)} 0 1 0 ${n(-cr * 2)} 0`;
  }
  void k;
  const s = pathEl(stems, { stroke: st.pal.ink, w: lw * 0.5 }) + pathEl(petals, { fill: PAPER, stroke: st.pal.ink, w: lw * 0.45 }) + pathEl(centres, { fill: st.pal.ink });
  add(st, LAYER.stand, pl.z, s);
}

/** Reeds / cattails clump. */
export function reeds(st: Stage, x: number, z: number, h = 1.4, count = 7): void {
  const pl = place(st, { x, y: 0, z });
  if (!pl || !placeVisible(st, pl, 0.8, h)) return;
  const lw = wAt(st, pl.z);
  const P = pl.at;
  let blades = "";
  let heads = "";
  for (let i = 0; i < count; i += 1) {
    const bx = between(st.rand, -0.5, 0.5);
    const lean = between(st.rand, -0.35, 0.35);
    const hh = h * between(st.rand, 0.6, 1.1);
    const a = P(bx, 0);
    const c = P(bx + lean * 0.4, hh * 0.6);
    const b = P(bx + lean, hh);
    blades += `M${n(a.x)} ${n(a.y)}Q${n(c.x)} ${n(c.y)} ${n(b.x)} ${n(b.y)}`;
    if (i % 3 === 0) {
      const t = P(bx + lean * 0.85, hh * 0.88);
      const rw = Math.max(1.2, 0.05 * pl.k);
      const rh = Math.max(3, 0.18 * pl.k);
      heads += `M${n(t.x - rw)} ${n(t.y)}a${n(rw)} ${n(rh)} 0 1 0 ${n(rw * 2)} 0a${n(rw)} ${n(rh)} 0 1 0 ${n(-rw * 2)} 0`;
    }
  }
  add(st, LAYER.stand, pl.z, pathEl(blades, { stroke: st.pal.ink, w: lw * 0.7 }) + pathEl(heads, { fill: st.pal.night ? PAPER : INK }));
}

export function rock(st: Stage, x: number, z: number, r = 0.6): void {
  const pl = place(st, { x, y: 0, z });
  if (!pl || !placeVisible(st, pl, r, r)) return;
  const lw = wAt(st, pl.z);
  const P = pl.at;
  const pts: Point[] = [P(-r, 0), P(-r * 0.9, r * 0.45), P(-r * 0.4, r * 0.8), P(r * 0.3, r * 0.75), P(r * 0.85, r * 0.4), P(r, 0)];
  let s = pathEl(smoothPath(pts, true, 0.4), { fill: st.snow ? PAPER : st.pal.wall, stroke: st.pal.ink, w: lw });
  s += pathEl(polyPath([P(r * 0.2, 0), P(r * 0.35, r * 0.6), P(r * 0.85, r * 0.35), P(r, 0)]), { fill: st.pal.shade });
  s += pathEl(smoothPath(pts, true, 0.4), { stroke: st.pal.ink, w: lw });
  add(st, LAYER.stand, pl.z, s);
}

/** Rolling hills along the horizon (far layer). */
export function hills(st: Stage, heightFrac: number, fill: string, z = 1000, bumps = 3): void {
  const b = st.box;
  const baseY = st.cam.horizonY;
  if (baseY < b.y - 2 || baseY > b.y + b.h + b.h * 0.2) return;
  const amp = b.h * heightFrac;
  const pts: Point[] = [];
  const ph = st.rand() * 6.28;
  const ph2 = st.rand() * 6.28;
  const N = 24;
  for (let i = 0; i <= N; i += 1) {
    const t = i / N;
    const x = b.x - 10 + (b.w + 20) * t;
    const y = baseY - amp * (0.55 + 0.35 * Math.sin(t * Math.PI * bumps + ph) + 0.15 * Math.sin(t * Math.PI * bumps * 2.3 + ph2));
    pts.push({ x, y });
  }
  const d = `${smoothPath(pts, false)}L${n(b.x + b.w + 10)} ${n(baseY + 2)}L${n(b.x - 10)} ${n(baseY + 2)}Z`;
  add(st, LAYER.far, z, pathEl(d, { fill, stroke: st.pal.ink, w: st.lw * 0.55 }));
}

/** A band of distant tree canopies on the horizon (far layer). */
export function treeLine(st: Stage, heightFrac: number, z = 400, fill?: string): void {
  const b = st.box;
  const baseY = st.cam.horizonY;
  if (baseY < b.y - 2 || baseY > b.y + b.h * 1.2) return;
  const h = b.h * heightFrac;
  let d = `M${n(b.x - 6)} ${n(baseY + 1)}`;
  let x = b.x - 6;
  while (x < b.x + b.w + 6) {
    const w = between(st.rand, 0.5, 1.1) * h;
    const top = baseY - h * between(st.rand, 0.55, 1);
    d += `L${n(x)} ${n(top + h * 0.3)}Q${n(x + w * 0.1)} ${n(top)} ${n(x + w * 0.5)} ${n(top)}Q${n(x + w * 0.9)} ${n(top)} ${n(x + w)} ${n(top + h * 0.3)}`;
    x += w;
  }
  d += `L${n(x)} ${n(baseY + 1)}Z`;
  const f = fill ?? (st.pal.night ? toneFill("black", st.p) : toneFill("dots", st.p));
  add(st, LAYER.far, z, pathEl(d, { fill: f, stroke: st.pal.ink, w: st.lw * 0.5 }));
}

/** Water on the ground plane between two depths (river/lake/sea strip). */
export function waterBand(st: Stage, z0: number, z1: number, opts: { x0?: number; x1?: number; sea?: boolean; bankJitter?: number } = {}): { near: Point[]; far: Point[] } | null {
  const [xa, xb] = xRangeAt(st.cam, z1);
  const x0 = opts.x0 ?? xa - 20;
  const x1 = opts.x1 ?? xb + 20;
  const steps = 16;
  const jit = opts.bankJitter ?? 0.4;
  const nearEdge: V3[] = [];
  const farEdge: V3[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = x0 + ((x1 - x0) * i) / steps;
    nearEdge.push({ x, y: 0, z: z0 + (st.rand() - 0.5) * jit });
    farEdge.push({ x, y: 0, z: z1 + (st.rand() - 0.5) * jit });
  }
  const poly = projectPoly(st.cam, [...nearEdge, ...farEdge.slice().reverse()]);
  if (poly.length < 3 || !visible(st, poly)) return null;
  const lw = st.lw;
  let s = pathEl(polyPath(poly), { fill: st.pal.night ? toneFill("dark", st.p) : PAPER });
  // reflection shadow band under the far bank
  const zRef = z1 - Math.min((z1 - z0) * 0.25, 1.2);
  const refl = projectPoly(st.cam, [...farEdge, ...farEdge.map((p) => ({ ...p, z: zRef })).reverse()]);
  if (refl.length > 2) s += pathEl(polyPath(refl), { fill: toneFill("dots", st.p) });
  // ripples: short horizontal strokes, denser near the far bank
  let rip = "";
  const rowsN = Math.min(30, 6 + st.lod * 6);
  for (let r = 0; r < rowsN; r += 1) {
    const t = Math.pow((r + 0.5) / rowsN, 0.8);
    const z = z0 + (z1 - z0) * t;
    const [ra, rb] = xRangeAt(st.cam, z);
    const count = 2 + Math.floor(st.rand() * 3);
    for (let c = 0; c < count; c += 1) {
      const x = between(st.rand, Math.max(x0, ra), Math.min(x1, rb));
      const len = between(st.rand, 0.6, 2.2);
      rip += segD(st, { x, y: 0, z }, { x: x + len, y: 0, z });
    }
  }
  s += pathEl(rip, { stroke: st.pal.night ? PAPER : st.pal.ink, w: lw * 0.5 });
  const nearP = projectPoly(st.cam, nearEdge.concat(nearEdge.slice().reverse().map((p) => ({ ...p, z: p.z + 0.001 }))));
  s += pathEl(polylineScreen(nearEdge, st), { stroke: st.pal.ink, w: lw * 0.9 });
  s += pathEl(polylineScreen(farEdge, st), { stroke: st.pal.ink, w: lw * 0.7 });
  void nearP;
  add(st, LAYER.decal, z1, s);
  return { near: nearEdge.map((p) => project(st.cam, p)).filter((p): p is Point => !!p), far: farEdge.map((p) => project(st.cam, p)).filter((p): p is Point => !!p) };
}

function polylineScreen(pts: V3[], st: Stage): string {
  const q = pts.map((p) => project(st.cam, p)).filter((p): p is Point => !!p);
  if (q.length < 2) return "";
  return smoothPath(q, false, 0.4);
}

/** Ground-plane ellipse (pond, fountain basin footprint...). */
export function groundEllipse(st: Stage, x: number, z: number, rx: number, rz: number, y = 0, steps = 28): Point[] {
  const pts: V3[] = [];
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    pts.push({ x: x + Math.cos(a) * rx, y, z: z + Math.sin(a) * rz });
  }
  return projectPoly(st.cam, pts);
}

export function pond(st: Stage, x: number, z: number, rx: number, rz: number, lilies: number): void {
  const rim = groundEllipse(st, x, z, rx, rz);
  if (rim.length < 3 || !visible(st, rim)) return;
  const lw = wAt(st, z);
  let s = pathEl(smoothPath(rim, true, 0.5), { fill: st.pal.night ? toneFill("dark", st.p) : PAPER, stroke: st.pal.ink, w: lw * 1.1 });
  // shaded far rim (reflection of the bank)
  const inner = groundEllipse(st, x, z + rz * 0.12, rx * 0.93, rz * 0.82);
  const far = rim.filter((p, i) => i >= rim.length / 2);
  void far;
  if (inner.length > 3) {
    const band = [...rim.slice(Math.floor(rim.length * 0.5)), ...inner.slice(Math.floor(inner.length * 0.5)).reverse()];
    s += pathEl(polyPath(band), { fill: toneFill("dots", st.p) });
  }
  // ripple rings
  let rip = "";
  for (let r = 0; r < 3; r += 1) {
    const cx = x + between(st.rand, -rx * 0.4, rx * 0.4);
    const cz = z + between(st.rand, -rz * 0.3, rz * 0.3);
    const rr = between(st.rand, 0.3, 0.8);
    const ring = groundEllipse(st, cx, cz, rr * 1.6, rr, 0, 12);
    if (ring.length > 3) rip += smoothPath(ring.slice(0, 7), false);
  }
  s += pathEl(rip, { stroke: st.pal.ink, w: lw * 0.5 });
  // lily pads
  let pads = "";
  for (let i = 0; i < lilies; i += 1) {
    const a = st.rand() * Math.PI * 2;
    const rr = Math.sqrt(st.rand()) * 0.75;
    const px = x + Math.cos(a) * rx * rr;
    const pz = z + Math.sin(a) * rz * rr;
    const size = between(st.rand, 0.35, 0.6);
    const pts: V3[] = [];
    const notch = st.rand() * Math.PI * 2;
    for (let j = 0; j <= 12; j += 1) {
      const t = notch + 0.35 + (j / 12) * (Math.PI * 2 - 0.7);
      pts.push({ x: px + Math.cos(t) * size, y: 0.02, z: pz + Math.sin(t) * size });
    }
    pts.push({ x: px, y: 0.02, z: pz });
    const q = projectPoly(st.cam, pts);
    if (q.length > 3) pads += polyPath(q);
    if (i % 3 === 0) {
      const top = project(st.cam, { x: px, y: 0.12, z: pz });
      const kk = scaleAt(st.cam, { x: px, y: 0, z: pz });
      if (top && kk * 0.14 > 2) {
        const r = kk * 0.14;
        pads += `M${n(top.x - r)} ${n(top.y)}Q${n(top.x - r * 0.4)} ${n(top.y - r * 1.4)} ${n(top.x)} ${n(top.y - r * 0.4)}Q${n(top.x + r * 0.4)} ${n(top.y - r * 1.4)} ${n(top.x + r)} ${n(top.y)}Z`;
      }
    }
  }
  s += pathEl(pads, { fill: PAPER, stroke: st.pal.ink, w: lw * 0.6 });
  add(st, LAYER.decal, z, s);
}

/** Row of simple crowd silhouettes standing at depth z between x0 and x1. */
export function crowdRow(st: Stage, x0: number, x1: number, z: number, dens = 1): void {
  const k = scaleAt(st.cam, { x: (x0 + x1) / 2, y: 0, z });
  if (k * 1.7 < 6) return;
  const lw = wAt(st, st.cam.F / k) * 0.8;
  let bodies = "";
  let heads = "";
  let x = x0;
  const people: { x: number; z: number; h: number; hat: boolean }[] = [];
  while (x < x1) {
    const zz = z + between(st.rand, -0.6, 0.6);
    people.push({ x, z: zz, h: between(st.rand, 1.55, 1.85), hat: st.rand() < 0.3 });
    x += between(st.rand, 0.45, 0.8) / dens;
  }
  people.sort((a, b) => b.z - a.z);
  let hats = "";
  for (const p of people) {
    const base = project(st.cam, { x: p.x, y: 0, z: p.z });
    if (!base) continue;
    const kk = scaleAt(st.cam, { x: p.x, y: 0, z: p.z });
    const h = p.h * kk;
    const hr = 0.115 * kk;
    const sw = 0.24 * kk; // half shoulder width
    const hip = 0.18 * kk;
    const sh = base.y - h * 0.82;
    const skirt = p.hat ? 0 : st.rand() < 0.35 ? 0.1 * kk : 0;
    const x = base.x;
    // torso + legs as one silhouette: shoulders, tapering to hips, legs split at the bottom
    bodies += `M${n(x - sw)} ${n(sh + hr * 0.9)}Q${n(x - sw)} ${n(sh)} ${n(x - sw * 0.45)} ${n(sh)}L${n(x + sw * 0.45)} ${n(sh)}Q${n(x + sw)} ${n(sh)} ${n(x + sw)} ${n(sh + hr * 0.9)}`;
    bodies += `L${n(x + hip + skirt)} ${n(base.y - h * 0.35)}L${n(x + hip * 0.8 + skirt)} ${n(base.y)}L${n(x + hip * 0.12)} ${n(base.y)}L${n(x)} ${n(base.y - h * 0.3)}L${n(x - hip * 0.12)} ${n(base.y)}L${n(x - hip * 0.8 - skirt)} ${n(base.y)}L${n(x - hip - skirt)} ${n(base.y - h * 0.35)}Z`;
    const hy = sh - hr * 1.25;
    heads += `M${n(x - hr)} ${n(hy)}a${n(hr)} ${n(hr)} 0 1 0 ${n(hr * 2)} 0a${n(hr)} ${n(hr)} 0 1 0 ${n(-hr * 2)} 0`;
    if (p.hat) hats += `M${n(x - hr * 1.6)} ${n(hy - hr * 0.55)}h${n(hr * 3.2)}v${n(-hr * 0.3)}h${n(-hr * 0.75)}v${n(-hr * 1)}h${n(-hr * 1.7)}v${n(hr * 1)}h${n(-hr * 0.75)}Z`;
  }
  const fill = st.pal.night ? toneFill("black", st.p) : toneFill("mid", st.p);
  const headFill = st.pal.night ? toneFill("dark", st.p) : toneFill("light", st.p);
  add(st, LAYER.stand, st.cam.F / k, pathEl(bodies, { fill, stroke: st.pal.ink, w: lw }) + pathEl(heads, { fill: headFill, stroke: st.pal.ink, w: lw }) + pathEl(hats, { fill: INK }));
}
