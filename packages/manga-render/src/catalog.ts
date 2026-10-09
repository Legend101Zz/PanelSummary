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
import { variantFieldsFor } from "./scene/looks.js";

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
    "the place dominates; figures about 20-25% of the panel height, too small to speak (a speaker under the readable size is rejected). Open a scene or a new place, with at most a caption. A statue (gold/stone/bronze) in a place with a statue_column stands on the column; when the statue is not one of the figures, the column still carries it as scenery. A small creature at depth \"fore\" is near the camera and drawn big enough to read.",
  wide: "the whole scene; figures about 40% of the panel height. Group action, movement through a place. At most one short line (8 words or fewer), from a person, not a small creature (it would be too small to read).",
  full: "the whole body at about 75% of the panel height. Posture, action, a character entering. A statue stands on its column top.",
  medium:
    "head to waist fills the panel. Conversation and gesture: the workhorse shot for dialogue. A statue on its column is seen from up at its own height (sky and rooftops behind it); a creature at the statue's feet is framed on the column top between its feet.",
  close: "head and shoulders. Emotion, an important line. One or two figures (three crowd the faces); never from behind. A small creature beside a much taller figure perches on that figure's shoulder.",
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
    '{"target": "<cast id in this panel>", "part": "feet" | "shoulder" | "hand" | "head"} stands or perches the figure ON another figure at the target\'s scale (a swallow on the prince\'s shoulder). {"target": "<feature of this location>"} stages it on a feature: statue_column (stand on top), bed (lie in it), table (sit or stand at it), fountain (on the rim), bridge (on the deck). Without "on", a statue stands on its location\'s column in EVERY shot (never at street level; lying or falling statues excepted), a lying figure lies in the location\'s bed, and a small creature sharing a panel with a statue on its column is up there with it: at its feet in establishing/wide/full shots, on its shoulder in medium/close shots, or on the part the panel\'s beat names ("between his feet", "on his shoulder"). {"target": "<statue id>", "part": "feet"} sits at the statue\'s feet ON the column top in any shot.',
  "figure.variant":
    '{"eyes"?: "open" | "closed" | "blind" | "one_blind" | "dead", "bloom"?: "full" | "buds" | "single" | "bare", "material"?: flesh|stone|gold|bronze, "outfit_tone"?: <tone>, "hair_tone"?: <tone>, "tone"?: <tone>} changes how this character looks in THIS panel when the story has changed them (the Happy Prince stripped of his gold: {"material": "stone", "eyes": "blind"}; a bird that has died: {"eyes": "dead"}). Unset fields keep the cast look. People take eyes, material, outfit_tone, hair_tone; creatures and objects take eyes and tone; plants take eyes, tone and bloom (a rose-tree that bears no roses this year: {"bloom": "bare"}; the one marvellous rose: {"bloom": "single"}; shut buds: {"bloom": "buds"}); spirits, crowds and emblems take eyes only. Repeat the variant in every later panel where the change holds.',
  "figure.variant.eyes": 'eye state for this appearance: "open" (default), "closed" (asleep, eyes shut), "blind" (empty sockets, no iris: a statue whose gem eyes are gone), "one_blind" (ONE socket empty and one eye still there: a statue after the first of two gems is given away), "dead" (closed-line or crossed eyes). Use "dead" only for death; pain and sleep are expressions.',
  "figure.holding": "a prop in the figure's hand (or beak). Do not also list it in the panel's props: it is drawn once, in the hand. A figure posed \"carry\" (or \"hold\") with no holding takes the panel's first carriable prop into its arms, and the beat's subject takes a prop the beat says it goes \"with\". Wheelbarrows and other big things are props beside a figure, not held.",
  "figure.holding_tone": "tone of the held prop, so key objects stay distinct across pages (a ruby \"black\", a sapphire \"mid\").",
  "prop.tone": "tone variant of a prop on the ground or in an insert (ruby vs sapphire).",
  "text.about": "captions only: the cast id this caption names; drawn as a name tag beside that character.",
  "pose.sit": "a sitter always gets a seat: a bench outdoors, a chair indoors, a throne in a palace hall (none when staged with \"on\").",
  "pose.lie": "lies horizontally on the ground (or in the location's bed), inside the frame; in medium and close shots the face sits in the panel's upper middle, the body runs out toward the nearer edge, and a band of ground lies under it.",
  "pose.kneel": "kneels on the ground at the figure's true scale.",
  "pose.fly": "always airborne (lifted off the ground in ground shots); never drawn standing.",
  "pose.fall": "just off the ground, with its shadow on the ground below.",
  "prop.key":
    "a prop the panel's beat names (\"hands over the basket\", \"the lantern\") is key: it is drawn in front of the figures and no balloon, caption or SFX may cover it (KEY_PROP_COVERED). Keep the text short when the object must show.",
  "text.sfx": "placed beside what makes the sound (a flying, running or falling figure, else the beat's prop), never over a face, the sound's source or a key prop; it may break the border only with impact_burst or speed_lines, and never leaves its own panel by more than a quarter or the page's live area.",
  "text.title": "the first text of a page's first panel, a caption in Title Case (a tale's title), stays on one line at the top.",
};

