/**
 * "repair_once": a third severity class for the page goal (track W2-writer, docs/launch/W2-writer.md).
 *
 * The renderer's ValidationIssue has two severities. A warning never blocks, so the writer never
 * acts on it (a page with only warnings is accepted at once). An error blocks, and a wrong error
 * can fail a page (run 6: a guard that was too strict collapsed two tales). This module adds a
 * list of CODES that the page goal treats in between:
 *
 *  - On the FIRST submit that reaches the full check, a repair_once issue rejects the candidate
 *    like an error, with a one-line fix. The writer gets one chance.
 *  - On every later submit the same issue is a plain warning. It can never fail a page: at most
 *    one extra round.
 *  - Previews show these issues as "fix before submit" until the chance is used.
 *
 * Which codes are in the list is decided by calibration on judged pages
 * (scripts/calibrate-w2w.ts), not by guesswork.
 */
import type { BookUnderstanding, Claim, MangaPageSpec, PlannedPage, ValidationIssue } from "@panelsummary/manga-render";

import { FIX_BEFORE_SUBMIT } from "./common.js";
import { salientWords, stemWord } from "./claim-evidence.js";

/** Codes that reject a candidate on the first full check only. Set from calibration (see the doc). */
export const REPAIR_ONCE_CODES: ReadonlySet<string> = new Set([
  "CLAIM_TEXT_THIN",
  "KEY_PROP_NOT_DRAWN",
  "SPEECH_IN_NARRATION",
  "DUPLICATE_CAPTION",
  "REPEAT_NAME_TAG",
  "LOCATION_OFF_PLAN",
  "HERO_TOO_SMALL",
  "SPEAKER_OFF_PANEL_LIMIT",
  "STATUE_LOCATION_SWAPPED",
]);

export const isRepairOnce = (issue: ValidationIssue): boolean => issue.severity === "warning" && REPAIR_ONCE_CODES.has(issue.code);


/**
 * Apply the class. `chanceLeft` is true until the first submit that reached the full check.
 * With the chance left, repair_once warnings become errors (message starts with the label);
 * after that they stay warnings. Returns new objects; the input is not changed.
 */
export function applyRepairOnce(issues: readonly ValidationIssue[], chanceLeft: boolean): ValidationIssue[] {
  if (!chanceLeft) return [...issues];
  return issues.map((issue) =>
    isRepairOnce(issue) ? { ...issue, severity: "error" as const, message: `${FIX_BEFORE_SUBMIT}${issue.message}` } : issue,
  );
}

export interface RepairOnceContext {
  claims: readonly Claim[];
  cast: BookUnderstanding["cast"];
  locations: BookUnderstanding["locations"];
  page: PlannedPage;
  units: readonly { text: string }[];
  /** Cast ids whose first appearance in the book is on this page. */
  first_appearances: readonly string[];
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const allTexts = (spec: MangaPageSpec) =>
  (spec.panels ?? []).flatMap((panel) =>
    (panel.text ?? []).map((text, index) => ({ panel, text, index, path: `panel ${panel.id} text ${index}` })).filter((x) => typeof x.text?.text === "string"),
  );

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’'`]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
}

const norm = (text: string): string => wordsOf(text).join(" ");

// ---------------------------------------------------------------------------
// CLAIM_TEXT_THIN: the facts of a core claim are not in the lettering
// ---------------------------------------------------------------------------

/** Share of a core claim's fact words that the lettering must hold. Set from calibration. */
export const CLAIM_TEXT_MIN_RATIO = 0.3;
/** A claim with fewer fact words than this is not checked (too little to measure). */
export const CLAIM_TEXT_MIN_FACTS = 6;

/**
 * The facts of a claim: its salient words minus the words that only name its cast (the subject
 * of the claim is usually on the page as a drawn figure; the facts about the subject are not).
 */
export function claimFacts(claim: Claim, cast: BookUnderstanding["cast"]): string[] {
  const subject = new Set(cast.flatMap((c) => wordsOf(`${c.name} ${c.role ?? ""}`)).map(stemWord));
  return salientWords(claim.text).filter((w) => !subject.has(stemWord(w)));
}

