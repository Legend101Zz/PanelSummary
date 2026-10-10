// Pure logic for the step list.
export type StepState = "done" | "current" | "next";

/** Steps before the current one are done, after it are next. current = -1 means all done; steps.length means none started. */
export function stepStates(count: number, currentIndex: number): StepState[] {
  return Array.from({ length: count }, (_, i) => (i < currentIndex ? "done" : i === currentIndex ? "current" : "next"));
}

export const STEP_WORD: Record<StepState, string> = { done: "done", current: "now", next: "next" };
