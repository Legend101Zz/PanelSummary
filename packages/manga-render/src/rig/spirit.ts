/**
 * Spirit rig: personified forces of nature. Every spirit is a big face on
 * an elemental body that trails into a wisp instead of legs, so it can
 * hover ("stand"), fly, gesture and cower:
 *  wind  – billowing cloud, puffed cheeks, blows streams of air
 *  frost – angular ice crystal with an icicle crown
 *  snow  – soft round white figure with a snowflake crown
 *  hail  – a knot of grey pebbles
 *  sun   – rayed disc face;  moon – crescent face in profile
 *  fire  – flame with a pale core;  rain – dark cloud trailing drops
 */
import type { Expression, Point, Pose, SpiritLook } from "../contracts.js";
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
  lerpP,
  makePen,
  polar,
  sparkD,
  dropD,
} from "./creature/common.js";
import { ALL_EXPRESSIONS, EXPR, drawFace, type MouthKind } from "./creature/face.js";
import { arms } from "./creature/arms.js";
import { Ink, bodyXf, mapPathD } from "./creature/ink.js";

type Element = SpiritLook["element"];
const POSES: readonly Pose[] = ["stand", "fly", "talk", "reach", "point", "wave", "cower", "arms_crossed", "hands_on_hips"];
const HEIGHT: Record<Element, number> = { wind: 90, frost: 92, snow: 86, hail: 84, sun: 90, moon: 90, fire: 90, rain: 90 };

interface SpiritDef {
  hull: Point[];
  face: { c: Point; gap: number; eyeR: number; mouthDy: number; mouthW: number; dark?: boolean; turnScale?: number; profile?: boolean };
  shoulderN: Point;
  shoulderF: Point;
  armLen: number;
  armW: number;
  handR: number;
  armFill: (pen: Pen) => string;
  handFill: (pen: Pen) => string;
  headR: number;
  waist: number;
  draw(ink: Ink, v: View): void;
  /** Extra marks drawn over the face (wind streams, cheeks). */
  after?(ink: Ink, v: View): void;
}

interface View {
  turn: number;
  back: boolean;
  pen: Pen;
  pose: Pose;
  expression: Expression;
  rand: () => number;
}

// ---------------------------------------------------------------------------

/** Tail wisp from the body down to near the ground, curling at the end. */
function wisp(ink: Ink, top: Point, w: number, fill: string, curl: number, opts = {}): void {
  const pts = [top, P(top.x - w * 0.25 * curl, -28), P(top.x - w * 0.7 * curl, -12), P(top.x - w * 1.25 * curl, -5), P(top.x - w * 1.45 * curl, -12)];
  ink.taper(pts, [w, w * 0.75, w * 0.45, w * 0.22, w * 0.08], fill, opts, 6);
}

function wind(): SpiritDef {
  const C = P(0, -60);
  return {
    hull: [P(-34, C.y), P(34, C.y), P(0, -96), P(-20, -4), P(10, -6)],
    face: { c: P(2, C.y - 4), gap: 8.5, eyeR: 4.4, mouthDy: 13, mouthW: 7.5 },
    shoulderN: P(27, -46),
    shoulderF: P(-29, -46),
    armLen: 26,
    armW: 6,
    handR: 5.2,
    armFill: (pen) => fillOf("white", pen),
    handFill: (pen) => fillOf("white", pen),
    headR: 28,
    waist: -38,
    draw(ink, v) {
      const pen = v.pen;
      const cloud = fillOf("white", pen);
      wisp(ink, P(-4, -40), 30, fillOf("light", pen), 1);
      // swirl lines on the tail
      ink.curve([P(-8, -34), P(-16, -22), P(-26, -12), P(-32, -12)], pen.fw * 1.4);
      // billowing head/body cloud
      ink.puff(P(-6, C.y + 6), 30, 22, 9, 0.6, fillOf("light", pen), v.rand, { edge: false });
      ink.puff(C, 30, 30, 10, 0.65, cloud, v.rand);
      // brow of cloud curls
      ink.curve([P(-18, C.y - 22), P(-10, C.y - 27), P(-2, C.y - 22), P(-8, C.y - 18)], pen.fw * 1.3);
      ink.curve([P(10, C.y - 26), P(18, C.y - 22), P(14, C.y - 16)], pen.fw * 1.3);
    },
    after(ink, v) {
      const pen = v.pen;
      const x = EXPR[v.expression];
      const blowing = blows(v);
      if (blowing && !v.back) {
        // puffed cheeks + blown streams
        for (const s of [-1, 1]) ink.ell(P(2 + s * 11 + v.turn * 5, C.y + 7), 5.6, 4.6, fillOf("white", pen), { outline: false, edge: pen.dw });
        const m = P(2 + v.turn * 6 + 1, C.y + 9);
        for (const dy of [-5, 0, 5]) {
          ink.curve([P(m.x + 5, m.y + dy * 0.4), P(m.x + 18, m.y + dy), P(m.x + 30, m.y + dy * 1.6 - 2), P(m.x + 42, m.y + dy * 1.4)], pen.dw * 1.2);
        }
        ink.curve([P(m.x + 34, m.y - 12), P(m.x + 40, m.y - 16), P(m.x + 44, m.y - 12), P(m.x + 40, m.y - 9)], pen.dw);
      }
      void x;
    },
  };
}

