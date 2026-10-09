/** Interior scenes: rooms, garret, palace hall, jail cell, courtroom, study, classroom. */
import type { Point } from "../contracts.js";
import { INK, PAPER, toneFill } from "../style.js";
import { n, polyPath, smoothPath } from "../svg.js";
import { between, seeded } from "../prng.js";
import { project, projectPoly, scaleAt, toCam, type V3 } from "./camera.js";
import { LAYER, add, pathEl, place, polyD, segD, wAt, type Stage } from "./stage.js";
import { boxSvg, columnSvg, drawSteps, frame } from "./architecture.js";
import { drawGround } from "./ground.js";
import {
  bed,
  bookshelfOnWall,
  candleAt,
  chair,
  chandelier,
  furniture,
  panelling,
  plasterCracks,
  roomShell,
  rug,
  stool,
  stoneBlocks,
  table,
  wallDecal,
  wallDoor,
  wallFireplace,
  wallWindow,
  type Room,
  type Wall,
} from "./interior.js";
import { bars as barsRow, railing } from "./features.js";
import type { Sites, WallSlot } from "./features.js";

function sitesFor(room: Room, walls: Wall[], slots: [Wall["name"], number, number][], spots: { x: number; z: number }[], drawn: Sites["drawn"]): Sites {
  const byName = (name: Wall["name"]): Wall => walls.find((w) => w.name === name) ?? walls[0];
  const wallSlots: WallSlot[] = slots.map(([name, u, w]) => ({ wall: byName(name), u, w }));
  return {
    interior: true,
    room,
    wallSlots,
    spots,
    centre: { x: 0, z: room.zb - 1.8 },
    backZ: room.zb - 0.8,
    span: [room.x0 + 0.3, room.x1 - 0.3],
    drawn,
  };
}

export function roomPoor(st: Stage): Sites {
  const W = 5.6;
  const room: Room = { x0: -W / 2, x1: W / 2, zb: st.zmid + 2.8, zf: -1.5, h: 2.7 };
  const walls = roomShell(st, room, { floor: "boards", beams: true });
  const [back, left, right] = walls;
  plasterCracks(st, back, 3);
  plasterCracks(st, right, 1);
  wallWindow(st, back, W * 0.56, 1.25, 0.9, 0.85, {});
  // the bed stands side-on in the middle depth of the room (a lying figure fits on it)
  bed(st, room.x0 + 1.35, Math.min(room.zb - 0.6, st.zmid + 0.9), { poor: true });
  table(st, room.x1 - 1.1, room.zb - 1.6, 0.9, 0.6, 0.72);
  stool(st, room.x1 - 1.1, room.zb - 0.95);
  candleAt(st, room.x1 - 1.0, 0.72, room.zb - 1.65);
  // a sagging shelf with a jug on the right wall
  if (st.lod >= 2) {
    const m = right.map;
    wallDecal(st, pathEl(polyD(st, [m(2.2, 1.6), m(3.4, 1.6), m(3.4, 1.66), m(2.2, 1.66)]), { fill: st.pal.wood, stroke: st.pal.ink, w: wAt(st, room.zb) }));
  }
  void left;
  return sitesFor(
    room,
    walls,
    [
      ["right", 0.4, 1.6],
      ["back", 0.2, 1.4],
      ["left", 2.6, 1.8],
    ],
    [
      { x: room.x1 - 1.3, z: room.zb - 2.6 },
      { x: room.x0 + 1, z: st.zmid - 0.5 },
      { x: 0.4, z: room.zb - 0.9 },
    ],
    ["window", "bed", "table"],
  );
}

/**
 * A foundry or forge: a rough stone workshop with a great lit furnace in the
 * back wall, an anvil, a work table with a crucible and mould, barrels and a
 * heap of ingots. The glow is the furnace mouth, drawn paper-white on black.
 */
