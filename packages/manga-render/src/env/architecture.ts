/**
 * Architecture kit: boxes, townhouses with windows/doors/roofs, columns,
 * arches, steps and far skylines — all built in world metres and projected
 * through the stage camera so every angle stays consistent.
 */
import type { Point } from "../contracts.js";
import { PAPER, toneFill } from "../style.js";
import { n, polyPath } from "../svg.js";
import { between } from "../prng.js";
import { project, projectPoly, scaleAt, toCam, type V3 } from "./camera.js";
import { LAYER, add, defineOnce, pathEl, polyD, segD, visible, wAt, type Stage } from "./stage.js";

export type Orient = "front" | "left" | "right";

export interface Frame {
  M: (a: number, y: number, d: number) => V3;
  N: (a: number, y: number, d: number) => V3;
}

/**
 * Local building frame: a runs along the facade, y up, d into the building.
 * front: facade faces the camera at depth oz starting at X=ox.
 * left:  facade faces +X at X=ox (left side of a street), running away from oz.
 * right: facade faces -X at X=ox (right side of a street).
 */
export function frame(orient: Orient, ox: number, oz: number): Frame {
  if (orient === "left") return { M: (a, y, d) => ({ x: ox - d, y, z: oz + a }), N: (a, y, d) => ({ x: -d, y, z: a }) };
  if (orient === "right") return { M: (a, y, d) => ({ x: ox + d, y, z: oz + a }), N: (a, y, d) => ({ x: d, y, z: a }) };
  return { M: (a, y, d) => ({ x: ox + a, y, z: oz + d }), N: (a, y, d) => ({ x: a, y, z: d }) };
}

export function faceVisible(st: Stage, p: V3, normal: V3): boolean {
  const cx = -p.x;
  const cy = st.cam.h - p.y;
  const cz = -p.z;
  return normal.x * cx + normal.y * cy + normal.z * cz > 1e-6;
}

/** Fill for a vertical face given its world normal (light from the upper left). */
export function faceFill(st: Stage, normal: V3, lit = st.pal.wall): string {
  if (normal.x > 0.35) return st.pal.shade;
  return lit;
}

interface Batch {
  fill: string[];
  glass: string[];
  glassLine: string[];
  lit: string[];
  line: string[];
  thin: string[];
  deep: string[];
  /** <use> references to shared window definitions. */
  uses: string[];
}

function batch(): Batch {
  return { fill: [], glass: [], glassLine: [], lit: [], line: [], thin: [], deep: [], uses: [] };
}

/** Screen height in px of a world-space vertical extent at p. */
function pxOf(st: Stage, p: V3, metres: number): number {
  return scaleAt(st.cam, p) * metres;
}

export interface WindowGridOptions {
  floors: number;
  floorH: number;
  bays: number;
  winW: number;
  winH: number;
  /** Local-y of the first floor's window sill. */
  firstSill: number;
  /** Outline weight; enables shared window definitions on camera-parallel facades. */
  lineW?: number;
  skipBay?: number;
  arched?: boolean;
  shutters?: boolean;
  litChance?: number;
}

/** Windows on a planar vertical face given by a 2D→3D mapper. */
export function windowGrid(st: Stage, map: (u: number, y: number) => V3, width: number, o: WindowGridOptions, out: Batch): void {
  const bayW = width / o.bays;
  // A facade parallel to the image plane (level camera, constant depth) shows
  // every window as an exact scaled copy: draw each variant once and <use> it.
  const p0 = map(0, 0);
  const p1 = map(width, 1);
  const parallel = o.lineW !== undefined && Math.abs(st.cam.s) < 1e-9 && Math.abs(p0.z - p1.z) < 1e-9;
  const shared: Record<"lit" | "dark", { id: string; x: number; y: number } | null> = { lit: null, dark: null };
  for (let f = 0; f < o.floors; f += 1) {
    for (let bIdx = 0; bIdx < o.bays; bIdx += 1) {
      if (f === 0 && bIdx === o.skipBay) continue;
      const cu = bayW * (bIdx + 0.5);
      const y0 = o.firstSill + f * o.floorH;
      const y1 = y0 + o.winH;
      const u0 = cu - o.winW / 2;
      const u1 = cu + o.winW / 2;
      const c = map(cu, (y0 + y1) / 2);
      const px = pxOf(st, c, o.winH);
      if (px < 3.2) continue;
      const lit = st.pal.night && st.rand() < (o.litChance ?? 0.55);
      if (parallel && px >= 7) {
        const anchor = project(st.cam, map(u0, y1));
        const far = project(st.cam, map(u1 + 0.5, y0 - 0.2));
        if (!anchor || !far) continue;
        if (!visible(st, [anchor, far], 6)) continue;
        const key = lit ? "lit" : "dark";
        let sym = shared[key];
        if (!sym) {
          const b = batch();
          oneWindow(st, map, o, u0, u1, y0, y1, px, lit, b);
          const id = defineOnce(st, "win", flush(st, b, o.lineW ?? st.lw));
          sym = { id, x: anchor.x, y: anchor.y };
          shared[key] = sym;
        }
        out.uses.push(`<use href="#${sym.id}" x="${n(anchor.x - sym.x)}" y="${n(anchor.y - sym.y)}"/>`);
        continue;
      }
      // oblique facades are foreshortened: their small details thin out sooner
      oneWindow(st, map, o, u0, u1, y0, y1, parallel ? px : px / 1.5, lit, out);
    }
  }
}

