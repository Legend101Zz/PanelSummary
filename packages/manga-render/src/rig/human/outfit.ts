/**
 * Garments over the body: per-outfit fills (top, sleeves, legs, shoes),
 * skirts/coat tails/capes built as hulls around the posed legs so they
 * follow every pose, and surface details (belts, buttons, lapels, plates,
 * aprons, trims) placed on the projected torso surface.
 */
import type { HumanLook, Tone } from "../../contracts.js";
import { INK, PAPER, toneFill } from "../../style.js";
import {
  add,
  add3,
  clamp,
  densify,
  dist,
  dot,
  hull,
  lerp,
  lerp3,
  mul,
  mul3,
  norm,
  perp,
  sub,
  v,
  type CPt,
  type Pen,
  type V2,
} from "./geom.js";
import { contrastTone, type Palette } from "./look.js";
import { circle, line, shape, solid, type Ink } from "./paint.js";
import type { Torso } from "./body.js";
import type { LegJ, Skeleton } from "./skeleton.js";
import type { ShoeKind } from "./body.js";

export interface Fit {
  outfit: HumanLook["outfit"];
  top: string;
  sleeve: string;
  sleeveKind: "long" | "rolled" | "torn" | "bell" | "puff";
  forearm: string;
  legs: string;
  legKind: "trousers" | "hose" | "torn" | "stockings";
  shoe: ShoeKind;
  shoeFill: string;
  boot: number;
  /** Lowest point of the upper garment on the torso (s units). */
  upperFrom: number;
  skirt?: { hem: number; flare: number; jag: boolean; fill: string; waist: number };
  coat?: { hem: number; flare: number; fill: string };
  cape?: { len: number; fill: string; lining: string; trim: boolean };
  cloak?: { fill: string };
  apron?: string;
  greaves?: string;
  stripe?: boolean;
  gloves?: string;
}