export function forge(st: Stage): Sites {
  const W = 7.4;
  const room: Room = { x0: -W / 2, x1: W / 2, zb: st.zmid + 3.6, zf: -1.5, h: 4.4 };
  const walls = roomShell(st, room, { floor: "flags", wall: toneFill("stone", st.p), sideWall: toneFill("dots", st.p), ceiling: toneFill("dark", st.p), beams: true });
  const [back, left, right] = walls;
  stoneBlocks(st, back, 0.5);
  stoneBlocks(st, left, 0.5);
  stoneBlocks(st, right, 0.5);
  // the furnace: a wide lit hearth in the middle of the back wall
  wallFireplace(st, back, W / 2 - 0.9, true);
  // a hood and flue above it
  {
    const m = back.map;
    wallDecal(
      st,
      pathEl(polyD(st, [m(W / 2 - 1.3, 2.3), m(W / 2 + 1.3, 2.3), m(W / 2 + 0.5, 3.6), m(W / 2 - 0.5, 3.6)]), { fill: st.pal.shade, stroke: st.pal.ink, w: wAt(st, room.zb) }) +
        pathEl(polyD(st, [m(W / 2 - 0.5, 3.6), m(W / 2 + 0.5, 3.6), m(W / 2 + 0.5, room.h), m(W / 2 - 0.5, room.h)]), { fill: st.pal.shade, stroke: st.pal.ink, w: wAt(st, room.zb) }),
      back,
    );
  }
  // the anvil on its block
  const ax = room.x1 - 1.6;
  const az = st.zmid + 1.2;
  furniture(st, [
    { b: { a0: ax - 0.25, a1: ax + 0.25, y0: 0, y1: 0.62, d0: az - 0.2, d1: az + 0.2 }, fill: st.pal.wood },
    { b: { a0: ax - 0.5, a1: ax + 0.5, y0: 0.62, y1: 0.82, d0: az - 0.17, d1: az + 0.17 }, fill: toneFill("dark", st.p), top: toneFill("mid", st.p) },
  ]);
  // work table with a crucible and an ingot mould
  table(st, room.x0 + 1.4, room.zb - 1.5, 1.4, 0.7, 0.8);
  furniture(st, [
    { b: { a0: room.x0 + 0.95, a1: room.x0 + 1.25, y0: 0.8, y1: 1.1, d0: room.zb - 1.7, d1: room.zb - 1.4 }, fill: toneFill("black", st.p), top: toneFill("dark", st.p) },
    { b: { a0: room.x0 + 1.55, a1: room.x0 + 2.1, y0: 0.8, y1: 0.9, d0: room.zb - 1.75, d1: room.zb - 1.35 }, fill: toneFill("mid", st.p), top: PAPER },
  ]);
  // barrels and a heap of ingots by the right wall
  furniture(st, [
    { b: { a0: room.x1 - 0.9, a1: room.x1 - 0.2, y0: 0, y1: 0.95, d0: room.zb - 1.0, d1: room.zb - 0.3 }, fill: st.pal.wood, top: toneFill("dark", st.p) },
    { b: { a0: room.x1 - 0.95, a1: room.x1 - 0.35, y0: 0, y1: 0.3, d0: room.zb - 2.2, d1: room.zb - 1.6 }, fill: toneFill("mid", st.p), top: PAPER },
    { b: { a0: room.x1 - 0.85, a1: room.x1 - 0.45, y0: 0.3, y1: 0.55, d0: room.zb - 2.1, d1: room.zb - 1.7 }, fill: toneFill("mid", st.p), top: PAPER },
  ]);
  if (st.lod >= 1) {
    // sparks above the anvil: short rays
    const p = project(st.cam, { x: ax, y: 1.05, z: az });
    const k = scaleAt(st.cam, { x: ax, y: 1.05, z: az });
    if (p && k > 12) {
      let rays = "";
      for (let i = 0; i < 7; i += 1) {
        const a = -Math.PI / 2 + (i - 3) * 0.32;
        rays += `M${n(p.x + Math.cos(a) * 0.1 * k)} ${n(p.y + Math.sin(a) * 0.1 * k)}L${n(p.x + Math.cos(a) * 0.32 * k)} ${n(p.y + Math.sin(a) * 0.32 * k)}`;
      }
      add(st, LAYER.stand, toCam(st.cam, { x: ax, y: 1, z: az }).z - 0.01, pathEl(rays, { stroke: st.pal.ink, w: st.lw * 0.8 }));
    }
  }
  void left;
  void right;
  return sitesFor(
    room,
    walls,
    [
      ["left", 1.2, 1.4],
      ["right", 1.2, 1.4],
    ],
    [
      { x: 0, z: room.zb - 2.4 },
      { x: room.x0 + 1, z: st.zmid - 0.4 },
    ],
    ["fireplace"],
  );
}

export function roomRich(st: Stage): Sites {
  const W = 8.4;
  const room: Room = { x0: -W / 2, x1: W / 2, zb: st.zmid + 4, zf: -1.5, h: 3.6 };
  const walls = roomShell(st, room, { floor: "boards", ceiling: st.pal.night ? toneFill("dark", st.p) : PAPER });
  const [back, left, right] = walls;
  panelling(st, back, 1.1, "paper", [
    [0.9, 2.9],
    [W - 3.2, W - 1],
  ]);
  panelling(st, left, 1.1, "frames");
  panelling(st, right, 1.1, "frames");
  wallWindow(st, back, 1.2, 0.8, 1.4, 2.3, { curtains: true });
  wallFireplace(st, back, W - 3.1);
  rug(st, -2, 2, st.zmid - 0.2, room.zb - 1.2, "flowers");
  if (st.lod >= 1) chandelier(st, 0, room.h - 0.85, room.zb - 2.2, 0.75);
  if (st.lod >= 2) {
    table(st, room.x1 - 1.1, st.zmid + 0.2, 0.8, 0.8, 0.72, { cloth: true });
    chair(st, room.x0 + 1, room.zb - 1.8);
  }
  return sitesFor(
    room,
    walls,
    [
      ["left", 1, 2.4],
      ["right", 1.2, 2.2],
      ["back", 3.1, 1.6],
    ],
    [
      { x: room.x0 + 1.3, z: st.zmid + 0.5 },
      { x: room.x1 - 1.5, z: room.zb - 2 },
      { x: 0, z: room.zb - 1.2 },
    ],
    ["window", "fireplace"],
  );
}

