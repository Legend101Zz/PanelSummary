import { describe, expect, it } from "vitest";
import {
  actionErrorText,
  checkRange,
  drawsLine,
  failedStage,
  firstPageSeconds,
  generateOffReason,
  groupBySection,
  limitState,
  mangaRanges,
  pageCounts,
  pagesSummary,
  queuedDrawKind,
  runningSeconds,
  scopeOf,
  tookSeconds,
  toggleSection,
  usageOf,
  WHOLE_BOOK,
} from "./bookLogic";

const pg = (n: number, status: string, section = "s1") => ({ page_number: n, section_id: section, status: status as never, attempts: 1, beat: `beat ${n}`, error: null });
const book = {
  sections: [
    { id: "s1", title: "The Happy Prince", page_start: 3, page_end: 16, word_count: 3471 },
    { id: "s2", title: "The Nightingale", page_start: 17, page_end: 26, word_count: 2323 },
    { id: "s3", title: "The Selfish Giant", page_start: 25, page_end: 30, word_count: 1000 },
  ],
  page_words: Array.from({ length: 30 }, () => 100),
  page_count: 30,
  word_count: 6794,
};

describe("times", () => {
  it("adds the earlier jobs to the current job", () => {
    const e = { created_at: "2026-10-10T10:00:00Z", active_seconds: 60, job: { created_at: "2026-10-10T10:00:00Z" } } as never;
    expect(runningSeconds(e, Date.parse("2026-10-10T10:01:00Z"))).toBe(120);
  });
  it("uses active_seconds for 'Took', and finished_at - created_at for a v0.1 run", () => {
    expect(tookSeconds({ created_at: "x", finished_at: null, active_seconds: 428, job: null })).toBe(428);
    expect(tookSeconds({ created_at: "2026-10-10T10:00:00Z", finished_at: "2026-10-10T10:07:08Z", active_seconds: null, job: null })).toBe(428);
  });
  it("uses page_1_at, and falls back to first_page_at", () => {
    const base = { created_at: "2026-10-10T10:00:00Z" };
    expect(firstPageSeconds({ ...base, timings: { page_1_at: "2026-10-10T10:03:58Z", first_page_at: "2026-10-10T10:03:47Z" } })).toEqual({ seconds: 238, exact: true });
    expect(firstPageSeconds({ ...base, timings: { first_page_at: "2026-10-10T10:03:47Z" } })).toEqual({ seconds: 227, exact: false });
    expect(firstPageSeconds({ ...base, timings: {} })).toBeNull();
  });
});

describe("pages", () => {
  const pages = [pg(1, "accepted"), pg(2, "accepted"), pg(3, "drawing"), pg(4, "pending"), pg(5, "pending"), pg(6, "failed")];
  it("counts pages, with waiting pages that have no row yet", () => {
    expect(pageCounts(pages, 8)).toEqual({ drawn: 2, failed: 1, drawing: 1, waiting: 4, total: 8 });
  });
  it("says a repeated state once", () => {
    expect(pagesSummary(pages, 6)).toBe("2 of 6 pages ready. Page 6 could not be drawn. Page 3 is drawing. Pages 4 and 5 are waiting.");
    expect(pagesSummary([pg(1, "accepted"), pg(2, "pending"), pg(3, "pending"), pg(4, "pending")], 4)).toBe("1 of 4 pages ready. Pages 2 to 4 are waiting.");
  });
  it("groups pages by section and finds manga ranges", () => {
    const p = [pg(1, "accepted", "s1"), pg(2, "accepted", "s1"), pg(3, "accepted", "s2")];
    expect(groupBySection(p).map((g) => g.pages.length)).toEqual([2, 1]);
    expect(mangaRanges(p).get("s1")).toEqual([1, 2]);
  });
});

describe("the stage of a failed run", () => {
  const base = { error: null, has_plan: false, page_total: 0, provider_stop: null, pages: [] };
  it("reads the stage from a provider stop, the error text, or what exists", () => {
    expect(failedStage({ ...base, provider_stop: { code: "PROVIDER_LIMIT", stage: "plan" } })).toBe("planning");
    expect(failedStage({ ...base, error: "understanding failed after 2 attempts" })).toBe("reading");
    expect(failedStage({ ...base, error: "plan failed after 2 attempts" })).toBe("planning");
    expect(failedStage({ ...base, has_plan: true, page_total: 8, error: "boom" })).toBe("drawing");
    expect(failedStage(base)).toBe("reading");
  });
});

