/**
 * Manga render-view TypeScript mirror.
 *
 * Backend Pydantic models remain the source of truth. Keep this file aligned
 * with `backend/app/domain/manga/render_view.py` and
 * `backend/app/domain/manga/page_composition.py` whenever the wire contract
 * changes. These types live outside `types.ts` so the shared API file stays
 * under the puppy-approved 600-line ceiling. Tiny victory, huge vibes.
 */

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
  intent?: string;
  source_fact_ids?: string[];
}

export interface StoryboardPanel {
  panel_id: string;
  scene_id: string;
  purpose: StoryboardPanelPurpose;
  shot_type: StoryboardShotType;
  composition: string;
  action?: string;
  dialogue?: StoryboardScriptLine[];
  narration?: string;
  source_fact_ids?: string[];
  character_ids?: string[];
}

export interface StoryboardPage {
  page_id: string;
  page_index: number;
  panels: StoryboardPanel[];
  page_turn_hook?: string;
  reading_flow?: string;
}

export interface LayoutPointPct {
  x_pct: number;
  y_pct: number;
}

export interface LayoutBoxPct extends LayoutPointPct {
  width_pct: number;
  height_pct: number;
}

export interface PanelPlacement {
  bbox_pct: LayoutBoxPct;
  z_index?: number;
  bleed_edges?: ("top" | "right" | "bottom" | "left" | string)[];
}

export interface SpriteLayer {
  character_id: string;
  expression?: string;
  bbox_pct: LayoutBoxPct;
  z_index?: number;
  opacity?: number;
  flip_x?: boolean;
}

export interface BubblePlacement {
  line_index: number;
  speaker_id?: string;
  bbox_pct: LayoutBoxPct;
  tail_side?: "left" | "right" | "bottom" | "top" | string;
  tail_offset_pct?: number;
  variant?: "speech" | "thought" | "shout" | string;
  z_index?: number;
}

export interface PageGridRow {
  cell_widths_pct: number[];
}

export interface PageComposition {
  page_index: number;
  gutter_grid: PageGridRow[];
  panel_order: string[];
  page_turn_panel_id?: string;
  panel_emphasis_overrides?: Record<string, string>;
  row_heights_pct?: number[];
  gutter_px?: number;
  panel_placements?: Record<string, PanelPlacement>;
  sprite_layers?: Record<string, SpriteLayer[]>;
  bubble_placements?: Record<string, BubblePlacement[]>;
  composition_notes?: string;
}

export interface PanelRenderArtifact {
  image_path?: string;
  image_aspect_ratio?: string;
  used_reference_assets?: string[];
  requested_character_count?: number;
  error?: string;
}

export interface RenderedPage {
  storyboard_page: StoryboardPage;
  composition: PageComposition | null;
  panel_artifacts: Record<string, PanelRenderArtifact>;
}
