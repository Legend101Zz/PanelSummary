/**
 * Typed client for the PanelSummary API (backend/app/api/library.py and
 * backend/app/api/editions.py). No keys, no provider settings: the browser
 * only uploads, asks for generation, and reads.
 */

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type BookStatus = "uploaded" | "parsing" | "parsed" | "failed";
export type JobStatus = "queued" | "running" | "succeeded" | "completed_with_failures" | "failed" | "cancelled";
export type EditionStatus =
  | "queued"
  | "understanding"
  | "planning"
  /** The plan is ready and waits for approval (D24). Not an active status: nothing runs. */
  | "awaiting_plan_review"
  | "drawing"
  | "complete"
  | "completed_with_failures"
  | "failed"
  | "cancelled";
export type PageStatus = "pending" | "drawing" | "accepted" | "failed";
export type Fidelity = "quote" | "paraphrase" | "dramatized" | "metaphor";
export type TextKind = "speech" | "thought" | "shout" | "whisper" | "narration" | "caption" | "sfx" | (string & {});

export interface EditionSummary {
  id: string;
  status: EditionStatus;
  page_total: number;
  pages_accepted: number;
  pages_failed?: number;
  /** Set when the model provider refused the work (D11). Only the code is on the shelf. */
  provider_stop?: { code: string } | null;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  status: BookStatus;
  error: string | null;
  page_count: number;
  word_count: number;
  section_count: number;
  parser: string;
  parse_job_id: string | null;
  created_at: string;
}

export interface LibraryBook extends Book {
  latest_edition: EditionSummary | null;
}

export interface BookSection {
  id: string;
  title: string;
  page_start: number;
  page_end: number;
  word_count: number;
}

export interface BookDetail extends Book {
  sections: BookSection[];
  /** Words per PDF page, index = PDF page - 1. A page with no body text is 0. Empty before the PDF is parsed. */
  page_words?: number[];
}

export interface JobEvent {
  at: string;
  stage: string;
  message: string;
}

export interface Job {
  id: string;
  kind: "parse" | "generate";
  status: JobStatus;
  stage: string;
  done: number;
  total: number;
  message: string;
  error: string | null;
  /** True after Stop was pressed and before the job ended; survives a page reload. */
  cancel_requested?: boolean;
  events: JobEvent[];
  created_at: string;
  finished_at: string | null;
}

export interface Totals {
  calls: number;
  failed_calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  model_ms: number;
}

/** Written by the generator when an edition finishes (empty before). */
export interface Coverage {
  claims_total?: number;
  conveyed?: string[];
  lost_to_failed_pages?: string[];
  omitted_by_plan?: { claim: string; reason: string }[];
  not_planned?: string[];
  core_not_conveyed?: string[];
  required_not_planned?: string[];
  sections_without_claims?: string[];
}

/** Set when the model provider refused the work and the edition stopped (D11). */
export interface ProviderStop {
  code: "PROVIDER_LIMIT" | "PROVIDER_UNAVAILABLE" | "PROVIDER_AUTH" | string;
  /** The provider's error type, for example "rate_limit_error". */
  type?: string | null;
  http_status?: number | null;
  /** The provider's own message. No key, no headers. */
  message?: string | null;
  stage?: "understanding" | "plan" | "drawing" | string;
  /** The page that met the refusal, when it happened while drawing. */
  page?: number | null;
  at?: string;
}

/** What part of the book an edition draws. null = the whole book. */
export type EditionScope = { section_ids: string[] } | { pdf_page_from: number; pdf_page_to: number };

/** Milestones as ISO strings. A key is absent until it happened. Older editions have no page_1_at: use first_page_at. */
export interface Timings {
  generate_started_at?: string;
  drawing_started_at?: string;
  /** The first accepted page of ANY number (pages are drawn in parallel). */
  first_page_at?: string;
  /** Page 1 accepted. */
  page_1_at?: string;
}

