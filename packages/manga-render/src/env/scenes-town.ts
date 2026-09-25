/** Town scenes: city_square, street, rooftops, market, town_hall, church, cottage, mill. */
import type { Point } from "../contracts.js";
import { INK, PAPER, toneFill } from "../style.js";
import { n, polyPath, smoothPath } from "../svg.js";
import { between, seeded } from "../prng.js";
import { project, projectPoly, scaleAt, toCam, xRangeAt, type V3 } from "./camera.js";
import { LAYER, add, backDist, pathEl, pick, place, polyD, segD, visible, wAt, type Stage } from "./stage.js";
import { archPoints, boxSvg, columnSvg, drawBox, drawBuilding, drawSkyline, drawSteps, faceVisible, frame, type Frame, type Orient, type RoofKind } from "./architecture.js";
import { drawGround } from "./ground.js";
import { bush, crowdRow, flowers, hills, rock, scallop, tree, treeLine, waterBand } from "./nature.js";
import { lampPost, picketFence } from "./features.js";
import type { Sites } from "./features.js";

const ROOFS: RoofKind[] = ["gable", "pitched", "pitched", "flat", "gable"];

export interface RowOptions {
  minH: number;
  maxH: number;
  depth?: number;
  base?: number;
  roofs?: RoofKind[];
  minW?: number;
  maxW?: number;
  noWindows?: boolean;
}

/** A row of buildings facing the camera, laid out in world space so every panel of a location matches. */
export function facadeRow(st: Stage, key: string, z: number, xa: number, xb: number, o: RowOptions): void {
  const r = seeded(st.seed, st.env, key);
  let x = -80;
  while (x < 80) {
    const w = between(r, o.minW ?? 6, o.maxW ?? 10);
    const h = between(r, o.minH, o.maxH);
    const roof = pick(r, o.roofs ?? ROOFS);
    const jz = between(r, -0.4, 0.4);
    const chim = roof === "flat" ? 1 : r() < 0.6 ? 1 : 2;
    const shutters = r() < 0.3;
    const arched = r() < 0.25;
    if (x + w > xa - 2 && x < xb + 2) {
      const cx = x + w / 2;
      const zc = toCam(st.cam, { x: cx, y: h / 2, z: z + jz }).z;
      drawBuilding(st, {
        ox: x,
        oz: z + jz,
        width: w,
        depth: o.depth ?? 8,
        height: h,
        roof,
        chimneys: chim,
        shutters,
        arched,
        base: o.base,
        noWindows: o.noWindows,
        sortZ: zc + Math.abs(cx) * 0.01,
      });
    }
    x += w;
  }
}

/** Buildings along one side of a street, facades facing the street centre. */
export function sideRow(st: Stage, key: string, side: "left" | "right", xFace: number, z0: number, z1: number, o: RowOptions): void {
  const r = seeded(st.seed, st.env, key);
  let z = z0;
  const orient: Orient = side;
  while (z < z1) {
    const w = between(r, o.minW ?? 5, o.maxW ?? 9);
    const h = between(r, o.minH, o.maxH);
    const roof: RoofKind = pick<RoofKind>(r, o.roofs ?? ["pitched", "pitched", "flat"]);
    const inset = between(r, 0, 0.5) * (side === "left" ? -1 : 1);
    const chim = r() < 0.7 ? 1 : 2;
    const shutters = r() < 0.3;
    drawBuilding(st, {
      orient,
      ox: xFace + inset,
      oz: z,
      width: w,
      depth: o.depth ?? 8,
      height: h,
      roof,
      chimneys: chim,
      shutters,
      base: o.base,
      sortZ: toCam(st.cam, { x: xFace, y: h / 2, z: z + w / 2 }).z,
    });
    z += w;
  }
}

function span(st: Stage, z: number): [number, number] {
  const [a, b] = xRangeAt(st.cam, z);
  return [a - 2, b + 2];
}

// ---------------------------------------------------------------------------

export function citySquare(st: Stage): Sites {
  const est = st.shot === "establishing";
  const zB = st.zmid + backDist(st, est ? 34 : 24);
  drawSkyline(st, 220, { spire: true });
  drawGround(st, "cobbles");
  const half = Math.max(13, xRangeAt(st.cam, st.zmid)[1] * 1.1);
  const [xa, xb] = span(st, zB);
  facadeRow(st, "back", zB, xa, xb, { minH: 9, maxH: 15 });
  if (st.lod >= 1) {
    sideRow(st, "left", "left", -half, st.zmid - 3, zB, { minH: 8, maxH: 14 });
    sideRow(st, "right", "right", half, st.zmid - 3, zB, { minH: 8, maxH: 14 });
  }
  if (st.lod >= 2) {
    lampPost(st, -half + 2.2, st.zmid + 2.5);
    lampPost(st, half - 2.2, st.zmid + 5);
  }
  return {
    interior: false,
    wallSlots: [],
    spots: [
      { x: -half * 0.55, z: st.zmid + 3 },
      { x: half * 0.55, z: st.zmid + 4 },
      { x: -half * 0.35, z: zB - 4 },
      { x: half * 0.35, z: zB - 4 },
    ],
    centre: { x: 0, z: st.zmid + (est ? 16 : 12) },
    backZ: zB,
    span: [xa, xb],
  };
}

