/**
 * Calibration for the W2-writer repair_once checks (docs/launch/W2-writer.md). No model, no spend.
 *
 * Replays every check over all judged ACCEPTED pages of the exports given, and compares the flags
 * with the judges' defects:
 *   - how many pages the check flags,
 *   - how many of those a judge marked with the matching defect kind (precision),
 *   - the base rate of that kind over all judged pages (to read the precision against),
 *   - how many judged-good pages it flags (panel mean >= 3.5, no criterion mean < 3).
 *
 *   tsx scripts/calibrate-w2w.ts OUT.json NAME=EXPORT_DIR:JUDGMENTS_JSON ...
 *
 * A judge defect has a kind when its text matches the kind's pattern (the same patterns as the
 * cluster analysis of the launch: clusters/kinds2.py).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { renderPage } from "@panelsummary/manga-render";
import type { MangaPageSpec, ValidationIssue } from "@panelsummary/manga-render";

import { mangaPageGoal } from "../src/goals/manga-page.js";
import {
  claimTextThinIssues,
  dialogueOrderIssues,
  duplicateCaptionIssues,
  keyPropNotDrawnIssues,
  locationOffPlanIssues,
  repeatNameTagIssues,
  speechInNarrationIssues,
} from "../src/goals/repair-once.js";

const KINDS: Record<string, RegExp> = {
  claim_not_stated: /core claims?\b|\bclaims? [sk]?\d|\bk\d+\b|s\dk\d+|CLAIM_THIN|not conveyed|half conveyed|(only|weakly|partly|thinly) conveyed|unsupported by the text|never states|is not stated|no (literal|text) |nothing (says|states)|central request is missing|motive is missing|is incomplete/i,
  hero_tiny: /\btiny\b|speck|few pixels|sliver|nearly invisible|SUBJECT_TOO_SMALL|too small|px tall|hard to find|near-invisible|\bblob\b|barely (visible|reads)|cropped (at|by|into|off)|pushed to|thin strip|unreadable (dot|blob)|is a dot|small figure|a dot\b/i,
  key_prop_not_drawn: /(never|not|isn't) (drawn|shown|visible|appear)|(is|are) never (drawn|shown|visible)|does not appear|\babsent\b|nowhere|no (sheep|angel|thorn|heart|sack|tears?|lamp|ladder|rose|figures)\b|cannot be seen|never shows|has no visual|no picture of|cannot be read/i,
  tail_wrong: /SPEAKER_OFF_PANEL|SPEAKER_ORDER|PLANNED_CAST_MISSING|tail[s]? (point|runs?|ends|lands?|crosses|goes|leads?|aims?|hits|converge|rises|collide|tip)|(no|without a|has no) (visible )?tail|speaker (is )?(not drawn|ambiguous|unclear|headless)|unclear who (speaks|is speaking)|who is speaking|reads? as the \w+ speaking|looks? like the speaker|attribute .{0,50} to the|second tail|ambiguous (cluster|speaker)|(speaker|who|spoken by).{0,40}(is )?not drawn/i,
  setting_wrong: /location|\bl_[a-z_]+|LOCATION_NOT_PLANNED|staging|set in the|blank white|white void|no (background|environment)|contradicts the source|outside on|source (places|puts|says)|empty (white|plaza|street|ballroom)/i,
  invented: /invent|dramati[sz]|made.?up|CAST_NOT_PLANNED|not part of (this|the) scene|wrong (character|cast)|misattribut|drawn as the|never speaks|speaks '|no source/i,
  statue_staging: /(no|without|missing|lacks?|not on|never|plain|short|low) (tall )?(column|pedestal|plinth)|street level|person-sized|(low|plain|a) plinth|slab|human-sized statue|plain block|inside the (garret|attic)|stands inside|reads as a human|alley/i,
  speech_as_narration: /thought (balloon|bubble|cloud)|SPEECH_IN_NARRATION|unattributed narration|narration box over|in a narration box|read as narration|set as narration|narrator text|as a speech balloon|in the \w+'s mouth|(line|quote) .{0,30}(as|in) (a )?caption/i,
  order: /reply (before|precedes)|before the question|reading order|wrong order|order (is )?(inverted|reversed|inverts)|inverts the chronology|reverses the|out of order|BLOCKAGE_LAYOUT|reads? (first|before|backwards)|is read first|reveal comes before|scrambles|balloon order|new reader goes/i,
  quote_clipped: /clipped|spliced|truncat|mangled|garbled|ellips|cut (to|down)|trimmed|fused|merges|merged|punchline|joke is lost|split (over|across|into)|is cut\b|cut from the quote/i,
  label_clutter: /name.?tag|duplicate (caption|label)|floating (caption|label)|label boxes?|caption boxes?|name captions?|restates?|PROSE_WALL|prose.wall|stray (caption|label)|redundant|caption .{0,30}(clutter|sits on|covers)|illustrated prose|narration boxes/i,
};

/** Which judge-defect kinds count as a hit for each check. */
const MATCH: Record<string, string[]> = {
  CLAIM_TEXT_THIN: ["claim_not_stated"],
  KEY_PROP_NOT_DRAWN: ["key_prop_not_drawn"],
  SPEECH_IN_NARRATION: ["speech_as_narration"],
  DUPLICATE_CAPTION: ["label_clutter"],
  REPEAT_NAME_TAG: ["label_clutter"],
  LOCATION_OFF_PLAN: ["setting_wrong"],
  HERO_TOO_SMALL: ["hero_tiny"],
  SPEAKER_OFF_PANEL_LIMIT: ["tail_wrong"],
  STATUE_LOCATION_SWAPPED: ["statue_staging"],
  DIALOGUE_ORDER: ["order"],
};

