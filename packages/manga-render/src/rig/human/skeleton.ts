/**
 * Skeleton solver: PoseDef + Metrics → 3D joints, then an orthographic
 * camera (yaw by view, a slight downward pitch, optional roll) projects them
 * into figure space with feet on y = 0 and the body centred on x = 0.
 */
import {
  add3,
  cross3,
  D2R,
  dir3,
  dot3,
  mul3,
  norm,
  norm3,
  rot,
  sub3,
  twoBone,
  v,
  v3,
  type V2,
  type V3,
} from "./geom.js";
import type { Metrics } from "./look.js";
import type { ArmSpec, HandShape, KeyPoints, LegSpec, PoseDef } from "./pose.js";

export type ViewKind = "front" | "side" | "back";

export interface P2 extends V2 {
  /** Depth toward the viewer (+ = nearer). */
  z: number;
}

export interface Cam {
  yaw: number;
  pitch: number;
  roll: number;
  ox: number;
  oy: number;
}

export function project(cam: Cam, p: V3): P2 {
  const ys = Math.sin(cam.yaw * D2R);
  const yc = Math.cos(cam.yaw * D2R);
  const ps = Math.sin(cam.pitch * D2R);
  const pc = Math.cos(cam.pitch * D2R);
  const x0 = p.f * ys + p.l * yc;
  const z0 = p.f * yc - p.l * ys;
  const y0 = -p.u * pc + z0 * ps;
  const z = z0 * pc + p.u * ps;
  const r = cam.roll ? rot({ x: x0, y: y0 }, cam.roll) : { x: x0, y: y0 };
  return { x: r.x + cam.ox, y: r.y + cam.oy, z };
}

/** Project a direction (no offset). */
export function projectDir(cam: Cam, d: V3): V2 {
  const p = project({ ...cam, ox: 0, oy: 0 }, d);
  return v(p.x, p.y);
}

export interface ArmJ {
  side: number;
  shoulder: V3;
  elbow: V3;
  wrist: V3;
  handDir: V3;
  hand: HandShape;
}
export interface LegJ {
  side: number;
  hip: V3;
  knee: V3;
  ankle: V3;
  footDir: V3;
  footDown: V3;
}

export interface Skeleton {
  m: Metrics;
  def: PoseDef;
  view: ViewKind;
  cam: Cam;
  /** Head drawn mirrored (only for the mirrored lie pose). */
  mirror: boolean;
  pelvis: V3;
  spine: V3;
  lat: V3;
  fwd: V3;
  neckBase: V3;
  neckTop: V3;
  headUp: V3;
  headFwd: V3;
  headC: V3;
  near: { arm: ArmJ; leg: LegJ };
  far: { arm: ArmJ; leg: LegJ };
  P: (p: V3) => P2;
}

export const SIDE_YAW = 64;
const PITCH = 7;

/** Rotate a vector about the lateral (l) axis, tipping up toward forward. */
function pitchFwd(a: V3, deg: number): V3 {
  const c = Math.cos(deg * D2R);
  const s = Math.sin(deg * D2R);
  return v3(a.f * c + a.u * s, a.u * c - a.f * s, a.l);
}

function solveLeg(hip: V3, spec: LegSpec, side: number, m: Metrics): LegJ {
  const knee = add3(hip, mul3(dir3(spec.thigh[0], spec.thigh[1], side), m.thigh));
  const ankle = add3(knee, mul3(dir3(spec.shin[0], spec.shin[1], side), m.shin));
  const p = (spec.toe ?? 0) * D2R;
  const toeOut = 9 * D2R;
  const fd = v3(Math.cos(p) * Math.cos(toeOut), Math.sin(p), side * Math.cos(p) * Math.sin(toeOut));
  const fdown = v3(Math.sin(p), -Math.cos(p), 0);
  return { side, hip, knee, ankle, footDir: fd, footDown: fdown };
}

function solveArm(shoulder: V3, spec: ArmSpec, side: number, m: Metrics, k: KeyPoints): ArmJ {
  let elbow: V3;
  let wrist: V3;
  if (spec.target) {
    const pole = spec.pole ?? v3(0, -1, 0.3);
    const r = twoBone(shoulder, spec.target(k, side), m.upperArm, m.forearm, v3(pole.f, pole.u, pole.l * side));
    elbow = r.mid;
    wrist = r.end;
  } else {
    const up = spec.upper ?? [0, 6];
    const fo = spec.fore ?? [0, 4];
    elbow = add3(shoulder, mul3(dir3(up[0], up[1], side), m.upperArm));
    wrist = add3(elbow, mul3(dir3(fo[0], fo[1], side), m.forearm));
  }
  return { side, shoulder, elbow, wrist, handDir: norm3(sub3(wrist, elbow)), hand: spec.hand };
}

