"""Script repair stage — rewrites a script to address editorial defects.

Mirrors ``quality_repair_stage`` but for the script (not the storyboard).
Runs only when ``context.script_review`` exists and reports errors. If
the editor passed the script (no error-severity issues), this stage is
a no-op so it can sit safely in the standard stage list.

The repair returns a complete replacement ``MangaScript`` — never a
patch. Patching creative artifacts hides the wider intent and tends to
introduce inconsistencies between the rewritten line and the surrounding
scene. Full rewrite is more expensive but trustworthy.
"""

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


SYSTEM_PROMPT = """You are a senior manga writer rewriting a script your editor has flagged.

You receive the original script, the editor's review report (with issue
codes, scene_ids, and per-line suggestions), the FROZEN bible, the beat
sheet, and the arc entry the slice fulfils.

Discipline:
- Address every error-severity issue. Address warnings when they cost
  little to fix.
- Preserve the beat sheet structure: do NOT add or remove scenes;
  do NOT change beat_ids.
- Honour the bible's speech_style for every speaker. If the editor
  flagged SCRIPT_VOICE_DRIFT, the rewritten line must read clearly in
  that character's voice.
- If SCRIPT_HOOK_DROPPED was flagged, open the script with material
  that pays off the prior slice's closing hook.
- If SCRIPT_PROTAGONIST_OFFSCREEN was flagged, put the protagonist
  on stage in at least one scene that advances their arc role beat.
- Keep dialogue short and bubble-friendly.
- Do not introduce new characters not in the bible.
- Return a COMPLETE replacement MangaScript artifact. No patches.
"""


def _build_user_message(context: PipelineContext) -> str:
    if context.script_review is None:
        raise ValueError("script repair requires context.script_review")
    if context.script_review.passed:
        raise ValueError("script repair should only run when the review failed")
    if context.manga_script is None:
        raise ValueError("script repair requires context.manga_script")

    arc_role = (
        context.arc_entry.role.value
        if context.arc_entry is not None
        else context.options.get("slice_role", "")
    )
    prior_hook = ""
    if context.prior_continuity is not None:
        prior_hook = context.prior_continuity.last_page_hook or ""

    payload = {
        "slice_id": context.source_slice.slice_id,
        "arc_role": arc_role,
        "prior_slice_closing_hook": prior_hook,
        "adaptation_plan": (
            context.adaptation_plan.model_dump(mode="json")
            if context.adaptation_plan
            else {}
        ),
        "character_world_bible": (
            context.character_bible.model_dump(mode="json")
            if context.character_bible
            else {}
        ),
        "beat_sheet": (
            context.beat_sheet.model_dump(mode="json") if context.beat_sheet else {}
        ),
        "current_script": context.manga_script.model_dump(mode="json"),
        "review_report": context.script_review.model_dump(mode="json"),
        "arc_entry": (
            context.arc_entry.model_dump(mode="json")
            if context.arc_entry is not None
            else None
        ),
    }
    return (
        "Rewrite the manga script to address every editorial defect. Return a "
        "complete replacement MangaScript that preserves the beat structure.\n\n"
        f"INPUT_JSON:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{build_json_contract_prompt(MangaScript)}"
    )


async def run(context: PipelineContext) -> PipelineContext:
    """Replace ``context.manga_script`` with the repaired version.

    No-ops when the review passed. Always clears ``context.script_review``
    after a successful repair so downstream stages do not mistake the
    pre-repair report for the current state of the script.
    """
    # No review or already-passed review: nothing to do. This is the same
    # shape as quality_repair_stage's early-return so the orchestrator can
    # wire repair stages without conditional plumbing.
    if context.script_review is None or context.script_review.passed:
        return context
    if context.llm_client is None:
        raise ValueError("script repair requires context.llm_client")

    request = StructuredLLMRequest(
        stage_name=LLMStageName.SCRIPT_REPAIR,
        system_prompt=SYSTEM_PROMPT,
        user_message=_build_user_message(context),
        max_tokens=int(context.options.get("script_repair_max_tokens", 9000)),
        temperature=float(context.options.get("script_repair_temperature", 0.7)),
        max_validation_attempts=int(context.options.get("llm_validation_attempts", 3)),
    )
    result = await run_structured_llm_stage(
        client=context.llm_client,
        request=request,
        output_type=MangaScript,
    )
    context.manga_script = result.artifact
    # The pre-repair review is now stale. Clearing it means a re-run of
    # script_review_stage will produce a fresh report against the rewritten
    # script, and any later inspection of context.script_review reflects
    # the CURRENT state of the script — not the defects we already fixed.
    context.script_review = None
    context.record_llm_trace(result.trace)
    return context
