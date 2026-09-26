/**
 * Personified objects: rocket, Catherine wheel, candle, lamp, firecracker,
 * coin, book, clock, cup, kettle, box.
 *
 * Each shape is drawn in its own local frame (ground y=0) in a
 * three-quarter view: the face sits toward the facing side, a darker strip
 * on the far side gives volume. Faces sit on a light panel (label, dial,
 * glass, hub) so expressions read on any tone. With `face: true` the object
 * gets thin ink arms and the arm poses; the whole body leans, hops, tips
 * over or squashes with the pose.
 */
import type { Expression, ObjectLook, Point, Pose, Tone } from "../contracts.js";
import type { DrawContext, FigureDrawing, FigureRequest } from "../internal.js";
import type { KindRig } from "./kind.js";
import {
  DEG,
  INK,
  P,
  PAPER,
  type Pen,
  Sketch,
  anchorsFrom,
  finishFigure,
  charRand,
  darker,
  ellipsePts,
  fillOf,
  isDark,
  lerpP,
  lighter,
  makePen,
  polar,
  rotP,
} from "./creature/common.js";
import { ALL_EXPRESSIONS, drawFace, type MouthKind } from "./creature/face.js";
import { ARM_POSES, arms } from "./creature/arms.js";
import { Ink, bodyXf } from "./creature/ink.js";

type Shape = ObjectLook["shape"];

const HEIGHT: Record<Shape, number> = {
  rocket: 56,
  wheel: 40,
  candle: 36,
  lamp: 35,
  firecracker: 31,
  coin: 15,
  book: 20,
  clock: 40,
  cup: 15,
  kettle: 25,
  box: 25,
};

const FACELESS_POSES: readonly Pose[] = ["stand", "talk", "jump", "fall", "lie"];

interface FaceSpot {
  c: Point;
  gap: number;
  eyeR: number;
  mouthDy: number;
  mouthW: number;
  /** Face sits on a dark surface. */
  dark?: boolean;
}

interface ShapeDef {
  hull: Point[];
  face: FaceSpot;
  shoulderN: Point;
  shoulderF: Point;
  hipN: Point;
  hipF: Point;
  armLen: number;
  armW: number;
  handR: number;
  waist: number;
  draw(ink: Ink, v: View): void;
}

interface View {
  turn: number; // 0 front .. ~0.45 three-quarter right
  back: boolean;
  fill: string;
  tone: Tone;
  pen: Pen;
  rand: () => number;
}

// ---------------------------------------------------------------------------
// shared pieces

/** Upright cylinder side + top lip in three-quarter view. */
function cylinder(ink: Ink, v: View, cx: number, yTop: number, yBot: number, rx: number, ry: number, fill: string, opts: { topFill?: string; shade?: boolean; edge?: boolean } = {}): void {
  const side: Point[] = [];
  side.push(P(cx - rx, yTop));
  for (let i = 0; i <= 12; i += 1) {
    const a = Math.PI - (i / 12) * Math.PI;
    side.push(P(cx + Math.cos(a) * rx, yBot + Math.sin(a) * ry));
  }
  side.push(P(cx + rx, yTop));
  for (let i = 0; i <= 12; i += 1) {
    const a = (i / 12) * Math.PI;
    side.push(P(cx + Math.cos(a) * rx, yTop + Math.sin(a) * ry));
  }
  ink.poly(side, fill, { edge: opts.edge === false ? false : v.pen.dw });
  if (opts.shade !== false) {
    // far-side shadow strip for volume
    const s0 = v.back ? 0.55 : 0.62;
    const strip: Point[] = [];
    for (let i = 0; i <= 6; i += 1) {
      const a = Math.PI - (i / 6) * (Math.PI * 0.2);
      strip.push(P(cx + Math.cos(a) * rx, yBot + Math.sin(a) * ry));
    }
    strip.push(P(cx - rx * s0, yTop + ry * 0.8));
    strip.push(P(cx - rx, yTop));
    ink.poly(strip, fillOf(darker(v.tone), v.pen), { outline: false, edge: false });
  }
  if (opts.topFill) ink.ell(P(cx, yTop), rx, ry, opts.topFill, { edge: v.pen.dw });
}