function blows(v: View): boolean {
  return v.pose !== "talk" && (v.expression === "neutral" || v.expression === "determined" || v.expression === "angry" || v.expression === "shout");
}

function frost(): SpiritDef {
  const C = P(0, -64);
  return {
    hull: [P(-22, C.y), P(22, C.y), P(0, -94), P(0, -4)],
    face: { c: P(1, C.y + 1), gap: 6.2, eyeR: 3.4, mouthDy: 10, mouthW: 5.5 },
    shoulderN: P(14, -46),
    shoulderF: P(-14, -46),
    armLen: 26,
    armW: 3.6,
    handR: 3.2,
    armFill: (pen) => fillOf("light", pen),
    handFill: (pen) => fillOf("white", pen),
    headR: 20,
    waist: -32,
    draw(ink, v) {
      const pen = v.pen;
      const ice = fillOf("white", pen);
      const shade = fillOf("light", pen);
      // shard body tapering to an icicle point near the ground
      ink.poly([P(-15, -48), P(-9, -30), P(-12, -18), P(-3, -3), P(1, -12), P(4, -2), P(9, -20), P(13, -30), P(16, -48), P(0, -44)], ice);
      ink.poly([P(-15, -48), P(-9, -30), P(-12, -18), P(-3, -3), P(-2, -40)], shade, { outline: false, edge: false });
      ink.line([P(0, -44), P(-2, -24), P(-3, -4)], pen.fw * 1.2);
      ink.line([P(9, -20), P(4, -30)], pen.fw * 1.2);
      // icicle crown
      const crown: Point[] = [];
      const spikes = 7;
      for (let i = 0; i <= spikes; i += 1) {
        const x = -19 + (38 * i) / spikes;
        const tall = [8, 14, 11, 22, 12, 16, 9, 7][i] ?? 8;
        crown.push(P(x - 2.4, C.y - 12), P(x, C.y - 12 - tall));
      }
      crown.push(P(19, C.y - 10), P(-19, C.y - 10));
      ink.poly(crown, shade);
      // hexagonal crystal head
      const hex: Point[] = [];
      for (let i = 0; i < 6; i += 1) hex.push(polar(C, 20, (i * 60 + 30) * DEG));
      ink.poly(hex.map((p) => P(p.x, p.y * 1 + (p.y - C.y) * 0.08)), ice);
      // facet lines
      ink.line([polar(C, 20, -150 * DEG), P(C.x - 6, C.y - 4), polar(C, 20, 150 * DEG)], pen.fw);
      ink.line([polar(C, 20, -30 * DEG), P(C.x + 7, C.y - 6)], pen.fw);
      // frost sparkles
      for (const [x, y, r] of [
        [-28, -80, 4],
        [26, -86, 3],
        [30, -30, 3.4],
      ] as const) ink.poly(sparkPts(P(x, y), r), fillOf("white", pen), { outline: false, edge: pen.fw });
    },
  };
}

function sparkPts(c: Point, r: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < 8; i += 1) out.push(polar(c, i % 2 === 0 ? r : r * 0.25, -Math.PI / 2 + (i * Math.PI) / 4));
  return out;
}

