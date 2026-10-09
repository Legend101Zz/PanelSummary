/** CharacterLook validation (every field against the closed vocabularies). */
import {
  ACCESSORIES,
  ANIMAL_SPECIES,
  BIRD_SPECIES,
  CROWD_TYPES,
  EMBLEMS,
  FACIAL_HAIR,
  HAIR_STYLES,
  HEADWEAR,
  HUMAN_AGES,
  HUMAN_BUILDS,
  HUMAN_FRAMES,
  HUMAN_HEIGHTS,
  INSECT_SPECIES,
  LOOK_KINDS,
  MATERIALS,
  OBJECT_SHAPES,
  OUTFITS,
  PLANT_BLOOMS,
  PLANT_SPECIES,
  SKIN_TONES,
  SPIRIT_TYPES,
  TONES,
  type CharacterLook,
} from "../contracts.js";
import { checkEnum, isRecord, Issues, listValues, show, warnUnknownKeys } from "./util.js";

/** Field → allowed values for each look kind (booleans marked "boolean"). */
export const LOOK_FIELDS: Record<CharacterLook["kind"], Record<string, readonly string[] | "boolean" | "accessories" | "size">> = {
  human: {
    age: HUMAN_AGES,
    build: HUMAN_BUILDS,
    height: HUMAN_HEIGHTS,
    frame: HUMAN_FRAMES,
    hair: HAIR_STYLES,
    hair_tone: TONES,
    facial_hair: FACIAL_HAIR,
    outfit: OUTFITS,
    outfit_tone: TONES,
    headwear: HEADWEAR,
    accessories: "accessories",
    skin: SKIN_TONES,
    material: MATERIALS,
  },
  bird: { species: BIRD_SPECIES, tone: TONES },
  animal: { species: ANIMAL_SPECIES, tone: TONES },
  insect: { species: INSECT_SPECIES, tone: TONES },
  object: { shape: OBJECT_SHAPES, tone: TONES, face: "boolean" },
  plant: { species: PLANT_SPECIES, tone: TONES, face: "boolean" },
  spirit: { element: SPIRIT_TYPES },
  crowd: { crowd: CROWD_TYPES, size: "size" },
  emblem: { emblem: EMBLEMS },
};

/** Returns true when the look is fully valid (safe to hand to a rig). */
export function validateLook(look: unknown, issues: Issues, path: string): look is CharacterLook {
  if (!isRecord(look)) {
    issues.error("LOOK_INVALID", path, `"look" must be an object with a "kind" (one of: ${listValues(LOOK_KINDS)}) and that kind's fields.`);
    return false;
  }
  const before = issues.list.filter((i) => i.severity === "error").length;
  const kind = checkEnum(look, "kind", LOOK_KINDS, issues, path);
  if (!kind) return false;
  const fields = LOOK_FIELDS[kind];
  for (const [field, allowed] of Object.entries(fields)) {
    const v = look[field];
    if (allowed === "boolean") {
      if (typeof v !== "boolean") issues.error(v === undefined ? "FIELD_MISSING" : "FIELD_TYPE", path, `${kind} look needs "${field}": true or false, got ${show(v)}.`);
    } else if (allowed === "size") {
      if (v !== "few" && v !== "many") issues.error(v === undefined ? "FIELD_MISSING" : "ENUM_INVALID", path, `crowd look needs "size": "few" or "many", got ${show(v)}.`);
    } else if (allowed === "accessories") {
      if (!Array.isArray(v)) {
        issues.error(v === undefined ? "FIELD_MISSING" : "FIELD_TYPE", path, `human look needs "accessories": an array (may be empty) of: ${listValues(ACCESSORIES)}.`);
      } else {
        const seen = new Set<string>();
        v.forEach((a, i) => {
          if (typeof a !== "string" || !(ACCESSORIES as readonly string[]).includes(a)) {
            issues.error("ENUM_INVALID", `${path}.accessories[${i}]`, `accessory ${show(a)} is not allowed; use one of: ${listValues(ACCESSORIES)}.`);
          } else if (seen.has(a)) {
            issues.warn("DUPLICATE_VALUE", `${path}.accessories[${i}]`, `accessory "${a}" is listed twice; list it once.`);
          } else seen.add(a);
        });
      }
    } else {
      checkEnum(look, field, allowed, issues, path);
    }
  }
  if (kind === "plant") checkEnum(look, "bloom", PLANT_BLOOMS, issues, path, false);
  if (kind === "crowd" && look.count !== undefined && !(typeof look.count === "number" && Number.isInteger(look.count) && look.count >= 1 && look.count <= 8)) {
    issues.error("FIELD_TYPE", path, `crowd look "count" must be a whole number from 1 to 8 (an exact head count), got ${show(look.count)}. Leave it out to let "size" decide.`);
  }
  warnUnknownKeys(look, ["kind", ...Object.keys(fields), ...(kind === "plant" ? ["bloom"] : []), ...(kind === "crowd" ? ["count"] : [])], issues, path);
  const after = issues.list.filter((i) => i.severity === "error").length;
  return after === before;
}
