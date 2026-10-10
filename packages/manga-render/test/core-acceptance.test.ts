/**
 * Pass 3 (manga-render 0.3.0): what the acceptance run's judges asked of the
 * renderer — look variants, the statue never at street level, speaker
 * legibility as errors, props drawn once and in the hand, key props kept
 * clear of text, poses that read, scale continuity, balloons that belong to
 * their speaker, SFX by their source, one-line titles.
 */
import { describe, expect, it } from "vitest";
import type { CastMember, FigureSpec, MangaPageSpec, PanelSpec, TextSpec, ValidationIssue } from "../src/contracts.js";
import { catalog, RENDERER_VERSION, renderPage, renderPageDetailed, validatePage } from "../src/index.js";
import { checkLettering, inferNameTag, isTitleText, letterPanel, typeset } from "../src/lettering/index.js";
import { composePanel, locationStatue, lookWithVariant, partFromBeat, planProps, SPEAKER_MIN_HEAD_RADIUS, statueGone } from "../src/scene/index.js";
import { circleHitsConvex, convexOverlap, distPointSegment } from "../src/layout/geometry.js";
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

const GIANT: CastMember = {
  id: "giant",
  name: "The Selfish Giant",
  role: "protagonist",
  description: "A huge old man who walls in his garden.",
  look: { kind: "human", age: "elder", build: "heavy", height: "giant", frame: "masc", hair: "long_straight", hair_tone: "white", facial_hair: "long_beard", outfit: "long_coat", outfit_tone: "mid", headwear: "none", accessories: [], skin: "light", material: "flesh" },
};
const CHILDREN: CastMember = { id: "children", name: "The Children", role: "crowd", description: "The town's children.", look: { kind: "crowd", crowd: "children", size: "many" } };
const HANS: CastMember = {
  id: "hans",
  name: "Little Hans",
  role: "protagonist",
  description: "A small gardener.",
  look: { kind: "human", age: "adult", build: "slim", height: "short", frame: "masc", hair: "short", hair_tone: "light", facial_hair: "none", outfit: "work_apron", outfit_tone: "mid", headwear: "cap", accessories: [], skin: "light", material: "flesh" },
};
const BIG = {
  cast: [...BOOK.cast, GIANT, CHILDREN, HANS],
  locations: [...BOOK.locations, { id: "garden", name: "The Garden", environment: "garden" as const, features: ["trees" as const], description: "A garden." }],
};

const W = { x: 40, y: 40, w: 920, h: 600 };
const compose = (p: PanelSpec, box = W, book = BIG, pageVariants?: Record<string, NonNullable<FigureSpec["variant"]>>) =>
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
    book,
    idPrefix: "t-",
    textLoad: p.text.filter((t) => t.kind !== "sfx").length,
    rtl: false,
    ...(pageVariants ? { pageVariants } : {}),
  });

describe("renderer version", () => {
  it("is 0.6.0", () => {
    expect(RENDERER_VERSION).toBe("manga-render/0.6.0");
  });
});

// ---------------------------------------------------------------------------
// Look variants
// ---------------------------------------------------------------------------

