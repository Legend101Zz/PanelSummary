/**
 * utils/timing.ts — Frame ↔ ms conversion + easing
 */

/**
 * Convert milliseconds to frame number at given FPS.
 */
export function msToFrame(ms: number, fps: number): number {
  return Math.round((ms / 1000) * fps);
}

/**
 * Convert frame number to milliseconds.
 */
export function frameToMs(frame: number, fps: number): number {
  return (frame / fps) * 1000;
}

/**
 * Parse a percentage string like "50%" to a number (0.5).
 * If already a number, return as-is.
 */
export function parsePercent(val: string | number | undefined, fallback = 0): number {
  if (val === undefined || val === null) return fallback;
  if (typeof val === "number") return val;
  const str = String(val).trim();
  if (str.endsWith("%")) {
    return parseFloat(str) / 100;
  }
  return parseFloat(str) || fallback;
}

/**
 * Convert a percentage position to pixels.
 */
export function percentToPx(
  percent: string | number | undefined,
  dimension: number,
  fallback = 0,
): number {
  return parsePercent(percent, fallback / dimension) * dimension;
}
