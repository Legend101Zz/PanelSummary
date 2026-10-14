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
import { marksOf } from "./creature/marks.js";
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
  // v0.3 (#81): neutral body plans (nominal heights in figure units, adult = 100)
  quad_small: 25,
  quad_medium: 60,
  quad_large: 170,
  long_low: 40,
  swimmer: 45,
};

/** Height of the drawing itself when a neutral species reuses a smaller drawing (see nativeHeight). */
const NATIVE: Partial<Record<Species, number>> = { long_low: 10, swimmer: 20 };

/**
 * v0.3 (#81): a long_neck makes the figure taller (the head is held high). Ratio of the drawn height with the mark to the
 * height without it, measured on the stand pose (test/archetype-marks.test.ts checks it). Without marks the heights above hold.
 */
const NECK_GAIN: Partial<Record<Species, number>> = { quad_small: 1.42, quad_medium: 1.53, quad_large: 1.61, long_low: 1.67, swimmer: 1.53 };
const gain = (look: AnimalLook): number => (marksOf(look).neck ? NECK_GAIN[look.species] ?? 1 : 1);

function isQuad(sp: Species): sp is QuadSpecies {
  return sp in QUAD;
}

function poses(sp: Species): readonly Pose[] {
  if (isQuad(sp)) return quadPoses(sp);
  if (sp === "frog") return FROG_POSES;
  if (sp === "lizard" || sp === "long_low") return LIZARD_POSES;
  return FISH_POSES;
}

export const animalRig: KindRig<AnimalLook> = {
  supportedPoses: (look) => poses(look.species),
  supportedExpressions: () => ALL_EXPRESSIONS,
  nominalHeight: (look) => (HEIGHTS[look.species] ?? 30) * gain(look),
  nativeHeight: (look) => (NATIVE[look.species] ?? HEIGHTS[look.species] ?? 30) * gain(look),
  draw(request: FigureRequest & { look: AnimalLook }, ctx: DrawContext): FigureDrawing {
    const { look } = request;
    const sp = look.species;
    if (!(sp in HEIGHTS)) throw new Error(`unknown animal species ${String(sp)}`);
    const pose = poses(sp).includes(request.pose) ? request.pose : "stand";
    const facing = request.facing === "left" ? "right" : request.facing;
    const pen = makePen(request.lineWidth, ctx.idPrefix, request);
    let built: AnimalBuilt;
    if (isQuad(sp)) built = drawQuad(sp, look.tone, pose, request.expression, facing, pen, request.seed, marksOf(look));
    else if (sp === "frog") built = drawFrog(look.tone, pose, request.expression, facing, pen);
    else if (sp === "lizard" || sp === "long_low") built = drawLizard(look.tone, pose, request.expression, facing, pen, marksOf(look));
    else built = drawFish(look.tone, pose, request.expression, facing, pen, marksOf(look));
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
