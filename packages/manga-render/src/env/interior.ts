/** Interior kit: a perspective room shell, wall treatments and furniture. */
import type { Point } from "../contracts.js";
import { INK, PAPER, toneFill } from "../style.js";
import { n, polyPath, smoothPath } from "../svg.js";
import { between } from "../prng.js";
import { project, projectPoly, scaleAt, toCam, type V3 } from "./camera.js";
import { LAYER, add, pathEl, place, polyD, segD, visible, wAt, type Stage } from "./stage.js";
import { archPoints, boxSvg, frame, type LocalBox } from "./architecture.js";
import { drawGround, type GroundKind } from "./ground.js";
import { cloudD } from "./sky.js";

export interface Room {
  x0: number;
  x1: number;
  /** Back wall depth. */
  zb: number;
  /** Front (behind the camera). */
  zf: number;
  h: number;
  /** Garret: side knee-wall height; ceiling slopes to the ridge at h. */
  knee?: number;
}

export interface Wall {
  name: "back" | "left" | "right";
  map: (u: number, y: number) => V3;
  len: number;
  /** Height at u (garret back wall is a gable). */
  top: (u: number) => number;
  normal: V3;
  /** Where decorations on this wall are painted (default: just above the room shell). */
  decal?: { layer: number; z: number };
}

export function roomWalls(r: Room): Wall[] {
  const W = r.x1 - r.x0;
  const knee = r.knee;
  const backTop = (u: number): number => (knee === undefined ? r.h : knee + (r.h - knee) * (1 - Math.abs(u / W - 0.5) * 2));
  return [
    { name: "back", map: (u, y) => ({ x: r.x0 + u, y, z: r.zb }), len: W, top: backTop, normal: { x: 0, y: 0, z: -1 } },
    { name: "left", map: (u, y) => ({ x: r.x0, y, z: r.zb - u }), len: r.zb - r.zf, top: () => knee ?? r.h, normal: { x: 1, y: 0, z: 0 } },
    { name: "right", map: (u, y) => ({ x: r.x1, y, z: r.zb - u }), len: r.zb - r.zf, top: () => knee ?? r.h, normal: { x: -1, y: 0, z: 0 } },
  ];
}

export interface ShellOptions {
  floor: GroundKind;
  wall?: string;
  sideWall?: string;
  ceiling?: string;
  beams?: boolean;
}

/** Floor, walls and ceiling. Walls go in the ground layer just above the floor. */
export function roomShell(st: Stage, r: Room, o: ShellOptions): Wall[] {
  drawGround(st, o.floor, { cap: r.zb, xMin: r.x0, xMax: r.x1 });
  const walls = roomWalls(r);
  const lw = wAt(st, r.zb);
  let s = "";
  const wallFill = o.wall ?? st.pal.wall;
  // ceiling
  const ceil = o.ceiling ?? (st.pal.night ? toneFill("dark", st.p) : PAPER);
  const above = st.cam.h >= r.h - 0.05;
  if (above) {
    // cutaway from above: no ceiling
  } else if (r.knee === undefined) {
    const d = polyD(st, [
      { x: r.x0, y: r.h, z: r.zf },
      { x: r.x1, y: r.h, z: r.zf },
      { x: r.x1, y: r.h, z: r.zb },
      { x: r.x0, y: r.h, z: r.zb },
    ]);
    if (d) s += pathEl(d, { fill: ceil, stroke: st.pal.ink, w: lw });
    if (o.beams && d) {
      let bd = "";
      for (let z = r.zb - 0.9; z > r.zf; z -= 1.2) {
        const a = { x: r.x0, y: r.h, z };
        const b = { x: r.x1, y: r.h, z };
        const a2 = { x: r.x0, y: r.h, z: z - 0.25 };
        const b2 = { x: r.x1, y: r.h, z: z - 0.25 };
        const q = polyD(st, [a, b, b2, a2]);
        if (q) bd += q;
      }
      s += pathEl(bd, { fill: st.pal.wood, stroke: st.pal.ink, w: lw * 0.7 });
    }
  } else {
    // garret: two sloped ceiling planes meeting at the ridge (x mid)
    const xm = (r.x0 + r.x1) / 2;
    for (const side of [r.x0, r.x1]) {
      const q: V3[] = [
        { x: side, y: r.knee, z: r.zf },
        { x: side, y: r.knee, z: r.zb },
        { x: xm, y: r.h, z: r.zb },
        { x: xm, y: r.h, z: r.zf },
      ];
      const d = polyD(st, q);
      if (d) s += pathEl(d, { fill: side === r.x1 ? st.pal.shade : ceil, stroke: st.pal.ink, w: lw });
    }
  }
  for (const wall of walls) {
    const pts: V3[] = [wall.map(0, 0), wall.map(wall.len, 0)];
    if (wall.name === "back" && r.knee !== undefined) {
      pts.push(wall.map(wall.len, r.knee), wall.map(wall.len / 2, r.h), wall.map(0, r.knee));
    } else {
      pts.push(wall.map(wall.len, wall.top(wall.len)), wall.map(0, wall.top(0)));
    }
    const d = polyD(st, pts);
    if (!d) continue;
    const fill = wall.name === "back" ? wallFill : wall.name === "left" ? (o.sideWall ?? st.pal.shade) : wallFill;
    s += pathEl(d, { fill, stroke: st.pal.ink, w: lw });
  }
  // garret rafters: beams across the slopes
  if (r.knee !== undefined && !above) {
    const xm = (r.x0 + r.x1) / 2;
    let beams = "";
    for (let z = r.zb - 0.05; z > r.zf + 0.3; z -= 1.3) {
      for (const side of [r.x0, r.x1]) {
        const q = polyD(st, [
          { x: side, y: r.knee, z },
          { x: xm, y: r.h, z },
          { x: xm, y: r.h, z: z - 0.28 },
          { x: side, y: r.knee, z: z - 0.28 },
        ]);
        if (q) beams += q;
      }
    }
    // ridge beam + collar tie across the back
    const ridge = polyD(st, [
      { x: xm - 0.18, y: r.h, z: r.zf },
      { x: xm + 0.18, y: r.h, z: r.zf },
      { x: xm + 0.18, y: r.h - 0.25, z: r.zb },
      { x: xm - 0.18, y: r.h - 0.25, z: r.zb },
    ]);
    const tieY = r.knee + (r.h - r.knee) * 0.55;
    const halfSpan = ((r.x1 - r.x0) / 2) * (1 - 0.55);
    const tie = polyD(st, [
      { x: xm - halfSpan, y: tieY, z: r.zb - 0.4 },
      { x: xm + halfSpan, y: tieY, z: r.zb - 0.4 },
      { x: xm + halfSpan, y: tieY - 0.22, z: r.zb - 0.4 },
      { x: xm - halfSpan, y: tieY - 0.22, z: r.zb - 0.4 },
    ]);
    s += pathEl(beams + ridge, { fill: toneFill("dots", st.p), stroke: st.pal.ink, w: lw * 0.8 });
    s += pathEl(tie, { fill: st.pal.night ? toneFill("dark", st.p) : PAPER, stroke: st.pal.ink, w: lw * 0.8 });
  }
  add(st, LAYER.ground, -1, s);
  return walls;
}

