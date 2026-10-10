import { describe, expect, it } from "vitest";
import { detailText } from "./api";
import { DRAWING_AGAIN, UNKNOWN_PAGE_REASON, stoppedLine, stoppedNote, bookFacts, failedStageLine, moneyRange, plainReason, providerStopHeadline, providerStopLines, scopeLabel, shelfStatus, stageLine } from "./words";
import { FALLBACK_LIMITS, addBookLede, limitItems, limitsSentence, limitsSettingsLine, notPdfText, readSummary, sampleEstimateSentence, sampleLandingSentence, sampleRealSentence, sampleRunFacts, tooLargeText, withNextStep } from "./words";

describe("words", () => {
  it("shows completed_with_failures in the red tone", () => {
    const b: any = { status: "parsed", latest_edition: { status: "completed_with_failures", page_total: 16, pages_accepted: 15 } };
    const s = shelfStatus(b);
    expect(s.tone).toBe("redpen");
    expect(s.text).toContain("1 missing");
  });
  it("says on the shelf that MiniMax stopped the drawing", () => {
    const b: any = { status: "parsed", latest_edition: { status: "failed", page_total: 22, pages_accepted: 5, provider_stop: { code: "PROVIDER_LIMIT" } } };
    expect(shelfStatus(b).text).toBe("MiniMax limit reached, 5 of 22 drawn");
    b.latest_edition.provider_stop = null;
    expect(shelfStatus(b).text).toBe("Drawing stopped");
  });
  it("drops the page count when no page is planned", () => {
    const b: any = { status: "parsed", latest_edition: { status: "failed", page_total: 0, pages_accepted: 0, provider_stop: { code: "PROVIDER_LIMIT" } } };
    expect(shelfStatus(b).text).toBe("MiniMax limit reached");
  });
  it("words the book-page headline for each stop code", () => {
    expect(providerStopHeadline("PROVIDER_LIMIT")).toBe("Drawing stopped: MiniMax usage limit reached");
    expect(providerStopHeadline("PROVIDER_AUTH")).toBe("Drawing stopped: MiniMax refused the key");
    expect(providerStopHeadline("PROVIDER_UNAVAILABLE")).toBe("Drawing stopped: MiniMax not answering");
  });
  it("maps a token limit to a plain sentence", () => {
    expect(plainReason("token limit hit").plain).toMatch(/ran out of room/);
  });
  it("never shows an unknown raw text as the plain reason", () => {
    const r = plainReason("replay: page 7 is set to fail (FAIL_PAGES), call 2 of 2");
    expect(r.plain).toBe(UNKNOWN_PAGE_REASON);
    expect(r.detail).toBe("replay: page 7 is set to fail (FAIL_PAGES), call 2 of 2");
    expect(plainReason("odd text", "The model could not finish drawing the pages.").plain).toBe("The model could not finish drawing the pages.");
  });
  it("words a stopped run and a run that starts again", () => {
    expect(stoppedLine(3, 16)).toBe("Stopped at 3 of 16 pages");
    expect(stoppedLine(0, 16)).toBe("Stopped before drawing");
    expect(stoppedNote(3, 16)).toBe("The pages already drawn stay. Resume drawing draws the other 13.");
    expect(stoppedNote(1, 2)).toBe("The page already drawn stays. Resume drawing draws the other 1.");
    expect(DRAWING_AGAIN).toBe("Drawing is starting again");
  });
  it("does not match 429 inside a longer number", () => {
    expect(plainReason("page 14290 broke").plain).not.toMatch(/busy/);
    expect(plainReason("HTTP 429").plain).toMatch(/busy/);
  });
  it("says manga pages on the cover band for a complete edition", () => {
    const b: any = { status: "parsed", latest_edition: { status: "complete", page_total: 18, pages_accepted: 18 } };
    expect(shelfStatus(b).text).toBe("18 manga pages");
  });
  it("words an edition that waits for a plan review, on the shelf and in the stage line", () => {
    const b: any = { status: "parsed", latest_edition: { status: "awaiting_plan_review", page_total: 16, pages_accepted: 0 } };
    expect(shelfStatus(b)).toEqual({ text: "Plan ready to review", tone: "quiet" });
    expect(stageLine("awaiting_plan_review", [], 16)).toBe("The plan is ready: 16 pages");
    expect(stageLine("awaiting_plan_review", [], 1)).toBe("The plan is ready: 1 page");
  });
  it("marks the PDF page count in the meta line", () => {
    const b: any = { page_count: 22, section_count: 4, word_count: 4775 };
    expect(bookFacts(b)).toBe("PDF: 22 pages, 4 sections, 4,775 words");
  });
  it("formats money", () => {
    expect(moneyRange({ low: 0.6, high: 1.1 })).toBe("$0.60 to $1.10");
  });
  it("joins message and blocking reasons with punctuation", () => {
    expect(detailText({ message: "Book too long", blocking_reasons: ["Too many words (50,000)."] })).toBe("Book too long. Too many words (50,000).");
  });
  it("words the plain reason of a page that failed every check", () => {
    expect(plainReason("rejected on every submit (max_submits)").plain).toBe("Each version of this page that the model wrote failed the page checks.");
  });
  it("says 'Drawn, n key points left out' when every page is drawn (G-O1)", () => {
    const pages: any[] = [{ page_number: 1, status: "accepted" }, { page_number: 2, status: "accepted" }];
    expect(stageLine("completed_with_failures", pages, 2, { keyPointsLeftOut: 2 })).toBe("Drawn, 2 key points left out");
    expect(stageLine("completed_with_failures", pages, 2, { keyPointsLeftOut: 1 })).toBe("Drawn, 1 key point left out");
    expect(stageLine("completed_with_failures", [{ page_number: 1, status: "failed" }, ...pages] as any, 3)).toBe("Finished, but 1 page is missing");
  });
  it("names the stage of a run that stopped with an error", () => {
    expect(failedStageLine("reading")).toBe("Stopped with an error while reading the book");
    expect(failedStageLine("planning")).toBe("Stopped with an error while planning the pages");
    expect(failedStageLine("drawing")).toBe("Stopped with an error while drawing the pages");
  });
  it("tells the next step of the three MiniMax stops", () => {
    const limit = providerStopLines({ code: "PROVIDER_LIMIT", type: "rate_limit_error", message: "Token Plan usage limit reached" }, 11);
    expect(limit.plain).toContain("11 pages were not tried yet");
    expect(limit.detail).toBe("rate_limit_error: Token Plan usage limit reached");
    expect(providerStopLines({ code: "PROVIDER_AUTH" }).next).toBe("Check the MiniMax key on the PanelSummary server (MINIMAX_API_KEY) and your MiniMax plan. Then press Resume drawing.");
    expect(providerStopLines({ code: "PROVIDER_UNAVAILABLE" }).next).toBe("Wait a few minutes. Then press Resume drawing.");
  });
  it("labels what a run draws", () => {
    expect(scopeLabel(null, 5)).toBeNull();
    expect(scopeLabel({ section_ids: ["s1"] }, 5)).toBe("Drawing 1 of 5 sections");
    expect(scopeLabel({ pdf_page_from: 3, pdf_page_to: 40 }, 5)).toBe("PDF pages 3\u201340");
  });
});

