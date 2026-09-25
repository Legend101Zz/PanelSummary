/**
 * ENV_FEATURES: every feature can be drawn in any environment. Scenes hand
 * over a site plan (wall slots, floor spots, a centre, a back band) and this
 * module places each requested feature plausibly for indoor or outdoor use.
 */
import type { EnvFeature, Point } from "../contracts.js";
import { INK, PAPER, toneFill } from "../style.js";
import { n, polyPath, smoothPath } from "../svg.js";
import { between } from "../prng.js";
import { project, projectPoly, scaleAt, toCam, xRangeAt, type V3 } from "./camera.js";
import { LAYER, add, pathEl, place, placeVisible, polyD, segD, visible, wAt, type Stage } from "./stage.js";
import { boxSvg, columnSvg, cylinderOutline, drawBox, drawBuilding, faceVisible, frame, archPoints } from "./architecture.js";
import { bush, crowdRow, flowers, groundEllipse, tree, waterBand } from "./nature.js";
import {
  bed,
  bookshelfOnWall,
  candleAt,
  furniture,
  stoneBlocks,
  table,
  wallDecal,
  wallDoor,
  wallFireplace,
  wallWindow,
  type Room,
  type Wall,
} from "./interior.js";

export interface WallSlot {
  wall: Wall;
  u: number;
  w: number;
}

export interface Spot {
  x: number;
  z: number;
}

export interface Sites {
  interior: boolean;
  room?: Room;
  /** Free wall slots in preference order (interiors). */
  wallSlots: WallSlot[];
  /** Free ground spots in preference order: sides first. */
  spots: Spot[];
  /** Centrepiece spot (fountain, statue column, clock tower). */
  centre: Spot;
  /** Depth for background bands (crowd, walls, rivers). */
  backZ: number;
  /** Lateral span for bands. */
  span: [number, number];
  /** Features the scene already drew intrinsically (skipped here). */
  drawn?: EnvFeature[];
}

const BAND_ORDER: EnvFeature[] = [
  "snow_ground",
  "river",
  "bridge",
  "high_wall",
  "gate",
  "clock_tower",
  "crowd_background",
  "fence",
  "statue_column",
  "fountain",
  "trees",
  "window",
  "door",
  "fireplace",
  "bookshelf",
  "bars",
  "bed",
  "table",
  "lamp_post",
  "flowers",
];

export function drawFeatures(st: Stage, features: readonly EnvFeature[], sites: Sites): void {
  const set = new Set(features.filter((f) => !(sites.drawn ?? []).includes(f)));
  const spots = [...sites.spots];
  const slots = [...sites.wallSlots];
  let centreUsed = false;
  const takeSpot = (): Spot => spots.shift() ?? { x: between(st.rand, -3, 3), z: st.zmid + between(st.rand, 2, 5) };
  const takeCentre = (): Spot => {
    if (!centreUsed) {
      centreUsed = true;
      return sites.centre;
    }
    return takeSpot();
  };
  const takeSlot = (pref?: Wall["name"]): WallSlot | null => {
    const i = pref ? slots.findIndex((s) => s.wall.name === pref) : -1;
    const idx = i >= 0 ? i : 0;
    return slots.splice(idx, 1)[0] ?? null;
  };
  for (const f of BAND_ORDER) {
    if (!set.has(f)) continue;
    switch (f) {
      case "snow_ground":
        break; // handled by the stage flag before scenes draw
      case "river":
        if (sites.interior) paintingOnWall(st, takeSlot("back"), "river");
        else if (!set.has("bridge")) waterBand(st, Math.max(st.zmid + 1.5, sites.backZ - 7), Math.max(st.zmid + 5, sites.backZ - 0.5));
        break;
      case "bridge":
        if (sites.interior) paintingOnWall(st, takeSlot(), "bridge");
        else riverWithBridge(st, sites);
        break;
      case "high_wall":
        if (sites.interior) {
          const back = sites.wallSlots.find((s) => s.wall.name === "back")?.wall;
          if (back) stoneBlocks(st, back);
        } else highWall(st, sites.span[0], sites.span[1], sites.backZ, set.has("gate") ? 3.4 : 0);
        break;
      case "gate":
        if (sites.interior) {
          const slot = takeSlot("back");
          if (slot) ironGateOnWall(st, slot);
        } else gate(st, sites.centre.x, set.has("high_wall") ? sites.backZ : sites.centre.z, 3.4, !set.has("high_wall"));
        break;
      case "clock_tower": {
        if (sites.interior) {
          const slot = takeSlot();
          if (slot) grandfatherClock(st, slot);
        } else {
          // tall: keep it far enough back to show the spire
          const zT = Math.max(sites.backZ + 4, st.zmid + 32);
          const busy = centreUsed || set.has("statue_column") || set.has("fountain");
          const x = busy ? xRangeAt(st.cam, zT)[1] * 0.55 : sites.centre.x;
          if (!busy) centreUsed = true;
          clockTower(st, x, zT);
        }
        break;
      }
      case "crowd_background":
        if (st.lod >= 1) crowdRow(st, sites.span[0], sites.span[1], sites.interior ? (sites.room ? sites.room.zb - 1.2 : sites.backZ) : sites.backZ - 2.5, 1);
        break;
      case "fence":
        if (sites.interior) railing(st, sites.span[0] + 0.3, sites.span[1] - 0.3, st.zmid + 1.6, 0.95);
        else picketFence(st, { x: sites.span[0], z: st.zmid + 3.2 }, { x: sites.span[1], z: st.zmid + 3.2 });
        break;
      case "statue_column": {
        const c = takeCentre();
        const roomH = sites.room ? (sites.room.knee ?? sites.room.h) : 0;
        if (sites.interior) statueColumn(st, c.x, c.z, Math.min(0.45, (roomH - 0.4) / 7.9));
        else statueColumn(st, c.x, Math.max(c.z, st.zmid + 11), 1);
        break;
      }
      case "fountain": {
        const c = takeCentre();
        fountain(st, c.x, sites.interior ? c.z : Math.max(c.z, st.zmid + 6), sites.interior ? 0.45 : 1);
        break;
      }
      case "trees": {
        if (sites.interior) {
          const s = takeSpot();
          pottedTree(st, s.x, s.z);
        } else {
          const count = st.lod >= 2 ? 2 : 1;
          for (let i = 0; i < count; i += 1) {
            const s = takeSpot();
            tree(st, s.x, s.z + 1.5, { h: between(st.rand, 6.5, 9) });
          }
        }
        break;
      }
      case "window":
      case "door":
      case "fireplace":
      case "bookshelf": {
        const slot = sites.interior ? takeSlot(f === "bookshelf" ? "left" : "back") : null;
        const wallSlot = slot ?? outdoorWall(st, takeSpot(), f);
        if (!wallSlot) break;
        const { wall, u, w } = wallSlot;
        if (f === "window") wallWindow(st, wall, u + w / 2 - 0.65, 1.0, 1.3, 1.5, { curtains: st.env === "room_rich" || st.env === "study" });
        else if (f === "door") wallDoor(st, wall, u + w / 2 - 0.5, 1.0, 2.15);
        else if (f === "fireplace") wallFireplace(st, wall, u + w / 2 - 0.9);
        else bookshelfOnWall(st, wall, u + 0.1, Math.min(2.4, w - 0.2), Math.min(2.4, wall.top(u) - 0.3));
        break;
      }
      case "bars": {
        if (sites.interior && sites.room) {
          const r = sites.room;
          bars(st, { x: r.x1 - 0.35, z: r.zb }, { x: r.x1 - 0.35, z: Math.max(r.zf + 1, st.zmid - 1.5) }, r.knee ?? r.h);
        } else {
          const s = takeSpot();
          bars(st, { x: s.x - 1.6, z: s.z + 1 }, { x: s.x + 1.6, z: s.z + 1 }, 2.6, true);
        }
        break;
      }
      case "bed": {
        const s = takeSpot();
        bed(st, s.x - 0.5, s.z + 1.2, { poor: st.env === "room_poor" || st.env === "garret" || st.env === "jail_cell", rich: st.env === "room_rich" || st.env === "palace_hall" });
        break;
      }
      case "table": {
        const s = takeSpot();
        table(st, s.x, s.z, 1.2, 0.8, 0.75, { cloth: st.env === "room_rich" || st.env === "palace_hall" });
        if (st.lod >= 1) candleAt(st, s.x + 0.25, 0.75, s.z - 0.1);
        break;
      }
      case "lamp_post": {
        if (sites.interior) {
          const s = takeSpot();
          candelabra(st, s.x, s.z);
        } else {
          const count = st.lod >= 2 ? 2 : 1;
          for (let i = 0; i < count; i += 1) {
            const s = takeSpot();
            lampPost(st, s.x, s.z);
          }
        }
        break;
      }
      case "flowers": {
        if (sites.interior) {
          const s = takeSpot();
          flowerPot(st, s.x, s.z);
        } else {
          const [xa, xb] = xRangeAt(st.cam, st.zmid * 0.9);
          const count = 2 + st.lod;
          for (let i = 0; i < count; i += 1) {
            const side = i % 2 === 0 ? -1 : 1;
            const x = side < 0 ? between(st.rand, xa * 0.95, xa * 0.45) : between(st.rand, xb * 0.45, xb * 0.95);
            flowers(st, x, st.zmid * between(st.rand, 0.75, 1.3), 0.9, 6);
          }
          if (st.lod >= 2) {
            bush(st, xa * 0.75, st.zmid + 2, 0.8, { flowers: true });
            bush(st, xb * 0.75, st.zmid + 2.4, 0.8, { flowers: true });
          }
        }
        break;
      }
    }
  }
}

