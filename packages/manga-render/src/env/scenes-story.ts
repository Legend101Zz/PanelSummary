/**
 * Backdrops that stories need (v0.2, #41): the dust heap (a tall mound of
 * rubbish under a grey sky) and Paradise (cloud floor, rays of light, stars).
 * The foundry is in scenes-interior.ts (it builds on the forge).
 *
 * Everything is deterministic from the stage seed. Pattern tone is limited
 * to the shot's budget by the caller, as for every other environment.
 */
import type { Point } from "../contracts.js";
import { INK, PAPER, toneFill } from "../style.js";
import { n, polyPath, smoothPath } from "../svg.js";
import { between, seeded } from "../prng.js";
import { xRangeAt } from "./camera.js";
import { LAYER, add, boxRect, pathEl, place, placeVisible, wAt, type Place, type Stage } from "./stage.js";
import { drawGround } from "./ground.js";
import { hills, rock, treeLine } from "./nature.js";
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

// ---------------------------------------------------------------------------
// Dust heap
// ---------------------------------------------------------------------------

type Litter = "shard" | "bottle" | "bucket" | "rag" | "stalk" | "hoop" | "can" | "board";
const LITTER: readonly Litter[] = ["shard", "bottle", "bucket", "rag", "stalk", "hoop", "can", "board", "shard", "rag"];

/** One piece of rubbish at local (x, y) metres on a billboard. Sizes are about 0.3 to 0.6 m. */
function litter(st: Stage, pl: Place, kind: Litter, x: number, y: number, s: number, lw: number, flip: number): string {
  const A = (dx: number, dy: number): Point => pl.at(x + dx * s * flip, y + dy * s);
  const ink = st.pal.ink;
  switch (kind) {
    case "shard": {
      // a broken crockery shard: a ragged wedge, paper white with a thin rim line
      const d = polyPath([A(-0.28, 0), A(-0.1, 0.34), A(0.12, 0.2), A(0.3, 0.38), A(0.34, 0)]);
      return pathEl(d, { fill: PAPER, stroke: ink, w: lw * 0.8 });
    }
    case "bottle": {
      const body = polyPath([A(-0.12, 0), A(0.12, 0), A(0.12, 0.34), A(0.05, 0.46), A(0.05, 0.62), A(-0.05, 0.62), A(-0.05, 0.46), A(-0.12, 0.34)]);
      return pathEl(body, { fill: toneFill("mid", st.p), stroke: ink, w: lw * 0.8 });
    }
    case "bucket": {
      // a dented pail lying open: trapezoid and an ellipse mouth
      const d = polyPath([A(-0.26, 0.5), A(0.26, 0.5), A(0.18, 0), A(-0.18, 0)]);
      const mouth = `M${n(A(-0.26, 0.5).x)} ${n(A(-0.26, 0.5).y)}Q${n(A(0, 0.64).x)} ${n(A(0, 0.64).y)} ${n(A(0.26, 0.5).x)} ${n(A(0.26, 0.5).y)}`;
      return pathEl(d, { fill: toneFill("light", st.p), stroke: ink, w: lw * 0.9 }) + pathEl(mouth, { stroke: ink, w: lw * 0.7 });
    }
    case "rag": {
      const d = smoothPath([A(-0.4, 0), A(-0.22, 0.2), A(0, 0.1), A(0.22, 0.3), A(0.42, 0.06), A(0.3, 0)], true, 0.5);
      return pathEl(d, { fill: toneFill("dots", st.p), stroke: ink, w: lw * 0.8 });
    }
    case "stalk": {
      // a cabbage stump with ragged leaves
      let d = "";
      for (const [dx, dy] of [[-0.3, 0.5], [0, 0.66], [0.3, 0.46]] as const) {
        const b = A(0, 0);
        const t = A(dx, dy);
        d += `M${n(b.x)} ${n(b.y)}L${n(t.x)} ${n(t.y)}`;
      }
      const leaf = polyPath([A(-0.3, 0.5), A(-0.48, 0.58), A(-0.34, 0.68)]);
      return pathEl(d, { stroke: ink, w: lw * 0.9 }) + pathEl(leaf, { fill: PAPER, stroke: ink, w: lw * 0.6 });
    }
    case "hoop": {
      // a barrel hoop standing on its edge: two nested ellipses
      const c = A(0, 0.32);
      const k = pl.k * s;
      return (
        `<ellipse cx="${n(c.x)}" cy="${n(c.y)}" rx="${n(0.34 * k)}" ry="${n(0.3 * k)}" fill="none" stroke="${ink}" stroke-width="${n(lw * 1.1)}"/>` +
        `<ellipse cx="${n(c.x)}" cy="${n(c.y)}" rx="${n(0.27 * k)}" ry="${n(0.23 * k)}" fill="none" stroke="${ink}" stroke-width="${n(lw * 0.5)}"/>`
      );
    }
    case "can": {
      const d = polyPath([A(-0.14, 0), A(0.14, 0), A(0.14, 0.3), A(-0.14, 0.3)]);
      return pathEl(d, { fill: toneFill("light", st.p), stroke: ink, w: lw * 0.8 }) + pathEl(`M${n(A(-0.14, 0.2).x)} ${n(A(-0.14, 0.2).y)}L${n(A(0.14, 0.2).x)} ${n(A(0.14, 0.2).y)}`, { stroke: ink, w: lw * 0.4 });
    }
    case "board": {
      const d = polyPath([A(-0.5, 0), A(0.5, 0.18), A(0.46, 0.3), A(-0.54, 0.12)]);
      return pathEl(d, { fill: st.pal.wood, stroke: ink, w: lw * 0.8 });
    }
  }
}