/** Add wall-decoration svg (drawn just after the shell). */
export function wallDecal(st: Stage, svg: string, wall?: Wall): void {
  if (wall?.decal) add(st, wall.decal.layer, wall.decal.z, svg);
  else add(st, LAYER.ground, -2, svg);
}

export function plasterCracks(st: Stage, wall: Wall, count: number): void {
  let d = "";
  let bricks = "";
  const lw = wAt(st, toCam(st.cam, wall.map(wall.len / 2, 1.5)).z);
  const maxU = wall.name === "back" ? 0.9 : 0.45;
  for (let i = 0; i < count; i += 1) {
    let u = between(st.rand, 0.1, maxU) * wall.len;
    let y = between(st.rand, 0.8, wall.top(u) - 0.2);
    const pts: V3[] = [wall.map(u, y)];
    for (let j = 0; j < 5; j += 1) {
      u += between(st.rand, -0.25, 0.25);
      y -= between(st.rand, 0.1, 0.3);
      pts.push(wall.map(u, y));
    }
    const q = pts.map((p) => project(st.cam, p)).filter((p): p is Point => !!p);
    if (q.length > 1) d += polyPath(q, false);
    // exposed brick patch
    if (i % 2 === 0) {
      const bu = between(st.rand, 0.1, maxU * 0.85) * wall.len;
      const by = between(st.rand, 0.4, Math.max(0.5, wall.top(bu) - 1.2));
      for (let row = 0; row < 4; row += 1) {
        const yy = by + row * 0.18;
        const shift = row % 2 ? 0.14 : 0;
        const cols = 3 - Math.abs(row - 1.5) * 0.9;
        for (let c = 0; c < cols; c += 1) {
          const u0 = bu + shift + c * 0.28;
          const q2 = polyD(st, [wall.map(u0, yy), wall.map(u0 + 0.24, yy), wall.map(u0 + 0.24, yy + 0.14), wall.map(u0, yy + 0.14)]);
          if (q2) bricks += q2;
        }
      }
    }
  }
  wallDecal(st, pathEl(d, { stroke: st.pal.ink, w: lw * 0.55 }) + pathEl(bricks, { fill: "none", stroke: st.pal.ink, w: lw * 0.45 }), wall);
}