function oneWindow(st: Stage, map: (u: number, y: number) => V3, o: WindowGridOptions, u0: number, u1: number, y0: number, y1: number, px: number, lit: boolean, out: Batch): void {
  const glassTarget = lit ? out.lit : px >= 7 ? out.glassLine : out.glass;
  const pts: V3[] = o.arched && px > 7 ? archPoints(map, u0, u1, y0, y1 - o.winW * 0.5, false) : [map(u0, y0), map(u1, y0), map(u1, y1), map(u0, y1)];
  const d = polyD(st, pts);
  if (!d) return;
  glassTarget.push(d);
  if (lit && px >= 7) out.line.push(d);
  if (px >= 16) {
    // sill + lintel ledges
    out.line.push(segD(st, map(u0 - 0.12, y0 - 0.06), map(u1 + 0.12, y0 - 0.06)));
    if (!o.arched) out.thin.push(segD(st, map(u0 - 0.1, y1 + 0.14), map(u1 + 0.1, y1 + 0.14)));
  }
  if (px >= 24) {
    // muntin cross
    const mid = (u0 + u1) / 2;
    const ym = y0 + (y1 - y0) * 0.58;
    out.thin.push(segD(st, map(mid, y0), map(mid, y1)));
    out.thin.push(segD(st, map(u0, ym), map(u1, ym)));
    if (o.shutters) {
      const sw = o.winW * 0.42;
      out.fill.push(polyD(st, [map(u0 - sw, y0), map(u0, y0), map(u0, y1), map(u0 - sw, y1)]));
      out.fill.push(polyD(st, [map(u1, y0), map(u1 + sw, y0), map(u1 + sw, y1), map(u1, y1)]));
    }
  }
  if (px >= 32 && !lit) {
    // glint: two short diagonal paper strokes
    const g0 = map(u0 + o.winW * 0.15, y0 + o.winH * 0.5);
    const g1 = map(u0 + o.winW * 0.4, y0 + o.winH * 0.85);
    const seg = segD(st, g0, g1);
    if (seg) out.deep.push(seg);
  }
}

function flush(st: Stage, b: Batch, lineW: number): string {
  return (
    b.uses.join("") +
    pathEl(b.fill.join(""), { fill: st.pal.wall, stroke: st.pal.ink, w: lineW * 0.7 }) +
    pathEl(b.glass.join(""), { fill: st.pal.glass }) +
    pathEl(b.glassLine.join(""), { fill: st.pal.glass, stroke: st.pal.ink, w: lineW * 0.75 }) +
    pathEl(b.lit.join(""), { fill: st.pal.lit }) +
    pathEl(b.deep.join(""), { stroke: PAPER, w: Math.max(0.8, lineW * 0.9) }) +
    pathEl(b.line.join(""), { stroke: st.pal.ink, w: lineW * 0.75 }) +
    pathEl(b.thin.join(""), { stroke: st.pal.ink, w: lineW * 0.5 })
  );
}

export type RoofKind = "pitched" | "gable" | "flat" | "none" | "thatch";

export interface BuildingSpec {
  orient?: Orient;
  /** Origin: for front, X of the left edge; for left/right, X of the facade plane. */
  ox: number;
  /** Origin depth (front: facade depth; sides: near end). */
  oz: number;
  width: number;
  depth: number;
  height: number;
  roof: RoofKind;
  roofH?: number;
  floorH?: number;
  door?: boolean;
  chimneys?: number;
  arched?: boolean;
  shutters?: boolean;
  wall?: string;
  /** Extra detail hook (local frame) drawn over the facade. */
  decorate?: (fr: Frame, spec: BuildingSpec) => string;
  /** Painter depth override. */
  sortZ?: number;
  lineScale?: number;
  noWindows?: boolean;
  /** Ground level of the building (metres; negative = below the camera's floor). */
  base?: number;
}

