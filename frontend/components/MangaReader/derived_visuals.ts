/**
 * MangaReader/derived_visuals.ts — pure helpers from StoryboardPanel
 * ==================================================================
 *
 * The storyboard does not author presentation directly: it authors
 * editorial *intent* (purpose, shot_type, dialogue presence) and the
 * reader derives the visual treatment. This module owns those
 * derivation rules. Every function is a pure mapping with no side
 * effects so they can be exercised by ``tsc`` alone (the frontend has
 * no test runner today).
 *
 * Why mirror the backend ``storyboard_mapper.py`` rules here instead
 * of letting the backend send pre-derived V4 fields:
 *
 * 1. The backend already serves the typed ``RenderedPage`` (Phase 4.5a);
 *    duplicating derivation client-side keeps the API payload small
 *    and the renderer authoritative about how it visualises intent.
 * 2. The two implementations are tiny and the rules are stable. If
 *    they ever drift, the symptom is "the editor and the reader
 *    disagree about emphasis" — surfaced in the QA dashboard
 *    (composition_notes vs. rendered look) before a real reader sees
 *    it.
 *
 * 4.5b explicitly preserves the visual behaviour the V4Engine shipped:
 * the same panels render the same way through the new reader. Future
 * phases (4.6+) are free to enrich the derivation; 4.5b is a cutover.
 */

import type {
  StoryboardPanel,
  StoryboardPanelPurpose,
  StoryboardShotType,
  PanelRenderArtifact,
  PageComposition,
} from "@/lib/types";
import type { Emphasis, PaletteKey, PanelKind } from "./types";

// ── Panel kind dispatcher ────────────────────────────────────────────

const SYMBOLIC_OR_INSERT: ReadonlySet<StoryboardShotType> = new Set([
  "symbolic",
  "insert",
]);

/**
 * Decide which sub-renderer handles a panel. Mirrors the backend
 * ``storyboard_mapper._panel_type`` switch verbatim so editor previews
 * and the reader pick the same kind for the same panel.
 */
export function derivePanelKind(panel: StoryboardPanel): PanelKind {
  if (panel.purpose === "to_be_continued" || panel.purpose === "transition") {
    return "transition";
  }
  if (panel.dialogue && panel.dialogue.length > 0) {
    return "dialogue";
  }
  if (panel.purpose === "reveal" && SYMBOLIC_OR_INSERT.has(panel.shot_type)) {
    return "concept";
  }
  if (panel.purpose === "recap") {
    return "narration";
  }
  return panel.narration && panel.narration.trim() ? "narration" : "concept";
}

// ── Emphasis ─────────────────────────────────────────────────────────

const HIGH_EMPHASIS_PURPOSES: ReadonlySet<StoryboardPanelPurpose> = new Set([
  "reveal",
  "to_be_continued",
]);

const HIGH_EMPHASIS_SHOTS: ReadonlySet<StoryboardShotType> = new Set([
  "close_up",
  "extreme_close_up",
  "symbolic",
]);

/**
 * Resolve emphasis honouring the composition's override first. The
 * override exists precisely so a composition can promote a panel
 * (e.g. give it a tall full-row cell) even when the storyboard's
 * intrinsic shot/purpose does not warrant ``high`` on its own. This
 * mirrors ``storyboard_mapper._emphasis``.
 */
export function deriveEmphasis(
  panel: StoryboardPanel,
  override?: string,
): Emphasis {
  if (override === "high" || override === "medium" || override === "low") {
    return override;
  }
  if (HIGH_EMPHASIS_PURPOSES.has(panel.purpose)) return "high";
  if (HIGH_EMPHASIS_SHOTS.has(panel.shot_type)) return "high";
  if (panel.purpose === "transition") return "low";
  return "medium";
}

/** Fetch the emphasis override for a panel from a composition (if any). */
export function emphasisOverrideFor(
  panelId: string,
  composition: PageComposition | null,
): string | undefined {
  if (!composition?.panel_emphasis_overrides) return undefined;
  return composition.panel_emphasis_overrides[panelId];
}

// ── Effects (visual treatments + SFX tokens) ─────────────────────────

/**
 * Derive the synthetic effects list for a panel. Mirrors the backend
 * ``storyboard_mapper._effects``. SFX tokens authored directly into a
 * panel's narration prose are out of scope here — the SfxLayer reads
 * effects only, and 4.5b does not change that contract.
 *
 * Returned list is *additive*: callers may concatenate with effects
 * carried by the artifact in the future (the backend doesn't surface
 * those yet, hence the empty default in the next helper).
 */
export function deriveEffects(panel: StoryboardPanel): string[] {
  const effects: string[] = [];
  if (panel.purpose === "reveal") effects.push("impact");
  if (panel.purpose === "to_be_continued") effects.push("page_turn");
  if (panel.shot_type === "extreme_close_up") effects.push("zoom");
  return effects;
}

// ── Palette key ──────────────────────────────────────────────────────

/**
 * Pick the palette key for a panel. The V4Engine cutover preserves the
 * pre-4.5b behaviour: storyboard-derived panels render with the
 * default ``dramatic-dark`` palette regardless of purpose, because the
 * legacy mapper only ever set ``mood="revelatory"`` (a key absent from
 * the palette table, which therefore fell through to the default).
 *
 * We expose this as its own pure function so a future enrichment phase
 * can swap in a richer purpose → palette mapping in exactly one place,
 * and so the reader's palette decision is testable as data.
 */
export function derivePaletteKey(_panel: StoryboardPanel): PaletteKey {
  // Deliberate single-return: 4.5b is a behaviour-preserving cutover.
  // See module docstring's "future phases" note.
  return "dramatic-dark";
}

// ── Artifact lookup ──────────────────────────────────────────────────

const EMPTY_ARTIFACT: PanelRenderArtifact = Object.freeze({});

/**
 * Look up the render artifact for a panel. Returns a frozen empty
 * object on miss so callers can read ``artifact.image_path`` without a
 * null check — the empty path correctly drives the "no painted art,
 * use the synthetic backdrop" branch.
 *
 * Why frozen: the reader treats the artifact as read-only; freezing
 * surfaces accidental mutation as a runtime error in dev rather than
 * silently sharing state across panels.
 */
export function artifactFor(
  panelId: string,
  panelArtifacts: Record<string, PanelRenderArtifact> | undefined,
): PanelRenderArtifact {
  if (!panelArtifacts) return EMPTY_ARTIFACT;
  return panelArtifacts[panelId] ?? EMPTY_ARTIFACT;
}

// ── Primary character ────────────────────────────────────────────────

/**
 * The legacy mapper picks the first ``character_id`` as the primary.
 * Kept identical so the avatar-disc behaviour in DialoguePanel and the
 * NarrationPanel character tag stay visually unchanged.
 */
export function primaryCharacter(panel: StoryboardPanel): string {
  return panel.character_ids?.[0] ?? "";
}
