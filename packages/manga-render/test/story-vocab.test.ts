/**
 * v0.2 (#41): looks, props and backdrops that stories need.
 * Each new item: it renders inside its bounds, it is deterministic (same input, same bytes),
 * and lettering does not cover it. The closed vocabulary and the renderer agree.
 */
import { describe, expect, it } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import type { CastMember, CharacterLook, FigureSpec, MangaPageSpec, PanelSpec } from "../src/contracts.js";
import { ENVIRONMENTS, OUTFITS, PROPS } from "../src/contracts.js";
import { RENDERER_VERSION, catalog, renderPageDetailed, validatePage } from "../src/index.js";
import { environments } from "../src/env/index.js";
import { props } from "../src/props/index.js";
import { rig } from "../src/rig/index.js";
import { resolveEnvironment } from "../src/scene/index.js";

const NEW_PROPS = ["pot", "stove", "roast_goose", "heart", "angel", "loom", "sledge"] as const;
const NEW_ENVS = ["foundry", "dustheap", "paradise"] as const;
const NEW_OUTFITS = ["underclothes", "undressed"] as const;

const ctx = () => ({ idPrefix: "t-", rand: () => 0.5 });

function bboxOf(svgInner: string, w: number, h: number): { x: number; y: number; width: number; height: number } {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-w * 2} ${-h * 2} ${w * 4} ${h * 4}" width="${w * 4}" height="${h * 4}">${svgInner}</svg>`;
  return new Resvg(svg).getBBox() as { x: number; y: number; width: number; height: number };
}

describe("the closed vocabulary lists the new names", () => {
  it("looks, props and backdrops are in the contracts and in the catalog the model reads", () => {
    for (const o of NEW_OUTFITS) expect(OUTFITS).toContain(o);
    for (const p of NEW_PROPS) expect(PROPS).toContain(p);
    for (const e of NEW_ENVS) expect(ENVIRONMENTS).toContain(e);
    const c = catalog();
    expect(c.vocabularies.environments).toEqual(expect.arrayContaining([...NEW_ENVS]));
    expect(c.vocabularies.props).toEqual(expect.arrayContaining([...NEW_PROPS]));
    expect(c.looks.human.fields.outfit).toEqual(expect.arrayContaining([...NEW_OUTFITS]));
    expect(c.variants.fields.human).toContain("outfit");
  });
  it("is renderer 0.6.0", () => {
    expect(RENDERER_VERSION).toBe("manga-render/0.6.0");
  });
  it("the renderer can draw every name of every closed list (no name is allowed and undrawable)", () => {
    for (const p of PROPS) expect(() => props.draw(p, 0.5, ctx()), `prop ${p}`).not.toThrow();
    for (const o of OUTFITS) {
      const look = { kind: "human", age: "adult", build: "average", height: "average", frame: "masc", hair: "short", hair_tone: "dark", facial_hair: "none", outfit: o, outfit_tone: "mid", headwear: "none", accessories: [], skin: "light", material: "flesh" } as CharacterLook;
      for (const facing of ["front", "right", "back"] as const) {
        expect(() => rig.draw({ look, pose: "stand", expression: "neutral", facing, lineWidth: 0.5, seed: 3 }, ctx()), `outfit ${o} ${facing}`).not.toThrow();
      }
    }
    for (const e of ENVIRONMENTS) {
      const box = { x: 10, y: 10, w: 300, h: 220 };
      expect(() => environments.draw({ environment: e, features: [], box, shot: "wide", angle: "eye", time: "day", weather: "clear", lineWidth: 1.6, seed: 4 }, ctx()), `environment ${e}`).not.toThrow();
    }
  });
});

