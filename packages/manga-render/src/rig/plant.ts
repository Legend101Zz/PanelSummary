/**
 * Plant rig: oak, tree (an evergreen fir), rose_bush, flower, reed (a
 * bulrush with a velvet seed head), daisy.
 *
 * Trees carry a bark face on the trunk and two limbs as arms; flexible
 * plants carry their face on the bloom / seed head at the end of a stem
 * that bends with the pose (the reed's bow is a curtsy). Leaves and limbs
 * are the gesturing "hands".
 */
import type { Expression, PlantLook, Point, Pose, Tone } from "../contracts.js";
import type { DrawContext, FigureDrawing, FigureRequest } from "../internal.js";
import type { KindRig } from "./kind.js";
import {
  DEG,
  INK,
  P,
  PAPER,
  type Pen,
  Sketch,
  addP,
  anchorsFrom,
  finishFigure,
  blobD,
  charRand,
  circleD,
  curveD,
  darker,
  ellipsePts,
  fillOf,
  isDark,
  lerp,
  lerpP,
  lighter,
  lineD,
  makePen,
  polar,
  puffD,
  rotP,
  spline,
  taperD,
} from "./creature/common.js";
import { ALL_EXPRESSIONS, drawFace } from "./creature/face.js";

type Species = PlantLook["species"];
const HEIGHT: Record<Species, number> = { oak: 260, tree: 200, rose_bush: 70, flower: 25, reed: 90, daisy: 15 };
const POSES: readonly Pose[] = ["stand", "talk", "bow", "reach", "cower", "wave", "point"];

interface Built {
  sk: Sketch;
  head: Point;
  headR: number;
  mouth: Point;
  hand?: Point;
  waist: number;
  shoulders: number;
}

interface Ctx {
  pen: Pen;
  tone: Tone;
  face: boolean;
  turn: number;
  back: boolean;
  pose: Pose;
  expression: Expression;
  rand: () => number;
}

function faceOn(sk: Sketch, c: Ctx, at: Point, gap: number, eyeR: number, mouthDy: number, mouthW: number, dark: boolean, rot = 0): void {
  if (!c.face || c.back) return;
  sk.raw(drawFace({ c: at, gap, eyeR, turn: c.turn, pen: c.pen, headR: gap * 2.4, dark, mouth: { dy: mouthDy, w: mouthW }, talking: c.pose === "talk", rot }, c.expression));
}

/** Gesture angles for the near/far "arm" (limb, leaf) of a plant. */
function limbAngles(pose: Pose): { near: number; far: number } {
  switch (pose) {
    case "talk":
      return { near: -25, far: 200 };
    case "reach":
      return { near: -60, far: 240 };
    case "wave":
      return { near: -80, far: 195 };
    case "point":
      return { near: -8, far: 195 };
    case "bow":
      return { near: 50, far: 130 };
    case "cower":
      return { near: -130, far: 290 };
    default:
      return { near: -15, far: 195 };
  }
}

// ---------------------------------------------------------------------------
// Oak