function snow(): SpiritDef {
  const C = P(0, -62);
  return {
    hull: [P(-24, -30), P(24, -30), P(0, -92), P(0, -3)],
    face: { c: P(1, C.y + 1), gap: 6.6, eyeR: 3.6, mouthDy: 9.6, mouthW: 5.4 },
    shoulderN: P(15, -42),
    shoulderF: P(-15, -42),
    armLen: 18,
    armW: 5.6,
    handR: 4.4,
    armFill: (pen) => fillOf("white", pen),
    handFill: (pen) => fillOf("white", pen),
    headR: 19,
    waist: -28,
    draw(ink, v) {
      const pen = v.pen;
      const white = fillOf("white", pen);
      // plump body with a soft scalloped hem
      ink.puff(P(0, -26), 23, 21, 11, 0.45, white, v.rand);
      ink.puff(P(-6, -8), 11, 6, 5, 0.5, fillOf("light", pen), v.rand, { edge: pen.dw });
      ink.puff(P(8, -9), 9, 5.5, 5, 0.5, white, v.rand);
      // round head with a snowflake crown
      ink.ell(C, 19, 18, white, undefined, 28);
      ink.ell(P(-10, C.y + 8), 6, 4, fillOf("light", pen), { outline: false, edge: false });
      const fl = P(0, C.y - 24);
      for (let i = 0; i < 6; i += 1) {
        const a = (i * 60 - 90) * DEG;
        ink.line([fl, polar(fl, 7, a)], pen.dw * 1.5);
        ink.line([polar(fl, 4.2, a), polar(polar(fl, 4.2, a), 2.4, a - 0.8)], pen.dw);
        ink.line([polar(fl, 4.2, a), polar(polar(fl, 4.2, a), 2.4, a + 0.8)], pen.dw);
      }
      // falling flakes
      for (const [x, y] of [
        [-30, -70],
        [28, -58],
        [-26, -30],
        [30, -22],
        [22, -88],
      ] as const) ink.ell(P(x, y), 1.6, 1.6, fillOf("white", pen), { edge: pen.dw });
    },
  };
}

function hail(): SpiritDef {
  const C = P(0, -62);
  return {
    hull: [P(-24, -40), P(24, -40), P(0, -86), P(0, -4)],
    face: { c: P(1, C.y + 1), gap: 6.4, eyeR: 3.4, mouthDy: 9.6, mouthW: 5.4 },
    shoulderN: P(16, -44),
    shoulderF: P(-16, -44),
    armLen: 20,
    armW: 4.6,
    handR: 4.2,
    armFill: (pen) => fillOf("stone", pen),
    handFill: (pen) => fillOf("stone", pen),
    headR: 19,
    waist: -30,
    draw(ink, v) {
      const pen = v.pen;
      const stone = fillOf("stone", pen);
      const mid = fillOf("mid", pen);
      // pebble cluster body tapering down
      const pebbles: [number, number, number][] = [
        [-12, -42, 9],
        [10, -44, 10],
        [0, -32, 10],
        [-8, -20, 7.5],
        [7, -18, 6.5],
        [0, -9, 5],
        [-3, -3.6, 3.4],
      ];
      pebbles.forEach(([x, y, r], i) => ink.ell(P(x, y), r * (1 + (v.rand() - 0.5) * 0.1), r * 0.88, i % 2 ? mid : stone, undefined, 18));
      // big pebble head
      ink.blob([P(-20, C.y - 2), P(-14, C.y - 17), P(2, C.y - 21), P(17, C.y - 14), P(21, C.y + 2), P(13, C.y + 16), P(-2, C.y + 19), P(-16, C.y + 13)], stone, undefined, 0.5);
      // pits
      for (const [x, y, r] of [
        [-13, -76, 1.6],
        [12, -78, 1.2],
        [16, -58, 1.3],
        [-15, -54, 1],
      ] as const) ink.spot(P(x, y), r, r * 0.8, fillOf("mid", pen));
      // falling hailstones
      for (const [x, y] of [
        [-30, -50],
        [30, -34],
        [-26, -18],
        [26, -76],
      ] as const) {
        ink.ell(P(x, y), 2.4, 2.4, stone, undefined, 12);
        ink.line([P(x - 1, y - 4), P(x - 2.4, y - 9)], pen.fw);
      }
    },
  };
}

