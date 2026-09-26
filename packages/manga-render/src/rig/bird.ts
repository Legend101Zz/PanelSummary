/**
 * Bird rig: swallow, nightingale, sparrow, linnet, dove, crow, owl, duck.
 *
 * Profile ("right") is drawn from a body egg on a tilted axis, a head circle
 * with its own heading, a species tail, folded or spread wings and thin ink
 * legs. The look's tone colours the plumage; bellies stay light so the
 * silhouette reads at thumbnail size. The beak is the mouth: it opens for
 * talk/shout and its gape line curves with the expression.
 */
import type { BirdLook, Expression, Point, Pose } from "../contracts.js";
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
  affine,
  anchorsFrom,
  finishFigure,
  blobD,
  charRand,
  circleD,
  clampBelow,
  curveD,
  darker,
  ellipsePts,
  fillOf,
  isDark,
  lerpP,
  lighter,
  lineD,
  makePen,
  polar,
  quadD,
  rotP,
  taperD,
} from "./creature/common.js";
import { ALL_EXPRESSIONS, EXPR, drawFace, mouthOpen } from "./creature/face.js";
import { polyPath } from "../svg.js";

type Species = BirdLook["species"];
type TailKind = "fork" | "round" | "notch" | "fan" | "short" | "duck" | "wedge";
type BeakKind = "thin" | "cone" | "hook" | "bill" | "heavy" | "dove";

interface Spec {
  h: number;
  a: number; // body half length
  b: number; // body half depth
  tilt: number; // standing axis tilt, degrees (head up)
  hr: number; // head radius
  hx: number; // head centre along body axis (× a)
  hy: number; // head centre above body axis (× b)
  beak: BeakKind;
  beakL: number;
  tail: TailKind;
  tailL: number;
  tailW: number;
  tailDroop: number; // degrees below the body axis
  wingL: number; // spread wing length
  pointed: boolean;
  fold: number; // folded wing overhang past the rump (× a)
  legL: number;
  eyeR: number; // × hr
  belly: "white" | "light" | "same";
  marks: "swallow" | "nightingale" | "sparrow" | "linnet" | "dove" | "crow" | "owl" | "duck";
}

const SPECS: Record<Species, Spec> = {
  swallow: { h: 16, a: 4.4, b: 2.3, tilt: 26, hr: 2.75, hx: 0.78, hy: 0.95, beak: "thin", beakL: 1.35, tail: "fork", tailL: 7.5, tailW: 2.4, tailDroop: 6, wingL: 11, pointed: true, fold: 1.25, legL: 1.8, eyeR: 0.4, belly: "white", marks: "swallow" },
  nightingale: { h: 14, a: 4.0, b: 2.85, tilt: 22, hr: 2.8, hx: 0.72, hy: 0.95, beak: "thin", beakL: 1.25, tail: "round", tailL: 4.6, tailW: 2.6, tailDroop: -12, wingL: 8, pointed: false, fold: 0.35, legL: 2.6, eyeR: 0.42, belly: "light", marks: "nightingale" },
  sparrow: { h: 14, a: 4.0, b: 2.75, tilt: 20, hr: 2.85, hx: 0.74, hy: 0.9, beak: "cone", beakL: 1.25, tail: "notch", tailL: 4.0, tailW: 2.3, tailDroop: 4, wingL: 8, pointed: false, fold: 0.4, legL: 2.2, eyeR: 0.38, belly: "light", marks: "sparrow" },
  linnet: { h: 14, a: 3.8, b: 2.4, tilt: 26, hr: 2.65, hx: 0.76, hy: 0.95, beak: "cone", beakL: 1.05, tail: "fork", tailL: 4.4, tailW: 2.0, tailDroop: 8, wingL: 8.5, pointed: true, fold: 0.6, legL: 2.3, eyeR: 0.4, belly: "white", marks: "linnet" },
  dove: { h: 20, a: 6.2, b: 3.9, tilt: 14, hr: 3.1, hx: 0.8, hy: 1.05, beak: "dove", beakL: 1.4, tail: "fan", tailL: 6.6, tailW: 3.4, tailDroop: 10, wingL: 12, pointed: false, fold: 0.45, legL: 3.0, eyeR: 0.36, belly: "same", marks: "dove" },
  crow: { h: 25, a: 7.2, b: 4.2, tilt: 24, hr: 4.2, hx: 0.8, hy: 1.0, beak: "heavy", beakL: 3.4, tail: "wedge", tailL: 7.5, tailW: 4.0, tailDroop: 10, wingL: 16, pointed: false, fold: 0.55, legL: 4.8, eyeR: 0.34, belly: "same", marks: "crow" },
  owl: { h: 25, a: 8.4, b: 6.6, tilt: 78, hr: 6.6, hx: 0.9, hy: 0.0, beak: "hook", beakL: 1.8, tail: "short", tailL: 3.0, tailW: 4.5, tailDroop: 0, wingL: 18, pointed: false, fold: 0.1, legL: 2.2, eyeR: 0.3, belly: "light", marks: "owl" },
  duck: { h: 30, a: 10.5, b: 5.6, tilt: 4, hr: 4.5, hx: 0.74, hy: 1.55, beak: "bill", beakL: 4.2, tail: "duck", tailL: 3.8, tailW: 3.4, tailDroop: -28, wingL: 18, pointed: false, fold: 0.1, legL: 4.2, eyeR: 0.32, belly: "light", marks: "duck" },
};

const BIRD_POSES: readonly Pose[] = [
  "stand",
  "walk",
  "jump",
  "fly",
  "perch",
  "talk",
  "point",
  "reach",
  "wave",
  "hold",
  "think",
  "bow",
  "cower",
  "fall",
  "lie",
  "sit",
];

type WingMode = { mode: "fold" } | { mode: "spread"; A: number; L: number; open?: number };
type LegMode = "stand" | "walk" | "perch" | "tuck" | "up" | "hidden" | "jump" | "lie";

interface BirdPose {
  tilt: number; // body axis, degrees (head up)
  lift: number; // extra lift of the body above its standing height
  headTurn: number; // head heading relative to level (degrees, + = up)
  headOff: Point;
  legs: LegMode;
  near: WingMode;
  far: WingMode | null;
  tailSpread: number;
  tailExtra: number; // degrees of extra droop (+ down)
  beakOpen: number;
  fluff: number;
  twig: boolean;
  /** Put the body bottom on the ground (lie/sit). */
  ground?: boolean;
}