export function fitFor(look: HumanLook, pal: Palette, idPrefix: string): Fit {
  const tf = (t: Tone) => (pal.statue ? pal.mat : toneFill(t, idPrefix));
  const O = pal.top;
  const tone = look.outfit_tone;
  const contrast = tf(contrastTone(tone));
  const white = pal.statue ? pal.mat : PAPER;
  const flatTone = ["white", "light", "mid", "dark", "black", "gold", "stone"].includes(tone);
  const plate = pal.statue ? pal.mat : flatTone ? (tone === "white" ? tf("light") : O) : tf("light");
  const base: Fit = {
    outfit: look.outfit,
    top: O,
    sleeve: O,
    sleeveKind: "long",
    forearm: O,
    legs: contrast,
    legKind: "trousers",
    shoe: "shoe",
    shoeFill: pal.shoes,
    boot: 0,
    upperFrom: 0.28,
  };
  let f: Fit;
  switch (look.outfit) {
    case "tunic":
      f = { ...base, legKind: "hose", boot: 0.32, skirt: { hem: 0.3, flare: 0.012, jag: false, fill: O, waist: 0.3 } };
      break;
    case "shirt_trousers":
      f = { ...base, top: white, sleeve: white, forearm: white, legs: tone === "white" ? tf("mid") : O };
      break;
    case "suit":
      f = { ...base, legs: O, upperFrom: 0.02, skirt: { hem: 0.1, flare: 0.004, jag: false, fill: O, waist: 0.14 } };
      break;
    case "long_coat":
      f = { ...base, boot: 0.5, upperFrom: 0.2, coat: { hem: 0.6, flare: 0.05, fill: O } };
      break;
    case "dress":
      f = {
        ...base,
        legs: white,
        legKind: "stockings",
        sleeveKind: "puff",
        skirt: { hem: look.age === "child" ? 0.6 : 0.7, flare: 0.12, jag: false, fill: O, waist: 0.33 },
      };
      break;
    case "gown":
      f = { ...base, legs: white, legKind: "stockings", sleeveKind: "puff", shoe: "slipper", skirt: { hem: 1.12, flare: 0.2, jag: false, fill: O, waist: 0.34 } };
      break;
    case "robe":
      f = { ...base, sleeveKind: "bell", shoe: "slipper", skirt: { hem: 0.98, flare: 0.05, jag: false, fill: O, waist: 0.3 } };
      break;
    case "uniform":
      f = { ...base, legs: O, boot: 0.55, stripe: true, upperFrom: 0.1, skirt: { hem: 0.1, flare: 0.004, jag: false, fill: O, waist: 0.2 } };
      break;
    case "armor":
      f = {
        ...base,
        top: plate,
        sleeve: contrast,
        forearm: contrast,
        legs: contrast,
        greaves: plate,
        boot: 0.3,
        shoeFill: pal.statue ? pal.mat : tf("dark"),
        skirt: { hem: 0.28, flare: 0.02, jag: false, fill: plate, waist: 0.3 },
      };
      break;
    case "rags":
      f = {
        ...base,
        sleeveKind: "torn",
        forearm: pal.skin,
        legKind: "torn",
        shoe: "bare",
        skirt: { hem: 0.36, flare: 0.02, jag: true, fill: O, waist: 0.3 },
      };
      break;
    case "work_apron":
      f = { ...base, sleeveKind: "rolled", forearm: pal.skin, boot: 0.3, apron: pal.statue ? pal.mat : tone === "white" || tone === "light" ? tf("mid") : PAPER };
      break;
    case "cloak":
      f = { ...base, top: contrast, sleeve: contrast, forearm: contrast, boot: 0.4, cloak: { fill: O }, cape: { len: 0.74, fill: O, lining: tf("dark"), trim: false } };
      break;
    case "royal":
      f = {
        ...base,
        legs: white,
        legKind: "hose",
        skirt: { hem: 0.3, flare: 0.03, jag: false, fill: O, waist: 0.3 },
        cape: { len: 0.8, fill: pal.statue ? pal.mat : tone === "black" ? tf("dark") : INK, lining: white, trim: true },
      };
      break;
    case "scholar":
      f = { ...base, sleeveKind: "bell", coat: { hem: 0.95, flare: 0.07, fill: O }, top: O, legs: contrast, upperFrom: 0.2 };
      break;
  }
  if (look.accessories.includes("cape") && !f.cape) f.cape = { len: 0.72, fill: pal.statue ? pal.mat : tf("dark"), lining: white, trim: false };
  if (look.accessories.includes("gloves")) f.gloves = pal.statue ? pal.mat : tf("dark");
  return f;
}

// ---------------------------------------------------------------------------
// Hull garments
// ---------------------------------------------------------------------------

/** A point `d` units down a leg from the hip, plus the leg's screen direction. */
function alongLeg(sk: Skeleton, leg: LegJ, d: number): { p: V2; dir: V2 } {
  const m = sk.m;
  let a = leg.hip;
  let b = leg.knee;
  let t = d / m.thigh;
  if (d > m.thigh) {
    a = leg.knee;
    b = leg.ankle;
    t = (d - m.thigh) / m.shin;
  }
  const p3 = t <= 1 ? lerp3(a, b, t) : add3(b, mul3(sub3n(b, a), t - 1));
  const p = sk.P(p3);
  const q = sk.P(b);
  const r = sk.P(a);
  return { p, dir: norm(sub(q, r)) };
}
const sub3n = (a: { f: number; u: number; l: number }, b: { f: number; u: number; l: number }) => ({ f: a.f - b.f, u: a.u - b.u, l: a.l - b.l });

export interface SkirtOut {
  d: string;
  pts: V2[];
  hemY: number;
}