/** Wainscot panels up to `h` plus framed upper panels. */
export function panelling(st: Stage, wall: Wall, h: number, upper: "frames" | "paper" | "none", skip: [number, number][] = []): void {
  const lw = wAt(st, toCam(st.cam, wall.map(wall.len / 2, 1.5)).z);
  let d = "";
  let paper = "";
  const panelW = 0.9;
  const free = (u0: number, u1: number): boolean => !skip.some(([a, b]) => u1 > a && u0 < b);
  d += segD(st, wall.map(0, h), wall.map(wall.len, h));
  d += segD(st, wall.map(0, h - 0.08), wall.map(wall.len, h - 0.08));
  d += segD(st, wall.map(0, 0.15), wall.map(wall.len, 0.15));
  for (let u = 0.1; u + panelW <= wall.len; u += panelW + 0.1) {
    if (!free(u, u + panelW)) continue;
    const q = polyD(st, [wall.map(u, 0.3), wall.map(u + panelW, 0.3), wall.map(u + panelW, h - 0.2), wall.map(u, h - 0.2)]);
    if (q) d += q;
  }
  if (upper === "frames") {
    const top = Math.min(wall.top(0), wall.top(wall.len)) - 0.35;
    for (let u = 0.15; u + panelW * 1.3 <= wall.len; u += panelW * 1.3 + 0.2) {
      if (!free(u, u + panelW * 1.3)) continue;
      const q = polyD(st, [wall.map(u, h + 0.3), wall.map(u + panelW * 1.3, h + 0.3), wall.map(u + panelW * 1.3, top), wall.map(u, top)]);
      if (q) d += q;
    }
    d += segD(st, wall.map(0, top + 0.15), wall.map(wall.len, top + 0.15));
  } else if (upper === "paper") {
    const q = polyD(st, [wall.map(0, h), wall.map(wall.len, h), wall.map(wall.len, wall.top(wall.len) - 0.3), wall.map(0, wall.top(0) - 0.3)]);
    if (q) paper = q;
    d += segD(st, wall.map(0, wall.top(0) - 0.3), wall.map(wall.len, wall.top(wall.len) - 0.3));
  }
  wallDecal(st, pathEl(paper, { fill: toneFill("flowers", st.p), opacity: 0.55 }) + pathEl(d, { stroke: st.pal.ink, w: lw * 0.55 }), wall);
}

/** Irregular stone block courses (jail, church, cellars). */
export function stoneBlocks(st: Stage, wall: Wall, courseH = 0.42): void {
  const lw = wAt(st, toCam(st.cam, wall.map(wall.len / 2, 1.5)).z);
  let d = "";
  let shade = "";
  const top = Math.max(wall.top(0), wall.top(wall.len));
  const spanAt = (y: number): [number, number] | null => {
    let a = -1;
    let b = -1;
    for (let i = 0; i <= 40; i += 1) {
      const u = (i / 40) * wall.len;
      if (wall.top(u) >= y) {
        if (a < 0) a = u;
        b = u;
      }
    }
    return a < 0 ? null : [a, b];
  };
  for (let y = 0; y < top; y += courseH) {
    const L = wall.len;
    const sp = spanAt(y);
    if (!sp) break;
    d += segD(st, wall.map(sp[0], y), wall.map(sp[1], y));
    let u = (y / courseH) % 2 ? -0.3 : 0;
    while (u < L) {
      const w = between(st.rand, 0.55, 0.95);
      u += w;
      if (u > 0 && u < L) d += segD(st, wall.map(u, y), wall.map(u, Math.min(wall.top(u), y + courseH)));
      const yTop = Math.min(top, wall.top(u), y + courseH) - 0.04;
      if (st.rand() < 0.14 && u - w * 0.6 > 0 && u < L && yTop > y + 0.1) {
        const q = polyD(st, [wall.map(u - w + 0.04, y + 0.04), wall.map(u - 0.04, y + 0.04), wall.map(u - 0.04, yTop), wall.map(u - w + 0.04, yTop)]);
        if (q) shade += q;
      }
    }
  }
  wallDecal(st, pathEl(shade, { fill: toneFill("dots", st.p) }) + pathEl(d, { stroke: st.pal.ink, w: lw * 0.55 }), wall);
}

