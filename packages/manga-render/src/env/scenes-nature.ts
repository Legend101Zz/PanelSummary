/** Outdoor nature scenes and the two non-places (abstract, void). */
import type { Point } from "../contracts.js";
import { INK, PAPER, toneFill } from "../style.js";
import { n, polyPath, smoothPath } from "../svg.js";
import { between, seeded } from "../prng.js";
import { planeAt, project, projectPoly, scaleAt, toCam, xRangeAt, type V3 } from "./camera.js";
import { LAYER, add, backDist, boxRect, pathEl, place, placeVisible, rectD, segD, visible, wAt, type Stage } from "./stage.js";
import { cylinderOutline } from "./architecture.js";
import { drawGround } from "./ground.js";
import { bush, flowers, hedge, hills, pond as pondShape, reeds, rock, scallop, tree, treeLine, waterBand } from "./nature.js";
import { cloudD, drawSky } from "./sky.js";
import type { Sites } from "./features.js";

function span(st: Stage, z: number): [number, number] {
  const [a, b] = xRangeAt(st.cam, z);
  return [a - 2, b + 2];
}

function outdoorSites(st: Stage, backZ: number, centreZ: number): Sites {
  const [a, b] = span(st, st.zmid + 2);
  return {
    interior: false,
    wallSlots: [],
    spots: [
      { x: a * 0.6, z: st.zmid + 2 },
      { x: b * 0.6, z: st.zmid + 2.5 },
      { x: a * 0.35, z: backZ - 2 },
      { x: b * 0.35, z: backZ - 2 },
    ],
    centre: { x: 0, z: centreZ },
    backZ,
    span: span(st, backZ),
  };
}

/** Is the camera looking steeply down (tree tops, not trunks)? */
function topDown(st: Stage): boolean {
  return st.cam.s < -0.6;
}

// ---------------------------------------------------------------------------

export function garden(st: Stage): Sites {
  const zB = st.zmid + backDist(st, 14);
  treeLine(st, 0.06, 500);
  drawGround(st, "grass", { density: 0.6 });
  // gravel path
  const path = projectPoly(st.cam, [
    { x: -1.3, y: 0.01, z: 0.3 },
    { x: 1.3, y: 0.01, z: 0.3 },
    { x: 1.3, y: 0.01, z: zB },
    { x: -1.3, y: 0.01, z: zB },
  ]);
  if (path.length > 2) {
    let grit = "";
    for (let i = 0; i < 40 * st.lod; i += 1) {
      const z = 0.5 + Math.pow(st.rand(), 1.8) * (zB - 0.5);
      const x = between(st.rand, -1.2, 1.2);
      grit += segD(st, { x, y: 0.01, z }, { x: x + 0.12, y: 0.01, z });
    }
    add(st, LAYER.decal, zB, pathEl(polyPath(path), { fill: st.snow ? PAPER : PAPER, stroke: st.pal.ink, w: st.lw * 0.7 }) + pathEl(grit, { stroke: st.pal.ink, w: st.lw * 0.4 }));
  }
  // hedges lining the path
  if (st.lod >= 1) {
    hedge(st, -3.3, -1.9, Math.max(0.6, st.zmid - 3), zB - 3, 1.2);
    hedge(st, 1.9, 3.3, Math.max(0.6, st.zmid - 3), zB - 3, 1.2);
  }
  // back hedge wall with a gap
  hedge(st, -30, -1.6, zB, zB + 1.2, 2.4);
  hedge(st, 1.6, 30, zB, zB + 1.2, 2.4);
  const r = seeded(st.seed, st.env, "trees");
  const trees = st.lod >= 2 ? 5 : st.lod === 1 ? 3 : 2;
  for (let i = 0; i < trees; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    tree(st, side * between(r, 6, 12), zB + between(r, 2, 8), { h: between(r, 7, 10) });
  }
  if (st.lod >= 1) {
    for (let z = Math.max(1, st.zmid - 2); z < zB - 3; z += 2.2) {
      flowers(st, -3.8, z, 0.6, 5);
      flowers(st, 3.8, z + 1, 0.6, 5);
    }
  }
  return outdoorSites(st, zB - 1, zB - 4);
}

export function forest(st: Stage): Sites {
  const r = seeded(st.seed, st.env, "trunks");
  treeLine(st, 0.14, 300, st.pal.night ? toneFill("black", st.p) : toneFill("light", st.p));
  drawGround(st, "dirt", { density: 0.7 });
  const zFar = st.zmid * (st.lod >= 2 ? 7 : 4);
  if (topDown(st)) {
    // seen from above: a carpet of canopies
    const hit = planeAt(st.cam, st.cam.px, st.box.y + st.box.h / 2, 0);
    const cz = hit ? hit.z : st.zmid;
    for (let i = 0; i < 26; i += 1) {
      const x = between(r, -1, 1) * cz * 1.2;
      const z = cz + between(r, -1, 1) * cz * 0.9;
      tree(st, x, Math.max(0.5, z), { h: between(r, 7, 11), kind: r() < 0.3 ? "pine" : "round" });
    }
    return outdoorSites(st, st.zmid + 6, st.zmid + 3);
  }
  // trunks at many depths
  const count = st.lod >= 2 ? 34 : st.lod === 1 ? 18 : 10;
  const trunks: { x: number; z: number; r: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = r();
    const z = st.zmid * 0.7 + Math.pow(t, 1.4) * (zFar - st.zmid * 0.7);
    const [xa, xb] = xRangeAt(st.cam, z);
    let x = between(r, xa - 1, xb + 1);
    // keep the middle (where figures stand) a bit clearer up close
    if (z < st.zmid * 1.6 && Math.abs(x) < (xb - xa) * 0.18) x += x < 0 ? -(xb - xa) * 0.2 : (xb - xa) * 0.2;
    trunks.push({ x, z, r: between(r, 0.18, 0.42) });
  }
  for (const t of trunks) forestTrunk(st, t.x, t.z, t.r);
  // undergrowth
  if (st.lod >= 1) {
    for (let i = 0; i < 6 + st.lod * 3; i += 1) {
      const z = st.zmid * between(r, 1.15, 3.2);
      const [xa, xb] = xRangeAt(st.cam, z);
      const x = between(r, xa, xb);
      if (r() < 0.45) bush(st, x, z, between(r, 0.4, 0.7));
      else fern(st, x, z);
    }
  }
  // overhead foliage masses at the top of the panel
  foliageCanopy(st);
  if (st.lod >= 2 && !st.pal.night && st.weather === "clear") lightShafts(st);
  return outdoorSites(st, st.zmid + 5, st.zmid + 3);
}

