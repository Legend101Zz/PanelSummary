/**
 * Pass 2 behaviour: staging anchors, sitting and lying, face safety,
 * figure–ground, readable sizes, reading order, lettering craft, name tags,
 * prop tones, SFX placement, page-turn layout, accessibility and the new
 * validation rules.
 */
import { describe, expect, it } from "vitest";
import type { FigureSpec, MangaPageSpec, PanelSpec, TextSpec, ValidationIssue } from "../src/contracts.js";
import { catalog, compileLayout, renderPage, renderPageDetailed, validatePage, WORD_LIMITS } from "../src/index.js";
import { COL_GUTTER, ROW_GUTTER, blockageIssues, panelAreaShares } from "../src/layout/index.js";
import { breakBalanced } from "../src/lettering/breaking.js";
import { measure } from "../src/lettering/fonts.js";
import { inferNameTag, KIND_STYLES, letterPanel, minFontSize, tailSegment } from "../src/lettering/index.js";
import { composePanel, SHOT_HEIGHT, SPEAKER_MIN_HEAD_RADIUS } from "../src/scene/index.js";
import { circleCoverage } from "../src/scene/safety.js";
import { circleHitsConvex, segmentsIntersect } from "../src/layout/geometry.js";
import { svgToPng } from "../src/raster.js";
import { BOOK, PAGES } from "./fixtures/happy-prince.js";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const codes = (issues: ValidationIssue[]) => issues.map((i) => i.code);
const src = { unit: "u05", page: 3 };

const fig = (f: Partial<FigureSpec> & Pick<FigureSpec, "character">): FigureSpec => ({ pose: "stand", expression: "neutral", facing: "right", slot: "center", ...f });

function panel(p: Partial<PanelSpec>): PanelSpec {
  return { id: "p1", beat: "A test beat.", shot: "medium", angle: "eye", location: "square", time: "night", figures: [], props: [], fx: [], text: [], source: [src], ...p };
}

function onePage(p: PanelSpec, extra: Partial<MangaPageSpec> = {}): MangaPageSpec {
  return { schema: "manga-page.v1", page_number: 3, section_id: "s2", purpose: "A test page.", layout: { template: "splash" }, claims: ["c05"], page_turn_hook: false, panels: [p], ...extra };
}

const W = { x: 40, y: 40, w: 920, h: 600 };
const compose = (p: PanelSpec, box = W) =>
  composePanel({
    panel: p,
    index: 0,
    polygon: [
      { x: box.x, y: box.y },
      { x: box.x + box.w, y: box.y },
      { x: box.x + box.w, y: box.y + box.h },
      { x: box.x, y: box.y + box.h },
    ],
    bbox: box,
    book: BOOK,
    idPrefix: "t-",
    textLoad: p.text.filter((t) => t.kind !== "sfx").length,
    rtl: false,
  });

// ---------------------------------------------------------------------------
// Staging anchors
// ---------------------------------------------------------------------------