/** Window in a wall: frame, glass that shows the sky, muntins, sill, optional curtains. */
export function wallWindow(st: Stage, wall: Wall, u: number, y: number, w: number, h: number, opts: { curtains?: boolean; bars?: boolean; arched?: boolean; light?: boolean } = {}): void {
  const lw = wAt(st, toCam(st.cam, wall.map(u, y)).z);
  const m = wall.map;
  const glassPts = opts.arched ? archPoints(m, u, u + w, y, y + h - w / 2, false) : [m(u, y), m(u + w, y), m(u + w, y + h), m(u, y + h)];
  const q = polyD(st, glassPts);
  if (!q) return;
  const night = st.pal.night;
  let s = "";
  // frame (reveal)
  const frameD = polyD(st, [m(u - 0.12, y - 0.1), m(u + w + 0.12, y - 0.1), m(u + w + 0.12, y + h + 0.12), m(u - 0.12, y + h + 0.12)]);
  if (!opts.arched) s += pathEl(frameD, { fill: st.pal.wall, stroke: st.pal.ink, w: lw });
  s += pathEl(q, { fill: night ? toneFill("black", st.p) : PAPER, stroke: st.pal.ink, w: lw });
  // view through the glass: night stars / day cloud curl
  const c = project(st.cam, m(u + w * 0.5, y + h * 0.6));
  const k = scaleAt(st.cam, m(u + w * 0.5, y + h * 0.6));
  if (c && k * w > 20) {
    if (night) {
      let d = "";
      for (let i = 0; i < 6; i += 1) {
        const sx = c.x + between(st.rand, -0.4, 0.4) * w * k;
        const sy = c.y + between(st.rand, -0.45, 0.2) * h * k;
        const r = between(st.rand, 0.6, 1.4);
        d += `M${n(sx - r)} ${n(sy)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0`;
      }
      s += pathEl(d, { fill: PAPER });
    } else {
      s += pathEl(cloudD(c.x + w * k * 0.1, c.y - h * k * 0.15, w * k * 0.55, h * k * 0.14, st.rand), { stroke: st.pal.ink, w: lw * 0.5 });
    }
  }
  // muntins
  let mu = "";
  mu += segD(st, m(u + w / 2, y), m(u + w / 2, y + h * (opts.arched ? 0.9 : 1)));
  mu += segD(st, m(u, y + h * 0.5), m(u + w, y + h * 0.5));
  if (opts.bars) {
    for (let i = 1; i < 4; i += 1) mu += segD(st, m(u + (w * i) / 4, y), m(u + (w * i) / 4, y + h));
    s += pathEl(mu, { stroke: st.pal.ink, w: lw * 1.6 });
  } else s += pathEl(mu, { stroke: st.pal.ink, w: lw * 0.8 });
  // sill
  s += pathEl(polyD(st, [m(u - 0.18, y - 0.1), m(u + w + 0.18, y - 0.1), m(u + w + 0.18, y - 0.02), m(u - 0.18, y - 0.02)]), { fill: st.pal.wall, stroke: st.pal.ink, w: lw * 0.8 });
  if (opts.curtains) {
    for (const side of [0, 1]) {
      const ux = side === 0 ? u - 0.35 : u + w + 0.35;
      const inner = side === 0 ? u + w * 0.18 : u + w * 0.82;
      const top = y + h + 0.3;
      const tie = y + h * 0.35;
      const pts = [m(ux, top), m(inner, top), m((inner + ux) / 2 + (side ? 0.05 : -0.05), tie + 0.2), m(ux + (side ? -0.05 : 0.05), tie), m((ux + inner) / 2, y - 0.3), m(ux, y - 0.35)];
      const qq = pts.map((p) => project(st.cam, p)).filter((p): p is Point => !!p);
      if (qq.length === pts.length) {
        s += pathEl(smoothPath(qq, true, 0.35), { fill: toneFill("stripes", st.p), stroke: st.pal.ink, w: lw });
        let folds = "";
        for (let f = 1; f < 3; f += 1) {
          const t = f / 3;
          const a = project(st.cam, m(ux + (inner - ux) * t * 0.6, top));
          const b = project(st.cam, m(ux + (inner - ux) * t * 0.3, y - 0.3));
          if (a && b) folds += `M${n(a.x)} ${n(a.y)}Q${n((a.x + b.x) / 2 + 2)} ${n((a.y + b.y) / 2)} ${n(b.x)} ${n(b.y)}`;
        }
        s += pathEl(folds, { stroke: st.pal.ink, w: lw * 0.6 });
      }
    }
    // rod
    s += pathEl(segD(st, m(u - 0.5, y + h + 0.32), m(u + w + 0.5, y + h + 0.32)), { stroke: st.pal.ink, w: lw * 1.8 });
  }
  wallDecal(st, s, wall);
  if (opts.light && !night) {
    // shaft of light falling onto the floor
    const floorPts: V3[] = [
      { x: m(u, y).x, y: 0, z: m(u, y).z },
      { x: m(u + w, y).x, y: 0, z: m(u + w, y).z },
    ];
    void floorPts;
  }
}

export function wallDoor(st: Stage, wall: Wall, u: number, w = 1.0, h = 2.1, opts: { arched?: boolean; open?: boolean; heavy?: boolean } = {}): void {
  const m = wall.map;
  const lw = wAt(st, toCam(st.cam, m(u, 1)).z);
  const pts = opts.arched ? archPoints(m, u, u + w, 0, h - w / 2, false) : [m(u, 0), m(u + w, 0), m(u + w, h), m(u, h)];
  const frame = opts.arched ? archPoints(m, u - 0.12, u + w + 0.12, 0, h - w / 2, false) : [m(u - 0.12, 0), m(u + w + 0.12, 0), m(u + w + 0.12, h + 0.12), m(u - 0.12, h + 0.12)];
  let s = pathEl(polyD(st, frame), { fill: st.pal.wall, stroke: st.pal.ink, w: lw });
  const q = polyD(st, pts);
  if (!q) return;
  if (opts.open) {
    s += pathEl(q, { fill: toneFill("black", st.p), stroke: st.pal.ink, w: lw });
  } else {
    s += pathEl(q, { fill: opts.heavy ? toneFill("dots", st.p) : st.pal.wood, stroke: st.pal.ink, w: lw });
    let d = "";
    if (opts.heavy) {
      for (let i = 1; i < 5; i += 1) d += segD(st, m(u + (w * i) / 5, 0), m(u + (w * i) / 5, h));
      d += segD(st, m(u, h * 0.3), m(u + w, h * 0.3)) + segD(st, m(u, h * 0.7), m(u + w, h * 0.7));
    } else {
      d += polyD(st, [m(u + 0.12, 0.2), m(u + w - 0.12, 0.2), m(u + w - 0.12, h * 0.45), m(u + 0.12, h * 0.45)]);
      d += polyD(st, [m(u + 0.12, h * 0.52), m(u + w - 0.12, h * 0.52), m(u + w - 0.12, h - 0.15), m(u + 0.12, h - 0.15)]);
    }
    s += pathEl(d, { stroke: st.pal.ink, w: lw * 0.55 });
    const knob = project(st.cam, m(u + w * 0.82, h * 0.48));
    const k = scaleAt(st.cam, m(u + w * 0.82, h * 0.48));
    if (knob && k * 0.05 > 1) s += `<circle cx="${n(knob.x)}" cy="${n(knob.y)}" r="${n(k * 0.05)}" fill="${INK}"/>`;
  }
  wallDecal(st, s, wall);
}