function forestTrunk(st: Stage, x: number, z: number, r: number): void {
  const out = cylinderOutline(st, x, z, r, 0, 40);
  if (!out) return;
  const far = z > st.zmid * 3;
  const lw = wAt(st, z);
  let s = "";
  if (far) {
    s += pathEl(polyPath(out.poly), { fill: st.pal.night ? toneFill("black", st.p) : toneFill("light", st.p), stroke: st.pal.ink, w: lw * 0.5 });
  } else {
    s += pathEl(polyPath(out.poly), { fill: st.pal.wood, stroke: st.pal.ink, w: lw });
    s += pathEl(polyPath([out.rb, { x: out.cb.x + out.hb * 0.1, y: out.cb.y }, { x: out.ct.x + out.ht * 0.1, y: out.ct.y }, out.rt]), { fill: st.pal.shade });
    if (out.hb > 4) {
      let bark = "";
      for (let i = 0; i < 4; i += 1) {
        const f = between(st.rand, -0.7, 0.5);
        const y0 = out.cb.y - between(st.rand, 0.1, 0.5) * (out.cb.y - st.box.y);
        const len = between(st.rand, 0.08, 0.25) * (out.cb.y - st.box.y);
        const x0 = out.cb.x + f * out.hb;
        bark += `M${n(x0)} ${n(y0)}q${n(out.hb * 0.15)} ${n(-len / 2)} 0 ${n(-len)}`;
      }
      s += pathEl(bark, { stroke: st.pal.ink, w: lw * 0.5 });
      const k = out.hb / r;
      s += pathEl(`M${n(out.cb.x - out.hb * 2)} ${n(out.cb.y)}Q${n(out.cb.x - out.hb)} ${n(out.cb.y - 0.05 * k)} ${n(out.cb.x - out.hb)} ${n(out.cb.y - 0.5 * k)}M${n(out.cb.x + out.hb * 2)} ${n(out.cb.y)}Q${n(out.cb.x + out.hb)} ${n(out.cb.y - 0.05 * k)} ${n(out.cb.x + out.hb)} ${n(out.cb.y - 0.5 * k)}`, { stroke: st.pal.ink, w: lw * 0.8 });
    }
    s += pathEl(polyPath(out.poly), { stroke: st.pal.ink, w: lw });
  }
  add(st, LAYER.stand, z, s);
}

function fern(st: Stage, x: number, z: number): void {
  const pl = place(st, { x, y: 0, z });
  if (!pl || !placeVisible(st, pl, 0.8, 0.8)) return;
  // too near the lens a fern turns into scribble: skip it
  if (pl.k * 0.9 > st.box.h * 0.2) return;
  const P = pl.at;
  const lw = wAt(st, pl.z);
  let d = "";
  for (let f = 0; f < 5; f += 1) {
    const ang = Math.PI * (0.15 + (f / 4) * 0.7);
    const len = between(st.rand, 0.6, 0.9);
    const tip = P(Math.cos(ang) * len, Math.sin(ang) * len * 0.8);
    const mid = P(Math.cos(ang) * len * 0.5, Math.sin(ang) * len * 0.75);
    const base = P(0, 0);
    d += `M${n(base.x)} ${n(base.y)}Q${n(mid.x)} ${n(mid.y)} ${n(tip.x)} ${n(tip.y)}`;
    for (let l = 1; l < 5; l += 1) {
      const t = l / 5;
      const lx = base.x + (tip.x - base.x) * t;
      const ly = base.y + (tip.y - base.y) * t - Math.sin(t * Math.PI) * (base.y - mid.y) * 0.3;
      const ll = (1 - t) * 0.18 * pl.k;
      d += `M${n(lx)} ${n(ly)}l${n(-ll * 0.6)} ${n(-ll)}M${n(lx)} ${n(ly)}l${n(ll * 0.6)} ${n(-ll)}`;
    }
  }
  add(st, LAYER.stand, pl.z, pathEl(d, { stroke: st.pal.ink, w: lw * 0.6 }));
}

