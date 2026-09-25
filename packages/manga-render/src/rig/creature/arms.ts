/**
 * Simple personified limbs for objects, emblems and some spirits: thin ink
 * arms with round mitten hands (and optional stubby legs). One table maps a
 * pose to arm angles so every personified thing gestures the same way.
 */
import type { Facing, Point, Pose } from "../../contracts.js";
import { n } from "../../svg.js";
import { DEG, P, PAPER, type Sketch, circleD, dist, lerpP, polar, taperD, INK } from "./common.js";

export interface ArmOpts {
  /** Shoulder on the facing side (x larger when facing right). */
  near: Point;
  /** Shoulder on the far side. */
  far: Point;
  /** Upper arm + forearm length. */
  len: number;
  /** Arm thickness. */
  w: number;
  handR: number;
  pose: Pose;
  facing: Facing;
  armFill?: string;
  handFill?: string;
  /** Targets for poses that touch the body. */
  chin?: Point;
  hipNear?: Point;
  hipFar?: Point;
  /** Keep hands at least this far above y = 0 (default: hand radius). */
  groundY?: number;
}

interface ArmAngles {
  a1: number;
  a2: number;
  hand: "fist" | "open" | "point";
}

/** Angles in degrees; 0 = forward (+x), 90 = down. */
const ARM_TABLE: Partial<Record<Pose, [ArmAngles, ArmAngles]>> = {
  stand: [{ a1: 68, a2: 100, hand: "fist" }, { a1: 112, a2: 80, hand: "fist" }],
  talk: [{ a1: 48, a2: -28, hand: "open" }, { a1: 104, a2: 88, hand: "fist" }],
  point: [{ a1: -4, a2: -8, hand: "point" }, { a1: 104, a2: 88, hand: "fist" }],
  wave: [{ a1: -38, a2: -96, hand: "open" }, { a1: 104, a2: 88, hand: "fist" }],
  reach: [{ a1: -22, a2: -30, hand: "open" }, { a1: -8, a2: -18, hand: "open" }],
  hold: [{ a1: 62, a2: 4, hand: "fist" }, { a1: 104, a2: 88, hand: "fist" }],
  carry: [{ a1: 70, a2: 6, hand: "fist" }, { a1: 64, a2: 2, hand: "fist" }],
  cower: [{ a1: 30, a2: -78, hand: "open" }, { a1: 38, a2: -70, hand: "open" }],
  jump: [{ a1: -58, a2: -84, hand: "open" }, { a1: -118, a2: -100, hand: "open" }],
  fall: [{ a1: -30, a2: -80, hand: "open" }, { a1: -150, a2: -120, hand: "open" }],
  bow: [{ a1: 84, a2: 178, hand: "fist" }, { a1: 110, a2: 150, hand: "fist" }],
  // lying (the body is turned on its side): the lower arm rests along the
  // ground toward the feet, clear of the face
  lie: [{ a1: 158, a2: 176, hand: "fist" }, { a1: 200, a2: 190, hand: "fist" }],
  sit: [{ a1: 70, a2: 20, hand: "fist" }, { a1: 100, a2: 30, hand: "fist" }],
  walk: [{ a1: 60, a2: 70, hand: "fist" }, { a1: 118, a2: 110, hand: "fist" }],
  run: [{ a1: 30, a2: -40, hand: "fist" }, { a1: 140, a2: 100, hand: "fist" }],
  fly: [{ a1: 20, a2: 5, hand: "open" }, { a1: 150, a2: 160, hand: "open" }],
  kneel: [{ a1: 72, a2: 98, hand: "fist" }, { a1: 108, a2: 84, hand: "fist" }],
  perch: [{ a1: 72, a2: 98, hand: "fist" }, { a1: 108, a2: 84, hand: "fist" }],
  cover_face: [{ a1: 30, a2: -78, hand: "open" }, { a1: 38, a2: -70, hand: "open" }],
};

export interface ArmResult {
  /** Draw the far arm (call before the body in side views). */
  far(sk: Sketch): void;
  /** Draw the near arm (call after the body, on a new layer). */
  near(sk: Sketch): void;
  hand: Point;
  /** Whether the far arm should be drawn in front of the body. */
  farInFront: boolean;
}

