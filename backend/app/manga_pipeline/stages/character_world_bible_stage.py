"""LLM-backed character/world bible stage for manga v2."""

from __future__ import annotations

import json

from app.domain.manga import CharacterWorldBible
from app.manga_pipeline.context import PipelineContext
from app.manga_pipeline.llm_contracts import (
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)

SYSTEM_PROMPT = """You are a manga character designer and world bible lead.

Design reusable characters and a visual world for a source-grounded manga
adaptation. The goal is consistency across generated pages and future source
slices. Characters must be visually distinct by silhouette, hair/face, outfit,
and personality. Their designs should represent source concepts without becoming
generic mascots.

Create character designs that an image model can later turn into character
sheets. Be concrete. Avoid vague prompts like "anime style" by itself. Specify
visual locks, silhouette notes, outfit motifs, expressions, and speech style.

Never add a character or motif that contradicts the source/adaptation plan.
"""


def _build_user_message(context: PipelineContext) -> str:
    if context.adaptation_plan is None:
        raise ValueError("character/world bible requires context.adaptation_plan")

    payload = {
        "book_id": context.book_id,
        "project_id": context.project_id,
        "source_slice": context.source_slice.model_dump(mode="json"),
        "adaptation_plan": context.adaptation_plan.model_dump(mode="json"),
        "source_facts": [fact.model_dump(mode="json") for fact in context.fact_registry],
        "prior_character_state": {
            key: value.model_dump(mode="json")
            for key, value in context.prior_continuity.character_state.items()
        },
        "project_options": context.options,
    }
    return (
        "Create the reusable character and world bible for this manga project. "
        "Design for consistency across pages and future continuations.\n\n"
        f"INPUT_JSON:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{build_json_contract_prompt(CharacterWorldBible)}"
    )


async def run(context: PipelineContext) -> PipelineContext:
    """Generate and validate the character/world bible using the configured LLM.

    Read-through: when the project bible is locked (book understanding ran
    and produced a frozen bible), we keep the loaded bible. Regenerating it
    per slice is exactly the visual-drift bug Phase 1 fixes.
    """
    if context.bible_locked and context.character_bible is not None:
        # Frozen bible from the book-understanding phase. Honour the lock.
        return context
    if context.llm_client is None:
        raise ValueError("character/world bible requires context.llm_client")
    if not context.fact_registry:
        raise ValueError("character/world bible requires source facts")

    request = StructuredLLMRequest(
        stage_name=LLMStageName.CHARACTER_WORLD_BIBLE,
        system_prompt=SYSTEM_PROMPT,
        user_message=_build_user_message(context),
        max_tokens=int(context.options.get("character_bible_max_tokens", 8000)),
        temperature=float(context.options.get("character_bible_temperature", 0.85)),
        max_validation_attempts=int(context.options.get("llm_validation_attempts", 3)),
    )
    result = await run_structured_llm_stage(
        client=context.llm_client,
        request=request,
        output_type=CharacterWorldBible,
    )
    context.character_bible = result.artifact
    context.record_llm_trace(result.trace)
    return context
