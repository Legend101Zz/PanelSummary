/**
 * catalog(): everything the LLM is shown about what the renderer can draw —
 * closed vocabularies, layout templates with their storytelling use, and the
 * poses/expressions each look kind supports.
 */
import * as C from "./contracts.js";
import type { CharacterLook, Expression, Pose } from "./contracts.js";
import { COL_GUTTER, MAX_PANELS, MIN_PANEL_SIDE, MAX_PANEL_ASPECT, MAX_SLANT, ROW_GUTTER, TEMPLATES } from "./layout/index.js";
import { MAX_FIGURES, MAX_FX, MAX_PROPS, SPEAKER_MIN_HEAD_RADIUS, STAGING_FEATURES } from "./scene/index.js";
import { KIND_STYLES, MAX_BALLOON_LINES, minFontSize } from "./lettering/styles.js";
import { HOOK_PAYOFF_MIN_SHARE, WORD_LIMITS } from "./validate/page.js";
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
  establishing:
    "the place dominates; figures about 20-25% of the panel height, too small to speak. Open a scene or a new place, with at most a caption. A statue (gold/stone/bronze) in a place with a statue_column is drawn standing on the column.",
  wide: "the whole scene; figures about 40% of the panel height. Group action, movement through a place. At most one short line (8 words or fewer).",
  full: "the whole body at about 75% of the panel height. Posture, action, a character entering.",
  medium: "head to waist fills the panel. Conversation and gesture: the workhorse shot for dialogue.",
  close: "head and shoulders. Emotion, an important line. One or two figures (three crowd the faces); never from behind.",
  extreme_close: "one face fills the panel (only the first figure is drawn). A shock, tears, a decision, at most once a page. Keep text to one short line.",
  insert: "one prop drawn large (the panel's first prop, or a held prop); no figures. A clue, a gift, an object that matters.",
};

export const TEXT_KIND_GUIDE: Record<C.TextKind, string> = {
  speech: "spoken line in an oval balloon with a tail to the speaker (speaker required). Two consecutive speeches by one speaker in a panel are drawn as connected balloons.",
  thought: "unspoken thought in a cloud with trailing bubbles (speaker required).",
  shout: "yelled line in a jagged burst, larger bold letters (speaker required). 8 words or fewer, and rare.",
  whisper: "quiet line in a dashed balloon (speaker required).",
  narration: "narrator's box tucked in a panel corner (no speaker). For what the pictures cannot show; one per panel at most.",
  caption:
    'small label box: place and time, 6 words or fewer (no speaker), e.g. "The city, at night". With "about": "<cast id drawn in this panel>" it becomes a name tag placed next to that character (introduce a newcomer by name).',
  sfx: 'drawn sound effect lettering, 1-3 sound words (no speaker), e.g. "FLAP FLAP". Placed in free space near the action, never over a face; it may break the panel border in panels with impact_burst or speed_lines.',
};

/** Optional fields that stage figures and colour key props (shown to the page writer). */
export const FIELD_GUIDE: Record<string, string> = {
  "figure.on":
    '{"target": "<cast id in this panel>", "part": "feet" | "shoulder" | "hand" | "head"} stands or perches the figure ON another figure at the target\'s scale (a swallow on the prince\'s shoulder). {"target": "<feature of this location>"} stages it on a feature: statue_column (stand on top), bed (lie in it), table (sit or stand at it), fountain (on the rim), bridge (on the deck). Without "on", a statue stands on its location\'s column in establishing/wide/full shots, a lying figure lies in the location\'s bed, and a perching small creature beside a statue on its column perches at the statue\'s feet.',
  "figure.holding_tone": "tone of the held prop, so key objects stay distinct across pages (a ruby \"black\", a sapphire \"mid\").",
  "prop.tone": "tone variant of a prop on the ground or in an insert (ruby vs sapphire).",
  "text.about": "captions only: the cast id this caption names; drawn as a name tag beside that character.",
  "pose.sit": "a sitter gets a seat: a bench outdoors, a chair indoors, a throne in a palace hall (none when staged with \"on\").",
  "pose.lie": "in medium and close shots the face sits in the panel's upper middle and the body runs out of frame toward the nearer edge.",
};

