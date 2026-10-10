import { describe, expect, it } from "vitest";
import { bandForBook } from "./bandForBook";

const book = (status: string, e: any = null): any => ({ status, latest_edition: e });

describe("bandForBook", () => {
  it("fills the line only while pages are drawn", () => {
    expect(bandForBook(book("parsed", { status: "drawing", page_total: 16, pages_accepted: 6 }))).toEqual({ family: "progress", text: "6 of 16 pages drawn", fraction: 6 / 16 });
    expect(bandForBook(book("parsed", { status: "planning", page_total: 0, pages_accepted: 0 })).fraction).toBeUndefined();
    expect(bandForBook(book("parsing")).family).toBe("progress");
  });
  it("calls a run with failures but no missing page a drawn book", () => {
    expect(bandForBook(book("parsed", { status: "completed_with_failures", page_total: 16, pages_accepted: 16, pages_failed: 0 }))).toEqual({ family: "drawn", text: "16 manga pages", fraction: undefined });
    expect(bandForBook(book("parsed", { status: "completed_with_failures", page_total: 16, pages_accepted: 14, pages_failed: 2 })).text).toBe("14 of 16 drawn, 2 missing");
  });
  it("maps the other states to their families", () => {
    expect(bandForBook(book("parsed", { status: "complete", page_total: 18, pages_accepted: 18 }))).toMatchObject({ family: "drawn", text: "18 manga pages" });
    expect(bandForBook(book("failed")).family).toBe("needs");
    expect(bandForBook(book("parsed")).family).toBe("outline");
    expect(bandForBook(book("parsed", { status: "cancelled", page_total: 16, pages_accepted: 3 })).family).toBe("outline");
    expect(bandForBook(book("parsed", { status: "awaiting_plan_review", page_total: 16, pages_accepted: 0 })).text).toBe("Plan ready to review");
    expect(bandForBook(book("parsed", { status: "failed", page_total: 16, pages_accepted: 4, provider_stop: { code: "PROVIDER_AUTH" } })).family).toBe("needs");
  });
});
