import { drawnFraction, familyForTone } from "../ui/statusBandLogic";
import type { BandSpec } from "../ui/statusBandLogic";
import type { LibraryBook } from "../../lib/api";
import { plural, shelfStatus } from "../../lib/words";

/** The status band of a book tile: the words of shelfStatus(), the family of its tone, a fraction only while pages are drawn. */
export function bandForBook(book: LibraryBook): BandSpec {
  const e = book.latest_edition;
  // Every planned page is drawn but the run ended "with failures" (key points left out): no page is missing, so it is a drawn book.
  if (book.status === "parsed" && e?.status === "completed_with_failures" && e.page_total > 0 && e.pages_accepted >= e.page_total && !e.pages_failed) {
    return { family: "drawn", text: plural(e.page_total, "manga page") };
  }
  const s = shelfStatus(book);
  const family = familyForTone(s.tone);
  const fraction = family === "progress" && book.status === "parsed" && e?.status === "drawing" ? drawnFraction(e.pages_accepted, e.page_total) : undefined;
  return { family, text: s.text, fraction };
}
