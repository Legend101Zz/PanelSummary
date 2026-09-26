/** What each cast member's rig can draw — shown to the page writer per character. */
import type { CastMember, Expression, Pose } from "./contracts.js";
import { rig } from "./rig/index.js";

export interface CastCapability {
  id: string;
  name: string;
  kind: string;
  poses: readonly Pose[];
  expressions: readonly Expression[];
}

export function castCapabilities(cast: readonly CastMember[]): CastCapability[] {
  return cast.map((member) => {
    let poses: readonly Pose[] = [];
    let expressions: readonly Expression[] = [];
    try {
      poses = rig.supportedPoses(member.look);
      expressions = rig.supportedExpressions(member.look);
    } catch {
      // An invalid look is reported by validation; nothing is drawable.
    }
    return { id: member.id, name: member.name, kind: member.look?.kind ?? "unknown", poses, expressions };
  });
}
