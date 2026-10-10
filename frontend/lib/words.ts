/** Plain-language wording for statuses, shared by the shelf, book page and reader. */
import type { Book, EditionDetail, EditionScope, EditionPageSummary, EditionStatus, Fidelity, LibraryBook, Preflight, ProviderStop, Range, TextKind } from "./api";

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
    case "awaiting_plan_review":
      // Family "Not started" (outline band, tone quiet): nothing is drawn and nothing failed. "Needs you"
      // has the problem icon and the red tone in SCREENS-AND-STATES, which would call a plan a fault.
      return { text: "Plan ready to review", tone: "quiet" };
    case "drawing":
      return { text: `${e.pages_accepted} of ${e.page_total} pages drawn`, tone: "pencil" };
    case "complete":
      return { text: plural(e.page_total, "manga page"), tone: "ink" };
    case "completed_with_failures": {
      const missing = Math.max(0, e.page_total - e.pages_accepted);
      return { text: `${e.pages_accepted} of ${e.page_total} drawn, ${missing} missing`, tone: "redpen" };
    }
    case "cancelled":
      return { text: e.page_total ? `Stopped at ${e.pages_accepted} of ${e.page_total} pages` : "Stopped before drawing", tone: "quiet" };
    case "failed":
      if (e.provider_stop) {
        const why = providerStopShort(e.provider_stop.code);
        return { text: e.page_total ? `${why}, ${e.pages_accepted} of ${e.page_total} drawn` : why, tone: "redpen" };
      }
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

/** The book-page headline for a provider stop. */
export function providerStopHeadline(code: string | null | undefined): string {
  switch (code) {
    case "PROVIDER_LIMIT":
      return "Drawing stopped: MiniMax usage limit reached";
    default:
      return `Drawing stopped: ${providerStopShort(code)}`;
  }
}

export function stageLine(status: EditionStatus, pages: EditionPageSummary[], total: number, opts?: { keyPointsLeftOut?: number }): string {
  switch (status) {
    case "queued":
      return "Waiting to start";
    case "understanding":
      return "Reading the book";
    case "planning":
      return "Planning the pages";
    case "awaiting_plan_review":
      return total > 0 ? `The plan is ready: ${plural(total, "page")}` : "The plan is ready";
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
      if (missing > 0) return `Finished, but ${plural(missing, "page")} ${missing === 1 ? "is" : "are"} missing`;
      // G-O1: every page is drawn, but the checks left key points out.
      const left = opts?.keyPointsLeftOut ?? 0;
      return left > 0 ? `Drawn, ${plural(left, "key point")} left out` : "Drawn, with some key points left out";
    }
    case "cancelled":
      return "Drawing stopped";
    case "failed":
      return "Drawing stopped with an error";
  }
}

/** The headline of a queued run on an edition whose plan exists: a retry or a resume. */
export const DRAWING_AGAIN = "Drawing is starting again";

/** The headline of the FIRST draw, in the moment after a plan review is approved and before page 1 starts. */
export const DRAWING_STARTING = "Starting to draw";

/** C, stopped by the user: how far the drawing got, and what Resume does. */
export function stoppedLine(drawn: number, total: number): string {
  return drawn > 0 ? `Stopped at ${drawn.toLocaleString()} of ${plural(total, "page")}` : "Stopped before drawing";
}

export function stoppedNote(drawn: number, total: number): string {
  const rest = Math.max(0, total - drawn);
  if (drawn > 0 && rest > 0) return `${drawn === 1 ? "The page already drawn stays" : "The pages already drawn stay"}. Resume drawing draws the other ${rest.toLocaleString()}.`;
  return "Resume drawing starts the drawing again.";
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
  const bits = [`PDF: ${plural(book.page_count, "page")}`];
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
        next: "Check the MiniMax key on the PanelSummary server (MINIMAX_API_KEY) and your MiniMax plan. Then press Resume drawing.",
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
  [/max_submits|rejected on every|every submit/i, "Each version of this page that the model wrote failed the page checks."],
  [/did not fit|overflow|balloon|lettering/i, "The text did not fit on the page."],
  [/timed? ?out|timeout|deadline/i, "The model took too long to answer."],
  [/stopped answering|unreachable|connection (refused|reset|error)|ECONN|worker (stopped|unreachable|not)/i, "The drawing service stopped answering."],
  [/rate.?limit|\b429\b|quota|overloaded|\b529\b/i, "The model service was too busy or over its limit."],
  [/schema|invalid (json|output|response|page)|validation|not valid/i, "The model's answer did not follow the page format."],
  [/cancel/i, "Drawing was stopped before this page."],
];