export function street(st: Stage): Sites {
  const half = 7;
  const zEnd = st.zmid + 55;
  drawSkyline(st, 240, { spire: st.rand() < 0.6 });
  drawGround(st, "cobbles");
  // sidewalks: curb lines and paving
  let curb = "";
  for (const x of [-half + 2.4, half - 2.4]) {
    curb += segD(st, { x, y: 0.02, z: 0.3 }, { x, y: 0.02, z: zEnd });
    curb += segD(st, { x: x + (x < 0 ? -0.18 : 0.18), y: 0.15, z: 0.3 }, { x: x + (x < 0 ? -0.18 : 0.18), y: 0.15, z: zEnd });
  }
  add(st, LAYER.decal, 0, pathEl(curb, { stroke: st.pal.ink, w: st.lw * 0.8 }));
  sideRow(st, "left", "left", -half, 0, zEnd, { minH: 9, maxH: 16 });
  sideRow(st, "right", "right", half, 0, zEnd, { minH: 9, maxH: 16 });
  const [xa, xb] = span(st, zEnd);
  facadeRow(st, "end", zEnd, xa, xb, { minH: 10, maxH: 18 });
  if (st.lod >= 2) {
    for (let z = 6; z < st.zmid + 40; z += 13) {
      lampPost(st, -half + 1.6, z);
      lampPost(st, half - 1.6, z + 6.5);
    }
  }
  return {
    interior: false,
    wallSlots: [],
    spots: [
      { x: -half + 1.2, z: st.zmid + 2 },
      { x: half - 1.2, z: st.zmid + 3 },
      { x: -half + 1.2, z: st.zmid + 8 },
      { x: half - 1.2, z: st.zmid + 9 },
    ],
    centre: { x: 0, z: st.zmid + 10 },
    backZ: st.zmid + 14,
    span: [-half + 2.4, half - 2.4],
  };
}

export function rooftops(st: Stage): Sites {
  const zEdge = st.zmid + 3;
  drawSkyline(st, 320, { spire: true, heightMul: 1.3 });
  // neighbouring roofs around our own height, stepping away
  const rows = st.lod >= 2 ? 4 : 2;
  for (let i = 0; i < rows; i += 1) {
    const z = zEdge + 4 + i * 9;
    const [xa, xb] = span(st, z);
    facadeRow(st, `roofs${i}`, z, xa, xb, { minH: 10, maxH: 13.5, base: -12.2 + i * 0.4, roofs: ["pitched", "gable", "pitched", "pitched"], depth: 9, minW: 5, maxW: 8, noWindows: true });
  }
  // our roof deck, painted over everything beyond its edge
  drawGround(st, "roof", { cap: zEdge, fillToCap: true, layer: LAYER.stand, z: 0.03 });
  const [ea, eb] = span(st, zEdge);
  drawBox(st, ea - 5, eb + 5, 0, 0.3, zEdge, zEdge + 0.25, st.pal.wall, { sortZ: 0.02 });
  // a chimney stack on our roof, to one side
  const side = seeded(st.seed, st.env, "stack")() < 0.5 ? -1 : 1;
  const [na, nb] = xRangeAt(st.cam, st.zmid + 1.5);
  const stackX = (side < 0 ? na : nb) * 0.62;
  const z0 = st.zmid + 1.2;
  const fr = frame("front", 0, 0);
  const zc = toCam(st.cam, { x: stackX, y: 1.4, z: z0 }).z;
  const lw = wAt(st, zc);
  let stack = boxSvg(st, fr, { a0: stackX - 0.7, a1: stackX + 0.7, y0: 0, y1: 2.1, d0: z0, d1: z0 + 0.8 }, st.pal.wall, lw);
  let bricks = "";
  for (let y = 0.3; y < 2.1; y += 0.3) bricks += segD(st, { x: stackX - 0.7, y, z: z0 - 0.01 }, { x: stackX + 0.7, y, z: z0 - 0.01 });
  stack += pathEl(bricks, { stroke: st.pal.ink, w: lw * 0.4 });
  stack += boxSvg(st, fr, { a0: stackX - 0.8, a1: stackX + 0.8, y0: 2.1, y1: 2.25, d0: z0 - 0.08, d1: z0 + 0.88 }, st.pal.wall, lw);
  for (const dx of [-0.38, 0.05, 0.45]) stack += boxSvg(st, fr, { a0: stackX + dx - 0.13, a1: stackX + dx + 0.13, y0: 2.25, y1: 2.7, d0: z0 + 0.27, d1: z0 + 0.53 }, st.pal.wall, lw * 0.8);
  add(st, LAYER.stand, 0.01, stack);
  if (st.lod >= 1 && !st.snow) smoke(st, stackX + 0.05, 2.8, z0 + 0.4);
  return {
    interior: false,
    wallSlots: [],
    spots: [
      { x: -stackX * 0.8, z: st.zmid + 1.2 },
      { x: stackX * 0.3, z: st.zmid + 2 },
    ],
    centre: { x: 0, z: zEdge + 5 },
    backZ: zEdge + 6,
    span: span(st, zEdge + 6),
  };
}

