/**
 * easing.ts — Animation easing functions
 * =========================================
 * Maps DSL easing names to actual bezier/spring curves.
 */

import type { EasingType } from "./types";

/** Resolve a single animated value at a given progress (0→1). */
export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Parse a CSS percentage string like "35%" → 35 */
export function parsePct(val: string | number): number {
  if (typeof val === "number") return val;
  return parseFloat(val) || 0;
}

/** Interpolate between two values (number or "X%") */
export function interpolateValue(
  from: string | number,
  to: string | number,
  t: number,
): string {
  const fNum = parsePct(from);
  const tNum = parsePct(to);
  const result = lerp(fNum, tNum, t);
  // Preserve unit
  if (typeof from === "string" && from.includes("%")) return `${result}%`;
  if (typeof from === "string" && from.includes("px")) return `${result}px`;
  if (typeof from === "string" && from.includes("rem")) return `${result}rem`;
  return `${result}`;
}

/** Standard easing function: name → (t) => t' */
export function getEasing(name?: EasingType): (t: number) => number {
  switch (name) {
    case "linear":
      return (t) => t;
    case "ease-in":
      return (t) => t * t;
    case "ease-out":
      return (t) => t * (2 - t);
    case "ease-in-out":
      return (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
    case "spring":
      return (t) => {
        const c = Math.cos(t * Math.PI * 2.5);
        return 1 - Math.pow(1 - t, 3) * c * (t < 0.8 ? 1 : 0);
      };
    case "bounce":
      return (t) => {
        if (t < 1 / 2.75) return 7.5625 * t * t;
        if (t < 2 / 2.75)
          return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
        if (t < 2.5 / 2.75)
          return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
        return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
      };
    default:
      return (t) => t * (2 - t); // default ease-out
  }
}

/** Clamp between 0 and 1 */
export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
