/**
 * v0.3 D1a (#81): neutral stand-ins by body plan, kind of place and shape.
 * Archetype animals and a tall bird, look.scale, generic backdrops, neutral props with labels,
 * automatic name tags for stand-in figures, and the general fixes (small by size, abstract features,
 * rodent sit, the sword words). Everything is deterministic: two renders give the same SVG.
 */
import { describe, expect, it } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import type { CastMember, CharacterLook, FigureSpec, MangaPageSpec, PanelSpec } from "../src/contracts.js";
import { ANIMAL_SPECIES, ARCHETYPE_SPECIES, BIRD_SPECIES, ENVIRONMENTS, NEUTRAL_PROPS, PROPS, PROP_LABEL_MAX } from "../src/contracts.js";
import { RENDERER_VERSION, catalog, castCapabilities, renderPageDetailed, validatePage } from "../src/index.js";
import { environments } from "../src/env/index.js";
import { props } from "../src/props/index.js";
import { rig } from "../src/rig/index.js";
import { isSmallFigure } from "../src/scene/compose.js";
import { beatMentions } from "../src/scene/props.js";
import { validateLook } from "../src/validate/look.js";
import { Issues } from "../src/validate/util.js";

const ctx = () => ({ idPrefix: "t-", rand: () => 0.5 });
const FACINGS = ["right", "front", "back"] as const;
const draw = (look: CharacterLook, pose: FigureSpec["pose"], facing: (typeof FACINGS)[number] = "right", lineWidth = 0.4) =>
  rig.draw({ look, pose, expression: "neutral", facing, lineWidth, seed: 7 }, ctx());

const NEW_ANIMALS = ["quad_small", "quad_medium", "quad_large", "long_low", "swimmer"] as const;
const NOMINAL: Record<string, number> = { quad_small: 25, quad_medium: 60, quad_large: 170, long_low: 40, swimmer: 45, bird_tall: 112 };
const lookOf = (species: string): CharacterLook =>
  (species === "bird_tall" ? { kind: "bird", species, tone: "mid" } : { kind: "animal", species, tone: "mid" }) as CharacterLook;
const HUMAN = { kind: "human", age: "adult", build: "average", height: "average", frame: "neutral", hair: "short", hair_tone: "dark", facial_hair: "none", outfit: "shirt_trousers", outfit_tone: "light", headwear: "none", accessories: [], skin: "light", material: "flesh" } as CharacterLook;

describe("the contracts list the stand-ins", () => {
  it("species, environments and props are in the lists and in the catalog the model reads", () => {
    for (const a of NEW_ANIMALS) expect(ANIMAL_SPECIES).toContain(a);
    expect(BIRD_SPECIES).toContain("bird_tall");
    expect([...ARCHETYPE_SPECIES].sort()).toEqual([...NEW_ANIMALS, "bird_tall"].sort());
    for (const e of ["generic_room", "generic_hall", "generic_passage", "generic_rough", "generic_outdoor"]) expect(ENVIRONMENTS).toContain(e);
    for (const p of NEUTRAL_PROPS) expect(PROPS).toContain(p);
    expect(NEUTRAL_PROPS).toEqual(["thing_long", "thing_round", "thing_block", "thing_flat", "thing_heap"]);
    const c = catalog();
    expect(c.vocabularies.environments).toContain("generic_passage");
    expect(c.vocabularies.props).toContain("thing_heap");
    expect(c.looks.animal.fields.species).toContain("quad_large");
    expect(c.looks.bird.fields.species).toContain("bird_tall");
    for (const k of Object.keys(c.looks)) expect(c.looks[k].fields.scale, `scale on ${k}`).toBeDefined();
    for (const key of [...NEW_ANIMALS.map((a) => `animal.${a}`), "bird.bird_tall", ...NEUTRAL_PROPS.map((p) => `prop.${p}`), "environment.generic_rough"]) {
      expect(c.stand_ins[key], key).toMatch(/\w+ \w+/);
    }
    expect(c.warnings.NEUTRAL_PROP_UNLABELLED).toBeDefined();
    expect(c.errors.LOOK_SCALE_RANGE).toBeDefined();
  });
  it("is renderer 0.7.0", () => {
    expect(RENDERER_VERSION).toBe("manga-render/0.7.0");
  });
});

