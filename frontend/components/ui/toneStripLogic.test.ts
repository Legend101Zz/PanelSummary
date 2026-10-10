import { describe, expect, it } from "vitest";
import { countSegments, describeSegments, formatPageList, pagesWith, segmentFor, segmentsFromPages, stripColumns, summaryLine, type SegmentState } from "./toneStripLogic";

describe("toneStrip", () => {
  it("maps page statuses to segment states", () => {
    expect(segmentFor("accepted")).toBe("drawn");
    expect(segmentFor("drawing")).toBe("drawing");
    expect(segmentFor("failed")).toBe("failed");
    expect(segmentFor("pending")).toBe("waiting");
    expect(segmentFor(undefined)).toBe("waiting");
  });

  it("builds one segment per planned page and fills the gaps with waiting", () => {
    const segs = segmentsFromPages(
      [
        { page_number: 1, status: "accepted" },
        { page_number: 3, status: "drawing" },
        { page_number: 4, status: "failed" },
        { page_number: 99, status: "accepted" },
      ],
      5,
    );
    expect(segs).toEqual(["drawn", "waiting", "drawing", "failed", "waiting"]);
    expect(segmentsFromPages([], 0)).toEqual([]);
  });

  it("counts and lists pages", () => {
    const segs: SegmentState[] = ["drawn", "failed", "drawn", "drawing", "waiting"];
    expect(countSegments(segs)).toEqual({ drawn: 2, drawing: 1, waiting: 1, failed: 1, total: 5 });
    expect(pagesWith(segs, "drawn")).toEqual([1, 3]);
  });

  it("writes page lists in words", () => {
    expect(formatPageList([1, 2, 3, 4])).toBe("1 to 4");
    expect(formatPageList([12, 19])).toBe("12 and 19");
    expect(formatPageList([28, 29])).toBe("28 and 29");
    expect(formatPageList([9, 13, 20, 21, 22])).toBe("9, 13 and 20 to 22");
    expect(formatPageList([5])).toBe("5");
    expect(formatPageList([])).toBe("");
  });

  it("describes few pages by page number", () => {
    const four: SegmentState[] = ["drawing", "drawing", "drawing", "drawing", ...Array<SegmentState>(12).fill("waiting")];
    expect(describeSegments(four)).toBe("Pages 1 to 4 drawing, pages 5 to 16 waiting");
    expect(describeSegments([])).toBe("The number of pages is not known yet");
  });

  it("describes many pages with counts, and names the pages that need a look", () => {
    const segs: SegmentState[] = Array.from({ length: 60 }, (_, i) => (i < 25 ? "drawn" : i < 29 ? "drawing" : "waiting"));
    segs[11] = "failed";
    segs[18] = "failed";
    segs[11] = "failed";
    const text = describeSegments(segs);
    expect(text).toContain("23 pages drawn");
    expect(text).toContain("pages 12 and 19 could not be drawn");
    expect(text).toContain("pages 26 to 29 drawing");
    expect(text).toContain("31 waiting");
  });

  it("writes the line under the strip", () => {
    const segs: SegmentState[] = Array.from({ length: 60 }, (_, i) => (i < 25 ? "drawn" : i < 29 ? "drawing" : "waiting"));
    segs[11] = "failed";
    expect(summaryLine(segs)).toBe("24 pages drawn of 60, 1 could not be drawn. Drawing pages 26 to 29.");
    expect(summaryLine(["drawn"])).toBe("1 page drawn of 1.");
    expect(summaryLine([])).toContain("Planning the pages");
  });

  it("chooses columns: one row to 20 pages, rows of 20 on a phone", () => {
    expect(stripColumns(4)).toEqual({ narrow: 4, wide: 4 });
    expect(stripColumns(18)).toEqual({ narrow: 18, wide: 18 });
    expect(stripColumns(60)).toEqual({ narrow: 20, wide: 40 });
    expect(stripColumns(0)).toEqual({ narrow: 1, wide: 1 });
  });
});
