/**
 * Geometry for the saved pages of a run export (used by seed_states.py).
 *
 *   apps/agent-worker/node_modules/.bin/tsx scripts/fixtures/render_export_pages.ts <export-dir>
 *
 * The export keeps each accepted page as `judge/page-NN.svg` plus its spec (`judge/page-NN.json`), but not the
 * panel and text geometry the reader needs. The renderer is deterministic, so rendering the saved spec again
 * gives the geometry of that SVG, if the renderer has not changed since the run. Saved exports come from older
 * renderers, so the check is opt-in: with --verify the script stops with an error if one page differs. Without
 * it, a page that differs gets "reproduced": false and the geometry of today's renderer (an approximation).
 * The SVG that is stored is always the saved one, never a new one.
 * It prints JSON: { renderer_version, pages: { "1": { panels, texts, warnings, svg_hash, reproduced } } }.
 * No model call.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { RENDERER_VERSION, renderPage } from "../../packages/manga-render/src/index.ts";

const verify = process.argv.includes("--verify");
const dir = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!dir) throw new Error("usage: render_export_pages.ts <export-dir> [--verify]");

const understanding = JSON.parse(fs.readFileSync(path.join(dir, "understanding.json"), "utf8"));
const plan = JSON.parse(fs.readFileSync(path.join(dir, "plan.json"), "utf8"));
const judgeDir = path.join(dir, "judge");
const numbers = fs
  .readdirSync(judgeDir)
  .filter((f) => /^page-\d+\.svg$/.test(f))
  .map((f) => Number(f.slice(5, -4)))
  .sort((a, b) => a - b);

const pages: Record<string, unknown> = {};
let previousHook = false;
for (const n of numbers) {
  const id = String(n).padStart(2, "0");
  const saved = JSON.parse(fs.readFileSync(path.join(judgeDir, `page-${id}.json`), "utf8"));
  const svg = fs.readFileSync(path.join(judgeDir, `page-${id}.svg`), "utf8");
  const planned = plan.pages.find((p: { page_number: number }) => p.page_number === n);
  const result = renderPage(saved.spec, understanding, { planned, previousPageHook: previousHook });
  previousHook = !!saved.spec.page_turn_hook;
  const reproduced = result.svg === svg;
  if (verify && !reproduced) throw new Error(`page ${n}: the renderer does not reproduce the saved SVG (renderer ${RENDERER_VERSION})`);
  pages[String(n)] = {
    panels: result.panels,
    texts: result.texts,
    warnings: result.issues.filter((i: { severity: string }) => i.severity === "warning"),
    svg_hash: createHash("sha256").update(svg).digest("hex"), // hash of the SAVED svg
    reproduced,
  };
}
process.stdout.write(JSON.stringify({ renderer_version: RENDERER_VERSION, pages }));