function oak(c: Ctx): Built {
  const sk = new Sketch(c.pen);
  const pen = c.pen;
  const leaf = fillOf(c.tone, pen);
  const leafDark = fillOf(darker(c.tone), pen);
  const bark = fillOf("mid", pen);
  const lean = c.pose === "bow" ? 34 : c.pose === "cower" ? -8 : c.pose === "talk" ? 4 : 0;
  const shrink = c.pose === "cower" ? 0.92 : c.pose === "reach" ? 1.03 : 1;
  const trunkTopY = -112 * shrink;
  // trunk spine bends forward for bow
  const bend = (y: number) => (lean * DEG * (y / trunkTopY) ** 2 * -trunkTopY * 0.9);
  const tp = (x: number, y: number) => P(x + bend(y), y);
  const crown = tp(0, trunkTopY - 66 * shrink);
  const crownShift = P(crown.x, crown.y);
  // canopy: clustered puffs behind (dark) and front
  const clusters: [number, number, number, number][] = [
    [-92, 4, 56, 40],
    [92, 2, 56, 40],
    [-48, -38, 66, 48],
    [52, -40, 64, 48],
    [2, -72, 62, 42],
    [0, 8, 78, 44],
    [-128, 18, 30, 26],
    [128, 16, 30, 26],
  ];
  const sway = c.pose === "reach" ? -6 : 0;
  for (const [x, y, rx, ry] of clusters) {
    sk.shape(puffD(P(crownShift.x + x, crownShift.y + y + sway + 10), rx, ry, 9, 0.55, c.rand), leafDark, { edge: false });
  }
  for (const [x, y, rx, ry] of clusters) {
    sk.shape(puffD(P(crownShift.x + x, crownShift.y + y + sway), rx * 0.97, ry * 0.92, 9, 0.55, c.rand), leaf, { edge: pen.dw });
  }
  // leaf texture: small scallop marks
  for (let i = 0; i < 16; i += 1) {
    const x = crownShift.x + (c.rand() - 0.5) * 220;
    const y = crownShift.y + (c.rand() - 0.65) * 110;
    sk.line(curveD([P(x - 6, y), P(x - 3, y + 3), P(x, y), P(x + 3, y + 3), P(x + 6, y)]), pen.fw, { halo: isDark(c.tone) });
  }
  // trunk with root flare
  const spine = [tp(0, 0), tp(0, -40), tp(0, -80), tp(0, trunkTopY), tp(0, trunkTopY - 30)];
  sk.layer();
  sk.shape(taperD(spine, [74, 58, 52, 46, 36], { samples: 5, capStart: false }), bark);
  // fork: two big limbs rising into the crown
  for (const s2 of [-1, 1]) sk.shape(taperD([tp(s2 * 8, trunkTopY + 10), tp(s2 * 34, trunkTopY - 22), tp(s2 * 62, trunkTopY - 44)], [26, 18, 10], { samples: 4 }), bark, { edge: pen.dw });
  // roots
  for (const s of [-1, 1]) {
    sk.shape(taperD([tp(s * 26, -16), P(s * 48 + bend(-5), -4), P(s * 68, -1.6)], [18, 9, 3], { samples: 4 }), bark, { edge: false });
  }
  sk.shape(taperD([tp(4, -8), P(12 + bend(-4), -2), P(24, -0.8)], [12, 6, 2], { samples: 3 }), bark, { edge: false });
  // bark lines
  for (const x of [-22, -9, 11, 23]) {
    const pts = [tp(x, -8), tp(x + 2, -45), tp(x - 1, -80), tp(x + 1, trunkTopY + 10)];
    sk.line(curveD(pts), pen.fw * 1.3);
  }
  // limbs (arms): near and far, from below the canopy
  const la = limbAngles(c.pose);
  const limb = (side: number, ang: number) => {
    const base = tp(side * 22, -92 * shrink);
    const len = 70;
    const a = ang * DEG;
    const mid = polar(base, len * 0.55, a + side * 0.15);
    const tip = polar(mid, len * 0.5, a - side * 0.1);
    sk.shape(taperD([base, mid, tip], [20, 11, 4], { samples: 5 }), bark, { edge: pen.dw });
    // twigs + a leaf tuft at the tip
    sk.line(lineD([lerpP(mid, tip, 0.5), polar(lerpP(mid, tip, 0.5), 12, a - 0.8)]), pen.dw * 2);
    sk.shape(puffD(tip, 11, 9, 6, 0.5, c.rand), leaf);
    return tip;
  };
  const farTip = limb(-1, la.far);
  const hand = limb(1, la.near);
  void farTip;
  // canopy front lip over the trunk top
  sk.shape(puffD(P(crownShift.x, crownShift.y + 40), 70, 22, 8, 0.5, c.rand), leaf, { edge: pen.dw });
  // bark face
  const fc = tp(c.turn * 8, -60 * shrink);
  if (c.face && !c.back) {
    // pale blaze of bark where the face lives
    sk.shape(blobD(ellipsePts(P(fc.x + c.turn * 5, fc.y + 7), 27, 34, 16), 0.5), fillOf("light", pen), { outline: false, edge: pen.dw });
  }
  faceOn(sk, c, fc, 12.5, 8, 22, 12, false, lean * DEG * 0.3);
  return { sk, head: fc, headR: 32, mouth: P(fc.x + c.turn * 8, fc.y + 22), hand, waist: -40, shoulders: -92 * shrink };
}

// ---------------------------------------------------------------------------
// Fir ("tree")