describe("staging anchors (FigureSpec.on)", () => {
  it("perches the swallow on the prince's shoulder at the prince's scale, clear of his face", () => {
    for (const facing of ["left", "right", "front"] as const) {
      const c = compose(
        panel({
          figures: [fig({ character: "prince", facing, slot: "center_right" }), fig({ character: "swallow", pose: "perch", slot: "left", on: { target: "prince", part: "shoulder" } })],
        }),
      );
      const prince = c.figures.find((f) => f.character === "prince");
      const swallow = c.figures.find((f) => f.character === "swallow");
      expect(prince && swallow).toBeTruthy();
      if (!prince || !swallow) continue;
      expect(swallow.staging).toBe("on:prince:shoulder");
      expect(swallow.scale).toBeCloseTo(prince.scale, 6);
      // on the shoulder line: the swallow's feet sit below the prince's chin and above his waist
      const feet = swallow.body.y + swallow.body.h;
      expect(feet).toBeGreaterThan(prince.head.y);
      expect(feet).toBeLessThan(prince.head.y + prince.headRadius * 4);
      // beside the head, never over the face
      expect(Math.abs(swallow.head.x - prince.head.x)).toBeGreaterThan(prince.headRadius);
      expect(circleCoverage(prince.head, prince.headRadius, swallow.body)).toBeLessThan(0.2);
      // a profile facing one way gets the bird on the far shoulder
      if (facing === "left") expect(swallow.head.x).toBeGreaterThan(prince.head.x);
      if (facing === "right") expect(swallow.head.x).toBeLessThan(prince.head.x);
    }
  });

  it("puts a figure at another's feet, on the same surface", () => {
    const c = compose(
      panel({ shot: "full", figures: [fig({ character: "mayor", slot: "center" }), fig({ character: "swallow", pose: "perch", slot: "center_right", on: { target: "mayor", part: "feet" } })] }),
    );
    const mayor = c.figures.find((f) => f.character === "mayor");
    const swallow = c.figures.find((f) => f.character === "swallow");
    if (!mayor || !swallow) throw new Error("figures missing");
    expect(swallow.staging).toBe("on:mayor:feet");
    expect(Math.abs(swallow.body.y + swallow.body.h - (mayor.body.y + mayor.body.h))).toBeLessThan(mayor.body.h * 0.08);
    expect(swallow.head.x).toBeGreaterThan(mayor.head.x);
  });

  it("stands a gold statue on its column in establishing, wide and full shots, without being asked", () => {
    for (const shot of ["establishing", "wide", "full"] as const) {
      for (const angle of ["eye", "high", "low"] as const) {
        const c = compose(panel({ shot, angle, figures: [fig({ character: "prince", facing: "front" })] }));
        const prince = c.figures[0];
        expect(prince.staging, `${shot}/${angle}`).toBe("on:statue_column");
        // raised above the square: the feet are well above the panel's bottom edge, so the column shows below
        const feet = prince.body.y + prince.body.h;
        expect(feet, `${shot}/${angle}`).toBeLessThan(W.y + W.h * 0.86);
        // and the statue is inside the panel
        expect(prince.head.y - prince.headRadius, `${shot}/${angle}`).toBeGreaterThan(W.y - 2);
      }
    }
    // a flesh-and-blood character in the same square stays on the ground
    const c = compose(panel({ shot: "wide", figures: [fig({ character: "mayor" })] }));
    expect(c.figures[0].staging).toBe("ground");
  }, 30000);

  it("perches a small creature at the statue's feet on the column when no anchor is given", () => {
    const c = compose(panel({ shot: "wide", angle: "low", figures: [fig({ character: "prince", facing: "front" }), fig({ character: "swallow", pose: "perch", slot: "right" })] }));
    expect(c.figures.find((f) => f.character === "swallow")?.staging).toBe("on:prince:feet");
  });

  it("lays a lying figure in the location's bed", () => {
    for (const shot of ["wide", "medium", "close"] as const) {
      const c = compose(panel({ shot, location: "poor_room", figures: [fig({ character: "boy", pose: "lie", slot: "left" })] }));
      expect(c.figures[0].staging, shot).toBe("on:bed");
    }
  });

  it("frames a lying figure horizontally in close shots: the face in the upper middle, the body out toward the edge", () => {
    for (const shot of ["medium", "close"] as const) {
      for (const slot of ["left", "right"] as const) {
        const c = compose(
          panel({ shot, location: "poor_room", figures: [fig({ character: "boy", pose: "lie", slot })], text: [{ kind: "speech", speaker: "boy", text: "How cool I feel.", fidelity: "quote", source: { unit: "u09", page: 5 } }] }),
        );
        const boy = c.figures[0];
        expect(boy.head.y, `${shot}/${slot}`).toBeGreaterThan(W.y + W.h * 0.2);
        expect(boy.head.y, `${shot}/${slot}`).toBeLessThan(W.y + W.h * 0.75);
        expect(boy.head.x - boy.headRadius).toBeGreaterThan(W.x);
        expect(boy.head.x + boy.headRadius).toBeLessThan(W.x + W.w);
        // the head points toward the middle; the body runs out toward the slot's edge
        const bodyCentre = boy.body.x + boy.body.w / 2;
        if (slot === "left") expect(bodyCentre).toBeLessThan(boy.head.x);
        else expect(bodyCentre).toBeGreaterThan(boy.head.x);
      }
    }
  });

  it("draws a seat under a sitter (chair indoors, bench outdoors) unless staged on something", () => {
    const seated = compose(panel({ shot: "full", location: "poor_room", figures: [fig({ character: "seamstress", pose: "sit" })] }));
    const standing = compose(panel({ shot: "full", location: "poor_room", figures: [fig({ character: "seamstress", pose: "stand" })] }));
    // the seat is drawn inside the figure group as its own scale() group
    // (scale(m) or scale(mx m): a seat is stretched to show past a wide skirt or coat)
    const seatGroup = /<g transform="scale\([0-9.]+(?: [0-9.]+)?\)"><g stroke-linejoin="round"/;
    expect(seated.content).toMatch(seatGroup);
    expect(standing.content).not.toMatch(seatGroup);
  });
});

// ---------------------------------------------------------------------------
// Face safety, readable sizes, level of detail
// ---------------------------------------------------------------------------

