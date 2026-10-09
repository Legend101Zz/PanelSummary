/**
 * Claims fully shown (acceptance run 8, "claims only partly shown"): a death
 * implied but never said, a climax placed before its set-up.
 *
 * - PLAN_ORDER (plan, warning): pages of one section keep the source order of
 *   their claims, unless the page's beat says "flashback".
 * - CLAIM_ORDER (page, warning): inside a page, the panels that carry two
 *   claims keep the source order of those claims (set-up before climax).
 * - CLAIM_EVENT_UNSTATED (page, warning): a core event that is a death or a
 *   marriage must be SAID in the page's lettering. A "dead" eye state or a
 *   closed-eyed face is not enough for a reader.
 *
 * All three are warnings until calibration earns more: see docs/launch/T1-continuity.md.
 */
import type { AdaptationPlan, Claim, MangaPageSpec, ValidationIssue } from "@panelsummary/manga-render";

import { positionOf } from "./continuity.js";

/** Where a claim happens in the book: its earliest source (unit position, then pdf page). */
export function claimPosition(claim: Pick<Claim, "source">, order: ReadonlyMap<string, number>): [number, number] | undefined {
  const spots = (claim.source ?? [])
    .map((s) => [positionOf(order, s.unit), Number(s.page)] as [number, number])
    .filter(([u]) => !Number.isNaN(u))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return spots[0];
}

const before = (a: [number, number], b: [number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

/** A page that adapts earlier text than the page before it, in the same section, with no flashback. */
export function planOrderIssues(plan: AdaptationPlan, claims: readonly Claim[], order: ReadonlyMap<string, number>): ValidationIssue[] {
  const byId = new Map(claims.map((c) => [c.id, c]));
  const issues: ValidationIssue[] = [];
  const pages = (Array.isArray(plan?.pages) ? plan.pages : []).filter((page) => page && Array.isArray(page.claims));
  let highest: { page: number; at: [number, number]; claim: string } | undefined;
  let section = "";
  for (const page of pages) {
    if (page.section_id !== section) {
      section = page.section_id;
      highest = undefined;
    }
    const spots = (page.claims ?? [])
      .map((id) => ({ id, at: byId.get(id) ? claimPosition(byId.get(id)!, order) : undefined }))
      .filter((x): x is { id: string; at: [number, number] } => x.at !== undefined);
    if (spots.length === 0) continue;
    const earliest = spots.reduce((a, b) => (before(b.at, a.at) ? b : a));
    const latest = spots.reduce((a, b) => (before(a.at, b.at) ? b : a));
    const flashback = /flash-?back/i.test(page.beat ?? "");
    // Compare by unit: two claims of one unit may sit on either side of a page break.
    if (highest && !flashback && earliest.at[0] < highest.at[0]) {
      issues.push({
        code: "PLAN_ORDER",
        severity: "warning",
        path: `page ${page.page_number}`,
        message: `page ${page.page_number} carries ${earliest.id} (from unit position ${earliest.at[0]}), which the book tells BEFORE ${highest.claim} on page ${highest.page}. Keep the book's order (set-up before climax), or write "flashback" in the beat if the order is deliberate.`,
      });
    }
    if (!flashback && (!highest || before(highest.at, latest.at))) highest = { page: page.page_number, at: latest.at, claim: latest.id };
  }
  return issues;
}

/** Panels that carry two claims keep the source order of the claims. */
export function claimOrderIssues(spec: MangaPageSpec, claims: readonly Claim[], order: ReadonlyMap<string, number>): ValidationIssue[] {
  const map = Array.isArray(spec.claim_map) ? spec.claim_map : [];
  const panelIndex = new Map((spec.panels ?? []).map((p, i) => [p.id, i] as [string, number]));
  const rows = map
    .map((entry) => {
      const claim = claims.find((c) => c.id === entry?.claim);
      const at = claim ? claimPosition(claim, order) : undefined;
      const idx = (Array.isArray(entry?.panels) ? entry.panels : []).map((id) => panelIndex.get(id)).filter((n): n is number => n !== undefined);
      return at && idx.length ? { id: entry.claim, at, first: Math.min(...idx), last: Math.max(...idx) } : undefined;
    })
    .filter((r): r is { id: string; at: [number, number]; first: number; last: number } => Boolean(r));
  const issues: ValidationIssue[] = [];
  for (const a of rows) {
    for (const b of rows) {
      // a happens earlier in the book than b, but the page first shows b, and only later a.
      if (a !== b && before(a.at, b.at) && a.at[0] !== b.at[0] && b.last < a.first) {
        issues.push({
          code: "CLAIM_ORDER",
          severity: "warning",
          path: "page.claim_map",
          message: `${b.id} (later in the book) is shown in panels before ${a.id} (earlier in the book). Show the set-up ${a.id} first, then ${b.id}, unless this is a deliberate flashback.`,
        });
      }
    }
  }
  return issues;
}

/** Events a reader must be TOLD, not left to guess from a picture. */
export const KEY_EVENTS: Array<{ name: string; claim: RegExp; said: RegExp }> = [
  { name: "death", claim: /\b(?:di(?:es|ed|e)|dead|death|drown(?:s|ed|ing)?|kill(?:s|ed)?|perish(?:es|ed)?|slain)\b/i, said: /\b(?:di(?:es|ed|e|ing)|dead|death|drown\w*|kill\w*|perish\w*|slain|lifeless|lay still|breathe[sd]? (?:his|her|its) last)\b/i },
  { name: "marriage", claim: /\b(?:married|marries|marry|marriage|wedding|wedded)\b/i, said: /\b(?:married|marries|marry|marriage|wedding|wedded|wed|bride|bridegroom|husband|wife)\b/i },
];

function lettering(spec: MangaPageSpec): string {
  return (spec.panels ?? []).flatMap((p) => (p.text ?? []).map((t) => (typeof t?.text === "string" ? t.text : ""))).join(" \n ");
}

export function claimEventIssues(spec: MangaPageSpec, claims: readonly Claim[]): ValidationIssue[] {
  const text = lettering(spec);
  const issues: ValidationIssue[] = [];
  for (const claim of claims) {
    if (claim.kind !== "event" || claim.importance === "detail") continue;
    for (const event of KEY_EVENTS) {
      if (!event.claim.test(claim.text ?? "") || event.said.test(text)) continue;
      issues.push({
        code: "CLAIM_EVENT_UNSTATED",
        severity: "warning",
        path: "page.claims",
        message: `claim ${claim.id} is a ${event.name}, but no caption or line on this page says so. A picture alone leaves it implied: state it in a caption or a line, in the panel that shows it.`,
      });
    }
  }
  return issues;
}
