/** Ground planes: fill + perspective texture (cobbles, boards, tiles, grass...). */
import { INK, PAPER, toneFill } from "../style.js";
import { n } from "../svg.js";
import { between } from "../prng.js";
import { planeAt, project, scaleAt, xRangeAt, type V3 } from "./camera.js";
import { LAYER, add, pathEl, rectD, segD, type Stage } from "./stage.js";

export type GroundKind =
  | "cobbles"
  | "flags"
  | "boards"
  | "checker"
  | "grass"
  | "dirt"
  | "sand"
  | "straw"
  | "snow"
  | "roof"
  | "plain";

/** Screen y range covered by the ground plane inside the box. */
export function groundBand(st: Stage): { top: number; bottom: number } | null {
  const b = st.box;
  const top = Math.max(b.y, st.cam.horizonY + 0.5);
  const bottom = b.y + b.h;
  if (top >= bottom - 1) return null;
  return { top, bottom };
}

/** Visible ground depth range, capped. */
export function groundDepths(st: Stage, cap: number): { near: number; far: number } | null {
  const band = groundBand(st);
  if (!band) return null;
  const near = planeAt(st.cam, st.cam.px, band.bottom + 2, 0)?.z;
  const farHit = planeAt(st.cam, st.cam.px, band.top + 1, 0);
  if (near === undefined) return null;
  const far = Math.min(cap, farHit ? farHit.z : cap);
  return { near: Math.max(0.2, near), far: Math.max(near + 0.1, far) };
}

/** Deterministic smooth-ish mask so texture comes in patches, not wallpaper. */
function patchMask(rand: () => number): (x: number, z: number) => number {
  const a = between(rand, 0.25, 0.5);
  const b2 = between(rand, 0.2, 0.45);
  const p1 = rand() * 6.28;
  const p2 = rand() * 6.28;
  const p3 = rand() * 6.28;
  return (x, z) => Math.sin(x * a + p1) * Math.sin(z * b2 + p2) + 0.5 * Math.sin(x * 0.9 + z * 0.7 + p3);
}

/** Row depths from near to far with fixed world spacing, stopping when rows get too dense on screen. */
function rows(st: Stage, near: number, far: number, spacing: number, minPx: number): number[] {
  const out: number[] = [];
  const start = Math.ceil(near / spacing) * spacing;
  for (let z = start; z <= far; z += spacing) {
    const a = project(st.cam, { x: 0, y: 0, z });
    const b = project(st.cam, { x: 0, y: 0, z: z + spacing });
    if (!a || !b) break;
    if (Math.abs(a.y - b.y) < minPx) break;
    out.push(z);
    if (out.length > 400) break;
  }
  return out;
}

export interface GroundOptions {
  /** World depth cap (e.g. the back wall of a room). */
  cap?: number;
  /** Lateral limits (e.g. room walls). */
  xMin?: number;
  xMax?: number;
  fill?: string;
  density?: number;
  /** Paint as a standing item (e.g. a roof deck that must occlude things beyond its edge). */
  layer?: number;
  z?: number;
  /** Fill only up to the cap depth's screen line (not to the horizon). */
  fillToCap?: boolean;
}

