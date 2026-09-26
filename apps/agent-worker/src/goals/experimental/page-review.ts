/**
 * PAGE_REVIEW: an editor pass over an already accepted page. M3 looks at the
 * rendered page (vision, through preview_page) and either approves it or
 * submits a revised spec through the same validator + renderer as MANGA_PAGE.
 */
import type { MangaPageSpec } from "@panelsummary/manga-render";

import { dataBlock } from "../common.js";
import { mangaPageGoal } from "../manga-page.js";
import { InputError, requireObject, type GoalDefinition } from "../types.js";

type PageInput = ReturnType<typeof mangaPageGoal.parseInput>;
interface Input {
  page: PageInput;
  spec: MangaPageSpec;
}

export const pageReviewGoal: GoalDefinition<Input> = {
  type: "PAGE_REVIEW",
  skillName: "manga-page-review",
  defaults: {
    model: "MiniMax-M3",
    thinking: "low",
    limits: { maxTurns: 12, maxToolCalls: 12, maxSubmits: 4, maxOutputTokens: 32_000, maxCostUsd: 0.6, timeoutMs: 10 * 60_000 },
  },
  parseInput(input) {
    const record = requireObject(input, "input");
    const spec = requireObject(record.spec, "spec") as unknown as MangaPageSpec;
    if (!Array.isArray(spec.panels)) throw new InputError("spec.panels missing");
    return { page: mangaPageGoal.parseInput(input), spec };
  },
  prepare(input, options) {
    const base = mangaPageGoal.prepare(input.page, { ...options, vision: true });
    let approved: MangaPageSpec | undefined;
    const submitTool = base.tools.find((tool) => tool.name === "submit_page")!;
    const approve = {
      name: "approve_page",
      description: "Approve the current page unchanged (only if it already scores 4+ on every rubric line). Give a one-paragraph reason.",
      parameters: submitTool.parameters,
      async execute(args: Record<string, unknown>) {
        const result = await submitTool.execute({ candidate_json: JSON.stringify(input.spec) }, undefined);
        if (result.accepted === undefined) return { text: `Cannot approve: the current page no longer validates.\n${result.text}` };
        approved = input.spec;
        const reason = typeof args.candidate_json === "string" ? args.candidate_json.slice(0, 500) : "";
        return { text: "ACCEPTED (approved unchanged).", accepted: input.spec as never, note: `approved ${reason.length}` };
      },
    };
    const userPrompt = [
      "<goal>",
      `Review page ${input.page.page.page_number} as the editor. First call preview_page with the CURRENT page JSON below to see it rendered.`,
      "Score it against the rubric in your skill. If any line scores below 4, fix the page (keep what works) and submit_page the complete revised JSON.",
      "If every line scores 4 or more, call approve_page with a short reason in candidate_json.",
      "</goal>",
      dataBlock("current_page_json", input.spec),
      base.userPrompt,
    ].join("\n");
    return {
      ...base,
      skillName: "manga-page-review",
      userPrompt,
      tools: [...base.tools, approve],
      allowImages: true,
      submitTool: "submit_page",
      finalize: (accepted) => (approved ? { ...(base.finalize(accepted) as object), approved: true } : { ...(base.finalize(accepted) as object), approved: false }) as never,
    };
  },
};
