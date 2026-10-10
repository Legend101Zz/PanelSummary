// Pure logic for the status band: the four families and the shelf states.

export type BandFamily = "drawn" | "progress" | "needs" | "outline";

/** The tone names of lib/words.ts shelfStatus() map to the four families. */
export function familyForTone(tone: "pencil" | "ink" | "redpen" | "quiet"): BandFamily {
  switch (tone) {
    case "ink":
      return "drawn";
    case "pencil":
      return "progress";
    case "redpen":
      return "needs";
    default:
      return "outline";
  }
}

export interface BandSpec {
  family: BandFamily;
  text: string;
  /** progress family only: 0..1 fills the line, undefined = indeterminate */
  fraction?: number;
}

/** The 15 shelf states of SCREENS-AND-STATES section 4, with the example numbers of the design. */
export interface ShelfBandExample extends BandSpec {
  key: string;
}

export function shelfBandExamples(): ShelfBandExample[] {
  return [
    { key: "unreadable", family: "needs", text: "Couldn't read this PDF" },
    { key: "reading_pdf", family: "progress", text: "Reading the PDF" },
    { key: "not_drawn", family: "outline", text: "Not drawn yet" },
    { key: "queued", family: "progress", text: "Starting" },
    { key: "reading_book", family: "progress", text: "Reading the book" },
    { key: "planning", family: "progress", text: "Planning pages" },
    { key: "drawing", family: "progress", text: "6 of 16 pages drawn", fraction: 6 / 16 },
    { key: "complete", family: "drawn", text: "18 manga pages" },
    { key: "complete_one", family: "drawn", text: "1 manga page" },
    { key: "failures", family: "needs", text: "14 of 16 drawn, 2 missing" },
    { key: "stopped_some", family: "outline", text: "Stopped at 3 of 16 pages" },
    { key: "stopped_none", family: "outline", text: "Stopped before drawing" },
    { key: "limit", family: "needs", text: "MiniMax limit reached, 5 of 16 drawn" },
    { key: "limit_no_plan", family: "needs", text: "MiniMax limit reached" },
    { key: "key", family: "needs", text: "MiniMax refused the key, 13 of 16 drawn" },
    { key: "noanswer", family: "needs", text: "MiniMax not answering, 9 of 16 drawn" },
    { key: "error", family: "needs", text: "Drawing stopped" },
  ];
}

/** The fraction for a drawing band. */
export function drawnFraction(drawn: number, total: number): number | undefined {
  if (!(total > 0)) return undefined;
  return Math.min(1, Math.max(0, drawn / total));
}

/**
 * Splits "MiniMax limit reached, 5 of 16 drawn" into the words and the number group ("5 of 16 drawn").
 * The icon goes before the number group and the group never breaks, so the band fits two lines in 160 px.
 * Text with no number group after a comma is returned whole as the group (the icon leads it).
 */
export function splitNumberGroup(text: string): [string | null, string] {
  const i = text.lastIndexOf(", ");
  if (i > 0 && /\d/.test(text.slice(i + 2))) return [text.slice(0, i + 1), text.slice(i + 2)];
  return [null, text];
}