function foliageCanopy(st: Stage): void {
  const b = st.box;
  if (st.cam.horizonY < b.y + b.h * 0.2) return;
  const depth = b.h * (st.lod >= 2 ? 0.22 : 0.16);
  let d = "";
  let ticks = "";
  const count = Math.max(4, Math.round(b.w / (depth * 1.3)));
  for (let i = 0; i <= count; i += 1) {
    const cx = b.x + (i / count) * b.w + between(st.rand, -0.3, 0.3) * (b.w / count);
    const rx = (b.w / count) * between(st.rand, 0.75, 1.05);
    const cy = b.y + depth * between(st.rand, 0.1, 0.6);
    const ry = depth * between(st.rand, 0.6, 0.9);
    d += scallop(cx, cy, rx, ry, 9, st.rand);
    for (let t = 0; t < 3; t += 1) {
      const tx = cx + between(st.rand, -0.6, 0.6) * rx;
      const ty = cy + between(st.rand, 0, 0.6) * ry;
      const sz = rx * 0.14;
      ticks += `M${n(tx - sz)} ${n(ty)}q${n(sz / 2)} ${n(sz * 0.7)} ${n(sz)} 0q${n(sz / 2)} ${n(sz * 0.7)} ${n(sz)} 0`;
    }
  }
  const fill = st.pal.night ? toneFill("black", st.p) : st.snow ? PAPER : toneFill("dense_dots", st.p);
  add(st, LAYER.stand, 0.05, pathEl(d, { fill, stroke: st.pal.ink, w: st.lw }) + pathEl(ticks, { stroke: st.pal.night ? PAPER : INK, w: st.lw * 0.5 }));
}

function lightShafts(st: Stage): void {
  const b = st.box;
  let d = "";
  for (let i = 0; i < 3; i += 1) {
    const x = b.x + b.w * between(st.rand, 0.1, 0.8);
    const w = b.w * between(st.rand, 0.04, 0.09);
    const slant = b.h * 0.35;
    d += `M${n(x)} ${n(b.y)}L${n(x + w)} ${n(b.y)}L${n(x + w * 2.2 + slant)} ${n(b.y + b.h)}L${n(x + slant)} ${n(b.y + b.h)}Z`;
  }
  add(st, LAYER.stand, 0.06, pathEl(d, { fill: PAPER, opacity: 0.35 }));
}

export function meadow(st: Stage): Sites {
  hills(st, 0.12, st.pal.night ? toneFill("dark", st.p) : toneFill("light", st.p), 1200, 2);
  hills(st, 0.06, st.pal.night ? toneFill("black", st.p) : PAPER, 900, 3);
  treeLine(st, 0.035, 600);
  drawGround(st, "grass", { density: 1.1 });
  const r = seeded(st.seed, st.env, "meadow");
  if (st.lod >= 2) {
    tree(st, xRangeAt(st.cam, st.zmid + 14)[1] * 0.55, st.zmid + 14, { h: 9 });
    for (let i = 0; i < 6; i += 1) {
      const z = st.zmid * between(r, 0.7, 2.5);
      const [xa, xb] = xRangeAt(st.cam, z);
      flowers(st, between(r, xa, xb), z, 1.2, 6);
    }
  }
  return outdoorSites(st, st.zmid + 8, st.zmid + 5);
}

export function riverbank(st: Stage): Sites {
  const z0 = st.zmid + 1.6;
  const z1 = st.zmid + (st.shot === "establishing" ? 16 : 9);
  hills(st, 0.08, st.pal.night ? toneFill("dark", st.p) : PAPER, 1000, 2);
  treeLine(st, 0.06, 500);
  drawGround(st, "grass", { density: 0.8 });
  waterBand(st, z0, z1);
  const r = seeded(st.seed, st.env, "bank");
  // far bank trees and bushes
  const [fa, fb] = xRangeAt(st.cam, z1 + 2);
  const nTrees = st.lod >= 2 ? 5 : 2;
  for (let i = 0; i < nTrees; i += 1) {
    tree(st, between(r, fa, fb), z1 + between(r, 1.5, 6), { h: between(r, 6, 10), kind: r() < 0.4 ? "willow" : "round" });
  }
  if (st.lod >= 1) {
    for (let i = 0; i < 4; i += 1) bush(st, between(r, fa, fb), z1 + 0.8, between(r, 0.6, 1));
    const [na, nb] = xRangeAt(st.cam, z0);
    for (let i = 0; i < 3 + st.lod; i += 1) {
      const side = i % 2 === 0 ? between(r, na, na * 0.3) : between(r, nb * 0.3, nb);
      reeds(st, side, z0 - 0.3, between(r, 1, 1.6), 7);
    }
    rock(st, between(r, na, nb) * 0.6, z0 - 0.4, 0.5);
  }
  return outdoorSites(st, z1 + 3, st.zmid + 0.5);
}

export function pond(st: Stage): Sites {
  const zc = st.zmid + 5;
  treeLine(st, 0.08, 400);
  drawGround(st, "grass", { density: 0.7 });
  pondShape(st, 0, zc, 5.5, 3.4, st.lod >= 1 ? 7 : 3);
  const r = seeded(st.seed, st.env, "pond");
  if (st.lod >= 1) {
    reeds(st, -5.2, zc + 0.5, 1.4, 8);
    reeds(st, 5.4, zc - 0.6, 1.2, 6);
    reeds(st, 2.5, zc + 3.2, 1.3, 6);
    rock(st, -3.8, zc - 3, 0.5);
  }
  const nTrees = st.lod >= 2 ? 4 : 2;
  for (let i = 0; i < nTrees; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    tree(st, side * between(r, 6, 11), zc + between(r, 4, 9), { h: between(r, 6, 9), kind: i === 1 ? "willow" : "round" });
  }
  return outdoorSites(st, zc + 4, zc - 4);
}