/** A mound as a billboard: the profile points (metres) and the heap's litter. */
function heap(st: Stage, x: number, z: number, w: number, h: number, seed: string, count: number): void {
  const pl = place(st, { x, y: 0, z });
  if (!pl || !placeVisible(st, pl, w / 2, h)) return;
  const r = seeded(st.seed, st.env, seed);
  const lw = wAt(st, pl.z);
  // a lumpy profile: a broad, slightly skewed hump
  const skew = between(r, -0.18, 0.18);
  const prof: Point[] = [];
  const N = 14;
  const at: { x: number; y: number }[] = [];
  for (let i = 0; i <= N; i += 1) {
    const t = i / N;
    const u = t * 2 - 1;
    const hump = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u - skew), 1.7)), 0.8);
    const y = h * hump * (1 + (i % 3 === 0 ? 0.06 : -0.03) * (i > 0 && i < N ? 1 : 0)) + (i > 0 && i < N ? between(r, -0.04, 0.05) * h : 0);
    at.push({ x: u * (w / 2), y });
    prof.push(pl.at(u * (w / 2), y));
  }
  const body = `${smoothPath(prof, false, 0.45)}L${n(pl.at(w / 2, -0.05).x)} ${n(pl.at(w / 2, -0.05).y)}L${n(pl.at(-w / 2, -0.05).x)} ${n(pl.at(-w / 2, -0.05).y)}Z`;
  let s = pathEl(body, { fill: st.pal.night ? toneFill("dark", st.p) : toneFill("dots", st.p), stroke: st.pal.ink, w: lw * 1.1 });
  // ash and cinders: short ticks on the slope
  let ticks = "";
  for (let i = 0; i < 6 + st.lod * 8; i += 1) {
    const t = between(r, 0.1, 0.9);
    const a = at[Math.min(N, Math.max(0, Math.round(t * N)))];
    const yy = between(r, 0.05, 0.85) * a.y;
    const p0 = pl.at(a.x * between(r, 0.5, 1), yy);
    ticks += `M${n(p0.x)} ${n(p0.y)}l${n(pl.k * 0.16)} ${n(-pl.k * 0.04)}`;
  }
  s += pathEl(ticks, { stroke: st.pal.ink, w: lw * 0.5 });
  // rubbish on the heap (more with detail)
  const pieces = Math.min(count, 4 + st.lod * 5);
  for (let i = 0; i < pieces; i += 1) {
    const t = between(r, 0.05, 0.95);
    const a = at[Math.min(N, Math.max(0, Math.round(t * N)))];
    const kind = LITTER[Math.floor(r() * LITTER.length) % LITTER.length];
    s += litter(st, pl, kind, a.x * between(r, 0.6, 1), between(r, 0.05, 0.9) * a.y, between(r, 0.8, 1.35), lw, r() < 0.5 ? -1 : 1);
  }
  add(st, LAYER.stand, pl.z, s);
}

