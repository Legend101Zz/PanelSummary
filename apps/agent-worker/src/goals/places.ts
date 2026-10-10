/**
 * Places per source unit (track Q2b, issue #44).
 *
 * A location of the understanding may carry `units`: the ids of the source units in which
 * the story is at that place. The plan check then compares each planned page with it:
 *
 *   {"id": "l_palace_gate", "name": "The palace door", "environment": "street",
 *    "features": ["door"], "units": ["s2u1", "s2u2"], "description": "..."}
 *
 * `units` is an optional, additive field. The schema stays `book-understanding.v1`, and an
 * understanding saved before Q2b (no `units` on any location) still loads, validates and
 * plans: every check in this file stays silent on it. The skill version and hash in the
 * receipt record that the model was told to write the field.
 *
 * Levels (docs/v0.2/Q2b-continuity.md has the calibration):
 * - PLACE_UNITS_INVALID (error): `units` is not a list of known unit ids. Local shape error
 *   with a one-line fix.
 * - PLACE_UNITS_MISSING, PLACE_UNIT_UNCOVERED (warning): advice for the model.
 * - PLAN_LOCATION_NOT_IN_UNITS, PLAN_PLACE_UNLISTED (warning): new deterministic checks stay
 *   warnings until they are calibrated on judged pages from a live run.
 */
import type { AdaptationPlan, BookUnderstanding, LocationSpec, ValidationIssue } from "@panelsummary/manga-render";

export type Place = LocationSpec & { units?: unknown };

/** The units a place declares, or undefined when it declares none (or the field is malformed). */
export function placeUnits(place: Place | undefined): string[] | undefined {
  const raw = place?.units;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const ok = raw.filter((u): u is string => typeof u === "string");
  return ok.length === raw.length ? ok : undefined;
}

/** True when at least one location declares units: the understanding is in the Q2b shape. */
export function hasPlaceUnits(locations: readonly Place[] | undefined): boolean {
  return (locations ?? []).some((l) => placeUnits(l) !== undefined);
}

const list = (ids: readonly string[], max = 6) => `${ids.slice(0, max).join(", ")}${ids.length > max ? `, +${ids.length - max} more` : ""}`;

/**
 * Understanding side. `expectUnits` is true for a new understanding: then a location
 * without `units` is a warning. A saved understanding passes false and gets no warning.
 */
export function placeIssues(value: unknown, unitIds: readonly string[], expectUnits = true): ValidationIssue[] {
  const locations = (value as { locations?: unknown })?.locations;
  if (!Array.isArray(locations)) return [];
  const known = new Set(unitIds);
  const issues: ValidationIssue[] = [];
  const missing: string[] = [];
  const covered = new Set<string>();
  for (const raw of locations as Place[]) {
    if (!raw || typeof raw !== "object") continue;
    const path = `location ${raw.id ?? "?"}`;
    if (raw.units === undefined) {
      missing.push(String(raw.id ?? "?"));
      continue;
    }
    const units = raw.units;
    const bad = Array.isArray(units) ? units.filter((u) => typeof u !== "string" || !known.has(u)) : [units];
    if (!Array.isArray(units) || units.length === 0 || bad.length > 0) {
      issues.push({
        code: "PLACE_UNITS_INVALID",
        severity: "error",
        path,
        message: `"units" must list the ids of the source units in which the story is at ${raw.id ?? "this place"} (one or more of: ${list(unitIds, 12)})${bad.length ? `; not valid: ${bad.map((b) => JSON.stringify(b)).join(", ")}` : ""}.`,
      });
      continue;
    }
    for (const u of units as string[]) covered.add(u);
  }
  const declared = locations.length - missing.length > 0;
  if (expectUnits && missing.length > 0) {
    issues.push({
      code: "PLACE_UNITS_MISSING",
      severity: "warning",
      path: "understanding.locations",
      message: `${missing.length} location(s) have no "units" (${list(missing)}). Add "units": the source units in which the story is at that place, so the plan puts each page in a place its text uses.`,
    });
  }
  if (declared) {
    const sections = (value as { sections?: Array<{ units?: string[] }> }).sections ?? [];
    const unplaced = sections.flatMap((s) => s?.units ?? []).filter((u) => known.has(u) && !covered.has(u));
    if (unplaced.length > 0) {
      issues.push({
        code: "PLACE_UNIT_UNCOVERED",
        severity: "warning",
        path: "understanding.locations",
        message: `no location lists these units: ${list(unplaced)}. Every unit where the story is somewhere needs a place (add the unit to a place's "units", or add a place such as a courtyard, a gate or a kitchen).`,
      });
    }
  }
  return issues;
}

