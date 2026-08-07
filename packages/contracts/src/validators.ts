import {
  Ajv2020,
  type AnySchema,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import type {
  AgentGoal,
  ArtifactRef,
  ContextPack,
  MangaManifest,
  MangaPagePlan,
  MangaPlan,
  PageScriptSet,
  ReelPlayerPayload,
  ReelSeries,
  ReelSpec,
  RenderedPage,
  RenderedPageV2,
  SeriesProgress,
  SeriesProgressUpdate,
  ThumbnailSet,
} from "./generated/index.js";
import { contractSchemas, type ContractName } from "./schemas.js";

const ajv = new Ajv2020({ allErrors: true, strict: true });
const applyFormats = addFormats as unknown as (instance: Ajv2020) => Ajv2020;
applyFormats(ajv);

function schemaForAjv(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(schemaForAjv);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "discriminator")
      .map(([key, nested]) => [key, schemaForAjv(nested)]),
  );
}

const schemaValidators = Object.fromEntries(
  Object.entries(contractSchemas).map(([name, schema]) => [
    name,
    ajv.compile(schemaForAjv(schema) as AnySchema),
  ]),
) as Record<ContractName, ValidateFunction<unknown>>;

function semanticError(instancePath: string, message: string): ErrorObject {
  return {
    instancePath,
    schemaPath: "#/scrollstackSemantic",
    keyword: "scrollstackSemantic",
    params: {},
    message,
  };
}

function mangaPagePlanSemanticErrors(value: unknown): ErrorObject[] {
  const plan = value as {
    page_script: {
      page_turn_panel_id?: string | null;
      panels: Array<{ panel_id: string }>;
      text_elements?: Array<{ panel_id: string }>;
    };
    layout_root: Record<string, unknown>;
    reading_edges?: Array<{ from_panel_id: string; to_panel_id: string }>;
  };
  const errors: ErrorObject[] = [];
  const nodeIds = new Set<string>();
  const leafPanelIds: string[] = [];

  function walk(node: Record<string, unknown>, path: string): void {
    const nodeId = node.node_id;
    if (typeof nodeId === "string") {
      if (nodeIds.has(nodeId)) {
        errors.push(semanticError(`${path}/node_id`, "layout node IDs must be unique"));
      }
      nodeIds.add(nodeId);
    }
    if (node.kind === "panel" || node.kind === "freeform_panel") {
      if (typeof node.panel_id === "string") leafPanelIds.push(node.panel_id);
      return;
    }
    if (node.kind === "split") {
      const ratios = Array.isArray(node.ratios) ? node.ratios : [];
      const children = Array.isArray(node.children) ? node.children : [];
      if (ratios.length !== children.length) {
        errors.push(semanticError(`${path}/ratios`, "split ratios must cover children exactly"));
      }
      children.forEach((child, index) => walk(child as Record<string, unknown>, `${path}/children/${index}`));
      return;
    }
    if (node.kind === "overlay") {
      walk(node.base as Record<string, unknown>, `${path}/base`);
      const insets = Array.isArray(node.insets) ? node.insets : [];
      insets.forEach((inset, index) => {
        const item = inset as { node: Record<string, unknown> };
        walk(item.node, `${path}/insets/${index}/node`);
      });
    }
  }

  walk(plan.layout_root, "/layout_root");
  const panelIds = plan.page_script.panels.map((panel) => panel.panel_id);
  if (
    new Set(leafPanelIds).size !== leafPanelIds.length ||
    [...leafPanelIds].sort().join("\0") !== [...panelIds].sort().join("\0")
  ) {
    errors.push(
      semanticError("/layout_root", "layout panel references must match page-script panels"),
    );
  }
  const knownPanels = new Set(panelIds);
  for (const [index, text] of (plan.page_script.text_elements ?? []).entries()) {
    if (!knownPanels.has(text.panel_id)) {
      errors.push(
        semanticError(
          `/page_script/text_elements/${index}/panel_id`,
          "text element references an unknown panel",
        ),
      );
    }
  }

  const edges = plan.reading_edges ?? [];
  if (panelIds.length > 1 && edges.length === panelIds.length - 1) {
    const outgoing = new Map<string, string>();
    const incoming = new Set<string>();
    for (const [index, edge] of edges.entries()) {
      if (
        !knownPanels.has(edge.from_panel_id) ||
        !knownPanels.has(edge.to_panel_id) ||
        edge.from_panel_id === edge.to_panel_id ||
        outgoing.has(edge.from_panel_id) ||
        incoming.has(edge.to_panel_id)
      ) {
        errors.push(
          semanticError(`/reading_edges/${index}`, "reading graph must be one panel chain"),
        );
        continue;
      }
      outgoing.set(edge.from_panel_id, edge.to_panel_id);
      incoming.add(edge.to_panel_id);
    }
    const starts = panelIds.filter((panelId) => !incoming.has(panelId));
    if (starts.length === 1) {
      const visited = new Set<string>();
      let current: string | undefined = starts[0];
      while (current && !visited.has(current)) {
        visited.add(current);
        current = outgoing.get(current);
      }
      if (visited.size !== panelIds.length) {
        errors.push(semanticError("/reading_edges", "reading graph is cyclic or disconnected"));
      } else if (
        plan.page_script.page_turn_panel_id &&
        [...visited].at(-1) !== plan.page_script.page_turn_panel_id
      ) {
        errors.push(
          semanticError(
            "/page_script/page_turn_panel_id",
            "page-turn panel must be last in reading order",
          ),
        );
      }
    }
  }
  return errors;
}

