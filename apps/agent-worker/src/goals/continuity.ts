/**
 * State continuity: how a cast member LOOKS at each point of the book.
 *
 * The understanding records each change of state as a look patch tied to the
 * source unit where it happens, on the cast member:
 *
 *   "states": [
 *     { "at": "s1u6", "set": { "eyes": "one_given" }, "note": "gives one sapphire to the student" },
 *     { "at": "s1u8", "set": { "eyes": "blind" } },
 *     { "at": "s1u10", "set": { "material": "stone" }, "note": "stripped of gold" }
 *   ]
 *
 * `set` is a patch over the base look: any field name with a string value. The
 * fields are NOT listed here, so a new renderer look field (T2: eyes jewel/empty,
 * gilded/stripped, plant bloom/bare) works with no change to this file. Whether
 * the renderer can draw a field today is read from the renderer catalog.
 *
 * For one page, the expected patch of each cast member is computed from the
 * page's source units, in code, and handed to the page goal as data:
 *
 * - a change at a unit BEFORE the page's units is in force (required);
 * - a change at a unit INSIDE the page's units happens on this page (either the
 *   before or the after value is allowed; going back after the change is not);
 * - a change AFTER the page's units has not happened (its value must not show).
 *
 * The page check flags a figure whose variant contradicts this. Acceptance run 8:
 * the Prince kept his sapphire eyes one page after giving one away, and stayed
 * gold after he was stripped.
 */
import { catalog } from "@panelsummary/manga-render";
import type { CastMember, Claim, MangaPageSpec, ValidationIssue } from "@panelsummary/manga-render";
import * as C from "@panelsummary/manga-render/contracts";

export interface StateChange {
  /** Unit id where the change happens. */
  at: string;
  /** Look patch applied from there on (field -> value). */
  set: Record<string, string>;
  /** The claim that tells the change (optional): the plan then says on which PAGE it happens. */
  claim?: string;
  note?: string;
}

/** Position of every unit in the book, from the section lists (book order). */
export function unitOrder(sections: ReadonlyArray<{ units?: readonly string[] }>): Map<string, number> {
  const order = new Map<string, number>();
  for (const section of sections) for (const id of section?.units ?? []) if (!order.has(id)) order.set(id, order.size);
  return order;
}

/** Order of unit ids when no section list is at hand: "s2u5" sorts after "s1u9" and "s2u4". */
function fallbackKey(id: string): number {
  const m = /^s(\d+)u(\d+)$/.exec(id);
  return m ? Number(m[1]) * 10_000 + Number(m[2]) : Number.NaN;
}

export function positionOf(order: ReadonlyMap<string, number>, unit: string): number {
  const known = order.get(unit);
  return known !== undefined ? known : fallbackKey(unit);
}

/** The well-formed states of a cast member, in source order. */
export function statesOf(member: Pick<CastMember, "id"> & { states?: unknown }, order: ReadonlyMap<string, number>): StateChange[] {
  const raw = Array.isArray(member.states) ? member.states : [];
  const ok: StateChange[] = [];
  for (const entry of raw) {
    const e = entry as Partial<StateChange> | null;
    if (!e || typeof e.at !== "string" || !e.set || typeof e.set !== "object" || Array.isArray(e.set)) continue;
    const set: Record<string, string> = {};
    for (const [k, v] of Object.entries(e.set)) if (typeof v === "string") set[k] = v;
    if (Object.keys(set).length === 0 || Number.isNaN(positionOf(order, e.at))) continue;
    ok.push({ at: e.at, set, claim: typeof e.claim === "string" ? e.claim : undefined, note: typeof e.note === "string" ? e.note : undefined });
  }
  return ok.sort((a, b) => positionOf(order, a.at) - positionOf(order, b.at));
}

