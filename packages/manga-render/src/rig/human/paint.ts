/** SVG element helpers for the human rig (ink outlines, merged unions, lines). */
import { INK } from "../../style.js";
import { n } from "../../svg.js";

/** Filled shape with a centred ink outline. */
export const shape = (d: string, fill: string, w: number): string =>
  `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${n(w)}"/>`;

/**
 * Filled union: every subpath shares one outline because the stroke is
 * painted first (paint-order) at double width and the fill covers the inner
 * half — overlapping capsules read as one limb.
 */
export const uni = (d: string, fill: string, w: number): string =>
  `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${n(w * 2)}" paint-order="stroke"/>`;

/** Unstroked fill. */
export const solid = (d: string, fill: string): string => `<path d="${d}" fill="${fill}"/>`;

/** Open ink line. */
export const line = (d: string, w: number, color: string = INK): string =>
  d ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="${n(w)}"/>` : "";

export const circle = (c: { x: number; y: number; r: number }, fill: string, w = 0): string =>
  w > 0
    ? `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(c.r)}" fill="${fill}" stroke="${INK}" stroke-width="${n(w)}"/>`
    : `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(c.r)}" fill="${fill}"/>`;

/** Drawing context for one figure: line weights and the silhouette collector. */
export interface Ink {
  /** Outline weight (figure units). */
  lw: number;
  /** Inner detail weight. */
  dw: number;
  /** Paths that make up the outer silhouette (drawn thick underneath). */
  sil: string[];
  /** Simplified rendering (crowds, reduced/silhouette LOD): fewer detail lines. */
  lite: boolean;
  /** Level of detail requested by the composer (see FigureRequest.detail). */
  detail?: "full" | "reduced" | "silhouette";
  /** Eye state for this appearance (FigureRequest.eyes); overrides the expression's eyes. */
  eyes?: "open" | "closed" | "blind" | "dead";
}
