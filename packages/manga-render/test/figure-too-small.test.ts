/**
 * v0.3 (Gate 2a, docs/v0.3/D2-push.md): FIGURE_TOO_SMALL. A planned figure whose body is under 15% of the
 * panel height, in a shot that is not establishing, extreme close or insert, gets a warning.
 * Specs: the 44 judged pages of test/fixtures/push-bounds-pages.json (tuning books only).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CastMember, MangaPageSpec, PlannedPage } from "../src/contracts.js";
import { catalog, renderPageDetailed } from "../src/index.js";
import { FIGURE_MIN_HEIGHT_SHARE, figureSizeIsChecked } from "../src/scene/compose.js";

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
            else expect(named.has(fp.character), `${f.run} p${f.page} ${path} ${fp.character} is already named by another code`).toBe(false);
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

  it("never names a figure twice: a speck that HERO_TOO_SMALL or SPEAKER_TOO_SMALL names is not named again (real pages and re-shot variants)", () => {
    const seen = { HERO_TOO_SMALL: 0, SPEAKER_TOO_SMALL: 0 };
    const check = (f: Fx, r: ReturnType<typeof render>, label: string) => {
      r.details.forEach((d, i) => {
        const panel = (f.spec.panels[i] ?? {}) as { id?: string; shot?: string };
        const path = `panel ${panel.id ?? `#${i}`}`;
        if (panel.shot === "establishing" || panel.shot === "extreme_close" || panel.shot === "insert") return;
        const ftsNamed = new Set(r.result.issues.filter((x) => x.code === "FIGURE_TOO_SMALL" && x.path === path).map((x) => NAMED.exec(x.message)?.[1]));
        for (const fp of d.figures) {
          if (fp.headCropped || Math.min(fp.body.h, d.bbox.h) / d.bbox.h >= FIGURE_MIN_HEIGHT_SHARE) continue;
          for (const code of ["HERO_TOO_SMALL", "SPEAKER_TOO_SMALL"] as const) {
            if (r.result.issues.some((x) => x.code === code && x.path === path && x.message.includes(`"${fp.character}"`))) {
              seen[code]++;
              expect(ftsNamed.has(fp.character), `${label} ${path} ${fp.character} already named by ${code}`).toBe(false);
            }
          }
        }
      });
    };
    for (const { f, r } of ALL) check(f, r, `${f.run} p${f.page}`);
    // Variants: the same pages with every non-exempt panel re-shot, so more heroes and speakers end up as specks.
    const pages = ALL.map(({ f }) => f);
    for (const shot of ["wide", "full", "medium"]) {
      for (const depth of ["back", "mid"]) {
        for (const f of pages) {
          const g = clone(f);
          g.spec.panels.forEach((p: any) => {
            if (p.shot === "establishing" || p.shot === "extreme_close" || p.shot === "insert") return;
            p.shot = shot;
            for (const fg of p.figures ?? []) if (!fg.on) fg.depth = depth;
          });
          check(g, render(g), `${f.run} p${f.page} as ${shot}/${depth}`);
        }
      }
    }
    expect(seen.HERO_TOO_SMALL).toBeGreaterThanOrEqual(1);
    expect(seen.SPEAKER_TOO_SMALL).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it("never flags a figure in an establishing shot (small on purpose)", () => {
    const est = small.filter((s) => s.shot === "establishing");
    expect(est.length).toBeGreaterThan(0); // the fixture has specks in establishing shots
    for (const s of est) {
      const path = `panel ${s.panel}`;
      expect(s.r.result.issues.some((i) => i.code === "FIGURE_TOO_SMALL" && i.path === path)).toBe(false);
    }
  });

  it("the exempt shots are exactly establishing, extreme_close and insert", () => {
    // In these shots the renderer never draws a figure under 15% (probe: 217 figures, 0 under), so the guard is pinned here directly.
    for (const shot of ["establishing", "extreme_close", "insert"]) expect(figureSizeIsChecked(shot), shot).toBe(false);
    for (const shot of ["wide", "full", "medium", "close"]) expect(figureSizeIsChecked(shot), shot).toBe(true);
  });

  it("never flags a figure in an extreme close or insert shot, even a small one (synthetic: the speck panels with the shot changed)", () => {
    const speckPages = ALL.filter(({ r }) => r.result.issues.some((i) => i.code === "FIGURE_TOO_SMALL")).map(({ f }) => f);
    for (const shot of ["extreme_close", "insert"]) {
      let panelsChanged = 0;
      for (const f of speckPages) {
        const g = clone(f);
        const base = ALL.find((a) => a.f === f)!.r;
        const idx = new Set(base.result.issues.filter((i) => i.code === "FIGURE_TOO_SMALL").map((i) => i.path));
        g.spec.panels.forEach((p: any, i: number) => {
          if (idx.has(`panel ${p.id ?? `#${i}`}`)) { p.shot = shot; panelsChanged++; }
        });
        const out = render(g);
        const bad = out.result.issues.filter((i) => i.code === "FIGURE_TOO_SMALL" && idx.has(i.path ?? ""));
        expect(bad.map((b) => b.path), `${f.run} p${f.page} as ${shot}`).toEqual([]);
      }
      expect(panelsChanged).toBeGreaterThanOrEqual(5);
    }
  }, 120_000);

  it("does not change the drawing: two renders give the same SVG", () => {
    const f = ALL.find(({ r }) => r.result.issues.some((i) => i.code === "FIGURE_TOO_SMALL"))!.f;
    expect(render(f).result.svg).toBe(render(f).result.svg);
  });
});