function band(ink: Ink, v: View, cx: number, y0: number, y1: number, rx: number, ry: number, fill: string): void {
  const pts: Point[] = [];
  for (let i = 0; i <= 12; i += 1) {
    const a = Math.PI - (i / 12) * Math.PI;
    pts.push(P(cx + Math.cos(a) * rx, y1 + Math.sin(a) * ry));
  }
  for (let i = 0; i <= 12; i += 1) {
    const a = (i / 12) * Math.PI;
    pts.push(P(cx + Math.cos(a) * rx, y0 + Math.sin(a) * ry));
  }
  ink.poly(pts, fill, { outline: false, edge: v.pen.dw });
}

// ---------------------------------------------------------------------------
// shapes

function rocket(): ShapeDef {
  const rx = 7.2;
  const ry = 2.2;
  return {
    hull: [P(-rx, -16), P(rx, -16), P(-rx - 1, -44), P(rx + 1, -44), P(0, -56.5), P(-1, 0), P(1, 0)],
    face: { c: P(0, -35), gap: 3.2, eyeR: 2.0, mouthDy: 5.8, mouthW: 2.8 },
    shoulderN: P(rx * 0.95, -30),
    shoulderF: P(-rx * 0.95, -30),
    hipN: P(rx, -20),
    hipF: P(-rx, -20),
    armLen: 13,
    armW: 1.3,
    handR: 1.6,
    waist: -22,
    draw(ink, v) {
      const pen = v.pen;
      // stick
      ink.taper([P(0.3, -17), P(0, -0.1)], [2.0, 1.5], fillOf("mid", pen), undefined, 2);
      cylinder(ink, v, 0, -44, -16, rx, ry, v.fill);
      // paper label band for the face
      band(ink, v, 0, -42.6, -25, rx, ry, fillOf("white", pen));
      // bands
      band(ink, v, 0, -20, -18, rx, ry, fillOf(darker(v.tone), pen));
      // nose cone with a collar
      ink.blob([P(-rx - 1.2, -43.2), P(-rx * 0.7, -48.5), P(-1.2, -55.5), P(0, -56.6), P(1.2, -55.5), P(rx * 0.7, -48.5), P(rx + 1.2, -43.2), P(0, -41.2)], fillOf(lighter(v.tone) === "white" ? "light" : darker(v.tone), pen), undefined, 0.3);
      ink.curve([P(-rx - 1.1, -43.4), P(0, -41.3), P(rx + 1.1, -43.4)], pen.dw);
      ink.curve([P(-2, -50), P(1.5, -52.5)], pen.fw * 1.2, { color: PAPER });
      // fuse tail at the bottom of the tube
      ink.curve([P(-3.5, -16.5), P(-5, -13), P(-3.8, -10.5)], pen.dw * 1.2);
    },
  };
}

function wheel(): ShapeDef {
  const C = P(0, -24);
  const R = 15;
  return {
    hull: [P(-R, C.y), P(R, C.y), P(0, C.y - R), P(0, C.y + R), P(-2, 0), P(2, 0)],
    face: { c: P(0, C.y - 1), gap: 2.4, eyeR: 1.35, mouthDy: 3.8, mouthW: 2.2 },
    shoulderN: P(R * 0.95, C.y + 2),
    shoulderF: P(-R * 0.95, C.y + 2),
    hipN: P(R * 0.8, C.y + 8),
    hipF: P(-R * 0.8, C.y + 8),
    armLen: 11,
    armW: 1.0,
    handR: 1.35,
    waist: C.y + 6,
    draw(ink, v) {
      const pen = v.pen;
      // post + little foot
      ink.taper([P(0, C.y), P(0, -0.8)], [2.6, 2.2], fillOf("mid", pen), undefined, 2);
      ink.ell(P(0, -0.9), 3.4, 0.9, fillOf("dark", pen));
      // coiled spiral tube: backing disc then the coil drawn as one thick spiral
      const spiral: Point[] = [];
      const turns = 1.65;
      for (let i = 0; i <= 48; i += 1) {
        const t = i / 48;
        const a = -Math.PI / 2 + t * turns * Math.PI * 2;
        const r = 8.6 + t * (R - 9.4);
        spiral.push(polar(C, r, a));
      }
      ink.taper(spiral, [2.0, 2.5], v.fill, { edge: pen.dw }, 1);
      // paper ties across the coil
      for (let i = 5; i < 47; i += 7) {
        const a = spiral[i];
        const b = spiral[i + 1];
        const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
        ink.line([polar(a, 1.15, ang), polar(a, -1.15, ang)], pen.fw * 1.2);
      }
      // free end with a fuse and a burst of sparks: it is a firework
      const end = spiral[spiral.length - 1];
      const endDir = Math.atan2(end.y - spiral[spiral.length - 2].y, end.x - spiral[spiral.length - 2].x);
      const fuseTip = polar(end, 4, endDir + 0.4);
      ink.curve([end, polar(end, 2.2, endDir + 0.1), fuseTip], pen.dw * 1.3);
      for (let i = 0; i < 5; i += 1) ink.line([polar(fuseTip, 1.2, endDir - 1 + i * 0.5), polar(fuseTip, 3.2, endDir - 1 + i * 0.5)], pen.fw * 1.3);
      for (const [a, d] of [
        [-150, 4],
        [-40, 5],
        [200, 3.5],
      ] as const) {
        const c = polar(C, R + d, a * DEG);
        ink.poly([0, 1, 2, 3, 4, 5, 6, 7].map((k) => polar(c, k % 2 === 0 ? 2.2 : 0.55, -Math.PI / 2 + (k * Math.PI) / 4)), INK, { outline: false });
      }
      // hub
      ink.ell(C, 8, 8, fillOf("white", pen), { edge: pen.dw * 1.2 });
      ink.ring(C, 7.2, 7.2, pen.fw);
    },
  };
}