export function seaside(st: Stage): Sites {
  const shore = st.zmid + 3;
  const b = st.box;
  drawGround(st, "sand", { density: 0.6 });
  // the sea, from the shoreline to the horizon
  const [xa, xb] = xRangeAt(st.cam, 3000);
  const seaPts = projectPoly(st.cam, [
    { x: xa * 1.2, y: 0, z: shore },
    { x: xb * 1.2, y: 0, z: shore },
    { x: xb * 1.2, y: 0, z: 3000 },
    { x: xa * 1.2, y: 0, z: 3000 },
  ]);
  let s = "";
  if (seaPts.length > 2) {
    s += pathEl(polyPath(seaPts), { fill: st.pal.night ? toneFill("dark", st.p) : PAPER });
    // wave rows: little arcs, shrinking toward the horizon
    let waves = "";
    const rows = 10 + st.lod * 5;
    for (let i = 0; i < rows; i += 1) {
      const t = i / rows;
      const z = shore + 1 + Math.pow(t, 2.2) * 400;
      const [ra, rb] = xRangeAt(st.cam, z);
      const k = st.cam.F / Math.max(z, 1);
      const per = Math.max(3, Math.round(((rb - ra) * k) / 60));
      for (let j = 0; j < per; j += 1) {
        const x = between(st.rand, ra, rb);
        const p = project(st.cam, { x, y: 0, z });
        if (!p) continue;
        const w = Math.max(3, 1.6 * k);
        waves += `M${n(p.x - w)} ${n(p.y)}q${n(w * 0.5)} ${n(-w * 0.35)} ${n(w)} 0q${n(w * 0.5)} ${n(-w * 0.35)} ${n(w)} 0`;
      }
    }
    s += pathEl(waves, { stroke: st.pal.night ? PAPER : st.pal.ink, w: st.lw * 0.5 });
    // foam line at the shore
    const foam: Point[] = [];
    for (let i = 0; i <= 24; i += 1) {
      const x = xa + ((xb - xa) * i) / 24;
      const p = project(st.cam, { x: x * 0.02, y: 0, z: shore + Math.sin(i * 1.3) * 0.25 });
      const px = project(st.cam, { x: xa * 1.2 + ((xb - xa) * 1.2 * i) / 24, y: 0, z: shore + Math.sin(i * 1.3) * 0.25 });
      if (px) foam.push(px);
      void p;
    }
    if (foam.length > 2) s += pathEl(smoothPath(foam, false), { stroke: st.pal.ink, w: st.lw });
  }
  add(st, LAYER.decal, 3000, s);
  // horizon line + distant sail
  const hy = st.cam.horizonY;
  if (hy > b.y && hy < b.y + b.h) {
    let h = `M${n(b.x - 2)} ${n(hy)}L${n(b.x + b.w + 2)} ${n(hy)}`;
    if (st.lod >= 2) {
      const sx = b.x + b.w * between(st.rand, 0.55, 0.85);
      const sh = b.h * 0.05;
      h += `M${n(sx)} ${n(hy - 1)}l${n(sh * 0.2)} ${n(-sh)}l${n(sh * 0.5)} ${n(sh * 0.95)}ZM${n(sx - sh * 0.3)} ${n(hy - 1)}h${n(sh * 1.1)}l${n(-sh * 0.2)} ${n(sh * 0.2)}h${n(-sh * 0.7)}Z`;
    }
    add(st, LAYER.decal, 2999, pathEl(h, { stroke: st.pal.ink, w: st.lw * 0.8, fill: PAPER }));
    // cliff on one side
    if (st.lod >= 1) {
      const left = st.rand() < 0.5;
      const cw = b.w * 0.28;
      const x0 = left ? b.x - 4 : b.x + b.w + 4;
      const dir = left ? 1 : -1;
      const pts: Point[] = [
        { x: x0, y: hy + b.h * 0.08 },
        { x: x0, y: hy - b.h * 0.2 },
        { x: x0 + dir * cw * 0.35, y: hy - b.h * 0.22 },
        { x: x0 + dir * cw * 0.7, y: hy - b.h * 0.12 },
        { x: x0 + dir * cw, y: hy + 1 },
        { x: x0 + dir * cw * 0.7, y: hy + b.h * 0.04 },
      ];
      let hatch = "";
      for (let i = 0; i < 8; i += 1) {
        const x = x0 + dir * cw * (0.08 + i * 0.08);
        hatch += `M${n(x)} ${n(hy - b.h * 0.16 + i * b.h * 0.012)}l${n(dir * cw * 0.05)} ${n(b.h * 0.12)}`;
      }
      add(st, LAYER.far, 1500, pathEl(polyPath(pts), { fill: st.pal.night ? toneFill("black", st.p) : toneFill("light", st.p), stroke: st.pal.ink, w: st.lw * 0.8 }) + pathEl(hatch, { stroke: st.pal.ink, w: st.lw * 0.45 }));
    }
    // gulls
    if (st.lod >= 2 && !st.pal.night) {
      let g = "";
      for (let i = 0; i < 3; i += 1) {
        const gx = b.x + b.w * between(st.rand, 0.2, 0.8);
        const gy = b.y + (hy - b.y) * between(st.rand, 0.2, 0.6);
        const gw = between(st.rand, 5, 9);
        g += `M${n(gx - gw)} ${n(gy)}q${n(gw * 0.5)} ${n(-gw * 0.5)} ${n(gw)} 0q${n(gw * 0.5)} ${n(-gw * 0.5)} ${n(gw)} 0`;
      }
      add(st, LAYER.far, 5000, pathEl(g, { stroke: st.pal.ink, w: st.lw * 0.7 }));
    }
  }
  const r = seeded(st.seed, st.env, "shore");
  if (st.lod >= 1) {
    const [na, nb] = xRangeAt(st.cam, st.zmid);
    rock(st, between(r, na, na * 0.4), st.zmid + 1, 0.7);
    rock(st, between(r, nb * 0.5, nb), st.zmid + 2, 0.5);
  }
  return outdoorSites(st, shore - 0.5, st.zmid + 1.5);
}