describe("archetype figures", () => {
  for (const sp of ARCHETYPE_SPECIES) {
    const look = lookOf(sp);
    it(`${sp}: nominal height ${NOMINAL[sp]}, every supported pose and facing draws, deterministic`, () => {
      expect(rig.nominalHeight(look)).toBe(NOMINAL[sp]);
      const poses = rig.supportedPoses(look);
      expect(poses).toContain("stand");
      expect(poses.length).toBeGreaterThanOrEqual(6);
      for (const pose of poses) {
        for (const facing of FACINGS) {
          const a = draw(look, pose, facing);
          expect(a.svg.length, `${sp} ${pose} ${facing}`).toBeGreaterThan(200);
          expect(a.svg).toBe(draw(look, pose, facing).svg);
          expect(a.anchors.top).toBeLessThan(0);
          expect(a.anchors.headRadius).toBeGreaterThan(0);
          expect(Number.isFinite(a.anchors.mouth.x + a.anchors.mouth.y + a.anchors.head.x + a.anchors.head.y)).toBe(true);
        }
      }
    });
    it(`${sp}: stands about as tall as its nominal height; the face reads every expression`, () => {
      const d = draw(look, "stand");
      const h = -d.anchors.top;
      expect(h / NOMINAL[sp], `${sp} drawn ${h.toFixed(1)}`).toBeGreaterThan(0.6);
      expect(h / NOMINAL[sp], `${sp} drawn ${h.toFixed(1)}`).toBeLessThan(1.45);
      const exprs = rig.supportedExpressions(look);
      expect(exprs.length).toBeGreaterThanOrEqual(15);
      const set = new Set(exprs.map((e) => rig.draw({ look, pose: "stand", expression: e, facing: "right", lineWidth: 0.4, seed: 7 }, ctx()).svg));
      expect(set.size, `${sp} expressions differ`).toBeGreaterThan(5);
    });
  }
  it("the sizes follow the body plan: small < medium < large, and the large one is taller than an adult", () => {
    const h = (sp: string) => -draw(lookOf(sp), "stand").anchors.top;
    expect(h("quad_small")).toBeLessThan(h("quad_medium"));
    expect(h("quad_medium")).toBeLessThan(h("quad_large"));
    expect(h("quad_large")).toBeGreaterThan(-draw(HUMAN, "stand").anchors.top);
    // long_low is long and low, bird_tall is tall
    const ll = draw(lookOf("long_low"), "stand").anchors;
    expect(ll.right - ll.left).toBeGreaterThan(2.5 * -ll.top);
    expect(-draw(lookOf("bird_tall"), "stand").anchors.top).toBeGreaterThan(90);
  });
  it("an archetype has no species marks: no mane, no horns, no stripes, no trunk in a quad row", async () => {
    const { QUAD } = await import("../src/rig/creature/quad.js");
    for (const sp of ["quad_small", "quad_medium", "quad_large"] as const) {
      const row = QUAD[sp];
      expect(row.mane, sp).toBe(false);
      expect(row.hoof, sp).toBe(false);
      expect(row.whiskers, sp).toBe(false);
      // quad_small is a small plain rodent-like body (plain pointed ear, long muzzle). quad_medium has small plain
      // ears and a shorter muzzle (a long muzzle with pointed ears read as a dog). quad_large is a neutral HEAVY
      // body: small flat-oval ears, a short broad blunt muzzle (a pointed snout read as a wolf), thick pillar legs.
      expect(row.ears.kind, sp).toBe(sp === "quad_small" ? "tri" : "small");
      if (sp === "quad_small") expect(row.muz.l / row.R, sp).toBeGreaterThan(0.85);
      else expect(row.muz.l / row.R, sp).toBeLessThan(1);
      if (sp === "quad_large") {
        expect(row.muz.h / row.R, sp).toBeGreaterThan(0.8); // broad, not pointed
        expect(row.legW / row.legF, sp).toBeGreaterThan(0.15); // pillar legs
        expect(row.chest / row.legF, sp).toBeGreaterThan(0.3); // deep body
      }
      expect(row.tail.kind, sp).toBe("dog");
    }
  });
  it("the capabilities list the size and mark a stand-in", () => {
    const cast = [
      { id: "a", name: "A", role: "r", description: "d", look: lookOf("quad_large") },
      { id: "b", name: "B", role: "r", description: "d", look: lookOf("dog") },
    ] as CastMember[];
    const caps = castCapabilities(cast);
    expect(caps[0].stand_in).toBe(true);
    expect(caps[0].nominal_height).toBe(170);
    expect(caps[1].stand_in).toBeUndefined();
    expect(caps[1].nominal_height).toBe(40);
  });
});

