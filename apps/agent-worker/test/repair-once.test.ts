/**
 * Track W2-writer: the repair_once severity class and its checks (docs/launch/W2-writer.md). No model.
 */
import { describe, expect, it } from "vitest";

import { loadSkill } from "../src/skills/load.js";

import type { BookUnderstanding, Claim, MangaPageSpec, PlannedPage, ValidationIssue } from "@panelsummary/manga-render";

import { PAGES, PLAN, UNDERSTANDING } from "../../../packages/manga-render/test/fixtures/happy-prince.js";
import { CANDIDATE_ARG } from "../src/goals/common.js";
import { mangaPageGoal } from "../src/goals/manga-page.js";
import {
  applyRepairOnce,
  claimTextThinIssues,
  dialogueOrderIssues,
  duplicateCaptionIssues,
  isRepairOnce,
  keyPropNotDrawnIssues,
  locationOffPlanIssues,
  QUOTE_CLIP_MAX_TAIL,
  QUOTE_CLIP_MIN_TAIL,
  quoteClippedIssues,
  REPAIR_ONCE_CODES,
  repairOnceIssues,
  repeatNameTagIssues,
  sameShotTwiceIssues,
  shotSignature,
  speechInNarrationIssues,
  sourceWords,
} from "../src/goals/repair-once.js";
import type { GoalOptions } from "../src/goals/types.js";

const OFF: GoalOptions = { model: "MiniMax-M3", thinking: "off", vision: false };

const cast = [
  { id: "prince", name: "The Happy Prince", role: "statue", description: "", look: { kind: "human" }, sections: [] },
  { id: "swallow", name: "The Swallow", role: "bird", description: "", look: { kind: "bird" }, sections: [] },
  { id: "rocket", name: "The Remarkable Rocket", role: "firework", description: "", look: { kind: "object" }, sections: [] },
] as unknown as BookUnderstanding["cast"];
const locations = [
  { id: "square", name: "The Square", environment: "city_square", features: [], description: "" },
  { id: "river", name: "The River", environment: "riverbank", features: [], description: "" },
] as unknown as BookUnderstanding["locations"];

const claim = (id: string, text: string, importance: Claim["importance"] = "core", kind: Claim["kind"] = "event"): Claim => ({ id, section_id: "s1", kind, importance, text, source: [] });

function page(panels: Record<string, unknown>[]): MangaPageSpec {
  return { schema: "manga-page.v1", page_number: 1, section_id: "s1", purpose: "x", layout: { template: "establish_4" }, claims: [], page_turn_hook: false, panels } as unknown as MangaPageSpec;
}
const panel = (id: string, extra: Record<string, unknown> = {}) => ({ id, beat: "b", shot: "medium", angle: "eye", location: "square", figures: [], props: [], fx: [], text: [], source: [], ...extra });
const text = (kind: string, body: string, extra: Record<string, unknown> = {}) => ({ kind, text: body, fidelity: "paraphrase", ...extra });

describe("REPAIR_ONCE_CODES", () => {
  it("pins the calibrated set (change it only with new calibration)", () => {
    expect([...REPAIR_ONCE_CODES].sort()).toEqual(
      [
        "CLAIM_TEXT_THIN",
        "HERO_TOO_SMALL",
        "KEY_PROP_NOT_DRAWN",
        "LOCATION_OFF_PLAN",
        "PROSE_WALL",
        "REPEAT_NAME_TAG",
        "SPEECH_IN_NARRATION",
        "STATUE_LOCATION_SWAPPED",
      ].sort(),
    );
    expect(REPAIR_ONCE_CODES.has("DIALOGUE_ORDER")).toBe(false);
  });

  it("lists exactly these codes in step 6 of the manga-page skill, and the receipt carries the skill version and hash", async () => {
    const skill = await loadSkill("manga-page");
    const step = /FIX BEFORE SUBMIT\*\* items \(([^)]*)\)/.exec(skill.content)?.[1] ?? "";
    expect(step.split(",").map((c) => c.trim()).sort()).toEqual([...REPAIR_ONCE_CODES].sort());
    expect(skill.version).toBe("1.11.0");
    expect(skill.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps the candidates and the demoted codes out of the class (v0.2 calibration)", () => {
    for (const code of ["SAME_SHOT_TWICE", "QUOTE_CLIPPED", "DIALOGUE_ORDER", "CLAIM_ORDER", "DUPLICATE_CAPTION", "SPEAKER_OFF_PANEL_LIMIT"]) {
      expect(REPAIR_ONCE_CODES.has(code)).toBe(false);
    }
  });
});

