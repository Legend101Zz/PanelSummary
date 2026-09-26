/**
 * Non-mammal animals: frog, lizard, fish. Each has its own silhouette but
 * the same three-quarter face as the mammals so every expression reads.
 */
import type { Expression, Point, Pose, Tone } from "../../contracts.js";
import {
  DEG,
  INK,
  P,
  PAPER,
  type Pen,
  Sketch,
  addP,
  blobD,
  circleD,
  curveD,
  darker,
  ellipseD,
  fillOf,
  isDark,
  lerpP,
  lighter,
  lineD,
  polar,
  rotP,
  taperD,
} from "./common.js";
import { EXPR, drawFace, mouthOpen } from "./face.js";
import { polyPath } from "../../svg.js";
import type { AnimalBuilt } from "./quad.js";

export const FROG_POSES: readonly Pose[] = ["stand", "sit", "jump", "talk", "wave", "point", "lie", "cower", "fall", "hold"];
export const LIZARD_POSES: readonly Pose[] = ["stand", "walk", "run", "talk", "lie", "cower", "hold"];
export const FISH_POSES: readonly Pose[] = ["stand", "talk", "jump", "lie", "fall", "cower", "hold"];

// ---------------------------------------------------------------------------
// Frog (~12 tall sitting)

export function drawFrog(tone: Tone, pose: Pose, expression: Expression, facing: "right" | "front" | "back", pen: Pen): AnimalBuilt {
  // A squat front / three-quarter frog: frogs read best face-on.
  const sk = new Sketch(pen);
  const skin = fillOf(tone, pen);
  const far = fillOf(darker(tone), pen);
  const belly = fillOf(lighter(tone), pen);
  const dark = isDark(tone);
  const talking = pose === "talk";
  const back = facing === "back";
  const turn = facing === "right" ? 0.4 : 0;
  const jump = pose === "jump";
  const lie = pose === "lie";
  const cower = pose === "cower";
  const fall = pose === "fall";
  const sq = lie ? 0.7 : cower ? 0.82 : jump ? 1.15 : 1;
  const bw = 6.2 * (lie ? 1.15 : 1);
  const bh = 5.0 * sq;
  const lift = jump ? 7 : 0;
  const C = P(turn * 0.8, -bh - 1.4 - lift);
  const sh = turn * 1.4; // three-quarter shift of the features
  const flipY = fall ? -1 : 1;
  const Y = (y: number) => C.y + y * flipY;
  let hand: Point | undefined;
  const toes = (foot: Point, ang: number, f: string, size = 1) => {
    sk.shape(blobD([polar(foot, 1.2 * size, ang - 0.7), polar(foot, 1.7 * size, ang - 0.25), polar(foot, 1.8 * size, ang + 0.2), polar(foot, 1.3 * size, ang + 0.7), polar(foot, 0.3 * size, ang + Math.PI)], 0.3), f);
  };
  // hind legs
  for (const side of [-1, 1]) {
    const f = side < 0 && turn > 0 ? far : skin;
    const k = side < 0 ? 1 - turn * 0.35 : 1 + turn * 0.15;
    if (jump) {
      const hip = P(C.x + side * bw * 0.45, C.y + bh * 0.6);
      const knee = P(C.x + side * bw * 0.95, C.y + bh * 1.2);
      const foot = P(C.x + side * bw * 0.55, -0.9);
      sk.shape(taperD([hip, knee, foot], [3.2, 2.0, 1.3], { samples: 4 }), f, { edge: false });
      toes(foot, Math.PI / 2 + side * 0.5, f);
      continue;
    }
    const tc = P(C.x + side * bw * 0.95 * k, fall ? Y(-bh * 0.2) : -2.5 * sq);
    sk.shape(ellipseD(tc, 2.9 * k, 2.4 * sq), f);
    if (!fall) toes(P(tc.x + side * 2.0 * k, -1.0), side > 0 ? -0.1 : Math.PI + 0.1, f);
    else toes(P(tc.x + side * 1.5, tc.y - 3.2), -Math.PI / 2 + side * 0.4, f);
  }
  // body
  const body = [P(C.x, Y(-bh)), P(C.x + bw, Y(-bh * 0.1)), P(C.x + bw * 0.85, Y(bh * 0.8)), P(C.x, Y(bh * 1.05)), P(C.x - bw * 0.85, Y(bh * 0.8)), P(C.x - bw, Y(-bh * 0.1))];
  sk.shape(blobD(body, 0.5), skin, { edge: false });
  const eyeY = Y(-bh * 0.95);
  const br = 2.3;
  const bulges = [P(C.x - bw * 0.45 * (1 - turn * 0.4) + sh, eyeY), P(C.x + bw * 0.45 * (1 + turn * 0.1) + sh, eyeY)];
  bulges.forEach((b, i) => sk.shape(circleD(b, br * (i === 0 ? 1 - turn * 0.25 : 1)), skin, { edge: false }));
  if (!back && !fall) sk.shape(blobD([P(C.x + sh, Y(bh * 0.1)), P(C.x + sh + bw * 0.6, Y(bh * 0.45)), P(C.x + sh, Y(bh * 1.0)), P(C.x + sh - bw * 0.55, Y(bh * 0.45))], 0.5), belly, { edge: false });
  if (back) {
    for (const [x, y, r] of [[-0.3, -0.2, 0.9], [0.35, 0.1, 0.7], [0, 0.45, 0.55]] as const) sk.fill(circleD(P(C.x + x * bw, C.y + y * bh), r), fillOf(dark ? "mid" : "dark", pen));
  } else {
    sk.fill(circleD(P(C.x - bw * 0.7 + sh * 0.3, C.y + bh * 0.05), 0.6), fillOf(dark ? "mid" : "dark", pen));
  }
  const mouthDy = bh * 0.72 * flipY;
  if (!back) {
    sk.raw(drawFace({ c: P(C.x + sh, eyeY), gap: bw * 0.45, eyeR: br * 0.62, turn, pen, headR: bw * 0.6, dark, mouth: { dy: mouthDy, w: bw * 0.6 }, talking: talking || mouthOpen(expression, false) > 0.5, rot: fall ? Math.PI : 0 }, expression));
  }
  const mouth = P(C.x + sh * 1.3, eyeY + mouthDy);
  // arms
  sk.layer();
  const gesture = pose === "talk" || pose === "wave" || pose === "point" || pose === "hold";
  for (const side of [-1, 1]) {
    const shd = P(C.x + side * bw * 0.55 + sh * 0.5, Y(bh * 0.25));
    let hnd: Point;
    if (jump) hnd = P(shd.x + side * 2.5, shd.y - 6.5);
    else if (cower) hnd = P(C.x + side * bw * 0.35 + sh, eyeY - br * 0.2);
    else if (fall) hnd = P(shd.x + side * 3, shd.y - 3);
    else if (lie) hnd = P(shd.x + side * 3.2, -1.1);
    else if (gesture && side === 1) hnd = pose === "wave" ? P(shd.x + 3, shd.y - 6.5) : pose === "point" ? P(shd.x + 6.5, shd.y - 1.2) : pose === "hold" ? P(shd.x + 4.2, shd.y + 0.5) : P(shd.x + 4.2, shd.y - 3.5);
    else hnd = P(shd.x + side * 0.6, -1.1);
    const f = side < 0 && turn > 0 ? far : skin;
    sk.shape(taperD([shd, lerpP(shd, hnd, 0.5), hnd], [1.6, 1.2, 1.0], { samples: 3 }), f, { edge: false });
    const up = hnd.y < shd.y - 1;
    const onGround = hnd.y > -1.5;
    toes(onGround ? P(hnd.x, -1.0) : hnd, up ? -Math.PI / 2 + side * 0.4 : onGround ? (side > 0 ? -0.2 : Math.PI + 0.2) : Math.PI / 2, f, 0.85);
    if (side === 1) hand = hnd;
  }
  const head = P(C.x + sh, eyeY + bh * 0.3 * flipY);
  return { sk, head, headR: bw * 0.62, mouth, hand, waist: C.y + bh * 0.4, shoulders: C.y };
}

