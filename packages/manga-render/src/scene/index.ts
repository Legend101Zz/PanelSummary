export {
  composePanel,
  MAX_FIGURES,
  MAX_PROPS,
  MAX_FX,
  SHOT_HEIGHT,
  SPEAKER_MIN_HEAD_RADIUS,
  LOD_FULL_RADIUS,
  LOD_REDUCED_RADIUS,
  type ComposeInput,
  type ComposedPanel,
  type FigurePlacement,
  type SceneBook,
} from "./compose.js";
export { scopeIds, hoistDefs, sanitizeFragment, adoptFragment } from "./ids.js";
export { STAGING_FEATURES, resolveStaging, isStatue, seatKindFor, type Staging, type StagingFeature } from "./staging.js";
export { circleCoverage, covers } from "./safety.js";