describe("choose sections", () => {
  it("makes the scope of a choice", () => {
    expect(scopeOf(WHOLE_BOOK, 30)).toBeNull();
    expect(scopeOf({ mode: "sections", sectionIds: [], from: "", to: "" }, 30)).toBeUndefined();
    expect(scopeOf({ mode: "sections", sectionIds: ["s1"], from: "", to: "" }, 30)).toEqual({ section_ids: ["s1"] });
    expect(scopeOf({ mode: "range", sectionIds: [], from: "3", to: "40" }, 30)).toBeUndefined();
    expect(scopeOf({ mode: "range", sectionIds: [], from: "3", to: "20" }, 30)).toEqual({ pdf_page_from: 3, pdf_page_to: 20 });
  });
  it("checks a page range in words", () => {
    expect(checkRange("", "5", 30).hint).toMatch(/first and the last/);
    expect(checkRange("0", "5", 30).hint).toMatch(/pages 1 to 30/);
    expect(checkRange("9", "5", 30).hint).toMatch(/comes after/);
    expect(checkRange("3", "5", 30).ok).toBe(true);
  });
  it("counts words and PDF pages of a choice (a page shared by two sections counts once)", () => {
    expect(usageOf(book, null)).toEqual({ words: 6794, pages: 30, estimated: false });
    expect(usageOf(book, { section_ids: ["s2", "s3"] })).toEqual({ words: 3323, pages: 14, estimated: false });
    expect(usageOf(book, { pdf_page_from: 3, pdf_page_to: 12 })).toEqual({ words: 1000, pages: 10, estimated: true });
  });
  it("says how far over the limit a choice is", () => {
    const limits = { max_pdf_pages: 75, max_source_words: 17500 };
    expect(limitState({ words: 20000, pages: 80, estimated: false }, limits)).toEqual({ inside: false, overWords: 2500, overPages: 5 });
    expect(limitState({ words: 100, pages: 5, estimated: false }, limits).inside).toBe(true);
  });
  it("keeps sections in book order and words the line under the estimate", () => {
    expect(toggleSection(["s2"], "s1", book.sections)).toEqual(["s1", "s2"]);
    expect(toggleSection(["s1", "s2"], "s1", book.sections)).toEqual(["s2"]);
    expect(drawsLine(book, { section_ids: ["s1"] })).toBe("Draws 1 of 3 sections: The Happy Prince.");
    expect(drawsLine(book, { pdf_page_from: 3, pdf_page_to: 40 })).toBe("Draws PDF pages 3–40.");
  });
  it("never puts the hook words in the reason of an off Generate", () => {
    const r = generateOffReason({ bookStatus: "parsed", blocked: true, choiceIncomplete: false, overLimit: false });
    expect(r).not.toContain("Generate manga");
    expect(generateOffReason({ bookStatus: "parsed", blocked: false, choiceIncomplete: false, overLimit: false })).toBeNull();
    expect(generateOffReason({ bookStatus: "uploaded", blocked: false, choiceIncomplete: false, overLimit: false })).toBe("Available when the PDF is read.");
  });
});

describe("action errors", () => {
  it("says what failed, the reason, and the next step", () => {
    expect(actionErrorText("cancel", "The server answered 500", 500)).toBe("Drawing could not be stopped. The server answered 500. Try again in a moment.");
    expect(actionErrorText("resume", "", 0)).toBe("Drawing could not be resumed. Check that the server is running, then try again.");
    expect(actionErrorText("generate", "This selection has 20,000 words.", 422)).toMatch(/^Generate did not start\. This selection has 20,000 words\. Nothing was started and nothing was spent\./);
    expect(actionErrorText("generate", "Can't reach the PanelSummary server.", 0)).toBe("Generate did not start. Check that the server is running, then try again.");
    expect(actionErrorText("generate", "A run is not finished.", 409)).toContain("Nothing was started and nothing was spent.");
    expect(actionErrorText("redraw", "Nope", 409, 4)).toBe("Page 4 could not be drawn again. Nope. Try again in a moment.");
  });
});

describe("a queued run on an edition with a plan", () => {
  const q = (pages: ReturnType<typeof pg>[], timings?: { drawing_started_at?: string }, over: object = {}) => ({ status: "queued" as const, has_plan: true, pages, timings, ...over });
  it("is the first draw right after a plan review is approved (no page, drawing never began)", () => {
    expect(queuedDrawKind(q([]))).toBe("first");
    expect(queuedDrawKind(q([pg(1, "pending")]))).toBe("first");
  });
  it("is drawing again after a retry (failed page) or after a stop (accepted page, or drawing began)", () => {
    expect(queuedDrawKind(q([pg(1, "accepted"), pg(2, "failed")]))).toBe("again");
    expect(queuedDrawKind(q([pg(1, "accepted")]))).toBe("again");
    expect(queuedDrawKind(q([], { drawing_started_at: "2026-10-10T10:00:00Z" }))).toBe("again");
  });
  it("is neither without a plan or when not queued", () => {
    expect(queuedDrawKind(q([], undefined, { has_plan: false }))).toBeNull();
    expect(queuedDrawKind(q([], undefined, { status: "drawing" }))).toBeNull();
  });
});
