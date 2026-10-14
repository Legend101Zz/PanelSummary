import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OUTSIDE_ABOVE, OUTSIDE_BELOW, OUTSIDE_COST, ResultLine } from "./ResultLine";

const html = (actual: number, extra: object = {}) =>
  renderToStaticMarkup(
    createElement(ResultLine, { title: "Took", actual, low: 540, high: 4380, actualLabel: "A", lowLabel: "9 min", highLabel: "1 h 13 min", ...extra }),
  );

describe("ResultLine", () => {
  it("clamps the mark inside the strip and says a faster run in words", () => {
    const out = html(360);
    expect(out).toContain(OUTSIDE_BELOW);
    expect(out).toContain("clamp(3px, 0%, calc(100% - 3px))");
    expect(out).toContain("max(0px, calc(0% - 2px))");
  });
  it("clamps the mark at the far end and says a slower run in words", () => {
    const out = html(5000);
    expect(out).toContain(OUTSIDE_ABOVE);
    expect(out).toContain("clamp(3px, 100%, calc(100% - 3px))");
    expect(out).toContain("max(0px, calc(0% - 2px))"); // label ends at the mark: right offset is 0
  });
  it("says nothing extra for a value inside the range", () => {
    const out = html(1800);
    expect(out).not.toContain("than the estimate");
    expect(out).toContain("Estimate before the run: 9 min to 1 h 13 min.");
  });
  it("uses its own words for a cost", () => {
    expect(html(0.1, { outsideWords: OUTSIDE_COST })).toContain("Lower than the estimate");
    expect(html(9000, { outsideWords: OUTSIDE_COST })).toContain("Higher than the estimate");
  });
  it("tells a screen reader that the run was outside the estimate", () => {
    expect(html(360)).toContain("This run was faster than the estimate.");
  });
});