/** A small house front used to host a wall feature outdoors. */
function outdoorWall(st: Stage, spot: Spot, f: EnvFeature): WallSlot | null {
  const w = f === "bookshelf" ? 3.4 : 3;
  const x0 = spot.x - w / 2;
  const z = spot.z + 2;
  const h = f === "fireplace" ? 3 : 3.4;
  drawBuilding(st, { ox: x0, oz: z, width: w, depth: 3, height: h, roof: f === "fireplace" ? "flat" : "gable", roofH: 1.4, door: false, noWindows: true, sortZ: toCam(st.cam, { x: spot.x, y: 1.5, z }).z });
  const zc = toCam(st.cam, { x: spot.x, y: 1.5, z }).z;
  const wall: Wall = {
    name: "back",
    map: (u, y) => ({ x: x0 + u, y, z: z - 0.01 }),
    len: w,
    top: () => h,
    normal: { x: 0, y: 0, z: -1 },
    decal: { layer: LAYER.stand, z: zc - 0.02 },
  };
  return { wall, u: 0, w };
}

function paintingOnWall(st: Stage, slot: WallSlot | null, subject: "river" | "bridge"): void {
  if (!slot) return;
  const { wall, u, w } = slot;
  const m = wall.map;
  const pw = Math.min(1.4, w * 0.7);
  const u0 = u + (w - pw) / 2;
  const y0 = 1.3;
  const ph = 0.95;
  const lw = wAt(st, toCam(st.cam, m(u0, y0)).z);
  let s = pathEl(polyD(st, [m(u0 - 0.1, y0 - 0.1), m(u0 + pw + 0.1, y0 - 0.1), m(u0 + pw + 0.1, y0 + ph + 0.1), m(u0 - 0.1, y0 + ph + 0.1)]), { fill: toneFill("gold", st.p), stroke: st.pal.ink, w: lw });
  s += pathEl(polyD(st, [m(u0, y0), m(u0 + pw, y0), m(u0 + pw, y0 + ph), m(u0, y0 + ph)]), { fill: PAPER, stroke: st.pal.ink, w: lw * 0.7 });
  // simple landscape: horizon, hill, river / bridge arc
  const P = (a: number, b: number): Point | null => project(st.cam, m(u0 + pw * a, y0 + ph * b));
  const pts = [P(0, 0.55), P(0.3, 0.72), P(0.6, 0.6), P(1, 0.66)].filter((p): p is Point => !!p);
  let d = pts.length > 2 ? smoothPath(pts, false) : "";
  const r0 = P(0.35, 0);
  const r1 = P(0.5, 0.5);
  const r2 = P(0.65, 0);
  if (r0 && r1 && r2) d += `M${n(r0.x)} ${n(r0.y)}L${n(r1.x)} ${n(r1.y)}L${n(r2.x)} ${n(r2.y)}`;
  if (subject === "bridge") {
    const b0 = P(0.15, 0.3);
    const b1 = P(0.5, 0.48);
    const b2 = P(0.85, 0.3);
    if (b0 && b1 && b2) d += `M${n(b0.x)} ${n(b0.y)}Q${n(b1.x)} ${n(b1.y + (b1.y - b0.y))} ${n(b2.x)} ${n(b2.y)}`;
  }
  s += pathEl(d, { stroke: st.pal.ink, w: lw * 0.6 });
  wallDecal(st, s, wall);
}

