/**
 * Deterministic structural metrics for stored manga page specs.
 *
 *   npx tsx scripts/structural-metrics.ts --run <dir>      # <dir>/judge/page-NN.json + <dir>/understanding.json
 *   npx tsx scripts/structural-metrics.ts --fixtures       # test/fixtures/run8 (the 46 run-8 pages)
 *   ... [--out metrics.json]
 *
 * No model call. Each page is rendered with the public API of this package
 * (`renderPageDetailed`); the metrics read the compiled geometry (panels, figure
 * placements, balloon boxes). The same input always gives the same output.
 * These numbers do not replace the judge panel. They are cheap checks to run
 * before one, and to show a regression in geometry.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderPageDetailed, type BookRefs, type Box, type Point } from "../src/index.js";

export const METRICS_SCHEMA = "bookreel-structural-metrics.v1";

/** Text kinds drawn as balloons. Narration and caption are boxes; sfx is lettering. */
const BALLOON_KINDS = new Set(["speech", "thought", "shout", "whisper"]);

export interface PageMetrics {
  page: number;
  panel_count: number;
  words_total: number;
  words_per_panel: number[];
  words_max_panel: number;
  balloon_count: number;
  caption_count: number;
  sfx_count: number;
  words_per_balloon_max: number;
  words_per_balloon_mean: number;
  /** Balloons or boxes (not sfx) that cover a figure's head circle. */
  text_over_head: number;
  /** Pairs of lettering boxes on the page that overlap (area above 1 px squared). */
  text_overlaps: number;
  /** Texts the renderer could not fit in their panel. */
  text_overflow: number;
  /** Panels with no figure and no known location. */
  panels_without_figure_or_environment: number;
  /** Panels with no figure (an environment may still be there). */
  panels_without_figure: number;
  /** Figures (head in frame) whose head centre lies outside their panel polygon. */
  figures_head_outside_panel: number;
  /** Figures whose body box centre lies outside their panel polygon. */
  figures_body_outside_panel: number;
  /** Panels whose `order` disagrees with the geometric reading order. */
  panel_order_breaks: number;
  /** Consecutive balloons in a panel that read in the wrong order. */
  balloon_order_breaks: number;
  errors: number;
  warnings: number;
}