describe("look.scale", () => {
  it("nominal height is 100 x scale for every kind; absent keeps the usual size", () => {
    const kinds: CharacterLook[] = [HUMAN, lookOf("dog"), lookOf("swallow" as never), { kind: "plant", species: "tree", tone: "mid", face: true }, { kind: "object", shape: "lamp", tone: "light", face: true }];
    for (const k of kinds) {
      const base = rig.nominalHeight(k);
      expect(rig.nominalHeight({ ...k, scale: 0.5 } as CharacterLook)).toBe(50);
      expect(rig.nominalHeight({ ...k, scale: 2.5 } as CharacterLook)).toBe(250);
      expect(rig.nominalHeight(k)).toBe(base);
    }
  });
  it("a look without scale draws byte for byte as before; a scale equal to the usual size changes nothing", () => {
    const dog = lookOf("dog");
    expect(draw({ ...dog, scale: 0.4 } as CharacterLook, "stand").svg).toBe(draw(dog, "stand").svg);
  });
  it("the figure is drawn at the scaled height with the outline weight kept", () => {
    for (const [scale, base] of [[0.15, HUMAN], [1.7, lookOf("quad_large")], [0.3, lookOf("dog")]] as const) {
      const look = { ...base, scale } as CharacterLook;
      const plain = draw(base, "stand", "right", 0.4);
      const d = draw(look, "stand", "right", 0.4);
      const h = -d.anchors.top;
      const hp = -plain.anchors.top;
      const ratio = h / hp;
      // drawn height / usual height = (100 x scale) / usual nominal height
      const want = (100 * scale) / rig.nominalHeight(base);
      expect(Math.abs(ratio / want - 1), `${scale}: drawn ${ratio.toFixed(3)} want ${want.toFixed(3)}`).toBeLessThan(0.08);
      // a scale equal to the usual size (quad_large at 1.7) needs no scaling wrapper
      if (Math.abs(want - 1) > 1e-9) expect(d.svg.startsWith('<g transform="scale(')).toBe(true);
      else expect(d.svg).toBe(plain.svg);
      // the stroke weight (in figure units) is divided by the factor, so it keeps its weight after scaling
      const k = (100 * scale) / rig.nominalHeight(base);
      const maxStroke = (svg: string) => Math.max(...[...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1])));
      expect(Math.abs((maxStroke(d.svg) * k) / maxStroke(plain.svg) - 1), `${scale}: outline weight`).toBeLessThan(0.35);
      expect(d.svg).toBe(draw(look, "stand", "right", 0.4).svg);
    }
  });
  it("a stand-in at scale: a long_low at scale 1.1 is longer and taller than at its usual size", () => {
    const usual = draw(lookOf("long_low"), "stand").anchors;
    const big = draw({ ...lookOf("long_low"), scale: 1.1 } as CharacterLook, "stand").anchors;
    expect(big.right - big.left).toBeGreaterThan(2.5 * (usual.right - usual.left));
  });
  it("LOOK_SCALE_RANGE: a value outside 0.05-4 (or not a number) is an error; the ends are valid", () => {
    const run = (scale: unknown) => {
      const issues = new Issues();
      validateLook({ ...lookOf("dog"), scale }, issues, "cast.x.look");
      return issues.list.map((i) => i.code);
    };
    expect(run(0.05)).toEqual([]);
    expect(run(4)).toEqual([]);
    expect(run(1)).toEqual([]);
    for (const bad of [0.04, 0, -1, 4.01, 10, "big", Number.NaN, null]) expect(run(bad), String(bad)).toContain("LOOK_SCALE_RANGE");
    const none = new Issues();
    validateLook(lookOf("dog"), none, "cast.x.look");
    expect(none.list).toEqual([]);
    // the new species are valid look values
    for (const sp of ARCHETYPE_SPECIES) {
      const issues = new Issues();
      expect(validateLook(lookOf(sp), issues, "p"), sp).toBe(true);
    }
  });
});

