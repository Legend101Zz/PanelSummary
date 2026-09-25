/**
 * Visual style guide for every drawing module. Black-and-white manga:
 * ink lines, paper white, flat greys used sparingly, screentone patterns in
 * PAGE units (patternUnits="userSpaceOnUse") so dots stay round at any scale.
 */
import type { Tone } from "./contracts.js";

export const INK = "#141414";
export const PAPER = "#ffffff";
export const PAGE_BG = "#fbfaf6";

/** Page-space stroke weights. Modules divide by their scale. */
export const STROKE = {
  panelBorder: 4,
  figureOutline: 2.6,
  figureDetail: 1.4,
  environment: 1.6,
  environmentDetail: 0.9,
  balloon: 2.4,
  fx: 1.1,
} as const;

/** Flat greys for tones that are not patterns. */
const FLAT: Partial<Record<Tone, string>> = {
  white: "#ffffff",
  light: "#d9d9d9",
  mid: "#9a9a9a",
  dark: "#4a4a4a",
  black: INK,
};

/** Returns a fill value for a tone, referencing page-level pattern defs. */
export function toneFill(tone: Tone, idPrefix: string): string {
  const flat = FLAT[tone];
  if (flat) return flat;
  return `url(#${idPrefix}tone-${tone})`;
}

/** Page-level <defs> for every pattern tone. Include once per page. */
export function toneDefs(idPrefix: string): string {
  const p = idPrefix;
  return [
    `<pattern id="${p}tone-dots" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#fff"/><circle cx="3.5" cy="3.5" r="1.25" fill="${INK}"/></pattern>`,
    `<pattern id="${p}tone-dense_dots" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#fff"/><circle cx="2.5" cy="2.5" r="1.45" fill="${INK}"/></pattern>`,
    `<pattern id="${p}tone-stripes" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="8" height="8" fill="#fff"/><rect width="8" height="2.6" fill="${INK}"/></pattern>`,
    `<pattern id="${p}tone-check" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#fff"/><rect width="7" height="7" fill="#5a5a5a"/><rect x="7" y="7" width="7" height="7" fill="#5a5a5a"/></pattern>`,
    `<pattern id="${p}tone-flowers" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="#fff"/><circle cx="9" cy="9" r="3" fill="none" stroke="${INK}" stroke-width="1"/><circle cx="9" cy="9" r="0.9" fill="${INK}"/><circle cx="0" cy="0" r="1.2" fill="${INK}"/><circle cx="18" cy="18" r="1.2" fill="${INK}"/></pattern>`,
    `<pattern id="${p}tone-gold" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="6" height="6" fill="#efe9d8"/><circle cx="3" cy="3" r="0.8" fill="#7a6a3a"/></pattern>`,
    `<pattern id="${p}tone-stone" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#e4e4e0"/><circle cx="2" cy="3" r="0.7" fill="#8a8a86"/><circle cx="7" cy="8" r="0.6" fill="#8a8a86"/><circle cx="8" cy="2" r="0.4" fill="#8a8a86"/></pattern>`,
    `<linearGradient id="${p}tone-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`,
  ].join("");
}
