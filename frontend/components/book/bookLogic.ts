// Pure logic of the book page (the control room). No React, no fetch: the page and its parts call these.
import type { BookDetail, BookSection, EditionDetail, EditionPageSummary, EditionScope, Preflight, Timings } from "../../lib/api";
import { formatPageList } from "../ui/toneStripLogic";
import { plural, type StopStage } from "../../lib/words";

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/** Seconds a run has been going: the time of earlier jobs (a pause before a resume does not count) plus the current job. */
export function runningSeconds(edition: Pick<EditionDetail, "created_at" | "active_seconds" | "job">, now: number): number | null {
  const base = edition.active_seconds ?? 0;
  const jobStart = ms(edition.job?.created_at) ?? ms(edition.created_at);
  if (jobStart === null) return null;
  return Math.max(0, base + (now - jobStart) / 1000);
}

/** "Took ...": active_seconds when the server recorded it, else finished_at - created_at (v0.1 editions). */
export function tookSeconds(edition: Pick<EditionDetail, "created_at" | "finished_at" | "active_seconds" | "job">): number | null {
  if (edition.active_seconds) return edition.active_seconds;
  const end = ms(edition.finished_at) ?? ms(edition.job?.finished_at);
  const start = ms(edition.created_at);
  return end !== null && start !== null ? Math.max(0, (end - start) / 1000) : null;
}

