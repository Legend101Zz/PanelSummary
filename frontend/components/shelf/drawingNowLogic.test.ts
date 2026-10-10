import { describe, expect, it } from "vitest";
import type { EditionStatus, LibraryBook } from "../../lib/api";
import { drawingNowKind, isDrawingNow, pickCards } from "./drawingNowLogic";

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
