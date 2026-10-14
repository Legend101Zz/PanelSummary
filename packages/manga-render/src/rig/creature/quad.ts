/**
 * Quadruped mammals (rat, mouse, cat, dog, fox, rabbit, horse, bear).
 *
 * A spine (shoulder joint S → hip joint J) carries a body outline, a neck
 * blob and a three-quarter head (skull + muzzle + ears) so both eyes and
 * brows read. Legs are tapered chains solved from foot targets; far legs
 * take a darker tone. Poses move S/J and the feet; talking mammals sit up
 * on their haunches and gesture with the near fore-paw.
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
  charRand,
  circleD,
  curveD,
  darker,
  dist,
  fillOf,
  isDark,
  lerpP,
  lighter,
  lineD,
  polar,
  puffD,
  quadD,
  rotP,
  taperD,
  ellipseD,
  ellipsePts,
} from "./common.js";
import { EXPR, drawFace, mouthOpen } from "./face.js";
import { polyPath } from "../../svg.js";
import { type Marks, NO_MARKS, anyMark, hangingTube, hornFill } from "./marks.js";

export type QuadSpecies = "rat" | "mouse" | "cat" | "dog" | "fox" | "rabbit" | "horse" | "bear" | "quad_small" | "quad_medium" | "quad_large";

interface QuadSpec {
  h: number;
  legF: number; // shoulder joint height when standing
  legH: number; // hip joint height when standing
  bodyL: number;
  chest: number;
  hip: number;
  legW: number;
  paw: number;
  R: number;
  muz: { l: number; h: number; drop: number; round: number };
  neck: { l: number; ang: number; w: number };
  ears: { kind: "round" | "tri" | "flop" | "long" | "horse" | "bear" | "small"; size: number };
  tail: { kind: "rat" | "cat" | "dog" | "fox" | "puff" | "horse" | "stub"; l: number; w: number };
  eye: number;
  whiskers: boolean;
  mane: boolean;
  hoof: boolean;
  longFoot: boolean;
  fluffy: boolean;
  nose: number;
}

export const QUAD: Record<QuadSpecies, QuadSpec> = {
  rat: { h: 13, legF: 4.2, legH: 5.2, bodyL: 9.5, chest: 3.6, hip: 4.6, legW: 1.5, paw: 0.9, R: 4.3, muz: { l: 3.4, h: 2.3, drop: 0.25, round: 0.3 }, neck: { l: 2.2, ang: 32, w: 3.0 }, ears: { kind: "round", size: 2.1 }, tail: { kind: "rat", l: 17, w: 1.1 }, eye: 0.34, whiskers: true, mane: false, hoof: false, longFoot: true, fluffy: false, nose: 0.55 },
  mouse: { h: 11, legF: 3.2, legH: 4.0, bodyL: 6.5, chest: 3.0, hip: 3.9, legW: 1.2, paw: 0.75, R: 3.9, muz: { l: 2.3, h: 2.1, drop: 0.25, round: 0.45 }, neck: { l: 1.6, ang: 30, w: 2.6 }, ears: { kind: "round", size: 3.0 }, tail: { kind: "rat", l: 12, w: 0.8 }, eye: 0.34, whiskers: true, mane: false, hoof: false, longFoot: true, fluffy: false, nose: 0.5 },
  cat: { h: 30, legF: 13, legH: 14, bodyL: 17, chest: 5.8, hip: 6.2, legW: 3.4, paw: 1.9, R: 7.2, muz: { l: 2.8, h: 4.2, drop: 0.35, round: 0.8 }, neck: { l: 4.5, ang: 50, w: 5.6 }, ears: { kind: "tri", size: 4.8 }, tail: { kind: "cat", l: 19, w: 2.4 }, eye: 0.36, whiskers: true, mane: false, hoof: false, longFoot: false, fluffy: false, nose: 0.55 },
  dog: { h: 40, legF: 19, legH: 19, bodyL: 22, chest: 8.4, hip: 7.2, legW: 4.4, paw: 2.5, R: 8.4, muz: { l: 6.4, h: 5.6, drop: 0.3, round: 0.45 }, neck: { l: 6.5, ang: 52, w: 7.4 }, ears: { kind: "flop", size: 6.5 }, tail: { kind: "dog", l: 13, w: 2.8 }, eye: 0.32, whiskers: false, mane: false, hoof: false, longFoot: false, fluffy: false, nose: 0.75 },
  fox: { h: 40, legF: 18, legH: 18, bodyL: 22, chest: 7.2, hip: 6.8, legW: 3.6, paw: 2.2, R: 7.8, muz: { l: 7.6, h: 4.2, drop: 0.3, round: 0.2 }, neck: { l: 6, ang: 48, w: 6.4 }, ears: { kind: "tri", size: 7.2 }, tail: { kind: "fox", l: 22, w: 8.5 }, eye: 0.3, whiskers: false, mane: false, hoof: false, longFoot: false, fluffy: true, nose: 0.62 },
  rabbit: { h: 22, legF: 5.2, legH: 7, bodyL: 9.5, chest: 5.2, hip: 6.8, legW: 2.3, paw: 1.4, R: 5.2, muz: { l: 1.8, h: 3.4, drop: 0.35, round: 0.9 }, neck: { l: 2.2, ang: 42, w: 4.4 }, ears: { kind: "long", size: 10 }, tail: { kind: "puff", l: 2.8, w: 2.8 }, eye: 0.36, whiskers: true, mane: false, hoof: false, longFoot: true, fluffy: false, nose: 0.4 },
  horse: { h: 160, legF: 78, legH: 82, bodyL: 70, chest: 30, hip: 28, legW: 12.5, paw: 6.4, R: 16, muz: { l: 34, h: 19, drop: 0.45, round: 0.9 }, neck: { l: 40, ang: 62, w: 30 }, ears: { kind: "horse", size: 11 }, tail: { kind: "horse", l: 64, w: 16 }, eye: 0.24, whiskers: false, mane: true, hoof: true, longFoot: false, fluffy: false, nose: 0.3 },
  bear: { h: 120, legF: 50, legH: 52, bodyL: 64, chest: 31, hip: 29, legW: 18, paw: 9.5, R: 26, muz: { l: 12, h: 14, drop: 0.35, round: 0.6 }, neck: { l: 12, ang: 22, w: 26 }, ears: { kind: "bear", size: 7.5 }, tail: { kind: "stub", l: 6, w: 7 }, eye: 0.26, whiskers: false, mane: false, hoof: false, longFoot: true, fluffy: true, nose: 0.65 },
  // v0.3 (#81): neutral body plans. quad_medium = a plain medium four-legged animal (a level body, slim straight legs, an oval head with a modest tapered muzzle, small ears at the back, a short tail); quad_large = a plain heavy herbivore (a long low barrel, short thick pillar legs, a short neck that goes forward, a boxy head held below the back line, small flat ears at the back, a thin hanging tail). Drawn by the `boxy` branches. One flat tone, small plain pointed ears, a long plain muzzle (round ears and a short muzzle read as a bear), a plain tail, no species marks.
  quad_small: { h: 25, legF: 8.2, legH: 9.4, bodyL: 13, chest: 4.6, hip: 5.2, legW: 2.2, paw: 1.5, R: 5.2, muz: { l: 5.0, h: 3.0, drop: 0.3, round: 0.4 }, neck: { l: 2.8, ang: 46, w: 4.2 }, ears: { kind: "tri", size: 4.6 }, tail: { kind: "dog", l: 7, w: 2 }, eye: 0.34, whiskers: false, mane: false, hoof: false, longFoot: false, fluffy: false, nose: 0.5 },
  quad_medium: { h: 60, legF: 40, legH: 40, bodyL: 46, chest: 13, hip: 12, legW: 5.2, paw: 3.4, R: 8.2, muz: { l: 18, h: 7, drop: 0.1, round: 0.6 }, neck: { l: 21, ang: 56, w: 9 }, ears: { kind: "small", size: 6 }, tail: { kind: "dog", l: 9, w: 3 }, eye: 0.3, whiskers: false, mane: false, hoof: false, longFoot: false, fluffy: false, nose: 0.6 },
  quad_large: { h: 170, legF: 87, legH: 87, bodyL: 120, chest: 37, hip: 36, legW: 23, paw: 13, R: 22, muz: { l: 44, h: 24, drop: 0.1, round: 0.3 }, neck: { l: 28, ang: 0, w: 46 }, ears: { kind: "small", size: 14 }, tail: { kind: "dog", l: 34, w: 4 }, eye: 0.26, whiskers: false, mane: false, hoof: false, longFoot: false, fluffy: false, nose: 0.5 },
};

/**
 * Body marks of a neutral quad (v0.3, #81, renderer 0.7.2): long_neck (a neck 2-3 times longer, the head held high)
 * and long_tail change the proportions of the spec; the other marks are drawn as extra parts in drawQuad.
 * No mark returns the spec itself, so the plain drawing is exactly the 0.7.x drawing.
 */
function applyQuadMarks(sp: QuadSpecies, s0: QuadSpec, m: Marks): QuadSpec {
  if (!m.neck && !m.tail) return s0;
  const s: QuadSpec = { ...s0, neck: { ...s0.neck }, tail: { ...s0.tail } };
  if (m.neck) {
    const k = sp === "quad_large" ? 3.6 : sp === "quad_medium" ? 2.8 : 4.2;
    s.neck = { l: s0.neck.l * k, ang: Math.max(s0.neck.ang, 66), w: s0.neck.w * (sp === "quad_large" ? 0.46 : 0.6) };
  }
  if (m.tail) {
    const k = sp === "quad_large" ? 2.4 : sp === "quad_medium" ? 3.4 : 2.8;
    s.tail = { kind: "dog", l: s0.tail.l * k, w: s0.tail.w * 1.5 };
  }
  return s;
}

const SIT_POSES: readonly Pose[] = ["sit", "talk", "wave", "point", "think", "hold"];

export function quadPoses(sp: QuadSpecies): readonly Pose[] {
  if (sp === "horse") return ["stand", "walk", "run", "jump", "lie", "talk", "bow", "hold", "fall"];
  return ["stand", "walk", "run", "sit", "lie", "jump", "talk", "cower", "fall", "hold", "wave", "point", "think"];
}

