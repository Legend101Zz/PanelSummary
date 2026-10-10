/**
 * Calibration of EVERY writer-side page check (track Q2a, docs/v0.2/Q2a-writer-checks.md). No model, no spend.
 *
 * Replays all page checks (the structural and render warnings, the goal's writer checks, and the
 * candidate checks and their variants) over the saved specs of all judged pages, and joins every
 * flag with the judges' defects and scores of that page:
 *   - flagged pages, precision (a hit is: a judge listed a major or blocker defect of the matching
 *     kind, or the mean score of the matching criterion is below 3), the base rate of a hit among
 *     the unflagged pages, recall (share of the pages with a kind hit that the check flags),
 *   - judged-good pages that the check flags (panel mean >= 3.5 and no criterion mean < 3).
 *
 *   tsx scripts/calibrate-checks.ts OUT.json [NAME=EXPORT_DIR:JUDGMENTS_JSON ...]
 *
 * Without sets it uses the sets listed in DEFAULT_SETS (the launch scratch directory on the SSD).
 * Kind patterns are the launch cluster analysis (clusters/kinds2.py): loose, so read a kind hit as weak evidence.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { renderPage, validatePage } from "@panelsummary/manga-render";
import type { MangaPageSpec, ValidationIssue } from "@panelsummary/manga-render";

import { mangaPageGoal, pageIssues } from "../src/goals/manga-page.js";
import {
  quoteClippedIssues,
  sameShotTwiceIssues,
  type SameShotLevel,
  shotSignature,
  claimTextThinIssues,
} from "../src/goals/repair-once.js";

const L = "/Volumes/Mrigesh SSD/Book-Reel-scratch/launch";
/** name = [group, export dir, judgments]. Group "old" = the 95 pages of the W2-writer calibration (written before repair_once); "new" = the sets added in v0.2. */
const DEFAULT_SETS: [string, string, string, string][] = [
  ["p0", "old", `${L}/p0-baseline/export`, `${L}/p0-baseline/judgments.json`],
  ["ci", "old", `${L}/orchestrator/ci-live-p0/live-run/export`, `${L}/orchestrator/ci-live-p0/judgments.json`],
  ["run8", "old", "/Volumes/Mrigesh SSD/Book-Reel-scratch/acceptance/run8", `${L}/run8-panel/judgments.json`],
  ["ab-flash-old", "old", `${L}/ab-flash-old/live-run/export`, `${L}/ab-flash-old/judgments.json`],
  ["gate1-flash", "new", `${L}/gate1-flash-ci/live-run/export`, `${L}/gate1-flash-ci/judgments.json`],
  ["uab-flash", "new", `${L}/uab-flash-ci/live-run/export`, `${L}/uab-flash-ci/judgments.json`],
  ["uab-m3", "new", `${L}/uab-m3-local/export`, `${L}/uab-m3-local/judgments.json`],
  ["ab-m3plan", "new", `${L}/ab-m3plan-flashpages/export`, `${L}/ab-m3plan-flashpages/judgments.json`],
  ["gate2", "new", `${L}/gate2-flash-ci/live-run/export`, `${L}/gate2-flash-ci/judgments.json`],
  ["gate2b", "new", `${L}/gate2b-ci/live-run/export`, `${L}/gate2b-ci/judgments.json`],
  ["gate2-m3u", "new", `${L}/gate2-m3u-local/export`, `${L}/gate2-m3u-local/judgments.json`],
  ["final", "new", `${L}/final-journey/export`, `${L}/final-journey/judgments.json`],
];

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
  repeat_variety: /repeat|same (shot|image|pose|crop|framing|background)|identical|near-duplicate|reused|similar framing|two close-ups|three close|no dominant|equal weight|talking heads|look alike/i,
};