export function statueColumn(st: Stage, x: number, z: number, scale = 1): void {
  const fr = frame("front", 0, 0);
  const H = 7.5 * scale;
  const zc = toCam(st.cam, { x, y: H / 2, z }).z;
  if (zc < st.cam.near) return;
  const lw = wAt(st, zc);
  const fill = st.pal.wall;
  let s = "";
  // stepped pedestal
  s += boxSvg(st, fr, { a0: x - 1.9 * scale, a1: x + 1.9 * scale, y0: 0, y1: 0.35 * scale, d0: z - 1.9 * scale, d1: z + 1.9 * scale }, fill, lw);
  s += boxSvg(st, fr, { a0: x - 1.4 * scale, a1: x + 1.4 * scale, y0: 0.35 * scale, y1: 2.2 * scale, d0: z - 1.4 * scale, d1: z + 1.4 * scale }, toneFill("stone", st.p), lw);
  // plaque recess on the pedestal
  s += pathEl(polyD(st, [{ x: x - 0.8 * scale, y: 0.8 * scale, z: z - 1.41 * scale }, { x: x + 0.8 * scale, y: 0.8 * scale, z: z - 1.41 * scale }, { x: x + 0.8 * scale, y: 1.7 * scale, z: z - 1.41 * scale }, { x: x - 0.8 * scale, y: 1.7 * scale, z: z - 1.41 * scale }]), {
    stroke: st.pal.ink,
    w: lw * 0.6,
  });
  s += boxSvg(st, fr, { a0: x - 1.55 * scale, a1: x + 1.55 * scale, y0: 2.2 * scale, y1: 2.5 * scale, d0: z - 1.55 * scale, d1: z + 1.55 * scale }, fill, lw);
  s += columnSvg(st, x, z, 0.5 * scale, H - 2.5 * scale, { y0: 2.5 * scale, base: 0.4 * scale });
  // platform slab on top with a small balustrade lip
  s += boxSvg(st, fr, { a0: x - 1.1 * scale, a1: x + 1.1 * scale, y0: H, y1: H + 0.35 * scale, d0: z - 1.1 * scale, d1: z + 1.1 * scale }, fill, lw * 1.1);
  const top = project(st.cam, { x, y: H + 0.35 * scale, z });
  if (top) st.anchors.statue_top = top;
  add(st, LAYER.stand, zc, s);
}

export function fountain(st: Stage, x: number, z: number, scale = 1): void {
  const R = 2.4 * scale;
  const zc = toCam(st.cam, { x, y: 0.5, z }).z;
  if (zc < st.cam.near) return;
  const lw = wAt(st, zc);
  const rimH = 0.55 * scale;
  const outer0 = ring(st, x, z, R, 0);
  const outerTop = ring(st, x, z, R, rimH);
  const innerTop = ring(st, x, z, R * 0.86, rimH);
  if (outerTop.length < 3 || !visible(st, outerTop)) return;
  let s = "";
  // basin wall = hull of bottom and top rings (front band)
  const band = frontBand(outer0, outerTop);
  s += pathEl(band, { fill: toneFill("stone", st.p), stroke: st.pal.ink, w: lw });
  s += pathEl(smoothPath(outerTop, true, 0.5), { fill: st.pal.wall, stroke: st.pal.ink, w: lw });
  s += pathEl(smoothPath(innerTop, true, 0.5), { fill: st.pal.night ? toneFill("dark", st.p) : PAPER, stroke: st.pal.ink, w: lw * 0.8 });
  // ripples in the basin
  let rip = "";
  for (let i = 0; i < 3; i += 1) {
    const rr = ring(st, x, z, R * (0.35 + i * 0.17), rimH - 0.05, 20);
    if (rr.length > 8) rip += smoothPath(rr.slice(2, 9), false);
  }
  s += pathEl(rip, { stroke: st.pal.ink, w: lw * 0.45 });
  // pedestal + upper bowl
  const ped = cylinderOutline(st, x, z, 0.28 * scale, rimH, 1.9 * scale);
  if (ped) s += pathEl(polyPath(ped.poly), { fill: st.pal.wall, stroke: st.pal.ink, w: lw });
  const bowlTop = ring(st, x, z, 0.95 * scale, 2.05 * scale);
  const bowlBot = ring(st, x, z, 0.35 * scale, 1.75 * scale);
  s += pathEl(frontBand(bowlBot, bowlTop), { fill: st.pal.wall, stroke: st.pal.ink, w: lw });
  s += pathEl(smoothPath(bowlTop, true, 0.5), { fill: st.pal.wall, stroke: st.pal.ink, w: lw });
  // spout + water arcs
  const spout = project(st.cam, { x, y: 2.7 * scale, z });
  const k = scaleAt(st.cam, { x, y: 2, z });
  if (spout) {
    let w = "";
    for (const side of [-1, -0.45, 0.45, 1]) {
      const land = project(st.cam, { x: x + side * R * 0.7, y: rimH, z: z - Math.abs(side) * 0.3 });
      if (!land) continue;
      w += `M${n(spout.x)} ${n(spout.y)}Q${n(spout.x + side * k * 0.9)} ${n(spout.y - k * 0.8)} ${n(land.x)} ${n(land.y)}`;
    }
    const lip = project(st.cam, { x, y: 2.05 * scale, z: z - 0.95 * scale });
    if (lip) {
      for (const side of [-1, 1]) w += `M${n(lip.x + side * k * 0.8)} ${n(lip.y)}q${n(side * k * 0.25)} ${n(k * 0.3)} ${n(side * k * 0.3)} ${n(k * 0.9)}`;
    }
    s += pathEl(w, { stroke: st.pal.ink, w: lw * 0.7 });
    s += pathEl(`M${n(spout.x - k * 0.08)} ${n(spout.y + k * 0.3)}L${n(spout.x)} ${n(spout.y)}L${n(spout.x + k * 0.08)} ${n(spout.y + k * 0.3)}`, { stroke: st.pal.ink, w: lw });
  }
  st.anchors.fountain = project(st.cam, { x, y: rimH, z }) ?? st.anchors.fountain;
  add(st, LAYER.stand, zc, s);
}