describe("new props", () => {
  for (const id of NEW_PROPS) {
    it(`${id}: drawn inside its stated bounds, deterministic, with ink in it`, () => {
      const a = props.draw(id, 0.5, ctx());
      const b = props.draw(id, 0.5, ctx());
      expect(a.svg).toBe(b.svg);
      expect(a.svg.length).toBeGreaterThan(200);
      const box = bboxOf(a.svg, a.width, a.height);
      // geometry (no stroke) sits inside w x h, ground at y = 0, centred on x = 0, with 1.5 units of slack
      expect(box.x, `${id} left`).toBeGreaterThanOrEqual(-a.width / 2 - 1.5);
      expect(box.x + box.width, `${id} right`).toBeLessThanOrEqual(a.width / 2 + 1.5);
      expect(box.y, `${id} top`).toBeGreaterThanOrEqual(-a.height - 1.5);
      expect(box.y + box.height, `${id} bottom`).toBeLessThanOrEqual(1.5);
      // and it fills most of the stated height (no empty drawing)
      expect(box.height).toBeGreaterThan(a.height * 0.6);
      expect(a.grip.x).toBeGreaterThanOrEqual(-a.width / 2);
      expect(a.grip.x).toBeLessThanOrEqual(a.width / 2);
    });
    it(`${id}: still draws at a small line weight (a far prop) and stays deterministic`, () => {
      const a = props.draw(id, 2.5, ctx());
      expect(a.svg).toBe(props.draw(id, 2.5, ctx()).svg);
      expect(a.svg.length).toBeGreaterThan(100);
    });
  }
  it("a pot is not a bell: different silhouette, wider than tall, with side lugs", () => {
    const pot = props.draw("pot", 0.5, ctx());
    const bell = props.draw("bell", 0.5, ctx());
    expect(pot.svg).not.toBe(bell.svg);
    expect(pot.width).toBeGreaterThan(pot.height);
    expect(bell.width).toBeLessThan(bell.height + 1);
  });
});

// A small book for page-level tests.
const look = (o: Partial<CharacterLook> & Record<string, unknown>): CharacterLook =>
  ({ kind: "human", age: "adult", build: "average", height: "average", frame: "masc", hair: "short", hair_tone: "dark", facial_hair: "none", outfit: "royal", outfit_tone: "dark", headwear: "crown", accessories: [], skin: "light", material: "flesh", ...o }) as CharacterLook;
const CAST: CastMember[] = [
  { id: "emperor", name: "The Emperor", role: "ruler", description: "A vain emperor", look: look({}) },
  { id: "cook", name: "The Cook", role: "cook", description: "A cook", look: look({ outfit: "work_apron", outfit_tone: "light", frame: "fem", hair: "bun", headwear: "none" }) },
  { id: "bird", name: "A Sparrow", role: "bird", description: "A sparrow", look: { kind: "bird", species: "sparrow", tone: "mid" } as CharacterLook },
];
const LOCS = [
  { id: "kitchen", name: "Kitchen", environment: "room_poor", features: [], description: "A kitchen" },
  { id: "hall", name: "Hall", environment: "palace_hall", features: [], description: "A hall" },
  { id: "foundry", name: "The foundry", environment: "foundry", features: [], description: "A foundry" },
  { id: "heap", name: "The dust heap", environment: "dustheap", features: [], description: "A heap" },
  { id: "paradise", name: "Paradise", environment: "paradise", features: [], description: "Paradise" },
] as unknown as { id: string; name: string; environment: never; features: never[]; description: string }[];
const BOOK = { cast: CAST, locations: LOCS };
const src = { unit: "u01", page: 1 };
const fig = (f: Partial<FigureSpec> & Pick<FigureSpec, "character">): FigureSpec => ({ pose: "stand", expression: "neutral", facing: "front", slot: "center", ...f });
const panel = (id: string, location: string, shot: PanelSpec["shot"], figures: FigureSpec[], beat: string, extra: Partial<PanelSpec> = {}): PanelSpec =>
  ({ id, beat, shot, angle: "eye", location, time: "day", weather: "clear", figures, props: [], fx: [], text: [], source: [src], ...extra }) as PanelSpec;
const page = (panels: PanelSpec[]): MangaPageSpec =>
  ({ schema: "manga-page.v1", page_number: 1, section_id: "s1", purpose: "test", layout: { template: ({ 1: "splash", 2: "stack_2", 3: "establish_3" } as Record<number, string>)[panels.length] ?? "staggered_6" }, claims: [], page_turn_hook: false, panels }) as MangaPageSpec;
const errors = (spec: MangaPageSpec) => validatePage(spec, BOOK).filter((i) => i.severity === "error");
const inter = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

