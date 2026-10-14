import type { EditionDetail, EditionStatus, LibraryBook } from "../../lib/api";
import { plural, providerStopShort, stoppedLine } from "../../lib/words";

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

/**
 * The words of the card. Only an active run says "Drawing now". A run the viewer stopped says "Stopped by you" and how far it got;
 * a run that ended with a problem says "Stopped with a problem" and the reason (#89). A stopped run never says it is drawing.
 */
export function drawingNowWords(
  status: EditionStatus | undefined | null,
  accepted: number,
  total: number,
  providerStopCode: string | null | undefined,
  activeLine: string,
): { eyebrow: string; line: string } {
  const kind = drawingNowKind(status);
  if (kind === "active") return { eyebrow: "Drawing now", line: activeLine };
  if (status === "cancelled") return { eyebrow: "Stopped by you", line: `${stoppedLine(accepted, total)}.` };
  const why = providerStopCode ? `${providerStopShort(providerStopCode)}. ` : "";
  return { eyebrow: "Stopped with a problem", line: `${why}${total ? `${accepted} of ${plural(total, "page")} drawn.` : "Nothing was drawn."}` };
}
