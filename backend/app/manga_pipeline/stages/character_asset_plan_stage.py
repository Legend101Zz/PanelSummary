"""LLM-backed reusable character asset prompt planning for manga v2."""

from __future__ import annotations

import json

from app.domain.manga import CharacterAssetPlan
from app.manga_pipeline.context import PipelineContext
from app.manga_pipeline.llm_contracts import (
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)

SYSTEM_PROMPT = """You are an image-model prompt director for manga character assets.

Create reusable asset specs from the approved character/world bible. These specs
will be sent to an image generation model later, so prompts must be concrete,
consistent, and reusable. Prefer character sheets and expression variants over
full panel images.

For each important character, create prompts for:
- a neutral reference character sheet
- at least one expression/pose variant used by the storyboard/script

Prompts must preserve visual locks from the bible and avoid contradicting the
manga style. Do not produce final panel art prompts here.
"""


def _build_user_message(context: PipelineContext) -> str:
    if context.character_bible is None:
        raise ValueError("character asset planning requires context.character_bible")

    payload = {
        "project_id": context.project_id,
        "book_id": context.book_id,
        "character_world_bible": context.character_bible.model_dump(mode="json"),
        "manga_script": context.manga_script.model_dump(mode="json") if context.manga_script else {},
        "storyboard_pages": [page.model_dump(mode="json") for page in context.storyboard_pages],
        "image_model": context.options.get("image_model"),
        "project_options": context.options,
    }
    return (
        "Create reusable character asset specs and image-model prompts. Keep "
        "the assets reusable across future manga slices.\n\n"
        f"INPUT_JSON:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{build_json_contract_prompt(CharacterAssetPlan)}"
    )


async def run(context: PipelineContext) -> PipelineContext:
    """Generate validated image-model asset prompts using the configured LLM."""
    if context.llm_client is None:
        raise ValueError("character asset planning requires context.llm_client")

    request = StructuredLLMRequest(
        stage_name=LLMStageName.CHARACTER_ASSET_PROMPTS,
        system_prompt=SYSTEM_PROMPT,
        user_message=_build_user_message(context),
        max_tokens=int(context.options.get("character_asset_prompt_max_tokens", 6000)),
        temperature=float(context.options.get("character_asset_prompt_temperature", 0.55)),
        max_validation_attempts=int(context.options.get("llm_validation_attempts", 3)),
    )
    result = await run_structured_llm_stage(
        client=context.llm_client,
        request=request,
        output_type=CharacterAssetPlan,
    )
    context.asset_specs = result.artifact.assets
    context.record_llm_trace(result.trace)
    return context