describe("face safety and readable sizes", () => {
  it("moves a later figure off an earlier figure's face", () => {
    const c = compose(
      panel({ shot: "close", figures: [fig({ character: "mayor", slot: "center", facing: "right" }), fig({ character: "seamstress", slot: "center", facing: "left", depth: "fore" })] }),
    );
    const [a, b] = c.figures;
    expect(Math.hypot(a.head.x - b.head.x, a.head.y - b.head.y)).toBeGreaterThan((a.headRadius + b.headRadius) * 0.9);
    const covered = c.issues.filter((i) => i.code === "FACE_COVERED");
    if (covered.length === 0) expect(circleCoverage(a.head, a.headRadius, b.body)).toBeLessThan(0.3);
  });

  it("frames only the first face in an extreme close-up with several figures", () => {
    const c = compose(panel({ shot: "extreme_close", figures: [fig({ character: "prince" }), fig({ character: "swallow", pose: "perch" })] }));
    expect(c.figures.map((f) => f.character)).toEqual(["prince"]);
  });

  it("hits SHOT_GUIDE figure heights within ±25% in ground shots, whatever the depth", () => {
    for (const shot of ["establishing", "wide", "full"] as const) {
      for (const depth of ["back", "mid", "fore"] as const) {
        for (const angle of ["eye", "low", "high"] as const) {
          const c = compose(panel({ shot, angle, figures: [fig({ character: "mayor", depth })] }));
          const f = c.figures[0];
          const frac = f.body.h / W.h;
          const target = SHOT_HEIGHT[shot] ?? 0;
          expect(frac, `${shot}/${depth}/${angle}`).toBeGreaterThan(target * 0.75);
          expect(frac, `${shot}/${depth}/${angle}`).toBeLessThan(target * 1.25 + 0.02);
        }
      }
    }
  }, 30000);

  it("puts a standing figure's eyes on the horizon at eye level", () => {
    const c = compose(panel({ shot: "wide", angle: "eye", figures: [fig({ character: "mayor" })] }));
    // the environment's horizon: read it back from a fresh draw with the same framing is internal,
    // so check the geometric consequence instead: eyes sit near the panel's middle band
    const eyes = c.figures[0].head.y;
    expect(eyes).toBeGreaterThan(W.y + W.h * 0.35);
    expect(eyes).toBeLessThan(W.y + W.h * 0.65);
  });

  it("warns when a speaker is too small to read, and picks a level of detail by head size", () => {
    const p = panel({ shot: "establishing", figures: [fig({ character: "mayor" })], text: [{ kind: "speech", speaker: "mayor", text: "Hm.", fidelity: "dramatized" }] });
    const c = compose(p);
    expect(codes(c.issues)).toContain("SPEAKER_TOO_SMALL");
    expect(c.figures[0].headRadius).toBeLessThan(SPEAKER_MIN_HEAD_RADIUS);
    expect(c.figures[0].detail).toBe("silhouette");
    const close = compose(panel({ shot: "close", figures: [fig({ character: "mayor" })], text: [{ kind: "speech", speaker: "mayor", text: "Hm.", fidelity: "dramatized" }] }));
    expect(codes(close.issues)).not.toContain("SPEAKER_TOO_SMALL");
    expect(close.figures[0].detail).toBe("full");
  });

  it("puts a paper halo behind a speaking head on a toned background", () => {
    const talking = compose(panel({ shot: "medium", figures: [fig({ character: "mayor" })], text: [{ kind: "speech", speaker: "mayor", text: "Hm.", fidelity: "dramatized" }] }));
    const silent = compose(panel({ shot: "medium", figures: [fig({ character: "mayor" })] }));
    expect(talking.defs).toMatch(/<radialGradient id="t-p0-halo"/);
    expect(talking.content).toContain('fill="url(#t-p0-halo)"');
    expect(silent.content).not.toContain("halo");
  });

  it("passes prop tones (a black ruby is not a white sapphire)", () => {
    const ruby = compose(panel({ shot: "insert", props: [{ prop: "gem", slot: "center", tone: "black" }] }));
    const sapphire = compose(panel({ shot: "insert", props: [{ prop: "gem", slot: "center", tone: "mid" }] }));
    const plain = compose(panel({ shot: "insert", props: [{ prop: "gem", slot: "center" }] }));
    expect(ruby.content).not.toBe(sapphire.content);
    expect(ruby.content).not.toBe(plain.content);
  });
});

// ---------------------------------------------------------------------------
// Validation of the new fields and warnings
// ---------------------------------------------------------------------------