describe("applyRepairOnce", () => {
  const thin: ValidationIssue = { code: "CLAIM_TEXT_THIN", severity: "warning", path: "page.claims", message: "m" };
  const plain: ValidationIssue = { code: "SIDES_SWAPPED", severity: "warning", path: "panel p2", message: "m" };

  it("turns a repair_once warning into an error while the chance is left, and nothing else", () => {
    const out = applyRepairOnce([thin, plain], true);
    expect(out[0].severity).toBe("error");
    expect(out[0].message).toMatch(/^FIX BEFORE SUBMIT: /);
    expect(out[1]).toEqual(plain);
  });

  it("leaves every issue a warning once the chance is used, and does not change its input", () => {
    expect(applyRepairOnce([thin, plain], false)).toEqual([thin, plain]);
    applyRepairOnce([thin], true);
    expect(thin.severity).toBe("warning");
  });

  it("keeps DIALOGUE_ORDER a plain warning", () => {
    expect(REPAIR_ONCE_CODES.has("DIALOGUE_ORDER")).toBe(false);
    expect(isRepairOnce({ ...thin, code: "DIALOGUE_ORDER" })).toBe(false);
  });
});

describe("repair_once in the page goal", { timeout: 60_000 }, () => {
  const planned = PLAN.pages.find((p) => p.page_number === 3)!;
  const FIXTURE_QUOTES = PAGES.flatMap((p) => p.panels.flatMap((x) => (x.text ?? []).filter((t) => t.fidelity === "quote").map((t) => t.text))).join(" ");
  const prepare = () =>
    mangaPageGoal.prepare(
      mangaPageGoal.parseInput({
        book: { title: "The Happy Prince", author: "Oscar Wilde" },
        understanding: UNDERSTANDING,
        plan: PLAN,
        page_number: 3,
        units: planned.units.map((id) => ({ id, page_start: 1, page_end: 1, text: FIXTURE_QUOTES })),
      }),
      OFF,
    );
  const fixture = (): MangaPageSpec => {
    const spec = structuredClone(PAGES.find((p) => p.page_number === 3)!);
    spec.claim_map = spec.claims.map((c) => ({ claim: c, panels: [spec.panels[0].id], how: "the first panel shows and says it" }));
    return spec;
  };
  const run = (prepared: ReturnType<typeof prepare>, tool: string, spec: unknown) =>
    prepared.tools.find((t) => t.name === tool)!.execute({ [CANDIDATE_ARG]: JSON.stringify(spec) }, undefined);

  it("rejects the first submit for a repair_once issue and accepts the second with the same issue", async () => {
    const prepared = prepare();
    const first = await run(prepared, "submit_page", fixture());
    expect(first.accepted).toBeUndefined();
    expect(first.text).toMatch(/^REJECTED: 1 error\(s\)/);
    expect(first.text).toContain("[FIX BEFORE SUBMIT CLAIM_TEXT_THIN]");
    expect(first.text).toContain("reject only this first submit");
    expect(first.note).toContain("repair_once=CLAIM_TEXT_THIN");
    const second = await run(prepared, "submit_page", fixture());
    expect(second.text).toMatch(/^ACCEPTED/);
    expect(second.text).toContain("[WARNING CLAIM_TEXT_THIN]");
    expect(second.accepted).toEqual(fixture());
  });

  it("accepts a first submit that fixes the issue", async () => {
    const spec = fixture();
    spec.panels[0].text = [...(spec.panels[0].text ?? []), { kind: "caption", text: "The Swallow shelters between the statue's feet and is struck by falling tears.", fidelity: "paraphrase" } as never];
    const out = await run(prepare(), "submit_page", spec);
    expect(out.text).not.toContain("FIX BEFORE SUBMIT");
  });

  it("does not use the chance in a preview, so the preview shows it and the first submit still rejects", async () => {
    const prepared = prepare();
    for (let i = 0; i < 2; i += 1) {
      const preview = await run(prepared, "preview_page", fixture());
      expect(preview.text).toContain("[FIX BEFORE SUBMIT CLAIM_TEXT_THIN]");
    }
    const first = await run(prepared, "submit_page", fixture());
    expect(first.accepted).toBeUndefined();
    const second = await run(prepared, "submit_page", fixture());
    expect(second.text).toMatch(/^ACCEPTED/);
    // After the chance is used, the preview shows it as a warning.
    const after = await run(prepared, "preview_page", fixture());
    expect(after.text).toMatch(/^No blocking errors/);
    expect(after.text).toContain("[WARNING CLAIM_TEXT_THIN]");
  });

  it("does not spend the chance on a submit that fails the structural gate", async () => {
    const prepared = prepare();
    const bad = fixture() as unknown as Record<string, unknown>;
    bad.schema = "manga-page.v0";
    const broken = await run(prepared, "submit_page", bad);
    expect(broken.text).toContain("manga-page.v0");
    const first = await run(prepared, "submit_page", fixture());
    expect(first.text).toContain("[FIX BEFORE SUBMIT CLAIM_TEXT_THIN]");
  });

  it("spends the chance on the first full check even when a real error rejects it too", async () => {
    const prepared = prepare();
    const bad = fixture();
    bad.claim_map = [];
    const first = await run(prepared, "submit_page", bad);
    expect(first.text).toContain("CLAIM_MAP_MISSING");
    expect(first.text).toContain("[FIX BEFORE SUBMIT CLAIM_TEXT_THIN]");
    const second = await run(prepared, "submit_page", fixture());
    expect(second.text).toMatch(/^ACCEPTED/);
  });
});