function sun(): SpiritDef {
  const C = P(0, -48);
  const R = 27;
  return {
    hull: [P(-R - 15, C.y), P(R + 15, C.y), P(0, C.y - R - 15), P(0, C.y + R + 15)],
    face: { c: P(1, C.y - 2), gap: 8.4, eyeR: 4.2, mouthDy: 12.5, mouthW: 7.5 },
    shoulderN: P(R * 0.95, C.y + 8),
    shoulderF: P(-R * 0.95, C.y + 8),
    armLen: 20,
    armW: 2.2,
    handR: 3,
    armFill: () => INK,
    handFill: (pen) => fillOf("white", pen),
    headR: R,
    waist: C.y + R * 0.7,
    draw(ink, v) {
      const pen = v.pen;
      // alternating long flame rays and short triangles
      const rays = 14;
      for (let i = 0; i < rays; i += 1) {
        const a = (i / rays) * Math.PI * 2 - Math.PI / 2;
        const long = i % 2 === 0;
        const l = long ? 15 : 9;
        const base1 = polar(C, R - 1, a - 0.13);
        const base2 = polar(C, R - 1, a + 0.13);
        const tip = polar(C, R + l, a + (long ? 0.08 : 0));
        const mid = polar(C, R + l * 0.55, a - 0.1);
        ink.blob(long ? [base1, mid, tip, polar(C, R + l * 0.5, a + 0.15), base2] : [base1, tip, base2], long ? fillOf("white", pen) : fillOf("mid", pen), undefined, long ? 0.4 : 0.1);
      }
      ink.ell(C, R, R, fillOf("white", pen), { weight: 1.1 }, 36);
      ink.ell(P(C.x - R * 0.35, C.y + R * 0.3), R * 0.35, R * 0.25, fillOf("light", pen), { outline: false, edge: false });
    },
  };
}

function moon(): SpiritDef {
  // crescent opening to the right, face in profile on the inner edge
  const C = P(-8, -48);
  const R = 36;
  return {
    hull: [P(C.x - R, C.y), P(C.x + R * 0.8, C.y - R * 0.8), P(C.x + R * 0.8, C.y + R * 0.8), P(C.x, C.y - R), P(C.x, C.y + R)],
    face: { c: P(C.x + 2, C.y - 6), gap: 0, eyeR: 4.4, mouthDy: 15, mouthW: 5.5, profile: true },
    shoulderN: P(C.x + 6, C.y + 18),
    shoulderF: P(C.x - R * 0.9, C.y + 6),
    armLen: 20,
    armW: 2.2,
    handR: 3,
    armFill: () => INK,
    handFill: (pen) => fillOf("white", pen),
    headR: 22,
    waist: C.y + 20,
    draw(ink, v) {
      const pen = v.pen;
      const outer = ellipsePts(C, R, R, 40);
      // inner edge: a profile (forehead, nose, lips, chin) cut into the disc
      const cx = C.x + 16;
      const prof: Point[] = [
        P(C.x + R * 0.62, C.y - R * 0.8),
        P(cx - 2, C.y - 24),
        P(cx - 7, C.y - 12),
        P(cx - 6, C.y - 4),
        P(cx + 2, C.y + 3), // nose tip
        P(cx - 5, C.y + 6),
        P(cx - 4, C.y + 10),
        P(cx - 7, C.y + 13), // lips
        P(cx - 5, C.y + 16),
        P(cx - 9, C.y + 22), // chin
        P(cx - 6, C.y + 28),
        P(C.x + R * 0.62, C.y + R * 0.8),
      ];
      const outerArc = outer.filter((p) => p.x < C.x + R * 0.62 || Math.abs(p.y - C.y) > R * 0.8);
      const left = outerArc.filter((p) => p.x <= C.x + R * 0.62).sort((a, b) => Math.atan2(a.y - C.y, a.x - C.x) - Math.atan2(b.y - C.y, b.x - C.x));
      // walk the outer arc from bottom (angle ~+54deg) round the left to the top (-54deg)
      const arc: Point[] = [];
      for (let i = 0; i <= 28; i += 1) {
        const a = (54 + (i / 28) * 252) * DEG;
        arc.push(polar(C, R, a));
      }
      void left;
      ink.blob([...arc, ...prof], fillOf("white", pen), { weight: 1.1 }, 0.35);
      // craters
      for (const [x, y, r] of [
        [-30, -60, 3.2],
        [-34, -38, 2.4],
        [-22, -26, 2],
      ] as const) ink.ell(P(x, y), r, r * 0.85, fillOf("light", pen), { outline: false, edge: pen.fw });
      // nightcap
      ink.blob([P(C.x - 12, C.y - R + 3), P(C.x + 8, C.y - R - 4), P(C.x + 22, C.y - R + 8), P(C.x + 34, C.y - R + 22), P(C.x + 16, C.y - R + 6), P(C.x - 2, C.y - R + 10)], fillOf("dots", pen), undefined, 0.35);
      ink.ell(P(C.x + 35, C.y - R + 24), 3, 3, fillOf("white", pen));
    },
  };
}

