/**
 * Renderer 0.5.0: legibility of heroes, key props, tails and settings (the judges' hero_tiny,
 * tail_wrong, statue_staging and setting_wrong kinds). Calibration numbers are in
 * docs/launch/W2-renderer.md; these tests keep the behaviour.
 */
import { describe, expect, it } from "vitest";
import type { FigureSpec, MangaPageSpec, PanelSpec } from "../src/contracts.js";
import { renderPageDetailed } from "../src/index.js";
import { composePanel, HERO_MIN_HEAD_RADIUS, HERO_SMALL_MIN_HEAD_RADIUS, KEY_PROP_MIN_HEIGHT, resolveEnvironment } from "../src/scene/index.js";
import { BOOK } from "./fixtures/happy-prince.js";

const src = { unit: "u05", page: 3 };
const fig = (f: Partial<FigureSpec> & Pick<FigureSpec, "character">): FigureSpec => ({ pose: "stand", expression: "neutral", facing: "right", slot: "center", ...f });
const panel = (p: Partial<PanelSpec>): PanelSpec => ({ id: "p1", beat: "A test beat.", shot: "wide", angle: "eye", location: "square", time: "day", figures: [], props: [], fx: [], text: [], source: [src], ...p });
const W = { x: 40, y: 40, w: 920, h: 600 };
const compose = (p: PanelSpec, book = BOOK) =>
  composePanel({
    panel: p,
    index: 0,
    polygon: [
      { x: W.x, y: W.y },
      { x: W.x + W.w, y: W.y },
      { x: W.x + W.w, y: W.y + W.h },
      { x: W.x, y: W.y + W.h },
    ],
    bbox: W,
    book,
    idPrefix: "t-",
    textLoad: 0,
    rtl: false,
  });
const page = (p: PanelSpec): MangaPageSpec => ({ schema: "manga-page.v1", page_number: 3, section_id: "s2", purpose: "A test page.", layout: { template: "splash" }, claims: ["c05"], page_turn_hook: false, panels: [p] });

describe("hero floor", () => {
  it("a small creature named in the beat reads in a wide shot, at any depth", () => {
    for (const depth of ["back", "mid"] as const) {
      const c = compose(panel({ beat: "The Swallow flies over the square.", figures: [fig({ character: "swallow", pose: "fly", depth })] }));
      expect(c.figures[0].headRadius).toBeGreaterThanOrEqual(HERO_SMALL_MIN_HEAD_RADIUS);
    }
  });

  it("an establishing shot is exempt: the same hero is smaller there than in a wide shot", () => {
    const two = (shot: PanelSpec["shot"]) =>
      compose(panel({ shot, beat: "The Swallow flies beside the Prince.", figures: [fig({ character: "prince" }), fig({ character: "swallow", pose: "fly", depth: "back", slot: "left" })] })).figures.find((f) => f.character === "swallow")!.headRadius;
    expect(two("establishing")).toBeLessThan(two("wide"));
  });

  it("a person named in the beat has a head of at least the hero floor in a wide shot", () => {
    const c = compose(panel({ location: "poor_room", beat: "The Seamstress sews by the bed.", figures: [fig({ character: "seamstress" })] }));
    expect(c.figures[0].headRadius).toBeGreaterThanOrEqual(HERO_MIN_HEAD_RADIUS);
  });

  it("a hero at the statue's feet is no speck beside the statue", () => {
    const c = compose(panel({ beat: "The Swallow rests between the Prince's feet.", figures: [fig({ character: "prince" }), fig({ character: "swallow", on: { target: "prince", part: "feet" } })] }));
    const sw = c.figures.find((f) => f.character === "swallow")!;
    expect(sw.headRadius).toBeGreaterThanOrEqual(HERO_SMALL_MIN_HEAD_RADIUS);
  });
});

