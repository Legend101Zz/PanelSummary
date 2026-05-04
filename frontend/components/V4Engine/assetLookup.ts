/**
 * V4Engine/assetLookup.ts \u2014 shared character-asset matching helpers
 * ===================================================================
 * Two panel sub-renderers (V4PanelRenderer and DialoguePanel) need the
 * same logic for "given a character_id + expression, find the best matching
 * V4CharacterAsset in this slice's library." Before this module the lookup
 * was duplicated in both files with identical normalization rules \u2014 if one
 * copy drifted (e.g. one trimmed whitespace and the other didn't) we'd ship
 * inconsistent character matching and not notice. Centralising the rules
 * makes it impossible to drift.
 *
 * Why a separate module instead of a hook: the lookup is pure (no React
 * state, no effects), so imposing useMemo + a hook contract would be
 * accidental complexity. Keep it boring.
 */

import type { V4CharacterAsset } from "./types";

/**
 * Lower-case + collapse whitespace so "Alpha Wolf" matches "alpha_wolf".
 * The backend canonicalises character_ids the same way; this keeps the
 * front-end forgiving without going all the way to fuzzy matching.
 */
export function normalizeAssetKey(value: string | undefined): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Find the best asset for a given character/expression pair.
 *
 * Priority:
 * 1. exact character + exact expression (the rendered emotion matches)
 * 2. same character with any expression (better than nothing)
 * 3. null (caller falls back to a placeholder)
 *
 * Assets without an ``image_url`` are ignored at every step \u2014 the front-end
 * cannot show what it cannot fetch.
 */
export function findAssetForCharacter(
  characterId: string | undefined,
  expression: string | undefined,
  assets: V4CharacterAsset[],
): V4CharacterAsset | null {
  const character = normalizeAssetKey(characterId);
  if (!character) return null;
  const expr = normalizeAssetKey(expression || "neutral");

  const exactMatch = assets.find(
    (asset) =>
      normalizeAssetKey(asset.character_id) === character &&
      normalizeAssetKey(asset.expression || "neutral") === expr &&
      asset.image_url,
  );
  if (exactMatch) return exactMatch;

  const characterMatch = assets.find(
    (asset) =>
      normalizeAssetKey(asset.character_id) === character && asset.image_url,
  );
  return characterMatch || null;
}
