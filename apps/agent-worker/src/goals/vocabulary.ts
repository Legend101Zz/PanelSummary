/** Closed vocabularies shown to the model, built from the renderer contracts. */
import * as C from "@panelsummary/manga-render/contracts";

/** Neutral archetype species, by body plan (D1a draws them; D30 asks the model to say when it uses one). */
export const ARCHETYPE_SPECIES = ["quad_small", "quad_medium", "quad_large", "long_low", "swimmer", "bird_tall"] as const;
/** Neutral backdrops by kind of place. */
export const GENERIC_ENVIRONMENTS = ["generic_room", "generic_hall", "generic_passage", "generic_rough", "generic_outdoor"] as const;
/** Neutral props by shape. */
export const NEUTRAL_PROPS = ["thing_long", "thing_round", "thing_block", "thing_flat", "thing_heap"] as const;

const MEANINGS = {
  species: {
    quad_small: "a small four-legged body (cat to dog size)",
    quad_medium: "a medium four-legged body (sheep to deer size)",
    quad_large: "a large four-legged body (cattle size or bigger)",
    long_low: "a long body close to the ground (reptile shapes)",
    swimmer: "a body that lives in water (fish, whale, seal shape)",
    bird_tall: "a tall long-legged bird body",
  },
  environments: {
    generic_room: "any plain room: walls, floor, no fixed furniture",
    generic_hall: "a wide high plain hall, no furniture",
    generic_passage: "a long narrow way: corridor, tunnel, alley",
    generic_rough: "rough stone walls and a dark ceiling: an underground or rocky place",
    generic_outdoor: "open ground, horizon and sky: camp, clearing, field",
  },
  props: {
    thing_long: "a long thin object (stick, pole, handle, tool)",
    thing_round: "a round object (fruit, ball, stone, wheel)",
    thing_block: "a block or box shape (loaf, crate, wedge)",
    thing_flat: "a flat object (sheet, board, bark)",
    thing_heap: "a pile (rubble, grass, heaped goods)",
  },
} as const;

/** The meanings of the values the renderer offers now; a value that is not in its list yet is not shown. */
function shown(meanings: Record<string, string>, list: readonly string[]): Record<string, string> {
  return Object.fromEntries(Object.entries(meanings).filter(([id]) => list.includes(id)));
}

/**
 * D30: what to do when no item fits. One line per neutral value, plus the fields that report it.
 * Built from the renderer lists: a neutral value appears here only when the renderer has it.
 */
export function standInVocabulary() {
  return {
    rule: "Use the closest item only when it is the same kind of thing. Otherwise use a neutral item and report it with fit and wanted.",
    animal_species_by_body_plan: shown(MEANINGS.species, C.ANIMAL_SPECIES),
    bird_species_by_body_plan: shown(MEANINGS.species, C.BIRD_SPECIES),
    environments_by_kind_of_place: shown(MEANINGS.environments, C.ENVIRONMENTS),
    props_by_shape: shown(MEANINGS.props, C.PROPS),
    // `scale` comes with the archetypes (D1a): show it only when the renderer has them.
    ...((C.ANIMAL_SPECIES as readonly string[]).includes("quad_large")
      ? { look_scale: "optional number 0.05-4.0. Leave it out by default. The renderer uses it only on a neutral archetype species (size relative to an adult human: 0.5 = half the height of a person) and on a human below 1.0 (a person the book says is tiny). It ignores it on a named animal or bird species (each is drawn at a readable size already) and on a human of 1.0 or more (use height: giant for a big person)." }
      : {}),
    fit: `optional on cast and locations: ${C.FITS.join(" | ")}. exact = the item is the thing; near = the same kind of thing; none = a neutral stand-in.`,
    wanted: `needed when fit is near or none: the thing in the book's own words, at most ${C.WANTED_MAX} characters ("an old camel").`,
    unmapped: 'optional top-level list of {"type": "cast" | "place" | "prop", "ref": "<cast or location id>", "wanted": "...", "used": "..."}: things that no item fits, and the neutral item used.',
  };
}

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
      plant: { species: C.PLANT_SPECIES, tone: C.TONES, face: "boolean", bloom: `${C.PLANT_BLOOMS.join(" | ")} (optional: how much bloom the plant usually carries)` },
      spirit: { element: C.SPIRIT_TYPES },
      crowd: { crowd: C.CROWD_TYPES, size: ["few", "many"], count: "optional whole number 1-8: an exact head count (two little boys = 2); leave it out and size decides" },
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
    perch_parts: C.PERCH_PARTS,
    environment_features: C.ENV_FEATURES,
    // story-state looks for figure.variant (see the catalog field "figure.variant")
    eye_states: C.EYE_STATES,
    plant_blooms: C.PLANT_BLOOMS,
    materials: C.MATERIALS,
  };
}
