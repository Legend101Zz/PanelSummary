/**
 * V4 Engine Types — Semantic Intent DSL
 * =======================================
 * Matches the backend V4 DSL schema exactly.
 * The LLM generates these slim types; the engine renders the visuals.
 */

// ── Panel Types ────────────────────────────────

export type V4PanelType =
  | "splash"
  | "dialogue"
  | "narration"
  | "data"
  | "montage"
  | "concept"
  | "transition";

export type V4Emphasis = "high" | "medium" | "low";

export type V4Scene =
  | "laboratory"
  | "digital-realm"
  | "battlefield"
  | "workshop"
  | "summit"
  | "void"
  | "classroom"
  | "";

export type V4Mood =
  | "dramatic-dark"
  | "tense"
  | "light"
  | "triumphant"
  | "mysterious"
  | "melancholy"
  | "";

export type V4Pose =
  | "standing"
  | "thinking"
  | "action"
  | "dramatic"
  | "defeated"
  | "presenting"
  | "pointing"
  | "celebrating"
  | "";

export type V4Expression =
  | "determined"
  | "neutral"
  | "shocked"
  | "angry"
  | "smirk"
  | "fearful"
  | "triumphant"
  | "frustrated"
  | "";

// ── Data Structures ────────────────────────────

export interface V4DialogueLine {
  who: string;
  says: string;
  emotion?: string;
}

export interface V4DataItem {
  label: string;
  value?: string;
}

export interface V4CharacterAsset {
  character_id: string;
  expression?: string;
  asset_type?: string;
  image_url: string | null;
}

export interface V4Panel {
  type: V4PanelType;
  panel_id?: string;
  chapter_index?: number;
  scene?: V4Scene;
  mood?: V4Mood;
  title?: string;
  narration?: string;
  lines?: V4DialogueLine[];
  data_items?: V4DataItem[];
  character?: string;
  /**
   * Phase 7: full list of characters visually present in the panel. The
   * backend storyboarder authors this; the multimodal panel renderer uses
   * it to attach one reference sheet per id. The viewer can use it to label
   * a panel with multiple speakers' name tags or to look up a richer asset
   * for each character without inferring from dialogue lines.
   */
  character_ids?: string[];
  pose?: V4Pose;
  expression?: V4Expression;
  effects?: string[];
  emphasis?: V4Emphasis;
  /**
   * Phase 4: relative path to the painted panel art (under settings.image_dir).
   * Optional — when present, the renderer layers this image as the panel
   * backdrop and overlays text/dialogue on top, mimicking real manga where
   * speech bubbles sit ON the art, not next to it. When absent, the renderer
   * falls back to the synthetic mood-driven background.
   */
  image_path?: string;
  /**
   * Phase 4: aspect ratio the panel art was generated at (e.g. "2:3", "1:1").
   * Used by the page layout to size the panel container so the painted art
   * isn't squashed.
   */
  image_aspect_ratio?: string;
}

// ── Page Layout ────────────────────────────────

export type V4PageLayout =
  | "vertical"
  | "grid-2"
  | "grid-3"
  | "grid-4"
  | "asymmetric"
  | "full"
  /**
   * Phase C1: when ``gutter_grid`` is authored by ``page_composition_stage``
   * the layout token becomes ``"custom"``. Older renderers that don't yet
   * understand ``gutter_grid`` fall back to a default layout instead of
   * mis-applying ``"asymmetric"`` against custom widths.
   */
  | "custom";

export interface V4Page {
  version: "4.0";
  page_index: number;
  chapter_index: number;
  layout: V4PageLayout;
  panels: V4Panel[];
  /**
   * Phase C1: rows of integer percentages (each row sums to 100). The
   * renderer reads this to build a CSS Grid; absent or empty means
   * "use the legacy panel-count layout". RTL flow is applied at render
   * time via ``direction: rtl`` on the page container.
   */
  gutter_grid?: number[][];
  /**
   * Phase C1: panel id of the bottom-left page-turn beat. The renderer
   * highlights this cell (subtle border) so editors can see the
   * cliffhanger anchor at a glance during QA.
   */
  page_turn_panel_id?: string;
  /**
   * Phase C1: the LLM's one-line rationale for this page's composition.
   * Surfaced in the QA dashboard, not in the reader UI.
   */
  composition_notes?: string;
}

// ── Mood → Visual Mapping ──────────────────────

export const MOOD_PALETTES: Record<string, { bg: string; text: string; accent: string; border: string }> = {
  "dramatic-dark": { bg: "#0F0E17", text: "#F0EEE8", accent: "#E8191A", border: "#2E2C3F" },
  "tense":         { bg: "#1A1825", text: "#F0EEE8", accent: "#F5A623", border: "#3E3C4F" },
  "light":         { bg: "#F2E8D5", text: "#2A2A2A", accent: "#0053E2", border: "#D4C8B0" },
  "triumphant":    { bg: "#1A2810", text: "#F0EEE8", accent: "#2A8703", border: "#2E3C1F" },
  "mysterious":    { bg: "#17101F", text: "#C8C0E0", accent: "#9B59B6", border: "#2E1C4F" },
  "melancholy":    { bg: "#1A1D25", text: "#A0A8B8", accent: "#5E7090", border: "#2C3040" },
};

export const DEFAULT_PALETTE = MOOD_PALETTES["dramatic-dark"];

// ── Emphasis → Size Weight ─────────────────────

export const EMPHASIS_WEIGHTS: Record<V4Emphasis, number> = {
  high: 2,
  medium: 1,
  low: 0.6,
};