/** A townhouse-style block with windows, door, roof and chimneys. */
export function drawBuilding(st: Stage, spec: BuildingSpec): void {
  const orient = spec.orient ?? "front";
  const fr0 = frame(orient, spec.ox, spec.oz);
  const base = spec.base ?? 0;
  const fr: Frame = base === 0 ? fr0 : { M: (a, y, d) => fr0.M(a, y + base, d), N: fr0.N };
  const W = spec.width;
  const D = spec.depth;
  const H = spec.height;
  const R = spec.roofH ?? (spec.roof === "gable" ? W * 0.45 : spec.roof === "thatch" ? D * 0.55 : D * 0.35);
  const mid = fr.M(W / 2, H / 2, 0);
  const zc = toCam(st.cam, mid).z;
  if (zc < st.cam.near) return;
  // quick cull by projected footprint
  const hull = projectPoly(st.cam, [fr.M(0, 0, 0), fr.M(W, 0, 0), fr.M(W, H + R + 2, 0), fr.M(0, H + R + 2, 0)]);
  const hull2 = projectPoly(st.cam, [fr.M(0, 0, D), fr.M(W, 0, D), fr.M(W, H + R + 2, D), fr.M(0, H + R + 2, D)]);
  if (!visible(st, [...hull, ...hull2], 30)) return;
  const lw = wAt(st, zc) * (spec.lineScale ?? 1);
  // distant blocks: silhouettes with a few window rows only
  const far = scaleAt(st.cam, mid) * 1.6 < 5;
  const wall = spec.wall ?? st.pal.wall;
  let s = "";
  const outline = { stroke: st.pal.ink, w: lw };
  const face = (pts: V3[], normalLocal: V3, fill: string, extra = ""): void => {
    const nW = fr.N(normalLocal.x, normalLocal.y, normalLocal.z);
    if (!faceVisible(st, pts[0], nW)) return;
    const d = polyD(st, pts);
    if (!d) return;
    s += pathEl(d, { fill, ...outline }) + extra;
  };
  const M = fr.M;
  const floorH = spec.floorH ?? 3.1;
  const floors = Math.max(1, Math.floor((H - 0.4) / floorH));
  // side walls first
  for (const side of [0, W]) {
    const nx = side === 0 ? -1 : 1;
    const pts = [M(side, 0, 0), M(side, 0, D), M(side, H, D), M(side, H, 0)];
    const nW = fr.N(nx, 0, 0);
    if (!faceVisible(st, pts[0], nW)) continue;
    const fill = faceFill(st, nW, wall);
    const b = batch();
    if (!spec.noWindows && !far && st.lod >= 2 && D > 3 && pxOf(st, M(side, 2, D / 2), 1.5) > 7) {
      windowGrid(
        st,
        (u, y) => M(side, y, u),
        D,
        { floors, floorH, bays: Math.max(1, Math.floor(D / 2.6)), winW: 0.9, winH: 1.5, firstSill: 0.9, litChance: 0.4 },
        b,
      );
    }
    if (spec.roof === "pitched") {
      // gable end triangle is part of this side wall
      const tri = [M(side, H, 0), M(side, H + R, D / 2), M(side, H, D)];
      const d = polyD(st, tri);
      if (d) s += pathEl(d, { fill, ...outline });
    }
    face(pts, { x: nx, y: 0, z: 0 }, fill, flush(st, b, lw));
  }
  // facade
  {
    const pts = [M(0, 0, 0), M(W, 0, 0), M(W, H, 0), M(0, H, 0)];
    const nW = fr.N(0, 0, -1);
    if (faceVisible(st, pts[0], nW)) {
      const fill = faceFill(st, nW, wall);
      const b = batch();
      const bays = Math.max(1, Math.round(W / 2.5));
      const doorBay = spec.door === false ? -1 : Math.min(bays - 1, Math.floor(bays / 2 + (st.rand() < 0.5 ? 0 : -0.5 + 0.5)));
      if (!spec.noWindows && !(far && st.lod < 3)) {
        windowGrid(
          st,
          (u, y) => M(u, y, 0),
          W,
          {
            floors,
            floorH,
            bays,
            winW: Math.min(1.2, (W / bays) * 0.45),
            winH: 1.6,
            firstSill: 0.95,
            skipBay: doorBay,
            arched: spec.arched,
            shutters: spec.shutters,
            lineW: lw,
          },
          b,
        );
      }
      let extra = "";
      // plinth + floor string courses
      if (st.lod >= 2 && pxOf(st, mid, 3) > 14) {
        const lines: string[] = [];
        lines.push(segD(st, M(0, 0.55, 0), M(W, 0.55, 0)));
        for (let f = 1; f < floors; f += 1) lines.push(segD(st, M(0, f * floorH + 0.2, 0), M(W, f * floorH + 0.2, 0)));
        extra += pathEl(lines.join(""), { stroke: st.pal.ink, w: lw * 0.45 });
      }
      if (doorBay >= 0) {
        const bw = W / bays;
        const cu = bw * (doorBay + 0.5);
        const dw = Math.min(1.3, bw * 0.55);
        const dh = Math.min(2.4, floorH * 0.8);
        const dpts: V3[] = [M(cu - dw / 2, 0, 0), M(cu + dw / 2, 0, 0), M(cu + dw / 2, dh, 0)];
        const steps = 6;
        for (let i = 1; i < steps; i += 1) {
          const t = (i / steps) * Math.PI;
          dpts.push(M(cu + (Math.cos(t) * dw) / 2, dh + Math.sin(t) * dw * 0.35, 0));
        }
        dpts.push(M(cu - dw / 2, dh, 0));
        const dd = polyD(st, dpts);
        if (dd) extra += pathEl(dd, { fill: st.pal.night ? st.pal.lit : st.pal.deep, stroke: st.pal.ink, w: lw * 0.8 });
      }
      if (spec.decorate) extra += spec.decorate(fr, spec);
      s += (() => {
        const d = polyD(st, pts);
        return d ? pathEl(d, { fill, ...outline }) : "";
      })();
      s += flush(st, b, lw) + extra;
    }
  }
  // flat roof top / roof
  const roofFill = st.snow ? PAPER : st.pal.roof;
  if (spec.roof === "flat" || spec.roof === "none") {
    face([M(0, H, 0), M(W, H, 0), M(W, H, D), M(0, H, D)], { x: 0, y: 1, z: 0 }, roofFill);
    if (spec.roof === "flat") {
      // cornice ledge
      const d = polyD(st, [M(-0.25, H - 0.35, -0.25), M(W + 0.25, H - 0.35, -0.25), M(W + 0.25, H, -0.25), M(-0.25, H, -0.25)]);
      if (d) s += pathEl(d, { fill: wall, ...outline });
    }
  } else if (spec.roof === "pitched" || spec.roof === "thatch") {
    const ov = spec.roof === "thatch" ? 0.5 : 0.3;
    const front = [M(-ov, H - ov * 0.6, -ov), M(W + ov, H - ov * 0.6, -ov), M(W + ov, H + R, D / 2), M(-ov, H + R, D / 2)];
    const back = [M(-ov, H + R, D / 2), M(W + ov, H + R, D / 2), M(W + ov, H - ov * 0.6, D + ov), M(-ov, H - ov * 0.6, D + ov)];
    const nFront = fr.N(0, D / 2, -R);
    const nBack = fr.N(0, D / 2, R);
    for (const [pts, nrm] of [
      [back, nBack],
      [front, nFront],
    ] as const) {
      if (!faceVisible(st, pts[0], nrm)) continue;
      const d = polyD(st, pts as V3[]);
      if (!d) continue;
      s += pathEl(d, { fill: spec.roof === "thatch" ? (st.snow ? PAPER : toneFill("dots", st.p)) : roofFill, stroke: st.pal.ink, w: lw * 1.05 });
      s += roofTexture(st, pts as V3[], spec.roof === "thatch", lw);
    }
    if (st.snow) s += snowLip(st, front[0], front[1], lw);
  } else if (spec.roof === "gable") {
    const tri = [M(0, H, 0), M(W / 2, H + R, 0), M(W, H, 0)];
    const nW = fr.N(0, 0, -1);
    const slopes: [V3[], V3][] = [
      [[M(-0.2, H - 0.15, -0.2), M(W / 2, H + R, -0.2), M(W / 2, H + R, D), M(-0.2, H - 0.15, D)], fr.N(-R, W / 2, 0)],
      [[M(W + 0.2, H - 0.15, -0.2), M(W / 2, H + R, -0.2), M(W / 2, H + R, D), M(W + 0.2, H - 0.15, D)], fr.N(R, W / 2, 0)],
    ];
    for (const [pts, nrm] of slopes) {
      if (!faceVisible(st, pts[0], nrm)) continue;
      const d = polyD(st, pts);
      if (d) s += pathEl(d, { fill: roofFill, stroke: st.pal.ink, w: lw }) + roofTexture(st, [pts[0], pts[3], pts[2], pts[1]], false, lw);
    }
    if (faceVisible(st, tri[0], nW)) {
      const d = polyD(st, tri);
      if (d) {
        s += pathEl(d, { fill: faceFill(st, nW, wall), stroke: st.pal.ink, w: lw });
        // barge boards
        s += pathEl(segD(st, M(-0.25, H - 0.2, -0.05), M(W / 2, H + R + 0.15, -0.05)) + segD(st, M(W / 2, H + R + 0.15, -0.05), M(W + 0.25, H - 0.2, -0.05)), {
          stroke: st.pal.ink,
          w: lw * 1.7,
        });
        // small attic window
        if (!spec.noWindows && pxOf(st, mid, 1) > 8) {
          const c = M(W / 2, H + R * 0.38, 0);
          const pc = project(st.cam, c);
          const k = scaleAt(st.cam, c);
          if (pc) {
            const r = Math.min(0.32, R * 0.12) * k;
            s += `<circle cx="${n(pc.x)}" cy="${n(pc.y)}" r="${n(r)}" fill="${st.pal.night && st.rand() < 0.5 ? st.pal.lit : st.pal.wall}" stroke="${st.pal.ink}" stroke-width="${n(lw * 0.7)}"/>`;
            if (r > 4) s += pathEl(`M${n(pc.x - r)} ${n(pc.y)}h${n(r * 2)}M${n(pc.x)} ${n(pc.y - r)}v${n(r * 2)}`, { stroke: st.pal.ink, w: lw * 0.5 });
          }
        }
      }
    }
  }
  // chimneys
  const chimneys = spec.chimneys ?? 0;
  for (let i = 0; i < chimneys; i += 1) {
    const ca = W * (0.2 + (0.6 * (i + 0.5)) / chimneys) + between(st.rand, -0.3, 0.3);
    const cd = spec.roof === "gable" ? D * 0.6 : D * 0.5;
    const baseY = spec.roof === "flat" || spec.roof === "none" ? H : H + R * 0.55;
    const topY = (spec.roof === "flat" || spec.roof === "none" ? H : H + R) + between(st.rand, 0.9, 1.6);
    s += boxSvg(st, fr, { a0: ca - 0.35, a1: ca + 0.35, y0: baseY, y1: topY, d0: cd - 0.35, d1: cd + 0.35 }, wall, lw * 0.9);
    // pots
    const pot = boxSvg(st, fr, { a0: ca - 0.12, a1: ca + 0.02, y0: topY, y1: topY + 0.35, d0: cd - 0.1, d1: cd + 0.1 }, wall, lw * 0.7);
    s += pot;
    if (st.snow) s += snowLip(st, fr.M(ca - 0.4, topY, cd - 0.36), fr.M(ca + 0.4, topY, cd - 0.36), lw * 0.7);
  }
  add(st, LAYER.stand, spec.sortZ ?? zc, s);
}