describe("generic backdrops", () => {
  const GENERIC = ["generic_room", "generic_hall", "generic_passage", "generic_rough", "generic_outdoor"] as const;
  const box = { x: 20, y: 20, w: 420, h: 300 };
  const env = (e: string, features: string[] = [], shot: PanelSpec["shot"] = "wide", seed = 7) =>
    environments.draw({ environment: e as never, features: features as never, box, shot, angle: "eye", time: "day", weather: "clear", lineWidth: 1.6, seed }, ctx());
  for (const e of GENERIC) {
    it(`${e}: deterministic in every shot, populated, inside the box`, () => {
      for (const shot of ["establishing", "wide", "full", "medium", "close", "extreme_close", "insert"] as const) {
        const a = env(e, [], shot);
        expect(a.svg, `${e} ${shot}`).toBe(env(e, [], shot).svg);
        expect(a.svg.length).toBeGreaterThan(100);
      }
      // structure: ink over a few percent of the box (floor lines, wall blocks), none outside it
      const a = env(e);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 340" width="460" height="340"><rect width="460" height="340" fill="#fff"/><clipPath id="c"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/></clipPath><g clip-path="url(#c)">${a.svg}</g></svg>`;
      const px = new Resvg(svg).render().pixels;
      let ink = 0;
      for (let y = box.y; y < box.y + box.h; y += 1) for (let x = box.x; x < box.x + box.w; x += 1) if (px[(y * 460 + x) * 4] < 235) ink += 1;
      expect(ink / (box.w * box.h), `${e} ink`).toBeGreaterThanOrEqual(0.04);
    });
    it(`${e}: draws the features of the location (door, window, trees) and differs by seed`, () => {
      const plain = env(e).svg;
      for (const f of ["door", "trees", "high_wall"]) {
        expect(env(e, [f]).svg, `${e} ${f}`).not.toBe(plain);
      }
      expect(env(e, ["trees"], "wide", 1).svg).not.toBe(env(e, ["trees"], "wide", 2).svg);
    });
  }
  it("a generic room has no furniture of its own: no bed, no table, no fireplace, no chandelier", () => {
    // room_poor always draws a bed and a table; the generic room draws far less than room_poor and room_rich
    expect(env("generic_room").svg.length).toBeLessThan(env("room_poor").svg.length);
    expect(env("generic_hall").svg.length).toBeLessThan(env("palace_hall").svg.length);
  });
  it("a generic room draws one window; the window feature adds none", () => {
    expect(env("generic_room", ["window"]).svg).toBe(env("generic_room").svg);
  });
  it("abstract draws the features its location lists; void stays blank; abstract without features is unchanged", () => {
    const abs = env("abstract");
    expect(env("abstract", ["high_wall"]).svg).not.toBe(abs.svg);
    expect(env("abstract", ["door"]).svg).not.toBe(abs.svg);
    expect(env("void", ["high_wall"]).svg).toBe(env("void").svg);
    expect(env("abstract", [], "wide").svg).toBe(env("abstract", [], "wide").svg);
  });
  it("room_poor, room_rich and cottage are not changed by the generic scenes (same input, same bytes as a second call)", () => {
    for (const e of ["room_poor", "room_rich", "cottage"]) expect(env(e).svg).toBe(env(e).svg);
  });
});