export function garret(st: Stage): Sites {
  const W = 5.4;
  const room: Room = { x0: -W / 2, x1: W / 2, zb: st.zmid + 2.6, zf: -1.5, h: 3.1, knee: 1.0 };
  const walls = roomShell(st, room, { floor: "boards" });
  const [back] = walls;
  plasterCracks(st, back, 2);
  // small window high in the gable
  wallWindow(st, back, W / 2 - 0.35, 1.55, 0.7, 0.7, {});
  skylight(st, room);
  bed(st, room.x0 + 1.35, Math.min(room.zb - 0.6, st.zmid + 0.9), { poor: true });
  // crate as a table + candle + clutter
  furniture(st, [{ b: { a0: room.x1 - 1.3, a1: room.x1 - 0.5, y0: 0, y1: 0.6, d0: room.zb - 1.6, d1: room.zb - 1.0 }, fill: st.pal.wood }]);
  crateSlats(st, room.x1 - 1.3, room.x1 - 0.5, room.zb - 1.6);
  candleAt(st, room.x1 - 0.95, 0.6, room.zb - 1.35);
  if (st.lod >= 1) {
    const r = seeded(st.seed, st.env, "clutter");
    // stacked books
    let y = 0;
    const parts = [];
    for (let i = 0; i < 4; i += 1) {
      const w = between(r, 0.35, 0.5);
      const h = between(r, 0.06, 0.1);
      parts.push({ b: { a0: room.x1 - 0.45 - w / 2, a1: room.x1 - 0.45 + w / 2, y0: y, y1: y + h, d0: room.zb - 0.7, d1: room.zb - 0.42 }, fill: i % 2 ? PAPER : toneFill("dots", st.p) });
      y += h;
    }
    furniture(st, parts);
    // trunk
    furniture(st, [
      { b: { a0: room.x0 + 1.4, a1: room.x0 + 2.3, y0: 0, y1: 0.45, d0: room.zb - 0.6, d1: room.zb - 0.1 }, fill: toneFill("dots", st.p) },
      { b: { a0: room.x0 + 1.38, a1: room.x0 + 2.32, y0: 0.45, y1: 0.55, d0: room.zb - 0.62, d1: room.zb - 0.08 }, fill: st.pal.wood },
    ]);
  }
  return sitesFor(
    room,
    walls,
    [
      ["back", 0.9, 1.2],
      ["right", 0.4, 1.8],
      ["left", 2.4, 1.6],
    ],
    [
      { x: room.x1 - 1.2, z: st.zmid + 0.2 },
      { x: room.x0 + 1.1, z: st.zmid - 0.3 },
      { x: 0.3, z: room.zb - 0.8 },
    ],
    ["window", "bed", "table"],
  );
}

function crateSlats(st: Stage, x0: number, x1: number, z: number): void {
  let d = "";
  for (const y of [0.2, 0.4]) d += segD(st, { x: x0, y, z: z - 0.01 }, { x: x1, y, z: z - 0.01 });
  d += segD(st, { x: x0, y: 0, z: z - 0.01 }, { x: x1, y: 0.6, z: z - 0.01 });
  add(st, LAYER.stand, toCam(st.cam, { x: (x0 + x1) / 2, y: 0.3, z }).z - 0.01, pathEl(d, { stroke: st.pal.ink, w: wAt(st, z) * 0.5 }));
}