function candle(): ShapeDef {
  const rx = 6;
  const ry = 1.8;
  return {
    hull: [P(-11, -2), P(11, -2), P(-11, 0), P(11, 0), P(-rx, -26), P(rx, -26), P(0, -36.5)],
    face: { c: P(0, -16.5), gap: 2.3, eyeR: 1.35, mouthDy: 4.6, mouthW: 2.1 },
    shoulderN: P(rx * 0.95, -13),
    shoulderF: P(-rx * 0.95, -13),
    hipN: P(rx, -7),
    hipF: P(-rx, -7),
    armLen: 9,
    armW: 0.85,
    handR: 1.15,
    waist: -8,
    draw(ink, v) {
      const pen = v.pen;
      // dish with a finger ring
      ink.ring(P(-11.5, -2.8), 2.2, 2.0, pen.dw * 1.6);
      ink.ell(P(0, -1.8), 11, 2.4, fillOf("mid", pen));
      ink.ell(P(0, -2.6), 8.5, 1.6, fillOf("dark", pen), { outline: false });
      cylinder(ink, v, 0, -26, -3, rx, ry, v.fill, { topFill: fillOf(lighter(v.tone), pen) });
      // wax drips over the rim
      const drips: Point[] = [P(-rx, -26)];
      for (const [x, d] of [
        [-4.2, 4.5],
        [-1.8, 2.2],
        [0.9, 5.8],
        [3.6, 2.8],
      ] as const) {
        drips.push(P(x - 0.9, -25 + ry * 0.4), P(x, -25 + d), P(x + 0.9, -25 + ry * 0.5));
      }
      drips.push(P(rx, -26), P(0, -24.4));
      ink.blob(drips, fillOf(lighter(v.tone), pen), { outline: false, edge: pen.dw }, 0.35);
      // wick + flame
      ink.line([P(0, -26.5), P(0.2, -28.2)], pen.dw * 1.3);
      ink.blob([P(0, -36.4), P(2.3, -31), P(1.6, -28.4), P(0, -27.6), P(-1.6, -28.4), P(-2.3, -31)], fillOf("white", pen), { weight: 0.8 }, 0.55);
      ink.blob([P(0.1, -33.4), P(1, -30.2), P(0, -28.8), P(-1, -30.2)], fillOf("light", pen), { outline: false, edge: false }, 0.5);
    },
  };
}