function fire(): SpiritDef {
  const C = P(0, -44);
  return {
    hull: [P(-26, -30), P(26, -30), P(2, -96), P(0, -2)],
    face: { c: P(1, C.y - 2), gap: 6.8, eyeR: 3.6, mouthDy: 10.5, mouthW: 5.6 },
    shoulderN: P(18, -38),
    shoulderF: P(-18, -38),
    armLen: 20,
    armW: 4.6,
    handR: 3.6,
    armFill: (pen) => fillOf("black", pen),
    handFill: (pen) => fillOf("white", pen),
    headR: 20,
    waist: -24,
    draw(ink, v) {
      const pen = v.pen;
      const flame = (pts: Point[], fill: string, opts = {}) => ink.blob(pts, fill, opts, 0.45);
      // outer flame: tongues rising to a tall tip, dark
      flame(
        [P(0, -3), P(18, -10), P(26, -30), P(22, -52), P(28, -66), P(16, -60), P(14, -78), P(6, -70), P(2, -96), P(-6, -74), P(-14, -82), P(-14, -62), P(-26, -64), P(-24, -44), P(-26, -26), P(-16, -8)],
        fillOf("black", pen),
      );
      // pale core where the face lives
      flame([P(0, -16), P(14, -24), P(18, -40), P(12, -56), P(4, -52), P(1, -66), P(-6, -54), P(-12, -58), P(-17, -42), P(-14, -24)], fillOf("white", pen), { outline: false, edge: pen.dw });
      // embers
      for (const [x, y, r] of [
        [-26, -84, 2],
        [22, -88, 1.6],
        [30, -48, 1.4],
      ] as const) ink.poly(sparkPts(P(x, y), r * 2), INK, { outline: false });
    },
  };
}

function rain(): SpiritDef {
  const C = P(0, -64);
  return {
    hull: [P(-36, C.y), P(36, C.y), P(0, -94), P(0, -4)],
    face: { c: P(1, C.y - 1), gap: 8, eyeR: 4.2, mouthDy: 11, mouthW: 6.5, dark: true },
    shoulderN: P(24, -56),
    shoulderF: P(-26, -56),
    armLen: 22,
    armW: 5.2,
    handR: 4.4,
    armFill: (pen) => fillOf("dark", pen),
    handFill: (pen) => fillOf("mid", pen),
    headR: 28,
    waist: -44,
    draw(ink, v) {
      const pen = v.pen;
      // falling rain: slanted streaks and a few fat drops under the cloud
      for (let i = 0; i < 6; i += 1) {
        const x = -22 + i * 9;
        const y0 = -46 + (i % 2) * 5;
        ink.line([P(x, y0), P(x - 4, y0 + 16 + (i % 3) * 6)], pen.dw * 1.2);
      }
      for (const [x, y] of [
        [-17, -14],
        [2, -8],
        [19, -18],
      ] as const) ink.sk.shape(mapPathD(dropD(P(x, y), 3.4, 0.25), ink.xf), fillOf("white", pen));
      ink.puff(P(0, C.y + 6), 36, 18, 9, 0.55, fillOf("dark", pen), v.rand, { edge: false });
      ink.puff(C, 34, 26, 10, 0.6, fillOf("mid", pen), v.rand);
      ink.curve([P(-26, C.y + 8), P(-10, C.y + 14), P(10, C.y + 14), P(26, C.y + 8)], pen.fw * 1.3);
    },
  };
}

const DEFS: Record<Element, () => SpiritDef> = { wind, frost, snow, hail, sun, moon, fire, rain };