function ik(shoulder: Point, target: Point, l1: number, l2: number, bendSign: number): Point {
  const d = Math.min(dist(shoulder, target), (l1 + l2) * 0.999);
  const base = Math.atan2(target.y - shoulder.y, target.x - shoulder.x);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
  return polar(shoulder, l1, base + bendSign * a);
}

function drawArm(
  sk: Sketch,
  shoulder: Point,
  elbow: Point,
  wrist: Point,
  o: ArmOpts,
  hand: ArmAngles["hand"],
  dirAngle: number,
): void {
  const fill = o.armFill ?? INK;
  sk.shape(taperD([shoulder, elbow, wrist], [o.w, o.w * 0.9, o.w * 0.8], { samples: 5 }), fill, { edge: false });
  const hf = o.handFill ?? PAPER;
  const hc = polar(wrist, o.handR * 0.6, dirAngle);
  if (hand === "point") {
    const tip = polar(hc, o.handR * 2.1, dirAngle - 4 * DEG);
    sk.shape(taperD([polar(hc, o.handR * 0.3, dirAngle), tip], [o.handR * 0.7, o.handR * 0.55], { samples: 2 }), hf);
    sk.shape(circleD(hc, o.handR), hf);
  } else if (hand === "open") {
    // mitten with a thumb
    const thumb = polar(hc, o.handR * 0.95, dirAngle - 70 * DEG);
    sk.shape(circleD(thumb, o.handR * 0.45), hf);
    sk.shape(circleD(polar(hc, o.handR * 0.25, dirAngle), o.handR * 1.1), hf);
  } else {
    sk.shape(circleD(hc, o.handR), hf);
  }
}

