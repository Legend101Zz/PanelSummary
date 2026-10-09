/** Plain-language wording for statuses, shared by the shelf, book page and reader. */
import type { Book, EditionDetail, EditionPageSummary, EditionStatus, Fidelity, LibraryBook, Preflight, ProviderStop, Range, TextKind } from "./api";

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export type Tone = "pencil" | "ink" | "redpen" | "quiet";

/** Short status for the obi band on a cover. */
export function shelfStatus(book: LibraryBook): { text: string; tone: Tone } {
  if (book.status === "failed") return { text: "Couldn't read this PDF", tone: "redpen" };
  if (book.status !== "parsed") return { text: "Reading the PDF", tone: "pencil" };
  const e = book.latest_edition;
  if (!e) return { text: "Not drawn yet", tone: "quiet" };
  switch (e.status) {
    case "queued":
      return { text: "Starting", tone: "pencil" };
    case "understanding":
      return { text: "Reading the book", tone: "pencil" };
    case "planning":
      return { text: "Planning pages", tone: "pencil" };
    case "drawing":
      return { text: `${e.pages_accepted} of ${e.page_total} pages drawn`, tone: "pencil" };
    case "complete":
      return { text: `${plural(e.page_total, "page")}`, tone: "ink" };
    case "completed_with_failures": {
      const missing = Math.max(0, e.page_total - e.pages_accepted);
      return { text: `${e.pages_accepted} of ${e.page_total} drawn, ${missing} missing`, tone: "redpen" };
    }
    case "cancelled":
      return { text: e.page_total ? `Stopped at ${e.pages_accepted} of ${e.page_total} pages` : "Stopped before drawing", tone: "quiet" };
    case "failed":
      if (e.provider_stop) return { text: `${providerStopShort(e.provider_stop.code)}, ${e.pages_accepted} of ${e.page_total} drawn`, tone: "redpen" };
      return { text: "Drawing stopped", tone: "redpen" };
  }
}

/** A short plain reason for a provider stop, for the shelf band and the status line. */
export function providerStopShort(code: string | null | undefined): string {
  switch (code) {
    case "PROVIDER_LIMIT":
      return "MiniMax limit reached";
    case "PROVIDER_AUTH":
      return "MiniMax refused the key";
    default:
      return "MiniMax not answering";
  }
}

export function stageLine(status: EditionStatus, pages: EditionPageSummary[], total: number): string {
  switch (status) {
    case "queued":
      return "Waiting to start";
    case "understanding":
      return "Reading the book";
    case "planning":
      return "Planning the pages";
    case "drawing": {
      const drawing = pages.filter((p) => p.status === "drawing").map((p) => p.page_number);
      const next = drawing[0] ?? pages.find((p) => p.status === "pending")?.page_number;
      if (drawing.length > 1) return `Drawing pages ${listNumbers(drawing)} of ${total}`;
      return next ? `Drawing page ${next} of ${total}` : `Finishing ${plural(total, "page")}`;
    }
    case "complete":
      return `All ${plural(total, "page")} are drawn`;
    case "completed_with_failures": {
      const missing = pages.filter((p) => p.status !== "accepted").length;
      return missing > 0 ? `Finished, but ${plural(missing, "page")} ${missing === 1 ? "is" : "are"} missing` : "Finished, with pages missing";
    }
    case "cancelled":
      return "Drawing stopped";
    case "failed":
      return "Drawing stopped with an error";
  }
}

export function listNumbers(ns: number[]): string {
  if (ns.length <= 1) return ns.join("");
  return `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`;
}

export function editionSummary(edition: EditionDetail): string {
  const failed = edition.pages.filter((p) => p.status === "failed").length;
  const ready = edition.pages.filter((p) => p.status === "accepted").length;
  const total = edition.page_total || edition.pages.length;
  if (!total) return "";
  const parts = [`${ready} of ${plural(total, "page")} ready`];
  if (failed) parts.push(`${plural(failed, "page")} could not be drawn`);
  return `${parts.join(". ")}.`;
}

export function bookFacts(book: Book): string {
  const bits = [plural(book.page_count, "page")];
  if (book.section_count) bits.push(plural(book.section_count, "section"));
  if (book.word_count) bits.push(plural(book.word_count, "word"));
  return bits.join(", ");
}

export const FIDELITY_LABEL: Record<Fidelity, string> = {
  quote: "Quoted",
  paraphrase: "Paraphrased",
  dramatized: "Dramatized",
  metaphor: "Illustrative metaphor",
};

export const FIDELITY_HINT: Record<Fidelity, string> = {
  quote: "The book's own words.",
  paraphrase: "The book's meaning, reworded.",
  dramatized: "Invented for the scene; the book implies it.",
  metaphor: "An image the adaptation added to explain an idea.",
};