export interface MetricsInput {
  page_number?: number;
  spec: unknown;
  planned?: unknown;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Does the circle touch the box? */
function circleHitsBox(c: Point, r: number, b: Box): boolean {
  const dx = c.x - Math.max(b.x, Math.min(c.x, b.x + b.w));
  const dy = c.y - Math.max(b.y, Math.min(c.y, b.y + b.h));
  return dx * dx + dy * dy < r * r;
}

/** Point in a convex polygon of either winding. */
function insidePolygon(p: Point, poly: readonly Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Does `later` read after `earlier` (left to right, top to bottom, same band by x)? */
function readsAfter(earlier: Box, later: Box): boolean {
  if (later.y < earlier.y - 6) return false;
  const overlap = Math.min(earlier.y + earlier.h, later.y + later.h) - Math.max(earlier.y, later.y);
  if (overlap > Math.min(earlier.h, later.h) * 0.3) return later.x + later.w / 2 >= earlier.x + earlier.w / 2;
  return true;
}

export function pageMetrics(input: MetricsInput, book: BookRefs, options: { previousPageHook?: boolean } = {}): PageMetrics {
  const { result, details } = renderPageDetailed(input.spec, book, {
    ...(input.planned ? { planned: input.planned as never } : {}),
    ...(options.previousPageHook ? { previousPageHook: true } : {}),
  });
  const spec = (input.spec ?? {}) as { page_number?: number; layout?: { rtl?: boolean }; panels?: { id?: string; location?: string; figures?: unknown[] }[] };
  const rtl = spec.layout?.rtl === true;
  const locations = new Set(book.locations.map((l) => l.id));
  const specPanels = Array.isArray(spec.panels) ? spec.panels : [];

  // words (lettered text without sfx), per panel and per balloon
  const wordsPerPanel = result.panels.map(() => 0);
  const balloonWords: number[] = [];
  let captions = 0;
  let sfx = 0;
  const panelIndex = new Map(result.panels.map((p, i) => [p.id, i]));
  for (const t of result.texts) {
    const words = t.text.trim().split(/\s+/).filter(Boolean).length;
    if (t.kind === "sfx") {
      sfx += 1;
      continue;
    }
    const pi = panelIndex.get(t.panel);
    if (pi !== undefined) wordsPerPanel[pi] += words;
    if (BALLOON_KINDS.has(t.kind)) balloonWords.push(words);
    else captions += 1;
  }

  // geometry: every placed lettering box on the page, with its panel and kind
  const boxes: { box: Box; panel: number; kind: string; index: number; label: boolean }[] = [];
  details.forEach((d, pi) => {
    for (const pl of d.placed) boxes.push({ box: pl.box, panel: pi, kind: pl.kind, index: pl.index, label: pl.label === true });
  });

  let overHead = 0;
  let overlaps = 0;
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    if (a.kind !== "sfx" && !a.label) {
      for (const f of details[a.panel]?.figures ?? []) {
        if (!f.headCropped && circleHitsBox(f.head, f.headRadius, a.box)) overHead += 1;
      }
    }
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlapArea(a.box, boxes[j].box) > 1) overlaps += 1;
    }
  }
  const overflow = details.reduce((s, d) => s + d.overflow.filter((x) => x >= 0).length, 0);

  // panels and figures
  let noFigureNoEnv = 0;
  let noFigure = 0;
  let headOutside = 0;
  let bodyOutside = 0;
  details.forEach((d, pi) => {
    const sp = specPanels[pi];
    const figureCount = d.figures.length;
    const hasEnv = typeof sp?.location === "string" && locations.has(sp.location);
    if (figureCount === 0) noFigure += 1;
    if (figureCount === 0 && !hasEnv) noFigureNoEnv += 1;
    const rp = result.panels[pi];
    if (!rp) return;
    for (const f of d.figures) {
      if (!f.headCropped && !insidePolygon(f.head, rp.polygon)) headOutside += 1;
      if (!insidePolygon({ x: f.body.x + f.body.w / 2, y: f.body.y + f.body.h / 2 }, rp.polygon)) bodyOutside += 1;
    }
  });

  // reading order
  let panelBreaks = 0;
  for (let i = 1; i < result.panels.length; i++) {
    const prev = [...result.panels].sort((a, b) => a.order - b.order)[i - 1];
    const cur = [...result.panels].sort((a, b) => a.order - b.order)[i];
    const ok = rtl ? readsAfter({ ...prev.bbox, x: -prev.bbox.x - prev.bbox.w }, { ...cur.bbox, x: -cur.bbox.x - cur.bbox.w }) : readsAfter(prev.bbox, cur.bbox);
    if (!ok) panelBreaks += 1;
  }
  let balloonBreaks = 0;
  details.forEach((d, pi) => {
    const ordered = boxes.filter((b) => b.panel === pi && b.kind !== "sfx" && !b.label).sort((a, b) => a.index - b.index);
    for (let i = 1; i < ordered.length; i++) {
      const a = rtl ? { ...ordered[i - 1].box, x: -ordered[i - 1].box.x - ordered[i - 1].box.w } : ordered[i - 1].box;
      const b = rtl ? { ...ordered[i].box, x: -ordered[i].box.x - ordered[i].box.w } : ordered[i].box;
      if (!readsAfter(a, b)) balloonBreaks += 1;
    }
  });

  const pageNo = typeof spec.page_number === "number" ? spec.page_number : (input.page_number ?? 0);
  return {
    page: pageNo,
    panel_count: result.metrics.panel_count,
    words_total: wordsPerPanel.reduce((a, b) => a + b, 0),
    words_per_panel: wordsPerPanel,
    words_max_panel: wordsPerPanel.length ? Math.max(...wordsPerPanel) : 0,
    balloon_count: balloonWords.length,
    caption_count: captions,
    sfx_count: sfx,
    words_per_balloon_max: balloonWords.length ? Math.max(...balloonWords) : 0,
    words_per_balloon_mean: balloonWords.length ? r2(balloonWords.reduce((a, b) => a + b, 0) / balloonWords.length) : 0,
    text_over_head: overHead,
    text_overlaps: overlaps,
    text_overflow: overflow,
    panels_without_figure_or_environment: noFigureNoEnv,
    panels_without_figure: noFigure,
    figures_head_outside_panel: headOutside,
    figures_body_outside_panel: bodyOutside,
    panel_order_breaks: panelBreaks,
    balloon_order_breaks: balloonBreaks,
    errors: result.issues.filter((i) => i.severity === "error").length,
    warnings: result.issues.filter((i) => i.severity === "warning").length,
  };
}