export function skyScene(st: Stage): Sites {
  const b = st.box;
  drawSky(st, { full: true, clouds: 0 });
  const r = seeded(st.seed, st.env, "clouds");
  // distant land far below (only when looking down)
  if (st.cam.s < -0.2 && st.cam.horizonY < b.y + b.h) {
    const hy = Math.max(b.y, st.cam.horizonY);
    const land = pathEl(rectD(b.x - 2, hy + b.h * 0.02, b.w + 4, b.y + b.h - hy + 4), { fill: st.pal.night ? toneFill("dark", st.p) : toneFill("light", st.p) });
    let fields = "";
    for (let i = 0; i < 10; i += 1) {
      const y = hy + b.h * 0.03 + Math.pow(i / 10, 2) * (b.y + b.h - hy);
      fields += `M${n(b.x - 2)} ${n(y)}L${n(b.x + b.w + 2)} ${n(y + (st.rand() - 0.5) * 4)}`;
    }
    add(st, LAYER.far, 1000, land + pathEl(fields, { stroke: st.pal.ink, w: st.lw * 0.4 }));
  }
  // cloud banks at several depths: big near clouds low, small far ones high
  const layers = st.lod >= 2 ? 3 : 2;
  for (let l = 0; l < layers; l += 1) {
    const count = 2 + l;
    let d = "";
    let det = "";
    for (let i = 0; i < count; i += 1) {
      const w = b.w * between(r, 0.3, 0.55) * (1 - l * 0.22);
      const h = w * between(r, 0.3, 0.42);
      const cx = b.x + b.w * ((i + 0.5) / count) + between(r, -0.1, 0.1) * b.w;
      const cy = b.y + b.h * (0.85 - l * 0.28) + between(r, -0.08, 0.08) * b.h;
      d += cloudD(cx, cy, w, h, r);
      det += `M${n(cx - w * 0.25)} ${n(cy + h * 0.2)}q${n(w * 0.1)} ${n(-h * 0.25)} ${n(w * 0.2)} 0M${n(cx + w * 0.05)} ${n(cy + h * 0.28)}q${n(w * 0.08)} ${n(-h * 0.2)} ${n(w * 0.16)} 0`;
    }
    const fill = st.pal.night ? toneFill("dark", st.p) : st.time === "dusk" ? toneFill("dots", st.p) : PAPER;
    add(st, LAYER.stand, 100 - l * 30, pathEl(d, { fill, stroke: st.pal.ink, w: st.lw * (1 - l * 0.2) }) + pathEl(det, { stroke: st.pal.ink, w: st.lw * 0.5 }));
  }
  return {
    interior: false,
    wallSlots: [],
    spots: [
      { x: -4, z: st.zmid + 3 },
      { x: 4, z: st.zmid + 3 },
    ],
    centre: { x: 0, z: st.zmid + 6 },
    backZ: st.zmid + 10,
    span: span(st, st.zmid + 10),
  };
}

export function countryRoad(st: Stage): Sites {
  hills(st, 0.1, st.pal.night ? toneFill("dark", st.p) : toneFill("light", st.p), 1200, 2);
  hills(st, 0.05, st.pal.night ? toneFill("black", st.p) : PAPER, 900, 3);
  treeLine(st, 0.03, 700);
  drawGround(st, "grass", { density: 0.5 });
  const far = 400;
  // plowed field furrows on the right
  let furrows = "";
  for (let x = 6; x < 60; x += 1.4) furrows += segD(st, { x, y: 0, z: 1 }, { x: x + 20, y: 0, z: far });
  add(st, LAYER.decal, far + 1, pathEl(furrows, { stroke: st.pal.ink, w: st.lw * 0.4 }));
  // the road: gently curving strip
  const L: V3[] = [];
  const R: V3[] = [];
  for (let i = 0; i <= 20; i += 1) {
    const t = i / 20;
    const z = 0.3 + Math.pow(t, 2.4) * far;
    const bend = Math.sin(t * 2.2) * 8 * t;
    const w = 2.3;
    L.push({ x: bend - w, y: 0.01, z });
    R.push({ x: bend + w, y: 0.01, z });
  }
  const road = projectPoly(st.cam, [...L, ...R.slice().reverse()]);
  if (road.length > 2) {
    let ruts = "";
    for (const off of [-1, 1]) {
      const rut = L.map((p, i) => ({ x: (p.x + R[i].x) / 2 + off * 0.8, y: 0.01, z: p.z }));
      const q = rut.map((p) => project(st.cam, p)).filter((p): p is Point => !!p);
      if (q.length > 2) ruts += smoothPath(q, false);
    }
    const lq = L.map((p) => project(st.cam, p)).filter((p): p is Point => !!p);
    const rq = R.map((p) => project(st.cam, p)).filter((p): p is Point => !!p);
    add(
      st,
      LAYER.decal,
      far,
      pathEl(polyPath(road), { fill: st.snow ? PAPER : st.pal.night ? toneFill("mid", st.p) : PAPER }) +
        pathEl(ruts, { stroke: st.pal.ink, w: st.lw * 0.45 }) +
        pathEl((lq.length > 2 ? smoothPath(lq, false) : "") + (rq.length > 2 ? smoothPath(rq, false) : ""), { stroke: st.pal.ink, w: st.lw * 0.8 }),
    );
  }
  // poplars and fence posts along the road
  if (st.lod >= 1) {
    for (let z = 4; z < (st.lod >= 2 ? 120 : 60); z += 9) {
      const t = Math.sqrt((z - 0.3) / far);
      const bend = Math.sin(Math.pow(t, 1) * 2.2) * 8 * t;
      tree(st, bend - 5, z, { h: 11, kind: "poplar" });
      if (st.lod >= 2) {
        for (let k = 0; k < 3; k += 1) postAndRail(st, bend + 4.2, z + k * 3, z + (k + 1) * 3);
      }
    }
  }
  rock(st, 3.4, st.zmid + 1.5, 0.45);
  return {
    interior: false,
    wallSlots: [],
    spots: [
      { x: -6, z: st.zmid + 2 },
      { x: 6.5, z: st.zmid + 3 },
      { x: -8, z: st.zmid + 8 },
    ],
    centre: { x: 0, z: st.zmid + 8 },
    backZ: st.zmid + 12,
    span: span(st, st.zmid + 12),
  };
}

