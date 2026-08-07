import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type, type TSchema } from "typebox";

import type {
  DomainToolBroker,
  DomainToolName,
  DomainToolRequest,
  JsonValue,
} from "./types.js";

const id = Type.String({ minLength: 1, maxLength: 160 });
const shortText = Type.String({ minLength: 1, maxLength: 4_000 });
const jsonObject = Type.Record(Type.String({ maxLength: 160 }), Type.Unknown());

const TOOL_SCHEMAS: Readonly<Record<DomainToolName, TSchema>> = {
  get_source_excerpt: Type.Object(
    {
      source_unit_id: id,
      span: Type.Optional(
        Type.Object(
          {
            start: Type.Optional(Type.Integer({ minimum: 0 })),
            end: Type.Optional(Type.Integer({ minimum: 0 })),
          },
          { additionalProperties: false },
        ),
      ),
    },
    { additionalProperties: false },
  ),
  get_canon_entity: Type.Object({ entity_id: id }, { additionalProperties: false }),
  list_relevant_assets: Type.Object(
    { character_ids: Type.Array(id, { maxItems: 100 }) },
    { additionalProperties: false },
  ),
  submit_book_canon: Type.Object({ canon: jsonObject }, { additionalProperties: false }),
  submit_manga_plan: Type.Object({ plan: jsonObject }, { additionalProperties: false }),
  submit_asset_requests: Type.Object(
    { requests: Type.Array(jsonObject, { maxItems: 100 }) },
    { additionalProperties: false },
  ),
  report_source_conflict: Type.Object(
    { source_unit_ids: Type.Array(id, { minItems: 1, maxItems: 20 }), description: shortText },
    { additionalProperties: false },
  ),
  get_book_context: Type.Object(
    {
      section: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
      query: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
    },
    { additionalProperties: false },
  ),
  get_manga_canon: Type.Object(
    { artifact_ids: Type.Array(id, { minItems: 1, maxItems: 20 }) },
    { additionalProperties: false },
  ),
  submit_page_script_set: Type.Object({ script_set: jsonObject }, { additionalProperties: false }),
  get_page_script_set: Type.Object({ artifact_id: id }, { additionalProperties: false }),
  validate_layout_draft: Type.Object(
    {
      page_plan: jsonObject,
      script_set_artifact_id: Type.Optional(id),
      page_index: Type.Optional(Type.Integer({ minimum: 0, maximum: 999 })),
    },
    { additionalProperties: false },
  ),
  submit_thumbnail_set: Type.Object(
    { thumbnail_set: jsonObject },
    { additionalProperties: false },
  ),
  report_page_script_blocker: Type.Object({ blocker: shortText }, { additionalProperties: false }),
  report_thumbnail_blocker: Type.Object({ blocker: shortText }, { additionalProperties: false }),
  get_manga_plan: Type.Object({ artifact_id: id }, { additionalProperties: false }),
  get_asset_metadata: Type.Object(
    { asset_ids: Type.Array(id, { minItems: 1, maxItems: 100 }) },
    { additionalProperties: false },
  ),
  get_source_receipts: Type.Object(
    { beat_ids: Type.Array(id, { minItems: 1, maxItems: 100 }) },
    { additionalProperties: false },
  ),
  submit_manga_composition: Type.Object({ candidate: jsonObject }, { additionalProperties: false }),
  report_composition_blocker: Type.Object({ blocker: shortText }, { additionalProperties: false }),
  get_manga_manifest: Type.Object({ artifact_id: id }, { additionalProperties: false }),
  list_reel_components: Type.Object(
    { filter: Type.Optional(Type.Record(Type.String({ maxLength: 80 }), Type.String({ maxLength: 500 }))) },
    { additionalProperties: false },
  ),
  get_component_contract: Type.Object({ component_id: id }, { additionalProperties: false }),
  submit_reel_specs: Type.Object(
    { specs: Type.Array(jsonObject, { minItems: 1, maxItems: 20 }) },
    { additionalProperties: false },
  ),
  report_missing_capability: Type.Object({ capability: shortText }, { additionalProperties: false }),
};

