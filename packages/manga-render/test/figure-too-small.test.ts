/**
 * v0.3 (Gate 2a, docs/v0.3/D2-push.md): FIGURE_TOO_SMALL. A planned figure whose body is under 15% of the
 * panel height, in a shot that is not establishing, extreme close or insert, gets a warning.
 * Specs: the 44 judged pages of test/fixtures/push-bounds-pages.json (tuning books only).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CastMember, MangaPageSpec, PlannedPage } from "../src/contracts.js";
import { catalog, renderPageDetailed } from "../src/index.js";
import { FIGURE_MIN_HEIGHT_SHARE } from "../src/scene/compose.js";

interface Fx {
  run: string;
  page: number;
  previousPageHook: boolean;
  spec: MangaPageSpec;
  planned?: PlannedPage;
  cast: CastMember[];
  locations: any[];
}
const FX = JSON.parse(readFileSync(new URL("./fixtures/push-bounds-pages.json", import.meta.url), "utf8")) as Fx[];
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const render = (f: Fx) =>
  renderPageDetailed(clone(f.spec), { cast: f.cast, locations: f.locations }, { ...(f.planned ? { planned: f.planned } : {}), previousPageHook: f.previousPageHook });
const ALL = FX.map((f) => ({ f, r: render(f) }));
const NAMED = /^"([^"]+)"/;

/** Every (page, panel, figure) the rule applies to, measured from the drawn geometry. */
const small = ALL.flatMap(({ f, r }) =>
  r.details.flatMap((d, i) => {
    const panel = (f.spec.panels[i] ?? {}) as { id?: string; shot?: string };
    return d.figures
      .filter((fp) => !fp.headCropped && Math.min(fp.body.h, d.bbox.h) / d.bbox.h < FIGURE_MIN_HEIGHT_SHARE)
      .map((fp) => ({ f, r, panel: panel.id ?? `#${i}`, shot: panel.shot, id: fp.character, speakerSmall: fp.headRadius < 22 }));
  }),
);

describe("FIGURE_TOO_SMALL (v0.3, Gate 2a)", () => {
  it("is a documented warning code with a threshold of 15 percent", () => {
    expect(FIGURE_MIN_HEIGHT_SHARE).toBe(0.15);
    expect(Object.keys(catalog().warnings)).toContain("FIGURE_TOO_SMALL");
  });

  it("fires on the fixture pages (there are speck figures in the tuning books)", () => {
    const issues = ALL.flatMap(({ r }) => r.result.issues.filter((i) => i.code === "FIGURE_TOO_SMALL"));
    expect(issues.length).toBeGreaterThanOrEqual(5);
    for (const i of issues) {
      expect(i.severity).toBe("warning");
      expect(i.message).toMatch(/closer shot/);
      expect(i.message).toMatch(/fewer figures/);
    }
  });

  it("names a figure exactly when its body is under 15 percent of the panel height (any shot but establishing, extreme close, insert)", () => {
    for (const { f, r } of ALL) {
      r.details.forEach((d, i) => {
        const panel = (f.spec.panels[i] ?? {}) as { id?: string; shot?: string };
        const path = `panel ${panel.id ?? `#${i}`}`;
        const named = new Set(r.result.issues.filter((x) => x.code === "FIGURE_TOO_SMALL" && x.path === path).map((x) => NAMED.exec(x.message)?.[1]));
        const exempt = panel.shot === "establishing" || panel.shot === "extreme_close" || panel.shot === "insert";
        for (const fp of d.figures) {
          const under = !fp.headCropped && Math.min(fp.body.h, d.bbox.h) / d.bbox.h < FIGURE_MIN_HEIGHT_SHARE;
          if (exempt) expect(named.has(fp.character), `${f.run} p${f.page} ${path} ${fp.character} (${panel.shot})`).toBe(false);
          // A figure that HERO_TOO_SMALL or SPEAKER_TOO_SMALL already names is not named a second time.
          else if (!under) expect(named.has(fp.character), `${f.run} p${f.page} ${path} ${fp.character} is big enough`).toBe(false);
          else {
            const other = r.result.issues.some((x) => (x.code === "HERO_TOO_SMALL" || x.code === "SPEAKER_TOO_SMALL") && x.path === path && x.message.includes(`"${fp.character}"`));
            if (!other) expect(named.has(fp.character), `${f.run} p${f.page} ${path} ${fp.character} is a speck`).toBe(true);
          }
        }
        if (!exempt) {
          for (const n of named) {
            const fp = d.figures.find((g) => g.character === n);
            expect(fp && Math.min(fp.body.h, d.bbox.h) / d.bbox.h).toBeLessThan(FIGURE_MIN_HEIGHT_SHARE);
          }
        }
      });
    }
  });

  it("never flags a figure in an establishing shot (small on purpose)", () => {
    const est = small.filter((s) => s.shot === "establishing");
    expect(est.length).toBeGreaterThan(0); // the fixture has specks in establishing shots
    for (const s of est) {
      const path = `panel ${s.panel}`;
      expect(s.r.result.issues.some((i) => i.code === "FIGURE_TOO_SMALL" && i.path === path)).toBe(false);
    }
  });

  it("does not change the drawing: two renders give the same SVG", () => {
    const f = ALL.find(({ r }) => r.result.issues.some((i) => i.code === "FIGURE_TOO_SMALL"))!.f;
    expect(render(f).result.svg).toBe(render(f).result.svg);
  });
});
