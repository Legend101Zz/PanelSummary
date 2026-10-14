import type { CharacterLook, Expression, Pose } from "../contracts.js";
import type { DrawContext, FigureDrawing, FigureRequest } from "../internal.js";

/** One implementation per CharacterLook kind. See ../internal.ts for conventions. */
export interface KindRig<L extends CharacterLook = CharacterLook> {
  supportedPoses(look: L): readonly Pose[];
  supportedExpressions(look: L): readonly Expression[];
  nominalHeight(look: L): number;
  /**
   * Height of the drawing as the rig draws it, when that differs from `nominalHeight`
   * (the neutral long_low and swimmer reuse a small lizard and fish drawing at a larger size).
   */
  nativeHeight?(look: L): number;
  draw(request: FigureRequest & { look: L }, ctx: DrawContext): FigureDrawing;
}
