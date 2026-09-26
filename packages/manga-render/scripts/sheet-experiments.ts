/**
 * Re-render the real MiniMax-authored experiment pages with the current code.
 *
 *   npx tsx scripts/sheet-experiments.ts [filter...]
 *
 * Reads <EXPERIMENTS>/pg-<arm>-<book>/page-N.json (the spec is under "spec")
 * with the book's understanding from <EXPERIMENTS>/u-<book>-MiniMax-M3, and
 * writes <OUT>/<arm>-<book>-page-N.png (+ .svg). Filters match any part of
 * "<arm>-<book>-page-N" (e.g. "G-happy" or "page-3").
 * Env: EXPERIMENTS (default Book-Reel-scratch/experiments), EXPERIMENT_OUT.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderPage, type BookUnderstanding } from "../src/index.js";
import { svgToPng } from "../src/raster.js";

const ROOT = process.env.EXPERIMENTS ?? "/Volumes/Mrigesh SSD/Book-Reel-scratch/experiments";
const OUT =
  process.env.EXPERIMENT_OUT ??
  "/private/tmp/claude-501/-Users-comreton-Desktop/3b1640fe-8ce0-4ed7-b544-0b35ca3ba64d/scratchpad/render/v2";
const RUNS = ["pg-G-happy-prince-and-other-tales", "pg-B-happy-prince-and-other-tales", "pg-B-civil-disobedience", "pg-F-civil-disobedience"];
const filters = process.argv.slice(2).filter((a) => !a.startsWith("--"));
mkdirSync(OUT, { recursive: true });

const books = new Map<string, BookUnderstanding>();
function book(name: string): BookUnderstanding {
  let b = books.get(name);
  if (!b) {
    b = JSON.parse(readFileSync(path.join(ROOT, `u-${name}-MiniMax-M3`, "understanding.json"), "utf8")) as BookUnderstanding;
    books.set(name, b);
  }
  return b;
}

let total = 0;
let bytes = 0;
for (const run of RUNS) {
  const m = /^pg-([A-Z])-(.+)$/.exec(run);
  if (!m) continue;
  const [, arm, name] = m;
  const dir = path.join(ROOT, run);
  if (!existsSync(dir)) continue;
  const pages = readdirSync(dir)
    .filter((f) => /^page-\d+\.json$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  for (const file of pages) {
    const tag = `${arm}-${name}-${file.replace(".json", "")}`;
    if (filters.length && !filters.some((f) => tag.includes(f))) continue;
    const raw = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as { spec?: unknown };
    const spec = raw.spec ?? raw;
    const t0 = performance.now();
    const result = renderPage(spec, book(name));
    const ms = Math.round(performance.now() - t0);
    writeFileSync(path.join(OUT, `${tag}.svg`), result.svg);
    writeFileSync(path.join(OUT, `${tag}.png`), svgToPng(result.svg, { width: 1000 }));
    total += 1;
    bytes += result.svg.length;
    const errs = result.issues.filter((i) => i.severity === "error").map((i) => i.code);
    console.log(`${tag}: ${ms}ms ${Math.round(result.svg.length / 1024)}KB${errs.length ? ` errors: ${errs.join(",")}` : ""}`);
  }
}
if (total) console.log(`${total} pages, mean ${Math.round(bytes / total / 1024)}KB -> ${OUT}`);
