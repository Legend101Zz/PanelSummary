/**
 * MangaReader/asset_lookup.ts — character asset matching
 * ========================================================
 *
 * Phase 4.5c update: the V4Engine import is gone. ``MangaCharacterAsset``
 * lives here as the canonical presentation-time shape — same fields the
 * legacy ``V4CharacterAsset`` had, renamed to drop the V4 namespace
 * tag. The reader page adapts ``MangaAssetDoc`` (the on-the-wire shape)
 * into this presentation shape; nothing else in the tree should know
 * about MangaAssetDoc.
 *
 * Lookup rules unchanged from the V4 incarnation: lower-case + collapse
 * whitespace so ``"Alpha Wolf"`` matches ``"alpha_wolf"``, exact
 * character + expression first, character-only fallback second, null
 * third. Assets without an ``image_url`` are skipped at every step —
 * the reader cannot show what it cannot fetch.
 */

/**
 * Presentation-time character asset. The reader page adapts the
 * domain ``MangaAssetDoc`` into this shape so the renderer never
 * touches the persistence model directly.
 */
export interface MangaCharacterAsset {
  character_id: string;
  expression?: string;
  asset_type?: string;
  image_url: string | null;
}

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
  assets: MangaCharacterAsset[],
): MangaCharacterAsset | null {
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
