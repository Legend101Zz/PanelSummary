import adaptationBeat from "../schema/adaptation_beat.v1.schema.json" with { type: "json" };
import agentGoal from "../schema/agent_goal.v1.schema.json" with { type: "json" };
import artifact from "../schema/artifact.v1.schema.json" with { type: "json" };
import artifactRef from "../schema/artifact_ref.v1.schema.json" with { type: "json" };
import assetRef from "../schema/asset_ref.v1.schema.json" with { type: "json" };
import assetRequest from "../schema/asset_request.v1.schema.json" with { type: "json" };
import contextPack from "../schema/context_pack.v1.schema.json" with { type: "json" };
import compiledLayout from "../schema/compiled_layout.v1.schema.json" with { type: "json" };
import generationRun from "../schema/generation_run.v1.schema.json" with { type: "json" };
import mangaManifest from "../schema/manga_manifest.v1.schema.json" with { type: "json" };
import mangaPagePlan from "../schema/manga_page_plan.v1.schema.json" with { type: "json" };
import mangaPlan from "../schema/manga_plan.v1.schema.json" with { type: "json" };
import memoryDelta from "../schema/memory_delta.v1.schema.json" with { type: "json" };
import modelReceipt from "../schema/model_receipt.v1.schema.json" with { type: "json" };
import pageScriptSet from "../schema/page_script_set.v1.schema.json" with { type: "json" };
import pageValidationReport from "../schema/page_validation_report.v1.schema.json" with { type: "json" };
import reelPlayerPayload from "../schema/reel_player_payload.v1.schema.json" with { type: "json" };
import reelSeries from "../schema/reel_series.v1.schema.json" with { type: "json" };
import reelSpec from "../schema/reel_spec.v1.schema.json" with { type: "json" };
import renderedPage from "../schema/rendered_page.v1.schema.json" with { type: "json" };
import renderedPageV2 from "../schema/rendered_page.v2.schema.json" with { type: "json" };
import revisionRequest from "../schema/revision_request.v1.schema.json" with { type: "json" };
import scopeManifest from "../schema/scope_manifest.v1.schema.json" with { type: "json" };
import seriesProgress from "../schema/series_progress.v1.schema.json" with { type: "json" };
import seriesProgressUpdate from "../schema/series_progress_update.v1.schema.json" with { type: "json" };
import sourceRef from "../schema/source_ref.v1.schema.json" with { type: "json" };
import sourceUnit from "../schema/source_unit.v1.schema.json" with { type: "json" };
import stageRun from "../schema/stage_run.v1.schema.json" with { type: "json" };
import thumbnailSet from "../schema/thumbnail_set.v1.schema.json" with { type: "json" };
import imageAttempt from "../schema/image_attempt.v1.schema.json" with { type: "json" };

export const contractSchemas = {
  "adaptation_beat.v1": adaptationBeat,
  "agent_goal.v1": agentGoal,
  "artifact.v1": artifact,
  "artifact_ref.v1": artifactRef,
  "asset_ref.v1": assetRef,
  "asset_request.v1": assetRequest,
  "context_pack.v1": contextPack,
  "compiled_layout.v1": compiledLayout,
  "generation_run.v1": generationRun,
  "manga_manifest.v1": mangaManifest,
  "manga_page_plan.v1": mangaPagePlan,
  "manga_plan.v1": mangaPlan,
  "memory_delta.v1": memoryDelta,
  "model_receipt.v1": modelReceipt,
  "page_script_set.v1": pageScriptSet,
  "page_validation_report.v1": pageValidationReport,
  "reel_player_payload.v1": reelPlayerPayload,
  "reel_series.v1": reelSeries,
  "reel_spec.v1": reelSpec,
  "rendered_page.v1": renderedPage,
  "rendered_page.v2": renderedPageV2,
  "revision_request.v1": revisionRequest,
  "scope_manifest.v1": scopeManifest,
  "series_progress.v1": seriesProgress,
  "series_progress_update.v1": seriesProgressUpdate,
  "source_ref.v1": sourceRef,
  "source_unit.v1": sourceUnit,
  "stage_run.v1": stageRun,
  "thumbnail_set.v1": thumbnailSet,
  "image_attempt.v1": imageAttempt,
} as const;

export type ContractName = keyof typeof contractSchemas;
