/**
 * A tiny pinhole camera for background perspective.
 *
 * World: metres. X right, Y up, Z away from the camera. The camera sits at
 * (0, h, 0) looking along +Z, pitched by `theta` (positive = looking up).
 * A lens shift (principal point px/py) lets eye-level shots keep verticals
 * parallel while placing the horizon anywhere in the panel. Pitched cameras
 * (low / worms_eye / high / birds_eye) make verticals converge naturally.
 */
import type { Box, Point } from "../contracts.js";

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });

export interface Camera {
  /** Focal length in page units. */
  F: number;
  px: number;
  py: number;
  s: number;
  c: number;
  /** Camera height above the ground plane (metres). */
  h: number;
  near: number;
  box: Box;
  /** Screen y of the horizon (may be outside the box). */
  horizonY: number;
}

const RAD = Math.PI / 180;

export function makeCamera(box: Box, fovDeg: number, thetaDeg: number, camH: number, horizonFrac: number | null): Camera {
  const F = (0.5 * Math.max(box.w, box.h)) / Math.tan((fovDeg * RAD) / 2);
  const th = thetaDeg * RAD;
  const s = Math.sin(th);
  const c = Math.cos(th);
  const px = box.x + box.w / 2;
  const py = horizonFrac === null ? box.y + box.h / 2 : box.y + box.h * horizonFrac - F * Math.tan(th);
  return { F, px, py, s, c, h: camH, near: 0.12, box, horizonY: py + F * Math.tan(th) };
}

/** World → camera space (x right, y up, z forward). */
export function toCam(cam: Camera, p: V3): V3 {
  const dy = p.y - cam.h;
  return { x: p.x, y: dy * cam.c - p.z * cam.s, z: dy * cam.s + p.z * cam.c };
}

function camToScreen(cam: Camera, q: V3): Point {
  return { x: cam.px + (cam.F * q.x) / q.z, y: cam.py - (cam.F * q.y) / q.z };
}

export function project(cam: Camera, p: V3): Point | null {
  const q = toCam(cam, p);
  if (q.z < cam.near) return null;
  return camToScreen(cam, q);
}

/** Project a planar polygon, clipping it against the near plane. */
export function projectPoly(cam: Camera, pts: readonly V3[]): Point[] {
  const q = pts.map((p) => toCam(cam, p));
  const out: V3[] = [];
  const nearZ = cam.near;
  for (let i = 0; i < q.length; i += 1) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    const ain = a.z >= nearZ;
    const bin = b.z >= nearZ;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (nearZ - a.z) / (b.z - a.z);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: nearZ });
    }
  }
  return out.map((p) => camToScreen(cam, p));
}

/** Project a segment, clipped to the near plane. */
export function projectSeg(cam: Camera, a: V3, b: V3): [Point, Point] | null {
  let qa = toCam(cam, a);
  let qb = toCam(cam, b);
  const nz = cam.near;
  if (qa.z < nz && qb.z < nz) return null;
  if (qa.z < nz || qb.z < nz) {
    const t = (nz - qa.z) / (qb.z - qa.z);
    const m = { x: qa.x + (qb.x - qa.x) * t, y: qa.y + (qb.y - qa.y) * t, z: nz };
    if (qa.z < nz) qa = m;
    else qb = m;
  }
  return [camToScreen(cam, qa), camToScreen(cam, qb)];
}

/** Page units per metre at a world point (for billboard sprites). */
export function scaleAt(cam: Camera, p: V3): number {
  const q = toCam(cam, p);
  return cam.F / Math.max(q.z, cam.near);
}

/** Camera-space depth of a world point. */
export function depthOf(cam: Camera, p: V3): number {
  return toCam(cam, p).z;
}

/** Where the view ray through a screen point meets the plane Y=planeY. */
export function planeAt(cam: Camera, sx: number, sy: number, planeY = 0): { x: number; z: number } | null {
  const xc = (sx - cam.px) / cam.F;
  const yc = -(sy - cam.py) / cam.F;
  const dirX = xc;
  const dirY = yc * cam.c + cam.s;
  const dirZ = -yc * cam.s + cam.c;
  const dy = planeY - cam.h;
  if (Math.abs(dirY) < 1e-6) return null;
  const t = dy / dirY;
  if (t <= 0) return null;
  return { x: dirX * t, z: dirZ * t };
}

/** Depth Z at which ground (Y=0) directly ahead projects to screen y `sy`. */
export function groundDepthAt(cam: Camera, sy: number): number | null {
  const hit = planeAt(cam, cam.px, sy, 0);
  return hit ? hit.z : null;
}

/** Visible world X range at depth z and height y (at the box edges). */
export function xRangeAt(cam: Camera, z: number, y = 0): [number, number] {
  const q = toCam(cam, { x: 0, y, z });
  const zc = Math.max(q.z, cam.near);
  return [((cam.box.x - cam.px) * zc) / cam.F, ((cam.box.x + cam.box.w - cam.px) * zc) / cam.F];
}

/** Bounding box of screen points. */
export function bboxOf(points: readonly Point[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function intersects(a: Box, b: Box, margin = 0): boolean {
  return a.x - margin < b.x + b.w && a.x + a.w + margin > b.x && a.y - margin < b.y + b.h && a.y + a.h + margin > b.y;
}