/** Value of a look field before any state applies: eyes are open, other fields come from the cast look. */
export function baseValue(member: CastMember, field: string): string | undefined {
  if (field === "eyes") return "open";
  const value = (member.look as unknown as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

export interface ExpectedLook {
  /** The patch in force on this page (what each figure's variant must equal, field by field). */
  variant: Record<string, string>;
  /** Fields that change ON this page, in order: `before`, then each of `afters`. */
  changing: Record<string, { before: string | undefined; afters: string[]; note?: string }>;
  /** Fields whose change comes later than this page, with the value that must not show yet. */
  not_yet: Record<string, { value: string; at: string }>;
  /** Fields this member ever changes (the ones the check looks at). */
  tracked: string[];
  /** Every value the member's states give to each tracked field. */
  values: Record<string, string[]>;
  /** Why the variant holds: the changes already in force. */
  because: Array<{ at: string; note?: string }>;
}

export interface PageContext {
  page_number: number;
  /** Units the page adapts. */
  units: readonly string[];
  /** Page number that carries each planned claim (from the plan). */
  claim_pages?: ReadonlyMap<string, number>;
}

/** Page number that carries each claim, from an adaptation plan. */
export function claimPages(plan: { pages?: ReadonlyArray<{ page_number: number; claims?: readonly string[] }> }): Map<string, number> {
  const out = new Map<string, number>();
  for (const page of plan?.pages ?? []) for (const id of Array.isArray(page?.claims) ? page.claims : []) if (!out.has(id)) out.set(id, page.page_number);
  return out;
}

/**
 * Expected looks of every cast member that has states, for one page.
 * A state tied to a planned claim follows the claim's PAGE (before it: in force
 * on later pages; on it: happens on this page); otherwise it follows the units.
 */
export function expectedLooks(cast: readonly CastMember[], order: ReadonlyMap<string, number>, page: PageContext): Record<string, ExpectedLook> {
  const positions = page.units.map((u) => positionOf(order, u)).filter((n) => !Number.isNaN(n));
  const out: Record<string, ExpectedLook> = {};
  if (positions.length === 0) return out;
  const lo = Math.min(...positions);
  const hi = Math.max(...positions);
  for (const member of cast) {
    const states = statesOf(member as CastMember & { states?: unknown }, order);
    if (states.length === 0) continue;
    const tracked = [...new Set(states.flatMap((s) => Object.keys(s.set)))];
    const values: Record<string, string[]> = {};
    for (const state of states) for (const [field, value] of Object.entries(state.set)) (values[field] ??= []).push(value);
    const look: ExpectedLook = { variant: {}, changing: {}, not_yet: {}, tracked, values, because: [] };
    for (const state of states) {
      const claimPage = state.claim ? page.claim_pages?.get(state.claim) : undefined;
      const p = positionOf(order, state.at);
      const when: "in_force" | "during" | "later" =
        claimPage !== undefined
          ? claimPage < page.page_number ? "in_force" : claimPage === page.page_number ? "during" : "later"
          : p < lo ? "in_force" : p <= hi ? "during" : "later";
      if (when === "in_force") {
        Object.assign(look.variant, state.set);
        look.because.push({ at: state.at, note: state.note });
      } else if (when === "during") {
        for (const [field, value] of Object.entries(state.set)) {
          const known = look.changing[field];
          if (known) known.afters.push(value);
          else look.changing[field] = { before: look.variant[field] ?? baseValue(member, field), afters: [value], note: state.note };
        }
      } else {
        for (const [field, value] of Object.entries(state.set)) {
          if (!(field in look.not_yet)) look.not_yet[field] = { value, at: state.at };
        }
      }
    }
    out[member.id] = look;
  }
  return out;
}

/** The expected looks that tell the page writer something (a patch in force, or a change on this page). */
export function expectedLooksForPrompt(looks: Record<string, ExpectedLook>): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const [id, look] of Object.entries(looks)) {
    const hasVariant = Object.keys(look.variant).length > 0;
    const hasChange = Object.keys(look.changing).length > 0;
    if (!hasVariant && !hasChange) continue;
    out[id] = {
      ...(hasVariant ? { variant_on_every_panel: look.variant } : {}),
      ...(hasChange
        ? { changes_on_this_page: Object.fromEntries(Object.entries(look.changing).map(([f, c]) => [f, { from: c.before ?? "(base look)", to: c.afters.join(" then "), why: c.note }])) }
        : {}),
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * FIGURE_STATE_MISMATCH: a figure whose variant contradicts the cast member's
 * state on this page. Severity is chosen by the caller (calibrated: see
 * docs/launch/T1-continuity.md).
 */
export function figureStateIssues(
  spec: MangaPageSpec,
  cast: readonly CastMember[],
  looks: Record<string, ExpectedLook>,
  severity: "error" | "warning" = "warning",
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byId = new Map(cast.map((c) => [c.id, c]));
  // Highest step of a change-on-this-page already shown, per character and field.
  const reached = new Map<string, number>();
  for (const panel of spec.panels ?? []) {
    // A flashback shows the past: looks there follow their own time. A panel flagged `vision`
    // (afterlife, dream, memory) shows what is not the story's present: a dead character may be
    // alive there (Q2b, issue #44). Both are skipped.
    if ((panel.fx ?? []).includes("flashback" as never) || panel.vision !== undefined) continue;
    for (const fig of panel.figures ?? []) {
      const expected = looks[fig?.character];
      const member = byId.get(fig?.character);
      if (!expected || !member) continue;
      const variant = (fig.variant ?? {}) as unknown as Record<string, unknown>;
      for (const field of expected.tracked) {
        const actual = typeof variant[field] === "string" ? (variant[field] as string) : baseValue(member, field);
        const change = expected.changing[field];
        const want = expected.variant[field] ?? baseValue(member, field);
        const shows = actual ?? "(base look)";
        const fix = JSON.stringify({ ...expected.variant, ...(expected.variant[field] === undefined && want !== undefined ? { [field]: want } : {}) });
        if (change) {
          const steps = [change.before, ...change.afters];
          const step = steps.indexOf(actual);
          const key = `${fig.character}|${field}`;
          const floor = reached.get(key) ?? 0;
          if (step >= 0 && step >= floor) {
            reached.set(key, step);
            continue;
          }
          issues.push({
            code: "FIGURE_STATE_MISMATCH",
            severity,
            path: `panel ${panel.id} figure ${fig.character}`,
            message:
              step >= 0
                ? `${member.name} changes "${field}" earlier on this page (${change.note ?? "story change"}) and cannot go back: this later panel shows "${shows}". Keep "${steps[floor]}" in every later panel.`
                : `${member.name} must show "${field}" as ${steps.map((v) => `"${v ?? "(base look)"}"`).join(" then ")} on this page (${change.note ?? "story change"}), but this figure shows "${shows}".`,
          });
          continue;
        }
        if (actual === want) continue;
        // Nothing changed yet and the figure shows a value that no state of this member names
        // (eyes "closed" for sleep): that is acting, not a story change.
        if (expected.variant[field] === undefined && actual !== undefined && !(expected.values[field] ?? []).includes(actual)) continue;
        const notYet = expected.not_yet[field];
        const why =
          notYet && actual === notYet.value
            ? `that change does not happen until ${notYet.at}`
            : expected.variant[field] !== undefined
              ? `the story has already changed it${expected.because.length ? ` (${expected.because.map((b) => b.note ?? b.at).join("; ")})` : ""}`
              : "it has not changed yet";
        issues.push({
          code: "FIGURE_STATE_MISMATCH",
          severity,
          path: `panel ${panel.id} figure ${fig.character}`,
          message: `${member.name} must show "${field}": "${want ?? "(base look)"}" here, but this figure shows "${shows}": ${why}. Set the figure's variant to ${fix} (repeat it in every panel).`,
        });
      }
    }
  }
  return issues;
}

const VISION_WORDS = /afterlife|dream|memory|memories|paradise|heaven|vision/i;

/**
 * Guard for the `vision` panel flag (Q2b, issue #44). The flag exempts a panel from
 * FIGURE_STATE_MISMATCH, so it must not become a way around the check:
 * - VISION_OVERUSED: on a page of 2+ panels, more than half of the panels are flagged. It is an
 *   error ONLY when the planned beat names no afterlife, dream, memory, paradise, heaven or vision
 *   (the plan never asked for a vision: the abuse case). When the beat names a vision, a page may
 *   flag every panel (a last page can be one vision) and nothing is reported. When the planned
 *   beat is not available, it is a warning.
 * - VISION_NOT_PLANNED (warning): a panel is flagged but the planned beat of the page does not
 *   name an afterlife, dream, memory, paradise, heaven or vision. The adaptation-plan skill
 *   tells the plan to write that word in the beat. A warning until calibrated on judged pages.
 */
export function visionIssues(spec: MangaPageSpec, plannedBeat: string | undefined): ValidationIssue[] {
  const panels = spec.panels ?? [];
  const flagged = panels.filter((p) => p?.vision !== undefined);
  if (flagged.length === 0) return [];
  const issues: ValidationIssue[] = [];
  const beatNamesVision = plannedBeat !== undefined && VISION_WORDS.test(plannedBeat);
  if (panels.length >= 2 && flagged.length * 2 > panels.length && !beatNamesVision) {
    issues.push({
      code: "VISION_OVERUSED",
      severity: plannedBeat === undefined ? "warning" : "error",
      path: "page.panels",
      message: `${flagged.length} of ${panels.length} panels set "vision" (${flagged.map((p) => p.id).join(", ")}). "vision" is only for the panels that show an afterlife, dream or memory, and the planned beat of this page does not name one. Remove it from the panels that show the story's present, and show each figure as the story state says there.`,
    });
  }
  if (plannedBeat !== undefined && !VISION_WORDS.test(plannedBeat)) {
    issues.push({
      code: "VISION_NOT_PLANNED",
      severity: "warning",
      path: `panel ${flagged[0].id}`,
      message: `"vision" is set, but the planned beat of this page does not name an afterlife, dream, memory, paradise, heaven or vision. Set "vision" only where the plan says the page shows one.`,
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Understanding side: shape and drawability of `states`
// ---------------------------------------------------------------------------

const KNOWN_VALUES: Record<string, readonly string[]> = {
  material: C.MATERIALS,
  outfit_tone: C.TONES,
  hair_tone: C.TONES,
  tone: C.TONES,
};

/** The subject dies (not "the dead Swallow"). */
const DIES = /\b(?:dies|died|drown(?:s|ed)?|killed|perish(?:es|ed)?|(?:found|lying|lies|lay|is|was|are|were) dead)\b/i;

/**
 * Checks on the `states` of the cast of an understanding.
 * - STATE_INVALID (error): the entry cannot be used (no known unit, no patch).
 * - STATE_NOT_DRAWABLE (warning): the renderer has no such look field or value today;
 *   the page cannot draw it. Read from the renderer catalog, so new fields pass.
 * - STATE_ORDER (warning): states are not in source order.
 * - STATE_DEATH_MISSING (warning): a claim says a cast member dies but it has no
 *   state with eyes "dead" (or a changed look).
 */
export function stateIssues(value: unknown, unitIds: readonly string[], order: ReadonlyMap<string, number>): ValidationIssue[] {
  const u = value as { cast?: unknown; claims?: unknown };
  if (!Array.isArray(u?.cast)) return [];
  const known = new Set(unitIds);
  const cat = catalog().variants;
  const issues: ValidationIssue[] = [];
  const claims = (Array.isArray(u.claims) ? u.claims : []) as Claim[];
  for (const raw of u.cast as Array<CastMember & { states?: unknown }>) {
    if (!raw || typeof raw !== "object") continue;
    const path = `cast ${raw.id ?? "?"}`;
    const kind = (raw.look as { kind?: string } | undefined)?.kind ?? "";
    const allowed = (cat.fields[kind] as readonly string[] | undefined) ?? [];
    if (raw.states !== undefined && !Array.isArray(raw.states)) {
      issues.push({ code: "STATE_INVALID", severity: "error", path, message: `"states" must be a list of {"at": "<unit id>", "set": {"eyes": "blind"}, "note": "..."}.` });
      continue;
    }
    let last = -Infinity;
    (raw.states ?? []).forEach((entry: unknown, i: number) => {
      const e = entry as Partial<StateChange> | null;
      const where = `${path} states[${i}]`;
      if (!e || typeof e.at !== "string" || !known.has(e.at)) {
        issues.push({ code: "STATE_INVALID", severity: "error", path: where, message: `"at" must be the id of the unit where the change happens (one of the unit ids you were given), got ${JSON.stringify(e?.at)}.` });
        return;
      }
      if (typeof e.claim === "string" && claims.length > 0 && !claims.some((c) => c?.id === e.claim)) {
        issues.push({ code: "STATE_CLAIM_UNKNOWN", severity: "warning", path: where, message: `"claim" ${e.claim} is not a claim id; use the claim that tells this change, or leave "claim" out.` });
      }
      if (!e.set || typeof e.set !== "object" || Array.isArray(e.set) || Object.keys(e.set).length === 0 || Object.values(e.set).some((v) => typeof v !== "string")) {
        issues.push({ code: "STATE_INVALID", severity: "error", path: where, message: `"set" must be a look patch of string values, for example {"eyes": "blind"} or {"material": "stone"}.` });
        return;
      }
      const p = positionOf(order, e.at);
      if (p < last) issues.push({ code: "STATE_ORDER", severity: "warning", path: where, message: `states must be listed in source order; ${e.at} comes before the state above it.` });
      last = Math.max(last, p);
      for (const [field, v] of Object.entries(e.set)) {
        const values = field === "eyes" ? (cat.eyes as readonly string[]) : KNOWN_VALUES[field];
        if (!allowed.includes(field) || (values && !values.includes(v))) {
          issues.push({
            code: "STATE_NOT_DRAWABLE",
            severity: "warning",
            path: where,
            message: `the renderer cannot draw ${JSON.stringify({ [field]: v })} on a ${kind || "?"} figure today (${allowed.includes(field) ? `"${field}" accepts: ${(values ?? []).join(", ")}` : `a ${kind} variant may set: ${allowed.join(", ") || "nothing"}`}). It stays on record; pages will tell it in words.`,
          });
        }
      }
    });
    // A death the claims state, with no state for it.
    const states = statesOf(raw, order);
    const nameWords = `${raw.name ?? ""}`.toLowerCase().replace(/^the\s+/, "").split(/\s+/).filter((w) => w.length > 2);
    // The claim's subject (named before the death verb, outside quotes) is the one who dies.
    const dies = ["human", "bird", "animal", "insect"].includes(kind)
      ? claims.find((claim) => {
          if (claim?.kind !== "event" || !(raw.sections ?? []).includes(claim.section_id) || nameWords.length === 0) return false;
          const text = (claim.text ?? "").replace(/["\u201c][^"\u201d]*["\u201d]|'[^']{8,}'/g, " ").toLowerCase();
          const verb = DIES.exec(text);
          if (!verb) return false;
          const head = text.slice(0, verb.index);
          return nameWords.every((w) => new RegExp(`\\b${w}\\b(?!['\u2019]s)`).test(head));
        })
      : undefined;
    if (dies && !states.some((s) => s.set.eyes === "dead")) {
      issues.push({ code: "STATE_DEATH_MISSING", severity: "warning", path, message: `claim ${dies.id} says ${raw.name} dies, but ${raw.id} has no state {"at": <unit of the death>, "set": {"eyes": "dead"}}. Later pages need it to draw the body.` });
    }
  }
  return issues;
}
