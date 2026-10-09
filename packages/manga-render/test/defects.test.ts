/**
 * Renderer defects from acceptance run 8 (docs/launch/T2-renderer.md).
 * Each block states one defect as a structural assertion on compiled geometry
 * or SVG. The specs come from test/fixtures/defects/ (a compact copy of the
 * run-8 judged pages and their cast).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CastMember, CharacterLook, FigureSpec, MangaPageSpec, PanelSpec, PlannedPage, ValidationIssue } from "../src/contracts.js";
import { renderPage, renderPageDetailed, validatePage, type PanelDetail } from "../src/index.js";
import { Resvg } from "@resvg/resvg-js";
import { environments } from "../src/env/index.js";
import { ENVIRONMENTS } from "../src/contracts.js";
import { rig } from "../src/rig/index.js";

interface Run8Page {
  page: number;
  spec: MangaPageSpec;
  planned?: PlannedPage;
}
const here = new URL("./fixtures/defects/", import.meta.url);
const BOOK = JSON.parse(readFileSync(new URL("run8-book.json", here), "utf8")) as { cast: CastMember[]; locations: any[] };
const PAGES = JSON.parse(readFileSync(new URL("run8-pages.json", here), "utf8")) as Run8Page[];

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const pageOf = (n: number): Run8Page => clone(PAGES[n - 1]);
const castOf = (id: string): CastMember => BOOK.cast.find((c) => c.id === id)!;
const errorsOf = (issues: ValidationIssue[]) => issues.filter((i) => i.severity === "error");
const ctx = () => ({ idPrefix: "pg1-", rand: () => 0.5 });
const inter = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

function renderRun8(n: number, edit?: (spec: MangaPageSpec) => void) {
  const p = pageOf(n);
  edit?.(p.spec);
  return { ...renderPageDetailed(p.spec, BOOK, p.planned ? { planned: p.planned } : {}), spec: p.spec };
}

describe("D1 blocker: a rose-tree with no roses draws no roses (run 8 pages 15 and 17)", () => {
  const tree = (bloom?: string): CharacterLook => ({ kind: "plant", species: "rose_bush", tone: "dark", face: true, ...(bloom ? { bloom } : {}) }) as CharacterLook;
  const draw = (look: CharacterLook, eyes?: "open" | "closed" | "dead") =>
    rig.draw({ look, pose: "stand", expression: "neutral", facing: "front", lineWidth: 0.5, seed: 9, ...(eyes ? { eyes } : {}) }, ctx());

  it("a full bush carries roses", () => {
    expect(draw(tree()).blooms ?? 0).toBeGreaterThanOrEqual(6);
  });
  it('bloom "bare" draws no roses at all', () => {
    expect(draw(tree("bare")).blooms).toBe(0);
  });
  it('bloom "single" draws exactly one rose (the marvellous rose of page 17)', () => {
    expect(draw(tree("single")).blooms).toBe(1);
  });
  it('bloom "buds" draws no open rose', () => {
    expect(draw(tree("buds")).blooms).toBe(0);
  });
  it("the old way (eyes dead) stays bare", () => {
    expect(draw(tree(), "dead").blooms).toBe(0);
  });
  it("a per-panel variant bloom reaches the drawing and validates", () => {
    const { spec, result } = renderRun8(15, (s) => {
      s.panels[3].figures[0].variant = { tone: "dark", bloom: "bare" } as FigureSpec["variant"];
    });
    expect(errorsOf(result.issues)).toEqual([]);
    const full = renderRun8(15).result.svg;
    expect(result.svg).not.toBe(full);
    expect(result.svg.length).toBeLessThan(full.length);
    void spec;
  });
  it("an unknown bloom is a validation error, and a human cannot take one", () => {
    const p = pageOf(15);
    (p.spec.panels[3].figures[0] as any).variant = { bloom: "wilted" };
    expect(validatePage(p.spec, BOOK, p.planned).some((i) => i.severity === "error" && /bloom/.test(i.message))).toBe(true);
    const q = pageOf(18);
    (q.spec.panels[0].figures[0] as any).variant = { bloom: "bare" };
    expect(validatePage(q.spec, BOOK, q.planned).some((i) => i.code === "VARIANT_FIELD_INVALID")).toBe(true);
  });
});

describe("D2 blocker: a held prop is never drawn outside its panel (run 8 pages 18, 19, 33)", () => {
  const insideFrac = (b: { x: number; y: number; w: number; h: number }, panel: { x: number; y: number; w: number; h: number }) => inter(b, panel) / Math.max(1, b.w * b.h);
  const HELD_PAGES = [18, 19, 33];
  for (const n of HELD_PAGES) {
    it(`page ${n}: each prop a figure holds is drawn, and at least 85% of it is inside its panel`, () => {
      const { details, spec } = renderRun8(n);
      spec.panels.forEach((panel, i) => {
        for (const f of panel.figures) {
          if (!f.holding) continue;
          const drawn = details[i].props.filter((p) => p.prop === f.holding);
          expect(drawn.length, `${panel.id}: ${f.holding} held by ${f.character} is not drawn`).toBeGreaterThan(0);
          const best = Math.max(...drawn.map((p) => insideFrac(p.box, details[i].bbox)));
          expect(best, `${panel.id}: ${f.holding} drawn outside the panel`).toBeGreaterThanOrEqual(0.85);
        }
      });
    });
  }
  it("over all 46 run-8 pages: no held prop or ground prop is mostly outside its panel", () => {
    const bad: string[] = [];
    for (const p of PAGES) {
      const { details } = renderPageDetailed(clone(p.spec), BOOK, p.planned ? { planned: p.planned } : {});
      details.forEach((d) => d.props.forEach((pr) => insideFrac(pr.box, d.bbox) < 0.85 && bad.push(`p${p.page} ${d.id} ${pr.prop}`)));
    }
    expect(bad).toEqual([]);
  }, 120_000);
});

describe("D3 blocker: height giant is a giant, in every panel (run 8 pages 21 to 25)", () => {
  const humanLook = (height: string): CharacterLook => ({ ...(castOf("c_giant").look as any), height });
  const nominal = (height: string) => rig.nominalHeight(humanLook(height));

  it("a giant stands at least 2.4 times an average adult", () => {
    expect(nominal("giant") / nominal("average")).toBeGreaterThanOrEqual(2.4);
    expect(nominal("tall")).toBeLessThan(nominal("giant"));
  });
  it("in every panel of pages 21 to 25 the standing giant is at least 2.2 times a standing child or adult beside him", () => {
    const seen: string[] = [];
    for (const n of [21, 22, 23, 24, 25]) {
      const { details, spec } = renderRun8(n);
      details.forEach((d, i) => {
        const g = d.figures.find((f) => f.character === "c_giant");
        if (!g || g.pose === "lie") return;
        const panel = spec.panels[i];
        if (panel.figures.find((f) => f.character === "c_giant")?.pose === "lie") return;
        for (const o of d.figures) {
          if (o.character === "c_giant" || o.staging !== "ground") continue;
          const op = panel.figures.find((f) => f.character === o.character)!;
          if (op.pose === "lie" || op.pose === "sit" || op.pose === "kneel") continue;
          // close-range shots frame each head: compare head radii (children have big heads, so 1.5)
          const closeRange = ["medium", "close", "extreme_close"].includes(panel.shot);
          const ratio = closeRange ? g.headRadius / o.headRadius : g.body.h / o.body.h;
          seen.push(`p${n} ${panel.id} ${panel.shot} ${closeRange ? "head" : "height"} ${ratio.toFixed(2)}`);
          expect(ratio, `p${n} ${panel.id}`).toBeGreaterThanOrEqual(closeRange ? 1.5 : 2.2);
        }
      });
    }
    expect(seen.length).toBeGreaterThanOrEqual(5);
  });
  it("in a wide or establishing shot the giant is at least 2.4 times an adult at the same scale", () => {
    for (const [n, id] of [[21, "p1"], [23, "p1"]] as const) {
      const { details } = renderRun8(n);
      const d = details.find((x) => x.id === id)!;
      const g = d.figures.find((f) => f.character === "c_giant")!;
      expect(g.body.h / (g.scale * 100)).toBeGreaterThanOrEqual(2.4);
    }
  });
});

describe("D4 blocker: the moor, the ditch and the foundry are places, not blank paper (run 8 pages 13, 32, 42 to 44)", () => {
  const W = 600;
  const H = 400;
  function ink(env: string, shot: "wide" | "full" | "medium" = "wide", time: "day" | "night" = "day") {
    const d = environments.draw({ environment: env as any, features: [], box: { x: 0, y: 0, w: W, h: H }, shot, angle: "eye", time, weather: "clear", lineWidth: 1.4, seed: 7 }, ctx());
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${d.svg}</svg>`;
    const px = new Resvg(svg).render().pixels;
    let count = 0;
    const bands = new Array(8).fill(0) as number[];
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (px[(y * W + x) * 4] < 235) {
      count += 1;
      bands[Math.floor(y / (H / 8))] += 1;
    }
    return { fraction: count / (W * H), bands: bands.map((b) => b / (W * (H / 8))), paths: (d.svg.match(/<path/g) ?? []).length, horizonY: d.horizonY };
  }
  const vocab = ENVIRONMENTS as readonly string[];

  for (const env of ["moor", "ditch", "forge"]) {
    it(`"${env}" is in the closed vocabulary and draws a populated backdrop`, () => {
      expect(vocab).toContain(env);
      for (const shot of ["wide", "full", "medium"] as const) {
        const r = ink(env, shot);
        expect(r.paths, `${env} ${shot} paths`).toBeGreaterThanOrEqual(25);
        expect(r.fraction, `${env} ${shot} ink`).toBeGreaterThanOrEqual(0.05);
        expect(r.bands.filter((b) => b >= 0.02).length, `${env} ${shot} bands with ink`).toBeGreaterThanOrEqual(4);
      }
      expect(ink(env, "wide", "night").fraction).toBeGreaterThan(0.1);
    });
  }
  it("the old blank stand-in 'abstract' stays as it was (it is for ideas)", () => {
    expect(ink("abstract").paths).toBeLessThan(10);
  });
  it("a moor has ground and sky: ink above and below the horizon; a ditch has water below it", () => {
    const m = ink("moor");
    const above = m.bands.slice(0, 4).reduce((a, b) => a + b, 0);
    const below = m.bands.slice(4).reduce((a, b) => a + b, 0);
    expect(above).toBeGreaterThan(0.2);
    expect(below).toBeGreaterThan(0.2);
    const d = ink("ditch", "wide");
    expect(d.bands.slice(5).reduce((a, b) => a + b, 0)).toBeGreaterThan(0.25);
  });
  it("a location the writer stood in 'abstract' or 'country_road' but named a moor, a ditch or a foundry is drawn as one (run 8 pages 13, 32, 42-44)", () => {
    const cases: [number, string, string][] = [
      [32, "p2", "moor"],
      [42, "p1", "ditch"],
      [43, "p1", "ditch"],
      [13, "p1", "forge"],
    ];
    for (const [n, panelId, want] of cases) {
      const { details } = renderRun8(n);
      const d = details.find((x) => x.id === panelId);
      expect(d?.environment, `page ${n} ${panelId}`).toBe(want);
    }
  });
  it("a place the writer named properly is left alone (the city square stays the city square)", () => {
    const { details } = renderRun8(4);
    expect(details[0].environment).toBe("city_square");
  });
});

describe("D5 blocker: a caption never sits on the subject (run 8 pages 4, 5, 10, 13, 14, 35)", () => {
  const boxKinds = new Set(["caption", "narration"]);
  const covered = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => inter(a, b) / Math.max(1, b.w * b.h);

  it("page 35 panel 1: 'Hans's funeral' does not cover Hans lying in the middle of the panel", () => {
    const { details, spec } = renderRun8(35);
    const d = details[0];
    const hans = d.figures.find((f) => f.character === "c_hans")!;
    for (const pl of d.placed) {
      if (!boxKinds.has(spec.panels[0].text[pl.index].kind)) continue;
      expect(covered(pl.box, hans.body)).toBeLessThanOrEqual(0.1);
    }
  });
  it("page 5 panel 3: the name tag of the sick boy does not cover the boy or his bed", () => {
    const { details, spec } = renderRun8(5);
    const d = details[2];
    const boy = d.figures.find((f) => f.character === "c_boy_ill")!;
    for (const pl of d.placed) {
      if (!boxKinds.has(spec.panels[2].text[pl.index].kind)) continue;
      expect(covered(pl.box, boy.body)).toBeLessThanOrEqual(0.1);
    }
  });
  it("page 4 panel 3: the caption does not cover the statue standing as scenery on its column", () => {
    const { details, spec } = renderRun8(4);
    const d = details[2];
    expect(d.obstacles.length).toBeGreaterThan(0);
    for (const pl of d.placed) {
      if (!boxKinds.has(spec.panels[2].text[pl.index].kind)) continue;
      for (const o of d.obstacles) expect(covered(pl.box, o)).toBeLessThanOrEqual(0.25);
    }
  });
  it("over all 46 run-8 pages: no caption or narration box covers more than 25% of a figure or any head", () => {
    const bad: string[] = [];
    for (const p of PAGES) {
      const { details } = renderPageDetailed(clone(p.spec), BOOK, p.planned ? { planned: p.planned } : {});
      details.forEach((d, i) => {
        for (const pl of d.placed) {
          if (!boxKinds.has(p.spec.panels[i].text[pl.index]?.kind)) continue;
          for (const f of d.figures) {
            const head = { x: f.head.x - f.headRadius, y: f.head.y - f.headRadius, w: 2 * f.headRadius, h: 2 * f.headRadius };
            if (covered(pl.box, f.body) > 0.25 || covered(pl.box, head) > 0.05) bad.push(`p${p.page} ${d.id} ${f.character}`);
          }
        }
      });
    }
    expect(bad).toEqual([]);
  }, 120_000);
});
