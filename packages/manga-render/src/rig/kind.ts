import type { CharacterLook, Expression, Pose } from "../contracts.js";
import type { DrawContext, FigureDrawing, FigureRequest } from "../internal.js";

/** One implementation per CharacterLook kind. See ../internal.ts for conventions. */
export interface KindRig<L extends CharacterLook = CharacterLook> {
  supportedPoses(look: L): readonly Pose[];
  supportedExpressions(look: L): readonly Expression[];
  nominalHeight(look: L): number;
  draw(request: FigureRequest & { look: L }, ctx: DrawContext): FigureDrawing;
}