function smoke(st: Stage, x: number, y: number, z: number): void {
  const pl = place(st, { x, y, z });
  if (!pl) return;
  const k = pl.k;
  let d = "";
  let cx = pl.base.x;
  let cy = pl.base.y;
  const drift = st.rand() < 0.5 ? -1 : 1;
  for (let i = 0; i < 5; i += 1) {
    const r = (0.14 + i * 0.09) * k;
    cx += drift * r * 0.55;
    cy -= r * 1.5;
    d += scallop(cx, cy, r * 1.25, r * 0.85, 6, st.rand);
  }
  add(st, LAYER.stand, pl.z - 0.1, pathEl(d, { fill: st.pal.night ? toneFill("mid", st.p) : PAPER, stroke: st.pal.ink, w: wAt(st, pl.z) * 0.55 }));
}

export function market(st: Stage): Sites {
  const lane = 4.2;
  const zEnd = st.zmid + 40;
  drawSkyline(st, 240, {});
  drawGround(st, "cobbles");
  sideRow(st, "left", "left", -lane - 5, 0, zEnd, { minH: 8, maxH: 13 });
  sideRow(st, "right", "right", lane + 5, 0, zEnd, { minH: 8, maxH: 13 });
  const [xa, xb] = span(st, zEnd);
  facadeRow(st, "end", zEnd, xa, xb, { minH: 9, maxH: 14 });
  const r = seeded(st.seed, st.env, "stalls");
  for (let z = 1.5; z < st.zmid + 26; z += 3.6) {
    stall(st, "left", -lane, z, r);
    stall(st, "right", lane, z + 1.8, r);
  }
  if (st.lod >= 2) crowdRow(st, -lane + 0.6, lane - 0.6, st.zmid + 9, 0.8);
  return {
    interior: false,
    wallSlots: [],
    spots: [
      { x: -lane + 1.2, z: st.zmid + 1 },
      { x: lane - 1.2, z: st.zmid + 2 },
    ],
    centre: { x: 0, z: st.zmid + 7 },
    backZ: st.zmid + 12,
    span: [-lane + 0.5, lane - 0.5],
  };
}

