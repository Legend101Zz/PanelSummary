/**
 * Re-render the pages of a real acceptance run with the current renderer.
 *
 *   npx tsx scripts/rerender-acceptance.ts [--run <dir>] [--out <dir>] [--only 3,4,7]
 *                                          [--before] [--pairs] [--debug] [--quiet]
 *
 * Each `<run>/judge/page-NN.json` holds `{ spec, planned, ... }`; the cast and
 * locations come from `<run>/understanding.json`. Output:
 * - `<out>/page-NN.png` (1000 px wide) and a one-line issue summary per page;
 * - with --before, the same into `<out>/before/` (a baseline to compare with);
 * - with --pairs, `<out>/pairs/page-NN.png`: the baseline (left) next to the
 *   current render (right), for every page that has a baseline;
 * - with --debug, `<out>/debug/page-NN.png` with head circles (red), mouths
 *   (blue), body boxes (orange), lettering boxes (green) and staging labels.
 * The run ends with a count of pages with errors and the most frequent codes.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BookUnderstanding, PlannedPage } from "../src/contracts.js";
import { isAcceptable, renderPageDetailed } from "../src/index.js";
import { svgToPng } from "../src/raster.js";
import { esc, n } from "../src/svg.js";

const DEFAULT_RUN = "/Volumes/Mrigesh SSD/Book-Reel-scratch/acceptance/run1";
const DEFAULT_OUT =
  "/private/tmp/claude-501/-Users-comreton-Desktop/3b1640fe-8ce0-4ed7-b544-0b35ca3ba64d/scratchpad/render/v3";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const run = arg("--run") ?? process.env.ACCEPTANCE_RUN ?? DEFAULT_RUN;
const outRoot = arg("--out") ?? process.env.RERENDER_OUT ?? DEFAULT_OUT;
const before = process.argv.includes("--before");
const pairs = process.argv.includes("--pairs");
const debug = process.argv.includes("--debug");
const quiet = process.argv.includes("--quiet");
const only = new Set(
  (arg("--only") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((v) => Number.isInteger(v) && v > 0),
);
const out = before ? path.join(outRoot, "before") : outRoot;
mkdirSync(out, { recursive: true });

const rawU = JSON.parse(readFileSync(path.join(run, "understanding.json"), "utf8")) as Record<string, unknown>;
const understanding = (rawU.understanding ?? rawU) as BookUnderstanding;
const book = { cast: understanding.cast, locations: understanding.locations };

const judge = path.join(run, "judge");
const files = readdirSync(judge)
  .filter((f) => /^page-\d+\.json$/.test(f))
  .sort((a, b) => Number(/\d+/.exec(a)?.[0]) - Number(/\d+/.exec(b)?.[0]));

/** page_turn_hook of every page, to pass previousPageHook to the next one. */
const hooks = new Map<number, boolean>();
for (const f of files) {
  const raw = JSON.parse(readFileSync(path.join(judge, f), "utf8")) as { spec?: { page_number?: number; page_turn_hook?: boolean } };
  if (raw.spec?.page_number) hooks.set(raw.spec.page_number, raw.spec.page_turn_hook === true);
}

function pngDataUri(file: string): string {
  return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
}

