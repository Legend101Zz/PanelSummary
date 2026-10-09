import { describe, expect, it } from "vitest";
import { detailText } from "./api";
import { bookFacts, moneyRange, plainReason, providerStopHeadline, shelfStatus } from "./words";

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
  it("does not match 429 inside a longer number", () => {
    expect(plainReason("page 14290 broke").plain).not.toMatch(/busy/);
    expect(plainReason("HTTP 429").plain).toMatch(/busy/);
  });
  it("says manga pages on the cover band for a complete edition", () => {
    const b: any = { status: "parsed", latest_edition: { status: "complete", page_total: 18, pages_accepted: 18 } };
    expect(shelfStatus(b).text).toBe("18 manga pages");
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
});
