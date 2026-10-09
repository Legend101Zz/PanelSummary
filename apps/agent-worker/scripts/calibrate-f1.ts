/**
 * Calibration for the F1 repair hints (docs/launch/F1-dense-page.md). No model, no spend.
 *
 * Replays every ACCEPTED judged page of the Phase 0, CI and run 8 exports through the page goal's
 * submit_page tool and reports (a) the page's size (panels, texts, words), (b) whether the page is
 * still accepted, and (c) whether PAGE_TOO_FULL or REPAIR_LOOP fires. The hints are warnings that
 * need at least two room errors, so a page that passes cleanly can never show them.
 *
 *   tsx scripts/calibrate-f1.ts OUT.json NAME=EXPORT_DIR[:JUDGE_SCORES] ...
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CANDIDATE_ARG } from "../src/goals/common.js";
import { mangaPageGoal } from "../src/goals/manga-page.js";

const [outFile, ...sets] = process.argv.slice(2);
const rows: Record<string, unknown>[] = [];

for (const item of sets) {
  const [name, dir] = item.split("=");
  const read = (f: string) => JSON.parse(readFileSync(path.join(dir, f), "utf8"));
  const understanding = read("understanding.json");
  const planFile = read("plan.json");
  const plan = planFile.plan ?? planFile;
  const units = new Map<string, unknown>((read("units.json") as { id: string }[]).map((u) => [u.id, u]));
  for (const file of readdirSync(path.join(dir, "judge")).filter((f) => /^page-\d+\.json$/.test(f)).sort()) {
    const judged = JSON.parse(readFileSync(path.join(dir, "judge", file), "utf8"));
    if (!judged.spec) continue;
    const spec = judged.spec;
    const planned = plan.pages.find((p: { page_number: number }) => p.page_number === judged.page_number);
    const prepared = mangaPageGoal.prepare(
      mangaPageGoal.parseInput({
        book: { title: understanding.title, author: understanding.author },
        understanding,
        plan,
        page_number: judged.page_number,
        units: planned.units.map((id: string) => units.get(id)),
      }),
      { model: "MiniMax-M3", thinking: "off", vision: false },
    );
    const submit = prepared.tools.find((t) => t.name === "submit_page")!;
    const result = await submit.execute({ [CANDIDATE_ARG]: JSON.stringify(spec) }, undefined);
    const texts = spec.panels.flatMap((p: { text?: { text: string }[] }) => p.text ?? []);
    const codes = [...result.text.matchAll(/\[ERROR ([A-Z_]+)\]/g)].map((m) => m[1]);
    rows.push({
      set: name,
      page: judged.page_number,
      panels: spec.panels.length,
      texts: texts.length,
      words: texts.reduce((n: number, t: { text: string }) => n + t.text.split(/\s+/).length, 0),
      accepted_now: result.text.startsWith("ACCEPTED"),
      error_codes: [...new Set(codes)],
      page_too_full: result.text.includes("PAGE_TOO_FULL"),
      repair_loop: result.text.includes("REPAIR_LOOP"),
    });
  }
}
writeFileSync(outFile, JSON.stringify(rows, null, 1));
const accepted = rows.filter((r) => r.accepted_now);
console.log(JSON.stringify({
  pages: rows.length,
  accepted_now: accepted.length,
  rejected_now: rows.length - accepted.length,
  hint_fired_on_accepted: accepted.filter((r) => r.page_too_full || r.repair_loop).length,
  hint_fired_on_rejected: rows.filter((r) => !r.accepted_now && (r.page_too_full || r.repair_loop)).length,
  max_texts_per_panel: Math.max(...rows.map((r) => (r.texts as number) / (r.panels as number))),
  max_words: Math.max(...rows.map((r) => r.words as number)),
}));