function fir(c: Ctx): Built {
  const sk = new Sketch(c.pen);
  const pen = c.pen;
  const needles = fillOf(c.tone, pen);
  const dark = fillOf(darker(c.tone), pen);
  const lean = c.pose === "bow" ? 22 : c.pose === "cower" ? -6 : c.pose === "talk" ? 3 : 0;
  const H = 200 * (c.pose === "cower" ? 0.93 : 1);
  const xAt = (y: number) => Math.sin(lean * DEG) * (-y) * (-y / H) * 0.9;
  // trunk
  sk.shape(taperD([P(0, 0), P(xAt(-40), -40)], [20, 16], { samples: 2, capStart: false }), fillOf("mid", pen));
  // boughs as arms (behind tiers)
  const la = limbAngles(c.pose);
  const bough = (side: number, ang: number) => {
    const base = P(xAt(-78) + side * 12, -78);
    const a = ang * DEG;
    const tip = polar(base, 62, a);
    const nrm = a - Math.PI / 2;
    const pts: Point[] = [base];
    for (let i = 1; i <= 5; i += 1) {
      const p = lerpP(base, tip, i / 5);
      pts.push(polar(p, 10 - i, nrm), polar(lerpP(base, tip, (i + 0.5) / 5), 3, nrm));
    }
    pts.push(tip);
    for (let i = 5; i >= 1; i -= 1) {
      const p = lerpP(base, tip, i / 5);
      pts.push(polar(p, 10 - i, nrm + Math.PI), polar(lerpP(base, tip, (i - 0.5) / 5), 3, nrm + Math.PI));
    }
    sk.shape(lineDClosed(pts), dark);
    return tip;
  };
  bough(-1, la.far);
  // tiers from bottom to top
  const tiers = 5;
  for (let i = 0; i < tiers; i += 1) {
    const t0 = i / tiers;
    const yb = -30 - t0 * (H - 45);
    const yt = yb - (H - 20) * 0.34;
    const w = 62 * (1 - t0 * 0.72);
    const cx = xAt(yb);
    const tx = xAt(yt);
    const pts: Point[] = [P(tx, yt)];
    const teeth = 5;
    for (let k = 0; k <= teeth; k += 1) {
      const x = cx + w - (2 * w * k) / teeth;
      const sag = k % 1 === 0 ? 6 : 0;
      pts.push(P(x, yb + (k === 0 || k === teeth ? -2 : 0)), P(x - w / teeth, yb - sag));
    }
    pts.pop();
    sk.shape(lineDClosed([P(tx, yt), P(cx + w * 0.55, lerp(yt, yb, 0.62)), ...pts.slice(1), P(cx - w * 0.55, lerp(yt, yb, 0.62))]), needles, { edge: pen.dw });
    // shade on the far side
    sk.shape(lineDClosed([P(tx, yt + 6), P(cx - w * 0.5, lerp(yt, yb, 0.62)), P(cx - w * 0.85, yb - 3), P(cx - w * 0.35, yb - 5)]), dark, { outline: false, edge: false });
  }
  const hand = bough(1, la.near);
  // star-less top spike
  const fc = P(xAt(-92) + c.turn * 6, -92);
  if (c.face && !c.back) sk.shape(blobD(ellipsePts(P(fc.x + c.turn * 3, fc.y + 4), 22, 19, 16), 0.5), fillOf(lighter(c.tone), pen), { outline: false, edge: pen.fw });
  faceOn(sk, c, fc, 8, 4.8, 13, 7, false, lean * DEG * 0.4);
  return { sk, head: fc, headR: 24, mouth: P(fc.x + c.turn * 5, fc.y + 13), hand, waist: -40, shoulders: -78 };
}

function lineDClosed(pts: Point[]): string {
  return `${lineD(pts)}Z`;
}

// ---------------------------------------------------------------------------
// Rose bush

function leafyD(c: Point, rx: number, ry: number, leaves: number, depth: number, rand: () => number): string {
  const pts: Point[] = [];
  for (let i = 0; i < leaves * 2; i += 1) {
    const a = -Math.PI / 2 + (i / (leaves * 2)) * Math.PI * 2;
    const k = i % 2 === 0 ? 1 + (rand() - 0.5) * 0.08 : 1 - depth;
    pts.push(P(c.x + Math.cos(a) * rx * k, c.y + Math.sin(a) * ry * k));
  }
  return blobD(pts, 0.28);
}

