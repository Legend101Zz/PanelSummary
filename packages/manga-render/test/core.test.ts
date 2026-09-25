import { describe, expect, it } from "vitest";
import {
  ANGLES,
  FIDELITY,
  LOOK_KINDS,
  SHOTS,
  TEXT_KINDS,
  type BookUnderstanding,
  type LayoutNode,
  type MangaPageSpec,
  type PanelSpec,
  type TextSpec,
  type ValidationIssue,
} from "../src/contracts.js";
import {
  catalog,
  compileLayout,
  RENDERER_VERSION,
  renderPage,
  renderPageDetailed,
  TEMPLATES,
  templatesWithSlots,
  validatePage,
  validatePlan,
  validateUnderstanding,
} from "../src/index.js";
import { convexOverlap, signedArea, circleHitsConvex, bboxOf } from "../src/layout/geometry.js";
import { checkPanelGeometry, treeLeaves } from "../src/layout/compile.js";
import { breakBalanced } from "../src/lettering/breaking.js";
import { measure } from "../src/lettering/fonts.js";
import { letterPanel } from "../src/lettering/index.js";
import { scopeIds, hoistDefs, rescaleTones } from "../src/scene/ids.js";
import { toneDefs } from "../src/style.js";
import { BOOK, PAGES, PLAN, UNDERSTANDING, UNIT_IDS } from "./fixtures/happy-prince.js";

/** Issues that depend on which poses/expressions the (concurrently developed) rigs support. */
const RIG_SUPPORT = new Set(["POSE_UNSUPPORTED", "EXPRESSION_UNSUPPORTED"]);
const errorsOf = (issues: ValidationIssue[]) => issues.filter((i) => i.severity === "error" && !RIG_SUPPORT.has(i.code));
const codes = (issues: ValidationIssue[]) => issues.map((i) => i.code);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const planned = (n: number) => PLAN.pages.find((p) => p.page_number === n);

function page(overrides: Partial<MangaPageSpec> = {}, panels?: PanelSpec[]): MangaPageSpec {
  const base = clone(PAGES[0]);
  return { ...base, ...overrides, panels: panels ?? base.panels };
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

describe("layout templates", () => {
  it("has at least 18 uniquely named templates covering 1-7 panels", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(18);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (let count = 1; count <= 7; count += 1) expect(templatesWithSlots(count).length).toBeGreaterThan(0);
    for (const t of TEMPLATES) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(treeLeaves(t.tree)).toEqual(Array.from({ length: t.slots }, (_, i) => String(i)));
    }
  });

  it("has no uniform 2x2 grid", () => {
    const uniform2x2 = (n: LayoutNode): boolean =>
      "split" in n &&
      n.children.length === 2 &&
      new Set(n.sizes).size === 1 &&
      n.children.every((c) => "split" in c && c.split !== n.split && c.children.length === 2 && new Set(c.sizes).size === 1);
    for (const t of TEMPLATES) expect(uniform2x2(t.tree), t.id).toBe(false);
  });

  it("compiles every template into clean, separated, in-margin panels", () => {
    for (const t of TEMPLATES) {
      const ids = Array.from({ length: t.slots }, (_, i) => `p${i + 1}`);
      const out = compileLayout({ template: t.id }, ids);
      expect(out.ok, t.id).toBe(true);
      expect(out.issues, t.id).toEqual([]);
      expect(out.panels.map((p) => p.id)).toEqual(ids);
      expect(out.panels.map((p) => p.order)).toEqual(ids.map((_, i) => i));
      expect(checkPanelGeometry(out.panels, t.id), t.id).toEqual([]);
      for (const p of out.panels) {
        expect(p.polygon.length).toBeGreaterThanOrEqual(3);
        expect(signedArea(p.polygon)).toBeGreaterThan(0); // clockwise on a y-down page
        for (const v of p.polygon) {
          expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
          expect(v.x).toBeGreaterThanOrEqual(40 - 0.01);
          expect(v.x).toBeLessThanOrEqual(960 + 0.01);
          expect(v.y).toBeGreaterThanOrEqual(40 - 0.01);
          expect(v.y).toBeLessThanOrEqual(1460 + 0.01);
        }
      }
      for (let i = 0; i < out.panels.length; i += 1) {
        for (let j = i + 1; j < out.panels.length; j += 1) {
          // gutters keep panels at least ~18px apart
          expect(convexOverlap(out.panels[i].polygon, out.panels[j].polygon, 17), `${t.id} ${i}/${j}`).toBe(false);
        }
      }
    }
  });

  it("mirrors for right-to-left reading without changing reading order", () => {
    const ltr = compileLayout({ template: "l_shape_3" }, ["a", "b", "c"]);
    const rtl = compileLayout({ template: "l_shape_3", rtl: true }, ["a", "b", "c"]);
    expect(rtl.panels.map((p) => p.id)).toEqual(["a", "b", "c"]);
    // the tall first panel moves to the right-hand side
    expect(ltr.panels[0].bbox.x).toBeLessThan(ltr.panels[1].bbox.x);
    expect(rtl.panels[0].bbox.x).toBeGreaterThan(rtl.panels[1].bbox.x);
    ltr.panels.forEach((p, i) => {
      const m = rtl.panels[i];
      expect(m.bbox.x).toBeCloseTo(1000 - (p.bbox.x + p.bbox.w), 2);
      expect(m.bbox.w).toBeCloseTo(p.bbox.w, 2);
      expect(m.bbox.y).toBeCloseTo(p.bbox.y, 2);
      expect(signedArea(m.polygon)).toBeGreaterThan(0);
    });
  });
});