describe("PROSE_WALL in the page goal (v0.2)", { timeout: 60_000 }, () => {
  const planned = PLAN.pages.find((p) => p.page_number === 3)!;
  const FIXTURE_QUOTES = PAGES.flatMap((p) => p.panels.flatMap((x) => (x.text ?? []).filter((t) => t.fidelity === "quote").map((t) => t.text))).join(" ");
  const prepare = () =>
    mangaPageGoal.prepare(
      mangaPageGoal.parseInput({
        book: { title: "The Happy Prince", author: "Oscar Wilde" },
        understanding: UNDERSTANDING,
        plan: PLAN,
        page_number: 3,
        units: planned.units.map((id) => ({ id, page_start: 1, page_end: 1, text: FIXTURE_QUOTES })),
      }),
      OFF,
    );
  const SOURCE = { unit: planned.units[0], page: 1 };
  /** The fixture page with its CLAIM_TEXT_THIN gap closed; `extra` is lettered in the extreme-close panel. */
  const fixture = (extra: Record<string, unknown>): MangaPageSpec => {
    const spec = structuredClone(PAGES.find((p) => p.page_number === 3)!);
    spec.claim_map = spec.claims.map((c) => ({ claim: c, panels: [spec.panels[0].id], how: "the first panel shows and says it" }));
    spec.panels[0].text = [...(spec.panels[0].text ?? []), { kind: "caption", text: "The Swallow shelters between the statue's feet and is struck by falling tears.", fidelity: "paraphrase", source: SOURCE } as never];
    spec.panels[2].text = [...(spec.panels[2].text ?? []), { ...extra, source: SOURCE } as never];
    return spec;
  };
  const run = (prepared: ReturnType<typeof prepare>, tool: string, spec: unknown) =>
    prepared.tools.find((t) => t.name === tool)!.execute({ [CANDIDATE_ARG]: JSON.stringify(spec) }, undefined);
  const wall = { kind: "narration", text: "Above the sleeping city the old statue wept for every hungry child he could see below.", fidelity: "paraphrase" };
  const spoken = { kind: "speech", speaker: "prince", text: "Above the sleeping city I weep for every hungry child I can see.", fidelity: "paraphrase" };

  it("rejects the first submit of a caption wall, and accepts the second with the warning on record", async () => {
    const prepared = prepare();
    const first = await run(prepared, "submit_page", fixture(wall));
    expect(first.accepted).toBeUndefined();
    expect(first.text).toContain("[FIX BEFORE SUBMIT PROSE_WALL]");
    expect(first.note).toContain("repair_once=PROSE_WALL");
    const second = await run(prepared, "submit_page", fixture(wall));
    expect(second.text).toMatch(/^ACCEPTED/);
    expect(second.text).toContain("[WARNING PROSE_WALL]");
  });

  it("accepts a first submit that turns the narration into speech", async () => {
    const out = await run(prepare(), "submit_page", fixture(spoken));
    expect(out.text).not.toContain("PROSE_WALL");
    expect(out.text).toMatch(/^ACCEPTED/);
  });
});

