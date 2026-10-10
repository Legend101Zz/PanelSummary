/**
 * Prop planning for one panel, before anything is drawn:
 * - a panel prop that duplicates a figure's `holding` is drawn once, in the
 *   hand (the ground copy is dropped, DUPLICATE_PROP);
 * - a figure posed "carry" (or "hold" when nobody carries) that holds
 *   nothing takes the panel's first carriable prop into its arms, and a
 *   walking/standing figure takes a prop the beat says it goes "with";
 * - key props are the insert's subject and every prop the beat mentions
 *   (by id or a common word for it: "lantern" is a lamp, "sack" a bag).
 *   Lettering never covers a key prop.
 */
import type { FigureSpec, PanelSpec, Pose, PropId, PropSpec, Tone, ValidationIssue } from "../contracts.js";

/** Words a beat may use for each prop (the id itself always counts). */
export const PROP_WORDS: Partial<Record<PropId, readonly string[]>> = {
  sword: ["sword", "swords", "sword-hilt", "blade"],
  gem: ["gem", "gems", "ruby", "rubies", "sapphire", "sapphires", "jewel", "jewels", "diamond", "emerald"],
  coin: ["coin", "penny", "pennies"],
  coins_pile: ["coins", "treasure"],
  money_bag: ["purse", "moneybag", "money-bag"],
  rose: ["rose", "roses"],
  flower: ["flower", "flowers", "nosegay", "primrose", "primroses", "violet", "violets", "tulip", "tulips", "lily", "lilies", "posy", "bouquet", "rose-tree", "rose-trees", "rose-bush", "rose-bushes", "blossom", "blossoms", "bloom", "blooms"],
  book: ["book", "books"],
  letter: ["letter", "letters", "envelope"],
  paper: ["paper", "papers", "notebook", "manuscript"],
  scroll: ["scroll", "scrolls"],
  lamp: ["lamp", "lantern"],
  candle: ["candle", "candles"],
  matches: ["match", "matches"],
  needle: ["needle"],
  bread: ["bread", "loaf", "cake"],
  cup: ["cup", "tumbler", "mug", "goblet"],
  bottle: ["bottle", "flask"],
  basket: ["basket"],
  bag: ["bag", "sack"],
  key: ["key"],
  chains: ["chain", "chains"],
  crown: ["crown"],
  staff: ["staff", "stick", "cane"],
  umbrella: ["umbrella"],
  spade: ["spade", "shovel"],
  wheelbarrow: ["wheelbarrow", "barrow"],
  ballot_box: ["ballot", "ballot-box"],
  gavel: ["gavel"],
  clock: ["clock"],
  feather: ["feather", "quill"],
  bell: ["bell"],
  flag: ["flag", "banner"],
  gold_leaf: ["gold-leaf", "gold leaf", "gold leaves", "leaf of gold", "leaves of gold", "gilding"],
  thorn: ["thorn", "thorns"],
  axe: ["axe", "hatchet"],
  firework: ["firework", "fireworks", "squib", "roman candle"],
  sign: ["sign", "signboard", "notice", "notice-board", "noticeboard"],
  pot: ["pot", "pots", "saucepan", "cooking-pot", "cooking pot", "kettle", "cauldron"],
  stove: ["stove", "stoves", "oven", "range"],
  roast_goose: ["roast goose", "roast-goose", "goose", "roasted goose"],
  heart: ["heart", "hearts"],
  angel: ["angel", "angels", "cherub"],
  loom: ["loom", "looms"],
  sledge: ["sledge", "sledges", "sleigh", "sleighs"],
};

/** Props too big or too fixed to be picked up by a carrying figure. */
const NOT_CARRIED: ReadonlySet<PropId> = new Set(["wheelbarrow", "ballot_box", "coins_pile", "chains", "sign", "stove", "loom", "angel", "sledge"]);

function wordsFor(prop: PropId): readonly string[] {
  return PROP_WORDS[prop] ?? [prop.replace(/_/g, " ")];
}

function wordRe(words: readonly string[]): RegExp {
  const alt = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return new RegExp(`\\b(?:${alt})\\b`, "i");
}

/** Does the beat mention this prop? */
export function beatMentions(beat: string, prop: PropId): boolean {
  return wordRe(wordsFor(prop)).test(beat);
}