function roofTexture(st: Stage, quad: V3[], thatch: boolean, lw: number): string {
  // quad: eave-left, eave-right, ridge-right, ridge-left
  const [e0, e1, r1, r0] = quad;
  const c = { x: (e0.x + r1.x) / 2, y: (e0.y + r1.y) / 2, z: (e0.z + r1.z) / 2 };
  const slopeLen = Math.hypot(r0.x - e0.x, r0.y - e0.y, r0.z - e0.z);
  const k = scaleAt(st.cam, c);
  if (st.lod < 2 || k * slopeLen < 18) return "";
  const rowsN = Math.min(14, Math.max(3, Math.floor(slopeLen / (thatch ? 0.45 : 0.38))));
  let d = "";
  const L = (a: V3, b: V3, t: number): V3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
  if (thatch) {
    // shaggy vertical strands
    const strands = Math.min(60, Math.floor(Math.hypot(e1.x - e0.x, e1.z - e0.z) / 0.28));
    for (let i = 0; i < strands; i += 1) {
      const t = (i + st.rand() * 0.6) / strands;
      const a = L(e0, e1, t);
      const b = L(r0, r1, t);
      const t0 = st.rand() * 0.4;
      d += segD(st, L(a, b, t0), L(a, b, t0 + between(st.rand, 0.2, 0.45)));
    }
    return pathEl(d, { stroke: st.pal.ink, w: lw * 0.4 });
  }
  for (let i = 1; i < rowsN; i += 1) {
    const t = i / rowsN;
    d += segD(st, L(e0, r0, t), L(e1, r1, t));
  }
  return pathEl(d, { stroke: st.pal.ink, w: lw * 0.4 });
}

