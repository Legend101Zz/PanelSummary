/**
 * Offline calibration of the T1 checks (no model calls).
 *
 *   tsx scripts/calibrate-t1.ts [--root /Volumes/Mrigesh\ SSD/Book-Reel-scratch/acceptance] [--runs run8,run6,run4] [--json out.json]
 *
 * Replays the new checks over saved acceptance runs (per run: understanding.json,
 * plan.json, units.json, judge/page-NN.json, judge-scores.json) and compares the
 * hits with the judges' scores and defects.
 *
 * Rule (task T1): a check becomes an ERROR only if it flags judged-defective pages
 * and flags no judged-good page. Judged good = ships, or mean >= 3.5 with no
 * criterion below 3. Judged defective FOR A CHECK = the page has a major or blocker
 * defect whose text matches the check's words, or (state check) continuity <= 2.
 *
 * Run 8 has no state data in its understanding, so the state check uses the hand
 * table in test/fixtures/run8-states.ts. Other runs have none: state hits are
 * reported for run 8 only.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { AdaptationPlan, BookUnderstanding, CastMember, Claim, MangaPageSpec } from "@panelsummary/manga-render";

import { loneSpeakers } from "../src/goals/attribution.js";
import { claimEventIssues, claimOrderIssues, planOrderIssues } from "../src/goals/claim-shown.js";
import { claimPages, expectedLooks, figureStateIssues, stateIssues, unitOrder } from "../src/goals/continuity.js";
import { RUN8_STATES } from "../test/fixtures/run8-states.js";

interface Defect { owner: string; severity: string; what: string; fix?: string }
interface Judged { page: number; scores: Record<string, number>; ships: boolean; defects: Defect[] }
interface SavedPage { page_number: number; status: string; planned: AdaptationPlan["pages"][number]; claims: Claim[]; spec: MangaPageSpec | null }

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const ROOT = opt("root", "/Volumes/Mrigesh SSD/Book-Reel-scratch/acceptance");
const RUNS = opt("runs", "run8,run6,run4").split(",");
const JSON_OUT = opt("json", "");

const read = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;
const mean = (s: Record<string, number>) => Object.values(s).reduce((a, b) => a + b, 0) / Object.values(s).length;
const isGood = (j: Judged) => j.ships || (mean(j.scores) >= 3.5 && Math.min(...Object.values(j.scores)) >= 3);

/** Words that mark a judge's defect as being about each check. */
const DEFECT_WORDS = {
  state: /sapphire|eyes?\b|still gold|gold again|stripped|blind|variant|look(?:s)? (?:back|again)|state/i,
  order: /order|before its set-?up|reversed|reveal comes before|climax|leads to|follows the report|moved from before/i,
  unstated: /never (?:says?|states?|stated|shown)|not (?:stated|said|shown)|implicit|implied|only hints|hint|never named|missing:?|cut\b|dropped/i,
};

interface Hit { run: string; page: number; check: string; messages: string[] }

const stateTotals = { flagged: 0 };