/** Does the beat say someone goes WITH this prop ("walks off with a basket", "carrying the lantern")? */
function beatCarries(beat: string, prop: PropId): boolean {
  const alt = wordsFor(prop).join("|");
  // "...the lantern; he walks away with it" carries the lantern too
  if (beatMentions(beat, prop) && /\b(?:with|carr\w*|hold\w*|clutch\w*|takes?|taking|keeps?|keeping)\b[^.;:]{0,20}?\b(?:it|them)\b/i.test(beat)) return true;
  return new RegExp(
    `\\b(?:with|carr\\w*|hold\\w*|clutch\\w*|bear\\w*|brings?|bringing|takes?|taking|pluck\\w*|snatch\\w*|seiz\\w*|grab\\w*|deliver\\w*|drops?|dropping|lays?|laying)\\b[^.;:]{0,40}?\\b(?:${alt})\\b`,
    "i",
  ).test(beat);
}

export interface HeldProp {
  prop: PropId;
  tone?: Tone;
  /** Taken from the panel's props (not the spec's `holding`). */
  adopted: boolean;
  /** For an adopted prop: its entry in the panel's props (to put it back on the ground). */
  source?: { spec: PropSpec; index: number };
}

export interface PropPlan {
  /** Props drawn on the ground (duplicates and adopted props removed), with their spec index. */
  ground: { spec: PropSpec; index: number }[];
  /** What each figure holds (by figure index in the panel). */
  held: Map<number, HeldProp>;
  /** Prop ids that are key to this panel (lettering keeps off them). */
  key: Set<PropId>;
  issues: ValidationIssue[];
}

const CARRY_POSES: ReadonlySet<Pose> = new Set(["carry"]);
const HOLD_POSES: ReadonlySet<Pose> = new Set(["hold"]);
const GOING_POSES: ReadonlySet<Pose> = new Set(["walk", "run", "stand", "talk", "fly", "reach"]);

export function planProps(panel: PanelSpec, figures: readonly FigureSpec[], maxProps: number): PropPlan {
  const issues: ValidationIssue[] = [];
  const path = `panel ${panel.id}`;
  const beat = typeof panel.beat === "string" ? panel.beat : "";
  const held = new Map<number, HeldProp>();
  figures.forEach((f, i) => {
    if (f.holding) held.set(i, { prop: f.holding, ...(f.holding_tone ? { tone: f.holding_tone } : {}), adopted: false });
  });
  const heldIds = new Set([...held.values()].map((h) => h.prop));
  let ground = panel.props.slice(0, maxProps).map((spec, index) => ({ spec, index }));
  // a prop in a figure's hand is not also drawn on the ground
  ground = ground.filter(({ spec, index }) => {
    if (!heldIds.has(spec.prop)) return true;
    issues.push({
      code: "DUPLICATE_PROP",
      severity: "warning",
      path: `${path} prop ${index}`,
      message: `prop "${spec.prop}" is also held by a figure in this panel, so it is drawn once, in the hand. Remove it from "props" (or remove "holding") so the story has one ${spec.prop}.`,
    });
    return false;
  });
  // carrying figures take a carriable prop into their arms
  const adopt = (i: number, pick: (p: PropSpec) => boolean) => {
    const k = ground.findIndex(({ spec }) => !NOT_CARRIED.has(spec.prop) && pick(spec));
    if (k < 0) return;
    const { spec, index } = ground[k];
    held.set(i, { prop: spec.prop, ...(spec.tone ? { tone: spec.tone } : {}), adopted: true, source: { spec, index } });
    ground = ground.filter((_, j) => j !== k);
  };
  figures.forEach((f, i) => {
    if (!held.has(i) && CARRY_POSES.has(f.pose)) adopt(i, () => true);
  });
  if (!figures.some((f) => CARRY_POSES.has(f.pose))) {
    figures.forEach((f, i) => {
      if (!held.has(i) && HOLD_POSES.has(f.pose)) adopt(i, () => true);
    });
  }
  // the beat's subject (the first figure that is going somewhere) goes with the prop it names
  const goer = figures.findIndex((f, i) => !held.has(i) && GOING_POSES.has(f.pose));
  if (goer >= 0) adopt(goer, (p) => beatCarries(beat, p.prop));
  const key = new Set<PropId>();
  for (const p of panel.props) if (beatMentions(beat, p.prop)) key.add(p.prop);
  for (const h of held.values()) if (beatMentions(beat, h.prop)) key.add(h.prop);
  if (panel.shot === "insert") {
    const first = panel.props[0]?.prop ?? figures.find((f) => f.holding)?.holding;
    if (first) key.add(first);
  }
  return { ground, held, key, issues };
}