export function skirtShape(pen: Pen, sk: Skeleton, torso: Torso, hem: number, flare: number, waist: number, jag: boolean, seed: number): SkirtOut {
  const m = sk.m;
  const H = m.H;
  const legLen = m.thigh + m.shin;
  const pts: V2[] = [];
  // Hanging cloth: measure section extremes across gravity, not across the spine.
  const gravity0 = sk.def.roll ? mul(torso.spine2, -1) : v(0, 1);
  const across = perp(gravity0);
  const we0 = torso.edges(waist, 0.004 * H, across);
  const he = torso.edges(0.02, 0.006 * H + flare * H * 0.3, across);
  // A bowing torso carries the waist forward; the skirt still hangs from the hips.
  const k = clamp(Math.abs(sk.def.lean) / 50, 0, 1);
  const we = { l: lerp(we0.l, he.l, k), r: lerp(we0.r, he.r, k) };
  pts.push(we.l, we.r);
  pts.push(he.l, he.r);
  const gravity = sk.def.roll ? mul(torso.spine2, -1) : v(0, 1);
  for (const leg of [sk.near.leg, sk.far.leg]) {
    for (const k of [0.45, 1]) {
      const d = hem * legLen * k;
      const { p, dir } = alongLeg(sk, leg, d);
      const frac = Math.min(1.1, d / legLen);
      const r = m.r.thigh * (1 - 0.35 * Math.min(1, frac)) + flare * H * frac + 0.004 * H;
      const nrm = perp(dir);
      pts.push(add(p, mul(nrm, r)), add(p, mul(nrm, -r)));
      if (k === 1) {
        // Cloth hangs: the steeper the leg, the less extra drape.
        const drape = hem * legLen * 0.32 * (1 - Math.abs(dot(dir, gravity)));
        if (drape > 0.01 * H) {
          pts.push(add(add(p, mul(nrm, r * 0.8)), mul(gravity, drape)), add(add(p, mul(nrm, -r * 0.8)), mul(gravity, drape)));
        }
      }
    }
  }
  const floor = sk.def.roll ? Infinity : 0.004 * H;
  let hp: V2[] = dedupe(hull(pts.map((p) => v(p.x, Math.min(p.y, floor)))), 0.012 * H);
  const wy = (we.l.y + we.r.y) / 2;
  const hemY = Math.max(...hp.map((p) => p.y));
  let d: string;
  if (jag) {
    const rand = seedRand(seed);
    const dense = densify(hp, 0.035 * H);
    const cut = wy + (hemY - wy) * 0.55;
    const jp: CPt[] = dense.map((p, i) => (p.y > cut ? { x: p.x, y: p.y - (i % 2 === 0 ? 0.03 * H * (0.6 + rand() * 0.8) : 0), c: true } : p));
    d = pen.curve(jp, true, 0.8);
    hp = jp;
  } else {
    // Short, flat hulls overshoot with smooth splines: keep them tighter.
    d = pen.curve(hp, true, hem < 0.25 ? 0.35 : 0.7);
  }
  return { d, pts: hp, hemY };
}

/** Drop consecutive polygon points closer than `eps` (spline overshoot guard). */
function dedupe(pts: V2[], eps: number): V2[] {
  const out: V2[] = [];
  for (const p of pts) if (!out.length || dist(out[out.length - 1], p) > eps) out.push(p);
  while (out.length > 3 && dist(out[0], out[out.length - 1]) <= eps) out.pop();
  return out;
}

function seedRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fold lines from the waist toward the hem. */
export function skirtFolds(pen: Pen, torso: Torso, s: SkirtOut, waist: number, count: number, w: number): string {
  const we = torso.edges(waist);
  const wy = (we.l.y + we.r.y) / 2;
  const low = s.pts.filter((p) => p.y > wy + (s.hemY - wy) * 0.6);
  if (low.length < 2) return "";
  const lx = Math.min(...low.map((p) => p.x));
  const rx = Math.max(...low.map((p) => p.x));
  let out = "";
  for (let i = 1; i <= count; i += 1) {
    const t = i / (count + 1);
    const top = lerp(we.l, we.r, t);
    const bx = lx + (rx - lx) * (t + (t - 0.5) * 0.15);
    const by = s.hemY - (s.hemY - wy) * 0.08;
    const start = lerp(top, v(bx, by), 0.3);
    out += line(pen.curve([start, lerp(start, v(bx, by), 0.5), v(bx, by)], false), w);
  }
  return out;
}

