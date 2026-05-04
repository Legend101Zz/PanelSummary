"""LLM-backed manga script stage for manga v2."""

from __future__ import annotations

import json

from app.domain.manga import MangaScript
from app.manga_pipeline.context import PipelineContext
from app.manga_pipeline.llm_contracts import (
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)
from app.manga_pipeline.manga_dsl import render_dsl_prompt_fragment

SYSTEM_PROMPT = """You are a professional manga scriptwriter adapting dense source material.

Write a coherent manga script from the beat sheet and character/world bible.
The script must read like a real manga scene sequence, not a summary pasted into
speech bubbles. Keep dialogue short, purposeful, and character-specific. Use
narration sparingly. Every scene must map to beat_ids.

Rules:
- Preserve source fact meaning through dialogue, action, and narration.
- Keep each dialogue line short enough for a manga bubble.
- Make character voices distinct using the speech styles in the bible.
- Avoid exposition dumps. Let action and visual metaphors carry ideas.
- If the source has more material after this slice, set to_be_continued true.
"""


def _build_user_message(context: PipelineContext) -> str:
    if context.adaptation_plan is None:
        raise ValueError("manga script requires context.adaptation_plan")
    if context.character_bible is None:
        raise ValueError("manga script requires context.character_bible")
    if context.beat_sheet is None:
        raise ValueError("manga script requires context.beat_sheet")

    payload = {
        "book_id": context.book_id,
        "project_id": context.project_id,
        "source_slice": context.source_slice.model_dump(mode="json"),
        "arc_entry": context.arc_entry.model_dump(mode="json") if context.arc_entry else None,
        "adaptation_plan": context.adaptation_plan.model_dump(mode="json"),
        "character_world_bible": context.character_bible.model_dump(mode="json"),
        "beat_sheet": context.beat_sheet.model_dump(mode="json"),
        "source_facts": [fact.model_dump(mode="json") for fact in context.fact_registry],
        "source_has_more": bool(context.options.get("source_has_more", False)),
        "project_options": context.options,
    }
    return (
        "Write the manga script for this source slice. Produce scenes with "
        "scene descriptions, action, concise dialogue, and source fact IDs.\n\n"
        f"INPUT_JSON:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{render_dsl_prompt_fragment(context.arc_entry)}\n"
        f"{build_json_contract_prompt(MangaScript)}"
    )


async def run(context: PipelineContext) -> PipelineContext:
    """Generate and validate a coherent source-grounded manga script."""
    if context.llm_client is None:
        raise ValueError("manga script requires context.llm_client")
    if not context.fact_registry:
        raise ValueError("manga script requires source facts")

    request = StructuredLLMRequest(
        stage_name=LLMStageName.MANGA_SCRIPT,
        system_prompt=SYSTEM_PROMPT,
        user_message=_build_user_message(context),
        max_tokens=int(context.options.get("manga_script_max_tokens", 9000)),
        temperature=float(context.options.get("manga_script_temperature", 0.8)),
        max_validation_attempts=int(context.options.get("llm_validation_attempts", 3)),
    )
    result = await run_structured_llm_stage(
        client=context.llm_client,
        request=request,
        output_type=MangaScript,
    )
    context.manga_script = result.artifact
    context.record_llm_trace(result.trace)
    return context