interface QPose {
  S: Point; // shoulder joint
  J: Point; // hip joint
  feet: { nf: Point; ff: Point; nh: Point; fh: Point };
  gesture: "talk" | "wave" | "point" | "think" | "hold" | null;
  neckAng: number; // degrees up from +x
  headTilt: number; // degrees (+ = nose up)
  tailMode: "up" | "down" | "tuck" | "flow" | "lift";
  earsBack: boolean;
  sitting: boolean;
  lying: boolean;
  rest: boolean; // belly-down rest of a boxy quad_* (legs folded under, head up)
  flip: boolean; // upside down (fall)
}

function isBoxy(sp: QuadSpecies): boolean {
  return sp === "quad_large" || sp === "quad_medium";
}

/** Belly-down rest of a boxy quad_*: the body low on the ground, the legs folded under, the head up and forward. */
function restPose(s: QuadSpec, base: QPose, pose: Pose): QPose {
  const L = s.bodyL;
  const S = P(L / 2, -s.chest * 1.0);
  const J = P(-L / 2, -s.hip * 1.0);
  return {
    ...base,
    S,
    J,
    lying: true,
    rest: true,
    gesture: null,
    feet: { nf: P(S.x + s.chest * 1.2, 0), ff: P(S.x + s.chest * 0.8, 0), nh: P(J.x + s.hip * 1.3, 0), fh: P(J.x + s.hip * 0.9, 0) },
    neckAng: s.neck.ang + (s.neck.ang > 30 ? 6 : 14),
    headTilt: pose === "think" ? 8 : 0,
    tailMode: "down",
  };
}

function solvePose(sp: QuadSpecies, s: QuadSpec, pose: Pose): QPose {
  const L = s.bodyL;
  const sit = SIT_POSES.includes(pose) && sp !== "horse";
  const heavy = sp === "quad_large";
  const boxy = isBoxy(sp);
  const base: QPose = {
    S: P(L / 2, -s.legF),
    J: P(-L / 2, -s.legH),
    feet: {
      nf: P(L / 2 + s.paw * 0.6, 0),
      ff: P(L / 2 - s.paw * 1.2, 0),
      nh: P(-L / 2 + s.paw * 0.4, 0),
      fh: P(-L / 2 - s.paw * 1.2, 0),
    },
    gesture: null,
    neckAng: s.neck.ang,
    headTilt: 0,
    tailMode: sp === "fox" || sp === "rat" || sp === "mouse" || boxy ? "down" : sp === "horse" ? "flow" : "up",
    earsBack: false,
    sitting: false,
    lying: false,
    rest: false,
    flip: false,
  };
  if (sit && boxy) return restPose(s, base, pose);
  if (sit) {
    // haunches on the ground, spine raised
    const upright = sp === "rat" || sp === "mouse" || sp === "bear" || sp === "rabbit";
    // v0.3 (#81): a rat or a mouse sits hunched on its haunches with a short rounded back and the
    // tail curled out behind, not bolt upright like a bear (the shared spine made them read as bears)
    const rodent = sp === "rat" || sp === "mouse";
    const ang = (rodent ? 52 : upright ? 70 : heavy ? 30 : 52) * DEG;
    const J = P(-L * 0.12, -s.hip * 0.95);
    const spine = rodent ? 0.72 : 0.95;
    const S = addP(J, P(Math.cos(ang) * L * spine, -Math.sin(ang) * L * spine));
    const reach = upright ? s.legF * 0.55 : s.legF * 1.05;
    // v0.3 (#81): neutral quad_* never raise a paw to talk (it read as a lucky cat); the mouth carries the talk
    const g: QPose["gesture"] = (pose === "talk" && sp.startsWith("quad_")) ? null : pose === "talk" || pose === "wave" || pose === "point" || pose === "think" || pose === "hold" ? pose : null;
    return {
      ...base,
      S,
      J,
      sitting: true,
      gesture: g,
      neckAng: s.neck.ang + (rodent ? 14 : upright ? 25 : 12),
      headTilt: pose === "think" ? 14 : 4,
      feet: {
        nf: upright ? P(S.x + reach * 0.35, S.y + reach) : P(S.x + s.paw * 0.4, 0),
        ff: upright ? P(S.x + reach * 0.1, S.y + reach * 1.05) : P(S.x - s.paw * 1.1, 0),
        nh: P(J.x + s.hip * 1.1, 0),
        fh: P(J.x + s.hip * 0.6, 0),
      },
      tailMode: sp === "cat" || sp === "fox" || sp === "rat" || sp === "mouse" ? "flow" : base.tailMode,
    };
  }
  switch (pose) {
    case "walk": {
      const st = boxy ? 0.5 : 1; // a pillar-legged body takes short steps
      return {
        ...base,
        feet: {
          nf: P(L / 2 + s.legF * 0.32 * st, 0),
          ff: P(L / 2 - s.legF * 0.22 * st, -s.legF * 0.12 * st),
          nh: P(-L / 2 - s.legH * 0.28 * st, -s.legH * 0.08 * st),
          fh: P(-L / 2 + s.legH * 0.25 * st, 0),
        },
        neckAng: s.neck.ang - 6,
      };
    }
    case "run": {
      const S = P(L / 2 + s.legF * 0.1, -s.legF * 1.02);
      const J = P(-L / 2 + s.legF * 0.1, -s.legH * 1.0);
      return {
        ...base,
        S,
        J,
        feet: {
          nf: P(S.x + s.legF * 0.85, S.y + s.legF * 0.62),
          ff: P(S.x + s.legF * 0.55, S.y + s.legF * 0.85),
          nh: P(J.x - s.legH * 0.95, J.y + s.legH * 0.5),
          fh: P(J.x - s.legH * 0.6, J.y + s.legH * 0.85),
        },
        neckAng: s.neck.ang - 16,
        headTilt: -6,
        earsBack: true,
        tailMode: sp === "horse" ? "lift" : "flow",
      };
    }
    case "jump": {
      const lift = s.legF * 0.9;
      const S = P(L * 0.45, -s.legF - lift * 1.35);
      const J = P(-L * 0.45, -s.legH - lift * 0.55);
      return {
        ...base,
        S,
        J,
        feet: {
          nf: P(S.x + s.legF * 0.7, S.y + s.legF * 0.35),
          ff: P(S.x + s.legF * 0.45, S.y + s.legF * 0.55),
          nh: P(J.x - s.legH * 0.95, J.y + s.legH * 0.55),
          fh: P(J.x - s.legH * 0.75, J.y + s.legH * 0.75),
        },
        neckAng: s.neck.ang + 4,
        headTilt: 6,
        tailMode: "flow",
      };
    }
    case "lie": {
      if (boxy) return restPose(s, base, pose);
      const S = P(L / 2, -s.chest * 1.0);
      const J = P(-L / 2, -s.hip * 0.95);
      return {
        ...base,
        S,
        J,
        lying: true,
        feet: {
          nf: P(S.x + s.legF * 0.85, 0),
          ff: P(S.x + s.legF * 0.6, 0),
          nh: P(J.x + s.hip * 1.3, 0),
          fh: P(J.x + s.hip * 0.9, 0),
        },
        neckAng: s.neck.ang - 8,
        headTilt: -4,
        tailMode: "down",
      };
    }
    case "cower": {
      const S = P(L * 0.45, -Math.max(s.legF * 0.55, s.chest * 1.1));
      const J = P(-L * 0.42, -Math.max(s.legH * 0.62, s.hip * 1.05));
      return {
        ...base,
        S,
        J,
        feet: {
          nf: P(S.x + s.paw * 1.2, 0),
          ff: P(S.x - s.paw * 0.4, 0),
          nh: P(J.x + s.legH * 0.35, 0),
          fh: P(J.x + s.legH * 0.15, 0),
        },
        neckAng: 5,
        headTilt: -14,
        earsBack: true,
        tailMode: "tuck",
      };
    }
    case "fall": {
      // on its back, legs in the air
      const S = P(L / 2, -s.chest * 1.25 - s.legF * 0.15);
      const J = P(-L / 2, -s.hip * 1.3 - s.legF * 0.1);
      return {
        ...base,
        S,
        J,
        flip: true,
        feet: {
          nf: P(S.x + s.legF * 0.4, S.y - s.legF * 0.85),
          ff: P(S.x - s.legF * 0.1, S.y - s.legF * 0.9),
          nh: P(J.x + s.legH * 0.3, J.y - s.legH * 0.85),
          fh: P(J.x - s.legH * 0.25, J.y - s.legH * 0.8),
        },
        neckAng: -10,
        headTilt: -10,
        earsBack: true,
        tailMode: "down",
      };
    }
    case "talk":
      return { ...base, neckAng: s.neck.ang + 10, headTilt: 10 };
    case "bow":
      return { ...base, neckAng: -18, headTilt: -30, feet: { ...base.feet, nf: P(L / 2 + s.legF * 0.35, 0) } };
    case "hold":
      return { ...base, gesture: "hold" };
    default:
      return base;
  }
}

function ik(a: Point, b: Point, l1: number, l2: number, bend: number): Point {
  const d = Math.min(dist(a, b), (l1 + l2) * 0.999);
  const base = Math.atan2(b.y - a.y, b.x - a.x);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * Math.max(d, 1e-6));
  const ang = Math.acos(Math.max(-1, Math.min(1, cosA)));
  return polar(a, l1, base + bend * ang);
}

export interface AnimalBuilt {
  sk: Sketch;
  head: Point;
  headR: number;
  mouth: Point;
  hand?: Point;
  waist: number;
  shoulders: number;
}

