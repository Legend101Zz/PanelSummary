/**
 * api.ts — All API call functions
 * =================================
 * Every function that talks to the backend lives here.
 * This keeps our components clean — they just call functions,
 * they don't know about URLs or HTTP methods.
 *
 * WHY AXIOS: Better error handling than fetch, automatic JSON parsing,
 * request/response interceptors for adding auth headers.
 */

import axios from "axios";
import type {
  Book,
  BookListItem,
  JobStatusResponse,
  ReelsPageResponse,
  Summary,
  SummaryListItem,
  UploadResponse,
  SummaryStyle,
  LLMProvider,
  GenerationMode,
} from "./types";

// The base URL for all API calls
// In development: http://localhost:8000
// In production: your deployed backend URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Create axios instance with defaults
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000, // 30 second timeout
  headers: {
    "Content-Type": "application/json",
  },
});

// ============================================================
// ERROR HANDLING
// Better error messages for users
// ============================================================

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === "object" && data?.detail) {
      return typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail);
    }
    if (error.response?.status === 413) return "PDF file is too large (max 50MB)";
    if (error.response?.status === 404) return "Not found";
    if (error.response?.status === 500) return "Server error — check backend logs";
    if (error.code === "ECONNREFUSED") return "Cannot connect to backend — is it running?";
  }
  return error instanceof Error ? error.message : "Unknown error";
}

// ============================================================
// BOOK ENDPOINTS
// ============================================================

/**
 * Upload a PDF file.
 * Returns immediately with a task_id — don't wait for parsing.
 */
export async function uploadPdf(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post<UploadResponse>("/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60000, // 60s for upload
  });

  return response.data;
}

export async function listBooks(): Promise<BookListItem[]> {
  const response = await api.get<BookListItem[]>("/books");
  return response.data;
}

export async function getBook(bookId: string): Promise<Book> {
  const response = await api.get<Book>(`/books/${bookId}`);
  return response.data;
}

export async function updateBookTitle(bookId: string, title: string): Promise<void> {
  await api.patch(`/books/${bookId}`, { title });
}

export async function deleteSummary(summaryId: string): Promise<void> {
  await api.delete(`/summaries/${summaryId}`);
}

export async function fetchOpenRouterModels(apiKey: string) {
  const response = await api.get(`/openrouter/models?api_key=${encodeURIComponent(apiKey)}`);
  return response.data;
}

// ============================================================
// SUMMARIZATION ENDPOINTS
// ============================================================

/**
 * Start AI summarization for a book.
 * Returns immediately with task_id — don't wait for completion.
 */
export async function startSummarization(
  bookId: string,
  options: {
    apiKey: string;
    provider: LLMProvider;
    model?: string;
    style: SummaryStyle;
    chapterRange?: [number, number] | null;
    generateImages?: boolean;
    imageModel?: string;
    generationMode?: GenerationMode;
  }
): Promise<{ summary_id: string; task_id: string; message: string }> {
  const response = await api.post(`/books/${bookId}/summarize`, {
    api_key: options.apiKey,
    provider: options.provider,
    model: options.model,
    style: options.style,
    chapter_range: options.chapterRange ?? null,
    generate_images: options.generateImages ?? false,
    image_model: options.imageModel ?? null,
    generation_mode: options.generationMode ?? "llm",
  });
  return response.data;
}

export async function getImageModels(): Promise<{
  models: { id: string; name: string; modalities: string[] }[];
  default: string;
}> {
  const response = await api.get("/image-models");
  return response.data;
}

/**
 * Trigger on-demand reel generation for a complete summary.
 */
export async function generateReels(
  summaryId: string,
  options: { apiKey: string; provider: LLMProvider; model?: string }
): Promise<{ task_id: string | null; message: string; reel_count?: number }> {
  const response = await api.post(`/summary/${summaryId}/generate-reels`, {
    api_key: options.apiKey,
    provider: options.provider,
    model: options.model,
  });
  return response.data;
}

/**
 * List all summaries for a book (different styles)
 */
export async function getBookSummaries(bookId: string): Promise<SummaryListItem[]> {
  const response = await api.get<SummaryListItem[]>(`/books/${bookId}/summaries`);
  return response.data;
}

/**
 * Get full summary data (manga chapters + reels)
 */
export async function getSummary(summaryId: string): Promise<Summary> {
  const response = await api.get<Summary>(`/summary/${summaryId}`);
  return response.data;
}

