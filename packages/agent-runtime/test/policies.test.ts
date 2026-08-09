import type { AgentGoal } from "@scrollstack/contracts";
import { describe, expect, it } from "vitest";

import { AgentPolicyError, assertGoalPolicy, productionSessionPolicy } from "../src/index.js";

function goal(overrides: Partial<AgentGoal> = {}): AgentGoal {
  return {
    goal_id: "goal-1",
    run_id: "run-1",
    stage_run_id: "stage-1",
    goal_type: "MANGA_DIRECTION",
    output_schema: "manga_plan.v1",
    schema_version: "1.0.0",
    input_artifact_refs: [],
    constraints: {},
    acceptance_tests: [{ test_id: "schema", description: "Canonical schema validates" }],
    allowed_tools: ["get_source_excerpt", "submit_manga_plan"],
    budget: {
      max_steps: 8,
      max_tool_calls: 12,
      max_input_tokens: 40_000,
      max_output_tokens: 8_000,
      max_repair_attempts: 2,
      max_cost_usd: 3,
    },
    ...overrides,
  } as AgentGoal;
}

describe("production goal policy", () => {
  it("rejects unsupported goals", () => {
    expect(() => assertGoalPolicy(goal({ goal_type: "ARTIFACT_REPAIR" }))).toThrowError(
      expect.objectContaining<Partial<AgentPolicyError>>({ code: "UNSUPPORTED_GOAL" }),
    );
  });

  it("rejects a goal that asks for an unknown or built-in tool", () => {
    expect(() => assertGoalPolicy(goal({ allowed_tools: ["bash", "submit_manga_plan"] }))).toThrowError(
      expect.objectContaining<Partial<AgentPolicyError>>({ code: "UNKNOWN_TOOL" }),
    );
  });

  it("rejects a goal without its typed submission tool", () => {
    expect(() => assertGoalPolicy(goal({ allowed_tools: ["get_source_excerpt"] }))).toThrowError(
      expect.objectContaining<Partial<AgentPolicyError>>({ code: "MISSING_REQUIRED_TOOL" }),
    );
  });

  it("pins production sessions to custom tools and denies every built-in capability", () => {
    expect(productionSessionPolicy(goal())).toEqual({
      noTools: "builtin",
      tools: ["get_source_excerpt", "submit_manga_plan"],
      excludeTools: ["bash", "read", "write", "edit", "grep", "find", "ls"],
    });
  });

  it("separates page-writing and thumbnail capabilities", () => {
    const writing = assertGoalPolicy(
      goal({
        goal_type: "MANGA_PAGE_WRITING",
        allowed_tools: ["get_book_context", "submit_page_script_set"],
      }),
    );
    const thumbnail = assertGoalPolicy(
      goal({
        goal_type: "MANGA_THUMBNAIL",
        allowed_tools: ["validate_layout_draft", "submit_thumbnail_set"],
      }),
    );

    expect(writing.required_submission_tool).toBe("submit_page_script_set");
    expect(writing.tools).not.toContain("validate_layout_draft");
    expect(thumbnail.required_submission_tool).toBe("submit_thumbnail_set");
    expect(thumbnail.tools).not.toContain("submit_page_script_set");
  });
});
