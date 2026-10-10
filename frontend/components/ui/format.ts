// Number and time formatting for the app frame. Pure functions. Tabular figures are set in CSS
// (--app-numbers on .app-root); these functions only decide the words and the digits.

/** "5 min", "7 min 08 s", "45 s", "1 h 05 min". Whole minutes drop the seconds. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest === 0 ? `${m} min` : `${m} min ${String(rest).padStart(2, "0")} s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h} h` : `${h} h ${String(mm).padStart(2, "0")} min`;
}

/** "2 to 31 min" from two second values (the unit is said once). */
export function formatDurationRange(lowSeconds: number, highSeconds: number): string {
  const lo = Math.max(1, Math.round(lowSeconds / 60));
  const hi = Math.max(lo, Math.round(highSeconds / 60));
  return lo === hi ? `${lo} min` : `${lo} to ${hi} min`;
}

/** "$0.46". Two decimals, always. */
export function formatUsd(amount: number): string {
  return `$${Math.max(0, amount).toFixed(2)}`;
}

/** "$0.33 to $0.75". */
export function formatUsdRange(low: number, high: number): string {
  return `${formatUsd(low)} to ${formatUsd(high)}`;
}

/** "17,500". Thousands with a comma. */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** "1 page", "18 pages". */
export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

/** Clamp to 0..1. NaN becomes 0. */
export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** "42%". */
export function formatPercent(fraction: number): string {
  return `${Math.round(clamp01(fraction) * 100)}%`;
}

/**
 * Where the actual value sits on a range bar, as a fraction 0..1, and which way its label leans.
 * Under 20% the label starts at the mark, over 80% it ends at the mark, between it is centred.
 */
export function rangePosition(actual: number, low: number, high: number): { fraction: number; align: "start" | "center" | "end" } {
  const span = high - low;
  const fraction = span <= 0 ? 0 : clamp01((actual - low) / span);
  return { fraction, align: fraction < 0.2 ? "start" : fraction > 0.8 ? "end" : "center" };
}

/** A meter value: the fill part and the over-limit part, as fractions of the track. */
export function meterParts(value: number, limit: number): { fill: number; over: number; overBy: number; isOver: boolean } {
  if (limit <= 0) return { fill: 0, over: 0, overBy: 0, isOver: false };
  if (value <= limit) return { fill: clamp01(value / limit), over: 0, overBy: 0, isOver: false };
  // Over the limit: the track shows the whole value. The limit is where the coral starts.
  return { fill: limit / value, over: 1 - limit / value, overBy: value - limit, isOver: true };
}
