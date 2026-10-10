// Pure logic for the tone strip: segment states from page lists, and the words that say the same thing.

export type SegmentState = "drawn" | "drawing" | "waiting" | "failed";

/** The page status values of the API (lib/api.ts PageStatus), repeated here so this file has no imports. */
export type PageStatusLike = "pending" | "drawing" | "accepted" | "failed";

export function segmentFor(status: PageStatusLike | undefined): SegmentState {
  switch (status) {
    case "accepted":
      return "drawn";
    case "drawing":
      return "drawing";
    case "failed":
      return "failed";
    default:
      return "waiting";
  }
}

/** One segment per planned page, in page order. A page the list does not name is waiting. */
export function segmentsFromPages(pages: ReadonlyArray<{ page_number: number; status: PageStatusLike }>, total: number): SegmentState[] {
  const n = Math.max(0, Math.floor(total));
  const out: SegmentState[] = Array.from({ length: n }, () => "waiting");
  for (const p of pages) {
    const i = p.page_number - 1;
    if (i >= 0 && i < n) out[i] = segmentFor(p.status);
  }
  return out;
}

export interface SegmentCounts {
  drawn: number;
  drawing: number;
  waiting: number;
  failed: number;
  total: number;
}

export function countSegments(segments: readonly SegmentState[]): SegmentCounts {
  const c: SegmentCounts = { drawn: 0, drawing: 0, waiting: 0, failed: 0, total: segments.length };
  for (const s of segments) c[s] += 1;
  return c;
}

/** Page numbers (1-based) that have a state. */
export function pagesWith(segments: readonly SegmentState[], state: SegmentState): number[] {
  const out: number[] = [];
  segments.forEach((s, i) => {
    if (s === state) out.push(i + 1);
  });
  return out;
}

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "1, 2, 3 and 4" is written "1 to 4"; "12 and 19" stays a list; "28 and 29" stays a list. */
export function formatPageList(pages: readonly number[]): string {
  const runs: Array<[number, number]> = [];
  for (const p of pages) {
    const last = runs[runs.length - 1];
    if (last && p === last[1] + 1) last[1] = p;
    else runs.push([p, p]);
  }
  const words: string[] = [];
  for (const [a, b] of runs) {
    if (a === b) words.push(String(a));
    else if (b - a === 1) words.push(String(a), String(b));
    else words.push(`${a} to ${b}`);
  }
  return joinWords(words);
}

const pageWord = (pages: readonly number[]) => (pages.length === 1 ? "page" : "pages");

/** The text alternative of the strip. Lists the states that exist and no others. */
export function describeSegments(segments: readonly SegmentState[]): string {
  if (segments.length === 0) return "The number of pages is not known yet";
  const parts: string[] = [];
  const drawn = pagesWith(segments, "drawn");
  const drawing = pagesWith(segments, "drawing");
  const failed = pagesWith(segments, "failed");
  const waiting = pagesWith(segments, "waiting");
  // Few pages: name the pages. Many: say the count of drawn and waiting pages, and name the rest.
  if (segments.length <= 20) {
    if (drawn.length) parts.push(`${pageWord(drawn)} ${formatPageList(drawn)} drawn`);
    if (failed.length) parts.push(`${pageWord(failed)} ${formatPageList(failed)} could not be drawn`);
    if (drawing.length) parts.push(`${pageWord(drawing)} ${formatPageList(drawing)} drawing`);
    if (waiting.length) parts.push(`${pageWord(waiting)} ${formatPageList(waiting)} waiting`);
    return parts.length ? capital(parts.join(", ")) : "";
  }
  if (drawn.length) parts.push(`${drawn.length} ${pageWord(drawn)} drawn`);
  if (failed.length) parts.push(`${pageWord(failed)} ${formatPageList(failed)} could not be drawn`);
  if (drawing.length) parts.push(`${pageWord(drawing)} ${formatPageList(drawing)} drawing`);
  if (waiting.length) parts.push(`${waiting.length} waiting`);
  return parts.join(", ");
}

function capital(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

/** The line under the strip, in words. "25 pages drawn of 60, 2 could not be drawn. Drawing pages 28 to 31." */
export function summaryLine(segments: readonly SegmentState[]): string {
  const c = countSegments(segments);
  if (c.total === 0) return "Planning the pages. The number of pages is known when the plan is ready.";
  const first = `${c.drawn} ${c.drawn === 1 ? "page" : "pages"} drawn of ${c.total}`;
  const bits = [first];
  if (c.failed) bits[0] += `, ${c.failed} could not be drawn`;
  let line = `${bits[0]}.`;
  const drawing = pagesWith(segments, "drawing");
  if (drawing.length) line += ` Drawing ${pageWord(drawing)} ${formatPageList(drawing)}.`;
  return line;
}

/** Columns for a strip: one row up to 20 pages; rows of 20 on a phone and up to 40 on a wide card. */
export function stripColumns(total: number): { narrow: number; wide: number } {
  const n = Math.max(1, total);
  return { narrow: Math.min(n, 20), wide: Math.min(n, 40) };
}