// ============================================================
// JOB STATUS POLLING
// ============================================================

/**
 * Poll the status of a background job.
 * Call this every 2 seconds to update progress bars.
 */
export async function getJobStatus(taskId: string): Promise<JobStatusResponse> {
  const response = await api.get<JobStatusResponse>(`/status/${taskId}`);
  return response.data;
}

/**
 * Poll until a job is complete (or failed).
 * Returns a promise that resolves when the job finishes.
 *
 * Usage:
 *   const result = await pollUntilComplete("task_123", (status) => {
 *     setProgress(status.progress);
 *   });
 */
export async function pollUntilComplete(
  taskId: string,
  onProgress?: (status: JobStatusResponse) => void,
  intervalMs: number = 2000,
  timeoutMs: number = 10 * 60 * 1000 // 10 minute timeout
): Promise<JobStatusResponse> {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await getJobStatus(taskId);
        onProgress?.(status);

        if (status.status === "success") {
          resolve(status);
          return;
        }

        if (status.status === "failure") {
          reject(new Error(status.error || "Job failed"));
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          reject(new Error("Job timed out after 10 minutes"));
          return;
        }

        // Still in progress — poll again after interval
        setTimeout(poll, intervalMs);
      } catch (error) {
        reject(new Error(getErrorMessage(error)));
      }
    };

    poll();
  });
}

// ============================================================
// REELS ENDPOINTS
// ============================================================

/**
 * Get reels from all books for the infinite scroll feed
 */
export async function getReels(
  offset: number = 0,
  limit: number = 20,
  style?: SummaryStyle
): Promise<ReelsPageResponse> {
  const params = new URLSearchParams({
    offset: offset.toString(),
    limit: limit.toString(),
  });
  if (style) params.append("style", style);

  const response = await api.get<ReelsPageResponse>(`/reels?${params}`);
  return response.data;
}

// ============================================================
// LIVING PANELS
// ============================================================

/**
 * Get ALL Living Panel DSLs for a summary.
 * Returns orchestrator-generated panels if available, fallback otherwise.
 */
export async function getAllLivingPanels(
  summaryId: string,
): Promise<{ summary_id: string; total_panels: number; living_panels: any[]; source: string }> {
  const response = await api.get(`/summary/${summaryId}/all-living-panels`);
  return response.data;
}

/**
 * Get Living Panel DSLs for a specific manga page.
 * Returns auto-generated fallback DSLs (no LLM needed).
 */
export async function getLivingPanels(
  summaryId: string,
  chapterIdx: number,
  pageIdx: number,
): Promise<{ chapter_index: number; page_index: number; layout: string; living_panels: any[] }> {
  const response = await api.get(
    `/summary/${summaryId}/living-panels/${chapterIdx}/${pageIdx}`
  );
  return response.data;
}

/**
 * Generate Living Panel DSLs via LLM (more creative, costs tokens).
 */
export async function generateLivingPanels(
  summaryId: string,
  chapterIdx: number,
  pageIdx: number,
  options: { apiKey: string; provider: LLMProvider; model?: string },
): Promise<{ chapter_index: number; page_index: number; layout: string; living_panels: any[] }> {
  const response = await api.post(
    `/summary/${summaryId}/living-panels/${chapterIdx}/${pageIdx}/generate`,
    {
      api_key: options.apiKey,
      provider: options.provider,
      model: options.model,
    }
  );
  return response.data;
}

// ============================================================
// IMAGE HELPERS
// ============================================================

/**
 * Get the URL for an image stored in GridFS.
 * Use this in <img src={getImageUrl(id)} /> or Next.js <Image>
 */
export function getImageUrl(imageId: string | null | undefined): string | null {
  if (!imageId) return null;
  return `${API_URL}/images/${imageId}`;
}

/**
 * Check OpenRouter credits.
 */
export async function checkCredits(apiKey: string): Promise<{
  total_credits: number;
  used_credits: number;
  remaining_credits: number;
  error?: string;
}> {
  const response = await api.get(`/credits?api_key=${encodeURIComponent(apiKey)}`);
  return response.data;
}

/**
 * Cancel a running job.
 */
export async function cancelJob(taskId: string): Promise<{ message: string; cancelled: boolean }> {
  const response = await api.post(`/jobs/${taskId}/cancel`);
  return response.data;
}

/**
 * Health check — verify backend is reachable
 */
export async function checkHealth(): Promise<boolean> {
  try {
    await api.get("/health", { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export { getErrorMessage };
export default api;