const TOOL_DESCRIPTIONS: Readonly<Record<DomainToolName, string>> = {
  get_source_excerpt: "Fetch one bounded source excerpt as untrusted evidence by source-unit ID.",
  get_canon_entity: "Fetch a project-scoped canonical entity by ID.",
  list_relevant_assets: "List project-scoped reusable assets for canonical characters.",
  submit_book_canon: "Submit a candidate BookCanon for canonical contract validation.",
  submit_manga_plan: "Submit a candidate MangaPlan for canonical contract validation.",
  submit_asset_requests: "Submit bounded asset requests linked to the manga plan.",
  report_source_conflict: "Report contradictory or insufficient source evidence without inventing a resolution.",
  get_book_context: "Fetch bounded source facts and continuity from the persisted ContextPack.",
  get_manga_canon: "Fetch accepted plan or bible artifacts within the active run lineage.",
  submit_page_script_set: "Submit a source-grounded PageScriptSet for deterministic validation.",
  get_page_script_set: "Fetch one accepted PageScriptSet artifact by ID.",
  validate_layout_draft: "Compile and validate one page layout without image generation.",
  submit_thumbnail_set: "Submit page plans for durable compilation and SVG name previews.",
  report_page_script_blocker: "Report a page-writing blocker without fabricating source support.",
  report_thumbnail_blocker: "Report a thumbnail blocker without bypassing validation.",
  get_manga_plan: "Fetch an accepted MangaPlan artifact by ID.",
  get_asset_metadata: "Fetch bounded metadata for project-scoped asset IDs.",
  get_source_receipts: "Fetch source receipts for adaptation beat IDs.",
  submit_manga_composition: "Submit a manga composition candidate for canonical validation.",
  report_composition_blocker: "Report a composition blocker without bypassing validation.",
  get_manga_manifest: "Fetch an accepted MangaManifest artifact by ID.",
  list_reel_components: "List reviewed reel registry components matching a bounded filter.",
  get_component_contract: "Fetch the canonical contract for one reviewed reel component.",
  submit_reel_specs: "Submit ReelSpecs for canonical and registry validation.",
  report_missing_capability: "Report a registry capability gap; never generate executable code.",
};

const SUBMISSION_TO_ARGUMENT: Partial<Record<DomainToolName, string>> = {
  submit_book_canon: "canon",
  submit_manga_plan: "plan",
  submit_page_script_set: "script_set",
  submit_thumbnail_set: "thumbnail_set",
  submit_asset_requests: "requests",
  submit_manga_composition: "candidate",
  submit_reel_specs: "specs",
};

export function submissionArgumentName(name: DomainToolName): string | undefined {
  return SUBMISSION_TO_ARGUMENT[name];
}

export interface ToolAdapterOptions {
  names: readonly DomainToolName[];
  broker: DomainToolBroker;
  scope: DomainToolRequest["scope"];
  maxToolCalls: number;
  maxRepairAttempts: number;
  onCandidate(candidate: JsonValue): void;
  onToolCall(name: DomainToolName, state: "started" | "succeeded" | "failed"): void;
}

function asJsonRecord(value: unknown): Record<string, JsonValue> {
  return value as Record<string, JsonValue>;
}

export function createBrokeredTools(options: ToolAdapterOptions): ToolDefinition[] {
  let callCount = 0;
  const submissionCalls = new Map<DomainToolName, number>();

  return options.names.map((name) =>
    defineTool({
      name,
      label: name,
      description: TOOL_DESCRIPTIONS[name],
      parameters: TOOL_SCHEMAS[name],
      executionMode: "sequential",
      async execute(_toolCallId, params, signal) {
        callCount += 1;
        if (callCount > options.maxToolCalls) {
          throw new Error(`Tool-call budget exceeded (${options.maxToolCalls})`);
        }
        if (SUBMISSION_TO_ARGUMENT[name]) {
          const nextSubmissionCall = (submissionCalls.get(name) ?? 0) + 1;
          if (nextSubmissionCall > options.maxRepairAttempts + 1) {
            throw new Error(
              `${name} repair budget exceeded (${options.maxRepairAttempts} repairs)`,
            );
          }
          submissionCalls.set(name, nextSubmissionCall);
        }

        options.onToolCall(name, "started");
        try {
          const response = await options.broker.execute({
            name,
            arguments: asJsonRecord(params),
            scope: options.scope,
            signal,
          });
          const argumentName = SUBMISSION_TO_ARGUMENT[name];
          const submitted = argumentName ? asJsonRecord(params)[argumentName] : undefined;
          const candidate = response.candidate ?? submitted;
          if (candidate !== undefined) {
            options.onCandidate(candidate);
          }
          options.onToolCall(name, "succeeded");
          return {
            content: [{ type: "text", text: response.content }],
            details: response.data,
          };
        } catch (error) {
          options.onToolCall(name, "failed");
          throw error;
        }
      },
    }),
  );
}