describe("look variants", () => {
  it("merge into the cast look: material and tones for people, tone for creatures; the rest is ignored", () => {
    const prince = BOOK.cast.find((c) => c.id === "prince")!;
    const stone = lookWithVariant(prince.look, { material: "stone", outfit_tone: "stone", hair_tone: "mid", eyes: "blind" });
    expect(stone).toMatchObject({ kind: "human", material: "stone", outfit_tone: "stone", hair_tone: "mid" });
    expect(prince.look).toMatchObject({ material: "gold" });
    const swallow = BOOK.cast.find((c) => c.id === "swallow")!;
    expect(lookWithVariant(swallow.look, { tone: "light", material: "stone" })).toEqual({ ...swallow.look, tone: "light" });
    expect(lookWithVariant(swallow.look, undefined)).toBe(swallow.look);
  });

  it("change the drawing, and a statue turned back to flesh is not staged on its column", () => {
    const gold = compose(panel({ shot: "full", figures: [fig({ character: "prince" })] }));
    const stone = compose(panel({ shot: "full", figures: [fig({ character: "prince", variant: { material: "stone", eyes: "blind" } })] }));
    const flesh = compose(panel({ shot: "full", figures: [fig({ character: "prince", variant: { material: "flesh" } })] }));
    expect(stone.content).not.toBe(gold.content);
    expect(gold.figures[0].staging).toBe("on:statue_column");
    expect(stone.figures[0].staging).toBe("on:statue_column");
    expect(flesh.figures[0].staging).toBe("ground");
  });

  it("survive sanitizing and reach the rendered page", () => {
    const p = panel({ shot: "full", figures: [fig({ character: "prince", variant: { material: "stone", eyes: "blind" } })] });
    const withVariant = renderPage(onePage(p), BOOK).svg;
    const without = renderPage(onePage({ ...p, figures: [fig({ character: "prince" })] }), BOOK).svg;
    expect(withVariant).not.toBe(without);
  });

  it("are validated: closed vocabularies, and only the fields the kind has", () => {
    const check = (figure: FigureSpec) => validatePage(onePage(panel({ figures: [figure] })), BOOK);
    expect(codes(check(fig({ character: "prince", variant: { material: "stone", eyes: "blind" } })))).not.toContain("VARIANT_FIELD_INVALID");
    expect(codes(check(fig({ character: "prince", variant: { material: "stone", eyes: "blind" } })))).not.toContain("FIELD_UNKNOWN");
    expect(codes(check(fig({ character: "swallow", variant: { eyes: "dead", tone: "light" } })))).toEqual(expect.not.arrayContaining(["VARIANT_FIELD_INVALID", "ENUM_INVALID"]));
    const bird = check(fig({ character: "swallow", variant: { material: "stone" } }));
    expect(bird.find((i) => i.code === "VARIANT_FIELD_INVALID")?.severity).toBe("error");
    expect(codes(check(fig({ character: "prince", variant: { tone: "dark" } })))).toContain("VARIANT_FIELD_INVALID");
    expect(codes(check(fig({ character: "prince", variant: { eyes: "sleepy" as never } })))).toContain("ENUM_INVALID");
    expect(codes(check(fig({ character: "prince", variant: { material: "wood" as never } })))).toContain("ENUM_INVALID");
    expect(codes(check(fig({ character: "prince", variant: "stone" as never })))).toContain("FIELD_TYPE");
    expect(codes(check(fig({ character: "prince", variant: { glow: true } as never })))).toContain("FIELD_UNKNOWN");
  });
});

// ---------------------------------------------------------------------------
// The statue is never at street level
// ---------------------------------------------------------------------------