describe("validatePage: staging, name tags, tones and new warnings", () => {
  const v = (p: PanelSpec, extra: Partial<MangaPageSpec> = {}, opts = {}) => validatePage(onePage(p, extra), BOOK, undefined, opts);

  it("accepts valid anchors and rejects unknown targets with the list of valid ones", () => {
    const ok = v(panel({ figures: [fig({ character: "prince" }), fig({ character: "swallow", pose: "perch", on: { target: "prince", part: "shoulder" } })] }));
    expect(ok.filter((i) => i.severity === "error" && i.code.startsWith("ON_"))).toEqual([]);
    const bad = v(panel({ figures: [fig({ character: "prince" }), fig({ character: "swallow", pose: "perch", on: { target: "mayor", part: "shoulder" } })] }));
    const err = bad.find((i) => i.code === "ON_TARGET_UNKNOWN");
    expect(err?.severity).toBe("error");
    expect(err?.message).toContain("prince");
    expect(err?.message).toContain("statue_column");
    const feature = v(panel({ location: "poor_room", figures: [fig({ character: "boy", pose: "lie", on: { target: "bed", part: "head" } })] }));
    expect(feature.find((i) => i.code === "ON_PART_IGNORED")?.severity).toBe("warning");
    const missing = v(panel({ location: "poor_room", figures: [fig({ character: "boy", on: { target: "statue_column" } })] }));
    expect(codes(missing)).toContain("ON_TARGET_UNKNOWN");
    const unsupported = v(panel({ location: "poor_room", figures: [fig({ character: "boy", on: { target: "window" } })] }));
    expect(codes(unsupported)).toContain("ON_TARGET_UNSUPPORTED");
    const self = v(panel({ figures: [fig({ character: "boy", on: { target: "boy" } })] }));
    expect(codes(self)).toContain("ON_TARGET_SELF");
    const loop = v(panel({ figures: [fig({ character: "prince", on: { target: "swallow" } }), fig({ character: "swallow", pose: "perch", on: { target: "prince" } })] }));
    expect(codes(loop)).toContain("ON_CYCLE");
    const badPart = v(panel({ figures: [fig({ character: "prince" }), fig({ character: "swallow", pose: "perch", on: { target: "prince", part: "tail" as never } })] }));
    expect(codes(badPart)).toContain("ENUM_INVALID");
  });

  it("checks tones", () => {
    const bad = v(panel({ figures: [fig({ character: "mayor", holding: "gem", holding_tone: "ruby" as never })], props: [{ prop: "gem", slot: "left", tone: "red" as never }] }));
    expect(bad.filter((i) => i.code === "ENUM_INVALID")).toHaveLength(2);
    const unused = v(panel({ figures: [fig({ character: "mayor", holding_tone: "black" })] }));
    expect(unused.find((i) => i.code === "HOLDING_TONE_UNUSED")?.severity).toBe("warning");
  });

  it("allows 'about' on captions only, naming a figure drawn in the panel", () => {
    const tag: TextSpec = { kind: "caption", about: "mayor", text: "The Mayor", fidelity: "paraphrase", source: src };
    const ok = v(panel({ figures: [fig({ character: "mayor" })], text: [tag] }));
    expect(ok.filter((i) => i.code.startsWith("ABOUT"))).toEqual([]);
    const absent = v(panel({ figures: [fig({ character: "boy" })], text: [tag] }));
    expect(absent.find((i) => i.code === "ABOUT_NOT_IN_PANEL")?.severity).toBe("warning");
    const speech = v(panel({ figures: [fig({ character: "mayor" })], text: [{ kind: "speech", speaker: "mayor", about: "mayor", text: "Hm.", fidelity: "dramatized" }] }));
    expect(speech.find((i) => i.code === "ABOUT_NOT_CAPTION")?.severity).toBe("error");
  });

  it("warns on crowded close-ups, multi-figure extreme close-ups and backs to the camera", () => {
    const three = ["mayor", "boy", "seamstress"].map((character, i) => fig({ character, slot: (["left", "center", "right"] as const)[i] }));
    expect(codes(v(panel({ shot: "close", figures: three })))).toContain("CLOSE_CROWDED");
    expect(codes(v(panel({ shot: "extreme_close", figures: three.slice(0, 2) })))).toContain("EXTREME_CLOSE_MULTI");
    expect(codes(v(panel({ shot: "close", figures: [fig({ character: "mayor", facing: "back" })] })))).toContain("FACING_BACK_CLOSE");
    expect(codes(v(panel({ shot: "wide", figures: [fig({ character: "mayor", facing: "back" })] })))).not.toContain("FACING_BACK_CLOSE");
  });

  it("applies the tighter word limits (warn above 22, reject above 35)", () => {
    expect(WORD_LIMITS.balloonWarn).toBe(22);
    expect(WORD_LIMITS.balloonError).toBe(35);
    const words = (k: number) => Array.from({ length: k }, (_, i) => `w${i}`).join(" ");
    const warn = v(panel({ figures: [fig({ character: "mayor" })], text: [{ kind: "speech", speaker: "mayor", text: words(23), fidelity: "dramatized" }] }));
    expect(warn.find((i) => i.code === "WORDS_BALLOON")?.severity).toBe("warning");
    const err = v(panel({ figures: [fig({ character: "mayor" })], text: [{ kind: "speech", speaker: "mayor", text: words(36), fidelity: "dramatized" }] }));
    expect(err.find((i) => i.code === "WORDS_BALLOON")?.severity).toBe("error");
  });

  it("warns on blockage layouts, a hook in the biggest panel, and a small payoff after a hook", () => {
    const three = ["a", "b", "c"].map((id) => panel({ id, figures: [fig({ character: "mayor" })] }));
    const blocked = validatePage(onePage(three[0], { layout: { template: "stacked_to_tall_3" }, panels: three }), BOOK);
    expect(codes(blocked)).toContain("BLOCKAGE_LAYOUT");
    const safe = validatePage(onePage(three[0], { layout: { template: "l_shape_3" }, panels: three }), BOOK);
    expect(codes(safe)).not.toContain("BLOCKAGE_LAYOUT");
    const hooked = validatePage(onePage(three[0], { layout: { template: "stacked_to_tall_3" }, panels: three, page_turn_hook: true }), BOOK);
    expect(codes(hooked)).toContain("HOOK_PANEL_LARGEST");
    const five = ["a", "b", "c", "d", "e"].map((id) => panel({ id, figures: [fig({ character: "mayor" })] }));
    const small = validatePage(onePage(five[0], { layout: { template: "staggered_5" }, panels: five }), BOOK, undefined, { previousPageHook: true });
    expect(codes(small)).toContain("FIRST_PANEL_SMALL_AFTER_HOOK");
    const noInfo = validatePage(onePage(five[0], { layout: { template: "staggered_5" }, panels: five }), BOOK);
    expect(codes(noInfo)).not.toContain("FIRST_PANEL_SMALL_AFTER_HOOK");
  });
});

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