export function wallFireplace(st: Stage, wall: Wall, u: number, lit = true): void {
  const m = wall.map;
  const lw = wAt(st, toCam(st.cam, m(u, 1)).z);
  const W = 1.8;
  let s = "";
  // chimney breast
  s += pathEl(polyD(st, [m(u - 0.2, 0), m(u + W + 0.2, 0), m(u + W + 0.2, wall.top(u + W / 2) - 0.02), m(u - 0.2, wall.top(u + W / 2) - 0.02)]), {
    fill: st.pal.wall,
    stroke: st.pal.ink,
    w: lw,
  });
  // surround with bricks look
  s += pathEl(polyD(st, [m(u, 0), m(u + W, 0), m(u + W, 1.25), m(u, 1.25)]), { fill: toneFill("stone", st.p), stroke: st.pal.ink, w: lw });
  const opening = archPoints(m, u + 0.3, u + W - 0.3, 0, 0.75, false);
  s += pathEl(polyD(st, opening), { fill: INK, stroke: st.pal.ink, w: lw });
  // mantel shelf
  s += pathEl(polyD(st, [m(u - 0.15, 1.25), m(u + W + 0.15, 1.25), m(u + W + 0.15, 1.38), m(u - 0.15, 1.38)]), { fill: st.pal.wall, stroke: st.pal.ink, w: lw });
  // fire
  if (lit) {
    const base = project(st.cam, m(u + W / 2, 0.05));
    const k = scaleAt(st.cam, m(u + W / 2, 0.05));
    if (base && k > 8) {
      let f = "";
      const tongues = 5;
      for (let i = 0; i < tongues; i += 1) {
        const cx = base.x + (i - (tongues - 1) / 2) * 0.18 * k;
        const hgt = (0.35 + (1 - Math.abs(i - 2) / 2.5) * 0.35) * k;
        const w = 0.12 * k;
        f += `M${n(cx - w)} ${n(base.y)}Q${n(cx - w * 1.2)} ${n(base.y - hgt * 0.5)} ${n(cx + w * 0.3)} ${n(base.y - hgt)}Q${n(cx)} ${n(base.y - hgt * 0.45)} ${n(cx + w)} ${n(base.y)}Z`;
      }
      s += pathEl(f, { fill: PAPER, stroke: INK, w: lw * 0.5 });
      s += pathEl(`M${n(base.x - 0.45 * k)} ${n(base.y)}l${n(0.9 * k)} ${n(-0.08 * k)}M${n(base.x - 0.4 * k)} ${n(base.y - 0.08 * k)}l${n(0.8 * k)} ${n(0.08 * k)}`, { stroke: PAPER, w: 0.08 * k });
    }
  }
  wallDecal(st, s, wall);
  st.anchors.fireplace = project(st.cam, m(u + W / 2, 0.4)) ?? st.anchors.fireplace;
}

/** Bookshelf against a wall (a local-frame box whose front faces into the room). */
export function bookshelfOnWall(st: Stage, wall: Wall, u: number, w: number, h: number): void {
  const m = wall.map;
  const lw = wAt(st, toCam(st.cam, m(u + w / 2, 1)).z);
  const D = 0.35;
  const off = (p: V3): V3 => ({ x: p.x + wall.normal.x * D, y: p.y, z: p.z + wall.normal.z * D });
  const front = [off(m(u, 0)), off(m(u + w, 0)), off(m(u + w, h)), off(m(u, h))];
  let s = "";
  // carcass sides/top as thin prisms: draw back panel then the front frame
  const sideA = [m(u, 0), off(m(u, 0)), off(m(u, h)), m(u, h)];
  const sideB = [m(u + w, 0), off(m(u + w, 0)), off(m(u + w, h)), m(u + w, h)];
  const top = [m(u, h), m(u + w, h), off(m(u + w, h)), off(m(u, h))];
  s += pathEl(polyD(st, sideA) + polyD(st, sideB), { fill: st.pal.shade, stroke: st.pal.ink, w: lw });
  s += pathEl(polyD(st, top), { fill: st.pal.wall, stroke: st.pal.ink, w: lw });
  s += pathEl(polyD(st, front), { fill: toneFill("dark", st.p), stroke: st.pal.ink, w: lw });
  const shelves = Math.max(3, Math.round(h / 0.42));
  let books = "";
  let booksDark = "";
  let lines = "";
  for (let i = 0; i < shelves; i += 1) {
    const y0 = (i * h) / shelves + 0.05;
    const y1 = ((i + 1) * h) / shelves - 0.03;
    lines += polyD(st, [off(m(u, y1 - 0.0)), off(m(u + w, y1)), off(m(u + w, y1 + 0.04)), off(m(u, y1 + 0.04))]);
    let x = u + 0.04;
    while (x < u + w - 0.08) {
      const bw = between(st.rand, 0.04, 0.09);
      const bh = (y1 - y0) * between(st.rand, 0.7, 0.95);
      if (x + bw > u + w - 0.04) break;
      const lean = st.rand() < 0.08 ? 0.05 : 0;
      const q = polyD(st, [off(m(x, y0)), off(m(x + bw, y0)), off(m(x + bw + lean, y0 + bh)), off(m(x + lean, y0 + bh))]);
      if (q) {
        if (st.rand() < 0.3) booksDark += q;
        else books += q;
      }
      x += bw + (st.rand() < 0.1 ? 0.08 : 0.004);
    }
  }
  s += pathEl(books, { fill: PAPER, stroke: st.pal.ink, w: lw * 0.4 });
  s += pathEl(booksDark, { fill: toneFill("dots", st.p), stroke: st.pal.ink, w: lw * 0.4 });
  s += pathEl(lines, { fill: st.pal.wall, stroke: st.pal.ink, w: lw * 0.6 });
  add(st, LAYER.stand, toCam(st.cam, off(m(u + w / 2, 1))).z, s);
}