function stall(st: Stage, side: "left" | "right", xFace: number, z0: number, r: () => number): void {
  const fr = frame(side, xFace, z0);
  const W = 2.8;
  const mid = fr.M(W / 2, 1, 0.6);
  const zc = toCam(st.cam, mid).z;
  if (zc < st.cam.near) return;
  const hull = projectPoly(st.cam, [fr.M(0, 0, 0), fr.M(W, 0, 0), fr.M(W, 2.6, 0), fr.M(0, 2.6, 0)]);
  if (!visible(st, hull, 30)) return;
  const lw = wAt(st, zc);
  let s = "";
  // posts
  for (const a of [0.05, W - 0.1]) {
    s += boxSvg(st, fr, { a0: a, a1: a + 0.08, y0: 0, y1: 2.4, d0: 0.05, d1: 0.13 }, st.pal.wood, lw * 0.7);
  }
  // counter
  s += boxSvg(st, fr, { a0: 0, a1: W, y0: 0, y1: 0.95, d0: 0.1, d1: 1.2 }, st.pal.wood, lw, st.pal.wall);
  // counter planks
  if (scaleAt(st.cam, mid) > 18) {
    let pl = "";
    for (let y = 0.25; y < 0.95; y += 0.23) pl += segD(st, fr.M(0.02, y, 0.09), fr.M(W - 0.02, y, 0.09));
    s += pathEl(pl, { stroke: st.pal.ink, w: lw * 0.4 });
  }
  // goods: fruit mounds / crates
  const k = scaleAt(st.cam, mid);
  let goods = "";
  if (k > 14) {
    for (let i = 0; i < 9; i += 1) {
      const a = 0.25 + (i / 8) * (W - 0.5);
      const p = project(st.cam, fr.M(a, 1.05 + (i % 2) * 0.1, 0.5 + (i % 3) * 0.15));
      if (!p) continue;
      const rr = 0.13 * scaleAt(st.cam, fr.M(a, 1, 0.5));
      goods += `M${n(p.x - rr)} ${n(p.y)}a${n(rr)} ${n(rr)} 0 1 0 ${n(rr * 2)} 0a${n(rr)} ${n(rr)} 0 1 0 ${n(-rr * 2)} 0`;
    }
    s += pathEl(goods, { fill: PAPER, stroke: st.pal.ink, w: lw * 0.5 });
  }
  // striped awning: sloping from the back (high) toward the lane (lower)
  const strips = 6;
  let dark = "";
  let light = "";
  for (let i = 0; i < strips; i += 1) {
    const a0 = (i / strips) * (W + 0.4) - 0.2;
    const a1 = ((i + 1) / strips) * (W + 0.4) - 0.2;
    const q = polyD(st, [fr.M(a0, 2.3, -0.5), fr.M(a1, 2.3, -0.5), fr.M(a1, 2.75, 1.4), fr.M(a0, 2.75, 1.4)]);
    if (i % 2 === 0) dark += q;
    else light += q;
    // valance scallop
    const v0 = project(st.cam, fr.M(a0, 2.3, -0.5));
    const v1 = project(st.cam, fr.M(a1, 2.3, -0.5));
    if (v0 && v1) {
      const drop = 0.25 * scaleAt(st.cam, fr.M(a0, 2.3, -0.5));
      const val = `M${n(v0.x)} ${n(v0.y)}L${n(v1.x)} ${n(v1.y)}Q${n((v0.x + v1.x) / 2)} ${n((v0.y + v1.y) / 2 + drop * 1.8)} ${n(v0.x)} ${n(v0.y)}Z`;
      if (i % 2 === 0) dark += val;
      else light += val;
    }
  }
  const stripeFill = r() < 0.5 ? toneFill("dark", st.p) : toneFill("dense_dots", st.p);
  s += pathEl(light, { fill: PAPER, stroke: st.pal.ink, w: lw * 0.8 }) + pathEl(dark, { fill: stripeFill, stroke: st.pal.ink, w: lw * 0.8 });
  add(st, LAYER.stand, zc, s);
}

export function townHall(st: Stage): Sites {
  const zB = st.zmid + backDist(st, 26);
  drawSkyline(st, 220, {});
  drawGround(st, "flags");
  const W = 28;
  drawBuilding(st, {
    ox: -W / 2,
    oz: zB,
    width: W,
    depth: 12,
    height: 13,
    roof: "flat",
    floorH: 4.2,
    arched: true,
    door: false,
    sortZ: toCam(st.cam, { x: 0, y: 6, z: zB }).z + 1,
  });
  // portico: steps, six columns, entablature and pediment
  const zP = zB - 4;
  const podium = 1.4;
  drawSteps(st, -8.5, 8.5, zP - 2.6, 5, podium / 5, 0.52);
  drawBox(st, -8.5, 8.5, 0, podium, zP - 0.1, zB, st.pal.wall);
  const colH = 7.2;
  let cols = "";
  for (let i = 0; i < 6; i += 1) {
    const x = -7 + i * 2.8;
    cols += columnSvg(st, x, zP + 0.6, 0.42, colH, { y0: podium, base: 0.45 });
  }
  const zc = toCam(st.cam, { x: 0, y: 4, z: zP }).z;
  add(st, LAYER.stand, zc, cols);
  const fr = frame("front", 0, 0);
  const lw = wAt(st, zc);
  const entY = podium + colH;
  let top = boxSvg(st, fr, { a0: -8.2, a1: 8.2, y0: entY, y1: entY + 1.3, d0: zP, d1: zB }, st.pal.wall, lw);
  const tri = [
    { x: -8.4, y: entY + 1.3, z: zP - 0.05 },
    { x: 0, y: entY + 4.2, z: zP - 0.05 },
    { x: 8.4, y: entY + 1.3, z: zP - 0.05 },
  ];
  const inner = [
    { x: -6.8, y: entY + 1.65, z: zP - 0.07 },
    { x: 0, y: entY + 3.7, z: zP - 0.07 },
    { x: 6.8, y: entY + 1.65, z: zP - 0.07 },
  ];
  top += pathEl(polyD(st, tri), { fill: st.pal.wall, stroke: st.pal.ink, w: lw * 1.2 });
  top += pathEl(polyD(st, inner), { fill: st.pal.shade, stroke: st.pal.ink, w: lw * 0.7 });
  top += pathEl(segD(st, { x: -8.2, y: entY + 0.45, z: zP - 0.01 }, { x: 8.2, y: entY + 0.45, z: zP - 0.01 }), { stroke: st.pal.ink, w: lw * 0.6 });
  // round emblem in the pediment
  const c3 = { x: 0, y: entY + 2.4, z: zP - 0.08 };
  const c = project(st.cam, c3);
  const k = scaleAt(st.cam, c3);
  if (c) top += `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(0.75 * k)}" fill="${PAPER}" stroke="${st.pal.ink}" stroke-width="${n(lw)}"/><circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(0.45 * k)}" fill="none" stroke="${st.pal.ink}" stroke-width="${n(lw * 0.6)}"/>`;
  // flag on the roof
  const pole0 = project(st.cam, { x: 0, y: 13, z: zB + 3 });
  const pole1 = project(st.cam, { x: 0, y: 19, z: zB + 3 });
  if (pole0 && pole1) {
    const kk = scaleAt(st.cam, { x: 0, y: 18, z: zB + 3 });
    top += pathEl(`M${n(pole0.x)} ${n(pole0.y)}L${n(pole1.x)} ${n(pole1.y)}`, { stroke: st.pal.ink, w: lw });
    const fx = pole1.x;
    const fy = pole1.y + 0.1 * kk;
    top += pathEl(`M${n(fx)} ${n(fy)}q${n(1.2 * kk)} ${n(-0.4 * kk)} ${n(2.6 * kk)} ${n(0.1 * kk)}l0 ${n(1.5 * kk)}q${n(-1.3 * kk)} ${n(-0.5 * kk)} ${n(-2.6 * kk)} ${n(-0.1 * kk)}Z`, { fill: toneFill("stripes", st.p), stroke: st.pal.ink, w: lw * 0.8 });
  }
  add(st, LAYER.stand, zc - 0.5, top);
  // door behind the columns
  const door = polyD(st, archPoints((u, y) => ({ x: u, y, z: zB - 0.02 }), -1.4, 1.4, podium, podium + 3.6, false));
  add(st, LAYER.stand, toCam(st.cam, { x: 0, y: 3, z: zB }).z + 0.5, pathEl(door, { fill: st.pal.deep, stroke: st.pal.ink, w: lw }));
  const [xa, xb] = span(st, zB);
  return {
    interior: false,
    wallSlots: [],
    spots: [
      { x: -11, z: zB - 5 },
      { x: 11, z: zB - 5 },
      { x: -7, z: st.zmid + 2 },
      { x: 7, z: st.zmid + 2 },
    ],
    centre: { x: 0, z: st.zmid + 4 },
    backZ: zB - 3,
    span: [xa, xb],
  };
}