/**
 * Open moorland: far mountains, two rolling ridges, heather and gorse on the
 * ground, a thin winding track, scattered rocks and a few dark pools ("deep
 * holes"). Big sky above (the sky is drawn by the stage).
 */
export function moor(st: Stage): Sites {
  const night = st.pal.night;
  hills(st, 0.34, night ? toneFill("dark", st.p) : toneFill("light", st.p), 1500, 2.2);
  hills(st, 0.2, night ? toneFill("black", st.p) : toneFill("dots", st.p), 1100, 3.4);
  hills(st, 0.1, night ? toneFill("dark", st.p) : PAPER, 800, 4.6);
  drawGround(st, "grass", { density: 1.5 });
  const r = seeded(st.seed, st.env, "moor");
  // the track: a narrow winding strip that thins into the distance
  const far = 300;
  const L: V3[] = [];
  const R: V3[] = [];
  for (let i = 0; i <= 18; i += 1) {
    const t = i / 18;
    const z = 0.4 + Math.pow(t, 2.2) * far;
    const bend = Math.sin(t * 3.1 + 0.6) * 9 * t;
    const w = 0.9 + 0.7 * (1 - t);
    L.push({ x: bend - w, y: 0.01, z });
    R.push({ x: bend + w, y: 0.01, z });
  }
  const track = projectPoly(st.cam, [...L, ...R.slice().reverse()]);
  if (track.length > 2) {
    const lq = L.map((p) => project(st.cam, p)).filter((p): p is Point => !!p);
    const rq = R.map((p) => project(st.cam, p)).filter((p): p is Point => !!p);
    add(
      st,
      LAYER.decal,
      far,
      pathEl(polyPath(track), { fill: PAPER }) + pathEl((lq.length > 2 ? smoothPath(lq, false) : "") + (rq.length > 2 ? smoothPath(rq, false) : ""), { stroke: st.pal.ink, w: st.lw * 0.7 }),
    );
  }
  // heather and gorse: low bushes in loose drifts, thinning with depth
  const drifts = st.lod >= 2 ? 22 : st.lod >= 1 ? 16 : 10;
  for (let i = 0; i < drifts; i += 1) {
    const z = st.zmid * between(r, 0.5, 1) + Math.pow(r(), 1.6) * (st.lod >= 2 ? 90 : 40);
    const [xa, xb] = xRangeAt(st.cam, z);
    bush(st, between(r, xa, xb), z, between(r, 0.45, 1.1), { flowers: i % 3 === 0 });
  }
  const [na, nb] = xRangeAt(st.cam, st.zmid + 1);
  for (let i = 0; i < 4; i += 1) rock(st, between(r, na, nb) * 0.9, st.zmid + between(r, 0.5, 14), between(r, 0.35, 0.9));
  // a few dark pools: the holes a lost walker falls into
  pondShape(st, between(r, na, nb) * 0.55, st.zmid + 5.5, 2.4, 1.5, 0);
  if (st.lod >= 1) pondShape(st, between(r, na, nb) * 0.7, st.zmid + 12, 3.2, 2, 0);
  // a lone bare thorn tree for scale
  if (st.lod >= 1) tree(st, xRangeAt(st.cam, st.zmid + 20)[0] * 0.5, st.zmid + 20, { h: 6, kind: "bare" });
  return outdoorSites(st, st.zmid + 14, st.zmid + 6);
}

/**
 * A muddy roadside ditch: a low far bank with a stone wall above it, a band of
 * muddy water with ripples, mud banks (dense dots) on both sides, bulrushes and
 * a rock. The road shows as a pale strip beyond the wall.
 */
