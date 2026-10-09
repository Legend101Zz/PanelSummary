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
  job_id: string | null;
  created_at: string;
  finished_at: string | null;
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
}

export interface EditionDetail extends Edition {
  job: Job | null;
  pages: EditionPageSummary[];
  book?: EditionBook;
  has_plan: boolean;
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
    return [message, reasons].filter(Boolean).join(" ") || null;
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

const post = <T>(path: string) => request<T>(path, { method: "POST" });

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
  pdf_pages: number;
  source_words: number;
  sections: number;
  estimated_manga_pages: Range;
  estimated_cost_usd: Range & { basis?: string };
  estimated_minutes: { first_page: Range; total: Range };
  limits: { max_pdf_pages: number; max_source_words: number };
  within_limits: boolean;
  blocking_reasons: string[];
}

/** Null when the backend has no such endpoint (404), or it fails: the panel is then hidden and Generate still works. */
export async function getPreflight(bookId: string): Promise<Preflight | null> {
  try {
    const p = await request<Preflight>(`/books/${bookId}/preflight`);
    if (!p || typeof p !== "object" || !p.estimated_manga_pages || !p.estimated_minutes || !p.estimated_cost_usd) return null;
    return p;
  } catch {
    return null;
  }
}

export const generateEdition = (bookId: string) => post<GenerateResult>(`/books/${bookId}/editions`);
export const listEditions = (bookId: string) => request<Edition[]>(`/books/${bookId}/editions`);
export const getEdition = (editionId: string) => request<EditionDetail>(`/editions/${editionId}`);
export const getEditionPage = (editionId: string, page: number) => request<EditionPage>(`/editions/${editionId}/pages/${page}`);
export const cancelEdition = (editionId: string) => post<Edition>(`/editions/${editionId}/cancel`);
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
