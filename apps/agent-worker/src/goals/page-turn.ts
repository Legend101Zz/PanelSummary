/**
 * Page-turn checks of the plan (track W1 #82, then the Gate 1 fixes of track fxw).
 *
 * W1 measured on 320 judged pages of nine live runs that a page with `page_turn_hook` scored 3.49
 * on page turn and a page without one 3.18. It asked for a hook on every page that does not close a
 * section and added the warning PAGE_TURN_HOOK_MISSING. Gate 1 (v0.3, two-tale book, 22 pages)
 * measured the effect of that rule: hooks went from 10 to 18 of 22 pages, the page-turn mean fell
 * from 3.56 to 3.48, pages that gained a hook gained 0.07, and the next page repeated the hook line
 * on 3 of 12 adjacent pairs that share a unit (v0.2: 0 of 5). The W1 link was selection (the planner
 * put hooks where the book has one), not an effect of forcing them. So the warning is REMOVED: it
 * pushed a hook on every page and the measurement no longer supports it.
 *
 * What stays is a plan WARNING for two consecutive pages with the same beat text: both pages would
 * be written in parallel from the same text and draw the same picture.
 */
import type { AdaptationPlan, ValidationIssue } from "@panelsummary/manga-render";

/** A beat as a comparable string: lower case, one space between words, no end punctuation. */
function normalized(beat: unknown): string {
  return String(beat ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s.!?;:,]+$/g, "")
    .trim();
}

/** Page numbers N where page N and the page after it have the same beat text. */
export function repeatedBeatPages(plan: unknown): number[] {
  const pages = ((plan as AdaptationPlan | undefined)?.pages ?? []).filter((p) => p && typeof p === "object");
  const found: number[] = [];
  for (let i = 0; i + 1 < pages.length; i += 1) {
    const a = normalized(pages[i].beat);
    if (a !== "" && a === normalized(pages[i + 1].beat)) found.push(pages[i].page_number);
  }
  return found;
}

export function pageTurnHookIssues(plan: unknown): ValidationIssue[] {
  return repeatedBeatPages(plan).map((n) => ({
    code: "PLAN_BEAT_REPEATED",
    severity: "warning" as const,
    path: `plan.pages ${n}`,
    message: `pages ${n} and ${n + 1} have the same beat text. Pages are written in parallel and cannot see each other: give page ${n + 1} its own beat (the answer to the hook of page ${n}, or the next event), or merge the two pages.`,
  }));
}