describe("authored layout trees", () => {
  const ids = ["p1", "p2", "p3"];
  const good: LayoutNode = {
    split: "rows",
    sizes: [2, 3],
    slant: 8,
    children: [{ panel: "p1" }, { split: "cols", sizes: [1, 1], slant: -6, children: [{ panel: "p2" }, { panel: "p3" }] }],
  };

  it("normalises sizes and clips slanted gutters cleanly", () => {
    const out = compileLayout({ tree: good }, ids);
    expect(out.issues).toEqual([]);
    expect(out.source).toBe("tree");
    // slanted gutter: the first panel's bottom edge is not horizontal
    const ys = out.panels[0].polygon.map((p) => p.y).filter((y) => y > 100);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(50);
    expect(convexOverlap(out.panels[1].polygon, out.panels[2].polygon, 17)).toBe(false);
  });

  const bad = (tree: unknown, panelIds = ids) => codes(compileLayout({ tree: tree as LayoutNode }, panelIds).issues);

  it("rejects leaf-count mismatches, unknown and missing panels", () => {
    expect(bad({ split: "rows", sizes: [1, 1], children: [{ panel: "p1" }, { panel: "p2" }] })).toContain("LAYOUT_LEAF_COUNT");
    expect(bad({ split: "rows", sizes: [1, 1, 1], children: [{ panel: "p1" }, { panel: "p2" }, { panel: "zz" }] })).toEqual(
      expect.arrayContaining(["LAYOUT_TREE_UNKNOWN_PANEL", "LAYOUT_TREE_MISSING_PANEL"]),
    );
  });

  it("rejects bad sizes, slants and reading-order mismatches", () => {
    expect(bad({ split: "rows", sizes: [1, -1, 1], children: [{ panel: "p1" }, { panel: "p2" }, { panel: "p3" }] })).toContain("LAYOUT_TREE_SIZES");
    expect(bad({ split: "rows", sizes: [1, 1], children: [{ panel: "p1" }, { panel: "p2" }, { panel: "p3" }] })).toContain("LAYOUT_TREE_SIZES");
    expect(bad({ split: "rows", sizes: [1, 1, 1], slant: 20, children: [{ panel: "p1" }, { panel: "p2" }, { panel: "p3" }] })).toContain("LAYOUT_TREE_SLANT");
    expect(bad({ split: "rows", sizes: [1, 1, 1], children: [{ panel: "p2" }, { panel: "p1" }, { panel: "p3" }] })).toContain("LAYOUT_READING_ORDER");
    expect(bad({ split: "diagonal", sizes: [1, 1, 1], children: [{ panel: "p1" }, { panel: "p2" }, { panel: "p3" }] })).toContain("LAYOUT_TREE_SPLIT");
  });

  it("rejects panels that are too small or too thin, and more than 7 panels", () => {
    expect(bad({ split: "rows", sizes: [0.9, 0.05, 0.05], children: [{ panel: "p1" }, { panel: "p2" }, { panel: "p3" }] })).toContain("LAYOUT_PANEL_TOO_SMALL");
    expect(bad({ split: "cols", sizes: [1, 1, 1], children: [{ panel: "p1" }, { panel: "p2" }, { panel: "p3" }] })).toEqual([]);
    const eight = Array.from({ length: 8 }, (_, i) => `q${i}`);
    expect(bad({ split: "rows", sizes: eight.map(() => 1), children: eight.map((panel) => ({ panel })) }, eight)).toContain("LAYOUT_TOO_MANY_PANELS");
    const five = Array.from({ length: 5 }, (_, i) => `r${i}`);
    const thin = { split: "cols", sizes: [1, 1], children: [{ panel: "r0" }, { split: "rows", sizes: [1, 1, 1, 1], children: five.slice(1).map((panel) => ({ panel })) }] };
    expect(bad(thin, five)).toEqual([]);
    const sliver = { split: "rows", sizes: [0.12, 0.88], children: [{ panel: "a" }, { panel: "b" }] };
    expect(bad(sliver, ["a", "b"])).toContain("LAYOUT_PANEL_ASPECT");
  });

  it("reports unknown templates and slot mismatches with alternatives, and still returns geometry", () => {
    const unknown = compileLayout({ template: "grid_2x2" }, ["a", "b", "c", "d"]);
    expect(codes(unknown.issues)).toContain("LAYOUT_TEMPLATE_UNKNOWN");
    expect(unknown.issues[0].message).toContain("staggered_4");
    expect(unknown.panels).toHaveLength(4);
    const mismatch = compileLayout({ template: "splash" }, ["a", "b"]);
    expect(codes(mismatch.issues)).toContain("LAYOUT_SLOT_COUNT");
    expect(mismatch.panels).toHaveLength(2);
    expect(codes(compileLayout({}, ["a"]).issues)).toContain("LAYOUT_MISSING");
  });
});

