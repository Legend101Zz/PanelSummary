/**
 * Manga head and face in head-local space: origin at the cranium centre,
 * y down, R = cranium radius. Views: "front", "side" (3/4 turned right) and
 * "back". The pen maps local space into figure space.
 *
 * Faces are built for thumbnail legibility: solid black irises with white
 * highlights, bold lash lines, brows that carry the emotion, and mouths that
 * read as distinct dark/white shapes.
 */
import type { Expression, HumanLook } from "../../contracts.js";
import { INK, PAPER } from "../../style.js";
import { n } from "../../svg.js";
import { add, clamp, ellipsePts, lerp, mix, rot, v, type CPt, type Pen, type V2 } from "./geom.js";
import { circle, line, shape, solid, type Ink } from "./paint.js";
import type { Palette } from "./look.js";
import type { ViewKind } from "./skeleton.js";

export interface FaceGeo {
  R: number;
  view: ViewKind;
  look: HumanLook;
  eyeW: number;
  eyeH: number;
  eyeY: number;
  eyeX: number;
  lash: number;
  browT: number;
  mouthY: number;
  mouthW: number;
  /** Local point where the neck meets the head. */
  neck: V2;
  /** Local mouth / voice point. */
  mouth: V2;
  /** Local chin (lowest face point). */
  chin: V2;
}

export function faceGeo(look: HumanLook, R: number, view: ViewKind, jitter: number[]): FaceGeo {
  const kid = look.age === "child";
  const teen = look.age === "teen";
  const elder = look.age === "elder";
  const fem = look.frame === "fem";
  const masc = look.frame === "masc";
  let eyeH = kid ? 0.3 : teen ? (fem ? 0.27 : masc ? 0.21 : 0.24) : elder ? (masc ? 0.12 : 0.14) : fem ? 0.23 : masc ? 0.155 : 0.19;
  const eyeW = (kid ? 0.25 : teen ? 0.23 : elder ? 0.2 : 0.215) * (1 + jitter[1] * 0.03);
  eyeH *= 1 + jitter[2] * 0.04;
  const eyeY = kid ? 0.46 : teen ? 0.38 : 0.36;
  const eyeX = (kid ? 0.44 : 0.42) * (1 + jitter[3] * 0.03);
  const mouthY = kid ? 0.9 : teen ? 1.0 : masc ? 1.06 : 1.03;
  const side = view === "side";
  return {
    R,
    view,
    look,
    eyeW: eyeW * R,
    eyeH: eyeH * R,
    eyeY: eyeY * R,
    eyeX: eyeX * R,
    lash: (fem || kid ? 0.085 : masc ? 0.06 : 0.07) * R,
    browT: (masc ? 0.095 : fem ? 0.055 : kid ? 0.065 : 0.075) * R,
    mouthY: mouthY * R,
    mouthW: (kid ? 0.15 : 0.16) * R,
    neck: side ? v(-0.2 * R, 1.08 * R) : v(0, 1.12 * R),
    mouth: side ? v(0.58 * R, mouthY * R) : v(0, mouthY * R),
    chin: side ? v(0.5 * R, 1.42 * R) : v(0, 1.44 * R),
  };
}

// ---------------------------------------------------------------------------
// Head outline
// ---------------------------------------------------------------------------

