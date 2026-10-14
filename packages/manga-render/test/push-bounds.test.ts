/**
 * v0.3 (D2, #90): a camera push keeps every planned figure and every speaker in the panel (D31).
 * Specs: 44 judged pages of the tuning-book runs (test/fixtures/push-bounds-pages.json: the page spec,
 * the cast and places it needs, and `headInsideNoPush`, the share of each head box inside its panel
 * measured with both camera pushes switched off on renderer 0.6.0). No Cheese book, no sealed page.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CastMember, MangaPageSpec, PlannedPage } from "../src/contracts.js";
import { renderPageDetailed } from "../src/index.js";
import { HEAD_PARTLY_CLIPPED_SHARE, circleShareInside } from "../src/scene/compose.js";

interface Fx {
  run: string;
  page: number;
  previousPageHook: boolean;
  spec: MangaPageSpec;
  planned?: PlannedPage;
  cast: CastMember[];
  locations: any[];
  headInsideNoPush: Record<string, Record<string, number>>;
}
const FX = JSON.parse(readFileSync(new URL("./fixtures/push-bounds-pages.json", import.meta.url), "utf8")) as Fx[];
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const render = (f: Fx) =>
  renderPageDetailed(clone(f.spec), { cast: f.cast, locations: f.locations }, { ...(f.planned ? { planned: f.planned } : {}), previousPageHook: f.previousPageHook });
const find = (run: string, page: number) => {
  const f = FX.find((x) => x.run === run && x.page === page);
  expect(f, `${run} page ${page} is in the fixture`).toBeDefined();
  return f as Fx;
};
const RENDERED = new Map<Fx, ReturnType<typeof render>>();
const rendered = (f: Fx) => {
  let r = RENDERED.get(f);
  if (!r) {
    r = render(f);
    RENDERED.set(f, r);
  }
  return r;
};
const inter = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};
/** The share of the head box inside the panel (the measure of the diagnosis). */
const headBoxInside = (f: { head: { x: number; y: number }; headRadius: number }, bbox: { x: number; y: number; w: number; h: number }) => {
  const r = Math.max(0.5, f.headRadius);
  return inter({ x: f.head.x - r, y: f.head.y - r, w: 2 * r, h: 2 * r }, bbox) / (4 * r * r);
};

/** The six worked examples of the diagnosis: [run, page, panel ids]. */
const EXAMPLES: [string, number, string[]][] = [
  ["final-journey-2", 7, ["p2", "p3"]],
  ["final-journey-2", 1, ["p2"]],
  ["live/run3", 23, ["p4"]],
  ["live/run6", 7, ["p1"]],
  ["live/run6", 9, ["p3", "p5"]],
];

describe("worked examples: every planned figure keeps its head in the panel (#90)", () => {
  for (const [run, page, panels] of EXAMPLES) {
    for (const pid of panels) {
      it(`${run} page ${page} ${pid}`, () => {
        const f = find(run, page);
        const r = rendered(f);
        const d = r.details.find((x) => x.id === pid);
        expect(d).toBeDefined();
        const specPanel = f.spec.panels.find((p: any) => p.id === pid) as any;
        for (const pf of specPanel.figures) {
          const fp = d!.figures.find((x) => x.character === pf.character);
          expect(fp, `${pf.character} is drawn`).toBeDefined();
          expect(fp!.headCropped, `${pf.character} headCropped`).toBeFalsy();
          expect(circleShareInside(fp!.head, fp!.headRadius, d!.bbox), `${pf.character} head share`).toBeGreaterThanOrEqual(0.95);
          const inside = inter(fp!.body, d!.bbox) / Math.max(1, fp!.body.w * fp!.body.h);
          // v0.3 D1a (#81): a horse is no longer a "small creature" for the camera, so in a close shot its head fills the
          // panel and its body is mostly out of frame (10 percent in two examples). The head check above is the guard.
          expect(inside, `${pf.character} body share`).toBeGreaterThanOrEqual(0.08);
        }
        for (const pl of d!.placed) if (pl.tail) expect(pl.tail.offPanel, "a tail is not off the panel").toBeFalsy();
        const codes = r.result.issues.filter((i) => i.path === `panel ${pid}` || i.path.startsWith(`panel ${pid} `)).map((i) => i.code);
        expect(codes).not.toContain("FIGURE_CLIPPED");
        expect(codes).not.toContain("FIGURE_HEAD_CLIPPED");
      });
    }
  }
});