function dist2(p: Point[]): number {
  return Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
}

// ---------------------------------------------------------------------------
// Lizard (~10 tall with raised head, long tail)

export function drawLizard(tone: Tone, pose: Pose, expression: Expression, facing: "right" | "front" | "back", pen: Pen): AnimalBuilt {
  const sk = new Sketch(pen);
  const skin = fillOf(tone, pen);
  const far = fillOf(darker(tone), pen);
  const dark = isDark(tone);
  const front = facing !== "right";
  const back = facing === "back";
  const talk = pose === "talk";
  const up = talk || pose === "hold" ? 1 : 0; // front raised on straight arms
  const low = pose === "lie" || pose === "cower";
  const run = pose === "run" || pose === "walk";
  const bodyH = low ? 2.2 : 3.4;
  const S = P(5, -bodyH - 1.2 - up * 3); // shoulders
  const J = P(-6, -bodyH - 0.6);
  const hr = 3.2;
  let hand: Point | undefined;
  if (front) {
    // front view: head over splayed arms, tail curling behind
    const C = P(0, -4.5);
    sk.shape(taperD([P(0, -2), P(6, -3), P(9, -7), P(7, -10)], [2.4, 2, 1.2, 0.3], { samples: 5 }), far);
    for (const side of [-1, 1]) {
      const sh = P(side * 2.5, C.y + 0.5);
      const el = P(side * 5.5, C.y - 0.5);
      const f = P(side * 6, -0.3);
      sk.shape(taperD([sh, el, f], [1.8, 1.3, 1.1], { samples: 3 }), skin, { edge: false });
      for (const d of [-0.5, 0, 0.5]) sk.line(lineD([f, polar(f, 1.4, (side > 0 ? 0 : Math.PI) + d * side)]), pen.dw * 1.2);
    }
    sk.shape(ellipseD(P(0, C.y + 0.8), 3.2, 3.4), skin, { edge: false });
    const H = P(0, C.y - 3.2);
    sk.shape(blobD([P(-hr, H.y), P(0, H.y - hr * 0.95), P(hr, H.y), P(hr * 0.6, H.y + hr * 0.9), P(-hr * 0.6, H.y + hr * 0.9)], 0.55), skin, { edge: false });
    if (!back) sk.raw(drawFace({ c: P(0, H.y - hr * 0.25), gap: hr * 0.55, eyeR: hr * 0.3, turn: 0, pen, headR: hr, dark, mouth: { dy: hr * 0.85, w: hr * 0.55 }, talking: talk }, expression));
    return { sk, head: H, headR: hr, mouth: P(0, H.y + hr * 0.6), hand: P(6, -0.3), waist: C.y, shoulders: C.y - 1 };
  }
  // tail: long, tapering, curving along the ground
  const tailPts = [J, P(J.x - 5, J.y + 1.8), P(J.x - 11, -1.2), P(J.x - 17, -1.6), P(J.x - 20, -3.4)];
  sk.shape(taperD(tailPts, [bodyH * 1.1, bodyH * 0.75, 1.3, 0.7, 0.2], { samples: 6 }), skin, { edge: false });
  // far legs
  const leg = (hip: Point, foot: Point, fill: string, knee: Point) => {
    sk.shape(taperD([hip, knee, foot], [1.7, 1.3, 1.0], { samples: 3 }), fill, { edge: false });
    for (const d of [-0.6, -0.1, 0.4]) sk.line(lineD([foot, polar(foot, 1.3, d)]), pen.dw * 1.3);
  };
  const stride = run ? 2.6 : 0;
  leg(addP(S, P(-0.8, 0.5)), P(S.x + 1.8 - stride, -0.3), far, P(S.x + 0.4 - stride * 0.5, S.y - 0.2 - (up ? 0 : 1)));
  leg(addP(J, P(0.8, 0.5)), P(J.x + 2 + stride, -0.3), far, P(J.x + 2.4, J.y - 1.2));
  // body
  const bodyPts = [addP(S, P(2.5, -0.2)), addP(S, P(0, -bodyH * 0.5)), lerpP(addP(S, P(0, -bodyH * 0.5)), addP(J, P(0, -bodyH * 0.5)), 0.5), addP(J, P(-1, -bodyH * 0.45)), addP(J, P(-1.5, bodyH * 0.35)), addP(J, P(2, bodyH * 0.5)), addP(S, P(0, bodyH * 0.5))];
  sk.shape(blobD(bodyPts, 0.5), skin, { edge: false });
  sk.shape(blobD([addP(S, P(1.5, bodyH * 0.2)), addP(S, P(-1, bodyH * 0.45)), addP(J, P(2, bodyH * 0.35)), addP(J, P(3, bodyH * 0.05)), addP(S, P(-2, bodyH * 0.05))], 0.5), fillOf(lighter(tone), pen), { edge: false });
  // back ridge spots
  for (let i = 0; i < 4; i += 1) {
    const p = lerpP(addP(S, P(-1, -bodyH * 0.35)), addP(J, P(0, -bodyH * 0.3)), i / 3.5);
    sk.fill(circleD(p, 0.45), fillOf(dark ? "light" : "dark", pen));
  }
  // head: flat wedge on a short neck
  const hAng = (up ? -18 : low ? 4 : -8) * DEG;
  const H = addP(S, rotP(P(4.2, -1.4), hAng));
  const hp = (x: number, y: number) => addP(H, rotP(P(x, y), hAng));
  const open = mouthOpen(expression, talk);
  const x = EXPR[expression];
  if (open > 0.05) sk.shape(polyPath([hp(0, hr * 0.25), hp(hr * 1.6, hr * 0.2), hp(hr * 1.2, hr * (0.4 + open * 0.6)), hp(0, hr * 0.6)], true), INK, { outline: false });
  sk.shape(blobD([hp(-hr * 1.2, -hr * 0.3), hp(-hr * 0.2, -hr * 0.85), hp(hr * 1.0, -hr * 0.55), hp(hr * 1.75, hr * 0.05), hp(hr * 1.2, hr * 0.35), hp(-hr * 0.3, hr * 0.62), hp(-hr * 1.2, hr * 0.5)], 0.45), skin, { edge: false });
  sk.line(curveD([hp(hr * 1.7, hr * 0.12), hp(hr * 0.8, hr * 0.28), hp(hr * 0.2, hr * (0.3 - x.curve * 0.18))]), pen.dw * 1.2, { halo: dark });
  sk.fill(circleD(hp(hr * 1.45, -hr * 0.12), hr * 0.08));
  sk.raw(drawFace({ c: hp(hr * 0.1, -hr * 0.45), gap: hr * 0.36, eyeR: hr * 0.3, turn: 0.55, pen, headR: hr, dark, rot: hAng }, expression));
  // near legs
  sk.layer();
  leg(addP(J, P(0.4, 0.4)), P(J.x - 1 - stride, -0.3), skin, P(J.x - 2.6, J.y - 1.4));
  const nf = up ? P(S.x + 2, -0.3) : P(S.x + 3.2 + stride, -0.3);
  leg(addP(S, P(0.2, 0.6)), nf, skin, up ? P(S.x + 1.6, S.y + 2.5) : P(S.x + 2.4, S.y - 1));
  hand = pose === "hold" ? hp(hr * 1.6, hr * 0.2) : nf;
  return { sk, head: H, headR: hr, mouth: hp(hr * 1.5, hr * 0.2), hand, waist: J.y, shoulders: S.y - bodyH * 0.5 };
}