function poseXf(pose: Pose): { rot: number; lift: number; sx: number; sy: number } {
  switch (pose) {
    case "fly":
      return { rot: 16 * DEG, lift: 14, sx: 1, sy: 1 };
    case "talk":
      return { rot: -3 * DEG, lift: 0, sx: 1, sy: 1 };
    case "reach":
      return { rot: 6 * DEG, lift: 3, sx: 0.97, sy: 1.04 };
    case "cower":
      return { rot: -10 * DEG, lift: 0, sx: 1.06, sy: 0.88 };
    default:
      return { rot: 0, lift: 0, sx: 1, sy: 1 };
  }
}

export const spiritRig: KindRig<SpiritLook> = {
  supportedPoses: () => POSES,
  supportedExpressions: () => ALL_EXPRESSIONS,
  nominalHeight: (look) => HEIGHT[look.element] ?? 90,
  draw(request: FigureRequest & { look: SpiritLook }, ctx: DrawContext): FigureDrawing {
    const look = request.look;
    const make = DEFS[look.element];
    if (!make) throw new Error(`unknown spirit element ${String(look.element)}`);
    const pose = POSES.includes(request.pose) ? request.pose : "stand";
    const pen = makePen(request.lineWidth, ctx.idPrefix);
    const def = make();
    const px = poseXf(pose);
    const floats = look.element === "sun" || look.element === "moon";
    const build = (lift: number) => {
      const { xf, rot } = bodyXf({ rot: px.rot, pivot: P(0, -40), lift, sx: px.sx, sy: px.sy, hull: def.hull, rest: false });
      const sk = new Sketch(pen);
      const ink = new Ink(sk, xf, rot);
      const facing = request.facing === "left" ? "right" : request.facing;
      const v: View = { turn: facing === "right" ? 0.42 : 0, back: facing === "back", pen, pose, expression: request.expression, rand: charRand(request.seed, `spirit-${look.element}`) };
      const f = def.face;
      const shift = 0;
      const faceC = xf(P(f.c.x + shift, f.c.y));
      const armSet = arms({
        near: xf(def.shoulderN),
        far: xf(def.shoulderF),
        len: def.armLen,
        w: def.armW,
        handR: def.handR,
        pose: pose === "fly" ? "reach" : pose,
        facing,
        armFill: def.armFill(pen),
        handFill: def.handFill(pen),
        chin: xf(P(f.c.x + shift, f.c.y + f.mouthDy + 3)),
        hipNear: xf(P(def.shoulderN.x * 0.9, def.waist)),
        hipFar: xf(P(def.shoulderF.x * 0.9, def.waist)),
      });
      if (!armSet.farInFront) armSet.far(sk);
      def.draw(ink, v);
      let mouth = xf(P(f.c.x + (f.profile ? 8 : f.gap * 0.62 * v.turn), f.c.y + f.mouthDy));
      if (!v.back) {
        const mouthKind: MouthKind | undefined = look.element === "wind" && blows(v) ? "blow" : undefined;
        sk.raw(
          drawFace(
            {
              c: faceC,
              gap: f.gap,
              eyeR: f.eyeR,
              turn: f.profile ? 1 : v.turn,
              pen,
              headR: def.headR,
              dark: f.dark ?? false,
              mouth: { dy: f.mouthDy, w: f.mouthW, dx: f.profile ? 8 : 0 },
              talking: pose === "talk",
              rot,
              mouthKind,
            },
            request.expression,
          ),
        );
        if (f.profile) mouth = xf(P(f.c.x + 8, f.c.y + f.mouthDy));
      }
      def.after?.(ink, v);
      sk.layer();
      if (armSet.farInFront) armSet.far(sk);
      armSet.near(sk);
      const anchors = anchorsFrom(sk, {
        head: faceC,
        headRadius: def.headR,
        mouth,
        hand: armSet.hand,
        waist: xf(P(0, def.waist)).y,
        shoulders: xf(def.shoulderN).y,
      });
      void lerpP;
      void sparkD;
      void PAPER;
      return { sk, anchors };
    };
    // two passes: measure, then rest the lowest mark on the ground (sun/moon float)
    const first = build(px.lift);
    const drop = floats ? 0 : first.sk.bounds().maxY - pen.lw;
    const { sk, anchors } = floats ? first : build(px.lift * 2 + drop);
    return finishFigure(sk, anchors);
  },
};
