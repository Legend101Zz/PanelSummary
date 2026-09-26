/** Sky, time-of-day and weather backdrops (page space, painted first). */
import { INK, PAPER, toneFill } from "../style.js";
import { n, polyPath, smoothPath } from "../svg.js";
import { between } from "../prng.js";
import type { Point } from "../contracts.js";
import { LAYER, add, boxRect, pathEl, rectD, type Stage } from "./stage.js";

/** Screen band occupied by sky (top of box to horizon, clamped). */
export function skyBand(st: Stage): { top: number; bottom: number } {
  const b = st.box;
  const bottom = Math.min(b.y + b.h, st.cam.horizonY);
  return { top: b.y, bottom };
}

/** Scalloped cumulus outline: flat-ish base, arc bumps on top. */
export function cloudD(cx: number, cy: number, w: number, h: number, rand: () => number): string {
  const bumps = 4 + Math.floor(rand() * 3);
  const x0 = cx - w / 2;
  const base = cy + h * 0.5;
  const pts: Point[] = [];
  // bottom edge, slightly wavy, from right to left
  pts.push({ x: x0 + w, y: base });
  pts.push({ x: x0 + w * 0.5, y: base + h * 0.06 });
  pts.push({ x: x0, y: base });
  let d = `M${n(x0 + w * 0.02)} ${n(base)}`;
  let x = x0 + w * 0.02;
  const step = (w * 0.96) / bumps;
  for (let i = 0; i < bumps; i += 1) {
    const nx = x + step * between(rand, 0.85, 1.15);
    const tx = i === bumps - 1 ? x0 + w * 0.98 : Math.min(nx, x0 + w * 0.98);
    const mid = (i + 0.5) / bumps;
    const lift = Math.sin(mid * Math.PI) * h * between(rand, 0.75, 1.05);
    const r = Math.max(step * 0.55, lift * 0.62);
    const ty = base - lift * 0.55;
    d += `A${n(r)} ${n(r * 0.9)} 0 0 1 ${n(tx)} ${n(i === bumps - 1 ? base : ty)}`;
    x = tx;
  }
  d += `Q${n(x0 + w * 0.5)} ${n(base + h * 0.12)} ${n(x0 + w * 0.02)} ${n(base)}Z`;
  void pts;
  return d;
}

function stars(st: Stage, top: number, bottom: number, count: number): string {
  const b = st.box;
  let dots = "";
  let sparks = "";
  for (let i = 0; i < count; i += 1) {
    const x0 = b.x + st.rand() * b.w;
    const y0 = top + Math.pow(st.rand(), 1.3) * (bottom - top) * 0.92;
    const big = st.rand() < 0.14;
    if (big) {
      const r = between(st.rand, 3.5, 6);
      // a star glint stays wholly inside the panel (never cut by the border)
      const x = Math.max(b.x + r + 3, Math.min(b.x + b.w - r - 3, x0));
      const y = Math.max(b.y + r + 3, Math.min(b.y + b.h - r - 3, y0));
      const q = r * 0.22;
      sparks += polyPath([
        { x, y: y - r },
        { x: x + q, y: y - q },
        { x: x + r, y },
        { x: x + q, y: y + q },
        { x, y: y + r },
        { x: x - q, y: y + q },
        { x: x - r, y },
        { x: x - q, y: y - q },
      ]);
    } else {
      const r = between(st.rand, 0.6, 1.5);
      const x = x0;
      const y = y0;
      dots += `M${n(x - r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0`;
    }
  }
  return pathEl(dots, { fill: PAPER }) + pathEl(sparks, { fill: PAPER });
}

function moon(st: Stage, top: number, bottom: number): string {
  const b = st.box;
  const r = Math.max(9, Math.min(b.w, b.h) * 0.07);
  const x = b.x + b.w * (st.rand() < 0.5 ? between(st.rand, 0.12, 0.3) : between(st.rand, 0.7, 0.88));
  const y = top + Math.max(r * 1.6, (bottom - top) * between(st.rand, 0.18, 0.32));
  if (y + r > bottom) return "";
  st.anchors.moon = { x, y };
  const halo = `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 1.45)}" fill="none" stroke="${PAPER}" stroke-width="${n(st.lw * 0.6)}" stroke-opacity="0.45"/>`;
  const disc = `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${PAPER}"/>`;
  const bite = `<circle cx="${n(x + r * 0.42)}" cy="${n(y - r * 0.2)}" r="${n(r * 0.86)}" fill="${st.pal.sky}"/>`;
  return halo + disc + bite;
}

