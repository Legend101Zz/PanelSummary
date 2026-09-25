/**
 * Pose table. Every pose is authored once in body space (world-aligned
 * swing/spread angles or IK targets) and projected for front, 3/4-right and
 * back views by the skeleton solver.
 *
 * Angles: `swing` 0 = straight down, 90 = forward, 180 = up, negative = back.
 * `spread` swings the limb outward, away from the body. "near" is the limb
 * nearest the viewer in the canonical right-facing view (the figure's right).
 */
import type { Expression, Pose } from "../../contracts.js";
import { add3, mul3, v3, type V3 } from "./geom.js";
import type { Metrics } from "./look.js";

export type HandShape = "relaxed" | "fist" | "point" | "open" | "flat" | "grip";

/** Key points available to IK targets (body space). */
export interface KeyPoints {
  m: Metrics;
  pelvis: V3;
  neckBase: V3;
  spine: V3;
  headC: V3;
  chin: V3;
  face: V3;
  /** Forward (f) axis and the figure's left (l) axis. */
  F: V3;
  L: V3;
  /** Elbow of the near arm once solved (for think). */
  nearElbow?: V3;
  nearKnee?: V3;
}

export interface ArmSpec {
  upper?: [number, number];
  fore?: [number, number];
  /** IK target; `side` is +1 for the figure's left, -1 for its right. */
  target?: (k: KeyPoints, side: number) => V3;
  /** Pole in body space with `l` meaning "outward". */
  pole?: V3;
  hand: HandShape;
}

export interface LegSpec {
  thigh: [number, number];
  shin: [number, number];
  /** Foot pitch in degrees, + = toe up. */
  toe?: number;
}

export interface PoseDef {
  lean: number;
  bend: number;
  twist: number;
  headPitch: number;
  headRoll: number;
  near: { arm: ArmSpec; leg: LegSpec };
  far: { arm: ArmSpec; leg: LegSpec };
  /** Airborne clearance as a fraction of height. */
  lift: number;
  /** Whole-figure screen rotation (deg, + clockwise) about the pelvis. */
  roll: number;
  /** Draw from the mirrored side (used by lie so the head ends on the right). */
  mirror: boolean;
  /** 0..1 backward motion for capes, scarves and long hair. */
  flow: number;
  /** Which hand anchors a held prop. */
  grip: "near" | "both";
  /** Solve the near thigh so the near sole and far knee both touch ground. */
  kneel?: boolean;
  /** No body-stiffening straighten for statues. */
  airborne?: boolean;
  /** Shoulder raise as a fraction of height (+ = hunched up, - = dropped). */
  shrug: number;
}

export const HUMAN_POSES = [
  "stand",
  "walk",
  "run",
  "sit",
  "kneel",
  "lie",
  "fall",
  "jump",
  "point",
  "reach",
  "wave",
  "arms_crossed",
  "hands_on_hips",
  "think",
  "cover_face",
  "cower",
  "bow",
  "hold",
  "carry",
  "talk",
] as const satisfies readonly Pose[];

const relaxedNear: ArmSpec = { upper: [5, 5], fore: [11, -3], hand: "relaxed" };
const relaxedFar: ArmSpec = { upper: [-4, 5], fore: [3, -3], hand: "relaxed" };
const standNear: LegSpec = { thigh: [5, 3], shin: [1, 2] };
const standFar: LegSpec = { thigh: [-4, 3], shin: [-2, 2] };

function base(): PoseDef {
  return {
    lean: 0,
    bend: 0,
    twist: 0,
    headPitch: 0,
    headRoll: 0,
    near: { arm: relaxedNear, leg: standNear },
    far: { arm: relaxedFar, leg: standFar },
    lift: 0,
    roll: 0,
    mirror: false,
    flow: 0,
    grip: "near",
    shrug: 0,
  };
}

/**
 * Acting: body language layered on a pose by expression (craft P1-9). Head
 * pitch (+ = down), whole-body lean (+ = forward), head roll and a shoulder
 * raise/drop. Anchors follow automatically because they come from the
 * solved skeleton.
 */
