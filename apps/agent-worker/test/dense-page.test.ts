/**
 * Track F1: repair hints for a dense page (docs/launch/F1-dense-page.md). No model.
 */
import { describe, expect, it } from "vitest";

import type { MangaPageSpec, ValidationIssue } from "@panelsummary/manga-render";

import { PAGES, PLAN, UNDERSTANDING } from "../../../packages/manga-render/test/fixtures/happy-prince.js";
import { CANDIDATE_ARG } from "../src/goals/common.js";
import { mangaPageGoal, quoteIssues, quoteJoinPoint, PAGE_LIMITS, TERSE_REPAIR } from "../src/goals/manga-page.js";
import { crowdingAdvice, explainAspect, RepairTracker, templatesFor } from "../src/goals/repair-hints.js";
import type { GoalOptions } from "../src/goals/types.js";

const FIXTURE_QUOTES = PAGES.flatMap((page) => page.panels.flatMap((panel) => (panel.text ?? []).filter((t) => t.fidelity === "quote").map((t) => t.text))).join(" ");
const OFF: GoalOptions = { model: "MiniMax-M3", thinking: "off", vision: false };
const err = (code: string, path = "panel p1 text 0"): ValidationIssue => ({ code, severity: "error", path, message: `${code} message` });

function specWith(panels: number, textsPerPanel: number): MangaPageSpec {
  return {
    schema: "manga-page.v1",
    page_number: 12,
    section_id: "s2",
    purpose: "x",
    layout: { template: "establish_4" },
    panels: Array.from({ length: panels }, (_, i) => ({
      id: `p${i + 1}`,
      text: Array.from({ length: textsPerPanel }, () => ({ kind: "speech", text: "one two three four five six", fidelity: "quote" })),
    })),
    claims: [],
  } as unknown as MangaPageSpec;
}

describe("crowdingAdvice", () => {
  it("names the page-level cause and the templates with more panels when room errors hit several panels", () => {
    const issues = [err("TEXT_DOES_NOT_FIT", "panel p2 text 0"), err("BALLOON_TALL", "panel p3 text 0"), err("TAIL_CROSSES_TEXT", "panel p4 text 1")];
    const advice = crowdingAdvice(specWith(4, 2), issues)!;
    expect(advice.code).toBe("PAGE_TOO_FULL");
    expect(advice.severity).toBe("warning");
    expect(advice.message).toContain("8 texts (48 words) in 4 panels");
    expect(advice.message).toMatch(/establish_5 \(5 panels\)/);
    expect(advice.message).toMatch(/establish_6 \(6 panels\)/);
    expect(advice.message).not.toMatch(/establish_4/);
  });

  it("says to cut words when the page already has the most panels", () => {
    const issues = [err("TEXT_DOES_NOT_FIT", "panel p1 text 0"), err("TEXT_DOES_NOT_FIT", "panel p2 text 0")];
    expect(crowdingAdvice(specWith(7, 2), issues)!.message).toMatch(/already has 7 panels/);
  });

  it("stays silent for one room error, for non-room errors, and for a roomy page with errors in one panel", () => {
    expect(crowdingAdvice(specWith(4, 2), [err("TEXT_DOES_NOT_FIT", "panel p1 text 0")])).toBeUndefined();
    expect(crowdingAdvice(specWith(4, 3), [err("QUOTE_NOT_IN_SOURCE"), err("SPEAKER_REQUIRED")])).toBeUndefined();
    expect(crowdingAdvice(specWith(5, 1), [err("TEXT_DOES_NOT_FIT", "panel p1 text 0"), err("BALLOON_TALL", "panel p1 text 0")])).toBeUndefined();
  });

  it("ignores warnings", () => {
    const warn = { ...err("TEXT_DOES_NOT_FIT", "panel p1 text 0"), severity: "warning" as const };
    expect(crowdingAdvice(specWith(4, 3), [warn, { ...warn, path: "panel p2 text 0" }])).toBeUndefined();
  });
});

describe("explainAspect", () => {
  it("adds the templates with the page's panel count to LAYOUT_PANEL_ASPECT", () => {
    const issue = err("LAYOUT_PANEL_ASPECT", "layout");
    const out = explainAspect(issue, specWith(5, 1));
    expect(out.message).toContain("establish_5");
    expect(out.message).toContain("staggered_5");
    expect(out.message).toContain("exactly 5 panels");
    expect(templatesFor(5)).toContain("l_shape_5");
  });

  it("leaves every other issue alone", () => {
    const issue = err("TEXT_DOES_NOT_FIT");
    expect(explainAspect(issue, specWith(5, 1))).toBe(issue);
  });
});

describe("RepairTracker", () => {
  const round = (...codes: string[]) => codes.map((c) => err(c));

  it("warns when three tries in a row have few errors but the errors keep changing (page 12 of the CI run)", () => {
    const tracker = new RepairTracker();
    expect(tracker.record(round("CHARACTER_NOT_INTRODUCED"))).toBeUndefined();
    expect(tracker.record(round("SPEAKER_TOO_SMALL"))).toBeUndefined();
    const loop = tracker.record(round("TEXT_DOES_NOT_FIT"))!;
    expect(loop.code).toBe("REPAIR_LOOP");
    expect(loop.severity).toBe("warning");
    expect(loop.message).toContain("CHARACTER_NOT_INTRODUCED -> SPEAKER_TOO_SMALL -> TEXT_DOES_NOT_FIT");
    expect(loop.message).toContain("name the character in a caption");
    expect(loop.message).toContain("medium or close shot");
    expect(tracker.record(round("LAYOUT_PANEL_ASPECT"))!.message).toContain("ready template");
  });

  it("stays silent while a try still has many errors, while the same error repeats, and after a clean try", () => {
    const many = new RepairTracker();
    for (const codes of [["A", "B", "C", "D"], ["E", "F", "G", "H"], ["I", "J", "K", "L"]]) expect(many.record(round(...codes))).toBeUndefined();
    const same = new RepairTracker();
    for (let i = 0; i < 4; i += 1) expect(same.record(round("TEXT_DOES_NOT_FIT"))).toBeUndefined();
    const clean = new RepairTracker();
    expect(clean.record([])).toBeUndefined();
    expect(clean.record([{ ...err("X"), severity: "warning" }])).toBeUndefined();
  });
});

