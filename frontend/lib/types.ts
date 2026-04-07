/**
 * types.ts — TypeScript Type Definitions
 * ========================================
 * All the "shapes" of data that flow between frontend and backend.
 * TypeScript uses these to catch mistakes before you run the code.
 *
 * WHY TYPES: If you rename a field in the backend and forget to update
 * the frontend, TypeScript will tell you immediately instead of breaking
 * silently at runtime.
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
// MANGA TYPES
// ============================================================

// ── LEGACY panel types (backward compat) ──
export type PanelLayout = "single" | "split" | "full" | "triple";
export type PanelType = "title" | "scene" | "dialogue" | "action" | "recap" | "data";

export interface DialogueLine {
  character: string;
  text: string;
}

export interface MangaPanel {
  panel_index: number;
  panel_type: PanelType;
  layout: PanelLayout;
  caption: string | null;
  dialogue: DialogueLine[];
  visual_description: string;
  image_id: string | null;
}

// ── NEW page-based layout types ──
export type PageLayout = "full" | "2-row" | "3-row" | "2-col" | "L-shape" | "T-shape" | "grid-4";
export type PanelContentType = "narration" | "dialogue" | "splash" | "data" | "transition";
export type Expression = "neutral" | "curious" | "shocked" | "determined" | "wise" | "thoughtful" | "excited" | "sad" | "angry";
export type VisualMood = "dramatic-dark" | "warm-amber" | "cool-mystery" | "intense-red" | "calm-green" | "ethereal-purple";

export interface PagePanel {
  position: string;
  content_type: PanelContentType;
  text?: string | null;
  dialogue: DialogueLine[];
  visual_mood: VisualMood | string;
  character?: string | null;
  expression: Expression | string;
  image_prompt?: string | null;
  image_id?: string | null;
}

export interface MangaPage {
  page_index: number;
  layout: PageLayout;
  panels: PagePanel[];
}

export interface MangaChapter {
  chapter_index: number;
  chapter_title: string;
  style: SummaryStyle;
  pages: MangaPage[];    // new page-based
  panels: MangaPanel[];  // legacy
}

// ============================================================
// REELS TYPES
// ============================================================

export interface ReelLesson {
  reel_index: number;
  chapter_index: number;
  lesson_title: string;
  hook: string;
  key_points: string[];
  visual_theme: string;
  duration_seconds: number;
  style: SummaryStyle;
  // Added by the /reels endpoint
  summary_id?: string;
  book?: {
    id: string;
    title: string;
    author: string | null;
    cover_image_id: string | null;
  };
  total_reels_in_book?: number;
}

// ── VIDEO REELS (DSL-rendered MP4s) ──
export interface VideoReel {
  id: string;
  reel_index: number;
  title: string;
  mood: string;
  duration_ms: number;
  video_path: string;
  render_status?: string;
  created_at: string;
  dsl?: Record<string, any>; // Video DSL for browser-side rendering
  book?: {
    id: string;
    title: string;
    author: string | null;
    cover_image_id: string | null;
  };
  total_reels_in_book?: number;
}

export interface VideoReelsResponse {
  reels: VideoReel[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

export interface BookVideoReelsResponse {
  book: {
    id: string;
    title: string;
    author: string | null;
    cover_image_id: string | null;
  };
  reels: VideoReel[];
  total: number;
}

export interface ReelMemoryResponse {
  total_reels_generated: number;
  used_content_count: number;
  exhausted: boolean;
}

// ============================================================
// SUMMARY TYPES
// ============================================================

export interface CanonicalChapter {
  chapter_index: number;
  chapter_title: string;
  one_liner: string;
  key_concepts: string[];
}

export interface Summary {
  id: string;
  book_id: string;
  style: SummaryStyle;
  status: ProcessingStatus;
  total_tokens_used: number;
  estimated_cost_usd: number;
  manga_chapters: MangaChapter[];
  reels: ReelLesson[];
  canonical_chapters: CanonicalChapter[];
}

export interface SummaryListItem {
  id: string;
  style: SummaryStyle;
  status: ProcessingStatus;
  total_chapters: number;
  total_reels: number;
  estimated_cost_usd: number;
  created_at: string;
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

export interface ReelsPageResponse {
  reels: ReelLesson[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
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
