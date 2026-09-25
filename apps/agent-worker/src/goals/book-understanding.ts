import { validateUnderstanding } from "@panelsummary/manga-render";
import type { BookUnderstanding } from "@panelsummary/manga-render";

import { parseBook, totalWords, unitIndex, type BookInput } from "./book-input.js";
import { candidateParameters, CANDIDATE_ARG, dataBlock, errorsOf, formatIssues, parseCandidate, rejection, sourceBlock, warningsOf } from "./common.js";
import { InputError, requireObject, type GoalDefinition } from "./types.js";
import { lookVocabulary } from "./vocabulary.js";

/** Books above this size need a chunked understanding pass (not implemented: fail visibly). */
const MAX_WORDS_SINGLE_PASS = 250_000;

interface Input {
  book: BookInput;
}

export const bookUnderstandingGoal: GoalDefinition<Input> = {
  type: "BOOK_UNDERSTANDING",
  skillName: "book-understanding",
  defaults: {
    model: "MiniMax-M3",
    thinking: "low",
    limits: { maxTurns: 8, maxToolCalls: 8, maxSubmits: 5, maxOutputTokens: 64_000, maxCostUsd: 1.5, timeoutMs: 15 * 60_000 },
  },
  parseInput(input) {
    const record = requireObject(input, "input");
    const book = parseBook(record.book);
    const words = totalWords(book);
    if (words > MAX_WORDS_SINGLE_PASS) {
      throw new InputError(`book has ${words} words; single-pass understanding supports up to ${MAX_WORDS_SINGLE_PASS}`);
    }
    return { book };
  },
  prepare({ book }) {
    const unitIds = book.units.map((unit) => unit.id);
    const submit = {
      name: "submit_understanding",
      description:
        "Submit the complete BookUnderstanding (schema book-understanding.v1) as one JSON string. Replies ACCEPTED or lists every error to fix.",
      parameters: candidateParameters,
      async execute(args: Record<string, unknown>) {
        const parsed = parseCandidate(args);
        if (!parsed.ok) return { text: `REJECTED: ${parsed.message}`, note: "parse_error" };
        const issues = validateUnderstanding(parsed.value, unitIds);
        if (errorsOf(issues).length > 0) {
          return { text: rejection(issues), note: `errors=${errorsOf(issues).length}` };
        }
        const warnings = warningsOf(issues);
        return {
          text: `ACCEPTED.${warnings.length ? `\nWarnings kept on record:\n${formatIssues(warnings, 20)}` : ""}`,
          accepted: parsed.value as never,
          note: `accepted warnings=${warnings.length}`,
        };
      },
    };
    const userPrompt = [
      "<goal>",
      `Read the whole book below and submit its BookUnderstanding with submit_understanding.`,
      `Title: ${book.title || "(unknown)"}; author: ${book.author || "(unknown)"}; ${book.page_count} PDF pages; ${totalWords(book)} words.`,
      "Use exactly these section ids and unit ids (source refs must use them, with a pdf page inside the unit's page range):",
      unitIndex(book),
      "</goal>",
      dataBlock("trusted_vocabulary", lookVocabulary()),
      sourceBlock(book.units),
    ].join("\n");
    return {
      skillName: "book-understanding",
      userPrompt,
      tools: [submit],
      submitTool: submit.name,
      limits: bookUnderstandingGoal.defaults.limits,
      allowImages: false,
      finalize: (accepted) => ({ understanding: accepted as unknown as BookUnderstanding } as never),
    };
  },
};

export { CANDIDATE_ARG };
