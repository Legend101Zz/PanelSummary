/**
 * Continue with the next section (#80, D38): the prior understanding of an earlier part.
 *
 * The prior came from an earlier model output, so it is DATA. It goes in its own escaped data block, never
 * in the instructions. The goal keeps every prior cast member and location exactly: the worker merges them
 * deterministically (prior members are copied unchanged, only new members come from the model). A prior
 * member may gain sections and states for the new scope; a prior location may also gain `units` of the new
 * scope (D38). Nothing else about it can change.
 */
import type { ValidationIssue } from "@panelsummary/manga-render";

import { InputError, requireObject } from "./types.js";

export interface PriorMember {
  id: string;
  name?: string;
  [key: string]: unknown;
}

export interface PriorUnderstanding {
  version: number;
  cast: PriorMember[];
  locations: PriorMember[];
  /** Section ids and titles of the earlier parts (for the prompt and the CAST_SECTIONS check). */
  sections: { id: string; title: string }[];
  logline: string;
  unmapped: unknown[];
}

/** Read the `prior` field of the goal input: `{version, understanding}`. Throws InputError on a bad shape. */
export function parsePrior(value: unknown): PriorUnderstanding | undefined {
  if (value === undefined || value === null) return undefined;
  const record = requireObject(value, "prior");
  const u = requireObject(record.understanding, "prior.understanding");
  const list = (key: string): PriorMember[] => {
    const items = u[key];
    if (!Array.isArray(items)) throw new InputError(`prior.understanding.${key} must be an array`);
    for (const item of items) {
      const entry = requireObject(item, `prior.understanding.${key}[]`);
      if (typeof entry.id !== "string" || entry.id === "") throw new InputError(`each prior.understanding.${key} entry needs an id`);
    }
    return items as PriorMember[];
  };
  const sections = Array.isArray(u.sections) ? (u.sections as Array<{ id?: unknown; title?: unknown }>).filter((s) => typeof s?.id === "string").map((s) => ({ id: String(s.id), title: String(s.title ?? "") })) : [];
  return {
    version: Number(record.version ?? 0),
    cast: list("cast"),
    locations: list("locations"),
    sections,
    logline: String(u.logline ?? ""),
    unmapped: Array.isArray(u.unmapped) ? (u.unmapped as unknown[]) : [],
  };
}