/** Warnings the renderer may return, and what to change (errors are always fixable from their message). */
export const WARNING_GUIDE: Record<string, string> = {
  FACE_COVERED: "a figure covers another figure's face and could not be moved aside: use other slots, a wider shot, or fewer figures.",
  SPEAKER_TOO_SMALL: `a speaker's head is drawn under ${SPEAKER_MIN_HEAD_RADIUS} units: use a full, medium or close shot for dialogue.`,
  EXTREME_CLOSE_MULTI: "extreme_close draws only the first figure; the others are dropped.",
  CLOSE_CROWDED: "three or more figures in a close shot: keep close shots to 1-2 faces.",
  FACING_BACK_CLOSE: "a close-up from behind shows no face.",
  BLOCKAGE_LAYOUT: "a tall panel beside a stack on its reading-earlier side: newcomers read across; use it only when either order works.",
  HOOK_PANEL_LARGEST: "the page-turn pull panel is the page's largest: make the last panel small or medium.",
  FIRST_PANEL_SMALL_AFTER_HOOK: `after a hook the first panel should be large (${Math.round(HOOK_PAYOFF_MIN_SHARE * 100)}% of the page or more).`,
  BALLOON_TALL: `a balloon needs more than ${MAX_BALLOON_LINES} lines: shorten it or give the panel more width.`,
  TAILS_CROSS: "two tails cross: put speakers left to right in speaking order.",
  TAIL_CROSSES_FACE: "a tail passes over another character's face, so the line may read as theirs.",
  SFX_OVER_SUBJECT: "an SFX had to overlap the insert's subject.",
  ON_PART_IGNORED: '"part" is only used when "on" names a figure.',
  ABOUT_NOT_IN_PANEL: "a name-tag caption names a character not drawn in the panel; it is placed as an ordinary caption.",
  HOLDING_TONE_UNUSED: '"holding_tone" without "holding".',
  WORDS_BALLOON: `a text has more than ${WORD_LIMITS.balloonWarn} words (${WORD_LIMITS.balloonError} is rejected).`,
};

export interface Catalog {
  renderer_version: string;
  /** `gutter` is kept for older readers (= the row gutter). */
  page: { width: number; height: number; margin: number; gutter: number; row_gutter: number; col_gutter: number };
  limits: Record<string, number>;
  vocabularies: Record<string, readonly string[]>;
  looks: Record<string, { fields: Record<string, readonly string[] | string>; poses: readonly Pose[]; expressions: readonly Expression[] }>;
  templates: { id: string; slots: number; description: string }[];
  shots: Record<string, string>;
  text_kinds: Record<string, { use: string; font_px: readonly number[]; min_font_px: number }>;
  slant: { max_degrees: number; note: string };
  fields: Record<string, string>;
  warnings: Record<string, string>;
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
    page: { width: C.PAGE_WIDTH, height: C.PAGE_HEIGHT, margin: C.PAGE_MARGIN, gutter: ROW_GUTTER, row_gutter: ROW_GUTTER, col_gutter: COL_GUTTER },
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
      speaker_min_head_radius_px: SPEAKER_MIN_HEAD_RADIUS,
      balloon_max_lines: MAX_BALLOON_LINES,
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
      perch_parts: C.PERCH_PARTS,
      staging_features: STAGING_FEATURES,
    },
    looks,
    templates: TEMPLATES.map((t) => ({ id: t.id, slots: t.slots, description: t.description })),
    shots: SHOT_GUIDE,
    text_kinds: textKinds,
    slant: {
      max_degrees: MAX_SLANT,
      note: "Authored trees may tilt a split's gutters with \"slant\" (degrees). Reading order is the tree's depth-first leaf order; list panels in that order.",
    },
    fields: FIELD_GUIDE,
    warnings: WARNING_GUIDE,
  };
}
