/**
 * #80 live finding: a continuation was rejected on every submit with PLACE_UNITS_INVALID for the PRIOR
 * locations (their units are units of part 1), and a new cast member without a look made a check throw.
 * The fixture is the real part 1 understanding of the Just So tuning book (m1-part1-understanding.json).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { BookUnderstanding } from "@panelsummary/manga-render";

import { bookUnderstandingGoal } from "../src/goals/book-understanding.js";
import { CANDIDATE_ARG } from "../src/goals/common.js";
import { planPlaceIssues } from "../src/goals/places.js";
import { mergePrior, parsePrior } from "../src/goals/prior-understanding.js";
import type { GoalOptions, PreparedGoal } from "../src/goals/types.js";

const OFF: GoalOptions = { model: "MiniMax-M3", thinking: "off", vision: false };
const PART1 = JSON.parse(readFileSync(new URL("./fixtures/m1-part1-understanding.json", import.meta.url), "utf8")) as BookUnderstanding;

const BOOK_2 = {
  title: PART1.title,
  author: PART1.author,
  page_count: 8,
  sections: [{ id: "s2", title: "Part two", page_start: 5, page_end: 8, unit_ids: ["s2u1", "s2u2", "s2u3"] }],
  units: [
    { id: "s2u1", section_id: "s2", page_start: 5, page_end: 5, text: "The Elephant's Child went home along the road, and the Bi-Coloured-Python-Rock-Snake met him on the way." },
    { id: "s2u2", section_id: "s2", page_start: 6, page_end: 7, text: "At the great grey-green greasy Limpopo River he sat down by the bank and spoke to the Crocodile. A small bird watched them." },
    { id: "s2u3", section_id: "s2", page_start: 8, page_end: 8, text: "Then he went into the high cool forest, where a sunlit glade lay between the trees, and he was happy." },
  ],
};

const NEW_PLACE = { id: "l_forest", name: "The high cool forest", environment: "forest", features: ["trees"], description: "A cool forest glade.", units: ["s2u3"] };
const NEW_CAST = { id: "c_bird", name: "The small bird", role: "watcher", description: "A small brown bird.", look: { kind: "bird", species: "sparrow", tone: "mid" }, sections: ["s2"] };

function submission(cast: unknown[], locations: unknown[]): Record<string, unknown> {
  return {
    schema: "book-understanding.v1",
    title: PART1.title,
    author: PART1.author,
    kind: "fiction",
    logline: PART1.logline,
    sections: [{ id: "s2", title: "Part two", summary: "The Elephant's Child goes home and ends in the forest.", units: ["s2u1", "s2u2", "s2u3"] }],
    cast,
    locations,
    claims: [
      { id: "c100", section_id: "s2", kind: "event", importance: "core", text: "He walks home along the road.", source: [{ unit: "s2u1", page: 5 }] },
      { id: "c101", section_id: "s2", kind: "event", importance: "core", text: "He speaks to the Crocodile at the Limpopo.", source: [{ unit: "s2u2", page: 6 }] },
      { id: "c102", section_id: "s2", kind: "event", importance: "core", text: "He is happy in the forest.", source: [{ unit: "s2u3", page: 8 }] },
    ],
    themes: ["curiosity"],
  };
}

const prepare = (): PreparedGoal =>
  bookUnderstandingGoal.prepare(bookUnderstandingGoal.parseInput({ book: BOOK_2, prior: { version: 1, edition_id: "e1", understanding: PART1 } }), OFF);
const submit = (prepared: PreparedGoal, value: unknown) => prepared.tools.find((t) => t.name === "submit_understanding")!.execute({ [CANDIDATE_ARG]: JSON.stringify(value) }, undefined);

describe("a realistic continuation (part 1 locations carry s1 units)", () => {
  it("the fixture has prior locations with units of section 1", () => {
    expect(PART1.locations.map((l) => (l as { units?: string[] }).units?.[0])).toEqual(["s1u1", "s1u2", "s1u2"]);
  });

  it("accepts: prior places not listed, one prior place reused with s2 units, a new place, a new cast member", async () => {
    const reuse = { id: "l_limpopo", units: ["s2u2"] };
    const result = await submit(prepare(), submission([NEW_CAST], [reuse, NEW_PLACE]));
    expect(result.text).not.toContain("PLACE_UNITS_INVALID");
    expect(result.text).toMatch(/^ACCEPTED/);
    const out = result.accepted as unknown as { locations: Array<{ id: string; units?: string[] }>; cast: Array<{ id: string }> };
    const by = new Map(out.locations.map((l) => [l.id, l.units]));
    expect(by.get("l_home")).toEqual(["s1u1", "s1u4", "s1u5"]);
    expect(by.get("l_limpopo")).toEqual(["s1u2", "s1u3", "s1u4", "s1u5", "s2u2"]);
    expect(by.get("l_forest")).toEqual(["s2u3"]);
    expect(out.cast.map((m) => m.id)).toContain("c_bird");
  });

  it("accepts when the model lists no prior place at all", async () => {
    const result = await submit(prepare(), submission([NEW_CAST], [NEW_PLACE]));
    expect(result.text).toMatch(/^ACCEPTED/);
    expect(result.text).not.toContain("PLACE_UNITS_INVALID");
  });

  it("still rejects an unknown unit on a NEW place and on a reused prior place", async () => {
    const badNew = await submit(prepare(), submission([NEW_CAST], [{ ...NEW_PLACE, units: ["s9u9"] }]));
    expect(badNew.accepted).toBeUndefined();
    expect(badNew.text).toContain("PLACE_UNITS_INVALID(location l_forest)".replace("PLACE_UNITS_INVALID(location l_forest)", "PLACE_UNITS_INVALID"));
    expect(badNew.text).toContain("location l_forest");
    const badPrior = await submit(prepare(), submission([NEW_CAST], [{ id: "l_road", units: ["s9u9"] }, NEW_PLACE]));
    expect(badPrior.accepted).toBeUndefined();
    expect(badPrior.text).toContain("location l_road");
    // A prior unit of part 1 given to a NEW place is not a unit of the new scope.
    const oldUnitOnNew = await submit(prepare(), submission([NEW_CAST], [{ ...NEW_PLACE, units: ["s1u1"] }]));
    expect(oldUnitOnNew.accepted).toBeUndefined();
  });

  it("a new cast member without a look is a normal error, never a throw", async () => {
    const noLook = { id: "c_bird", name: "The small bird", role: "watcher", description: "A small brown bird.", sections: ["s2"] };
    const result = await submit(prepare(), submission([noLook, { ...NEW_CAST, id: "c_crowd", name: "The families", look: undefined, description: "A crowd of ducklings.", role: "extras" }], [NEW_PLACE]));
    expect(result.accepted).toBeUndefined();
    expect(result.text).toMatch(/FIELD_MISSING|LOOK_INVALID/);
    // a states entry on a member without a look must not throw either
    const withStates = { ...noLook, states: [{ at: "s2u2", set: { eyes: "closed" } }] };
    const again = await submit(prepare(), submission([withStates], [NEW_PLACE]));
    expect(again.accepted).toBeUndefined();
    expect(again.text).toMatch(/FIELD_MISSING|LOOK_INVALID/);
  });

  it("a cast member without a look in a quoted-line unit does not throw (lone speaker check)", async () => {
    const book = { ...BOOK_2, units: BOOK_2.units.map((u, i) => (i === 1 ? { ...u, text: "The small bird said, \"Stay away,\" said the bird to the Crocodile." } : u)) };
    const prepared = bookUnderstandingGoal.prepare(bookUnderstandingGoal.parseInput({ book, prior: { version: 1, edition_id: "e1", understanding: PART1 } }), OFF);
    const noLook = { id: "c_bird", name: "The small bird", role: "watcher", description: "A small brown bird.", sections: ["s2"] };
    const result = await submit(prepared, submission([noLook], [NEW_PLACE]));
    expect(result.accepted).toBeUndefined();
    expect(result.text).toMatch(/FIELD_MISSING|LOOK_INVALID/);
  });

  it("mergePrior adds the new units to a prior place and does not warn about it", () => {
    const prior = parsePrior({ version: 1, understanding: PART1 })!;
    const { merged, issues } = mergePrior(submission([NEW_CAST], [{ id: "l_home", units: ["s2u1"] }]), prior, { keepPriorStates: true });
    expect(issues).toEqual([]);
    expect((merged as { locations: Array<{ id: string; units: string[] }> }).locations[0].units).toEqual(["s1u1", "s1u4", "s1u5", "s2u1"]);
  });
});

describe("the plan of part 2 with a prior location that has new units", () => {
  it("uses the merged units and names no place problem for a prior place with s2 units", () => {
    const prior = parsePrior({ version: 1, understanding: PART1 })!;
    const { merged } = mergePrior(submission([NEW_CAST], [{ id: "l_limpopo", units: ["s2u2"] }, NEW_PLACE]), prior, { keepPriorStates: true });
    const plan = { pages: [{ page_number: 1, section_id: "s2", units: ["s2u2"], locations: ["l_limpopo"] }, { page_number: 2, section_id: "s2", units: ["s2u3"], locations: ["l_forest"] }] };
    expect(planPlaceIssues(plan, merged as BookUnderstanding)).toEqual([]);
    // Without the merge (the prior as stored) the same page is flagged: this is why the merge matters.
    const stale = planPlaceIssues(plan, PART1);
    expect(stale.map((i) => i.code)).toContain("PLAN_LOCATION_NOT_IN_UNITS");
  });
});
