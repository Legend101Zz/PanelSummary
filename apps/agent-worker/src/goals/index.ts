import { adaptationPlanGoal } from "./adaptation-plan.js";
import { bookUnderstandingGoal } from "./book-understanding.js";
import { mangaPageGoal } from "./manga-page.js";
import type { GoalDefinition, GoalType } from "./types.js";

/** The production goals the HTTP worker serves. Experiment-only goals live in ./experimental/. */
export const GOALS: Record<GoalType, GoalDefinition<unknown>> = {
  BOOK_UNDERSTANDING: bookUnderstandingGoal as GoalDefinition<unknown>,
  ADAPTATION_PLAN: adaptationPlanGoal as GoalDefinition<unknown>,
  MANGA_PAGE: mangaPageGoal as GoalDefinition<unknown>,
};

export { GOAL_TYPES, InputError, type ExperimentalGoalType, type GoalType, type GoalOptions } from "./types.js";