function lamp(): ShapeDef {
  return {
    hull: [P(-8, 0), P(8, 0), P(-9.5, -24), P(9.5, -24), P(0, -35)],
    face: { c: P(0, -16), gap: 2.4, eyeR: 1.4, mouthDy: 4.4, mouthW: 2.2 },
    shoulderN: P(7.3, -12),
    shoulderF: P(-7.3, -12),
    hipN: P(7, -6),
    hipF: P(-7, -6),
    armLen: 9,
    armW: 0.85,
    handR: 1.15,
    waist: -8,
    draw(ink, v) {
      const pen = v.pen;
      const metal = v.fill;
      // base
      ink.poly([P(-8, -0.2), P(8, -0.2), P(6.5, -3.4), P(-6.5, -3.4)], metal);
      // glass box (trapezoid)
      ink.poly([P(-6.4, -3.2), P(6.4, -3.2), P(8, -24), P(-8, -24)], fillOf("white", pen));
      // glow + flame at the bottom
      ink.blob([P(0, -10.5), P(1.4, -6.8), P(0, -5.4), P(-1.4, -6.8)], fillOf("light", pen), { outline: false, edge: pen.dw }, 0.55);
      ink.line([P(0, -4.2), P(0, -5.4)], pen.dw * 1.4);
      // frame bars
      for (const x of [-1, 1]) ink.line([P(x * 6.4, -3.2), P(x * 8, -24)], pen.dw * 2.2, { color: INK });
      ink.line([P(-7, -12.6), P(-6.7, -9)], pen.fw, { color: INK });
      // roof cap
      ink.poly([P(-10, -23.6), P(10, -23.6), P(4, -29.5), P(-4, -29.5)], metal);
      ink.poly([P(-4, -29.3), P(4, -29.3), P(2.2, -31), P(-2.2, -31)], fillOf(darker(v.tone), pen));
      // ring handle
      ink.ring(P(0, -33), 2.6, 2.2, pen.dw * 1.8);
    },
  };
}

function firecracker(): ShapeDef {
  const rx = 5.4;
  const ry = 1.7;
  return {
    hull: [P(-rx, 0), P(rx, 0), P(-rx, -25), P(rx, -25), P(2, -31)],
    face: { c: P(0, -15), gap: 2.1, eyeR: 1.25, mouthDy: 4.2, mouthW: 2 },
    shoulderN: P(rx * 0.95, -11.5),
    shoulderF: P(-rx * 0.95, -11.5),
    hipN: P(rx, -6),
    hipF: P(-rx, -6),
    armLen: 8.5,
    armW: 0.78,
    handR: 1.05,
    waist: -7,
    draw(ink, v) {
      const pen = v.pen;
      cylinder(ink, v, 0, -25, -1.7, rx, ry, v.fill, { topFill: fillOf("dark", pen) });
      // paper wraps at both ends
      band(ink, v, 0, -24.6, -21.8, rx, ry, fillOf("white", pen));
      band(ink, v, 0, -4.6, -1.9, rx, ry, fillOf("white", pen));
      // label diamond behind the face
      ink.poly([P(0, -21), P(4.6, -14.2), P(0, -7.4), P(-4.6, -14.2)], fillOf("white", pen), { outline: false, edge: pen.dw });
      // fuse with a spark
      ink.curve([P(0.2, -25.4), P(1.4, -27.6), P(0.4, -29.4), P(1.8, -30.8)], pen.dw * 1.5);
      for (let i = 0; i < 5; i += 1) {
        const a = -Math.PI / 2 + (i - 2) * 0.55;
        ink.line([polar(P(1.9, -31), 0.8, a), polar(P(1.9, -31), 2.0, a)], pen.fw * 1.3);
      }
    },
  };
}

function coin(): ShapeDef {
  const r = 7.4;
  const C = P(0, -r);
  return {
    hull: [P(-r, C.y), P(r, C.y), P(0, 0), P(0, -2 * r)],
    face: { c: P(0.3, C.y - 1), gap: 1.9, eyeR: 1.05, mouthDy: 3.1, mouthW: 1.7 },
    shoulderN: P(r * 0.85, C.y + 0.5),
    shoulderF: P(-r * 0.85, C.y + 0.5),
    hipN: P(r * 0.7, C.y + 4),
    hipF: P(-r * 0.7, C.y + 4),
    armLen: 5.5,
    armW: 0.42,
    handR: 0.62,
    waist: C.y + 3,
    draw(ink, v) {
      const pen = v.pen;
      const k = 1 - v.turn * 0.55;
      const th = 1.6 * (v.turn > 0 ? 1 : 0.3);
      // edge thickness (far side)
      ink.ell(P(-th, C.y), r * k, r, fillOf(darker(v.tone), pen));
      ink.poly([P(-th, C.y - r), P(0, C.y - r), P(0, C.y + r), P(-th, C.y + r)], fillOf(darker(v.tone), pen), { outline: false, edge: false });
      for (let i = -4; i <= 4; i += 1) ink.line([P(-th - r * k * 0.02, C.y + i * r * 0.2), P(-r * k * 0.06, C.y + i * r * 0.2)], pen.fw);
      ink.ell(C, r * k, r, v.fill);
      ink.curve([...ellipsePts(C, r * k * 0.82, r * 0.82, 24), P(C.x + r * k * 0.82, C.y)], pen.dw);
      // stamped dots around the rim
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        ink.spot(P(C.x + Math.cos(a) * r * k * 0.91, C.y + Math.sin(a) * r * 0.91), 0.28, 0.28, INK);
      }
    },
  };
}