function snowLip(st: Stage, a: V3, b: V3, lw: number): string {
  const pa = project(st.cam, a);
  const pb = project(st.cam, b);
  if (!pa || !pb) return "";
  const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
  const bumps = Math.max(2, Math.floor(len / 14));
  const k = scaleAt(st.cam, a);
  const th = Math.max(2.5, 0.25 * k);
  let d = `M${n(pa.x)} ${n(pa.y)}`;
  for (let i = 1; i <= bumps; i += 1) {
    const t = i / bumps;
    const x = pa.x + (pb.x - pa.x) * t;
    const y = pa.y + (pb.y - pa.y) * t;
    const mx = pa.x + (pb.x - pa.x) * (t - 0.5 / bumps);
    const my = pa.y + (pb.y - pa.y) * (t - 0.5 / bumps) + th * (0.8 + st.rand() * 0.7);
    d += `Q${n(mx)} ${n(my)} ${n(x)} ${n(y)}`;
  }
  d += `L${n(pb.x)} ${n(pb.y - th)}L${n(pa.x)} ${n(pa.y - th)}Z`;
  return pathEl(d, { fill: PAPER, stroke: st.pal.ink, w: lw * 0.6 });
}

export interface LocalBox {
  a0: number;
  a1: number;
  y0: number;
  y1: number;
  d0: number;
  d1: number;
}

