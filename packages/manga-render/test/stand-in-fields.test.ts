/** D30 (#81): the optional fit, wanted and unmapped fields of the understanding. */
import { describe, expect, it } from "vitest";

import { validateUnderstanding } from "../src/index.js";
import { UNDERSTANDING } from "./fixtures/happy-prince.js";

const fresh = () => structuredClone(UNDERSTANDING) as unknown as Record<string, any>;
const unitsOf = () => {
  const ids = new Set<string>();
  for (const s of UNDERSTANDING.sections) for (const u of s.units) ids.add(u);
  return [...ids];
};

describe("fit, wanted and unmapped (D30)", () => {
  it("the fixture passes without them", () => {
    expect(validateUnderstanding(fresh(), unitsOf()).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("accepts fit, wanted and unmapped with no FIELD_UNKNOWN warning", () => {
    const u = fresh();
    u.cast[0].fit = "none";
    u.cast[0].wanted = "a prince of gold";
    u.locations[0].fit = "near";
    u.locations[0].wanted = "the town square";
    u.unmapped = [
      { type: "cast", ref: u.cast[0].id, wanted: "a prince of gold", used: "human" },
      { type: "place", ref: u.locations[0].id, wanted: "the town square", used: "city_square" },
      { type: "prop", wanted: "a golden key", used: "thing_long" },
    ];
    const issues = validateUnderstanding(u, unitsOf());
    expect(issues.filter((i) => i.code === "FIELD_UNKNOWN")).toEqual([]);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(issues.filter((i) => i.path.startsWith("understanding.unmapped"))).toEqual([]);
  });

  it("an unknown top-level key still warns", () => {
    const u = fresh();
    u.stand_ins = [];
    expect(validateUnderstanding(u, unitsOf()).some((i) => i.code === "FIELD_UNKNOWN")).toBe(true);
  });

  it("rejects a fit that is not exact, near or none; warns for a long wanted and a malformed list", () => {
    const u = fresh();
    u.cast[0].fit = "kind of";
    u.locations[0].wanted = "w".repeat(50);
    u.unmapped = "none";
    const issues = validateUnderstanding(u, unitsOf());
    expect(issues.some((i) => i.code === "ENUM_INVALID" && i.severity === "error" && i.path.startsWith("cast "))).toBe(true);
    expect(issues.some((i) => i.code === "WANTED_LONG" && i.severity === "warning")).toBe(true);
    expect(issues.some((i) => i.path === "understanding.unmapped" && i.severity === "warning")).toBe(true);
  });
});