function book(): ShapeDef {
  return {
    hull: [P(-9, 0), P(7.5, 0), P(-9, -19.5), P(7.5, -19.5)],
    face: { c: P(0.8, -11.5), gap: 2.2, eyeR: 1.25, mouthDy: 3.9, mouthW: 2 },
    shoulderN: P(7, -10),
    shoulderF: P(-8.5, -10),
    hipN: P(7, -4),
    hipF: P(-8, -4),
    armLen: 7,
    armW: 0.55,
    handR: 0.78,
    waist: -6,
    draw(ink, v) {
      const pen = v.pen;
      const spineW = 2.8 * (v.turn > 0 ? 1 : 0.2);
      // spine (far side)
      ink.poly([P(-6 - spineW, -0.4), P(-6, -0.2), P(-6, -18.8), P(-6 - spineW, -19.2)], fillOf(darker(v.tone), pen));
      for (const y of [-3.4, -16]) ink.line([P(-6 - spineW, y), P(-6, y + 0.1)], pen.dw * 1.4, { color: PAPER });
      // page block peeking at the top/right
      ink.poly([P(-6, -18.8), P(7.2, -18.8), P(7.8, -19.8), P(-5.4, -19.8)], fillOf("white", pen), { outline: true });
      ink.poly([P(7, -0.4), P(7.8, -1.2), P(7.8, -19.6), P(7, -18.8)], fillOf("white", pen));
      // cover
      ink.poly([P(-6, -0.2), P(7, -0.4), P(7, -18.8), P(-6, -18.8)], v.fill);
      // light face panel with a border (like a title plate)
      ink.poly([P(-3.9, -3.2), P(5.2, -3.2), P(5.2, -16.2), P(-3.9, -16.2)], fillOf("white", pen), { outline: false, edge: pen.dw });
      ink.line([P(-4.7, -2.4), P(6, -2.4), P(6, -17), P(-4.7, -17), P(-4.7, -2.4)], pen.fw);
    },
  };
}

function clock(): ShapeDef {
  const C = P(0, -18);
  const R = 13;
  return {
    hull: [P(-R, C.y), P(R, C.y), P(-R * 0.72, 0), P(R * 0.72, 0), P(-R, C.y - R - 4), P(R, C.y - R - 4), P(0, -40)],
    face: { c: P(0.5, C.y - 2.6), gap: 3.2, eyeR: 1.8, mouthDy: 6.8, mouthW: 3 },
    shoulderN: P(R * 0.97, C.y + 1),
    shoulderF: P(-R * 0.97, C.y + 1),
    hipN: P(R * 0.8, C.y + 7),
    hipF: P(-R * 0.8, C.y + 7),
    armLen: 10.5,
    armW: 0.95,
    handR: 1.3,
    waist: C.y + 6,
    draw(ink, v) {
      const pen = v.pen;
      // feet
      for (const s of [-1, 1]) ink.taper([polar(C, R * 0.8, (90 - s * 38) * DEG), P(s * R * 0.72, -1.6)], [2.2, 1.6], v.fill, undefined, 2);
      for (const s of [-1, 1]) ink.ell(P(s * R * 0.74, -1.0), 2.2, 0.95, fillOf("dark", pen));
      // bells + hammer
      ink.line([P(0, C.y - R), P(0, C.y - R - 4.6)], pen.dw * 2);
      ink.ell(P(0, C.y - R - 4.8), 1.3, 1.1, fillOf("dark", pen));
      for (const s of [-1, 1]) {
        const bc = polar(C, R + 2.2, (-90 + s * 40) * DEG);
        const rot = s * 40 * DEG;
        const pts = [P(-5, 1.2), P(-4.4, -2.4), P(0, -4.4), P(4.4, -2.4), P(5, 1.2)].map((p) => rotP(p, rot)).map((p) => P(bc.x + p.x, bc.y + p.y));
        ink.blob(pts, v.fill, undefined, 0.4);
      }
      // body ring + dial
      ink.ell(C, R, R, v.fill, undefined, 32);
      ink.ell(P(C.x + v.turn * 0.8, C.y), R * 0.8, R * 0.8, fillOf("white", pen), { edge: pen.dw * 1.2 }, 32);
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        const long = i % 3 === 0;
        const c = P(C.x + v.turn * 0.8, C.y);
        ink.line([polar(c, R * (long ? 0.62 : 0.68), a), polar(c, R * 0.75, a)], pen.dw * (long ? 1.6 : 1));
      }
      // short hands under the face (10:10, like a moustache)
      const hc = P(C.x + v.turn * 0.8 + 0.5, C.y + 1.4);
      ink.line([hc, polar(hc, 3.6, -150 * DEG)], pen.dw * 1.5);
      ink.line([hc, polar(hc, 4.4, -30 * DEG)], pen.dw * 1.5);
      ink.spot(hc, 0.6, 0.6, INK);
    },
  };
}