/** Which judge-defect kinds, and which criteria (mean below 3), count as a hit for each code. */
const MATCH: Record<string, { kinds: string[]; criteria?: string[] }> = {
  CLAIM_TEXT_THIN: { kinds: ["claim_not_stated"] },
  KEY_PROP_NOT_DRAWN: { kinds: ["key_prop_not_drawn"] },
  SPEECH_IN_NARRATION: { kinds: ["speech_as_narration"] },
  DUPLICATE_CAPTION: { kinds: ["label_clutter"] },
  REPEAT_NAME_TAG: { kinds: ["label_clutter"] },
  LOCATION_OFF_PLAN: { kinds: ["setting_wrong"] },
  LOCATION_NOT_PLANNED: { kinds: ["setting_wrong"] },
  HERO_TOO_SMALL: { kinds: ["hero_tiny"] },
  SPEAKER_OFF_PANEL_LIMIT: { kinds: ["tail_wrong"] },
  STATUE_LOCATION_SWAPPED: { kinds: ["statue_staging"] },
  DIALOGUE_ORDER: { kinds: ["order"], criteria: ["reading_flow"] },
  CLAIM_ORDER: { kinds: ["order"], criteria: ["reading_flow"] },
  PLAN_ORDER: { kinds: ["order"] },
  BLOCKAGE_LAYOUT: { kinds: ["order"], criteria: ["reading_flow"] },
  PROSE_WALL: { kinds: ["label_clutter"], criteria: ["beat_without_prose_wall"] },
  SAME_SHOT_TWICE: { kinds: ["repeat_variety"], criteria: ["variety"] },
  REPEATED_LAYOUT: { kinds: ["repeat_variety"], criteria: ["variety"] },
  QUOTE_CLIPPED: { kinds: ["quote_clipped"] },
  CAST_NOT_PLANNED: { kinds: ["invented"] },
};
const baseCode = (variant: string) => variant.split(/[:@]/)[0];

const CRITERIA = ["legibility", "reading_flow", "speaker_attribution", "continuity", "variety", "page_turn", "fidelity", "beat_without_prose_wall"];

interface Judgment {
  judge: number;
  page: number;
  scores: Record<string, number>;
  defects: { owner: string; severity: string; what: string }[];
}

interface Row {
  set: string;
  group: string;
  page: number;
  good: boolean;
  /** kind -> number of judges that listed it on this page (major or blocker only) */
  kinds: Record<string, number>;
  /** criterion -> mean score over the judges */
  means: Record<string, number>;
  defects: string[];
  keywords: Record<string, string[]>;
  flags: Record<string, boolean>;
  details: Record<string, string[]>;
}

/** Narration share of the words, as the renderer's PROSE_WALL counts them (sfx left out). */
function proseStats(spec: MangaPageSpec): { narration: number; all: number } {
  let narration = 0;
  let all = 0;
  for (const panel of spec.panels ?? []) {
    for (const text of panel.text ?? []) {
      if (text.kind === "sfx" || typeof text.text !== "string") continue;
      const n = text.text.split(/\s+/).filter(Boolean).length;
      all += n;
      if (text.kind === "narration" || text.kind === "caption") narration += n;
    }
  }
  return { narration, all };
}

const [outFile, ...args] = process.argv.slice(2);
const sets = args.length
  ? args.map((item): [string, string, string, string] => {
      const [name, rest] = item.split("=");
      const [dir, judgments] = rest.split(":");
      return [name, "new", dir, judgments];
    })
  : DEFAULT_SETS;

const rows: Row[] = [];
const specs = new Map<string, MangaPageSpec>();