export function capeShape(pen: Pen, sk: Skeleton, torso: Torso, len: number, widen: number): { d: string; hemY: number } {
  const m = sk.m;
  const H = m.H;
  const back = sk.view === "side" ? v(sk.mirror ? 1 : -1, 0) : v(0, 0);
  const gravity = sk.def.roll ? mul(torso.spine2, -1) : v(0, 1);
  const flow = sk.def.flow;
  const top = torso.edges(0.93, m.r.upperArm * 0.6);
  const neck = torso.edges(1.0, 0.004 * H);
  const pelvis = torso.centre(0.0);
  const anchor = sk.P(sk.neckBase);
  const drop = len * H;
  const hemC = add(add(anchor, mul(gravity, drop)), mul(back, 0.1 * H + flow * 0.32 * H));
  const halfW = (0.17 + widen) * H + flow * 0.04 * H;
  const across = perp(gravity);
  const pts: V2[] = [top.l, top.r, neck.l, neck.r, add(hemC, mul(across, halfW)), add(hemC, mul(across, -halfW))];
  if (sk.view === "side") pts.push(add(torso.surf(0.5, sk.mirror ? 180 : 180, 0.01 * H), mul(back, 0.03 * H)), add(pelvis, mul(back, 0.07 * H)));
  let hp = dedupe(hull(pts), 0.012 * H);
  const groundCap = sk.def.roll ? Infinity : -0.02 * H;
  hp = hp.map((p) => v(p.x, Math.min(p.y, groundCap)));
  const hemY = Math.max(...hp.map((p) => p.y));
  // Scalloped hem: densify and wave the lowest band.
  const dense = densify(hp, 0.05 * H);
  const wy = Math.min(...hp.map((p) => p.y));
  const wave: CPt[] = dense.map((p, i) => (p.y > wy + (hemY - wy) * 0.85 ? { x: p.x, y: p.y - (i % 2 === 0 ? 0.018 * H : 0) } : p));
  return { d: pen.curve(wave, true, 0.8), hemY };
}

// ---------------------------------------------------------------------------
// Surface details
// ---------------------------------------------------------------------------

export function band(pen: Pen, torso: Torso, s0: number, s1: number, out: number, fill: string, w: number): string {
  const a = torso.arc(s1, 10, out);
  const b = torso.arc(s0, 10, out);
  const pts: CPt[] = [{ ...a[0], c: true }, ...a.slice(1, -1), { ...a[a.length - 1], c: true }, { ...b[b.length - 1], c: true }, ...b.slice(1, -1).reverse(), { ...b[0], c: true }];
  return shape(pen.curve(pts), fill, w);
}

function surfLine(pen: Pen, torso: Torso, s0: number, s1: number, th: number, w: number, out = 0, color = INK): string {
  if (torso.facing((s0 + s1) / 2, th) <= 0) return "";
  const pts: V2[] = [];
  for (let i = 0; i <= 4; i += 1) pts.push(torso.surf(s0 + ((s1 - s0) * i) / 4, th, out));
  return line(pen.curve(pts, false), w, color);
}

function buttons(pen: Pen, torso: Torso, th: number, ss: number[], r: number, fill: string, w: number): string {
  let s = "";
  for (const k of ss) {
    if (torso.facing(k, th) <= 0.05) continue;
    s += circle(pen.circle(torso.surf(k, th, r * 0.5), r), fill, w);
  }
  return s;
}