function ring(st: Stage, x: number, z: number, r: number, y: number, steps = 32): Point[] {
  const pts: V3[] = [];
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    pts.push({ x: x + Math.cos(a) * r, y, z: z + Math.sin(a) * r });
  }
  return projectPoly(st.cam, pts);
}

/** Region between the lower and upper rings' front halves (a cylinder band). */
function frontBand(lower: Point[], upper: Point[]): string {
  if (lower.length < 3 || upper.length < 3) return "";
  const lx = (pts: Point[]) => {
    let li = 0;
    let ri = 0;
    pts.forEach((p, i) => {
      if (p.x < pts[li].x) li = i;
      if (p.x > pts[ri].x) ri = i;
    });
    return [li, ri];
  };
  const [ll, lr] = lx(lower);
  const [ul, ur] = lx(upper);
  // take the lower (screen-bottom) arc of the lower ring from left to right
  const arc = (pts: Point[], a: number, b: number, bottom: boolean): Point[] => {
    const out: Point[] = [];
    const len = pts.length;
    const forward: Point[] = [];
    for (let i = a; ; i = (i + 1) % len) {
      forward.push(pts[i]);
      if (i === b) break;
    }
    const backward: Point[] = [];
    for (let i = a; ; i = (i - 1 + len) % len) {
      backward.push(pts[i]);
      if (i === b) break;
    }
    const avg = (q: Point[]) => q.reduce((acc, p) => acc + p.y, 0) / q.length;
    const pickF = bottom ? avg(forward) >= avg(backward) : avg(forward) < avg(backward);
    out.push(...(pickF ? forward : backward));
    return out;
  };
  const low = arc(lower, ll, lr, true);
  const up = arc(upper, ul, ur, true).reverse();
  return polyPath([...low, ...up]);
}

export function lampPost(st: Stage, x: number, z: number): void {
  const H = 3.6;
  const pl = place(st, { x, y: 0, z });
  if (!pl || !placeVisible(st, pl, 0.4, H + 0.6)) return;
  const k = pl.k;
  const top = project(st.cam, { x, y: H, z });
  if (!top) return;
  const lw = wAt(st, pl.z);
  const P = pl.at;
  const T = (dx: number, dy: number): Point => ({ x: top.x + dx * k, y: top.y - dy * k });
  let s = "";
  // base
  s += pathEl(polyPath([P(-0.18, 0), P(0.18, 0), P(0.12, 0.5), P(-0.12, 0.5)]), { fill: INK, stroke: st.pal.ink, w: lw });
  // post
  s += pathEl(polyPath([P(-0.06, 0.5), P(0.06, 0.5), { x: top.x + 0.045 * k, y: top.y }, { x: top.x - 0.045 * k, y: top.y }]), { fill: INK, stroke: st.pal.ink, w: lw * 0.8 });
  // lantern
  const glass = st.pal.night || st.time === "dusk" ? PAPER : toneFill("light", st.p);
  if (st.pal.night) s += `<circle cx="${n(T(0, 0.35).x)}" cy="${n(T(0, 0.35).y)}" r="${n(0.9 * k)}" fill="${PAPER}" fill-opacity="0.28"/><circle cx="${n(T(0, 0.35).x)}" cy="${n(T(0, 0.35).y)}" r="${n(0.55 * k)}" fill="${PAPER}" fill-opacity="0.4"/>`;
  s += pathEl(polyPath([T(-0.12, 0), T(0.12, 0), T(0.2, 0.5), T(-0.2, 0.5)]), { fill: glass, stroke: st.pal.ink, w: lw });
  s += pathEl(`M${n(T(0, 0).x)} ${n(T(0, 0).y)}L${n(T(0, 0.5).x)} ${n(T(0, 0.5).y)}`, { stroke: st.pal.ink, w: lw * 0.5 });
  s += pathEl(polyPath([T(-0.27, 0.5), T(0.27, 0.5), T(0, 0.78)]), { fill: INK, stroke: st.pal.ink, w: lw });
  s += pathEl(`M${n(T(0, 0.78).x)} ${n(T(0, 0.78).y)}L${n(T(0, 0.92).x)} ${n(T(0, 0.92).y)}`, { stroke: st.pal.ink, w: lw });
  add(st, LAYER.stand, pl.z, s);
}

function candelabra(st: Stage, x: number, z: number): void {
  const pl = place(st, { x, y: 0, z });
  if (!pl || !placeVisible(st, pl, 0.4, 1.9)) return;
  const lw = wAt(st, pl.z);
  const P = pl.at;
  let s = pathEl(polyPath([P(-0.22, 0), P(0.22, 0), P(0.05, 0.15), P(0.03, 1.5), P(-0.03, 1.5), P(-0.05, 0.15)]), { fill: toneFill("gold", st.p), stroke: st.pal.ink, w: lw });
  s += pathEl(`M${n(P(-0.35, 1.72).x)} ${n(P(-0.35, 1.72).y)}Q${n(P(-0.35, 1.45).x)} ${n(P(0, 1.45).y)} ${n(P(0, 1.5).x)} ${n(P(0, 1.5).y)}Q${n(P(0.35, 1.45).x)} ${n(P(0.35, 1.45).y)} ${n(P(0.35, 1.72).x)} ${n(P(0.35, 1.72).y)}`, { stroke: st.pal.ink, w: lw });
  add(st, LAYER.stand, pl.z, s);
  for (const dx of [-0.35, 0, 0.35]) candleAt(st, x + dx, dx === 0 ? 1.55 : 1.72, z, 0.2);
}