/** Visible faces of a local-frame box (no painter item — returns svg). */
export function boxSvg(st: Stage, fr: Frame, b: LocalBox, fill: string, lw: number, topFill?: string): string {
  const M = fr.M;
  const faces: [V3[], V3, string][] = [
    [[M(b.a0, b.y0, b.d0), M(b.a1, b.y0, b.d0), M(b.a1, b.y1, b.d0), M(b.a0, b.y1, b.d0)], { x: 0, y: 0, z: -1 }, fill],
    [[M(b.a0, b.y0, b.d1), M(b.a1, b.y0, b.d1), M(b.a1, b.y1, b.d1), M(b.a0, b.y1, b.d1)], { x: 0, y: 0, z: 1 }, fill],
    [[M(b.a0, b.y0, b.d0), M(b.a0, b.y0, b.d1), M(b.a0, b.y1, b.d1), M(b.a0, b.y1, b.d0)], { x: -1, y: 0, z: 0 }, fill],
    [[M(b.a1, b.y0, b.d0), M(b.a1, b.y0, b.d1), M(b.a1, b.y1, b.d1), M(b.a1, b.y1, b.d0)], { x: 1, y: 0, z: 0 }, fill],
    [[M(b.a0, b.y1, b.d0), M(b.a1, b.y1, b.d0), M(b.a1, b.y1, b.d1), M(b.a0, b.y1, b.d1)], { x: 0, y: 1, z: 0 }, topFill ?? fill],
    [[M(b.a0, b.y0, b.d0), M(b.a1, b.y0, b.d0), M(b.a1, b.y0, b.d1), M(b.a0, b.y0, b.d1)], { x: 0, y: -1, z: 0 }, fill],
  ];
  // visible faces of a convex box never overlap, so faces sharing a fill share one path
  const byFill = new Map<string, string>();
  for (const [pts, nl, f] of faces) {
    const nW = fr.N(nl.x, nl.y, nl.z);
    if (!faceVisible(st, pts[0], nW)) continue;
    const d = polyD(st, pts);
    if (!d) continue;
    const shaded = nW.x > 0.35 && f === fill && fill !== st.pal.shade ? st.pal.shade : f;
    byFill.set(shaded, (byFill.get(shaded) ?? "") + d);
  }
  let s = "";
  for (const [f, d] of byFill) s += pathEl(d, { fill: f, stroke: st.pal.ink, w: lw });
  return s;
}

