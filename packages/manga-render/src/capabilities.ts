/** What each cast member's rig can draw — shown to the page writer per character. */
import { ARCHETYPE_SPECIES, type CastMember, type Expression, type Pose } from "./contracts.js";
import { rig } from "./rig/index.js";

export interface CastCapability {
  id: string;
  name: string;
  kind: string;
  poses: readonly Pose[];
  expressions: readonly Expression[];
  /** Size in figure units (an adult person is 100), with look.scale applied. */
  nominal_height?: number;
  /** Set for a neutral stand-in species: it is drawn with a name tag (the renderer adds it). */
  stand_in?: boolean;
}

export function castCapabilities(cast: readonly CastMember[]): CastCapability[] {
  return cast.map((member) => {
    let poses: readonly Pose[] = [];
    let expressions: readonly Expression[] = [];
    let nominal: number | undefined;
    try {
      poses = rig.supportedPoses(member.look);
      expressions = rig.supportedExpressions(member.look);
      nominal = rig.nominalHeight(member.look);
    } catch {
      // An invalid look is reported by validation; nothing is drawable.
    }
    const look = member.look as { kind?: string; species?: string } | undefined;
    const standIn = (look?.kind === "animal" || look?.kind === "bird") && (ARCHETYPE_SPECIES as readonly string[]).includes(look.species ?? "");
    return { id: member.id, name: member.name, kind: member.look?.kind ?? "unknown", poses, expressions, ...(nominal !== undefined ? { nominal_height: Math.round(nominal * 10) / 10 } : {}), ...(standIn ? { stand_in: true } : {}) };
  });
}
