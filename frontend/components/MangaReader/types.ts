/**
 * MangaReader/types.ts — local visual constants for the new reader
 * =================================================================
 *
 * Why a sibling to ``V4Engine/types.ts`` instead of importing from it:
 * the V4Engine directory is on the chopping block in Phase 4.5c. If the
 * MangaReader imported palettes / weights from V4Engine, deleting that
 * directory would force a frontend rewrite in the same commit — exactly
 * the coupled change the locked 4.5 decomposition was designed to
 * prevent. Copying these constants is cheap (a handful of objects) and
 * lets 4.5c be a pure ``rm -r``.
 *
 * Storyboard panels do NOT carry ``mood`` directly; the reader derives a
 * palette key from ``purpose`` + ``shot_type`` in ``derived_visuals.ts``.
 * This file owns the palette table the keys point at.
 */

import type { StoryboardPanelPurpose } from "@/lib/types";

export type PaletteKey =
  | "dramatic-dark"
  | "tense"
  | "light"
  | "triumphant"
  | "mysterious"
  | "melancholy";

export interface MangaPalette {
  bg: string;
  text: string;
  accent: string;
  border: string;
}

/**
 * Same six palettes the V4 reader shipped with — kept verbatim so the
 * 4.5b cutover is visually a no-op. Future phases can enrich the
 * derivation logic in ``derived_visuals.ts`` without touching the
 * palette set itself.
 */
export const MANGA_PALETTES: Record<PaletteKey, MangaPalette> = {
  "dramatic-dark": { bg: "#fffaf0", text: "#1f1f29", accent: "#ea1100", border: "#1f1f29" },
  tense:           { bg: "#fff7df", text: "#1f1f29", accent: "#995213", border: "#1f1f29" },
  light:           { bg: "#ffffff", text: "#1f1f29", accent: "#0053e2", border: "#1f1f29" },
  triumphant:      { bg: "#f4fbef", text: "#1f1f29", accent: "#2a8703", border: "#1f1f29" },
  mysterious:      { bg: "#f7f4ff", text: "#1f1f29", accent: "#0053e2", border: "#1f1f29" },
  melancholy:      { bg: "#f2f5f9", text: "#1f1f29", accent: "#4b5563", border: "#1f1f29" },
};

export const DEFAULT_PALETTE: MangaPalette = MANGA_PALETTES["dramatic-dark"];

export type Emphasis = "high" | "medium" | "low";

/**
 * Flex weights: a ``high``-emphasis panel gets ~3x the vertical space
 * of a ``low`` one inside the legacy panel-count layout. Composition
 * paths use the gutter grid directly so these weights only matter for
 * legacy pages without a ``PageComposition``.
 */
export const EMPHASIS_WEIGHTS: Record<Emphasis, number> = {
  high: 2,
  medium: 1,
  low: 0.6,
};

/**
 * The four kinds of sub-renderer the dispatcher picks between. Note
 * there is no ``splash`` kind: ``storyboard_mapper`` never emits
 * ``splash`` for storyboard-derived panels, so the reader has nothing
 * to dispatch to. We could promote a wide-shot REVEAL to splash in a
 * future phase; that is explicitly out of 4.5b's scope (no behaviour
 * change in this cutover).
 */
export type PanelKind = "dialogue" | "narration" | "concept" | "transition";

/**
 * Re-exported for convenience so panel sub-renderers can import
 * everything visual from one neighbour file.
 */
export type { StoryboardPanelPurpose };
