/**
 * validateUnderstanding (BookUnderstanding) and validatePlan (AdaptationPlan).
 */
import {
  CLAIM_IMPORTANCE,
  CLAIM_KINDS,
  ENV_FEATURES,
  ENVIRONMENTS,
  type AdaptationPlan,
  type BookUnderstanding,
  type ValidationIssue,
} from "../contracts.js";
import { validateLook } from "./look.js";
import { checkEnum, checkSourceRef, isRecord, Issues, listValues, reqArray, reqBoolean, reqString, show, toSet, warnUnknownKeys } from "./util.js";

export const MAX_CLAIMS_PER_PAGE = 4;

function uniqueIds(items: unknown[], label: string, issues: Issues, path: string): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  items.forEach((item, i) => {
    if (!isRecord(item)) {
      issues.error("FIELD_TYPE", `${path}[${i}]`, `each ${label} must be an object, got ${show(item)}.`);
      return;
    }
    const id = item.id;
    if (typeof id !== "string" || id.trim() === "") {
      issues.error("FIELD_MISSING", `${path}[${i}]`, `${label} needs a non-empty string "id".`);
      return;
    }
    if (out.has(id)) {
      issues.error("DUPLICATE_ID", `${label} ${id}`, `${label} id "${id}" is used more than once; ids must be unique.`);
      return;
    }
    out.set(id, item);
  });
  return out;
}

export function validateUnderstanding(u: unknown, knownUnitIds: Iterable<string>): ValidationIssue[] {
  const issues = new Issues();
  const units = toSet(knownUnitIds) ?? new Set<string>();
  if (!isRecord(u)) {
    issues.error("NOT_OBJECT", "understanding", "the book understanding must be a JSON object.");
    return issues.list;
  }
  if (u.schema !== "book-understanding.v1") issues.error("SCHEMA", "understanding", `"schema" must be "book-understanding.v1", got ${show(u.schema)}.`);
  reqString(u, "title", issues, "understanding");
  reqString(u, "author", issues, "understanding");
  checkEnum(u, "kind", ["fiction", "nonfiction", "mixed"] as const, issues, "understanding");
  reqString(u, "logline", issues, "understanding", "one sentence");
  warnUnknownKeys(u, ["schema", "title", "author", "kind", "logline", "sections", "cast", "locations", "claims", "themes"], issues, "understanding");

  const sections = uniqueIds(reqArray(u, "sections", issues, "understanding") ?? [], "section", issues, "understanding.sections");
  if (sections.size === 0) issues.error("SECTIONS_EMPTY", "understanding.sections", "list at least one section (in book order).");
  for (const [id, s] of sections) {
    const path = `section ${id}`;
    reqString(s, "title", issues, path);
    reqString(s, "summary", issues, path);
    const su = reqArray(s, "units", issues, path, "unit ids this section covers");
    if (su && su.length === 0) issues.error("SECTION_NO_UNITS", path, `section "${id}" must list the unit ids it covers.`);
    su?.forEach((unit, i) => {
      if (typeof unit !== "string" || !units.has(unit)) {
        issues.error("UNKNOWN_UNIT", `${path}.units[${i}]`, `unit ${show(unit)} does not exist in the parsed book.`);
      }
    });
  }

  const cast = uniqueIds(reqArray(u, "cast", issues, "understanding") ?? [], "cast", issues, "understanding.cast");
  for (const [id, c] of cast) {
    const path = `cast ${id}`;
    reqString(c, "name", issues, path);
    reqString(c, "role", issues, path);
    reqString(c, "description", issues, path);
    validateLook(c.look, issues, `${path}.look`);
  }

  const locations = uniqueIds(reqArray(u, "locations", issues, "understanding") ?? [], "location", issues, "understanding.locations");
  for (const [id, l] of locations) {
    const path = `location ${id}`;
    reqString(l, "name", issues, path);
    reqString(l, "description", issues, path);
    checkEnum(l, "environment", ENVIRONMENTS, issues, path);
    const feats = reqArray(l, "features", issues, path, `from: ${listValues(ENV_FEATURES)}`);
    feats?.forEach((f, i) => {
      if (typeof f !== "string" || !(ENV_FEATURES as readonly string[]).includes(f)) {
        issues.error("ENUM_INVALID", `${path}.features[${i}]`, `feature ${show(f)} is not allowed; use one of: ${listValues(ENV_FEATURES)}.`);
      }
    });
  }

  const claims = uniqueIds(reqArray(u, "claims", issues, "understanding") ?? [], "claim", issues, "understanding.claims");
  for (const [id, c] of claims) {
    const path = `claim ${id}`;
    const sid = reqString(c, "section_id", issues, path);
    if (sid && !sections.has(sid)) issues.error("UNKNOWN_SECTION", path, `section_id "${sid}" is not a section; use one of: ${listValues([...sections.keys()])}.`);
    checkEnum(c, "kind", CLAIM_KINDS, issues, path);
    checkEnum(c, "importance", CLAIM_IMPORTANCE, issues, path);
    reqString(c, "text", issues, path);
    const src = reqArray(c, "source", issues, path, "at least one {unit, page}");
    if (src && src.length === 0) issues.error("SOURCE_MISSING", path, `claim "${id}" needs at least one source {"unit", "page"}.`);
    src?.forEach((s, i) => checkSourceRef(s, issues, `${path}.source[${i}]`, units));
  }
  const themes = reqArray(u, "themes", issues, "understanding");
  themes?.forEach((t, i) => {
    if (typeof t !== "string" || t.trim() === "") issues.error("FIELD_TYPE", `understanding.themes[${i}]`, "themes must be non-empty strings.");
  });
  return issues.list;
}