function roseBush(c: Ctx): Built {
  // Wilde's rose-tree: a vase of woody canes carrying a leafy crown of roses
  const sk = new Sketch(c.pen);
  const pen = c.pen;
  const leaf = fillOf(c.tone, pen);
  const leafDark = fillOf(darker(c.tone), pen);
  const cane = fillOf("dark", pen);
  const lean = c.pose === "bow" ? 18 : c.pose === "cower" ? -6 : 0;
  const sq = c.pose === "cower" ? 0.9 : 1;
  const C = P(Math.sin(lean * DEG) * 22, -44 * sq);
  // canes from one root spreading into the crown
  for (const s of [-1, 0, 1]) {
    sk.shape(taperD([P(s * 1.5, -0.8), P(s * 6, -12), addP(C, P(s * 13, 12))], [3.4, 2.6, 2], { samples: 4 }), cane, { edge: pen.dw });
  }
  sk.shape(taperD([P(-4, -0.8), P(4, -0.8)], [2.4, 2.4], { samples: 1 }), cane);
  const la = limbAngles(c.pose);
  const branch = (side: number, ang: number) => {
    const base = addP(C, P(side * 22, 8));
    const a = ang * DEG;
    const mid = polar(base, 15, a + side * 0.2);
    const tip = polar(mid, 13, a - side * 0.15);
    sk.shape(taperD([base, mid, tip], [3.2, 2.4, 1.8], { samples: 4 }), cane);
    for (const t of [0.35, 0.7]) {
      const p = lerpP(base, tip, t);
      sk.shape(lineDClosed([polar(p, 1.1, a + 1.5), polar(p, 3.2, a - 2.2), polar(p, 1.1, a - 1.5)]), INK, { outline: false });
    }
    sk.shape(leafD(lerpP(base, tip, 0.5), a - side * 0.9, 6, 2.2), leaf);
    rose(sk, pen, tip, 5.6, c.rand);
    return tip;
  };
  branch(-1, la.far);
  // leafy crown with a darker underside
  sk.shape(leafyD(addP(C, P(0, 4)), 34, 27 * sq, 13, 0.14, c.rand), leafDark, { edge: false });
  sk.shape(leafyD(addP(C, P(0, -2)), 31, 23 * sq, 12, 0.14, c.rand), leaf);
  for (let i = 0; i < 9; i += 1) {
    const p = addP(C, P((c.rand() - 0.5) * 48, (c.rand() - 0.5) * 32));
    sk.line(lineD([p, addP(p, P(3.2, -2.2))]), pen.fw, { halo: isDark(c.tone) });
  }
  // big blooms round the crown
  for (const [x, y, r] of [
    [-24, -10, 6.4],
    [22, -14, 6.8],
    [-6, -24, 6],
    [27, 8, 5.6],
    [-26, 12, 5.8],
  ] as const) {
    rose(sk, pen, addP(C, P(x, y * sq)), r, c.rand);
  }
  sk.layer();
  const hand = branch(1, la.near);
  const fc = addP(C, P(c.turn * 3, 2));
  faceOn(sk, c, fc, 5.2, 3.3, 8.6, 4.6, true, lean * DEG * 0.4);
  return { sk, head: fc, headR: 14, mouth: P(fc.x + c.turn * 3, fc.y + 8.6), hand, waist: -18, shoulders: C.y + 6 };
}

function rose(sk: Sketch, pen: Pen, c: Point, r: number, rand: () => number): void {
  // cupped bloom: scalloped outer petals, a shaded cup and an inner spiral
  sk.shape(puffD(P(c.x, c.y + r * 0.05), r * 1.05, r * 0.9, 5, 0.5, rand), fillOf("white", pen));
  sk.shape(blobD([P(c.x - r * 0.62, c.y - r * 0.1), P(c.x, c.y - r * 0.42), P(c.x + r * 0.62, c.y - r * 0.1), P(c.x + r * 0.4, c.y + r * 0.45), P(c.x - r * 0.4, c.y + r * 0.45)], 0.5), fillOf("light", pen), { outline: false, edge: pen.fw });
  const pts: Point[] = [];
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    pts.push(polar(P(c.x, c.y), r * (0.08 + t * 0.4), t * 2.4 * Math.PI));
  }
  sk.line(curveD(pts), pen.fw * 1.4);
}

// ---------------------------------------------------------------------------
// Stemmed plants: flower, daisy, reed

interface StemPose {
  head: Point;
  ctrl: Point;
  headRot: number;
}