// ---------------------------------------------------------------------------
// Lettering
// ---------------------------------------------------------------------------

describe("line breaking", () => {
  const m = (s: string) => measure(s, "bold", 28);

  it("uses the fewest lines and balances them", () => {
    const text = "It is curious, but I feel quite warm now, although it is so cold.";
    const block = breakBalanced(text, 300, m, "flat");
    expect(block).not.toBeNull();
    const lines = block?.lines ?? [];
    expect(lines.join(" ")).toBe(text);
    // greedy line count at the same width
    const words = text.split(" ");
    let greedy = 1;
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && m(next) > 300) {
        greedy += 1;
        cur = w;
      } else cur = next;
    }
    expect(lines.length).toBe(greedy);
    const widths = lines.map(m);
    // balanced: the shortest line is at least 55% of the longest
    expect(Math.min(...widths) / Math.max(...widths)).toBeGreaterThan(0.55);
  });

  it("never breaks a word that fits, and splits only a word wider than the line", () => {
    const block = breakBalanced("Shall I love you?", 120, m, "lens");
    expect(block?.lines.every((l) => !l.endsWith("-"))).toBe(true);
    expect(block?.lines.join(" ")).toBe("Shall I love you?");
    const long = breakBalanced("Supercalifragilistic", 100, m, "lens");
    expect((long?.lines.length ?? 0)).toBeGreaterThan(1);
    expect(long?.lines.join("").replace(/-/g, "")).toBe("Supercalifragilistic");
  });
});