describe("CLAIM_TEXT_THIN", () => {
  const core = claim("k1", "A gilded statue of the Happy Prince stands on a tall column above the city, with two bright sapphires for eyes and a large red ruby on his sword-hilt.");

  it("flags a core claim whose facts are not in the lettering (a name tag does not state them)", () => {
    const spec = page([panel("p1", { text: [text("caption", "The Happy Prince")] })]);
    const issues = claimTextThinIssues(spec, { claims: [core], cast });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("sapphires");
    expect(issues[0].message).toContain("gilded");
  });

  it("is silent when the lettering states the facts, or the claim is minor, a quote, or short", () => {
    const stated = page([panel("p1", { text: [text("caption", "Gilded all over, with sapphires for eyes and a red ruby on his sword-hilt, on a tall column.")] })]);
    expect(claimTextThinIssues(stated, { claims: [core], cast })).toEqual([]);
    const empty = page([panel("p1")]);
    expect(claimTextThinIssues(empty, { claims: [{ ...core, importance: "supporting" }], cast })).toEqual([]);
    expect(claimTextThinIssues(empty, { claims: [{ ...core, kind: "quote" }], cast })).toEqual([]);
    expect(claimTextThinIssues(empty, { claims: [claim("k2", "The Swallow flies away.")], cast })).toEqual([]);
  });
});

describe("KEY_PROP_NOT_DRAWN", () => {
  const rose = claim("k3", "The student wants a red rose for the dance.");

  it("flags a core claim whose object no panel draws, and accepts a prop, a holding, or a stand-in prop", () => {
    expect(keyPropNotDrawnIssues(page([panel("p1")]), { claims: [rose], cast })[0].message).toContain('"rose"');
    expect(keyPropNotDrawnIssues(page([panel("p1", { props: [{ prop: "rose", slot: "center" }] })]), { claims: [rose], cast })).toEqual([]);
    expect(keyPropNotDrawnIssues(page([panel("p1", { figures: [{ character: "swallow", holding: "flower" }] })]), { claims: [rose], cast })).toEqual([]);
  });

  it("does not treat a word in a cast name as an object, and skips words with no certain prop", () => {
    expect(keyPropNotDrawnIssues(page([panel("p1")]), { claims: [claim("k4", "The Rocket boasts of his own importance.")], cast })).toEqual([]);
    expect(keyPropNotDrawnIssues(page([panel("p1")]), { claims: [claim("k5", "The statue is covered in gold and has bright eyes.")], cast })).toEqual([]);
  });

  it("does not flag a claim of which the page draws one of several objects", () => {
    const two = claim("k6", "The Swallow carries the ruby to the seamstress, who sits with her thimble.");
    expect(keyPropNotDrawnIssues(page([panel("p1", { props: [{ prop: "gem", slot: "center" }] })]), { claims: [two], cast })).toEqual([]);
  });
});

describe("SPEECH_IN_NARRATION, DUPLICATE_CAPTION, REPEAT_NAME_TAG", () => {
  it("flags a quoted spoken line in a narration or caption box", () => {
    const spec = page([panel("p1", { text: [text("narration", 'The Swallow said, "I will stay with you for one night."')] })]);
    expect(speechInNarrationIssues(spec)[0].code).toBe("SPEECH_IN_NARRATION");
    expect(speechInNarrationIssues(page([panel("p1", { text: [text("speech", '"I will stay with you for one night."', { speaker: "swallow" })] })]))).toEqual([]);
  });

  it("flags two boxes with the same words, across panels", () => {
    const spec = page([panel("p1", { text: [text("caption", "The Happy Prince")] }), panel("p2", { text: [text("caption", "The Happy Prince.")] })]);
    expect(duplicateCaptionIssues(spec)).toHaveLength(1);
    expect(duplicateCaptionIssues(page([panel("p1", { text: [text("caption", "The Happy Prince"), text("narration", "A cold night fell on the city.")] })]))).toEqual([]);
  });

  it("flags a second name tag for one character, and a name tag for a character introduced earlier", () => {
    const twice = page([panel("p1", { text: [text("caption", "The Swallow", { about: "swallow" })] }), panel("p2", { text: [text("caption", "The Swallow")] })]);
    expect(repeatNameTagIssues(twice, { cast, first_appearances: ["swallow"] })).toHaveLength(1);
    const earlier = page([panel("p1", { text: [text("caption", "The Swallow", { about: "swallow" })] })]);
    expect(repeatNameTagIssues(earlier, { cast, first_appearances: [] })[0].message).toContain("introduced on an earlier page");
    expect(repeatNameTagIssues(earlier, { cast, first_appearances: ["swallow"] })).toEqual([]);
  });
});

