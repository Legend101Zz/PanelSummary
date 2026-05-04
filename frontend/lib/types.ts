/**
 * types.ts — TypeScript Type Definitions
 * ========================================
 * All the "shapes" of data that flow between frontend and backend.
 */

// ============================================================
// ENUMS
// ============================================================

export type ProcessingStatus =
  | "pending"
  | "parsing"
  | "parsed"
  | "summarizing"
  | "generating"
  | "complete"
  | "failed";

export type SummaryStyle =
  | "manga"
  | "noir"
  | "minimalist"
  | "comedy"
  | "academic";

export type LLMProvider = "openai" | "openrouter";


// ============================================================
// BOOK TYPES
// ============================================================

export interface BookChapter {
  index: number;
  title: string;
  page_start: number;
  page_end: number;
  word_count: number;
  image_count: number;
}

export interface Book {
  id: string;
  title: string;
  original_filename: string | null;
  author: string | null;
  status: ProcessingStatus;
  total_chapters: number;
  total_pages: number;
  total_words: number;
  cover_image_id: string | null;
  parse_progress: number;
  error_message: string | null;
  celery_task_id: string | null;
  chapters: BookChapter[];
  created_at: string;
}

export interface BookListItem {
  id: string;
  title: string;
  author: string | null;
  status: ProcessingStatus;
  total_chapters: number;
  total_pages: number;
  cover_image_id: string | null;
  created_at: string;
}


// ============================================================
// MANGA PROJECT TYPES — the v2 generation control plane
// ============================================================

export type SourceSliceMode = "pages" | "chapters" | "sections";

export interface SourceRange {
  page_start?: number | null;
  page_end?: number | null;
  chapter_start?: number | null;
  chapter_end?: number | null;
  section_ids: string[];
}

export interface SourceSlice {
  slice_id: string;
  book_id: string;
  mode: SourceSliceMode;
  source_range: SourceRange;
  word_count: number;
  is_partial_chapter_start: boolean;
  is_partial_chapter_end: boolean;
}

export interface MangaProject {
  id: string;
  book_id: string;
  style: string;
  engine: "v4" | string;
  title: string;
  status: string;
  project_options: Record<string, unknown>;
  adaptation_plan: Record<string, unknown>;
  character_world_bible: Record<string, unknown>;
  fact_count: number;
  continuity_ledger: Record<string, unknown>;
  coverage: Record<string, unknown>;
  legacy_summary_id: string | null;
  active_version: number;
  created_at: string;
  updated_at: string;
}

export interface MangaProjectResponse {
  project: MangaProject;
}

export interface NextSourceSliceResponse {
  source_slice: SourceSlice | null;
  fully_covered: boolean;
}

export interface MangaProjectsResponse {
  projects: MangaProject[];
}

export interface MangaSliceDoc {
  id: string;
  project_id: string;
  book_id: string;
  source_slice: SourceSlice;
  slice_index: number;
  slice_role: string;
  status: string;
  new_fact_ids: string[];
  quality_report: Record<string, unknown>;
  llm_traces: Record<string, unknown>[];
  created_at: string;
  updated_at?: string;
}

export interface MangaProjectSlicesResponse {
  slices: MangaSliceDoc[];
}

export interface MangaProjectPageDoc {
  id: string;
  project_id: string;
  slice_id: string;
  page_index: number;
  source_range: SourceRange;
  v4_page: Record<string, unknown>;
  created_at: string;
}

export interface MangaProjectPagesResponse {
  pages: MangaProjectPageDoc[];
}

export interface MangaAssetQualityCheck {
  // Mirror of backend SpriteCheck — kept loose because the backend
  // can add new check kinds without us shipping a frontend release.
  check: string;
  severity: "ok" | "warning" | "error" | string;
  details?: string;
  [key: string]: unknown;
}

export interface MangaAssetDoc {
  id: string;
  project_id: string;
  character_id: string;
  asset_type: string;
  expression: string;
  image_path: string;
  prompt: string;
  model: string;
  metadata: Record<string, unknown>;
  // Phase B2 sprite-quality gate fields surfaced for the Library UI:
  status: "" | "ready" | "review_required" | "failed" | string;
  pinned: boolean;
  regen_count: number;
  silhouette_match_score: number | null;
  last_quality_checks: MangaAssetQualityCheck[];
  created_at: string;
  updated_at?: string;
}

export interface MangaProjectAssetsResponse {
  assets: MangaAssetDoc[];
}

export interface AssetMutationResponse {
  // Null when regen was requested but the project lacks generate_images.
  asset: MangaAssetDoc | null;
}

export interface StartMangaSliceGenerationResponse {
  project: MangaProject;
  task_id: string;
  message: string;
}


// ============================================================
// API RESPONSE TYPES
// ============================================================

export interface UploadResponse {
  book_id: string;
  task_id: string;
  is_cached: boolean;
  message: string;
}

export interface JobStatusResponse {
  task_id: string;
  status: "pending" | "progress" | "success" | "failure";
  progress: number;
  message: string;
  result_id: string | null;
  error: string | null;
  // Pipeline tracking
  phase: string | null;
  panels_done: number;
  panels_total: number;
  cost_so_far: number;
  estimated_total_cost: number | null;
}


// ============================================================
// UI STATE TYPES
// ============================================================

export interface StyleOption {
  value: SummaryStyle;
  label: string;
  description: string;
  emoji: string;
  colors: {
    primary: string;
    secondary: string;
    bg: string;
  };
}

export const STYLE_OPTIONS: StyleOption[] = [
  {
    value: "manga",
    label: "Manga",
    description: "Shonen energy, dramatic reveals, speed lines",
    emoji: "⚡",
    colors: { primary: "#00f5ff", secondary: "#ff007f", bg: "#0a0a1a" },
  },
  {
    value: "noir",
    label: "Noir",
    description: "Dark, atmospheric, hard-boiled narrative",
    emoji: "🌃",
    colors: { primary: "#c8b891", secondary: "#667080", bg: "#080810" },
  },
  {
    value: "minimalist",
    label: "Minimalist",
    description: "Clean, precise, scholarly",
    emoji: "◻️",
    colors: { primary: "#ffffff", secondary: "#888888", bg: "#111111" },
  },
  {
    value: "comedy",
    label: "Comedy",
    description: "Witty, relatable, meme energy",
    emoji: "😂",
    colors: { primary: "#ffdd00", secondary: "#ff6b35", bg: "#0f0f1a" },
  },
  {
    value: "academic",
    label: "Academic",
    description: "Rigorous, structured, citation-style",
    emoji: "📚",
    colors: { primary: "#4fc3f7", secondary: "#81c784", bg: "#080c14" },
  },
];