describe("U1 copy", () => {
  it("shows every limit before the upload (#49)", () => {
    expect(limitItems(FALLBACK_LIMITS)).toEqual(["Selectable text, not a scan", "In English", "Up to 60 MB", "Up to 75 PDF pages", "Up to 17,500 words"]);
    expect(limitsSentence(FALLBACK_LIMITS)).toBe("A PDF with selectable text, in English, up to 60 MB, 75 PDF pages and 17,500 words.");
    expect(limitItems({ max_pdf_size_mb: 10, max_pdf_pages: 5, max_source_words: 1000 })[2]).toBe("Up to 10 MB");
  });
  it("says sections, not chapters, on Add a book", () => {
    expect(addBookLede(60)).toBe("Choose a PDF with selectable text, up to 60 MB. It is uploaded to your PanelSummary server, which reads its text and finds its sections.");
  });
  it("words the upload errors with a next step", () => {
    expect(notPdfText("notes.txt")).toBe("notes.txt is not a PDF. Choose a .pdf file.");
    expect(tooLargeText("big.pdf", 72 * 1048576, 60)).toBe("big.pdf is 72 MB. The limit is 60 MB.");
    expect(withNextStep("The PDF has no extractable text.")).toBe("The PDF has no extractable text. Use a PDF with selectable text.");
    expect(withNextStep("The PDF has no extractable body text")).toBe("The PDF has no extractable body text. Use a PDF with selectable text.");
    expect(withNextStep("FileDataError: Failed to open stream")).toBe("The PDF could not be read. The file may be damaged. Choose another PDF.");
    expect(withNextStep("That file is not a PDF")).toBe("The PDF could not be read. The file may be damaged. Choose another PDF.");
  });
  it("turns the parse message into plain words", () => {
    expect(readSummary("Parsed 22 pages into 4 sections and 10 source units")).toBe("Read 22 PDF pages and found 4 sections.");
    expect(readSummary("Parsed 1 page into 1 section and 2 source units")).toBe("Read 1 PDF page and found 1 section.");
    expect(readSummary("Something else")).toBe("Something else");
  });
  it("writes the sample run from real fields, with the first page of any number when page_1_at is absent", () => {
    const edition = {
      page_total: 18,
      pages_accepted: 18,
      created_at: "2026-10-09T10:07:38.810000+00:00",
      finished_at: "2026-10-09T10:14:46.695000+00:00",
      active_seconds: null,
      totals: { cost_usd: 0.460227 },
      timings: { generate_started_at: "2026-10-09T10:07:39.478000+00:00", first_page_at: "2026-10-09T10:11:26.164000+00:00" },
    };
    const pre: any = { estimated_manga_pages: { low: 11, high: 18 }, estimated_minutes: { first_page: { low: 2, high: 31 }, total: { low: 5, high: 58 } }, estimated_cost_usd: { low: 0.33, high: 0.75 } };
    const f = sampleRunFacts(edition, pre);
    expect(sampleEstimateSentence(f)).toBe("Before the run, the estimate was 11 to 18 manga pages, page 1 in 2 to 31 min, all pages in 5 to 58 min and $0.33 to $0.75.");
    expect(sampleRealSentence(f)).toBe("The real run made 18 pages: the first page drawn after 3 min 47 s, all pages after 7 min 08 s and an estimated $0.46 (not a bill).");
    const withPage1 = sampleRunFacts({ ...edition, timings: { ...edition.timings, page_1_at: "2026-10-09T10:11:37.478000+00:00" } }, null);
    expect(sampleRealSentence(withPage1)).toContain("page 1 after 3 min 58 s");
    expect(sampleEstimateSentence(withPage1)).toBeNull();
    expect(sampleLandingSentence("Four Tales", 4, 22, f)).toBe("Four Tales: 4 sections, 22 PDF pages, 18 manga pages, drawn in 7 min 08 s. The estimate before the run was 5 to 58 min.");
  });
  it("words the limits of Settings", () => {
    expect(limitsSettingsLine({ ...FALLBACK_LIMITS, page_attempts: 2, page_concurrency: 4 })).toBe("A book can be up to 60 MB, 75 PDF pages and 17,500 words. A page gets 2 tries, and 4 pages are drawn at the same time.");
  });
});