/** Diagonal strip across the torso surface (sash, strap, robe collar). */
function diagonal(pen: Pen, torso: Torso, from: [number, number], to: [number, number], width: number, fill: string, w: number, out: number): string {
  const steps = 8;
  const pts: V2[] = [];
  const facing: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const s = from[0] + (to[0] - from[0]) * t;
    const th = from[1] + (to[1] - from[1]) * t;
    pts.push(torso.surf(s, th, out));
    facing.push(torso.facing(s, th));
  }
  const keep = pts.filter((_, i) => facing[i] > -0.02);
  if (keep.length < 2) return "";
  const left: V2[] = [];
  const right: V2[] = [];
  for (let i = 0; i < keep.length; i += 1) {
    const a = keep[Math.max(0, i - 1)];
    const b = keep[Math.min(keep.length - 1, i + 1)];
    const n = perp(norm(sub(b, a)));
    left.push(add(keep[i], mul(n, width / 2)));
    right.push(add(keep[i], mul(n, -width / 2)));
  }
  return shape(pen.curve([...left, ...right.reverse()], true, 0.6), fill, w);
}

export interface DetailCtx {
  pen: Pen;
  sk: Skeleton;
  torso: Torso;
  fit: Fit;
  pal: Palette;
  ink: Ink;
  look: HumanLook;
  idPrefix: string;
  seed: number;
  /** Fragments that belong behind the legs and torso (e.g. a far-hip scabbard). */
  behind: string[];
}