function stemPose(pose: Pose, len: number): StemPose {
  switch (pose) {
    case "talk":
      return { head: P(len * 0.08, -len * 0.98), ctrl: P(-len * 0.08, -len * 0.5), headRot: 8 * DEG };
    case "bow":
      return { head: P(len * 0.52, -len * 0.62), ctrl: P(len * 0.05, -len * 0.95), headRot: 68 * DEG };
    case "reach":
      return { head: P(len * 0.04, -len * 1.06), ctrl: P(0, -len * 0.5), headRot: -6 * DEG };
    case "cower":
      return { head: P(-len * 0.28, -len * 0.74), ctrl: P(len * 0.08, -len * 0.45), headRot: -26 * DEG };
    case "wave":
    case "point":
      return { head: P(len * 0.04, -len), ctrl: P(-len * 0.05, -len * 0.5), headRot: 4 * DEG };
    default:
      return { head: P(0, -len), ctrl: P(len * 0.04, -len * 0.5), headRot: 0 };
  }
}

function stemPts(sp: StemPose, lift = 0): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    const a = P(0, -lift);
    out.push(P((1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * sp.ctrl.x + t * t * sp.head.x, (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * sp.ctrl.y + t * t * sp.head.y));
  }
  return out;
}

function leafD(base: Point, ang: number, len: number, w: number): string {
  const tip = polar(base, len, ang);
  const nrm = ang - Math.PI / 2;
  return blobD([base, polar(lerpP(base, tip, 0.45), w, nrm), tip, polar(lerpP(base, tip, 0.5), w * 0.8, nrm + Math.PI)], 0.45);
}

function stemmed(sp: Species, c: Ctx): Built {
  const sk = new Sketch(c.pen);
  const pen = c.pen;
  const stemFill = fillOf("mid", pen);
  const leafFill = fillOf(sp === "reed" ? "light" : "mid", pen);
  const len = sp === "reed" ? 66 : sp === "flower" ? 17 : 10;
  const sp0 = stemPose(c.pose, len);
  const sw = sp === "reed" ? 2.4 : sp === "flower" ? 1.4 : 0.9;
  const stem = stemPts(sp0, sw * 0.7);
  const la = limbAngles(c.pose);
  const leafLen = sp === "reed" ? 34 : sp === "flower" ? 9 : 5.5;
  const leafW = sp === "reed" ? 3.2 : sp === "flower" ? 2.4 : 1.6;
  const leafAt = sp === "reed" ? 3 : 3;
  const leafBase = (side: number) => (sp === "reed" ? stem[side > 0 ? 3 : 2] : stem[leafAt]);
  // base leaves (reed: long blades from the ground)
  if (sp === "reed") {
    for (const [a, l] of [
      [-100, 40],
      [-70, 30],
      [-120, 26],
    ] as const) {
      const tip = polar(P(0, 0), l, a * DEG);
      sk.shape(blobD([P(-1.5, -2.4), polar(lerpP(P(0, -2), tip, 0.5), 2.6, (a - 90) * DEG), tip, polar(lerpP(P(0, -2), tip, 0.5), 1.6, (a + 90) * DEG), P(1.5, -2.4)], 0.3), leafFill, { edge: pen.dw });
    }
  }
  // far leaf
  const farA = la.far * DEG;
  sk.shape(leafD(leafBase(-1), farA, leafLen, leafW), fillOf(darker(sp === "reed" ? "light" : "mid"), pen));
  // stem
  sk.shape(taperD(stem, [sw * 1.2, sw], { samples: 3 }), stemFill);
  // head
  const hr = sp === "reed" ? 6.2 : sp === "flower" ? 4.6 : 2.6;
  const H = sp0.head;
  const rot = sp0.headRot;
  const hp = (x: number, y: number) => addP(H, rotP(P(x, y), rot));
  let fc: Point;
  let faceGap: number;
  let eyeR: number;
  let mouthDy: number;
  let mouthW: number;
  let headR: number;
  if (sp === "reed") {
    // velvet bulrush head + spike
    const hc = hp(0, -13);
    sk.line(lineD([hp(0, -25), hp(0.4, -34)]), pen.dw * 1.8, { outline: true });
    sk.shape(blobD(ellipsePts(P(0, 0), hr, 13.5, 20).map((p) => addP(hc, rotP(p, rot))), 0.5), fillOf(c.tone, pen));
    sk.line(curveD([hp(-hr * 0.6, -23), hp(-hr * 0.8, -13), hp(-hr * 0.55, -3)]), pen.fw, { halo: isDark(c.tone) });
    fc = hp(c.turn * 1.4, -15);
    faceGap = 2.7;
    eyeR = 1.75;
    mouthDy = 5.4;
    mouthW = 2.5;
    headR = hr;
  } else if (sp === "flower") {
    // petals around a disc
    const petals = 9;
    const pc = hp(0, -hr * 0.2);
    for (let i = 0; i < petals; i += 1) {
      const a = (i / petals) * Math.PI * 2 + rot;
      const tip = polar(pc, hr * 2.05, a);
      sk.shape(blobD([polar(pc, hr * 0.7, a - 0.32), polar(lerpP(pc, tip, 0.62), hr * 0.62, a - Math.PI / 2), tip, polar(lerpP(pc, tip, 0.62), hr * 0.62, a + Math.PI / 2), polar(pc, hr * 0.7, a + 0.32)], 0.45), fillOf(c.tone, pen));
    }
    sk.shape(circleD(pc, hr * 1.02), fillOf("white", pen), { edge: pen.dw * 1.2 });
    fc = addP(pc, rotP(P(c.turn * 0.8, -hr * 0.18), rot));
    faceGap = hr * 0.36;
    eyeR = hr * 0.22;
    mouthDy = hr * 0.52;
    mouthW = hr * 0.34;
    headR = hr * 1.05;
  } else {
    // daisy: many thin white petals, dotted centre
    const pc = hp(0, -hr * 0.15);
    const petals = 14;
    for (let i = 0; i < petals; i += 1) {
      const a = (i / petals) * Math.PI * 2 + rot;
      const tip = polar(pc, hr * 2.15, a);
      sk.shape(blobD([polar(pc, hr * 0.8, a - 0.2), polar(lerpP(pc, tip, 0.6), hr * 0.28, a - Math.PI / 2), tip, polar(lerpP(pc, tip, 0.6), hr * 0.28, a + Math.PI / 2), polar(pc, hr * 0.8, a + 0.2)], 0.45), fillOf("white", pen));
    }
    sk.shape(circleD(pc, hr * 1.05), fillOf(c.tone === "white" ? "light" : c.tone, pen), { edge: pen.dw * 1.2 });
    fc = addP(pc, rotP(P(c.turn * 0.5, -hr * 0.15), rot));
    faceGap = hr * 0.36;
    eyeR = hr * 0.22;
    mouthDy = hr * 0.52;
    mouthW = hr * 0.34;
    headR = hr * 1.05;
  }
  const faceDark = sp === "reed" ? isDark(c.tone) : sp === "daisy" ? isDark(c.tone) : false;
  faceOn(sk, c, fc, faceGap, eyeR, mouthDy, mouthW, faceDark, rot);
  // near leaf (gesture) on top
  sk.layer();
  const nearA = la.near * DEG;
  const lb = leafBase(1);
  sk.shape(leafD(lb, nearA, leafLen, leafW), leafFill);
  const hand = polar(lb, leafLen, nearA);
  sk.line(lineD([lb, polar(lb, leafLen * 0.7, nearA)]), pen.fw);
  const mouth = addP(fc, rotP(P(c.turn * faceGap * 0.6, mouthDy), rot));
  return { sk, head: fc, headR, mouth, hand, waist: stem[4].y, shoulders: stem[6].y };
}

