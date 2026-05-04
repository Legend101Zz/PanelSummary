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
  adaptation_plan: AdaptationPlan | Record<string, never>;
  character_world_bible: CharacterWorldBible | Record<string, never>;
  character_voice_cards: CharacterVoiceCardBundle | Record<string, never>;
  book_synopsis: BookSynopsis | Record<string, never>;
  arc_outline: ArcOutline | Record<string, never>;
  understanding_status: "pending" | "running" | "ready" | "failed" | string;
  understanding_error: string;
  bible_locked: boolean;
  book_understanding_traces: Record<string, unknown>[];
  fact_count: number;
  continuity_ledger: Record<string, unknown>;
  coverage: Record<string, unknown>;
  legacy_summary_id: string | null;
  active_version: number;
  created_at: string;
  updated_at: string;
}

// ============================================================
// BOOK UNDERSTANDING TYPES — shape mirrors backend domain models.
// We deliberately type only the fields the UI renders; everything
// else stays as `unknown`/optional so a backend additive change
// does not snap the frontend.
// ============================================================

export interface BookSynopsis {
  title?: string;
  author_voice?: string;
  intended_reader?: string;
  central_thesis: string;
  logline: string;
  structural_signal?: string;
  themes?: string[];
  key_concepts?: string[];
  emotional_arc?: string[];
  notable_evidence?: string[];
}

export interface ProtagonistContract {
  who: string;
  wants: string;
  why_cannot_have_it: string;
  what_they_do: string;
}

export interface AdaptationPlan {
  title?: string;
  logline: string;
  central_thesis: string;
  protagonist_contract: ProtagonistContract;
  important_fact_ids?: string[];
  emotional_journey?: string[];
  intellectual_journey?: string[];
  memorable_metaphors?: string[];
}

export interface ArcSliceEntry {
  slice_number: number;
  role: string;
  beat_summary: string;
  emotional_target?: string;
  key_fact_ids?: string[];
}

export interface ArcOutline {
  book_id: string;
  target_slice_count: number;
  structure: string;
  notes?: string;
  entries: ArcSliceEntry[];
}

export interface BookCharacter {
  character_id: string;
  name: string;
  role: string;
  represents?: string;
  personality?: string;
  strengths?: string[];
  flaws?: string[];
  visual_lock?: string;
  silhouette_notes?: string;
  outfit_notes?: string;
  hair_or_face_notes?: string;
  speech_style?: string;
}

export interface CharacterWorldBible {
  world_summary?: string;
  visual_style?: string;
  recurring_motifs?: string[];
  characters: BookCharacter[];
  palette_notes?: string;
  lettering_notes?: string;
}

export interface CharacterVoiceCard {
  character_id: string;
  name: string;
  core_attitude: string;
  speech_rhythm: string;
  vocabulary_do: string[];
  vocabulary_dont: string[];
  example_lines: string[];
}

export interface CharacterVoiceCardBundle {
  cards: CharacterVoiceCard[];
}

export interface StartBookUnderstandingResponse {
  project: MangaProject;
  task_id: string | null;
  message: string;
  already_ready: boolean;
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
  // Phase 3.2: independent costume-adherence score from the vision gate.
  outfit_match_score: number | null;
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