function poseFor(s: Spec, pose: Pose, sp: Species): BirdPose {
  const base: BirdPose = {
    tilt: s.tilt,
    lift: 0,
    headTurn: 0,
    headOff: P(0, 0),
    legs: "stand",
    near: { mode: "fold" },
    far: null,
    tailSpread: 0,
    tailExtra: 0,
    beakOpen: 0,
    fluff: 1,
    twig: false,
  };
  const upright = sp === "owl";
  switch (pose) {
    case "walk":
      return { ...base, legs: "walk", tilt: s.tilt - 6, headTurn: -4 };
    case "jump":
      return { ...base, legs: "jump", lift: s.h * 0.3, tilt: s.tilt + 6, near: { mode: "spread", A: -130, L: 0.7 }, tailSpread: 0.4 };
    case "fly":
      return {
        ...base,
        tilt: upright ? 20 : 6,
        lift: s.h * 0.45,
        legs: "tuck",
        headTurn: 4,
        near: { mode: "spread", A: -118, L: 1 },
        far: { mode: "spread", A: -78, L: 0.72 },
        tailSpread: 0.8,
        tailExtra: -s.tailDroop,
      };
    case "perch":
      return { ...base, legs: "perch", tilt: s.tilt + (upright ? 0 : 8), twig: true };
    case "talk":
      return { ...base, near: { mode: "spread", A: -12, L: 0.44, open: 0.35 }, headTurn: 8 };
    case "point":
      return { ...base, near: { mode: "spread", A: -6, L: 0.62, open: 0.2 } };
    case "reach":
      return { ...base, near: { mode: "spread", A: -32, L: 0.72, open: 0.6 }, headTurn: 14, tilt: s.tilt + 6 };
    case "wave":
      return { ...base, near: { mode: "spread", A: -62, L: 0.66, open: 0.7 }, headTurn: 6 };
    case "hold":
      return { ...base, beakOpen: 0.25, headTurn: -4 };
    case "think":
      return { ...base, headTurn: 18, near: { mode: "spread", A: -40, L: 0.42, open: 0.3 } };
    case "bow":
      return { ...base, tilt: upright ? 40 : -24, headTurn: -38, tailExtra: -22, near: { mode: "spread", A: 110, L: 0.45, open: 0.3 } };
    case "cower":
      return { ...base, tilt: upright ? 60 : 4, headTurn: -22, headOff: P(-s.hr * 0.35, s.hr * 0.45), legs: "hidden", ground: true, fluff: 1.08, near: { mode: "spread", A: -160, L: 0.55, open: 0.4 }, tailExtra: 14 };
    case "fall":
      return { ...base, tilt: -58, lift: s.h * 0.4, headTurn: -20, legs: "up", near: { mode: "spread", A: -150, L: 0.9 }, far: { mode: "spread", A: -40, L: 0.6 }, tailSpread: 0.6 };
    case "lie":
      // collapsed on the ground (a bird never lies down to rest): tipped
      // head-down, the head resting on the ground, the near wing spread limp
      // over the ground and the feet curled out in front
      return { ...base, tilt: upright ? 8 : -12, legs: "lie", ground: true, headTurn: -34, headOff: P(s.hr * 0.25, s.hr * 0.8), near: { mode: "spread", A: 174, L: 0.62, open: 0.5 }, tailExtra: -s.tailDroop + 6, fluff: 0.96 };
    case "sit":
      return { ...base, legs: "hidden", ground: true, fluff: 1.1, tilt: upright ? s.tilt : Math.min(s.tilt, 12) };
    default:
      return base;
  }
}

// ---------------------------------------------------------------------------

function tailPts(kind: TailKind, L: number, W: number, spread: number): Point[] {
  // local frame: x runs backward from the rump (0) to the tail end (L), y down.
  const w = W * (1 + spread * 0.8);
  switch (kind) {
    case "fork":
      return [P(0, -W * 0.35), P(L * 0.45, -w * 0.4), P(L, -w * 0.62 - spread * W * 0.4), P(L * 0.52, -w * 0.05), P(L * 0.55, w * 0.05), P(L * 0.92, w * 0.62 + spread * W * 0.4), P(L * 0.4, w * 0.4), P(0, W * 0.35)];
    case "notch":
      return [P(0, -W * 0.33), P(L * 0.55, -w * 0.36), P(L, -w * 0.34), P(L * 0.9, 0), P(L, w * 0.34), P(L * 0.55, w * 0.36), P(0, W * 0.33)];
    case "round":
      return [P(0, -W * 0.33), P(L * 0.7, -w * 0.52), P(L * 1.0, -w * 0.2), P(L * 1.02, w * 0.18), P(L * 0.7, w * 0.5), P(0, W * 0.33)];
    case "fan":
      return [P(0, -W * 0.3), P(L * 0.75, -w * 0.5), P(L, -w * 0.22), P(L * 1.03, w * 0.2), P(L * 0.75, w * 0.52), P(0, W * 0.3)];
    case "wedge":
      return [P(0, -W * 0.33), P(L * 0.7, -w * 0.48), P(L * 1.05, 0), P(L * 0.7, w * 0.48), P(0, W * 0.33)];
    case "short":
      return [P(0, -W * 0.4), P(L, -w * 0.3), P(L * 1.05, w * 0.3), P(0, W * 0.4)];
    case "duck":
      return [P(0, -W * 0.45), P(L * 1.05, -W * 0.05), P(L * 0.55, W * 0.4), P(0, W * 0.5)];
  }
}

function wingOutline(pointed: boolean, L: number, open: number): Point[] {
  // local: x from root to tip, y = trailing side. `open` 0..1 widens the chord.
  const c = 0.75 + open * 0.35;
  if (pointed) {
    return [
      P(0, -0.1 * L),
      P(0.32 * L, -0.16 * L),
      P(0.66 * L, -0.1 * L),
      P(1.0 * L, 0.02 * L),
      P(0.78 * L, 0.1 * L * c),
      P(0.7 * L, 0.13 * L * c),
      P(0.55 * L, 0.2 * L * c),
      P(0.48 * L, 0.21 * L * c),
      P(0.32 * L, 0.29 * L * c),
      P(0.12 * L, 0.33 * L * c),
      P(0, 0.26 * L),
    ];
  }
  return [
    P(0, -0.11 * L),
    P(0.28 * L, -0.19 * L),
    P(0.62 * L, -0.17 * L),
    P(0.9 * L, -0.06 * L),
    P(1.0 * L, 0.06 * L),
    P(0.9 * L, 0.12 * L * c),
    P(0.94 * L, 0.2 * L * c),
    P(0.8 * L, 0.24 * L * c),
    P(0.8 * L, 0.33 * L * c),
    P(0.62 * L, 0.36 * L * c),
    P(0.55 * L, 0.43 * L * c),
    P(0.35 * L, 0.42 * L * c),
    P(0.14 * L, 0.42 * L * c),
    P(0, 0.3 * L),
  ];
}

interface Built {
  sk: Sketch;
  head: Point;
  headR: number;
  mouth: Point;
  hand?: Point;
  waist: number;
  shoulders: number;
}