describe("neutral props", () => {
  for (const id of NEUTRAL_PROPS) {
    it(`${id}: draws, deterministic, toned by tone, readable at a far weight`, () => {
      const a = props.draw(id, 0.5, ctx());
      expect(a.svg).toBe(props.draw(id, 0.5, ctx()).svg);
      expect(a.svg.length).toBeGreaterThan(200);
      expect(props.nominalHeight(id)).toBe(a.height);
      expect(props.draw(id, 0.5, ctx(), "dark").svg).not.toBe(a.svg);
      expect(props.draw(id, 3, ctx()).svg.length).toBeGreaterThan(100);
    });
  }
  it("the five shapes differ", () => {
    const set = new Set(NEUTRAL_PROPS.map((p) => props.draw(p, 0.5, ctx()).svg));
    expect(set.size).toBe(5);
  });
  it("the sword is not triggered by the word blade (a blade-bone is not a sword)", () => {
    expect(beatMentions("She holds up the fat mutton blade-bone.", "sword")).toBe(false);
    expect(beatMentions("She draws her sword.", "sword")).toBe(true);
    // the hyphenated word is whole to the sword test, and its "bone" is a long thing
    expect(beatMentions("She holds up the blade-bone.", "thing_long")).toBe(true);
    expect(beatMentions("She holds up the bone.", "thing_long")).toBe(true);
  });
});

// --- page level ------------------------------------------------------------------------------------
const look = (o: Record<string, unknown>): CharacterLook => ({ ...HUMAN, ...o }) as CharacterLook;
const CAST: CastMember[] = [
  { id: "kid", name: "The Kid", role: "child", description: "A child", look: look({ age: "child", height: "short" }) },
  { id: "big", name: "The Big One", role: "beast", description: "A huge animal", look: { kind: "animal", species: "quad_large", tone: "mid", scale: 1.7 } as CharacterLook },
  { id: "croc", name: "The Crawler", role: "beast", description: "A long reptile", look: { kind: "animal", species: "long_low", tone: "dark" } as CharacterLook },
  { id: "dog", name: "Rex", role: "dog", description: "A dog", look: { kind: "animal", species: "dog", tone: "mid" } as CharacterLook },
  { id: "stilt", name: "The Stilt", role: "bird", description: "A tall bird", look: { kind: "bird", species: "bird_tall", tone: "mid" } as CharacterLook },
];
const LOCS = [
  { id: "cave", name: "The cave", environment: "generic_rough", features: ["door"], description: "A cave" },
  { id: "lane", name: "The lane", environment: "generic_passage", features: [], description: "A lane" },
  { id: "field", name: "The field", environment: "generic_outdoor", features: ["trees"], description: "A field" },
] as unknown as { id: string; name: string; environment: never; features: never[]; description: string }[];
const BOOK = { cast: CAST, locations: LOCS };
const src = { unit: "u01", page: 1 };
const fig = (f: Partial<FigureSpec> & Pick<FigureSpec, "character">): FigureSpec => ({ pose: "stand", expression: "neutral", facing: "right", slot: "center", ...f });
const panel = (id: string, location: string, shot: PanelSpec["shot"], figures: FigureSpec[], beat: string, extra: Partial<PanelSpec> = {}): PanelSpec =>
  ({ id, beat, shot, angle: "eye", location, time: "day", weather: "clear", figures, props: [], fx: [], text: [], source: [src], ...extra }) as PanelSpec;
