import { describe, expect, it } from "vitest";
import type { EditionStatus, LibraryBook } from "../../lib/api";
import { drawingNowKind, drawingNowWords, isDrawingNow, pickCards } from "./drawingNowLogic";

const book = (id: string, status: EditionStatus | null, accepted = 0, total = 10, bookStatus: LibraryBook["status"] = "parsed"): LibraryBook =>
  ({ id, title: id, author: "", status: bookStatus, latest_edition: status ? { id: `e-${id}`, status, page_total: total, pages_accepted: accepted } : null }) as LibraryBook;

describe("drawing now", () => {
  it("knows active and stopped runs", () => {
    expect(drawingNowKind("drawing")).toBe("active");
    expect(drawingNowKind("queued")).toBe("active");
    expect(drawingNowKind("failed")).toBe("stopped");
    expect(drawingNowKind("cancelled")).toBe("stopped");
    expect(drawingNowKind("complete")).toBeNull();
    expect(drawingNowKind("awaiting_plan_review")).toBeNull();
    expect(drawingNowKind(null)).toBeNull();
  });
  it("shows a stopped run only while pages are missing", () => {
    expect(isDrawingNow(book("a", "failed", 4, 10))).toBe(true);
    expect(isDrawingNow(book("a", "failed", 10, 10))).toBe(false);
    expect(isDrawingNow(book("a", "failed", 0, 0))).toBe(false);
    expect(isDrawingNow(book("a", "drawing", 0, 0))).toBe(true);
    expect(isDrawingNow(book("a", "complete", 10, 10))).toBe(false);
    expect(isDrawingNow(book("a", "drawing", 1, 10, "failed"))).toBe(false);
  });
  it("shows two cards at most, active first, and counts the rest", () => {
    const runs = [book("s", "failed", 2), book("a1", "drawing"), book("a2", "planning"), book("a3", "queued")].map((b) => ({ book: b }));
    const { shown, more } = pickCards(runs);
    expect(shown.map((r) => r.book.id)).toEqual(["a1", "a2"]);
    expect(more).toBe(2);
    expect(pickCards(runs.slice(0, 1))).toEqual({ shown: runs.slice(0, 1), more: 0 });
  });
});

describe("drawing now words", () => {
  it("says Drawing now only for an active run", () => {
    expect(drawingNowWords("drawing", 6, 16, null, "6 of 16 drawn")).toEqual({ eyebrow: "Drawing now", line: "6 of 16 drawn" });
  });
  it("says Stopped by you, and how far it got, for a run the viewer stopped", () => {
    expect(drawingNowWords("cancelled", 3, 16, null, "")).toEqual({ eyebrow: "Stopped by you", line: "Stopped at 3 of 16 pages." });
    expect(drawingNowWords("cancelled", 0, 0, null, "")).toEqual({ eyebrow: "Stopped by you", line: "Stopped before drawing." });
  });
  it("says Stopped with a problem, and the reason, for a run that failed", () => {
    expect(drawingNowWords("failed", 5, 16, "PROVIDER_LIMIT", "")).toEqual({ eyebrow: "Stopped with a problem", line: "MiniMax limit reached. 5 of 16 pages drawn." });
    expect(drawingNowWords("failed", 0, 0, null, "").line).toBe("Nothing was drawn.");
  });
  it("never says a stopped run is drawing", () => {
    for (const status of ["cancelled", "failed"] as const) {
      const w = drawingNowWords(status, 2, 10, "PROVIDER_AUTH", "");
      expect(w.eyebrow).not.toMatch(/drawing now/i);
      expect(w.eyebrow).not.toMatch(/^drawing/i);
    }
  });
});