function hatchBand(st: Stage, y0: number, y1: number, spacing: number, w: number, color: string, jitter = 0.35): string {
  const b = st.box;
  let d = "";
  for (let y = y0; y < y1; y += spacing) {
    const inset0 = st.rand() * b.w * jitter;
    const inset1 = st.rand() * b.w * jitter;
    d += `M${n(b.x + inset0)} ${n(y)}L${n(b.x + b.w - inset1)} ${n(y)}`;
  }
  return pathEl(d, { stroke: color, w });
}

function sun(st: Stage, y: number, r: number, stripes: boolean): string {
  const b = st.box;
  const x = b.x + b.w * between(st.rand, 0.55, 0.78);
  let s = `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${PAPER}" stroke="${INK}" stroke-width="${n(st.lw * 0.7)}"/>`;
  if (stripes) {
    let d = "";
    for (let i = 1; i <= 4; i += 1) {
      const yy = y - r * 0.15 + i * r * 0.18;
      d += `M${n(x - r * 1.1)} ${n(yy)}L${n(x + r * 1.1)} ${n(yy)}`;
    }
    s += pathEl(d, { stroke: PAPER, w: r * 0.07 });
  }
  st.anchors.sun = { x, y };
  return s;
}

export interface SkyOptions {
  clouds?: number;
  /** Draw a cloud field below the horizon too (for the "sky" environment). */
  full?: boolean;
}

/** Paints the whole box with the sky and time/weather treatment. */
export function drawSky(st: Stage, opts: SkyOptions = {}): void {
  const { top, bottom } = skyBand(st);
  const b = st.box;
  let s = boxRect(st, st.pal.sky);
  const bandBottom = opts.full ? b.y + b.h : bottom;
  const h = bandBottom - top;
  const t = (tone: Parameters<typeof toneFill>[0]) => toneFill(tone, st.p);
  if (h > 6) {
    if (st.time === "dusk") {
      s += pathEl(rectD(b.x - 2, top - 2, b.w + 4, h * 0.34 + 2), { fill: t("dense_dots") });
      s += pathEl(rectD(b.x - 2, top + h * 0.34, b.w + 4, h * 0.3), { fill: t("dots") });
      s += hatchBand(st, top + h * 0.3, top + h * 0.4, 3.2, 1.3, PAPER, 0.4);
      s += hatchBand(st, top + h * 0.6, top + h * 0.72, 3.6, 1.1, PAPER, 0.4);
      if (!opts.full && bottom < b.y + b.h + 1) s += sun(st, bottom, Math.min(b.w, b.h) * 0.11, true);
      s += hatchBand(st, top + h * 0.78, bottom, 7, st.lw * 0.45, INK, 0.5);
    } else if (st.time === "dawn") {
      s += pathEl(rectD(b.x - 2, top + h * 0.62, b.w + 4, h * 0.38 + 2), { fill: t("dots") });
      s += hatchBand(st, top + h * 0.58, top + h * 0.7, 3.4, 1.2, PAPER, 0.45);
      if (!opts.full && bottom < b.y + b.h + 1) {
        const r = Math.min(b.w, b.h) * 0.1;
        s += sun(st, bottom, r, false);
        const sp = st.anchors.sun;
        if (sp) {
          let d = "";
          for (let i = 0; i < 9; i += 1) {
            const a = Math.PI + (i + 0.5) * (Math.PI / 9);
            d += `M${n(sp.x + Math.cos(a) * r * 1.35)} ${n(sp.y + Math.sin(a) * r * 1.35)}L${n(sp.x + Math.cos(a) * r * 2.1)} ${n(sp.y + Math.sin(a) * r * 2.1)}`;
          }
          s += pathEl(d, { stroke: INK, w: st.lw * 0.6 });
        }
      }
    } else if (st.pal.night) {
      s += stars(st, top, bandBottom, Math.round((b.w * h) / 2600));
      s += moon(st, top, bottom);
    }
    if (st.weather === "storm") {
      s += stormClouds(st, top, bandBottom);
    }
    const cloudCount = opts.clouds ?? (st.weather === "clear" || st.weather === "wind" ? Math.max(0, st.lod - 1) + (st.soft ? 0 : 1) : st.lod >= 1 ? 2 : 0);
    if (!st.pal.night && st.time !== "dusk") s += clouds(st, top, bandBottom, cloudCount);
  }
  add(st, LAYER.sky, 0, s);
}