/** Details on the upper torso (drawn right after it). */
export function torsoDetails(c: DetailCtx): string {
  const { pen, torso, fit, pal, ink, look, sk } = c;
  const H = sk.m.H;
  const w = ink.dw;
  const dark = pal.statue ? pal.mat : toneFill("dark", c.idPrefix);
  const gold = pal.statue ? pal.mat : toneFill("gold", c.idPrefix);
  const white = pal.statue ? pal.mat : PAPER;
  const topDark = look.outfit_tone === "black" || look.outfit_tone === "dark" || look.outfit_tone === "dense_dots";
  const dotFill = topDark ? PAPER : INK;
  const br = 0.0075 * H;
  let s = "";
  const lite = ink.lite;
  switch (fit.outfit) {
    case "tunic":
      s += line(pen.curve([torso.surf(1.0, -32), torso.surf(0.84, 0, 0.002 * H), torso.surf(1.0, 32)].filter((_, i) => torso.facing(0.9, [-32, 0, 32][i]) > -0.3), false), w);
      s += band(pen, torso, 0.3, 0.37, 0.004 * H, dark, w);
      s += buckle(pen, torso, 0.335, gold, w, H);
      break;
    case "shirt_trousers":
      s += collar(pen, torso, white, w, H);
      if (!lite) s += surfLine(pen, torso, 0.36, 0.9, 0, w);
      s += buttons(pen, torso, 5, [0.5, 0.66, 0.82], br * 0.8, INK, 0);
      s += band(pen, torso, 0.3, 0.35, 0.003 * H, dark, w);
      break;
    case "suit":
      s += lapels(pen, torso, white, INK, w, H, true);
      s += buttons(pen, torso, 6, [0.32, 0.44], br, dotFill, 0);
      break;
    case "long_coat":
      s += lapels(pen, torso, white, INK, w, H, false);
      s += buttons(pen, torso, 18, [0.3, 0.42, 0.54], br, dotFill, 0);
      s += buttons(pen, torso, -18, [0.3, 0.42, 0.54], br, dotFill, 0);
      break;
    case "dress":
      s += roundCollar(pen, torso, white, w, H);
      if (!lite) s += surfLine(pen, torso, 0.36, 0.86, 0, w);
      s += buttons(pen, torso, 0, [0.5, 0.62, 0.74], br * 0.7, dotFill, 0);
      break;
    case "gown": {
      // Scooped neckline showing skin, bodice seams.
      const top = torso.arc(0.99, 8, 0.002 * H);
      const low = torso.arc(0.82, 8, 0.004 * H).map((p, i, a) => {
        const k = Math.sin((i / (a.length - 1)) * Math.PI);
        return add(p, mul(torso.spine2, -0.03 * H * k));
      });
      const pts: CPt[] = [...top.slice(1, -1), { ...top[top.length - 1], c: true }, ...[...low].reverse(), { ...top[0], c: true }];
      s += shape(pen.curve(pts), pal.skin, w);
      if (!lite) for (const th of [-35, 35]) s += surfLine(pen, torso, 0.34, 0.78, th, w);
      s += band(pen, torso, 0.33, 0.37, 0.004 * H, gold, w);
      break;
    }
    case "robe":
      s += diagonal(pen, torso, [1.0, 38], [0.36, -48], 0.028 * H, white, w, 0.004 * H);
      s += band(pen, torso, 0.3, 0.4, 0.005 * H, dark, w);
      break;
    case "uniform":
      s += band(pen, torso, 0.96, 1.05, 0.004 * H, pal.top, w);
      s += buttons(pen, torso, 16, [0.4, 0.52, 0.64, 0.76], br, gold, w * 0.6);
      s += buttons(pen, torso, -16, [0.4, 0.52, 0.64, 0.76], br, gold, w * 0.6);
      s += band(pen, torso, 0.28, 0.34, 0.006 * H, INK, w);
      s += buckle(pen, torso, 0.31, gold, w, H);
      s += diagonal(pen, torso, [0.92, 55], [0.32, -40], 0.012 * H, INK, w * 0.6, 0.006 * H);
      break;
    case "armor":
      s += band(pen, torso, 0.94, 1.04, 0.004 * H, pal.statue ? pal.mat : toneFill("mid", c.idPrefix), w);
      for (const k of [0.4, 0.48]) s += line(pen.curve(torso.arc(k, 8, 0.002 * H), false), w);
      if (!lite) s += surfLine(pen, torso, 0.5, 0.92, 0, w);
      s += surfLine(pen, torso, 0.55, 0.85, torso.frontTheta(0.7) - 30, w * 1.8, 0.002 * H, PAPER);
      s += band(pen, torso, 0.29, 0.35, 0.006 * H, dark, w);
      break;
    case "rags": {
      const rand = seedRand(c.seed ^ 0x5a5a);
      for (let i = 0; i < 2; i += 1) {
        const sc = 0.45 + rand() * 0.35;
        const th = torso.frontTheta(sc) + (rand() - 0.5) * 60;
        if (torso.facing(sc, th) < 0.2) continue;
        const q = [torso.surf(sc - 0.05, th - 14), torso.surf(sc - 0.06, th + 12), torso.surf(sc + 0.07, th + 14), torso.surf(sc + 0.06, th - 12)];
        s += shape(pen.poly(q), look.outfit_tone === "light" ? toneFill("mid", c.idPrefix) : toneFill("light", c.idPrefix), w);
        if (!lite) s += line(pen.poly([lerp(q[0], q[1], 0.25), lerp(q[3], q[2], 0.25)], false), w * 0.7);
      }
      s += band(pen, torso, 0.3, 0.34, 0.004 * H, toneFill("light", c.idPrefix), w);
      if (!lite) s += surfLine(pen, torso, 0.62, 0.9, 20, w);
      break;
    }
    case "work_apron":
      s += collar(pen, torso, pal.top, w, H);
      break;
    case "cloak":
      break;
    case "royal": {
      s += diagonal(pen, torso, [0.93, 58], [0.3, -52], 0.03 * H, white, w, 0.006 * H);
      s += band(pen, torso, 0.3, 0.36, 0.006 * H, gold, w);
      s += ermine(pen, torso, 0.95, 1.05, white, w, H);
      break;
    }
    case "scholar":
      break;
  }
  return s;
}

function buckle(pen: Pen, torso: Torso, sm: number, fill: string, w: number, H: number): string {
  const th = torso.frontTheta(sm);
  if (torso.facing(sm, th) <= 0.1) return "";
  const c = torso.surf(sm, th, 0.007 * H);
  const r = 0.016 * H;
  return shape(pen.poly([v(c.x - r, c.y - r * 0.8), v(c.x + r, c.y - r * 0.8), v(c.x + r, c.y + r * 0.8), v(c.x - r, c.y + r * 0.8)]), fill, w);
}

