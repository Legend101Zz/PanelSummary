/**
 * Track dens (v0.3, Gate 1b): the plan density warning and the plan place warning, calibrated in
 * docs/v0.3/W1-writer.md ('Gate 1b: plan density'). No model calls.
 */
import { describe, expect, it } from "vitest";

import { adaptationPlanGoal } from "../src/goals/adaptation-plan.js";
import { beatWords, castWords, claimMix, distinctiveWords, isDensePage, namedUnlistedPlaces, planDensityIssues, planPlaceNamedIssues } from "../src/goals/plan-density.js";
import { loadSkill } from "../src/skills/load.js";

const claims = [
  { id: "k1", importance: "core" }, { id: "k2", importance: "core" }, { id: "k3", importance: "core" },
  { id: "k4", importance: "supporting" }, { id: "k5", importance: "detail" }, { id: "k6", importance: "supporting" },
];
const understanding = { claims } as never;
const pg = (n: number, ids: string[], extra: Record<string, unknown> = {}) => ({ page_number: n, section_id: "s1", beat: "b", claims: ids, cast: [], locations: [], units: ["s1u1"], page_turn_hook: false, ...extra });

describe("claimMix and isDensePage", () => {
  const importance = new Map(claims.map((c) => [c.id, c.importance]));
  it("counts claims by importance and an unknown id apart", () => {
    expect(claimMix(pg(1, ["k1", "k4", "k5", "zz"]), importance)).toEqual({ total: 4, core: 1, supporting: 1, detail: 1, unknown: 1 });
    expect(claimMix({ claims: undefined } as never, importance).total).toBe(0);
  });
  it("is dense at 3 claims with 2 or more supporting or detail claims only", () => {
    const mix = (ids: string[]) => claimMix(pg(1, ids), importance);
    expect(isDensePage(mix(["k1", "k2", "k3"]))).toBe(false); // 3 core claims: allowed
    expect(isDensePage(mix(["k1", "k2", "k4"]))).toBe(false); // one non-core: not flagged (candidate b2)
    expect(isDensePage(mix(["k1", "k4", "k5"]))).toBe(true);
    expect(isDensePage(mix(["k4", "k5"]))).toBe(false); // 2 claims
    expect(isDensePage(mix(["k1", "k4", "k5", "k6"]))).toBe(true);
  });
  it("counts the words of a beat", () => {
    expect(beatWords("  The Swallow   agrees; the ruby glints. ")).toBe(6);
    expect(beatWords(undefined)).toBe(0);
  });
});

describe("PLAN_PAGE_DENSE", () => {
  it("is a warning with a repair message that names the movable claims and keeps core claims", () => {
    const issues = planDensityIssues({ pages: [pg(1, ["k1", "k2"]), pg(2, ["k1", "k4", "k5"])] }, understanding);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "PLAN_PAGE_DENSE", severity: "warning", path: "page 2" });
    expect(issues[0].message).toMatch(/3 claims \(1 core, 1 supporting, 1 detail\)/);
    expect(issues[0].message).toMatch(/Move k4, k5 to a neighbouring page with room, or omit it with a reason/);
    expect(issues[0].message).toMatch(/Never drop a core claim/);
    expect(issues[0].message).not.toMatch(/Move [^.]*k1/);
  });
  it("is silent on a clean plan and survives a malformed one", () => {
    expect(planDensityIssues({ pages: [pg(1, ["k1"]), pg(2, ["k2", "k3"]), pg(3, ["k1", "k2", "k3"])] }, understanding)).toEqual([]);
    expect(planDensityIssues(undefined, understanding)).toEqual([]);
    expect(planDensityIssues({ pages: [null, 4, { page_number: 1 }] }, understanding)).toEqual([]);
  });
});

