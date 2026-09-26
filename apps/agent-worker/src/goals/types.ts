import type { AllowedModel, GoalLimits, GoalTool, JsonValue, ThinkingLevel } from "@panelsummary/agent-runtime";

/** Goal types the HTTP worker accepts. */
export const GOAL_TYPES = ["BOOK_UNDERSTANDING", "ADAPTATION_PLAN", "MANGA_PAGE"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];
/** Goal types that only scripts/experiment.ts runs (never served over HTTP). */
export type ExperimentalGoalType = "PAGE_REVIEW";

export interface GoalOptions {
  model: AllowedModel;
  thinking: ThinkingLevel;
  /** Give the page goal a PNG preview of its page (vision models only). */
  vision: boolean;
}

export interface PreparedGoal {
  skillName: string;
  userPrompt: string;
  tools: GoalTool[];
  submitTool: string;
  limits: GoalLimits;
  allowImages: boolean;
  /** Called with the accepted candidate; returns the worker's result payload. */
  finalize(accepted: JsonValue): JsonValue;
}

export interface GoalDefinition<I> {
  type: GoalType | ExperimentalGoalType;
  skillName: string;
  defaults: { model: AllowedModel; thinking: ThinkingLevel; limits: GoalLimits };
  parseInput(input: unknown): I;
  prepare(input: I, options: GoalOptions): PreparedGoal;
}

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

export function requireObject(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError(`${what} must be an object`);
  return value as Record<string, unknown>;
}
