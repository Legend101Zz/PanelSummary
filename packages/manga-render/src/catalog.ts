/**
 * catalog(): everything the LLM is shown about what the renderer can draw —
 * closed vocabularies, layout templates with their storytelling use, and the
 * poses/expressions each look kind supports.
 */
import * as C from "./contracts.js";
import type { CharacterLook, Expression, Pose } from "./contracts.js";
import { MAX_PANELS, MIN_PANEL_SIDE, MAX_PANEL_ASPECT, MAX_SLANT, TEMPLATES } from "./layout/index.js";
import { MAX_FIGURES, MAX_FX, MAX_PROPS } from "./scene/index.js";
import { KIND_STYLES, minFontSize } from "./lettering/styles.js";
import { WORD_LIMITS } from "./validate/page.js";
import { MAX_CLAIMS_PER_PAGE } from "./validate/book.js";
import { rig } from "./rig/index.js";
import { RENDERER_VERSION } from "./render.js";

/** One representative look per kind, used to ask each rig what it supports. */
export const REPRESENTATIVE_LOOKS: Record<CharacterLook["kind"], CharacterLook> = {
  human: {
    kind: "human",
    age: "adult",
    build: "average",
    height: "average",
    frame: "neutral",
    hair: "short",
    hair_tone: "dark",
    facial_hair: "none",
    outfit: "shirt_trousers",
    outfit_tone: "light",
    headwear: "none",
    accessories: [],
    skin: "light",
    material: "flesh",
  },
  bird: { kind: "bird", species: "sparrow", tone: "mid" },
  animal: { kind: "animal", species: "dog", tone: "mid" },
  insect: { kind: "insect", species: "butterfly", tone: "light" },
  object: { kind: "object", shape: "lamp", tone: "light", face: true },
  plant: { kind: "plant", species: "tree", tone: "mid", face: true },
  spirit: { kind: "spirit", element: "wind" },
  crowd: { kind: "crowd", crowd: "townsfolk", size: "few" },
  emblem: { kind: "emblem", emblem: "idea" },
};

export const SHOT_GUIDE: Record<C.Shot, string> = {
  establishing: "the place dominates; figures ~20-25% of panel height. Open scenes and new locations.",
  wide: "whole scene; figures ~40% of panel height. Group action, movement through a place.",
  full: "whole body at ~75% of panel height. Posture, action, a character entering.",
  medium: "head to waist fills the panel. Conversation and gesture — the workhorse shot.",
  close: "head and shoulders. Emotion, an important line.",
  extreme_close: "the face fills the panel. A shock, tears, a decision. Keep text to one short line.",
  insert: "one prop drawn large (the panel's first prop, or a held prop); no figures. A clue, a gift, an object that matters.",
};

export const TEXT_KIND_GUIDE: Record<C.TextKind, string> = {
  speech: "spoken line in an oval balloon with a tail to the speaker (speaker required).",
  thought: "unspoken thought in a cloud with trailing bubbles (speaker required).",
  shout: "yelled line in a jagged burst, larger bold letters (speaker required).",
  whisper: "quiet line in a dashed balloon (speaker required).",
  narration: "narrator's box tucked in a panel corner (no speaker). Use sparingly.",
  caption: "small label box at a panel edge: time, place (no speaker). E.g. \"Next morning\".",
  sfx: "drawn sound effect lettering, 1-3 sound words (no speaker). E.g. \"FLAP FLAP\".",
};

export interface Catalog {
  renderer_version: string;
  page: { width: number; height: number; margin: number; gutter: number };
  limits: Record<string, number>;
  vocabularies: Record<string, readonly string[]>;
  looks: Record<string, { fields: Record<string, readonly string[] | string>; poses: readonly Pose[]; expressions: readonly Expression[] }>;
  templates: { id: string; slots: number; description: string }[];
  shots: Record<string, string>;
  text_kinds: Record<string, { use: string; font_px: readonly number[]; min_font_px: number }>;
  slant: { max_degrees: number; note: string };
}

function safe<T>(fn: () => readonly T[]): readonly T[] {
  try {
    return fn();
  } catch {
    return [];
  }
}

export function catalog(): Catalog {
  const lookFields: Record<CharacterLook["kind"], Record<string, readonly string[] | string>> = {
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
  };
  const looks: Catalog["looks"] = {};
  for (const kind of C.LOOK_KINDS) {
    const look = REPRESENTATIVE_LOOKS[kind];
    looks[kind] = {
      fields: lookFields[kind],
      poses: safe(() => rig.supportedPoses(look)),
      expressions: safe(() => rig.supportedExpressions(look)),
    };
  }
  const textKinds: Catalog["text_kinds"] = {};
  for (const kind of C.TEXT_KINDS) {
    textKinds[kind] = { use: TEXT_KIND_GUIDE[kind], font_px: KIND_STYLES[kind].sizes, min_font_px: minFontSize(kind) };
  }
  return {
    renderer_version: RENDERER_VERSION,
    page: { width: C.PAGE_WIDTH, height: C.PAGE_HEIGHT, margin: C.PAGE_MARGIN, gutter: C.DEFAULT_GUTTER },
    limits: {
      max_panels: MAX_PANELS,
      max_figures_per_panel: MAX_FIGURES,
      max_props_per_panel: MAX_PROPS,
      max_fx_per_panel: MAX_FX,
      min_panel_side_px: MIN_PANEL_SIDE,
      max_panel_aspect: MAX_PANEL_ASPECT,
      max_claims_per_page: MAX_CLAIMS_PER_PAGE,
      words_per_balloon_warn: WORD_LIMITS.balloonWarn,
      words_per_balloon_max: WORD_LIMITS.balloonError,
      words_per_panel_warn: WORD_LIMITS.panelWarn,
      words_per_panel_max: WORD_LIMITS.panelError,
      words_per_page_warn: WORD_LIMITS.pageWarn,
      words_per_page_max: WORD_LIMITS.pageError,
      sfx_words_max: WORD_LIMITS.sfxError,
    },
    vocabularies: {
      shots: C.SHOTS,
      angles: C.ANGLES,
      slots: C.SLOTS,
      depths: C.DEPTHS,
      facings: C.FACINGS,
      poses: C.POSES,
      expressions: C.EXPRESSIONS,
      tones: C.TONES,
      look_kinds: C.LOOK_KINDS,
      environments: C.ENVIRONMENTS,
      env_features: C.ENV_FEATURES,
      times: C.TIMES,
      weathers: C.WEATHERS,
      props: C.PROPS,
      fx: C.FX,
      text_kinds: C.TEXT_KINDS,
      fidelity: C.FIDELITY,
      claim_kinds: C.CLAIM_KINDS,
      claim_importance: C.CLAIM_IMPORTANCE,
    },
    looks,
    templates: TEMPLATES.map((t) => ({ id: t.id, slots: t.slots, description: t.description })),
    shots: SHOT_GUIDE,
    text_kinds: textKinds,
    slant: {
      max_degrees: MAX_SLANT,
      note: "Authored trees may tilt a split's gutters with \"slant\" (degrees). Reading order is the tree's depth-first leaf order; list panels in that order.",
    },
  };
}
