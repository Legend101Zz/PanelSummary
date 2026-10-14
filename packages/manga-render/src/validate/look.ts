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
  ARCHETYPE_SPECIES,
  LOOK_KINDS,
  LOOK_MARKS,
  LOOK_MARKS_MAX,
  LOOK_SCALE_MAX,
  LOOK_SCALE_MIN,
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
  if (look.scale !== undefined && !(typeof look.scale === "number" && Number.isFinite(look.scale) && look.scale >= LOOK_SCALE_MIN && look.scale <= LOOK_SCALE_MAX)) {
    issues.error(
      "LOOK_SCALE_RANGE",
      path,
      `look "scale" is ${show(look.scale)}, which is not allowed; use a number from ${LOOK_SCALE_MIN} to ${LOOK_SCALE_MAX} (the figure height relative to an adult person: 1 is an adult, 0.5 is half as tall, 3 is three times as tall), or leave "scale" out for the usual size.`,
    );
  }
  if (look.marks !== undefined) validateMarks(look, kind, issues, path);
  warnUnknownKeys(look, ["kind", "scale", ...(look.marks !== undefined ? ["marks"] : []), ...Object.keys(fields), ...(kind === "plant" ? ["bloom"] : []), ...(kind === "crowd" ? ["count"] : [])], issues, path);
  const after = issues.list.filter((i) => i.severity === "error").length;
  return after === before;
}

/**
 * look.marks (v0.3, #81): body marks of a neutral stand-in. Only on an archetype species of an animal or a bird
 * (LOOK_MARKS_NOT_ARCHETYPE elsewhere); an unknown mark is ENUM_INVALID; at most LOOK_MARKS_MAX.
 */
function validateMarks(look: Record<string, unknown>, kind: string, issues: Issues, path: string): void {
  const marks = look.marks;
  if (!Array.isArray(marks)) {
    issues.error("FIELD_TYPE", `${path}.marks`, `look "marks" must be an array of: ${listValues(LOOK_MARKS)}, got ${show(marks)}.`);
    return;
  }
  const species = typeof look.species === "string" ? look.species : "";
  const archetype = (kind === "animal" || kind === "bird") && (ARCHETYPE_SPECIES as readonly string[]).includes(species);
  if (!archetype && marks.length > 0) {
    issues.error(
      "LOOK_MARKS_NOT_ARCHETYPE",
      `${path}.marks`,
      `look "marks" is only for a neutral stand-in species (${listValues(ARCHETYPE_SPECIES)}); ${kind === "animal" || kind === "bird" ? `"${species}"` : `a ${kind} look`} already has its own shape. Remove "marks", or use a neutral species that fits.`,
    );
  }
  const seen = new Set<string>();
  marks.forEach((m, i) => {
    if (typeof m !== "string" || !(LOOK_MARKS as readonly string[]).includes(m)) {
      issues.error("ENUM_INVALID", `${path}.marks[${i}]`, `mark ${show(m)} is not allowed; use one of: ${listValues(LOOK_MARKS)}.`);
    } else if (seen.has(m)) {
      issues.warn("DUPLICATE_VALUE", `${path}.marks[${i}]`, `mark "${m}" is listed twice; list it once.`);
    } else seen.add(m);
  });
  if (marks.length > LOOK_MARKS_MAX) {
    issues.error("LOOK_MARKS_TOO_MANY", `${path}.marks`, `look "marks" has ${marks.length} marks; use at most ${LOOK_MARKS_MAX} (the ones that tell this animal apart).`);
  }
}
