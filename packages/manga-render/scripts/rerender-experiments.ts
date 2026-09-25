/**
 * Re-render the real MiniMax-authored experiment pages with the current code.
 *
 *   npx tsx scripts/rerender-experiments.ts [--out <dir>] [--only <arm>-<book>] [--debug] [--tone]
 *
 * Each experiment page file (`<arm dir>/page-N.json`) holds `{ spec, issues }`;
 * the cast and locations come from the book's understanding
 * (`u-<book>-MiniMax-M3/understanding.json`). Output:
 * `<out>/<arm>-<book>-page-N.png` (1000 px wide) plus a one-line summary of
 * issues per page. With --debug, head circles (red), mouths (blue), body
 * boxes (orange), lettering boxes (green) and figure staging labels are
 * overlaid on a second PNG. With --tone, each panel's visible pattern-tone
 * coverage (tone_area_ratio: dots, dense dots, stripes, check, flowers; the
 * craft target is 35% or less) is measured from a raster in which every
 * pattern tone is recoloured.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import type { BookUnderstanding, RenderedPanel } from "../src/contracts.js";
import { isAcceptable, renderPageDetailed } from "../src/index.js";
import { svgToPng } from "../src/raster.js";
import { esc, n } from "../src/svg.js";

const EXPERIMENTS = process.env.EXPERIMENTS_DIR ?? "/Volumes/Mrigesh SSD/Book-Reel-scratch/experiments";
const DEFAULT_OUT =
  "/private/tmp/claude-501/-Users-comreton-Desktop/3b1640fe-8ce0-4ed7-b544-0b35ca3ba64d/scratchpad/render/v2";

const RUNS: { arm: string; book: string }[] = [
  { arm: "G", book: "happy-prince-and-other-tales" },
  { arm: "B", book: "happy-prince-and-other-tales" },
  { arm: "B", book: "civil-disobedience" },
  { arm: "F", book: "civil-disobedience" },
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const out = arg("--out") ?? process.env.RERENDER_OUT ?? DEFAULT_OUT;
const only = arg("--only");
const debug = process.argv.includes("--debug");
const tone = process.argv.includes("--tone");
mkdirSync(out, { recursive: true });

function loadUnderstanding(book: string): BookUnderstanding {
  const file = path.join(EXPERIMENTS, `u-${book}-MiniMax-M3`, "understanding.json");
  const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  return (raw.understanding ?? raw) as BookUnderstanding;
}

const PATTERN_TONES = /<pattern id="([^"]*tone-(?:dots|dense_dots|stripes|check|flowers))"([^>]*)>[\s\S]*?<\/pattern>/g;
const MARK = [255, 0, 255];

/** Visible pattern-tone share of each panel (0..1), from a raster with tones recoloured. */
function toneAreaRatios(svg: string, panels: readonly RenderedPanel[], width = 500): number[] {
  const marked = svg.replace(PATTERN_TONES, (_all, id: string, attrs: string) => `<pattern id="${id}"${attrs}><rect width="1000" height="1000" fill="rgb(${MARK.join(",")})"/></pattern>`);
  const img = new Resvg(marked, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } }).render();
  const px = img.pixels;
  const s = img.width / 1000;
  return panels.map((p) => {
    const inside = (x: number, y: number) => {
      // point in convex polygon (clockwise, y down)
      const poly = p.polygon;
      for (let i = 0; i < poly.length; i += 1) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
      }
      return true;
    };
    let total = 0;
    let hit = 0;
    const x0 = Math.floor(p.bbox.x * s);
    const x1 = Math.ceil((p.bbox.x + p.bbox.w) * s);
    const y0 = Math.floor(p.bbox.y * s);
    const y1 = Math.ceil((p.bbox.y + p.bbox.h) * s);
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        if (!inside((x + 0.5) / s, (y + 0.5) / s)) continue;
        total += 1;
        const k = (y * img.width + x) * 4;
        if (Math.abs(px[k] - MARK[0]) < 40 && px[k + 1] < 60 && Math.abs(px[k + 2] - MARK[2]) < 40) hit += 1;
      }
    }
    return total ? hit / total : 0;
  });
}

