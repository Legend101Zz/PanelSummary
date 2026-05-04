"""Book-level adaptation plan stage.

Runs ONCE per project, against the WHOLE book (synopsis + global fact
registry). The resulting ``AdaptationPlan`` is then locked onto the project
document and reused by every per-slice generation.

Why this is its own stage instead of just calling the per-slice
``adaptation_plan_stage``:
- The inputs are different (no per-slice continuity ledger; the entire fact
  registry is in scope).
- The prompt should explicitly instruct the model that this plan governs the
  whole book, not a 10-page window.
- Centralising the book-mode prompt here avoids polluting the per-slice stage
  with ``if context.is_book: ...`` branches.
"""

from __future__ import annotations

import json

from app.domain.manga import AdaptationPlan
from app.manga_pipeline.book_context import BookUnderstandingContext
from app.manga_pipeline.llm_contracts import (
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)


SYSTEM_PROMPT = """You are the lead manga adaptation editor for an entire
nonfiction book. You are NOT planning a single slice. You are designing the
PROTAGONIST CONTRACT and CENTRAL JOURNEY that will hold across every page of
the manga.

You receive:
- The book synopsis (central thesis, themes, arc).
- The full fact registry (every fact the manga must remain grounded in).

You produce ONE adaptation plan that:
- Names the protagonist and answers Who/Wants/Why-not/What-they-do.
- Writes a single logline that compresses the reading payoff.
- Lists the important_fact_ids that the manga MUST cover (pick 12–30 of them
  weighted toward THESIS/CORE).
- Describes the emotional and intellectual journeys as ordered lists.
- Suggests memorable visual metaphors that can recur across slices.

This plan is FROZEN once accepted. Make it specific, opinionated, and faithful
to the source. Do not write generic adaptations.
"""


def _build_user_message(context: BookUnderstandingContext) -> str:
    if context.synopsis is None:
        raise ValueError("global adaptation plan requires a synopsis")
    if not context.fact_registry:
        raise ValueError("global adaptation plan requires a populated fact registry")

    payload = {
        "book_id": context.book_id,
        "project_id": context.project_id,
        "book_title": context.book_title,
        "total_pages": context.total_pages,
        "synopsis": context.synopsis.model_dump(mode="json"),
        "fact_registry": [fact.model_dump(mode="json") for fact in context.fact_registry],
        "options": context.options,
    }
    return (
        "Create the BOOK-LEVEL adaptation plan that will govern every "
        "subsequent manga slice for this project.\n\n"
        f"INPUT_JSON:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{build_json_contract_prompt(AdaptationPlan)}"
    )


async def run(context: BookUnderstandingContext) -> BookUnderstandingContext:
    """Generate the project-wide adaptation plan."""
    if context.llm_client is None:
        raise ValueError("global adaptation plan stage requires context.llm_client")

    request = StructuredLLMRequest(
        stage_name=LLMStageName.ADAPTATION_PLANNING,
        system_prompt=SYSTEM_PROMPT,
        user_message=_build_user_message(context),
        max_tokens=int(context.options.get("global_adaptation_plan_max_tokens", 6000)),
        temperature=float(context.options.get("global_adaptation_plan_temperature", 0.7)),
        max_validation_attempts=int(context.options.get("llm_validation_attempts", 3)),
    )
    result = await run_structured_llm_stage(
        client=context.llm_client,
        request=request,
        output_type=AdaptationPlan,
    )
    context.adaptation_plan = result.artifact
    context.record_llm_trace(result.trace)
    return context