function cup(): ShapeDef {
  return {
    hull: [P(-10.5, 0), P(10.5, 0), P(-7.5, -14.5), P(7.5, -14.5), P(-11.5, -9)],
    face: { c: P(0.4, -9.4), gap: 1.9, eyeR: 1.05, mouthDy: 3, mouthW: 1.7 },
    shoulderN: P(6.6, -9),
    shoulderF: P(-6.6, -9),
    hipN: P(5.5, -5),
    hipF: P(-5.5, -5),
    armLen: 5.6,
    armW: 0.45,
    handR: 0.66,
    waist: -6,
    draw(ink, v) {
      const pen = v.pen;
      ink.ell(P(0, -1.9), 10.5, 1.8, fillOf("white", pen));
      ink.curve([P(-5.8, -1.8), P(0, -0.9), P(5.8, -1.8)], pen.fw);
      // handle (far side)
      ink.ring(P(-8.2, -9.2), 2.8, 3.1, pen.dw * 2.6);
      // bowl
      ink.blob([P(-7.4, -13.6), P(-6.6, -7), P(-4.2, -2.6), P(0, -2.0), P(4.2, -2.6), P(6.6, -7), P(7.4, -13.6), P(0, -12.2)], v.fill, undefined, 0.4);
      ink.ell(P(0, -13.6), 7.4, 1.9, fillOf("white", pen));
      ink.ell(P(0.3, -13.4), 6.2, 1.3, fillOf("dark", pen), { outline: false, edge: pen.fw });
      // pattern band
      ink.curve([P(-6.9, -11.2), P(0, -10), P(6.9, -11.2)], pen.fw);
    },
  };
}

function kettle(): ShapeDef {
  const C = P(0, -9.4);
  return {
    hull: [P(-10.5, C.y), P(10.5, C.y), P(0, 0), P(0, -25), P(16, -16)],
    face: { c: P(0.2, C.y - 1.2), gap: 2.4, eyeR: 1.3, mouthDy: 3.8, mouthW: 2.1 },
    shoulderN: P(9.2, C.y + 2.2),
    shoulderF: P(-9.8, C.y + 0.5),
    hipN: P(8, C.y + 5),
    hipF: P(-8, C.y + 5),
    armLen: 7.5,
    armW: 0.65,
    handR: 0.95,
    waist: C.y + 4,
    draw(ink, v) {
      const pen = v.pen;
      // handle arch
      ink.curve([P(-7.5, C.y - 6.5), P(-6, -22.5), P(0, -24.6), P(6, -22.5), P(7.5, C.y - 6.5)], pen.dw * 3.2, { outline: true });
      // spout
      ink.taper([P(7.5, C.y + 2), P(12.4, C.y - 2.5), P(15.6, -16.2)], [4.6, 2.6, 2.0], v.fill, undefined, 4);
      // body
      ink.blob([P(-10.5, C.y), P(-9, C.y - 6.6), P(0, C.y - 8.4), P(9, C.y - 6.6), P(10.5, C.y), P(9.2, C.y + 7.2), P(0, C.y + 8.8), P(-9.2, C.y + 7.2)], v.fill, undefined, 0.5);
      ink.blob([P(-10.3, C.y + 0.5), P(-9, C.y + 6.8), P(-6, C.y + 8.2), P(-8.4, C.y + 1)], fillOf(darker(v.tone), pen), { outline: false, edge: false });
      // lid + knob
      ink.ell(P(0, C.y - 7.6), 5.4, 1.5, fillOf(lighter(v.tone), pen));
      ink.ell(P(0, C.y - 9.6), 1.4, 1.2, fillOf("dark", pen));
      ink.line([P(0, C.y - 8.2), P(0, C.y - 8.6)], pen.dw * 2);
      // base rim
      ink.curve([P(-8, C.y + 6.6), P(0, C.y + 8), P(8, C.y + 6.6)], pen.fw);
      // steam puff from the spout
      ink.curve([P(16.4, -17.6), P(15.4, -19.6), P(17, -21.4), P(16, -23)], pen.fw * 1.4);
    },
  };
}