export function headOutline(g: FaceGeo): CPt[] {
  const { look, view } = g;
  const R = g.R;
  const kid = look.age === "child";
  const masc = look.frame === "masc" && !kid;
  const heavy = look.build === "heavy";
  const P = (x: number, y: number, c = false): CPt => (c ? { x: x * R, y: y * R, c } : { x: x * R, y: y * R });
  if (view === "back") {
    return [P(0, -1), P(0.72, -0.72), P(1.0, 0), P(0.95, 0.5), P(0.72, 0.92), P(0.34, 1.1), P(-0.34, 1.1), P(-0.72, 0.92), P(-0.95, 0.5), P(-1.0, 0), P(-0.72, -0.72)];
  }
  if (view === "front") {
    const fem = look.frame === "fem" || look.age === "teen";
    let cheek = [0.97, 0.44];
    let jaw = fem ? [0.72, 1.02] : [0.78, 1.04];
    let chinS = fem ? [0.24, 1.37] : [0.3, 1.4];
    let bottom = fem ? 1.42 : 1.44;
    if (kid) {
      cheek = [1.02, 0.5];
      jaw = [0.88, 0.92];
      chinS = [0.42, 1.18];
      bottom = 1.22;
    } else if (heavy) {
      cheek = [1.06, 0.5];
      jaw = [0.96, 1.02];
      chinS = [0.46, 1.32];
      bottom = 1.36;
    } else if (masc) {
      cheek = [0.97, 0.46];
      jaw = [0.84, 1.08];
      chinS = [0.36, 1.44];
      bottom = 1.48;
    }
    const pts: CPt[] = [P(0, -1), P(0.72, -0.72), P(1.0, -0.05), P(cheek[0], cheek[1]), P(jaw[0], jaw[1]), P(chinS[0], chinS[1]), P(0, bottom)];
    const left = pts.slice(1, -1).reverse().map((p) => ({ ...p, x: -p.x }));
    return [...pts, ...left];
  }
  // 3/4 view, turned right.
  if (kid) {
    return [P(-0.1, -1.02), P(0.62, -0.8), P(0.94, -0.28), P(0.99, 0.18), P(0.97, 0.38), P(1.0, 0.6), P(0.9, 0.9), P(0.64, 1.12), P(0.42, 1.2), P(0.0, 1.12), P(-0.42, 0.92), P(-0.78, 0.55), P(-1.04, 0.0), P(-0.86, -0.62)];
  }
  if (heavy) {
    return [P(-0.1, -1.0), P(0.6, -0.8), P(0.92, -0.3), P(0.98, 0.12), P(0.96, 0.33), P(1.02, 0.55), P(0.98, 0.9), P(0.72, 1.24), P(0.46, 1.34), P(0.0, 1.24), P(-0.44, 1.0), P(-0.74, 0.58), P(-1.04, 0.0), P(-0.86, -0.62)];
  }
  if (masc) {
    return [P(-0.1, -1.0), P(0.6, -0.8), P(0.92, -0.3), P(0.98, 0.12), P(0.955, 0.33), P(0.985, 0.56), P(0.92, 0.94), P(0.78, 1.34), P(0.52, 1.47), P(0.02, 1.28), P(-0.36, 1.06), P(-0.72, 0.56), P(-1.03, 0.0), P(-0.86, -0.62)];
  }
  return [P(-0.1, -1.0), P(0.6, -0.8), P(0.92, -0.3), P(0.975, 0.12), P(0.95, 0.33), P(0.975, 0.55), P(0.86, 0.94), P(0.64, 1.33), P(0.47, 1.42), P(0.0, 1.22), P(-0.4, 0.96), P(-0.72, 0.56), P(-1.03, 0.0), P(-0.86, -0.62)];
}