function skylight(st: Stage, r: Room): void {
  const xm = (r.x0 + r.x1) / 2;
  const kneeY = r.knee ?? r.h;
  const P = (s: number, z: number): V3 => ({ x: r.x1 + (xm - r.x1) * s, y: kneeY + (r.h - kneeY) * s, z });
  const z0 = r.zb - 2.5;
  const z1 = r.zb - 1.2;
  const glass = [P(0.28, z0), P(0.28, z1), P(0.72, z1), P(0.72, z0)];
  const frameQ = [P(0.22, z0 - 0.12), P(0.22, z1 + 0.12), P(0.78, z1 + 0.12), P(0.78, z0 - 0.12)];
  const lw = wAt(st, z1);
  let s = pathEl(polyD(st, frameQ), { fill: st.pal.wood, stroke: st.pal.ink, w: lw });
  const g = polyD(st, glass);
  s += pathEl(g, { fill: st.pal.night ? toneFill("black", st.p) : PAPER, stroke: st.pal.ink, w: lw });
  if (st.pal.night && g) {
    const c = project(st.cam, P(0.5, (z0 + z1) / 2));
    if (c) {
      let stars = "";
      for (let i = 0; i < 5; i += 1) {
        const sx = c.x + between(st.rand, -14, 14);
        const sy = c.y + between(st.rand, -10, 10);
        stars += `M${n(sx - 1)} ${n(sy)}a1 1 0 1 0 2 0a1 1 0 1 0 -2 0`;
      }
      s += pathEl(stars, { fill: PAPER });
    }
  }
  s += pathEl(segD(st, P(0.5, z0), P(0.5, z1)), { stroke: st.pal.ink, w: lw * 0.8 });
  // light beam down onto the floor
  if (!st.pal.night) {
    const beam = projectPoly(st.cam, [P(0.28, z0), P(0.72, z0), { x: xm - 0.6, y: 0, z: z0 + 0.4 }, { x: xm - 1.6, y: 0, z: z0 + 0.4 }]);
    const beam2 = projectPoly(st.cam, [P(0.28, z1), P(0.72, z1), { x: xm - 0.6, y: 0, z: z1 + 0.4 }, { x: xm - 1.6, y: 0, z: z1 + 0.4 }]);
    const all = [...beam, ...beam2];
    if (all.length > 4) {
      const hull = convexHull(all);
      s += pathEl(polyPath(hull), { fill: PAPER, opacity: 0.35 });
    }
  }
  add(st, LAYER.ground, -1.5, s);
}

