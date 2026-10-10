/**
 * A location the writer left as a stand-in. The vocabulary had no moor or ditch (v0.2 added foundry, dust heap and Paradise), so run 8's writer stood them in "abstract" or "country_road" and
 * the panels drew blank paper or a dry road. A location that sits on one of
 * those stand-ins but NAMES a moor, a ditch or a forge in its name or
 * description is drawn as that place. A location with a real environment is
 * never changed.
 */
import type { Environment, LocationSpec } from "../contracts.js";

/** Environments a writer picks when nothing fits (never changed for any other value). */
const STAND_INS: ReadonlySet<Environment> = new Set(["abstract", "void", "country_road", "meadow"]);

const NAMED: readonly [RegExp, Environment][] = [
  [/\b(?:moors?|moorland|heath|heathland)\b/i, "moor"],
  [/\bditch(?:es)?\b/i, "ditch"],
  // v0.2 (#41): a foundry, the dust heap and Paradise have environments of their own
  [/\b(?:foundry|foundries|furnace room)\b/i, "foundry"],
  [/\b(?:forge|smithy)\b/i, "forge"],
  [/\b(?:dust[- ]?heap|dust[- ]?hill|rubbish (?:heap|tip)|refuse heap|dung ?heap|midden)\b/i, "dustheap"],
  [/\b(?:heaven|paradise|celestial)\b/i, "paradise"],
  [/\bthe clouds\b/i, "sky"],
];

export function resolveEnvironment(location: Pick<LocationSpec, "environment" | "name" | "description"> | undefined): Environment | undefined {
  if (!location) return undefined;
  if (!STAND_INS.has(location.environment)) return location.environment;
  // the name decides first, then the description
  for (const text of [location.name ?? "", location.description ?? ""]) {
    for (const [re, env] of NAMED) if (re.test(text)) return env;
  }
  return location.environment;
}

/** The location with its environment resolved (the same object when nothing changes). */
export function resolveLocation(location: LocationSpec | undefined): LocationSpec | undefined {
  if (!location) return location;
  const env = resolveEnvironment(location);
  return env === location.environment || env === undefined ? location : { ...location, environment: env };
}