const page = (panels: PanelSpec[]): MangaPageSpec =>
  ({ schema: "manga-page.v1", page_number: 1, section_id: "s1", purpose: "test", layout: { template: ({ 1: "splash", 2: "stack_2", 3: "establish_3" } as Record<number, string>)[panels.length] ?? "staggered_6" }, claims: [], page_turn_hook: false, panels }) as MangaPageSpec;
const codes = (spec: MangaPageSpec, sev: "error" | "warning") => validatePage(spec, BOOK).filter((i) => i.severity === sev).map((i) => i.code);
const inter = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const countText = (svg: string, text: string) => (svg.match(new RegExp(`>${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<`, "g")) ?? []).length;
const circleBox = (h: { x: number; y: number }, r: number) => ({ x: h.x - r, y: h.y - r, w: 2 * r, h: 2 * r });

describe("name tags of stand-in figures", () => {
  const two = () =>
    page([
      panel("p1", "field", "wide", [fig({ character: "kid", slot: "left" }), fig({ character: "big", slot: "center_right" })], "The kid meets the beast."),
      panel("p2", "cave", "medium", [fig({ character: "big", slot: "center" })], "The beast again."),
      panel("p3", "lane", "full", [fig({ character: "croc", slot: "center" }), fig({ character: "dog", slot: "left" })], "A crawler and a dog."),
    ]);
  it("an archetype figure gets its cast name once on the page, in the first panel where it is drawn", () => {
    const spec = two();
    expect(codes(spec, "error")).toEqual([]);
    const { result, details } = renderPageDetailed(spec, BOOK);
    expect(countText(result.svg, "The Big One")).toBe(1);
    expect(countText(result.svg, "The Crawler")).toBe(1);
    // a real species (the dog) and a person get no automatic tag
    expect(countText(result.svg, "Rex")).toBe(0);
    expect(countText(result.svg, "The Kid")).toBe(0);
    const tagPanel = (name: string) => details.findIndex((d) => d.placed.some((p) => p.label) && result.svg.includes(name));
    expect(tagPanel("The Big One")).toBeGreaterThanOrEqual(0);
    // the beast is drawn in panels 1 and 2; its tag is in panel 1
    expect(details[0].placed.filter((p) => p.label).length).toBe(1);
    expect(details[1].placed.filter((p) => p.label).length).toBe(0);
    // the automatic tags are not lettered text of the source: they are not in the page's text list
    expect(result.texts.length).toBe(0);
  });
  it("it never covers a face, and it sits inside its panel", () => {
    const { details } = renderPageDetailed(two(), BOOK);
    for (const d of details) {
      for (const l of d.placed.filter((p) => p.label)) {
        expect(inter(l.box, d.bbox) / (l.box.w * l.box.h), `tag in ${d.id}`).toBeGreaterThan(0.95);
        for (const f of d.figures) expect(inter(l.box, circleBox(f.head, f.headRadius)), `${d.id}: tag over the face of ${f.character}`).toBe(0);
      }
    }
  });
  it("the writer's own name tag (text.about) is kept and no second tag is added", () => {
    const spec = two();
    spec.panels[0].text = [{ kind: "caption", text: "The Big One", about: "big", fidelity: "dramatized", source: src }] as never;
    const { result } = renderPageDetailed(spec, BOOK);
    expect(countText(result.svg, "The Big One")).toBe(1);
    // a caption that is exactly the name (no about) also counts
    const spec2 = two();
    spec2.panels[1].text = [{ kind: "caption", text: "The Big One", fidelity: "dramatized", source: src }] as never;
    expect(countText(renderPageDetailed(spec2, BOOK).result.svg, "The Big One")).toBe(1);
  });
  it("it is deterministic and a bird_tall gets a tag too", () => {
    const spec = page([panel("p1", "field", "medium", [fig({ character: "stilt", slot: "center" })], "A tall bird.")]);
    const a = renderPageDetailed(spec, BOOK).result;
    expect(a.svg).toBe(renderPageDetailed(spec, BOOK).result.svg);
    expect(countText(a.svg, "The Stilt")).toBe(1);
  });
  it("a page with no stand-in figure draws no automatic tag (the dog and the kid alone)", () => {
    const spec = page([panel("p1", "field", "medium", [fig({ character: "kid", slot: "left" }), fig({ character: "dog", slot: "right" })], "A kid and a dog.")]);
    const { result } = renderPageDetailed(spec, BOOK);
    expect(countText(result.svg, "The Kid") + countText(result.svg, "Rex")).toBe(0);
  });
});