describe("lettering placement", () => {
  const polygon = [
    { x: 100, y: 100 },
    { x: 600, y: 100 },
    { x: 600, y: 500 },
    { x: 100, y: 500 },
  ];
  const bbox = { x: 100, y: 100, w: 500, h: 400 };
  const left = { character: "a", head: { x: 220, y: 330 }, headRadius: 40, mouth: { x: 240, y: 345 }, body: { x: 180, y: 290, w: 80, h: 210 } };
  const right = { character: "b", head: { x: 480, y: 340 }, headRadius: 40, mouth: { x: 460, y: 355 }, body: { x: 440, y: 300, w: 80, h: 200 } };
  const texts: TextSpec[] = [
    { kind: "speech", speaker: "a", text: "Who are you?", fidelity: "quote" },
    { kind: "speech", speaker: "b", text: "I am the Happy Prince.", fidelity: "quote" },
  ];
  const run = (t: TextSpec[], extra: Partial<Parameters<typeof letterPanel>[0]> = {}) =>
    letterPanel({
      panelId: "p1",
      polygon,
      bbox,
      texts: t,
      speakers: [left, right],
      heads: [left, right].map((s) => ({ character: s.character, center: s.head, radius: s.headRadius })),
      bodies: [left.body, right.body],
      seed: 7,
      ...extra,
    });

  it("points each tail at its own speaker, ending near (not on) the mouth", () => {
    const out = run(texts);
    expect(out.issues).toEqual([]);
    for (const p of out.placed) {
      const speaker = p.index === 0 ? left : right;
      const other = p.index === 0 ? right : left;
      const tip = p.tail?.tip;
      expect(tip).toBeDefined();
      if (!tip) continue;
      const d = Math.hypot(tip.x - speaker.mouth.x, tip.y - speaker.mouth.y);
      expect(d).toBeGreaterThan(8);
      expect(d).toBeLessThanOrEqual(speaker.headRadius * 1.25 + 12);
      expect(d).toBeLessThan(Math.hypot(tip.x - other.mouth.x, tip.y - other.mouth.y));
    }
  });

  it("keeps reading order: the first balloon is higher or toward the reading start", () => {
    const out = run(texts);
    const [a, b] = out.placed;
    expect(a.box.y <= b.box.y + 6 || a.box.x + a.box.w / 2 < b.box.x + b.box.w / 2).toBe(true);
  });

  it("never covers a head and never overlaps another balloon", () => {
    const out = run([...texts, { kind: "narration", text: "Night had fallen over the city.", fidelity: "paraphrase" }]);
    for (const p of out.placed) {
      for (const h of [left, right]) expect(circleHitsConvex(h.head, h.headRadius, p.hull)).toBe(false);
    }
    for (let i = 0; i < out.placed.length; i += 1) {
      for (let j = i + 1; j < out.placed.length; j += 1) expect(convexOverlap(out.placed[i].hull, out.placed[j].hull)).toBe(false);
    }
  });

  it("reports TEXT_DOES_NOT_FIT with a word hint instead of shrinking or truncating", () => {
    const long = "Far away, far away in a little street there is a poor house. One of the windows is open, and through it I can see a woman seated at a table, sewing with a needle.";
    const out = run([{ kind: "speech", speaker: "a", text: long, fidelity: "quote" }], {
      polygon: [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 260 },
        { x: 100, y: 260 },
      ],
      bbox: { x: 100, y: 100, w: 200, h: 160 },
      speakers: [],
      heads: [],
      bodies: [],
    });
    const err = out.issues.find((i) => i.code === "TEXT_DOES_NOT_FIT");
    expect(err?.severity).toBe("error");
    expect(err?.path).toBe("panel p1 text 0");
    expect(err?.message).toMatch(/Max ~\d+ words fit here/);
    // still lettered in full, at no less than the minimum size
    const rendered = out.texts[0];
    expect(rendered.font_px).toBeGreaterThanOrEqual(22);
    expect(rendered.lines.join(" ").replace(/- /g, "").replace(/\s+/g, " ")).toBe(long);
  });

  it("points off-panel tails at the panel border", () => {
    const out = run([{ kind: "speech", speaker: "zz", text: "Over here!", fidelity: "dramatized" }], {
      offPanel: { zz: { x: 900, y: 300 } },
    });
    const tip = out.placed[0].tail?.tip;
    expect(tip).toBeDefined();
    if (tip) expect(Math.abs(tip.x - 600)).toBeLessThan(6); // the right-hand border faces the speaker
  });
});

// ---------------------------------------------------------------------------
// Fixtures: understanding, plan, pages
// ---------------------------------------------------------------------------