/**
 * Profile drawing. `view` "front"/"back" draws the same bird turned toward
 * (or away from) the viewer: the body, wings, tail and legs foreshortened
 * along the facing axis, the head kept round with a near-frontal face and a
 * short beak — the same markings and proportions as the profile, never a
 * penguin-like frontal shape.
 */
function drawProfile(sp: Species, s: Spec, look: BirdLook, pose: Pose, expression: Expression, pen: Pen, seed: number, view: "side" | "front" | "back" = "side"): Built {
  const bp = poseFor(s, pose, sp);
  const k = view === "side" ? 1 : 0.58;
  const rand = charRand(seed, `bird-${sp}`);
  const sk = new Sketch(pen);
  const plum = fillOf(look.tone, pen);
  const dark = isDark(look.tone);
  const bellyTone = s.belly === "white" ? "white" : s.belly === "light" ? lighter(look.tone) : look.tone;
  const belly = fillOf(bellyTone, pen);
  const a = s.a * bp.fluff;
  const b = s.b * bp.fluff;
  const bodyDir = -bp.tilt * DEG;
  // local body point → figure (origin at body centre for now)
  const legLen = bp.legs === "perch" ? s.legL * 0.7 : bp.legs === "walk" ? s.legL * 0.95 : s.legL;
  const legAttachLocal = P(0.05 * a, 0.92 * b);
  const attach0 = rotP(legAttachLocal, bodyDir);
  let cy: number;
  if (bp.ground) {
    // lowest body point rests on the ground
    const pts = ellipsePts(P(0, 0), a, b, 24).map((p) => rotP(p, bodyDir));
    cy = -Math.max(...pts.map((p) => p.y)) - pen.lw * 0.5;
  } else {
    const low = Math.max(...ellipsePts(P(0, 0), a, b, 24).map((p) => rotP(p, bodyDir).y));
    cy = -legLen - Math.max(attach0.y, low * 0.9) - bp.lift - (bp.twig ? s.h * 0.075 * 1.1 : 0);
  }
  const B0 = P(0, cy);
  /** Foreshorten along the facing axis (front/back views); identity in profile. */
  const sq = (p: Point): Point => (k === 1 ? p : P(B0.x + (p.x - B0.x) * k, p.y));
  const sqAt = (o: Point, p: Point): Point => (k === 1 ? p : P(o.x + (p.x - o.x) * k, p.y));
  const bptRaw = (x: number, y: number) => addP(B0, rotP(P(x, y), bodyDir));
  const bpt = (x: number, y: number) => sq(bptRaw(x, y));

  // head placement
  const headLevel = (bp.headTurn - (sp === "owl" ? 0 : Math.max(0, bp.tilt - 10) * 0.35 - (bp.tilt < 0 ? bp.tilt * 0.4 : 0))) * DEG;
  const headDir = -headLevel; // svg angle of the beak direction
  let H0 = bpt(s.hx * a, -s.hy * b - (sp === "owl" ? 0 : s.hr * 0.45));
  if (sp === "owl") H0 = bpt(a * 0.78, 0);
  H0 = addP(H0, bp.headOff);
  const hr = s.hr;
  const hpt = (x: number, y: number) => addP(H0, rotP(P(x, y), headDir));

  // ---- far wing (spread) and legs, behind the body
  const drawSpread = (w: { A: number; L: number; open?: number }, near: boolean) => {
    const L = s.wingL * w.L;
    // gesturing wings hinge further back so they do not cover the face
    const gesture = pose !== "fly" && pose !== "fall" && pose !== "jump";
    const base = near ? (gesture ? bptRaw(0.02 * a, -0.62 * b) : bptRaw(0.32 * a, -0.62 * b)) : bptRaw(0.3 * a, -0.85 * b);
    const A = w.A * DEG;
    // trailing edge faces rear/down: pick the mirror whose trailing normal scores higher
    const t1 = P(-Math.sin(A), Math.cos(A));
    const sy = -t1.x + t1.y >= 0 ? 1 : -1;
    const xf0 = affine({ x: base.x, y: base.y, rot: A, sy });
    const xf = (p: Point): Point => sq(xf0(p));
    const pts = wingOutline(s.pointed, L, w.open ?? 1).map(xf);
    const wingFill = near ? plum : fillOf(darker(look.tone), pen);
    sk.shape(blobD(pts, 0.35), wingFill);
    // feather detail: covert line + primaries
    const cov = [P(0.08 * L, 0.05 * L), P(0.35 * L, 0.02 * L), P(0.62 * L, 0.0)].map(xf);
    sk.line(curveD(cov), pen.fw);
    const prim = s.pointed ? [0.55, 0.72] : [0.55, 0.7, 0.84];
    for (const t of prim) {
      const p0 = xf(P(t * L - 0.12 * L, 0.02 * L));
      const p1 = xf(P(t * L + 0.06 * L, (s.pointed ? 0.12 : 0.3) * L * (0.75 + (w.open ?? 1) * 0.35) * (1 - (t - 0.5) * 0.9)));
      sk.line(lineD([p0, p1]), pen.fw);
    }
    return xf(P(L, 0));
  };
  let hand: Point | undefined;
  if (bp.far && bp.far.mode === "spread") drawSpread(bp.far, false);

  // legs
  const legW = Math.max(pen.dw * 1.25, s.h * 0.022);
  const footY = 0;
  const drawLeg = (hip: Point, foot0: Point, knee0: Point | null, toesDir: number, curl: boolean) => {
    const foot = sqAt(hip, foot0);
    const knee = knee0 ? sqAt(hip, knee0) : null;
    const path = knee ? [hip, knee, foot] : [hip, foot];
    if (sp === "duck") {
      sk.line(lineD(path), legW * 1.6);
      const web = [P(foot.x - s.hr * 0.15, foot.y), polar(foot, s.hr * 0.75, toesDir - 0.45), P(foot.x + s.hr * 0.95, foot.y)].map((p) => (toesDir === 0 ? p : rotP(p, toesDir, foot)));
      sk.shape(polyPath(web, true), fillOf("mid", pen), { edge: pen.fw });
      return;
    }
    sk.line(lineD(path), legW);
    const toe = s.hr * (sp === "owl" ? 0.28 : 0.55);
    if (curl) {
      sk.line(curveD([foot, polar(foot, toe * 0.8, toesDir), polar(foot, toe * 0.9, toesDir + 1.3)]), legW * 0.8);
      sk.line(curveD([foot, polar(foot, toe * 0.7, toesDir + Math.PI), polar(foot, toe * 0.7, toesDir + Math.PI - 1.2)]), legW * 0.8);
    } else {
      sk.line(lineD([foot, polar(foot, toe, toesDir)]), legW * 0.85);
      sk.line(lineD([foot, polar(foot, toe * 0.8, toesDir - 0.35)]), legW * 0.85);
      sk.line(lineD([foot, polar(foot, toe * 0.6, toesDir + Math.PI)]), legW * 0.85);
    }
  };
  // hips sit on the underside of the body egg (whatever the tilt)
  const under = ellipsePts(P(0, 0), a * 0.92, b * 0.92, 48).map((p) => sq(addP(B0, rotP(p, bodyDir))));
  const bottomAt = (x: number) => {
    let best = under[0];
    let bestD = Infinity;
    for (const p of under) {
      const d = Math.abs(p.x - x) - p.y * 0.01;
      if (Math.abs(p.x - x) < a * 0.25 * k && p.y > best.y - 1e-9 && d < bestD + a) {
        if (p.y > best.y || bestD === Infinity) best = p;
        bestD = Math.min(bestD, d);
      }
    }
    return best;
  };
  const cx0 = sp === "owl" ? B0.x + a * 0.15 : bpt(0.02 * a, 0.8 * b).x;
  const hipA = bp.legs === "stand" || bp.legs === "walk" || bp.legs === "perch" ? bottomAt(cx0 + a * 0.16 * k) : bpt(0.12 * a, 0.75 * b);
  const hipB = bp.legs === "stand" || bp.legs === "walk" || bp.legs === "perch" ? bottomAt(cx0 - a * 0.1 * k) : bpt(-0.05 * a, 0.78 * b);
  switch (bp.legs) {
    case "stand":
      drawLeg(hipB, P(hipB.x - legLen * 0.05, footY), null, 0, false);
      drawLeg(hipA, P(hipA.x + legLen * 0.15, footY), null, 0, false);
      break;
    case "walk":
      drawLeg(hipB, P(hipB.x - legLen * 0.55, footY), P(hipB.x - legLen * 0.1, hipB.y + legLen * 0.5), -0.25, false);
      drawLeg(hipA, P(hipA.x + legLen * 0.7, footY - legLen * 0.25), P(hipA.x + legLen * 0.55, hipA.y + legLen * 0.25), 0.4, false);
      break;
    case "jump":
      drawLeg(hipB, polar(hipB, legLen * 1.1, 110 * DEG), null, 1.6, false);
      drawLeg(hipA, polar(hipA, legLen * 1.1, 100 * DEG), null, 1.4, false);
      break;
    case "perch":
      drawLeg(hipB, P(hipB.x - legLen * 0.05, footY - s.h * 0.075 * 1.1), P(hipB.x + legLen * 0.35, hipB.y + legLen * 0.45), 0, true);
      drawLeg(hipA, P(hipA.x + legLen * 0.2, footY - s.h * 0.075 * 1.1), P(hipA.x + legLen * 0.55, hipA.y + legLen * 0.4), 0, true);
      break;
    case "tuck":
      drawLeg(hipB, bpt(-0.45 * a, 1.05 * b), null, bodyDir + Math.PI, false);
      drawLeg(hipA, bpt(-0.3 * a, 1.12 * b), null, bodyDir + Math.PI, false);
      break;
    case "up":
      drawLeg(hipB, bpt(0.1 * a, 1.0 * b + legLen), null, bodyDir + 1.2, true);
      drawLeg(hipA, bpt(0.3 * a, 1.0 * b + legLen * 0.9), null, bodyDir + 1.0, true);
      break;
    case "lie": {
      const h1 = bpt(0.15 * a, 0.7 * b);
      const h2 = bpt(0.35 * a, 0.6 * b);
      drawLeg(h1, P(h1.x + legLen * 1.1, Math.min(h1.y, -legLen * 0.35)), null, -0.6, true);
      drawLeg(h2, P(h2.x + legLen * 1.0, Math.min(h2.y - legLen * 0.3, -legLen * 0.7)), null, -0.9, true);
      break;
    }
    default:
      break;
  }

  // twig for perch
  if (bp.twig) {
    const tw = s.h * 0.075;
    const ty = footY - tw * 0.6;
    sk.shape(taperD([P(-s.h * 0.55, ty + tw * 0.25), P(0, ty + tw * 0.05), P(s.h * 0.55, ty - tw * 0.2)], [tw * 1.1, tw, tw * 0.7], { samples: 4 }), fillOf("dark", pen), { edge: pen.dw });
    sk.line(lineD([P(s.h * 0.28, ty - tw * 0.1), P(s.h * 0.4, ty - tw * 1.3)]), tw * 0.35);
  }

  // ---- tail
  const tailBase = bptRaw(-0.92 * a, -0.1 * b);
  let tailAngle = bodyDir + Math.PI + (s.tailDroop + bp.tailExtra) * DEG * -1;
  const tailLocal = tailPts(s.tail, s.tailL, s.tailW, bp.tailSpread);
  // keep the tail off the ground (rotate it up in 4 degree steps)
  const floor = -s.h * 0.03;
  for (let i = 0; i < 30; i += 1) {
    const f = affine({ x: tailBase.x, y: tailBase.y, rot: tailAngle });
    if (Math.max(...tailLocal.map((p) => f(p).y)) <= floor) break;
    tailAngle += 4 * DEG * (Math.cos(tailAngle) < 0 ? 1 : -1);
  }
  const txf0 = affine({ x: tailBase.x, y: tailBase.y, rot: tailAngle });
  const txf = (p: Point): Point => sq(txf0(p));
  const tpts = tailLocal.map(txf);
  const tailFill = s.marks === "duck" ? plum : fillOf(s.marks === "nightingale" && !dark ? darker(look.tone) : look.tone, pen);
  sk.shape(s.tail === "fork" || s.tail === "notch" || s.tail === "duck" ? polyPath(tpts, true) : blobD(tpts, 0.4), tailFill);
  if (s.tail !== "short" && s.tail !== "duck") {
    const mid = txf(P(s.tailL * 0.15, 0));
    for (const t of [-0.22, 0.22]) sk.line(lineD([mid, txf(P(s.tailL * 0.8, s.tailW * t))]), pen.fw, { halo: dark });
  }

  // ---- body
  const bodyLocal = [
    P(a, 0.08 * b),
    P(0.62 * a, -0.86 * b),
    P(0, -b),
    P(-0.72 * a, -0.68 * b),
    P(-1.04 * a, 0.02 * b),
    P(-0.68 * a, 0.62 * b),
    P(0.02 * a, 1.02 * b),
    P(0.66 * a, 0.78 * b),
  ];
  const bodyPts = bodyLocal.map((p) => bpt(p.x, p.y));
  const bodyD = blobD(bodyPts, 0.55);
  // neck blob joins head and chest seamlessly
  const neck = [hpt(-hr * 0.75, -hr * 0.45), hpt(0.25 * hr, -hr * 0.2), hpt(hr * 0.5, hr * 0.7), bpt(0.9 * a, 0.25 * b), bpt(0.45 * a, -0.2 * b), bpt(0.2 * a, -0.85 * b)];
  sk.shape(bodyD, plum, { edge: false });
  if (sp === "duck" || s.hy > 1.5) sk.shape(blobD(neck, 0.5), plum, { edge: false });
  sk.shape(circleD(H0, hr), plum, { edge: false });
  // belly: lower part of the body egg below a line along the axis
  if (s.belly !== "same" || s.marks === "dove") {
    const cut = (sp === "owl" ? -0.2 : 0.1) * b;
    const bl = clampBelow(bodyLocal.flatMap((p, i) => [p, lerpP(p, bodyLocal[(i + 1) % bodyLocal.length], 0.5)]).map((p) => P(p.x, p.y)), () => cut);
    const bellyPts = bl.map((p) => bpt(p.x * 0.97, p.y * 0.97 + 0.01 * b));
    const throat = s.marks === "owl" ? [] : [hpt(hr * 0.35, hr * 0.55), hpt(-hr * 0.15, hr * 0.75)];
    sk.shape(blobD([...bellyPts.filter((_, i) => i % 1 === 0), ...throat], 0.4), belly, { edge: false });
    sk.line(curveD([bpt(-0.85 * a, 0.2 * b), bpt(-0.3 * a, cut + 0.15 * b), bpt(0.4 * a, cut), bpt(0.85 * a, -0.1 * b)]), pen.fw);
  }

  // species markings on body/head
  const marks: string[] = [];
  switch (s.marks) {
    case "swallow": {
      // throat bib low under the beak (kept clear of the face: a big dark
      // patch right under the eyes reads as a gaping mouth in close-ups)
      sk.shape(blobD([hpt(hr * 0.8, hr * 0.42), hpt(hr * 0.66, hr * 0.98), hpt(hr * 0.12, hr * 1.06), hpt(hr * 0.3, hr * 0.66), hpt(hr * 0.6, hr * 0.5)], 0.5), fillOf(dark ? "mid" : "dark", pen), { edge: pen.fw });
      break;
    }
    case "sparrow": {
      sk.shape(blobD([hpt(-hr * 0.9, -hr * 0.2), hpt(-hr * 0.2, -hr * 0.95), hpt(hr * 0.6, -hr * 0.7), hpt(hr * 0.2, -hr * 0.35), hpt(-hr * 0.5, -hr * 0.05)], 0.5), fillOf("mid", pen), { edge: false });
      sk.shape(blobD([hpt(hr * 0.75, hr * 0.25), hpt(hr * 0.45, hr * 1.05), hpt(0, hr * 1.2), hpt(hr * 0.05, hr * 0.5)], 0.5), INK, { edge: false });
      for (let i = 0; i < 4; i += 1) {
        const p = bpt(-0.5 * a + i * 0.28 * a, -0.55 * b + (i % 2) * 0.15 * b);
        marks.push(lineD([p, addP(p, rotP(P(-0.35 * a, 0.1 * b), bodyDir))]));
      }
      break;
    }
    case "linnet": {
      sk.shape(blobD([hpt(hr * 0.35, -hr * 0.95), hpt(hr * 0.95, -hr * 0.3), hpt(hr * 0.5, -hr * 0.2), hpt(hr * 0.05, -hr * 0.65)], 0.5), fillOf("dense_dots", pen), { edge: false });
      sk.shape(blobD([bpt(0.95 * a, -0.1 * b), bpt(0.75 * a, 0.5 * b), bpt(0.4 * a, 0.35 * b), bpt(0.55 * a, -0.25 * b)], 0.5), fillOf("dots", pen), { edge: false });
      for (let i = 0; i < 3; i += 1) {
        const p = bpt(-0.1 * a - i * 0.25 * a, 0.3 * b + (i % 2) * 0.2 * b);
        marks.push(lineD([p, addP(p, rotP(P(-0.22 * a, 0.02 * b), bodyDir))]));
      }
      break;
    }
    case "dove": {
      sk.shape(taperD([hpt(-hr * 0.9, hr * 1.05), hpt(-hr * 0.2, hr * 1.25)], [hr * 0.28, hr * 0.28]), INK, { edge: false });
      break;
    }
    case "nightingale": {
      break;
    }
    case "owl": {
      break;
    }
    case "duck": {
      // white neck ring + dark head
      sk.shape(blobD([hpt(-hr * 1.02, hr * 0.1), hpt(-hr * 0.1, -hr * 1.02), hpt(hr * 0.95, -hr * 0.1), hpt(hr * 0.35, hr * 0.95), hpt(-hr * 0.55, hr * 0.9)], 0.6), fillOf(darker(look.tone), pen), { edge: false });
      break;
    }
    case "crow":
      break;
  }
  for (const m of marks) sk.line(m, pen.fw, { halo: false });

  // folded wing
  if (bp.near.mode === "fold") {
    const wl = [
      bpt(0.5 * a, -0.62 * b),
      bpt(0.05 * a, -0.78 * b),
      bpt(-0.6 * a, -0.62 * b),
      bpt(-(1.0 + s.fold) * a, -0.18 * b + (s.pointed ? 0 : 0.05 * b)),
      bpt(-0.55 * a, 0.28 * b),
      bpt(0.2 * a, 0.38 * b),
      bpt(0.55 * a, 0.02 * b),
    ];
    sk.shape(blobD(wl, 0.5), fillOf(s.marks === "nightingale" ? look.tone : look.tone, pen), { edge: pen.dw });
    // coverts + primaries
    sk.line(curveD([bpt(0.45 * a, -0.1 * b), bpt(0.05 * a, 0.05 * b), bpt(-0.35 * a, -0.05 * b)]), pen.fw, { halo: dark });
    for (const t of [0, 1, 2]) {
      const p0 = bpt(-0.2 * a - t * 0.18 * a, 0.22 * b - t * 0.06 * b);
      const p1 = bpt(-(0.85 + s.fold * 0.7) * a - t * 0.08 * a, -0.12 * b);
      sk.line(lineD([p0, p1]), pen.fw, { halo: dark });
    }
    if (sp === "sparrow" || sp === "linnet") {
      sk.line(lineD([bpt(0.15 * a, -0.35 * b), bpt(-0.25 * a, -0.3 * b)]), pen.dw * 1.4, { color: PAPER });
    }
  }

  // owl extras: ear tufts, facial disc (drawn in profile as a 3/4 face)
  let faceSvg = "";
  const eyeC = hpt(hr * 0.32, -hr * 0.12);
  const eyeR = s.eyeR * hr;
  if (sp === "owl") {
    const turn = view === "side" ? 0.35 : 0;
    const fc = hpt(hr * 0.12, hr * 0.05);
    sk.shape(polyPath([hpt(-hr * 0.85, -hr * 0.55), hpt(-hr * 1.0, -hr * 1.35), hpt(-hr * 0.35, -hr * 0.85)], true), plum);
    sk.shape(polyPath([hpt(hr * 0.35, -hr * 0.85), hpt(hr * 0.8, -hr * 1.35), hpt(hr * 0.9, -hr * 0.5)], true), plum);
    sk.shape(circleD(H0, hr), plum, { edge: false });
    // facial disc: two overlapping pale circles
    const discFill = fillOf(lighter(look.tone), pen);
    sk.shape(blobD([hpt(-hr * 0.75, -hr * 0.2), hpt(-hr * 0.35, -hr * 0.72), hpt(hr * 0.1, -hr * 0.45), hpt(hr * 0.6, -hr * 0.72), hpt(hr * 0.98, -hr * 0.1), hpt(hr * 0.6, hr * 0.62), hpt(hr * 0.12, hr * 0.78), hpt(-hr * 0.4, hr * 0.62)], 0.5), discFill, { edge: pen.dw });
    const x = EXPR[expression];
    const open = mouthOpen(expression, pose === "talk");
    const beakC = P(fc.x + hr * 0.18, fc.y + hr * 0.2);
    if (view !== "back") faceSvg += drawFace({ c: P(fc.x, fc.y - hr * 0.12), gap: hr * 0.42, eyeR: hr * 0.26, turn, pen, headR: hr, brows: true }, expression);
    // hooked beak pointing down
    const bw = hr * 0.16;
    const upper = [P(beakC.x - bw, beakC.y - bw * 0.6), P(beakC.x + bw, beakC.y - bw * 0.6), P(beakC.x + bw * 0.2, beakC.y + bw * 2.2 - open * bw * 0.6)];
    const lower = [P(beakC.x - bw * 0.7, beakC.y + bw * 0.5), P(beakC.x + bw * 0.7, beakC.y + bw * 0.5), P(beakC.x, beakC.y + bw * 1.2 + open * bw * 1.6)];
    if (open > 0.05) faceSvg += `<path d="${polyPath(lower, true)}" fill="${INK}" stroke="${INK}" stroke-width="${n2(pen.dw)}" stroke-linejoin="round"/>`;
    faceSvg += `<path d="${polyPath(upper, true)}" fill="${fillOf("light", pen)}" stroke="${INK}" stroke-width="${n2(pen.dw)}" stroke-linejoin="round"/>`;
    // chest feather chevrons
    for (let i = 0; i < 3; i += 1) {
      for (let j = -1; j <= 1; j += 1) {
        const c = bpt(-0.05 * a - i * 0.3 * a + (j === 0 ? 0 : 0.12 * a), j * 0.32 * b + 0.2 * b);
        marks.push(quadD(P(c.x - b * 0.1, c.y - b * 0.05), P(c.x, c.y + b * 0.08), P(c.x + b * 0.1, c.y - b * 0.05)));
      }
    }
    for (const m of marks.slice(-9)) sk.line(m, pen.fw);
    void x;
    const mouth = P(beakC.x, beakC.y + hr * 0.35);
    if (pose === "hold") hand = P(beakC.x, beakC.y + hr * 0.4);
    // spread near wing on top
    if (bp.near.mode === "spread") {
      sk.layer();
      hand = drawSpread(bp.near, true);
    }
    sk.raw(faceSvg);
    return finish(sk, H0, hr, mouth, hand, bpt, a, b, pose);
  }

  // ---- beak
  const open = pose === "hold" ? 0.3 : Math.max(mouthOpen(expression, pose === "talk"), bp.beakOpen);
  const x = EXPR[expression];
  const beakBase = view === "side" ? hpt(hr * 0.86, hr * 0.05) : view === "front" ? hpt(hr * 0.5, hr * 0.22) : hpt(hr * 0.9, hr * 0.02);
  const bl = s.beakL * (view === "side" ? 1 : view === "front" ? 0.62 : 0.4);
  const bh = beak(s.beak, hr);
  const upAng = headDir - open * 16 * DEG;
  const loAng = headDir + open * 30 * DEG;
  const up = affine({ x: beakBase.x, y: beakBase.y, rot: upAng });
  const lo = affine({ x: beakBase.x, y: beakBase.y, rot: loAng });
  const beakFill = s.beak === "bill" ? fillOf("light", pen) : s.beak === "dove" ? fillOf("mid", pen) : INK;
  let upperPts: Point[];
  let lowerPts: Point[];
  if (s.beak === "bill") {
    upperPts = [P(-bl * 0.12, -bh * 0.75), P(bl * 0.35, -bh * 0.3), P(bl * 0.8, -bh * 0.32), P(bl * 1.02, -bh * 0.05), P(bl * 0.92, bh * 0.2), P(-bl * 0.05, bh * 0.12)];
    lowerPts = [P(0, bh * 0.1), P(bl * 0.9, bh * 0.15), P(bl * 0.75, bh * 0.45), P(0, bh * 0.5)];
  } else if (s.beak === "heavy") {
    upperPts = [P(-bl * 0.12, -bh * 0.75), P(bl * 0.5, -bh * 0.5), P(bl, bh * 0.05), P(0, bh * 0.08)];
    lowerPts = [P(0, bh * 0.05), P(bl * 0.9, bh * 0.1), P(0, bh * 0.6)];
  } else {
    upperPts = [P(-bl * 0.1, -bh * 0.6), P(bl * 0.45, -bh * 0.3), P(bl, bh * 0.02), P(0, bh * 0.06)];
    lowerPts = [P(0, bh * 0.04), P(bl * 0.88, bh * 0.08), P(0, bh * 0.5)];
  }
  const tip = up(upperPts[s.beak === "bill" ? 3 : 2]);
  if (open > 0.05) {
    // mouth interior between the mandibles
    const inside = [up(P(0, 0)), up(P(bl * 0.8, bh * 0.05)), lo(P(bl * 0.75, bh * 0.1)), lo(P(0, bh * 0.2))];
    sk.shape(polyPath(inside, true), INK, { outline: false, edge: false });
  }
  sk.shape(blobD(lowerPts.map(lo), 0.15), beakFill, { edge: pen.dw });
  sk.shape(blobD(upperPts.map(up), 0.15), beakFill, { edge: pen.dw });
  if (s.beak === "bill") sk.fill(circleD(up(P(bl * 0.3, -bh * 0.2)), bh * 0.08));
  // gape line (smile / frown) behind the beak
  const gc = x.curve * (open > 0.3 ? 0.4 : 1);
  if (Math.abs(gc) > 0.05) {
    const g0 = hpt(hr * 0.78, hr * 0.12);
    const g1 = hpt(hr * (0.52 - 0.05 * Math.abs(gc)), hr * (0.12 - gc * 0.28));
    sk.line(quadD(g0, hpt(hr * 0.62, hr * (0.2 - gc * 0.02)), g1), pen.dw * 1.1, { halo: dark });
  }
  const mouth = up(P(bl * 0.6, bh * 0.1));
  if (pose === "hold") hand = tip;

  // cheek patch for sparrows / eye ring for nightingale & dove
  if (s.marks === "sparrow") {
    sk.shape(blobD([hpt(-hr * 0.35, hr * 0.1), hpt(hr * 0.1, hr * 0.05), hpt(hr * 0.2, hr * 0.5), hpt(-hr * 0.35, hr * 0.55)], 0.5), fillOf("white", pen), { edge: pen.fw });
  }

  if (s.marks === "crow") {
    // glossy highlight streaks
    sk.line(curveD([bpt(0.3 * a, -0.7 * b), bpt(-0.2 * a, -0.8 * b), bpt(-0.6 * a, -0.55 * b)]), pen.dw, { color: PAPER });
    sk.line(curveD([hpt(-hr * 0.5, -hr * 0.55), hpt(0, -hr * 0.8)]), pen.dw, { color: PAPER });
  }

  // face (single eye in profile)
  // three-quarter head: both eyes visible so brows can read at small size
  if (view === "side") {
    faceSvg += drawFace(
      { c: hpt(hr * 0.16, -hr * 0.14), gap: hr * 0.34, eyeR: eyeR * 0.92, turn: 0.55, pen, headR: hr, brows: true, dark, style: "round", rot: headDir * 0.4 },
      expression,
    );
  } else if (view === "front") {
    faceSvg += drawFace({ c: hpt(hr * 0.02, -hr * 0.2), gap: hr * 0.4, eyeR: eyeR * 0.95, turn: 0.2, pen, headR: hr, brows: true, dark, style: "round", rot: headDir * 0.25 }, expression);
  }

  // near wing spread (on top, own outline)
  if (bp.near.mode === "spread") {
    sk.raw(faceSvg);
    faceSvg = "";
    sk.layer();
    hand = hand ?? drawSpread(bp.near, true);
  }
  sk.raw(faceSvg);
  void rand;
  return finish(sk, H0, hr, mouth, hand, bpt, a, b, pose);
}