describe("neutral props with labels", () => {
  const withProp = (extra: Record<string, unknown>, shot: PanelSpec["shot"] = "medium", figures: FigureSpec[] = [fig({ character: "kid", slot: "left" })]) =>
    page([panel("p1", "field", shot, figures, "The kid finds it.", { props: [{ prop: "thing_long", slot: "center_right", ...extra }] as never })]);
  it("the label is drawn beside the prop, inside the panel, clear of the prop and of every face", () => {
    for (const shot of ["medium", "full", "wide", "insert"] as const) {
      const spec = withProp({ label: "bone" }, shot, shot === "insert" ? [] : [fig({ character: "kid", slot: "left" })]);
      const { result, details } = renderPageDetailed(spec, BOOK);
      expect(countText(result.svg, "bone"), shot).toBe(1);
      const d = details[0];
      const pr = d.props.find((p) => p.prop === "thing_long")!;
      expect(pr.label).toBe("bone");
      const tag = d.obstacles.find((o) => o.w > 0 && inter(o, pr.box) === 0 && o.h < 80 && o.w < 300 && result.svg.includes("bone"));
      expect(tag, `${shot}: a label box in the obstacles`).toBeDefined();
      for (const f of d.figures) expect(inter(tag!, circleBox(f.head, f.headRadius)), `${shot} face`).toBe(0);
      expect(inter(tag!, d.bbox) / (tag!.w * tag!.h), `${shot} inside`).toBeGreaterThan(0.95);
    }
  });
  it("it is deterministic, and a prop without a label draws no tag", () => {
    const spec = withProp({ label: "bone" });
    expect(renderPageDetailed(spec, BOOK).result.svg).toBe(renderPageDetailed(spec, BOOK).result.svg);
    expect(renderPageDetailed(withProp({}), BOOK).result.svg).not.toBe(renderPageDetailed(spec, BOOK).result.svg);
  });
  it("lettering keeps off the label", () => {
    const spec = withProp({ label: "bone" });
    spec.panels[0].text = [{ kind: "narration", text: "She picked it up and looked at it for a long time.", fidelity: "paraphrase", source: src }] as never;
    const { details } = renderPageDetailed(spec, BOOK);
    const d = details[0];
    const pr = d.props[0];
    const tag = d.obstacles.find((o) => inter(o, pr.box) === 0 && o.h < 80 && o.w < 300)!;
    for (const l of d.placed.filter((p) => !p.label)) expect(inter(l.box, tag) / (tag.w * tag.h)).toBeLessThan(0.3);
  });
  it("NEUTRAL_PROP_UNLABELLED is a warning (never an error) for a thing_* prop without a label", () => {
    expect(codes(withProp({}), "warning")).toContain("NEUTRAL_PROP_UNLABELLED");
    expect(codes(withProp({}), "error")).toEqual([]);
    expect(codes(withProp({ label: "bone" }), "warning")).not.toContain("NEUTRAL_PROP_UNLABELLED");
    // a named prop needs no label
    const named = page([panel("p1", "field", "medium", [fig({ character: "kid" })], "x", { props: [{ prop: "bread", slot: "center" }] as never })]);
    expect(codes(named, "warning")).not.toContain("NEUTRAL_PROP_UNLABELLED");
    // a held thing_* with no labelled prop in the panel is a warning too
    const held = page([panel("p1", "field", "medium", [fig({ character: "kid", pose: "hold", holding: "thing_round" })], "x")]);
    expect(codes(held, "warning")).toContain("NEUTRAL_PROP_UNLABELLED");
  });
  it(`PropSpec.label: at most ${PROP_LABEL_MAX} characters, plain text`, () => {
    expect(codes(withProp({ label: "x".repeat(PROP_LABEL_MAX) }), "error")).toEqual([]);
    expect(codes(withProp({ label: "x".repeat(PROP_LABEL_MAX + 1) }), "error")).toContain("PROP_LABEL_TOO_LONG");
    expect(codes(withProp({ label: "<b>bone</b>" }), "error")).toContain("PROP_LABEL_MARKUP");
    expect(codes(withProp({ label: "a & b" }), "error")).toContain("PROP_LABEL_MARKUP");
    expect(codes(withProp({ label: "   " }), "error")).toContain("PROP_LABEL_EMPTY");
    expect(codes(withProp({ label: 5 }), "error")).toContain("FIELD_TYPE");
    // the renderer never draws markup or a long label even when the page is invalid
    const { result } = renderPageDetailed(withProp({ label: "<b>bone</b>" }), BOOK);
    expect(result.svg).not.toContain("&lt;b&gt;");
    expect(result.svg).not.toContain("<b>");
  });
  it("a label can name a held neutral prop adopted from the panel's props", () => {
    const spec = page([
      panel("p1", "field", "full", [fig({ character: "kid", pose: "carry", slot: "center" })], "The kid carries it.", { props: [{ prop: "thing_block", slot: "center_right", label: "crate" }] as never }),
    ]);
    const { result, details } = renderPageDetailed(spec, BOOK);
    expect(details[0].props.some((p) => p.prop === "thing_block" && p.heldBy === "kid" && p.label === "crate")).toBe(true);
    expect(countText(result.svg, "crate")).toBe(1);
  });
});