describe("statue staging in every shot", () => {
  it("finds the location's statue: the statue cast member whose description mentions its column", () => {
    const square = BOOK.locations.find((l) => l.id === "square");
    expect(locationStatue(BOOK.cast, square)?.id).toBe("prince");
    expect(locationStatue(BOOK.cast, BOOK.locations.find((l) => l.id === "garret"))).toBeUndefined();
    expect(partFromBeat("He settles between the feet of the Happy Prince.")).toBe("feet");
    expect(partFromBeat("The Swallow sits on his shoulder.")).toBe("shoulder");
    expect(statueGone("They melted the statue in a furnace.")).toBe(true);
    expect(statueGone("The statue gleams in the sun.")).toBe(false);
  });

  it("sees a statue in medium, close and extreme close shots from up at its height (rooftops, no street)", () => {
    for (const shot of ["medium", "close", "extreme_close"] as const) {
      const c = compose(panel({ shot, figures: [fig({ character: "prince", facing: "front" })] }));
      expect(c.figures[0].staging, shot).toBe("on:statue_column");
      expect(c.environment, shot).toBe("rooftops");
    }
    // anyone else in the square is at street level
    expect(compose(panel({ shot: "medium", figures: [fig({ character: "mayor" })] })).environment).toBe("city_square");
  });

  it("perches a small creature on the statue in close-range shots, and frames one at its feet on the column top", () => {
    const shoulder = compose(panel({ shot: "medium", figures: [fig({ character: "prince", facing: "front" }), fig({ character: "swallow", pose: "perch", slot: "right" })] }));
    expect(shoulder.figures.find((f) => f.character === "swallow")?.staging).toBe("on:prince:shoulder");
    const feet = compose(
      panel({
        shot: "medium",
        beat: "The Swallow settles between the statue's feet.",
        figures: [fig({ character: "prince", facing: "front" }), fig({ character: "swallow", pose: "perch", depth: "fore" })],
        text: [{ kind: "thought", speaker: "swallow", text: "A golden bedroom.", fidelity: "paraphrase" }],
      }),
    );
    const bird = feet.figures.find((f) => f.character === "swallow")!;
    const statue = feet.figures.find((f) => f.character === "prince")!;
    expect(bird.staging).toBe("on:prince:feet");
    // the statue rises out of the top of the panel; the bird between its feet reads as the speaker
    expect(statue.headCropped).toBe(true);
    expect(bird.headRadius).toBeGreaterThanOrEqual(SPEAKER_MIN_HEAD_RADIUS);
    expect(bird.head.y).toBeGreaterThan(W.y + W.h * 0.4);
    expect(codes(feet.issues)).not.toContain("SPEAKER_TOO_SMALL");
  });

  it("draws the location's statue on an empty column top as scenery, in its page variant, unless the beat says it is gone", () => {
    const wide = panel({ shot: "wide", figures: [fig({ character: "mayor", slot: "left" })] });
    const c = compose(wide);
    expect(c.scenery).toEqual(["prince"]);
    const stripped = compose(wide, W, BIG, { prince: { material: "stone", eyes: "blind" } });
    expect(stripped.content).not.toBe(c.content);
    expect(compose({ ...wide, beat: "They pulled the statue down and melted it." }).scenery).toEqual([]);
    // not in rooms
    expect(compose(panel({ shot: "wide", location: "garret", figures: [fig({ character: "mayor" })] })).scenery).toEqual([]);
    // not when the statue is one of the figures
    expect(compose(panel({ shot: "wide", figures: [fig({ character: "prince" })] })).scenery).toEqual([]);
  });

  it("puts a bird that dies at the statue's feet on the column top, lying", () => {
    const c = compose(panel({ shot: "full", figures: [fig({ character: "prince", facing: "front" }), fig({ character: "swallow", pose: "lie", variant: { eyes: "dead" } })] }));
    const bird = c.figures.find((f) => f.character === "swallow")!;
    const statue = c.figures.find((f) => f.character === "prince")!;
    expect(bird.staging).toBe("on:prince:feet");
    expect(Math.abs(bird.body.y + bird.body.h - (statue.body.y + statue.body.h))).toBeLessThan(statue.body.h * 0.12);
  });

  it("rasterises statue panels (a statue far bigger than the panel) without crashing resvg", () => {
    const p = panel({
      shot: "close",
      beat: "The Swallow settles between the statue's feet.",
      figures: [fig({ character: "prince" }), fig({ character: "swallow", pose: "perch" })],
      text: [{ kind: "speech", speaker: "swallow", text: "Good night!", fidelity: "dramatized" }],
    });
    const png = svgToPng(renderPage(onePage(p), BOOK).svg, { width: 200 });
    expect(png.length).toBeGreaterThan(1000);
  }, 30000);
});

// ---------------------------------------------------------------------------
// Speakers: legibility is a rejecting error
// ---------------------------------------------------------------------------

