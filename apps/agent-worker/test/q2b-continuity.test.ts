/**
 * Q2b: places per unit, the location check, the `vision` panel flag (afterlife, dream, memory)
 * and minor figures. No model calls. Evidence and calibration: docs/v0.2/Q2b-continuity.md.
 */
import { describe, expect, it } from "vitest";

import { validatePage, validateUnderstanding } from "@panelsummary/manga-render";
import type { AdaptationPlan, BookUnderstanding, CastMember, MangaPageSpec } from "@panelsummary/manga-render";
import { VISIONS } from "@panelsummary/manga-render/contracts";

import { PAGES, PLAN, UNDERSTANDING, UNIT_IDS } from "../../../packages/manga-render/test/fixtures/happy-prince.js";
import { CANDIDATE_ARG } from "../src/goals/common.js";
import { claimPages, expectedLooks, figureStateIssues, unitOrder, visionIssues } from "../src/goals/continuity.js";
import { mangaPageGoal } from "../src/goals/manga-page.js";
import { genericLook, minorFigures } from "../src/goals/minor-figures.js";
import { deriveUnits, hasPlaceUnits, placeIssues, planPlaceIssues } from "../src/goals/places.js";
import type { GoalOptions } from "../src/goals/types.js";
import { loadSkill } from "../src/skills/load.js";

const clone = <T>(value: T): T => structuredClone(value);
const OFF: GoalOptions = { model: "MiniMax-M3", thinking: "off", vision: false };

// ---------------------------------------------------------------------------
// 1. Places per unit
// ---------------------------------------------------------------------------

