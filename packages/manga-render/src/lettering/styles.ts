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

export const KIND_STYLES: Record<TextKind, KindStyle> = {
  speech: { face: "bold", sizes: [28, 26, 24, 22], lineHeight: 1.12, shape: "ellipse", profile: "lens", padX: 0.62, padY: 0.5 },
  thought: { face: "bold", sizes: [28, 26, 24, 22], lineHeight: 1.12, shape: "cloud", profile: "lens", padX: 0.62, padY: 0.5 },
  whisper: { face: "boldItalic", sizes: [26, 24, 22], lineHeight: 1.12, shape: "dashed", profile: "lens", padX: 0.62, padY: 0.5 },
  shout: { face: "bold", sizes: [36, 34, 32, 30, 28, 26], lineHeight: 1.06, shape: "burst", profile: "lens", padX: 0.5, padY: 0.42 },
  narration: { face: "regular", sizes: [25, 24, 23, 22], lineHeight: 1.16, shape: "box", profile: "flat", padX: 0.55, padY: 0.42 },
  caption: { face: "bold", sizes: [22], lineHeight: 1.1, shape: "caption", profile: "flat", padX: 0.45, padY: 0.3 },
  sfx: { face: "sfx", sizes: [110, 100, 92, 84, 76, 68, 60, 54, 48], lineHeight: 0.95, shape: "sfx", profile: "flat", padX: 0, padY: 0 },
};

/** Minimum font size per kind (the renderer never letters below it). */
export function minFontSize(kind: TextKind): number {
  const sizes = KIND_STYLES[kind].sizes;
  return sizes[sizes.length - 1];
}

export const SPEAKING_KINDS: readonly TextKind[] = ["speech", "thought", "shout", "whisper"];