function clouds(st: Stage, top: number, bottom: number, count: number): string {
  const b = st.box;
  const h = bottom - top;
  if (h < 30 || count <= 0) return "";
  let fillD = "";
  let detail = "";
  const lw = st.lw * (st.soft ? 0.6 : 0.8);
  const grey = st.weather !== "clear" && st.weather !== "wind";
  for (let i = 0; i < count; i += 1) {
    const w = b.w * between(st.rand, 0.18, 0.34);
    const ch = Math.min(h * 0.35, w * between(st.rand, 0.32, 0.45));
    const cx = b.x + b.w * ((i + 0.5) / count) + between(st.rand, -0.08, 0.08) * b.w;
    const cy = top + ch * 0.6 + st.rand() * Math.max(1, h * 0.55 - ch);
    fillD += cloudD(cx, cy, w, ch, st.rand);
    // a couple of inner curls on the shaded underside
    const by = cy + ch * 0.28;
    detail += `M${n(cx - w * 0.3)} ${n(by)}q${n(w * 0.08)} ${n(-ch * 0.18)} ${n(w * 0.16)} 0`;
    detail += `M${n(cx + w * 0.05)} ${n(by + ch * 0.05)}q${n(w * 0.07)} ${n(-ch * 0.16)} ${n(w * 0.14)} 0`;
  }
  return (
    pathEl(fillD, { fill: grey ? toneFill("light", st.p) : PAPER, stroke: st.pal.ink, w: lw }) +
    pathEl(detail, { stroke: st.pal.ink, w: lw * 0.6 })
  );
}

function stormClouds(st: Stage, top: number, bottom: number): string {
  const b = st.box;
  const h = bottom - top;
  let d = "";
  for (let i = 0; i < 4; i += 1) {
    const w = b.w * between(st.rand, 0.35, 0.55);
    const ch = Math.max(20, h * 0.28);
    d += cloudD(b.x + b.w * (i / 3), top + ch * between(st.rand, 0.1, 0.7), w, ch, st.rand);
  }
  let s = pathEl(d, { fill: toneFill("dark", st.p), stroke: INK, w: st.lw * 0.7 });
  // lightning bolt
  if (h > 60) {
    const x = b.x + b.w * between(st.rand, 0.25, 0.75);
    const pts: Point[] = [];
    let y = top + h * 0.2;
    let xx = x;
    pts.push({ x: xx, y });
    const steps = 5;
    for (let i = 0; i < steps; i += 1) {
      xx += between(st.rand, -1, 1) * h * 0.08;
      y += (h * 0.75) / steps;
      pts.push({ x: xx, y });
    }
    const width = Math.max(3, h * 0.025);
    const left = pts.map((p, i) => ({ x: p.x - width * (1 - i / steps), y: p.y }));
    const right = pts.map((p, i) => ({ x: p.x + width * (1 - i / steps) + width * 0.4, y: p.y + width * 0.8 })).reverse();
    s += pathEl(polyPath([...left, ...right]), { fill: PAPER, stroke: INK, w: st.lw * 0.6, join: "miter" });
  }
  return s;
}