/**
 * A rubbish dump: a bare, trampled yard under a heavy sky; one big heap at
 * the back with crockery, bottles, a pail, rags, cabbage stumps and a barrel
 * hoop, a smaller heap beside it, and litter strewn on the ground in front.
 */
export function dustheap(st: Stage): Sites {
  const night = st.pal.night;
  hills(st, 0.08, night ? toneFill("dark", st.p) : toneFill("light", st.p), 1200, 2.4);
  treeLine(st, 0.045, 700, night ? toneFill("black", st.p) : toneFill("dots", st.p));
  drawGround(st, "dirt", { density: 1.1 });
  const r = seeded(st.seed, st.env, "dustheap");
  const zBig = st.zmid + (st.shot === "establishing" ? 9 : 5.5);
  const [xa, xb] = xRangeAt(st.cam, zBig);
  const wide = Math.max(7, (xb - xa) * 0.75);
  // the big heap, left of centre so a figure stands clear on the right
  heap(st, xa * 0.1 - wide * 0.1, zBig, Math.min(wide, 15), Math.min(4.6, wide * 0.36), "big", 16);
  // a second, smaller heap further back on the right
  heap(st, xb * 0.55, zBig + 6, Math.min(wide * 0.7, 10), Math.min(3.1, wide * 0.24), "small", 9);
  // strewn litter on the ground in the middle depth and in front
  const [na, nb] = xRangeAt(st.cam, st.zmid + 1.2);
  for (let i = 0; i < (st.lod === 0 ? 0 : 1 + st.lod * 2); i += 1) {
    const z = st.zmid + between(r, 0.4, 3);
    const x = between(r, na, nb) * 0.9;
    const pl = place(st, { x, y: 0, z });
    if (!pl || !placeVisible(st, pl, 0.6, 0.8)) continue;
    const lw = wAt(st, pl.z);
    const kind = LITTER[Math.floor(r() * LITTER.length) % LITTER.length];
    add(st, LAYER.decal, pl.z, litter(st, pl, kind, 0, 0, between(r, 0.45, 0.7), lw, r() < 0.5 ? -1 : 1));
  }
  for (let i = 0; i < 2; i += 1) rock(st, between(r, na, nb) * 0.8, st.zmid + between(r, 2, 8), between(r, 0.25, 0.5));
  return outdoorSites(st, zBig + 3, st.zmid + 1);
}

// ---------------------------------------------------------------------------
// Paradise
// ---------------------------------------------------------------------------

/** Four-point star mark. */
function starD(x: number, y: number, r: number): string {
  const q = r * 0.24;
  return `M${n(x)} ${n(y - r)}L${n(x + q)} ${n(y - q)}L${n(x + r)} ${n(y)}L${n(x + q)} ${n(y + q)}L${n(x)} ${n(y + r)}L${n(x - q)} ${n(y + q)}L${n(x - r)} ${n(y)}L${n(x - q)} ${n(y - q)}Z`;
}

/**
 * Paradise: a high bright sky. Rays of light fan out from a glow above the
 * middle of the panel, a floor of soft cloud banks (near ones big and low),
 * and four-point stars drifting in the light. No horizon, no architecture.
 */
