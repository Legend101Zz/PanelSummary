/**
 * Repair hints for the page writer (track F1, docs/launch/F1-dense-page.md).
 *
 * Page 12 of the two-tale test book failed both attempts in two live runs. The writer fixed one
 * error per try and made another: room errors (TEXT_DOES_NOT_FIT, BALLOON_TALL, TAIL_CROSSES_*,
 * KEY_PROP_COVERED), then SPEAKER_TOO_SMALL, then LAYOUT_PANEL_ASPECT. Each of these messages
 * says "give this panel more room", but the cause was on the page level: about nine lines in
 * four panels. Two helpers here say so, in words the writer can act on:
 *
 *  - `crowdingAdvice`: many room errors on a page with few panels -> use a template with more
 *    panels, fewer balloons per panel, cut repeated lines.
 *  - `RepairTracker`: the last tries each had only a few errors, but the errors changed ->
 *    stop patching one error at a time; fix every named code in one edit.
 *
 * Both return WARNINGS (they carry advice, they never block a page that has no errors).
 */
import type { MangaPageSpec, ValidationIssue } from "@panelsummary/manga-render";
import { catalog } from "@panelsummary/manga-render";

/** Errors that mean "the lettering does not have room in its panel". */
export const ROOM_CODES: ReadonlySet<string> = new Set([
  "TEXT_DOES_NOT_FIT",
  "BALLOON_TALL",
  "TAIL_CROSSES_TEXT",
  "TAIL_CROSSES_FACE",
  "KEY_PROP_COVERED",
]);

/** Room errors from this many different texts make a page-level problem, not a one-panel one. */
export const CROWDING_MIN_ERRORS = 2;
/** Texts per panel from which a room error is blamed on the page, not on one line. */
export const CROWDING_TEXTS_PER_PANEL = 2;
/** A page has at most this many panels (the largest template). */
const MAX_PANELS = 7;
/** Rejected tries in a row with only a few, changing errors before the loop advice shows. */
export const LOOP_MIN_ROUNDS = 3;
export const LOOP_MAX_ERRORS = 3;

const errors = (issues: readonly ValidationIssue[]) => issues.filter((i) => i.severity === "error");

function templatesWithMorePanels(panels: number): string[] {
  const list = catalog().templates.filter((t) => t.slots > panels && t.slots <= Math.min(MAX_PANELS, panels + 2));
  return list.map((t) => `${t.id} (${t.slots} panels)`);
}

/** Templates with exactly `panels` slots (for LAYOUT_PANEL_ASPECT: swap the authored tree for one). */
export function templatesFor(panels: number): string[] {
  return catalog().templates.filter((t) => t.slots === panels).map((t) => t.id);
}

/** Add a ready-made fix to LAYOUT_PANEL_ASPECT: the templates with the same panel count. */
export function explainAspect(issue: ValidationIssue, spec: MangaPageSpec): ValidationIssue {
  if (issue.code !== "LAYOUT_PANEL_ASPECT") return issue;
  const count = Array.isArray(spec.panels) ? spec.panels.length : 0;
  const ids = templatesFor(count);
  const hint = ids.length
    ? ` These ready templates have exactly ${count} panels and no sliver: ${ids.join(", ")}. Switch to one of them ({"layout": {"template": "<id>"}}) instead of fixing the sizes by hand: a bigger panel for a long line makes its neighbour thinner.`
    : ` A page with ${count} panels has no ready template; use 1 to 7 panels.`;
  return { ...issue, message: `${issue.message}${hint}` };
}

/**
 * One warning when the room errors point at the page, not at one line: the page asks too much of
 * too few panels.
 */