export function church(st: Stage): Sites {
  const zB = st.zmid + backDist(st, 30);
  drawSkyline(st, 260, {});
  hills(st, 0.05, st.pal.night ? toneFill("dark", st.p) : PAPER, 900);
  drawGround(st, "grass");
  // path to the portal
  const path = projectPoly(st.cam, [
    { x: -1.4, y: 0.01, z: 0.5 },
    { x: 1.4, y: 0.01, z: 0.5 },
    { x: 1.3, y: 0.01, z: zB },
    { x: -1.3, y: 0.01, z: zB },
  ]);
  if (path.length > 2) add(st, LAYER.decal, zB, pathEl(polyPath(path), { fill: st.snow ? PAPER : st.pal.ground === PAPER ? toneFill("light", st.p) : st.pal.ground, stroke: st.pal.ink, w: st.lw * 0.7 }));
  const W = 12;
  const H = 10;
  const R = 6.5;
  drawBuilding(st, {
    ox: -W / 2,
    oz: zB,
    width: W,
    depth: 22,
    height: H,
    roof: "gable",
    roofH: R,
    noWindows: true,
    door: false,
    wall: toneFill("stone", st.p),
    decorate: (fr) => churchFront(st, fr, W, H, R),
    sortZ: toCam(st.cam, { x: 0, y: H / 2, z: zB }).z,
  });
  // tower + spire on the left
  const tx = -W / 2 - 5.2;
  const TH = 19;
  drawBuilding(st, {
    ox: tx,
    oz: zB + 1,
    width: 5,
    depth: 5,
    height: TH,
    roof: "none",
    noWindows: true,
    door: false,
    wall: toneFill("stone", st.p),
    decorate: (fr) => {
      let s = "";
      const lw = wAt(st, toCam(st.cam, fr.M(2.5, 10, 0)).z);
      const m = (u: number, y: number): V3 => fr.M(u, y, -0.01);
      for (const [u0, y0, y1] of [
        [1.8, 5, 8.5],
        [1.6, TH - 5, TH - 1.2],
      ] as const) {
        const q = polyD(st, archPoints(m, u0, 5 - u0, y0, y1 - (5 - 2 * u0) * 0.8, true));
        s += pathEl(q, { fill: INK, stroke: st.pal.ink, w: lw });
      }
      s += pathEl(segD(st, m(0, TH - 6), m(5, TH - 6)) + segD(st, m(0, 11), m(5, 11)), { stroke: st.pal.ink, w: lw * 0.8 });
      return s;
    },
  });
  spire(st, tx + 2.5, zB + 3.5, TH, 2.8, 12);
  // headstones
  if (st.lod >= 2) {
    const r = seeded(st.seed, st.env, "graves");
    for (let i = 0; i < 6; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      headstone(st, side * between(r, 4.5, 9), st.zmid + 2 + between(r, 0, 7));
    }
    tree(st, W / 2 + 4, zB - 2, { h: 8, kind: "pine" });
  }
  return {
    interior: false,
    wallSlots: [],
    spots: [
      { x: -8, z: st.zmid + 4 },
      { x: 8, z: st.zmid + 4 },
    ],
    centre: { x: 0, z: st.zmid + 5 },
    backZ: zB - 1,
    span: span(st, zB - 1),
  };
}