// ---------------------------------------------------------------------------

export const plantRig: KindRig<PlantLook> = {
  supportedPoses: () => POSES,
  supportedExpressions: (look): readonly Expression[] => (look.face ? ALL_EXPRESSIONS : ["neutral"]),
  nominalHeight: (look) => HEIGHT[look.species] ?? 60,
  draw(request: FigureRequest & { look: PlantLook }, ctx: DrawContext): FigureDrawing {
    const look = request.look;
    if (!(look.species in HEIGHT)) throw new Error(`unknown plant species ${String(look.species)}`);
    const pose = POSES.includes(request.pose) ? request.pose : "stand";
    const pen = makePen(request.lineWidth, ctx.idPrefix);
    const facing = request.facing === "left" ? "right" : request.facing;
    const c: Ctx = {
      pen,
      tone: look.tone,
      face: look.face,
      turn: facing === "right" ? 0.4 : 0,
      back: facing === "back",
      pose,
      expression: look.face ? request.expression : "neutral",
      rand: charRand(request.seed, `plant-${look.species}`),
    };
    let b: Built;
    switch (look.species) {
      case "oak":
        b = oak(c);
        break;
      case "tree":
        b = fir(c);
        break;
      case "rose_bush":
        b = roseBush(c);
        break;
      default:
        b = stemmed(look.species, c);
    }
    const anchors = anchorsFrom(b.sk, { head: b.head, headRadius: b.headR, mouth: b.mouth, hand: b.hand, waist: b.waist, shoulders: b.shoulders });
    void spline;
    void PAPER;
    return finishFigure(b.sk, anchors);
  },
};