export function clockTower(st: Stage, x: number, z: number): void {
  const W = 3.4;
  const H = 16;
  const x0 = x - W / 2;
  const roofH = 5.5;
  drawBuilding(st, {
    ox: x0,
    oz: z,
    width: W,
    depth: W,
    height: H,
    roof: "none",
    door: true,
    noWindows: true,
    decorate: (fr) => {
      let s = "";
      const lw = wAt(st, toCam(st.cam, fr.M(W / 2, H * 0.8, 0)).z);
      // belfry arches
      for (const u of [0.45, 1.95]) {
        const q = polyD(st, archPoints((a, b) => fr.M(a, b, -0.01), u, u + 1, H - 3, H - 1.3, false));
        if (q) s += pathEl(q, { fill: INK, stroke: st.pal.ink, w: lw });
      }
      // clock face
      const c3 = fr.M(W / 2, H - 5.2, -0.02);
      const c = project(st.cam, c3);
      const k = scaleAt(st.cam, c3);
      if (c) {
        const r = 1.15 * k;
        s += `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(r * 1.12)}" fill="${st.pal.wall}" stroke="${st.pal.ink}" stroke-width="${n(lw)}"/>`;
        s += `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(r)}" fill="${st.pal.night ? PAPER : PAPER}" stroke="${st.pal.ink}" stroke-width="${n(lw * 0.8)}"/>`;
        let ticks = "";
        if (r > 6) {
          for (let i = 0; i < 12; i += 1) {
            const a = (i / 12) * Math.PI * 2;
            const r0 = r * (i % 3 === 0 ? 0.72 : 0.82);
            ticks += `M${n(c.x + Math.cos(a) * r0)} ${n(c.y + Math.sin(a) * r0)}L${n(c.x + Math.cos(a) * r * 0.93)} ${n(c.y + Math.sin(a) * r * 0.93)}`;
          }
        }
        const hA = -Math.PI / 2 + st.rand() * Math.PI * 2;
        const mA = -Math.PI / 2 + st.rand() * Math.PI * 2;
        ticks += `M${n(c.x)} ${n(c.y)}L${n(c.x + Math.cos(hA) * r * 0.5)} ${n(c.y + Math.sin(hA) * r * 0.5)}`;
        s += pathEl(ticks, { stroke: INK, w: Math.max(0.6, lw * 0.6) });
        s += pathEl(`M${n(c.x)} ${n(c.y)}L${n(c.x + Math.cos(mA) * r * 0.78)} ${n(c.y + Math.sin(mA) * r * 0.78)}`, { stroke: INK, w: Math.max(0.6, lw * 0.9) });
        st.anchors.clock = c;
      }
      // cornice bands
      s += pathEl(segD(st, fr.M(-0.05, H - 3.5, -0.02), fr.M(W + 0.05, H - 3.5, -0.02)) + segD(st, fr.M(-0.05, H - 7, -0.02), fr.M(W + 0.05, H - 7, -0.02)), { stroke: st.pal.ink, w: lw * 0.8 });
      return s;
    },
  });
  // pyramid spire roof
  const apex: V3 = { x, y: H + roofH, z: z + W / 2 };
  const c0: V3 = { x: x0 - 0.3, y: H, z: z - 0.3 };
  const c1: V3 = { x: x0 + W + 0.3, y: H, z: z - 0.3 };
  const c2: V3 = { x: x0 + W + 0.3, y: H, z: z + W + 0.3 };
  const c3: V3 = { x: x0 - 0.3, y: H, z: z + W + 0.3 };
  const zc = toCam(st.cam, { x, y: H, z }).z;
  const lw = wAt(st, zc);
  let s = "";
  const faces: [V3, V3, V3][] = [
    [c3, c0, apex],
    [c1, c2, apex],
    [c0, c1, apex],
  ];
  for (const [a, b, c] of faces) {
    const nx = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y);
    const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    const nz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const nrm = { x: -nx, y: -ny, z: -nz };
    if (!faceVisible(st, a, nrm)) continue;
    const d = polyD(st, [a, b, c]);
    if (d) s += pathEl(d, { fill: nrm.x > 0.3 ? st.pal.shade : st.pal.roof === PAPER ? toneFill("dots", st.p) : st.pal.roof, stroke: st.pal.ink, w: lw });
  }
  const ap = project(st.cam, apex);
  const ap2 = project(st.cam, { ...apex, y: apex.y + 1 });
  if (ap && ap2) s += pathEl(`M${n(ap.x)} ${n(ap.y)}L${n(ap2.x)} ${n(ap2.y)}`, { stroke: st.pal.ink, w: lw });
  add(st, LAYER.stand, zc - 0.05, s);
}

function grandfatherClock(st: Stage, slot: WallSlot): void {
  const { wall, u, w } = slot;
  const m = wall.map;
  const off = (p: V3, d: number): V3 => ({ x: p.x + wall.normal.x * d, y: p.y, z: p.z + wall.normal.z * d });
  const u0 = u + w / 2 - 0.3;
  const lw = wAt(st, toCam(st.cam, m(u0, 1)).z);
  const front = (a: number, b: number, c: number, d: number, depth: number) => [off(m(a, b), depth), off(m(c, b), depth), off(m(c, d), depth), off(m(a, d), depth)];
  let s = pathEl(polyD(st, front(u0, 0, u0 + 0.6, 2.2, 0.35)), { fill: st.pal.wood === PAPER ? toneFill("dots", st.p) : st.pal.wood, stroke: st.pal.ink, w: lw });
  s += pathEl(polyD(st, front(u0 + 0.15, 0.4, u0 + 0.45, 1.5, 0.36)), { fill: INK, stroke: st.pal.ink, w: lw * 0.7 });
  const c3 = off(m(u0 + 0.3, 1.85), 0.37);
  const c = project(st.cam, c3);
  const k = scaleAt(st.cam, c3);
  if (c) {
    s += `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(0.22 * k)}" fill="${PAPER}" stroke="${st.pal.ink}" stroke-width="${n(lw * 0.7)}"/>`;
    s += pathEl(`M${n(c.x)} ${n(c.y)}l0 ${n(-0.15 * k)}M${n(c.x)} ${n(c.y)}l${n(0.1 * k)} ${n(0.03 * k)}`, { stroke: INK, w: lw * 0.6 });
    const pb = project(st.cam, off(m(u0 + 0.3, 0.7), 0.37));
    if (pb) s += `<circle cx="${n(pb.x)}" cy="${n(pb.y)}" r="${n(0.09 * k)}" fill="${toneFill("gold", st.p)}" stroke="${PAPER}" stroke-width="${n(lw * 0.5)}"/>`;
  }
  add(st, LAYER.stand, toCam(st.cam, off(m(u0, 1), 0.35)).z, s);
}

