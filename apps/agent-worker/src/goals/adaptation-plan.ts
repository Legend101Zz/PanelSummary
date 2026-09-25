import { validatePlan } from "@panelsummary/manga-render";
import type { AdaptationPlan, BookUnderstanding } from "@panelsummary/manga-render";

import { parseBook, totalWords, unitIndex, type BookInput } from "./book-input.js";
import { candidateParameters, dataBlock, errorsOf, formatIssues, parseCandidate, rejection, sourceBlock, warningsOf } from "./common.js";
import { InputError, requireObject, type GoalDefinition } from "./types.js";

interface Input {
  book: BookInput;
  understanding: BookUnderstanding;
  pages: { min: number; max: number; target: number };
}

/** Page budget from source length: about one page per 350-550 words, bounded. */
export function pageBudget(words: number, sections: number, coreClaims: number) {
  const target = Math.round(words / 400);
  const min = Math.max(sections * 2, Math.ceil(coreClaims / 3), Math.round(words / 650), 3);
  const max = Math.max(min + 2, Math.min(140, Math.round(words / 260)));
  return { min, max, target: Math.min(max, Math.max(min, target)) };
}

export const adaptationPlanGoal: GoalDefinition<Input> = {
  type: "ADAPTATION_PLAN",
  skillName: "adaptation-plan",
  defaults: {
    model: "MiniMax-M3",
    thinking: "off",
    limits: { maxTurns: 8, maxToolCalls: 8, maxSubmits: 5, maxOutputTokens: 64_000, maxCostUsd: 1.5, timeoutMs: 15 * 60_000 },
  },
  parseInput(input) {
    const record = requireObject(input, "input");
    const book = parseBook(record.book);
    const understanding = requireObject(record.understanding, "understanding") as unknown as BookUnderstanding;
    if (!Array.isArray(understanding.claims)) throw new InputError("understanding.claims missing");
    const core = understanding.claims.filter((claim) => claim.importance === "core").length;
    const pages = pageBudget(totalWords(book), book.sections.length, core);
    const override = record.pages as Partial<Input["pages"]> | undefined;
    return { book, understanding, pages: { ...pages, ...(override ?? {}) } };
  },
  prepare({ book, understanding, pages }) {
    const unitIds = book.units.map((unit) => unit.id);
    const submit = {
      name: "submit_plan",
      description:
        "Submit the complete AdaptationPlan (schema adaptation-plan.v1) as one JSON string. Replies ACCEPTED or lists every error to fix.",
      parameters: candidateParameters,
      async execute(args: Record<string, unknown>) {
        const parsed = parseCandidate(args);
        if (!parsed.ok) return { text: `REJECTED: ${parsed.message}`, note: "parse_error" };
        const issues = validatePlan(parsed.value, understanding, unitIds);
        const count = Array.isArray((parsed.value as AdaptationPlan)?.pages) ? (parsed.value as AdaptationPlan).pages.length : 0;
        if (count && (count < pages.min || count > pages.max)) {
          issues.push({
            code: "PAGE_COUNT_OUT_OF_RANGE",
            severity: "error",
            path: "pages",
            message: `plan has ${count} pages; it must have between ${pages.min} and ${pages.max} (target about ${pages.target}).`,
          });
        }
        if (errorsOf(issues).length > 0) return { text: rejection(issues), note: `errors=${errorsOf(issues).length}` };
        const warnings = warningsOf(issues);
        return {
          text: `ACCEPTED.${warnings.length ? `\nWarnings kept on record:\n${formatIssues(warnings, 20)}` : ""}`,
          accepted: parsed.value as never,
          note: `accepted pages=${count} warnings=${warnings.length}`,
        };
      },
    };
    const claims = understanding.claims.map((claim) => ({
      id: claim.id,
      section: claim.section_id,
      kind: claim.kind,
      importance: claim.importance,
      text: claim.text,
      units: claim.source.map((ref) => ref.unit),
    }));
    const userPrompt = [
      "<goal>",
      `Plan the manga adaptation of "${book.title}" page by page and submit it with submit_plan.`,
      `Page budget: between ${pages.min} and ${pages.max} pages; aim for about ${pages.target}. The book has ${totalWords(book)} words in ${book.sections.length} sections.`,
      "Sections and units (use these ids):",
      unitIndex(book),
      "</goal>",
      dataBlock("book_understanding_cast", understanding.cast.map((c) => ({ id: c.id, name: c.name, role: c.role }))),
      dataBlock("book_understanding_locations", understanding.locations.map((l) => ({ id: l.id, name: l.name }))),
      dataBlock("book_understanding_sections", understanding.sections),
      dataBlock("book_understanding_claims", claims),
      sourceBlock(book.units),
    ].join("\n");
    return {
      skillName: "adaptation-plan",
      userPrompt,
      tools: [submit],
      submitTool: submit.name,
      limits: adaptationPlanGoal.defaults.limits,
      allowImages: false,
      finalize: (accepted) => ({ plan: accepted, page_budget: pages } as never),
    };
  },
};
