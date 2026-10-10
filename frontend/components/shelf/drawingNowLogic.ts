import type { EditionDetail, EditionStatus, LibraryBook } from "../../lib/api";

export interface DrawingNowRun {
  book: LibraryBook;
  /** The edition with its page statuses. null until the first answer. */
  detail: EditionDetail | null;
}

const ACTIVE: readonly EditionStatus[] = ["queued", "understanding", "planning", "drawing"];

/** active: a run is going. stopped: it ended before every page was drawn (a provider stop, an error, a cancel) and can be resumed. */
export function drawingNowKind(status: EditionStatus | undefined | null): "active" | "stopped" | null {
  if (!status) return null;
  if (ACTIVE.includes(status)) return "active";
  if (status === "failed" || status === "cancelled") return "stopped";
  return null;
}

/** A stopped run is worth a card only when pages were planned and some are still missing. */
export function isDrawingNow(book: LibraryBook): boolean {
  const e = book.latest_edition;
  const kind = drawingNowKind(e?.status);
  if (!e || book.status !== "parsed" || !kind) return false;
  if (kind === "active") return true;
  return e.page_total > 0 && e.pages_accepted < e.page_total;
}

const MAX_CARDS = 2;

/** Active runs first, then stopped ones. At most two cards; the rest are counted ("and 1 more"). */
export function pickCards<T extends { book: LibraryBook }>(runs: T[]): { shown: T[]; more: number } {
  const rank = (r: T) => (drawingNowKind(r.book.latest_edition?.status) === "active" ? 0 : 1);
  const sorted = runs.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map((x) => x.r);
  return { shown: sorted.slice(0, MAX_CARDS), more: Math.max(0, sorted.length - MAX_CARDS) };
}