describe("new props in a panel: inside the panel, no lettering over them", () => {
  const SHOTS: PanelSpec["shot"][] = ["medium", "full", "wide"];
  for (const id of NEW_PROPS) {
    it(`${id}: key prop in a panel with a balloon and a caption (medium, full, wide)`, () => {
      const panels = SHOTS.map((shot, i) =>
        panel(`p${i + 1}`, "kitchen", shot, [fig({ character: "cook", slot: "center_left", facing: "right" })], `The cook beside the ${id.replace("_", " ")}.`, {
          props: [{ prop: id, slot: "center_right" } as never],
          text: [
            { kind: "speech", speaker: "cook", text: "Here it is, at last!", fidelity: "dramatized", source: src },
            { kind: "narration", text: "A long day in the house.", fidelity: "paraphrase", source: src },
          ] as never,
        }),
      );
      const spec = page(panels);
      expect(errors(spec)).toEqual([]);
      const first = renderPageDetailed(spec, BOOK);
      const second = renderPageDetailed(spec, BOOK);
      expect(first.result.svg).toBe(second.result.svg);
      first.details.forEach((d, i) => {
        const drawn = d.props.filter((p) => p.prop === id);
        expect(drawn.length, `${id} drawn in ${SHOTS[i]}`).toBeGreaterThan(0);
        for (const p of drawn) {
          expect(inter(p.box, d.bbox) / Math.max(1, p.box.w * p.box.h), `${id} ${SHOTS[i]} inside panel`).toBeGreaterThanOrEqual(0.85);
          for (const l of d.placed) {
            if (l.label) continue;
            expect(inter(p.box, l.box) / Math.max(1, p.box.w * p.box.h), `${id} ${SHOTS[i]} lettering over prop`).toBeLessThan(0.08);
          }
        }
      });
    });
  }
  it("a figure can hold a pot, a roast goose or a heart (small props only)", () => {
    for (const id of ["pot", "roast_goose", "heart"] as const) {
      const spec = page([panel("p1", "kitchen", "full", [fig({ character: "cook", pose: "hold", holding: id })], "She holds it.")]);
      expect(errors(spec), id).toEqual([]);
      const { details } = renderPageDetailed(spec, BOOK);
      expect(details[0].props.some((p) => p.prop === id && p.heldBy === "cook"), id).toBe(true);
    }
  });
  it("a stove, a loom, an angel and a sledge are too big to hold: a validation error", () => {
    for (const id of ["stove", "loom", "angel", "sledge"] as const) {
      const spec = page([panel("p1", "kitchen", "medium", [fig({ character: "cook", pose: "hold", holding: id })], "She holds it.")]);
      expect(validatePage(spec, BOOK).some((i) => i.severity === "error" || /too big|beside/i.test(i.message)), id).toBe(true);
    }
  });
});

describe("new backdrops", () => {
  const box = { x: 20, y: 20, w: 420, h: 300 };
  const draw = (e: string, shot: PanelSpec["shot"], time: "day" | "night" = "day", seed = 7) =>
    environments.draw({ environment: e as never, features: [], box, shot, angle: "eye", time, weather: "clear", lineWidth: 1.6, seed }, ctx());
  for (const e of NEW_ENVS) {
    it(`${e}: deterministic, inside its box, populated in wide, full and medium shots, day and night`, () => {
      for (const shot of ["establishing", "wide", "full", "medium", "close", "extreme_close", "insert"] as const) {
        const a = draw(e, shot);
        expect(a.svg, `${e} ${shot}`).toBe(draw(e, shot).svg);
        expect(a.svg.length).toBeGreaterThan(100);
      }
      for (const shot of ["wide", "full", "medium"] as const) {
        const a = draw(e, shot);
        const paths = (a.svg.match(/<path/g) ?? []).length;
        // Paradise is open sky: rays, a glow, clouds and stars (fewer, larger paths than a built set)
        expect(paths, `${e} ${shot} paths`).toBeGreaterThanOrEqual(e === "paradise" ? 8 : 25);
        // rasterise inside the box and measure ink
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 340" width="460" height="340"><rect width="460" height="340" fill="#fff"/><clipPath id="c"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/></clipPath><g clip-path="url(#c)">${a.svg}</g></svg>`;
        const px = new Resvg(svg).render().pixels;
        let ink = 0;
        let outside = 0;
        for (let y = 0; y < 340; y += 1) for (let x = 0; x < 460; x += 1) {
          const dark = px[(y * 460 + x) * 4] < 235;
          const inBox = x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
          if (dark && inBox) ink += 1;
          if (dark && !inBox) outside += 1;
        }
        expect(ink / (box.w * box.h), `${e} ${shot} ink`).toBeGreaterThanOrEqual(0.04);
        expect(outside, `${e} ${shot} ink outside the box`).toBe(0);
        expect(a.groundY).toBeGreaterThan(box.y);
        expect(a.groundY).toBeLessThanOrEqual(box.y + box.h);
      }
      expect(draw(e, "wide", "night").svg).not.toBe(draw(e, "wide", "day").svg);
    });
  }
  it("a foundry is not the forge: it adds the casting rig", () => {
    expect(draw("foundry", "wide").svg).not.toBe(draw("forge", "wide").svg);
    expect(draw("foundry", "wide").svg.length).toBeGreaterThan(draw("forge", "wide").svg.length);
  });
  it("a figure stands on the ground of each new backdrop, with no lettering over the set", () => {
    const panels = NEW_ENVS.map((e, i) => panel(`p${i + 1}`, e === "foundry" ? "foundry" : e === "dustheap" ? "heap" : "paradise", "full", [fig({ character: "cook" })], "She stands there.", {
      text: [{ kind: "speech", speaker: "cook", text: "Here we are.", fidelity: "dramatized", source: src }] as never,
    }));
    const spec = page(panels);
    expect(errors(spec)).toEqual([]);
    const { details, result } = renderPageDetailed(spec, BOOK);
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
    details.forEach((d, i) => {
      expect(d.environment).toBe(NEW_ENVS[i]);
      const f = d.figures[0];
      expect(f.headCropped ?? false).toBe(false);
    });
  });
  it("a place the writer stood in 'abstract' but named a foundry, a dust heap or Paradise is drawn as it", () => {
    const stand = (name: string) => resolveEnvironment({ environment: "abstract", name, description: "" });
    expect(stand("The foundry")).toBe("foundry");
    expect(stand("The old forge")).toBe("forge");
    expect(stand("The dust-heap")).toBe("dustheap");
    expect(stand("Paradise")).toBe("paradise");
    expect(stand("Heaven")).toBe("paradise");
    // a real environment is never changed
    expect(resolveEnvironment({ environment: "garden", name: "Paradise garden", description: "" })).toBe("garden");
  });
});