function collar(pen: Pen, torso: Torso, fill: string, w: number, H: number): string {
  let s = "";
  for (const sgn of [-1, 1]) {
    const a = 28 * sgn;
    if (torso.facing(0.96, a) <= 0) continue;
    const pts = [torso.surf(1.02, a * 0.3, 0.004 * H), torso.surf(0.9, a * 0.15, 0.006 * H), torso.surf(0.96, a * 1.6, 0.006 * H), torso.surf(1.03, a * 1.3, 0.004 * H)];
    s += shape(pen.poly(pts), fill, w);
  }
  return s;
}

function roundCollar(pen: Pen, torso: Torso, fill: string, w: number, H: number): string {
  const a = torso.arc(1.02, 8, 0.004 * H);
  const b = torso.arc(0.92, 8, 0.008 * H);
  const pts: CPt[] = [{ ...a[0], c: true }, ...a.slice(1, -1), { ...a[a.length - 1], c: true }, ...b.reverse()];
  return shape(pen.curve(pts, true, 0.8), fill, w);
}

function lapels(pen: Pen, torso: Torso, shirt: string, tie: string, w: number, H: number, withTie: boolean): string {
  if (torso.facing(0.8, 0) <= 0) return "";
  const out = 0.004 * H;
  const v1 = [torso.surf(1.0, -26, out), torso.surf(0.58, 0, out), torso.surf(1.0, 26, out)];
  let s = shape(pen.poly(v1), shirt, w);
  if (withTie) {
    const t = [torso.surf(0.97, -5, out), torso.surf(0.97, 5, out), torso.surf(0.62, 6, out * 1.4), torso.surf(0.58, 0, out * 1.4), torso.surf(0.62, -6, out * 1.4)];
    s += shape(pen.poly(t), tie, w * 0.6);
  }
  for (const sg of [-1, 1]) {
    if (torso.facing(0.85, sg * 30) <= 0) continue;
    const l = [torso.surf(1.0, sg * 26, out), torso.surf(0.86, sg * 44, out), torso.surf(0.82, sg * 30, out), torso.surf(0.58, 0, out)];
    s += line(pen.poly(l, false), w);
  }
  return s;
}

function ermine(pen: Pen, torso: Torso, s0: number, s1: number, fill: string, w: number, H: number): string {
  let s = band(pen, torso, s0, s1, 0.009 * H, fill, w);
  const f = torso.frontTheta((s0 + s1) / 2);
  for (const th of [f - 55, f - 20, f + 15, f + 50]) {
    const p = torso.surf((s0 + s1) / 2, th, 0.012 * H);
    s += solid(pen.poly([v(p.x - 0.004 * H, p.y - 0.006 * H), v(p.x + 0.004 * H, p.y - 0.006 * H), v(p.x, p.y + 0.009 * H)]), INK);
  }
  return s;
}