/** A world-axis box as a painter item. */
export function drawBox(st: Stage, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, fill: string, opts: { lw?: number; top?: string; sortZ?: number } = {}): void {
  const fr = frame("front", 0, 0);
  const zc = toCam(st.cam, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: z0 }).z;
  if (zc < st.cam.near && toCam(st.cam, { x: (x0 + x1) / 2, y: y0, z: z1 }).z < st.cam.near) return;
  const lw = opts.lw ?? wAt(st, Math.max(zc, 0.5));
  add(st, LAYER.stand, opts.sortZ ?? zc, boxSvg(st, fr, { a0: x0, a1: x1, y0, y1, d0: z0, d1: z1 }, fill, lw, opts.top));
}

/** Round column with base and capital, standing at (x, z). */
export function columnSvg(st: Stage, x: number, z: number, r: number, h: number, opts: { base?: number; capital?: boolean; fill?: string; y0?: number } = {}): string {
  const y0 = opts.y0 ?? 0;
  const baseH = opts.base ?? r * 1.2;
  const lw = wAt(st, toCam(st.cam, { x, y: y0 + h / 2, z }).z);
  const fill = opts.fill ?? st.pal.wall;
  const fr = frame("front", 0, 0);
  let s = "";
  // plinth
  s += boxSvg(st, fr, { a0: x - r * 1.45, a1: x + r * 1.45, y0, y1: y0 + baseH, d0: z - r * 1.45, d1: z + r * 1.45 }, fill, lw);
  const shaftBottom = y0 + baseH;
  const shaftTop = y0 + h - (opts.capital === false ? 0 : r * 0.9);
  const outline = cylinderOutline(st, x, z, r, shaftBottom, shaftTop);
  if (outline) {
    s += pathEl(polyPath(outline.poly), { fill, stroke: st.pal.ink, w: lw });
    // shading band on the right + fluting
    const shade: Point[] = [outline.rb, outline.rbShade, outline.rtShade, outline.rt];
    s += pathEl(polyPath(shade), { fill: st.pal.shade });
    if (st.lod >= 1) {
      let d = "";
      for (const f of [-0.55, 0, 0.55]) {
        d += `M${n(outline.cb.x + f * outline.hb)} ${n(outline.cb.y)}L${n(outline.ct.x + f * outline.ht)} ${n(outline.ct.y)}`;
      }
      s += pathEl(d, { stroke: st.pal.ink, w: lw * 0.4 });
    }
    s += pathEl(polyPath(outline.poly), { stroke: st.pal.ink, w: lw });
  }
  if (opts.capital !== false) {
    s += boxSvg(st, fr, { a0: x - r * 1.35, a1: x + r * 1.35, y0: shaftTop, y1: shaftTop + r * 0.45, d0: z - r * 1.35, d1: z + r * 1.35 }, fill, lw);
    s += boxSvg(st, fr, { a0: x - r * 1.55, a1: x + r * 1.55, y0: shaftTop + r * 0.45, y1: y0 + h, d0: z - r * 1.55, d1: z + r * 1.55 }, fill, lw);
  }
  return s;
}

export function cylinderOutline(
  st: Stage,
  x: number,
  z: number,
  r: number,
  y0: number,
  y1: number,
): { poly: Point[]; cb: Point; ct: Point; hb: number; ht: number; rb: Point; rt: Point; rbShade: Point; rtShade: Point } | null {
  const cb = project(st.cam, { x, y: y0, z });
  const ct = project(st.cam, { x, y: y1, z });
  if (!cb || !ct) return null;
  const hb = scaleAt(st.cam, { x, y: y0, z }) * r;
  const ht = scaleAt(st.cam, { x, y: y1, z }) * r;
  const poly = [
    { x: cb.x - hb, y: cb.y },
    { x: cb.x + hb, y: cb.y },
    { x: ct.x + ht, y: ct.y },
    { x: ct.x - ht, y: ct.y },
  ];
  if (!visible(st, poly)) return null;
  return {
    poly,
    cb,
    ct,
    hb,
    ht,
    rb: { x: cb.x + hb, y: cb.y },
    rt: { x: ct.x + ht, y: ct.y },
    rbShade: { x: cb.x + hb * 0.35, y: cb.y },
    rtShade: { x: ct.x + ht * 0.35, y: ct.y },
  };
}

/** Steps rising toward +Z, spanning x0..x1, starting at z. */
export function drawSteps(st: Stage, x0: number, x1: number, z: number, count: number, riser: number, tread: number): number {
  for (let i = count - 1; i >= 0; i -= 1) {
    const zz = z + i * tread;
    drawBox(st, x0, x1, 0, riser * (i + 1), zz, zz + tread, st.pal.wall, { sortZ: toCam(st.cam, { x: 0, y: 0, z: zz }).z + 0.01 });
  }
  return z + count * tread;
}

