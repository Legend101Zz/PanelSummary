"""LLM-backed beat sheet stage for manga v2."""

from __future__ import annotations

import json

from app.domain.manga import BeatSheet
from app.manga_pipeline.context import PipelineContext
from app.manga_pipeline.llm_contracts import (
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)

SYSTEM_PROMPT = """You are a manga story editor specializing in educational adaptations.

Turn the adaptation plan, source facts, and character/world bible into a beat
sheet for one source slice. The beat sheet must preserve the document's gist
while creating readable manga pacing.

Use manga structure intentionally:
- Ki: setup the reader's question
- Sho: develop the idea through action or discovery
- Ten: introduce a twist, contrast, or surprising implication
- Ketsu: land the insight and set up continuation when needed

Every beat must either reference source_fact_ids or open/resolve a story thread.
No filler beats. No generic "character talks" beats. Each beat must change what
the reader understands or feels.
"""


def _build_user_message(context: PipelineContext) -> str:
    if context.adaptation_plan is None:
        raise ValueError("beat sheet requires context.adaptation_plan")
    if context.character_bible is None:
        raise ValueError("beat sheet requires context.character_bible")

    payload = {
        "book_id": context.book_id,
        "project_id": context.project_id,
        "source_slice": context.source_slice.model_dump(mode="json"),
        "adaptation_plan": context.adaptation_plan.model_dump(mode="json"),
        "character_world_bible": context.character_bible.model_dump(mode="json"),
        "source_facts": [fact.model_dump(mode="json") for fact in context.fact_registry],
        "open_threads": [thread.model_dump(mode="json") for thread in context.prior_continuity.open_threads],
        "last_page_hook": context.prior_continuity.last_page_hook,
        "recap_for_next_slice": context.prior_continuity.recap_for_next_slice,
        "project_options": context.options,
    }
    return (
        "Create the beat sheet for this manga source slice. Keep every beat "
        "source-grounded and useful for script/storyboard generation.\n\n"
        f"INPUT_JSON:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{build_json_contract_prompt(BeatSheet)}"
    )


async def run(context: PipelineContext) -> PipelineContext:
    """Generate and validate the source-grounded beat sheet using the LLM."""
    if context.llm_client is None:
        raise ValueError("beat sheet requires context.llm_client")
    if not context.fact_registry:
        raise ValueError("beat sheet requires source facts")

    request = StructuredLLMRequest(
        stage_name=LLMStageName.BEAT_SHEET,
        system_prompt=SYSTEM_PROMPT,
        user_message=_build_user_message(context),
        max_tokens=int(context.options.get("beat_sheet_max_tokens", 7000)),
        temperature=float(context.options.get("beat_sheet_temperature", 0.75)),
        max_validation_attempts=int(context.options.get("llm_validation_attempts", 3)),
    )
    result = await run_structured_llm_stage(
        client=context.llm_client,
        request=request,
        output_type=BeatSheet,
    )
    context.beat_sheet = result.artifact
    context.record_llm_trace(result.trace)
    return context
