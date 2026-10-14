/**
 * Body marks of the neutral stand-ins (v0.3, #81, renderer 0.7.2; docs/v0.3/D1a-renderer.md "Marks").
 * `look.marks` is a short list of long_neck, long_nose, horns, big_ears and long_tail. The archetype rigs
 * (quad.ts, critters.ts, ../bird.ts) draw each mark in the same flat neutral style as the plain body. This file
 * holds what they share: the parsed flags and a few shapes. No mark means exactly the 0.7.x drawing.
 */
import type { LookMark, Point, Tone } from "../../contracts.js";
import { ARCHETYPE_SPECIES } from "../../contracts.js";
import { P, type Pen, fillOf, polar } from "./common.js";

export interface Marks {
  neck: boolean;
  nose: boolean;
  horns: boolean;
  ears: boolean;
  tail: boolean;
}

export const NO_MARKS: Marks = { neck: false, nose: false, horns: false, ears: false, tail: false };

/**
 * The flags of a look's marks. Marks count only on an archetype species; unknown values and duplicates are
 * ignored (validation reports them).
 */
export function marksOf(look: { species?: string; marks?: readonly string[] } | undefined): Marks {
  const list = look?.marks;
  if (!Array.isArray(list) || list.length === 0 || !(ARCHETYPE_SPECIES as readonly string[]).includes(look?.species ?? "")) return NO_MARKS;
  const has = (m: LookMark) => list.slice(0, 3).includes(m);
  const out: Marks = { neck: has("long_neck"), nose: has("long_nose"), horns: has("horns"), ears: has("big_ears"), tail: has("long_tail") };
  return anyMark(out) ? out : NO_MARKS;
}

export function anyMark(m: Marks): boolean {
  return m.neck || m.nose || m.horns || m.ears || m.tail;
}

/** Horns are paler than the body (a light tone) so they read against it; on a light body they take a mid tone. */
export function hornFill(tone: Tone, pen: Pen): string {
  return fillOf(tone === "white" || tone === "light" || tone === "dots" || tone === "flowers" ? "mid" : "light", pen);
}

export interface HangingTube {
  spine: Point[];
  /** Direction of the last segment (radians, svg angles). */
  endAngle: number;
}

/**
 * The spine of a long flexible tube (a nose) that leaves `root` at angle `a0`, swings down to angle `a1`
 * and hangs. It never goes below `floorY`: what is left of its length then runs forward along the ground.
 */
export function hangingTube(root: Point, a0: number, a1: number, length: number, floorY: number, forward = 1): HangingTube {
  const n = 8;
  const seg = length / n;
  const spine: Point[] = [root];
  let p = root;
  let ang = a0;
  let onFloor = false;
  for (let i = 1; i <= n; i += 1) {
    const t = i / n;
    const k = t * t * (3 - 2 * t);
    ang = a0 + (a1 - a0) * k;
    let next = polar(p, seg, ang);
    if (onFloor || next.y > floorY) {
      onFloor = true;
      next = P(p.x + seg * forward, Math.min(floorY, p.y + (floorY - p.y) * 0.6));
      ang = forward > 0 ? 0 : Math.PI;
    }
    spine.push(next);
    p = next;
  }
  return { spine, endAngle: ang };
}