describe("new looks: underclothes and undressed (a robe taken off)", () => {
  const draw = (outfit: string, o: Record<string, unknown> = {}) =>
    rig.draw({ look: look({ outfit, ...o }), pose: "stand", expression: "neutral", facing: "front", lineWidth: 0.5, seed: 3 }, ctx());
  it("each look draws, is deterministic and differs from the robe and from each other", () => {
    const royal = draw("royal").svg;
    const under = draw("underclothes").svg;
    const bare = draw("undressed").svg;
    expect(under).toBe(draw("underclothes").svg);
    expect(bare).toBe(draw("undressed").svg);
    expect(new Set([royal, under, bare]).size).toBe(3);
  });
  it("the cape and the crown of the robe are gone: no trailing cape in underclothes", () => {
    // the royal outfit has a cape lining; the new looks are shorter: smaller drawing than the robe
    expect(draw("underclothes").svg.length).toBeLessThan(draw("royal").svg.length);
  });
  it("works in every facing, on a child and on a statue, in lite and full ink", () => {
    for (const facing of ["front", "left", "right", "back"] as const) for (const o of NEW_OUTFITS) {
      expect(() => rig.draw({ look: look({ outfit: o }), pose: "walk", expression: "sad", facing, lineWidth: 0.5, seed: 3 }, ctx())).not.toThrow();
      expect(() => rig.draw({ look: look({ outfit: o, age: "child", height: "short" }), pose: "sit", expression: "neutral", facing, lineWidth: 2.4, seed: 3 }, ctx())).not.toThrow();
      expect(() => rig.draw({ look: look({ outfit: o, material: "stone" }), pose: "stand", expression: "neutral", facing, lineWidth: 0.5, seed: 3 }, ctx())).not.toThrow();
    }
  });
  it("a story state sets the outfit in one panel only (variant), validated and rendered", () => {
    const spec = page([
      panel("p1", "hall", "full", [fig({ character: "emperor" })], "In his robe."),
      panel("p2", "hall", "full", [fig({ character: "emperor", variant: { outfit: "underclothes" } })], "In his underclothes."),
      panel("p3", "hall", "full", [fig({ character: "emperor", variant: { outfit: "undressed" } })], "Undressed."),
    ]);
    expect(errors(spec)).toEqual([]);
    const a = renderPageDetailed(spec, BOOK);
    expect(a.result.svg).toBe(renderPageDetailed(spec, BOOK).result.svg);
    const figs = a.details.map((d) => d.figures[0]);
    expect(figs.every(Boolean)).toBe(true);
  });
  it("an unknown outfit is an error; a bird cannot change clothes", () => {
    const bad = page([panel("p1", "hall", "full", [fig({ character: "emperor", variant: { outfit: "spacesuit" } as never })], "x")]);
    expect(errors(bad).some((i) => /outfit/.test(i.message))).toBe(true);
    const bird = page([panel("p1", "hall", "full", [fig({ character: "bird", variant: { outfit: "underclothes" } as never })], "x")]);
    expect(errors(bird).some((i) => i.code === "VARIANT_FIELD_INVALID")).toBe(true);
  });
});