/** Seconds from the start of the run to page 1. page_1_at, with a fallback to first_page_at (then the page is not page 1: `exact` is false). */
export function firstPageSeconds(edition: { created_at: string; timings?: Timings }): { seconds: number; exact: boolean } | null {
  const t = edition.timings ?? {};
  const at = ms(t.page_1_at);
  const fallback = ms(t.first_page_at);
  const start = ms(t.generate_started_at) ?? ms(edition.created_at);
  if (start === null) return null;
  const end = at ?? fallback;
  if (end === null) return null;
  return { seconds: Math.max(0, (end - start) / 1000), exact: at !== null };
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export interface PageCounts {
  drawn: number;
  failed: number;
  drawing: number;
  waiting: number;
  total: number;
}

export function pageCounts(pages: readonly EditionPageSummary[], total: number): PageCounts {
  const c = { drawn: 0, failed: 0, drawing: 0, waiting: 0, total: Math.max(total, pages.length) };
  for (const p of pages) {
    if (p.status === "accepted") c.drawn += 1;
    else if (p.status === "failed") c.failed += 1;
    else if (p.status === "drawing") c.drawing += 1;
    else c.waiting += 1;
  }
  c.waiting += Math.max(0, c.total - pages.length);
  return c;
}

const pageNoun = (n: number) => (n === 1 ? "page" : "pages");

/** The Pages grid line. A repeated state is said once: "6 of 16 pages ready. Page 7 is drawing. Pages 8 to 16 are waiting." */
export function pagesSummary(pages: readonly EditionPageSummary[], total: number): string {
  const t = Math.max(total, pages.length);
  if (!t) return "";
  const by = (s: string) => pages.filter((p) => p.status === s).map((p) => p.page_number);
  const drawn = by("accepted").length;
  const failed = by("failed");
  const drawing = by("drawing");
  const waiting = pages.filter((p) => p.status === "pending").map((p) => p.page_number);
  const parts = [`${drawn} of ${plural(t, "page")} ready.`];
  if (failed.length) parts.push(`${capital(pageNoun(failed.length))} ${formatPageList(failed)} could not be drawn.`);
  if (drawing.length) parts.push(`${capital(pageNoun(drawing.length))} ${formatPageList(drawing)} ${drawing.length === 1 ? "is" : "are"} drawing.`);
  if (waiting.length) parts.push(`${capital(pageNoun(waiting.length))} ${formatPageList(waiting)} ${waiting.length === 1 ? "is" : "are"} waiting.`);
  return parts.join(" ");
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The pages grouped by section, for the beats list. Keeps page order; a section is a run of pages. */
export function groupBySection(pages: readonly EditionPageSummary[]): { section_id: string; pages: EditionPageSummary[] }[] {
  const out: { section_id: string; pages: EditionPageSummary[] }[] = [];
  for (const p of pages) {
    const last = out[out.length - 1];
    if (last && last.section_id === p.section_id) last.pages.push(p);
    else out.push({ section_id: p.section_id, pages: [p] });
  }
  return out;
}

/** The manga page range of each section once the plan exists. Section id -> [first, last]. */
export function mangaRanges(pages: readonly EditionPageSummary[]): Map<string, [number, number]> {
  const m = new Map<string, [number, number]>();
  for (const p of pages) {
    const r = m.get(p.section_id);
    if (!r) m.set(p.section_id, [p.page_number, p.page_number]);
    else {
      r[0] = Math.min(r[0], p.page_number);
      r[1] = Math.max(r[1], p.page_number);
    }
  }
  return m;
}

/** "3–9" with an en dash; "3" when one page. */
export const pdfRange = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);

// ---------------------------------------------------------------------------
// Stop stage of a failed run
// ---------------------------------------------------------------------------

/** Which stage a failed run stopped in. The provider stop says it; else the error text; else what exists. */
export function failedStage(e: Pick<EditionDetail, "error" | "has_plan" | "page_total" | "provider_stop" | "pages">): StopStage {
  const stage = e.provider_stop?.stage;
  if (stage === "understanding") return "reading";
  if (stage === "plan") return "planning";
  if (stage === "drawing") return "drawing";
  const text = e.error ?? "";
  if (/^understanding/i.test(text)) return "reading";
  if (/^plan/i.test(text)) return "planning";
  if (/^draw|page \d+/i.test(text)) return "drawing";
  if (e.has_plan || e.page_total > 0 || e.pages.length > 0) return "drawing";
  return "reading";
}

// ---------------------------------------------------------------------------
// Choose sections (6A, #40)
// ---------------------------------------------------------------------------

export type ScopeMode = "whole" | "sections" | "range";

export interface Choice {
  mode: ScopeMode;
  sectionIds: string[];
  from: string;
  to: string;
}

export const WHOLE_BOOK: Choice = { mode: "whole", sectionIds: [], from: "", to: "" };

export interface RangeCheck {
  ok: boolean;
  from: number | null;
  to: number | null;
  /** Written hint when not ok. */
  hint: string | null;
}

const asPage = (s: string): number | null => {
  const n = Number(s);
  return s.trim() !== "" && Number.isInteger(n) ? n : null;
};

/** A page range must have both ends, whole numbers, first <= last, and sit inside the PDF. */
export function checkRange(from: string, to: string, pdfPages: number): RangeCheck {
  const a = asPage(from);
  const b = asPage(to);
  if (a === null || b === null) return { ok: false, from: a, to: b, hint: "Write the first and the last PDF page." };
  if (a < 1 || b > pdfPages) return { ok: false, from: a, to: b, hint: `The range must be inside the PDF: pages 1 to ${pdfPages}.` };
  if (a > b) return { ok: false, from: a, to: b, hint: "The first page comes after the last page." };
  return { ok: true, from: a, to: b, hint: null };
}

/** The scope a choice stands for. null = the whole book. undefined = the choice is not complete (Generate off). */
export function scopeOf(choice: Choice, pdfPages: number): EditionScope | null | undefined {
  if (choice.mode === "whole") return null;
  if (choice.mode === "sections") return choice.sectionIds.length ? { section_ids: choice.sectionIds } : undefined;
  const r = checkRange(choice.from, choice.to, pdfPages);
  return r.ok ? { pdf_page_from: r.from as number, pdf_page_to: r.to as number } : undefined;
}

export interface Usage {
  words: number;
  pages: number;
  /** True when the words of a page range are an estimate (a unit that crosses pages is spread evenly). */
  estimated: boolean;
}

/** How much of the limit a choice uses, from the book data (no request). Sections: their words and the PDF pages they cover. */
export function usageOf(book: Pick<BookDetail, "sections" | "page_words" | "page_count" | "word_count">, scope: EditionScope | null | undefined): Usage {
  if (!scope) return { words: book.word_count, pages: book.page_count, estimated: false };
  if ("section_ids" in scope) {
    const chosen = book.sections.filter((s) => scope.section_ids.includes(s.id));
    const pages = new Set<number>();
    for (const s of chosen) for (let p = s.page_start; p <= s.page_end; p++) pages.add(p);
    return { words: chosen.reduce((n, s) => n + s.word_count, 0), pages: pages.size, estimated: false };
  }
  const pw = book.page_words ?? [];
  let words = 0;
  for (let p = scope.pdf_page_from; p <= scope.pdf_page_to; p++) words += pw[p - 1] ?? 0;
  return { words: Math.round(words), pages: scope.pdf_page_to - scope.pdf_page_from + 1, estimated: true };
}

export interface LimitState {
  inside: boolean;
  overWords: number;
  overPages: number;
}

export function limitState(u: Usage, limits: { max_pdf_pages: number; max_source_words: number }): LimitState {
  const overWords = Math.max(0, u.words - limits.max_source_words);
  const overPages = Math.max(0, u.pages - limits.max_pdf_pages);
  return { inside: overWords === 0 && overPages === 0, overWords, overPages };
}

/** The sentence under the estimate: "Draws 1 of 5 sections: The Happy Prince." */
export function drawsLine(book: Pick<BookDetail, "sections" | "page_count">, scope: EditionScope | null | undefined): string {
  if (!scope) return book.sections.length > 0 ? `Draws the whole book: ${plural(book.sections.length, "section")}.` : "Draws the whole book.";
  if ("section_ids" in scope) {
    const chosen = book.sections.filter((s) => scope.section_ids.includes(s.id));
    return `Draws ${chosen.length} of ${plural(book.sections.length, "section")}: ${chosen.map((s) => s.title).join(", ")}.`;
  }
  return `Draws PDF pages ${pdfRange(scope.pdf_page_from, scope.pdf_page_to)}.`;
}

/** Toggle one section. Sections stay in book order. */
export function toggleSection(ids: readonly string[], id: string, sections: readonly BookSection[]): string[] {
  const set = new Set(ids);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return sections.filter((s) => set.has(s.id)).map((s) => s.id);
}

/** Reasons Generate is off for a book, for the line beside it. null = not off. */
export function generateOffReason(args: { bookStatus: string; blocked: boolean; choiceIncomplete: boolean; overLimit: boolean }): string | null {
  if (args.bookStatus === "failed") return "Off because the PDF has no text.";
  if (args.bookStatus !== "parsed") return "Available when the PDF is read.";
  if (args.overLimit) return "Off because this choice is over the limit.";
  if (args.blocked) return "Off because the book is over the limit.";
  if (args.choiceIncomplete) return "Choose what to draw first.";
  return null;
}

// ---------------------------------------------------------------------------
// Action errors
// ---------------------------------------------------------------------------

export type ActionKind = "generate" | "cancel" | "resume" | "retry" | "approve" | "redraw";

/** The text of an action error: what failed, the server reason, then the next step. Shape is the same for every action. */
export function actionErrorText(kind: ActionKind, reason: string, status: number | null, page?: number): string {
  const what =
    kind === "generate"
      ? "Generate did not start."
      : kind === "cancel"
        ? "Drawing could not be stopped."
        : kind === "approve"
          ? "Drawing could not be started."
          : kind === "redraw"
            ? `Page ${page ?? ""} could not be drawn again.`.replace("Page  ", "The page ")
            : "Drawing could not be resumed.";
  const next =
    status === 0
      ? " Check that the server is running, then try again."
      : kind === "generate" && (status === 422 || status === 400 || status === 409)
        ? " Nothing was started and nothing was spent. Choose a different book, or change the book and try again."
        : " Try again in a moment.";
  // No connection: the next step already says what is wrong, so the raw reason is not repeated.
  const why = status !== 0 && reason.trim() ? ` ${reason.trim().replace(/\.?$/, ".")}` : "";
  return `${what}${why}${next}`.replace(/\s+/g, " ");
}
