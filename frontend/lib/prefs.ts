/** Per-viewer preferences kept in this browser (localStorage). They are never sent to the server, except as request flags. */
const REVIEW_PLAN_KEY = "ps-review-plan";

/** True when this viewer wants to check the plan before drawing (decision D24). Null when the viewer never chose: use the server default from GET /status. */
export function readReviewPlan(): boolean | null {
  try {
    const v = window.localStorage.getItem(REVIEW_PLAN_KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

export function writeReviewPlan(on: boolean): void {
  try {
    window.localStorage.setItem(REVIEW_PLAN_KEY, on ? "1" : "0");
  } catch {
    // Storage is blocked: the choice lasts for this page only.
  }
}