export function validatePlan(plan: unknown, understanding: BookUnderstanding, knownUnitIds: Iterable<string>): ValidationIssue[] {
  const issues = new Issues();
  const units = toSet(knownUnitIds) ?? new Set<string>();
  if (!isRecord(plan)) {
    issues.error("NOT_OBJECT", "plan", "the adaptation plan must be a JSON object.");
    return issues.list;
  }
  if (plan.schema !== "adaptation-plan.v1") issues.error("SCHEMA", "plan", `"schema" must be "adaptation-plan.v1", got ${show(plan.schema)}.`);
  warnUnknownKeys(plan, ["schema", "pages", "omitted"], issues, "plan");
  const sectionOrder = new Map(understanding.sections.map((s, i) => [s.id, i]));
  const claimById = new Map(understanding.claims.map((c) => [c.id, c]));
  const castIds = new Set(understanding.cast.map((c) => c.id));
  const locIds = new Set(understanding.locations.map((l) => l.id));
  const sectionUnits = new Map(understanding.sections.map((s) => [s.id, new Set(s.units)]));

  const pages = reqArray(plan, "pages", issues, "plan") ?? [];
  if (pages.length === 0) issues.error("PLAN_EMPTY", "plan.pages", "the plan needs at least one page.");
  const planned = new Map<string, number[]>();
  const pagesPerSection = new Map<string, number>();
  let lastSection = -1;
  let lastSectionId = "";
  pages.forEach((raw, i) => {
    const path = `plan page ${i + 1}`;
    if (!isRecord(raw)) {
      issues.error("FIELD_TYPE", path, "each planned page must be an object.");
      return;
    }
    warnUnknownKeys(raw, ["page_number", "section_id", "beat", "claims", "cast", "locations", "units", "page_turn_hook"], issues, path);
    if (raw.page_number !== i + 1) {
      issues.error("PAGE_NUMBERING", path, `pages must be numbered 1..N in order; the page at position ${i + 1} has page_number ${show(raw.page_number)} (expected ${i + 1}).`);
    }
    reqString(raw, "beat", issues, path, "the single beat of this page");
    reqBoolean(raw, "page_turn_hook", issues, path);
    const sid = reqString(raw, "section_id", issues, path);
    if (sid !== undefined) {
      const idx = sectionOrder.get(sid);
      if (idx === undefined) {
        issues.error("UNKNOWN_SECTION", path, `section_id "${sid}" is not a section; use one of: ${listValues([...sectionOrder.keys()])}.`);
      } else {
        if (idx < lastSection) {
          issues.error(
            "SECTION_ORDER",
            path,
            `section "${sid}" comes before "${lastSectionId}" in the book but is planned after it; keep pages in book (section) order.`,
          );
        }
        if (idx > lastSection) {
          lastSection = idx;
          lastSectionId = sid;
        }
        pagesPerSection.set(sid, (pagesPerSection.get(sid) ?? 0) + 1);
      }
    }
    const claims = reqArray(raw, "claims", issues, path, `up to ${MAX_CLAIMS_PER_PAGE} claim ids`) ?? [];
    if (claims.length > MAX_CLAIMS_PER_PAGE) {
      issues.error("TOO_MANY_CLAIMS", path, `${claims.length} claims on one page; the maximum is ${MAX_CLAIMS_PER_PAGE}. Spread them over more pages.`);
    }
    const seen = new Set<string>();
    claims.forEach((c, ci) => {
      if (typeof c !== "string" || !claimById.has(c)) {
        issues.error("UNKNOWN_CLAIM", `${path}.claims[${ci}]`, `claim ${show(c)} is not in the understanding.`);
        return;
      }
      if (seen.has(c)) issues.warn("DUPLICATE_VALUE", `${path}.claims[${ci}]`, `claim "${c}" is listed twice on this page.`);
      seen.add(c);
      planned.set(c, [...(planned.get(c) ?? []), i + 1]);
      const claim = claimById.get(c);
      if (claim && sid && claim.section_id !== sid) {
        issues.warn("CLAIM_SECTION", `${path}.claims[${ci}]`, `claim "${c}" belongs to section "${claim.section_id}" but this page adapts "${sid}".`);
      }
    });
    const cast = reqArray(raw, "cast", issues, path, "cast ids on this page") ?? [];
    cast.forEach((c, ci) => {
      if (typeof c !== "string" || !castIds.has(c)) issues.error("UNKNOWN_CAST", `${path}.cast[${ci}]`, `cast id ${show(c)} does not exist; use one of: ${listValues([...castIds])}.`);
    });
    const locs = reqArray(raw, "locations", issues, path, "location ids on this page") ?? [];
    locs.forEach((l, li) => {
      if (typeof l !== "string" || !locIds.has(l)) issues.error("UNKNOWN_LOCATION", `${path}.locations[${li}]`, `location id ${show(l)} does not exist; use one of: ${listValues([...locIds])}.`);
    });
    const pu = reqArray(raw, "units", issues, path, "unit ids this page adapts") ?? [];
    if (Array.isArray(raw.units) && pu.length === 0) issues.error("PAGE_NO_UNITS", path, "every page must list the unit ids it adapts.");
    pu.forEach((unit, ui) => {
      if (typeof unit !== "string" || !units.has(unit)) {
        issues.error("UNKNOWN_UNIT", `${path}.units[${ui}]`, `unit ${show(unit)} does not exist in the parsed book.`);
      } else if (sid && sectionUnits.get(sid) && !sectionUnits.get(sid)?.has(unit)) {
        issues.warn("UNIT_SECTION", `${path}.units[${ui}]`, `unit "${unit}" is not one of section "${sid}"'s units.`);
      }
    });
  });

  // omitted
  const omittedRaw = reqArray(plan, "omitted", issues, "plan", "claims deliberately left out, with reasons") ?? [];
  const omitted = new Set<string>();
  omittedRaw.forEach((o, i) => {
    const path = `plan.omitted[${i}]`;
    if (!isRecord(o)) {
      issues.error("FIELD_TYPE", path, `each omission must be {"claim": "<id>", "reason": "<why>"}.`);
      return;
    }
    const cid = reqString(o, "claim", issues, path);
    reqString(o, "reason", issues, path, "why this claim is left out");
    if (cid) {
      if (!claimById.has(cid)) issues.error("UNKNOWN_CLAIM", path, `omitted claim "${cid}" is not in the understanding.`);
      else {
        omitted.add(cid);
        if (planned.has(cid)) issues.warn("CLAIM_PLANNED_AND_OMITTED", path, `claim "${cid}" is planned on page ${planned.get(cid)?.join(", ")} and also omitted; keep one.`);
        if (claimById.get(cid)?.importance === "core") issues.warn("CORE_OMITTED", path, `claim "${cid}" is a core claim; omitting it needs a strong reason.`);
      }
    }
  });

  // coverage
  for (const claim of understanding.claims) {
    if (claim.importance === "detail") continue;
    if (!planned.has(claim.id) && !omitted.has(claim.id)) {
      issues.error(
        "CLAIM_UNPLANNED",
        `claim ${claim.id}`,
        `${claim.importance} claim "${claim.id}" (${show(claim.text)}) is on no page; plan it on a page of section "${claim.section_id}" or list it in "omitted" with a reason.`,
      );
    }
  }
  for (const section of understanding.sections) {
    if ((pagesPerSection.get(section.id) ?? 0) > 0) continue;
    const sectionClaims = understanding.claims.filter((c) => c.section_id === section.id);
    const explained = sectionClaims.length > 0 && sectionClaims.every((c) => omitted.has(c.id));
    if (explained) continue;
    if (sectionClaims.length === 0) {
      issues.warn("SECTION_SKIPPED", `section ${section.id}`, `section "${section.id}" (${show(section.title)}) has no pages and no claims; add a page if it matters to the story.`);
    } else {
      issues.error(
        "SECTION_SKIPPED",
        `section ${section.id}`,
        `section "${section.id}" (${show(section.title)}) has no pages; add at least one page for it or list all its claims in "omitted" with reasons.`,
      );
    }
  }
  return issues.list;
}

/** Narrow helper for callers holding an already-typed plan. */
export function planPage(plan: AdaptationPlan, pageNumber: number) {
  return plan.pages.find((p) => p.page_number === pageNumber);
}
