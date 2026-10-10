/**
 * v0.2 (#41): the closed vocabulary the worker shows the model is the renderer's list.
 * A name the worker allows but the renderer cannot draw is a failure.
 */
import { describe, expect, it } from "vitest";
import { ENVIRONMENTS, OUTFITS, PROPS } from "@panelsummary/manga-render/contracts";
import { catalog } from "@panelsummary/manga-render";
import { lookVocabulary, pageVocabulary } from "../src/goals/vocabulary.js";
import { stateIssues } from "../src/goals/continuity.js";

describe("vocabulary sync (#41)", () => {
  it("shows the model the new looks, props and backdrops", () => {
    const look = lookVocabulary() as { look_kinds: { human: { outfit: readonly string[] } }; environments: readonly string[] };
    const page = pageVocabulary() as { props: readonly string[] };
    for (const o of ["underclothes", "undressed"]) expect(look.look_kinds.human.outfit).toContain(o);
    for (const e of ["foundry", "dustheap", "paradise"]) expect(look.environments).toContain(e);
    for (const p of ["pot", "stove", "roast_goose", "heart", "angel", "loom", "sledge"]) expect(page.props).toContain(p);
  });
  it("is exactly the renderer's list (no name only the worker allows)", () => {
    expect([...(lookVocabulary() as { environments: readonly string[] }).environments]).toEqual([...ENVIRONMENTS]);
    expect([...(pageVocabulary() as { props: readonly string[] }).props]).toEqual([...PROPS]);
    expect([...(lookVocabulary() as { look_kinds: { human: { outfit: readonly string[] } } }).look_kinds.human.outfit]).toEqual([...OUTFITS]);
  });
  it("a story state may set the outfit of a person; the field is in the catalog the understanding reads", () => {
    expect(catalog().variants.fields.human).toContain("outfit");
    const understanding = {
      cast: [{ id: "c1", name: "The Emperor", role: "ruler", description: "d", look: { kind: "human" }, sections: ["s1"], states: [{ at: "u2", set: { outfit: "underclothes" } }] }],
      claims: [],
    };
    const issues = stateIssues(understanding, ["u1", "u2"], new Map([["u1", 0], ["u2", 1]]));
    expect(issues.filter((i) => i.code === "STATE_NOT_DRAWABLE")).toEqual([]);
    const bad = { ...understanding, cast: [{ ...understanding.cast[0], states: [{ at: "u2", set: { outfit: "spacesuit" } }] }] };
    expect(stateIssues(bad, ["u1", "u2"], new Map([["u1", 0], ["u2", 1]])).map((i) => i.code)).toContain("STATE_NOT_DRAWABLE");
  });
});
