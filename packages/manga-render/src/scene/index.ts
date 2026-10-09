export {
  composePanel,
  MAX_FIGURES,
  MAX_PROPS,
  MAX_FX,
  SHOT_HEIGHT,
  SPEAKER_MIN_HEAD_RADIUS,
  DEPENDENT_MIN_HEAD_RADIUS,
  LOD_FULL_RADIUS,
  LOD_REDUCED_RADIUS,
  type ComposeInput,
  type ComposedPanel,
  type FigurePlacement,
  type PropPlacement,
  type SceneBook,
} from "./compose.js";
export { castWithVariant, lookWithVariant, variantFieldsFor } from "./looks.js";
export { planProps, beatMentions, PROP_WORDS, type PropPlan, type HeldProp } from "./props.js";
export { scopeIds, hoistDefs, sanitizeFragment, adoptFragment } from "./ids.js";
export { STAGING_FEATURES, resolveStaging, isStatue, locationStatue, partFromBeat, statueGone, seatKindFor, type Staging, type StagingFeature } from "./staging.js";
export { circleCoverage, covers } from "./safety.js";
export { resolveEnvironment, resolveLocation } from "./places.js";