/** A short reason a reader can act on. The raw text stays available as `detail`. */
export const UNKNOWN_PAGE_REASON = "This page could not be drawn. The technical detail says why.";

/** A failure reason in plain words. A raw text that is not known is never the plain reason: `unknown` (a generic sentence) is, and the raw text is the detail. */
export function plainReason(raw: string | null | undefined, unknown: string = UNKNOWN_PAGE_REASON): { plain: string; detail: string | null } {
  const text = (raw ?? "").trim();
  if (!text) return { plain: "No reason was recorded for this failure.", detail: null };
  // already a full sentence that a person can read: keep it
  if (text.length > 25 && /^[A-Z].*[.!?]$/.test(text)) return { plain: text, detail: null };
  for (const [re, plain] of FAILURE_REASONS) if (re.test(text)) return { plain, detail: text };
  return { plain: unknown, detail: text };
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

// ---------------------------------------------------------------------------
// U1 screens: shelf, first run, Add a book, landing, Settings, PDF viewer.
// Copy marked [suggested] in docs/design/SCREENS-AND-STATES.md is listed in docs/v0.2/U1-screens.md.
// ---------------------------------------------------------------------------

export interface LimitValues {
  max_pdf_size_mb: number;
  max_pdf_pages: number;
  max_source_words: number;
}

/** The D19 limits. The screens show the values of GET /status and use these when the server cannot say. */
export const FALLBACK_LIMITS: LimitValues = { max_pdf_size_mb: 60, max_pdf_pages: 75, max_source_words: 17500 };

/** The facts a PDF must meet, in the order of the design. */
export function limitItems(limits: LimitValues = FALLBACK_LIMITS): string[] {
  return [
    "Selectable text, not a scan",
    "In English",
    `Up to ${limits.max_pdf_size_mb} MB`,
    `Up to ${limits.max_pdf_pages} PDF pages`,
    `Up to ${limits.max_source_words.toLocaleString("en-US")} words`,
  ];
}

/** The same limits as one sentence (Add a book, Settings). */
export function limitsSentence(limits: LimitValues = FALLBACK_LIMITS): string {
  return `A PDF with selectable text, in English, up to ${limits.max_pdf_size_mb} MB, ${limits.max_pdf_pages} PDF pages and ${limits.max_source_words.toLocaleString("en-US")} words.`;
}

export const SHELF_LEDE = "Books you have added, and the manga drawn from them.";
export const SHELF_LOAD_ERROR = "The shelf could not be loaded.";
export const FIRST_RUN_LEDE = "Nothing is on the shelf yet. Add a book as a PDF with selectable text. PanelSummary reads its sections, and you choose when to draw it as manga.";

export function addBookLede(maxMb: number): string {
  return `Choose a PDF with selectable text, up to ${maxMb} MB. It is uploaded to your PanelSummary server, which reads its text and finds its sections.`;
}
export const ADD_BOOK_NOTE = "Nothing is drawn yet. You start the manga from the book's page when you are ready.";

export const OFFLINE_SENTENCE = "Can't reach the PanelSummary server. Check that it is running (./start.sh).";

export function notPdfText(name: string): string {
  return `${name} is not a PDF. Choose a .pdf file.`;
}
export function tooLargeText(name: string, bytes: number, maxMb: number): string {
  return `${name} is ${Math.ceil(bytes / 1048576)} MB. The limit is ${maxMb} MB.`;
}

/** Adds the next step to a server error when the problem is a PDF with no text. */
export function withNextStep(message: string): string {
  // a damaged file: the parser's own error text is not for a reader
  if (/FileDataError|Failed to open stream|broken document|cannot open/i.test(message)) return "The PDF could not be read. The file may be damaged. Choose another PDF.";
  if (/^that file is not a pdf\.?$/i.test(message.trim())) return "The PDF could not be read. The file may be damaged. Choose another PDF.";
  if (/no extractable/i.test(message) && !/selectable text/i.test(message)) return `${message.replace(/\.*$/, ".")} Use a PDF with selectable text.`;
  return message;
}

/** "Parsed 22 pages into 4 sections and 10 source units" becomes "Read 22 PDF pages and found 4 sections." */
export function readSummary(jobMessage: string | null | undefined): string {
  const m = /(\d[\d,]*)\s+pages?\s+into\s+(\d[\d,]*)\s+sections?/i.exec(jobMessage ?? "");
  if (!m) return (jobMessage ?? "").trim() || "The PDF is read.";
  const pages = Number(m[1].replace(/,/g, ""));
  const sections = Number(m[2].replace(/,/g, ""));
  return `Read ${plural(pages, "PDF page")} and found ${plural(sections, "section")}.`;
}

export const UPLOAD_SLOW_TEXT = "Still waiting. The PDF is read by the PanelSummary job runner; check that it is running.";

export interface SampleRunFacts {
  pages: number;
  firstPageSeconds: number | null;
  /** True when the first value is page 1 itself (timings.page_1_at). Older runs only know the first page of any number. */
  firstIsPage1: boolean;
  totalSeconds: number | null;
  costUsd: number | null;
  estimate: { pages: Range; firstPageMin: Range; totalMin: Range; costUsd: Range } | null;
}

/** Real numbers of the sample edition. Nothing here is typed in: every value comes from the edition and its preflight. */
export function sampleRunFacts(
  edition: { page_total: number; pages_accepted: number; created_at: string; finished_at: string | null; active_seconds?: number | null; totals?: { cost_usd: number }; timings?: { generate_started_at?: string; first_page_at?: string; page_1_at?: string } },
  preflight: Preflight | null,
): SampleRunFacts {
  const start = Date.parse(edition.timings?.generate_started_at ?? edition.created_at);
  const first = edition.timings?.page_1_at ?? edition.timings?.first_page_at;
  const firstMs = first ? Date.parse(first) - start : NaN;
  const totalFromDates = edition.finished_at ? (Date.parse(edition.finished_at) - Date.parse(edition.created_at)) / 1000 : NaN;
  const total = edition.active_seconds ?? (Number.isFinite(totalFromDates) ? totalFromDates : null);
  return {
    pages: edition.pages_accepted || edition.page_total,
    firstPageSeconds: Number.isFinite(firstMs) && firstMs >= 0 ? firstMs / 1000 : null,
    firstIsPage1: !!edition.timings?.page_1_at,
    totalSeconds: total,
    costUsd: edition.totals?.cost_usd ?? null,
    estimate: preflight
      ? { pages: preflight.estimated_manga_pages, firstPageMin: preflight.estimated_minutes.first_page, totalMin: preflight.estimated_minutes.total, costUsd: preflight.estimated_cost_usd }
      : null,
  };
}

const money = (n: number) => `$${n.toFixed(2)}`;
const minRange = (r: Range) => `${Math.max(1, Math.round(r.low))} to ${Math.max(1, Math.round(r.high))} min`;

/** The estimate before the run and the real run, side by side (first run) or as one sentence (landing). */
export function sampleEstimateSentence(f: SampleRunFacts): string | null {
  if (!f.estimate) return null;
  const e = f.estimate;
  return `Before the run, the estimate was ${Math.round(e.pages.low)} to ${Math.round(e.pages.high)} manga pages, page 1 in ${minRange(e.firstPageMin)}, all pages in ${minRange(e.totalMin)} and ${money(e.costUsd.low)} to ${money(e.costUsd.high)}.`;
}

export function sampleRealSentence(f: SampleRunFacts): string {
  const parts: string[] = [];
  if (f.firstPageSeconds !== null) parts.push(f.firstIsPage1 ? `page 1 after ${formatElapsed(f.firstPageSeconds)}` : `the first page drawn after ${formatElapsed(f.firstPageSeconds)}`);
  if (f.totalSeconds !== null) parts.push(`all pages after ${formatElapsed(f.totalSeconds)}`);
  if (f.costUsd !== null) parts.push(`an estimated ${money(f.costUsd)} (not a bill)`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? "";
  return `The real run made ${plural(f.pages, "page")}${list ? `: ${list}` : ""}.`;
}

/** The landing's sample sentence: "{title}: 4 tales ..." The tale count is the section count of the book. */
export function sampleLandingSentence(title: string, sections: number, pdfPages: number, f: SampleRunFacts): string {
  const drawn = f.totalSeconds !== null ? `, drawn in ${formatElapsed(f.totalSeconds)}` : "";
  const est = f.estimate ? ` The estimate before the run was ${minRange(f.estimate.totalMin)}.` : "";
  return `${title}: ${plural(sections, "section")}, ${plural(pdfPages, "PDF page")}, ${plural(f.pages, "manga page")}${drawn}.${est}`;
}

// Settings and about (design section 8). Copy marked [suggested] in the design.
export const SETTINGS_LEDE = "How this copy of PanelSummary is set up. You can change the theme and the plan review here. The other settings are read-only in this version.";
export const SETTINGS_SET_NOTE = "\"Set\" is the most the check can say: it cannot see if MiniMax accepts the key. A refused key shows during a run as \"MiniMax refused the key\".";
export const SETTINGS_MODELS_NOTE =
  "The server asks for no thinking on the plan and the pages, but the Flash model cannot turn thinking off, so it gets \"low\". A retry uses \"medium\". The owner can set any step to MiniMax-M3 with an environment setting. The app does not change models by itself. Each page gets a PNG preview of itself to check.";
export const SETTINGS_LEAVES =
  "The book text and a PNG preview of each drawn page go to MiniMax (api.minimax.io). In the final v0.1 test run, the drawing service contacted no other host. No image-generation model is used. In your browser, the app talks only to your own PanelSummary server.";
export const SETTINGS_COST = "Costs are estimates at MiniMax-M3 rates, because MiniMax publishes no price for the M3.1 Flash model. They are not a bill.";
export const SETTINGS_DATA = "On your computer, in MongoDB and the stored PDFs.";
export const SETTINGS_VERSION = "PanelSummary v0.2. Version 0.1.0 was released on 9 October 2026.";
export const SETTINGS_CREDITS =
  "The interface is set in Bricolage Grotesque. The manga lettering uses Comic Neue for balloons and captions and Bangers for sound effects. Bricolage Grotesque, Comic Neue and Bangers are all under the SIL Open Font License. The sample texts are from Project Gutenberg.";
export const REVIEW_PLAN_NOTE = "When this is on, PanelSummary shows the plan of the pages before it draws, and you press the button to start the drawing. It is off until you turn it on.";
export const NOT_AVAILABLE = "Not available in this version";
export const GITHUB_URL = "https://github.com/Legend101Zz/PanelSummary";

export const STEP_NAMES: Record<string, string> = { understanding: "Book understanding", plan: "Page plan", pages: "Page drawing" };

export function limitsSettingsLine(l: LimitValues & { page_attempts: number; page_concurrency: number }): string {
  return `A book can be up to ${l.max_pdf_size_mb} MB, ${l.max_pdf_pages} PDF pages and ${l.max_source_words.toLocaleString("en-US")} words. A page gets ${l.page_attempts} tries, and ${l.page_concurrency} pages are drawn at the same time.`;
}

/** The tab title of the PDF viewer (as in v0.1). */
export const pdfViewerTitle = (title: string | null | undefined, page: number) => (title ? `${title}, PDF page ${page}` : `PDF page ${page}`);

/** The stage an edition was in when it stopped with an error. */
export type StopStage = "reading" | "planning" | "drawing";

/** "Stopped with an error while reading the book". */
export function failedStageLine(stage: StopStage): string {
  const what = stage === "reading" ? "reading the book" : stage === "planning" ? "planning the pages" : "drawing the pages";
  return `Stopped with an error while ${what}`;
}

/** What a run draws, in words, for the run card: "Drawing 1 of 5 sections" or "PDF pages 3\u201340". null = the whole book. */
export function scopeLabel(scope: EditionScope | null | undefined, sectionCount: number): string | null {
  if (!scope) return null;
  if ("section_ids" in scope) return `Drawing ${scope.section_ids.length.toLocaleString()} of ${plural(sectionCount, "section")}`;
  return `PDF pages ${scope.pdf_page_from}\u2013${scope.pdf_page_to}`;
}
