/** Closed vocabularies shown to the model, built from the renderer contracts. */
import * as C from "@panelsummary/manga-render/contracts";

export function lookVocabulary() {
  return {
    look_kinds: {
      human: {
        age: C.HUMAN_AGES,
        build: C.HUMAN_BUILDS,
        height: C.HUMAN_HEIGHTS,
        frame: C.HUMAN_FRAMES,
        hair: C.HAIR_STYLES,
        hair_tone: C.TONES,
        facial_hair: C.FACIAL_HAIR,
        outfit: C.OUTFITS,
        outfit_tone: C.TONES,
        headwear: C.HEADWEAR,
        accessories: C.ACCESSORIES,
        skin: C.SKIN_TONES,
        material: C.MATERIALS,
      },
      bird: { species: C.BIRD_SPECIES, tone: C.TONES },
      animal: { species: C.ANIMAL_SPECIES, tone: C.TONES },
      insect: { species: C.INSECT_SPECIES, tone: C.TONES },
      object: { shape: C.OBJECT_SHAPES, tone: C.TONES, face: "boolean" },
      plant: { species: C.PLANT_SPECIES, tone: C.TONES, face: "boolean" },
      spirit: { element: C.SPIRIT_TYPES },
      crowd: { crowd: C.CROWD_TYPES, size: ["few", "many"] },
      emblem: { emblem: C.EMBLEMS },
    },
    environments: C.ENVIRONMENTS,
    environment_features: C.ENV_FEATURES,
    claim_kinds: C.CLAIM_KINDS,
    claim_importance: C.CLAIM_IMPORTANCE,
  };
}

export function pageVocabulary() {
  return {
    shots: C.SHOTS,
    angles: C.ANGLES,
    slots: C.SLOTS,
    depths: C.DEPTHS,
    facings: C.FACINGS,
    poses: C.POSES,
    expressions: C.EXPRESSIONS,
    props: C.PROPS,
    fx: C.FX,
    times: C.TIMES,
    weathers: C.WEATHERS,
    text_kinds: C.TEXT_KINDS,
    fidelity: C.FIDELITY,
  };
}