export interface MetricsReport {
  schema: string;
  pages: PageMetrics[];
  totals: Record<string, number>;
}

const SUMMED: (keyof PageMetrics)[] = [
  "panel_count", "words_total", "balloon_count", "caption_count", "sfx_count", "text_over_head", "text_overlaps", "text_overflow",
  "panels_without_figure_or_environment", "panels_without_figure", "figures_head_outside_panel", "figures_body_outside_panel",
  "panel_order_breaks", "balloon_order_breaks", "errors", "warnings",
];

export function metricsReport(pages: MetricsInput[], book: BookRefs): MetricsReport {
  const rows: PageMetrics[] = [];
  const hooks = new Map<number, boolean>();
  for (const p of pages) {
    const s = p.spec as { page_number?: number; page_turn_hook?: boolean } | undefined;
    if (s?.page_number) hooks.set(s.page_number, s.page_turn_hook === true);
  }
  for (const p of pages) {
    const n = (p.spec as { page_number?: number } | undefined)?.page_number ?? p.page_number ?? 0;
    rows.push(pageMetrics(p, book, { previousPageHook: hooks.get(n - 1) === true }));
  }
  const totals: Record<string, number> = { pages: rows.length };
  for (const k of SUMMED) totals[k] = rows.reduce((s, r) => s + (r[k] as number), 0);
  totals.words_max_balloon = rows.reduce((m, r) => Math.max(m, r.words_per_balloon_max), 0);
  totals.pages_with_overlap_or_head_cover = rows.filter((r) => r.text_overlaps + r.text_over_head > 0).length;
  return { schema: METRICS_SCHEMA, pages: rows, totals };
}

/** Load pages and book refs from an exported run directory (`<dir>/judge/page-NN.json`, `<dir>/understanding.json`). */
export function loadRun(dir: string): { pages: MetricsInput[]; book: BookRefs } {
  const raw = JSON.parse(readFileSync(path.join(dir, "understanding.json"), "utf8")) as Record<string, unknown>;
  const u = (raw.understanding ?? raw) as { cast: BookRefs["cast"]; locations: BookRefs["locations"] };
  const judge = path.join(dir, "judge");
  const files = readdirSync(judge)
    .filter((f) => /^page-\d+\.json$/.test(f))
    .sort((a, b) => Number(/\d+/.exec(a)?.[0]) - Number(/\d+/.exec(b)?.[0]));
  const pages: MetricsInput[] = [];
  for (const f of files) {
    const rec = JSON.parse(readFileSync(path.join(judge, f), "utf8")) as { spec?: unknown; planned?: unknown; page_number?: number };
    if (!rec.spec) continue; // a failed page has no spec
    pages.push({ page_number: rec.page_number ?? 0, spec: rec.spec, ...(rec.planned ? { planned: rec.planned } : {}) });
  }
  return { pages, book: { cast: u.cast, locations: u.locations } };
}

/** Load the run-8 fixtures: `pages.json` (list of specs) and `book.json` (cast and locations). */
export function loadFixtures(dir: string): { pages: MetricsInput[]; book: BookRefs } {
  const specs = JSON.parse(readFileSync(path.join(dir, "pages.json"), "utf8")) as unknown[];
  const book = JSON.parse(readFileSync(path.join(dir, "book.json"), "utf8")) as BookRefs;
  return { pages: specs.map((spec) => ({ spec })), book };
}

export const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures", "run8");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = arg("--run");
  const loaded = run ? loadRun(run) : loadFixtures(FIXTURE_DIR);
  if (!run && !process.argv.includes("--fixtures") && !existsSync(FIXTURE_DIR)) throw new Error("use --run <dir> or --fixtures");
  const report = metricsReport(loaded.pages, loaded.book);
  const out = arg("--out");
  const json = `${JSON.stringify(report, null, 1)}\n`;
  if (out) writeFileSync(out, json);
  else process.stdout.write(json);
  const t = report.totals;
  console.error(
    `${t.pages} pages, ${t.panel_count} panels, ${t.words_total} words, ${t.balloon_count} balloons; ` +
      `text over head ${t.text_over_head}, text overlaps ${t.text_overlaps}, overflow ${t.text_overflow}, ` +
      `panels w/o figure or environment ${t.panels_without_figure_or_environment}, figures outside panel ${t.figures_head_outside_panel}, ` +
      `order breaks ${t.panel_order_breaks + t.balloon_order_breaks}`,
  );
}
