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
  "dramatic-dark": { bg: "#0F0E17", text: "#F0EEE8", accent: "#E8191A", border: "#2E2C3F" },
  tense:           { bg: "#1A1825", text: "#F0EEE8", accent: "#F5A623", border: "#3E3C4F" },
  light:           { bg: "#F2E8D5", text: "#2A2A2A", accent: "#0053E2", border: "#D4C8B0" },
  triumphant:      { bg: "#1A2810", text: "#F0EEE8", accent: "#2A8703", border: "#2E3C1F" },
  mysterious:      { bg: "#17101F", text: "#C8C0E0", accent: "#9B59B6", border: "#2E1C4F" },
  melancholy:      { bg: "#1A1D25", text: "#A0A8B8", accent: "#5E7090", border: "#2C3040" },
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