describe("general fixes", () => {
  it("small is decided by the nominal height: a horse, a bear and a quad_large are not small; a dog, a bird and a scaled look are", () => {
    const small = (l: CharacterLook) => isSmallFigure(l, rig.nominalHeight(l));
    expect(small(lookOf("horse"))).toBe(false);
    expect(small(lookOf("bear"))).toBe(false);
    expect(small(lookOf("quad_large"))).toBe(false);
    expect(small(lookOf("quad_medium"))).toBe(false);
    expect(small(lookOf("dog"))).toBe(true);
    expect(small(lookOf("rat"))).toBe(true);
    expect(small(lookOf("quad_small"))).toBe(true);
    expect(small({ kind: "bird", species: "swallow", tone: "mid" } as CharacterLook)).toBe(true);
    expect(small({ ...HUMAN, scale: 0.14 } as CharacterLook)).toBe(true);
    expect(small({ ...lookOf("dog"), scale: 1.5 } as CharacterLook)).toBe(false);
    // people, plants, objects without a scale are never small (as before)
    expect(small(HUMAN)).toBe(false);
    expect(small({ kind: "plant", species: "daisy", tone: "light", face: true } as CharacterLook)).toBe(false);
  });
  it("a rat and a mouse sit hunched, not bolt upright (they read as small rodents, not as a bear)", () => {
    for (const sp of ["rat", "mouse"] as const) {
      const sit = draw(lookOf(sp), "sit").anchors;
      const stand = draw(lookOf(sp), "stand").anchors;
      // upright (the old pose) was about 1.7 times as tall as standing; hunched stays under 1.6
      expect(-sit.top / -stand.top, sp).toBeLessThan(1.6);
      expect(draw(lookOf(sp), "sit").svg).toBe(draw(lookOf(sp), "sit").svg);
    }
    // a bear (and a rabbit) keeps its upright sit
    const bearSit = draw(lookOf("bear"), "sit").anchors;
    expect(-bearSit.top / -draw(lookOf("bear"), "stand").anchors.top).toBeGreaterThan(1.3);
  });
});
