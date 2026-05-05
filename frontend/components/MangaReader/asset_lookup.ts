/**
 * MangaReader/asset_lookup.ts — character asset matching
 * ========================================================
 *
 * Identical lookup rules to ``V4Engine/assetLookup.ts``: lower-case +
 * collapse whitespace so ``"Alpha Wolf"`` matches ``"alpha_wolf"``,
 * exact character + expression first, character-only fallback second,
 * null third. Forked into the MangaReader namespace (rather than
 * imported from V4Engine) so 4.5c can delete V4Engine outright without
 * a frontend co-edit.
 *
 * The ``V4CharacterAsset`` shape is presentation-time and the same on
 * both sides; we keep importing it from the V4Engine for now. The
 * asset domain object lives in ``MangaAssetDoc`` (lib/types) and is
 * adapted into ``V4CharacterAsset`` by the v2 reader page itself.
 * Phase 4.5c will rename the type and move it here.
 */

import type { V4CharacterAsset } from "@/components/V4Engine";

export function normalizeAssetKey(value: string | undefined): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Find the best asset for a given ``character_id`` + ``expression``.
 * Assets without an ``image_url`` are ignored at every step — the
 * reader cannot show what it cannot fetch.
 */
export function findAssetForCharacter(
  characterId: string | undefined,
  expression: string | undefined,
  assets: V4CharacterAsset[],
): V4CharacterAsset | null {
  const character = normalizeAssetKey(characterId);
  if (!character) return null;
  const expr = normalizeAssetKey(expression || "neutral");

  const exact = assets.find(
    (asset) =>
      normalizeAssetKey(asset.character_id) === character &&
      normalizeAssetKey(asset.expression || "neutral") === expr &&
      asset.image_url,
  );
  if (exact) return exact;

  const characterMatch = assets.find(
    (asset) =>
      normalizeAssetKey(asset.character_id) === character && asset.image_url,
  );
  return characterMatch || null;
}

export type { V4CharacterAsset };