export function paradise(st: Stage): Sites {
  const b = st.box;
  drawSky(st, { full: true, clouds: 0 });
  const r = seeded(st.seed, st.env, "paradise");
  const night = st.pal.night;
  const cx = b.x + b.w * between(r, 0.42, 0.58);
  const cy = b.y + b.h * 0.12;
  // rays: wedges from the glow, widest outward, leaving the lower middle clear for figures
  const rays = st.lod >= 2 ? 15 : st.lod === 1 ? 11 : 7;
  let wedges = "";
  const reach = Math.hypot(b.w, b.h) * 1.1;
  for (let i = 0; i < rays; i += 1) {
    const a = Math.PI * (0.06 + (0.88 * (i + between(r, 0.2, 0.8))) / rays);
    const half = between(r, 0.012, 0.03);
    wedges += `M${n(cx)} ${n(cy)}L${n(cx + Math.cos(a - half) * reach)} ${n(cy + Math.sin(a - half) * reach)}L${n(cx + Math.cos(a + half) * reach)} ${n(cy + Math.sin(a + half) * reach)}Z`;
  }
  add(st, LAYER.sky, -1, pathEl(wedges, { fill: night ? toneFill("mid", st.p) : toneFill("light", st.p), opacity: night ? 0.55 : 0.8 }));
  // the glow: nested paper discs with thin rings
  let glow = "";
  const R = Math.min(b.w, b.h) * 0.2;
  for (const [k, w] of [[1, 0.9], [0.68, 0.7], [0.4, 0.55]] as const) {
    glow += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R * k)}" fill="${PAPER}" stroke="${INK}" stroke-width="${n(st.lw * w)}"/>`;
  }
  add(st, LAYER.sky, -2, glow);
  // cloud floor: banks at three depths, near ones low and large
  const layers = st.lod >= 2 ? 3 : 2;
  for (let l = layers - 1; l >= 0; l -= 1) {
    const count = 3 + l;
    let d = "";
    let det = "";
    for (let i = 0; i < count; i += 1) {
      const w = b.w * between(r, 0.34, 0.6) * (1 - l * 0.2);
      const h = w * between(r, 0.26, 0.36);
      const x = b.x + b.w * ((i + 0.5) / count) + between(r, -0.08, 0.08) * b.w;
      const y = b.y + b.h * (0.96 - l * 0.13) + between(r, -0.02, 0.03) * b.h;
      d += cloudD(x, y, w, h, r);
      det += `M${n(x - w * 0.22)} ${n(y + h * 0.18)}q${n(w * 0.09)} ${n(-h * 0.22)} ${n(w * 0.18)} 0M${n(x + w * 0.06)} ${n(y + h * 0.26)}q${n(w * 0.07)} ${n(-h * 0.2)} ${n(w * 0.14)} 0`;
    }
    add(st, LAYER.stand, 200 - l * 40, pathEl(d, { fill: night ? toneFill("dark", st.p) : PAPER, stroke: st.pal.ink, w: st.lw * (1 - l * 0.15) }) + pathEl(det, { stroke: st.pal.ink, w: st.lw * 0.45 }));
  }
  // stars in the light (kept off the lower-middle where figures stand)
  let stars = "";
  const count = st.lod >= 2 ? 16 : st.lod === 1 ? 10 : 5;
  for (let i = 0; i < count; i += 1) {
    const x = b.x + b.w * between(r, 0.04, 0.96);
    const y = b.y + b.h * between(r, 0.04, 0.7);
    if (Math.abs(x - cx) < b.w * 0.14 && y < cy + R * 1.4) continue;
    stars += starD(x, y, between(r, 0.012, 0.03) * Math.min(b.w, b.h) * 1.6);
  }
  add(st, LAYER.sky, -3, pathEl(stars, { fill: night ? PAPER : INK, stroke: INK, w: st.lw * 0.3 }));
  if (st.lod === 0) add(st, LAYER.atmos, -1, boxRect(st, PAPER, 0.25));
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