for (const [name, group, dir, judgmentsFile] of sets) {
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
    const structural = validatePage(spec, bookRefs, input.page);
    const all = pageIssues(spec, input, [...structural, ...render.issues]);

    const found: Record<string, ValidationIssue[]> = {};
    for (const issue of all) (found[issue.code] ??= []).push(issue);
    // candidate checks and their variants
    for (const level of ["strict", "standard", "loose"] as SameShotLevel[]) found[`SAME_SHOT_TWICE@${level}`] = sameShotTwiceIssues(spec, { level });
    for (const [minTail, maxTail] of [[2, 99], [4, 99], [2, 4], [2, 6], [3, 6], [4, 6], [3, 8], [4, 8], [4, 12], [1, 3]]) found[`QUOTE_CLIPPED@tail${minTail}-${maxTail}`] = quoteClippedIssues(spec, input, { minTail, maxTail });
    // Exploratory repeat signatures (not in the goal): how many panels share a picture signature.
    const panelsOf = spec.panels ?? [];
    const figs = (pn: (typeof panelsOf)[number]) => (pn.figures ?? []).map((f) => f.character).sort().join("+");
    const poses = (pn: (typeof panelsOf)[number]) => (pn.figures ?? []).map((f) => `${f.character}:${f.pose}`).sort().join("+");
    const maxShare = (key: (pn: (typeof panelsOf)[number]) => string) => {
      const counts = new Map<string, number>();
      for (const pn of panelsOf) counts.set(key(pn), (counts.get(key(pn)) ?? 0) + 1);
      return Math.max(0, ...counts.values());
    };
    const flag = (name: string, on: boolean) => {
      if (on) found[name] = [{ code: "SAME_SHOT_TWICE", severity: "warning", path: "page", message: name }];
    };
    flag("SAME_SHOT_TWICE@x-place+cast>=3", maxShare((pn) => `${pn.location}|${figs(pn)}`) >= 3);
    flag("SAME_SHOT_TWICE@x-place+cast+shot>=2", maxShare((pn) => `${pn.shot}|${pn.location}|${figs(pn)}`) >= 2);
    flag("SAME_SHOT_TWICE@x-shot+poses+place>=2", maxShare((pn) => `${pn.shot}|${pn.location}|${poses(pn)}`) >= 2);
    flag("SAME_SHOT_TWICE@x-shot+cast+place+angle>=2", maxShare((pn) => `${pn.shot}|${pn.angle}|${pn.location}|${figs(pn)}`) >= 2);
    flag("SAME_SHOT_TWICE@x-place+cast>=4", maxShare((pn) => `${pn.location}|${figs(pn)}`) >= 4);
    const prose = proseStats(spec);
    for (const share of [0.5, 0.6, 0.7]) {
      for (const minWords of [30, 40, 50]) {
        if (prose.all > minWords && prose.narration / prose.all > share) {
          found[`PROSE_WALL@share${share}/words${minWords}`] = [{ code: "PROSE_WALL", severity: "warning", path: "page", message: `${prose.narration} of ${prose.all} words` }];
        }
      }
    }
    for (const words of [25, 30, 35, 40]) {
      if (prose.narration >= words) found[`PROSE_WALL@narration>=${words}`] = [{ code: "PROSE_WALL", severity: "warning", path: "page", message: `${prose.narration} of ${prose.all} words` }];
    }
    for (const ratio of [0.2, 0.3, 0.4]) found[`CLAIM_TEXT_THIN@${ratio}`] = claimTextThinIssues(spec, input, { minRatio: ratio });

    const kinds: Record<string, number> = {};
    for (const [kind, re] of Object.entries(KINDS)) {
      const n = mine.filter((j) => j.defects.some((d) => d.severity !== "minor" && re.test(d.what))).length;
      if (n > 0) kinds[kind] = n;
    }
    const meanOf = (c: string) => mine.reduce((a, j) => a + (j.scores[c] ?? 0), 0) / mine.length;
    const means = Object.fromEntries(CRITERIA.map((c) => [c, meanOf(c)]));
    const meanList = Object.values(means);
    const good = meanList.reduce((a, b) => a + b, 0) / meanList.length >= 3.5 && Math.min(...meanList) >= 3;
    specs.set(`${name}/${judged.page_number}`, spec);
    rows.push({
      set: name,
      group,
      page: judged.page_number,
      good,
      kinds,
      means,
      defects: mine.flatMap((j) => j.defects.filter((d) => d.severity !== "minor").map((d) => d.what)),
      keywords: Object.fromEntries(
        Object.entries(found)
          .filter(([k, v]) => v.length > 0 && (k.startsWith("CLAIM_TEXT_THIN") || k === "KEY_PROP_NOT_DRAWN" || k.startsWith("QUOTE_CLIPPED")))
          .map(([k, v]) => [k, v.flatMap((i) =>
              k.startsWith("QUOTE_CLIPPED")
                ? [i.message.match(/ends "\.\.\.([^"]+)"/)?.[1]?.split(" ").slice(-3).join(" ") ?? "", i.message.match(/goes on: "([^"]+)"/)?.[1]?.split(" ").slice(0, 3).join(" ") ?? ""]
                : [i.message.match(/core claim (\S+)/)?.[1] ?? "", ...[...i.message.matchAll(/"([a-z0-9-]{3,})"/g)].map((m) => m[1])],
            ).filter(Boolean)]),
      ),
      flags: Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.length > 0])),
      details: Object.fromEntries(Object.entries(found).filter(([, v]) => v.length > 0).map(([k, v]) => [k, v.map((i) => `${i.path}: ${i.message.slice(0, 200)}`)])),
    });
  }
}