describe("fixtures", () => {
  it("the understanding and plan are valid", () => {
    expect(validateUnderstanding(UNDERSTANDING, UNIT_IDS).filter((i) => i.severity === "error")).toEqual([]);
    expect(validatePlan(PLAN, UNDERSTANDING, UNIT_IDS).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("the pages exercise every shot, text kind, fidelity and a slanted authored tree", () => {
    const panels = PAGES.flatMap((p) => p.panels);
    expect(new Set(panels.map((p) => p.shot))).toEqual(new Set(SHOTS));
    expect(new Set(panels.flatMap((p) => p.text.map((t) => t.kind)))).toEqual(new Set(TEXT_KINDS));
    expect(new Set(panels.flatMap((p) => p.text.map((t) => t.fidelity)))).toEqual(new Set(FIDELITY));
    expect(PAGES.some((p) => p.layout.tree && JSON.stringify(p.layout.tree).includes("slant"))).toBe(true);
  });

  for (const spec of PAGES) {
    it(`page ${spec.page_number} validates and renders without layout/lettering errors`, () => {
      const { result, details } = renderPageDetailed(spec, BOOK, { planned: planned(spec.page_number) });
      expect(errorsOf(result.issues)).toEqual([]);
      expect(result.panels).toHaveLength(spec.panels.length);
      const expectedTexts = spec.panels.reduce((s, p) => s + p.text.length, 0);
      expect(result.texts).toHaveLength(expectedTexts);
      // bubbles never overlap heads; lettering stays inside its panel
      for (const d of details) {
        const panelGeo = result.panels.find((p) => p.id === d.id);
        for (const p of d.placed) {
          for (const f of d.figures) expect(circleHitsConvex(f.head, f.headRadius, p.hull), `${spec.page_number}/${d.id} text ${p.index}`).toBe(false);
          const b = bboxOf(p.hull);
          if (panelGeo) {
            expect(b.x).toBeGreaterThanOrEqual(panelGeo.bbox.x - 0.5);
            expect(b.x + b.w).toBeLessThanOrEqual(panelGeo.bbox.x + panelGeo.bbox.w + 0.5);
          }
        }
        // tails of speakers drawn in the panel end near their mouth
        for (const p of d.placed) {
          const text = spec.panels.find((x) => x.id === d.id)?.text[p.index];
          const fig = d.figures.find((f) => f.character === text?.speaker);
          if (!fig || !p.tail || p.tail.offPanel) continue;
          const dist = Math.hypot(p.tail.tip.x - fig.mouth.x, p.tail.tip.y - fig.mouth.y);
          expect(dist).toBeLessThanOrEqual(fig.headRadius * 1.25 + 12);
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// validatePage rules
// ---------------------------------------------------------------------------

describe("validatePage", () => {
  const v = (spec: unknown, plan = planned(1)) => validatePage(spec, BOOK, plan);
  const firstPanel = () => clone(PAGES[0].panels[2]); // medium shot with the mayor speaking

  it("accepts the fixture page", () => {
    expect(errorsOf(v(PAGES[0]))).toEqual([]);
  });

  it("checks JSON shape and required fields", () => {
    expect(codes(v(null))).toEqual(["PAGE_NOT_OBJECT"]);
    expect(codes(v({ ...PAGES[0], schema: "x" }))).toContain("SCHEMA");
    const missing = clone(PAGES[0]) as unknown as Record<string, unknown>;
    delete missing.purpose;
    expect(codes(v(missing))).toContain("FIELD_MISSING");
    const p = firstPanel() as unknown as Record<string, unknown>;
    delete p.figures;
    expect(codes(v(page({}, [p as unknown as PanelSpec])))).toContain("FIELD_MISSING");
  });

  it("lists allowed values for bad enums", () => {
    const p = firstPanel();
    (p as unknown as Record<string, unknown>).shot = "super_wide";
    p.figures[0].pose = "dance" as never;
    const issues = v(page({ layout: { template: "splash" } }, [p]), undefined);
    const shot = issues.find((i) => i.code === "ENUM_INVALID" && i.message.includes("super_wide"));
    expect(shot?.message).toContain("establishing, wide, full");
    expect(issues.some((i) => i.code === "ENUM_INVALID" && i.message.includes("dance"))).toBe(true);
  });

  it("rejects unknown cast and locations", () => {
    const p = firstPanel();
    p.location = "moon";
    p.figures[0].character = "wizard";
    const c = codes(v(page({ layout: { template: "splash" } }, [p]), undefined));
    expect(c).toEqual(expect.arrayContaining(["UNKNOWN_LOCATION", "UNKNOWN_CAST"]));
  });

  it("enforces speaker rules by text kind", () => {
    const p = firstPanel();
    p.text = [
      { kind: "speech", text: "Hello.", fidelity: "dramatized" },
      { kind: "narration", speaker: "mayor", text: "Meanwhile.", fidelity: "dramatized" },
      { kind: "speech", speaker: "nobody", text: "Hi.", fidelity: "dramatized" },
      { kind: "speech", speaker: "prince", text: "Hi.", fidelity: "dramatized" },
    ];
    const issues = v(page({ layout: { template: "splash" } }, [p]), undefined);
    expect(codes(issues)).toEqual(expect.arrayContaining(["SPEAKER_REQUIRED", "SPEAKER_FORBIDDEN", "SPEAKER_UNKNOWN", "SPEAKER_OFF_PANEL"]));
    expect(issues.find((i) => i.code === "SPEAKER_OFF_PANEL")?.severity).toBe("warning");
  });

  it("limits panels, figures, props and fx", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...firstPanel(), id: `x${i}` }));
    expect(codes(v(page({ layout: { template: "dense_7" } }, many), undefined))).toContain("PANEL_COUNT");
    const p = firstPanel();
    p.figures = ["prince", "mayor", "boy", "seamstress", "playwright"].map((character, i) => ({
      character,
      pose: "stand" as const,
      expression: "neutral" as const,
      facing: "right" as const,
      slot: (["left", "center_left", "center", "center_right", "right"] as const)[i],
    }));
    p.props = Array.from({ length: 5 }, () => ({ prop: "book" as const, slot: "center" as const }));
    p.fx = ["rain", "snow", "wind", "sparkle"];
    const c = codes(v(page({ layout: { template: "splash" } }, [p]), undefined));
    expect(c).toEqual(expect.arrayContaining(["TOO_MANY_FIGURES", "TOO_MANY_PROPS", "TOO_MANY_FX"]));
  });

  it("applies word limits per balloon, panel and page", () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
    const p = firstPanel();
    p.text = [{ kind: "speech", speaker: "mayor", text: words(30), fidelity: "dramatized" }];
    let issues = v(page({ layout: { template: "splash" } }, [p]), undefined);
    expect(issues.find((i) => i.code === "WORDS_BALLOON")?.severity).toBe("warning");
    p.text = [{ kind: "speech", speaker: "mayor", text: words(41), fidelity: "dramatized" }];
    issues = v(page({ layout: { template: "splash" } }, [p]), undefined);
    expect(issues.find((i) => i.code === "WORDS_BALLOON")?.severity).toBe("error");
    p.text = [
      { kind: "speech", speaker: "mayor", text: words(22), fidelity: "dramatized" },
      { kind: "speech", speaker: "mayor", text: words(22), fidelity: "dramatized" },
    ];
    issues = v(page({ layout: { template: "splash" } }, [p]), undefined);
    expect(issues.find((i) => i.code === "WORDS_PANEL")?.severity).toBe("warning");
    p.text = [
      { kind: "speech", speaker: "mayor", text: words(31), fidelity: "dramatized" },
      { kind: "speech", speaker: "mayor", text: words(31), fidelity: "dramatized" },
    ];
    issues = v(page({ layout: { template: "splash" } }, [p]), undefined);
    expect(issues.find((i) => i.code === "WORDS_PANEL")?.severity).toBe("error");
    const panels = Array.from({ length: 4 }, (_, i) => ({
      ...firstPanel(),
      id: `q${i}`,
      text: [{ kind: "speech" as const, speaker: "mayor", text: words(39), fidelity: "dramatized" as const }],
    }));
    issues = v(page({ layout: { template: "staggered_4" } }, panels), undefined);
    expect(issues.find((i) => i.code === "WORDS_PAGE")?.severity).toBe("error");
  });

  it("rejects empty panels and duplicate panel ids", () => {
    const empty = { ...firstPanel(), figures: [], text: [] };
    expect(codes(v(page({ layout: { template: "splash" } }, [empty]), undefined))).toContain("EMPTY_PANEL");
    const a = firstPanel();
    const b = firstPanel();
    expect(codes(v(page({ layout: { template: "stack_2" } }, [a, b]), undefined))).toContain("DUPLICATE_PANEL_ID");
  });

  it("requires sources on panels and on quote/paraphrase text, and checks fidelity", () => {
    const p = firstPanel();
    p.source = [];
    p.text = [{ kind: "speech", speaker: "mayor", text: "Beautiful!", fidelity: "quote" }];
    const c = codes(v(page({ layout: { template: "splash" } }, [p]), undefined));
    expect(c).toEqual(expect.arrayContaining(["SOURCE_MISSING", "TEXT_SOURCE_MISSING"]));
    const q = firstPanel();
    (q.text[0] as unknown as Record<string, unknown>).fidelity = "invented";
    expect(codes(v(page({ layout: { template: "splash" } }, [q]), undefined))).toContain("ENUM_INVALID");
  });

  it("matches the planned page", () => {
    const wrong = { ...clone(PAGES[0]), page_number: 9, section_id: "s4", claims: ["c01", "c10"] };
    const c = codes(v(wrong, planned(1)));
    expect(c).toEqual(expect.arrayContaining(["PLAN_PAGE_NUMBER", "PLAN_SECTION", "PLAN_CLAIMS_MISSING", "PLAN_CLAIMS_EXTRA"]));
  });

  it("checks rig support for poses and expressions", () => {
    const p = firstPanel();
    p.figures = [{ character: "reed", pose: "run", expression: "neutral", facing: "right", slot: "center" }];
    p.text = [];
    const issues = v(page({ layout: { template: "splash" } }, [p]), undefined);
    // a reed cannot run (whatever the plant rig supports, "run" is not a plant pose)
    expect(codes(issues)).toContain("POSE_UNSUPPORTED");
    expect(issues.find((i) => i.code === "POSE_UNSUPPORTED")?.message).toContain("use one of");
  });

  it("reports layout problems", () => {
    const c = codes(v(page({ layout: { template: "splash" } }), planned(1)));
    expect(c).toContain("LAYOUT_SLOT_COUNT");
  });
});

// ---------------------------------------------------------------------------
// validateUnderstanding / validatePlan
// ---------------------------------------------------------------------------

describe("validateUnderstanding and validatePlan", () => {
  it("catches unknown units, duplicate ids and invalid looks", () => {
    const u = clone(UNDERSTANDING);
    u.claims[0].source = [{ unit: "u99", page: 1 }];
    u.cast.push(clone(u.cast[0]));
    (u.cast[1].look as unknown as Record<string, unknown>).species = "dragon";
    const c = codes(validateUnderstanding(u, UNIT_IDS));
    expect(c).toEqual(expect.arrayContaining(["SOURCE_UNKNOWN_UNIT", "DUPLICATE_ID", "ENUM_INVALID"]));
  });

  it("catches unplanned claims, numbering, claim limits, skipped and out-of-order sections", () => {
    const plan = clone(PLAN);
    plan.pages = plan.pages.filter((p) => p.section_id !== "s4");
    plan.pages[1].page_number = 5;
    plan.pages[0].claims = ["c01", "c02", "c03", "c04", "c05"];
    const reorder = clone(PLAN);
    [reorder.pages[0], reorder.pages[3]] = [reorder.pages[3], reorder.pages[0]];
    reorder.pages.forEach((p, i) => (p.page_number = i + 1));
    const c = codes(validatePlan(plan, UNDERSTANDING, UNIT_IDS));
    expect(c).toEqual(expect.arrayContaining(["CLAIM_UNPLANNED", "PAGE_NUMBERING", "TOO_MANY_CLAIMS", "SECTION_SKIPPED"]));
    expect(codes(validatePlan(reorder, UNDERSTANDING, UNIT_IDS))).toContain("SECTION_ORDER");
  });

  it("accepts omissions with reasons", () => {
    const plan = clone(PLAN);
    plan.pages[5].claims = ["c10"];
    plan.omitted = [{ claim: "c12", reason: "the seasons are carried by the art" }];
    const issues = validatePlan(plan, UNDERSTANDING as BookUnderstanding, UNIT_IDS);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe("renderPage", () => {
  it("is deterministic", () => {
    for (const spec of PAGES) {
      const a = renderPage(spec, BOOK);
      const b = renderPage(clone(spec), BOOK);
      expect(a.svg).toBe(b.svg);
      expect(a.svg_hash).toBe(b.svg_hash);
      expect(a.svg_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(a.renderer_version).toBe(RENDERER_VERSION);
    }
  });

  it("emits clean SVG: one defs, prefixed and resolvable ids, no forbidden elements", () => {
    for (const spec of PAGES) {
      const prefix = `t${spec.page_number}x-`;
      const { svg } = renderPage(spec, BOOK, { idPrefix: prefix });
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1500" width="1000" height="1500" role="img" aria-label="')).toBe(true);
      expect(svg).not.toMatch(/<image|<script|<foreignObject|preserveAspectRatio="none"|\sclass=|NaN|Infinity/);
      expect(svg.match(/<defs[\s>]/g)).toHaveLength(1);
      const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(id.startsWith(prefix), id).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
      const refs = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
      for (const r of refs) expect(ids, r).toContain(r);
    }
  });

  it("renders every shot, angle and text kind without throwing", () => {
    const base = clone(PAGES[0].panels[2]);
    for (const shot of SHOTS) {
      for (const angle of ANGLES) {
        const p: PanelSpec = {
          ...base,
          id: "p1",
          shot,
          angle,
          props: shot === "insert" ? [{ prop: "gem", slot: "center" }] : [],
          text: [
            { kind: "speech", speaker: "mayor", text: "Hm.", fidelity: "dramatized" },
            { kind: "sfx", text: "BONG", fidelity: "dramatized" },
          ],
        };
        const r = renderPage(page({ layout: { template: "splash" }, page_number: 1 }, [p]), BOOK);
        expect(r.svg).not.toMatch(/NaN|Infinity/);
        expect(r.texts).toHaveLength(2);
      }
    }
  });

  it("returns geometry, texts and metrics consistent with the spec", () => {
    const spec = PAGES[2];
    const r = renderPage(spec, BOOK);
    expect(r.width).toBe(1000);
    expect(r.height).toBe(1500);
    expect(r.panels.map((p) => p.id)).toEqual(spec.panels.map((p) => p.id));
    expect(r.metrics.panel_count).toBe(spec.panels.length);
    expect(r.metrics.words_total).toBeGreaterThan(0);
    for (const t of r.texts) {
      expect(t.lines.length).toBeGreaterThan(0);
      expect(t.font_px).toBeGreaterThanOrEqual(22);
      expect([t.bbox.x, t.bbox.y, t.bbox.w, t.bbox.h].every(Number.isFinite)).toBe(true);
    }
  });

  it("mirrors slots and facings on right-to-left pages", () => {
    const spec = clone(PAGES[4]);
    const ltr = renderPageDetailed(spec, BOOK).details;
    spec.layout.rtl = true;
    const rtl = renderPageDetailed(spec, BOOK).details;
    ltr.forEach((d, i) => {
      d.figures.forEach((f, j) => {
        const m = rtl[i].figures[j];
        expect(m.character).toBe(f.character);
        expect(m.head.x).toBeCloseTo(1000 - f.head.x, 0);
        expect(m.mouth.x).toBeCloseTo(1000 - f.mouth.x, 0);
      });
    });
  });

  it("keeps screentone dots at page scale inside scaled figures", () => {
    const { svg } = renderPage(PAGES[0], BOOK, { idPrefix: "q-" });
    // the gold statue is drawn inside a scale() group: its tone must be a rescaled copy
    const scaled = [...svg.matchAll(/<pattern id="(q-[^"]*-tone-[a-z_]+)"[^>]*patternTransform="scale\(([0-9.e-]+)\)/g)];
    expect(scaled.length).toBeGreaterThan(0);
    for (const m of scaled) expect(Number(m[2])).toBeLessThan(1);
    const frag = `<path fill="url(#p-tone-dots)"/><path fill="url(#p-tone-fade)"/>`;
    const out = rescaleTones(frag, "p-", "f1", 4, toneDefs("p-"));
    expect(out.body).toContain("url(#p-f1-tone-dots)");
    expect(out.body).toContain("url(#p-tone-fade)");
    expect(out.defs).toContain('patternTransform="scale(0.25) rotate(45)"');
  });

  it("still renders a preview for broken input and reports why", () => {
    const r = renderPage({ schema: "manga-page.v1", panels: [{ id: "a" }] }, BOOK);
    expect(r.issues.some((i) => i.severity === "error")).toBe(true);
    expect(r.svg).toContain("<svg");
    const nothing = renderPage("not a page", BOOK);
    expect(codes(nothing.issues)).toContain("PAGE_NOT_OBJECT");
  });
});

describe("catalog and id hygiene helpers", () => {
  it("lists vocabularies, templates and per-kind support", () => {
    const c = catalog();
    expect(c.templates.length).toBe(TEMPLATES.length);
    expect(c.templates.every((t) => t.description.length > 0 && t.slots >= 1 && t.slots <= 7)).toBe(true);
    expect(Object.keys(c.looks).sort()).toEqual([...LOOK_KINDS].sort());
    for (const k of LOOK_KINDS) expect(c.looks[k].poses.length).toBeGreaterThan(0);
    expect(c.vocabularies.shots).toEqual(SHOTS);
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });

  it("scopes fragment ids and hoists defs", () => {
    const frag = `<defs><clipPath id="c1"><rect/></clipPath></defs><g clip-path="url(#c1)" fill="url(#pg-tone-dots)"><use href="#c1"/></g>`;
    const scoped = scopeIds(frag, "pg-", "f0");
    expect(scoped).toContain('id="pg-f0-c1"');
    expect(scoped).toContain("url(#pg-f0-c1)");
    expect(scoped).toContain('href="#pg-f0-c1"');
    expect(scoped).toContain("url(#pg-tone-dots)");
    const { body, defs } = hoistDefs(scoped);
    expect(body).not.toContain("<defs");
    expect(defs).toContain("clipPath");
  });
});