/** Apron: bib on the chest plus a panel hanging to the knees (over legs). */
export function apronShapes(c: DetailCtx, fill: string): { bib: string; skirt: string; sil: string } {
  const { pen, torso, sk, ink } = c;
  const H = sk.m.H;
  const w = ink.dw;
  const f = torso.frontTheta(0.5);
  if (torso.facing(0.5, 0) <= -0.1) return { bib: "", skirt: "", sil: "" };
  const out = 0.006 * H;
  const bibPts = [torso.surf(0.8, -36, out), torso.surf(0.8, 36, out), torso.surf(0.34, 44, out), torso.surf(0.34, -44, out)].filter((_, i) => torso.facing(0.6, [-36, 36, 44, -44][i]) > -0.25);
  let bib = "";
  if (bibPts.length >= 3) bib += shape(pen.poly(bibPts), fill, w);
  if (!ink.lite) {
    for (const sg of [-1, 1]) if (torso.facing(0.9, sg * 30) > 0) bib += line(pen.curve([torso.surf(0.8, sg * 34, out), torso.surf(0.93, sg * 30, out), torso.surf(1.0, sg * 20, out)], false), w * 1.2);
  }
  bib += line(pen.curve(torso.arc(0.34, 8, out), false), w * 1.6);
  // Skirt panel: from the front of the waist hanging to the knees.
  const gravity = sk.def.roll ? mul(torso.spine2, -1) : v(0, 1);
  const a = torso.surf(0.33, clamp(f, -60, 60) - 50, out);
  const b = torso.surf(0.33, clamp(f, -60, 60) + 50, out);
  const knees = [sk.P(sk.near.leg.knee), sk.P(sk.far.leg.knee)];
  const kneeDrop = Math.max(...knees.map((k) => dot(sub(k, a), gravity))) + 0.02 * H;
  const drop = Math.max(0.12 * H, kneeDrop);
  const across = norm(sub(b, a));
  const flare = mul(across, 0.02 * H);
  const pts: CPt[] = [{ ...a, c: true }, { ...b, c: true }, { ...add(add(b, mul(gravity, drop)), flare), c: true }, lerp(add(b, mul(gravity, drop * 1.02)), add(a, mul(gravity, drop * 1.02)), 0.5), { ...add(add(a, mul(gravity, drop)), mul(flare, -1)), c: true }];
  const d = pen.curve(pts);
  const skirt = shape(d, fill, ink.lw) + (ink.lite ? "" : line(pen.curve([lerp(a, b, 0.5), lerp(add(a, mul(gravity, drop)), add(b, mul(gravity, drop)), 0.5)], false), w * 0.8));
  return { bib, skirt, sil: d };
}

export function cloakMantle(c: DetailCtx, fill: string): { svg: string; d: string } {
  const { pen, torso, sk, ink } = c;
  const H = sk.m.H;
  const m = sk.m;
  const ua = m.r.upperArm;
  const pts: V2[] = [];
  for (const s of [1.02, 0.92, 0.8]) {
    const e = torso.edges(s, s > 0.9 ? ua * 1.2 + 0.01 * H : ua * 1.6 + 0.012 * H);
    pts.push(e.l, e.r);
  }
  const low = torso.edges(0.56, ua * 1.9 + 0.014 * H);
  pts.push(low.l, low.r);
  const front = torso.surf(0.52, torso.frontTheta(0.52), 0.02 * H);
  pts.push(front);
  const hp = hull(pts);
  const d = pen.curve(hp, true, 0.8);
  let svg = shape(d, fill, ink.lw);
  const f0 = torso.facing(0.8, 0);
  if (f0 > 0) {
    svg += line(pen.curve([torso.surf(1.02, 0, 0.01 * H), torso.surf(0.78, 0, 0.022 * H), front], false), ink.dw);
    svg += circle(pen.circle(torso.surf(1.0, 0, 0.012 * H), 0.012 * H), toneFill("gold", c.idPrefix), ink.dw);
  }
  return { svg, d };
}

/** Front coat panels hanging from the waist (long coat, scholar gown). */
export function coatFlaps(c: DetailCtx, hemY: number, fill: string): { svg: string; d: string } {
  const { pen, torso, sk, ink } = c;
  const H = sk.m.H;
  const gravity = sk.def.roll ? mul(torso.spine2, -1) : v(0, 1);
  let svg = "";
  let dd = "";
  for (const [t0, t1] of [
    [6, 58],
    [-58, -6],
  ]) {
    if (torso.facing(0.25, (t0 + t1) / 2) <= 0.05) continue;
    const a = torso.surf(0.24, t0, 0.008 * H);
    const b = torso.surf(0.24, t1, 0.008 * H);
    const ya = Math.max(hemY - a.y, 0.05 * H);
    const yb = Math.max(hemY - b.y, 0.05 * H);
    const outward = mul(norm(sub(b, a)), 0.012 * H);
    const pts: CPt[] = [{ ...a, c: true }, { ...b, c: true }, { ...add(add(b, mul(gravity, yb)), outward), c: true }, { ...add(add(a, mul(gravity, ya)), mul(outward, -1)), c: true }];
    const d = pen.curve(pts);
    dd += d;
    svg += shape(d, fill, ink.lw);
  }
  return { svg, d: dd };
}