/** Build both arms for a pose. Front/back views splay the far arm outward. */
export function arms(o: ArmOpts): ArmResult {
  const table = ARM_TABLE[o.pose] ?? ARM_TABLE.stand!;
  const [nearA, farA] = table;
  const l1 = o.len * 0.5;
  const l2 = o.len * 0.5;
  const sideways = o.facing === "front" || o.facing === "back";
  const mirror = (a: number) => 180 - a;
  const farAngles: ArmAngles = sideways
    ? { a1: mirror(o.pose === "reach" || o.pose === "cower" || o.pose === "jump" || o.pose === "fall" || o.pose === "carry" ? nearA.a1 : farA.a1), a2: mirror(o.pose === "reach" || o.pose === "cower" || o.pose === "jump" || o.pose === "fall" || o.pose === "carry" ? nearA.a2 : farA.a2), hand: farA.hand }
    : farA;

  const solve = (shoulder: Point, a: ArmAngles, nearSide: boolean) => {
    let elbow = polar(shoulder, l1, a.a1 * DEG);
    let wrist = polar(elbow, l2, a.a2 * DEG);
    let dir = a.a2 * DEG;
    if (o.pose === "hands_on_hips") {
      const hip = nearSide ? o.hipNear : o.hipFar;
      if (hip) {
        const out = nearSide ? 1 : -1;
        elbow = ik(shoulder, hip, l1, l2, sideways ? -out : nearSide ? -1 : 1);
        if (sideways) elbow = P(shoulder.x + out * l1 * 0.85, (shoulder.y + hip.y) / 2);
        wrist = hip;
        dir = Math.atan2(wrist.y - elbow.y, wrist.x - elbow.x);
      }
    } else if (o.pose === "arms_crossed" && o.hipNear && o.hipFar) {
      const chestY = lerpP(shoulder, o.hipNear, 0.55).y;
      const midX = (o.near.x + o.far.x) / 2;
      elbow = P(shoulder.x + (nearSide ? 1 : -1) * l1 * 0.15, chestY + l1 * 0.2);
      wrist = P(midX + (nearSide ? -1 : 1) * Math.abs(o.near.x - o.far.x) * 0.42, chestY - l1 * 0.12 * (nearSide ? 1 : -1));
      dir = Math.atan2(wrist.y - elbow.y, wrist.x - elbow.x);
    } else if ((o.pose === "think") && nearSide && o.chin) {
      // hand to the side of the face at chin height, the arm staying outside
      // the body: on a round body (a wheel) a hand reaching the real chin
      // would draw the arm across the face disc like a stick through it
      const out = sideways ? 1 : Math.sign(shoulder.x - o.chin.x) || 1;
      wrist = P(shoulder.x + out * o.handR * 0.6, o.chin.y);
      elbow = P(shoulder.x + out * l1 * 0.85, (shoulder.y + wrist.y) / 2 + l1 * 0.45);
      dir = Math.atan2(wrist.y - elbow.y, wrist.x - elbow.x);
    }
    // never let a hand sink through the ground: swing the forearm up
    const floor = (o.groundY ?? 0) - o.handR * 1.6;
    for (let i = 0; i < 12 && wrist.y > floor; i += 1) {
      const side = nearSide || sideways ? (Math.cos(dir) >= 0 ? -1 : 1) : Math.cos(dir) >= 0 ? -1 : 1;
      dir += side * 12 * DEG;
      wrist = polar(elbow, l2, dir);
    }
    for (let i = 0; i < 8 && wrist.y > floor; i += 1) {
      elbow = P(elbow.x, elbow.y - (wrist.y - floor) / 2);
      wrist = P(wrist.x, wrist.y - (wrist.y - floor) / 2);
    }
    return { elbow, wrist, dir };
  };
  const nearAngles: ArmAngles =
    o.pose === "hands_on_hips" || o.pose === "arms_crossed" || o.pose === "think"
      ? { a1: 80, a2: 90, hand: "fist" }
      : nearA;
  const nearS = solve(o.near, nearAngles, true);
  const farS = solve(o.far, o.pose === "hands_on_hips" || o.pose === "arms_crossed" ? { a1: 100, a2: 90, hand: "fist" } : farAngles, false);
  // a lying body's upper arm stays behind it (in front it would cross the face)
  const farInFront = (sideways && o.pose !== "lie") || o.pose === "arms_crossed" || o.pose === "cower";
  const hand = polar(nearS.wrist, o.handR * 0.8, nearS.dir);
  return {
    far: (sk) => drawArm(sk, o.far, farS.elbow, farS.wrist, o, farAngles.hand, farS.dir),
    near: (sk) => drawArm(sk, o.near, nearS.elbow, nearS.wrist, o, nearAngles.hand, nearS.dir),
    hand,
    farInFront,
  };
}

/** Poses a personified thing with arms can draw. */
export const ARM_POSES: readonly Pose[] = [
  "stand",
  "talk",
  "point",
  "wave",
  "reach",
  "hold",
  "carry",
  "cower",
  "jump",
  "fall",
  "bow",
  "lie",
  "think",
  "hands_on_hips",
  "arms_crossed",
];

/** Stubby ink legs with round feet (box, book, clock...). */
export function stubLegs(
  sk: Sketch,
  hipNear: Point,
  hipFar: Point,
  groundY: number,
  w: number,
  footR: number,
  pose: Pose,
  fill: string = INK,
): void {
  const legs: [Point, Point][] = [];
  const spread = pose === "jump" ? 0.6 : pose === "walk" || pose === "run" ? 1.4 : 0.2;
  for (const [hip, sgn] of [
    [hipFar, -1],
    [hipNear, 1],
  ] as const) {
    const foot = P(hip.x + sgn * spread * footR, pose === "jump" ? hip.y + (groundY - hip.y) * 0.55 : groundY - footR * 0.6);
    legs.push([hip, foot]);
  }
  for (const [hip, foot] of legs) {
    sk.shape(taperD([hip, foot], [w, w * 0.9], { samples: 2 }), fill, { edge: false });
    const f = (x: number, y: number) => `${n(x)} ${n(y)}`;
    sk.shape(
      `M${f(foot.x - footR * 0.7, foot.y + footR * 0.6)}C${f(foot.x - footR * 0.7, foot.y - footR * 0.6)} ${f(foot.x + footR * 1.6, foot.y - footR * 0.7)} ${f(foot.x + footR * 1.7, foot.y + footR * 0.6)}Z`,
      INK,
    );
  }
}
