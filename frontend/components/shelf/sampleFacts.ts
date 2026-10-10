import type { SampleRunFacts } from "@/lib/words";

/**
 * The real numbers of the built-in Andersen sample (backend/samples/andersen: the v0.1 final-journey run).
 * This is only the fallback while GET /samples/andersen/preview loads or fails. The screens read the preview, which holds
 * the same numbers. Opening a screen never installs the sample (an installed sample would end the empty shelf). Measured from the installed sample on 2026-10-10: edition created 10:07:38.810,
 * generate started 10:07:39.478, first page 10:11:26.164, finished 10:14:46.695; cost 0.460227; preflight 11 to 18 pages,
 * 2 to 31 min to the first page, 5 to 58 min in all, $0.33 to $0.75.
 */
export const ANDERSEN_FACTS: SampleRunFacts = {
  pages: 18,
  firstPageSeconds: 226.686,
  firstIsPage1: false,
  totalSeconds: 427.885,
  costUsd: 0.460227,
  estimate: { pages: { low: 11, high: 18 }, firstPageMin: { low: 2, high: 31 }, totalMin: { low: 5, high: 58 }, costUsd: { low: 0.33, high: 0.75 } },
};
export const ANDERSEN_TITLE = "Four Tales by Hans Christian Andersen";
export const ANDERSEN_SAMPLE_ID = "andersen";
