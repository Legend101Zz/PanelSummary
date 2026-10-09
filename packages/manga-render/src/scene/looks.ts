/**
 * Per-appearance looks: a FigureSpec.variant changes how a cast member looks
 * in one panel (the Happy Prince stripped to stone and blind, a dead bird) and
 * leaves the cast look untouched elsewhere. The composer merges the variant
 * into the look it hands to the rig and passes `variant.eyes` separately.
 */
import type { CastMember, CharacterLook, EyeState, LookVariant } from "../contracts.js";

/** Look kinds whose drawing has a single body `tone` a variant may change. */
export const TONED_KINDS: ReadonlySet<CharacterLook["kind"]> = new Set(["bird", "animal", "insect", "object", "plant"]);

/** Variant fields each look kind accepts (eyes apply to every kind). */
export function variantFieldsFor(kind: CharacterLook["kind"]): readonly (keyof LookVariant)[] {
  if (kind === "human") return ["eyes", "material", "outfit_tone", "hair_tone"];
  if (kind === "plant") return ["eyes", "tone", "bloom"];
  if (TONED_KINDS.has(kind)) return ["eyes", "tone"];
  return ["eyes"];
}

/** The cast look with a panel's variant merged in (fields that do not apply to the kind are ignored). */
export function lookWithVariant(look: CharacterLook, variant: LookVariant | undefined): CharacterLook {
  if (!variant) return look;
  if (look.kind === "human") {
    const out = { ...look };
    if (variant.material) out.material = variant.material;
    if (variant.outfit_tone) out.outfit_tone = variant.outfit_tone;
    if (variant.hair_tone) out.hair_tone = variant.hair_tone;
    return out;
  }
  if (look.kind === "plant" && (variant.tone || variant.bloom)) {
    return { ...look, ...(variant.tone ? { tone: variant.tone } : {}), ...(variant.bloom ? { bloom: variant.bloom } : {}) };
  }
  if (variant.tone && TONED_KINDS.has(look.kind)) return { ...look, tone: variant.tone } as CharacterLook;
  return look;
}

/** A cast member as it appears with this variant (same id and seed, merged look). */
export function castWithVariant(cast: CastMember, variant: LookVariant | undefined): CastMember {
  const look = lookWithVariant(cast.look, variant);
  return look === cast.look ? cast : { ...cast, look };
}

export function eyesOf(variant: LookVariant | undefined): EyeState | undefined {
  return variant?.eyes;
}
