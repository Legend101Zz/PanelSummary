import { adaptationPlanGoal } from "./adaptation-plan.js";
import { bookUnderstandingGoal } from "./book-understanding.js";
import { mangaPageGoal } from "./manga-page.js";
import { pageReviewGoal } from "./page-review.js";
import type { GoalDefinition, GoalType } from "./types.js";

export const GOALS: Record<GoalType, GoalDefinition<unknown>> = {
  BOOK_UNDERSTANDING: bookUnderstandingGoal as GoalDefinition<unknown>,
  ADAPTATION_PLAN: adaptationPlanGoal as GoalDefinition<unknown>,
  MANGA_PAGE: mangaPageGoal as GoalDefinition<unknown>,
  PAGE_REVIEW: pageReviewGoal as GoalDefinition<unknown>,
};

export { GOAL_TYPES, InputError, type GoalType, type GoalOptions } from "./types.js";
