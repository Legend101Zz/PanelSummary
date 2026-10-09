/**
 * A location the writer left as a stand-in. The vocabulary had no moor, ditch
 * or foundry, so run 8's writer stood them in "abstract" or "country_road" and
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
  [/\b(?:foundry|forge|smithy|furnace room)\b/i, "forge"],
  // heaven and the dust heap had no backdrop of their own: clouds, and a low waste ground
  [/\b(?:heaven|paradise|celestial|the clouds)\b/i, "sky"],
  [/\b(?:dust[- ]?heap|rubbish (?:heap|tip)|refuse heap|dung ?heap|midden)\b/i, "ditch"],
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