/** Ear shapes; `behind` ears are drawn before the head outline. */
export function drawEars(pen: Pen, g: FaceGeo, fill: string, ink: Ink): { behind: string; over: string } {
  const R = g.R;
  const earShape = (c: V2, flip: number, tilt: number): string => {
    const pts = ellipsePts(c, 0.14 * R, 0.25 * R, tilt, 10);
    const inner = [add(c, v(flip * 0.02 * R, -0.13 * R)), add(c, v(-flip * 0.06 * R, -0.02 * R)), add(c, v(flip * 0.0 * R, 0.12 * R))];
    return shape(pen.curve(pts), fill, ink.lw * 0.8) + line(pen.curve(inner, false), ink.dw);
  };
  if (g.view === "side") return { behind: "", over: earShape(v(-0.44 * R, 0.5 * R), 1, 8) };
  const y = 0.47 * R;
  const behind = earShape(v(1.0 * R, y), -1, -8) + earShape(v(-1.0 * R, y), 1, 8);
  return { behind, over: "" };
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

type EyeKind = "open" | "happy" | "sleep" | "squeeze" | "shut" | "heart";
type MouthKind =
  | "line"
  | "smile"
  | "frown"
  | "firm"
  | "smirk"
  | "grin"
  | "laugh"
  | "grit"
  | "shout"
  | "o"
  | "wavy"
  | "wavyOpen"
  | "flatOpen"
  | "sleep"
  | "wail"
  | "grimace"
  | "pout";

interface ExprSpec {
  eye: EyeKind;
  open: number;
  tilt: number;
  iris: number;
  look: [number, number];
  lower: number;
  brow: [number, number, number];
  browAsym: number;
  wobble: boolean;
  mouth: MouthKind;
  mw: number;
  tears?: boolean;
  blush?: boolean;
  bags?: boolean;
  shine?: number;
}

const E = (p: Partial<ExprSpec>): ExprSpec => ({
  eye: "open",
  open: 1,
  tilt: 0,
  iris: 1,
  look: [0, 0],
  lower: 0,
  brow: [0, 0, 0.03],
  browAsym: 0,
  wobble: false,
  mouth: "line",
  mw: 1,
  ...p,
});

export const EXPR: Record<Expression, ExprSpec> = {
  neutral: E({ mouth: "line", mw: 0.8 }),
  happy: E({ open: 0.88, lower: 0.35, brow: [-0.06, -0.02, 0.07], mouth: "grin", mw: 1.05 }),
  laugh: E({ eye: "happy", brow: [-0.1, -0.03, 0.08], mouth: "laugh", mw: 1.25 }),
  gentle: E({ open: 0.6, lower: 0.25, brow: [-0.04, 0.02, 0.06], mouth: "smile", mw: 0.8, blush: true }),
  sad: E({ open: 0.78, tilt: -14, iris: 1.05, look: [0, 0.25], brow: [-0.13, 0.07, 0.0], mouth: "frown", mw: 0.72, shine: 1.5 }),
  cry: E({ eye: "shut", brow: [-0.16, 0.08, 0.0], wobble: true, mouth: "wail", mw: 1.1, tears: true }),
  angry: E({ open: 0.84, tilt: 20, iris: 0.72, brow: [0.14, -0.08, -0.02], mouth: "grit", mw: 1.0 }),
  shout: E({ open: 1.15, tilt: 14, iris: 0.55, brow: [0.14, -0.11, -0.01], mouth: "shout", mw: 1.3 }),
  surprised: E({ open: 1.32, iris: 0.5, brow: [-0.22, -0.2, 0.08], mouth: "o", mw: 0.5 }),
  afraid: E({ open: 1.28, tilt: -10, iris: 0.36, brow: [-0.22, 0.02, 0.0], wobble: true, mouth: "wavyOpen", mw: 1.0 }),
  determined: E({ open: 0.8, tilt: 12, iris: 0.92, brow: [0.09, -0.07, 0.0], mouth: "firm", mw: 0.72 }),
  thinking: E({ open: 0.82, look: [0.45, -0.45], brow: [-0.02, 0.0, 0.03], browAsym: -0.12, mouth: "pout", mw: 0.8 }),
  worried: E({ open: 1.0, tilt: -10, iris: 0.88, brow: [-0.16, 0.05, 0.0], wobble: true, mouth: "wavy", mw: 0.62 }),
  smug: E({ open: 0.55, look: [0.35, 0], tilt: 4, brow: [0.04, -0.03, 0.02], browAsym: -0.11, mouth: "smirk", mw: 0.8 }),
  tired: E({ open: 0.45, look: [0, 0.25], brow: [-0.02, 0.07, 0.0], mouth: "flatOpen", mw: 0.5, bags: true }),
  asleep: E({ eye: "sleep", brow: [-0.03, 0.05, 0.02], mouth: "sleep", mw: 0.4 }),
  pain: E({ eye: "squeeze", brow: [-0.12, 0.1, -0.02], wobble: true, mouth: "grimace", mw: 0.95 }),
  love: E({ eye: "heart", open: 1.05, lower: 0.2, brow: [-0.07, 0, 0.06], mouth: "grin", mw: 0.9, blush: true }),
};

// ---------------------------------------------------------------------------
// Eyes
// ---------------------------------------------------------------------------

interface EyeFrame {
  c: V2;
  /** +1 when the eye's outer corner points screen-right. */
  out: number;
  w: number;
  h: number;
}

function sampleY(pts: V2[], x: number): number {
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if ((x >= a.x && x <= b.x) || (x <= a.x && x >= b.x)) {
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * t;
    }
  }
  return x < pts[0].x === pts[0].x < pts[pts.length - 1].x ? pts[0].y : pts[pts.length - 1].y;
}