function report() {
  const out: string[] = [];
  const hits: Hit[] = [];
  const tally: Record<string, { defective: number[]; good: number[]; other: number[] }> = {};
  const note = (check: string, run: string, page: number, kind: "defective" | "good" | "other") => {
    const key = `${check} (${run})`;
    (tally[key] ??= { defective: [], good: [], other: [] })[kind].push(page);
  };
  for (const run of RUNS) {
    const dir = path.join(ROOT, run);
    if (!existsSync(path.join(dir, "judge-scores.json")) || !existsSync(path.join(dir, "understanding.json"))) {
      out.push(`## ${run}: no saved judge data, skipped\n`);
      continue;
    }
    const judged = read<Judged[]>(path.join(dir, "judge-scores.json"));
    const understanding = read<BookUnderstanding>(path.join(dir, "understanding.json"));
    const plan = existsSync(path.join(dir, "plan.json")) ? read<AdaptationPlan>(path.join(dir, "plan.json")) : undefined;
    const units = existsSync(path.join(dir, "units.json")) ? read<Array<{ id: string; section_id: string; text: string }>>(path.join(dir, "units.json")) : [];
    const order = unitOrder(understanding.sections);
    const cast: CastMember[] =
      run === "run8"
        ? understanding.cast.map((c) => (RUN8_STATES[c.id] ? ({ ...c, states: RUN8_STATES[c.id] } as CastMember) : c))
        : understanding.cast;
    const pages = new Map<number, SavedPage>();
    for (const j of judged) {
      const file = path.join(dir, "judge", `page-${String(j.page).padStart(2, "0")}.json`);
      if (existsSync(file)) pages.set(j.page, read<SavedPage>(file));
    }
    out.push(`## ${run}: ${judged.length} judged pages, ${judged.filter((j) => j.ships).length} ship, ${judged.filter(isGood).length} judged good\n`);

    const rows: string[] = [];
    let figs = 0;
    let figsWithState = 0;
    let figsFlagged = 0;
    for (const j of judged) {
      const saved = pages.get(j.page);
      if (!saved?.spec) continue;
      const found: Record<string, string[]> = {};
      const page = saved.planned;
      if (run === "run8" && plan) {
        const looks = expectedLooks(cast, order, { page_number: page.page_number, units: page.units, claim_pages: claimPages(plan) });
        found.state = figureStateIssues(saved.spec, cast, looks, "warning").map((i) => `${i.path}: ${i.message.slice(0, 110)}`);
        for (const panel of saved.spec.panels) {
          for (const f of panel.figures ?? []) {
            const look = looks[f.character];
            if (!look) continue;
            figs += 1;
            if (Object.keys(look.variant).length > 0 || Object.keys(look.changing).length > 0) figsWithState += 1;
          }
        }
        figsFlagged = found.state.length;
        stateTotals.flagged += figsFlagged;
      }
      found.order = claimOrderIssues(saved.spec, saved.claims, order).map((i) => i.message.slice(0, 110));
      found.unstated = claimEventIssues(saved.spec, saved.claims).map((i) => i.message.slice(0, 110));
      const bad = j.defects.filter((d) => d.severity === "major" || d.severity === "blocker");
      for (const [check, list] of Object.entries(found)) {
        if (check === "state" && run !== "run8") continue;
        // Judged defective for this check: a matching major/blocker defect, or (state) continuity <= 2.
        const relevant = bad.some((d) => DEFECT_WORDS[check as keyof typeof DEFECT_WORDS].test(d.what)) || (check === "state" && j.scores.continuity <= 2);
        const kind = isGood(j) ? "good" : relevant ? "defective" : "other";
        if (list.length) {
          note(check, run, j.page, kind);
          hits.push({ run, page: j.page, check, messages: list });
        }
      }
      const summary = Object.entries(found).filter(([, l]) => l.length).map(([c, l]) => `${c}x${l.length}`).join(" ");
      if (summary) rows.push(`| ${j.page} | ${j.scores.continuity} | ${j.scores.fidelity} | ${j.scores.reading_flow} | ${j.ships ? "ship" : isGood(j) ? "good" : "-"} | ${summary} |`);
    }
    if (run === "run8") out.push(`State check: ${figs} figures of the 5 characters with hand-made states; ${figsWithState} of them on a page where a state is in force or changes; ${stateTotals.flagged} figure-level hits.\n`);
    out.push("| page | continuity | fidelity | flow | judged | hits |", "|---|---|---|---|---|---|", ...rows, "");

    if (plan) {
      const planHits = planOrderIssues(plan, understanding.claims, order);
      out.push(`Plan order (PLAN_ORDER) hits: ${planHits.length}`);
      for (const h of planHits) out.push(`- ${h.path}: ${h.message.slice(0, 160)}`);
      out.push("");
    }
    {
      const unitIds = understanding.sections.flatMap((sec) => sec.units);
      const plain = stateIssues(understanding, unitIds, order);
      out.push(`Understanding as saved (no states): ${plain.length} state issue(s)${plain.length ? `: ${plain.map((i) => `${i.code} ${i.path}`).join("; ")}` : ""}`);
      if (run === "run8") {
        const hand = stateIssues({ ...understanding, cast }, unitIds, order);
        out.push(`Understanding with the hand-made states: ${hand.length} issue(s): ${hand.map((i) => `${i.severity} ${i.code}`).join(", ") || "none"}`);
      }
      out.push("");
    }
    if (units.length) {
      const lone = loneSpeakers(units, cast);
      out.push(`Lone speakers the cast cannot draw: ${lone.length}`);
      for (const l of lone) out.push(`- ${l.kind} ${l.section}: ${l.phrase} ("${l.quote.slice(0, 40)}")${l.crowd ? ` hidden in ${l.crowd.id}` : ""}`);
      out.push("");
    }
  }
  out.push("## Verdict per check (error only if it flags defective pages and no good page)\n");
  out.push("| check (run) | defective pages flagged | good pages flagged | other pages flagged | error? |", "|---|---|---|---|---|");
  for (const [key, t] of Object.entries(tally)) {
    const ok = t.defective.length > 0 && t.good.length === 0;
    out.push(`| ${key} | ${t.defective.join(",") || "-"} | ${t.good.join(",") || "-"} | ${t.other.join(",") || "-"} | ${ok ? "eligible" : "warning"} |`);
  }
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ hits, tally }, null, 1));
  console.log(out.join("\n"));
}

report();