export function ditch(st: Stage): Sites {
  const night = st.pal.night;
  hills(st, 0.07, night ? toneFill("dark", st.p) : toneFill("light", st.p), 1000, 2);
  treeLine(st, 0.05, 600);
  drawGround(st, "grass", { density: 0.9 });
  const z0 = st.zmid + 1.4;
  const z1 = st.zmid + (st.shot === "establishing" ? 9 : 5.4);
  // muddy far and near banks
  const [fa, fb] = xRangeAt(st.cam, z1 + 1.2);
  const bank = projectPoly(st.cam, [
    { x: fa - 20, y: 0, z: z1 },
    { x: fb + 20, y: 0, z: z1 },
    { x: fb + 20, y: 0.5, z: z1 + 1.2 },
    { x: fa - 20, y: 0.5, z: z1 + 1.2 },
  ]);
  if (bank.length > 2 && visible(st, bank)) add(st, LAYER.decal, z1 + 0.2, pathEl(polyPath(bank), { fill: toneFill("dense_dots", st.p), stroke: st.pal.ink, w: st.lw * 0.8 }));
  // the stone wall on top of the far bank, with courses
  {
    const zw = z1 + 2.2;
    const wall = projectPoly(st.cam, [
      { x: fa - 20, y: 0.2, z: zw },
      { x: fb + 20, y: 0.2, z: zw },
      { x: fb + 20, y: 1.7, z: zw },
      { x: fa - 20, y: 1.7, z: zw },
    ]);
    if (wall.length > 2 && visible(st, wall)) {
      let courses = "";
      for (let y = 0.6; y < 1.7; y += 0.4) courses += segD(st, { x: fa - 20, y, z: zw }, { x: fb + 20, y, z: zw });
      let joints = "";
      let row = 0;
      for (let y = 0.2; y < 1.6; y += 0.4) {
        for (let x = fa - 4 + (row % 2) * 0.5; x < fb + 4; x += 1) joints += segD(st, { x, y, z: zw }, { x, y: y + 0.4, z: zw });
        row += 1;
      }
      add(st, LAYER.decal, zw, pathEl(polyPath(wall), { fill: st.pal.wall, stroke: st.pal.ink, w: st.lw * 1.1 }) + pathEl(courses + joints, { stroke: st.pal.ink, w: st.lw * 0.5 }));
    }
  }
  waterBand(st, z0, z1, { bankJitter: 0.7 });
  // mud along the near bank
  const [na, nb] = xRangeAt(st.cam, z0);
  const mud = projectPoly(st.cam, [
    { x: na - 20, y: 0, z: z0 - 0.9 },
    { x: nb + 20, y: 0, z: z0 - 0.9 },
    { x: nb + 20, y: 0, z: z0 + 0.1 },
    { x: na - 20, y: 0, z: z0 + 0.1 },
  ]);
  if (mud.length > 2 && visible(st, mud)) add(st, LAYER.decal, z0 - 0.4, pathEl(polyPath(mud), { fill: toneFill("dense_dots", st.p), stroke: st.pal.ink, w: st.lw * 0.6 }));
  const r = seeded(st.seed, st.env, "ditch");
  for (let i = 0; i < 4 + st.lod * 2; i += 1) {
    const side = i % 2 === 0 ? between(r, na, na * 0.2) : between(r, nb * 0.2, nb);
    reeds(st, side, z1 - between(r, 0, 0.6), between(r, 1.2, 2), 8);
  }
  for (let i = 0; i < 3; i += 1) reeds(st, between(r, na, nb), z0 + between(r, 0.2, 0.9), between(r, 0.8, 1.3), 6);
  rock(st, between(r, na, nb) * 0.5, z0 - 0.5, 0.45);
  if (st.lod >= 1) bush(st, between(r, na, nb) * 0.8, z1 + 1.3, 0.9);
  return outdoorSites(st, z1 + 3, st.zmid + 0.5);
}

function postAndRail(st: Stage, x: number, z0: number, z1: number): void {
  const zc = toCam(st.cam, { x, y: 0.6, z: z0 }).z;
  if (zc < st.cam.near) return;
  const lw = wAt(st, zc);
  let d = "";
  d += segD(st, { x, y: 0, z: z0 }, { x, y: 1.1, z: z0 });
  d += segD(st, { x, y: 0.9, z: z0 }, { x, y: 0.9, z: z1 });
  d += segD(st, { x, y: 0.5, z: z0 }, { x, y: 0.5, z: z1 });
  add(st, LAYER.stand, zc, pathEl(d, { stroke: st.pal.ink, w: lw * 1.2 }));
}

/**
 * Abstract backdrop for ideas (nonfiction pages use it a lot), so it must stay
 * calm and varied. Six seeded compositions, chosen per location and panel
 * shape: a soft vertical gradation, flowing contour lines, a paper vignette, a
 * subtle dotted band, a thin-line radiance with a wide clear centre, and
 * horizontal hatch bands. Close shots always take one of the three quietest.
 * Pattern tone stays in a band (never the whole panel).
 */