function churchFront(st: Stage, fr: Frame, W: number, H: number, R: number): string {
  const m = (u: number, y: number): V3 => fr.M(u, y, -0.02);
  const lw = wAt(st, toCam(st.cam, m(W / 2, H / 2)).z);
  let s = "";
  // portal with archivolt
  const outer = polyD(st, archPoints(m, W / 2 - 2, W / 2 + 2, 0, 3.2, true));
  s += pathEl(outer, { fill: st.pal.wall, stroke: st.pal.ink, w: lw });
  const door = polyD(st, archPoints(m, W / 2 - 1.4, W / 2 + 1.4, 0, 2.9, true));
  s += pathEl(door, { fill: st.pal.night ? st.pal.lit : toneFill("dark", st.p), stroke: st.pal.ink, w: lw });
  s += pathEl(segD(st, m(W / 2, 0), m(W / 2, 4.4)), { stroke: st.pal.ink, w: lw * 0.6 });
  // lancet windows
  for (const u0 of [1.4, W - 2.6]) {
    const q = polyD(st, archPoints(m, u0, u0 + 1.2, 2.2, 5.6, true));
    s += pathEl(q, { fill: st.pal.night ? st.pal.lit : toneFill("light", st.p), stroke: st.pal.ink, w: lw });
    s += pathEl(segD(st, m(u0 + 0.6, 2.2), m(u0 + 0.6, 6.4)) + segD(st, m(u0, 4), m(u0 + 1.2, 4)), { stroke: st.pal.ink, w: lw * 0.5 });
  }
  // rose window with tracery
  const cy = H + R * 0.3;
  const cu = W / 2;
  const ring = (r: number, steps = 28): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i < steps; i += 1) {
      const a = (i / steps) * Math.PI * 2;
      const p = project(st.cam, m(cu + Math.cos(a) * r, cy + Math.sin(a) * r));
      if (p) pts.push(p);
    }
    return pts;
  };
  const R0 = 2.1;
  const outerRing = ring(R0 + 0.35);
  const glass = ring(R0);
  if (outerRing.length > 8) {
    s += pathEl(smoothPath(outerRing, true, 0.5), { fill: st.pal.wall, stroke: st.pal.ink, w: lw });
    s += pathEl(smoothPath(glass, true, 0.5), { fill: st.pal.night ? st.pal.lit : toneFill("light", st.p), stroke: st.pal.ink, w: lw * 0.8 });
    let tr = smoothPath(ring(0.55, 16), true, 0.5);
    let petals = "";
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const a2 = ((i + 0.5) / 8) * Math.PI * 2;
      tr += segD(st, m(cu + Math.cos(a) * 0.55, cy + Math.sin(a) * 0.55), m(cu + Math.cos(a) * R0, cy + Math.sin(a) * R0));
      const pc = project(st.cam, m(cu + Math.cos(a2) * 1.45, cy + Math.sin(a2) * 1.45));
      const kk = scaleAt(st.cam, m(cu, cy));
      if (pc) petals += `M${n(pc.x - 0.36 * kk)} ${n(pc.y)}a${n(0.36 * kk)} ${n(0.36 * kk)} 0 1 0 ${n(0.72 * kk)} 0a${n(0.36 * kk)} ${n(0.36 * kk)} 0 1 0 ${n(-0.72 * kk)} 0`;
    }
    s += pathEl(petals, { fill: st.pal.night ? PAPER : toneFill("dots", st.p), stroke: st.pal.ink, w: lw * 0.5 });
    s += pathEl(tr, { stroke: st.pal.ink, w: lw * 0.6 });
  }
  // buttress lines
  s += pathEl(segD(st, m(0.5, 0), m(0.5, H)) + segD(st, m(W - 0.5, 0), m(W - 0.5, H)), { stroke: st.pal.ink, w: lw * 0.7 });
  return s;
}

