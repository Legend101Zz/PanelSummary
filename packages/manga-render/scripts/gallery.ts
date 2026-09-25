/**
 * Gallery / contact sheet for the render core.
 *
 *   npx tsx scripts/gallery.ts [--debug]
 *
 * Renders every Happy Prince fixture page to <out>/page-N.png (1000px wide),
 * one page at desktop size and at 390px (phone), a sheet of all layout
 * templates, and (with --debug) overlays of head circles and mouth anchors.
 * Output dir: $GALLERY_OUT or the session scratchpad.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderPage, TEMPLATES, compileLayout, isAcceptable } from "../src/index.js";
import { svgToPng } from "../src/raster.js";
import { n, polyPath } from "../src/svg.js";
import { BOOK, PAGES, PLAN } from "../test/fixtures/happy-prince.js";
import { composePanel } from "../src/scene/index.js";
import { estimateTextArea } from "../src/lettering/index.js";

const OUT =
  process.env.GALLERY_OUT ??
  "/private/tmp/claude-501/-Users-comreton-Desktop/3b1640fe-8ce0-4ed7-b544-0b35ca3ba64d/scratchpad/render/gallery";
const debug = process.argv.includes("--debug");
mkdirSync(OUT, { recursive: true });

function templateSheet(): string {
  const cols = 7;
  const cw = 1000;
  const ch = 1500;
  const gap = 60;
  const label = 90;
  const rows = Math.ceil(TEMPLATES.length / cols);
  let body = "";
  TEMPLATES.forEach((t, i) => {
    const ids = Array.from({ length: t.slots }, (_, k) => `p${k + 1}`);
    const L = compileLayout({ template: t.id }, ids);
    const x = (i % cols) * (cw + gap);
    const y = Math.floor(i / cols) * (ch + gap + label);
    let g = `<rect width="${cw}" height="${ch}" fill="#fbfaf6" stroke="#bbb" stroke-width="3"/>`;
    for (const p of L.panels) {
      g += `<path d="${polyPath(p.polygon)}" fill="#fff" stroke="#141414" stroke-width="8"/>`;
      g += `<text x="${n(p.bbox.x + p.bbox.w / 2)}" y="${n(p.bbox.y + p.bbox.h / 2 + 40)}" font-size="120" font-weight="700" text-anchor="middle" font-family="PS Comic" fill="#888">${p.order + 1}</text>`;
    }
    g += `<text x="10" y="${ch + 72}" font-size="64" font-weight="700" font-family="PS Comic">${t.id} (${t.slots})</text>`;
    body += `<g transform="translate(${x} ${y})">${g}</g>`;
  });
  const W = cols * (cw + gap);
  const H = rows * (ch + gap + label);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${body}</svg>`;
}

writeFileSync(path.join(OUT, "templates.png"), svgToPng(templateSheet(), { width: 2000 }));

let failures = 0;
for (const spec of PAGES) {
  const planned = PLAN.pages.find((p) => p.page_number === spec.page_number);
  const t0 = performance.now();
  const result = renderPage(spec, BOOK, { planned });
  const ms = Math.round(performance.now() - t0);
  const file = path.join(OUT, `page-${spec.page_number}.png`);
  writeFileSync(path.join(OUT, `page-${spec.page_number}.svg`), result.svg);
  writeFileSync(file, svgToPng(result.svg, { width: 1000 }));
  const errors = result.issues.filter((i) => i.severity === "error");
  const warnings = result.issues.filter((i) => i.severity === "warning");
  if (!isAcceptable(result)) failures += 1;
  console.log(
    `page ${spec.page_number}: ${ms}ms, ${Math.round(result.svg.length / 1024)}KB, ${result.texts.length} texts, ${errors.length} errors, ${warnings.length} warnings -> ${file}`,
  );
  for (const i of result.issues) console.log(`   ${i.severity === "error" ? "ERR " : "warn"} ${i.code} [${i.path}] ${i.message}`);

  if (debug) {
    // Overlay head circles (red), mouths (blue), balloon boxes (green).
    const panels = spec.panels.map((panel, idx) => {
      const geo = result.panels[idx];
      return composePanel({ panel, index: idx, polygon: geo.polygon, bbox: geo.bbox, book: BOOK, idPrefix: "dbg-", textLoad: panel.text.filter((t) => t.kind !== "sfx").length, textArea: estimateTextArea(panel.text) });
    });
    let overlay = "";
    for (const c of panels) {
      for (const f of c.figures) {
        overlay += `<circle cx="${n(f.head.x)}" cy="${n(f.head.y)}" r="${n(f.headRadius)}" fill="none" stroke="#e00" stroke-width="3"/>`;
        overlay += `<circle cx="${n(f.mouth.x)}" cy="${n(f.mouth.y)}" r="5" fill="#00f"/>`;
        overlay += `<rect x="${n(f.body.x)}" y="${n(f.body.y)}" width="${n(f.body.w)}" height="${n(f.body.h)}" fill="none" stroke="#f90" stroke-width="2" stroke-dasharray="6 4"/>`;
      }
    }
    for (const t of result.texts) {
      overlay += `<rect x="${n(t.bbox.x)}" y="${n(t.bbox.y)}" width="${n(t.bbox.w)}" height="${n(t.bbox.h)}" fill="none" stroke="#0a0" stroke-width="2"/>`;
    }
    const dbg = result.svg.replace("</svg>", `${overlay}</svg>`);
    writeFileSync(path.join(OUT, `page-${spec.page_number}-debug.png`), svgToPng(dbg, { width: 1000 }));
  }
}

// One page at desktop size and phone width.
const showcase = PAGES[2];
const showcaseResult = renderPage(showcase, BOOK);
writeFileSync(path.join(OUT, `page-${showcase.page_number}-desktop.png`), svgToPng(showcaseResult.svg, { width: 1400 }));
writeFileSync(path.join(OUT, `page-${showcase.page_number}-phone-390.png`), svgToPng(showcaseResult.svg, { width: 390 }));

// All pages side by side (overview sheet).
const thumbs = PAGES.map((spec, i) => {
  const r = renderPage(spec, BOOK, { idPrefix: `ov${i}-` });
  const inner = r.svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  return `<g transform="translate(${i * 1040} 0)">${inner}</g>`;
}).join("");
const sheetW = PAGES.length * 1040 - 40;
writeFileSync(
  path.join(OUT, "overview.png"),
  svgToPng(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetW} 1500" width="${sheetW}" height="1500"><rect width="${sheetW}" height="1500" fill="#ddd"/>${thumbs}</svg>`, { width: 2400 }),
);
console.log(`done: ${PAGES.length} pages, ${failures} with errors, out=${OUT}`);
