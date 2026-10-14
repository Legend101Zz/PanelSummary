/**
 * Gate 1 fixes of track fxw (v0.3 Wave 2, issues #81 and #82): scale only when the renderer uses it,
 * crowds are people, no unmapped prop that has an item, the previous page's planned hook reaches the
 * page goal. No model call.
 */
import { describe, expect, it } from "vitest";
import { PLAN, UNDERSTANDING } from "../../../packages/manga-render/test/fixtures/happy-prince.js";

import { bookUnderstandingGoal, gate1Issues } from "../src/goals/book-understanding.js";
import { mangaPageGoal } from "../src/goals/manga-page.js";
import { standInVocabulary } from "../src/goals/vocabulary.js";
import { loadSkill } from "../src/skills/load.js";

const member = (id: string, look: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ id, name: id, role: "r", description: "d", look, sections: ["s1"], ...extra });
const codes = (cast: unknown[], unmapped?: unknown[]) => gate1Issues({ cast, unmapped }).map((i) => `${i.code}:${i.severity}:${i.path}`);

describe("SCALE_NOT_USED (warning)", () => {
  it("warns on a named species and on a human of 1.0 or more", () => {
    expect(codes([member("a", { kind: "bird", species: "swallow", scale: 0.08 })])).toEqual(["SCALE_NOT_USED:warning:cast a.look"]);
    expect(codes([member("b", { kind: "animal", species: "dog", scale: 2 })])).toEqual(["SCALE_NOT_USED:warning:cast b.look"]);
    expect(codes([member("c", { kind: "human", scale: 2 })])).toEqual(["SCALE_NOT_USED:warning:cast c.look"]);
    expect(codes([member("d", { kind: "human", scale: 1 })])).toEqual(["SCALE_NOT_USED:warning:cast d.look"]);
    expect(codes([member("e", { kind: "plant", species: "tree", scale: 3 })])).toEqual(["SCALE_NOT_USED:warning:cast e.look"]);
  });
  it("is silent on an archetype, on a tiny human and when scale is left out", () => {
    expect(codes([member("a", { kind: "animal", species: "quad_large", scale: 2 })])).toEqual([]);
    expect(codes([member("b", { kind: "bird", species: "bird_tall", scale: 0.5 })])).toEqual([]);
    expect(codes([member("c", { kind: "human", scale: 0.2 })])).toEqual([]);
    expect(codes([member("d", { kind: "bird", species: "swallow" })])).toEqual([]);
  });
  it("says what to do instead", () => {
    const m = gate1Issues({ cast: [member("c", { kind: "human", scale: 2 })] })[0].message;
    expect(m).toContain('"height": "giant"');
  });
});

describe("CROWD_STAND_IN (error)", () => {
  it("is an error for a crowd with fit near or none, with the repair message", () => {
    for (const fit of ["near", "none"]) {
      const issues = gate1Issues({ cast: [member("herd", { kind: "crowd", crowd: "townsfolk", size: "many" }, { fit, wanted: "a herd of elephants" })] });
      expect(issues.map((i) => [i.code, i.severity])).toEqual([["CROWD_STAND_IN", "error"]]);
      expect(issues[0].message).toContain("one animal member");
      expect(issues[0].message).toContain("archetype");
    }
  });
  it("is silent for a crowd of people with no fit or with fit exact, and for a non-crowd stand-in", () => {
    expect(codes([member("a", { kind: "crowd", crowd: "townsfolk", size: "few" })])).toEqual([]);
    expect(codes([member("b", { kind: "crowd", crowd: "children", size: "few" }, { fit: "exact" })])).toEqual([]);
    expect(codes([member("c", { kind: "animal", species: "quad_medium" }, { fit: "none", wanted: "a camel" })])).toEqual([]);
  });
  it("does not judge a prior member of a continuation (it is copied unchanged and cannot be repaired)", () => {
    const herd = member("herd", { kind: "crowd", crowd: "townsfolk", size: "many" }, { fit: "near", wanted: "a herd" });
    expect(gate1Issues({ cast: [herd] }, new Set(["herd"]))).toEqual([]);
    expect(gate1Issues({ cast: [herd] }, new Set(["other"])).map((i) => i.code)).toEqual(["CROWD_STAND_IN"]);
  });
  it("rejects a candidate in the understanding goal's submit", async () => {
    const book = {
      title: "T", author: "A", page_count: 1,
      sections: [{ id: "s1", title: "One", page_start: 1, page_end: 1, unit_ids: ["s1u1"] }],
      units: [{ id: "s1u1", section_id: "s1", page_start: 1, page_end: 1, text: "A herd walks by the river." }],
    };
    const prepared = bookUnderstandingGoal.prepare(bookUnderstandingGoal.parseInput({ book }), { model: "x" as never, thinking: "off", vision: false });
    const candidate = {
      schema: "book-understanding.v1", title: "T", author: "A", kind: "fiction", logline: "l",
      sections: [{ id: "s1", title: "One", summary: "s", units: ["s1u1"] }],
      cast: [member("herd", { kind: "crowd", crowd: "townsfolk", size: "many" }, { fit: "near", wanted: "a herd" })],
      locations: [{ id: "l1", name: "River", environment: "country_road", features: [], units: ["s1u1"], description: "d" }],
      claims: [{ id: "k1", section_id: "s1", kind: "event", importance: "core", text: "A herd walks.", source: [{ unit: "s1u1", page: 1 }] }, { id: "k2", section_id: "s1", kind: "event", importance: "core", text: "By the river.", source: [{ unit: "s1u1", page: 1 }] }],
      themes: ["t"],
    };
    const reply = await prepared.tools[0].execute({ candidate_json: JSON.stringify(candidate) }, undefined);
    expect(reply.text).toContain("CROWD_STAND_IN");
    expect(reply.text).toContain("REJECTED");
  });
});