/** Generic furniture: an assembly of axis-aligned boxes at world coordinates. */
export function furniture(st: Stage, parts: { b: LocalBox; fill?: string; top?: string }[], sortZ?: number): void {
  const fr = frame("front", 0, 0);
  let s = "";
  let zs = 0;
  let cnt = 0;
  for (const p of parts) {
    const c = toCam(st.cam, { x: (p.b.a0 + p.b.a1) / 2, y: (p.b.y0 + p.b.y1) / 2, z: p.b.d0 });
    zs += c.z;
    cnt += 1;
  }
  const z = sortZ ?? zs / Math.max(1, cnt);
  if (z < st.cam.near) return;
  const lw = wAt(st, z);
  for (const p of parts) s += boxSvg(st, fr, p.b, p.fill ?? st.pal.wall, lw, p.top);
  add(st, LAYER.stand, z, s);
}

export function bed(st: Stage, x0: number, zHead: number, opts: { rich?: boolean; poor?: boolean } = {}): void {
  const x1 = x0 + (opts.rich ? 1.6 : 1.0);
  const z0 = zHead - 2.1;
  const blanket = opts.poor ? toneFill("dots", st.p) : opts.rich ? toneFill("flowers", st.p) : toneFill("stripes", st.p);
  const wood = st.pal.wood;
  const top = opts.poor ? 0.5 : 0.62;
  const sortZ = st.cam.F / scaleAt(st.cam, { x: (x0 + x1) / 2, y: 0.5, z: z0 });
  const parts: { b: LocalBox; fill?: string; top?: string }[] = [];
  // headboard with posts (behind everything else)
  parts.push({ b: { a0: x0, a1: x1, y0: 0, y1: opts.rich ? 1.35 : 0.9, d0: zHead - 0.05, d1: zHead }, fill: wood });
  for (const px of [x0, x1 - 0.08]) parts.push({ b: { a0: px, a1: px + 0.08, y0: 0, y1: opts.rich ? 1.5 : 1.0, d0: zHead - 0.09, d1: zHead }, fill: wood });
  // legs + side rail
  for (const [lx, lz] of [
    [x0, z0],
    [x1 - 0.07, z0],
  ]) parts.push({ b: { a0: lx, a1: lx + 0.07, y0: 0, y1: 0.3, d0: lz, d1: lz + 0.07 }, fill: wood });
  parts.push({ b: { a0: x0, a1: x1, y0: 0.18, y1: top - 0.14, d0: z0, d1: zHead }, fill: wood });
  // mattress, then a blanket that drapes over the sides
  parts.push({ b: { a0: x0 + 0.02, a1: x1 - 0.02, y0: top - 0.14, y1: top, d0: z0 + 0.03, d1: zHead - 0.05 }, fill: PAPER, top: PAPER });
  parts.push({ b: { a0: x0 - 0.04, a1: x1 + 0.04, y0: top - 0.26, y1: top + 0.05, d0: z0 - 0.02, d1: zHead - 0.62 }, fill: blanket, top: blanket });
  // turned-down sheet
  parts.push({ b: { a0: x0 - 0.04, a1: x1 + 0.04, y0: top - 0.2, y1: top + 0.06, d0: zHead - 0.72, d1: zHead - 0.62 }, fill: PAPER, top: PAPER });
  // low footboard
  parts.push({ b: { a0: x0, a1: x1, y0: 0, y1: top + 0.12, d0: z0 - 0.06, d1: z0 }, fill: wood });
  furniture(st, parts, sortZ);
  // soft pillow: rounded outline over its top rectangle
  const py = top + 0.12;
  const corners: V3[] = [
    { x: x0 + 0.12, y: py, z: zHead - 0.5 },
    { x: x1 - 0.12, y: py, z: zHead - 0.5 },
    { x: x1 - 0.12, y: py, z: zHead - 0.12 },
    { x: x0 + 0.12, y: py, z: zHead - 0.12 },
  ];
  const q = corners.map((c) => project(st.cam, c));
  if (q.every((p) => p)) {
    const pts = q as Point[];
    const lift = { x: 0, y: -Math.max(2, scaleAt(st.cam, corners[0]) * 0.08) };
    const mid = (a: Point, b: Point, bulge: number): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + lift.y * bulge });
    const outline = [pts[0], mid(pts[0], pts[1], 0.6), pts[1], mid(pts[1], pts[2], 0.3), pts[2], mid(pts[2], pts[3], 1), pts[3], mid(pts[3], pts[0], 0.3)];
    const lw = wAt(st, sortZ);
    const dent = mid(pts[0], pts[2], 0.2);
    add(st, LAYER.stand, sortZ - 0.02, pathEl(smoothPath(outline, true, 0.6), { fill: PAPER, stroke: st.pal.ink, w: lw }) + pathEl(`M${n(dent.x - 4)} ${n(dent.y)}q4 2 8 0`, { stroke: st.pal.ink, w: lw * 0.5 }));
  }
}