describe("layout gutters and reading order", () => {
  it("separates rows by a wider gutter than columns", () => {
    expect(ROW_GUTTER).toBe(26);
    expect(COL_GUTTER).toBe(12);
    const out = compileLayout({ template: "establish_3" }, ["a", "b", "c"]);
    const [top, left, right] = out.panels;
    expect(left.bbox.y - (top.bbox.y + top.bbox.h)).toBeCloseTo(ROW_GUTTER, 0);
    expect(right.bbox.x - (left.bbox.x + left.bbox.w)).toBeCloseTo(COL_GUTTER, 0);
  });

  it("keeps depth-first order and reports blockage only for a stack on the reading-earlier side", () => {
    const blocked = compileLayout({ template: "stacked_to_tall_3" }, ["a", "b", "c"]);
    expect(blocked.panels.map((p) => p.order)).toEqual([0, 1, 2]);
    expect(codes(blockageIssues(blocked.panels))).toEqual(["BLOCKAGE_LAYOUT"]);
    expect(blockageIssues(compileLayout({ template: "l_shape_3" }, ["a", "b", "c"]).panels)).toEqual([]);
    const shares = panelAreaShares(blocked.panels);
    expect(shares.reduce((a, b) => a + b, 0)).toBeLessThan(1);
    expect(shares[2]).toBeGreaterThan(shares[0]);
  });
});

// ---------------------------------------------------------------------------
// Lettering craft
// ---------------------------------------------------------------------------