const CRITERIA = ["legibility", "reading_flow", "speaker_attribution", "continuity", "variety", "page_turn", "fidelity", "beat_without_prose_wall"];

interface Judgment {
  judge: number;
  page: number;
  scores: Record<string, number>;
  defects: { owner: string; severity: string; what: string }[];
}

interface Row {
  set: string;
  page: number;
  good: boolean;
  /** kind -> number of judges that listed it on this page (major or blocker only) */
  kinds: Record<string, number>;
  /** the major and blocker defect texts of all judges on this page */
  defects: string[];
  /** check variant -> words the check names (claim id and missing words), for a specific hit */
  keywords: Record<string, string[]>;
  /** check variant -> flagged */
  flags: Record<string, boolean>;
  details: Record<string, string[]>;
}

const [outFile, ...sets] = process.argv.slice(2);
const rows: Row[] = [];
const RENDERER_CODES = ["HERO_TOO_SMALL", "SPEAKER_OFF_PANEL_LIMIT", "STATUE_LOCATION_SWAPPED"];

for (const item of sets) {
  const [name, rest] = item.split("=");
  const [dir, judgmentsFile] = rest.split(":");
  const read = (f: string) => JSON.parse(readFileSync(path.join(dir, f), "utf8"));
  const understanding = read("understanding.json");
  const planFile = read("plan.json");
  const plan = planFile.plan ?? planFile;
  const units = new Map<string, unknown>((read("units.json") as { id: string }[]).map((u) => [u.id, u]));
  const judgments = JSON.parse(readFileSync(judgmentsFile, "utf8")) as Judgment[];
  for (const file of readdirSync(path.join(dir, "judge")).filter((f) => /^page-\d+\.json$/.test(f)).sort()) {
    const judged = JSON.parse(readFileSync(path.join(dir, "judge", file), "utf8"));
    if (!judged.spec) continue;
    const spec = judged.spec as MangaPageSpec;
    const planned = plan.pages.find((p: { page_number: number }) => p.page_number === judged.page_number);
    const mine = judgments.filter((j) => j.page === judged.page_number);
    if (!planned || mine.length === 0) continue;
    const input = mangaPageGoal.parseInput({
      book: { title: understanding.title, author: understanding.author },
      understanding,
      plan,
      page_number: judged.page_number,
      units: planned.units.map((id: string) => units.get(id)),
    });
    const bookRefs = { cast: input.cast, locations: input.locations };
    const render = renderPage(spec, bookRefs, { idPrefix: `pg${input.page.page_number}-` });
    const rendererIssues = render.issues.filter((i: ValidationIssue) => RENDERER_CODES.includes(i.code));
    const ctx = { claims: input.claims, cast: input.cast, locations: input.locations, page: input.page, units: input.units, first_appearances: input.first_appearances };

    const found: Record<string, ValidationIssue[]> = {
      DUPLICATE_CAPTION: duplicateCaptionIssues(spec),
      REPEAT_NAME_TAG: repeatNameTagIssues(spec, ctx),
      "REPEAT_NAME_TAG:within-page": repeatNameTagIssues(spec, { cast: ctx.cast, first_appearances: input.page.cast }).filter((i) => i.message.includes("already has")),
      LOCATION_OFF_PLAN: locationOffPlanIssues(spec, ctx),
      SPEECH_IN_NARRATION: speechInNarrationIssues(spec),
      DIALOGUE_ORDER: dialogueOrderIssues(spec, ctx),
      KEY_PROP_NOT_DRAWN: keyPropNotDrawnIssues(spec, ctx),
    };
    for (const ratio of [0.3, 0.4, 0.5, 0.6]) found[`CLAIM_TEXT_THIN@${ratio}`] = claimTextThinIssues(spec, ctx, { minRatio: ratio });
    for (const ratio of [0.2, 0.3, 0.4]) for (const facts of [5, 6]) found[`CLAIM_TEXT_THIN@${ratio}/facts${facts}`] = claimTextThinIssues(spec, ctx, { minRatio: ratio, minFacts: facts });
    found["CLAIM_TEXT_THIN@0.4/supporting"] = claimTextThinIssues(spec, ctx, { minRatio: 0.4, importance: ["core", "supporting"] });
    found["CLAIM_TEXT_THIN"] = claimTextThinIssues(spec, ctx);
    for (const code of RENDERER_CODES) found[code] = rendererIssues.filter((i: ValidationIssue) => i.code === code);

    const kinds: Record<string, number> = {};
    for (const [kind, re] of Object.entries(KINDS)) {
      const n = mine.filter((j) => j.defects.some((d) => d.severity !== "minor" && re.test(d.what))).length;
      if (n > 0) kinds[kind] = n;
    }
    const meanOf = (c: string) => mine.reduce((a, j) => a + (j.scores[c] ?? 0), 0) / mine.length;
    const means = CRITERIA.map(meanOf);
    const good = means.reduce((a, b) => a + b, 0) / means.length >= 3.5 && Math.min(...means) >= 3;
    rows.push({
      set: name,
      page: judged.page_number,
      good,
      kinds,
      defects: mine.flatMap((j) => j.defects.filter((d) => d.severity !== "minor").map((d) => d.what)),
      keywords: Object.fromEntries(
        Object.entries(found)
          .filter(([k, v]) => v.length > 0 && (k.startsWith("CLAIM_TEXT_THIN") || k === "KEY_PROP_NOT_DRAWN"))
          .map(([k, v]) => [k, v.flatMap((i) => [i.message.match(/core claim (\S+)/)?.[1] ?? "", ...[...i.message.matchAll(/"([a-z0-9-]{3,})"/g)].map((m) => m[1])]).filter(Boolean)]),
      ),
      flags: Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.length > 0])),
      details: Object.fromEntries(Object.entries(found).filter(([, v]) => v.length > 0).map(([k, v]) => [k, v.map((i) => `${i.path}: ${i.message.slice(0, 160)}`)])),
    });
  }
}