function drawEye(pen: Pen, g: FaceGeo, f: EyeFrame, x: ExprSpec, pal: Palette, ink: Ink, gem: boolean): string {
  const { w, h } = f;
  const R = g.R;
  // Eye-local → head-local: +x outward.
  const L = (p: V2): V2 => ({ x: f.c.x + p.x * f.out, y: f.c.y + p.y });
  const Lc = (p: CPt): CPt => ({ ...L(p), c: p.c });
  const lashW = g.lash * (w / g.eyeW) ** 0.5;
  const strokeW = Math.max(ink.dw * 1.4, lashW * 0.95);
  if (x.eye === "happy") {
    return line(pen.curve([L(v(-w * 0.95, h * 0.3)), L(v(0, -h * 0.55)), L(v(w, h * 0.25))], false), strokeW);
  }
  if (x.eye === "sleep") {
    const a = L(v(-w * 0.95, -h * 0.05));
    const b = L(v(w, -h * 0.02));
    return (
      line(pen.curve([a, L(v(0.05 * w, h * 0.45)), b], false), strokeW) +
      line(pen.curve([L(v(w * 0.78, h * 0.18)), L(v(w * 1.02, h * 0.45))], false), ink.dw * 1.2)
    );
  }
  if (x.eye === "squeeze") {
    return line(pen.poly([L(v(w * 0.95, -h * 0.55)), L(v(-w * 0.7, h * 0.05)), L(v(w * 0.95, h * 0.6))], false), strokeW);
  }
  if (x.eye === "shut") {
    return line(pen.curve([L(v(-w * 0.95, -h * 0.05)), L(v(-w * 0.3, h * 0.35)), L(v(w * 0.3, h * 0.25)), L(v(w, h * 0.35))], false), strokeW * 1.15);
  }
  const open = x.open;
  const t = -x.tilt;
  const T = (p: V2): V2 => rot(p, t);
  const upper = [v(-w, h * 0.25), v(-w * 0.62, -h * 0.72 * open), v(-w * 0.05, -h * open), v(w * 0.55, -h * 0.84 * open), v(w * 1.04, h * 0.02)].map(T);
  const lowY = h * (0.95 - x.lower * 0.75) * Math.max(0.85, open);
  const lower = [v(-w * 0.82, h * 0.6), v(-w * 0.25, lowY), v(w * 0.4, lowY * 0.96), v(w * 0.98, h * 0.35)];
  const white = [...upper, ...[...lower].reverse()];
  let s = solid(pen.curve(white.map(L)), gem ? pal.white : PAPER);
  // Iris clipped between the lids.
  const irisRx = w * (g.look.age === "child" ? 0.6 : 0.54) * x.iris;
  const irisRy = Math.max(h, 0.2 * R) * 0.9 * x.iris;
  // Eye-local x is mirrored per eye; `look` is in screen terms.
  const icl = v(x.look[0] * f.out * w * 0.38, h * 0.08 + x.look[1] * h * 0.35);
  const upSorted = [...upper].sort((a, b) => a.x - b.x);
  const lowSorted = [...lower].sort((a, b) => a.x - b.x);
  const clipped: V2[] = ellipsePts(icl, irisRx, irisRy, 0, 22).map((p) => {
    const px = clamp(p.x, -w * 0.98, w);
    const top = sampleY(upSorted, px) + lashW * 0.25;
    const bot = sampleY(lowSorted, px) - h * 0.02;
    return v(px, clamp(p.y, top, Math.max(top, bot)));
  });
  const visTop = Math.min(...clipped.map((p) => p.y));
  const visBot = Math.max(...clipped.map((p) => p.y));
  if (x.eye === "heart") {
    const hc = v(icl.x, (visTop + visBot) / 2);
    const k = Math.min(irisRx, (visBot - visTop) * 0.62);
    const heart: CPt[] = [
      v(hc.x, hc.y - k * 0.45),
      v(hc.x + k * 0.55, hc.y - k * 1.0),
      v(hc.x + k * 1.05, hc.y - k * 0.35),
      { x: hc.x, y: hc.y + k * 0.95, c: true },
      v(hc.x - k * 1.05, hc.y - k * 0.35),
      v(hc.x - k * 0.55, hc.y - k * 1.0),
    ];
    heart[0] = { ...heart[0], c: true };
    s += solid(pen.curve(heart.map(Lc)), INK);
    s += circle(pen.circle(L(v(hc.x - k * 0.45, hc.y - k * 0.45)), k * 0.2), PAPER);
  } else if (gem) {
    const gc = v(icl.x, (visTop + visBot) / 2);
    const gr = Math.min(irisRx * 1.05, (visBot - visTop) * 0.6);
    const facets = [v(0, -gr), v(gr * 0.85, -gr * 0.3), v(gr * 0.6, gr * 0.8), v(-gr * 0.6, gr * 0.8), v(-gr * 0.85, -gr * 0.3)].map((p) => add(gc, p));
    s += shape(pen.poly(facets.map(L)), "#4a4a4a", ink.dw);
    const inner = [v(0, -gr * 0.4), v(gr * 0.4, -gr * 0.05), v(gr * 0.25, gr * 0.4), v(-gr * 0.25, gr * 0.4), v(-gr * 0.4, -gr * 0.05)].map((p) => add(gc, p));
    s += shape(pen.poly(inner.map(L)), INK, ink.dw * 0.6);
    for (let i = 0; i < 5; i += 1) s += line(pen.poly([L(facets[i]), L(inner[i])], false), ink.dw * 0.6, PAPER);
    s += solid(pen.poly([L(add(gc, v(-gr * 0.55, -gr * 0.3))), L(add(gc, v(-gr * 0.1, -gr * 0.75))), L(add(gc, v(-gr * 0.2, -gr * 0.15)))]), PAPER);
  } else {
    s += solid(pen.curve(clipped.map(L)), INK);
    // Highlights: big upper-outer, small lower-inner (larger when watery).
    const shine = x.shine ?? 1;
    const hr = irisRx * 0.3 * shine;
    const visH = visBot - visTop;
    if (visH > irisRy * 0.25) {
      const hy = clamp(icl.y - irisRy * 0.32, visTop + hr * 0.9, visBot - hr * 0.6);
      s += circle(pen.circle(L(v(icl.x + irisRx * 0.28, hy)), Math.min(hr, visH * 0.3)), PAPER);
      if (x.iris > 0.6 && visH > irisRy * 0.8) s += circle(pen.circle(L(v(icl.x - irisRx * 0.32, icl.y + irisRy * 0.36)), irisRx * 0.13 * shine), PAPER);
    } else {
      s += circle(pen.circle(L(v(icl.x + irisRx * 0.2, (visTop + visBot) / 2)), Math.max(visH * 0.3, irisRx * 0.08)), PAPER);
    }
  }
  // Lash line: thick along the upper lid, flicked at the outer corner.
  const lashTop = upper.map((p, i) => v(p.x, p.y - lashW * (0.35 + 0.65 * (i / (upper.length - 1)))));
  const fem = g.look.frame === "fem" || g.look.age === "child";
  const flick = add(upper[upper.length - 1], rot(v(w * (fem ? 0.3 : 0.14), -lashW * (fem ? 1.1 : 0.4)), t));
  const lashPts: CPt[] = [{ ...upper[0], c: true }, ...lashTop.slice(1), { ...flick, c: true }, ...[...upper].reverse().slice(0, -1)];
  s += solid(pen.curve(lashPts.map(Lc)), INK);
  // Lower lid: short thin stroke at the outer side.
  s += line(pen.curve([L(lerp(lower[1], lower[2], 0.4)), L(lower[2]), L(lower[3])], false), ink.dw * 0.9);
  if (x.bags) s += line(pen.curve([L(v(-w * 0.5, lowY + 0.12 * R)), L(v(w * 0.1, lowY + 0.16 * R)), L(v(w * 0.7, lowY + 0.1 * R))], false), ink.dw * 0.8);
  return s;
}

