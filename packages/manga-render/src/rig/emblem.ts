/**
 * Emblem rig: abstract actors for nonfiction, drawn as deliberate manga
 * metaphor characters (never logos):
 *  state       – a stern colonnaded temple with a crown; the pediment is its brow
 *  law         – a thick law book wearing a balance scale
 *  money       – a plump money sack stamped with a coin
 *  conscience  – a small glowing heart-spirit with a halo
 *  machine     – a cog-wheel body on piston legs
 *  crowd_voice – a cluster of megaphones around one shouting face
 *  time        – an hourglass running sand
 *  idea        – a light bulb with a spark
 * All have a readable face and thin arms, so they can talk, point and argue.
 */
import type { EmblemLook, Expression, Point, Pose } from "../contracts.js";
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
  ellipsePts,
  fillOf,
  heartD,
  lerpP,
  makePen,
  polar,
  rotP,
} from "./creature/common.js";
import { ALL_EXPRESSIONS, drawFace } from "./creature/face.js";
import { arms } from "./creature/arms.js";
import { Ink, bodyXf, mapPathD } from "./creature/ink.js";

type Emblem = EmblemLook["emblem"];
const POSES: readonly Pose[] = ["stand", "talk", "point", "reach", "wave", "hold", "think", "hands_on_hips", "arms_crossed", "cower", "bow"];
const HEIGHT: Record<Emblem, number> = { state: 88, law: 80, money: 70, conscience: 56, machine: 80, crowd_voice: 78, time: 80, idea: 80 };

interface Def {
  hull: Point[];
  face: { c: Point; gap: number; eyeR: number; mouthDy: number; mouthW: number; dark?: boolean };
  shoulderN: Point;
  shoulderF: Point;
  hipN: Point;
  hipF: Point;
  armLen: number;
  armW: number;
  handR: number;
  armFill: (pen: Pen) => string;
  handFill: (pen: Pen) => string;
  headR: number;
  waist: number;
  draw(ink: Ink, v: View): void;
  /** Drawn after the face (e.g. glass highlights). */
  after?(ink: Ink, v: View): void;
}

interface View {
  turn: number;
  back: boolean;
  pen: Pen;
  pose: Pose;
  rand: () => number;
}

// ---------------------------------------------------------------------------

function state(): Def {
  return {
    hull: [P(-30, 0), P(30, 0), P(-31, -58), P(31, -58), P(0, -90)],
    face: { c: P(0, -64), gap: 7.4, eyeR: 3.6, mouthDy: 9.6, mouthW: 7 },
    shoulderN: P(26, -54),
    shoulderF: P(-26, -54),
    hipN: P(24, -30),
    hipF: P(-24, -30),
    armLen: 30,
    armW: 4.4,
    handR: 4,
    armFill: (pen) => fillOf("stone", pen),
    handFill: (pen) => fillOf("stone", pen),
    headR: 22,
    waist: -30,
    draw(ink, v) {
      const pen = v.pen;
      const stone = fillOf("stone", pen);
      const white = fillOf("white", pen);
      const shade = fillOf("light", pen);
      // steps
      ink.poly([P(-30, -0.2), P(30, -0.2), P(30, -4), P(-30, -4)], stone);
      ink.poly([P(-26, -4), P(26, -4), P(26, -8), P(-26, -8)], stone);
      // columns with fluting
      for (const x of [-18, -6, 6, 18]) {
        ink.poly([P(x - 3.4, -8), P(x + 3.4, -8), P(x + 3, -48), P(x - 3, -48)], white);
        ink.line([P(x, -10), P(x, -46)], pen.fw);
        ink.poly([P(x - 4.4, -48), P(x + 4.4, -48), P(x + 4.4, -50.5), P(x - 4.4, -50.5)], stone);
        ink.poly([P(x - 4.2, -8), P(x + 4.2, -8), P(x + 4.2, -10), P(x - 4.2, -10)], stone);
      }
      // dark interior between the columns
      ink.poly([P(-14.6, -10), P(-9.4, -10), P(-9.4, -48), P(-14.6, -48)], fillOf("dark", pen), { outline: false, edge: false });
      ink.poly([P(9.4, -10), P(14.6, -10), P(14.6, -48), P(9.4, -48)], fillOf("dark", pen), { outline: false, edge: false });
      ink.poly([P(-2.6, -10), P(2.6, -10), P(2.6, -48), P(-2.6, -48)], fillOf("dark", pen), { outline: false, edge: false });
      // entablature (the mouth band) + pediment (the brow)
      ink.poly([P(-27, -50.5), P(27, -50.5), P(27, -58.5), P(-27, -58.5)], white);
      ink.poly([P(-31, -58.5), P(31, -58.5), P(0, -79), P(-31, -58.5)], white);
      ink.poly([P(-25, -60.6), P(25, -60.6), P(0, -76.2)], shade, { outline: false, edge: pen.fw });
      // crown on the apex
      const cy = -79;
      ink.poly([P(-7, cy + 1.5), P(-8, cy - 7), P(-4, cy - 3.4), P(0, cy - 9.5), P(4, cy - 3.4), P(8, cy - 7), P(7, cy + 1.5)], fillOf("gold", pen));
      for (const x of [-8, 0, 8]) ink.ell(P(x, x === 0 ? cy - 10 : cy - 7.6), 1.2, 1.2, fillOf("white", pen));
    },
  };
}