function spire(st: Stage, x: number, z: number, base: number, half: number, h: number): void {
  const apex: V3 = { x, y: base + h, z };
  const c: V3[] = [
    { x: x - half, y: base, z: z - half },
    { x: x + half, y: base, z: z - half },
    { x: x + half, y: base, z: z + half },
    { x: x - half, y: base, z: z + half },
  ];
  const zc = toCam(st.cam, { x, y: base, z: z - half }).z;
  if (zc < st.cam.near) return;
  const lw = wAt(st, zc);
  let s = "";
  for (let i = 0; i < 4; i += 1) {
    const a = c[i];
    const b = c[(i + 1) % 4];
    const mid = { x: (a.x + b.x) / 2 - x, y: 0, z: (a.z + b.z) / 2 - z };
    const nrm = { x: mid.x, y: half / h, z: mid.z };
    if (!faceVisible(st, a, nrm)) continue;
    const d = polyD(st, [a, b, apex]);
    if (d) s += pathEl(d, { fill: nrm.x > 0.3 ? st.pal.shade : st.snow ? PAPER : toneFill("dots", st.p), stroke: st.pal.ink, w: lw });
  }
  const top = project(st.cam, apex);
  const top2 = project(st.cam, { ...apex, y: apex.y + 1.4 });
  const cross = project(st.cam, { ...apex, y: apex.y + 1 });
  const kk = scaleAt(st.cam, apex);
  if (top && top2 && cross) s += pathEl(`M${n(top.x)} ${n(top.y)}L${n(top2.x)} ${n(top2.y)}M${n(cross.x - 0.4 * kk)} ${n(cross.y)}l${n(0.8 * kk)} 0`, { stroke: st.pal.ink, w: lw });
  add(st, LAYER.stand, zc - 0.2, s);
}

function headstone(st: Stage, x: number, z: number): void {
  const pl = place(st, { x, y: 0, z });
  if (!pl) return;
  const P = pl.at;
  const lw = wAt(st, pl.z);
  const w = 0.35;
  const h = 0.9;
  const d = `M${n(P(-w, 0).x)} ${n(P(-w, 0).y)}L${n(P(-w, h - w).x)} ${n(P(-w, h - w).y)}A${n(w * pl.k)} ${n(w * pl.k)} 0 0 1 ${n(P(w, h - w).x)} ${n(P(w, h - w).y)}L${n(P(w, 0).x)} ${n(P(w, 0).y)}Z`;
  add(st, LAYER.stand, pl.z, pathEl(d, { fill: toneFill("stone", st.p), stroke: st.pal.ink, w: lw }));
}

export function cottage(st: Stage): Sites {
  const zB = st.zmid + backDist(st, 9);
  hills(st, 0.08, st.pal.night ? toneFill("dark", st.p) : PAPER, 900, 2);
  treeLine(st, 0.05, 500);
  drawGround(st, "grass");
  const W = 8;
  const x0 = -W / 2 + 1;
  drawBuilding(st, {
    ox: x0,
    oz: zB,
    width: W,
    depth: 5.5,
    height: 2.9,
    floorH: 3,
    roof: "thatch",
    roofH: 3.4,
    chimneys: 1,
    shutters: true,
    sortZ: toCam(st.cam, { x: 0, y: 1.5, z: zB }).z,
  });
  smoke(st, x0 + W * 0.5, 7, zB + 2.8);
  // garden path
  const path = projectPoly(st.cam, [
    { x: 0.2, y: 0.01, z: 0.5 },
    { x: 2.0, y: 0.01, z: 0.5 },
    { x: 1.8, y: 0.01, z: zB },
    { x: 0.6, y: 0.01, z: zB },
  ]);
  if (path.length > 2) add(st, LAYER.decal, zB, pathEl(polyPath(path), { fill: st.snow ? PAPER : toneFill("light", st.p), stroke: st.pal.ink, w: st.lw * 0.6 }));
  if (st.lod >= 1) {
    picketFence(st, { x: -14, z: zB - 3.2 }, { x: 0.1, z: zB - 3.2 });
    picketFence(st, { x: 2.1, z: zB - 3.2 }, { x: 14, z: zB - 3.2 });
  }
  if (st.lod >= 2) {
    tree(st, x0 - 4.5, zB + 1.5, { h: 8 });
    flowers(st, -2.5, zB - 2.2, 1.2, 8);
    flowers(st, 4.5, zB - 2.2, 1.2, 8);
    bush(st, x0 + W + 1.5, zB - 0.5, 1.1, { flowers: true });
  }
  return {
    interior: false,
    wallSlots: [],
    spots: [
      { x: -6, z: st.zmid + 2 },
      { x: 7, z: st.zmid + 3 },
      { x: -9, z: zB },
    ],
    centre: { x: -3, z: st.zmid + 3 },
    backZ: zB - 2,
    span: span(st, zB - 2),
  };
}

