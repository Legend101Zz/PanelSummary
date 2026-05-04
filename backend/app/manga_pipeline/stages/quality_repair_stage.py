"""LLM-backed quality repair stage for manga v2."""

from __future__ import annotations

import json

from app.domain.manga import StoryboardArtifact
from app.manga_pipeline.context import PipelineContext
from app.manga_pipeline.llm_contracts import (
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)

SYSTEM_PROMPT = """You are a senior manga editor repairing a storyboard that failed QA.

You must fix the storyboard while preserving the approved adaptation plan,
character/world bible, beat sheet, and manga script. Do not replace the story
with generic content. Address every quality issue explicitly.

Common repairs:
- add missing required source facts to panels
- add a To Be Continued panel when source material continues
- remove To Be Continued when the slice is standalone/complete
- reduce page density by distributing panels across pages
- keep dialogue short and readable

Return a complete replacement storyboard artifact. Do not return patches.
"""


def _build_user_message(context: PipelineContext) -> str:
    if context.quality_report is None:
        raise ValueError("quality repair requires context.quality_report")
    if context.quality_report.passed:
        raise ValueError("quality repair should only run for failed quality reports")
    if context.manga_script is None:
        raise ValueError("quality repair requires context.manga_script")

    payload = {
        "book_id": context.book_id,
        "project_id": context.project_id,
        "source_slice": context.source_slice.model_dump(mode="json"),
        "adaptation_plan": context.adaptation_plan.model_dump(mode="json") if context.adaptation_plan else {},
        "character_world_bible": context.character_bible.model_dump(mode="json") if context.character_bible else {},
        "beat_sheet": context.beat_sheet.model_dump(mode="json") if context.beat_sheet else {},
        "manga_script": context.manga_script.model_dump(mode="json"),
        "source_facts": [fact.model_dump(mode="json") for fact in context.fact_registry],
        "current_storyboard": [page.model_dump(mode="json") for page in context.storyboard_pages],
        "quality_report": context.quality_report.model_dump(mode="json"),
        "project_options": context.options,
    }
    return (
        "Repair this storyboard so it passes the quality gate. Preserve the "
        "script's intent and source grounding. Return a full replacement.\n\n"
        f"INPUT_JSON:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{build_json_contract_prompt(StoryboardArtifact)}"
    )


async def run(context: PipelineContext) -> PipelineContext:
    """Repair failed storyboard quality using the configured LLM.

    If the existing quality report passed, this stage is a no-op so it can live
    safely in the standard stage list after the first deterministic quality gate.
    """
    if context.quality_report is None or context.quality_report.passed:
        return context
    if context.llm_client is None:
        raise ValueError("quality repair requires context.llm_client")

    request = StructuredLLMRequest(
        stage_name=LLMStageName.QUALITY_REPAIR,
        system_prompt=SYSTEM_PROMPT,
        user_message=_build_user_message(context),
        max_tokens=int(context.options.get("quality_repair_max_tokens", 10000)),
        temperature=float(context.options.get("quality_repair_temperature", 0.55)),
        max_validation_attempts=int(context.options.get("llm_validation_attempts", 3)),
    )
    result = await run_structured_llm_stage(
        client=context.llm_client,
        request=request,
        output_type=StoryboardArtifact,
    )
    context.storyboard_pages = result.artifact.pages
    context.record_llm_trace(result.trace)
    return context
