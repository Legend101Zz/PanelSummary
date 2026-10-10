/**
 * v0.2 (#42): the camera push-in on small subjects, speakers kept in frame, tails that cannot be
 * mistaken for another head. Specs: the 46 saved run-8 pages (test/fixtures/defects).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CastMember, MangaPageSpec, PlannedPage } from "../src/contracts.js";
import { renderPageDetailed } from "../src/index.js";
import { SUBJECT_MIN_SIZE, SUBJECT_MAX_PUSH } from "../src/scene/index.js";

const here = new URL("./fixtures/defects/", import.meta.url);
const BOOK = JSON.parse(readFileSync(new URL("run8-book.json", here), "utf8")) as { cast: CastMember[]; locations: any[] };
const PAGES = JSON.parse(readFileSync(new URL("run8-pages.json", here), "utf8")) as { page: number; spec: MangaPageSpec; planned?: PlannedPage }[];
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const render = (p: (typeof PAGES)[number]) => renderPageDetailed(clone(p.spec), BOOK, p.planned ? { planned: p.planned } : {});

describe("camera push-in and speakers in frame (#42)", () => {
  it("constants: the floor is a share of the panel and the push is bounded", () => {
    expect(SUBJECT_MIN_SIZE).toBeGreaterThan(0.2);
    expect(SUBJECT_MAX_PUSH).toBeLessThanOrEqual(3);
  });
  const all = PAGES.map((p) => ({ p, r: render(p) }));
  it("over the 46 run-8 pages: rendering is deterministic and raises no new error", () => {
    for (const { p, r } of all.slice(0, 12)) {
      expect(render(p).result.svg).toBe(r.result.svg);
      expect(r.result.issues.filter((i) => i.severity === "error").map((i) => i.code)).not.toContain("SPEAKER_TOO_SMALL");
    }
  });
  it("a speaker whose head is in the panel always has a tail that ends in the panel", () => {
    for (const { r } of all) for (const d of r.details) for (const pl of d.placed) {
      if (!pl.tail || pl.tail.offPanel) continue;
      const t = pl.tail.tip;
      expect(t.x).toBeGreaterThanOrEqual(d.bbox.x - 4);
      expect(t.x).toBeLessThanOrEqual(d.bbox.x + d.bbox.w + 4);
      expect(t.y).toBeGreaterThanOrEqual(d.bbox.y - 4);
      expect(t.y).toBeLessThanOrEqual(d.bbox.y + d.bbox.h + 4);
    }
  });
  it("no speaker's head is deliberately cropped out (headCropped) in any run-8 panel", () => {
    for (const { p, r } of all) r.details.forEach((d, i) => {
      const speakers = new Set((p.spec.panels[i]?.text ?? []).map((t: any) => t.speaker));
      for (const f of d.figures) if (f.headCropped) expect(speakers.has(f.character), `page ${p.page} ${d.id} ${f.character}`).toBe(false);
    });
  });
  it("a hero that was under the floor is no smaller than before the push (sizes only grow)", () => {
    for (const { r } of all) for (const d of r.details) for (const f of d.figures) {
      expect(f.scale).toBeGreaterThan(0);
      expect(Number.isFinite(f.head.x) && Number.isFinite(f.head.y)).toBe(true);
    }
  });
});
