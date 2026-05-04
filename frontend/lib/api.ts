/**
 * api.ts — All API call functions
 * =================================
 * Every function that talks to the backend lives here.
 * Components stay clean — they just call functions, they don't know
 * about URLs or HTTP methods.
 */

import axios from "axios";
import type {
  Book,
  BookListItem,
  JobStatusResponse,
  UploadResponse,
  SummaryStyle,
  LLMProvider,
  StartMangaSliceGenerationResponse,
  MangaProjectAssetsResponse,
  MangaProjectPagesResponse,
  MangaProjectResponse,
  MangaProjectSlicesResponse,
  MangaProjectsResponse,
  NextSourceSliceResponse,
  AssetMutationResponse,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// ============================================================
// ERROR HANDLING
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

export async function uploadPdf(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post<UploadResponse>("/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60000,
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

export async function fetchOpenRouterModels(apiKey: string) {
  const response = await api.get(`/openrouter/models?api_key=${encodeURIComponent(apiKey)}`);
  return response.data;
}

export async function getImageModels(): Promise<{
  models: { id: string; name: string; modalities: string[] }[];
  default: string;
}> {
  const response = await api.get("/image-models");
  return response.data;
}

// ============================================================
// MANGA PROJECT ENDPOINTS — the only generation control plane
// ============================================================

export async function createMangaProject(
  bookId: string,
  options: {
    style?: SummaryStyle | string;
    engine?: "v4" | string;
    title?: string;
    projectOptions?: Record<string, unknown>;
  } = {},
): Promise<MangaProjectResponse> {
  const response = await api.post<MangaProjectResponse>(`/books/${bookId}/manga-projects`, {
    style: options.style ?? "manga",
    engine: options.engine ?? "v4",
    title: options.title ?? "",
    project_options: options.projectOptions ?? {},
  });
  return response.data;
}

export async function listBookMangaProjects(bookId: string): Promise<MangaProjectsResponse> {
  const response = await api.get<MangaProjectsResponse>(`/books/${bookId}/manga-projects`);
  return response.data;
}

export async function getMangaProject(projectId: string): Promise<MangaProjectResponse> {
  const response = await api.get<MangaProjectResponse>(`/manga-projects/${projectId}`);
  return response.data;
}

export async function listMangaProjectSlices(projectId: string): Promise<MangaProjectSlicesResponse> {
  const response = await api.get<MangaProjectSlicesResponse>(`/manga-projects/${projectId}/slices`);
  return response.data;
}

export async function listMangaProjectPages(projectId: string): Promise<MangaProjectPagesResponse> {
  const response = await api.get<MangaProjectPagesResponse>(`/manga-projects/${projectId}/pages`);
  return response.data;
}

export async function listMangaProjectAssets(projectId: string): Promise<MangaProjectAssetsResponse> {
  const response = await api.get<MangaProjectAssetsResponse>(`/manga-projects/${projectId}/assets`);
  return response.data;
}

// Re-trigger the project-level character library materialization.
// Idempotent at the planner level (won't replace existing assets).
export async function materializeCharacterSheets(
  projectId: string,
  imageApiKey: string | null,
): Promise<{ assets: import("./types").MangaAssetDoc[]; generated_count: number }> {
  const response = await api.post(`/manga-projects/${projectId}/character-sheets`, {
    image_api_key: imageApiKey,
  });
  return response.data;
}

// Per-asset regenerate.
export async function regenerateMangaAsset(
  projectId: string,
  assetId: string,
  imageApiKey: string,
): Promise<AssetMutationResponse> {
  const response = await api.post<AssetMutationResponse>(
    `/manga-projects/${projectId}/assets/${assetId}/regenerate`,
    { image_api_key: imageApiKey },
  );
  return response.data;
}

// Toggle the user's pin on an asset.
export async function setMangaAssetPin(
  projectId: string,
  assetId: string,
  pinned: boolean,
): Promise<AssetMutationResponse> {
  const response = await api.post<AssetMutationResponse>(
    `/manga-projects/${projectId}/assets/${assetId}/pin`,
    { pinned },
  );
  return response.data;
}

export async function previewNextSourceSlice(
  projectId: string,
  pageWindow = 10,
): Promise<NextSourceSliceResponse> {
  const response = await api.post<NextSourceSliceResponse>(
    `/manga-projects/${projectId}/next-source-slice`,
    { page_window: pageWindow },
  );
  return response.data;
}

export async function generateMangaProjectSlice(
  projectId: string,
  options: {
    apiKey: string;
    provider: LLMProvider;
    model?: string;
    pageWindow?: number;
    generateImages?: boolean;
    imageModel?: string;
    extraOptions?: Record<string, unknown>;
  },
): Promise<StartMangaSliceGenerationResponse> {
  const response = await api.post<StartMangaSliceGenerationResponse>(
    `/manga-projects/${projectId}/generate-slice`,
    {
      api_key: options.apiKey,
      provider: options.provider,
      model: options.model,
      page_window: options.pageWindow ?? 10,
      generate_images: options.generateImages ?? false,
      image_model: options.imageModel ?? null,
      options: options.extraOptions ?? {},
    },
    { timeout: 30000 },
  );
  return response.data;
}

// ============================================================
// JOB STATUS POLLING
// ============================================================

export async function getJobStatus(taskId: string): Promise<JobStatusResponse> {
  const response = await api.get<JobStatusResponse>(`/status/${taskId}`);
  return response.data;
}

export async function pollUntilComplete(
  taskId: string,
  onProgress?: (status: JobStatusResponse) => void,
  intervalMs: number = 2000,
  timeoutMs: number = 10 * 60 * 1000,
): Promise<JobStatusResponse> {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await getJobStatus(taskId);
        onProgress?.(status);
        if (status.status === "success") return resolve(status);
        if (status.status === "failure") return reject(new Error(status.error || "Job failed"));
        if (Date.now() - startTime > timeoutMs) return reject(new Error("Job timed out after 10 minutes"));
        setTimeout(poll, intervalMs);
      } catch (error) {
        reject(new Error(getErrorMessage(error)));
      }
    };
    poll();
  });
}

// ============================================================
// IMAGE HELPERS
// ============================================================

export function getImageUrl(imageId: string | null | undefined): string | null {
  if (!imageId) return null;
  return `${API_URL}/images/${imageId}`;
}

export async function checkCredits(apiKey: string): Promise<{
  total_credits: number;
  used_credits: number;
  remaining_credits: number;
  error?: string;
}> {
  const response = await api.get(`/credits?api_key=${encodeURIComponent(apiKey)}`);
  return response.data;
}

export async function cancelJob(taskId: string): Promise<{ message: string; cancelled: boolean }> {
  const response = await api.post(`/jobs/${taskId}/cancel`);
  return response.data;
}

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