export interface Edition {
  id: string;
  book_id: string;
  status: EditionStatus;
  page_total: number;
  pages_accepted: number;
  pages_failed: number;
  coverage: Coverage;
  totals: Totals;
  policy: Record<string, unknown>;
  error: string | null;
  /** Present (not null) when MiniMax refused the work: a limit, a bad key, or no service. */
  provider_stop?: ProviderStop | null;
  job_id: string | null;
  created_at: string;
  finished_at: string | null;
  timings?: Timings;
  /** null or absent = the whole book. */
  scope?: EditionScope | null;
  /** Seconds the jobs of this edition ran (a pause before a resume does not count). null when not recorded. */
  active_seconds?: number | null;
  /** Cost range to draw the planned pages. Set only while status is awaiting_plan_review. */
  draw_estimate_usd?: Range | null;
}

export interface EditionPageSummary {
  page_number: number;
  section_id: string;
  status: PageStatus;
  attempts: number;
  beat: string;
  /** Failure reason, only for failed pages. */
  error: string | null;
}

export interface EditionBook {
  title: string | null;
  author: string | null;
  logline: string | null;
  kind: string | null;
  sections: { id: string; title: string }[];
  cast: { id: string; name: string; role: string }[];
  /** Claim text for the coverage lists and the plan review. Present when coverage is set or the plan waits. */
  claims?: { id: string; text: string; importance: string | null; section_id: string | null }[];
}

export interface EditionDetail extends Edition {
  job: Job | null;
  pages: EditionPageSummary[];
  book?: EditionBook;
  has_plan: boolean;
  /** What the plan leaves out, while status is awaiting_plan_review (else null). Claim ids; text is in book.claims. */
  plan_omitted?: { claim: string; reason: string }[] | null;
}

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SourceRef {
  unit: string;
  page: number;
}

export interface PagePanel {
  id: string;
  polygon: Point[];
  bbox: Box;
  /** Reading order, 0-based. */
  order: number;
}

export interface PageText {
  panel: string;
  index: number;
  kind: TextKind;
  speaker?: string;
  text: string;
  fidelity: Fidelity;
  source?: SourceRef;
  bbox: Box;
  font_px: number;
  lines: string[];
}

export interface ClaimDetail {
  id: string;
  text: string;
  kind: string | null;
  importance: string | null;
  source: SourceRef[];
}

export interface EditionPage {
  page_number: number;
  section_id: string;
  status: PageStatus;
  beat: string;
  /** The complete accepted page (viewBox 0 0 1000 1500); null until accepted. */
  svg: string | null;
  svg_hash: string | null;
  renderer_version: string | null;
  panels: PagePanel[];
  texts: PageText[];
  claims: string[];
  claim_details: ClaimDetail[];
  /** Cast id -> display name. */
  speakers: Record<string, string>;
  sources: { panel: string; source: SourceRef[] }[];
  error: { code?: string; message?: string } | null;
}

export interface PdfInfo {
  book_id: string;
  title: string;
  total_pages: number;
}

export interface UploadResult {
  book: Book;
  job_id: string | null;
  cached: boolean;
}