export function mill(st: Stage): Sites {
  const zB = st.zmid + backDist(st, 14);
  hills(st, 0.1, st.pal.night ? toneFill("dark", st.p) : PAPER, 900, 2);
  treeLine(st, 0.05, 500);
  drawGround(st, "grass");
  waterBand(st, zB - 4.5, zB - 0.4);
  const W = 9;
  const x0 = -2;
  drawBuilding(st, {
    ox: x0,
    oz: zB,
    width: W,
    depth: 7,
    height: 6.5,
    roof: "pitched",
    roofH: 3.2,
    chimneys: 1,
    wall: toneFill("stone", st.p),
    shutters: false,
    sortZ: toCam(st.cam, { x: x0 + W / 2, y: 3, z: zB }).z,
  });
  waterWheel(st, x0 - 0.2, 2.4, zB - 0.9, 3.1);
  if (st.lod >= 2) {
    tree(st, x0 + W + 4, zB + 1, { h: 9, kind: "willow" });
    tree(st, x0 - 9, zB + 3, { h: 7 });
    rock(st, -5, zB - 5.2, 0.7);
  }
  return {
    interior: false,
    wallSlots: [],
    spots: [
      { x: -6, z: st.zmid + 1 },
      { x: 6, z: st.zmid + 1.5 },
    ],
    centre: { x: 3, z: st.zmid + 2 },
    backZ: zB - 5,
    span: span(st, zB - 5),
  };
}

function waterWheel(st: Stage, x: number, y: number, z: number, r: number): void {
  const zc = toCam(st.cam, { x, y, z }).z;
  if (zc < st.cam.near) return;
  const lw = wAt(st, zc);
  const ringPts = (rr: number, zz: number): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i < 36; i += 1) {
      const a = (i / 36) * Math.PI * 2;
      const p = project(st.cam, { x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr, z: zz });
      if (p) pts.push(p);
    }
    return pts;
  };
  const outer = ringPts(r, z);
  if (outer.length < 10 || !visible(st, outer)) return;
  const inner = ringPts(r * 0.8, z);
  let s = "";
  // back rim (depth) for thickness
  s += pathEl(smoothPath(ringPts(r, z + 0.7), true, 0.5), { fill: "none", stroke: st.pal.ink, w: lw * 0.7 });
  // spokes
  let spokes = "";
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    spokes += segD(st, { x, y, z }, { x: x + Math.cos(a) * r * 0.8, y: y + Math.sin(a) * r * 0.8, z });
  }
  s += pathEl(smoothPath(outer, true, 0.5) + smoothPath(inner, true, 0.5), { fill: st.pal.wood === PAPER ? toneFill("dots", st.p) : st.pal.wood, stroke: st.pal.ink, w: lw, evenodd: true });
  s += pathEl(spokes, { stroke: st.pal.ink, w: lw * 1.4 });
  // paddles
  let pad = "";
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const q = polyD(st, [
      { x: x + c * r * 0.95 - sn * 0.08, y: y + sn * r * 0.95 + c * 0.08, z: z - 0.05 },
      { x: x + c * r * 1.22 - sn * 0.08, y: y + sn * r * 1.22 + c * 0.08, z: z - 0.05 },
      { x: x + c * r * 1.22 + sn * 0.08, y: y + sn * r * 1.22 - c * 0.08, z: z - 0.05 },
      { x: x + c * r * 0.95 + sn * 0.08, y: y + sn * r * 0.95 - c * 0.08, z: z - 0.05 },
    ]);
    pad += q;
  }
  s += pathEl(pad, { fill: st.pal.wall, stroke: st.pal.ink, w: lw * 0.7 });
  const hub = project(st.cam, { x, y, z });
  const k = scaleAt(st.cam, { x, y, z });
  if (hub) s += `<circle cx="${n(hub.x)}" cy="${n(hub.y)}" r="${n(0.35 * k)}" fill="${st.pal.wall}" stroke="${st.pal.ink}" stroke-width="${n(lw)}"/>`;
  // splash at the waterline
  const wl = project(st.cam, { x: x + r * 0.2, y: 0, z: z - 0.2 });
  if (wl) {
    let sp = "";
    for (let i = 0; i < 6; i += 1) {
      const dx = (i - 2.5) * 0.35 * k;
      sp += `M${n(wl.x + dx)} ${n(wl.y)}q${n(dx * 0.3)} ${n(-0.6 * k)} ${n(dx * 0.6)} ${n(-0.3 * k)}`;
    }
    s += pathEl(sp, { stroke: st.pal.ink, w: lw * 0.6 });
  }
  add(st, LAYER.stand, zc - 0.3, s);
}

export { flowers, INK };
