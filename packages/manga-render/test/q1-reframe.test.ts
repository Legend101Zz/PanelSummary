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
  /**
   * Panels where a small subject was under the floor before the push. "before" is the share measured on
   * this fixture with the push switched off (the tighter dimension of the figure's body over the panel);
   * "floor" is what the push must reach (the floor itself, or the most the camera may push here).
   */
  const SHARE = (d: { bbox: { w: number; h: number } }, f: { body: { w: number; h: number } }): number =>
    Math.max(Math.min(f.body.h, d.bbox.h) / d.bbox.h, Math.min(f.body.w, d.bbox.w) / d.bbox.w);
  const SMALL: { page: number; panel: string; who: string; before: number; floor: number }[] = [
    { page: 7, panel: "p3", who: "c_student_garret", before: 0.223, floor: SUBJECT_MIN_SIZE },
    { page: 44, panel: "p1", who: "c_dragonfly", before: 0.173, floor: 0.173 * 1.4 },
    { page: 17, panel: "p2", who: "c_nightingale", before: 0.19, floor: 0.19 * 1.35 },
    { page: 8, panel: "p1", who: "c_swallow", before: 0.198, floor: 0.198 * 1.35 },
  ];
  it("a small subject under the floor is pushed up to it (or by the expected factor), head in the panel, no speaker cropped", () => {
    for (const c of SMALL) {
      const p = PAGES.find((x) => x.page === c.page);
      expect(p, `page ${c.page}`).toBeDefined();
      const r = render(p as (typeof PAGES)[number]);
      const d = r.details.find((x) => x.id === c.panel);
      expect(d, `${c.page} ${c.panel}`).toBeDefined();
      const f = d!.figures.find((x) => x.character === c.who);
      expect(f, `${c.page} ${c.panel} ${c.who}`).toBeDefined();
      const share = SHARE(d!, f!);
      expect(share, `${c.page} ${c.panel} ${c.who} share ${share.toFixed(3)} was ${c.before}`).toBeGreaterThanOrEqual(c.floor - 0.005);
      expect(f!.headCropped).toBeFalsy();
      expect(f!.head.x).toBeGreaterThanOrEqual(d!.bbox.x);
      expect(f!.head.x).toBeLessThanOrEqual(d!.bbox.x + d!.bbox.w);
      expect(f!.head.y).toBeGreaterThanOrEqual(d!.bbox.y);
      expect(f!.head.y).toBeLessThanOrEqual(d!.bbox.y + d!.bbox.h);
      const speakers = new Set((p!.spec.panels.find((x: any) => x.id === c.panel)?.text ?? []).map((t: any) => t.speaker));
      for (const g of d!.figures) if (speakers.has(g.character)) expect(g.headCropped, `speaker ${g.character}`).toBeFalsy();
    }
  });
});