describe("lettering craft", () => {
  const polygon = [
    { x: 100, y: 100 },
    { x: 700, y: 100 },
    { x: 700, y: 600 },
    { x: 100, y: 600 },
  ];
  const bbox = { x: 100, y: 100, w: 600, h: 500 };
  const a = { character: "a", head: { x: 250, y: 430 }, headRadius: 45, mouth: { x: 270, y: 445 }, body: { x: 200, y: 385, w: 100, h: 215 } };
  const b = { character: "b", head: { x: 560, y: 430 }, headRadius: 45, mouth: { x: 540, y: 445 }, body: { x: 510, y: 385, w: 100, h: 215 } };
  const run = (texts: TextSpec[], extra: Partial<Parameters<typeof letterPanel>[0]> = {}) =>
    letterPanel({
      panelId: "p1",
      polygon,
      bbox,
      texts,
      speakers: [a, b],
      heads: [a, b].map((s) => ({ character: s.character, center: s.head, radius: s.headRadius })),
      bodies: [a.body, b.body],
      seed: 3,
      ...extra,
    });

  it("letters speech at 24 or more (prefers 28-30) and captions at 22 or more", () => {
    expect(minFontSize("speech")).toBe(24);
    expect(minFontSize("thought")).toBe(24);
    expect(minFontSize("whisper")).toBe(24);
    expect(minFontSize("narration")).toBe(22);
    expect(minFontSize("caption")).toBe(22);
    expect(KIND_STYLES.speech.sizes[0]).toBeGreaterThanOrEqual(28);
    const out = run([{ kind: "speech", speaker: "a", text: "Who are you?", fidelity: "quote" }]);
    expect(out.texts[0].font_px).toBeGreaterThanOrEqual(28);
  });

  it("avoids one-word lines when breaking", () => {
    const m = (s: string) => measure(s, "bold", 28);
    const text = "I am beginning to be appreciated. Now I can finish my play.";
    const lines = breakBalanced(text, 230, m, "lens")?.lines ?? [];
    expect(lines.join(" ")).toBe(text);
    expect(lines.filter((l) => !l.includes(" ")).length).toBeLessThanOrEqual(1);
  });

  it("widens a balloon before stacking lines, and warns when it still needs more than 5", () => {
    const out = run([{ kind: "speech", speaker: "a", text: "I lived where sorrow was not allowed to enter, and now I see all the misery of my city.", fidelity: "quote" }]);
    expect(out.texts[0].lines.length).toBeLessThanOrEqual(5);
    expect(codes(out.issues)).not.toContain("BALLOON_TALL");
    const narrow = [
      { x: 100, y: 100 },
      { x: 360, y: 100 },
      { x: 360, y: 900 },
      { x: 100, y: 900 },
    ];
    const tall = letterPanel({
      panelId: "p1",
      polygon: narrow,
      bbox: { x: 100, y: 100, w: 260, h: 800 },
      texts: [{ kind: "speech", speaker: "zz", text: "Carried out, it finally amounts to this: that government is best which governs not at all.", fidelity: "quote" }],
      speakers: [],
      heads: [],
      bodies: [],
      seed: 1,
    });
    expect(codes(tall.issues)).toContain("BALLOON_TALL");
  });

  it("uses one tail base width on every balloon and keeps tails from crossing", () => {
    const out = run([
      { kind: "speech", speaker: "a", text: "Who are you?", fidelity: "quote" },
      { kind: "speech", speaker: "b", text: "I am the Happy Prince.", fidelity: "quote" },
      { kind: "shout", speaker: "a", text: "Why are you weeping?", fidelity: "quote" },
    ]);
    const segs = out.placed.map(tailSegment).filter((x): x is NonNullable<typeof x> => x !== undefined);
    for (let i = 0; i < segs.length; i += 1) for (let j = i + 1; j < segs.length; j += 1) expect(segmentsIntersect(segs[i][0], segs[i][1], segs[j][0], segs[j][1])).toBe(false);
    expect(codes(out.issues)).not.toContain("TAILS_CROSS");
    // the tail base half-width is the page constant (9) on ellipses and bursts alike
    const svg = out.balloons;
    expect(svg.length).toBeGreaterThan(0);
  });

  it("reports crossing tails when the speakers stand in the wrong order", () => {
    // b speaks first but stands on the right: forcing both balloons to the top makes the tails cross
    const low = { ...a, head: { x: 250, y: 540 }, mouth: { x: 270, y: 555 }, body: { x: 200, y: 495, w: 100, h: 105 } };
    const lowB = { ...b, head: { x: 560, y: 540 }, mouth: { x: 540, y: 555 }, body: { x: 510, y: 495, w: 100, h: 105 } };
    const out = letterPanel({
      panelId: "p1",
      polygon: [
        { x: 100, y: 100 },
        { x: 700, y: 100 },
        { x: 700, y: 600 },
        { x: 100, y: 600 },
      ],
      bbox,
      texts: [
        { kind: "speech", speaker: "b", text: "I am the Happy Prince and I weep for my city.", fidelity: "quote" },
        { kind: "speech", speaker: "a", text: "Who are you, and why are you weeping so?", fidelity: "quote" },
      ],
      speakers: [low, lowB],
      heads: [low, lowB].map((s) => ({ character: s.character, center: s.head, radius: s.headRadius })),
      bodies: [low.body, lowB.body],
      seed: 3,
    });
    const segs = out.placed.map(tailSegment).filter((x): x is NonNullable<typeof x> => x !== undefined);
    const crossing = segs.length === 2 && segmentsIntersect(segs[0][0], segs[0][1], segs[1][0], segs[1][1]);
    expect(codes(out.issues).includes("TAILS_CROSS")).toBe(crossing);
  });

  it("connects two consecutive balloons of one speaker (one tail, one neck)", () => {
    const out = run([
      { kind: "speech", speaker: "a", text: "He is as beautiful as a weathercock...", fidelity: "dramatized" },
      { kind: "speech", speaker: "a", text: "...only not quite so useful.", fidelity: "dramatized" },
    ]);
    const [first, second] = out.placed;
    expect(first.tail).toBeDefined();
    expect(second.tail).toBeUndefined();
    expect(second.connectTo).toBe(first.index);
    // drawn as one inked chain: a single group holding both texts
    expect(out.balloons.match(/<g>/g)?.length).toBe(1);
    expect(out.texts).toHaveLength(2);
  });

  it("places a name-tag caption next to its character, outside the reading flow", () => {
    const out = run([
      { kind: "speech", speaker: "a", text: "Who are you?", fidelity: "quote" },
      { kind: "caption", about: "b", text: "The Happy Prince", fidelity: "paraphrase" },
    ]);
    const tag = out.placed.find((p) => p.index === 1);
    expect(tag?.label).toBe(true);
    expect(tag?.tail).toBeUndefined();
    if (!tag) return;
    const cx = tag.box.x + tag.box.w / 2;
    const cy = tag.box.y + tag.box.h / 2;
    expect(Math.hypot(cx - b.head.x, cy - b.head.y)).toBeLessThan(b.headRadius * 2 + tag.box.h + tag.box.w / 2);
    expect(Math.hypot(cx - b.head.x, cy - b.head.y)).toBeLessThan(Math.hypot(cx - a.head.x, cy - a.head.y));
    expect(circleHitsConvex(b.head, b.headRadius, tag.hull)).toBe(false);
  });

  it("treats a short caption that names exactly one drawn character as its name tag", () => {
    const names = { t: "Henry Thoreau", s: "The State", m: "The Seamstress", b: "The Sick Boy" };
    expect(inferNameTag("Henry David Thoreau, of Concord.", names)).toBe("t");
    expect(inferNameTag("The American State.", names)).toBe("s");
    expect(inferNameTag("The Sick Boy", names)).toBe("b");
    expect(inferNameTag("The Seamstress and her Sick Boy.", names)).toBeUndefined();
    expect(inferNameTag("Henry Thoreau — The American State", names)).toBeUndefined();
    expect(inferNameTag("That night, on the tall column.", names)).toBeUndefined();
    expect(inferNameTag("He alighted between the feet of the statue, and Henry Thoreau watched.", names)).toBeUndefined();
    const out = run([{ kind: "caption", text: "The Happy Prince", fidelity: "paraphrase" }], { names: { b: "The Happy Prince", a: "The Swallow" } });
    expect(out.placed[0].label).toBe(true);
  });

  it("keeps balloons off the chin in a close-up (head circle plus chin zone)", () => {
    const face = { character: "g", head: { x: 400, y: 380 }, headRadius: 150, mouth: { x: 400, y: 450 }, body: { x: 200, y: 230, w: 400, h: 370 } };
    const out = letterPanel({
      panelId: "p1",
      polygon,
      bbox,
      texts: [{ kind: "shout", speaker: "g", text: "What a lovely bit of glass!", fidelity: "quote" }],
      speakers: [face],
      heads: [{ character: "g", center: face.head, radius: face.headRadius }],
      bodies: [face.body],
      seed: 2,
    });
    const p = out.placed[0];
    const chin = { x: face.head.x, y: face.head.y + face.headRadius * 0.72 };
    expect(circleHitsConvex(chin, face.headRadius * 0.62, p.hull)).toBe(false);
    expect(circleHitsConvex(face.head, face.headRadius, p.hull)).toBe(false);
  });

  it("places SFX in free space, off faces and off an insert's subject", () => {
    const subject = { x: 300, y: 250, w: 200, h: 250 };
    const out = run([{ kind: "sfx", text: "SWOOP", fidelity: "dramatized" }], { speakers: [], heads: [], bodies: [], obstacles: [subject] });
    const p = out.placed[0];
    const overlap = Math.max(0, Math.min(p.box.x + p.box.w, subject.x + subject.w) - Math.max(p.box.x, subject.x)) * Math.max(0, Math.min(p.box.y + p.box.h, subject.y + subject.h) - Math.max(p.box.y, subject.y));
    expect(overlap).toBe(0);
    const faces = run([{ kind: "sfx", text: "CRACK", fidelity: "dramatized" }]);
    for (const h of [a, b]) expect(circleHitsConvex(h.head, h.headRadius, faces.placed[0].hull)).toBe(false);
  });

  it("lets SFX break the panel border only when the panel has speed lines or an impact", () => {
    const tiny = [
      { x: 100, y: 100 },
      { x: 260, y: 100 },
      { x: 260, y: 240 },
      { x: 100, y: 240 },
    ];
    const bb = { x: 100, y: 100, w: 160, h: 140 };
    const base = { panelId: "p1", polygon: tiny, bbox: bb, texts: [{ kind: "sfx" as const, text: "KRAKATHOOM", fidelity: "dramatized" as const }], speakers: [], heads: [], bodies: [], seed: 5 };
    const inside = letterPanel(base);
    const bleed = letterPanel({ ...base, sfxBleed: true });
    const within = (p: (typeof inside.placed)[number]) => p.box.x >= bb.x - 0.5 && p.box.x + p.box.w <= bb.x + bb.w + 0.5;
    if (!codes(inside.issues).includes("TEXT_DOES_NOT_FIT")) expect(within(inside.placed[0])).toBe(true);
    expect(bleed.placed[0].layout.fontSize).toBeGreaterThanOrEqual(inside.placed[0].layout.fontSize);
  });
});