function convexHull(pts: Point[]): Point[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Point[] = [];
  for (let i = p.length - 1; i >= 0; i -= 1) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function palaceHall(st: Stage): Sites {
  const W = 17;
  const zb = st.zmid + (st.shot === "establishing" ? 22 : 16);
  const room: Room = { x0: -W / 2, x1: W / 2, zb, zf: -2, h: 9 };
  const walls = roomShell(st, room, { floor: "checker", ceiling: toneFill("light", st.p) });
  const [back, left, right] = walls;
  // tall arched windows on the back wall
  for (const u of [1.6, W - 3.6]) wallWindow(st, back, u, 2.2, 2, 4.6, { arched: true, curtains: true });
  // throne dais with steps and a canopy
  drawSteps(st, -3, 3, zb - 4.2, 3, 0.2, 0.5);
  furniture(st, [
    { b: { a0: -0.8, a1: 0.8, y0: 0.6, y1: 1.1, d0: zb - 2.4, d1: zb - 1.7 }, fill: toneFill("gold", st.p) },
    { b: { a0: -0.8, a1: 0.8, y0: 1.1, y1: 3.3, d0: zb - 1.75, d1: zb - 1.55 }, fill: toneFill("gold", st.p) },
    { b: { a0: -0.95, a1: -0.8, y0: 0.6, y1: 1.6, d0: zb - 2.4, d1: zb - 1.6 }, fill: toneFill("gold", st.p) },
    { b: { a0: 0.8, a1: 0.95, y0: 0.6, y1: 1.6, d0: zb - 2.4, d1: zb - 1.6 }, fill: toneFill("gold", st.p) },
  ]);
  // drape behind the throne
  const m = back.map;
  const drape = [m(W / 2 - 2.2, 0.6), m(W / 2 + 2.2, 0.6), m(W / 2 + 1.6, 6.2), m(W / 2, 6.8), m(W / 2 - 1.6, 6.2)];
  const dq = drape.map((p) => project(st.cam, p)).filter((p): p is Point => !!p);
  if (dq.length === drape.length) {
    let folds = "";
    for (let i = 1; i < 6; i += 1) folds += segD(st, m(W / 2 - 2.2 + i * 0.73, 0.6), m(W / 2 - 1.6 + i * 0.53, 6.2));
    wallDecal(st, pathEl(polyPath(dq), { fill: toneFill("stripes", st.p), stroke: st.pal.ink, w: wAt(st, zb) }) + pathEl(folds, { stroke: st.pal.ink, w: wAt(st, zb) * 0.5 }));
  }
  // carpet runner
  const runner = projectPoly(st.cam, [
    { x: -1.3, y: 0.01, z: 0.2 },
    { x: 1.3, y: 0.01, z: 0.2 },
    { x: 1.3, y: 0.01, z: zb - 4.2 },
    { x: -1.3, y: 0.01, z: zb - 4.2 },
  ]);
  if (runner.length > 2) {
    const border = projectPoly(st.cam, [
      { x: -1.05, y: 0.01, z: 0.2 },
      { x: 1.05, y: 0.01, z: 0.2 },
      { x: 1.05, y: 0.01, z: zb - 4.3 },
      { x: -1.05, y: 0.01, z: zb - 4.3 },
    ]);
    add(st, LAYER.decal, zb, pathEl(polyPath(runner), { fill: toneFill("dark", st.p), stroke: st.pal.ink, w: st.lw * 0.8 }) + pathEl(polyPath(border), { stroke: PAPER, w: st.lw * 0.5 }));
  }
  // colonnades
  let colsL = "";
  const colH = 7.4;
  for (let z = zb - 3; z > Math.max(0.8, st.zmid - 6); z -= 4) {
    for (const x of [-5.4, 5.4]) {
      const svg = columnSvg(st, x, z, 0.55, colH, { base: 0.6 });
      add(st, LAYER.stand, toCam(st.cam, { x, y: 3, z }).z, svg);
    }
    // arcade arch between column tops along each side
    for (const x of [-5.4, 5.4]) colsL += segD(st, { x, y: colH, z }, { x, y: colH, z: z - 4 });
  }
  add(st, LAYER.ground, -1.8, pathEl(colsL, { stroke: st.pal.ink, w: st.lw * 0.6 }));
  if (st.lod >= 1) {
    chandelier(st, 0, 6.6, st.zmid + 2.5, 1.4);
    if (st.lod >= 2) chandelier(st, 0, 6.8, st.zmid + 9, 1.4);
  }
  void left;
  void right;
  return sitesFor(
    room,
    walls,
    [
      ["left", 3, 3],
      ["right", 3, 3],
      ["left", 8, 3],
    ],
    [
      { x: -3.4, z: st.zmid + 2 },
      { x: 3.4, z: st.zmid + 3 },
      { x: -3.4, z: zb - 6 },
      { x: 3.4, z: zb - 6 },
    ],
    ["window"],
  );
}

export function jailCell(st: Stage): Sites {
  const W = 4.6;
  const room: Room = { x0: -W / 2, x1: W / 2, zb: st.zmid + 2.4, zf: -1.5, h: 3 };
  const walls = roomShell(st, room, { floor: "flags", wall: toneFill("stone", st.p), sideWall: toneFill("dots", st.p), ceiling: toneFill("dark", st.p) });
  const [back, left, right] = walls;
  stoneBlocks(st, back);
  stoneBlocks(st, left);
  stoneBlocks(st, right);
  drawGround(st, "straw", { cap: room.zb, xMin: room.x0, xMax: room.x1, fill: "none" });
  wallWindow(st, back, W / 2 - 0.4, 2.1, 0.8, 0.55, { bars: true });
  // light shaft from the high window
  if (!st.pal.night) {
    const m = back.map;
    const shaft = projectPoly(st.cam, [m(W / 2 - 0.4, 2.1), m(W / 2 + 0.4, 2.1), { x: 0.9, y: 0, z: st.zmid + 0.2 }, { x: -0.5, y: 0, z: st.zmid + 0.2 }]);
    if (shaft.length > 2) add(st, LAYER.ground, -2.5, pathEl(polyPath(shaft), { fill: PAPER, opacity: 0.4 }));
  }
  barsRow(st, { x: room.x1 - 0.3, z: room.zb }, { x: room.x1 - 0.3, z: room.zf + 1.5 }, room.h);
  // plank bench bed on chains
  furniture(st, [{ b: { a0: room.x0, a1: room.x0 + 0.75, y0: 0.45, y1: 0.55, d0: room.zb - 2, d1: room.zb - 0.05 }, fill: st.pal.wood }]);
  const lm = left.map;
  let chains = segD(st, lm(0.1, 1.3), { x: room.x0 + 0.72, y: 0.55, z: room.zb - 0.1 }) + segD(st, lm(1.9, 1.3), { x: room.x0 + 0.72, y: 0.55, z: room.zb - 1.95 });
  // shackles on the back wall
  const bm = back.map;
  chains += segD(st, bm(0.7, 1.7), bm(0.6, 1.1)) + segD(st, bm(1.1, 1.7), bm(1.2, 1.1));
  add(st, LAYER.stand, toCam(st.cam, { x: room.x0 + 0.4, y: 1, z: room.zb - 1 }).z, pathEl(chains, { stroke: INK, w: st.lw * 0.9, join: "round" }));
  const s1 = project(st.cam, bm(0.6, 1.05));
  const s2 = project(st.cam, bm(1.2, 1.05));
  const k = scaleAt(st.cam, bm(0.9, 1));
  if (s1 && s2) wallDecal(st, `<circle cx="${n(s1.x)}" cy="${n(s1.y)}" r="${n(0.09 * k)}" fill="none" stroke="${INK}" stroke-width="${n(st.lw * 0.9)}"/><circle cx="${n(s2.x)}" cy="${n(s2.y)}" r="${n(0.09 * k)}" fill="none" stroke="${INK}" stroke-width="${n(st.lw * 0.9)}"/>`);
  return sitesFor(
    room,
    walls,
    [
      ["left", 0.2, 1.4],
      ["back", 0.2, 1.4],
    ],
    [
      { x: 0.8, z: room.zb - 0.9 },
      { x: room.x0 + 0.9, z: st.zmid - 0.6 },
    ],
    ["window", "bars", "bed"],
  );
}

export function courtroom(st: Stage): Sites {
  const W = 11;
  const room: Room = { x0: -W / 2, x1: W / 2, zb: st.zmid + 7, zf: -1.5, h: 4.6 };
  const walls = roomShell(st, room, { floor: "boards" });
  const [back, left, right] = walls;
  panelling(st, back, 1.6, "frames", [[W / 2 - 3.4, W / 2 + 3.4]]);
  panelling(st, left, 1.6, "frames");
  panelling(st, right, 1.6, "none");
  // high arched windows on the right wall
  for (const u of [1.2, 3.8]) wallWindow(st, right, u, 2.3, 1.2, 1.9, { arched: true });
  // crest above the bench
  const m = back.map;
  const c3 = m(W / 2, 3.5);
  const c = project(st.cam, c3);
  const k = scaleAt(st.cam, c3);
  const lw = wAt(st, room.zb);
  if (c) {
    let crest = `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(0.62 * k)}" fill="${toneFill("gold", st.p)}" stroke="${st.pal.ink}" stroke-width="${n(lw)}"/>`;
    crest += `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(0.45 * k)}" fill="${PAPER}" stroke="${st.pal.ink}" stroke-width="${n(lw * 0.6)}"/>`;
    // balance scales
    const bw = 0.32 * k;
    crest += pathEl(`M${n(c.x)} ${n(c.y - 0.3 * k)}V${n(c.y + 0.28 * k)}M${n(c.x - bw)} ${n(c.y - 0.18 * k)}H${n(c.x + bw)}M${n(c.x - bw)} ${n(c.y - 0.18 * k)}l${n(-0.1 * k)} ${n(0.22 * k)}h${n(0.2 * k)}ZM${n(c.x + bw)} ${n(c.y - 0.18 * k)}l${n(-0.1 * k)} ${n(0.22 * k)}h${n(0.2 * k)}Z`, { stroke: st.pal.ink, w: lw * 0.6 });
    wallDecal(st, crest);
  }
  // judge's platform, bench, and high chair
  const zb = room.zb;
  const wood = st.pal.wood === PAPER ? toneFill("dots", st.p) : st.pal.wood;
  furniture(st, [{ b: { a0: -3.2, a1: 3.2, y0: 0, y1: 0.55, d0: zb - 2.8, d1: zb }, fill: st.pal.wall }]);
  furniture(st, [{ b: { a0: -0.7, a1: 0.7, y0: 0.55, y1: 3.1, d0: zb - 0.55, d1: zb - 0.35 }, fill: wood }], toCam(st.cam, { x: 0, y: 1, z: zb - 0.55 }).z);
  furniture(st, [{ b: { a0: -2.8, a1: 2.8, y0: 0.55, y1: 1.85, d0: zb - 2.6, d1: zb - 1.5 }, fill: st.pal.wall, top: wood }]);
  // bench front panels
  let panels = "";
  for (let i = 0; i < 5; i += 1) {
    const x0 = -2.6 + i * 1.06;
    panels += polyD(st, [
      { x: x0, y: 0.75, z: zb - 2.61 },
      { x: x0 + 0.9, y: 0.75, z: zb - 2.61 },
      { x: x0 + 0.9, y: 1.65, z: zb - 2.61 },
      { x: x0, y: 1.65, z: zb - 2.61 },
    ]);
  }
  add(st, LAYER.stand, toCam(st.cam, { x: 0, y: 1, z: zb - 2.6 }).z - 0.01, pathEl(panels, { stroke: st.pal.ink, w: lw * 0.5 }));
  // witness box on the right
  furniture(st, [{ b: { a0: 2.8, a1: 4.2, y0: 0, y1: 1.2, d0: zb - 4.2, d1: zb - 3 }, fill: st.pal.wall, top: wood }]);
  // rail across the room
  railing(st, room.x0 + 0.2, -0.8, st.zmid + 1.8, 0.95);
  railing(st, 0.8, room.x1 - 0.2, st.zmid + 1.8, 0.95);
  // public benches in front of the rail are behind the camera; add a gallery bench at the back-left
  if (st.lod >= 2) furniture(st, [{ b: { a0: room.x0 + 0.2, a1: room.x0 + 2.4, y0: 0, y1: 0.45, d0: zb - 1.4, d1: zb - 0.9 }, fill: wood }]);
  return sitesFor(
    room,
    walls,
    [
      ["left", 1, 2.2],
      ["left", 4, 2.2],
    ],
    [
      { x: room.x0 + 1.3, z: st.zmid + 0.2 },
      { x: room.x1 - 1.3, z: st.zmid + 0.3 },
    ],
    ["fence"],
  );
}

export function study(st: Stage): Sites {
  const W = 6;
  const room: Room = { x0: -W / 2, x1: W / 2, zb: st.zmid + 3.2, zf: -1.5, h: 3 };
  const walls = roomShell(st, room, { floor: "boards", beams: true });
  const [back, left, right] = walls;
  bookshelfOnWall(st, back, 0.15, 2.6, 2.6);
  bookshelfOnWall(st, back, W - 2.75, 2.6, 2.6);
  bookshelfOnWall(st, left, 0.3, 2.8, 2.5);
  wallWindow(st, right, 1.1, 1, 1.2, 1.5, { curtains: true });
  rug(st, -1.8, 1.8, st.zmid - 0.5, room.zb - 0.8, "check");
  // desk with drawers, papers, books, candle
  const dx = 0.2;
  const dz = room.zb - 1.25;
  const wood = st.pal.wood;
  furniture(st, [
    { b: { a0: dx - 0.8, a1: dx - 0.3, y0: 0, y1: 0.72, d0: dz - 0.35, d1: dz + 0.35 }, fill: wood },
    { b: { a0: dx + 0.3, a1: dx + 0.8, y0: 0, y1: 0.72, d0: dz - 0.35, d1: dz + 0.35 }, fill: wood },
    { b: { a0: dx - 0.9, a1: dx + 0.9, y0: 0.72, y1: 0.78, d0: dz - 0.4, d1: dz + 0.4 }, fill: wood, top: st.pal.wall },
  ]);
  furniture(st, [
    { b: { a0: dx + 0.35, a1: dx + 0.75, y0: 0.78, y1: 0.86, d0: dz - 0.2, d1: dz + 0.1 }, fill: toneFill("dots", st.p) },
    { b: { a0: dx + 0.38, a1: dx + 0.72, y0: 0.86, y1: 0.93, d0: dz - 0.18, d1: dz + 0.08 }, fill: PAPER },
  ], toCam(st.cam, { x: dx, y: 0.8, z: dz - 0.4 }).z - 0.02);
  candleAt(st, dx - 0.6, 0.78, dz - 0.1);
  chair(st, dx, dz + 0.65, true);
  // papers
  const paper = projectPoly(st.cam, [
    { x: dx - 0.3, y: 0.785, z: dz - 0.25 },
    { x: dx + 0.1, y: 0.785, z: dz - 0.3 },
    { x: dx + 0.15, y: 0.785, z: dz },
    { x: dx - 0.25, y: 0.785, z: dz + 0.05 },
  ]);
  if (paper.length > 2) add(st, LAYER.stand, toCam(st.cam, { x: dx, y: 0.8, z: dz - 0.4 }).z - 0.03, pathEl(polyPath(paper), { fill: PAPER, stroke: st.pal.ink, w: st.lw * 0.5 }));
  void right;
  return sitesFor(
    room,
    walls,
    [
      ["right", 2.6, 1.2],
      ["left", 3.2, 1.6],
    ],
    [
      { x: room.x1 - 1, z: st.zmid + 0.3 },
      { x: room.x0 + 1.2, z: st.zmid - 0.2 },
    ],
    ["bookshelf", "window", "table"],
  );
}

export function classroom(st: Stage): Sites {
  const W = 9;
  const room: Room = { x0: -W / 2, x1: W / 2, zb: st.zmid + 6, zf: -1.5, h: 3.4 };
  const walls = roomShell(st, room, { floor: "boards" });
  const [back, left, right] = walls;
  for (const u of [0.8, 2.8, 4.8]) wallWindow(st, right, u, 0.9, 1.3, 1.9, {});
  // blackboard with chalk marks (no text)
  const m = back.map;
  const lw = wAt(st, room.zb);
  let s = pathEl(polyD(st, [m(2.3, 0.85), m(6.7, 0.85), m(6.7, 2.3), m(2.3, 2.3)]), { fill: toneFill("dark", st.p), stroke: st.pal.ink, w: lw * 1.4 });
  s += pathEl(polyD(st, [m(2.2, 0.78), m(6.8, 0.78), m(6.8, 0.86), m(2.2, 0.86)]), { fill: st.pal.wood, stroke: st.pal.ink, w: lw * 0.7 });
  let chalk = "";
  const pts = (u0: number, y0: number, len: number): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i <= 8; i += 1) {
      const p = project(st.cam, m(u0 + (len * i) / 8, y0 + Math.sin(i * 1.7) * 0.05));
      if (p) out.push(p);
    }
    return out;
  };
  for (const [u0, y0, len] of [
    [2.6, 2.0, 1.8],
    [2.6, 1.75, 1.3],
    [2.6, 1.5, 1.6],
    [4.9, 1.95, 1.2],
  ] as const) {
    const q = pts(u0, y0, len);
    if (q.length > 2) chalk += smoothPath(q, false);
  }
  const circ = project(st.cam, m(5.7, 1.35));
  const kk = scaleAt(st.cam, m(5.7, 1.35));
  if (circ) chalk += `M${n(circ.x - 0.3 * kk)} ${n(circ.y)}a${n(0.3 * kk)} ${n(0.3 * kk)} 0 1 0 ${n(0.6 * kk)} 0a${n(0.3 * kk)} ${n(0.3 * kk)} 0 1 0 ${n(-0.6 * kk)} 0`;
  s += pathEl(chalk, { stroke: PAPER, w: lw * 0.7 });
  // wall clock above the board
  const cl = project(st.cam, m(4.5, 2.8));
  if (cl) {
    const r = 0.25 * scaleAt(st.cam, m(4.5, 2.8));
    s += `<circle cx="${n(cl.x)}" cy="${n(cl.y)}" r="${n(r)}" fill="${PAPER}" stroke="${st.pal.ink}" stroke-width="${n(lw)}"/>`;
    s += pathEl(`M${n(cl.x)} ${n(cl.y)}l0 ${n(-r * 0.7)}M${n(cl.x)} ${n(cl.y)}l${n(r * 0.5)} ${n(r * 0.1)}`, { stroke: INK, w: lw * 0.7 });
  }
  // pinned map
  s += pathEl(polyD(st, [m(0.5, 1.2), m(1.8, 1.2), m(1.8, 2.2), m(0.5, 2.2)]), { fill: PAPER, stroke: st.pal.ink, w: lw * 0.7 });
  const mp = [m(0.7, 1.4), m(1.0, 1.9), m(1.3, 1.7), m(1.6, 2.0), m(1.5, 1.4), m(1.0, 1.35)].map((p) => project(st.cam, p)).filter((p): p is Point => !!p);
  if (mp.length > 3) s += pathEl(smoothPath(mp, true), { fill: toneFill("dots", st.p), stroke: st.pal.ink, w: lw * 0.4 });
  wallDecal(st, s);
  // teacher's desk
  table(st, 0.8, room.zb - 1.6, 1.6, 0.8, 0.78);
  // pupils' desks in rows (left and right of the aisle)
  if (st.lod >= 1) {
    for (let row = 0; row < 3; row += 1) {
      const z = st.zmid + 0.4 + row * 1.5;
      for (const x of [-3.3, -1.9, 1.9, 3.3]) schoolDesk(st, x, z);
    }
  }
  void left;
  return sitesFor(
    room,
    walls,
    [
      ["left", 0.8, 2],
      ["back", 7.2, 1.6],
      ["left", 3.4, 2],
    ],
    [
      { x: room.x0 + 0.8, z: room.zb - 1 },
      { x: room.x1 - 0.8, z: room.zb - 1 },
    ],
    ["window", "table"],
  );
}

function schoolDesk(st: Stage, x: number, z: number): void {
  const wood = st.pal.wood;
  const f = st.pal.night ? toneFill("dark", st.p) : PAPER;
  furniture(st, [
    { b: { a0: x - 0.5, a1: x - 0.44, y0: 0, y1: 0.7, d0: z - 0.2, d1: z + 0.2 }, fill: wood },
    { b: { a0: x + 0.44, a1: x + 0.5, y0: 0, y1: 0.7, d0: z - 0.2, d1: z + 0.2 }, fill: wood },
    { b: { a0: x - 0.55, a1: x + 0.55, y0: 0.7, y1: 0.76, d0: z - 0.25, d1: z + 0.25 }, fill: wood, top: f },
    { b: { a0: x - 0.5, a1: x + 0.5, y0: 0.35, y1: 0.4, d0: z + 0.45, d1: z + 0.7 }, fill: wood },
    { b: { a0: x - 0.5, a1: x + 0.5, y0: 0.4, y1: 0.8, d0: z + 0.68, d1: z + 0.72 }, fill: wood },
  ]);
}

export { boxSvg, frame, place, wallDoor };
