/** Run one production goal through the sealed Pi harness. Used by the HTTP server and the experiment CLI. */
import { runGoal, GoalRunError, type AllowedModel, type GoalTrace, type JsonValue, type ThinkingLevel } from "@panelsummary/agent-runtime";

import { GOALS, InputError, type ExperimentalGoalType, type GoalType } from "./goals/index.js";
import type { GoalDefinition } from "./goals/types.js";
import { loadSkill } from "./skills/load.js";

export interface GoalRequest<T extends string = GoalType> {
  goal_type: T;
  run_id: string;
  input: unknown;
  model?: AllowedModel;
  thinking?: ThinkingLevel;
  vision?: boolean;
}

export type GoalOutcome =
  | { state: "SUCCEEDED"; result: JsonValue; trace: GoalTrace }
  | { state: "FAILED" | "CANCELLED"; error: { code: string; message: string }; trace?: GoalTrace };

export async function executeGoal(request: GoalRequest, signal?: AbortSignal): Promise<GoalOutcome> {
  const goal = GOALS[request.goal_type];
  if (!goal) return { state: "FAILED", error: { code: "UNKNOWN_GOAL", message: `unknown goal ${request.goal_type}` } };
  return executeDefinition(goal, request, signal);
}

export async function executeDefinition(
  goal: GoalDefinition<unknown>,
  request: GoalRequest<GoalType | ExperimentalGoalType>,
  signal?: AbortSignal,
): Promise<GoalOutcome> {
  let input: unknown;
  try {
    input = goal.parseInput(request.input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { state: "FAILED", error: { code: error instanceof InputError ? "BAD_INPUT" : "INPUT_ERROR", message } };
  }
  const model = request.model ?? goal.defaults.model;
  const thinking = request.thinking ?? goal.defaults.thinking;
  const vision = Boolean(request.vision) && model === "MiniMax-M3";
  const prepared = goal.prepare(input, { model, thinking, vision });
  const skill = await loadSkill(prepared.skillName);
  try {
    const { accepted, trace } = await runGoal({
      goalType: request.goal_type,
      runId: request.run_id,
      model,
      thinking,
      skill,
      userPrompt: prepared.userPrompt,
      tools: prepared.tools,
      submitTool: prepared.submitTool,
      limits: prepared.limits,
      allowImages: prepared.allowImages,
      textFallbackArgument: "candidate_json",
      signal,
    });
    return { state: "SUCCEEDED", result: prepared.finalize(accepted), trace };
  } catch (error) {
    const trace = error instanceof GoalRunError ? error.trace : undefined;
    const message = error instanceof Error ? error.message : String(error);
    const cancelled = signal?.aborted || trace?.stop_reason === "cancelled";
    return { state: cancelled ? "CANCELLED" : "FAILED", error: { code: trace?.stop_reason?.toUpperCase() ?? "RUNTIME_ERROR", message }, trace };
  }
}