function box(): ShapeDef {
  return {
    hull: [P(-9, 0), P(10, 0), P(-9, -17), P(13, -20), P(3, -22)],
    face: { c: P(-0.2, -9.6), gap: 2.4, eyeR: 1.35, mouthDy: 4.1, mouthW: 2.1 },
    shoulderN: P(8, -8.5),
    shoulderF: P(-8.8, -8.5),
    hipN: P(8, -3),
    hipF: P(-8.8, -3),
    armLen: 7.5,
    armW: 0.65,
    handR: 0.95,
    waist: -5,
    draw(ink, v) {
      const pen = v.pen;
      const d = v.turn > 0 ? 4.2 : 0.01;
      // side face
      ink.poly([P(7, -0.3), P(7 + d, -d * 0.7 - 0.3), P(7 + d, -16.8 - d * 0.7), P(7, -16.8)], fillOf(darker(v.tone), pen));
      // top face + flaps
      ink.poly([P(-9, -16.8), P(7, -16.8), P(7 + d, -16.8 - d * 0.7), P(-9 + d, -16.8 - d * 0.7)], fillOf(lighter(v.tone), pen));
      ink.poly([P(-9 + d * 0.5, -16.8 - d * 0.35), P(7 + d * 0.5, -16.8 - d * 0.35), P(6 + d * 0.5, -21.5), P(-7.5 + d * 0.5, -20.5)], fillOf(lighter(v.tone), pen));
      // front
      ink.poly([P(-9, -0.3), P(7, -0.3), P(7, -16.8), P(-9, -16.8)], v.fill);
      // tape
      ink.poly([P(-2.6, -16.8), P(0.4, -16.8), P(0.4, -13.8), P(-2.6, -13.8)], fillOf("white", pen), { outline: false, edge: pen.fw });
      // light panel behind the face
      ink.blob([P(-5.2, -13.4), P(4.6, -13.4), P(4.8, -5.2), P(-5.4, -5.2)], fillOf("white", pen), { outline: false, edge: pen.fw }, 0.2);
      // fragile arrows
      ink.line([P(-7.8, -3), P(-7.8, -1.2)], pen.fw);
    },
  };
}

const SHAPES: Record<Shape, () => ShapeDef> = { rocket, wheel, candle, lamp, firecracker, coin, book, clock, cup, kettle, box };

// ---------------------------------------------------------------------------

interface PoseXf {
  rot: number;
  lift: number;
  sx: number;
  sy: number;
  rest: boolean;
}

function poseXf(pose: Pose, h: number): PoseXf {
  switch (pose) {
    case "talk":
      return { rot: -3 * DEG, lift: 0, sx: 1, sy: 1, rest: true };
    case "jump":
      return { rot: -6 * DEG, lift: h * 0.28, sx: 0.96, sy: 1.05, rest: true };
    case "fall":
      return { rot: 62 * DEG, lift: h * 0.18, sx: 1, sy: 1, rest: true };
    case "lie":
      return { rot: 90 * DEG, lift: 0, sx: 1, sy: 1, rest: true };
    case "bow":
      return { rot: 24 * DEG, lift: 0, sx: 1, sy: 1, rest: true };
    case "cower":
      return { rot: -9 * DEG, lift: 0, sx: 1.07, sy: 0.88, rest: true };
    case "hands_on_hips":
      return { rot: -4 * DEG, lift: 0, sx: 1, sy: 1, rest: true };
    case "think":
      return { rot: 4 * DEG, lift: 0, sx: 1, sy: 1, rest: true };
    default:
      return { rot: 0, lift: 0, sx: 1, sy: 1, rest: true };
  }
}