export function table(st: Stage, x: number, z: number, w = 1.2, d = 0.8, h = 0.75, opts: { cloth?: boolean } = {}): void {
  const leg = 0.07;
  const parts: { b: LocalBox; fill?: string; top?: string }[] = [];
  const legs = [
    [x - w / 2 + 0.05, z - d / 2 + 0.05],
    [x + w / 2 - 0.05 - leg, z - d / 2 + 0.05],
    [x - w / 2 + 0.05, z + d / 2 - 0.05 - leg],
    [x + w / 2 - 0.05 - leg, z + d / 2 - 0.05 - leg],
  ];
  for (const [lx, lz] of legs.slice(2)) parts.push({ b: { a0: lx, a1: lx + leg, y0: 0, y1: h, d0: lz, d1: lz + leg }, fill: st.pal.wood });
  for (const [lx, lz] of legs.slice(0, 2)) parts.push({ b: { a0: lx, a1: lx + leg, y0: 0, y1: h, d0: lz, d1: lz + leg }, fill: st.pal.wood });
  if (opts.cloth) parts.push({ b: { a0: x - w / 2 - 0.05, a1: x + w / 2 + 0.05, y0: h - 0.35, y1: h + 0.04, d0: z - d / 2 - 0.05, d1: z + d / 2 + 0.05 }, fill: PAPER, top: PAPER });
  else parts.push({ b: { a0: x - w / 2, a1: x + w / 2, y0: h - 0.06, y1: h, d0: z - d / 2, d1: z + d / 2 }, fill: st.pal.wood, top: st.pal.wood });
  furniture(st, parts);
}

export function stool(st: Stage, x: number, z: number): void {
  furniture(st, [
    { b: { a0: x - 0.18, a1: x - 0.13, y0: 0, y1: 0.45, d0: z - 0.03, d1: z + 0.02 }, fill: st.pal.wood },
    { b: { a0: x + 0.13, a1: x + 0.18, y0: 0, y1: 0.45, d0: z - 0.03, d1: z + 0.02 }, fill: st.pal.wood },
    { b: { a0: x - 0.22, a1: x + 0.22, y0: 0.45, y1: 0.5, d0: z - 0.2, d1: z + 0.2 }, fill: st.pal.wood },
  ]);
}

export function chair(st: Stage, x: number, z: number, backAtZ = true): void {
  const bz = backAtZ ? z + 0.2 : z - 0.24;
  furniture(st, [
    { b: { a0: x - 0.22, a1: x - 0.17, y0: 0, y1: 0.45, d0: z - 0.2, d1: z - 0.15 }, fill: st.pal.wood },
    { b: { a0: x + 0.17, a1: x + 0.22, y0: 0, y1: 0.45, d0: z - 0.2, d1: z - 0.15 }, fill: st.pal.wood },
    { b: { a0: x - 0.24, a1: x + 0.24, y0: 0.45, y1: 0.5, d0: z - 0.22, d1: z + 0.22 }, fill: st.pal.wood },
    { b: { a0: x - 0.24, a1: x + 0.24, y0: 0.5, y1: 1.05, d0: bz, d1: bz + 0.05 }, fill: st.pal.wood },
  ]);
}