export function drawGround(st: Stage, kind: GroundKind, opts: GroundOptions = {}): void {
  const band0 = groundBand(st);
  if (!band0) return;
  let band = band0;
  if (opts.fillToCap && opts.cap !== undefined) {
    const capP = project(st.cam, { x: 0, y: 0, z: opts.cap });
    if (capP) band = { top: Math.max(band0.top, capP.y), bottom: band0.bottom };
    if (band.top >= band.bottom - 1) return;
  }
  const layer = opts.layer ?? LAYER.ground;
  const itemZ = opts.z ?? 0;
  const b = st.box;
  const fill = opts.fill ?? (st.snow && kind !== "boards" && kind !== "checker" ? PAPER : st.pal.ground);
  let s = pathEl(rectD(b.x - 2, band.top, b.w + 4, band.bottom - band.top + 2), { fill });
  const depth = groundDepths(st, opts.cap ?? st.zmid * 40);
  const ink = st.pal.night ? "#2a2a2a" : st.pal.ink;
  const detailW = st.lw * 0.5;
  if (!depth || st.lod === 0) {
    add(st, layer, itemZ, s + (depth ? softGround(st, kind, band) : ""));
    return;
  }
  const effKind: GroundKind = st.snow && kind !== "boards" && kind !== "checker" && kind !== "roof" ? "snow" : kind;
  const clampX = (r: [number, number]): [number, number] => [Math.max(opts.xMin ?? -1e9, r[0] - 1), Math.min(opts.xMax ?? 1e9, r[1] + 1)];
  const mask = patchMask(st.rand);
  const dens = opts.density ?? 1;
  switch (effKind) {
    case "cobbles":
    case "flags": {
      // Stones as short sagging dashes. Coverage is even across the plaza
      // (no blotchy patches) and thins smoothly with distance; stones outside
      // the panel are never emitted.
      const sp = effKind === "cobbles" ? 0.42 : 0.9;
      const stoneW = sp * (effKind === "cobbles" ? 1.3 : 1.6);
      const zs = rows(st, depth.near, depth.far, sp, 4.5);
      let stones = "";
      let joints = "";
      const budget = 560;
      const left = b.x - 6;
      const right = b.x + b.w + 6;
      // near rows complete, far rows sparse; the whole plaza shares one stone
      // budget, spread over every row (never spent on the first rows alone)
      const keepAt = (i: number) => 1 - 0.85 * Math.pow(zs.length > 1 ? i / (zs.length - 1) : 0, 1.2);
      let expected = 0;
      zs.forEach((z, i) => {
        const [x0, x1] = clampX(xRangeAt(st.cam, z));
        expected += Math.max(0, (x1 - x0) / stoneW) * keepAt(i);
      });
      // when over budget, thin the far rows much more than the near ones
      const thin = expected > budget ? budget / expected : 1;
      const rowThin = (i: number) => Math.pow(thin, 0.35 + 1.3 * (zs.length > 1 ? i / (zs.length - 1) : 0));
      zs.forEach((z, i) => {
        const [x0, x1] = clampX(xRangeAt(st.cam, z));
        const a = project(st.cam, { x: 0, y: 0, z });
        const b2 = project(st.cam, { x: 0, y: 0, z: z + sp });
        const rowPx = a && b2 ? Math.abs(a.y - b2.y) : 0;
        const keep = keepAt(i) * rowThin(i);
        const off = i % 2 === 0 ? 0 : stoneW / 2;
        for (let x = Math.floor(x0 / stoneW) * stoneW + off; x < x1; x += stoneW) {
          const roll = st.rand();
          if (roll > keep) continue;
          const pa = project(st.cam, { x: x + stoneW * 0.08, y: 0, z });
          const pb = project(st.cam, { x: x + stoneW * 0.92, y: 0, z });
          if (!pa || !pb) continue;
          if (Math.max(pa.x, pb.x) < left || Math.min(pa.x, pb.x) > right) continue;
          const sag = Math.max(0.6, rowPx * 0.28);
          stones += `M${n(pa.x)} ${n(pa.y)}q${n((pb.x - pa.x) / 2)} ${n(sag)} ${n(pb.x - pa.x)} ${n(pb.y - pa.y)}`;
          if (rowPx >= 9 && roll < keep * 0.4) {
            const pc = project(st.cam, { x: x + stoneW * 0.04, y: 0, z: z + sp * 0.2 });
            const pd2 = project(st.cam, { x: x + stoneW * 0.04, y: 0, z: z + sp * 0.8 });
            if (pc && pd2) joints += `M${n(pc.x)} ${n(pc.y)}L${n(pd2.x)} ${n(pd2.y)}`;
          }
        }
      });
      s += pathEl(stones, { stroke: ink, w: detailW }) + pathEl(joints, { stroke: ink, w: detailW * 0.8 });
      break;
    }
    case "boards": {
      const sp = 0.24;
      const [xa, xb] = clampX(xRangeAt(st.cam, depth.far));
      let d = "";
      for (let x = Math.ceil(xa / sp) * sp; x <= xb; x += sp) {
        d += segD(st, { x, y: 0, z: depth.near }, { x, y: 0, z: depth.far });
      }
      // butt joints
      let j = "";
      for (let x = Math.ceil(xa / sp) * sp; x <= xb; x += sp) {
        let z = depth.near + st.rand() * 1.5;
        while (z < depth.far) {
          j += segD(st, { x, y: 0, z }, { x: x + sp, y: 0, z });
          z += between(st.rand, 1.6, 3.2);
        }
      }
      s += pathEl(d, { stroke: ink, w: detailW }) + pathEl(j, { stroke: ink, w: detailW * 0.8 });
      break;
    }
    case "checker": {
      const sp = 1.1;
      const zs = rows(st, depth.near - sp, depth.far, sp, 2.2);
      let dark = "";
      let lines = "";
      zs.forEach((z) => {
        const [x0, x1] = clampX(xRangeAt(st.cam, z + sp));
        const k0 = Math.floor(x0 / sp);
        const k1 = Math.ceil(x1 / sp);
        const zi = Math.round(z / sp);
        for (let k = k0; k < k1; k += 1) {
          if ((k + zi) % 2 === 0) continue;
          const xL = k * sp;
          const pts: V3[] = [
            { x: xL, y: 0, z },
            { x: xL + sp, y: 0, z },
            { x: xL + sp, y: 0, z: z + sp },
            { x: xL, y: 0, z: z + sp },
          ];
          const q = pts.map((p) => project(st.cam, p));
          if (q.some((p) => !p)) continue;
          dark += `M${q.map((p) => `${n(p!.x)} ${n(p!.y)}`).join("L")}Z`;
        }
      });
      const lastZ = zs.length ? zs[zs.length - 1] + sp : depth.near;
      if (lastZ < depth.far) {
        const fy = project(st.cam, { x: 0, y: 0, z: lastZ });
        if (fy && fy.y > band.top) s += pathEl(rectD(b.x - 2, band.top, b.w + 4, fy.y - band.top + 0.5), { fill: toneFill("mid", st.p) });
      }
      s += pathEl(dark, { fill: st.pal.night ? INK : toneFill("dark", st.p) });
      s += pathEl(lines, { stroke: ink, w: detailW });
      break;
    }
    case "roof": {
      const sp = 0.3;
      const zs = rows(st, depth.near, depth.far, sp, 3);
      let d = "";
      zs.forEach((z, i) => {
        const [x0, x1] = clampX(xRangeAt(st.cam, z));
        d += segD(st, { x: x0, y: 0, z }, { x: x1, y: 0, z });
        const tw = 0.34;
        for (let x = Math.floor(x0 / tw) * tw + (i % 2) * tw * 0.5; x < x1; x += tw) {
          if (mask(x, z) < -0.2) continue;
          d += segD(st, { x, y: 0, z }, { x, y: 0, z: z + sp });
        }
      });
      s += pathEl(d, { stroke: ink, w: detailW });
      break;
    }
    case "grass":
    case "dirt":
    case "sand":
    case "straw":
    case "snow":
    case "plain": {
      s += scatter(st, effKind, band, dens);
      break;
    }
  }
  add(st, layer, itemZ, s);
}

