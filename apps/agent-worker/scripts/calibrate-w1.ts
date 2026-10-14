/**
 * Track W1 (v0.3, issues #82, #83, #87): replays the page checks and the plan place check over the
 * saved v0.2 live runs and writes the flags of each judged page to a JSON file. A second step
 * (the Python join in the track notes, docs/v0.3/W1-writer.md) joins the flags with the judges.
 * No model call, no spend.
 *
 *   tsx scripts/calibrate-w1.ts OUT.json [NAME=RUN_DIR ...]
 *
 * RUN_DIR holds export/{understanding,plan,units}.json and export/judge/page-NN.json.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { renderPage, validatePage } from "@panelsummary/manga-render";
import type { MangaPageSpec, ValidationIssue } from "@panelsummary/manga-render";

import { mangaPageGoal, pageIssues } from "../src/goals/manga-page.js";
import { planPlaceIssues } from "../src/goals/places.js";
import { quoteClippedIssues } from "../src/goals/repair-once.js";

const V = "/Volumes/Mrigesh SSD/Book-Reel-scratch/v02";
const DEFAULT: [string, string][] = [
  ["run2", `${V}/live/run2`], ["run3", `${V}/live/run3`], ["run4", `${V}/live/run4`], ["run5", `${V}/live/run5`],
  ["run6", `${V}/live/run6`], ["run8", `${V}/live/run8`], ["fj", `${V}/final-journey`], ["fj2", `${V}/final-journey-2`], ["v01", `${V}/v01-holdout`],
];

const [outFile, ...args] = process.argv.slice(2);
const sets = args.length ? args.map((a): [string, string] => [a.split("=")[0], a.split("=")[1]]) : DEFAULT;
const rows: unknown[] = [];

for (const [name, dir] of sets) {
  const exp = path.join(dir, "export");
  const read = (f: string) => JSON.parse(readFileSync(path.join(exp, f), "utf8"));
  const understanding = read("understanding.json");
  const planFile = read("plan.json");
  const plan = planFile.plan ?? planFile;
  const units = new Map<string, unknown>((read("units.json") as { id: string }[]).map((u) => [u.id, u]));
  const planFlags = new Map<number, ValidationIssue[]>();
  for (const issue of planPlaceIssues(plan, understanding)) {
    const n = Number(/page (\d+)/.exec(issue.path)?.[1]);
    planFlags.set(n, [...(planFlags.get(n) ?? []), issue]);
  }
  for (const file of readdirSync(path.join(exp, "judge")).filter((f) => /^page-\d+\.json$/.test(f)).sort()) {
    const judged = JSON.parse(readFileSync(path.join(exp, "judge", file), "utf8"));
    if (!judged.spec) continue;
    const spec = judged.spec as MangaPageSpec;
    const planned = plan.pages.find((p: { page_number: number }) => p.page_number === judged.page_number);
    if (!planned) continue;
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
    const flags: Record<string, string[]> = {};
    for (const issue of all) (flags[issue.code] ??= []).push(`${issue.path}: ${issue.message.slice(0, 240)}`);
    for (const issue of planFlags.get(judged.page_number) ?? []) (flags[issue.code] ??= []).push(`${issue.path}: ${issue.message.slice(0, 240)}`);
    for (const [minTail, maxTail] of [[2, 6], [2, 4], [3, 6], [2, 99], [4, 12]]) {
      const found = quoteClippedIssues(spec, input, { minTail, maxTail });
      if (found.length > 0) flags[`QUOTE_CLIPPED@tail${minTail}-${maxTail}`] = found.map((i) => `${i.path}: ${i.message.slice(0, 240)}`);
    }
    rows.push({ run: name, page: judged.page_number, flags });
  }
}
writeFileSync(outFile, JSON.stringify(rows, null, 1));
console.log(`rows: ${rows.length}`);
