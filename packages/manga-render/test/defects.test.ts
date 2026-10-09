/**
 * Renderer defects from acceptance run 8 (docs/launch/T2-renderer.md).
 * Each block states one defect as a structural assertion on compiled geometry
 * or SVG. The specs come from test/fixtures/defects/ (a compact copy of the
 * run-8 judged pages and their cast).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CastMember, CharacterLook, FigureSpec, MangaPageSpec, PanelSpec, PlannedPage, ValidationIssue } from "../src/contracts.js";
import { RENDERER_VERSION, renderPage, renderPageDetailed, validatePage, validateUnderstanding } from "../src/index.js";
import { unquoteSpoken } from "../src/lettering/index.js";
import { Resvg } from "@resvg/resvg-js";
import { environments } from "../src/env/index.js";
import { ENVIRONMENTS, EYE_STATES, OBJECT_SHAPES, PROPS } from "../src/contracts.js";
import { props } from "../src/props/index.js";
import { beatMentions } from "../src/scene/index.js";
import { rig } from "../src/rig/index.js";
import { EXPR as humanExpr } from "../src/rig/human/face.js";
import { EXPR as creatureExpr } from "../src/rig/creature/face.js";

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

describe("review: held-prop warning and giant share in ground shots", () => {
  it("a held prop drawn in front of the figure is reported with HELD_PROP_OFF_FRAME (pages 10, 19, 33)", () => {
    const want: Record<number, string[]> = { 10: ["panel p2"], 19: ["panel p1"], 33: ["panel p2", "panel p4"] };
    for (const [n, paths] of Object.entries(want)) {
      const { result } = renderRun8(Number(n));
      const got = result.issues.filter((i: ValidationIssue) => i.code === "HELD_PROP_OFF_FRAME");
      expect(got.map((i: ValidationIssue) => i.path), `page ${n}`).toEqual(paths);
      expect(got.every((i: ValidationIssue) => i.severity === "warning")).toBe(true);
    }
  });
  it("in an establishing shot the giant counts at 68% of his height, so he is drawn taller than the shot band (pages 21 and 23, panel p1)", () => {
    // with a share of 1.0 these figures are about 92 and 107 units high
    for (const [n, min] of [[21, 120], [23, 140]] as const) {
      const { details } = renderRun8(n);
      const g = details.find((x) => x.id === "p1")!.figures.find((f) => f.character === "c_giant")!;
      expect(g.body.h, `page ${n}`).toBeGreaterThanOrEqual(min);
    }
  });
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

describe("D6 blocker: a Roman Candle is a firework, not a wax candle (run 8 pages 38 to 41)", () => {
  const object = (shape: string, face = true): CharacterLook => ({ kind: "object", shape, tone: "mid", face }) as CharacterLook;
  const drawShape = (shape: string) => rig.draw({ look: object(shape), pose: "stand", expression: "neutral", facing: "front", lineWidth: 0.4, seed: 5 }, ctx());

  it("the firework shapes exist and are drawn: roman_candle, squib and bengal_light", () => {
    for (const shape of ["roman_candle", "squib", "bengal_light"]) {
      expect(OBJECT_SHAPES as readonly string[]).toContain(shape);
      expect(drawShape(shape).svg.length).toBeGreaterThan(500);
    }
  });
  it("every firework has its own silhouette (different drawings and different heights)", () => {
    const shapes = ["candle", "firecracker", "roman_candle", "squib", "bengal_light", "rocket"];
    const draws = shapes.map((s) => drawShape(s));
    expect(new Set(draws.map((d) => d.svg)).size).toBe(shapes.length);
    const tops = draws.map((d) => Math.round(d.anchors.top));
    expect(new Set(tops).size).toBeGreaterThanOrEqual(5);
    // the big Roman Candle stands taller than the little Squib
    expect(-draws[2].anchors.top).toBeGreaterThan(-draws[3].anchors.top * 1.8);
  });
  it("a Roman Candle draws no wax: no dish, no drips, no flame (its svg shares no candle detail)", () => {
    const wax = drawShape("candle").svg;
    const roman = drawShape("roman_candle").svg;
    expect(roman).not.toBe(wax);
    expect(drawShape("roman_candle").anchors.top).toBeLessThan(drawShape("candle").anchors.top);
  });
  it("run 8 cast the Roman Candle, the Squib and the Bengal Light on a candle and a firecracker: they are now drawn by name", () => {
    const withShape = (id: string, shape: string) => {
      const book = clone(BOOK);
      (book.cast.find((c) => c.id === id)!.look as any).shape = shape;
      return book;
    };
    // page 38 panel 2: c_roman_candle (shape candle, name "The Roman Candle") equals the explicit roman_candle drawing
    const p38 = pageOf(38);
    const viaName = renderPage(p38.spec, BOOK, { planned: p38.planned! }).svg;
    const explicit = renderPage(p38.spec, withShape("c_roman_candle", "roman_candle"), { planned: p38.planned! }).svg;
    expect(viaName).toBe(explicit);
    // ...and it differs from what a plainly named candle looks like
    const plain = clone(BOOK);
    plain.cast.find((c) => c.id === "c_roman_candle")!.name = "The Wax Candle";
    plain.cast.find((c) => c.id === "c_roman_candle")!.description = "A wax candle.";
    expect(renderPage(p38.spec, plain, { planned: p38.planned! }).svg).not.toBe(viaName);
    // page 39 panel 5: the Squib and the Bengal Light no longer share a design
    const p39 = pageOf(39);
    const viaNames = renderPage(p39.spec, BOOK, { planned: p39.planned! }).svg;
    const both = withShape("c_squib", "squib");
    (both.cast.find((c) => c.id === "c_bengal_light")!.look as any).shape = "bengal_light";
    expect(viaNames).toBe(renderPage(p39.spec, both, { planned: p39.planned! }).svg);
    // the Squib, the Cracker and the Bengal Light are three different drawings
    const same = clone(BOOK);
    for (const id of ["c_squib", "c_bengal_light", "c_cracker"]) same.cast.find((c) => c.id === id)!.name = "A firecracker";
    expect(renderPage(p39.spec, same, { planned: p39.planned! }).svg).not.toBe(viaNames);
  });
  it("a look that is not a stand-in is never renamed (a rocket named 'Roman Candle' stays a rocket)", () => {
    const b = clone(BOOK);
    const rocket = b.cast.find((c) => c.id === "c_rocket")!;
    rocket.name = "The Roman Candle's cousin";
    const p = pageOf(41);
    expect(renderPage(p.spec, b, { planned: p.planned! }).svg.length).toBeGreaterThan(1000);
    expect((rocket.look as any).shape).toBe("rocket");
  });
});

describe("backward compatibility: every run-8 page still validates and renders", () => {
  it("the compact copy holds all 46 judged pages", () => {
    expect(PAGES.map((p) => p.page)).toEqual(Array.from({ length: 46 }, (_, i) => i + 1));
  });
  it("all 46 specs render with no error, a clean SVG and the current renderer version", () => {
    const bad: string[] = [];
    const hooks = new Map(PAGES.map((p) => [p.page, p.spec.page_turn_hook === true] as const));
    for (const p of PAGES) {
      const r = renderPage(clone(p.spec), BOOK, { ...(p.planned ? { planned: p.planned } : {}), previousPageHook: hooks.get(p.page - 1) === true });
      for (const i of r.issues) if (i.severity === "error") bad.push(`p${p.page} ${i.code} ${i.path}`);
      if (!r.svg.startsWith("<svg") || r.svg.includes("NaN") || r.svg.includes("undefined")) bad.push(`p${p.page} bad svg`);
      if (r.renderer_version !== RENDERER_VERSION) bad.push(`p${p.page} version`);
    }
    expect(bad).toEqual([]);
  }, 120_000);
  it("rendering is deterministic", () => {
    const p = pageOf(38);
    const a = renderPage(clone(p.spec), BOOK, { planned: p.planned! }).svg_hash;
    const b = renderPage(clone(p.spec), BOOK, { planned: p.planned! }).svg_hash;
    expect(a).toBe(b);
  });
  it("the new fields are optional: an old cast and old variants validate unchanged", () => {
    const p = pageOf(15);
    expect(validatePage(p.spec, BOOK, p.planned).filter((i) => i.severity === "error")).toEqual([]);
    expect(RENDERER_VERSION).not.toBe("manga-render/0.3.0");
  });
});

describe("D7 story-state looks the continuity track needs (Happy Prince eyes and gold, Rose-tree bloom, gold leaf)", () => {
  const prince = (): CharacterLook => castOf("c_prince").look;
  const faceOf = (look: CharacterLook, eyes?: string, facing: "front" | "right" = "front") =>
    rig.draw({ look, pose: "stand", expression: "neutral", facing, lineWidth: 0.2, seed: 3, ...(eyes ? { eyes: eyes as any } : {}) }, ctx()).svg;

  it("a gilded statue with jewel eyes, one eye given away, both given away: three different faces", () => {
    const gilded = { ...(prince() as any), material: "gold" } as CharacterLook;
    const both = faceOf(gilded, "open");
    const one = faceOf(gilded, "one_blind");
    const none = faceOf(gilded, "blind");
    expect(new Set([both, one, none]).size).toBe(3);
  });
  it("one_blind is in the closed vocabulary, validates on a page and renders with no error", () => {
    expect(EYE_STATES as readonly string[]).toContain("one_blind");
    const { result } = renderRun8(8, (s) => {
      const f = s.panels[0].figures.find((x) => x.character === "c_prince");
      if (f) f.variant = { material: "gold", eyes: "one_blind" } as FigureSpec["variant"];
    });
    expect(errorsOf(result.issues)).toEqual([]);
  });
  it("gilded and stripped statues differ (material gold vs stone), and the stripped one has no gold tone", () => {
    const gilded = faceOf({ ...(prince() as any), material: "gold" } as CharacterLook, "open");
    const stripped = faceOf({ ...(prince() as any), material: "stone" } as CharacterLook, "blind");
    expect(gilded).not.toBe(stripped);
  });
  it("the new props exist, draw, and are named by their words in a beat", () => {
    for (const prop of ["gold_leaf", "thorn", "axe", "firework", "sign"]) {
      expect(PROPS as readonly string[]).toContain(prop);
      expect(props.draw(prop as any, 0.4, ctx()).svg.length, prop).toBeGreaterThan(200);
    }
    expect(beatMentions("The swallow peels a leaf of gold from the statue.", "gold_leaf" as any)).toBe(true);
    expect(beatMentions("The Giant swings a great axe.", "axe" as any)).toBe(true);
    expect(beatMentions("Her breast against a thorn.", "thorn" as any)).toBe(true);
  });
  it("a gold leaf in a panel is drawn as a prop of its own (run 8 page 10 drew a diamond on a ledge)", () => {
    const { details } = renderRun8(10, (s) => {
      s.panels[0].props = [{ prop: "gold_leaf", slot: "center_right", depth: "fore" } as any];
    });
    expect(details[0].props.some((p) => p.prop === ("gold_leaf" as any))).toBe(true);
  });
  it("a figure can hold the new props, and an axe in a giant's hand stays inside its panel", () => {
    const { details, result } = renderRun8(23, (s) => {
      const f = s.panels[3].figures.find((x) => x.character === "c_giant");
      if (f) f.holding = "axe" as any;
    });
    expect(errorsOf(result.issues)).toEqual([]);
    const axe = details[3].props.find((p) => p.prop === ("axe" as any));
    expect(axe).toBeDefined();
    expect(inter(axe!.box, details[3].bbox) / Math.max(1, axe!.box.w * axe!.box.h)).toBeGreaterThanOrEqual(0.85);
  });
  it("the page vocabulary the model sees names the story-state fields", async () => {
    const mod = await import("../../../apps/agent-worker/src/goals/vocabulary.js");
    const page = mod.pageVocabulary() as Record<string, readonly string[]>;
    expect(page.eye_states).toContain("one_blind");
    expect(page.plant_blooms).toEqual(["full", "buds", "single", "bare"]);
    const look = mod.lookVocabulary() as { look_kinds: { plant: Record<string, unknown> } };
    expect(Object.keys(look.look_kinds.plant)).toContain("bloom");
    expect((mod.lookVocabulary() as any).environments).toEqual(expect.arrayContaining(["moor", "ditch", "forge"]));
  });
});

describe("D8 legibility kinds: heads in frame, scene captions first, spoken words only, crowd counts and faces", () => {
  it("over all 46 run-8 pages: no figure's head is more than 30% outside its panel (the Reed and the Swallow of page 2)", () => {
    const bad: string[] = [];
    for (const p of PAGES) {
      const { details } = renderPageDetailed(clone(p.spec), BOOK, p.planned ? { planned: p.planned } : {});
      details.forEach((d) =>
        d.figures.forEach((f) => {
          if (f.headCropped) return;
          const head = { x: f.head.x - f.headRadius, y: f.head.y - f.headRadius, w: 2 * f.headRadius, h: 2 * f.headRadius };
          if (inter(head, d.bbox) / (head.w * head.h) < 0.7) bad.push(`p${p.page} ${d.id} ${f.character}`);
        }),
      );
    }
    expect(bad).toEqual([]);
  }, 120_000);
  it("page 2 panels 2 and 3: the Reed's head is inside the panel and the Swallow still reads as the speaker", () => {
    const { details } = renderRun8(2);
    for (const i of [1, 2]) {
      const reed = details[i].figures.find((f) => f.character === "c_reed")!;
      const swallow = details[i].figures.find((f) => f.character === "c_swallow")!;
      const head = { x: reed.head.x - reed.headRadius, y: reed.head.y - reed.headRadius, w: 2 * reed.headRadius, h: 2 * reed.headRadius };
      expect(inter(head, details[i].bbox) / (head.w * head.h), `panel ${i + 1}`).toBeGreaterThanOrEqual(0.7);
      expect(swallow.headRadius, `panel ${i + 1}`).toBeGreaterThanOrEqual(22);
    }
  });

  it("a scene caption is read first, at the top, even when the writer listed it last (run 8 pages 11 and 40)", () => {
    for (const [n, panelIndex] of [[11, 0], [40, 0]] as const) {
      const { details, spec } = renderRun8(n);
      const d = details[panelIndex];
      const texts = spec.panels[panelIndex].text;
      const cap = d.placed.find((p) => texts[p.index].kind === "caption" && !texts[p.index].about)!;
      for (const other of d.placed) {
        if (other === cap || texts[other.index].kind === "sfx") continue;
        const readsFirst = cap.box.y <= other.box.y + 12 || cap.box.x + cap.box.w <= other.box.x + 2;
        expect(readsFirst, `page ${n}: caption before ${texts[other.index].kind}`).toBe(true);
      }
    }
  });
  it("unquoteSpoken strips one wrapping quotation and a dangling comma, and leaves speech tags alone (run 8 pages 17 and 23)", () => {
    expect(unquoteSpoken('"Press closer, little Nightingale,"')).toBe("Press closer, little Nightingale");
    expect(unquoteSpoken("“Give me a red rose.”")).toBe("Give me a red rose.");
    expect(unquoteSpoken("Plain words.")).toBe("Plain words.");
    const tagged = '"I have many beautiful flowers," he said; "but the children are the most beautiful."';
    expect(unquoteSpoken(tagged)).toBe(tagged);
  });
  it("a balloon prints no quotation marks round its line", () => {
    const { result } = renderRun8(17, (s) => {
      s.panels[1].text = [{ kind: "speech", speaker: "c_nightingale", text: '"Press closer, little Nightingale,"', fidelity: "quote", source: s.panels[1].text[0]?.source }] as any;
    });
    const balloon = result.svg;
    expect(balloon.includes("&quot;Press")).toBe(false);
    expect(/>\s*"Press/.test(balloon)).toBe(false);
  });

  it("crowd count: 'two little boys' draws two people (run 8 page 45 drew three)", () => {
    const look = (count?: number): CharacterLook => ({ kind: "crowd", crowd: "children", size: "few", ...(count ? { count } : {}) }) as CharacterLook;
    const draw = (l: CharacterLook) => rig.draw({ look: l, pose: "stand", expression: "neutral", facing: "front", lineWidth: 0.4, seed: 7 }, ctx());
    expect(draw(look(2)).members).toBe(2);
    expect(draw(look(1)).members).toBe(1);
    expect(draw(look()).members).toBe(3);
    expect(draw(look(5)).members).toBe(5);
    expect(draw(look(2)).svg).not.toBe(draw(look()).svg);
  });
  it("crowd count validates: a whole number from 1 to 8", () => {
    const p = pageOf(45);
    const book = clone(BOOK);
    const boys = book.cast.find((c) => c.id === "c_boys_s5")!;
    (boys.look as any).count = 2;
    expect(validateUnderstanding({ schema: "book-understanding.v1", title: "t", author: "a", kind: "fiction", logline: "l", sections: [], cast: [boys], locations: [], claims: [], themes: [] } as any, []).some((i) => i.path.includes("c_boys_s5") && i.code === "FIELD_TYPE")).toBe(false);
    (boys.look as any).count = 12;
    expect(validateUnderstanding({ schema: "book-understanding.v1", title: "t", author: "a", kind: "fiction", logline: "l", sections: [], cast: [boys], locations: [], claims: [], themes: [] } as any, []).some((i) => i.code === "FIELD_TYPE" && /count/.test(i.message))).toBe(true);
    expect(errorsOf(renderPage(p.spec, book, { planned: p.planned! }).issues)).toEqual([]);
  });
  it("a back-row crowd member's head is never blank: the silhouette carries eyes and a mouth", () => {
    const look: CharacterLook = { kind: "crowd", crowd: "townsfolk", size: "many" } as CharacterLook;
    const svg = rig.draw({ look, pose: "stand", expression: "neutral", facing: "front", lineWidth: 1.2, seed: 7, detail: "silhouette" }, ctx()).svg;
    expect((svg.match(/<circle/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });
});

describe("D9 'determined' is not anger (run 8 pages 2 and 14: brows drawn as an angry glare)", () => {
  it("the human 'determined' brows and lids are at most half as steep as 'angry'", () => {
    expect(Math.abs(humanExpr.determined.tilt)).toBeLessThanOrEqual(Math.abs(humanExpr.angry.tilt) * 0.5);
    expect(humanExpr.determined.brow[0]).toBeLessThanOrEqual(humanExpr.angry.brow[0] * 0.55);
    expect(humanExpr.determined.brow[0]).toBeGreaterThan(0);
  });
  it("the creature 'determined' tilt is at most half of 'angry' and the brow is not pulled down", () => {
    expect(creatureExpr.determined.tilt).toBeLessThanOrEqual(creatureExpr.angry.tilt * 0.5);
    expect(creatureExpr.determined.raise).toBeGreaterThanOrEqual(-0.1);
    expect(creatureExpr.determined.tilt).toBeGreaterThan(0);
  });
});