/** A hanging chandelier with candles and drops. */
export function chandelier(st: Stage, x: number, y: number, z: number, span = 1.2): void {
  const pl = place(st, { x, y, z });
  if (!pl) return;
  const k = pl.k;
  const lw = wAt(st, pl.z);
  const P = pl.at;
  const top = project(st.cam, { x, y: y + 2.5, z });
  let s = "";
  if (top) s += pathEl(`M${n(top.x)} ${n(top.y)}L${n(P(0, 0.4).x)} ${n(P(0, 0.4).y)}`, { stroke: st.pal.ink, w: lw * 0.8 });
  // bowl + arms
  const arms = 5;
  let d = "";
  let candles = "";
  let flames = "";
  let drops = "";
  for (let i = 0; i < arms; i += 1) {
    const t = (i / (arms - 1)) * 2 - 1;
    const ax = t * span;
    const tip = P(ax, 0.25 - Math.abs(t) * 0.05);
    const c = P(0, -0.1);
    d += `M${n(c.x)} ${n(c.y)}Q${n(P(ax * 0.6, -0.35).x)} ${n(P(ax * 0.6, -0.35).y)} ${n(tip.x)} ${n(tip.y)}`;
    const cw = 0.05 * k;
    const ch = 0.28 * k;
    candles += `M${n(tip.x - cw)} ${n(tip.y)}h${n(cw * 2)}v${n(-ch)}h${n(-cw * 2)}Z`;
    const f = { x: tip.x, y: tip.y - ch };
    flames += `M${n(f.x - cw)} ${n(f.y)}Q${n(f.x - cw)} ${n(f.y - cw * 2.5)} ${n(f.x)} ${n(f.y - cw * 4)}Q${n(f.x + cw)} ${n(f.y - cw * 2.5)} ${n(f.x + cw)} ${n(f.y)}Z`;
    const dr = P(ax * 0.7, -0.3);
    drops += `M${n(dr.x)} ${n(dr.y)}l${n(-0.04 * k)} ${n(0.1 * k)}l${n(0.04 * k)} ${n(0.08 * k)}l${n(0.04 * k)} ${n(-0.08 * k)}Z`;
  }
  s += pathEl(d, { stroke: st.pal.ink, w: lw * 1.1 });
  s += pathEl(smoothPath([P(-0.35, 0.4), P(0.35, 0.4), P(0.2, -0.15), P(0, -0.3), P(-0.2, -0.15)], true, 0.5), { fill: toneFill("gold", st.p), stroke: st.pal.ink, w: lw });
  s += pathEl(candles, { fill: PAPER, stroke: st.pal.ink, w: lw * 0.6 });
  s += pathEl(flames, { fill: PAPER, stroke: st.pal.ink, w: lw * 0.5 });
  s += pathEl(drops, { fill: PAPER, stroke: st.pal.ink, w: lw * 0.4 });
  if (!visible(st, [P(-span, 0.5), P(span, -0.5)])) return;
  add(st, LAYER.stand, pl.z, s);
}

/** Floor rug decal. */
export function rug(st: Stage, x0: number, x1: number, z0: number, z1: number, pattern: "flowers" | "check" | "stripes"): void {
  const q = projectPoly(st.cam, [
    { x: x0, y: 0.01, z: z0 },
    { x: x1, y: 0.01, z: z0 },
    { x: x1, y: 0.01, z: z1 },
    { x: x0, y: 0.01, z: z1 },
  ]);
  if (q.length < 3 || !visible(st, q)) return;
  const inset = projectPoly(st.cam, [
    { x: x0 + 0.25, y: 0.01, z: z0 + 0.25 },
    { x: x1 - 0.25, y: 0.01, z: z0 + 0.25 },
    { x: x1 - 0.25, y: 0.01, z: z1 - 0.25 },
    { x: x0 + 0.25, y: 0.01, z: z1 - 0.25 },
  ]);
  const lw = wAt(st, (z0 + z1) / 2);
  let s = pathEl(polyPath(q), { fill: toneFill("dots", st.p), stroke: st.pal.ink, w: lw });
  if (inset.length > 2) s += pathEl(polyPath(inset), { fill: toneFill(pattern, st.p), stroke: st.pal.ink, w: lw * 0.6 });
  add(st, LAYER.decal, (z0 + z1) / 2, s);
}

/** Candle on a surface at world (x, y, z). */
export function candleAt(st: Stage, x: number, y: number, z: number, h = 0.22): void {
  const pl = place(st, { x, y, z });
  if (!pl) return;
  const k = pl.k;
  const lw = wAt(st, pl.z) * 0.8;
  const P = pl.at;
  const w = 0.035;
  let s = pathEl(polyPath([P(-w, 0), P(w, 0), P(w, h), P(-w, h)]), { fill: PAPER, stroke: st.pal.ink, w: lw });
  s += pathEl(smoothPath([P(-0.09, 0), P(0.09, 0), P(0.1, 0.02), P(-0.1, 0.02)], true), { fill: st.pal.wood, stroke: st.pal.ink, w: lw });
  const f = P(0, h);
  const fw = Math.max(1.5, 0.03 * k);
  s += pathEl(`M${n(f.x - fw)} ${n(f.y - fw)}Q${n(f.x - fw)} ${n(f.y - fw * 3)} ${n(f.x)} ${n(f.y - fw * 4.5)}Q${n(f.x + fw)} ${n(f.y - fw * 3)} ${n(f.x + fw)} ${n(f.y - fw)}Q${n(f.x)} ${n(f.y)} ${n(f.x - fw)} ${n(f.y - fw)}Z`, { fill: PAPER, stroke: st.pal.ink, w: lw * 0.7 });
  // glow ring
  s += `<circle cx="${n(f.x)}" cy="${n(f.y - fw * 2.5)}" r="${n(0.3 * k)}" fill="none" stroke="${st.pal.night ? PAPER : INK}" stroke-width="${n(lw * 0.4)}" stroke-dasharray="${n(0.03 * k)} ${n(0.05 * k)}"/>`;
  st.anchors.candle = { x: f.x, y: f.y - fw * 2.5 };
  add(st, LAYER.stand, pl.z - 0.05, s);
}