export interface GenerateResult {
  edition: Edition;
  job: Job | null;
  already_running: boolean;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** FastAPI "detail" can be a string, a list of validation errors, or an object with reasons. */
export function detailText(detail: unknown): string | null {
  if (typeof detail === "string") return detail.trim() || null;
  if (Array.isArray(detail)) {
    const parts = detail.map((d) => detailText(d)).filter((x): x is string => !!x);
    return parts.length ? parts.join(" ") : null;
  }
  if (detail && typeof detail === "object") {
    const o = detail as Record<string, unknown>;
    const reasons = detailText(o.blocking_reasons) ?? detailText(o.reasons);
    const message = detailText(o.message) ?? detailText(o.msg) ?? detailText(o.error);
    const end = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`);
    return [message, reasons].filter((x): x is string => !!x).map(end).join(" ") || null;
  }
  return null;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const text = detailText(body?.detail);
    if (text) return text;
  } catch {
    // not JSON
  }
  return `The server answered ${response.status}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new ApiError("Can't reach the PanelSummary server. Check that the backend is running.", 0);
  }
  if (!response.ok) throw new ApiError(await readError(response), response.status);
  return (await response.json()) as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "POST",
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

export const listBooks = () => request<LibraryBook[]>("/books");
export const getBook = (bookId: string) => request<BookDetail>(`/books/${bookId}`);
export const getPdfInfo = (bookId: string) => request<PdfInfo>(`/books/${bookId}/pdf/info`);
export const pdfPageUrl = (bookId: string, page: number, scale = 2) => `${API_URL}/books/${bookId}/pdf/page/${page}?scale=${scale}`;

/** Upload with byte progress (fetch cannot report upload progress). */
export function uploadPdf(file: File, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/upload`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as UploadResult);
      else {
        const detail = (xhr.response as { detail?: unknown } | null)?.detail;
        reject(new ApiError(typeof detail === "string" ? detail : `The server answered ${xhr.status}`, xhr.status));
      }
    };
    xhr.onerror = () => reject(new ApiError("Can't reach the PanelSummary server. Check that the backend is running.", 0));
    xhr.onabort = () => reject(new ApiError("Upload cancelled", 0));
    signal?.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export const getJob = (jobId: string) => request<Job>(`/jobs/${jobId}`);

// ---------------------------------------------------------------------------
// Editions
// ---------------------------------------------------------------------------

/** What Generate will cost, before it starts. Shape: GET /books/{id}/preflight (backend track T3). */
export interface Range {
  low: number;
  high: number;
}
export interface Preflight {
  book_id: string;
  /** null = the whole book. */
  scope?: EditionScope | null;
  pdf_pages: number;
  source_words: number;
  sections: number;
  estimated_manga_pages: Range;
  estimated_cost_usd: Range & { basis?: string; basis_short?: string };
  estimated_minutes: { first_page: Range; total: Range };
  limits: { max_pdf_pages: number; max_source_words: number };
  within_limits: boolean;
  blocking_reasons: string[];
}

/** Null when the backend has no such endpoint (404), or it fails: the panel is then hidden and Generate still works. */
export async function getPreflight(bookId: string, scope?: EditionScope | null): Promise<Preflight | null> {
  try {
    const query = !scope
      ? ""
      : "section_ids" in scope
        ? `?section_ids=${scope.section_ids.map(encodeURIComponent).join(",")}`
        : `?page_from=${scope.pdf_page_from}&page_to=${scope.pdf_page_to}`;
    const p = await request<Preflight>(`/books/${bookId}/preflight${query}`);
    if (!p || typeof p !== "object" || !p.estimated_manga_pages || !p.estimated_minutes || !p.estimated_cost_usd) return null;
    return p;
  } catch {
    return null;
  }
}

/** Optional body of Generate. No body = the whole book, no plan review. */
export interface GenerateBody {
  section_ids?: string[];
  pdf_page_from?: number;
  pdf_page_to?: number;
  review_plan?: boolean;
}

/** A bad scope or a scope over the limit throws ApiError(422) with the reasons as its message. */
export const generateEdition = (bookId: string, body?: GenerateBody) => post<GenerateResult>(`/books/${bookId}/editions`, body);
export const listEditions = (bookId: string) => request<Edition[]>(`/books/${bookId}/editions`);
export const getEdition = (editionId: string) => request<EditionDetail>(`/editions/${editionId}`);
export const getEditionPage = (editionId: string, page: number) => request<EditionPage>(`/editions/${editionId}/pages/${page}`);
export const cancelEdition = (editionId: string) => post<Edition>(`/editions/${editionId}/cancel`);
/** Start drawing after a plan review. 409 when the edition is not waiting. */
export const approvePlan = (editionId: string) => post<{ edition: Edition; job: Job | null }>(`/editions/${editionId}/approve-plan`);
/** Draw one page again (the other pages and the understanding are reused). */
export const redrawPage = (editionId: string, page: number) =>
  post<{ edition: Edition; job: Job | null }>(`/editions/${editionId}/pages/${page}/redraw`);
export const resumeEdition = (editionId: string) => post<{ edition: Edition; job: Job | null }>(`/editions/${editionId}/resume`);

// ---------------------------------------------------------------------------
// Page cache: accepted pages never change, so each is fetched once per tab.
// ---------------------------------------------------------------------------

const pageCache = new Map<string, Promise<EditionPage>>();

export function loadPage(editionId: string, page: number, { fresh = false } = {}): Promise<EditionPage> {
  const key = `${editionId}:${page}`;
  const cached = pageCache.get(key);
  if (cached && !fresh) return cached;
  const promise = getEditionPage(editionId, page).then((result) => {
    // only an accepted page is final; anything else is fetched again next time
    if (result.status !== "accepted") pageCache.delete(key);
    return result;
  });
  promise.catch(() => pageCache.delete(key));
  pageCache.set(key, promise);
  return promise;
}

export const ACTIVE_EDITION: readonly EditionStatus[] = ["queued", "understanding", "planning", "drawing"];
export const isActive = (status: EditionStatus | undefined | null) => !!status && ACTIVE_EDITION.includes(status);

// ---------------------------------------------------------------------------
// Server status (GET /status). Never holds a key, a token or a database URL.
// ---------------------------------------------------------------------------

export interface ServerStatus {
  api: "ok";
  version: string;
  runner: { running: boolean; last_seen: string | null };
  /**
   * key_set says that the drawing service has a MiniMax key. It cannot say that MiniMax accepts it.
   * replay is true when the worker is the replay worker: it uses no key, and key_set is then false.
   */
  worker: { reachable: boolean; key_set: boolean; replay: boolean };
  /** The thinking level asked for each step. What was sent is on the receipts. */
  models: { step: "understanding" | "plan" | "pages"; model: string; thinking: string }[];
  limits: { max_pdf_size_mb: number; max_pdf_pages: number; max_source_words: number; page_attempts: number; page_concurrency: number };
  plan_review_default: boolean;
}

/** Null when the server cannot be reached or has no /status (an older backend). */
export async function getStatus(): Promise<ServerStatus | null> {
  try {
    return await request<ServerStatus>("/status");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Samples (S2). A sample is a finished edition from a real run, stored in the repository.
// Installing it makes no model call and spends nothing.
// ---------------------------------------------------------------------------

// Declaration merging: the book and shelf views carry is_sample (true for the built-in sample books).
export interface Book {
  is_sample?: boolean;
}

export interface SampleInfo {
  id: string;
  title: string;
  installed: boolean;
  /** Set when installed. */
  book_id?: string;
  edition_id?: string;
}

export interface SampleInstall {
  book_id: string;
  edition_id: string;
}

export const listSamples = () => request<SampleInfo[]>("/samples");
/** Install a sample (safe to repeat). Then open `/books/${book_id}`. */
export const installSample = (id: string) => post<SampleInstall>(`/samples/${encodeURIComponent(id)}`);

/**
 * Read-only sample data for the first run and the landing (GET /samples/{id}/preview). It comes from the package:
 * nothing is installed and nothing is written, so opening a screen never puts a book on the shelf.
 */
export interface SamplePreview {
  id: string;
  title: string;
  author: string;
  pdf_pages: number;
  sections: number;
  page_total: number;
  pages_accepted: number;
  timings: {
    created_to_first_page_seconds: number | null;
    created_to_finished_seconds: number | null;
    /** From the start of the Generate job to the first drawn page (page 1 itself when first_is_page_1). */
    first_page_seconds: number | null;
    first_is_page_1: boolean;
    total_seconds: number | null;
  };
  cost_usd: number;
  estimate: { estimated_manga_pages: Range; estimated_minutes: { first_page: Range; total: Range }; estimated_cost_usd: Range };
  /** The SVG of manga page 1. */
  cover_svg: string;
  /** The SVG of manga page 13, the large page of the landing (null when the package has no accepted page 13). */
  hero: { page: number; svg: string } | null;
  thumbs: { page: number; svg: string }[];
  proof: {
    page: number;
    panel: { id: string; order: number; bbox: { x: number; y: number; w: number; h: number } };
    texts: { panel: string; index: number; kind: TextKind; speaker?: string | null; text: string; fidelity: Fidelity }[];
    speakers: Record<string, string>;
    source_pdf_pages: number[];
  };
}
export const getSamplePreview = (id: string) => request<SamplePreview>(`/samples/${encodeURIComponent(id)}/preview`);
/** A PDF page of the sample as a PNG, read from the package (no install). */
export const samplePdfPageUrl = (id: string, page: number) => `${API_URL}/samples/${encodeURIComponent(id)}/pdf/page/${page}`;