function drawBrow(pen: Pen, g: FaceGeo, f: EyeFrame, x: ExprSpec, asym: number, halo: string): string {
  const R = g.R;
  const w = f.w;
  const h0 = g.eyeH;
  const [bi, bo, arch] = x.brow;
  const base = -h0 - 0.2 * R - (x.open > 1.1 ? (x.open - 1.1) * h0 * 0.6 : 0);
  const inner = v(-w * 0.95, base + (bi + asym) * R);
  const outer = v(w * 1.15, base + (bo + asym) * R + 0.04 * R);
  const mid = v(w * 0.1, (inner.y + outer.y) / 2 - (arch + 0.03) * R);
  const pts: V2[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = lerp(inner, mid, t);
    const b = lerp(mid, outer, t);
    const p = lerp(a, b, t);
    if (x.wobble) p.y += Math.sin(t * Math.PI * 2) * 0.025 * R;
    pts.push(p);
  }
  const thick = (t: number) => g.browT * mix(1, 0.35, t);
  const top: CPt[] = [];
  const bot: CPt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const p = pts[i];
    const q = pts[Math.min(steps, i + 1)];
    const o = pts[Math.max(0, i - 1)];
    const dir = v(q.x - o.x, q.y - o.y);
    const l = Math.hypot(dir.x, dir.y) || 1;
    const nrm = v(dir.y / l, -dir.x / l);
    const k = thick(t) / 2;
    top.push(v(p.x + nrm.x * k, p.y + nrm.y * k));
    bot.push(v(p.x - nrm.x * k, p.y - nrm.y * k));
  }
  const poly: CPt[] = [...top, ...bot.reverse()].map((p) => ({ x: f.c.x + p.x * f.out, y: f.c.y + p.y }));
  const d = pen.curve(poly);
  return `<path d="${d}" fill="${INK}" stroke="${halo}" stroke-width="${n(g.browT * 0.55 * pen.s)}" paint-order="stroke"/>`;
}