/**
 * Plan side: each planned page's setting must exist in the understanding's places for the
 * page's source units. Silent when the understanding declares no units (saved shape).
 */
export function planPlaceIssues(plan: unknown, understanding: Pick<BookUnderstanding, "locations">): ValidationIssue[] {
  const pages = (plan as AdaptationPlan | undefined)?.pages;
  const locations = (understanding?.locations ?? []) as Place[];
  if (!Array.isArray(pages) || !hasPlaceUnits(locations)) return [];
  const byId = new Map(locations.map((l) => [l.id, l]));
  const issues: ValidationIssue[] = [];
  for (const page of pages) {
    if (!page || !Array.isArray(page.units) || page.units.length === 0) continue;
    const units = new Set(page.units);
    const listed = (Array.isArray(page.locations) ? page.locations : []).filter((id) => byId.has(id));
    const here = locations.filter((l) => placeUnits(l)?.some((u) => units.has(u)));
    for (const id of listed) {
      const declared = placeUnits(byId.get(id));
      if (declared && !declared.some((u) => units.has(u))) {
        issues.push({
          code: "PLAN_LOCATION_NOT_IN_UNITS",
          severity: "warning",
          path: `page ${page.page_number}`,
          message: `location ${id} is used only in ${list(declared)}, but this page adapts ${list(page.units)}.${here.length ? ` Places these units use: ${list(here.map((l) => l.id))}.` : ""} Plan a place the page's text uses, or add the unit to the place's "units".`,
        });
      }
    }
    if (here.length > 0 && !here.some((l) => listed.includes(l.id)) && listed.every((id) => placeUnits(byId.get(id)))) {
      issues.push({
        code: "PLAN_PLACE_UNLISTED",
        severity: "warning",
        path: `page ${page.page_number}`,
        message: `this page adapts ${list(page.units)}, whose places are ${list(here.map((l) => l.id))}, but it lists none of them (${list(listed) || "no location"}).`,
      });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Calibration helper (scripts/calibrate-q2b.ts only)
// ---------------------------------------------------------------------------

const GENERIC_PLACE_WORDS = new Set([
  "the", "of", "a", "an", "and", "in", "on", "at", "by", "to", "with", "room", "hall", "house", "place", "street", "streets",
  "great", "little", "small", "big", "old", "new", "inside", "outside", "where", "from", "his", "her", "their", "city", "town",
]);

/**
 * PROXY ONLY. Saved understandings (before Q2b) have no `units`. For the calibration this
 * derives them: a location is used in the units of its sections whose text contains a
 * distinctive word of the location's name (not "hall", "room", "street"...). A live
 * understanding states them. The proxy is cruder than the model, so the calibration table
 * says "derived" wherever it uses it.
 */
export function deriveUnits(
  understanding: Pick<BookUnderstanding, "locations">,
  units: ReadonlyArray<{ id: string; section_id: string; text: string }>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const loc of understanding.locations ?? []) {
    const words = `${loc.name}`
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 3 && !GENERIC_PLACE_WORDS.has(w))
      .map((w) => w.replace(/s$/, ""));
    const hit = units.filter((u) => words.some((w) => new RegExp(`\\b${w}`, "i").test(u.text))).map((u) => u.id);
    out.set(loc.id, hit);
  }
  return out;
}
