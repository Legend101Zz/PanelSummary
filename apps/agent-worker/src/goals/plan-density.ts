/**
 * Plan density and plan places (track dens, Gate 1b follow-up of #82 and #87).
 *
 * Gate 1b: the two-tale run had 77 claims (the other runs 56-57), so the plan put 3 claims on 19 of 22
 * pages (v0.2: 8). Those pages carried more narration and scored lower, and the plan left out places
 * that the beat names. Two deterministic checks, both calibrated on judged pages
 * (docs/v0.3/W1-writer.md, 'Gate 1b: plan density'; D32 in docs/decisions.md):
 *
 * - PLAN_PAGE_DENSE (warning): a page with 3 or more claims of which at least 2 are supporting or detail. Advice:
 *   move that claim to a neighbouring page with room, or omit it with a reason. Never a core claim.
 * - PLAN_PLACE_NOT_LISTED (warning): the beat names a known location (its name or a distinctive word
 *   of its name) that the page's `locations` do not list.
 *
 * A check becomes an ERROR only if it passes the D26 test (docs/v0.2/Q2a-writer-checks.md). The
 * calibration script `scripts/calibrate-dens.ts` uses the exported helpers below, so the table and
 * the check cannot differ.
 */
import type { AdaptationPlan, BookUnderstanding, ValidationIssue } from "@panelsummary/manga-render";

type Importance = "core" | "supporting" | "detail";
type PlanPage = AdaptationPlan["pages"][number];

export interface ClaimMix {
  total: number;
  core: number;
  supporting: number;
  detail: number;
  unknown: number;
}

/** Claims on a page by importance. A claim id the understanding does not know counts as `unknown`. */
export function claimMix(page: Pick<PlanPage, "claims">, importanceOf: ReadonlyMap<string, string>): ClaimMix {
  const mix: ClaimMix = { total: 0, core: 0, supporting: 0, detail: 0, unknown: 0 };
  for (const id of Array.isArray(page?.claims) ? page.claims : []) {
    mix.total += 1;
    const level = importanceOf.get(id);
    if (level === "core" || level === "supporting" || level === "detail") mix[level as Importance] += 1;
    else mix.unknown += 1;
  }
  return mix;
}

export function beatWords(beat: unknown): number {
  return String(beat ?? "").split(/\s+/).filter(Boolean).length;
}

/**
 * Calibrated thresholds (docs/v0.3/W1-writer.md, Gate 1b): candidate (b2), the only density rule with a
 * signal in the judged data. It stays a warning: it does not pass D26 on the pre-set hit.
 */
export const DENSE_CLAIMS = 3;
export const DENSE_NON_CORE = 2;

/** The density rule: 3 or more claims, at least 2 of them supporting or detail. */
export function isDensePage(mix: ClaimMix): boolean {
  return mix.total >= DENSE_CLAIMS && mix.supporting + mix.detail >= DENSE_NON_CORE;
}

export function planDensityIssues(plan: unknown, understanding: Pick<BookUnderstanding, "claims">): ValidationIssue[] {
  const pages = (plan as AdaptationPlan | undefined)?.pages;
  if (!Array.isArray(pages)) return [];
  const importanceOf = new Map((understanding?.claims ?? []).map((c) => [c.id, c.importance as string]));
  const issues: ValidationIssue[] = [];
  for (const page of pages) {
    if (!page || typeof page !== "object") continue;
    const mix = claimMix(page, importanceOf);
    if (!isDensePage(mix)) continue;
    const movable = [...(page.claims ?? [])].filter((id) => importanceOf.get(id) !== "core");
    issues.push({
      code: "PLAN_PAGE_DENSE",
      severity: "warning",
      path: `page ${page.page_number}`,
      message: `this page has ${mix.total} claims (${mix.core} core, ${mix.supporting} supporting, ${mix.detail} detail). Pages with 3 or more claims, most of them supporting or detail, score lower and carry more narration. Move ${movable.join(", ")} to a neighbouring page with room, or omit it with a reason. Never drop a core claim.`,
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Plan places: the beat names a location that the page does not list
// ---------------------------------------------------------------------------

const GENERIC_WORDS = new Set([
  "the", "of", "a", "an", "and", "in", "on", "at", "by", "to", "with", "room", "hall", "house", "place", "street", "streets",
  "great", "little", "small", "big", "old", "new", "inside", "outside", "where", "from", "his", "her", "their", "city", "town",
  "village", "road", "door", "home", "side", "end", "front", "back", "top", "night", "day", "world", "land",
]);

/** Distinctive words of a place name: longer than 3 letters, not a generic word, a trailing "s" removed. */
export function distinctiveWords(name: unknown): string[] {
  const out = String(name ?? "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3 && !GENERIC_WORDS.has(w))
    .map((w) => w.replace(/s$/, ""));
  return [...new Set(out)];
}

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when the text holds the word at a word start (so "garret" matches "garrets", not "regarret"). */
const hasWord = (text: string, word: string) => new RegExp(`\\b${escape(word)}`, "i").test(text);

export interface NamedPlace {
  id: string;
  /** The words of the name that the beat holds. */
  words: string[];
}

/**
 * The locations of the understanding that the beat names and that the page does not list.
 * A location the beat names through a word that a listed location also has (two places "The garden")
 * is not reported: the page lists a place with that word.
 */
export function namedUnlistedPlaces(
  page: Pick<PlanPage, "beat" | "locations">,
  locations: ReadonlyArray<{ id: string; name?: string }>,
  ignore: ReadonlySet<string> = new Set(),
): NamedPlace[] {
  const beat = String(page?.beat ?? "");
  if (!beat) return [];
  const listed = new Set(Array.isArray(page.locations) ? page.locations : []);
  const wordsOf = new Map(locations.map((l) => [l.id, distinctiveWords(l.name).filter((w) => !ignore.has(w))]));
  const listedWords = new Set([...listed].flatMap((id) => wordsOf.get(id) ?? []));
  const found: NamedPlace[] = [];
  for (const loc of locations) {
    if (listed.has(loc.id)) continue;
    const words = (wordsOf.get(loc.id) ?? []).filter((w) => hasWord(beat, w));
    if (words.length > 0 && !words.some((w) => listedWords.has(w))) found.push({ id: loc.id, words });
  }
  return found;
}

/** Words of cast names ("student" in "The Student"): a beat holds them for the character, so they do not name a place. */
export function castWords(cast: ReadonlyArray<{ name?: string }> | undefined): Set<string> {
  return new Set((cast ?? []).flatMap((c) => distinctiveWords(c.name)));
}

export function planPlaceNamedIssues(plan: unknown, understanding: Pick<BookUnderstanding, "locations" | "cast">): ValidationIssue[] {
  const pages = (plan as AdaptationPlan | undefined)?.pages;
  const locations = understanding?.locations ?? [];
  if (!Array.isArray(pages) || locations.length === 0) return [];
  const ignore = castWords(understanding?.cast);
  const issues: ValidationIssue[] = [];
  for (const page of pages) {
    if (!page || typeof page !== "object") continue;
    const missing = namedUnlistedPlaces(page, locations, ignore);
    if (missing.length === 0) continue;
    const listed = Array.isArray(page.locations) && page.locations.length ? page.locations.join(", ") : "no location";
    issues.push({
      code: "PLAN_PLACE_NOT_LISTED",
      severity: "warning",
      path: `page ${page.page_number}`,
      message: `the beat names ${missing.map((m) => `${m.id} ("${m.words.join(" ")}")`).join(", ")}, but the page lists ${listed}. Add the place to "locations", or change the beat so it names only the places the page shows.`,
    });
  }
  return issues;
}