// ---------------------------------------------------------------------------
// Mouth
// ---------------------------------------------------------------------------

function drawMouth(pen: Pen, g: FaceGeo, x: ExprSpec, ink: Ink): string {
  const R = g.R;
  const side = g.view === "side";
  const mw = g.mouthW * x.mw;
  const c = g.mouth;
  const M = (px: number, py: number): V2 => {
    const k = side ? (px > 0 ? 0.72 : 0.95) : 1;
    return v(c.x + px * k, c.y + py * R);
  };
  const Mc = (px: number, py: number): CPt => ({ ...M(px, py), c: true });
  const sw = Math.max(ink.dw * 1.25, R * 0.045);
  const fillOpen = (pts: CPt[], teeth: boolean, tongue: boolean): string => {
    let s = shape(pen.curve(pts), INK, ink.dw);
    if (teeth) {
      const a = pts[0];
      const b = pts[Math.floor(pts.length / 2) - 1] ?? pts[1];
      const tw = (b.y - a.y) * 0 + R * 0.06;
      s += solid(pen.curve([{ ...a, c: true }, { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - R * 0.005 }, { ...b, c: true }, { x: b.x - (b.x - a.x) * 0.1, y: b.y + tw }, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + tw * 1.1 }, { x: a.x + (b.x - a.x) * 0.1, y: a.y + tw }]), PAPER);
    }
    if (tongue) {
      const low = pts.reduce((m, p) => (p.y > m.y ? p : m), pts[0]);
      const tc = v(low.x, low.y - R * 0.07);
      s += solid(pen.curve(ellipsePts(tc, mw * 0.5, R * 0.06, 0, 8)), "#9a9a9a");
    }
    return s;
  };
  switch (x.mouth) {
    case "line":
      return line(pen.curve([M(-mw, 0), M(0, 0.015), M(mw, 0)], false), sw);
    case "smile":
      return line(pen.curve([M(-mw, -0.04), M(0, 0.06), M(mw, -0.04)], false), sw);
    case "frown":
      return line(pen.curve([M(-mw, 0.05), M(0, -0.045), M(mw, 0.05)], false), sw);
    case "firm":
      return line(pen.curve([M(-mw, 0.03), M(0, 0.0), M(mw, 0.03)], false), sw * 1.1) + line(pen.curve([M(-mw * 0.3, 0.1), M(mw * 0.3, 0.1)], false), ink.dw);
    case "smirk":
      return line(pen.curve([M(-mw * 0.75, 0.03), M(mw * 0.2, 0.05), M(mw, -0.07)], false), sw) + line(pen.curve([M(mw * 0.92, -0.1), M(mw * 1.08, -0.03)], false), ink.dw);
    case "pout":
      return line(pen.curve([M(0.05 * mw, 0.02), M(0.45 * mw, -0.01), M(0.85 * mw, 0.03)], false), sw);
    case "grin":
      return fillOpen([Mc(-mw, -0.03), M(0, -0.01), Mc(mw, -0.03), M(mw * 0.55, 0.19), M(0, 0.26), M(-mw * 0.55, 0.19)], true, true);
    case "laugh":
      return fillOpen([Mc(-mw, -0.06), M(0, -0.04), Mc(mw, -0.06), M(mw * 0.62, 0.3), M(0, 0.4), M(-mw * 0.62, 0.3)], true, true);
    case "shout":
      return fillOpen([Mc(-mw, -0.1), M(0, -0.13), Mc(mw, -0.1), M(mw * 0.82, 0.3), M(0, 0.42), M(-mw * 0.82, 0.3)], true, true);
    case "wail":
      return fillOpen([Mc(-mw, 0.06), M(0, -0.06), Mc(mw, 0.06), M(mw * 0.72, 0.3), M(0, 0.36), M(-mw * 0.72, 0.3)], false, true);
    case "o":
      return shape(pen.curve(ellipsePts(M(0, 0.03), mw * 0.55, R * 0.1, 0, 10)), INK, ink.dw);
    case "wavy":
      return line(pen.curve([M(-mw, 0.02), M(-mw * 0.5, -0.03), M(0, 0.02), M(mw * 0.5, -0.03), M(mw, 0.02)], false), sw);
    case "wavyOpen":
      return fillOpen([Mc(-mw, 0.02), M(-mw * 0.5, -0.04), M(0, 0.01), M(mw * 0.5, -0.04), Mc(mw, 0.02), M(mw * 0.55, 0.15), M(0, 0.18), M(-mw * 0.55, 0.15)], false, false);
    case "flatOpen":
      return shape(pen.curve(ellipsePts(M(0, 0.02), mw * 0.9, R * 0.045, 0, 10)), INK, ink.dw);
    case "sleep":
      return shape(pen.curve(ellipsePts(M(0, 0.02), mw * 0.7, R * 0.055, 0, 10)), INK, ink.dw);
    case "grit":
    case "grimace": {
      const hgt = x.mouth === "grit" ? 0.17 : 0.13;
      const top = x.mouth === "grimace" ? [M(-mw, -0.04), M(-mw * 0.5, -0.07), M(0, -0.03), M(mw * 0.5, -0.07), M(mw, -0.04)] : [M(-mw, -0.06), M(0, -0.075), M(mw, -0.06)];
      const bot = [M(mw * 1.05, hgt - 0.05), M(0, hgt - 0.02), M(-mw * 1.05, hgt - 0.05)];
      const pts: CPt[] = [{ ...top[0], c: true }, ...top.slice(1, -1), { ...top[top.length - 1], c: true }, { ...bot[0], c: true }, bot[1], { ...bot[2], c: true }];
      let s = shape(pen.curve(pts), PAPER, sw * 0.8);
      s += line(pen.curve([M(-mw * 1.0, hgt / 2 - 0.055), M(0, hgt / 2 - 0.045), M(mw * 1.0, hgt / 2 - 0.055)], false), ink.dw);
      for (const k of [-0.5, 0, 0.5]) s += line(pen.poly([M(mw * k, -0.06), M(mw * k, hgt - 0.03)], false), ink.dw * 0.8);
      return s;
    }
  }
}

