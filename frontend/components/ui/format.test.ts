import { describe, expect, it } from "vitest";
import { clamp01, formatCount, formatDuration, formatDurationRange, formatPercent, formatUsd, formatUsdRange, meterParts, pluralize, rangePosition } from "./format";
import { drawnFraction, familyForTone, shelfBandExamples } from "./statusBandLogic";
import { stepStates } from "./steps";

describe("format", () => {
  it("writes durations", () => {
    expect(formatDuration(428)).toBe("7 min 08 s");
    expect(formatDuration(300)).toBe("5 min");
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(3420 - 24)).toBe("56 min 36 s");
    expect(formatDuration(3900)).toBe("1 h 05 min");
    expect(formatDuration(7200)).toBe("2 h");
    expect(formatDuration(-3)).toBe("0 s");
  });
  it("writes duration ranges with the unit once", () => {
    expect(formatDurationRange(120, 1860)).toBe("2 to 31 min");
    expect(formatDurationRange(300, 300)).toBe("5 min");
  });
  it("writes money, counts and percents", () => {
    expect(formatUsd(0.46)).toBe("$0.46");
    expect(formatUsd(2)).toBe("$2.00");
    expect(formatUsdRange(0.33, 0.75)).toBe("$0.33 to $0.75");
    expect(formatCount(17500)).toBe("17,500");
    expect(pluralize(1, "manga page")).toBe("1 manga page");
    expect(pluralize(18, "manga page")).toBe("18 manga pages");
    expect(formatPercent(0.42)).toBe("42%");
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(3)).toBe(1);
  });
  it("places the actual value on a range bar", () => {
    expect(rangePosition(428, 300, 3480).align).toBe("start");
    expect(rangePosition(3416, 300, 3480).align).toBe("end");
    expect(rangePosition(1800, 300, 3480).align).toBe("center");
    expect(rangePosition(10, 20, 20)).toEqual({ fraction: 0, align: "start" });
    expect(rangePosition(0, 100, 200).fraction).toBe(0);
    expect(rangePosition(900, 100, 200).fraction).toBe(1);
  });
  it("splits a meter into fill and over-limit parts", () => {
    expect(meterParts(5794, 17500)).toMatchObject({ isOver: false, over: 0 });
    const over = meterParts(21000, 17500);
    expect(over.isOver).toBe(true);
    expect(over.overBy).toBe(3500);
    expect(over.fill + over.over).toBeCloseTo(1);
    expect(meterParts(5, 0)).toMatchObject({ fill: 0, isOver: false });
  });
});

describe("status band logic", () => {
  it("maps tones to the four families", () => {
    expect(familyForTone("ink")).toBe("drawn");
    expect(familyForTone("pencil")).toBe("progress");
    expect(familyForTone("redpen")).toBe("needs");
    expect(familyForTone("quiet")).toBe("outline");
  });
  it("lists every shelf state of the design with a family", () => {
    const all = shelfBandExamples();
    expect(all.length).toBe(17); // the 15 states of section 4, with the 1-page and the no-plan variants
    expect(new Set(all.map((a) => a.family))).toEqual(new Set(["drawn", "progress", "needs", "outline"]));
    expect(all.find((a) => a.key === "drawing")?.fraction).toBeCloseTo(0.375);
  });
  it("computes the drawn fraction", () => {
    expect(drawnFraction(6, 16)).toBe(0.375);
    expect(drawnFraction(0, 0)).toBeUndefined();
    expect(drawnFraction(20, 10)).toBe(1);
  });
});

describe("steps", () => {
  it("marks done, current and next", () => {
    expect(stepStates(3, 1)).toEqual(["done", "current", "next"]);
    expect(stepStates(3, 0)).toEqual(["current", "next", "next"]);
    expect(stepStates(3, 3)).toEqual(["done", "done", "done"]);
  });
});