function law(): Def {
  return {
    hull: [P(-20, 0), P(20, 0), P(-22, -44), P(22, -44), P(0, -80)],
    face: { c: P(0.5, -27), gap: 6.6, eyeR: 3.6, mouthDy: 10, mouthW: 6 },
    shoulderN: P(17, -30),
    shoulderF: P(-20, -30),
    hipN: P(17, -14),
    hipF: P(-20, -14),
    armLen: 26,
    armW: 2.4,
    handR: 3.2,
    armFill: () => INK,
    handFill: (pen) => fillOf("white", pen),
    headR: 19,
    waist: -16,
    draw(ink, v) {
      const pen = v.pen;
      const cover = fillOf("dark", pen);
      const depth = v.turn > 0 ? 6 : 0.5;
      // spine / page block
      ink.poly([P(-17 - depth, -0.8), P(-17, -0.4), P(-17, -45), P(-17 - depth, -46)], fillOf("black", pen));
      for (const y of [-8, -38]) ink.line([P(-17 - depth, y), P(-17, y)], pen.dw * 1.6, { color: PAPER });
      ink.poly([P(-17, -45), P(17, -45), P(18.4, -46.6), P(-15.6, -46.6)], fillOf("white", pen));
      // cover with a light plaque for the face
      ink.poly([P(-17, -0.4), P(17, -0.4), P(17, -45), P(-17, -45)], cover);
      ink.poly([P(-12, -9), P(13, -9), P(13, -40), P(-12, -40)], fillOf("white", pen), { outline: false, edge: pen.dw });
      ink.line([P(-14.5, -3.4), P(15, -3.4)], pen.fw, { color: PAPER });
      ink.line([P(-14.5, -42.4), P(15, -42.4)], pen.fw, { color: PAPER });
      // clasp
      ink.poly([P(16, -26), P(19.6, -26), P(19.6, -18), P(16, -18)], fillOf("gold", pen));
      // balance scale worn on top
      const post = P(0, -47);
      ink.line([post, P(0, -70)], pen.dw * 2.4, { outline: true });
      ink.ell(P(0, -72), 2.2, 2.2, fillOf("gold", pen));
      const tilt = v.pose === "talk" ? -6 * DEG : 0;
      const beamL = rotP(P(-17, -68), tilt, P(0, -68));
      const beamR = rotP(P(17, -68), tilt, P(0, -68));
      ink.line([beamL, beamR], pen.dw * 2.2, { outline: true });
      for (const end of [beamL, beamR]) {
        const pan = P(end.x, end.y + 11);
        ink.line([end, P(pan.x - 5, pan.y)], pen.fw * 1.3);
        ink.line([end, P(pan.x + 5, pan.y)], pen.fw * 1.3);
        ink.poly([P(pan.x - 6.4, pan.y), P(pan.x + 6.4, pan.y), P(pan.x + 3.6, pan.y + 3), P(pan.x - 3.6, pan.y + 3)], fillOf("gold", pen));
      }
    },
  };
}