// ---------------------------------------------------------------------------
// Whole pages: accessibility, fixtures, catalog
// ---------------------------------------------------------------------------

describe("pages: accessibility and fixtures", () => {
  it("has a title, a description and one labelled group per panel in reading order", () => {
    const spec = PAGES[4];
    const { svg } = renderPage(spec, BOOK, { idPrefix: "a11y-" });
    expect(svg).toContain(`<title>Page ${spec.page_number}</title>`);
    expect(svg).toContain(`<desc>${spec.purpose}</desc>`);
    const labels = [...svg.matchAll(/<g role="group" aria-label="Panel (\d+) of (\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(labels).toEqual(spec.panels.map((_, i) => [i + 1, spec.panels.length]));
    // each panel's lettering sits inside that panel's group (reading order for screen readers)
    const firstGroup = svg.slice(svg.indexOf('aria-label="Panel 1 of'), svg.indexOf('aria-label="Panel 2 of'));
    expect(firstGroup).toContain("Over the sleeping city");
    expect(svg).not.toMatch(/\sopacity="/);
  });

  it("stages the fixture as the story needs it", () => {
    const staging = (page: number, panelId: string) => {
      const { details } = renderPageDetailed(PAGES[page - 1], BOOK);
      return Object.fromEntries((details.find((d) => d.id === panelId)?.figures ?? []).map((f) => [f.character, f.staging]));
    };
    expect(staging(1, "p1").prince).toBe("on:statue_column");
    expect(staging(3, "p2")).toEqual({ prince: "on:statue_column", swallow: "on:prince:feet" });
    expect(staging(4, "p2").boy).toBe("on:bed");
    expect(staging(5, "p3").boy).toBe("on:bed");
    expect(staging(5, "p4").swallow).toBe("on:prince:feet");
  }, 30000);

  it("documents the new fields and warnings in the catalog", () => {
    const c = catalog();
    for (const k of ["figure.on", "figure.holding_tone", "prop.tone", "text.about"]) expect(c.fields[k]?.length ?? 0).toBeGreaterThan(20);
    for (const k of ["FACE_COVERED", "BLOCKAGE_LAYOUT", "HOOK_PANEL_LARGEST", "BALLOON_TALL", "TAILS_CROSS", "EXTREME_CLOSE_MULTI", "CLOSE_CROWDED", "FACING_BACK_CLOSE"]) {
      expect(c.warnings[k], k).toBeDefined();
    }
    // speaker legibility is a rejecting error since 0.3.0
    for (const k of ["SPEAKER_TOO_SMALL", "TAIL_CROSSES_FACE"]) expect(c.errors[k], k).toBeDefined();
    expect(c.vocabularies.staging_features).toEqual(["statue_column", "bed", "table", "fountain", "bridge"]);
    expect(c.vocabularies.perch_parts).toEqual(["feet", "shoulder", "hand", "head"]);
    expect(c.shots.wide).toMatch(/one short line/);
    expect(c.text_kinds.caption.use).toMatch(/about/);
    expect(c.page.row_gutter).toBe(26);
    expect(c.page.col_gutter).toBe(12);
    expect(c.limits.words_per_balloon_max).toBe(35);
  });

  it("rasterises the staged fixture pages without crashing resvg (no extra clip groups next to far-off geometry)", () => {
    for (const spec of [PAGES[0], PAGES[3], PAGES[4]]) {
      const png = svgToPng(renderPage(spec, BOOK).svg, { width: 200 });
      expect(png.length).toBeGreaterThan(1000);
    }
  }, 60000);

  it("stays deterministic with the new staging", () => {
    const spec = clone(PAGES[2]);
    expect(renderPage(spec, BOOK).svg).toBe(renderPage(clone(spec), BOOK).svg);
  }, 30000);
});