const ACT: Record<Expression, { lean: number; head: number; roll: number; shrug: number }> = {
  neutral: { lean: 0, head: 0, roll: 0, shrug: 0 },
  happy: { lean: -1, head: -4, roll: 0, shrug: 0 },
  laugh: { lean: -4, head: -8, roll: 0, shrug: 0.004 },
  gentle: { lean: 0, head: 4, roll: 6, shrug: 0 },
  sad: { lean: 4, head: 11, roll: 0, shrug: -0.012 },
  cry: { lean: 6, head: 13, roll: 0, shrug: -0.01 },
  angry: { lean: 6, head: 3, roll: 0, shrug: 0.008 },
  shout: { lean: 5, head: -7, roll: 0, shrug: 0.004 },
  surprised: { lean: -5, head: -5, roll: 0, shrug: 0.01 },
  afraid: { lean: -8, head: 3, roll: 0, shrug: 0.016 },
  determined: { lean: 2, head: -8, roll: 0, shrug: 0 },
  thinking: { lean: 0, head: 2, roll: 7, shrug: 0 },
  worried: { lean: 1, head: 6, roll: -3, shrug: 0.008 },
  smug: { lean: -2, head: -6, roll: 5, shrug: 0 },
  tired: { lean: 7, head: 10, roll: 0, shrug: -0.016 },
  asleep: { lean: 3, head: 16, roll: 10, shrug: -0.012 },
  pain: { lean: 7, head: 6, roll: 0, shrug: 0.01 },
  love: { lean: 0, head: -2, roll: 6, shrug: 0 },
};

export function actPose(d: PoseDef, e: Expression, pose: Pose, _m: Metrics): void {
  const a = ACT[e] ?? ACT.neutral;
  // airborne and lying poses only move the head; poses that already fold the
  // body (bow, cower, cover face) take a smaller share of the lean
  const headOnly = d.airborne || pose === "lie" || pose === "fall" || pose === "jump";
  const folded = pose === "bow" || pose === "cower" || pose === "cover_face";
  const bodyK = headOnly ? 0 : folded ? 0.3 : 1;
  const headK = headOnly ? 0.7 : folded ? 0.5 : 1;
  d.lean += a.lean * bodyK;
  d.headPitch += a.head * headK;
  d.headRoll += a.roll * headK;
  d.shrug += a.shrug * bodyK;
}

/** Point in body space: pelvis + spine·a + F·b + L·c (L signed by side). */
const at = (k: KeyPoints, from: V3, up: number, fwd: number, lat: number): V3 =>
  add3(add3(add3(from, mul3(k.spine, up)), mul3(k.F, fwd)), mul3(k.L, lat));