/** Close-up ground: just a couple of soft lines. */
function softGround(st: Stage, kind: GroundKind, band: { top: number; bottom: number }): string {
  const b = st.box;
  if (band.bottom - band.top < 8) return "";
  let d = "";
  const count = kind === "boards" || kind === "checker" ? 3 : 2;
  for (let i = 0; i < count; i += 1) {
    const y = band.top + (band.bottom - band.top) * (0.25 + i * 0.3);
    const x0 = b.x + b.w * between(st.rand, 0, 0.3);
    d += `M${n(x0)} ${n(y)}L${n(x0 + b.w * between(st.rand, 0.3, 0.6))} ${n(y)}`;
  }
  return pathEl(d, { stroke: st.pal.ink, w: st.lw * 0.45, opacity: 0.6 });
}

/** Screen-space scatter of small ground marks sized by perspective. */
function scatter(st: Stage, kind: GroundKind, band: { top: number; bottom: number }, dens: number): string {
  const b = st.box;
  const area = b.w * (band.bottom - band.top);
  const base = kind === "sand" ? 900 : kind === "snow" ? 9000 : kind === "plain" ? 12000 : kind === "straw" ? 1600 : 1900;
  const count = Math.min(420, Math.round((area / base) * dens * (st.lod >= 3 ? 1 : 0.7)));
  const ink = st.pal.night ? "#2a2a2a" : st.pal.ink;
  let d = "";
  let dots = "";
  for (let i = 0; i < count; i += 1) {
    const u = st.rand();
    // bias toward the foreground (lower part) — sparser toward the horizon
    const v = Math.pow(st.rand(), 0.7);
    const sx = b.x + u * b.w;
    const sy = band.top + 3 + v * (band.bottom - band.top - 3);
    const hit = planeAt(st.cam, sx, sy, 0);
    if (!hit) continue;
    const k = scaleAt(st.cam, { x: hit.x, y: 0, z: hit.z });
    if (kind === "grass") {
      const hgt = Math.min(22, Math.max(2.2, 0.18 * k));
      if (hgt < 2.4) continue;
      const w = hgt * 0.6;
      d += `M${n(sx - w)} ${n(sy - hgt * 0.35)}Q${n(sx - w * 0.3)} ${n(sy)} ${n(sx - w * 0.1)} ${n(sy)}`;
      d += `M${n(sx)} ${n(sy - hgt)}Q${n(sx)} ${n(sy - hgt * 0.2)} ${n(sx + w * 0.05)} ${n(sy)}`;
      d += `M${n(sx + w)} ${n(sy - hgt * 0.55)}Q${n(sx + w * 0.3)} ${n(sy - hgt * 0.1)} ${n(sx + w * 0.15)} ${n(sy)}`;
    } else if (kind === "dirt" || kind === "plain") {
      const len = Math.min(26, Math.max(2, 0.5 * k));
      if (st.rand() < 0.35) {
        const r = Math.max(0.6, Math.min(4, 0.05 * k));
        dots += `M${n(sx - r)} ${n(sy)}a${n(r)} ${n(r * 0.6)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r * 0.6)} 0 1 0 ${n(-r * 2)} 0`;
      } else d += `M${n(sx - len / 2)} ${n(sy)}l${n(len)} 0`;
    } else if (kind === "sand") {
      const r = Math.max(0.5, Math.min(1.6, 0.012 * k));
      dots += `M${n(sx - r)} ${n(sy)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0`;
    } else if (kind === "straw") {
      const len = Math.min(30, Math.max(2, 0.35 * k));
      const a = between(st.rand, -0.5, 0.5);
      d += `M${n(sx)} ${n(sy)}l${n(Math.cos(a) * len)} ${n(Math.sin(a) * len * 0.4)}`;
    } else if (kind === "snow") {
      const len = Math.min(60, Math.max(4, 1.6 * k));
      d += `M${n(sx - len / 2)} ${n(sy)}q${n(len / 2)} ${n(-len * 0.12)} ${n(len)} 0`;
    }
  }
  return pathEl(d, { stroke: ink, w: st.lw * (kind === "grass" ? 0.55 : 0.45) }) + pathEl(dots, { fill: ink });
}