function ironGateOnWall(st: Stage, slot: WallSlot): void {
  const { wall, u, w } = slot;
  wallDoor(st, wall, u + w / 2 - 0.8, 1.6, 2.4, { arched: true, open: true });
  const m = wall.map;
  const lw = wAt(st, toCam(st.cam, m(u, 1)).z);
  let d = "";
  for (let i = 0; i <= 8; i += 1) {
    const uu = u + w / 2 - 0.8 + (1.6 * i) / 8;
    d += segD(st, m(uu, 0), m(uu, 2.4 + Math.sin((i / 8) * Math.PI) * 0.6));
  }
  d += segD(st, m(u + w / 2 - 0.8, 1.2), m(u + w / 2 + 0.8, 1.2));
  wallDecal(st, pathEl(d, { stroke: PAPER, w: lw * 2.4 }) + pathEl(d, { stroke: INK, w: lw * 1.2 }), wall);
}

export function highWall(st: Stage, x0: number, x1: number, z: number, gap: number): void {
  const H = 3.2;
  const parts: [number, number][] = gap > 0 ? [[x0, -gap / 2 - 0.5], [gap / 2 + 0.5, x1]] : [[x0, x1]];
  for (const [a, b] of parts) {
    const decorate = (): string => "";
    drawBox(st, a, b, 0, H, z, z + 0.5, st.pal.wall, { top: st.snow ? PAPER : undefined });
    // coping + brick patches + ivy
    const zc = toCam(st.cam, { x: (a + b) / 2, y: H, z }).z;
    if (zc < st.cam.near) continue;
    const lw = wAt(st, zc);
    let s = "";
    s += boxSvg(st, frame("front", 0, 0), { a0: a - 0.08, a1: b + 0.08, y0: H, y1: H + 0.22, d0: z - 0.08, d1: z + 0.58 }, st.snow ? PAPER : st.pal.wall, lw);
    let bricks = "";
    const [va, vb] = xRangeAt(st.cam, z);
    const xa = Math.max(a, va - 1);
    const xb = Math.min(b, vb + 1);
    for (let p = 0; p < Math.min(8, Math.max(2, Math.round((xb - xa) / 3))); p += 1) {
      const cx = between(st.rand, xa, xb);
      const cy = between(st.rand, 0.6, H - 0.8);
      for (let r = 0; r < 4; r += 1) {
        const yy = cy + r * 0.2;
        const n2 = 3 - Math.abs(r - 1.5);
        for (let c = 0; c < n2; c += 1) {
          const u0 = cx + c * 0.34 + (r % 2) * 0.17;
          bricks += polyD(st, [{ x: u0, y: yy, z: z - 0.01 }, { x: u0 + 0.3, y: yy, z: z - 0.01 }, { x: u0 + 0.3, y: yy + 0.16, z: z - 0.01 }, { x: u0, y: yy + 0.16, z: z - 0.01 }]);
        }
      }
    }
    s += pathEl(bricks, { stroke: st.pal.ink, w: lw * 0.45 });
    // ivy clumps hanging over the top
    if (!st.snow) {
      let ivy = "";
      for (let i = 0; i < Math.max(1, Math.round((xb - xa) / 6)); i += 1) {
        const ix = between(st.rand, xa + 1, xb - 1);
        const top = project(st.cam, { x: ix, y: H + 0.2, z: z - 0.05 });
        const kk = scaleAt(st.cam, { x: ix, y: H, z });
        if (!top) continue;
        ivy += scallopBlob(top.x, top.y + kk * 0.6, kk * between(st.rand, 0.8, 1.4), kk * between(st.rand, 0.6, 1.3), st.rand);
      }
      s += pathEl(ivy, { fill: st.pal.foliageShade, stroke: st.pal.ink, w: lw * 0.7 });
    }
    void decorate;
    add(st, LAYER.stand, zc - 0.01, s);
  }
}

function scallopBlob(cx: number, cy: number, rx: number, ry: number, rand: () => number): string {
  const pts: Point[] = [];
  const N = 8;
  for (let i = 0; i < N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rx * (0.85 + rand() * 0.3), y: cy + Math.sin(a) * ry * (0.85 + rand() * 0.3) });
  }
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 0; i < N; i += 1) {
    const b = pts[(i + 1) % N];
    const a = pts[i];
    const ch = Math.hypot(b.x - a.x, b.y - a.y);
    d += `A${n(ch * 0.6)} ${n(ch * 0.6)} 0 0 1 ${n(b.x)} ${n(b.y)}`;
  }
  return `${d}Z`;
}

export function gate(st: Stage, x: number, z: number, w: number, withPillarsOnly: boolean): void {
  const fr = frame("front", 0, 0);
  const zc = toCam(st.cam, { x, y: 1.5, z }).z;
  if (zc < st.cam.near) return;
  const lw = wAt(st, zc);
  let s = "";
  for (const px of [x - w / 2 - 0.6, x + w / 2]) {
    s += boxSvg(st, fr, { a0: px, a1: px + 0.6, y0: 0, y1: 3.4, d0: z - 0.05, d1: z + 0.55 }, toneFill("stone", st.p), lw);
    s += boxSvg(st, fr, { a0: px - 0.08, a1: px + 0.68, y0: 3.4, y1: 3.6, d0: z - 0.13, d1: z + 0.63 }, st.pal.wall, lw);
    const ball = project(st.cam, { x: px + 0.3, y: 3.85, z: z + 0.25 });
    const k = scaleAt(st.cam, { x: px + 0.3, y: 3.85, z });
    if (ball) s += `<circle cx="${n(ball.x)}" cy="${n(ball.y)}" r="${n(0.25 * k)}" fill="${st.pal.wall}" stroke="${st.pal.ink}" stroke-width="${n(lw)}"/>`;
  }
  let bars = "";
  const count = Math.round(w / 0.18);
  for (let i = 0; i <= count; i += 1) {
    const bx = x - w / 2 + (w * i) / count;
    const topY = 2.5 + Math.sin((i / count) * Math.PI) * 0.7;
    bars += segD(st, { x: bx, y: 0.05, z: z + 0.25 }, { x: bx, y: topY, z: z + 0.25 });
    const tip = project(st.cam, { x: bx, y: topY + 0.18, z: z + 0.25 });
    const base = project(st.cam, { x: bx, y: topY, z: z + 0.25 });
    if (tip && base) bars += `M${n(base.x - 2)} ${n(base.y)}L${n(tip.x)} ${n(tip.y)}L${n(base.x + 2)} ${n(base.y)}`;
  }
  for (const ry of [0.35, 1.3, 2.3]) bars += segD(st, { x: x - w / 2, y: ry, z: z + 0.25 }, { x: x + w / 2, y: ry, z: z + 0.25 });
  bars += segD(st, { x, y: 0.05, z: z + 0.25 }, { x, y: 3.2, z: z + 0.25 });
  s += pathEl(bars, { stroke: INK, w: lw * 1.2 });
  void withPillarsOnly;
  add(st, LAYER.stand, zc - 0.02, s);
}