export function drawQuad(
  sp: QuadSpecies,
  tone: Tone,
  pose: Pose,
  expression: Expression,
  facing: "right" | "front" | "back",
  pen: Pen,
  seed: number,
  m: Marks = NO_MARKS,
): AnimalBuilt {
  const s = applyQuadMarks(sp, QUAD[sp], m);
  if (facing !== "right") return isBoxy(sp) ? drawBoxyFront(sp, s, tone, pose, expression, facing === "back", pen, m) : drawQuadFront(sp, s, tone, pose, expression, facing === "back", pen, m);
  const q = solvePose(sp, s, pose);
  const sk = new Sketch(pen);
  const rand = charRand(seed, `quad-${sp}`);
  const fur = fillOf(tone, pen);
  const farFur = fillOf(darker(tone), pen);
  const dark = isDark(tone);
  const pale = fillOf(lighter(tone), pen);
  const flip = q.flip;
  const heavy = sp === "quad_large";
  const boxy = isBoxy(sp);
  // spine frame
  const spine = Math.atan2(q.S.y - q.J.y, q.S.x - q.J.x);
  const mid = lerpP(q.S, q.J, 0.5);
  const vx = (d: number) => P(-Math.sin(spine) * d, Math.cos(spine) * d); // perpendicular (down when level)
  const ux = (d: number) => P(Math.cos(spine) * d, Math.sin(spine) * d);
  const down = flip ? -1 : 1;
  const at = (base: Point, u: number, v: number) => addP(addP(base, ux(u)), vx(v * down));

  // ---- legs (far first)
  const legTop = (front: boolean) => (front ? at(q.S, -s.chest * 0.15, s.chest * 0.25) : at(q.J, s.hip * 0.15, s.hip * 0.1));
  // natural leg lengths = the standing geometry, so standing legs are straight
  const L0 = s.bodyL;
  const hockLen = (s.legH - s.hip * 0.1) * (s.longFoot ? 0.2 : heavy ? 0.14 : 0.3);
  const lenF0 = dist(P(L0 / 2 - s.chest * 0.15, -s.legF + s.chest * 0.25), P(L0 / 2 + s.paw * 0.6, -s.paw * 0.55)) * 1.005;
  const hockStand = addP(P(-L0 / 2 + s.paw * 0.4, -s.paw * 0.55), polar(P(0, 0), hockLen, -115 * DEG));
  const lenH0 = dist(P(-L0 / 2 + s.hip * 0.15, -s.legH + s.hip * 0.1), hockStand) * 1.06;
  const drawLeg = (front: boolean, footIn: Point, far: boolean) => {
    const top = legTop(front);
    // the leg ends inside the paw so nothing dips below the ground line
    const onGround = !flip && footIn.y > -s.paw;
    const foot = onGround ? P(footIn.x, footIn.y - (s.hoof ? s.paw * 1.05 : s.paw * 0.55)) : footIn;
    const fill = far ? farFur : fur;
    const lw = s.legW * (front || boxy ? 1 : 1.15);
    if (boxy && q.rest) {
      // belly-down rest: the fore leg folded forward along the ground, the hind leg a round haunch with the foot flat
      if (front) {
        const y0 = -s.legW * 0.46;
        const x0 = q.S.x - s.chest * 0.25 + (far ? -s.chest * 0.1 : 0);
        const x1 = q.S.x + s.chest * (far ? 0.85 : 1.1);
        sk.shape(taperD([P(x0, y0), P(x1, y0)], [s.legW * 0.92, s.legW * 0.9], { samples: 2 }), fill, { edge: false });
        sk.shape(ellipseD(P(x1, -s.paw * 0.55), s.paw * 1.15, s.paw * 0.6), fill);
      } else {
        const hc = P(q.J.x + s.hip * (far ? 0.3 : 0.45), -s.hip * 0.8);
        sk.shape(ellipseD(hc, s.hip * 1.0, s.hip * 0.8), fill, { edge: false });
        if (!far) sk.shape(ellipseD(P(hc.x + s.hip * 0.8, -s.paw * 0.6), s.paw * 1.5, s.paw * 0.6), fill);
      }
      return;
    }
    if (!front && q.sitting) {
      // folded hind leg: round haunch + long foot flat on the ground
      const hc = P(q.J.x + s.hip * (far ? 0.25 : 0.4), -s.hip * 0.85);
      sk.shape(ellipseD(hc, s.hip * 0.95, s.hip * 0.82), fill, { edge: false });
      const ft = P(hc.x + s.hip * 0.2, -s.paw * 0.6);
      sk.shape(taperD([P(hc.x - s.hip * 0.3, -s.paw * 0.9), ft], [lw * 0.9, lw * 0.7], { samples: 2 }), fill, { edge: false });
      const pl = s.paw * (s.longFoot ? 1.9 : 1.3);
      sk.shape(ellipseD(P(ft.x + pl * 0.5, -s.paw * 0.62), pl, s.paw * 0.62), fill);
      if (!far) sk.line(curveD([P(hc.x - s.hip * 0.6, hc.y - s.hip * 0.55), P(hc.x + s.hip * 0.25, hc.y - s.hip * 0.7), P(hc.x + s.hip * 0.9, hc.y + s.hip * 0.05)]), pen.dw, { halo: dark });
      return;
    }
    if (boxy) {
      // v0.3 (#81): straight pillar legs (no hock, no claws): the same leg for the fore and the hind pair
      const len = ((front ? s.legF - s.chest * 0.25 : s.legH - s.hip * 0.1) - s.paw * 0.55) * 1.005;
      const knee = ik(top, foot, len * 0.5, len * 0.5, (flip ? 1 : -1) * (front ? 1 : -1));
      const w = heavy ? [lw, lw, lw] : [lw * 1.15, lw * 0.85, lw * 0.75];
      sk.shape(taperD([top, knee, foot], w, { samples: 5 }), fill, { edge: false });
    } else if (front) {
      const len = Math.max(lenF0, 1e-3);
      const knee = ik(top, foot, len * 0.5, len * 0.5, flip ? 1 : -1);
      sk.shape(taperD([top, knee, foot], s.hoof ? [lw * 1.7, lw * 0.72, lw * 0.6] : heavy ? [lw * 1.2, lw * 1.0, lw * 0.95] : [lw * 1.55, lw * 0.85, lw * 0.74], { samples: 5 }), fill, { edge: false });
    } else {
      const len = lenH0;
      const hock = addP(foot, polar(P(0, 0), hockLen, flip ? 60 * DEG : -115 * DEG));
      const knee = ik(top, hock, len * 0.52, len * 0.48, flip ? -1 : 1);
      sk.shape(taperD([top, knee, hock, foot], s.hoof ? [lw * 2.2, lw * 0.95, lw * 0.62, lw * 0.55] : heavy ? [lw * 1.45, lw * 1.05, lw * 0.95, lw * 0.92] : [lw * 2.0, lw * 1.0, lw * 0.72, lw * 0.68], { samples: 5 }), fill, { edge: false });
    }
    // paw / hoof
    if (s.hoof) {
      const hw = s.paw;
      const fy = onGround ? 0 : foot.y + hw * 1.05;
      sk.shape(polyPath([P(foot.x - hw * 0.8, fy - hw * 1.2), P(foot.x + hw * 0.7, fy - hw * 1.2), P(foot.x + hw * 1.0, fy), P(foot.x - hw * 0.9, fy)], true), fillOf("dark", pen));
    } else {
      const pl = s.paw * (s.longFoot && !front ? 1.9 : heavy ? 1.7 : 1.25);
      const pc = onGround ? P(foot.x + pl * 0.35, -s.paw * 0.62) : P(foot.x + pl * 0.35, foot.y);
      sk.shape(ellipseD(pc, pl, s.paw * 0.62), fill);
      if (!far && s.paw > 1.2 && !boxy) {
        for (const t of [0.25, 0.65]) sk.line(lineD([P(pc.x + pl * t, pc.y + s.paw * 0.6), P(pc.x + pl * t, pc.y + s.paw * 0.05)]), pen.fw, { halo: dark });
      }
    }
  };
  const gestureFront = q.gesture && q.gesture !== "hold" ? q.gesture : null;
  drawLeg(true, q.feet.ff, true);
  drawLeg(false, q.feet.fh, true);

  // ---- tail (behind body)
  const tb = at(q.J, -s.hip * 0.85, -s.hip * 0.25);
  const T = s.tail;
  let tailSpine: Point[];
  switch (q.tailMode) {
    case "up":
      tailSpine = T.kind === "dog" ? [tb, addP(tb, P(-T.l * 0.35, -T.l * 0.55)), addP(tb, P(-T.l * 0.2, -T.l * 1.0))] : [tb, addP(tb, P(-T.l * 0.45, -T.l * 0.2)), addP(tb, P(-T.l * 0.55, -T.l * 0.75)), addP(tb, P(-T.l * 0.3, -T.l * 0.98))];
      break;
    case "tuck":
      tailSpine = [tb, addP(tb, P(-T.l * 0.1, T.l * 0.3)), addP(tb, P(T.l * 0.25, T.l * 0.45))];
      break;
    case "lift":
      tailSpine = [tb, addP(tb, P(-T.l * 0.55, -T.l * 0.15)), addP(tb, P(-T.l * 1.0, -T.l * 0.05))];
      break;
    case "flow":
      tailSpine = [tb, addP(tb, P(-T.l * 0.4, T.l * 0.12)), addP(tb, P(-T.l * 0.75, T.l * 0.12)), addP(tb, P(-T.l * 1.0, -T.l * 0.12))];
      break;
    default:
      tailSpine = [tb, addP(tb, P(-T.l * 0.3, T.l * 0.35)), addP(tb, P(-T.l * 0.62, T.l * 0.5)), addP(tb, P(-T.l * 0.95, T.l * 0.42))];
  }
  if (T.kind === "horse") tailSpine = [tb, addP(tb, P(-T.l * 0.2, T.l * 0.25)), addP(tb, P(-T.l * 0.3, T.l * 0.65)), addP(tb, P(-T.l * 0.22, T.l * 0.95))];
  if (q.tailMode === "lift" && T.kind === "horse") tailSpine = [tb, addP(tb, P(-T.l * 0.45, T.l * 0.05)), addP(tb, P(-T.l * 0.85, T.l * 0.2))];
  // v0.3 (#81) long_tail: a boxy body's long tail hangs down behind the rump (a thin line the length of the legs)
  if (m.tail && boxy && (q.tailMode === "down" || q.tailMode === "tuck")) tailSpine = [tb, addP(tb, P(-T.l * 0.07, T.l * 0.3)), addP(tb, P(-T.l * 0.1, T.l * 0.64)), addP(tb, P(T.l * 0.0, T.l * 0.97))];
  // keep tails above the ground
  tailSpine = tailSpine.map((p) => P(p.x, Math.min(p.y, -T.w * 0.6)));
  if (flip) tailSpine = tailSpine.map((p, i) => (i === 0 ? p : P(p.x, Math.min(p.y, tb.y + (p.y - tb.y) * -0.5))));
  if (T.kind === "puff") {
    sk.shape(puffD(addP(tb, P(-T.l * 0.35, -T.l * 0.2)), T.l, T.l, 7, 0.6, rand), fillOf("white", pen));
  } else if (T.kind === "stub") {
    sk.shape(circleD(addP(tb, P(-T.l * 0.3, -T.l * 0.1)), T.l * 0.6), fur);
  } else if (T.kind === "fox") {
    const tp = taperDfox(tailSpine, T.w);
    sk.shape(tp.body, fur);
    sk.shape(tp.tip, fillOf("white", pen), { edge: pen.dw });
  } else if (T.kind === "horse") {
    sk.shape(taperD(tailSpine, [T.w * 0.5, T.w * 0.95, T.w * 0.8, T.w * 0.35], { samples: 6 }), fillOf(darker(tone), pen));
    for (let i = 0; i < 3; i += 1) {
      const off = (i - 1) * T.w * 0.22;
      sk.line(curveD(tailSpine.slice(1).map((p) => addP(p, P(off, 0)))), pen.fw, { halo: true });
    }
  } else {
    const w0 = T.w;
    const widths = T.kind === "rat" ? [w0, w0 * 0.55, w0 * 0.25, w0 * 0.08] : T.kind === "cat" ? [w0, w0, w0 * 0.95, w0 * 0.8] : [w0 * 1.1, w0 * 0.8, w0 * 0.3];
    sk.shape(taperD(tailSpine, widths, { samples: 6 }), T.kind === "rat" ? fillOf(lighter(tone), pen) : fur);
    if (T.kind === "rat") {
      // ring segments
      for (let i = 1; i < 6; i += 1) {
        const p = lerpP(tailSpine[0], tailSpine[tailSpine.length - 1], i / 6);
        void p;
      }
    }
  }

  // ---- body
  const cD = s.chest;
  const hD = s.hip;
  const bodyPts = [
    at(q.S, cD * 0.95, cD * 0.05),
    at(q.S, cD * 0.35, -cD * 0.85),
    at(q.S, -cD * 0.35, -cD * 1.0),
    at(mid, 0, -(cD + hD) * (boxy ? 0.5 : 0.43)),
    at(q.J, hD * 0.3, -hD * 0.98),
    at(q.J, -hD * 0.55, -hD * 0.85),
    at(q.J, -hD * 1.0, -hD * 0.05),
    at(q.J, -hD * 0.55, hD * 0.8),
    at(q.J, hD * 0.25, hD * 0.95),
    at(mid, 0, (cD + hD) * (boxy ? 0.5 : 0.4)),
    at(q.S, -cD * 0.1, cD * 0.95),
    at(q.S, cD * 0.6, cD * 0.75),
  ];
  if (q.sitting) {
    // round haunch sits on the ground
    const haunch = P(q.J.x + hD * 0.1, -hD * 0.95);
    bodyPts.splice(5, 4, at(q.J, -hD * 0.6, -hD * 0.6), P(haunch.x - hD * 1.05, haunch.y + hD * 0.35), P(haunch.x - hD * 0.6, -hD * 0.32), P(haunch.x + hD * 0.6, -hD * 0.32), P(haunch.x + hD * 1.1, haunch.y + hD * 0.1));
  }
  sk.shape(blobD(bodyPts, 0.5), fur, { edge: false });
  // belly / chest pale patch
  const bellyPts = [at(q.S, cD * 0.92, cD * 0.1), at(q.S, cD * 0.55, cD * 0.8), at(q.S, -cD * 0.2, cD * 0.92), at(mid, 0, (cD + hD) * 0.36), at(q.J, hD * 0.5, hD * 0.75), at(mid, 0, (cD + hD) * 0.18), at(q.S, cD * 0.3, cD * 0.35)];
  if (sp !== "horse" && sp !== "bear" && !boxy && !flip) sk.shape(blobD(bellyPts, 0.5), pale, { edge: false });
  // haunch/thigh line
  if (q.sitting) sk.line(curveD([at(q.J, hD * 0.55, -hD * 0.55), at(q.J, hD * 0.9, hD * 0.2), P(q.J.x + hD * 1.0, -s.paw)]), pen.dw, { halo: dark });
  else sk.line(curveD([at(q.J, hD * 0.1, -hD * 0.6), at(q.J, hD * 0.55, -hD * 0.05), at(q.J, hD * 0.35, hD * 0.6)]), pen.dw, { halo: dark });
  // fur tufts on chest for fluffy species
  if (s.fluffy) {
    const c0 = at(q.S, cD * 0.85, cD * 0.35);
    sk.line(lineD([c0, addP(c0, P(cD * 0.2, cD * 0.12)), addP(c0, P(-cD * 0.02, cD * 0.28)), addP(c0, P(cD * 0.15, cD * 0.42))]), pen.dw);
  }

  // ---- neck + head
  const neckBase = at(q.S, cD * 0.35, -cD * 0.35);
  const neckAng = (q.neckAng * DEG) * (flip ? -1 : 1);
  let Hc = addP(neckBase, P(Math.cos(neckAng) * s.neck.l, -Math.sin(neckAng) * s.neck.l * (flip ? -1 : 1) * (flip ? -1 : 1)));
  if (flip) Hc = addP(neckBase, P(Math.cos(neckAng) * s.neck.l + s.R * 0.2, Math.abs(Math.sin(neckAng)) * s.neck.l * 0.3 - s.R * 0.2));
  if (sp === "horse") Hc = addP(Hc, P(s.R * 0.3, 0));
  const R = s.R;
  const headDir = (-q.headTilt * DEG) + (sp === "horse" ? 48 * DEG : 0) + (flip ? 25 * DEG : 0);
  const hp = (x: number, y: number) => addP(Hc, rotP(P(x, y), headDir));
  const nw = s.neck.w;
  const neckPts = [
    addP(neckBase, vx(-nw * 0.55)),
    hp(-R * 0.75, -R * 0.35),
    hp(-R * 0.1, R * 0.85),
    at(q.S, cD * 0.95, cD * 0.2),
  ];
  sk.shape(blobD(neckPts, 0.35), fur, { edge: false });
  sk.shape(taperD([at(q.S, cD * 0.25, -cD * 0.15), lerpP(at(q.S, cD * 0.25, -cD * 0.15), Hc, 0.55), Hc], [nw * 1.35, nw * 0.95, nw * 0.72], { samples: 4 }), fur, { edge: false });
  if (s.mane) {
    // jagged mane along the top of the neck, withers → poll
    const w0 = at(q.S, -cD * 0.1, -cD * 0.85);
    const w1 = hp(-R * 0.55, -R * 0.75);
    const dir = Math.atan2(w1.y - w0.y, w1.x - w0.x);
    const out = dir - Math.PI / 2; // upper/back side of the neck line
    const pts: Point[] = [];
    const steps = 7;
    for (let i = 0; i <= steps; i += 1) {
      const p = lerpP(w0, w1, i / steps);
      pts.push(polar(p, (i % 2 === 0 ? 0.55 : 0.2) * nw * (1 - i / (steps * 2.2)), out - 0.35));
    }
    for (let i = steps; i >= 0; i -= 1) pts.push(polar(lerpP(w0, w1, i / steps), nw * 0.18, out + Math.PI));
    sk.shape(polyPath(pts, true), fillOf(darker(tone), pen), { edge: false });
  }
  // v0.3 (#81): the head of a boxy quad_*: a rounded box longer than tall (quad_large: a broad flat blunt muzzle end;
  // quad_medium: an oval head with a modest tapered muzzle), held at or below the back line, a nostril dot, a small mouth line
  function drawBoxyHead(): void {
    const heavyHead = sp === "quad_large";
    const upper = heavyHead
      ? [[-0.95, 0.3], [-0.98, -0.3], [-0.55, -0.72], [0.5, -0.8], [1.6, -0.68], [2.08, -0.45], [2.16, -0.05], [2.12, 0.3]]
      : [[-0.9, 0.2], [-0.88, -0.4], [-0.35, -0.82], [0.6, -0.78], [1.5, -0.42], [2.2, -0.14], [2.4, 0.06], [2.32, 0.2]];
    const lower = heavyHead
      ? [[-0.9, 0.3], [2.1, 0.3], [2.14, 0.6], [1.95, 0.8], [0.4, 0.86], [-0.5, 0.82], [-0.95, 0.55]]
      : [[-0.8, 0.2], [2.25, 0.2], [2.15, 0.45], [1.2, 0.7], [0.1, 0.86], [-0.65, 0.62]];
    const tipX = heavyHead ? 2.12 : 2.34;
    const pt = (a: number[]) => hp(R * a[0], R * a[1]);
    if (open > 0.05) {
      const inside = [hp(R * 0.5, mouthLineY), hp(R * tipX, mouthLineY), jaw(hp(R * tipX, mouthLineY + R * 0.04)), jaw(hp(R * 0.5, mouthLineY + R * 0.08))];
      sk.shape(polyPath(inside, true), INK, { edge: false });
    }
    sk.shape(blobD(lower.map((a) => jaw(pt(a))), 0.4), fur, { edge: false });
    sk.shape(blobD(upper.map(pt), 0.4), fur, { edge: false });
    // nostril
    const nc = hp(R * (tipX - 0.2), -R * (heavyHead ? 0.2 : 0.02));
    sk.shape(blobD(ellipsePts(P(0, 0), R * (heavyHead ? 0.1 : 0.2), R * (heavyHead ? 0.14 : 0.16), 10).map((p) => addP(nc, rotP(p, headDir))), 0.5), INK, { outline: false });
    // mouth line + expression corner
    const corner = hp(R * 0.75, mouthLineY - x.curve * R * 0.12 * (open > 0.3 ? 0.4 : 1));
    const ml = [hp(R * (tipX - 0.03), mouthLineY), hp(R * 1.5, mouthLineY + R * 0.03), corner];
    sk.line(curveD(ml), pen.dw * 1.2, { halo: dark });
    if (x.mouth === "grit" && open <= 0.05) sk.line(lineD([hp(R * 1.0, mouthLineY + R * 0.12), hp(R * 1.9, mouthLineY + R * 0.12)]), pen.fw, { halo: dark });
  }
  // v0.3 (#81) marks on the head: horns, big ears (the flaps sit at the back of the head), a long nose
  const hornF = hornFill(tone, pen);
  const horn = (bx: number, lean: number) => {
    const topY = boxy ? -0.7 : -0.85;
    const pts = [hp(R * bx, R * topY), hp(R * (bx + lean * 0.45), R * (topY - 0.62)), hp(R * (bx + lean + 0.1), R * (topY - 1.2))];
    sk.shape(taperD(pts, [R * 0.55, R * 0.38, R * 0.06], { samples: 5 }), hornF);
  };
  const bigEar = (far: boolean) => {
    const o = far ? P(0.42, -0.3) : P(0, 0);
    const flap: Array<[number, number]> = [[-0.45, -0.55], [-1.15, -1.2], [-2.0, -1.0], [-2.3, -0.05], [-1.95, 1.0], [-1.1, 1.4], [-0.5, 0.6]];
    sk.shape(blobD(flap.map(([fx, fy]) => hp(R * (fx + o.x), R * (fy + o.y))), 0.45), far ? farFur : fur);
    if (!far) {
      const inner: Array<[number, number]> = [[-0.75, -0.3], [-1.2, -0.8], [-1.8, -0.6], [-1.95, 0.0], [-1.65, 0.7], [-1.1, 0.95], [-0.8, 0.4]];
      sk.shape(blobD(inner.map(([fx, fy]) => hp(R * fx, R * fy)), 0.45), innerEar, { edge: pen.fw });
    }
  };
  if (m.horns) {
    horn(0.42, -0.34);
    horn(-0.18, -0.34);
  }
  // ears (far ear first, behind skull)
  const earFill = fur;
  const innerEar = fillOf(dark ? "mid" : "light", pen);
  const ear = (base: Point, ang: number, size: number, far: boolean) => {
    const E = s.ears.kind;
    const f = far ? farFur : earFill;
    const back = q.earsBack ? 45 * DEG : 0;
    const a = ang - back;
    const tipP = polar(base, size, a);
    if (E === "small") {
      // a small plain flat oval: no point, no bear-round
      const c = polar(base, size * 0.4, a);
      sk.shape(blobD(ellipsePts(P(0, 0), size * 0.55, size * 0.36, 12).map((p) => addP(c, rotP(p, a))), 0.5), f);
    } else if (E === "round" || E === "bear") {
      const c = polar(base, size * 0.55, a);
      sk.shape(circleD(c, size * 0.62), f);
      if (!far) sk.shape(circleD(polar(c, size * 0.1, a), size * 0.38), innerEar, { edge: pen.fw });
    } else if (E === "flop") {
      const root = polar(base, size * 0.1, a);
      const pts = [polar(root, size * 0.35, a - 1.3), polar(root, size * 0.55, a + 0.4), addP(root, P(size * 0.2 * Math.cos(a) - size * 0.1, size * 0.95)), addP(root, P(-size * 0.25, size * 0.8))];
      sk.shape(blobD(pts, 0.5), far ? farFur : fillOf(darker(tone), pen));
    } else {
      const w = E === "long" ? size * 0.2 : E === "horse" ? size * 0.35 : size * 0.48;
      const l = polar(base, w, a - Math.PI / 2);
      const r = polar(base, w, a + Math.PI / 2);
      const mid1 = polar(lerpP(base, tipP, 0.55), w * (E === "long" ? 1.3 : 0.95), a - Math.PI / 2);
      const mid2 = polar(lerpP(base, tipP, 0.55), w * (E === "long" ? 1.3 : 0.95), a + Math.PI / 2);
      sk.shape(E === "long" ? blobD([l, mid1, tipP, mid2, r], 0.45) : polyPath([l, mid1, tipP, mid2, r], true), f);
      if (!far) {
        const il = polar(base, w * 0.45, a - Math.PI / 2);
        const ir = polar(base, w * 0.45, a + Math.PI / 2);
        const it = polar(base, size * 0.78, a);
        sk.shape(E === "long" ? blobD([il, polar(lerpP(base, it, 0.55), w * 0.7, a - Math.PI / 2), it, polar(lerpP(base, it, 0.55), w * 0.7, a + Math.PI / 2), ir], 0.45) : polyPath([il, it, ir], true), innerEar, { edge: pen.fw });
      }
    }
  };
  const es = s.ears.size;
  const earAngFar = (s.ears.kind === "small" ? -105 : s.ears.kind === "long" ? -118 : s.ears.kind === "flop" ? -150 : -125) * DEG + headDir;
  const earAngNear = (s.ears.kind === "small" ? -82 : s.ears.kind === "long" ? -95 : s.ears.kind === "flop" ? -60 : -78) * DEG + headDir;
  if (m.ears) bigEar(true);
  else if (!boxy) ear(hp(-R * 0.55, -R * 0.55), earAngFar, es * 0.92, true);
  else ear(hp(-R * 0.72, -R * 0.12), (-176 * DEG) + headDir, es, true);
  // skull + muzzle
  const M = s.muz;
  const drop = M.drop * R;
  const open = pose === "hold" ? 0.25 : mouthOpen(expression, pose === "talk" || q.gesture === "talk");
  const x = EXPR[expression];
  const horse = sp === "horse";
  const mouthLineY = boxy ? R * (heavy ? 0.3 : 0.2) : drop + M.h * 0.28;
  const jawOpen = open * (boxy ? 16 : 22) * DEG;
  const jawPivot = boxy ? hp(-R * 0.2, mouthLineY) : hp(R * 0.2, drop + M.h * 0.28);
  const jaw = (p: Point) => rotP(p, jawOpen, jawPivot);
  if (boxy) drawBoxyHead();
  else drawFurHead();
  // v0.3 (#81) long_nose: a long flexible tube from the front of the face, hanging down (never below the ground)
  if (m.nose) {
    const root = boxy ? hp(R * ((sp === "quad_large" ? 2.12 : 2.34) - 0.25), R * (heavy ? -0.1 : -0.02)) : hp(R * 0.5 + M.l * 0.9, drop - M.h * 0.2);
    const wRoot = boxy ? R * (heavy ? 0.74 : 0.52) : Math.max(M.h * 0.8, R * 0.34);
    const len = R * (boxy ? (heavy ? 3.7 : 3.4) : 3.2);
    const t = hangingTube(root, headDir + 0.45, Math.PI / 2 - 0.3, len, -wRoot * 0.3);
    sk.shape(taperD(t.spine, [wRoot, wRoot * 0.86, wRoot * 0.72, wRoot * 0.62, wRoot * 0.58], { samples: 4 }), fur, { edge: false });
    const tipP = t.spine[t.spine.length - 1];
    sk.shape(blobD(ellipsePts(P(0, 0), wRoot * 0.16, wRoot * 0.12, 10).map((p) => addP(polar(tipP, wRoot * 0.2, t.endAngle), rotP(p, t.endAngle))), 0.5), INK, { outline: false });
    for (const f of [3, 5]) {
      const c = t.spine[f];
      const a = Math.atan2(t.spine[f + 1].y - t.spine[f - 1].y, t.spine[f + 1].x - t.spine[f - 1].x) + Math.PI / 2;
      sk.line(lineD([polar(c, wRoot * 0.3, a), polar(c, -wRoot * 0.3, a)]), pen.fw, { halo: dark });
    }
  }
  function drawFurHead(): void {
  const tip = horse ? hp(R * 0.5 + M.l * 1.03, drop + M.h * 0.1) : hp(R * 0.55 + M.l, drop - M.h * 0.1);
  const muzTop = horse
    ? [hp(R * 0.05, -R * 0.75), hp(R * 0.5 + M.l * 0.5, drop - M.h * 0.6), hp(R * 0.5 + M.l * 0.9, drop - M.h * 0.52), hp(R * 0.5 + M.l * 1.06, drop - M.h * 0.18), tip]
    : [hp(R * 0.2, -R * 0.45 + drop * 0.5), hp(R * 0.5 + M.l * 0.55, drop - M.h * 0.5 + M.l * 0.02), hp(R * 0.5 + M.l, drop - M.h * (0.35 - M.round * 0.1)), tip];
  const upperPts = [...muzTop, hp(R * 0.5 + M.l * 1.0, mouthLineY), hp(R * 0.3, mouthLineY + M.h * 0.05), hp(R * 0.0, drop + M.h * 0.2)];
  const lowerPts = [hp(R * 0.25, mouthLineY), hp(R * 0.45 + M.l * 0.85, mouthLineY + M.h * 0.02), hp(R * 0.4 + M.l * 0.75, mouthLineY + M.h * 0.32), hp(R * 0.3, drop + M.h * 0.62), hp(-R * 0.1, drop + M.h * 0.5)].map(jaw);
  if (open > 0.05) {
    const inside = [hp(R * 0.3, mouthLineY), hp(R * 0.45 + M.l * 0.95, mouthLineY), jaw(hp(R * 0.45 + M.l * 0.85, mouthLineY + M.h * 0.05)), jaw(hp(R * 0.3, mouthLineY + M.h * 0.1))];
    sk.shape(polyPath(inside, true), INK, { edge: false });
    // tongue
    sk.fill(blobD([jaw(hp(R * 0.5, mouthLineY + M.h * 0.05)), jaw(hp(R * 0.45 + M.l * 0.6, mouthLineY - M.h * 0.02)), jaw(hp(R * 0.45 + M.l * 0.75, mouthLineY + M.h * 0.08))], 0.5), fillOf("mid", pen));
  }
  sk.shape(blobD(lowerPts, 0.45), fur, { edge: false });
  if (horse) sk.shape(circleD(hp(-R * 0.05, R * 0.5), R * 0.95), fur, { edge: false });
  sk.shape(circleD(Hc, R), fur, { edge: false });
  if (s.fluffy) {
    // cheek ruff
    sk.shape(polyPath([hp(-R * 0.6, R * 0.2), hp(-R * 0.25, R * 1.25), hp(R * 0.05, R * 0.75), hp(R * 0.3, R * 1.1), hp(R * 0.45, R * 0.55), hp(R * 0.1, R * 0.1)], true), sp === "fox" ? fillOf("white", pen) : fur, { edge: sp === "fox" ? pen.dw : false });
  }
  sk.shape(blobD(upperPts, 0.4), fur, { edge: false });
  // muzzle pale patch (fox, dog, horse blaze)
  if (sp === "fox" || sp === "dog" || sp === "cat" || sp === "rabbit" || sp === "bear") {
    sk.shape(blobD([hp(R * 0.45, drop - M.h * 0.05), hp(R * 0.5 + M.l * 0.9, drop - M.h * 0.05), hp(R * 0.5 + M.l, mouthLineY), hp(R * 0.3, mouthLineY + M.h * 0.1)], 0.5), fillOf(sp === "bear" ? lighter(tone) : "white", pen), { edge: false });
  }
  // nose
  const noseC = hp(R * 0.5 + M.l * 0.97, drop - M.h * 0.3 + M.round * M.h * 0.05);
  const nr = Math.max(R * 0.12, M.h * 0.22) * s.nose * 1.6;
  if (horse) {
    // soft nose end: a nostril and the jowl line
    const nc = hp(R * 0.5 + M.l * 0.86, drop - M.h * 0.16);
    sk.shape(blobD(ellipsePts(P(0, 0), M.h * 0.1, M.h * 0.17, 12).map((p) => addP(nc, rotP(p, headDir - 0.5))), 0.5), INK, { outline: false });
    sk.line(curveD([hp(R * 0.75, -R * 0.1), hp(R * 0.85, R * 0.6), hp(R * 0.35, R * 1.3)]), pen.dw, { halo: dark });
  } else {
    sk.shape(blobD([polar(noseC, nr, headDir - 2.4), polar(noseC, nr * 1.1, headDir - 0.5), polar(noseC, nr * 0.9, headDir + 0.9), polar(noseC, nr, headDir + 2.4)], 0.5), INK, { outline: false });
    sk.fill(circleD(polar(noseC, nr * 0.45, headDir - 1.9), nr * 0.25), PAPER);
  }
  // mouth line + expression corner
  const corner = hp(R * 0.42, mouthLineY - x.curve * M.h * 0.18 * (open > 0.3 ? 0.4 : 1));
  if (open <= 0.05) {
    const ml = [hp(R * 0.5 + M.l * 0.95, mouthLineY - M.h * 0.08), hp(R * 0.45 + M.l * 0.5, mouthLineY + M.h * 0.02), corner];
    sk.line(curveD(ml), pen.dw * 1.2, { halo: dark });
    if (x.mouth === "grit") {
      // snarl: bared teeth
      const t0 = hp(R * 0.5 + M.l * 0.55, mouthLineY);
      const t1 = hp(R * 0.5 + M.l * 0.92, mouthLineY - M.h * 0.05);
      sk.shape(polyPath([t0, lerpP(t0, t1, 0.25), addP(lerpP(t0, t1, 0.35), P(0, M.h * 0.18)), lerpP(t0, t1, 0.5), addP(lerpP(t0, t1, 0.65), P(0, M.h * 0.18)), lerpP(t0, t1, 0.8), t1], true), PAPER, { outline: false, edge: pen.fw });
    }
  } else {
    sk.line(curveD([hp(R * 0.5 + M.l * 0.95, mouthLineY - M.h * 0.05), hp(R * 0.45 + M.l * 0.4, mouthLineY), corner]), pen.dw * 1.1, { halo: dark });
  }
  // muzzle/jaw inner lines
  sk.line(curveD([hp(R * 0.3, drop + M.h * 0.55), jaw(hp(R * 0.3 + M.l * 0.5, mouthLineY + M.h * 0.3))]), pen.fw, { halo: dark });
  if (s.whiskers) {
    const w0 = hp(R * 0.45 + M.l * 0.62, mouthLineY - M.h * 0.22);
    for (const [dx, dy] of [
      [1.2, -0.3],
      [1.3, 0.05],
      [1.1, 0.35],
    ] as const) {
      sk.line(quadD(w0, addP(w0, rotP(P(R * dx * 0.5, R * dy * 0.3 - R * 0.1), headDir)), addP(w0, rotP(P(R * dx, R * dy * 0.6), headDir))), pen.fw);
    }
  }
  }
  // near ear on top: round ears (rat, mouse, bear) sit on the skull's
  // back-top edge in three-quarter view (on the crown they read as a coin)
  if (m.ears) bigEar(false);
  else if (boxy) ear(hp(-R * 0.62, -R * 0.12), (-168 * DEG) + headDir, es, false);
  else if (s.ears.kind === "round" || s.ears.kind === "bear") ear(hp(-R * 0.36, -R * 0.62), (-112 * DEG) + headDir, es * 0.95, false);
  else if (s.ears.kind === "small") ear(hp(-R * 0.38, -R * 0.55), (-128 * DEG) + headDir, es, false);
  else ear(hp(R * 0.1, -R * 0.75), earAngNear, es, false);
  // face: three-quarter eyes on the skull
  const faceSvg = drawFace(
    { c: sp === "horse" ? addP(hp(R * 0.1, -R * 0.2), P(0, 0)) : boxy ? hp(R * 0.78, -R * 0.2) : hp(R * 0.18, -R * 0.12), gap: boxy ? R * 0.3 : R * 0.36, eyeR: R * s.eye * (sp === "horse" ? 1.05 : 1), turn: boxy ? 0.8 : 0.55, pen, headR: R, brows: true, dark, rot: sp === "horse" ? headDir * 0.25 : headDir },
    expression,
  );
  sk.raw(faceSvg);
  if (s.mane) {
    // re-draw forelock over the brow line
    sk.shape(polyPath([hp(-R * 0.35, -R * 0.98), hp(R * 0.35, -R * 1.02), hp(R * 0.05, -R * 0.55)], true), fillOf(darker(tone), pen), { outline: false, edge: pen.dw });
  }

  // ---- near legs (new silhouette layer so they read over the body)
  sk.layer();
  let hand: Point | undefined;
  drawLeg(false, q.feet.nh, false);
  if (gestureFront) {
    const top = legTop(true);
    const len = s.legF * (q.sitting && (sp === "rat" || sp === "mouse" || sp === "rabbit") ? 1.65 : q.sitting && sp === "bear" ? 1.1 : 0.9);
    let target: Point;
    if (gestureFront === "talk") target = addP(top, P(len * 0.82, -len * 0.3));
    else if (gestureFront === "wave") target = addP(top, P(len * 0.72, -len * 0.95));
    else if (gestureFront === "point") target = addP(top, P(len * 0.98, -len * 0.08));
    else target = hp(R * 0.3, R * 0.95);
    const elbow = ik(top, target, len * 0.55, len * 0.5, gestureFront === "think" ? -1 : 1);
    const lw = s.legW;
    sk.shape(taperD([top, elbow, target], [lw * 1.2, lw * 0.8, lw * 0.72], { samples: 5 }), fur, { edge: false });
    const pawA = Math.atan2(target.y - elbow.y, target.x - elbow.x);
    sk.shape(ellipseD(polar(target, s.paw * 0.5, pawA), s.paw * 1.0, s.paw * 0.9), fur);
    if (gestureFront === "point") sk.shape(taperD([polar(target, s.paw * 0.9, pawA), polar(target, s.paw * 2.0, pawA)], [s.paw * 0.55, s.paw * 0.45], { samples: 2 }), fur);
    hand = polar(target, s.paw, pawA);
  } else {
    drawLeg(true, q.feet.nf, false);
    if (q.sitting && (sp === "rat" || sp === "mouse" || sp === "rabbit" || sp === "bear")) hand = q.feet.nf;
  }
  if (q.gesture === "hold" || pose === "hold") {
    hand = hp(R * 0.5 + M.l * 0.8, mouthLineY + M.h * 0.1);
  }
  const mouth = boxy ? hp(R * 1.9, mouthLineY) : hp(R * 0.45 + M.l * 0.85, mouthLineY);
  const waist = at(mid, 0, 0).y;
  return { sk, head: Hc, headR: R, mouth, hand, waist: Math.min(waist, -s.paw), shoulders: Math.min(q.S.y, Hc.y + R) };
}