export function claimTextThinIssues(
  spec: MangaPageSpec,
  ctx: Pick<RepairOnceContext, "claims" | "cast">,
  options: { minRatio?: number; minFacts?: number; importance?: readonly string[] } = {},
): ValidationIssue[] {
  const minRatio = options.minRatio ?? CLAIM_TEXT_MIN_RATIO;
  const minFacts = options.minFacts ?? CLAIM_TEXT_MIN_FACTS;
  const importance = options.importance ?? ["core"];
  const lettering = new Set(allTexts(spec).flatMap(({ text }) => wordsOf(text.text).map(stemWord)));
  const issues: ValidationIssue[] = [];
  for (const claim of ctx.claims) {
    if (!importance.includes(claim.importance) || claim.kind === "quote") continue;
    const facts = claimFacts(claim, ctx.cast);
    if (facts.length < minFacts) continue;
    const missing = facts.filter((w) => !lettering.has(stemWord(w)));
    if ((facts.length - missing.length) / facts.length >= minRatio) continue;
    issues.push({
      code: "CLAIM_TEXT_THIN",
      severity: "warning",
      path: "page.claims",
      message: `core claim ${claim.id} ("${claim.text.slice(0, 110)}") is not stated in the lettering: no caption or balloon holds ${[...missing].sort((a, b) => b.length - a.length).slice(0, 6).map((w) => `"${w}"`).join(", ")}. Add a caption or balloon that states these facts (a drawing does not replace it).`,
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// KEY_PROP_NOT_DRAWN: a core claim names an object the renderer can draw, and no panel draws it
// ---------------------------------------------------------------------------

/**
 * Words in a claim that name one drawable prop without doubt. Generic words (gold, light, eye,
 * stone, king, money) are left out on purpose: they name a material or a mood, not an object.
 */
const PROP_TRIGGERS: Record<string, string[]> = {
  sword: ["sword", "sword-hilt", "hilt", "blade"],
  gem: ["ruby", "sapphire", "sapphires", "jewel", "jewels", "diamond", "emerald", "gem", "gems"],
  coin: ["coin", "coins", "penny", "pennies"],
  money_bag: ["purse"],
  rose: ["rose", "roses"],
  flower: ["flower", "flowers", "violets", "violet", "primroses", "blossom", "lily", "lilies"],
  book: ["book", "books"],
  letter: ["letter", "letters"],
  paper: ["notice", "manuscript"],
  scroll: ["scroll", "decree"],
  lamp: ["lamp", "lantern"],
  candle: ["candle", "candles"],
  matches: ["matches"],
  needle: ["needle", "thimble"],
  bread: ["bread", "loaf"],
  cup: ["cup", "goblet"],
  bottle: ["bottle"],
  basket: ["basket"],
  bag: ["sack", "flour"],
  key: ["key", "keys"],
  chains: ["chains", "fetters", "shackles"],
  crown: ["crown"],
  staff: ["staff"],
  umbrella: ["umbrella"],
  spade: ["spade", "shovel"],
  wheelbarrow: ["wheelbarrow"],
  ballot_box: ["ballot"],
  gavel: ["gavel"],
  clock: ["clock"],
  feather: ["feather", "feathers"],
  bell: ["bell", "bells"],
  flag: ["flag", "banner"],
  gold_leaf: ["leaf"],
  thorn: ["thorn", "thorns"],
  axe: ["axe"],
  firework: ["firework", "fireworks"],
  sign: ["signboard"],
};

/** Props that stand in for each other: drawing any of the group shows the object. */
const PROP_GROUPS: string[][] = [
  ["rose", "flower"],
  ["coin", "coins_pile", "money_bag"],
  ["bag", "money_bag", "basket"],
  ["paper", "letter", "scroll", "sign", "book"],
  ["lamp", "candle"],
  ["firework"],
];

const TRIGGER_TO_PROP = new Map<string, string>();
for (const [prop, words] of Object.entries(PROP_TRIGGERS)) for (const w of words) TRIGGER_TO_PROP.set(stemWord(w), prop);

/** Prop ids drawn on the page (panel props and held props). */
export function drawnProps(spec: MangaPageSpec): Set<string> {
  const drawn = new Set<string>();
  for (const panel of spec.panels ?? []) {
    for (const prop of panel.props ?? []) if (prop?.prop) drawn.add(prop.prop);
    for (const figure of panel.figures ?? []) if (figure?.holding) drawn.add(figure.holding);
  }
  return drawn;
}

export function keyPropNotDrawnIssues(spec: MangaPageSpec, ctx: Pick<RepairOnceContext, "claims" | "cast">): ValidationIssue[] {
  const drawn = drawnProps(spec);
  // A trigger word that is part of a cast name ("Rose-tree", "Rocket") names a character, not an object.
  const castWords = new Set(ctx.cast.flatMap((c) => wordsOf(`${c.name} ${c.role ?? ""}`)).map(stemWord));
  const has = (prop: string) => drawn.has(prop) || PROP_GROUPS.some((g) => g.includes(prop) && g.some((other) => drawn.has(other)));
  const issues: ValidationIssue[] = [];
  for (const claim of ctx.claims) {
    if (claim.importance !== "core") continue;
    const wanted = new Map<string, string>();
    for (const w of wordsOf(claim.text)) {
      const prop = castWords.has(stemWord(w)) ? undefined : TRIGGER_TO_PROP.get(stemWord(w));
      if (prop && !wanted.has(prop)) wanted.set(prop, w);
    }
    const missing = [...wanted].filter(([prop]) => !has(prop));
    // One missing object is a clear gap. A claim with several objects of which the page draws some is not flagged.
    if (missing.length === 0 || missing.length < wanted.size) continue;
    const [prop, word] = missing[0];
    issues.push({
      code: "KEY_PROP_NOT_DRAWN",
      severity: "warning",
      path: "page.claims",
      message: `core claim ${claim.id} names "${word}", but no panel draws it (no prop or holding "${prop}"). Add {"prop": "${prop}"} to the panel that shows it, or let the figure hold it; an insert panel of the object is fine.`,
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// SPEECH_IN_NARRATION (promoted from stagingIssues, same test)
// ---------------------------------------------------------------------------

export function speechInNarrationIssues(spec: MangaPageSpec): ValidationIssue[] {
  return allTexts(spec)
    .filter(({ text }) => (text.kind === "narration" || text.kind === "caption") && /["“][^"”]{12,}["”]/.test(text.text))
    .map(({ path }) => ({
      code: "SPEECH_IN_NARRATION",
      severity: "warning" as const,
      path,
      message: "this box quotes someone speaking; put the spoken words in a speech balloon from the drawn speaker (kind \"speech\" with a speaker id), so readers see who says them.",
    }));
}

// ---------------------------------------------------------------------------
// DUPLICATE_CAPTION, REPEAT_NAME_TAG
// ---------------------------------------------------------------------------

/** Word overlap (Jaccard) from which two boxes on one page count as the same text. */
export const DUPLICATE_OVERLAP = 0.8;

export function duplicateCaptionIssues(spec: MangaPageSpec): ValidationIssue[] {
  const boxes = allTexts(spec).filter(({ text }) => text.kind === "caption" || text.kind === "narration");
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  boxes.forEach((a, i) => {
    for (const b of boxes.slice(i + 1)) {
      const wa = new Set(wordsOf(a.text.text));
      const wb = new Set(wordsOf(b.text.text));
      if (wa.size === 0 || wb.size === 0) continue;
      const shared = [...wa].filter((w) => wb.has(w)).length;
      const overlap = shared / (wa.size + wb.size - shared);
      if (overlap < DUPLICATE_OVERLAP) continue;
      const key = `${a.path}|${b.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({
        code: "DUPLICATE_CAPTION",
        severity: "warning",
        path: b.path,
        message: `this box repeats ${a.path} ("${a.text.text.slice(0, 60)}"). Delete one of the two.`,
      });
    }
  });
  return issues;
}

/** A name tag: a caption that labels a character (it has `about`, or it is only the character's name). */
function nameTagOf(text: { about?: string; text: string; kind: string }, cast: BookUnderstanding["cast"]): string | undefined {
  if (text.kind !== "caption") return undefined;
  if (text.about) return text.about;
  const t = norm(text.text).replace(/^(the|a|an) /, "");
  return cast.find((c) => norm(c.name).replace(/^(the|a|an) /, "") === t)?.id;
}

export function repeatNameTagIssues(spec: MangaPageSpec, ctx: Pick<RepairOnceContext, "cast" | "first_appearances">): ValidationIssue[] {
  const introducedHere = new Set(ctx.first_appearances);
  const tagged = new Map<string, string>();
  const issues: ValidationIssue[] = [];
  for (const { text, path } of allTexts(spec)) {
    const id = nameTagOf(text, ctx.cast);
    if (!id) continue;
    const member = ctx.cast.find((c) => c.id === id);
    if (!member) continue;
    if (tagged.has(id)) {
      issues.push({ code: "REPEAT_NAME_TAG", severity: "warning", path, message: `${member.name} already has a name tag at ${tagged.get(id)}; delete this one (one name tag per character).` });
      continue;
    }
    tagged.set(id, path);
    if (!introducedHere.has(id) && member.look.kind !== "crowd") {
      issues.push({ code: "REPEAT_NAME_TAG", severity: "warning", path, message: `${member.name} was introduced on an earlier page, so a name tag is clutter now. Delete this caption (the picture and the lines show who it is).` });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// LOCATION_OFF_PLAN
// ---------------------------------------------------------------------------

export function locationOffPlanIssues(spec: MangaPageSpec, ctx: Pick<RepairOnceContext, "page" | "locations">): ValidationIssue[] {
  const planned = new Set(ctx.page.locations ?? []);
  if (planned.size === 0) return [];
  const issues: ValidationIssue[] = [];
  for (const panel of spec.panels ?? []) {
    if (!panel.location || planned.has(panel.location)) continue;
    if ((panel.fx ?? []).includes("flashback")) continue;
    const name = ctx.locations.find((l) => l.id === panel.location)?.name ?? panel.location;
    issues.push({
      code: "LOCATION_OFF_PLAN",
      severity: "warning",
      path: `panel ${panel.id}`,
      message: `this panel is set in "${name}" (${panel.location}), which this page does not plan. Use one of the planned locations (${[...planned].join(", ")}) so the scene stays where the book puts it, or mark a real flashback with the "flashback" effect.`,
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// DIALOGUE_ORDER: a plain warning (reply lettered before the question it answers)
// ---------------------------------------------------------------------------

export function dialogueOrderIssues(spec: MangaPageSpec, ctx: Pick<RepairOnceContext, "units">): ValidationIssue[] {
  const source = ` ${norm(ctx.units.map((u) => u.text).join(" "))} `;
  const lines = allTexts(spec)
    .filter(({ text }) => text.fidelity === "quote" && (text.kind === "speech" || text.kind === "shout" || text.kind === "whisper"))
    .map(({ text, path }) => {
      const words = norm(text.text.split(/\.\.\.|…|--|—/)[0]).split(" ");
      const probe = ` ${words.slice(0, 5).join(" ")}`;
      const first = source.indexOf(probe);
      const unique = first >= 0 && source.indexOf(probe, first + 1) < 0 && words.length >= 3;
      return { path, at: unique ? first : -1, text: text.text };
    })
    .filter((l) => l.at >= 0);
  const issues: ValidationIssue[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const earlier = lines.slice(0, i).find((l) => l.at > lines[i].at);
    if (earlier) {
      issues.push({
        code: "DIALOGUE_ORDER",
        severity: "warning",
        path: lines[i].path,
        message: `in the book this line ("${lines[i].text.slice(0, 50)}") comes BEFORE ${earlier.path} ("${earlier.text.slice(0, 50)}"), but the page letters it after. Keep the book's order: ask before answer.`,
      });
      break;
    }
  }
  return issues;
}

/** All writer-side repair_once checks plus the dialogue-order warning. */
export function repairOnceIssues(spec: MangaPageSpec, ctx: RepairOnceContext): ValidationIssue[] {
  return [
    ...claimTextThinIssues(spec, ctx),
    ...keyPropNotDrawnIssues(spec, ctx),
    ...speechInNarrationIssues(spec),
    ...duplicateCaptionIssues(spec),
    ...repeatNameTagIssues(spec, ctx),
    ...locationOffPlanIssues(spec, ctx),
    ...dialogueOrderIssues(spec, ctx),
  ];
}