export function bars(st: Stage, a: Spot, b: Spot, h: number, frameIt = false): void {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const count = Math.max(3, Math.round(len / 0.16));
  const mid = { x: (a.x + b.x) / 2, y: h / 2, z: (a.z + b.z) / 2 };
  const zc = toCam(st.cam, mid).z;
  if (zc < st.cam.near && toCam(st.cam, { x: a.x, y: 1, z: a.z }).z < st.cam.near) return;
  let d = "";
  let hi = "";
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const q = polyD(st, [
      { x: x - 0.03, y: 0, z },
      { x: x + 0.03, y: 0, z },
      { x: x + 0.03, y: h, z },
      { x: x - 0.03, y: h, z },
    ]);
    d += q;
    hi += segD(st, { x: x - 0.012, y: 0.1, z: z - 0.02 }, { x: x - 0.012, y: h - 0.1, z: z - 0.02 });
  }
  for (const y of frameIt ? [0.1, h * 0.5, h - 0.1] : [0.15, h - 0.2]) {
    d += polyD(st, [
      { x: a.x, y: y - 0.05, z: a.z - 0.01 },
      { x: b.x, y: y - 0.05, z: b.z - 0.01 },
      { x: b.x, y: y + 0.05, z: b.z - 0.01 },
      { x: a.x, y: y + 0.05, z: a.z - 0.01 },
    ]);
  }
  add(st, LAYER.stand, Math.max(st.cam.near, zc) - 0.3, pathEl(d, { fill: INK, stroke: INK, w: 0.6 }) + pathEl(hi, { stroke: "#8a8a8a", w: 0.8 }));
}

export function picketFence(st: Stage, a: Spot, b: Spot): void {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const count = Math.round(len / 0.22);
  const zc = toCam(st.cam, { x: (a.x + b.x) / 2, y: 0.6, z: (a.z + b.z) / 2 }).z;
  if (zc < st.cam.near) return;
  const lw = wAt(st, zc);
  let pickets = "";
  const [va, vb] = xRangeAt(st.cam, (a.z + b.z) / 2);
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    if (a.z === b.z && (x < va - 1 || x > vb + 1)) continue;
    const dx = (b.x - a.x) / len;
    const dz = (b.z - a.z) / len;
    const w = 0.06;
    pickets += polyD(st, [
      { x: x - dx * w, y: 0, z: z - dz * w },
      { x: x + dx * w, y: 0, z: z + dz * w },
      { x: x + dx * w, y: 1.0, z: z + dz * w },
      { x, y: 1.12, z },
      { x: x - dx * w, y: 1.0, z: z - dz * w },
    ]);
  }
  let rails = "";
  for (const y of [0.3, 0.8]) {
    rails += polyD(st, [
      { x: a.x, y: y - 0.04, z: a.z + 0.03 },
      { x: b.x, y: y - 0.04, z: b.z + 0.03 },
      { x: b.x, y: y + 0.04, z: b.z + 0.03 },
      { x: a.x, y: y + 0.04, z: a.z + 0.03 },
    ]);
  }
  add(st, LAYER.stand, zc, pathEl(rails, { fill: st.pal.wood, stroke: st.pal.ink, w: lw * 0.7 }) + pathEl(pickets, { fill: st.snow ? PAPER : st.pal.wood, stroke: st.pal.ink, w: lw * 0.8 }));
}

/** Interior balustrade / courtroom rail across the room. */
export function railing(st: Stage, x0: number, x1: number, z: number, h: number): void {
  const zc = toCam(st.cam, { x: (x0 + x1) / 2, y: h / 2, z }).z;
  if (zc < st.cam.near) return;
  const lw = wAt(st, zc);
  let balusters = "";
  const count = Math.round((x1 - x0) / 0.3);
  for (let i = 0; i <= count; i += 1) {
    const x = x0 + ((x1 - x0) * i) / count;
    const base = project(st.cam, { x, y: 0.12, z });
    const top = project(st.cam, { x, y: h - 0.1, z });
    const k = scaleAt(st.cam, { x, y: h / 2, z });
    if (!base || !top) continue;
    const w = 0.05 * k;
    const my = (base.y + top.y) / 2;
    balusters += `M${n(base.x - w)} ${n(base.y)}L${n(base.x + w)} ${n(base.y)}Q${n(base.x + w * 2.2)} ${n(my)} ${n(top.x + w)} ${n(top.y)}L${n(top.x - w)} ${n(top.y)}Q${n(base.x - w * 2.2)} ${n(my)} ${n(base.x - w)} ${n(base.y)}Z`;
  }
  const fr = frame("front", 0, 0);
  let s = pathEl(balusters, { fill: st.pal.wood, stroke: st.pal.ink, w: lw * 0.6 });
  s += boxSvg(st, fr, { a0: x0, a1: x1, y0: h - 0.12, y1: h, d0: z - 0.08, d1: z + 0.08 }, st.pal.wood === PAPER ? toneFill("dots", st.p) : st.pal.wood, lw);
  s += boxSvg(st, fr, { a0: x0, a1: x1, y0: 0, y1: 0.12, d0: z - 0.08, d1: z + 0.08 }, st.pal.wood, lw);
  add(st, LAYER.stand, zc, s);
}

function pottedTree(st: Stage, x: number, z: number): void {
  furniture(st, [{ b: { a0: x - 0.3, a1: x + 0.3, y0: 0, y1: 0.55, d0: z - 0.3, d1: z + 0.3 }, fill: toneFill("stone", st.p) }]);
  tree(st, x, z, { h: 1.9, kind: "round", sortZ: toCam(st.cam, { x, y: 0, z }).z - 0.4 });
}