/** Background weather atmosphere painted over the scene (under figures). */
export function drawWeather(st: Stage): void {
  const b = st.box;
  const t = (tone: Parameters<typeof toneFill>[0]) => toneFill(tone, st.p);
  let s = "";
  if (st.weather === "rain" || st.weather === "storm") {
    // slanting streaks over the whole scene (clearly rain, not texture), and
    // splash ticks where the drops hit the ground
    let d = "";
    const storm = st.weather === "storm";
    const count = Math.round((b.w * b.h) / (storm ? 750 : 1300));
    const slant = storm ? 0.38 : 0.2;
    for (let i = 0; i < count; i += 1) {
      const x = b.x + st.rand() * (b.w + b.h * slant) - b.h * slant * 0.5;
      const y = b.y + st.rand() * b.h;
      const len = between(st.rand, 12, storm ? 38 : 28);
      d += `M${n(x)} ${n(y)}l${n(-len * slant)} ${n(len)}`;
    }
    s += pathEl(d, { stroke: st.pal.night ? PAPER : "#3a3a3a", w: storm ? 1.05 : 0.85, opacity: 0.85 });
    const top = Math.max(b.y + 4, st.cam.horizonY + 6);
    if (top < b.y + b.h - 4) {
      let sp = "";
      const splashes = Math.round((b.w * (b.y + b.h - top)) / 2600);
      for (let i = 0; i < splashes; i += 1) {
        const x = b.x + st.rand() * b.w;
        const y = top + Math.pow(st.rand(), 0.7) * (b.y + b.h - top);
        const w = 2 + ((y - top) / Math.max(1, b.y + b.h - top)) * 5;
        sp += `M${n(x - w)} ${n(y - w * 0.8)}L${n(x - w * 0.3)} ${n(y)}M${n(x + w)} ${n(y - w * 0.8)}L${n(x + w * 0.3)} ${n(y)}`;
      }
      s += pathEl(sp, { stroke: st.pal.night ? PAPER : "#3a3a3a", w: 0.8, opacity: 0.8 });
    }
  } else if (st.weather === "snow") {
    // falling snow: plenty of flakes, a few big near ones
    let d = "";
    let big = "";
    const count = Math.round((b.w * b.h) / 950);
    for (let i = 0; i < count; i += 1) {
      const x = b.x + st.rand() * b.w;
      const y = b.y + st.rand() * b.h;
      const near = st.rand() < 0.08;
      const r = near ? between(st.rand, 3, 4.6) : between(st.rand, 1, 2.4);
      const c = `M${n(x - r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0`;
      if (near) big += c;
      else d += c;
    }
    s += pathEl(d, { fill: PAPER, stroke: st.pal.night ? "none" : "#7a7a7a", w: 0.45 });
    s += pathEl(big, { fill: PAPER, stroke: st.pal.night ? "#bdbdbd" : "#6a6a6a", w: 0.7 });
  } else if (st.weather === "wind") {
    let d = "";
    const count = 3 + st.lod;
    for (let i = 0; i < count; i += 1) {
      const y = b.y + b.h * between(st.rand, 0.08, 0.7);
      const x = b.x + b.w * between(st.rand, -0.1, 0.6);
      const len = b.w * between(st.rand, 0.25, 0.45);
      const amp = between(st.rand, 6, 16);
      d += `M${n(x)} ${n(y)}c${n(len * 0.3)} ${n(-amp)} ${n(len * 0.6)} ${n(amp)} ${n(len)} ${n(-amp * 0.4)}`;
      d += `c${n(len * 0.08)} ${n(-amp * 0.3)} ${n(len * 0.02)} ${n(-amp * 1.1)} ${n(-len * 0.06)} ${n(-amp * 0.8)}`;
    }
    s += pathEl(d, { stroke: st.pal.night ? PAPER : INK, w: st.lw * 0.55 });
  } else if (st.weather === "fog") {
    // low bank of fog hugging the ground, plus a light veil
    const hy = Math.max(b.y, Math.min(b.y + b.h, st.cam.horizonY));
    s += pathEl(rectD(b.x - 2, hy - b.h * 0.25, b.w + 4, b.h * 0.5), { fill: PAPER, opacity: 0.45 });
    s += boxRect(st, PAPER, 0.25);
  }
  if (st.weather === "storm") s += boxRect(st, t("dense_dots"), 0.18);
  add(st, LAYER.atmos, 0, s);
}