describe("speaker legibility errors", () => {
  it("rejects a speaker too small to read (SPEAKER_TOO_SMALL is an error)", () => {
    const c = compose(panel({ shot: "establishing", figures: [fig({ character: "mayor" })], text: [{ kind: "speech", speaker: "mayor", text: "Hm.", fidelity: "dramatized" }] }));
    expect(c.issues.find((i) => i.code === "SPEAKER_TOO_SMALL")?.severity).toBe("error");
  });

  it("pushes a close-range camera in until a small speaker reads (a bird on a shoulder)", () => {
    const c = compose(
      panel({
        shot: "medium",
        figures: [fig({ character: "prince", facing: "front" }), fig({ character: "swallow", pose: "perch", on: { target: "prince", part: "shoulder" } })],
        text: [{ kind: "speech", speaker: "swallow", text: "I will stay with you.", fidelity: "dramatized" }],
      }),
    );
    const bird = c.figures.find((f) => f.character === "swallow")!;
    expect(bird.headRadius).toBeGreaterThanOrEqual(SPEAKER_MIN_HEAD_RADIUS);
    expect(bird.head.x - bird.headRadius).toBeGreaterThanOrEqual(W.x - 1);
    expect(bird.head.x + bird.headRadius).toBeLessThanOrEqual(W.x + W.w + 1);
    expect(codes(c.issues)).not.toContain("SPEAKER_TOO_SMALL");
  });

  it("enlarges a small creature at depth fore in a ground shot (it is near the camera)", () => {
    const c = compose(panel({ shot: "establishing", figures: [fig({ character: "mayor", slot: "right" }), fig({ character: "swallow", pose: "fly", depth: "fore", slot: "left" })] }));
    expect(c.figures.find((f) => f.character === "swallow")!.headRadius).toBeGreaterThanOrEqual(17.5);
  });

  const polygon = [
    { x: 100, y: 100 },
    { x: 600, y: 100 },
    { x: 600, y: 500 },
    { x: 100, y: 500 },
  ];
  const bbox = { x: 100, y: 100, w: 500, h: 400 };
  const a = { character: "a", head: { x: 160, y: 330 }, headRadius: 38, mouth: { x: 175, y: 345 }, body: { x: 120, y: 292, w: 80, h: 208 } };
  const b = { character: "b", head: { x: 350, y: 330 }, headRadius: 38, mouth: { x: 335, y: 345 }, body: { x: 310, y: 292, w: 80, h: 208 } };
  const c = { character: "c", head: { x: 540, y: 330 }, headRadius: 38, mouth: { x: 525, y: 345 }, body: { x: 500, y: 292, w: 80, h: 208 } };
  const input = (texts: TextSpec[], extra: Partial<Parameters<typeof letterPanel>[0]> = {}) => ({
    panelId: "p1",
    polygon,
    bbox,
    texts,
    speakers: [a, b, c],
    heads: [a, b, c].map((s) => ({ character: s.character, center: s.head, radius: s.headRadius })),
    bodies: [a.body, b.body, c.body],
    seed: 3,
    ...extra,
  });

  it("rejects a tail that has to cross another face (TAIL_CROSSES_FACE is an error)", () => {
    // three faces in a row; key props everywhere but a pocket left of the first face,
    // so the last speaker's balloon can only sit there and its tail crosses two faces
    const row = [
      { ...a, head: { x: 270, y: 330 }, mouth: { x: 285, y: 345 }, body: { x: 230, y: 292, w: 80, h: 208 } },
      { ...b, head: { x: 390, y: 330 }, mouth: { x: 375, y: 345 }, body: { x: 350, y: 292, w: 80, h: 208 } },
      { ...c, head: { x: 530, y: 330 }, mouth: { x: 515, y: 345 }, body: { x: 490, y: 292, w: 80, h: 208 } },
    ];
    const out = letterPanel({
      ...input([{ kind: "speech", speaker: "c", text: "Hey!", fidelity: "dramatized" }]),
      speakers: row,
      heads: row.map((s) => ({ character: s.character, center: s.head, radius: s.headRadius })),
      bodies: row.map((s) => s.body),
      keepOut: [
        { x: 100, y: 100, w: 500, h: 170 },
        { x: 100, y: 395, w: 500, h: 105 },
        { x: 222, y: 100, w: 378, h: 400 },
      ],
    });
    const issue = out.issues.find((i) => i.code === "TAIL_CROSSES_FACE");
    expect(issue?.severity).toBe("error");
  });

  it("ends a thought trail at its own thinker's head", () => {
    const out = letterPanel(input([{ kind: "thought", speaker: "b", text: "A golden bedroom.", fidelity: "dramatized" }]));
    const p = out.placed[0];
    const tip = p.tail!.tip;
    const own = Math.hypot(tip.x - b.head.x, tip.y - b.head.y) - b.headRadius;
    expect(own).toBeGreaterThanOrEqual(-0.5);
    expect(own).toBeLessThan(b.headRadius * 0.3 + 10);
    for (const o of [a, c]) expect(Math.hypot(tip.x - o.head.x, tip.y - o.head.y) - o.headRadius).toBeGreaterThan(own);
    expect(codes(out.issues)).not.toContain("TAIL_MISDIRECTED");
  });

  it("aims a tail at the mouth side of the head, never at a hat on top", () => {
    const hat = { x: b.head.x - 36, y: b.head.y - 78, w: 72, h: 46 };
    const out = letterPanel(input([{ kind: "speech", speaker: "b", text: "Good evening to you all.", fidelity: "dramatized" }], { obstacles: [hat] }));
    const tip = out.placed[0].tail!.tip;
    const inHat = tip.x >= hat.x && tip.x <= hat.x + hat.w && tip.y >= hat.y && tip.y <= hat.y + hat.h;
    expect(inHat).toBe(false);
  });

  it("rejects a tail through another text and a tail ending nearer someone else (checked on the final lettering)", () => {
    const texts: TextSpec[] = [
      { kind: "speech", speaker: "a", text: "Hello.", fidelity: "dramatized" },
      { kind: "caption", text: "Night", fidelity: "paraphrase" },
    ];
    const inp = input(texts);
    const out = letterPanel(inp);
    expect(codes(out.issues)).not.toContain("TAIL_CROSSES_TEXT");
    // move the caption onto the middle of the speech tail
    const speech = out.placed.find((p) => p.index === 0)!;
    const caption = out.placed.find((p) => p.index === 1)!;
    const base = speech.center;
    const tip = speech.tail!.tip;
    const mid = { x: (base.x + tip.x) / 2, y: (base.y + tip.y) / 2 };
    const dx = mid.x - caption.center.x;
    const dy = mid.y - caption.center.y;
    const moved = { ...caption, center: mid, hull: caption.hull.map((q) => ({ x: q.x + dx, y: q.y + dy })), box: { ...caption.box, x: caption.box.x + dx, y: caption.box.y + dy } };
    expect(codes(checkLettering(inp, [speech, moved]))).toContain("TAIL_CROSSES_TEXT");
    // point the speech tail at the middle speaker instead
    const astray = { ...speech, tail: { tip: { x: b.head.x, y: b.head.y - b.headRadius - 6 }, offPanel: false } };
    const issues = checkLettering(inp, [astray]);
    expect(issues.find((i) => i.code === "TAIL_MISDIRECTED")?.severity).toBe("error");
  });

  it("keeps a name tag nearer its own character than anyone else, and off other bodies", () => {
    const names = { a: "The Mayor", b: "The Councillor", c: "The Swallow" };
    const out = letterPanel(input([{ kind: "caption", about: "b", text: "The Councillor", fidelity: "paraphrase" }], { names }));
    const tag = out.placed[0];
    const gap = (h: { head: { x: number; y: number }; headRadius: number }) =>
      Math.max(0, Math.hypot(Math.max(tag.box.x - h.head.x, 0, h.head.x - (tag.box.x + tag.box.w)), Math.max(tag.box.y - h.head.y, 0, h.head.y - (tag.box.y + tag.box.h))) - h.headRadius);
    expect(gap(b)).toBeLessThan(gap(a));
    expect(gap(b)).toBeLessThan(gap(c));
    expect(codes(out.issues)).not.toContain("NAME_TAG_AMBIGUOUS");
  });
});

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

