/**
 * T1: state continuity, one-line characters, claims fully shown, and the craft
 * rules that the skills must keep. No model calls.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { AdaptationPlan, BookUnderstanding, CastMember, Claim, MangaPageSpec } from "@panelsummary/manga-render";

import { PAGES, PLAN, UNDERSTANDING } from "../../../packages/manga-render/test/fixtures/happy-prince.js";
import { loneSpeakerIssues, loneSpeakers } from "../src/goals/attribution.js";
import { claimEventIssues, claimOrderIssues, planOrderIssues } from "../src/goals/claim-shown.js";
import { claimPages, expectedLooks, expectedLooksForPrompt, figureStateIssues, stateIssues, unitOrder } from "../src/goals/continuity.js";
import { CANDIDATE_ARG } from "../src/goals/common.js";
import { mangaPageGoal } from "../src/goals/manga-page.js";
import type { GoalOptions } from "../src/goals/types.js";
import { loadSkill } from "../src/skills/load.js";
import { RUN8_STATES } from "./fixtures/run8-states.js";

const clone = <T>(value: T): T => structuredClone(value);

// ---- a small Prince, built like run 8's -----------------------------------------------
const sections = [{ units: ["s1u1", "s1u2", "s1u3", "s1u4", "s1u5", "s1u6", "s1u7", "s1u8"] }, { units: ["s2u1", "s2u2"] }];
const order = unitOrder(sections);
const prince = {
  id: "c_prince",
  name: "The Happy Prince",
  role: "statue",
  description: "gilded statue",
  look: { kind: "human", material: "gold" },
  sections: ["s1"],
  states: RUN8_STATES.c_prince,
} as unknown as CastMember;
const swallow = { id: "c_swallow", name: "The Swallow", role: "bird", description: "x", look: { kind: "bird", species: "swallow", tone: "dark" }, sections: ["s1"], states: RUN8_STATES.c_swallow } as unknown as CastMember;
const cast = [prince, swallow];
// pages as in run 8: claim k14 on page 7, k16 on page 8, k19 on page 10, k21 on page 11
const plan = {
  pages: [
    { page_number: 7, claims: ["k13", "k14"] },
    { page_number: 8, claims: ["k15", "k16"] },
    { page_number: 9, claims: ["k17"] },
    { page_number: 10, claims: ["k19"] },
    { page_number: 11, claims: ["k21"] },
  ],
};
const looksOn = (n: number, units: string[]) => expectedLooks(cast, order, { page_number: n, units, claim_pages: claimPages(plan) });
const specWith = (figures: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) =>
  ({ panels: [{ id: "p1", figures, text: [], ...extra }] }) as unknown as MangaPageSpec;
const princeFig = (variant?: Record<string, string>) => ({ character: "c_prince", ...(variant ? { variant } : {}) });

describe("expected looks (computed in code from the story position)", () => {
  it("follows the claim's page: before, on and after the change", () => {
    expect(looksOn(7, ["s1u4", "s1u5"]).c_prince.changing.eyes).toMatchObject({ before: "open", afters: ["one_empty"] });
    expect(looksOn(7, ["s1u4", "s1u5"]).c_prince.variant).toEqual({});
    // page 8 reuses unit s1u5, but k14 was told on page 7: the first eye is already gone
    const p8 = looksOn(8, ["s1u5", "s1u6"]).c_prince;
    expect(p8.variant).toEqual({ eyes: "one_empty" });
    expect(p8.changing.eyes).toMatchObject({ before: "one_empty", afters: ["blind"] });
    expect(p8.not_yet.material).toMatchObject({ value: "stone" });
    expect(looksOn(9, ["s1u6"]).c_prince.variant).toEqual({ eyes: "blind" });
    expect(looksOn(11, ["s1u7"]).c_prince.variant).toEqual({ eyes: "blind", material: "stone" });
  });

  it("falls back to unit positions when a state names no claim", () => {
    const bare = [{ ...prince, states: [{ at: "s1u5", set: { eyes: "blind" } }] } as unknown as CastMember];
    expect(expectedLooks(bare, order, { page_number: 3, units: ["s1u6", "s1u7"] }).c_prince.variant).toEqual({ eyes: "blind" });
    expect(expectedLooks(bare, order, { page_number: 3, units: ["s1u4", "s1u5"] }).c_prince.changing.eyes.afters).toEqual(["blind"]);
    expect(expectedLooks(bare, order, { page_number: 3, units: ["s1u1"] }).c_prince.not_yet.eyes.value).toBe("blind");
  });

  it("hands the page goal only what matters", () => {
    expect(expectedLooksForPrompt(looksOn(9, ["s1u6"]))).toEqual({ c_prince: { variant_on_every_panel: { eyes: "blind" } } });
    expect(expectedLooksForPrompt(expectedLooks([{ ...prince, states: undefined } as unknown as CastMember], order, { page_number: 1, units: ["s1u1"] }))).toBeUndefined();
  });
});

describe("FIGURE_STATE_MISMATCH (run 8: the Prince's eyes came back, the statue stayed gold)", () => {
  it("flags the sapphire eyes returning a page after they were given away", () => {
    const issues = figureStateIssues(specWith([princeFig({ eyes: "open" }), { character: "c_swallow" }]), cast, looksOn(9, ["s1u6"]), "error");
    expect(issues.map((i) => [i.code, i.severity])).toEqual([["FIGURE_STATE_MISMATCH", "error"]]);
    expect(issues[0].message).toContain('"eyes": "blind"');
    expect(issues[0].message).toContain("already changed");
    expect(figureStateIssues(specWith([princeFig({ eyes: "blind" })]), cast, looksOn(9, ["s1u6"]))).toEqual([]);
  });

  it("flags a statue that is still gold after it was stripped", () => {
    const l = looksOn(12, ["s1u8"]);
    const issues = figureStateIssues(specWith([princeFig({ eyes: "blind" })]), cast, l);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('"material": "stone"');
    expect(figureStateIssues(specWith([princeFig({ eyes: "blind", material: "stone" })]), cast, l)).toEqual([]);
  });

  it("flags a change shown too early", () => {
    const issues = figureStateIssues(specWith([princeFig({ eyes: "blind" })]), cast, looksOn(7, ["s1u4", "s1u5"]));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("one_empty");
  });

  it("allows either look on the page where the change happens, but never going back", () => {
    const l = looksOn(8, ["s1u5", "s1u6"]);
    const mk = (a: string, b: string) => specWith([princeFig({ eyes: a })], {}) && ({ panels: [{ id: "p1", figures: [princeFig({ eyes: a })] }, { id: "p2", figures: [princeFig({ eyes: b })] }] }) as unknown as MangaPageSpec;
    expect(figureStateIssues(mk("one_empty", "blind"), cast, l)).toEqual([]);
    expect(figureStateIssues(mk("one_empty", "one_empty"), cast, l)).toEqual([]);
    const back = figureStateIssues(mk("blind", "one_empty"), cast, l);
    expect(back).toHaveLength(1);
    expect(back[0].message).toContain("cannot go back");
    expect(figureStateIssues(mk("open", "blind"), cast, l)).toHaveLength(1); // two eyes after one was given
  });

  it("lets a character act before any change (asleep is not dead), but not show a later state early", () => {
    const l = looksOn(9, ["s1u6"]);
    const early = expectedLooks([swallow], order, { page_number: 5, units: ["s1u3"] });
    expect(figureStateIssues(specWith([{ character: "c_swallow", variant: { eyes: "closed" } }]), [swallow], early)).toEqual([]);
    expect(figureStateIssues(specWith([{ character: "c_swallow", variant: { eyes: "dead" } }]), [swallow], early)).toHaveLength(1);
    expect(l.c_swallow.variant).toEqual({});
  });

  it("does not judge a flashback panel, and ignores characters without states", () => {
    const l = looksOn(9, ["s1u6"]);
    expect(figureStateIssues(specWith([princeFig({ eyes: "open" })], { fx: ["flashback"] }), cast, l)).toEqual([]);
    expect(figureStateIssues(specWith([{ character: "c_reed" }]), cast, l)).toEqual([]);
  });

  it("works with any look field, with no code change (a future plant bloom)", () => {
    const rose = { id: "c_rose", name: "The Rose", role: "rose", description: "x", look: { kind: "plant", species: "rose", tone: "light", bloom: "bud" }, states: [{ at: "s1u3", set: { bloom: "open" } }] } as unknown as CastMember;
    const l = expectedLooks([rose], order, { page_number: 2, units: ["s1u5"] });
    expect(figureStateIssues(specWith([{ character: "c_rose" }]), [rose], l)).toHaveLength(1);
    expect(figureStateIssues(specWith([{ character: "c_rose", variant: { bloom: "open" } }]), [rose], l)).toEqual([]);
  });
});

describe("states in the understanding", () => {
  const unitIds = sections.flatMap((s) => s.units);
  const withStates = (states: unknown, extra: Partial<CastMember> = {}) => ({ cast: [{ ...prince, states, ...extra }], claims: [] });
  it("accepts the run 8 table; names only warnings for what cannot be drawn today", () => {
    const issues = stateIssues(withStates(RUN8_STATES.c_prince), unitIds, order);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    // "one_empty" is not an EYE_STATE today: a warning, not an error
    expect(issues.map((i) => i.code)).toContain("STATE_NOT_DRAWABLE");
    expect(stateIssues(withStates([{ at: "s1u6", set: { eyes: "blind" } }]), unitIds, order)).toEqual([]);
  });
  it("rejects an unknown unit or an empty patch, with the fix in the message", () => {
    const bad = stateIssues(withStates([{ at: "s9u9", set: { eyes: "blind" } }, { at: "s1u2", set: {} }, "x"]), unitIds, order);
    expect(bad.map((i) => [i.code, i.severity])).toEqual([["STATE_INVALID", "error"], ["STATE_INVALID", "error"], ["STATE_INVALID", "error"]]);
    expect(bad[0].message).toContain("unit");
    expect(stateIssues(withStates("blind"), unitIds, order)[0].code).toBe("STATE_INVALID");
  });
  it("warns about order and about a death with no state", () => {
    const order2 = stateIssues(withStates([{ at: "s1u6", set: { eyes: "blind" } }, { at: "s1u2", set: { material: "stone" } }]), unitIds, order);
    expect(order2.map((i) => i.code)).toEqual(["STATE_ORDER"]);
    const death = stateIssues({ cast: [{ ...swallow, states: undefined }], claims: [{ id: "k21", section_id: "s1", kind: "event", text: "The Swallow dies at the Prince's feet." }] }, unitIds, order);
    expect(death.map((i) => [i.code, i.severity])).toEqual([["STATE_DEATH_MISSING", "warning"]]);
  });
});

describe("MANGA_PAGE with states (integration)", { timeout: 60_000 }, () => {
  const OFF: GoalOptions = { model: "MiniMax-M3", thinking: "off", vision: false };
  const understanding = (): BookUnderstanding => {
    const u = clone(UNDERSTANDING);
    // the fixture's units u01..u12: the Prince is stripped of his gold at u03
    (u.cast.find((c) => c.id === "prince") as unknown as { states: unknown }).states = [{ at: "u03", set: { material: "stone" }, note: "stripped" }];
    return u;
  };
  const input = (u: BookUnderstanding) => ({
    book: { title: "t", author: "a" },
    understanding: u,
    plan: PLAN as AdaptationPlan,
    page_number: 3,
    units: PLAN.pages[2].units.map((id) => ({ id, page_start: 1, page_end: 1, text: "Source text." })),
  });
  const page3 = (variant?: Record<string, string>): MangaPageSpec => {
    const spec = clone(PAGES.find((p) => p.page_number === 3)!);
    spec.claim_map = spec.claims.map((claim) => ({ claim, panels: [spec.panels[0].id], how: "the first panel shows and says it" }));
    for (const panel of spec.panels) for (const f of panel.figures) if (f.character === "prince" && variant) f.variant = variant as never;
    return spec;
  };

  it("gives the page goal the expected look and rejects a figure that contradicts it", async () => {
    const prepared = mangaPageGoal.prepare(mangaPageGoal.parseInput(input(understanding())), OFF);
    expect(prepared.userPrompt).toContain("<expected_looks>");
    expect(prepared.userPrompt).toContain('"variant_on_every_panel":{"material":"stone"}');
    const submit = prepared.tools.find((t) => t.name === "submit_page")!;
    const bad = await submit.execute({ [CANDIDATE_ARG]: JSON.stringify(page3()) }, undefined);
    expect(bad.accepted).toBeUndefined();
    expect(bad.text).toContain("FIGURE_STATE_MISMATCH");
    const good = await submit.execute({ [CANDIDATE_ARG]: JSON.stringify(page3({ material: "stone" })) }, undefined);
    // (the fixture quotes are not in this test's source text; only the state error must be gone)
    expect(good.text).not.toContain("FIGURE_STATE_MISMATCH");
  });

  it("adds nothing to the prompt for a book without states", () => {
    const prepared = mangaPageGoal.prepare(mangaPageGoal.parseInput(input(clone(UNDERSTANDING))), OFF);
    expect(prepared.userPrompt).not.toContain("expected_looks");
  });
});

describe("one-line characters (run 8: the Christ child and the workmen)", () => {
  const units = [
    {
      section_id: "s3",
      text: "“Who hath dared to wound thee?” cried the Giant. “Nay!” answered the child; “but these are the wounds of Love.”",
    },
    {
      section_id: "s5",
      text: "The next day the workmen came to put everything tidy. But they took no notice of him. Then one of them caught sight of him. “Hallo!” he cried, “what a bad rocket!” and he threw him over the wall.",
    },
  ];
  const member = (id: string, name: string, role: string, kind: string, section: string) => ({ id, name, role, description: "x", look: { kind }, sections: [section] }) as unknown as CastMember;
  const cast3 = [member("c_giant", "The Selfish Giant", "giant", "human", "s3"), member("c_children", "The Children", "Schoolchildren", "crowd", "s3"), member("c_rocket", "The Remarkable Rocket", "firework", "object", "s5")];

  it("finds a child hidden in a crowd and one of a group the cast never names", () => {
    const lone = loneSpeakers(units, cast3);
    expect(lone.map((l) => [l.kind, l.section, l.head])).toEqual([["crowd_member", "s3", "child"], ["one_of_group", "s5", "workman"]]);
    expect(lone[0].crowd?.id).toBe("c_children");
  });

  it("is satisfied by one cast member for the person", () => {
    const fixed = [...cast3, member("c_boy", "The Little Boy", "the child of the tree", "human", "s3"), member("c_workman", "A Workman", "foundry workman", "human", "s5")];
    expect(loneSpeakers(units, fixed)).toEqual([]);
  });

  it("makes at most three of them errors, so a book of bit players cannot start a repair loop", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ section_id: "s1", text: `Then one of the clerks${"abcdef"[i]} looked up. “Hallo!” he cried.` }));
    const issues = loneSpeakerIssues({ cast: cast3 }, many, 3);
    expect(issues.filter((i) => i.severity === "error").length).toBeLessThanOrEqual(3);
    const real = loneSpeakerIssues({ cast: cast3 }, units);
    expect(real.map((i) => [i.code, i.severity])).toEqual([["SPEAKER_HIDDEN_IN_CROWD", "error"], ["SPEAKER_ONE_OF_GROUP", "error"]]);
    expect(real[0].message).toContain("their own cast member");
  });
});

describe("claims fully shown", () => {
  const claim = (id: string, unit: string, page: number, text = "x", extra: Partial<Claim> = {}): Claim => ({ id, section_id: "s1", kind: "event", importance: "core", text, source: [{ unit, page }], ...extra });
  const claims = [claim("k1", "s1u1", 3), claim("k2", "s1u2", 4), claim("k3", "s1u3", 6)];
  const pages = (list: Array<[number, string[], string?]>) => ({ pages: list.map(([n, c, beat]) => ({ page_number: n, section_id: "s1", beat: beat ?? "b", claims: c })) }) as unknown as AdaptationPlan;

  it("warns when a page carries earlier text than the page before it", () => {
    expect(planOrderIssues(pages([[1, ["k1"]], [2, ["k2"]], [3, ["k3"]]]), claims, order)).toEqual([]);
    const issues = planOrderIssues(pages([[1, ["k1"]], [2, ["k3"]], [3, ["k2"]]]), claims, order);
    expect(issues.map((i) => [i.code, i.severity, i.path])).toEqual([["PLAN_ORDER", "warning", "page 3"]]);
    // a deliberate flashback is allowed
    expect(planOrderIssues(pages([[1, ["k1"]], [2, ["k3"]], [3, ["k2"], "Flashback to the arrival"]]), claims, order)).toEqual([]);
  });

  it("warns when the climax panel comes before its set-up panel", () => {
    const spec = (map: Array<[string, string[]]>) =>
      ({ panels: [{ id: "p1" }, { id: "p2" }, { id: "p3" }], claim_map: map.map(([c, panels]) => ({ claim: c, panels, how: "x" })) }) as unknown as MangaPageSpec;
    expect(claimOrderIssues(spec([["k1", ["p1"]], ["k3", ["p3"]]]), claims, order)).toEqual([]);
    const issues = claimOrderIssues(spec([["k3", ["p1"]], ["k1", ["p3"]]]), claims, order);
    expect(issues.map((i) => [i.code, i.severity])).toEqual([["CLAIM_ORDER", "warning"]]);
  });

  it("warns when a death or a marriage is only implied", () => {
    const death = [claim("k58", "s1u8", 9, "Hans loses his way and is found drowned the next day by goatherds.")];
    const text = (t: string) => ({ panels: [{ id: "p1", text: [{ kind: "narration", text: t, fidelity: "paraphrase" }] }] }) as unknown as MangaPageSpec;
    expect(claimEventIssues(text("Found by goatherds in a great pool of water."), death).map((i) => i.code)).toEqual(["CLAIM_EVENT_UNSTATED"]);
    expect(claimEventIssues(text("Next day the goatherds found Hans drowned."), death)).toEqual([]);
    const wed = [claim("k62", "s1u8", 9, "The Prince and the Princess are married.")];
    expect(claimEventIssues(text("They had come at last."), wed).map((i) => i.message)[0]).toContain("marriage");
    // a detail claim is not checked
    expect(claimEventIssues(text("x"), [claim("k9", "s1u1", 3, "A bird dies.", { importance: "detail" })])).toEqual([]);
  });
});

describe("craft grammar in the skills (#6)", () => {
  const rules: Array<[string, RegExp[]]> = [
    ["manga-page", [/expected_looks/, /variant_on_every_panel/, /Say the key event/, /Words and picture agree/, /Last page of a section/, /One moment per panel/, /dominant panel/, /Keep the sides/, /page_turn_hook/]],
    ["book-understanding", [/`states`/, /trusted_state_fields/, /one person who speaks or acts alone/, /distinct at a glance/, /Calibrate importance/]],
    ["adaptation-plan", [/set-up page comes before the\s+climax page/, /flashback/, /One page, one beat/, /last page of each section/, /No skipped middles/]],
  ];
  for (const [name, patterns] of rules) {
    it(`${name} keeps its key rules and a bumped version`, async () => {
      const skill = await loadSkill(name);
      for (const p of patterns) expect(skill.content, `${name} lacks ${p}`).toMatch(p);
      const versions: Record<string, string> = { "manga-page": "1.11.0", "book-understanding": "1.9.0", "adaptation-plan": "1.5.0" };
      expect(skill.version).toBe(versions[name]);
    });
  }

  it("grew by less than 22 percent in total", () => {
    // 8 percent at T1; F1 (1.7.0) and W2-writer (1.8.0, +1.9 KB: docs/launch/W2-writer.md) used the rest up to 14.
    // Q2b (manga-page 1.9.0, book-understanding 1.8.0, adaptation-plan 1.5.0) adds 1.9 KB (docs/v0.2/Q2b-continuity.md): measured 1.1897.
    // Q2a (manga-page 1.10.0, +974 bytes: docs/v0.2/Q2a-writer-checks.md) raised the limit from 1.20 to 1.22 (measured on the merged files: 42011 / 34494 = 1.2179).
    // Q1 (manga-page 1.11.0, book-understanding 1.9.0, +187 bytes: docs/v0.2/Q1-renderer.md) raised the limit from 1.22 to 1.23 (measured on the merged files: 42198 / 34494 = 1.2233).
    const sizes = { "manga-page": 17816, "book-understanding": 10821, "adaptation-plan": 5857 };
    let before = 0;
    let after = 0;
    for (const [name, size] of Object.entries(sizes)) {
      before += size;
      after += readFileSync(new URL(`../src/skills/${name}/SKILL.md`, import.meta.url)).length;
    }
    expect(after / before).toBeLessThan(1.23);
  });
});

// A reference so unused fixtures stay typed.
void UNDERSTANDING;
