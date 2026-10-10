import { describe, expect, it } from "vitest";
import { continuePage, isReachedPage } from "./position";

describe("isReachedPage", () => {
  it("counts a drawn page, and a page that could not be drawn, inside the book", () => {
    expect(isReachedPage(2, 35, "accepted")).toBe(true);
    expect(isReachedPage(7, 35, "failed")).toBe(true);
  });
  it("does not count a page that is not drawn yet, a missing page or a page outside the book", () => {
    expect(isReachedPage(29, 35, "pending")).toBe(false);
    expect(isReachedPage(29, 35, null)).toBe(false);
    expect(isReachedPage(29, 35, undefined)).toBe(false);
    expect(isReachedPage(36, 35, "accepted")).toBe(false);
    expect(isReachedPage(0, 35, "accepted")).toBe(false);
    expect(isReachedPage(1.5, 35, "accepted")).toBe(false);
  });
  it("accepts any page while the page count is not known yet", () => {
    expect(isReachedPage(3, 0, "accepted")).toBe(true);
  });
});

describe("continuePage", () => {
  const drawn = [1, 2, 3, 4, 8];
  it("offers the saved page when it is drawn", () => {
    expect(continuePage(8, 35, drawn)).toBe(8);
  });
  it("offers nothing for page 1, for no value or for a bad value", () => {
    expect(continuePage(1, 35, drawn)).toBeNull();
    expect(continuePage(null, 35, drawn)).toBeNull();
    expect(continuePage(Number.NaN, 35, drawn)).toBeNull();
    expect(continuePage(2.5, 35, drawn)).toBeNull();
  });
  it("offers nothing for a page that is not drawn or outside the book", () => {
    expect(continuePage(29, 35, drawn)).toBeNull();
    expect(continuePage(40, 35, [40])).toBeNull();
  });
  it("works with a Set", () => {
    expect(continuePage(3, 35, new Set(drawn))).toBe(3);
  });
});