export const objectRig: KindRig<ObjectLook> = {
  supportedPoses: (look) => (look.face ? ARM_POSES : FACELESS_POSES),
  supportedExpressions: (look): readonly Expression[] => (look.face ? ALL_EXPRESSIONS : ["neutral"]),
  nominalHeight: (look) => HEIGHT[look.shape] ?? 30,
  draw(request: FigureRequest & { look: ObjectLook }, ctx: DrawContext): FigureDrawing {
    const look = request.look;
    const make = SHAPES[look.shape];
    if (!make) throw new Error(`unknown object shape ${String(look.shape)}`);
    const allowed = look.face ? ARM_POSES : FACELESS_POSES;
    const pose = allowed.includes(request.pose) ? request.pose : "stand";
    const expression: Expression = look.face ? request.expression : "neutral";
    const pen = makePen(request.lineWidth, ctx.idPrefix, request);
    const def = make();
    const h = HEIGHT[look.shape];
    const px = poseXf(pose, h);
    const pivot = P(0, 0);
    const { xf, rot } = bodyXf({ rot: px.rot, pivot, lift: px.lift, sx: px.sx, sy: px.sy, hull: def.hull, rest: px.rest });
    const sk = new Sketch(pen);
    const ink = new Ink(sk, xf, rot);
    const facing = request.facing === "left" ? "right" : request.facing;
    const view: View = {
      turn: facing === "right" ? 0.42 : 0,
      back: facing === "back",
      fill: fillOf(look.tone, pen),
      tone: look.tone,
      pen,
      rand: charRand(request.seed, `object-${look.shape}`),
    };
    // arms: far arm behind the body in three-quarter view
    const withArms = look.face;
    // faces a touch larger than life so expressions read at thumbnail size
    const fs = look.shape === "clock" ? 1.05 : 1.18;
    const f = { ...def.face, gap: def.face.gap * fs, eyeR: def.face.eyeR * fs, mouthDy: def.face.mouthDy * fs, mouthW: def.face.mouthW * fs };
    const faceShift = 0; // drawFace already slides the features toward the facing side
    const faceC = xf(P(f.c.x + faceShift, f.c.y));
    const armSet = withArms
      ? arms({
          near: xf(def.shoulderN),
          far: xf(def.shoulderF),
          len: def.armLen,
          w: def.armW,
          handR: def.handR,
          pose,
          facing: facing,
          chin: xf(P(f.c.x + faceShift, f.c.y + f.mouthDy + 1.2)),
          hipNear: xf(def.hipN),
          hipFar: xf(def.hipF),
        })
      : null;
    if (armSet && !armSet.farInFront) armSet.far(sk);
    def.draw(ink, view);
    let mouth = xf(P(f.c.x + f.gap * 0.62 * view.turn, f.c.y + f.mouthDy));
    if (look.face && !view.back) {
      const talking = pose === "talk";
      const mouthKind: MouthKind | undefined = undefined;
      sk.raw(
        drawFace(
          {
            c: faceC,
            gap: f.gap,
            eyeR: f.eyeR,
            turn: view.turn,
            pen,
            headR: f.gap * 2.4,
            dark: f.dark ?? false,
            mouth: { dy: f.mouthDy, w: f.mouthW },
            talking,
            rot,
            mouthKind,
          },
          expression,
        ),
      );
    }
    let hand: Point | undefined;
    if (armSet) {
      sk.layer();
      if (armSet.farInFront) armSet.far(sk);
      armSet.near(sk);
      hand = armSet.hand;
    }
    const headR = f.gap * 2.2;
    const anchors = anchorsFrom(sk, {
      head: faceC,
      headRadius: headR,
      mouth,
      hand,
      waist: xf(P(0, def.waist)).y,
      shoulders: xf(def.shoulderN).y,
    });
    void ellipsePts;
    void lerpP;
    void isDark;
    return finishFigure(sk, anchors);
  },
};
