/**
 * Page-turn hooks in the plan (track W1, v0.3, issue #82).
 *
 * Measured on 320 judged pages of nine live runs (docs/v0.3/W1-writer.md): a page that is not
 * the last page of its section and has `page_turn_hook: true` has a judged page-turn mean of
 * 3.49; the same pages with no hook have 3.18 (bootstrap 95% interval of the difference: 0.23
 * to 0.40; the sign holds in 9 of 9 runs). What the last panel of the page holds (a question,
 * the last planned claim, a size) shows no link with the score, so no page check was added.
 *
 * PAGE_TURN_HOOK_MISSING is a plan WARNING. It fails the D26 rule (cost: it flags 38% of the
 * judged-good pages) and stays a warning. It is kept on the record of the plan receipt, so the
 * next live run measures it again.
 */
import type { AdaptationPlan, ValidationIssue } from "@panelsummary/manga-render";

/** Share of the non-final pages without a hook above which the warning is raised. Set from the measurement: 42% of such pages had no hook. */
export const HOOK_MISSING_SHARE = 0.25;

/** Pages that are not the last page of their section and have no `page_turn_hook`. */
export function pagesWithoutHook(plan: unknown): { missing: number[]; eligible: number } {
  const pages = ((plan as AdaptationPlan | undefined)?.pages ?? []).filter((p) => p && typeof p === "object");
  const lastOfSection = new Map<string, number>();
  for (const page of pages) lastOfSection.set(String(page.section_id), page.page_number);
  const eligible = pages.filter((p) => lastOfSection.get(String(p.section_id)) !== p.page_number);
  return { missing: eligible.filter((p) => p.page_turn_hook !== true).map((p) => p.page_number), eligible: eligible.length };
}

export function pageTurnHookIssues(plan: unknown): ValidationIssue[] {
  const { missing, eligible } = pagesWithoutHook(plan);
  if (eligible < 4 || missing.length / eligible <= HOOK_MISSING_SHARE) return [];
  const shown = missing.slice(0, 12).join(", ");
  return [
    {
      code: "PAGE_TURN_HOOK_MISSING",
      severity: "warning",
      path: "plan.pages",
      message: `${missing.length} of ${eligible} pages that do not close a section have no page_turn_hook (pages ${shown}${missing.length > 12 ? ", ..." : ""}). Judges gave such pages a lower page-turn score. Plan a question, a reveal held back or a change about to happen at the end of each of them, and start the next page with the answer.`,
    },
  ];
}