export function voiceLabel(kind: TextKind, speaker: string | undefined, names: Record<string, string>): string {
  const name = speaker ? names[speaker] || "Someone" : undefined;
  switch (kind) {
    case "narration":
      return "Narration";
    case "caption":
      return "Caption";
    case "sfx":
      return "Sound";
    case "thought":
      return name ? `${name}, thinking` : "Thought";
    case "whisper":
      return name ? `${name}, whispering` : "Whisper";
    case "shout":
      return name ? `${name}, shouting` : "Shout";
    default:
      return name ?? "Speech";
  }
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)} million`;
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Time, failure reasons and the preflight, in plain words
// ---------------------------------------------------------------------------

/** "45 seconds", "7 min 05 s", "1 h 12 min". */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

export interface ProviderStopLines {
  title: string;
  /** What happened, in one sentence. */
  plain: string;
  /** What to do next. */
  next: string;
  /** The provider's own words, for a person who wants them. */
  detail: string | null;
}

/** Plain words for an edition that stopped because MiniMax refused the work (D11). */
export function providerStopLines(stop: ProviderStop, pendingPages = 0): ProviderStopLines {
  const kept = pendingPages > 0 ? ` The pages already drawn stay as they are, and ${plural(pendingPages, "page")} ${pendingPages === 1 ? "was" : "were"} not tried yet.` : " The pages already drawn stay as they are.";
  const detail = stop.message ? `${stop.type ? `${stop.type}: ` : ""}${stop.message}` : null;
  switch (stop.code) {
    case "PROVIDER_LIMIT":
      return {
        title: "MiniMax stopped the drawing: usage limit reached",
        plain: "MiniMax says the usage limit is reached (the plan limit or a short rate limit). Nothing more was sent, so nothing more was spent." + kept,
        next: "Wait for the limit to reset, or add credits to the plan. Then press Resume drawing.",
        detail,
      };
    case "PROVIDER_AUTH":
      return {
        title: "MiniMax did not accept the key or the plan",
        plain: "MiniMax refused the request, so the drawing stopped. Nothing more was sent." + kept,
        next: "Check the MiniMax key and plan in the drawing service settings. Then press Resume drawing.",
        detail,
      };
    default:
      return {
        title: "MiniMax was not answering",
        plain: "MiniMax did not answer after several tries, so the drawing stopped. Nothing more was sent." + kept,
        next: "Wait a few minutes. Then press Resume drawing.",
        detail,
      };
  }
}

const FAILURE_REASONS: [RegExp, string][] = [
  [/usage limit|credits|token plan|insufficient_quota|\(2056\)/i, "The MiniMax plan has reached its usage limit. Wait for it to reset or add credits, then press Resume."],
  [/token limit|cut off|max_tokens/i, "The model ran out of room before it finished this page."],
  [/max_submits|rejected on every|every submit/i, "The model's drawings for this page were rejected every time they were checked."],
  [/did not fit|overflow|balloon|lettering/i, "The text did not fit on the page."],
  [/timed? ?out|timeout|deadline/i, "The model took too long to answer."],
  [/stopped answering|unreachable|connection (refused|reset|error)|ECONN|worker (stopped|unreachable|not)/i, "The drawing service stopped answering."],
  [/rate.?limit|\b429\b|quota|overloaded|\b529\b/i, "The model service was too busy or over its limit."],
  [/schema|invalid (json|output|response|page)|validation|not valid/i, "The model's answer did not follow the page format."],
  [/cancel/i, "Drawing was stopped before this page."],
];

/** A short reason a reader can act on. The raw text stays available as `detail`. */
export function plainReason(raw: string | null | undefined): { plain: string; detail: string | null } {
  const text = (raw ?? "").trim();
  if (!text) return { plain: "No reason was recorded for this failure.", detail: null };
  // already a full sentence that a person can read: keep it
  if (text.length > 25 && /^[A-Z].*[.!?]$/.test(text)) return { plain: text, detail: null };
  for (const [re, plain] of FAILURE_REASONS) if (re.test(text)) return { plain, detail: text };
  // already a sentence a person wrote: keep it as the reason
  return { plain: /[.!?]$/.test(text) ? text : `${text}.`, detail: null };
}

const roundRange = (r: Range, unit: string, one = unit) => {
  const lo = Math.round(r.low);
  const hi = Math.round(r.high);
  return lo === hi ? plural(lo, one, unit) : `${lo.toLocaleString()} to ${hi.toLocaleString()} ${unit}`;
};

export function minutesRange(r: Range): string {
  const lo = Math.max(1, Math.round(r.low));
  const hi = Math.max(lo, Math.round(r.high));
  return lo === hi ? `about ${lo} min` : `${lo} to ${hi} min`;
}

export const moneyRange = (r: Range) => {
  const f = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(0)}`;
  return r.low === r.high ? `about ${f(r.low)}` : `${f(r.low)} to ${f(r.high)}`;
};

export const pagesRange = (r: Range) => roundRange(r, "pages", "page");

/** Plain-words lines for the preflight panel. */
export function preflightLines(p: Preflight) {
  return {
    pages: pagesRange(p.estimated_manga_pages),
    firstPage: minutesRange(p.estimated_minutes.first_page),
    total: minutesRange(p.estimated_minutes.total),
    cost: moneyRange(p.estimated_cost_usd),
  };
}

/**
 * The backend writes the preflight cost basis as one text. When the edition policy uses models other
 * than the measured one, it adds a second part that starts with "The current policy uses". Show that
 * part as its own note, so the reader sees that the numbers were measured on another model.
 */
export function splitCostBasis(basis: string | null | undefined): { basis: string; modelNote: string | null } {
  const text = (basis ?? "").trim();
  const at = text.indexOf("The current policy uses");
  if (at < 0) return { basis: text.replace(/\.*$/, ""), modelNote: null };
  return { basis: text.slice(0, at).trim().replace(/\.*$/, ""), modelNote: text.slice(at).trim() };
}