function taperDfox(spine: Point[], w: number): { body: string; tip: string } {
  const body = taperD(spine, [w * 0.35, w * 0.9, w, w * 0.4], { samples: 6 });
  const n = spine.length;
  const tail = [lerpP(spine[n - 2], spine[n - 1], 0.45), spine[n - 1]];
  const tip = taperD(tail, [w * 0.78, w * 0.4], { samples: 4 });
  return { body, tip };
}

// ---------------------------------------------------------------------------
// Front / back views

function drawQuadFront(sp: QuadSpecies, s: QuadSpec, tone: Tone, pose: Pose, expression: Expression, back: boolean, pen: Pen, m: Marks = NO_MARKS): AnimalBuilt {
  const sk = new Sketch(pen);
  const fur = fillOf(tone, pen);
  const farFur = fillOf(darker(tone), pen);
  const dark = isDark(tone);
  const neutral = sp.startsWith("quad_");
  // v0.3 (#81): a neutral quad_* is always drawn standing on four legs in front or back view (no sitting
  // upright, no raised paw): that pose read as a lucky cat. The face carries the expression.
  const sitting = SIT_POSES.includes(pose) && sp !== "horse" && !neutral;
  const lying = pose === "lie" || pose === "cower";
  const R = s.R;
  const heavy = sp === "quad_large";
  const cw = Math.max(s.chest, s.hip) * (neutral ? 0.9 : 1.15); // half width of chest
  const legH = lying ? s.paw * 1.5 : neutral ? s.legF * 0.9 : sitting ? s.legF * 0.5 : s.legF * 0.6;
  const chestY = -legH - s.chest * 0.6;
  const bodyTop = chestY - s.chest * 0.9;
  // hind quarters behind (visible at the sides)
  const hy = lying ? -s.hip * 0.8 : sitting ? -s.hip * 0.95 : -s.legH * 0.9;
  if (neutral && !lying) for (const side of [-1, 1]) sk.shape(taperD([P(side * s.hip * 0.75, hy), P(side * s.hip * 0.8, -s.paw * 0.6)], [s.legW * 1.2, s.legW * 0.95], { samples: 2 }), farFur, { edge: false });
  sk.shape(ellipseD(P(0, hy), s.hip * 1.1, s.hip * 0.95), farFur);
  // hind paws
  for (const side of [-1, 1]) sk.shape(ellipseD(P(side * s.hip * (neutral ? 0.8 : 0.95), -s.paw * 0.6), s.paw * (s.longFoot ? 1.3 : heavy ? 1.2 : 1), s.paw * 0.62), farFur);
  // tail peeking
  if (s.tail.kind !== "stub" && s.tail.kind !== "puff") {
    const tb = P(-s.hip * 0.6, hy);
    const rat = s.tail.kind === "rat";
    const pts = rat
      ? [P(-s.hip * 0.5, -s.tail.w), P(-s.hip * 1.3, -s.tail.w * 0.8), P(-s.hip * 1.3 - s.tail.l * 0.35, -s.tail.w * 0.7), P(-s.hip * 1.3 - s.tail.l * 0.55, -s.tail.w * 2.5)]
      : back
        ? [P(0, hy - s.hip * 0.5), P(s.tail.l * 0.15, hy - s.tail.l * 0.5), P(s.tail.l * 0.05, hy - s.tail.l * 0.9)]
        : [tb, P(-s.hip * 1.3, hy - s.tail.l * 0.2), P(-s.hip * 1.5, hy - s.tail.l * 0.6)];
    const w = s.tail.kind === "fox" ? s.tail.w * 0.8 : s.tail.w;
    if (rat) sk.shape(taperD(pts, [w, w * 0.8, w * 0.45, w * 0.15], { samples: 5 }), fillOf(lighter(tone), pen));
    else if (!back) sk.shape(taperD(pts.map((p) => P(p.x, Math.min(p.y, -w))), [w * 0.8, w, w * 0.6], { samples: 5 }), fur);
    else sk.shape(taperD(pts, [w * 0.8, w, w * 0.6], { samples: 5 }), fur);
  }
  // chest / body
  sk.shape(blobD([P(0, bodyTop), P(cw, chestY - s.chest * 0.3), P(cw * 0.95, chestY + s.chest * 0.6), P(0, chestY + s.chest * 1.0), P(-cw * 0.95, chestY + s.chest * 0.6), P(-cw, chestY - s.chest * 0.3)], 0.5), fur, { edge: false });
  if (!back && sp !== "horse" && !neutral) sk.shape(blobD([P(0, bodyTop + s.chest * 0.5), P(cw * 0.55, chestY), P(0, chestY + s.chest * 0.9), P(-cw * 0.55, chestY)], 0.5), fillOf(lighter(tone), pen), { edge: false });
  if (back && s.tail.kind === "puff") sk.shape(circleD(P(0, hy - s.hip * 0.3), s.tail.l), fillOf("white", pen));
  if (back && s.tail.kind === "stub") sk.shape(circleD(P(0, hy - s.hip * 0.3), s.tail.l * 0.6), fur);
  // front legs
  let hand: Point | undefined;
  sk.layer();
  for (const side of [-1, 1]) {
    const top = P(side * cw * 0.55, chestY + s.chest * 0.2);
    const gesture = !neutral && side === 1 && (pose === "talk" || pose === "wave" || pose === "point");
    const foot = gesture ? P(side * cw * 1.3, chestY - s.chest * (pose === "wave" ? 1.6 : 0.4)) : P(side * cw * 0.6, -s.paw * (s.hoof ? 1.0 : 0.6));
    sk.shape(taperD([top, lerpP(top, foot, 0.5), foot], neutral ? [s.legW * 1.1, s.legW * 0.98, s.legW * 0.95] : [s.legW * 1.2, s.legW * 0.85, s.legW * 0.75], { samples: 3 }), fur, { edge: false });
    if (s.hoof) sk.shape(polyPath([P(foot.x - s.paw * 0.9, foot.y), P(foot.x + s.paw * 0.9, foot.y), P(foot.x + s.paw, foot.y + s.paw), P(foot.x - s.paw, foot.y + s.paw)], true), fillOf("dark", pen));
    else sk.shape(ellipseD(P(foot.x, foot.y), s.paw * (heavy ? 1.3 : 0.95), s.paw * 0.6), fur);
    if (gesture) hand = foot;
  }
  // head
  const neckUp = sp === "horse" ? s.neck.l * 0.8 : sp === "bear" ? R * 0.4 : neutral ? -R * 0.15 : R * 0.6;
  // v0.3 (#81) long_neck: the head is carried on a tall tapered column
  const Hc = P(0, bodyTop - neckUp - (m.neck ? R * 2.6 : 0));
  if (sp === "horse") sk.shape(taperD([P(0, chestY), Hc], [cw * 1.3, R * 1.3], { samples: 2 }), fur, { edge: false });
  if (m.neck) sk.shape(taperD([P(0, chestY - s.chest * 0.3), Hc], [R * 1.5, R * 1.1], { samples: 3 }), fur, { edge: false });
  const es = s.ears.size;
  if (m.horns) {
    for (const side of [-1, 1]) sk.shape(taperD([P(side * R * 0.5, Hc.y - R * 0.78), P(side * R * 0.62, Hc.y - R * 1.4), P(side * R * 0.48, Hc.y - R * 2.0)], [R * 0.55, R * 0.38, R * 0.06], { samples: 5 }), hornFill(tone, pen));
  }
  if (m.ears) {
    for (const side of [-1, 1]) {
      const c = P(side * R * 1.7, Hc.y - R * 0.1);
      sk.shape(ellipseD(c, R * 0.85, R * 1.2), side === 1 ? fur : farFur);
      sk.shape(ellipseD(c, R * 0.5, R * 0.85), fillOf(dark ? "mid" : "light", pen), { edge: pen.fw });
    }
  } else for (const side of [-1, 1]) {
    const base = P(side * R * 0.6, Hc.y - R * 0.6);
    const E = s.ears.kind;
    if (E === "small") {
      sk.shape(ellipseD(P(side * R * 0.95, Hc.y - R * 0.5), es * 0.55, es * 0.4), fur);
    } else if (E === "round" || E === "bear") {
      sk.shape(circleD(P(side * R * 0.75, Hc.y - R * 0.7), es * 0.62), fur);
      if (!back) sk.shape(circleD(P(side * R * 0.75, Hc.y - R * 0.7), es * 0.36), fillOf(dark ? "mid" : "light", pen), { edge: pen.fw });
    } else if (E === "flop") {
      sk.shape(blobD([P(side * R * 0.5, Hc.y - R * 0.85), P(side * R * 1.3, Hc.y - R * 0.5), P(side * R * 1.25, Hc.y + R * 0.6), P(side * R * 0.85, Hc.y + R * 0.4)], 0.5), fillOf(darker(tone), pen));
    } else {
      const w = E === "long" ? es * 0.22 : es * 0.45;
      const tip = P(side * (R * 0.6 + (E === "long" ? es * 0.15 : es * 0.35)), Hc.y - R * 0.6 - es);
      sk.shape(blobD([P(base.x - w, base.y), P((base.x + tip.x) / 2 - w * 1.1, (base.y + tip.y) / 2), tip, P((base.x + tip.x) / 2 + w * 1.1, (base.y + tip.y) / 2), P(base.x + w, base.y)], E === "long" ? 0.45 : 0.1), fur);
      if (!back) sk.shape(blobD([P(base.x - w * 0.45, base.y), lerpP(base, tip, 0.8), P(base.x + w * 0.45, base.y)], 0.2), fillOf(dark ? "mid" : "light", pen), { edge: pen.fw });
    }
  }
  const headRx = sp === "horse" ? R * 0.85 : R;
  sk.shape(ellipseD(Hc, headRx, R), fur, { edge: false });
  if (sp === "horse") sk.shape(blobD([P(-R * 0.95, Hc.y - R * 0.1), P(R * 0.95, Hc.y - R * 0.1), P(R * 0.62, Hc.y + R * 1.6), P(R * 0.68, Hc.y + R * 2.3), P(0, Hc.y + R * 2.6), P(-R * 0.68, Hc.y + R * 2.3), P(-R * 0.62, Hc.y + R * 1.6)], 0.4), fur, { edge: pen.dw });
  if (sp === "fox" && !back) {
    for (const side of [-1, 1]) sk.shape(blobD([P(side * R * 0.55, Hc.y + R * 0.05), P(side * R * 1.15, Hc.y + R * 0.55), P(side * R * 0.85, Hc.y + R * 0.7), P(side * R * 0.95, Hc.y + R * 0.95), P(side * R * 0.35, Hc.y + R * 0.85)], 0.3), fillOf("white", pen));
  }
  let mouth = P(0, Hc.y + R * 0.6);
  if (!back) {
    const M = s.muz;
    const mh = sp === "horse" ? R * 0.8 : neutral ? R * 0.85 : M.h * 0.95;
    const mw = sp === "horse" ? R * 0.72 : neutral ? R * 0.6 : Math.max(M.h * 0.75, R * 0.45);
    const mc = P(0, Hc.y + R * 0.35 + (sp === "horse" ? R * 1.75 : 0));
    sk.shape(ellipseD(mc, mw, mh * 0.62), fillOf(sp === "horse" ? lighter(tone) === "white" ? "light" : lighter(tone) : sp === "rat" || sp === "mouse" || neutral ? tone : "white", pen), { edge: pen.dw });
    const nr = Math.max(mw * 0.28, R * 0.1) * s.nose;
    if (sp === "horse") {
      for (const side of [-1, 1]) sk.fill(ellipseD(P(side * mw * 0.45, mc.y + mh * 0.25), nr * 0.9, nr * 1.2));
    } else sk.shape(blobD([P(-nr * 1.2, mc.y - mh * 0.35), P(nr * 1.2, mc.y - mh * 0.35), P(0, mc.y - mh * 0.02)], 0.6), INK, { outline: false });
    const open = mouthOpen(expression, pose === "talk");
    sk.raw(drawFace({ c: P(0, Hc.y - R * 0.18), gap: R * 0.4, eyeR: R * s.eye, turn: 0, pen, headR: R, dark, mouth: { dy: mc.y + mh * 0.3 - (Hc.y - R * 0.18), w: mw * 0.55 }, talking: pose === "talk" || open > 0.5 }, expression));
    mouth = P(0, mc.y + mh * 0.3);
    // v0.3 (#81) long_nose: a tube hangs from the muzzle down over the chest (never below the ground)
    if (m.nose) {
      const root = P(0, mc.y - mh * 0.2);
      const wRoot = Math.max(mw * 1.2, R * 0.6);
      const len = Math.min(R * 2.6, -wRoot * 0.3 - root.y);
      const sp3 = [root, P(wRoot * 0.08, root.y + len * 0.34), P(-wRoot * 0.06, root.y + len * 0.68), P(wRoot * 0.04, root.y + len)];
      sk.shape(taperD(sp3, [wRoot, wRoot * 0.8, wRoot * 0.66, wRoot * 0.6], { samples: 4 }), fillOf(lighter(tone), pen), { edge: pen.dw });
      sk.shape(blobD(ellipsePts(P(0, 0), wRoot * 0.2, wRoot * 0.13, 10).map((p) => addP(P(sp3[3].x, sp3[3].y - wRoot * 0.12), p)), 0.5), INK, { outline: false });
      for (const f of [0.45, 0.72]) sk.line(lineD([P(sp3[3].x - wRoot * 0.28, root.y + len * f), P(sp3[3].x + wRoot * 0.28, root.y + len * f)]), pen.fw, { halo: dark });
    }
    if (s.whiskers) {
      for (const side of [-1, 1]) for (const dy of [-0.15, 0.1]) sk.line(lineD([P(side * mw * 0.7, mc.y + dy * mh), P(side * (mw + R * 0.7), mc.y + dy * mh * 2 - R * 0.05)]), pen.fw);
    }
  }
  const waist = chestY + s.chest * 0.5;
  return { sk, head: Hc, headR: R, mouth, hand, waist, shoulders: bodyTop };
}