describe("a push never removes a head that was inside (property over the fixture pages)", () => {
  it("every head that was 90 percent inside with both pushes off still is", { timeout: 120_000 }, () => {
    let checked = 0;
    for (const f of FX) {
      const r = rendered(f);
      for (const d of r.details) {
        const ref = f.headInsideNoPush[d.id] ?? {};
        for (const fp of d.figures) {
          const before = ref[fp.character];
          if (before === undefined || before < 0.9) continue;
          checked += 1;
          expect(headBoxInside(fp, d.bbox), `${f.run} page ${f.page} ${d.id} ${fp.character}`).toBeGreaterThanOrEqual(0.9);
          expect(fp.headCropped, `${f.run} page ${f.page} ${d.id} ${fp.character} headCropped`).toBeFalsy();
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
  it("is the fixture the right size and does it cover the pushed pages", () => {
    expect(FX.length).toBeGreaterThanOrEqual(40);
    expect(new Set(FX.map((f) => f.run)).size).toBeGreaterThanOrEqual(5);
  });
});

describe("two speakers far apart (the empty window): the camera does not push a head out", () => {
  const f = find("final-journey-2", 1);
  const SLOTS = ["left", "center_left", "center", "center_right", "right"] as const;
  it("for every pair of slots of the two speakers, both heads stay in the panel", { timeout: 60_000 }, () => {
    for (const a of SLOTS) {
      for (const b of SLOTS) {
        if (a === b) continue;
        const g = clone(f);
        const panel = g.spec.panels.find((p: any) => p.id === "p2") as any;
        panel.figures[0].slot = a;
        panel.figures[1].slot = b;
        const r = render(g);
        const d = r.details.find((x) => x.id === "p2")!;
        for (const fp of d.figures) {
          expect(fp.headCropped, `${a}/${b} ${fp.character}`).toBeFalsy();
          expect(circleShareInside(fp.head, fp.headRadius, d.bbox), `${a}/${b} ${fp.character}`).toBeGreaterThanOrEqual(0.9);
        }
      }
    }
  });
});

describe("FIGURE_HEAD_PARTLY_CLIPPED (a warning, D31)", () => {
  it("circleShareInside measures the head circle", () => {
    const box = { x: 0, y: 0, w: 100, h: 100 };
    expect(circleShareInside({ x: 50, y: 50 }, 10, box)).toBeCloseTo(1, 3);
    expect(circleShareInside({ x: 0, y: 50 }, 10, box)).toBeCloseTo(0.5, 2);
    expect(circleShareInside({ x: -30, y: 50 }, 10, box)).toBe(0);
    const third = circleShareInside({ x: 4, y: 50 }, 10, box); // a bit more than half inside
    expect(third).toBeGreaterThan(0.5);
    expect(circleShareInside({ x: -6, y: 50 }, 10, box)).toBeLessThan(0.3); // about 30 percent inside
    expect(circleShareInside({ x: -6, y: 50 }, 10, box)).toBeGreaterThan(0.1);
  });
  it("the threshold is 60 percent", () => {
    expect(HEAD_PARTLY_CLIPPED_SHARE).toBe(0.6);
  });
  it("it is a warning, and it appears exactly when a planned head is under 60 percent in (and not out)", { timeout: 120_000 }, () => {
    let seen = 0;
    for (const f of FX) {
      const r = rendered(f);
      for (const d of r.details) {
        const specPanel = f.spec.panels.find((p: any) => p.id === d.id) as any;
        const codes = r.result.issues.filter((i) => i.path === `panel ${d.id}`);
        const partly = codes.filter((i) => i.code === "FIGURE_HEAD_PARTLY_CLIPPED");
        for (const i of partly) expect(i.severity).toBe("warning");
        let expected = 0;
        for (const fp of d.figures) {
          if (specPanel?.shot === "extreme_close") continue;
          const share = circleShareInside(fp.head, fp.headRadius, d.bbox);
          const bodyIn = inter(fp.body, d.bbox) / Math.max(1, fp.body.w * fp.body.h);
          if (share > 0 && share < HEAD_PARTLY_CLIPPED_SHARE && bodyIn >= 0.02 && !fp.headCropped) expected += 1;
        }
        expect(partly.length, `${f.run} page ${f.page} ${d.id}`).toBe(expected);
        seen += partly.length;
      }
    }
    expect(seen).toBeGreaterThanOrEqual(1);
  });
  it("a wide panel with a figure at the edge is flagged, a figure fully inside is not (synthetic)", () => {
    const f = find("final-journey", 11);
    const d = rendered(f).details.find((x) => x.id === "p4")!;
    expect(rendered(f).result.issues.some((i) => i.code === "FIGURE_HEAD_PARTLY_CLIPPED" && i.path === "panel p4")).toBe(true);
    const fullyIn = rendered(find("final-journey-2", 1)).result.issues.filter((i) => i.code === "FIGURE_HEAD_PARTLY_CLIPPED");
    expect(fullyIn).toHaveLength(0);
    expect(d.figures.length).toBeGreaterThan(0);
  });
});

describe("determinism", () => {
  it("two renders of the same page give the same SVG", { timeout: 60_000 }, () => {
    for (const f of FX.slice(0, 10)) expect(render(f).result.svg).toBe(rendered(f).result.svg);
  });
});
