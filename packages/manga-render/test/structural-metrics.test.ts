import { describe, expect, it } from "vitest";
import { FIXTURE_DIR, loadFixtures, metricsReport, METRICS_SCHEMA, pageMetrics, type PageMetrics } from "../scripts/structural-metrics.js";

/**
 * Structural metrics over the 46 stored pages of acceptance run 8.
 * The facts below come from the stored specs, not from renderer geometry,
 * so a renderer change does not break them. No exact geometry snapshot.
 */
const { pages, book } = loadFixtures(FIXTURE_DIR);
const specs = pages.map((p) => p.spec as { page_number: number; panels: { text: { kind: string; text: string }[]; figures: unknown[] }[] });

const BALLOON = new Set(["speech", "thought", "shout", "whisper"]);
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

describe("structural metrics: run-8 fixtures", () => {
  const report = metricsReport(pages, book);

  it("has the 46 judged pages", () => {
    expect(pages).toHaveLength(46);
    expect(report.schema).toBe(METRICS_SCHEMA);
    expect(report.pages.map((p) => p.page)).toEqual(specs.map((s) => s.page_number));
  });

  it("is deterministic: the same input twice gives identical output", { timeout: 120_000 }, () => {
    const again = metricsReport(pages, book);
    expect(JSON.stringify(again)).toBe(JSON.stringify(report));
    const one = pageMetrics(pages[4], book);
    expect(pageMetrics(pages[4], book)).toEqual(one);
  });

  it("matches counts that come straight from the stored specs", () => {
    specs.forEach((s, i) => {
      const m = report.pages[i];
      expect(m.panel_count).toBe(s.panels.length);
      expect(m.words_per_panel).toHaveLength(s.panels.length);
      const lettered = s.panels.flatMap((p) => p.text).filter((t) => t.kind !== "sfx");
      expect(m.words_total).toBe(lettered.reduce((a, t) => a + words(t.text), 0));
      expect(m.balloon_count).toBe(lettered.filter((t) => BALLOON.has(t.kind)).length);
      expect(m.caption_count).toBe(lettered.filter((t) => !BALLOON.has(t.kind)).length);
    });
    expect(report.totals.panel_count).toBe(specs.reduce((a, s) => a + s.panels.length, 0));
    expect(report.pages[4].panel_count).toBe(5); // run-8 page 5 has five panels
  });

  it("keeps every value in a valid range", () => {
    const counters: (keyof PageMetrics)[] = [
      "text_over_head", "text_overlaps", "text_overflow", "panels_without_figure_or_environment", "panels_without_figure",
      "figures_head_outside_panel", "figures_body_outside_panel", "panel_order_breaks", "balloon_order_breaks", "errors", "warnings",
      "balloon_count", "caption_count", "sfx_count", "words_total", "words_max_panel", "words_per_balloon_max",
    ];
    for (const m of report.pages) {
      expect(m.panel_count).toBeGreaterThanOrEqual(1);
      expect(m.panel_count).toBeLessThanOrEqual(7);
      for (const k of counters) {
        const v = m[k] as number;
        expect(Number.isInteger(v), `${k} on page ${m.page}`).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      expect(m.panels_without_figure_or_environment).toBeLessThanOrEqual(m.panels_without_figure);
      expect(m.panels_without_figure).toBeLessThanOrEqual(m.panel_count);
      expect(m.words_max_panel).toBeLessThanOrEqual(m.words_total);
      expect(m.words_per_balloon_mean).toBeLessThanOrEqual(m.words_per_balloon_max);
      expect(m.text_overflow).toBeLessThanOrEqual(m.balloon_count + m.caption_count + m.sfx_count);
    }
  });

  it("counts a panel with no figure and no known location", () => {
    const spec = structuredClone(specs[4]) as unknown as { panels: { figures: unknown[]; location: string }[] };
    spec.panels[0].figures = [];
    spec.panels[0].location = "l_unknown";
    const m = pageMetrics({ spec }, book);
    expect(m.panels_without_figure_or_environment).toBeGreaterThanOrEqual(1);
  });
});
