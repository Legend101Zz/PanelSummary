/**
 * Track dens (v0.3, Gate 1b): per planned page, the plan density features and the plan place flags,
 * written to a JSON file. The Python join (scripts/calibrate-dens-join.py) joins them with the judges
 * and prints the D26 tables of docs/v0.3/W1-writer.md ('Gate 1b: plan density'). No model call, no spend.
 *
 *   tsx scripts/calibrate-dens.ts OUT.json NAME=RUN_DIR [NAME=RUN_DIR ...]
 *
 * RUN_DIR holds export/{understanding,plan}.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { beatWords, castWords, claimMix, namedUnlistedPlaces } from "../src/goals/plan-density.js";

const [outFile, ...args] = process.argv.slice(2);
const rows: unknown[] = [];
for (const arg of args) {
  const [name, dir] = [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)];
  const read = (f: string) => JSON.parse(readFileSync(path.join(dir, "export", f), "utf8"));
  const understanding = read("understanding.json");
  const planFile = read("plan.json");
  const plan = planFile.plan ?? planFile;
  const importance = new Map<string, string>(understanding.claims.map((c: { id: string; importance: string }) => [c.id, c.importance]));
  const ignore = castWords(understanding.cast);
  for (const page of plan.pages) {
    const mix = claimMix(page, importance);
    rows.push({
      run: name,
      page: page.page_number,
      mix,
      beat_words: beatWords(page.beat),
      places_named_plain: namedUnlistedPlaces(page, understanding.locations ?? []).map((m) => m.id),
      places_named: namedUnlistedPlaces(page, understanding.locations ?? [], ignore).map((m) => m.id),
      n_locations: (page.locations ?? []).length,
    });
  }
}
writeFileSync(outFile, JSON.stringify(rows, null, 1));
console.log(`${rows.length} pages written to ${outFile}`);