function finish(
  sk: Sketch,
  H0: Point,
  hr: number,
  mouth: Point,
  hand: Point | undefined,
  bpt: (x: number, y: number) => Point,
  a: number,
  b: number,
  pose: Pose,
): Built {
  const belly = bpt(0, b * 0.6);
  const neck = bpt(0.55 * a, -0.3 * b);
  void pose;
  return { sk, head: H0, headR: hr, mouth, hand, waist: belly.y, shoulders: Math.min(neck.y, H0.y + hr * 0.9) };
}

function beak(kind: BeakKind, hr: number): number {
  switch (kind) {
    case "cone":
      return hr * 0.62;
    case "heavy":
      return hr * 0.62;
    case "bill":
      return hr * 0.55;
    case "dove":
      return hr * 0.34;
    case "hook":
      return hr * 0.4;
    default:
      return hr * 0.34;
  }
}

function n2(v: number): string {
  return String(Math.round(v * 100) / 100);
}

// ---------------------------------------------------------------------------
// Front and back views

function drawFrontBack(sp: Species, s: Spec, look: BirdLook, pose: Pose, expression: Expression, pen: Pen, back: boolean): Built {
  const bp = poseFor(s, pose, sp);
  const sk = new Sketch(pen);
  const plum = fillOf(look.tone, pen);
  const dark = isDark(look.tone);
  const bellyFill = fillOf(s.belly === "white" ? "white" : s.belly === "light" ? lighter(look.tone) : look.tone, pen);
  const flying = bp.near.mode === "spread" && (pose === "fly" || pose === "fall" || pose === "jump");
  const bw = s.b * 1.2 * bp.fluff; // half width
  const bhh = sp === "duck" ? s.b * 1.3 : s.a * (sp === "owl" ? 1.0 : 0.85) * bp.fluff; // half height
  const legLen = s.legL;
  const lift = bp.ground ? 0 : bp.lift;
  const cy = bp.ground ? -bhh : -legLen - bhh * 0.9 - lift;
  const B0 = P(0, cy);
  const hr = s.hr * (sp === "owl" ? 1 : 0.95);
  const H0 = sp === "owl" ? P(0, cy - bhh * 0.72) : sp === "duck" ? P(0, cy - bhh - hr * 0.75) : P(0, cy - bhh * 0.95 - hr * 0.35);
  // wings
  const wingPts = (side: number) => {
    if (flying) {
      const L = s.wingL;
      const xf = affine({ x: side * bw * 0.6, y: cy - bhh * 0.3, rot: side > 0 ? -25 * DEG : Math.PI + 25 * DEG, sy: side > 0 ? 1 : -1 });
      return wingOutline(s.pointed, L, 1).map((p) => xf(P(p.x, p.y)));
    }
    const raise = pose === "wave" && side > 0 ? -1 : pose === "talk" && side > 0 ? -0.55 : pose === "point" && side > 0 ? -0.35 : 0;
    const sh = P(side * bw * 0.62, cy - bhh * 0.55);
    const rot = raise * 70 * DEG * side;
    const pts = [
      sh,
      P(side * bw * 1.12, cy - bhh * 0.15),
      P(side * bw * 1.08, cy + bhh * 0.55),
      P(side * bw * 0.72, cy + bhh * (s.pointed ? 1.25 : 1.02)),
      P(side * bw * 0.62, cy + bhh * 0.3),
    ].map((p) => rotP(p, rot, sh));    return pts;
  };
  // tail
  const tailDrop = Math.min(s.tailL * (s.tail === "fork" ? 0.8 : 0.45), Math.max(0, -(cy + bhh) - s.h * 0.03));
  const tailPtsFB = sp === "duck" || sp === "owl" || tailDrop < s.h * 0.04 ? [] : s.tail === "fork"
    ? [P(-s.tailW * 0.4, cy + bhh * 0.5), P(-s.tailW * 0.9, cy + bhh + tailDrop), P(0, cy + bhh + tailDrop * 0.25), P(s.tailW * 0.9, cy + bhh + tailDrop), P(s.tailW * 0.4, cy + bhh * 0.5)]
    : [P(-s.tailW * 0.45, cy + bhh * 0.5), P(-s.tailW * 0.55, cy + bhh + tailDrop), P(s.tailW * 0.55, cy + bhh + tailDrop), P(s.tailW * 0.45, cy + bhh * 0.5)];
  if (tailPtsFB.length) sk.shape(s.tail === "fork" ? polyPath(tailPtsFB, true) : blobD(tailPtsFB, 0.3), plum);
  // legs
  if (!bp.ground && bp.legs !== "tuck") {
    const legW = Math.max(pen.dw * 1.25, s.h * 0.022);
    for (const side of [-1, 1]) {
      const hip = P(side * bw * 0.35, cy + bhh * 0.7);
      const foot = P(side * bw * 0.4, bp.lift > 0 ? hip.y + legLen * 0.8 : 0);
      sk.line(lineD([hip, P(foot.x, foot.y - hr * 0.12)]), legW * (sp === "duck" ? 1.6 : 1));
      const ft = P(foot.x, foot.y - hr * 0.12);
      for (const d of [-0.5, 0, 0.5]) sk.line(lineD([ft, P(ft.x + d * hr * 0.4, ft.y + hr * 0.12)]), legW * 0.8);
    }
  }
  if (flying) {
    for (const side of [-1, 1]) sk.shape(blobD(wingPts(side), 0.35), plum);
  }
  // body
  const bodyD = blobD([P(0, cy - bhh), P(bw * 0.8, cy - bhh * 0.5), P(bw * 1.02, cy + bhh * 0.25), P(bw * 0.62, cy + bhh * 0.88), P(0, cy + bhh), P(-bw * 0.62, cy + bhh * 0.88), P(-bw * 1.02, cy + bhh * 0.25), P(-bw * 0.8, cy - bhh * 0.5)], 0.55);
  sk.shape(bodyD, plum, { edge: false });
  if (sp === "duck") sk.shape(blobD([P(-hr * 0.6, H0.y), P(hr * 0.6, H0.y), P(bw * 0.4, cy - bhh * 0.6), P(-bw * 0.4, cy - bhh * 0.6)], 0.4), plum, { edge: false });
  sk.shape(circleD(H0, hr), plum, { edge: false });
  if (!back) {
    sk.shape(blobD([P(0, cy - bhh * 0.55), P(bw * 0.62, cy), P(bw * 0.5, cy + bhh * 0.8), P(0, cy + bhh * 0.95), P(-bw * 0.5, cy + bhh * 0.8), P(-bw * 0.62, cy)], 0.55), bellyFill, { edge: false });
  }
  if (!flying) {
    for (const side of [-1, 1]) {
      sk.shape(blobD(wingPts(side), 0.45), plum);
      if (back) sk.line(lineD([P(side * bw * 0.8, cy + bhh * 0.2), P(side * bw * 0.35, cy + bhh * 0.95)]), pen.fw, { halo: dark });
    }
  }
  if (sp === "owl") {
    for (const side of [-1, 1]) sk.shape(polyPath([P(side * hr * 0.4, H0.y - hr * 0.8), P(side * hr * 1.0, H0.y - hr * 1.35), P(side * hr * 0.95, H0.y - hr * 0.35)], true), plum);
    sk.shape(circleD(H0, hr), plum, { edge: false });
    if (!back) {
      for (const side of [-1, 1]) sk.shape(circleD(P(side * hr * 0.45, H0.y + hr * 0.02), hr * 0.52), fillOf(lighter(look.tone), pen), { edge: pen.dw });
    }
  }
  if (sp === "duck" && !back) {
    sk.shape(circleD(H0, hr * 0.98), fillOf(darker(look.tone), pen), { edge: false, outline: false });
  }
  let mouth = P(0, H0.y + hr * 0.4);
  let hand: Point | undefined;
  if (!back) {
    const eyeR = s.eyeR * hr * (sp === "owl" ? 0.95 : 0.9);
    sk.raw(drawFace({ c: P(0, H0.y - hr * 0.1), gap: hr * (sp === "owl" ? 0.45 : 0.42), eyeR, turn: 0, pen, headR: hr, dark, brows: true }, expression));
    const open = pose === "hold" ? 0.3 : mouthOpen(expression, pose === "talk");
    const bw2 = sp === "duck" ? hr * 0.55 : sp === "crow" ? hr * 0.28 : hr * 0.2;
    const bl = sp === "duck" ? hr * 0.5 : sp === "crow" ? hr * 0.55 : hr * 0.4;
    const by = H0.y + hr * (sp === "owl" ? 0.1 : 0.2);
    const beakFill = sp === "duck" ? fillOf("light", pen) : sp === "owl" ? fillOf("light", pen) : INK;
    if (open > 0.05) sk.shape(blobD([P(-bw2 * 0.8, by + bl * 0.3), P(bw2 * 0.8, by + bl * 0.3), P(0, by + bl * (0.6 + open))], 0.3), INK);
    sk.shape(blobD([P(-bw2, by), P(bw2, by), P(0, by + bl * (sp === "duck" ? 0.7 : 1))], sp === "duck" ? 0.6 : 0.2), beakFill);
    mouth = P(0, by + bl * 0.7);
    if (pose === "hold") hand = P(0, by + bl);
  } else {
    sk.line(curveD([P(-hr * 0.6, H0.y + hr * 0.5), P(0, H0.y + hr * 0.75), P(hr * 0.6, H0.y + hr * 0.5)]), pen.fw, { halo: dark });
  }
  if (flying) hand = P(s.wingL * 0.9, cy - s.wingL * 0.35);
  return { sk, head: H0, headR: hr, mouth, hand, waist: cy + bhh * 0.3, shoulders: H0.y + hr * 0.9 };
}

