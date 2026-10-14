/**
 * Track W1 (v0.3, issues #82, #83, #87): the plan warning for missing page-turn hooks and the
 * skill rules that the measurements in docs/v0.3/W1-writer.md support. No model calls.
 */
import { describe, expect, it } from "vitest";

import { pageTurnHookIssues, repeatedBeatPages } from "../src/goals/page-turn.js";
import { adaptationPlanGoal } from "../src/goals/adaptation-plan.js";
import { quoteClippedIssues, QUOTE_CLIP_MAX_TAIL, QUOTE_CLIP_MIN_TAIL, REPAIR_ONCE_CODES, repairOnceIssues } from "../src/goals/repair-once.js";
import { planPlaceIssues } from "../src/goals/places.js";
import { loadSkill } from "../src/skills/load.js";

type P = { page_number: number; section_id: string; page_turn_hook: boolean };
const page = (n: number, section: string, hook: boolean): P => ({ page_number: n, section_id: section, page_turn_hook: hook });
const plan = (pages: P[]) => ({ pages });

describe("page-turn plan checks (Gate 1 fixes: PAGE_TURN_HOOK_MISSING removed, PLAN_BEAT_REPEATED added)", () => {
  const withBeat = (n: number, beat: string) => ({ ...page(n, "s1", false), beat });

  it("no longer warns about a plan with few hooks (the warning pushed a hook on every page)", () => {
    const p = plan([page(1, "s1", false), page(2, "s1", false), page(3, "s1", false), page(4, "s1", false), page(5, "s1", false), page(6, "s1", false)]);
    expect(pageTurnHookIssues(p)).toEqual([]);
  });

  it("warns when two consecutive pages share the same beat text (case, spacing and end punctuation ignored)", () => {
    const p = { pages: [withBeat(1, "The Prince weeps."), withBeat(2, "The  prince weeps"), withBeat(3, "The Swallow leaves.")] };
    const issues = pageTurnHookIssues(p);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("PLAN_BEAT_REPEATED");
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].message).toContain("pages 1 and 2");
    expect(repeatedBeatPages(p)).toEqual([1]);
  });

  it("is silent for distinct beats, for pages that are not neighbours, and for empty beats", () => {
    expect(pageTurnHookIssues({ pages: [withBeat(1, "A"), withBeat(2, "B"), withBeat(3, "A")] })).toEqual([]);
    expect(pageTurnHookIssues({ pages: [withBeat(1, ""), withBeat(2, "")] })).toEqual([]);
  });

  it("survives a malformed plan", () => {
    expect(pageTurnHookIssues(undefined)).toEqual([]);
    expect(pageTurnHookIssues({ pages: [null, 3, { page_number: 1 }] })).toEqual([]);
  });

  it("is part of the plan goal's submit: a repeated beat is kept on record and the plan is accepted", async () => {
    const book = {
      title: "T", author: "A", page_count: 6,
      sections: [{ id: "s1", title: "One", page_start: 1, page_end: 6, unit_ids: ["s1u1", "s1u2", "s1u3", "s1u4", "s1u5", "s1u6"] }],
      units: ["s1u1", "s1u2", "s1u3", "s1u4", "s1u5", "s1u6"].map((id, i) => ({ id, section_id: "s1", page_start: i + 1, page_end: i + 1, word_count: 400, text: `Text of ${id}.` })),
    };
    const understanding = {
      schema: "book-understanding.v1", title: "T", author: "A", genre: "fiction", premise: "p", themes: [],
      sections: book.sections.map((s) => ({ id: s.id, title: s.title, summary: "s", units: s.unit_ids })),
      cast: [{ id: "c_hero", name: "Hero", role: "hero", description: "d", look: { kind: "human" }, sections: ["s1"] }],
      locations: [{ id: "l_town", name: "Town", environment: "street", features: [], description: "d" }],
      claims: ["s1u1", "s1u2", "s1u3", "s1u4", "s1u5", "s1u6"].map((u, i) => ({ id: `k${i + 1}`, section_id: "s1", kind: "event", importance: "core", text: `Claim ${i + 1}.`, source: [{ unit: u, page: 1 }] })),
    };
    const pages = book.units.map((u, i) => ({
      page_number: i + 1, section_id: "s1", beat: i === 1 ? "Beat 1" : `Beat ${i + 1}`, claims: [`k${i + 1}`], cast: ["c_hero"], locations: ["l_town"], units: [u.id], page_turn_hook: false,
    }));
    const input = adaptationPlanGoal.parseInput({ book, understanding, pages: { min: 3, max: 12, target: 6 } });
    const prepared = adaptationPlanGoal.prepare(input, { model: "x" as never, thinking: "off", vision: false });
    const result = await (prepared.tools[0] as unknown as { execute(a: Record<string, unknown>): Promise<{ text: string }> }).execute({
      candidate_json: JSON.stringify({ schema: "adaptation-plan.v1", pages, omitted: [] }),
    });
    expect(result.text).not.toContain("REJECTED:");
    expect(result.text).toContain("PLAN_BEAT_REPEATED");
    expect(result.text).not.toContain("PAGE_TURN_HOOK_MISSING");
  });
});

