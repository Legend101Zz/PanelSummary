/**
 * Animal rig: rat, mouse, cat, dog, fox, rabbit, horse, bear (quadruped
 * skeleton in ./creature/quad.ts) plus frog, lizard and fish
 * (./creature/critters.ts). The look's tone colours the fur/skin/scales.
 */
import type { AnimalLook, Pose } from "../contracts.js";
import type { DrawContext, FigureDrawing, FigureRequest } from "../internal.js";
import type { KindRig } from "./kind.js";
import { anchorsFrom, finishFigure, makePen } from "./creature/common.js";
import { ALL_EXPRESSIONS } from "./creature/face.js";
import { QUAD, drawQuad, quadPoses, type QuadSpecies, type AnimalBuilt } from "./creature/quad.js";
import { FISH_POSES, FROG_POSES, LIZARD_POSES, drawFish, drawFrog, drawLizard } from "./creature/critters.js";

type Species = AnimalLook["species"];

const HEIGHTS: Record<Species, number> = {
  rat: 13,
  mouse: 11,
  cat: 30,
  dog: 40,
  fox: 40,
  rabbit: 22,
  frog: 12,
  lizard: 10,
  horse: 160,
  bear: 120,
  fish: 20,
};

function isQuad(sp: Species): sp is QuadSpecies {
  return sp in QUAD;
}

function poses(sp: Species): readonly Pose[] {
  if (isQuad(sp)) return quadPoses(sp);
  if (sp === "frog") return FROG_POSES;
  if (sp === "lizard") return LIZARD_POSES;
  return FISH_POSES;
}

export const animalRig: KindRig<AnimalLook> = {
  supportedPoses: (look) => poses(look.species),
  supportedExpressions: () => ALL_EXPRESSIONS,
  nominalHeight: (look) => HEIGHTS[look.species] ?? 30,
  draw(request: FigureRequest & { look: AnimalLook }, ctx: DrawContext): FigureDrawing {
    const { look } = request;
    const sp = look.species;
    if (!(sp in HEIGHTS)) throw new Error(`unknown animal species ${String(sp)}`);
    const pose = poses(sp).includes(request.pose) ? request.pose : "stand";
    const facing = request.facing === "left" ? "right" : request.facing;
    const pen = makePen(request.lineWidth, ctx.idPrefix, request);
    let built: AnimalBuilt;
    if (isQuad(sp)) built = drawQuad(sp, look.tone, pose, request.expression, facing, pen, request.seed);
    else if (sp === "frog") built = drawFrog(look.tone, pose, request.expression, facing, pen);
    else if (sp === "lizard") built = drawLizard(look.tone, pose, request.expression, facing, pen);
    else built = drawFish(look.tone, pose, request.expression, facing, pen);
    const anchors = anchorsFrom(built.sk, {
      head: built.head,
      headRadius: built.headR,
      mouth: built.mouth,
      hand: built.hand,
      waist: built.waist,
      shoulders: built.shoulders,
    });
    return finishFigure(built.sk, anchors);
  },
};