function flowerPot(st: Stage, x: number, z: number): void {
  furniture(st, [{ b: { a0: x - 0.2, a1: x + 0.2, y0: 0, y1: 0.4, d0: z - 0.2, d1: z + 0.2 }, fill: toneFill("stone", st.p) }]);
  const pl = place(st, { x, y: 0.4, z });
  if (!pl) return;
  const lw = wAt(st, pl.z);
  const P = pl.at;
  let stems = "";
  let heads = "";
  for (let i = 0; i < 5; i += 1) {
    const dx = (i - 2) * 0.1;
    const top = P(dx * 1.8, 0.45 + (i % 2) * 0.12);
    const b = P(dx * 0.3, 0);
    stems += `M${n(b.x)} ${n(b.y)}Q${n(b.x)} ${n((b.y + top.y) / 2)} ${n(top.x)} ${n(top.y)}`;
    const r = 0.07 * pl.k;
    heads += `M${n(top.x - r)} ${n(top.y)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0`;
  }
  add(st, LAYER.stand, pl.z - 0.35, pathEl(stems, { stroke: st.pal.ink, w: lw * 0.6 }) + pathEl(heads, { fill: PAPER, stroke: st.pal.ink, w: lw * 0.6 }));
}

/** River receding into depth with an arched stone bridge across it. */
function riverWithBridge(st: Stage, sites: Sites): void {
  const zBridge = sites.backZ - 1;
  const halfW = 3.2;
  const xc = sites.centre.x;
  // receding river strip
  const zNear = st.zmid * 0.5;
  const zFar = zBridge + 60;
  const left: V3[] = [];
  const right: V3[] = [];
  for (let i = 0; i <= 14; i += 1) {
    const t = i / 14;
    const z = zNear + (zFar - zNear) * t * t;
    const bend = Math.sin(t * 3 + 0.5) * 2.5 * t;
    left.push({ x: xc - halfW + bend + (st.rand() - 0.5) * 0.3, y: 0, z });
    right.push({ x: xc + halfW + bend + (st.rand() - 0.5) * 0.3, y: 0, z });
  }
  const poly = projectPoly(st.cam, [...left, ...right.slice().reverse()]);
  if (poly.length > 2) {
    let s = pathEl(polyPath(poly), { fill: st.pal.night ? toneFill("dark", st.p) : PAPER });
    let rip = "";
    for (let i = 0; i < 16 + st.lod * 8; i += 1) {
      const t = Math.pow(st.rand(), 1.6);
      const z = zNear + (zFar - zNear) * t * t;
      const bend = Math.sin(t * 3 + 0.5) * 2.5 * t;
      const x = xc + bend + between(st.rand, -halfW * 0.8, halfW * 0.6);
      rip += segD(st, { x, y: 0, z }, { x: x + between(st.rand, 0.5, 1.4), y: 0, z });
    }
    s += pathEl(rip, { stroke: st.pal.night ? PAPER : st.pal.ink, w: st.lw * 0.5 });
    const lp = left.map((p) => project(st.cam, p)).filter((p): p is Point => !!p);
    const rp = right.map((p) => project(st.cam, p)).filter((p): p is Point => !!p);
    if (lp.length > 2) s += pathEl(smoothPath(lp, false), { stroke: st.pal.ink, w: st.lw * 0.9 });
    if (rp.length > 2) s += pathEl(smoothPath(rp, false), { stroke: st.pal.ink, w: st.lw * 0.9 });
    add(st, LAYER.decal, zFar, s);
  }
  // bridge: front face with arches (holes), parapet, deck
  const x0 = xc - halfW - 3;
  const x1 = xc + halfW + 3;
  const deck = 2.6;
  const zc = toCam(st.cam, { x: xc, y: deck / 2, z: zBridge }).z;
  if (zc < st.cam.near) return;
  const lw = wAt(st, zc);
  const outer: V3[] = [
    { x: x0, y: -0.3, z: zBridge },
    { x: x1, y: -0.3, z: zBridge },
    { x: x1, y: deck, z: zBridge },
    { x: x0, y: deck, z: zBridge },
  ];
  const archMap = (u: number, y: number): V3 => ({ x: u, y, z: zBridge });
  const arch = archPoints(archMap, xc - halfW + 0.3, xc + halfW - 0.3, -0.3, 0.2, false);
  const archD = polyD(st, arch);
  let s = "";
  // underside (intrados) shadow visible through the arch
  if (archD) s += pathEl(archD, { fill: toneFill("dark", st.p) });
  const archBack = archPoints((u, y) => ({ x: u, y, z: zBridge + 3 }), xc - halfW + 0.3, xc + halfW - 0.3, -0.3, 0.2, false);
  const bd = polyD(st, archBack);
  if (bd) s += pathEl(bd, { fill: st.pal.night ? toneFill("dark", st.p) : PAPER, stroke: st.pal.ink, w: lw * 0.6 });
  s += pathEl(polyD(st, outer) + archD, { fill: toneFill("stone", st.p), stroke: st.pal.ink, w: lw, evenodd: true });
  // voussoirs
  let vs = "";
  for (let i = 1; i < 12; i += 1) {
    const a = (i / 12) * Math.PI;
    const r0 = halfW - 0.3;
    const cx = xc;
    vs += segD(st, { x: cx + Math.cos(a) * r0, y: 0.2 + Math.sin(a) * r0, z: zBridge - 0.01 }, { x: cx + Math.cos(a) * (r0 + 0.55), y: 0.2 + Math.sin(a) * (r0 + 0.55), z: zBridge - 0.01 });
  }
  s += pathEl(vs, { stroke: st.pal.ink, w: lw * 0.6 });
  // parapet + deck top
  const fr = frame("front", 0, 0);
  s += boxSvg(st, fr, { a0: x0, a1: x1, y0: deck, y1: deck + 0.9, d0: zBridge - 0.05, d1: zBridge + 0.3 }, st.pal.wall, lw);
  s += boxSvg(st, fr, { a0: x0, a1: x1, y0: deck - 0.1, y1: deck, d0: zBridge, d1: zBridge + 3 }, st.pal.wall, lw, toneFill("stone", st.p));
  add(st, LAYER.stand, zc, s);
  st.anchors.bridge = project(st.cam, { x: xc, y: deck, z: zBridge + 1.5 }) ?? st.anchors.bridge;
}

export { groundEllipse };
