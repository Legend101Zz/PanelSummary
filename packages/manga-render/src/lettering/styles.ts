/** Lettering styles per text kind (page units). */
import type { TextKind } from "../contracts.js";
import type { FontFace } from "./fonts.js";
import type { LineProfile } from "./breaking.js";

export type BalloonShape = "ellipse" | "cloud" | "burst" | "dashed" | "box" | "caption" | "sfx";

export interface KindStyle {
  face: FontFace;
  /** Font sizes tried in order; the last one is the minimum. Never goes lower. */
  sizes: readonly number[];
  lineHeight: number;
  shape: BalloonShape;
  profile: LineProfile;
  /** Padding around the text block, in em. */
  padX: number;
  padY: number;
}

/**
 * Sizes (page units; the page is 1000 wide): speech prefers 28-30 and never
 * goes under 24, which is about 9.4 CSS px when the whole page is shown on a
 * 390 px phone (craft A6.10); narration and captions never go under 22.
 */
export const KIND_STYLES: Record<TextKind, KindStyle> = {
  speech: { face: "bold", sizes: [30, 28, 26, 24], lineHeight: 1.12, shape: "ellipse", profile: "lens", padX: 0.62, padY: 0.5 },
  thought: { face: "bold", sizes: [30, 28, 26, 24], lineHeight: 1.12, shape: "cloud", profile: "lens", padX: 0.62, padY: 0.5 },
  whisper: { face: "boldItalic", sizes: [28, 26, 24], lineHeight: 1.12, shape: "dashed", profile: "lens", padX: 0.62, padY: 0.5 },
  shout: { face: "bold", sizes: [36, 34, 32, 30, 28, 26], lineHeight: 1.06, shape: "burst", profile: "lens", padX: 0.5, padY: 0.42 },
  narration: { face: "regular", sizes: [25, 24, 23, 22], lineHeight: 1.16, shape: "box", profile: "flat", padX: 0.55, padY: 0.42 },
  caption: { face: "bold", sizes: [24, 23, 22], lineHeight: 1.1, shape: "caption", profile: "flat", padX: 0.45, padY: 0.3 },
  sfx: { face: "sfx", sizes: [110, 100, 92, 84, 76, 68, 60, 54, 48], lineHeight: 0.95, shape: "sfx", profile: "flat", padX: 0, padY: 0 },
};

/** Minimum font size per kind (the renderer never letters below it). */
export function minFontSize(kind: TextKind): number {
  const sizes = KIND_STYLES[kind].sizes;
  return sizes[sizes.length - 1];
}

export const SPEAKING_KINDS: readonly TextKind[] = ["speech", "thought", "shout", "whisper"];

/** Lines per balloon above which it reads as a tall column (BALLOON_TALL). */
export const MAX_BALLOON_LINES = 5;

/**
 * Half the base width of every tail on the page: about half an "O" at the
 * preferred speech size (craft A6.4: one base width per page, no needles).
 */
export const TAIL_HALF_BASE = 9;

/** Tails stop this far along the gap from the balloon to the mouth (craft A6.3). */
export const TAIL_REACH = 0.55;
