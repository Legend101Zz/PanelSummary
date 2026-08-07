import type { AgentGoal, ContextPack } from "@scrollstack/contracts";

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type SupportedGoalType = Exclude<AgentGoal["goal_type"], "ARTIFACT_REPAIR">;

export type DomainToolName =
  | "get_source_excerpt"
  | "get_canon_entity"
  | "list_relevant_assets"
  | "submit_book_canon"
  | "submit_manga_plan"
  | "submit_asset_requests"
  | "report_source_conflict"
  | "get_book_context"
  | "get_manga_canon"
  | "submit_page_script_set"
  | "get_page_script_set"
  | "validate_layout_draft"
  | "submit_thumbnail_set"
  | "report_page_script_blocker"
  | "report_thumbnail_blocker"
  | "get_manga_plan"
  | "get_asset_metadata"
  | "get_source_receipts"
  | "submit_manga_composition"
  | "report_composition_blocker"
  | "get_manga_manifest"
  | "list_reel_components"
  | "get_component_contract"
  | "submit_reel_specs"
  | "report_missing_capability";

export interface DomainToolRequest {
  name: DomainToolName;
  arguments: Record<string, JsonValue>;
  scope: {
    correlation_id: string;
    goal_id: string;
    run_id: string;
    stage_run_id: string;
    context_pack_id: string;
    project_id: string;
  };
  signal?: AbortSignal;
}

export interface DomainToolResponse {
  content: string;
  data?: JsonValue;
  candidate?: JsonValue;
}

/**
 * The broker is the only capability surface exposed to a production agent.
 * Implementations must enforce service auth, ownership, limits, and schema
 * validation on the control-plane side as well.
 */
export interface DomainToolBroker {
  execute(request: DomainToolRequest): Promise<DomainToolResponse>;
}

export interface ProductionSkill {
  name: string;
  version: string;
  content: string;
  content_hash: string;
}

export interface AgentSessionRef {
  session_id: string;
}

export interface AgentRunTrace {
  session_id: string;
  goal_type: SupportedGoalType;
  provider?: string;
  model?: string;
  skill_name: string;
  skill_version: string;
  skill_hash: string;
  tool_calls: Array<{
    name: DomainToolName;
    state: "started" | "succeeded" | "failed";
  }>;
  tokens: {
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
    total: number;
  };
  cost_usd: number;
  latency_ms: number;
  compaction_count: number;
}

export interface AgentRunResult {
  session_ref: AgentSessionRef;
  candidate?: JsonValue;
  trace: AgentRunTrace;
}

export interface AgentRunOptions {
  correlation_id: string;
  instructions?: string;
  signal?: AbortSignal;
}

export interface ResumeInput {
  correlation_id: string;
  message: string;
  signal?: AbortSignal;
}

export interface ScrollStackAgentRuntime {
  run(goal: AgentGoal, context: ContextPack, options: AgentRunOptions): Promise<AgentRunResult>;
  resume(sessionRef: AgentSessionRef, input: ResumeInput): Promise<AgentRunResult>;
  cancel(runId: string): Promise<void>;
  isReady(): boolean;
}