// ---------------------------------------------------------------------------
// Front / back view of a boxy quad_* (v0.3 #81)
//
// quad_large: a wide low boxy head in front of a wide barrel; four short pillar legs all visible (the fore pair in
// front, the hind pair at the outer sides behind); the head is level with or below the top of the body outline.
// quad_medium: a narrow oval face in front of a narrow body on four slim legs; the neck carries the head a little above the back.

function drawBoxyFront(sp: QuadSpecies, s: QuadSpec, tone: Tone, pose: Pose, expression: Expression, back: boolean, pen: Pen, m: Marks = NO_MARKS): AnimalBuilt {
  const sk = new Sketch(pen);
  const fur = fillOf(tone, pen);
  const farFur = fillOf(darker(tone), pen);
  const dark = isDark(tone);
  const large = sp === "quad_large";
  const lying = pose === "lie" || pose === "cower";
  const R = s.R;
  const cw = s.chest * (large ? 1.0 : 0.8); // half width of the barrel
  const barrelH = s.chest * 2;
  const legLen = lying ? s.paw * 1.4 : s.legF - s.chest;
  const bodyBot = -legLen;
  const bodyTop = bodyBot - barrelH;
  const lw = s.legW;
  const legW = large ? [lw, lw, lw] : [lw * 1.15, lw * 0.85, lw * 0.75];
  // hind legs behind, at the outer sides
  if (!lying) {
    for (const side of [-1, 1]) {
      sk.shape(taperD([P(side * cw * 0.84, bodyBot - s.hip * 0.4), P(side * cw * 0.84, -s.paw * 0.55)], [legW[0], legW[2]], { samples: 2 }), farFur, { edge: false });
      sk.shape(ellipseD(P(side * cw * 0.84, -s.paw * 0.55), s.paw * (large ? 1.2 : 0.95), s.paw * 0.58), farFur);
    }
  }
  // tail: hangs behind the rump (seen from behind), thin and short (a long_tail hangs in front of the rump, below)
  const tailD = taperD([P(0, bodyTop + barrelH * 0.2), P(s.tail.w * 0.4, bodyTop + barrelH * 0.2 + s.tail.l * 0.5), P(0, bodyTop + barrelH * 0.2 + s.tail.l)], [s.tail.w * 1.1, s.tail.w * 0.8, s.tail.w * 0.4], { samples: 4 });
  if (back && !m.tail) sk.shape(tailD, fur);
  // v0.3 (#81) long_tail, seen from the front: the tail hangs at the side of the rump
  if (m.tail && !back) {
    const x0 = -cw * 0.88;
    const y0 = bodyTop + barrelH * 0.4;
    const l = Math.min(s.tail.l * 0.85, -y0 - s.paw * 1.5);
    sk.shape(taperD([P(x0, y0), P(x0 - cw * 0.3, y0 + l * 0.35), P(x0 - cw * 0.22, y0 + l * 0.7), P(x0 - cw * 0.3, y0 + l)], [s.tail.w * 1.1, s.tail.w * 0.9, s.tail.w * 0.6, s.tail.w * 0.4], { samples: 4 }), fur);
  }
  // barrel
  const t = bodyTop;
  const b = bodyBot;
  sk.shape(
    blobD([P(0, t), P(cw * 0.78, t + barrelH * 0.07), P(cw, t + barrelH * 0.3), P(cw, b - barrelH * 0.25), P(cw * 0.8, b - barrelH * 0.02), P(0, b + barrelH * 0.02), P(-cw * 0.8, b - barrelH * 0.02), P(-cw, b - barrelH * 0.25), P(-cw, t + barrelH * 0.3), P(-cw * 0.78, t + barrelH * 0.07)], 0.4),
    fur,
    { edge: false },
  );
  if (back && m.tail) sk.shape(tailD, fur);
  // fore legs
  sk.layer();
  for (const side of [-1, 1]) {
    const x = side * cw * (large ? 0.5 : 0.52);
    if (!lying) sk.shape(taperD([P(x, bodyBot - s.chest * 0.3), P(x, -s.paw * 0.55)], [legW[0], legW[2]], { samples: 2 }), fur, { edge: false });
    sk.shape(ellipseD(P(x, -s.paw * 0.55), s.paw * (large ? 1.25 : 0.95), s.paw * 0.58), fur);
  }
  // head
  const hw = large ? R * 1.2 : R * 0.78;
  const hh = large ? R * 0.82 : R * 1.08;
  // v0.3 (#81) long_neck: the head is carried on a tall tapered column
  const neckUp = m.neck ? R * (large ? 2.7 : 2.4) : 0;
  const Hc = large ? P(0, bodyTop + hh * 1.12 - neckUp) : P(0, bodyTop - R * 0.2 - neckUp);
  let mouth = P(0, Hc.y + hh * 0.6);
  if (m.neck) sk.shape(taperD([P(0, bodyTop + barrelH * 0.35), Hc], large ? [R * 1.5, R * 1.05] : [R * 1.3, R * 0.95], { samples: 3 }), fur, { edge: false });
  else if (!large) sk.shape(taperD([P(0, bodyTop + barrelH * 0.3), Hc], [cw * 0.95, hw * 1.0], { samples: 2 }), fur, { edge: false });
  const es = s.ears.size;
  if (m.horns) {
    for (const side of [-1, 1]) {
      const b0 = P(side * hw * 0.52, Hc.y - hh * 0.8);
      sk.shape(taperD([b0, P(side * hw * 0.64, Hc.y - hh * 0.8 - R * 0.6), P(side * hw * 0.5, Hc.y - hh * 0.8 - R * 1.2)], [R * 0.55, R * 0.38, R * 0.06], { samples: 5 }), hornFill(tone, pen));
    }
  }
  for (const side of [-1, 1]) {
    if (m.ears) {
      const c = P(side * (hw + R * 0.8), Hc.y - hh * 0.05);
      sk.shape(ellipseD(c, R * 0.85, R * 1.2), side === 1 ? fur : farFur);
      sk.shape(ellipseD(c, R * 0.5, R * 0.85), fillOf(dark ? "mid" : "light", pen), { edge: pen.fw });
    } else sk.shape(ellipseD(P(side * (hw + es * 0.38), Hc.y - hh * 0.2), es * 0.55, es * 0.34), side === 1 ? fur : farFur);
  }
  if (large) {
    const h = hh;
    sk.shape(blobD([P(-hw * 0.5, Hc.y - h), P(hw * 0.5, Hc.y - h), P(hw, Hc.y - h * 0.6), P(hw * 1.02, Hc.y + h * 0.35), P(hw * 0.85, Hc.y + h), P(-hw * 0.85, Hc.y + h), P(-hw * 1.02, Hc.y + h * 0.35), P(-hw, Hc.y - h * 0.6)], 0.4), fur, { edge: pen.dw });
  } else {
    sk.shape(blobD([P(0, Hc.y - hh), P(hw * 0.92, Hc.y - hh * 0.45), P(hw * 0.72, Hc.y + hh * 0.55), P(0, Hc.y + hh), P(-hw * 0.72, Hc.y + hh * 0.55), P(-hw * 0.92, Hc.y - hh * 0.45)], 0.5), fur, { edge: pen.dw });
  }
  if (!back) {
    const mc = P(0, Hc.y + hh * (large ? 0.42 : 0.55));
    const mw = hw * (large ? 0.68 : 0.46);
    const mh = hh * (large ? 0.46 : 0.4);
    sk.shape(ellipseD(mc, mw, mh), fur, { edge: large ? false : pen.dw });
    const nr = Math.max(mw * 0.16, R * 0.1) * s.nose * 1.4;
    if (large) for (const side of [-1, 1]) sk.fill(ellipseD(P(side * mw * 0.45, mc.y - mh * 0.2), nr * 0.9, nr * 1.2));
    else sk.shape(blobD([P(-nr * 1.1, mc.y - mh * 0.45), P(nr * 1.1, mc.y - mh * 0.45), P(0, mc.y + mh * 0.05)], 0.6), INK, { outline: false });
    const open = mouthOpen(expression, pose === "talk");
    const eyeY = Hc.y - hh * (large ? 0.25 : 0.3);
    const mouthY = mc.y + mh * 0.62;
    sk.raw(drawFace({ c: P(0, eyeY), gap: large ? R * 1.25 : R * 0.6, eyeR: R * s.eye, turn: 0, pen, headR: R, dark, mouth: { dy: mouthY - eyeY, w: mw * 0.5 }, talking: pose === "talk" || open > 0.5 }, expression));
    mouth = P(0, mouthY);
    // v0.3 (#81) long_nose: a tube hangs from the muzzle down over the chest (never below the ground)
    if (m.nose) {
      const root = P(0, mc.y - mh * 0.25);
      const wRoot = mw * 1.25;
      const len = Math.min(R * (large ? 2.6 : 2.3), -wRoot * 0.3 - root.y);
      const sp3 = [root, P(wRoot * 0.08, root.y + len * 0.34), P(-wRoot * 0.06, root.y + len * 0.68), P(wRoot * 0.04, root.y + len)];
      sk.shape(taperD(sp3, [wRoot, wRoot * 0.8, wRoot * 0.66, wRoot * 0.6], { samples: 4 }), fillOf(lighter(tone), pen), { edge: pen.dw });
      sk.shape(blobD(ellipsePts(P(0, 0), wRoot * 0.2, wRoot * 0.13, 10).map((p) => addP(P(sp3[3].x, sp3[3].y - wRoot * 0.12), p)), 0.5), INK, { outline: false });
      for (const f of [0.45, 0.72]) sk.line(lineD([P(sp3[3].x - wRoot * 0.28, root.y + len * f), P(sp3[3].x + wRoot * 0.28, root.y + len * f)]), pen.fw, { halo: dark });
    }
  }
  return { sk, head: Hc, headR: R, mouth, hand: undefined, waist: bodyBot - s.chest, shoulders: bodyTop };
}
