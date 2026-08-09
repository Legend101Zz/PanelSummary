import type { AgentGoal } from "@scrollstack/contracts";

import type { DomainToolName, SupportedGoalType } from "./types.js";

export class AgentPolicyError extends Error {
  constructor(
    public readonly code:
      | "UNSUPPORTED_GOAL"
      | "UNKNOWN_TOOL"
      | "MISSING_REQUIRED_TOOL"
      | "INVALID_BUDGET",
    message: string,
  ) {
    super(message);
    this.name = "AgentPolicyError";
  }
}

export interface GoalPolicy {
  goal_type: SupportedGoalType;
  skill_name: string;
  tools: readonly DomainToolName[];
  required_submission_tool: DomainToolName;
}

export const GOAL_POLICIES: Readonly<Record<SupportedGoalType, GoalPolicy>> = {
  BOOK_CANON: {
    goal_type: "BOOK_CANON",
    skill_name: "book-canon",
    tools: ["get_source_excerpt", "get_canon_entity", "submit_book_canon", "report_source_conflict"],
    required_submission_tool: "submit_book_canon",
  },
  MANGA_DIRECTION: {
    goal_type: "MANGA_DIRECTION",
    skill_name: "manga-direction",
    tools: [
      "get_source_excerpt",
      "get_canon_entity",
      "list_relevant_assets",
      "submit_manga_plan",
      "submit_asset_requests",
      "report_source_conflict",
    ],
    required_submission_tool: "submit_manga_plan",
  },
  MANGA_PAGE_WRITING: {
    goal_type: "MANGA_PAGE_WRITING",
    skill_name: "manga-page-writing",
    tools: [
      "get_book_context",
      "get_manga_canon",
      "submit_page_script_set",
      "report_page_script_blocker",
    ],
    required_submission_tool: "submit_page_script_set",
  },
  MANGA_THUMBNAIL: {
    goal_type: "MANGA_THUMBNAIL",
    skill_name: "manga-thumbnail",
    tools: [
      "get_page_script_set",
      "list_relevant_assets",
      "validate_layout_draft",
      "submit_thumbnail_set",
      "report_thumbnail_blocker",
    ],
    required_submission_tool: "submit_thumbnail_set",
  },
  MANGA_COMPOSITION: {
    goal_type: "MANGA_COMPOSITION",
    skill_name: "manga-composition",
    tools: [
      "get_manga_plan",
      "get_asset_metadata",
      "get_source_receipts",
      "submit_manga_composition",
      "report_composition_blocker",
    ],
    required_submission_tool: "submit_manga_composition",
  },
  REEL_DIRECTION: {
    goal_type: "REEL_DIRECTION",
    skill_name: "reel-direction",
    tools: [
      "get_manga_manifest",
      "list_reel_components",
      "get_component_contract",
      "submit_reel_specs",
      "report_missing_capability",
    ],
    required_submission_tool: "submit_reel_specs",
  },
};

const isSupportedGoal = (goalType: AgentGoal["goal_type"]): goalType is SupportedGoalType =>
  Object.hasOwn(GOAL_POLICIES, goalType);

export function assertGoalPolicy(goal: AgentGoal): GoalPolicy {
  if (!isSupportedGoal(goal.goal_type)) {
    throw new AgentPolicyError(
      "UNSUPPORTED_GOAL",
      `Goal type ${goal.goal_type} has no approved production skill or tool policy`,
    );
  }

  const policy = GOAL_POLICIES[goal.goal_type];
  const approved = new Set<string>(policy.tools);
  const requestedTools = goal.allowed_tools ?? [];
  for (const tool of requestedTools) {
    if (!approved.has(tool)) {
      throw new AgentPolicyError("UNKNOWN_TOOL", `Tool ${tool} is not approved for ${goal.goal_type}`);
    }
  }

  if (!requestedTools.includes(policy.required_submission_tool)) {
    throw new AgentPolicyError(
      "MISSING_REQUIRED_TOOL",
      `${goal.goal_type} requires ${policy.required_submission_tool}`,
    );
  }

  if (
    goal.budget.max_steps < 1 ||
    goal.budget.max_tool_calls < 1 ||
    goal.budget.max_input_tokens < 1 ||
    goal.budget.max_output_tokens < 1 ||
    goal.budget.max_repair_attempts < 0 ||
    goal.budget.max_repair_attempts > 2 ||
    goal.budget.max_cost_usd < 0
  ) {
    throw new AgentPolicyError("INVALID_BUDGET", "Agent budget is outside production limits");
  }

  return policy;
}