describe("PLAN_PLACE_NOT_LISTED", () => {
  const locations = [
    { id: "l_garret", name: "The Student's Garret" },
    { id: "l_column", name: "The Great Column" },
    { id: "l_garden", name: "The Rose Garden" },
    { id: "l_orchard", name: "The Rose Orchard" },
  ];
  it("takes the distinctive words of a name (no generic word, no short word, no plural s)", () => {
    expect(distinctiveWords("The Student's Garret")).toEqual(["student", "garret"]);
    expect(distinctiveWords("The Great Hall")).toEqual([]);
    expect(distinctiveWords("A Gardens")).toEqual(["garden"]);
  });
  it("names a place by a distinctive word of its name, with a word start and any case", () => {
    const found = namedUnlistedPlaces({ beat: "The Prince watches from the COLUMN while a Garrets fire burns.", locations: ["l_garden"] }, locations);
    expect(found.map((f) => f.id)).toEqual(["l_garret", "l_column"]);
    expect(namedUnlistedPlaces({ beat: "A regarrett of the facts.", locations: [] }, locations)).toEqual([]);
  });
  it("does not report a place that the page lists, or one that shares the named word with a listed place", () => {
    expect(namedUnlistedPlaces({ beat: "He walks to the column.", locations: ["l_column"] }, locations)).toEqual([]);
    expect(namedUnlistedPlaces({ beat: "Roses bloom in the rose garden.", locations: ["l_garden"] }, locations).map((f) => f.id)).toEqual([]);
  });
  it("ignores words that a cast name holds (a student is a person, not the garret)", () => {
    const cast = [{ name: "The Student" }];
    expect(castWords(cast).has("student")).toBe(true);
    const beat = { beat: "The student reads a letter.", locations: ["l_column"] };
    expect(namedUnlistedPlaces(beat, locations).map((f) => f.id)).toEqual(["l_garret"]);
    expect(namedUnlistedPlaces(beat, locations, castWords(cast))).toEqual([]);
  });
  it("is a warning with a repair message; silent with no locations", () => {
    const plan = { pages: [pg(1, [], { beat: "The Swallow rests at the garret.", locations: ["l_column"] }), pg(2, [], { beat: "Quiet.", locations: [] })] };
    const issues = planPlaceNamedIssues(plan, { locations, cast: [] } as never);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "PLAN_PLACE_NOT_LISTED", severity: "warning", path: "page 1" });
    expect(issues[0].message).toMatch(/names l_garret \("garret"\), but the page lists l_column/);
    expect(issues[0].message).toMatch(/Add the place to "locations"/);
    expect(planPlaceNamedIssues(plan, { locations: [], cast: [] } as never)).toEqual([]);
    expect(planPlaceNamedIssues(undefined, { locations, cast: [] } as never)).toEqual([]);
  });
});

describe("the plan goal keeps both as warnings on record", () => {
  it("accepts a dense plan whose beat names an unlisted place and lists both warnings", async () => {
    const ids = ["s1u1", "s1u2", "s1u3"];
    const book = {
      title: "T", author: "A", page_count: 3,
      sections: [{ id: "s1", title: "One", page_start: 1, page_end: 3, unit_ids: ids }],
      units: ids.map((id, i) => ({ id, section_id: "s1", page_start: i + 1, page_end: i + 1, word_count: 400, text: `Text of ${id}.` })),
    };
    const und = {
      schema: "book-understanding.v1", title: "T", author: "A", genre: "fiction", premise: "p", themes: [],
      sections: [{ id: "s1", title: "One", summary: "s", units: ids }],
      cast: [{ id: "c_hero", name: "Hero", role: "hero", description: "d", look: { kind: "human" }, sections: ["s1"] }],
      locations: [{ id: "l_town", name: "Town square", environment: "street", features: [], description: "d" }, { id: "l_tower", name: "Clock tower", environment: "street", features: [], description: "d" }],
      claims: [
        { id: "k1", section_id: "s1", kind: "event", importance: "core", text: "One.", source: [{ unit: "s1u1", page: 1 }] },
        { id: "k2", section_id: "s1", kind: "event", importance: "supporting", text: "Two.", source: [{ unit: "s1u2", page: 2 }] },
        { id: "k3", section_id: "s1", kind: "event", importance: "detail", text: "Three.", source: [{ unit: "s1u3", page: 3 }] },
      ],
    };
    const pages = [
      { page_number: 1, section_id: "s1", beat: "Hero wakes in the square.", claims: [], cast: ["c_hero"], locations: ["l_town"], units: ["s1u1"], page_turn_hook: false },
      { page_number: 2, section_id: "s1", beat: "Hero rests.", claims: [], cast: ["c_hero"], locations: ["l_town"], units: ["s1u2"], page_turn_hook: false },
      { page_number: 3, section_id: "s1", beat: "Hero climbs the clock tower; the square below.", claims: ["k1", "k2", "k3"], cast: ["c_hero"], locations: ["l_town"], units: ids, page_turn_hook: false },
    ];
    const input = adaptationPlanGoal.parseInput({ book, understanding: und, pages: { min: 3, max: 4, target: 3 } });
    const prep = adaptationPlanGoal.prepare(input, { model: "x" as never, thinking: "off", vision: false });
    const result = await (prep.tools[0] as unknown as { execute(a: Record<string, unknown>): Promise<{ text: string; accepted?: unknown }> }).execute({
      candidate_json: JSON.stringify({ schema: "adaptation-plan.v1", pages, omitted: [] }),
    });
    expect(result.text).toMatch(/^ACCEPTED/);
    expect(result.text).toMatch(/PLAN_PAGE_DENSE/);
    expect(result.text).toMatch(/PLAN_PLACE_NOT_LISTED/);
    expect(result.accepted).toBeDefined();
  });
});

describe("adaptation-plan 1.8.0 states the density rule", () => {
  it("prefers at most 2 claims, allows a third when the budget needs it, and says what to move", async () => {
    const skill = await loadSkill("adaptation-plan");
    expect(skill.version).toBe("1.8.0");
    expect(skill.content).toMatch(/at most 2 claims on a page/);
    expect(skill.content).toMatch(/A third is fine when the claims are short\s+`core` claims, or when the page budget leaves no room/);
    expect(skill.content).toMatch(/never drop a\s+`core` claim/);
    expect(skill.content).toMatch(/List every place the beat names in `locations`\./);
    expect(skill.content).not.toMatch(/must be one the beat names/);
  });
});