// ---------------------------------------------------------------------------
// Fish (~20 long, swims above the ground line)

export function drawFish(tone: Tone, pose: Pose, expression: Expression, facing: "right" | "front" | "back", pen: Pen): AnimalBuilt {
  const sk = new Sketch(pen);
  const scale = fillOf(tone, pen);
  const fin = fillOf(darker(tone), pen);
  const dark = isDark(tone);
  const talk = pose === "talk";
  const L = 10; // half length
  const Hh = 5.6; // half height
  const front = facing !== "right";
  const back = facing === "back";
  const open = mouthOpen(expression, talk);
  if (front) {
    const C = P(0, -Hh - 6);
    sk.shape(polyPath([P(-1.2, C.y + Hh * 0.2), P(-5, C.y + Hh * 1.2), P(5, C.y + Hh * 1.2), P(1.2, C.y + Hh * 0.2)], true), fin);
    sk.shape(polyPath([P(0, C.y - Hh * 0.8), P(-1.2, C.y - Hh * 1.6), P(1.2, C.y - Hh * 1.6)], true), fin);
    for (const side of [-1, 1]) sk.shape(blobD([P(side * 3.2, C.y + 1.5), P(side * 7.5, C.y + 2.5), P(side * 6.5, C.y + 4.5)], 0.4), fin);
    sk.shape(ellipseD(C, 4.6, Hh), scale, { edge: false });
    if (!back) {
      sk.raw(drawFace({ c: P(0, C.y - 1.2), gap: 2.1, eyeR: 1.3, turn: 0, pen, headR: 4.6, dark, mouth: { dy: 3.4, w: 1.6 }, talking: talk }, expression));
    }
    return { sk, head: C, headR: Hh, mouth: P(0, C.y + 2.4), hand: P(7, C.y + 3), waist: C.y + Hh, shoulders: C.y };
  }
  // side view along a (possibly bent) axis
  const jump = pose === "jump";
  const lie = pose === "lie";
  const fall = pose === "fall";
  const cower = pose === "cower";
  const ang = jump ? -35 * DEG : fall ? 70 * DEG : 0;
  const bend = jump ? 0.25 : cower ? 0.45 : lie ? -0.1 : talk ? 0.08 : 0;
  const C = lie ? P(0, -Hh * 0.8) : jump ? P(0, -Hh - 14) : fall ? P(0, -L - 4) : P(0, -Hh - 6);
  const tf = (x: number, y: number) => {
    // bend: tail curls up by `bend` (radians per half length)
    const t = x < 0 ? x / L : 0;
    const bx = x;
    const by = y + (t * t * bend * L * 1.1 * (cower ? -1 : 1));
    const pp = lie ? rotP(P(bx, by), 0) : P(bx, by);
    return addP(C, rotP(pp, ang + (lie ? 0 : 0)));
  };
  // tail fin
  const tailRoot = tf(-L * 0.95, 0);
  const tailUp = tf(-L * 1.55, -Hh * 0.95);
  const tailNotch = tf(-L * 1.25, 0);
  const tailDown = tf(-L * 1.55, Hh * 0.95);
  sk.shape(blobD([tf(-L * 0.8, -Hh * 0.25), tailUp, tailNotch, tailDown, tf(-L * 0.8, Hh * 0.25)], 0.25), fin);
  // dorsal + belly fins
  sk.shape(blobD([tf(L * 0.2, -Hh * 0.8), tf(-L * 0.05, -Hh * 1.55), tf(-L * 0.55, -Hh * 1.15), tf(-L * 0.5, -Hh * 0.6)], 0.35), fin);
  sk.shape(blobD([tf(-L * 0.1, Hh * 0.8), tf(-L * 0.35, Hh * 1.3), tf(-L * 0.55, Hh * 0.6)], 0.35), fin);
  // body
  const body = [tf(L, 0.4), tf(L * 0.72, -Hh * 0.82), tf(L * 0.1, -Hh), tf(-L * 0.6, -Hh * 0.6), tf(-L * 0.98, -Hh * 0.18), tf(-L * 0.98, Hh * 0.18), tf(-L * 0.6, Hh * 0.6), tf(L * 0.1, Hh * 0.98), tf(L * 0.75, Hh * 0.7)];
  sk.shape(blobD(body, 0.5), scale, { edge: false });
  sk.shape(blobD([tf(L * 0.85, Hh * 0.2), tf(L * 0.1, Hh * 0.9), tf(-L * 0.6, Hh * 0.52), tf(-L * 0.3, Hh * 0.2), tf(L * 0.3, Hh * 0.3)], 0.5), fillOf(lighter(tone), pen), { edge: false });
  // scales: a few arcs
  for (let i = 0; i < 3; i += 1) {
    for (let j = -1; j <= 1; j += 1) {
      const c = tf(-L * 0.1 - i * L * 0.22, j * Hh * 0.35 - Hh * 0.05);
      const a = tf(-L * 0.1 - i * L * 0.22 - 1.2, j * Hh * 0.35 - Hh * 0.05 - 1.2);
      const b = tf(-L * 0.1 - i * L * 0.22 - 1.2, j * Hh * 0.35 - Hh * 0.05 + 1.2);
      sk.line(curveD([a, c, b]), pen.fw, { halo: dark });
    }
  }
  // gill
  sk.line(curveD([tf(L * 0.35, -Hh * 0.6), tf(L * 0.2, 0), tf(L * 0.35, Hh * 0.55)]), pen.dw, { halo: dark });
  // mouth (lips)
  const x = EXPR[expression];
  const m = tf(L * 1.0, Hh * 0.08);
  if (open > 0.05) sk.shape(ellipseD(tf(L * 0.95, Hh * 0.12), 1.0 + open * 0.4, 0.6 + open * 1.1), INK, { outline: false, edge: pen.dw });
  else sk.line(curveD([tf(L * 1.02, Hh * 0.05), tf(L * 0.85, Hh * 0.12), tf(L * 0.72, Hh * (0.1 - x.curve * 0.12))]), pen.dw * 1.3, { halo: dark });
  sk.raw(drawFace({ c: tf(L * 0.55, -Hh * 0.28), gap: Hh * 0.3, eyeR: Hh * 0.25, turn: 0.55, pen, headR: Hh, dark, rot: ang }, expression));
  // pectoral fin (near) as the "hand"
  sk.layer();
  const finBase = tf(L * 0.25, Hh * 0.3);
  const finAng = talk ? -70 * DEG : pose === "hold" ? -10 * DEG : 150 * DEG;
  const finTip = polar(finBase, Hh * 0.9, finAng + ang);
  sk.shape(blobD([finBase, polar(finBase, Hh * 0.6, finAng + ang - 0.4), finTip, polar(finBase, Hh * 0.55, finAng + ang + 0.45)], 0.4), fin);
  void PAPER;
  return { sk, head: tf(L * 0.55, 0), headR: Hh, mouth: m, hand: pose === "hold" ? m : finTip, waist: C.y + Hh * 0.5, shoulders: C.y - Hh * 0.5 };
}
