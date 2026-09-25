/** Placeholder rig used until a kind's real rig lands. Draws a plain ink blob. */
import { EXPRESSIONS, type CharacterLook } from "../contracts.js";
import type { KindRig } from "./kind.js";
import { n } from "../svg.js";
import { INK } from "../style.js";

export function stubRig(height: number): KindRig {
  return {
    supportedPoses: () => ["stand", "talk"],
    supportedExpressions: () => EXPRESSIONS,
    nominalHeight: () => height,
    draw(request) {
      const h = height;
      const r = h * 0.12;
      const lw = request.lineWidth;
      const svg = `<ellipse cx="0" cy="${n(-h / 2 + r)}" rx="${n(h * 0.18)}" ry="${n(h / 2 - r)}" fill="#fff" stroke="${INK}" stroke-width="${n(lw)}"/><circle cx="0" cy="${n(-h + r)}" r="${n(r)}" fill="#fff" stroke="${INK}" stroke-width="${n(lw)}"/>`;
      return {
        svg,
        anchors: {
          head: { x: 0, y: -h + r },
          headRadius: r,
          mouth: { x: r * 0.4, y: -h + r * 1.3 },
          top: -h,
          left: -h * 0.2,
          right: h * 0.2,
          waist: -h * 0.5,
          shoulders: -h * 0.78,
        },
      };
    },
  };
}

export const _unused: CharacterLook | undefined = undefined;