export type ValidationResult =
  | { valid: true; errors: [] }
  | { valid: false; errors: ErrorObject[] };

export function getContractValidator(name: ContractName): ValidateFunction<unknown> {
  return schemaValidators[name];
}

export function validateContract(name: ContractName, value: unknown): ValidationResult {
  const validator = schemaValidators[name];
  const valid = validator(value);
  if (!valid) {
    return { valid: false, errors: validator.errors ? [...validator.errors] : [] };
  }
  const semanticErrors =
    name === "manga_page_plan.v1" ? mangaPagePlanSemanticErrors(value) : [];
  return semanticErrors.length === 0
    ? { valid: true, errors: [] }
    : { valid: false, errors: semanticErrors };
}

export const isAgentGoal = (value: unknown): value is AgentGoal =>
  validateContract("agent_goal.v1", value).valid;

export const isArtifactRef = (value: unknown): value is ArtifactRef =>
  validateContract("artifact_ref.v1", value).valid;

export const isContextPack = (value: unknown): value is ContextPack =>
  validateContract("context_pack.v1", value).valid;

export const isMangaManifest = (value: unknown): value is MangaManifest =>
  validateContract("manga_manifest.v1", value).valid;

export const isMangaPlan = (value: unknown): value is MangaPlan =>
  validateContract("manga_plan.v1", value).valid;

export const isMangaPagePlan = (value: unknown): value is MangaPagePlan =>
  validateContract("manga_page_plan.v1", value).valid;

export const isPageScriptSet = (value: unknown): value is PageScriptSet =>
  validateContract("page_script_set.v1", value).valid;

export const isThumbnailSet = (value: unknown): value is ThumbnailSet =>
  validateContract("thumbnail_set.v1", value).valid;

export const isReelSpec = (value: unknown): value is ReelSpec =>
  validateContract("reel_spec.v1", value).valid;

export const isReelPlayerPayload = (value: unknown): value is ReelPlayerPayload =>
  validateContract("reel_player_payload.v1", value).valid;

export const isReelSeries = (value: unknown): value is ReelSeries =>
  validateContract("reel_series.v1", value).valid;

export const isRenderedPage = (value: unknown): value is RenderedPage =>
  validateContract("rendered_page.v1", value).valid;

export const isRenderedPageV2 = (value: unknown): value is RenderedPageV2 =>
  validateContract("rendered_page.v2", value).valid;

export const isSeriesProgress = (value: unknown): value is SeriesProgress =>
  validateContract("series_progress.v1", value).valid;

export const isSeriesProgressUpdate = (value: unknown): value is SeriesProgressUpdate =>
  validateContract("series_progress_update.v1", value).valid;