describe("LOCATION_OFF_PLAN and DIALOGUE_ORDER", () => {
  const planned = { page_number: 1, section_id: "s1", beat: "", claims: [], cast: [], locations: ["river"], units: [], page_turn_hook: false } as PlannedPage;

  it("flags a panel outside the planned locations unless it is a flashback", () => {
    const spec = page([panel("p1", { location: "river" }), panel("p2", { location: "square" }), panel("p3", { location: "square", fx: ["flashback"] })]);
    const issues = locationOffPlanIssues(spec, { page: planned, locations });
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe("panel p2");
  });

  it("warns when a reply is lettered before the question it answers in the source", () => {
    const units = [{ text: "“Who are you?” he asked. “I am the Happy Prince,” said the statue." }];
    const wrong = page([
      panel("p1", { text: [text("speech", "I am the Happy Prince", { speaker: "prince", fidelity: "quote" })] }),
      panel("p2", { text: [text("speech", "Who are you?", { speaker: "swallow", fidelity: "quote" })] }),
    ]);
    const issues = dialogueOrderIssues(wrong, { units });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
    const right = page([wrong.panels[1], wrong.panels[0]] as unknown as Record<string, unknown>[]);
    expect(dialogueOrderIssues(right, { units })).toEqual([]);
  });
});

describe("SAME_SHOT_TWICE (v0.2, a warning)", () => {
  const prince = { character: "prince", pose: "stand", expression: "sad", facing: "front", slot: "center", depth: "mid" };
  const swallow = { character: "swallow", pose: "perch", expression: "sad", facing: "left", slot: "right", depth: "mid" };
  const two = (a: Record<string, unknown>, b: Record<string, unknown>) => page([panel("p1", { figures: [prince, swallow], ...a }), panel("p2", { figures: [prince, swallow], ...b })]);

  it("flags the second of two panels with the same shot, angle, place and figures in the same poses", () => {
    const issues = sameShotTwiceIssues(two({}, {}));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "SAME_SHOT_TWICE", severity: "warning", path: "panel p2" });
    expect(issues[0].message).toContain("panel p1");
  });

  it("flags again for every further copy, and finds a copy that is not next to its twin", () => {
    const three = page([panel("p1", { figures: [prince] }), panel("p2", { shot: "close", figures: [swallow] }), panel("p3", { figures: [prince] }), panel("p4", { figures: [prince] })]);
    expect(sameShotTwiceIssues(three).map((i) => i.path)).toEqual(["panel p3", "panel p4"]);
  });

  it("is silent when the shot, the angle, the place, the time, a pose or the cast differs", () => {
    expect(sameShotTwiceIssues(two({}, { shot: "close" }))).toEqual([]);
    expect(sameShotTwiceIssues(two({}, { angle: "low" }))).toEqual([]);
    expect(sameShotTwiceIssues(two({}, { location: "river" }))).toEqual([]);
    expect(sameShotTwiceIssues(two({}, { time: "night" }))).toEqual([]);
    expect(sameShotTwiceIssues(two({}, { figures: [prince, { ...swallow, pose: "fly" }] }))).toEqual([]);
    expect(sameShotTwiceIssues(two({}, { figures: [prince] }))).toEqual([]);
  });

  it("treats the other expression or slot as the same picture at the standard level, and as another at the strict level", () => {
    const other = { figures: [prince, { ...swallow, expression: "happy", slot: "left" }] };
    expect(sameShotTwiceIssues(two({}, other), { level: "standard" })).toHaveLength(1);
    expect(sameShotTwiceIssues(two({}, other), { level: "strict" })).toEqual([]);
    expect(sameShotTwiceIssues(two({}, { figures: [prince, { ...swallow, pose: "fly" }] }), { level: "loose" })).toHaveLength(1);
  });

  it("compares inserts by their props", () => {
    const insert = (id: string, prop: string) => panel(id, { shot: "insert", props: [{ prop, slot: "center" }] });
    expect(sameShotTwiceIssues(page([insert("p1", "gem"), insert("p2", "gem")]))).toHaveLength(1);
    expect(sameShotTwiceIssues(page([insert("p1", "gem"), insert("p2", "coin")]))).toEqual([]);
  });

  it("does not change a page's class: a plain warning that is part of repairOnceIssues", () => {
    expect(isRepairOnce({ code: "SAME_SHOT_TWICE", severity: "warning", path: "panel p2", message: "m" })).toBe(false);
    const issues = repairOnceIssues(two({}, {}), { claims: [], cast, locations, page: { page_number: 1, section_id: "s1", beat: "", claims: [], cast: [], locations: [], units: [], page_turn_hook: false } as PlannedPage, units: [{ text: "x" }], first_appearances: [] });
    expect(issues.map((i) => i.code)).toContain("SAME_SHOT_TWICE");
  });

  it("builds the signature from the picture only", () => {
    const a = panel("p1", { figures: [prince, swallow] }) as never;
    const b = panel("p9", { beat: "another beat", figures: [swallow, prince], text: [text("caption", "x")] }) as never;
    expect(shotSignature(a, "standard")).toBe(shotSignature(b, "standard"));
  });
});