export function crowdingAdvice(spec: MangaPageSpec, issues: readonly ValidationIssue[]): ValidationIssue | undefined {
  const room = errors(issues).filter((i) => ROOM_CODES.has(i.code));
  if (room.length < CROWDING_MIN_ERRORS) return undefined;
  const panels = Array.isArray(spec.panels) ? spec.panels : [];
  if (panels.length === 0) return undefined;
  const texts = panels.flatMap((p) => p.text ?? []);
  const words = texts.reduce((n, t) => n + String(t.text ?? "").trim().split(/\s+/).filter(Boolean).length, 0);
  const touched = new Set(room.map((i) => /panel (\S+)/.exec(i.path)?.[1]).filter(Boolean));
  const crowded = texts.length / panels.length >= CROWDING_TEXTS_PER_PANEL || touched.size >= 2;
  if (!crowded) return undefined;
  const more = templatesWithMorePanels(panels.length);
  const codes = [...new Set(room.map((i) => i.code))].join(", ");
  const moves = [
    more.length
      ? `Use a template with more panels: ${more.join(", ")}. Give each long line a panel of its own.`
      : `The page already has ${panels.length} panels, the most a page holds. Cut words instead.`,
    "Keep at most 2 balloons and about 12 words in a panel.",
    "Cut a long speech with \"...\" (a quote may be cut) or split it over two panels; show the listener in between.",
    "When the book repeats a line at several places (the same request three times), letter it in full once. For the repeats use a short cut of it, or let the picture show it.",
  ];
  return {
    code: "PAGE_TOO_FULL",
    severity: "warning",
    path: "page",
    message: `${room.length} room errors (${codes}) on ${touched.size || "several"} panels: this page puts ${texts.length} texts (${words} words) in ${panels.length} panels. Fixing one panel at a time moves the problem to the next panel, so change the page, not the panel. ${moves.join(" ")}`,
  };
}

const MOVES: Record<string, string> = {
  LAYOUT_PANEL_ASPECT: "use a ready template for the panel count (not an authored tree)",
  TEXT_DOES_NOT_FIT: "cut the line to the number of words the error names, or move words to another panel",
  BALLOON_TALL: "shorten the balloon or give it a panel with more width",
  TAIL_CROSSES_TEXT: "put at most 2 texts in the panel, or move one to another panel",
  TAIL_CROSSES_FACE: "put the speakers left to right in speaking order",
  KEY_PROP_COVERED: "shorten the text or show the object in an insert panel",
  SPEAKER_TOO_SMALL: "draw the speaker in a medium or close shot (a small creature also needs depth \"fore\"), or move the line to a caption",
  CHARACTER_NOT_INTRODUCED: "name the character in a caption (a name tag with \"about\")",
  QUOTE_NOT_IN_SOURCE: "copy the book's words exactly, or label the line \"paraphrase\" with a source",
};

/**
 * Remembers the error codes of every rejected try. When the last rounds each have only a few
 * errors but the codes keep changing, the writer is whack-a-mole patching: say so once per round.
 */
export class RepairTracker {
  private readonly rounds: string[][] = [];

  /** Record a try; returns a warning when the try is part of a patching loop. */
  record(issues: readonly ValidationIssue[]): ValidationIssue | undefined {
    const codes = [...new Set(errors(issues).map((i) => i.code))].sort();
    if (codes.length === 0) return undefined;
    this.rounds.push(codes);
    const recent = this.rounds.slice(-LOOP_MIN_ROUNDS);
    if (recent.length < LOOP_MIN_ROUNDS) return undefined;
    if (!recent.every((r) => r.length <= LOOP_MAX_ERRORS)) return undefined;
    const changes = recent.slice(1).filter((r, i) => r.join() !== recent[i].join()).length;
    if (changes < 2) return undefined;
    const seen = [...new Set(recent.flat())];
    const moves = seen.map((code) => `${code}: ${MOVES[code] ?? "see its message"}`).join("; ");
    return {
      code: "REPAIR_LOOP",
      severity: "warning",
      path: "page",
      message: `The last ${recent.length} tries each had only ${LOOP_MAX_ERRORS} errors or fewer, but the errors changed (${recent.map((r) => r.join("+")).join(" -> ")}): fixing one makes the next. Before you submit again, check ALL of these together: ${moves}. If a fix for one clashes with another, change the structure (fewer words, more panels, a closer shot) and not one detail.`,
    };
  }
}