describe("UNMAPPED_HAS_ITEM (warning)", () => {
  const u = (wanted: string, type = "prop") => [{ type, wanted, used: "thing_round" }];
  it("warns when wanted names a thing that has a prop item", () => {
    expect(codes([], u("a great ruby"))).toEqual(["UNMAPPED_HAS_ITEM:warning:unmapped 0"]);
    expect(codes([], u("the leaden heart"))).toEqual(["UNMAPPED_HAS_ITEM:warning:unmapped 0"]);
    expect(codes([], u("a gold leaf"))).toEqual(["UNMAPPED_HAS_ITEM:warning:unmapped 0"]);
  });
  it("is silent when no prop item fits, for a neutral shape word and for non-prop entries", () => {
    expect(codes([], u("a sun-dial"))).toEqual([]);
    expect(codes([], u("a smooth stone"))).toEqual([]);
    expect(codes([], u("a ruby", "cast"))).toEqual([]);
    expect(codes([], u("rubyish-thing"))).toEqual([]);
  });
});

describe("the previous page's planned hook reaches the page goal (A1, fix 5)", () => {
  const plan = { ...PLAN, pages: PLAN.pages.map((p, i) => ({ ...p, page_turn_hook: i === 1 })) };
  const input = (n: number) => {
    const planned = plan.pages.find((p) => p.page_number === n)!;
    return {
      book: { title: "T", author: "A" }, understanding: UNDERSTANDING, plan, page_number: n,
      units: planned.units.map((id) => ({ id, page_start: 1, page_end: 1, text: `Source text of ${id}.` })),
    };
  };
  const opts = { model: "x" as never, thinking: "off" as const, vision: false };

  it("parseInput carries the previous beat and planned hook for page N > 1 and nothing for page 1", () => {
    expect(mangaPageGoal.parseInput(input(1)).previous).toBeUndefined();
    const third = mangaPageGoal.parseInput(input(3));
    expect(third.previous).toEqual({ page_number: 2, beat: plan.pages[1].beat, planned_hook: true });
    expect(mangaPageGoal.parseInput(input(2)).previous?.planned_hook).toBe(false);
  });
  it("the prompt names the hook for page N > 1 after a hook page, and not for page 1 or after a page with no hook", () => {
    const prompt = (n: number) => mangaPageGoal.prepare(mangaPageGoal.parseInput(input(n)), opts).userPrompt;
    expect(prompt(3)).toContain("ENDS ON A PLANNED HOOK");
    expect(prompt(3)).toContain(plan.pages[1].beat);
    expect(prompt(1)).not.toContain("PLANNED HOOK");
    expect(prompt(2)).not.toContain("PLANNED HOOK");
    expect(prompt(4)).not.toContain("PLANNED HOOK");
  });
});

describe("vocabulary and skills", () => {
  it("look_scale tells the model to leave scale out by default", () => {
    const v = standInVocabulary() as unknown as Record<string, string>;
    expect(v.look_scale).toMatch(/Leave it out by default/);
    expect(v.look_scale).toMatch(/ignores it on a named/);
  });
  it("book-understanding 1.13.0 limits scale and names the crowd error; adaptation-plan 1.7.0 hooks only where the story has one", async () => {
    const bu = await loadSkill("book-understanding");
    expect(bu.version).toBe("1.13.0");
    expect(bu.content).toMatch(/Leave `look.scale` out by default/);
    expect(bu.content).toMatch(/CROWD_STAND_IN/);
    expect(bu.content).toMatch(/UNMAPPED_HAS_ITEM/);
    const plan = await loadSkill("adaptation-plan");
    expect(plan.version).toBe("1.7.0");
    expect(plan.content).toMatch(/never forced and never on every\s+page/);
    expect(plan.content).not.toMatch(/Give every page that does not close a section a turn hook/);
    const page = await loadSkill("manga-page");
    expect(page.version).toBe("1.14.0");
    expect(page.content).toMatch(/Never repeat across the turn/);
    expect(page.content).toMatch(/Labels are for `thing_\*` props only/);
  });
});
