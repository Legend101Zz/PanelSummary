/**
 * Rig dispatcher: routes a CharacterLook to its kind's rig. Kind rigs live in
 * sibling files and may be replaced independently.
 */
import type { CharacterLook, Expression, Pose } from "../contracts.js";
import type { DrawContext, FigureDrawing, FigureRequest, RigModule } from "../internal.js";
import type { KindRig } from "./kind.js";
import { humanRig } from "./human.js";
import { crowdRig } from "./crowd.js";
import { birdRig } from "./bird.js";
import { animalRig } from "./animal.js";
import { insectRig } from "./insect.js";
import { objectRig } from "./object.js";
import { plantRig } from "./plant.js";
import { spiritRig } from "./spirit.js";
import { emblemRig } from "./emblem.js";

const RIGS: Record<CharacterLook["kind"], KindRig> = {
  human: humanRig as KindRig,
  crowd: crowdRig as KindRig,
  bird: birdRig as KindRig,
  animal: animalRig as KindRig,
  insect: insectRig as KindRig,
  object: objectRig as KindRig,
  plant: plantRig as KindRig,
  spirit: spiritRig as KindRig,
  emblem: emblemRig as KindRig,
};

function rigFor(look: CharacterLook): KindRig {
  const rig = RIGS[look.kind];
  if (!rig) throw new Error(`no rig for look kind ${String((look as { kind?: unknown }).kind)}`);
  return rig;
}

export const rig: RigModule = {
  supportedPoses: (look: CharacterLook): readonly Pose[] => rigFor(look).supportedPoses(look),
  supportedExpressions: (look: CharacterLook): readonly Expression[] => rigFor(look).supportedExpressions(look),
  nominalHeight: (look: CharacterLook): number => rigFor(look).nominalHeight(look),
  draw: (request: FigureRequest, ctx: DrawContext): FigureDrawing => rigFor(request.look).draw(request, ctx),
};