describe("key prop floor", () => {
  it("the object of the beat is at least the floor share of the panel height in a wide shot", () => {
    const c = compose(panel({ location: "river", beat: "The Swallow looks at the ruby on the ground.", figures: [fig({ character: "swallow" })], props: [{ prop: "gem", slot: "left", depth: "back", tone: "black" }] }));
    const key = c.props.find((p) => p.key);
    expect(key).toBeDefined();
    expect(key!.box.h / W.h).toBeGreaterThanOrEqual(KEY_PROP_MIN_HEIGHT - 0.01);
  });
});

describe("statue on its column", () => {
  it("a statue figure in a wide shot of a place with no column is drawn at the column place, with a warning", () => {
    const c = compose(panel({ location: "garret", beat: "The Prince looks down over the city.", figures: [fig({ character: "prince" })] }));
    expect(c.figures[0].staging).toBe("on:statue_column");
    expect(c.issues.map((i) => i.code)).toContain("STATUE_LOCATION_SWAPPED");
  });

  it("is not swapped in close shots, when the statue lies, or when the beat says the column is empty", () => {
    const close = compose(panel({ shot: "medium", location: "garret", figures: [fig({ character: "prince" })] }));
    expect(close.issues.map((i) => i.code)).not.toContain("STATUE_LOCATION_SWAPPED");
    const lie = compose(panel({ location: "garret", figures: [fig({ character: "prince", pose: "lie" })] }));
    expect(lie.issues.map((i) => i.code)).not.toContain("STATUE_LOCATION_SWAPPED");
    const gone = compose(panel({ location: "garret", beat: "The statue is pulled down and melted.", figures: [fig({ character: "prince" })] }));
    expect(gone.issues.map((i) => i.code)).not.toContain("STATUE_LOCATION_SWAPPED");
  });
});

describe("settings", () => {
  it("a place that names heaven or a dust heap is drawn as sky or waste ground, not blank paper", () => {
    expect(resolveEnvironment({ environment: "abstract", name: "Paradise", description: "" })).toBe("sky");
    expect(resolveEnvironment({ environment: "void", name: "The dust-heap", description: "" })).toBe("ditch");
    expect(resolveEnvironment({ environment: "garden", name: "Paradise garden", description: "" })).toBe("garden");
  });

  it("the void backdrop is never a blank sheet", () => {
    const book = { cast: BOOK.cast, locations: [{ id: "nowhere", name: "Nowhere", environment: "void" as const, features: [], description: "" }] };
    const c = compose(panel({ location: "nowhere", figures: [fig({ character: "seamstress" })] }), book);
    // a wash, a horizon line and a ground band: more than the single paper rectangle
    expect((c.content.match(/<path/g) ?? []).length).toBeGreaterThan(8);
  });
});

describe("page checks and renders", () => {
  it("SPEAKER_OFF_PANEL_LIMIT warns for a speaker the page never draws", () => {
    const spec = page(panel({ shot: "medium", figures: [fig({ character: "swallow" })], text: [{ kind: "speech", speaker: "reed", text: "Shall I?", fidelity: "dramatized", source: src }] }));
    const { result } = renderPageDetailed(spec, BOOK);
    expect(result.issues.map((i) => i.code)).toContain("SPEAKER_OFF_PANEL_LIMIT");
    expect(result.issues.find((i) => i.code === "SPEAKER_OFF_PANEL_LIMIT")!.severity).toBe("warning");
  });

  it("TAIL_CROSSES_PROP is a warning, never an error", () => {
    const spec = page(panel({ shot: "wide", figures: [fig({ character: "seamstress", slot: "right" })], props: [{ prop: "cup", slot: "center_right", depth: "fore" }], text: [{ kind: "speech", speaker: "seamstress", text: "Come in.", fidelity: "dramatized", source: src }] }));
    const { result } = renderPageDetailed(spec, BOOK);
    for (const i of result.issues.filter((x) => x.code === "TAIL_CROSSES_PROP")) expect(i.severity).toBe("warning");
  });
});