export function solveSkeleton(m: Metrics, def: PoseDef, view: ViewKind): Skeleton {
  const H = m.H;
  const R = m.R;
  const bend = def.bend * D2R;
  const lean = def.lean * D2R;
  const spine = norm3(v3(Math.sin(lean) * Math.cos(bend), Math.cos(lean) * Math.cos(bend), Math.sin(bend)));
  const tw = def.twist * D2R;
  let lat = v3(-Math.sin(tw), 0, Math.cos(tw));
  lat = norm3(sub3(lat, mul3(spine, dot3(lat, spine))));
  const fwd = norm3(cross3(spine, lat));
  const pelvis = v3(0, 0, 0);
  const neckBase = add3(pelvis, mul3(spine, m.torsoLen));
  const neckDir = pitchFwd(spine, 14 + def.headPitch * 0.45);
  const neckTop = add3(neckBase, mul3(neckDir, m.neckLen));
  const headUp = pitchFwd(spine, def.headPitch);
  const headFwd = pitchFwd(fwd, def.headPitch);
  const headC = add3(neckTop, add3(mul3(headUp, 1.02 * R), mul3(headFwd, 0.12 * R)));
  const chin = add3(headC, add3(mul3(headUp, -1.25 * R), mul3(headFwd, 0.6 * R)));
  const face = add3(headC, add3(mul3(headUp, -0.45 * R), mul3(headFwd, 1.05 * R)));

  const L = v3(0, 0, 1);
  const shoulderAt = (side: number) => add3(add3(neckBase, mul3(spine, -m.torsoLen * 0.1 + (def.shrug ?? 0) * H)), mul3(lat, side * m.shoulderHalf));
  const hipAt = (side: number) => add3(pelvis, mul3(L, side * m.hipHalf));

  // Near side is the figure's right, except when drawn mirrored.
  const nearSide = def.mirror ? 1 : -1;
  const farSide = -nearSide;

  let nearLegSpec = def.near.leg;
  const farLeg = solveLeg(hipAt(farSide), def.far.leg, farSide, m);
  if (def.kneel) {
    // Far knee rests on the ground; tip the near thigh so its sole lands too.
    const kneeDrop = -farLeg.knee.u + m.r.knee;
    const shinDrop = m.shin * Math.cos(nearLegSpec.shin[0] * D2R) + m.ankleH;
    const c = Math.max(-0.95, Math.min(0.95, (kneeDrop - shinDrop) / m.thigh));
    nearLegSpec = { ...nearLegSpec, thigh: [Math.acos(c) / D2R, nearLegSpec.thigh[1]] };
  }
  const nearLeg = solveLeg(hipAt(nearSide), nearLegSpec, nearSide, m);

  const keys: KeyPoints = { m, pelvis, neckBase, spine, headC, chin, face, F: fwd, L, nearKnee: nearLeg.knee };
  const nearArm = solveArm(shoulderAt(nearSide), def.near.arm, nearSide, m, keys);
  keys.nearElbow = nearArm.elbow;
  const farArm = solveArm(shoulderAt(farSide), def.far.arm, farSide, m, keys);

  const yaw = view === "front" ? 0 : view === "back" ? 180 : def.mirror ? -SIDE_YAW : SIDE_YAW;
  const cam: Cam = { yaw, pitch: PITCH, roll: def.roll, ox: 0, oy: 0 };

  // Ground contact and centring.
  const P0 = (p: V3) => project(cam, p);
  let bottom = -Infinity;
  const touch = (p: V3, r: number) => {
    const q = P0(p);
    bottom = Math.max(bottom, q.y + r);
  };
  for (const leg of [nearLeg, farLeg]) {
    const sole = add3(leg.ankle, mul3(leg.footDown, m.ankleH));
    touch(add3(sole, mul3(leg.footDir, -0.2 * m.footL)), 0);
    touch(add3(sole, mul3(leg.footDir, 0.72 * m.footL)), 0);
    touch(leg.knee, m.r.knee);
  }
  touch(pelvis, m.hipD * 0.9);
  touch(add3(pelvis, mul3(spine, m.torsoLen * 0.6)), m.chestD);
  touch(headC, R * 1.1);
  for (const arm of [nearArm, farArm]) {
    touch(arm.elbow, m.r.elbow);
    touch(arm.wrist, m.r.wrist);
  }
  const core = [pelvis, neckBase, headC, nearLeg.ankle, farLeg.ankle, nearLeg.knee, farLeg.knee].map(P0);
  const minX = Math.min(...core.map((p) => p.x));
  const maxX = Math.max(...core.map((p) => p.x));
  cam.ox = -(minX + maxX) / 2;
  cam.oy = -bottom - def.lift * H;

  const P = (p: V3) => project(cam, p);
  return {
    m,
    def,
    view,
    cam,
    mirror: def.mirror && view === "side",
    pelvis,
    spine,
    lat,
    fwd,
    neckBase,
    neckTop,
    headUp,
    headFwd,
    headC,
    near: { arm: nearArm, leg: nearLeg },
    far: { arm: farArm, leg: farLeg },
    P,
  };
}

/** Screen direction of the spine (unit), falling back to screen-up. */
export function screenSpine(sk: Skeleton): V2 {
  const a = sk.P(sk.pelvis);
  const b = sk.P(sk.neckBase);
  const d = { x: b.x - a.x, y: b.y - a.y };
  if (Math.hypot(d.x, d.y) < sk.m.torsoLen * 0.25) return rot(v(0, -1), sk.cam.roll);
  return norm(d);
}