let pages = 0;
let failing = 0;
const codes = new Map<string, number>();
for (const f of files) {
  const num = Number(/\d+/.exec(f)?.[0] ?? "0");
  if (only.size > 0 && !only.has(num)) continue;
  const raw = JSON.parse(readFileSync(path.join(judge, f), "utf8")) as { spec?: unknown; planned?: PlannedPage };
  const spec = raw.spec ?? raw;
  const name = `page-${String(num).padStart(2, "0")}`;
  const t0 = performance.now();
  const { result, details } = renderPageDetailed(spec, book, {
    ...(raw.planned ? { planned: raw.planned } : {}),
    previousPageHook: hooks.get(num - 1) === true,
  });
  const ms = Math.round(performance.now() - t0);
  const png = path.join(out, `${name}.png`);
  writeFileSync(png, svgToPng(result.svg, { width: 1000 }));
  pages += 1;
  if (!isAcceptable(result)) failing += 1;
  const errors = result.issues.filter((i) => i.severity === "error");
  const warnings = result.issues.filter((i) => i.severity === "warning");
  console.log(`${name}: ${ms}ms, ${Math.round(result.svg.length / 1024)}KB, ${errors.length} errors, ${warnings.length} warnings -> ${png}`);
  for (const i of result.issues) {
    codes.set(`${i.severity === "error" ? "ERR " : "warn"} ${i.code}`, (codes.get(`${i.severity === "error" ? "ERR " : "warn"} ${i.code}`) ?? 0) + 1);
    if (!quiet) console.log(`   ${i.severity === "error" ? "ERR " : "warn"} ${i.code} [${i.path}] ${i.message}`);
  }
  if (debug) {
    mkdirSync(path.join(out, "debug"), { recursive: true });
    let overlay = "";
    for (const d of details) {
      for (const fg of d.figures) {
        overlay += `<circle cx="${n(fg.head.x)}" cy="${n(fg.head.y)}" r="${n(fg.headRadius)}" fill="none" stroke="#e00" stroke-width="3"/>`;
        overlay += `<circle cx="${n(fg.mouth.x)}" cy="${n(fg.mouth.y)}" r="5" fill="#00f"/>`;
        overlay += `<rect x="${n(fg.body.x)}" y="${n(fg.body.y)}" width="${n(fg.body.w)}" height="${n(fg.body.h)}" fill="none" stroke="#f90" stroke-width="2" stroke-dasharray="6 4"/>`;
        overlay += `<text x="${n(fg.body.x)}" y="${n(fg.body.y - 4)}" font-size="14" fill="#c0f">${esc(`${fg.character} ${fg.staging} ${fg.detail} r${Math.round(fg.headRadius)}`)}</text>`;
      }
    }
    for (const t of result.texts) {
      overlay += `<rect x="${n(t.bbox.x)}" y="${n(t.bbox.y)}" width="${n(t.bbox.w)}" height="${n(t.bbox.h)}" fill="none" stroke="#0a0" stroke-width="2"/>`;
    }
    for (const p of result.panels) {
      overlay += `<text x="${n(p.bbox.x + p.bbox.w - 30)}" y="${n(p.bbox.y + 30)}" font-size="28" font-weight="700" fill="#e00">${p.order + 1}</text>`;
    }
    writeFileSync(path.join(out, "debug", `${name}.png`), svgToPng(result.svg.replace("</svg>", `${overlay}</svg>`), { width: 1000 }));
  }
  const base = path.join(outRoot, "before", `${name}.png`);
  if (pairs && !before && existsSync(base)) {
    mkdirSync(path.join(outRoot, "pairs"), { recursive: true });
    const W = 2040;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 1560" width="${W}" height="1560">` +
      `<rect width="${W}" height="1560" fill="#fff"/>` +
      `<text x="20" y="40" font-size="36" font-weight="700" fill="#a00">BEFORE</text>` +
      `<text x="1040" y="40" font-size="36" font-weight="700" fill="#070">AFTER (${esc(`${errors.length} err, ${warnings.length} warn`)})</text>` +
      `<image x="0" y="60" width="1000" height="1500" href="${pngDataUri(base)}"/>` +
      `<image x="1040" y="60" width="1000" height="1500" href="${pngDataUri(png)}"/>` +
      `</svg>`;
    writeFileSync(path.join(outRoot, "pairs", `${name}.png`), svgToPng(svg, { width: 1600 }));
  }
}
const top = [...codes.entries()].sort((a, b) => b[1] - a[1]);
console.log(`issue codes: ${top.map(([c, k]) => `${c}×${k}`).join(", ")}`);
console.log(`done: ${pages} pages, ${failing} with errors, out=${out}`);