describe("decisions kept from the measurements (docs/v0.3/W1-writer.md)", () => {
  it("QUOTE_CLIPPED is not run by the page goal any more (D33), but the function still finds the case for the calibration scripts", () => {
    expect(REPAIR_ONCE_CODES).not.toContain("QUOTE_CLIPPED");
    expect([QUOTE_CLIP_MIN_TAIL, QUOTE_CLIP_MAX_TAIL]).toEqual([2, 6]);
    const spec = { panels: [{ id: "p1", text: [{ kind: "speech", fidelity: "quote", text: "I shall do what I like with it, however long it takes" }] }] } as never;
    const units = [{ text: "I shall do what I like with it, however long it takes, and no one shall stop me." }];
    expect(quoteClippedIssues(spec, { units }).map((i) => i.severity)).toEqual(["warning"]);
    const ctx = { claims: [], cast: [], locations: [], page: { page_number: 1, section_id: "s1", beat: "", claims: [], cast: [], locations: [], units: [], page_turn_hook: false }, units, first_appearances: [] } as never;
    expect(repairOnceIssues(spec, ctx).map((i) => i.code)).not.toContain("QUOTE_CLIPPED");
  });

  it("PLAN_LOCATION_NOT_IN_UNITS stays a warning (2x2 table in the notes: 4 of 16 flagged pages match a setting complaint, base 34%)", () => {
    const understanding = { locations: [{ id: "l_a", name: "A", environment: "street", features: [], description: "", units: ["s1u1"] }, { id: "l_b", name: "B", environment: "street", features: [], description: "", units: ["s1u2"] }] } as never;
    const plan = { pages: [{ page_number: 1, section_id: "s1", beat: "", claims: [], cast: [], locations: ["l_b"], units: ["s1u1"], page_turn_hook: false }] };
    const issues = planPlaceIssues(plan, understanding);
    expect(issues.map((i) => [i.code, i.severity])).toContainEqual(["PLAN_LOCATION_NOT_IN_UNITS", "warning"]);
  });
});

describe("skills carry the W1 rules", () => {
  const rules: Array<[string, string, RegExp[]]> = [
    ["adaptation-plan", "1.7.0", [/Plan a turn hook where the story has one/, /ANSWERS it or MOVES ON/, /Do not plan an invented line to make a hook/, /inside or\s+outside, at the bank or on the road, by day or at night/]],
    ["manga-page", "1.14.0", [/Never repeat across the turn/, /Labels are for `thing_\*` props only/, /Never spend the hook early/, /Cut a quote at the edges of a clause/, /Label by what you wrote/, /Stage each panel where and when the source puts it/, /not a copy of the previous page's last\s+panel/]],
  ];
  for (const [name, version, patterns] of rules) {
    it(`${name} ${version}`, async () => {
      const skill = await loadSkill(name);
      expect(skill.version).toBe(version);
      for (const p of patterns) expect(skill.content, `${name} lacks ${p}`).toMatch(p);
      expect(skill.contentHash).toMatch(/^[0-9a-f]{64}$/);
    });
  }
});