export function abstractField(st: Stage): Sites {
  const b = st.box;
  const r = seeded(st.seed, st.env, "abstract", st.shot, n(b.w), n(b.h));
  const close = st.shot === "close" || st.shot === "extreme_close" || st.shot === "insert";
  const variant = close ? [0, 2, 5][Math.floor(r() * 3) % 3] : Math.floor(r() * 6) % 6;
  const cx = b.x + b.w * 0.5;
  const cy = b.y + b.h * 0.45;
  const t = (x: Parameters<typeof toneFill>[0]) => toneFill(x, st.p);
  const night = st.pal.night;
  const soft = night ? "#bdbdbd" : "#8c8c8c";
  let s = boxRect(st, night ? t("dark") : PAPER);
  const band = (y0: number, y1: number, fill: string, wave: number): string => {
    const top: Point[] = [];
    const bot: Point[] = [];
    const ph = r() * 6.28;
    for (let k = 0; k <= 10; k += 1) {
      const x = b.x - 10 + ((b.w + 20) * k) / 10;
      top.push({ x, y: y0 + Math.sin((k / 10) * Math.PI * 2 + ph) * wave });
      bot.push({ x, y: y1 + Math.sin((k / 10) * Math.PI * 2 + ph + 1.3) * wave });
    }
    return pathEl(`${smoothPath(top, false)}L${n(bot[bot.length - 1].x)} ${n(bot[bot.length - 1].y)}${smoothPath([...bot].reverse(), false).replace(/^M/, "L")}Z`, { fill });
  };
  if (variant === 0) {
    // soft gradation: a light tone at one edge stepping to paper
    const fromTop = r() < 0.5;
    const steps = 4;
    for (let i = 0; i < steps; i += 1) {
      const h = b.h * (0.42 - i * 0.09);
      const y = fromTop ? b.y - 2 : b.y + b.h - h + 2;
      s += pathEl(rectD(b.x - 2, y, b.w + 4, h), { fill: night ? INK : t("light"), opacity: 0.28 });
    }
  } else if (variant === 1) {
    // flowing contour lines, with one light band between two of them
    let d = "";
    const lines = 6;
    const ph0 = r() * 6.28;
    const amp = b.h * between(r, 0.04, 0.08);
    for (let i = 0; i < lines; i += 1) {
      const y0 = b.y + b.h * (0.12 + (i / lines) * 0.85);
      const pts: Point[] = [];
      for (let k = 0; k <= 12; k += 1) {
        const x = b.x - 10 + ((b.w + 20) * k) / 12;
        pts.push({ x, y: y0 + Math.sin((k / 12) * Math.PI * 2 + ph0 + i * 0.5) * amp });
      }
      d += smoothPath(pts, false);
    }
    s += band(b.y + b.h * 0.55, b.y + b.h * 0.7, night ? INK : t("light"), amp);
    s += pathEl(d, { stroke: soft, w: st.lw * 0.7 });
  } else if (variant === 2) {
    // paper vignette: flat light tone in the corners, a clear oval centre
    const rx = b.w * 0.62;
    const ry = b.h * 0.6;
    const oval = `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(rx * 2)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-rx * 2)} 0Z`;
    s += pathEl(rectD(b.x - 4, b.y - 4, b.w + 8, b.h + 8) + oval, { fill: night ? INK : t("light"), evenodd: true, opacity: 0.8 });
  } else if (variant === 3) {
    // a subtle dotted band across the lower third with a wavy edge
    const y0 = b.y + b.h * between(r, 0.66, 0.74);
    s += band(y0, b.y + b.h + 12, night ? t("mid") : t("dots"), b.h * 0.03);
    let d = "";
    for (let i = 0; i < 3; i += 1) {
      const y = b.y + b.h * (0.12 + i * 0.07);
      const x0 = b.x + b.w * between(r, 0.05, 0.4);
      d += `M${n(x0)} ${n(y)}h${n(b.w * between(r, 0.2, 0.45))}`;
    }
    s += pathEl(d, { stroke: soft, w: st.lw * 0.6 });
  } else if (variant === 4) {
    // thin-line radiance: fine rays from the edges toward a wide clear centre
    const rays = 44;
    const R = Math.hypot(b.w, b.h);
    let d = "";
    for (let i = 0; i < rays; i += 1) {
      const a = (i / rays) * Math.PI * 2 + r() * 0.04;
      const r0x = b.w * between(r, 0.36, 0.44);
      const r0y = b.h * between(r, 0.36, 0.44);
      d += `M${n(cx + Math.cos(a) * r0x)} ${n(cy + Math.sin(a) * r0y)}L${n(cx + Math.cos(a) * R)} ${n(cy + Math.sin(a) * R)}`;
    }
    s += pathEl(d, { stroke: soft, w: st.lw * 0.55 });
  } else {
    // horizontal hatch bands thinning toward the middle (a calm "beta" backing)
    let d = "";
    const top = b.y + b.h * 0.1;
    for (let i = 0; i < 9; i += 1) {
      const y = top + i * (2.5 + i * 1.1);
      d += `M${n(b.x - 2)} ${n(y)}L${n(b.x + b.w * between(r, 0.55, 1.02))} ${n(y)}`;
      const y2 = b.y + b.h - 6 - i * (2.5 + i * 1.1);
      d += `M${n(b.x + b.w * between(r, -0.02, 0.45))} ${n(y2)}L${n(b.x + b.w + 2)} ${n(y2)}`;
    }
    s += pathEl(d, { stroke: soft, w: st.lw * 0.6 });
  }
  add(st, LAYER.sky, 0, s);
  st.anchors.focus = { x: cx, y: cy };
  return { interior: false, wallSlots: [], spots: [], centre: { x: 0, z: st.zmid + 4 }, backZ: st.zmid + 8, span: [-5, 5] };
}

export function voidScene(st: Stage): Sites {
  // never a blank white sheet (a place the book did not describe): paper with a light wash at the
  // top, a horizon line and a ground band with a few grass ticks, so figures stand somewhere
  const b = st.box;
  const r = seeded(st.seed, st.env, "void", st.shot, n(b.w), n(b.h));
  const night = st.pal.night;
  add(st, LAYER.sky, 0, boxRect(st, night ? toneFill("dark", st.p) : PAPER));
  for (let i = 0; i < 4; i += 1) {
    add(st, LAYER.sky, 0, pathEl(rectD(b.x - 2, b.y - 2, b.w + 4, b.h * (0.34 - i * 0.07)), { fill: night ? INK : toneFill("light", st.p), opacity: 0.2 }));
  }
  const hy = Math.min(b.y + b.h * 0.9, Math.max(b.y + b.h * 0.3, Number.isFinite(st.cam.horizonY) ? st.cam.horizonY : b.y + b.h * 0.62));
  add(st, LAYER.sky, 0, pathEl(rectD(b.x - 2, hy, b.w + 4, b.y + b.h - hy + 2), { fill: night ? INK : toneFill("light", st.p), opacity: 0.32 }));
  add(st, LAYER.sky, 0, pathEl(`M${n(b.x - 2)} ${n(hy)}L${n(b.x + b.w + 2)} ${n(hy)}`, { stroke: night ? "#bdbdbd" : "#8c8c8c", w: st.lw * 0.8 }));
  for (let i = 0; i < 9; i += 1) {
    const x = b.x + b.w * (0.05 + r() * 0.9);
    const y = hy + (b.y + b.h - hy) * (0.15 + r() * 0.8);
    add(st, LAYER.sky, 0, pathEl(`M${n(x)} ${n(y)}l${n(-3)} ${n(-5)}M${n(x)} ${n(y)}l${n(3)} ${n(-5)}`, { stroke: night ? "#bdbdbd" : "#8c8c8c", w: st.lw * 0.7 }));
  }
  return { interior: false, wallSlots: [], spots: [], centre: { x: 0, z: st.zmid + 4 }, backZ: st.zmid + 8, span: [-5, 5] };
}

export { visible, scaleAt };