/** Far skyline silhouette (roofs, chimneys, a spire) sitting on the horizon. */
export function drawSkyline(st: Stage, z: number, opts: { spire?: boolean; heightMul?: number } = {}): void {
  const b = st.box;
  const baseY = Math.min(b.y + b.h, st.cam.horizonY + 1);
  const k = st.cam.F / z;
  const top = b.y;
  if (baseY <= top + 4) return;
  const hm = opts.heightMul ?? 1;
  const pts: Point[] = [{ x: b.x - 4, y: baseY }];
  let x = b.x - 4;
  const spireAt = opts.spire ? b.x + b.w * between(st.rand, 0.15, 0.85) : -1e9;
  let spireDone = false;
  while (x < b.x + b.w + 4) {
    const w = between(st.rand, 5, 11) * k;
    const h = between(st.rand, 6, 13) * k * hm;
    const y = baseY - h;
    if (!spireDone && x + w > spireAt) {
      spireDone = true;
      const tw = 3.2 * k;
      const th = 20 * k * hm;
      pts.push({ x, y: baseY - th * 0.55 }, { x: x + tw * 0.1, y: baseY - th * 0.62 }, { x: x + tw / 2, y: baseY - th }, { x: x + tw * 0.9, y: baseY - th * 0.62 }, { x: x + tw, y: baseY - th * 0.55 });
      x += tw;
      continue;
    }
    const kind = st.rand();
    if (kind < 0.45) {
      pts.push({ x, y: y + h * 0.15 }, { x: x + w / 2, y: y - h * 0.18 }, { x: x + w, y: y + h * 0.15 });
    } else {
      pts.push({ x, y }, { x: x + w, y });
      if (kind > 0.75) {
        const cx = x + w * between(st.rand, 0.2, 0.7);
        const cw = 0.8 * k;
        pts.splice(pts.length - 1, 0, { x: cx, y }, { x: cx, y: y - 1.6 * k }, { x: cx + cw, y: y - 1.6 * k }, { x: cx + cw, y });
      }
    }
    x += w;
  }
  pts.push({ x: b.x + b.w + 4, y: baseY });
  const fill = st.pal.night ? toneFill("black", st.p) : st.time === "dusk" ? toneFill("dark", st.p) : toneFill("light", st.p);
  add(st, LAYER.far, z, pathEl(polyPath(pts), { fill, stroke: st.pal.night ? "none" : st.pal.ink, w: st.lw * 0.45 }));
  // a few tiny lit windows at night
  if (st.pal.night) {
    let d = "";
    for (let i = 0; i < Math.round(b.w / 40); i += 1) {
      const wx = b.x + st.rand() * b.w;
      const wy = baseY - between(st.rand, 1.5, 7) * k * hm;
      d += `M${n(wx)} ${n(wy)}h${n(Math.max(1.2, 0.8 * k))}v${n(Math.max(1.6, 1.1 * k))}h${n(-Math.max(1.2, 0.8 * k))}Z`;
    }
    add(st, LAYER.far, z - 0.01, pathEl(d, { fill: PAPER }));
  }
}

/** Arch opening polygon on a planar face (u along, y up), round or pointed. */
export function archPoints(map: (u: number, y: number) => V3, u0: number, u1: number, y0: number, spring: number, pointed: boolean): V3[] {
  const pts: V3[] = [map(u0, y0), map(u1, y0), map(u1, spring)];
  const span = u1 - u0;
  const steps = 7;
  if (pointed) {
    for (let i = 1; i <= steps; i += 1) {
      const a = (i / steps) * (Math.PI / 3);
      pts.push(map(u0 + span * Math.cos(a), spring + span * Math.sin(a)));
    }
    for (let i = 1; i < steps; i += 1) {
      const a = (2 * Math.PI) / 3 + (i / steps) * (Math.PI / 3);
      pts.push(map(u1 + span * Math.cos(a), spring + span * Math.sin(a)));
    }
  } else {
    const r = span / 2;
    const cu = (u0 + u1) / 2;
    for (let i = 1; i < steps * 2; i += 1) {
      const a = (i / (steps * 2)) * Math.PI;
      pts.push(map(cu + r * Math.cos(a), spring + r * Math.sin(a)));
    }
  }
  pts.push(map(u0, spring));
  return pts;
}

export { scaleAt, project };
