/**
 * Human rig: procedural manga characters from a HumanLook. See
 * ./human/draw.ts for the layer order and ./human/pose.ts for poses.
 *
 * Facing: "right" is the canonical 3/4 view; "left" draws the same art (the
 * composer mirrors it); "front" and "back" are drawn directly.
 */
import { EXPRESSIONS, type HumanLook } from "../contracts.js";
import type { KindRig } from "./kind.js";
import { HUMAN_POSES } from "./human/pose.js";
import { nominalHumanHeight } from "./human/look.js";
import { drawHuman } from "./human/draw.js";

export { HUMAN_POSES } from "./human/pose.js";

export const humanRig: KindRig<HumanLook> = {
  supportedPoses: () => HUMAN_POSES,
  supportedExpressions: () => EXPRESSIONS,
  nominalHeight: (look) => nominalHumanHeight(look),
  draw: (request, ctx) => drawHuman(request, ctx),
};
