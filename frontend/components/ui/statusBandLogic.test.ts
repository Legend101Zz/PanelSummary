import { describe, expect, it } from "vitest";
import type { LibraryBook } from "../../lib/api";
import { shelfStatus } from "../../lib/words";
import { drawnFraction, familyForTone, shelfBandExamples, splitNumberGroup, type BandFamily } from "./statusBandLogic";

const FAMILIES: BandFamily[] = ["drawn", "progress", "needs", "outline"];

function book(status: string, edition: Record<string, unknown> | null): LibraryBook {
  return { id: "b", title: "T", status, latest_edition: edition } as unknown as LibraryBook;
}
const ed = (o: Record<string, unknown>) => ({ status: "drawing", page_total: 16, pages_accepted: 0, provider_stop: null, ...o });

describe("familyForTone", () => {
  it("maps all four tones", () => {
    expect(familyForTone("ink")).toBe("drawn");
    expect(familyForTone("pencil")).toBe("progress");
    expect(familyForTone("redpen")).toBe("needs");
    expect(familyForTone("quiet")).toBe("outline");
  });
});

describe("drawnFraction", () => {
  it("is 0 when nothing is drawn", () => expect(drawnFraction(0, 16)).toBe(0));
  it("is undefined when the total is 0 or not a number", () => {
    expect(drawnFraction(0, 0)).toBeUndefined();
    expect(drawnFraction(3, Number.NaN)).toBeUndefined();
  });
  it("is clamped to 1 when drawn is over the total", () => expect(drawnFraction(20, 16)).toBe(1));
  it("is the ratio inside the range", () => expect(drawnFraction(6, 16)).toBe(6 / 16));
});

describe("splitNumberGroup", () => {
  it("splits the words from the number group", () => {
    expect(splitNumberGroup("MiniMax limit reached, 5 of 16 drawn")).toEqual(["MiniMax limit reached,", "5 of 16 drawn"]);
    expect(splitNumberGroup("14 of 16 drawn, 2 missing")).toEqual(["14 of 16 drawn,", "2 missing"]);
  });
  it("returns the whole text when there is no number group", () => {
    expect(splitNumberGroup("MiniMax limit reached")).toEqual([null, "MiniMax limit reached"]);
    expect(splitNumberGroup("Planning pages")).toEqual([null, "Planning pages"]);
    expect(splitNumberGroup("Hello, world")).toEqual([null, "Hello, world"]);
  });
});

describe("shelfBandExamples", () => {
  const examples = shelfBandExamples();
  it("has unique keys and a valid family on every example", () => {
    expect(new Set(examples.map((e) => e.key)).size).toBe(examples.length);
    for (const e of examples) expect(FAMILIES).toContain(e.family);
  });
  it("only the drawing example has a fraction", () => {
    expect(examples.filter((e) => e.fraction !== undefined).map((e) => e.key)).toEqual(["drawing"]);
  });

  const cases: Record<string, LibraryBook> = {
    unreadable: book("failed", null),
    reading_pdf: book("parsing", null),
    not_drawn: book("parsed", null),
    queued: book("parsed", ed({ status: "queued", page_total: 0 })),
    reading_book: book("parsed", ed({ status: "understanding", page_total: 0 })),
    planning: book("parsed", ed({ status: "planning", page_total: 0 })),
    drawing: book("parsed", ed({ status: "drawing", pages_accepted: 6 })),
    complete: book("parsed", ed({ status: "complete", pages_accepted: 18, page_total: 18 })),
    complete_one: book("parsed", ed({ status: "complete", pages_accepted: 1, page_total: 1 })),
    failures: book("parsed", ed({ status: "completed_with_failures", pages_accepted: 14 })),
    stopped_some: book("parsed", ed({ status: "cancelled", pages_accepted: 3 })),
    stopped_none: book("parsed", ed({ status: "cancelled", page_total: 0 })),
    limit: book("parsed", ed({ status: "failed", pages_accepted: 5, provider_stop: { code: "PROVIDER_LIMIT" } })),
    limit_no_plan: book("parsed", ed({ status: "failed", page_total: 0, provider_stop: { code: "PROVIDER_LIMIT" } })),
    key: book("parsed", ed({ status: "failed", pages_accepted: 13, provider_stop: { code: "PROVIDER_AUTH" } })),
    noanswer: book("parsed", ed({ status: "failed", pages_accepted: 9, provider_stop: { code: "PROVIDER_DOWN" } })),
    error: book("parsed", ed({ status: "failed" })),
  };

  it("has a words.ts case for every example", () => {
    expect(Object.keys(cases).sort()).toEqual(examples.map((e) => e.key).sort());
  });
  it("matches the text and the family of shelfStatus() in lib/words.ts", () => {
    for (const e of examples) {
      const s = shelfStatus(cases[e.key]);
      expect(s.text, e.key).toBe(e.text);
      expect(familyForTone(s.tone), e.key).toBe(e.family);
    }
  });
});