describe("places per unit", () => {
  const unitIds = [...UNIT_IDS];
  const withUnits = (): BookUnderstanding => {
    const u = clone(UNDERSTANDING);
    u.locations.forEach((l, i) => ((l as unknown as Record<string, unknown>).units = [unitIds[i % unitIds.length]]));
    return u;
  };

  it("an understanding saved before Q2b (no units) still validates and plans without a new issue", () => {
    expect(hasPlaceUnits(UNDERSTANDING.locations)).toBe(false);
    expect(placeIssues(UNDERSTANDING, unitIds, false)).toEqual([]);
    expect(planPlaceIssues(PLAN, UNDERSTANDING)).toEqual([]);
    const base = validateUnderstanding(UNDERSTANDING, unitIds);
    expect(validateUnderstanding(withUnits(), unitIds)).toEqual(base); // `units` is an accepted additive field
  });

  it("a new understanding gets a warning for locations without units, never an error", () => {
    const issues = placeIssues(UNDERSTANDING, unitIds, true);
    expect(issues.map((i) => [i.code, i.severity])).toEqual([["PLACE_UNITS_MISSING", "warning"]]);
  });

  it("rejects units that are not known unit ids, with the valid ids in the message", () => {
    const u = withUnits() as unknown as { locations: Array<Record<string, unknown>> };
    u.locations[0].units = ["s9u9"];
    u.locations[1].units = "u01";
    u.locations[2].units = [];
    const issues = placeIssues(u, unitIds).filter((i) => i.severity === "error");
    expect(issues.map((i) => i.code)).toEqual(["PLACE_UNITS_INVALID", "PLACE_UNITS_INVALID", "PLACE_UNITS_INVALID"]);
    expect(issues[0].message).toContain("u01");
    expect(issues[0].message).toContain('"s9u9"');
  });

  it("warns about a unit that no place covers", () => {
    const u = withUnits() as unknown as { locations: Array<Record<string, unknown>> };
    for (const l of u.locations) l.units = ["u01"];
    const issues = placeIssues(u, unitIds);
    expect(issues.map((i) => i.code)).toEqual(["PLACE_UNIT_UNCOVERED"]);
    expect(issues[0].message).toContain("u02");
  });

  describe("the location check against the plan (warning)", () => {
    // the palace door is a place of unit s2u2 only; the hall belongs to s2u1
    const understanding = {
      locations: [
        { id: "l_hall", name: "The gift hall", environment: "palace_hall", features: [], description: "x", units: ["s2u1"] },
        { id: "l_gate", name: "The palace door", environment: "street", features: ["door"], description: "x", units: ["s2u2"] },
        { id: "l_old", name: "Old place", environment: "street", features: [], description: "x" },
      ],
    } as unknown as BookUnderstanding;
    const plan = (locations: string[], units: string[]) => ({ pages: [{ page_number: 8, section_id: "s2", beat: "b", claims: [], cast: [], locations, units, page_turn_hook: false }] }) as unknown as AdaptationPlan;

    it("passes a page whose location is used in its units", () => {
      expect(planPlaceIssues(plan(["l_gate"], ["s2u2"]), understanding)).toEqual([]);
      expect(planPlaceIssues(plan(["l_hall", "l_gate"], ["s2u1", "s2u2"]), understanding)).toEqual([]);
    });

    it("flags the gift hall on a page of the door unit (run: page 8, the palace gate drawn as the hall)", () => {
      const issues = planPlaceIssues(plan(["l_hall"], ["s2u2"]), understanding);
      expect(issues.map((i) => [i.code, i.severity])).toEqual([["PLAN_LOCATION_NOT_IN_UNITS", "warning"], ["PLAN_PLACE_UNLISTED", "warning"]]);
      expect(issues[0].message).toContain("l_gate");
    });

    it("flags a page that lists none of the places its units use", () => {
      const issues = planPlaceIssues(plan([], ["s2u1"]), understanding);
      expect(issues.map((i) => i.code)).toEqual(["PLAN_PLACE_UNLISTED"]);
    });

    it("never judges a location without units", () => {
      expect(planPlaceIssues(plan(["l_old"], ["s2u2"]), understanding).map((i) => i.code)).not.toContain("PLAN_LOCATION_NOT_IN_UNITS");
    });

    it("derives places from names only for the calibration proxy", () => {
      const u = { locations: [{ id: "l_gate", name: "The palace door", environment: "street", features: [], description: "x" }] } as unknown as BookUnderstanding;
      const derived = deriveUnits(u, [
        { id: "a", section_id: "s1", text: "A knock at the palace." },
        { id: "b", section_id: "s1", text: "The weather was fine." },
      ]);
      expect(derived.get("l_gate")).toEqual(["a"]);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Afterlife / dream / memory panels
// ---------------------------------------------------------------------------

describe("vision panels (afterlife, dream, memory)", () => {
  const sections = [{ units: ["s4u1", "s4u2", "s4u3"] }];
  const order = unitOrder(sections);
  const girl = {
    id: "c_girl",
    name: "The Little Match Girl",
    role: "girl",
    description: "x",
    look: { kind: "human" },
    sections: ["s4"],
    states: [{ at: "s4u2", claim: "k9", set: { eyes: "dead" }, note: "frozen to death on New Year's morning" }],
  } as unknown as CastMember;
  const swallow = {
    id: "c_swallow",
    name: "The Swallow",
    role: "bird",
    description: "x",
    look: { kind: "bird", species: "swallow", tone: "dark" },
    sections: ["s1"],
    states: [{ at: "s1u7", claim: "k21", set: { eyes: "dead" }, note: "dies at the Prince's feet" }],
  } as unknown as CastMember;
  const plan = { pages: [{ page_number: 18, claims: ["k9"] }, { page_number: 19, claims: [] }] };
  const spec = (fx: string[], vision?: string, eyes = "open"): MangaPageSpec =>
    ({ panels: [{ id: "p1", fx, ...(vision ? { vision } : {}), figures: [{ character: "c_girl", variant: { eyes } }], text: [] }] }) as unknown as MangaPageSpec;

  it("Little Match Girl: the girl in her grandmother's arms is not held to 'dead' once the flag is set", () => {
    const looks = expectedLooks([girl], order, { page_number: 19, units: ["s4u3"], claim_pages: claimPages(plan) });
    const before = figureStateIssues(spec([]), [girl], looks, "error");
    expect(before.map((i) => i.code)).toEqual(["FIGURE_STATE_MISMATCH"]);
    for (const vision of VISIONS) expect(figureStateIssues(spec([], vision), [girl], looks, "error")).toEqual([]);
    // the old escape keeps working
    expect(figureStateIssues(spec(["flashback"]), [girl], looks, "error")).toEqual([]);
    // the same panel without the flag still must show the body as dead on the page after the death
    expect(figureStateIssues(spec([], undefined, "dead"), [girl], looks, "error")).toEqual([]);
  });

  it("Happy Prince Paradise ending: the dead Swallow shown alive before God needs the flag, only on that panel", () => {
    const looks = expectedLooks([swallow], unitOrder([{ units: ["s1u6", "s1u7", "s1u8"] }]), { page_number: 15, units: ["s1u8"], claim_pages: claimPages({ pages: [{ page_number: 14, claims: ["k21"] }] }) });
    const two = {
      panels: [
        { id: "p1", fx: [], figures: [{ character: "c_swallow", variant: { eyes: "dead" } }], text: [] },
        { id: "p4", fx: [], vision: "afterlife", figures: [{ character: "c_swallow", variant: { eyes: "open" } }], text: [] },
      ],
    } as unknown as MangaPageSpec;
    expect(figureStateIssues(two, [swallow], looks, "error")).toEqual([]);
    const unflagged = clone(two) as unknown as { panels: Array<Record<string, unknown>> };
    delete unflagged.panels[1].vision;
    const bad = figureStateIssues(unflagged as unknown as MangaPageSpec, [swallow], looks, "error");
    expect(bad.map((i) => i.path)).toEqual(["panel p4 figure c_swallow"]);
    // a present-day panel that shows the dead bird alive is still an error
    const wrong = clone(two) as unknown as { panels: Array<Record<string, unknown>> };
    wrong.panels[0].figures = [{ character: "c_swallow", variant: { eyes: "open" } }];
    expect(figureStateIssues(wrong as unknown as MangaPageSpec, [swallow], looks, "error")).toHaveLength(1);
  });

  it("abuse guard: flagging every panel of a page with a dead-character mismatch is an error", () => {
    const looks = expectedLooks([girl], order, { page_number: 19, units: ["s4u3"], claim_pages: claimPages(plan) });
    const page = (flags: Array<string | undefined>): MangaPageSpec =>
      ({ panels: flags.map((v, i) => ({ id: `p${i + 1}`, fx: [], ...(v ? { vision: v } : {}), figures: [{ character: "c_girl", variant: { eyes: "open" } }], text: [] })) }) as unknown as MangaPageSpec;
    const all = page(["dream", "dream", "dream"]);
    // the state check alone is silenced by the flag ...
    expect(figureStateIssues(all, [girl], looks, "error")).toEqual([]);
    // ... so the guard must catch it
    expect(visionIssues(all, "The Emperor walks in the procession").map((i) => `${i.severity}:${i.code}`)).toEqual(["error:VISION_OVERUSED", "warning:VISION_NOT_PLANNED"]);
    expect(visionIssues(page(["dream", "dream"]), "The Emperor walks in the procession").map((i) => i.code)).toContain("VISION_OVERUSED");
    expect(visionIssues(page(["dream", "dream", undefined]), "The Emperor walks in the procession").map((i) => i.code)).toContain("VISION_OVERUSED");
    // the plan names a vision: a page may flag every panel, no error
    expect(visionIssues(all, "the grandmother carries her to heaven")).toEqual([]);
    expect(visionIssues(all, "She dreams of her grandmother")).toEqual([]);
    // no planned beat: a warning only
    expect(visionIssues(all, undefined).map((i) => `${i.severity}:${i.code}`)).toEqual(["warning:VISION_OVERUSED"]);
    // one flagged panel of two is allowed; the unflagged panel is still checked by the state check
    expect(visionIssues(page(["dream", undefined]), "dream")).toEqual([]);
    expect(figureStateIssues(page(["dream", undefined]), [girl], looks, "error").map((i) => i.path)).toEqual(["panel p2 figure c_girl"]);
    // no flag: nothing
    expect(visionIssues(page([undefined, undefined]), "plain")).toEqual([]);
  });

  it("abuse guard: a flag the plan does not mention is a warning; a beat with the word passes", () => {
    const one = { panels: [{ id: "p1", fx: [], vision: "afterlife", figures: [], text: [] }, { id: "p2", fx: [], figures: [], text: [] }] } as unknown as MangaPageSpec;
    expect(visionIssues(one, "The bird sings in the city square").map((i) => `${i.severity}:${i.code}`)).toEqual(["warning:VISION_NOT_PLANNED"]);
    for (const word of ["afterlife", "a dream", "memory", "Paradise", "Heaven", "a vision"]) expect(visionIssues(one, `The bird in ${word}`)).toEqual([]);
    // a single-panel page may carry the flag (the ratio rule needs 2+ panels)
    const solo = { panels: [{ id: "p1", fx: [], vision: "dream", figures: [], text: [] }] } as unknown as MangaPageSpec;
    expect(visionIssues(solo, "a dream")).toEqual([]);
  });

  it("the flag is part of the page spec: accepted for the three values, an error for any other", () => {
    const base = clone(PAGES.find((p) => p.page_number === 3)!) as MangaPageSpec;
    const book = { cast: UNDERSTANDING.cast, locations: UNDERSTANDING.locations };
    const codes = (spec: MangaPageSpec) => validatePage(spec, book, PLAN.pages[2]).map((i) => `${i.severity}:${i.code}`);
    const reference = codes(base);
    for (const vision of VISIONS) {
      const flagged = clone(base) as unknown as { panels: Array<Record<string, unknown>> };
      flagged.panels[0].vision = vision;
      expect(codes(flagged as unknown as MangaPageSpec)).toEqual(reference);
    }
    const bad = clone(base) as unknown as { panels: Array<Record<string, unknown>> };
    bad.panels[0].vision = "heaven";
    expect(codes(bad as unknown as MangaPageSpec)).toContain("error:ENUM_INVALID");
  });

  describe("page goal (integration)", { timeout: 60_000 }, () => {
    const understanding = (): BookUnderstanding => {
      const u = clone(UNDERSTANDING);
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
    const page3 = (vision?: string): MangaPageSpec => {
      const spec = clone(PAGES.find((p) => p.page_number === 3)!);
      spec.claim_map = spec.claims.map((claim) => ({ claim, panels: [spec.panels[0].id], how: "the first panel shows and says it" }));
      if (vision) for (const panel of spec.panels) (panel as { vision?: string }).vision = vision;
      return spec;
    };
    it("rejects the mismatch without the flag and passes the state check with it", async () => {
      const prepared = mangaPageGoal.prepare(mangaPageGoal.parseInput(input(understanding())), OFF);
      const submit = prepared.tools.find((t) => t.name === "submit_page")!;
      expect((await submit.execute({ [CANDIDATE_ARG]: JSON.stringify(page3()) }, undefined)).text).toContain("FIGURE_STATE_MISMATCH");
      const flagged = await submit.execute({ [CANDIDATE_ARG]: JSON.stringify(page3("afterlife")) }, undefined);
      // every panel flagged: the state check is silent, but the guard rejects the page
      expect(flagged.text).not.toContain("FIGURE_STATE_MISMATCH");
      expect(flagged.text).toContain("VISION_OVERUSED");
      expect(flagged.accepted).toBeUndefined();
      // only the first panel flagged: the guard is quiet, and the other panels are held to the state again
      const some = page3("afterlife");
      some.panels.forEach((panel, i) => i >= 1 && delete (panel as { vision?: string }).vision);
      const partial = await submit.execute({ [CANDIDATE_ARG]: JSON.stringify(some) }, undefined);
      expect(partial.text).not.toContain("[ERROR VISION_OVERUSED]");
      expect(partial.text).toContain("[ERROR FIGURE_STATE_MISMATCH] panel p2 figure prince");
      expect(partial.text).not.toContain("[ERROR FIGURE_STATE_MISMATCH] panel p1 ");
      expect(prepared.userPrompt).toContain('"vision" set (afterlife, dream, memory)');
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Minor figures
// ---------------------------------------------------------------------------

describe("minor figures", () => {
  const member = (id: string, name: string, role: string, kind: string, section: string) => ({ id, name, role, description: "x", look: { kind }, sections: [section] }) as unknown as CastMember;
  const cast = [member("c_giant", "The Selfish Giant", "giant", "human", "s3"), member("c_children", "The Children", "Schoolchildren", "crowd", "s3"), member("c_rocket", "The Remarkable Rocket", "firework", "object", "s5")];

  it("makes a generic figure for one of the workmen and for the child a crowd hides", () => {
    const workmen = minorFigures([{ text: "The workmen came. Then one of them caught sight of him. “Hallo!” he cried, “what a bad rocket!”" }], "s5", cast);
    expect(workmen.map((m) => [m.id, m.name, m.role, m.minor])).toEqual([["m_workman", "A workman", "one of the workmen", true]]);
    const child = minorFigures([{ text: "“Who hath dared to wound thee?” cried the Giant. “Nay!” answered the child; “but these are the wounds of Love.”" }], "s3", cast);
    expect(child.map((m) => m.id)).toEqual(["m_child"]);
    expect((child[0].look as { age?: string }).age).toBe("child");
  });

  it("every generic look is a valid look", () => {
    for (const head of ["child", "workman", "grandmother", "watchman", "girl", "mother"]) {
      const u = clone(UNDERSTANDING);
      u.cast.push({ id: "m_x", name: "A x", role: "x", description: "x", look: genericLook(head), sections: ["s1"] });
      expect(validateUnderstanding(u, [...UNIT_IDS]).filter((i) => i.severity === "error"), head).toEqual([]);
    }
  });

  it("does not guess: animals, objects, groups, named cast members and pronouns get no figure", () => {
    const text = "“Quack!” said the Duck. “Boom,” said the Rocket. “We agree,” said the workmen. “Fine,” said the Giant. “Well,” he said.";
    expect(minorFigures([{ text }], "s3", cast)).toEqual([]);
  });

  it("gives at most three figures to a page, in the order of the text, and never repeats an id", () => {
    const text = "“A,” said the watchman. “B,” said the baker. “C,” said the porter. “D,” said the miller. “E,” said the watchman.";
    const out = minorFigures([{ text }], "s1", []);
    expect(out.map((m) => m.id)).toEqual(["m_watchman", "m_baker", "m_porter"]);
    expect(minorFigures([{ text }], "s1", [member("m_baker", "A baker", "baker", "human", "s1")]).map((m) => m.id)).toEqual(["m_watchman", "m_porter", "m_miller"]);
  });

  describe("page goal (integration)", { timeout: 60_000 }, () => {
    const input = (text: string) => ({
      book: { title: "t", author: "a" },
      understanding: clone(UNDERSTANDING),
      plan: PLAN as AdaptationPlan,
      page_number: 3,
      units: PLAN.pages[2].units.map((id) => ({ id, page_start: 1, page_end: 1, text })),
    });
    const withWatchman = (): MangaPageSpec => {
      const spec = clone(PAGES.find((p) => p.page_number === 3)!);
      spec.claim_map = spec.claims.map((claim) => ({ claim, panels: [spec.panels[0].id], how: "the first panel shows and says it" }));
      spec.panels[0].figures.push({ character: "m_watchman", pose: "stand", expression: "neutral", facing: "left", slot: "right", depth: "mid" } as never);
      spec.panels[0].text.push({ kind: "speech", speaker: "m_watchman", text: "Hallo there", fidelity: "dramatized" } as never);
      return spec;
    };
    it("draws the watchman the page text names; without the text he is an unknown character", async () => {
      const named = mangaPageGoal.prepare(mangaPageGoal.parseInput(input("“Hallo there!” cried the watchman.")), OFF);
      expect(named.userPrompt).toContain("Minor figures");
      expect(named.userPrompt).toContain('"id":"m_watchman"');
      const ok = await named.tools.find((t) => t.name === "submit_page")!.execute({ [CANDIDATE_ARG]: JSON.stringify(withWatchman()) }, undefined);
      for (const code of ["UNKNOWN_CAST", "SPEAKER_UNKNOWN", "CAST_NOT_PLANNED"]) expect(ok.text, code).not.toContain(code);

      const unnamed = mangaPageGoal.prepare(mangaPageGoal.parseInput(input("Nobody spoke.")), OFF);
      expect(unnamed.userPrompt).not.toContain("Minor figures");
      const bad = await unnamed.tools.find((t) => t.name === "submit_page")!.execute({ [CANDIDATE_ARG]: JSON.stringify(withWatchman()) }, undefined);
      expect(bad.text).toContain("UNKNOWN_CAST");
    });
  });
});

// ---------------------------------------------------------------------------
// 4. The skills tell the model
// ---------------------------------------------------------------------------

describe("skills", () => {
  const rules: Array<[string, string, RegExp[]]> = [
    ["manga-page", "1.10.0", [/"vision": "afterlife"/, /"minor": true/, /lists `units`/]],
    ["book-understanding", "1.8.0", [/Places per unit/, /Map by where the people stand/, /every location has `units`/, /"units": \["s1u1", "s1u2"\]/]],
    ["adaptation-plan", "1.5.0", [/whose `units` include the page's units/, /afterlife, a dream or a memory/]],
  ];
  for (const [name, version, patterns] of rules) {
    it(`${name} ${version} carries the Q2b rules`, async () => {
      const skill = await loadSkill(name);
      expect(skill.version).toBe(version);
      for (const p of patterns) expect(skill.content, `${name} lacks ${p}`).toMatch(p);
    });
  }
});