function money(): Def {
  return {
    hull: [P(-26, 0), P(26, 0), P(-27, -30), P(27, -30), P(0, -72)],
    face: { c: P(0.5, -36), gap: 7, eyeR: 3.8, mouthDy: 9.5, mouthW: 6.4 },
    shoulderN: P(22, -34),
    shoulderF: P(-22, -34),
    hipN: P(24, -18),
    hipF: P(-24, -18),
    armLen: 22,
    armW: 2.3,
    handR: 3.2,
    armFill: () => INK,
    handFill: (pen) => fillOf("white", pen),
    headR: 22,
    waist: -18,
    draw(ink, v) {
      const pen = v.pen;
      const cloth = fillOf("light", pen);
      // coins at the foot
      for (const [x, y] of [
        [-24, -2.4],
        [21, -2.2],
        [26, -5.4],
      ] as const) {
        ink.ell(P(x, y), 5, 2.1, fillOf("gold", pen));
        ink.ell(P(x, y - 0.3), 3.2, 1.1, fillOf("gold", pen), { outline: false, edge: pen.fw });
      }
      // sack body
      ink.blob([P(-11, -52), P(-22, -44), P(-27, -26), P(-24, -8), P(-12, -0.8), P(12, -0.8), P(24, -8), P(27, -26), P(22, -44), P(11, -52), P(0, -50)], cloth, undefined, 0.5);
      ink.blob([P(-26, -24), P(-23, -9), P(-13, -2), P(-18, -14), P(-20, -30)], fillOf("dots", pen), { outline: false, edge: false });
      // fold lines
      ink.curve([P(-8, -48), P(-12, -40), P(-11, -30)], pen.fw * 1.3);
      ink.curve([P(9, -48), P(13, -41)], pen.fw * 1.3);
      // stamped coin emblem on the belly
      const coin = P(3, -16);
      ink.ell(coin, 8, 7.4, fillOf("gold", pen));
      ink.curve([...ellipsePts(coin, 5.6, 5.1, 20), P(coin.x + 5.6, coin.y)], pen.dw);
      for (let i = 0; i < 8; i += 1) ink.spot(polar(coin, 3.4, (i / 8) * Math.PI * 2), 0.55, 0.55, INK);
      ink.spot(coin, 1.3, 1.3, INK);
      // tied neck: rope + flared ruffle
      ink.poly([P(-10, -52.5), P(10, -52.5), P(9, -56), P(-9, -56)], fillOf("mid", pen));
      ink.puff(P(0, -61), 12, 6.5, 6, 0.55, cloth, v.rand);
      ink.curve([P(-6, -58), P(-4, -64)], pen.fw * 1.3);
      ink.curve([P(5, -58), P(4, -64)], pen.fw * 1.3);
      ink.curve([P(8, -54), P(15, -52), P(17, -47)], pen.dw * 1.6, { outline: true });
    },
  };
}

