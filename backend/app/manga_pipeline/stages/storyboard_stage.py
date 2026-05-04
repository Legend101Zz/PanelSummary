"""LLM-backed storyboard/thumbnail stage for manga v2."""

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
from app.manga_pipeline.manga_dsl import render_dsl_prompt_fragment
from app.manga_pipeline.prompt_fragments import render_protagonist_contract_block

SYSTEM_PROMPT = """You are a manga storyboard artist and page-flow director.

Convert a validated manga script into page thumbnails. You are not rendering art;
you are deciding page rhythm, panel composition, shot variety, reader flow, and
where dialogue/narration belongs.

Storyboard discipline:
- manga flow is top-right to bottom-left unless project options say otherwise
- vary shot types panel-to-panel; pro manga rotates between WIDE / MEDIUM /
  CLOSE_UP / EXTREME_CLOSE_UP / INSERT / SYMBOLIC rather than camping on one
- every slice opens with (or contains) at least one establishing beat
  (WIDE or EXTREME_WIDE) so the reader knows where they are; in-medias-res
  openings are fine as long as the establishing beat lands soon after
- shot_type follows editorial intent: REVEAL/REACTION want CLOSE_UP or
  EXTREME_CLOSE_UP; SETUP/TRANSITION want WIDE or MEDIUM; INSERT for
  object/text inserts; SYMBOLIC for motifs
- avoid wall-of-text panels
- each panel must have a clear ``purpose`` AND a one-sentence ``composition``
  framing note; the renderer reads both verbatim and cannot recover them
  from action/dialogue alone
- preserve source_fact_ids when a panel carries source meaning
- use the character/world bible for visual consistency
- include a To Be Continued panel only when the script/source requires it

Character presence (CRITICAL for the multimodal renderer):
- ``character_ids`` lists characters VISUALLY PRESENT in the panel.
  This is not the same as characters mentioned by name in the dialogue.
- If the panel shows the empty laboratory while two characters argue
  off-panel, ``character_ids`` is EMPTY and the dialogue still belongs
  to those characters by ``speaker_id``.
- If the panel shows a character reacting to news from someone off-panel,
  only the on-panel character belongs in ``character_ids``.
- Every character_id must exactly match a ``character_id`` from the
  character_world_bible. Do not invent new characters here — if you need
  one, that's a script defect; raise a To Be Continued or restructure.
- The system will auto-add dialogue speakers to ``character_ids`` because
  speaking implies presence. You do not have to add them yourself, but
  if you do, do not omit any non-speaking characters that are also on stage.

The renderer will consume this storyboard. Do not leave story decisions for the
renderer to invent.
"""


def _build_user_message(context: PipelineContext) -> str:
    if context.adaptation_plan is None:
        raise ValueError("storyboard requires context.adaptation_plan")
    if context.character_bible is None:
        raise ValueError("storyboard requires context.character_bible")
    if context.beat_sheet is None:
        raise ValueError("storyboard requires context.beat_sheet")
    if context.manga_script is None:
        raise ValueError("storyboard requires context.manga_script")

    payload = {
        "book_id": context.book_id,
        "project_id": context.project_id,
        "source_slice": context.source_slice.model_dump(mode="json"),
        "arc_entry": context.arc_entry.model_dump(mode="json") if context.arc_entry else None,
        "adaptation_plan": context.adaptation_plan.model_dump(mode="json"),
        "character_world_bible": context.character_bible.model_dump(mode="json"),
        "beat_sheet": context.beat_sheet.model_dump(mode="json"),
        "manga_script": context.manga_script.model_dump(mode="json"),
        "source_facts": [fact.model_dump(mode="json") for fact in context.fact_registry],
        "project_options": context.options,
    }
    return (
        "Create storyboard pages for this manga script. Produce page-level "
        "thumbnail guidance and panel-by-panel composition/action/dialogue.\n\n"
        f"{render_protagonist_contract_block(plan=context.adaptation_plan, synopsis=context.book_synopsis)}\n\n"
        f"INPUT_JSON:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{render_dsl_prompt_fragment(context.arc_entry)}\n"
        f"{build_json_contract_prompt(StoryboardArtifact)}"
    )


async def run(context: PipelineContext) -> PipelineContext:
    """Generate and validate source-grounded storyboard pages using the LLM."""
    if context.llm_client is None:
        raise ValueError("storyboard requires context.llm_client")
    if not context.fact_registry:
        raise ValueError("storyboard requires source facts")

    request = StructuredLLMRequest(
        stage_name=LLMStageName.STORYBOARD,
        system_prompt=SYSTEM_PROMPT,
        user_message=_build_user_message(context),
        max_tokens=int(context.options.get("storyboard_max_tokens", 10000)),
        temperature=float(context.options.get("storyboard_temperature", 0.75)),
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
