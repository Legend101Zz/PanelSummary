"""LLM-backed adaptation planning stage for manga v2."""

from __future__ import annotations

import json

from app.domain.manga import AdaptationPlan
from app.manga_pipeline.context import PipelineContext
from app.manga_pipeline.llm_contracts import (
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)

SYSTEM_PROMPT = """You are a senior manga writer and adaptation editor.

Your job is to transform source-grounded PDF facts into a manga adaptation plan.
You do not summarize lazily. You identify the human reading journey: who the
protagonist is, what they want, why the document is hard to understand, and how
the manga journey will reveal the document's central thesis.

Use real manga planning discipline:
- define the protagonist contract
- write a strong logline
- preserve the central thesis
- choose important source facts
- structure the slice as Ki-Sho-Ten-Ketsu where appropriate
- create memorable visual metaphors that make abstract ideas readable

Never invent source facts. Use only the provided fact IDs for grounded claims.
"""


def _build_user_message(context: PipelineContext) -> str:
    facts = [fact.model_dump(mode="json") for fact in context.fact_registry]
    continuity_lines = context.prior_continuity.current_story_state.compact_lines()
    payload = {
        "book_id": context.book_id,
        "project_id": context.project_id,
        "source_slice": context.source_slice.model_dump(mode="json"),
        "source_facts": facts,
        "known_fact_ids": context.prior_continuity.known_fact_ids,
        "open_threads": [thread.model_dump(mode="json") for thread in context.prior_continuity.open_threads],
        "continuity_state": continuity_lines,
        "options": context.options,
    }
    return (
        "Create the adaptation plan for this manga project/slice. Select the "
        "important source fact IDs that must be preserved in the manga.\n\n"
        f"INPUT_JSON:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{build_json_contract_prompt(AdaptationPlan)}"
    )


async def run(context: PipelineContext) -> PipelineContext:
    """Generate and validate an adaptation plan using the configured LLM."""
    if context.llm_client is None:
        raise ValueError("adaptation planning requires context.llm_client")
    if not context.fact_registry:
        raise ValueError("adaptation planning requires source facts")

    request = StructuredLLMRequest(
        stage_name=LLMStageName.ADAPTATION_PLANNING,
        system_prompt=SYSTEM_PROMPT,
        user_message=_build_user_message(context),
        max_tokens=int(context.options.get("adaptation_plan_max_tokens", 6000)),
        temperature=float(context.options.get("adaptation_plan_temperature", 0.75)),
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