function conscience(): Def {
  return {
    hull: [P(-18, -14), P(18, -14), P(0, -56), P(0, -2)],
    face: { c: P(0.5, -30), gap: 5.6, eyeR: 3.2, mouthDy: 8, mouthW: 4.6 },
    shoulderN: P(17.5, -33),
    shoulderF: P(-17.5, -33),
    hipN: P(13, -22),
    hipF: P(-13, -22),
    armLen: 15,
    armW: 2,
    handR: 2.6,
    armFill: () => INK,
    handFill: (pen) => fillOf("white", pen),
    headR: 17,
    waist: -18,
    draw(ink, v) {
      const pen = v.pen;
      // glow: soft rays
      const C = P(0, -30);
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2 + 0.13;
        ink.line([polar(C, 22, a), polar(C, i % 2 ? 27 : 30, a)], pen.dw * (i % 2 ? 1 : 1.5));
      }
      ink.ell(C, 21, 21, fillOf("light", pen), { outline: false, edge: pen.fw }, 28);
      // wisp tail
      ink.taper([P(0, -18), P(-3, -10), P(-8, -5), P(-12, -7)], [9, 6, 3, 1], fillOf("white", pen), undefined, 5);
      // heart body
      ink.sk.shape(mapPathD(heartD(P(0, -30), 34), ink.xf), fillOf("white", pen));
      // halo
      ink.ring(P(0, -53), 8, 2.2, pen.dw * 2);
    },
  };
}

function machine(): Def {
  const C = P(0, -44);
  const R = 22;
  return {
    hull: [P(-R - 4, C.y), P(R + 4, C.y), P(0, C.y - R - 12), P(-12, 0), P(12, 0)],
    face: { c: P(0.5, C.y - 1), gap: 6, eyeR: 3.2, mouthDy: 8, mouthW: 5 },
    shoulderN: P(R + 2, C.y + 2),
    shoulderF: P(-R - 2, C.y + 2),
    hipN: P(16, C.y + 16),
    hipF: P(-16, C.y + 16),
    armLen: 24,
    armW: 3.4,
    handR: 3.6,
    armFill: (pen) => fillOf("mid", pen),
    handFill: (pen) => fillOf("stone", pen),
    headR: 22,
    waist: C.y + 16,
    draw(ink, v) {
      const pen = v.pen;
      // piston legs
      for (const s of [-1, 1]) {
        ink.poly([P(s * 9 - 3, C.y + R - 4), P(s * 9 + 3, C.y + R - 4), P(s * 9 + 3, -12), P(s * 9 - 3, -12)], fillOf("mid", pen));
        ink.poly([P(s * 9 - 2, -12), P(s * 9 + 2, -12), P(s * 9 + 2, -3), P(s * 9 - 2, -3)], fillOf("white", pen));
        ink.poly([P(s * 9 - 6, -3.4), P(s * 9 + 7, -3.4), P(s * 9 + 7, -0.2), P(s * 9 - 6, -0.2)], fillOf("dark", pen));
      }
      // small gear on top (the "hat") turning
      gear(ink, P(9, C.y - R - 4), 9, 8, fillOf("mid", pen), pen, 0.2);
      // main cog body
      gear(ink, C, R, 12, fillOf("stone", pen), pen, 0);
      ink.ell(C, R * 0.66, R * 0.66, fillOf("white", pen), { outline: false, edge: pen.dw * 1.2 }, 28);
      // bolts
      for (let i = 0; i < 6; i += 1) ink.ell(polar(C, R * 0.78, (i / 6) * Math.PI * 2 + 0.26), 1.1, 1.1, INK, { outline: false });
      // steam pipe
      ink.poly([P(-R * 0.6, C.y - R * 0.7), P(-R * 0.6 + 4, C.y - R * 0.7), P(-R * 0.6 + 4, C.y - R - 6), P(-R * 0.6, C.y - R - 6)], fillOf("dark", pen));
      ink.puff(P(-R * 0.6 + 2, C.y - R - 11), 4.5, 3.6, 6, 0.5, fillOf("white", pen), v.rand);
    },
  };
}

