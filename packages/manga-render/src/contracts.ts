/**
 * PanelSummary manga contracts — the single source of truth shared by the
 * MiniMax harness (apps/agent-worker), the deterministic renderer
 * (this package), the backend (stores these as JSON) and the reader.
 *
 * Rules:
 * - MiniMax authors SEMANTIC choices from the closed vocabularies below plus
 *   text. Code computes all geometry, art, lettering and reading order.
 * - Every vocabulary is closed. An unknown value is a validation error the
 *   model must fix; it is never silently replaced.
 * - Text is never truncated. Text that does not fit is a validation error.
 */

// ---------------------------------------------------------------------------
// Page space
// ---------------------------------------------------------------------------

/** Every page is drawn in this fixed coordinate system (viewBox 0 0 W H). */
export const PAGE_WIDTH = 1000;
export const PAGE_HEIGHT = 1500;
export const PAGE_MARGIN = 40;
export const DEFAULT_GUTTER = 18;

export interface Point {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------
// Shared references
// ---------------------------------------------------------------------------

/** A pointer into the parsed source. `page` is the 1-based PDF page number. */
export interface SourceRef {
  unit: string;
  page: number;
}

/**
 * How a piece of lettering relates to the book. The reader shows this in the
 * source drawer so a dramatized line is never mistaken for a quotation.
 * - quote: verbatim (or near-verbatim) text from the source.
 * - paraphrase: the source's content in shorter words.
 * - dramatized: invented dialogue/thought that acts out a source fact.
 * - metaphor: an explanatory image or comparison the source does not make.
 */
export const FIDELITY = ["quote", "paraphrase", "dramatized", "metaphor"] as const;
export type Fidelity = (typeof FIDELITY)[number];

// ---------------------------------------------------------------------------
// Visual vocabularies (closed)
// ---------------------------------------------------------------------------

/** Ink/tone fills. Pages are black-and-white manga with screentones. */
export const TONES = [
  "white",
  "light",
  "mid",
  "dark",
  "black",
  "dots",
  "dense_dots",
  "stripes",
  "check",
  "flowers",
  "gold",
  "stone",
] as const;
export type Tone = (typeof TONES)[number];

export const SHOTS = [
  "establishing", // setting dominates; figures tiny
  "wide", // whole scene, figures small
  "full", // full body fills most of the panel height
  "medium", // waist up
  "close", // head and shoulders
  "extreme_close", // eyes / face detail
  "insert", // a prop or detail, no full figure
] as const;
export type Shot = (typeof SHOTS)[number];

export const ANGLES = ["eye", "high", "low", "birds_eye", "worms_eye", "dutch"] as const;
export type Angle = (typeof ANGLES)[number];

/** Horizontal placement slot of a figure inside its panel. */
export const SLOTS = ["left", "center_left", "center", "center_right", "right"] as const;
export type Slot = (typeof SLOTS)[number];

export const DEPTHS = ["fore", "mid", "back"] as const;
export type Depth = (typeof DEPTHS)[number];

export const FACINGS = ["left", "right", "front", "back"] as const;
export type Facing = (typeof FACINGS)[number];

export const POSES = [
  "stand",
  "walk",
  "run",
  "sit",
  "kneel",
  "lie",
  "fall",
  "jump",
  "point",
  "reach",
  "wave",
  "arms_crossed",
  "hands_on_hips",
  "think",
  "cover_face",
  "cower",
  "bow",
  "hold",
  "carry",
  "talk",
  "fly",
  "perch",
] as const;
export type Pose = (typeof POSES)[number];

export const EXPRESSIONS = [
  "neutral",
  "happy",
  "laugh",
  "gentle",
  "sad",
  "cry",
  "angry",
  "shout",
  "surprised",
  "afraid",
  "determined",
  "thinking",
  "worried",
  "smug",
  "tired",
  "asleep",
  "pain",
  "love",
] as const;
export type Expression = (typeof EXPRESSIONS)[number];

// --- character looks -------------------------------------------------------

export const HUMAN_AGES = ["child", "teen", "adult", "elder"] as const;
export const HUMAN_BUILDS = ["slim", "average", "broad", "heavy"] as const;
export const HUMAN_HEIGHTS = ["short", "average", "tall", "giant"] as const;
export const HUMAN_FRAMES = ["masc", "fem", "neutral"] as const;
export const HAIR_STYLES = [
  "bald",
  "buzz",
  "short",
  "side_part",
  "messy",
  "spiky",
  "curly",
  "long_straight",
  "long_wavy",
  "ponytail",
  "bun",
  "braids",
  "bob",
] as const;
export const FACIAL_HAIR = ["none", "stubble", "mustache", "beard", "long_beard"] as const;
export const OUTFITS = [
  "tunic",
  "shirt_trousers",
  "suit",
  "long_coat",
  "dress",
  "gown",
  "robe",
  "uniform",
  "armor",
  "rags",
  "work_apron",
  "cloak",
  "royal",
  "scholar",
] as const;
export const HEADWEAR = [
  "none",
  "crown",
  "top_hat",
  "wide_hat",
  "cap",
  "hood",
  "helmet",
  "wreath",
  "bonnet",
] as const;
export const ACCESSORIES = [
  "glasses",
  "scarf",
  "cane",
  "satchel",
  "sword_belt",
  "medal",
  "necklace",
  "cape",
  "gloves",
  "earring",
] as const;
export const SKIN_TONES = ["light", "mid", "dark"] as const;
export const MATERIALS = ["flesh", "stone", "gold", "bronze"] as const;

export interface HumanLook {
  kind: "human";
  age: (typeof HUMAN_AGES)[number];
  build: (typeof HUMAN_BUILDS)[number];
  height: (typeof HUMAN_HEIGHTS)[number];
  frame: (typeof HUMAN_FRAMES)[number];
  hair: (typeof HAIR_STYLES)[number];
  hair_tone: Tone;
  facial_hair: (typeof FACIAL_HAIR)[number];
  outfit: (typeof OUTFITS)[number];
  outfit_tone: Tone;
  headwear: (typeof HEADWEAR)[number];
  accessories: (typeof ACCESSORIES)[number][];
  skin: (typeof SKIN_TONES)[number];
  /** "gold"/"stone"/"bronze" draw a statue of this person. */
  material: (typeof MATERIALS)[number];
}

export const BIRD_SPECIES = [
  "swallow",
  "nightingale",
  "sparrow",
  "linnet",
  "dove",
  "crow",
  "owl",
  "duck",
] as const;
export interface BirdLook {
  kind: "bird";
  species: (typeof BIRD_SPECIES)[number];
  tone: Tone;
}

export const ANIMAL_SPECIES = [
  "rat",
  "mouse",
  "cat",
  "dog",
  "fox",
  "rabbit",
  "frog",
  "lizard",
  "horse",
  "bear",
  "fish",
] as const;
export interface AnimalLook {
  kind: "animal";
  species: (typeof ANIMAL_SPECIES)[number];
  tone: Tone;
}

export const INSECT_SPECIES = ["butterfly", "dragonfly", "bee"] as const;
export interface InsectLook {
  kind: "insect";
  species: (typeof INSECT_SPECIES)[number];
  tone: Tone;
}

/** Personified objects (a talking rocket, a lamp with a face). */
export const OBJECT_SHAPES = [
  "rocket",
  "wheel",
  "candle",
  "lamp",
  "firecracker",
  "coin",
  "book",
  "clock",
  "cup",
  "kettle",
  "box",
] as const;
export interface ObjectLook {
  kind: "object";
  shape: (typeof OBJECT_SHAPES)[number];
  tone: Tone;
  face: boolean;
}

export const PLANT_SPECIES = ["oak", "tree", "rose_bush", "flower", "reed", "daisy"] as const;
export interface PlantLook {
  kind: "plant";
  species: (typeof PLANT_SPECIES)[number];
  tone: Tone;
  face: boolean;
}

/** Personified forces of nature (the North Wind, Frost, Snow). */
export const SPIRIT_TYPES = ["wind", "frost", "snow", "hail", "sun", "moon", "fire", "rain"] as const;
export interface SpiritLook {
  kind: "spirit";
  element: (typeof SPIRIT_TYPES)[number];
}

/** A group treated as one actor (the townspeople, the children, soldiers). */
export const CROWD_TYPES = ["townsfolk", "children", "soldiers", "officials", "workers", "nobles"] as const;
export interface CrowdLook {
  kind: "crowd";
  crowd: (typeof CROWD_TYPES)[number];
  size: "few" | "many";
}

/**
 * Abstract actors for nonfiction ideas (the State, the Law, Conscience).
 * Rendered as a clear emblem figure; always paired with fidelity "metaphor"
 * when it speaks.
 */
export const EMBLEMS = [
  "state",
  "law",
  "money",
  "conscience",
  "machine",
  "crowd_voice",
  "time",
  "idea",
] as const;
export interface EmblemLook {
  kind: "emblem";
  emblem: (typeof EMBLEMS)[number];
}

export type CharacterLook =
  | HumanLook
  | BirdLook
  | AnimalLook
  | InsectLook
  | ObjectLook
  | PlantLook
  | SpiritLook
  | CrowdLook
  | EmblemLook;

export const LOOK_KINDS = [
  "human",
  "bird",
  "animal",
  "insect",
  "object",
  "plant",
  "spirit",
  "crowd",
  "emblem",
] as const;

// --- environments, props, fx ----------------------------------------------

export const ENVIRONMENTS = [
  "city_square",
  "street",
  "rooftops",
  "room_poor",
  "room_rich",
  "garret",
  "palace_hall",
  "garden",
  "forest",
  "meadow",
  "riverbank",
  "pond",
  "seaside",
  "sky",
  "church",
  "cottage",
  "mill",
  "market",
  "jail_cell",
  "courtroom",
  "study",
  "classroom",
  "country_road",
  "town_hall",
  "abstract",
  "void",
] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const ENV_FEATURES = [
  "statue_column",
  "fountain",
  "window",
  "fireplace",
  "bed",
  "table",
  "bookshelf",
  "trees",
  "fence",
  "high_wall",
  "gate",
  "bars",
  "river",
  "bridge",
  "lamp_post",
  "clock_tower",
  "flowers",
  "snow_ground",
  "crowd_background",
  "door",
] as const;
export type EnvFeature = (typeof ENV_FEATURES)[number];

export const TIMES = ["day", "dusk", "night", "dawn"] as const;
export const WEATHERS = ["clear", "rain", "snow", "wind", "storm", "fog"] as const;

export const PROPS = [
  "sword",
  "gem",
  "coin",
  "coins_pile",
  "money_bag",
  "rose",
  "flower",
  "book",
  "letter",
  "paper",
  "scroll",
  "lamp",
  "candle",
  "matches",
  "needle",
  "bread",
  "cup",
  "bottle",
  "basket",
  "bag",
  "key",
  "chains",
  "crown",
  "staff",
  "umbrella",
  "spade",
  "wheelbarrow",
  "ballot_box",
  "gavel",
  "clock",
  "feather",
  "bell",
  "flag",
] as const;
export type PropId = (typeof PROPS)[number];

export const FX = [
  "speed_lines",
  "focus_lines",
  "impact_burst",
  "sparkle",
  "sweat_drop",
  "anger_mark",
  "shock_lines",
  "rain",
  "snow",
  "wind",
  "light_rays",
  "dark_mood",
  "soft_glow",
  "flashback",
] as const;
export type FxId = (typeof FX)[number];

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * A page layout is either a named template (panels fill its slots in reading
 * order) or an authored split tree. Sizes are relative weights (normalised by
 * the compiler). `slant` tilts the gutters of a split by up to ±12 degrees.
 */
export type LayoutNode =
  | { panel: string }
  | { split: "rows" | "cols"; sizes: number[]; children: LayoutNode[]; slant?: number };

export interface LayoutSpec {
  template?: string;
  tree?: LayoutNode;
  /** Mirror the page for right-to-left reading. Default false (left-to-right). */
  rtl?: boolean;
}

// ---------------------------------------------------------------------------
// Page spec (authored by MiniMax, validated + rendered by code)
// ---------------------------------------------------------------------------

export const TEXT_KINDS = [
  "speech",
  "thought",
  "shout",
  "whisper",
  "narration",
  "caption",
  "sfx",
] as const;
export type TextKind = (typeof TEXT_KINDS)[number];

export interface TextSpec {
  kind: TextKind;
  /** Cast id. Required for speech/thought/shout/whisper; forbidden otherwise. */
  speaker?: string;
  text: string;
  fidelity: Fidelity;
  source?: SourceRef;
}

export interface FigureSpec {
  character: string;
  pose: Pose;
  expression: Expression;
  facing: Facing;
  slot: Slot;
  depth?: Depth;
  holding?: PropId;
}

export interface PropSpec {
  prop: PropId;
  slot: Slot;
  depth?: Depth;
}

export interface PanelSpec {
  id: string;
  /** What this panel shows, in one sentence. Not lettered. */
  beat: string;
  shot: Shot;
  angle: Angle;
  location: string;
  time?: (typeof TIMES)[number];
  weather?: (typeof WEATHERS)[number];
  figures: FigureSpec[];
  props: PropSpec[];
  fx: FxId[];
  text: TextSpec[];
  source: SourceRef[];
}

export interface MangaPageSpec {
  schema: "manga-page.v1";
  page_number: number;
  section_id: string;
  /** The single beat this page carries. Not lettered. */
  purpose: string;
  layout: LayoutSpec;
  /** In reading order. 1-7 panels. */
  panels: PanelSpec[];
  /** Claim ids (from the adaptation plan) this page conveys. */
  claims: string[];
  /** True when the last panel is a page-turn hook. */
  page_turn_hook: boolean;
}

// ---------------------------------------------------------------------------
// Book understanding and adaptation plan (authored by MiniMax)
// ---------------------------------------------------------------------------

export interface CastMember {
  id: string;
  name: string;
  role: string;
  description: string;
  look: CharacterLook;
}

export interface LocationSpec {
  id: string;
  name: string;
  environment: Environment;
  features: EnvFeature[];
  description: string;
}

export const CLAIM_KINDS = ["event", "idea", "fact", "relationship", "argument", "quote"] as const;
export const CLAIM_IMPORTANCE = ["core", "supporting", "detail"] as const;

export interface Claim {
  id: string;
  section_id: string;
  kind: (typeof CLAIM_KINDS)[number];
  importance: (typeof CLAIM_IMPORTANCE)[number];
  text: string;
  source: SourceRef[];
}

export interface SectionSummary {
  id: string;
  title: string;
  summary: string;
  units: string[];
}

export interface BookUnderstanding {
  schema: "book-understanding.v1";
  title: string;
  author: string;
  kind: "fiction" | "nonfiction" | "mixed";
  logline: string;
  sections: SectionSummary[];
  cast: CastMember[];
  locations: LocationSpec[];
  claims: Claim[];
  themes: string[];
}

export interface PlannedPage {
  page_number: number;
  section_id: string;
  beat: string;
  claims: string[];
  cast: string[];
  locations: string[];
  /** Units this page adapts; the page goal receives their full text. */
  units: string[];
  page_turn_hook: boolean;
}

export interface AdaptationPlan {
  schema: "adaptation-plan.v1";
  pages: PlannedPage[];
  omitted: { claim: string; reason: string }[];
}

// ---------------------------------------------------------------------------
// Render output (produced by code)
// ---------------------------------------------------------------------------

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  code: string;
  severity: IssueSeverity;
  /** Where: "page", "panel p2", "panel p2 text 1", "cast c_rocket", ... */
  path: string;
  message: string;
}

export interface RenderedPanel {
  id: string;
  /** Polygon in page space, clockwise. */
  polygon: Point[];
  bbox: Box;
  /** Reading order, 0-based. */
  order: number;
}

export interface RenderedText {
  panel: string;
  index: number;
  kind: TextKind;
  speaker?: string;
  text: string;
  fidelity: Fidelity;
  source?: SourceRef;
  bbox: Box;
  font_px: number;
  lines: string[];
}

export interface RenderResult {
  renderer_version: string;
  svg: string;
  width: number;
  height: number;
  panels: RenderedPanel[];
  texts: RenderedText[];
  issues: ValidationIssue[];
  /** sha256 of the svg string. */
  svg_hash: string;
  metrics: {
    panel_count: number;
    words_total: number;
    words_max_panel: number;
    figures_total: number;
  };
}