describe("quote cut without an ellipsis", () => {
  const source = " there is a way answered the tree but it is so terrible that i dare not tell it to you tell it to me said the nightingale i am not afraid ";

  it("finds where two pieces of the book were joined", () => {
    const join = quoteJoinPoint("there is a way but i am not afraid", source)!;
    expect(join.kept).toBe("there is a way");
    expect(join.rest).toBe("but i am not afraid");
    expect(quoteJoinPoint("nothing like the book at all", source)).toBeUndefined();
  });

  it("tells the writer to write ... where words are skipped (QUOTE_NOT_IN_SOURCE)", () => {
    const spec = { panels: [{ id: "p1", text: [{ kind: "speech", speaker: "c_tree", text: "There is a way, I am not afraid.", fidelity: "quote" }] }] } as unknown as MangaPageSpec;
    const [issue] = quoteIssues(spec, [{ text: "\u201cThere is a way,\u201d answered the Tree; \u201cbut it is so terrible.\u201d \u201cTell it to me,\u201d said the Nightingale, \u201cI am not afraid.\u201d" }]);
    expect(issue.code).toBe("QUOTE_NOT_IN_SOURCE");
    expect(issue.message).toContain('The words "there is a way"');
    expect(issue.message).toContain('write "..."');
  });
});

describe("page limits and terse repair", () => {
  it("allows 8 submits, keeps the 16,000-token turn cap and the cost limit", () => {
    expect(PAGE_LIMITS.maxSubmits).toBe(8);
    expect(PAGE_LIMITS.maxOutputTokens).toBe(16_000);
    expect(PAGE_LIMITS.maxCostUsd).toBe(0.8);
    expect(PAGE_LIMITS.maxTurns).toBeGreaterThanOrEqual(PAGE_LIMITS.maxSubmits + 4 + 2);
  });

  it("asks for a terse repair after a rejection and after a preview with errors, never after an accept", async () => {
    const prepared = mangaPageGoal.prepare(
      mangaPageGoal.parseInput({
        book: { title: "The Happy Prince", author: "Oscar Wilde" },
        understanding: UNDERSTANDING,
        plan: PLAN,
        page_number: 3,
        units: PLAN.pages.find((p) => p.page_number === 3)!.units.map((id) => ({ id, page_start: 1, page_end: 1, text: FIXTURE_QUOTES })),
      }),
      OFF,
    );
    const bad = { schema: "manga-page.v0" };
    const rejected = await call(prepared, bad);
    expect(rejected.text).toContain(TERSE_REPAIR);
    const preview = await prepared.tools.find((t) => t.name === "preview_page")!.execute({ [CANDIDATE_ARG]: JSON.stringify(bad) }, undefined);
    expect(preview.text).toContain(TERSE_REPAIR);
  });
});

describe("hints reach the writer through submit_page", { timeout: 60_000 }, () => {
  const prepare = () =>
    mangaPageGoal.prepare(
      mangaPageGoal.parseInput({
        book: { title: "The Happy Prince", author: "Oscar Wilde" },
        understanding: UNDERSTANDING,
        plan: PLAN,
        page_number: 3,
        units: PLAN.pages.find((p) => p.page_number === 3)!.units.map((id) => ({ id, page_start: 1, page_end: 1, text: FIXTURE_QUOTES })),
      }),
      OFF,
    );
  const base = (): MangaPageSpec => {
    const spec = structuredClone(PAGES.find((p) => p.page_number === 3)!);
    spec.claim_map = spec.claims.map((claim) => ({ claim, panels: [spec.panels[0].id], how: "the first panel shows and says it" }));
    return spec;
  };

  it("adds PAGE_TOO_FULL when long speeches crowd the panels of a page", async () => {
    const spec = base();
    const long = "one two three four five six seven eight nine ten";
    for (const panel of spec.panels) {
      const speaker = panel.figures?.[0]?.character ?? "swallow";
      panel.text = [1, 2, 3].map(() => ({ kind: "speech", speaker, text: long, fidelity: "dramatized" }) as never);
    }
    const out = await call(prepare(), spec);
    expect(out.accepted).toBeUndefined();
    expect(out.text).toMatch(/TEXT_DOES_NOT_FIT|BALLOON_TALL|TAIL_CROSSES/);
    expect(out.text).toContain("PAGE_TOO_FULL");
  });

  it("does not add any hint to an accepted page", async () => {
    const out = await call(prepare(), base());
    expect(out.text).toMatch(/^ACCEPTED/);
    expect(out.text).not.toContain(TERSE_REPAIR);
    expect(out.text).not.toMatch(/PAGE_TOO_FULL|REPAIR_LOOP/);
  });
});

const call = (prepared: ReturnType<typeof mangaPageGoal.prepare>, candidate: unknown) =>
  prepared.tools.find((t) => t.name === "submit_page")!.execute({ [CANDIDATE_ARG]: JSON.stringify(candidate) }, undefined);