// Same picture across a page turn: the last panel of page n and the first panel of page n+1 (measured here only).
for (const row of rows) {
  const prev = specs.get(`${row.set}/${row.page - 1}`);
  const cur = specs.get(`${row.set}/${row.page}`);
  const lastPrev = prev?.panels?.[prev.panels.length - 1];
  const first = cur?.panels?.[0];
  if (!lastPrev || !first) continue;
  for (const level of ["standard", "loose"] as SameShotLevel[]) {
    if (shotSignature(lastPrev, level) === shotSignature(first, level)) {
      row.flags[`SAME_SHOT_TWICE@across-pages-${level}`] = true;
      row.details[`SAME_SHOT_TWICE@across-pages-${level}`] = [`page ${row.page - 1} last panel = page ${row.page} first panel`];
    }
  }
}
for (const row of rows) row.flags["SAME_SHOT_TWICE@any-standard"] = Boolean(row.flags["SAME_SHOT_TWICE@standard"] || row.flags["SAME_SHOT_TWICE@across-pages-standard"]);

writeFileSync(outFile, JSON.stringify(rows, null, 1));

const variants = [...new Set(rows.flatMap((r) => Object.keys(r.flags)))].sort();
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "-");
function isHit(row: Row, variant: string, mode: "kind" | "criterion" | "either" | "specific"): boolean {
  const match = MATCH[baseCode(variant)];
  if (!match) return false;
  const kind = match.kinds.some((k) => row.kinds[k]);
  const criterion = (match.criteria ?? []).some((c) => row.means[c] < 3);
  if (mode === "kind") return kind;
  if (mode === "criterion") return criterion;
  if (mode === "either") return kind || criterion;
  const words = row.keywords[variant] ?? [];
  if (words.length === 0) return kind;
  if (baseCode(variant) === "QUOTE_CLIPPED") {
    const squash = (t: string) => t.toLowerCase().replace(/[\u2018\u2019'`"\u201c\u201d]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    return row.defects.some((d) => match.kinds.some((k) => KINDS[k].test(d)) && words.some((w) => squash(d).includes(squash(w))));
  }
  return row.defects.some((d) => match.kinds.some((k) => KINDS[k].test(d)) && words.some((w) => new RegExp(`\\b${w.replace(/[^a-z0-9]/gi, "").replace(/(es|s)$/, "")}`, "i").test(d)));
}

const lines: string[] = [];
lines.push("| check | scope | pages | flagged | hit (kind or low criterion) | kind hit | specific hit | base rate of hit, unflagged | recall (kind) | good pages flagged |", "|---|---|---|---|---|---|---|---|---|---|");
const scopes: [string, (r: Row) => boolean][] = [["all", () => true], ["old", (r) => r.group === "old"], ["new", (r) => r.group === "new"]];
for (const variant of variants) {
  for (const [scope, pick] of scopes) {
    const list = rows.filter(pick);
    const flagged = list.filter((r) => r.flags[variant]);
    if (flagged.length === 0 && scope !== "all") continue;
    const unflagged = list.filter((r) => !r.flags[variant]);
    const hit = flagged.filter((r) => isHit(r, variant, "either")).length;
    const kindHit = flagged.filter((r) => isHit(r, variant, "kind")).length;
    const specHit = flagged.filter((r) => isHit(r, variant, "specific")).length;
    const baseUn = unflagged.filter((r) => isHit(r, variant, "either")).length;
    const kindAll = list.filter((r) => isHit(r, variant, "kind")).length;
    const goodAll = list.filter((r) => r.good);
    const goodFlag = goodAll.filter((r) => r.flags[variant]);
    const m = MATCH[baseCode(variant)];
    lines.push(
      `| ${variant} | ${scope} | ${list.length} | ${flagged.length} | ${m ? `${hit} (${pct(hit, flagged.length)})` : "-"} | ${m ? `${kindHit} (${pct(kindHit, flagged.length)})` : "-"} | ${m ? `${specHit} (${pct(specHit, flagged.length)})` : "-"} | ${m ? `${pct(baseUn, unflagged.length)} (${baseUn}/${unflagged.length})` : "-"} | ${m ? `${pct(flagged.filter((r) => isHit(r, variant, "kind")).length, kindAll)} (${kindHit}/${kindAll})` : "-"} | ${goodFlag.length}/${goodAll.length} |`,
    );
  }
}
console.log(lines.join("\n"));
console.log(`\npages: ${rows.length}; good: ${rows.filter((r) => r.good).length}; per set: ${[...new Set(rows.map((r) => r.set))].map((s) => `${s}=${rows.filter((r) => r.set === s).length}`).join(" ")}`);