// ---------------------------------------------------------------------------

export const birdRig: KindRig<BirdLook> = {
  supportedPoses: () => BIRD_POSES,
  supportedExpressions: () => ALL_EXPRESSIONS,
  nominalHeight: (look) => SPECS[look.species].h,
  draw(request: FigureRequest & { look: BirdLook }, ctx: DrawContext): FigureDrawing {
    const look = request.look;
    const s = SPECS[look.species];
    if (!s) throw new Error(`unknown bird species ${String(look.species)}`);
    const pose: Pose = BIRD_POSES.includes(request.pose) ? request.pose : "stand";
    const pen = makePen(request.lineWidth, ctx.idPrefix, request);
    // Front and back views are the profile turned toward / away from the
    // viewer (same markings and proportions); only a frontal flight (wings
    // spread symmetrically) keeps its own drawing. A lying bird is always
    // drawn in profile.
    const turned = request.facing === "front" || request.facing === "back";
    const airborne = pose === "fly" || pose === "fall" || pose === "jump";
    const built =
      turned && airborne
        ? drawFrontBack(look.species, s, look, pose, request.expression, pen, request.facing === "back")
        : drawProfile(look.species, s, look, pose, request.expression, pen, request.seed, turned && pose !== "lie" ? (request.facing === "back" ? "back" : "front") : "side");
    const anchors = anchorsFrom(built.sk, {
      head: built.head,
      headRadius: built.headR,
      mouth: built.mouth,
      hand: built.hand,
      waist: built.waist,
      shoulders: built.shoulders,
    });
    return finishFigure(built.sk, anchors);
  },
};

export { SPECS as BIRD_SPECS };