/** Errors the renderer may return (the page is rejected until they are fixed). */
export const ERROR_GUIDE: Record<string, string> = {
  SPEAKER_TOO_SMALL: `a speaker's head is drawn under ${SPEAKER_MIN_HEAD_RADIUS} units: use a medium or close shot for dialogue (a full shot for a person); a speaking small creature needs a close-range shot or depth "fore".`,
  TAIL_CROSSES_FACE: "a tail passes over another character's face, so the line reads as theirs: put speakers left to right in speaking order, or split the exchange.",
  TAIL_CROSSES_TEXT: "a tail runs through another caption, name tag or balloon: use fewer texts in the panel, or move the caption elsewhere.",
  TAIL_MISDIRECTED: "a tail or thought trail ends nearer another character than its speaker: give the speaker room (another slot or a closer shot).",
  KEY_PROP_COVERED: "text had to cover the prop the beat is about: shorten the text, give the panel more room, or show the object in an insert.",
  VARIANT_FIELD_INVALID: "a look variant sets a field the character's kind does not have (material only for people; tone only for creatures, objects and plants).",
  TEXT_GLYPH_MISSING: "the lettering font has no glyph for a character (it would print as an empty box): write it with plain letters and punctuation.",
  TEXT_DOES_NOT_FIT: "the text does not fit at the minimum size without covering a face or another text: shorten it or give the panel more room.",
};

/** Warnings the renderer may return, and what to change (errors are always fixable from their message). */
export const WARNING_GUIDE: Record<string, string> = {
  FACE_COVERED: "a figure covers another figure's face and could not be moved aside: use other slots, a wider shot, or fewer figures.",
  DUPLICATE_PROP: "a panel prop repeats a figure's held prop; it is drawn once, in the hand. Drop one of them.",
  HOLDING_TOO_LARGE: "a wheelbarrow or other big thing cannot be held: make it a prop beside the figure.",
  PROP_HIDDEN: "a prop ended up outside the frame or behind a figure: use another slot or depth, or name it in the beat.",
  FIGURE_CLIPPED: "a figure falls mostly outside the frame: use a slot nearer the centre or a wider shot.",
  FIGURE_HEAD_CLIPPED: "a figure's head falls outside the frame: use a wider shot or another slot.",
  SUBJECT_TOO_SMALL: "a figure held on another's hand or shoulder is too small to read in this shot: use a full or medium shot.",
  NAME_TAG_AMBIGUOUS: "a name tag sits as close to another character as to the one it names: give that character a slot apart.",
  SPEAKER_ORDER: "the first speaker stands on the reading-later side of the next one: put speakers left to right in the order they speak.",
  EXTREME_CLOSE_MULTI: "extreme_close draws only the first figure; the others are dropped.",
  CLOSE_CROWDED: "three or more figures in a close shot: keep close shots to 1-2 faces.",
  FACING_BACK_CLOSE: "a close-up from behind shows no face.",
  BLOCKAGE_LAYOUT: "a tall panel beside a stack on its reading-earlier side: newcomers read across; use it only when either order works.",
  HOOK_PANEL_LARGEST: "the page-turn pull panel is the page's largest: make the last panel small or medium.",
  FIRST_PANEL_SMALL_AFTER_HOOK: `after a hook the first panel should be large (${Math.round(HOOK_PAYOFF_MIN_SHARE * 100)}% of the page or more).`,
  BALLOON_TALL: `a balloon needs more than ${MAX_BALLOON_LINES} lines: shorten it or give the panel more width.`,
  TAILS_CROSS: "two tails cross: put speakers left to right in speaking order.",
  SFX_OVER_SUBJECT: "an SFX had to overlap the insert's subject or the source of its sound.",
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
  /** Rejecting errors from drawing and lettering (beyond the vocabulary checks). */
  errors: Record<string, string>;
  /** Look-variant fields each look kind accepts, and the eye states. */
  variants: { fields: Record<string, readonly string[]>; eyes: readonly string[] };
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
    plant: { species: C.PLANT_SPECIES, tone: C.TONES, face: "boolean", bloom: C.PLANT_BLOOMS },
    spirit: { element: C.SPIRIT_TYPES },
    crowd: { crowd: C.CROWD_TYPES, size: ["few", "many"], count: "optional whole number 1-8: an exact head count (\"two little boys\" is 2); leave it out and size decides" },
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
      eye_states: C.EYE_STATES,
      plant_blooms: C.PLANT_BLOOMS,
      materials: C.MATERIALS,
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
    errors: ERROR_GUIDE,
    variants: {
      fields: Object.fromEntries(C.LOOK_KINDS.map((k) => [k, variantFieldsFor(k)])),
      eyes: C.EYE_STATES,
    },
  };
}