let pages = 0;
let failing = 0;
const toneReport: string[] = [];
for (const run of RUNS) {
  const tag = `${run.arm}-${run.book}`;
  if (only && only !== tag) continue;
  const dir = path.join(EXPERIMENTS, `pg-${run.arm}-${run.book}`);
  if (!existsSync(dir)) {
    console.log(`skip ${tag}: ${dir} not found`);
    continue;
  }
  const u = loadUnderstanding(run.book);
  const book = { cast: u.cast, locations: u.locations };
  const files = readdirSync(dir)
    .filter((f) => /^page-\d+\.json$/.test(f))
    .sort((a, b) => Number(/\d+/.exec(a)?.[0]) - Number(/\d+/.exec(b)?.[0]));
  for (const f of files) {
    const raw = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Record<string, unknown>;
    const spec = raw.spec ?? raw;
    const num = /\d+/.exec(f)?.[0] ?? "0";
    const t0 = performance.now();
    const { result, details } = renderPageDetailed(spec, book);
    const ms = Math.round(performance.now() - t0);
    const png = path.join(out, `${tag}-page-${num}.png`);
    writeFileSync(png, svgToPng(result.svg, { width: 1000 }));
    pages += 1;
    if (!isAcceptable(result)) failing += 1;
    const errors = result.issues.filter((i) => i.severity === "error");
    const warnings = result.issues.filter((i) => i.severity === "warning");
    console.log(`${tag} page ${num}: ${ms}ms, ${Math.round(result.svg.length / 1024)}KB, ${errors.length} errors, ${warnings.length} warnings -> ${png}`);
    for (const i of result.issues) console.log(`   ${i.severity === "error" ? "ERR " : "warn"} ${i.code} [${i.path}] ${i.message}`);
    if (tone) {
      const ratios = toneAreaRatios(result.svg, result.panels);
      const line = result.panels.map((p, i) => `${p.id} ${Math.round(ratios[i] * 100)}%${ratios[i] > 0.35 ? "!" : ""}`).join("  ");
      console.log(`   tone_area_ratio: ${line}`);
      toneReport.push(`${tag} p${num}: ${line}`);
    }
    if (debug) {
      let overlay = "";
      for (const d of details) {
        for (const fg of d.figures) {
          overlay += `<circle cx="${n(fg.head.x)}" cy="${n(fg.head.y)}" r="${n(fg.headRadius)}" fill="none" stroke="#e00" stroke-width="3"/>`;
          overlay += `<circle cx="${n(fg.mouth.x)}" cy="${n(fg.mouth.y)}" r="5" fill="#00f"/>`;
          overlay += `<rect x="${n(fg.body.x)}" y="${n(fg.body.y)}" width="${n(fg.body.w)}" height="${n(fg.body.h)}" fill="none" stroke="#f90" stroke-width="2" stroke-dasharray="6 4"/>`;
          overlay += `<text x="${n(fg.body.x)}" y="${n(fg.body.y - 4)}" font-size="14" fill="#c0f">${esc(`${fg.character} ${fg.staging} ${fg.detail}`)}</text>`;
        }
      }
      for (const t of result.texts) {
        overlay += `<rect x="${n(t.bbox.x)}" y="${n(t.bbox.y)}" width="${n(t.bbox.w)}" height="${n(t.bbox.h)}" fill="none" stroke="#0a0" stroke-width="2"/>`;
      }
      for (const p of result.panels) {
        overlay += `<text x="${n(p.bbox.x + p.bbox.w - 30)}" y="${n(p.bbox.y + 30)}" font-size="28" font-weight="700" fill="#e00">${p.order + 1}</text>`;
      }
      writeFileSync(path.join(out, `${tag}-page-${num}-debug.png`), svgToPng(result.svg.replace("</svg>", `${overlay}</svg>`), { width: 1000 }));
    }
  }
}
if (tone) {
  const over = toneReport.join("\n").match(/!/g)?.length ?? 0;
  console.log(`tone_area_ratio: ${over} panel(s) above 35%`);
}
console.log(`done: ${pages} pages, ${failing} with errors, out=${out}`);