/** What the prompt shows of the prior: everything that fixes the look, nothing that belongs to the earlier text. */
export function priorForPrompt(prior: PriorUnderstanding): Record<string, unknown> {
  return {
    version: prior.version,
    logline: prior.logline,
    earlier_sections: prior.sections,
    cast: prior.cast,
    locations: prior.locations,
  };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Every field of a member except the ones a continuation may extend. */
function fixedPart(member: Record<string, unknown>): Record<string, unknown> {
  const { sections: _s, states: _t, units: _u, ...rest } = member;
  void _s;
  void _t;
  void _u;
  return rest;
}

const normalName = (name: unknown): string => String(name ?? "").toLowerCase().replace(/^the\s+/, "").replace(/\s+/g, " ").trim();

export interface MergeOptions {
  /** Keep the states the prior members already have (the stored result). Off for the checks: their `at` points to earlier units. */
  keepPriorStates: boolean;
}

/**
 * Merge the model's candidate with the prior. Returns the merged understanding and the issues of the merge:
 * - PRIOR_CAST_DUPLICATE (error): a new member has the name of a prior member under another id.
 * - PRIOR_CAST_KEPT / PRIOR_LOCATION_KEPT (warning): the candidate listed a prior member with other
 *   fields; the prior was kept as it was.
 * The candidate is not changed.
 */
export function mergePrior(candidate: unknown, prior: PriorUnderstanding, options: MergeOptions): { merged: unknown; issues: ValidationIssue[] } {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return { merged: candidate, issues: [] };
  const c = candidate as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  const modelCast = (Array.isArray(c.cast) ? c.cast : []).filter((m): m is Record<string, unknown> => !!m && typeof m === "object");
  const modelLocations = (Array.isArray(c.locations) ? c.locations : []).filter((m): m is Record<string, unknown> => !!m && typeof m === "object");
  const priorCastIds = new Set(prior.cast.map((m) => m.id));
  const priorLocationIds = new Set(prior.locations.map((m) => m.id));

  const cast: Record<string, unknown>[] = prior.cast.map((member) => {
    const entry = modelCast.find((m) => m.id === member.id);
    const out: Record<string, unknown> = JSON.parse(JSON.stringify(member));
    if (!entry) {
      if (!options.keepPriorStates) delete out.states;
      return out;
    }
    // Only the fields the model gave are compared: an entry with just "sections" and "states" is fine.
    const given = fixedPart(entry);
    if (Object.keys(given).some((key) => !same(given[key], member[key]))) {
      issues.push({ code: "PRIOR_CAST_KEPT", severity: "warning", path: `cast ${member.id}`, message: `${member.id} is a cast member of the earlier part. Its name, role, description and look stay as they were; only its sections and states can grow.` });
    }
    const sections = [...new Set([...(Array.isArray(member.sections) ? (member.sections as string[]) : []), ...(Array.isArray(entry.sections) ? (entry.sections as string[]) : [])])];
    if (sections.length) out.sections = sections;
    // A model that copies the prior member lists its old states again: those are not new.
    const oldStates = Array.isArray(member.states) ? (member.states as unknown[]) : [];
    const newStates = (Array.isArray(entry.states) ? (entry.states as unknown[]) : []).filter((s) => !oldStates.some((o) => same(o, s)));
    const states = options.keepPriorStates ? [...oldStates, ...newStates] : newStates;
    if (states.length) out.states = states;
    else delete out.states;
    return out;
  });
  const priorNames = new Map(prior.cast.map((m) => [normalName(m.name), m.id]));
  for (const member of modelCast) {
    if (typeof member.id === "string" && priorCastIds.has(member.id)) continue;
    cast.push(member);
    const twin = priorNames.get(normalName(member.name));
    if (twin && normalName(member.name) !== "") {
      issues.push({ code: "PRIOR_CAST_DUPLICATE", severity: "error", path: `cast ${String(member.id ?? "?")}`, message: `${String(member.id ?? "?")} ("${String(member.name)}") is the earlier part's ${twin}. Do not make a second member for the same character: leave ${String(member.id)} out and use ${twin} (to add sections or states, list ${twin} with only "sections" and "states").` });
    }
  }

  const locations: Record<string, unknown>[] = prior.locations.map((place) => {
    const entry = modelLocations.find((l) => l.id === place.id);
    if (entry && Object.keys(fixedPart(entry)).some((key) => !same(fixedPart(entry)[key], place[key]))) {
      issues.push({ code: "PRIOR_LOCATION_KEPT", severity: "warning", path: `location ${place.id}`, message: `${place.id} is a place of the earlier part. Its name, kind and features stay as they were; only its "units" can grow with units of the new part.` });
    }
    const out: Record<string, unknown> = JSON.parse(JSON.stringify(place));
    // The model may use a prior place again in the new part: its new-scope units are added to the prior units.
    const oldUnits = Array.isArray(place.units) ? (place.units as unknown[]) : [];
    const newUnits = Array.isArray(entry?.units) ? (entry.units as unknown[]) : entry?.units === undefined ? [] : [entry.units];
    const units = [...oldUnits, ...newUnits.filter((u) => !oldUnits.includes(u))];
    if (units.length) out.units = units;
    return out;
  });
  for (const place of modelLocations) if (!(typeof place.id === "string" && priorLocationIds.has(place.id))) locations.push(place);

  const unmapped = [...prior.unmapped];
  for (const item of Array.isArray(c.unmapped) ? c.unmapped : []) if (!unmapped.some((o) => same(o, item))) unmapped.push(item);

  const merged: Record<string, unknown> = { ...c, cast, locations };
  if (unmapped.length) merged.unmapped = unmapped;
  return { merged, issues };
}
