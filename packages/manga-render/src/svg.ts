/** Small SVG string helpers shared by every drawing module. */
import type { Point } from "./contracts.js";

/** Format a number compactly and deterministically (max 2 decimals). */
export function n(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`non-finite SVG number: ${value}`);
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** Escape text for SVG text nodes and attribute values. */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function pointsAttr(points: readonly Point[]): string {
  return points.map((p) => `${n(p.x)},${n(p.y)}`).join(" ");
}

/** Build a path "d" from points; closed when `close` is true. */
export function polyPath(points: readonly Point[], close = true): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return `M${n(first.x)} ${n(first.y)}${rest.map((p) => `L${n(p.x)} ${n(p.y)}`).join("")}${close ? "Z" : ""}`;
}

/** Smooth closed/open curve through points (Catmull-Rom → cubic Bézier). */
export function smoothPath(points: readonly Point[], close = true, tension = 0.5): string {
  const pts = points;
  const count = pts.length;
  if (count < 3) return polyPath(pts, close);
  const at = (i: number) => (close ? pts[(i + count) % count] : pts[Math.max(0, Math.min(count - 1, i))]);
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
  const segments = close ? count : count - 1;
  for (let i = 0; i < segments; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = { x: p1.x + ((p2.x - p0.x) * tension) / 3, y: p1.y + ((p2.y - p0.y) * tension) / 3 };
    const c2 = { x: p2.x - ((p3.x - p1.x) * tension) / 3, y: p2.y - ((p3.y - p1.y) * tension) / 3 };
    d += `C${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(p2.x)} ${n(p2.y)}`;
  }
  return close ? `${d}Z` : d;
}

export function group(content: string, attrs: Record<string, string | number | undefined> = {}): string {
  const attrText = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => ` ${k}="${typeof v === "number" ? n(v) : esc(String(v))}"`)
    .join("");
  return `<g${attrText}>${content}</g>`;
}