export function poseDef(pose: Pose, m: Metrics): PoseDef {
  const d = base();
  const H = m.H;
  switch (pose) {
    case "stand":
      break;
    case "walk":
      d.lean = 4;
      d.headPitch = 2;
      d.near = { arm: { upper: [-24, 7], fore: [-10, 4], hand: "relaxed" }, leg: { thigh: [24, 2], shin: [7, 2], toe: 14 } };
      d.far = { arm: { upper: [22, 7], fore: [44, 4], hand: "relaxed" }, leg: { thigh: [-16, 2], shin: [-44, 2], toe: -34 } };
      d.flow = 0.35;
      break;
    case "run":
      d.lean = 16;
      d.headPitch = -4;
      d.near = { arm: { upper: [-52, 10], fore: [40, 6], hand: "fist" }, leg: { thigh: [66, 3], shin: [-4, 2], toe: 5 } };
      d.far = { arm: { upper: [46, 10], fore: [132, 6], hand: "fist" }, leg: { thigh: [-30, 3], shin: [-74, 2], toe: -45 } };
      d.lift = 0.035;
      d.flow = 1;
      break;
    case "sit":
      d.lean = -3;
      d.near = { arm: { upper: [18, 9], fore: [78, 4], hand: "relaxed" }, leg: { thigh: [88, 5], shin: [4, 4] } };
      d.far = { arm: { upper: [12, 9], fore: [70, 6], hand: "relaxed" }, leg: { thigh: [86, 6], shin: [0, 4] } };
      break;
    case "kneel":
      d.lean = 4;
      d.headPitch = 10;
      d.kneel = true;
      d.near = {
        arm: { target: (k) => add3(k.nearKnee ?? k.pelvis, v3(0.01 * H, 0.03 * H, 0)), pole: v3(0.3, -0.2, 1), hand: "relaxed" },
        leg: { thigh: [82, 3], shin: [3, 2] },
      };
      d.far = { arm: { upper: [2, 8], fore: [6, 5], hand: "relaxed" }, leg: { thigh: [1, 3], shin: [-100, 2], toe: -70 } };
      break;
    case "lie":
      d.mirror = true;
      d.roll = 90;
      d.headPitch = -6;
      d.airborne = true;
      d.near = {
        arm: { target: (k) => at(k, k.pelvis, m.torsoLen * 0.3, m.waistD + m.belly + 0.02 * H, 0.01 * H), pole: v3(-0.2, 0, 1), hand: "relaxed" },
        leg: { thigh: [34, 4], shin: [-18, 2], toe: 0 },
      };
      d.far = { arm: { upper: [6, 12], fore: [12, 6], hand: "relaxed" }, leg: { thigh: [-2, 3], shin: [-1, 2], toe: 0 } };
      break;
    case "fall":
      d.roll = -34;
      d.lift = 0.1;
      d.lean = -8;
      d.headPitch = -16;
      d.airborne = true;
      d.near = { arm: { upper: [148, 34], fore: [176, 20], hand: "open" }, leg: { thigh: [58, 6], shin: [18, 5], toe: 10 } };
      d.far = { arm: { upper: [118, 44], fore: [160, 30], hand: "open" }, leg: { thigh: [22, 8], shin: [-26, 5], toe: -20 } };
      d.flow = 0.7;
      break;
    case "jump":
      d.lift = 0.17;
      d.lean = -4;
      d.headPitch = -8;
      d.airborne = true;
      d.near = { arm: { upper: [158, 26], fore: [172, 16], hand: "open" }, leg: { thigh: [56, 4], shin: [-24, 4], toe: -30 } };
      d.far = { arm: { upper: [150, 32], fore: [166, 22], hand: "open" }, leg: { thigh: [34, 4], shin: [-52, 4], toe: -42 } };
      d.flow = 0.5;
      break;
    case "point":
      d.lean = 3;
      d.near = { arm: { upper: [84, 5], fore: [88, 2], hand: "point" }, leg: { thigh: [10, 3], shin: [2, 2] } };
      d.far = { arm: relaxedFar, leg: { thigh: [-6, 3], shin: [-3, 2] } };
      break;
    case "reach":
      d.lean = 14;
      d.headPitch = -6;
      d.near = { arm: { upper: [110, 6], fore: [116, 3], hand: "open" }, leg: { thigh: [30, 3], shin: [4, 2], toe: 6 } };
      d.far = { arm: { upper: [-28, 12], fore: [-12, 6], hand: "relaxed" }, leg: { thigh: [-14, 3], shin: [-20, 2], toe: -26 } };
      break;
    case "wave":
      d.headRoll = 4;
      // The far arm waves: in 3/4 it rises beside the head instead of across the face.
      d.near = { arm: relaxedNear, leg: standNear };
      d.far = { arm: { upper: [150, 42], fore: [174, 12], hand: "open" }, leg: standFar };
      break;
    case "arms_crossed":
      d.lean = -2;
      d.headPitch = -3;
      d.near = {
        arm: { target: (k, s) => at(k, k.neckBase, -m.torsoLen * 0.42, m.chestD * 0.85 + m.bust + 0.016 * H, -s * 0.055 * H), pole: v3(0.3, -1, 0.3), hand: "fist" },
        leg: { thigh: [4, 5], shin: [1, 3] },
      };
      d.far = {
        arm: { target: (k, s) => at(k, k.neckBase, -m.torsoLen * 0.36, m.chestD * 0.8 + m.bust + 0.008 * H, -s * 0.06 * H), pole: v3(0.3, -1, 0.3), hand: "fist" },
        leg: { thigh: [-4, 5], shin: [-2, 3] },
      };
      break;
    case "hands_on_hips":
      d.near = {
        arm: { target: (k, s) => at(k, k.pelvis, m.torsoLen * 0.2, 0.004 * H, s * (m.waistW + m.belly * 0.4 + 0.012 * H)), pole: v3(-0.8, 0.25, 1), hand: "fist" },
        leg: { thigh: [5, 6], shin: [1, 4] },
      };
      d.far = {
        arm: { target: (k, s) => at(k, k.pelvis, m.torsoLen * 0.2, 0.004 * H, s * (m.waistW + m.belly * 0.4 + 0.012 * H)), pole: v3(-0.8, 0.25, 1), hand: "fist" },
        leg: { thigh: [-4, 6], shin: [-2, 4] },
      };
      break;
    case "think":
      d.headPitch = -5;
      d.headRoll = 7;
      d.near = {
        arm: { target: (k) => add3(k.chin, add3(mul3(k.F, 0.012 * H), mul3(k.spine, -0.022 * H))), pole: v3(0.1, -1, 0.25), hand: "fist" },
        leg: standNear,
      };
      d.far = {
        arm: { target: (k) => add3(k.nearElbow ?? k.pelvis, add3(mul3(k.F, 0.02 * H), mul3(k.spine, -0.02 * H))), pole: v3(0, -1, 0.5), hand: "flat" },
        leg: standFar,
      };
      break;
    case "cover_face":
      d.lean = 10;
      d.headPitch = 18;
      d.near = {
        arm: { target: (k, s) => add3(k.face, mul3(k.L, s * 0.028 * H)), pole: v3(0, -1, 0.45), hand: "flat" },
        leg: { thigh: [9, 4], shin: [-3, 3] },
      };
      d.far = {
        arm: { target: (k, s) => add3(k.face, mul3(k.L, s * 0.028 * H)), pole: v3(0, -1, 0.45), hand: "flat" },
        leg: { thigh: [2, 4], shin: [-8, 3] },
      };
      break;
    case "cower":
      d.lean = 30;
      d.headPitch = 26;
      d.near = {
        arm: { target: (k, s) => at(k, k.headC, 0.05 * H, 0.09 * H, s * 0.02 * H), pole: v3(0.2, -1, 0.7), hand: "open" },
        leg: { thigh: [78, 12], shin: [-30, 6], toe: -8 },
      };
      d.far = {
        arm: { target: (k, s) => at(k, k.headC, 0.08 * H, 0.07 * H, s * 0.03 * H), pole: v3(0.2, -1, 0.8), hand: "open" },
        leg: { thigh: [70, 12], shin: [-38, 6], toe: -14 },
      };
      break;
    case "bow":
      d.lean = 56;
      d.headPitch = 12;
      d.near = { arm: { upper: [-6, 4], fore: [-2, 3], hand: "flat" }, leg: { thigh: [-5, 3], shin: [-3, 2] } };
      d.far = { arm: { upper: [-10, 4], fore: [-6, 3], hand: "flat" }, leg: { thigh: [-7, 3], shin: [-4, 2] } };
      break;
    case "hold":
      d.near = {
        arm: { target: (k, s) => at(k, k.pelvis, m.torsoLen * 0.52, 0.17 * H, -s * 0.01 * H), pole: v3(-0.2, -1, 0.5), hand: "grip" },
        leg: standNear,
      };
      break;
    case "carry":
      d.lean = -5;
      d.grip = "both";
      d.near = {
        arm: { target: (k, s) => at(k, k.pelvis, m.torsoLen * 0.42, 0.19 * H, s * 0.07 * H), pole: v3(-0.3, -1, 0.7), hand: "grip" },
        leg: { thigh: [6, 5], shin: [0, 3] },
      };
      d.far = {
        arm: { target: (k, s) => at(k, k.pelvis, m.torsoLen * 0.44, 0.19 * H, s * 0.07 * H), pole: v3(-0.3, -1, 0.7), hand: "grip" },
        leg: { thigh: [-5, 5], shin: [-2, 3] },
      };
      break;
    case "talk":
      d.lean = 2;
      d.headRoll = 3;
      d.near = { arm: { upper: [24, 12], fore: [96, 10], hand: "open" }, leg: standNear };
      break;
    case "fly":
    case "perch":
      throw new Error(`human rig does not support pose "${pose}"`);
  }
  if (m.stoop && !d.airborne) {
    d.lean += m.stoop;
    d.headPitch -= m.stoop * 0.6;
    if (pose !== "sit" && pose !== "kneel" && pose !== "cower") {
      d.near.leg = { ...d.near.leg, thigh: [d.near.leg.thigh[0] + 5, d.near.leg.thigh[1]], shin: [d.near.leg.shin[0] - 3, d.near.leg.shin[1]] };
      d.far.leg = { ...d.far.leg, thigh: [d.far.leg.thigh[0] + 5, d.far.leg.thigh[1]], shin: [d.far.leg.shin[0] - 3, d.far.leg.shin[1]] };
    }
  }
  if (m.look.build === "heavy") {
    // Arms clear the belly.
    for (const side of [d.near, d.far]) {
      const a = side.arm;
      if (a.upper) side.arm = { ...a, upper: [a.upper[0], a.upper[1] + 8] };
    }
  }
  return d;
}