describe("props: once, in the hand, and never under text", () => {
  it("draws a prop that a figure holds once (DUPLICATE_PROP), in the hand", () => {
    const p = panel({ shot: "full", location: "poor_room", figures: [fig({ character: "swallow", pose: "perch", holding: "gem", holding_tone: "black" })], props: [{ prop: "gem", slot: "left", tone: "black" }] });
    const c = compose(p);
    expect(codes(c.issues)).toContain("DUPLICATE_PROP");
    expect(c.props.filter((x) => x.prop === "gem")).toHaveLength(1);
    expect(c.props[0].heldBy).toBe("swallow");
  });

  it("puts a carried prop in the arms, not under the feet", () => {
    const c = compose(panel({ shot: "wide", location: "garden", beat: "Hans hauls the sack along the road.", figures: [fig({ character: "hans", pose: "carry" })], props: [{ prop: "bag", slot: "center" }] }));
    const bag = c.props.find((x) => x.prop === "bag")!;
    const hans = c.figures[0];
    expect(bag.heldBy).toBe("hans");
    expect(bag.box.y + bag.box.h).toBeLessThan(hans.body.y + hans.body.h * 0.85);
    // the beat's subject takes what the beat says it goes with
    const plan = planProps(panel({ beat: "The Miller walks off with a basket of plums.", props: [{ prop: "basket", slot: "right" }] }), [fig({ character: "mayor", pose: "walk" }), fig({ character: "hans", pose: "stand" })], 4);
    expect(plan.held.get(0)?.prop).toBe("basket");
    expect(plan.held.has(1)).toBe(false);
    expect(plan.key.has("basket")).toBe(true);
    const lantern = planProps(panel({ beat: "Hans asks for the lantern; the Miller walks away with it.", props: [{ prop: "lamp", slot: "right" }] }), [fig({ character: "mayor", pose: "walk" })], 4);
    expect(lantern.held.get(0)?.prop).toBe("lamp");
  });

  it("keeps text off a key prop (the object the beat names), and says so when there is no room", () => {
    const p = panel({
      shot: "medium",
      location: "garret",
      beat: "The ruby lies on the table.",
      figures: [fig({ character: "playwright", slot: "left" })],
      props: [{ prop: "gem", slot: "center_right", tone: "black" }],
      text: [{ kind: "narration", text: "The ruby lay there, glowing red in the dark little room.", fidelity: "paraphrase" }],
    });
    const { result, details } = renderPageDetailed(onePage(p), BOOK);
    const c = compose(p, result.panels[0].bbox);
    const gem = c.props.find((x) => x.prop === "gem")!;
    expect(gem.key).toBe(true);
    for (const t of details[0].placed) {
      const corners = [
        { x: gem.box.x, y: gem.box.y },
        { x: gem.box.x + gem.box.w, y: gem.box.y },
        { x: gem.box.x + gem.box.w, y: gem.box.y + gem.box.h },
        { x: gem.box.x, y: gem.box.y + gem.box.h },
      ];
      if (!codes(result.issues).includes("KEY_PROP_COVERED")) expect(convexOverlap(t.hull, corners)).toBe(false);
    }
    // a key prop that fills a tiny panel under long text is an error, not a silent overlap
    const out = letterPanel({
      panelId: "p9",
      polygon: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 260 },
        { x: 0, y: 260 },
      ],
      bbox: { x: 0, y: 0, w: 300, h: 260 },
      texts: [{ kind: "narration", text: "Hans filled the Miller's basket with every last primrose he had.", fidelity: "paraphrase" }],
      speakers: [],
      heads: [],
      bodies: [],
      keepOut: [{ x: 10, y: 10, w: 280, h: 240 }],
      seed: 1,
    });
    expect(out.issues.find((i) => i.code === "KEY_PROP_COVERED")?.severity).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// Poses, scale and continuity
// ---------------------------------------------------------------------------

describe("poses and scale", () => {
  it("lies a figure horizontally on the ground, inside the frame", () => {
    const c = compose(panel({ shot: "wide", location: "garden", figures: [fig({ character: "playwright", pose: "lie", slot: "right" })] }));
    const f = c.figures[0];
    expect(f.body.w).toBeGreaterThan(f.body.h * 2);
    expect(f.body.x).toBeGreaterThanOrEqual(W.x);
    expect(f.body.x + f.body.w).toBeLessThanOrEqual(W.x + W.w);
    expect(f.body.y + f.body.h).toBeGreaterThan(W.y + W.h * 0.6);
  });

  it("gives a close-up lying figure ground to lie on", () => {
    const lying = compose(panel({ shot: "close", location: "garden", figures: [fig({ character: "playwright", pose: "lie" })] }));
    const standing = compose(panel({ shot: "close", location: "garden", figures: [fig({ character: "playwright" })] }));
    const band = /<path d="M[0-9.]+ [0-9.]+H[0-9.]+V[0-9.]+H[0-9.]+Z" fill="#d9d9d9"\/>/;
    expect(lying.content).toMatch(band);
    expect(standing.content).not.toMatch(band);
  });

  it("keeps a giant towering over the children beside him, whatever their depth", () => {
    const c = compose(panel({ shot: "wide", location: "garden", figures: [fig({ character: "giant", depth: "back", slot: "right" }), fig({ character: "children", depth: "fore", slot: "left" })] }));
    const giant = c.figures.find((f) => f.character === "giant")!;
    const kids = c.figures.find((f) => f.character === "children")!;
    expect(giant.body.h).toBeGreaterThanOrEqual(kids.body.h * 1.55);
  });

  it("lifts a flying figure off the ground and never puts it on its feet", () => {
    const c = compose(panel({ shot: "full", location: "garden", figures: [fig({ character: "mayor", slot: "left" }), fig({ character: "swallow", pose: "fly", slot: "right" })] }));
    const bird = c.figures.find((f) => f.character === "swallow")!;
    const man = c.figures.find((f) => f.character === "mayor")!;
    expect(bird.pose).toBe("fly");
    expect(bird.body.y + bird.body.h).toBeLessThan(man.body.y + man.body.h - 5);
  });

  it("perches a small creature beside a much taller figure on its shoulder in close-range shots (never on a bar in the air)", () => {
    const c = compose(panel({ shot: "medium", location: "garden", figures: [fig({ character: "mayor", slot: "left" }), fig({ character: "swallow", pose: "perch", slot: "right" })] }));
    const bird = c.figures.find((f) => f.character === "swallow")!;
    expect(bird.staging).toBe("on:mayor:shoulder");
    expect(bird.pose).toBe("stand");
  });

  it("keeps a figure staged on a hand readable in a wide shot (the camera pushes in)", () => {
    const c = compose(panel({ shot: "establishing", location: "garden", figures: [fig({ character: "giant", pose: "reach" }), fig({ character: "boy", pose: "reach", on: { target: "giant", part: "hand" } })] }));
    const boy = c.figures.find((f) => f.character === "boy")!;
    expect(boy.headRadius).toBeGreaterThanOrEqual(11);
    expect(codes(c.issues)).not.toContain("SUBJECT_TOO_SMALL");
  });
});

// ---------------------------------------------------------------------------
// SFX, titles, typography, name tags
// ---------------------------------------------------------------------------

describe("sfx by their source; titles, dashes and name tags", () => {
  it("places an SFX beside the figure that makes the sound, not on it", () => {
    const p = panel({
      shot: "establishing",
      location: "square",
      figures: [fig({ character: "prince", slot: "right" }), fig({ character: "swallow", pose: "fly", depth: "fore", slot: "left" })],
      text: [{ kind: "sfx", text: "FLAP", fidelity: "dramatized" }],
    });
    const { result, details } = renderPageDetailed(onePage(p), BOOK);
    const c = details[0];
    const bird = c.figures.find((f) => f.character === "swallow")!;
    const statue = c.figures.find((f) => f.character === "prince")!;
    const sfx = result.texts.find((t) => t.kind === "sfx")!;
    const centre = { x: sfx.bbox.x + sfx.bbox.w / 2, y: sfx.bbox.y + sfx.bbox.h / 2 };
    const d = (q: { x: number; y: number }) => Math.hypot(centre.x - q.x, centre.y - q.y);
    expect(d(bird.head)).toBeLessThan(d(statue.head));
    for (const f of c.figures) expect(circleHitsConvex(f.head, f.headRadius, c.placed.find((x) => x.kind === "sfx")!.hull)).toBe(false);
  });

  it("keeps a border-breaking SFX inside the page's live area and mostly in its own panel", () => {
    for (const spec of PAGES) {
      const r = renderPage(spec, BOOK);
      for (const t of r.texts.filter((x) => x.kind === "sfx")) {
        expect(t.bbox.x).toBeGreaterThanOrEqual(40 - 0.5);
        expect(t.bbox.y).toBeGreaterThanOrEqual(40 - 0.5);
        expect(t.bbox.x + t.bbox.w).toBeLessThanOrEqual(960 + 0.5);
        expect(t.bbox.y + t.bbox.h).toBeLessThanOrEqual(1460 + 0.5);
      }
    }
  }, 30000);

  it("letters a tale's title on one line at the top of the page's first panel", () => {
    expect(isTitleText("The Selfish Giant")).toBe(true);
    expect(isTitleText("The Nightingale and the Rose")).toBe(true);
    expect(isTitleText("The city, at night.")).toBe(false);
    const p = panel({ shot: "wide", figures: [fig({ character: "mayor" })], text: [{ kind: "caption", text: "The Remarkable Rocket Returns Again", fidelity: "paraphrase" }] });
    const r = renderPage(onePage({ ...p }, { layout: { template: "splash" } }), BOOK);
    const t = r.texts[0];
    expect(t.lines).toHaveLength(1);
    expect(t.bbox.y).toBeLessThan(r.panels[0].bbox.y + 30);
  });

  it("typesets a double hyphen as an em dash against the word before it", () => {
    expect(typeset("sympathy -- a virtue")).toBe("sympathy— a virtue");
    expect(typeset("lead--yet  I weep")).toBe("lead— yet I weep");
    const r = renderPage(onePage(panel({ figures: [fig({ character: "mayor" })], text: [{ kind: "speech", speaker: "mayor", text: "My heart is lead -- yet I weep.", fidelity: "dramatized" }] })), BOOK);
    expect(r.texts[0].lines.join(" ")).toContain("—");
    expect(r.texts[0].text).toBe("My heart is lead -- yet I weep.");
  });

  it("folds PDF ligatures into plain letters and rejects characters the font cannot draw", () => {
    // acceptance run 4, page 12: "take it o\uFB00" drew the font's empty box inside a quote
    expect(typeset("take it o\uFB00, lea\uFB02et, e\uFB03cacy")).toBe("take it off, leaflet, efficacy");
    const lig = renderPage(onePage(panel({ figures: [fig({ character: "mayor" })], text: [{ kind: "speech", speaker: "mayor", text: "Take it o\uFB00.", fidelity: "dramatized" }] })), BOOK);
    expect(lig.texts[0].lines.join(" ")).toContain("off");
    expect(lig.issues.map((i) => i.code)).not.toContain("TEXT_GLYPH_MISSING");
    const cjk = renderPage(onePage(panel({ figures: [fig({ character: "mayor" })], text: [{ kind: "speech", speaker: "mayor", text: "Look: \u6F22.", fidelity: "dramatized" }] })), BOOK);
    const issue = cjk.issues.find((i) => i.code === "TEXT_GLYPH_MISSING");
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain("U+6F22");
  });

  it("treats a caption with the fullest matching name as that character's tag", () => {
    const names = { miller: "The Miller", son: "The Miller's Youngest Son" };
    expect(inferNameTag("The Miller's youngest son", names)).toBe("son");
    expect(inferNameTag("The Miller", names)).toBe("miller");
  });

  it("places a speech balloon beside its own speaker, not over someone else's body below them", () => {
    const out = letterPanel({
      panelId: "p1",
      polygon: [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 700 },
        { x: 0, y: 700 },
      ],
      bbox: { x: 0, y: 0, w: 400, h: 700 },
      texts: [{ kind: "speech", speaker: "k", text: "You are more beautiful than your picture.", fidelity: "quote" }],
      speakers: [
        { character: "k", head: { x: 110, y: 420 }, headRadius: 34, mouth: { x: 125, y: 435 }, body: { x: 60, y: 386, w: 110, h: 314 } },
        { character: "p", head: { x: 290, y: 300 }, headRadius: 34, mouth: { x: 280, y: 315 }, body: { x: 240, y: 266, w: 110, h: 434 } },
      ],
      heads: [
        { character: "k", center: { x: 110, y: 420 }, radius: 34 },
        { character: "p", center: { x: 290, y: 300 }, radius: 34 },
      ],
      bodies: [
        { x: 60, y: 386, w: 110, h: 314 },
        { x: 240, y: 266, w: 110, h: 434 },
      ],
      seed: 5,
    });
    const box = out.placed[0].box;
    const overPrincess = Math.max(0, Math.min(box.x + box.w, 350) - Math.max(box.x, 240)) * Math.max(0, Math.min(box.y + box.h, 700) - Math.max(box.y, 266));
    expect(overPrincess / (box.w * box.h)).toBeLessThan(0.25);
    const tip = out.placed[0].tail!.tip;
    expect(Math.hypot(tip.x - 110, tip.y - 420) - 34).toBeLessThan(Math.hypot(tip.x - 290, tip.y - 300) - 34);
    expect(distPointSegment({ x: 290, y: 300 }, out.placed[0].center, tip)).toBeGreaterThan(34);
  });
});

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

describe("catalog for pass 3", () => {
  it("documents variants, eye states, fireworks and the new errors", () => {
    const c = catalog();
    expect(c.renderer_version).toBe("manga-render/0.6.0");
    expect(c.vocabularies.eye_states).toEqual(["open", "closed", "blind", "dead", "one_blind"]);
    expect(c.vocabularies.plant_blooms).toEqual(["full", "buds", "single", "bare"]);
    expect(c.vocabularies.fx).toContain("fireworks");
    expect(c.fields["figure.variant"]).toMatch(/material/);
    expect(c.fields["figure.variant.eyes"]).toMatch(/blind/);
    expect(c.variants.fields.human).toEqual(["eyes", "material", "outfit", "outfit_tone", "hair_tone"]);
    expect(c.variants.fields.bird).toEqual(["eyes", "tone"]);
    expect(c.variants.fields.plant).toEqual(["eyes", "tone", "bloom"]);
    expect(c.variants.fields.crowd).toEqual(["eyes"]);
    for (const k of ["SPEAKER_TOO_SMALL", "TAIL_CROSSES_FACE", "TAIL_CROSSES_TEXT", "TAIL_MISDIRECTED", "KEY_PROP_COVERED", "VARIANT_FIELD_INVALID"]) expect(c.errors[k], k).toBeDefined();
    for (const k of ["DUPLICATE_PROP", "NAME_TAG_AMBIGUOUS", "FIGURE_CLIPPED", "FIGURE_HEAD_CLIPPED", "SUBJECT_TOO_SMALL", "PROP_HIDDEN"]) expect(c.warnings[k], k).toBeDefined();
    expect(c.warnings.SPEAKER_TOO_SMALL).toBeUndefined();
    expect(c.fields["figure.on"]).toMatch(/EVERY shot/);
  });

  it("keeps the fixture pages acceptable and deterministic", () => {
    for (const spec of PAGES) {
      const a = renderPage(clone(spec), BOOK);
      expect(a.issues.filter((i) => i.severity === "error"), `page ${spec.page_number}`).toEqual([]);
      expect(renderPage(clone(spec), BOOK).svg).toBe(a.svg);
    }
  }, 60000);
});
