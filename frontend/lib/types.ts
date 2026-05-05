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
  engine: string;
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
  // Phase 4.5c+: RenderedPage is the only page contract returned by
  // the API. Legacy docs with an empty payload narrow to null in the
  // reader and show the empty/regenerate state.
  rendered_page: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// MANGA RENDER VIEW \u2014 Phase 4.5b TS mirror of the backend
// ``RenderedPage`` contract (``app/domain/manga/render_view.py``).
//
// These types describe the *shape* the API ships. Backend pydantic
// models are the source of truth; if a field changes there, change it
// here too. We mirror only the fields the renderer reads \u2014 anything
// the renderer doesn't consume stays implicit. Drift cost: a missing
// field surfaces as ``undefined`` at the consumer (the reader handles
// that gracefully), never as a runtime crash.
// ============================================================

export type StoryboardShotType =
  | "extreme_wide"
  | "wide"
  | "medium"
  | "close_up"
  | "extreme_close_up"
  | "insert"
  | "symbolic";

export type StoryboardPanelPurpose =
  | "setup"
  | "explanation"
  | "emotional_turn"
  | "reveal"
  | "transition"
  | "recap"
  | "to_be_continued";

export interface StoryboardScriptLine {
  speaker_id: string;
  text: string;
  // Author's intent for the line. The MangaReader maps this onto the
  // SpeechBubble variant (shocked/angry \u2192 shout, thinking \u2192 thought,
  // anything else \u2192 plain speech) so the lettering matches the line's
  // emotional weight without the backend having to author bubble shapes.
  intent?: string;
  source_fact_ids?: string[];
}

export interface StoryboardPanel {
  panel_id: string;
  scene_id: string;
  purpose: StoryboardPanelPurpose;
  shot_type: StoryboardShotType;
  // Free-form composition prose authored by the storyboarder. Surfaced
  // in QA dashboards; the reader does not render it directly.
  composition: string;
  action?: string;
  dialogue?: StoryboardScriptLine[];
  narration?: string;
  source_fact_ids?: string[];
  // Characters VISUALLY PRESENT (not merely mentioned). The renderer
  // attaches one reference sheet per id. The backend validator
  // auto-includes every dialogue speaker, so this list is the
  // authoritative on-stage roster for the panel.
  character_ids?: string[];
}

export interface StoryboardPage {
  page_id: string;
  page_index: number;
  panels: StoryboardPanel[];
  page_turn_hook?: string;
  reading_flow?: string;
}

export interface PageGridRow {
  // Integer percentages summing to 100. Kept as ints (not fractions)
  // because the renderer hands them straight to CSS Grid track sizes
  // and integer percents avoid sub-pixel gutter seams.
  cell_widths_pct: number[];
}

export interface PageComposition {
  page_index: number;
  gutter_grid: PageGridRow[];
  panel_order: string[];
  page_turn_panel_id?: string;
  // Sparse map: panel_id \u2192 ``"low" | "medium" | "high"``. Overrides the
  // storyboard's emphasis when the composition wants to promote a
  // panel (e.g. give it a tall full-row cell as a splash).
  panel_emphasis_overrides?: Record<string, string>;
  composition_notes?: string;
}

export interface PanelRenderArtifact {
  // Empty string means "not rendered yet" or "render skipped". The
  // reader treats both the same way \u2014 fall back to the synthetic
  // mood-driven backdrop. Non-empty + ``error`` empty means art is
  // ready to layer behind the lettering.
  image_path?: string;
  image_aspect_ratio?: string;
  used_reference_assets?: string[];
  requested_character_count?: number;
  error?: string;
}

export interface RenderedPage {
  storyboard_page: StoryboardPage;
  // Null when the composition stage gave up (no LLM gutter grid). The
  // reader falls back to a deterministic panel-count layout in that case.
  composition: PageComposition | null;
  // Keyed by ``panel_id``. The backend invariant is that every panel
  // id appears as a key (validated in ``RenderedPage._artifact_keys_match_panels``);
  // the reader still defaults to an empty artifact on miss because
  // legacy docs that pre-date Phase 4 have no artifacts at all.
  panel_artifacts: Record<string, PanelRenderArtifact>;
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
  // Phase 3.1: planner-asked-for-but-not-persisted gaps. Empty when the
  // bible has no characters or every spec has a doc.
  missing_expressions: MissingExpression[];
}

export interface MissingExpression {
  character_id: string;
  expression: string;
  // "reference_sheet" or "expression" — lets the UI render different
  // copy for "missing front view" vs "missing panicked face".
  asset_type: string;
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