writeFileSync(outFile, JSON.stringify(rows, null, 1));

const variants = [...new Set(rows.flatMap((r) => Object.keys(r.flags)))];
const lines: string[] = [];
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "-");
/** A page is a hit when a judge listed a major/blocker defect of the matching kind (and, if the check names words, that mentions one of them). */
function isHit(row: Row, variant: string, specific: boolean): boolean {
  const kinds = MATCH[variant.split(/[:@]/)[0]] ?? [];
  const words = row.keywords[variant] ?? [];
  if (!specific || words.length === 0) return kinds.some((k) => row.kinds[k]);
  return row.defects.some((d) => kinds.some((k) => KINDS[k].test(d)) && words.some((w) => new RegExp(`\\b${w.replace(/[^a-z0-9]/gi, "").replace(/(es|s)$/, "")}`, "i").test(d)));
}
lines.push("| check | scope | pages | flagged | kind hit | specific hit | kind-hit rate of unflagged pages | good pages flagged |", "|---|---|---|---|---|---|---|---|");
for (const variant of variants) {
  const scopes: [string, Row[]][] = [["all", rows], ...[...new Set(rows.map((r) => r.set))].map((s): [string, Row[]] => [s, rows.filter((r) => r.set === s)])];
  for (const [scope, list] of scopes) {
    const flagged = list.filter((r) => r.flags[variant]);
    const unflagged = list.filter((r) => !r.flags[variant]);
    const kindHit = flagged.filter((r) => isHit(r, variant, false)).length;
    const specHit = flagged.filter((r) => isHit(r, variant, true)).length;
    const baseUn = unflagged.filter((r) => isHit(r, variant, false)).length;
    const goodAll = list.filter((r) => r.good);
    const goodFlag = goodAll.filter((r) => r.flags[variant]);
    lines.push(`| ${variant} | ${scope} | ${list.length} | ${flagged.length} | ${kindHit} (${pct(kindHit, flagged.length)}) | ${specHit} (${pct(specHit, flagged.length)}) | ${pct(baseUn, unflagged.length)} (${baseUn}/${unflagged.length}) | ${goodFlag.length}/${goodAll.length} |`);
  }
}
console.log(lines.join("\n"));