function gear(ink: Ink, c: Point, r: number, teeth: number, fill: string, pen: Pen, phase: number): void {
  const pts: Point[] = [];
  const inner = r * 0.84;
  for (let i = 0; i < teeth; i += 1) {
    const a0 = ((i + phase) / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    pts.push(polar(c, inner, a0), polar(c, r, a0 + step * 0.18), polar(c, r, a0 + step * 0.48), polar(c, inner, a0 + step * 0.66));
  }
  ink.poly(pts, fill);
  void pen;
}

function crowdVoice(): Def {
  const C = P(0, -48);
  return {
    hull: [P(-34, C.y), P(40, C.y), P(0, -84), P(-12, 0), P(12, 0)],
    face: { c: P(0.5, C.y - 2), gap: 6.6, eyeR: 3.4, mouthDy: 9, mouthW: 6.4 },
    shoulderN: P(16, C.y + 12),
    shoulderF: P(-16, C.y + 12),
    hipN: P(12, -20),
    hipF: P(-12, -20),
    armLen: 22,
    armW: 2.3,
    handR: 3.2,
    armFill: () => INK,
    handFill: (pen) => fillOf("white", pen),
    headR: 19,
    waist: -22,
    draw(ink, v) {
      const pen = v.pen;
      // megaphones radiating from the head (the crowd's many voices)
      const horns: [number, number][] = [
        [-150, 26],
        [-40, 24],
        [-95, 22],
        [10, 28],
        [175, 22],
      ];
      for (const [deg, len] of horns) {
        const a = deg * DEG;
        const base = polar(C, 12, a);
        const tip = polar(C, len + 10, a);
        const nrm = a + Math.PI / 2;
        ink.poly([polar(base, 3, nrm), polar(tip, 8, nrm), polar(tip, -8, nrm), polar(base, -3, nrm)], fillOf("white", pen));
        ink.sk.shape(ink.sk ? mapPathD(ellipsePathRot(tip, 3.2, 8, a), ink.xf) : "", fillOf("black", pen));
        // shout lines out of each bell
        for (const d of [-0.35, 0, 0.35]) ink.line([polar(tip, 5, a + d), polar(tip, 10, a + d)], pen.fw * 1.4);
      }
      // body: a lectern stand
      ink.poly([P(-4, C.y + 14), P(4, C.y + 14), P(3, -5), P(-3, -5)], fillOf("mid", pen));
      ink.poly([P(-13, -5.4), P(13, -5.4), P(15, -0.2), P(-15, -0.2)], fillOf("dark", pen));
      // head
      ink.ell(C, 17, 17, fillOf("white", pen), undefined, 28);
    },
  };
}

function ellipsePathRot(c: Point, rx: number, ry: number, rot: number): string {
  const pts = ellipsePts(P(0, 0), rx, ry, 16).map((p) => rotP(p, rot)).map((p) => P(p.x + c.x, p.y + c.y));
  return `M${pts.map((p) => `${round(p.x)} ${round(p.y)}`).join("L")}Z`;
}

function round(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}

function time(): Def {
  return {
    hull: [P(-22, 0), P(22, 0), P(-22, -80), P(22, -80)],
    face: { c: P(0.5, -56), gap: 5.8, eyeR: 3.2, mouthDy: 8.4, mouthW: 5 },
    shoulderN: P(19, -44),
    shoulderF: P(-19, -44),
    hipN: P(19, -26),
    hipF: P(-19, -26),
    armLen: 24,
    armW: 2.3,
    handR: 3.2,
    armFill: () => INK,
    handFill: (pen) => fillOf("white", pen),
    headR: 17,
    waist: -26,
    draw(ink, v) {
      const pen = v.pen;
      const wood = fillOf("mid", pen);
      const glass = fillOf("white", pen);
      // frame plates
      ink.poly([P(-22, -0.2), P(22, -0.2), P(20, -5), P(-20, -5)], wood);
      ink.poly([P(-22, -80), P(22, -80), P(20, -75), P(-20, -75)], wood);
      // glass bulbs
      const upper = [P(-15, -75), P(15, -75), P(15, -64), P(9, -50), P(2.2, -41.5), P(-2.2, -41.5), P(-9, -50), P(-15, -64)];
      const lower = [P(-2.2, -39.5), P(2.2, -39.5), P(9, -30), P(15, -16), P(15, -5), P(-15, -5), P(-15, -16), P(-9, -30)];
      ink.blob(upper, glass, undefined, 0.3);
      ink.blob(lower, glass, undefined, 0.3);
      ink.poly([P(-2.6, -42.5), P(2.6, -42.5), P(2.6, -38.5), P(-2.6, -38.5)], glass, { outline: false });
      // sand: a low heap in the top, a stream, a pile below
      ink.blob([P(-11.8, -49), P(11.8, -49), P(3, -42), P(-3, -42)], fillOf("dots", pen), { outline: false, edge: pen.fw }, 0.3);
      ink.line([P(0, -42), P(0, -14)], pen.dw * 1.2);
      ink.blob([P(-14.6, -5.4), P(-10, -12), P(0, -16), P(10, -12), P(14.6, -5.4)], fillOf("dots", pen), { outline: false, edge: pen.fw }, 0.4);
      // posts
      for (const x of [-19, 19]) ink.poly([P(x - 1.8, -75), P(x + 1.8, -75), P(x + 1.8, -5), P(x - 1.8, -5)], wood);
    },
    after(ink, v) {
      ink.curve([P(-12, -71), P(-13, -63), P(-10, -56)], v.pen.dw, { color: fillOf("light", v.pen) });
    },
  };
}

function idea(): Def {
  const C = P(0, -54);
  return {
    hull: [P(-22, C.y), P(22, C.y), P(0, -82), P(-10, 0), P(10, 0)],
    face: { c: P(0.5, C.y - 1), gap: 6.8, eyeR: 3.7, mouthDy: 9.5, mouthW: 5.8 },
    shoulderN: P(12, -30),
    shoulderF: P(-12, -30),
    hipN: P(10, -14),
    hipF: P(-10, -14),
    armLen: 22,
    armW: 2.3,
    handR: 3.2,
    armFill: () => INK,
    handFill: (pen) => fillOf("white", pen),
    headR: 22,
    waist: -16,
    draw(ink, v) {
      const pen = v.pen;
      // spark rays
      for (let i = 0; i < 9; i += 1) {
        const a = (-160 + i * 17.5) * DEG;
        ink.line([polar(C, 26, a), polar(C, i % 2 ? 31 : 35, a)], pen.dw * (i % 2 ? 1.2 : 1.8));
      }
      // screw base (the body) with threads + contact
      ink.poly([P(-10.6, -32), P(10.6, -32), P(9.4, -9), P(-9.4, -9)], fillOf("stone", pen));
      for (const y of [-27, -22, -17, -12]) ink.curve([P(-10.2, y + 1.2), P(0, y - 0.8), P(10.2, y + 1.2)], pen.dw);
      ink.poly([P(-6, -9), P(6, -9), P(3, -3.2), P(-3, -3.2)], fillOf("dark", pen));
      // little feet
      for (const s of [-1, 1]) ink.poly([P(s * 3 - 3, -3.4), P(s * 3 + 3.4, -3.4), P(s * 4.4 + 3.2, -0.2), P(s * 3 - 4, -0.2)], INK);
      // glass bulb
      ink.blob([P(-10, -32), P(-14, -40), P(-22, -52), P(-20, -66), P(-10, -75), P(0, -77), P(10, -75), P(20, -66), P(22, -52), P(14, -40), P(10, -32)], fillOf("white", pen), undefined, 0.5);
      // filament above the face
      ink.curve([P(-4, -34), P(-3, -40), P(-6, -44)], pen.fw * 1.3);
      ink.curve([P(4, -34), P(3, -40), P(6, -44)], pen.fw * 1.3);
    },
    after(ink, v) {
      ink.curve([P(-15, -63), P(-12, -69), P(-6, -72.5)], v.pen.dw * 1.6, { color: fillOf("light", v.pen) });
    },
  };
}

const DEFS: Record<Emblem, () => Def> = { state, law, money, conscience, machine, crowd_voice: crowdVoice, time, idea };

function poseXf(pose: Pose): { rot: number; lift: number; sx: number; sy: number } {
  switch (pose) {
    case "talk":
      return { rot: -3 * DEG, lift: 0, sx: 1, sy: 1 };
    case "bow":
      return { rot: 16 * DEG, lift: 0, sx: 1, sy: 1 };
    case "cower":
      return { rot: -8 * DEG, lift: 0, sx: 1.05, sy: 0.9 };
    case "hands_on_hips":
      return { rot: -4 * DEG, lift: 0, sx: 1, sy: 1 };
    case "think":
      return { rot: 3 * DEG, lift: 0, sx: 1, sy: 1 };
    default:
      return { rot: 0, lift: 0, sx: 1, sy: 1 };
  }
}

export const emblemRig: KindRig<EmblemLook> = {
  supportedPoses: () => POSES,
  supportedExpressions: (): readonly Expression[] => ALL_EXPRESSIONS,
  nominalHeight: (look) => HEIGHT[look.emblem] ?? 80,
  draw(request: FigureRequest & { look: EmblemLook }, ctx: DrawContext): FigureDrawing {
    const look = request.look;
    const make = DEFS[look.emblem];
    if (!make) throw new Error(`unknown emblem ${String(look.emblem)}`);
    const pose = POSES.includes(request.pose) ? request.pose : "stand";
    const pen = makePen(request.lineWidth, ctx.idPrefix);
    const def = make();
    const px = poseXf(pose);
    const { xf, rot } = bodyXf({ rot: px.rot, pivot: P(0, 0), lift: px.lift, sx: px.sx, sy: px.sy, hull: def.hull, rest: true });
    const sk = new Sketch(pen);
    const ink = new Ink(sk, xf, rot);
    const facing = request.facing === "left" ? "right" : request.facing;
    const v: View = { turn: facing === "right" ? 0.4 : 0, back: facing === "back", pen, pose, rand: charRand(request.seed, `emblem-${look.emblem}`) };
    const f = def.face;
    const shift = 0;
    const faceC = xf(P(f.c.x + shift, f.c.y));
    const armSet = arms({
      near: xf(def.shoulderN),
      far: xf(def.shoulderF),
      len: def.armLen,
      w: def.armW,
      handR: def.handR,
      pose,
      facing,
      armFill: def.armFill(pen),
      handFill: def.handFill(pen),
      chin: xf(P(f.c.x + shift, f.c.y + f.mouthDy + 3)),
      hipNear: xf(def.hipN),
      hipFar: xf(def.hipF),
    });
    if (!armSet.farInFront) armSet.far(sk);
    def.draw(ink, v);
    if (!v.back) {
      sk.raw(drawFace({ c: faceC, gap: f.gap, eyeR: f.eyeR, turn: v.turn, pen, headR: def.headR, dark: f.dark ?? false, mouth: { dy: f.mouthDy, w: f.mouthW }, talking: pose === "talk", rot }, request.expression));
    }
    def.after?.(ink, v);
    sk.layer();
    if (armSet.farInFront) armSet.far(sk);
    armSet.near(sk);
    const anchors = anchorsFrom(sk, {
      head: faceC,
      headRadius: def.headR,
      mouth: xf(P(f.c.x + f.gap * 0.62 * v.turn, f.c.y + f.mouthDy)),
      hand: armSet.hand,
      waist: xf(P(0, def.waist)).y,
      shoulders: xf(def.shoulderN).y,
    });
    void lerpP;
    return finishFigure(sk, anchors);
  },
};
