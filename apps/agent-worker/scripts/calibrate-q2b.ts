/**
 * Offline calibration of the Q2b checks (no model calls, no spend).
 *
 *   tsx scripts/calibrate-q2b.ts [--root "/Volumes/Mrigesh SSD/Book-Reel-scratch"] [--json out.json]
 *
 * Replays three things over every saved run that has an understanding, a plan, the unit
 * texts, the accepted page specs and a judge panel (10 launch runs + acceptance run 8):
 *
 *  A. The location check (PLAN_LOCATION_NOT_IN_UNITS, PLAN_PLACE_UNLISTED). Saved
 *     understandings have no `units` on their locations, so the places per unit are
 *     DERIVED (places.ts deriveUnits): a PROXY, cruder than a live understanding. The flagged
 *     pages are compared with the judges' setting complaints and low continuity scores.
 *  B. Afterlife / dream panels. FIGURE_STATE_MISMATCH before and after the `vision` flag. The
 *     saved pages have no flag, so the AFTER column sets `vision` on the panels that a word
 *     detector finds (paradise, heaven, dream, angel, God, grandmother): a SIMULATION of what
 *     a writer told to use the flag would do. States: death states derived from the claims
 *     (the same rule as STATE_DEATH_MISSING), plus the T1 hand table for run 8.
 *  C. Minor figures: which pages would get a generic minor figure, and whether the judges
 *     complained about a missing character on those pages.
 *
 * Rule (CLAUDE.md): a new deterministic check is an ERROR only if it flags judged-defective
 * pages and flags no judged-good page. Until then it is a warning.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { AdaptationPlan, BookUnderstanding, CastMember, Claim, MangaPageSpec } from "@panelsummary/manga-render";

import { claimPages, expectedLooks, figureStateIssues, unitOrder } from "../src/goals/continuity.js";
import { minorFigures } from "../src/goals/minor-figures.js";
import { deriveUnits, planPlaceIssues } from "../src/goals/places.js";
import { RUN8_STATES } from "../test/fixtures/run8-states.js";

interface Defect { owner: string; severity: string; what: string }
interface JudgeRow { judge?: number; page: number; scores: Record<string, number>; ships: boolean; defects: Defect[] }
interface SavedPage { page_number: number; status: string; planned: AdaptationPlan["pages"][number]; claims: Claim[]; spec: MangaPageSpec | null }
interface Unit { id: string; section_id: string; text: string }

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const ROOT = opt("root", "/Volumes/Mrigesh SSD/Book-Reel-scratch");
const JSON_OUT = opt("json", "");

const RUNS: Array<{ name: string; dir: string; judgments: string }> = [
  { name: "final-journey", dir: "launch/final-journey/export", judgments: "launch/final-journey/judgments.json" },
  { name: "gate2-flash-ci", dir: "launch/gate2-flash-ci/live-run/export", judgments: "launch/gate2-flash-ci/judgments.json" },
  { name: "gate2b-ci", dir: "launch/gate2b-ci/live-run/export", judgments: "launch/gate2b-ci/judgments.json" },
  { name: "gate2-m3u-local", dir: "launch/gate2-m3u-local/export", judgments: "launch/gate2-m3u-local/judgments.json" },
  { name: "gate1-flash-ci", dir: "launch/gate1-flash-ci/live-run/export", judgments: "launch/gate1-flash-ci/judgments.json" },
  { name: "p0-baseline", dir: "launch/p0-baseline/export", judgments: "launch/p0-baseline/judgments.json" },
  { name: "uab-flash-ci", dir: "launch/uab-flash-ci/live-run/export", judgments: "launch/uab-flash-ci/judgments.json" },
  { name: "uab-m3-local", dir: "launch/uab-m3-local/export", judgments: "launch/uab-m3-local/judgments.json" },
  { name: "ab-flash-old", dir: "launch/ab-flash-old/live-run/export", judgments: "launch/ab-flash-old/judgments.json" },
  { name: "ab-m3plan-flashpages", dir: "launch/ab-m3plan-flashpages/export", judgments: "launch/ab-m3plan-flashpages/judgments.json" },
  { name: "run8", dir: "acceptance/run8", judgments: "acceptance/run8/judge-scores.json" },
];

const read = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f2 = (n: number) => (Number.isNaN(n) ? "-" : n.toFixed(2));

/** A judge's major/blocker defect that is about the place a page is set in. */
const SETTING =
  /\b(setting|backdrop|location|wrong (?:room|place|background)|time and place|(?:draws?|drawn|shows?|shown|rendered|placed|set|puts?|is) (?:as |in |inside |on |into )?(?:the |a |an )?[a-z' -]{0,28}(?:throne hall|hall|room|street|garden|attic|interior|bench|courtyard|parlou?r))\b/i;
const MISSING_PERSON = /not in the (?:planned )?cast|not in (?:the )?cast|no cast|never (?:cast|drawn)|missing (?:character|figure)|is absent|absent from|workmen|little boy|the child is|stands? in for|borrow/i;

interface PageLabel { page: number; continuity: number; mean: number; min: number; good: boolean; settingDefect: boolean; settingOwners: string[]; inReach: boolean; continuityLow: boolean; missingPerson: boolean }

function labels(rows: JudgeRow[]): Map<number, PageLabel> {
  const byPage = new Map<number, JudgeRow[]>();
  for (const r of rows) (byPage.get(r.page) ?? byPage.set(r.page, []).get(r.page)!).push(r);
  const out = new Map<number, PageLabel>();
  for (const [page, list] of byPage) {
    const crit = Object.keys(list[0].scores);
    const critMeans = crit.map((c) => avg(list.map((r) => r.scores[c])));
    const mean = avg(critMeans);
    const bad = list.flatMap((r) => r.defects.filter((d) => d.severity === "major" || d.severity === "blocker"));
    const continuity = avg(list.map((r) => r.scores.continuity));
    out.set(page, {
      page,
      continuity,
      mean,
      min: Math.min(...critMeans),
      good: mean >= 3.5 && Math.min(...critMeans) >= 3,
      settingDefect: bad.some((d) => SETTING.test(d.what)),
      settingOwners: bad.filter((d) => SETTING.test(d.what)).map((d) => d.owner),
      // In reach of Q2b: a setting problem the plan, the understanding or the writer owns, or a missing person.
      inReach: bad.some((d) => SETTING.test(d.what) && d.owner !== "renderer") || bad.some((d) => MISSING_PERSON.test(d.what)),
      continuityLow: continuity <= 2.5,
      missingPerson: bad.some((d) => MISSING_PERSON.test(d.what)),
    });
  }
  return out;
}

const DIES = /\b(?:dies|died|drown(?:s|ed)?|killed|perish(?:es|ed)?|(?:found|lying|lies|lay|is|was|are|were) dead)\b/i;

/** Death states derived from the claims, like STATE_DEATH_MISSING does; run 8 uses the T1 hand table. */
function withStates(u: BookUnderstanding, run: string): CastMember[] {
  return u.cast.map((member) => {
    if (run === "run8" && RUN8_STATES[member.id]) return { ...member, states: RUN8_STATES[member.id] } as CastMember;
    const kind = (member.look as { kind?: string }).kind ?? "";
    if (!["human", "bird", "animal", "insect"].includes(kind)) return member;
    const words = member.name.toLowerCase().replace(/^the\s+/, "").split(/\s+/).filter((w) => w.length > 2);
    if (words.length === 0) return member;
    const claim = u.claims.find((c) => {
      if (c.kind !== "event" || !(member.sections ?? []).includes(c.section_id)) return false;
      const text = c.text.replace(/["“][^"”]*["”]/g, " ").toLowerCase();
      const verb = DIES.exec(text);
      if (!verb) return false;
      const head = text.slice(0, verb.index);
      return words.every((w) => new RegExp(`\\b${w}\\b(?!['’]s)`).test(head));
    });
    return claim ? ({ ...member, states: [{ at: claim.source[0].unit, claim: claim.id, set: { eyes: "dead" }, note: "dies" }] } as CastMember) : member;
  });
}

const AFTERLIFE = /\b(paradise|heaven|afterlife|dream(?:s|ed|ing)?|visions?|angels?|grandmother|garden of paradise)\b|\bGod\b/;
const panelText = (p: MangaPageSpec["panels"][number]) => `${p.beat ?? ""} ${(p.text ?? []).map((t) => t.text).join(" ")}`;

function main() {
  const out: string[] = [];
  const json: Record<string, unknown> = {};

  // ---- A. location check --------------------------------------------------------------
  const A = { pages: 0, flagged: 0, flaggedSetting: 0, flaggedLow: 0, flaggedGood: 0, settingTotal: 0, lowTotal: 0, goodTotal: 0, setting_and_low: 0 };
  const aRows: string[] = [];
  const owners: Record<string, number> = {};
  const reach: string[] = [];
  // ---- B. afterlife -------------------------------------------------------------------
  const B = { pages: 0, panelsFlagged: 0, mismatchBefore: 0, mismatchAfter: 0, pagesBefore: 0, pagesAfter: 0, totalBefore: 0, totalAfter: 0 };
  const bRows: string[] = [];
  // ---- C. minor figures ---------------------------------------------------------------
  const Cc = { pages: 0, pagesWithMinor: 0, minorFigures: 0, withComplaint: 0, complaintPages: 0, complaintCovered: 0 };
  const cRows: string[] = [];

  for (const run of RUNS) {
    const dir = path.join(ROOT, run.dir);
    const jf = path.join(ROOT, run.judgments);
    if (!existsSync(path.join(dir, "understanding.json")) || !existsSync(jf) || !existsSync(path.join(dir, "plan.json")) || !existsSync(path.join(dir, "units.json"))) {
      out.push(`## ${run.name}: missing files, skipped\n`);
      continue;
    }
    const understanding = read<BookUnderstanding>(path.join(dir, "understanding.json"));
    const plan = read<AdaptationPlan>(path.join(dir, "plan.json"));
    const units = read<Unit[]>(path.join(dir, "units.json"));
    const judged = labels(read<JudgeRow[]>(jf));
    const order = unitOrder(understanding.sections);
    const cast = withStates(understanding, run.name);
    const saved = new Map<number, SavedPage>();
    for (const f of readdirSync(path.join(dir, "judge")).filter((n) => /^page-\d+\.json$/.test(n))) {
      const p = read<SavedPage>(path.join(dir, "judge", f));
      saved.set(p.page_number, p);
    }
    {
      const all = [...judged.values()];
      const inReach = all.filter((l) => l.inReach);
      reach.push(`| ${run.name} | ${all.length} | ${f2(avg(all.map((l) => l.continuity)))} | ${inReach.length} | ${f2(avg(inReach.map((l) => l.continuity)))} |`);
    }
    out.push(`## ${run.name}: ${plan.pages.length} planned pages, ${judged.size} judged, ${units.length} units, ${understanding.locations.length} locations\n`);

    // A: derived places per unit, then the plan check.
    const derived = deriveUnits(understanding, units);
    const withUnits = { ...understanding, locations: understanding.locations.map((l) => ({ ...l, units: derived.get(l.id)?.length ? derived.get(l.id) : undefined })) };
    const declaredCount = withUnits.locations.filter((l) => (l as { units?: unknown }).units).length;
    const planIssues = planPlaceIssues(plan, withUnits);
    const flaggedPages = new Map<number, string[]>();
    for (const i of planIssues) {
      const n = Number(i.path.replace("page ", ""));
      (flaggedPages.get(n) ?? flaggedPages.set(n, []).get(n)!).push(i.code);
    }
    for (const page of plan.pages) {
      const l = judged.get(page.page_number);
      if (!l) continue;
      A.pages += 1;
      const flagged = flaggedPages.has(page.page_number);
      if (l.settingDefect) A.settingTotal += 1;
      for (const o of l.settingOwners) owners[o] = (owners[o] ?? 0) + 1;
      if (l.continuityLow) A.lowTotal += 1;
      if (l.good) A.goodTotal += 1;
      if (l.settingDefect && l.continuityLow) A.setting_and_low += 1;
      if (flagged) {
        A.flagged += 1;
        if (l.settingDefect) A.flaggedSetting += 1;
        if (l.continuityLow) A.flaggedLow += 1;
        if (l.good) A.flaggedGood += 1;
        aRows.push(`| ${run.name} | ${page.page_number} | ${[...new Set(flaggedPages.get(page.page_number))].join(", ")} | ${f2(l.continuity)} | ${l.settingDefect ? "yes" : "no"} | ${l.good ? "good" : "-"} |`);
      }
    }
    out.push(`Places derived for ${declaredCount} of ${understanding.locations.length} locations. Plan check hits: ${planIssues.length} on ${flaggedPages.size} pages.\n`);

    // B: afterlife panels.
    for (const page of plan.pages) {
      const s = saved.get(page.page_number);
      if (!s?.spec) continue;
      const looks = expectedLooks(cast, order, { page_number: page.page_number, units: page.units, claim_pages: claimPages(plan) });
      const before = figureStateIssues(s.spec, cast, looks, "warning");
      B.totalBefore += before.length;
      const panels = s.spec.panels.filter((p) => AFTERLIFE.test(panelText(p)));
      const flagged = structuredClone(s.spec);
      for (const p of flagged.panels) if (AFTERLIFE.test(panelText(p))) (p as { vision?: string }).vision = "afterlife";
      const after = figureStateIssues(flagged, cast, looks, "warning");
      B.totalAfter += after.length;
      if (panels.length === 0) continue;
      B.pages += 1;
      B.panelsFlagged += panels.length;
      const inPanels = (list: typeof before) => list.filter((i) => panels.some((p) => i.path.startsWith(`panel ${p.id} `))).length;
      const b = inPanels(before);
      const a = inPanels(after);
      B.mismatchBefore += b;
      B.mismatchAfter += a;
      if (b > 0) B.pagesBefore += 1;
      if (a > 0) B.pagesAfter += 1;
      bRows.push(`| ${run.name} | ${page.page_number} | ${panels.map((p) => p.id).join(",")} | ${b} | ${a} | ${before.length} | ${after.length} | ${f2(judged.get(page.page_number)?.continuity ?? NaN)} |`);
    }

    // C: minor figures.
    for (const page of plan.pages) {
      const l = judged.get(page.page_number);
      const pageUnits = units.filter((u) => page.units.includes(u.id));
      const minor = minorFigures(pageUnits, page.section_id, understanding.cast);
      Cc.pages += 1;
      if (l?.missingPerson) Cc.complaintPages += 1;
      if (minor.length > 0) {
        Cc.pagesWithMinor += 1;
        Cc.minorFigures += minor.length;
        if (l?.missingPerson) {
          Cc.withComplaint += 1;
          Cc.complaintCovered += 1;
        }
        cRows.push(`| ${run.name} | ${page.page_number} | ${minor.map((m) => `${m.id} (${m.role})`).join("; ")} | ${l ? (l.missingPerson ? "yes" : "no") : "-"} |`);
      }
    }
  }

  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : "-");
  out.push("# A. Location check (derived places: proxy)\n");
  out.push(`Pages with a judge panel: ${A.pages}. Judged with a setting defect: ${A.settingTotal} (${pct(A.settingTotal, A.pages)}). Continuity mean <= 2.5: ${A.lowTotal} (${pct(A.lowTotal, A.pages)}). Judged good: ${A.goodTotal}.`);
  out.push(`Flagged by the check: ${A.flagged} (${pct(A.flagged, A.pages)}). Of those: setting defect ${A.flaggedSetting} (${pct(A.flaggedSetting, A.flagged)}), continuity <= 2.5 ${A.flaggedLow} (${pct(A.flaggedLow, A.flagged)}), judged good ${A.flaggedGood}.`);
  out.push(`Setting defects by the judges' owner label (judge-defects, not pages; major and blocker): ${Object.entries(owners).sort((a, b) => b[1] - a[1]).map(([o, n]) => `${o} ${n}`).join(", ")}.`);
  out.push(`Base rate of a setting defect on an unflagged page: ${pct(A.settingTotal - A.flaggedSetting, A.pages - A.flagged)}.\n`);
  out.push("| run | page | codes | continuity | setting defect | judged |", "|---|---|---|---|---|---|", ...aRows, "");
  out.push("# B. Afterlife / dream panels: FIGURE_STATE_MISMATCH before and after the vision flag (simulated)\n");
  out.push(`Pages with a detected afterlife/dream panel and states: see table. Pages: ${B.pages}, panels flagged: ${B.panelsFlagged}. Mismatches inside those panels: before ${B.mismatchBefore} (on ${B.pagesBefore} pages), after ${B.mismatchAfter} (on ${B.pagesAfter} pages). All pages of all runs: before ${B.totalBefore}, after ${B.totalAfter}.\n`);
  out.push("| run | page | panels | mismatch in them before | after | page total before | after | continuity |", "|---|---|---|---|---|---|---|---|", ...bRows, "");
  out.push("# D. Pages in reach of Q2b (a setting problem owned by the plan, the understanding or the writer, or a missing person)\n");
  out.push("| run | judged pages | continuity mean | pages in reach | their continuity mean |", "|---|---|---|---|---|", ...reach, "");
  out.push("# C. Minor figures\n");
  out.push(`Pages: ${Cc.pages}. Pages that would get a minor figure: ${Cc.pagesWithMinor} (${Cc.minorFigures} figures). Pages where a judge reports a missing person: ${Cc.complaintPages}; of the pages with a minor figure, ${Cc.withComplaint} have such a complaint.\n`);
  out.push("| run | page | minor figures | judge reports a missing person |", "|---|---|---|---|", ...cRows, "");
  json.A = { ...A, owners };
  json.A_owners = owners;
  json.B = B;
  json.C = Cc;
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(json, null, 1));
  console.log(out.join("\n"));
}

main();