describe("QUOTE_CLIPPED (v0.2, a warning)", () => {
  /** A source sentence of 4 quoted words and `tail` more words; the quote repeats the first 4. */
  const sourceWith = (tail: number) => [{ text: `“Alpha bravo charlie delta ${Array.from({ length: tail }, (_, i) => `tail${String.fromCharCode(97 + i)}`).join(" ")}.” said the Mayor.` }];
  const quote = (body: string, extra: Record<string, unknown> = {}) => page([panel("p1", { text: [text("speech", body, { speaker: "prince", fidelity: "quote", ...extra })] })]);

  const units = [{ text: "“He is as beautiful as a weathercock, only not quite so useful,” said one of the Town Councillors." }];

  it("flags a quote that stops before the end of its source sentence, and shows what was left out", () => {
    const clipped = quoteClippedIssues(quote("He is as beautiful as a weathercock"), { units });
    expect(clipped).toHaveLength(1);
    expect(clipped[0]).toMatchObject({ code: "QUOTE_CLIPPED", severity: "warning", path: "panel p1 text 0" });
    expect(clipped[0].message).toContain("only not quite so useful");
  });

  it("is silent when the quote reaches the end of the sentence or of the quoted span", () => {
    expect(quoteClippedIssues(quote("He is as beautiful as a weathercock, only not quite so useful"), { units })).toEqual([]);
    expect(quoteClippedIssues(quote("As beautiful as a weathercock... only not quite so useful"), { units })).toEqual([]);
    expect(quoteClippedIssues(quote("Only not quite so useful"), { units })).toEqual([]);
  });

  it("flags a tail from the minimum to the maximum length and nothing outside it (the threshold edge)", () => {
    const flagged = (tail: number) => quoteClippedIssues(quote("Alpha bravo charlie delta"), { units: sourceWith(tail) }).length;
    expect(flagged(QUOTE_CLIP_MIN_TAIL - 1)).toBe(0);
    expect(flagged(QUOTE_CLIP_MIN_TAIL)).toBe(1);
    expect(flagged(QUOTE_CLIP_MAX_TAIL)).toBe(1);
    expect(flagged(QUOTE_CLIP_MAX_TAIL + 1)).toBe(0);
  });

  it("checks only lines labelled quote, and only when the quote is found once in the source", () => {
    const units = sourceWith(3);
    expect(quoteClippedIssues(quote("Alpha bravo charlie delta", { fidelity: "paraphrase" }), { units })).toEqual([]);
    expect(quoteClippedIssues(quote("Alpha bravo charlie delta"), { units: [...units, ...units] })).toEqual([]);
    expect(quoteClippedIssues(quote("Alpha bravo charlie echo"), { units })).toEqual([]);
  });

  it("uses the last fragment of a line cut with an ellipsis", () => {
    const units = [{ text: "“Hello there my friend, alpha bravo charlie delta tail1 tail2 tail3.”" }];
    expect(quoteClippedIssues(quote("Hello there my friend... alpha bravo charlie delta"), { units })).toHaveLength(1);
    expect(quoteClippedIssues(quote("Hello there my friend... alpha bravo charlie delta tail1 tail2 tail3"), { units })).toEqual([]);
  });

  it("marks sentence ends and closing quotes in the source words", () => {
    const words = sourceWords([{ text: "“Yes,” said he. It is so! Next" }]);
    expect(words.map((w) => [w.norm, w.end])).toEqual([["yes", true], ["said", false], ["he", true], ["it", false], ["is", false], ["so", true], ["next", true]]);
  });
});