// ---------------------------------------------------------------------------
// Face assembly
// ---------------------------------------------------------------------------

export interface FaceOut {
  /** Features drawn under the hair (eyes, nose, tears, blush). */
  under: string;
  /** Mouth (drawn after facial hair so beards never hide it). */
  mouth: string;
  /** Brows (drawn over bangs, knocked out with the skin colour). */
  brows: string;
}

export function drawFace(pen: Pen, g: FaceGeo, expr: Expression, pal: Palette, ink: Ink): FaceOut {
  if (g.view === "back") return { under: "", mouth: "", brows: "" };
  const x = EXPR[expr];
  const R = g.R;
  const side = g.view === "side";
  const look = g.look;
  const gem = look.material === "gold";
  const frames: EyeFrame[] = side
    ? [
        { c: v(0.02 * R, g.eyeY), out: -1, w: g.eyeW, h: g.eyeH },
        { c: v(0.67 * R, g.eyeY - 0.01 * R), out: 1, w: g.eyeW * 0.64, h: g.eyeH * 0.98 },
      ]
    : [
        { c: v(-g.eyeX, g.eyeY), out: -1, w: g.eyeW, h: g.eyeH },
        { c: v(g.eyeX, g.eyeY), out: 1, w: g.eyeW, h: g.eyeH },
      ];
  let under = "";
  // Nose.
  const nd = ink.dw * 1.1;
  const noseY = (look.age === "child" ? 0.7 : look.age === "teen" ? 0.76 : 0.8) * R;
  if (side) {
    const k = look.age === "child" ? 0.7 : 1;
    under += line(pen.curve([v(0.9 * R, noseY - 0.2 * k * R), v((0.9 + 0.07 * k) * R, noseY - 0.02 * R), v(0.86 * R, noseY + 0.02 * R)], false), nd);
  } else {
    const k = look.age === "child" ? 0.6 : look.frame === "masc" || look.age === "elder" ? 1.15 : 0.85;
    under += line(pen.curve([v(0.03 * R, noseY - 0.1 * k * R), v(-0.035 * R, noseY), v(0.025 * R, noseY + 0.02 * R)], false), nd);
  }
  // Age lines.
  if (look.age === "elder") {
    for (const f of frames) {
      const o = f.out;
      under += line(pen.curve([v(f.c.x + o * f.w * 1.15, f.c.y - 0.02 * R), v(f.c.x + o * f.w * 1.3, f.c.y + 0.06 * R)], false), ink.dw * 0.7);
    }
    const mx = g.mouth.x;
    under += line(pen.curve([v(mx - 0.26 * R, 0.74 * R), v(mx - 0.3 * R, 0.86 * R), v(mx - 0.27 * R, 0.96 * R)], false), ink.dw * 0.7);
    if (!side) under += line(pen.curve([v(0.26 * R, 0.74 * R), v(0.3 * R, 0.86 * R), v(0.27 * R, 0.96 * R)], false), ink.dw * 0.7);
  }
  if (look.build === "heavy" && look.age !== "child") {
    const cx = side ? 0.2 * R : 0;
    under += line(pen.curve([v(cx - 0.3 * R, 1.22 * R), v(cx, 1.3 * R), v(cx + 0.3 * R, 1.22 * R)], false), ink.dw * 0.8);
  }
  for (const f of frames) under += drawEye(pen, g, f, x, pal, ink, gem);
  if (x.blush) {
    for (const f of frames) {
      const bc = v(f.c.x + f.out * f.w * 0.3, f.c.y + g.eyeH + 0.2 * R);
      for (let i = -1; i <= 1; i += 1) {
        const p = add(bc, v(i * 0.07 * R * (f.w / g.eyeW), 0));
        under += line(pen.poly([add(p, v(0.03 * R, -0.04 * R)), add(p, v(-0.03 * R, 0.04 * R))], false), ink.dw);
      }
    }
  }
  if (x.tears) {
    for (const f of frames) {
      const k = f.w / g.eyeW;
      const top = v(f.c.x + f.out * f.w * 0.15, f.c.y + g.eyeH * 0.5);
      const bot = v(top.x + f.out * 0.05 * R, 1.25 * R);
      const tw = 0.05 * R * k;
      const pts: CPt[] = [
        v(top.x - tw, top.y),
        v(lerp(top, bot, 0.5).x - tw * 1.1, lerp(top, bot, 0.5).y),
        v(bot.x - tw * 1.3, bot.y),
        v(bot.x, bot.y + tw * 1.8),
        v(bot.x + tw * 1.3, bot.y),
        v(lerp(top, bot, 0.5).x + tw * 1.1, lerp(top, bot, 0.5).y),
        v(top.x + tw, top.y),
      ];
      under += shape(pen.curve(pts), PAPER, ink.dw * 1.1);
      under += line(pen.curve([v(top.x, top.y + 0.1 * R), v(top.x + f.out * 0.01 * R, top.y + 0.35 * R)], false), ink.dw * 0.6);
    }
  }
  const mouth = drawMouth(pen, g, x, ink);
  let brows = "";
  const halo = pal.skin;
  frames.forEach((f, i) => {
    const asym = x.browAsym !== 0 && i === frames.length - 1 ? x.browAsym : 0;
    brows += drawBrow(pen, g, f, x, asym, halo);
  });
  return { under, mouth, brows };
}

/** Head skin shape (with ears) — returns the outline path for silhouettes. */
export function drawHeadShape(pen: Pen, g: FaceGeo, pal: Palette, ink: Ink): { svg: string; d: string } {
  const d = pen.curve(headOutline(g));
  return { svg: shape(d, pal.skin, ink.lw), d };
}

