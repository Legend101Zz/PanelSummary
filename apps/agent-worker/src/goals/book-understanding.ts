import { validateUnderstanding } from "@panelsummary/manga-render";
import type { BookUnderstanding, ValidationIssue } from "@panelsummary/manga-render";

import { parseBook, totalWords, unitIndex, type BookInput } from "./book-input.js";
import { candidateParameters, CANDIDATE_ARG, dataBlock, errorsOf, formatIssues, parseCandidate, rejection, sourceBlock, warningsOf } from "./common.js";
import { InputError, requireObject, type GoalDefinition } from "./types.js";
import { lookVocabulary } from "./vocabulary.js";

/**
 * Looks that contradict the character's own description. A statue (or carving,
 * effigy) of a person must be drawn as that person in stone/gold/bronze, never
 * as an object — seen live: the Happy Prince cast as a gold "rocket".
 */
export function lookSenseIssues(value: unknown, stickyStatues: Set<string> = new Set()): ValidationIssue[] {
  const cast = (value as { cast?: Array<{ id?: string; description?: string; role?: string; look?: { kind?: string; material?: string } }> })?.cast;
  if (!Array.isArray(cast)) return [];
  const issues: ValidationIssue[] = [];
  const sectionIds = new Set(((value as { sections?: Array<{ id?: string }> })?.sections ?? []).map((sec) => sec?.id));
  for (const member of cast) {
    const text = `${member?.description ?? ""} ${member?.role ?? ""}`.toLowerCase();
    const memberSections = (member as { sections?: unknown }).sections;
    if (!Array.isArray(memberSections) || memberSections.length === 0 || memberSections.some((id) => !sectionIds.has(id as string))) {
      issues.push({ code: "CAST_SECTIONS", severity: "error", path: `cast ${member?.id ?? "?"}`, message: `${member?.id} needs "sections": the ids of the sections it appears in (from: ${[...sectionIds].join(", ")}). Two different people with the same role in different stories must be two cast members.` });
    }
    const nameText = `${(member as { name?: string }).name ?? ""} ${text}`.toLowerCase();
    const statueWords = /\b(statue|effigy|carving|carved figure|monument|gilded|pedestal|on a (tall )?column|on its column|bronze figure|stone figure)\b/.test(nameText);
    const personWords = /\b(prince|king|queen|man|woman|boy|girl|knight|saint|hero|person|lady|lord|soldier|angel|his|her)\b/.test(nameText);
    // Once flagged in this session, the rule sticks to the id: rewording the
    // description does not make a statue of a person into an object.
    const personStatue = (statueWords && personWords) || stickyStatues.has(member?.id ?? "");
    const look = member?.look as { kind?: string; height?: string } | undefined;
    if (look?.kind === "crowd" && /\b(duckling|ducks?|birds?|sheep|cattle|cows?|geese|goose|hens?|chickens?|dogs?|cats?|mice|rats?|frogs?|fish|insects?|bees?|flowers?|trees?)\b/.test(text)) {
      issues.push({ code: "CROWD_NOT_PEOPLE", severity: "error", path: `cast ${member?.id ?? "?"}`, message: `${member?.id} is a group of animals or plants, but "crowd" draws people. Use one "bird"/"animal"/"plant" cast member for the group instead.` });
    }
    if (look?.kind === "human" && /\bgiant\b/.test(text) && look.height !== "giant") {
      issues.push({ code: "GIANT_NOT_GIANT", severity: "error", path: `cast ${member?.id ?? "?"}`, message: `${member?.id} is described as a giant: set "height": "giant" so pages show it.` });
    }
    if (!personStatue) continue;
    if (member?.id) stickyStatues.add(member.id);
    if (member?.look?.kind !== "human" || !["gold", "stone", "bronze"].includes(member.look.material ?? "")) {
      issues.push({
        code: "STATUE_NOT_HUMAN",
        severity: "error",
        path: `cast ${member?.id ?? "?"}`,
        message: `${member?.id} is described as a statue of a person: give it a "human" look (age, build, outfit, headwear as the statue shows them) with "material": "gold", "stone" or "bronze" — not an object. Rewording its description does not change this.`,
      });
    }
  }
  return issues;
}

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
    limits: { maxTurns: 10, maxToolCalls: 10, maxSubmits: 3, maxOutputTokens: 64_000, maxCostUsd: 1.5, timeoutMs: 18 * 60_000 },
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
    // The last complete candidate: revise_understanding patches it instead of
    // making the model re-emit a 40-100k-token JSON for a few fixes.
    let current: Record<string, unknown> | undefined;
    const stickyStatues = new Set<string>();
    const judge = (value: unknown) => {
      const issues = [...validateUnderstanding(value, unitIds), ...lookSenseIssues(value, stickyStatues)];
      if (errorsOf(issues).length > 0) {
        return {
          text: `${rejection(issues)}\nTo fix a few entries, call revise_understanding with only the changed entries instead of resending everything.`,
          note: `errors=${errorsOf(issues).length} ${[...new Set(errorsOf(issues).map((i) => i.code))].slice(0, 5).join(",")}`,
        };
      }
      const warnings = warningsOf(issues);
      return {
        text: `ACCEPTED.${warnings.length ? `\nWarnings kept on record:\n${formatIssues(warnings, 20)}` : ""}`,
        accepted: value as never,
        note: `accepted warnings=${warnings.length}`,
      };
    };
    const submit = {
      name: "submit_understanding",
      description:
        "Submit the complete BookUnderstanding (schema book-understanding.v1) as one JSON string. Replies ACCEPTED or lists every error to fix.",
      parameters: candidateParameters,
      async execute(args: Record<string, unknown>) {
        const parsed = parseCandidate(args);
        if (!parsed.ok) return { text: `REJECTED: ${parsed.message}`, note: "parse_error" };
        if (parsed.value && typeof parsed.value === "object") current = parsed.value as Record<string, unknown>;
        return judge(parsed.value);
      },
    };
    const revise = {
      name: "revise_understanding",
      description:
        'Fix the last submitted BookUnderstanding without resending it: a JSON string {"cast": [...], "locations": [...], "claims": [...], "sections": [...], "remove": {"cast": [ids], "locations": [ids], "claims": [ids]}, "logline": "...", "themes": [...]}. Entries are upserted by id (a full replacement of that entry). Replies ACCEPTED or lists every remaining error.',
      parameters: candidateParameters,
      async execute(args: Record<string, unknown>) {
        if (!current) return { text: "REJECTED: submit the complete understanding with submit_understanding first.", note: "no_base" };
        const parsed = parseCandidate(args);
        if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") return { text: `REJECTED: ${parsed.ok ? "the patch must be a JSON object" : parsed.message}`, note: "parse_error" };
        const patch = parsed.value as Record<string, unknown>;
        const merged: Record<string, unknown> = { ...current };
        for (const key of ["cast", "locations", "claims", "sections"] as const) {
          const base = Array.isArray(merged[key]) ? [...(merged[key] as Array<{ id?: string }>)] : [];
          const removals = new Set(((patch.remove as Record<string, string[]> | undefined)?.[key] ?? []) as string[]);
          const kept = base.filter((entry) => !removals.has(entry?.id ?? ""));
          for (const entry of Array.isArray(patch[key]) ? (patch[key] as Array<{ id?: string }>) : []) {
            const at = kept.findIndex((existing) => existing?.id === entry?.id);
            if (at >= 0) kept[at] = entry;
            else kept.push(entry);
          }
          merged[key] = kept;
        }
        for (const key of ["logline", "themes", "title", "author", "kind"] as const) {
          if (patch[key] !== undefined) merged[key] = patch[key];
        }
        current = merged;
        return judge(merged);
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
      tools: [submit, revise],
      submitTool: submit.name,
      limits: bookUnderstandingGoal.defaults.limits,
      allowImages: false,
      finalize: (accepted) => ({ understanding: accepted as unknown as BookUnderstanding } as never),
    };
  },
};

export { CANDIDATE_ARG };
