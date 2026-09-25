/**
 * EXPERIMENT ARM (not a production goal): one session writes every page of a
 * section in a single pass. Used by scripts/experiment.ts to compare against
 * the per-page MANGA_PAGE goal. Same validators and renderer.
 */
import { catalog, renderPage, validatePage } from "@panelsummary/manga-render";
import type { AdaptationPlan, BookUnderstanding, MangaPageSpec, RenderResult, ValidationIssue } from "@panelsummary/manga-render";

import { candidateParameters, dataBlock, errorsOf, formatIssues, parseCandidate, rejection, sourceBlock, warningsOf } from "./common.js";
import { InputError, requireObject, type GoalDefinition } from "./types.js";
import { pageVocabulary } from "./vocabulary.js";

interface Input {
  understanding: BookUnderstanding;
  plan: AdaptationPlan;
  section_id: string;
  units: { id: string; page_start: number; page_end: number; text: string }[];
}

export const mangaSectionGoal: GoalDefinition<Input> = {
  type: "MANGA_PAGE",
  skillName: "manga-page",
  defaults: {
    model: "MiniMax-M3",
    thinking: "low",
    limits: { maxTurns: 12, maxToolCalls: 12, maxSubmits: 5, maxOutputTokens: 100_000, maxCostUsd: 2, timeoutMs: 25 * 60_000 },
  },
  parseInput(input) {
    const record = requireObject(input, "input");
    const understanding = record.understanding as BookUnderstanding;
    const plan = record.plan as AdaptationPlan;
    const sectionId = String(record.section_id ?? "");
    if (!plan?.pages?.some((p) => p.section_id === sectionId)) throw new InputError(`no planned pages for ${sectionId}`);
    return { understanding, plan, section_id: sectionId, units: record.units as Input["units"] };
  },
  prepare(input) {
    const pages = input.plan.pages.filter((p) => p.section_id === input.section_id);
    const book = { cast: input.understanding.cast, locations: input.understanding.locations };
    let accepted: { spec: MangaPageSpec; render: RenderResult }[] = [];
    const submit = {
      name: "submit_pages",
      description: 'Submit every page of the section as one JSON string: {"pages": [MangaPageSpec, ...]} in page order. Replies ACCEPTED or lists every error.',
      parameters: candidateParameters,
      async execute(args: Record<string, unknown>) {
        const parsed = parseCandidate(args);
        if (!parsed.ok) return { text: `REJECTED: ${parsed.message}` };
        const list = (parsed.value as { pages?: unknown[] })?.pages;
        if (!Array.isArray(list) || list.length !== pages.length) {
          return { text: `REJECTED: expected {"pages": [...]} with exactly ${pages.length} pages (${pages.map((p) => p.page_number).join(", ")}).` };
        }
        const all: ValidationIssue[] = [];
        const renders: { spec: MangaPageSpec; render: RenderResult }[] = [];
        list.forEach((candidate, i) => {
          const planned = pages[i];
          const structural = validatePage(candidate, book, planned).map((issue) => ({ ...issue, path: `page ${planned.page_number} ${issue.path}` }));
          all.push(...structural);
          if (errorsOf(structural).length === 0) {
            const render = renderPage(candidate as MangaPageSpec, book, { idPrefix: `pg${planned.page_number}-` });
            all.push(...render.issues.map((issue) => ({ ...issue, path: `page ${planned.page_number} ${issue.path}` })));
            renders.push({ spec: candidate as MangaPageSpec, render });
          }
        });
        if (errorsOf(all).length > 0) return { text: rejection(all), note: `errors=${errorsOf(all).length}` };
        accepted = renders;
        const warnings = warningsOf(all);
        return { text: `ACCEPTED.${warnings.length ? `\n${formatIssues(warnings, 20)}` : ""}`, accepted: list as never, note: `accepted warnings=${warnings.length}` };
      },
    };
    const vocab = catalog();
    const claims = input.understanding.claims.filter((c) => pages.some((p) => p.claims.includes(c.id)));
    const userPrompt = [
      "<goal>",
      `Write and stage ALL ${pages.length} pages of section ${input.section_id} in one submission with submit_pages.`,
      "Each page follows the manga-page skill exactly (schema manga-page.v1). The planned pages:",
      JSON.stringify(pages),
      "</goal>",
      dataBlock("trusted_templates", vocab.templates),
      dataBlock("trusted_vocabulary", { ...pageVocabulary(), poses_by_kind: vocab.posesByKind, expressions_by_kind: vocab.expressionsByKind }),
      dataBlock("cast", input.understanding.cast),
      dataBlock("locations", input.understanding.locations),
      dataBlock("claims_for_this_section", claims),
      sourceBlock(input.units),
    ].join("\n");
    return {
      skillName: "manga-page",
      userPrompt,
      tools: [submit],
      submitTool: submit.name,
      limits: mangaSectionGoal.defaults.limits,
      allowImages: false,
      finalize: () => ({ pages: accepted } as never),
    };
  },
};
