/**
 * Renderer 0.5.0: legibility of heroes, key props, tails and settings (the judges' hero_tiny,
 * tail_wrong, statue_staging and setting_wrong kinds). Calibration numbers are in
 * docs/launch/W2-renderer.md; these tests keep the behaviour.
 */
import { describe, expect, it } from "vitest";
import type { FigureSpec, MangaPageSpec, PanelSpec } from "../src/contracts.js";
import { renderPageDetailed } from "../src/index.js";
import { letterPanel, tailSegment } from "../src/lettering/index.js";
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
  it("a small creature named in the beat, drawn far behind two big figures, still reads (0.4.0: head radius 3.3 wide, 6.1 full)", () => {
    for (const shot of ["wide", "full"] as const) {
      const c = compose(panel({ shot, beat: "The Swallow waits there.", figures: [fig({ character: "prince", slot: "left", depth: "fore" }), fig({ character: "seamstress", slot: "right", depth: "fore" }), fig({ character: "swallow", pose: "fly", slot: "center", depth: "back" })] }));
      expect(c.figures.find((f) => f.character === "swallow")!.headRadius).toBeGreaterThanOrEqual(12);
    }
  });

  it("an establishing shot is exempt: the same hero is smaller there than in a wide shot", () => {
    const two = (shot: PanelSpec["shot"]) =>
      compose(panel({ shot, beat: "The Swallow flies beside the Prince.", figures: [fig({ character: "prince" }), fig({ character: "swallow", pose: "fly", depth: "back", slot: "left" })] })).figures.find((f) => f.character === "swallow")!.headRadius;
    expect(two("establishing")).toBeLessThan(two("wide"));
  });

  it("a person named in the beat is lifted above the size an unfloored layout gives (0.4.0: head radius 11.0)", () => {
    const c = compose(panel({ beat: "The Seamstress waits there.", figures: [fig({ character: "prince", slot: "left", depth: "fore" }), fig({ character: "boy", slot: "right", depth: "fore" }), fig({ character: "seamstress", slot: "center", depth: "back" })] }));
    expect(c.figures.find((f) => f.character === "seamstress")!.headRadius).toBeGreaterThanOrEqual(13);
    expect(HERO_MIN_HEAD_RADIUS).toBeGreaterThan(13);
  });

  it("a hero at the statue's feet is no speck beside the statue", () => {
    const c = compose(panel({ beat: "The Swallow rests between the Prince's feet.", figures: [fig({ character: "prince" }), fig({ character: "swallow", on: { target: "prince", part: "feet" } })] }));
    const sw = c.figures.find((f) => f.character === "swallow")!;
    expect(sw.headRadius).toBeGreaterThanOrEqual(12);
  });
});

describe("key prop floor", () => {
  it("the object of the beat is at least the floor share of the panel height in a wide shot", () => {
    for (const prop of ["gem", "cup", "rose"] as const) {
      for (const depth of ["back", "mid"] as const) {
        const c = compose(panel({ location: "river", beat: `The Swallow looks at the ${prop} on the ground.`, figures: [fig({ character: "prince" }), fig({ character: "seamstress", slot: "right" })], props: [{ prop, slot: "left", depth }] }));
        const key = c.props.find((p) => p.key);
        expect(key).toBeDefined();
        expect(key!.box.h / W.h).toBeGreaterThanOrEqual(KEY_PROP_MIN_HEIGHT - 0.01);
      }
    }
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
    // no figure: the count is the backdrop alone (a wash, a horizon line, a ground band, grass ticks)
    const c = compose(panel({ location: "nowhere", figures: [] }), book);
    expect((c.content.match(/<path/g) ?? []).length).toBeGreaterThan(8);
    expect(c.content).toContain("#8c8c8c");
  });
});

describe("page checks and renders", () => {
  it("SPEAKER_OFF_PANEL_LIMIT warns for a speaker the page never draws", () => {
    const spec = page(panel({ shot: "medium", figures: [fig({ character: "swallow" })], text: [{ kind: "speech", speaker: "reed", text: "Shall I?", fidelity: "dramatized", source: src }] }));
    const { result } = renderPageDetailed(spec, BOOK);
    expect(result.issues.map((i) => i.code)).toContain("SPEAKER_OFF_PANEL_LIMIT");
    expect(result.issues.find((i) => i.code === "SPEAKER_OFF_PANEL_LIMIT")!.severity).toBe("warning");
  });

  it("TAIL_CROSSES_PROP is a warning when a tail runs over a prop, and skips the speaker's own prop", () => {
    const polygon = [
      { x: 100, y: 100 },
      { x: 600, y: 100 },
      { x: 600, y: 500 },
      { x: 100, y: 500 },
    ];
    const b = { character: "b", head: { x: 350, y: 330 }, headRadius: 38, mouth: { x: 335, y: 345 }, body: { x: 310, y: 292, w: 80, h: 208 } };
    const base = {
      panelId: "p1",
      polygon,
      bbox: { x: 100, y: 100, w: 500, h: 400 },
      texts: [{ kind: "speech" as const, speaker: "b", text: "Good evening to you all.", fidelity: "dramatized" as const }],
      speakers: [b],
      heads: [{ character: "b", center: b.head, radius: b.headRadius }],
      bodies: [b.body],
      seed: 3,
    };
    const seg = tailSegment(letterPanel(base).placed[0])!;
    const mid = { x: (seg[0].x + seg[1].x) / 2, y: (seg[0].y + seg[1].y) / 2 };
    const box = { x: mid.x - 20, y: mid.y - 20, w: 40, h: 40 };
    const hit = letterPanel({ ...base, props: [{ prop: "cup", box }] }).issues.filter((i) => i.code === "TAIL_CROSSES_PROP");
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe("warning");
    const held = letterPanel({ ...base, props: [{ prop: "cup", box, heldBy: "b" }] }).issues;
    expect(held.map((i) => i.code)).not.toContain("TAIL_CROSSES_PROP");
  });
});
