"""Editorial review stage — the manga editor's pass over a script.

This stage sits between ``manga_script_stage`` and ``storyboard_stage``.
It does TWO things:

1. Runs the deterministic ``voice_validator`` to catch cheap defects
   (unknown speakers, oversize bubbles, generic filler phrases).
2. Asks an LLM playing the role of a manga editor to read the script
   end-to-end and surface subjective defects: voice drift, weak
   tension, dropped continuity hooks, characterisation that contradicts
   the bible.

Both halves emit ``ScriptIssue`` records. We merge them into a single
``ScriptReviewReport`` and stash it on the pipeline context so the
follow-on ``script_repair_stage`` can read it without re-running either
the LLM or the validator.

Why not skip the heuristic and trust the LLM? Heuristics are *free*
and deterministic. If the LLM is having a bad day, the cheap checks
still catch the cheap defects. Defense in depth.

Why not skip the LLM? Because an unknown-speaker check cannot tell us
whether the dialogue actually *sounds* like the bible character. That
requires reading taste; reading taste lives in the LLM.
"""

from __future__ import annotations

import json

from app.domain.manga import ScriptReviewReport
from app.manga_pipeline.context import PipelineContext
from app.manga_pipeline.llm_contracts import (
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)
from app.services.manga.grounding_validator import validate_grounding
from app.services.manga.voice_validator import validate_voice
from app.manga_pipeline.prompt_fragments import (
    render_protagonist_contract_block,
    render_voice_cards_block,
)


SYSTEM_PROMPT = """You are a senior manga editor reviewing a draft script.

You receive the draft script, the FROZEN character/world bible, the beat
sheet for this slice, the global adaptation plan, the arc entry that
this slice fulfils, and the prior slice's closing hook.

Your job is to flag every editorial defect so the writer can revise.
You do NOT rewrite the script — that is the next stage's job.

Discipline:
- Author one ScriptIssue per distinct defect. Reference the scene_id and,
  where the defect is line-specific, the line_index. Set speaker_id when
  the defect is about characterisation.
- Use these issue codes (and only these):
    * SCRIPT_VOICE_DRIFT      — line does not match the speaker's bible
                                speech_style (severity: error)
    * SCRIPT_TENSION_FLAT     — scene lacks stakes or escalation
                                (severity: warning)
    * SCRIPT_CLICHE           — dialogue or narration uses a tired
                                manga/anime cliche (severity: warning)
    * SCRIPT_HOOK_DROPPED     — opening fails to honour the prior
                                slice's closing hook (severity: error)
    * SCRIPT_PROTAGONIST_OFFSCREEN
                              — protagonist is absent from a slice that
                                should advance their arc (severity:
                                error for KI/SHO/TEN/KETSU; warning for
                                RECAP)
    * SCRIPT_INTENT_MISALIGNED
                              — line.intent does not match the actual
                                line content (severity: warning)
- Provide a one-line ``suggestion`` for each issue: a concrete rewrite
  direction the writer can act on.
- Fill ``voice_summary`` with a 1-2 sentence read on whether the bible
  voices are coming through.
- Fill ``tension_summary`` with a 1-2 sentence read on whether the slice
  builds toward its arc role beat.
- Set ``passed=true`` only when there are zero error-severity issues.
  The orchestrator recomputes ``passed`` mechanically anyway, so do not
  game it — just be honest.

Return ONE JSON object that conforms to the schema.
"""


def _build_user_message(context: PipelineContext) -> str:
    if context.adaptation_plan is None:
        raise ValueError("script review requires context.adaptation_plan")
    if context.character_bible is None:
        raise ValueError("script review requires context.character_bible")
    if context.beat_sheet is None:
        raise ValueError("script review requires context.beat_sheet")
    if context.manga_script is None:
        raise ValueError("script review requires context.manga_script")

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
        "adaptation_plan": context.adaptation_plan.model_dump(mode="json"),
        "character_world_bible": context.character_bible.model_dump(mode="json"),
        "beat_sheet": context.beat_sheet.model_dump(mode="json"),
        "manga_script": context.manga_script.model_dump(mode="json"),
        "arc_entry": (
            context.arc_entry.model_dump(mode="json")
            if context.arc_entry is not None
            else None
        ),
    }
    return (
        "Review the draft manga script as a senior manga editor. Surface every "
        "editorial defect you would block at table read. Be specific and cite "
        "scene_id / line_index when the defect is line-level.\n\n"
        f"{render_protagonist_contract_block(plan=context.adaptation_plan, synopsis=context.book_synopsis)}\n\n"
        f"{render_voice_cards_block(context.voice_cards)}\n\n"
        f"INPUT_JSON:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{build_json_contract_prompt(ScriptReviewReport)}"
    )


async def run(context: PipelineContext) -> PipelineContext:
    """Produce a ScriptReviewReport and stash it on the context.

    The function is idempotent against re-runs: if a script_review already
    exists on the context (e.g. the orchestrator re-ran the stage after a
    repair), we replace it. Idempotence is required because the second
    DSL/quality-gate pass in the existing pipeline already exercises this
    pattern for storyboard repair.
    """
    if context.llm_client is None:
        raise ValueError("script review requires context.llm_client")
    if context.manga_script is None:
        raise ValueError("script review requires context.manga_script")
    if context.character_bible is None:
        raise ValueError("script review requires context.character_bible")

    # Cheap deterministic pass first. If it finds errors, we still call the
    # LLM (we want the editor's holistic notes), but we seed the report with
    # the heuristic findings so the editor cannot quietly miss them.
    arc_role = context.arc_entry.role.value if context.arc_entry else None
    heuristic_issues = validate_voice(
        script=context.manga_script,
        bible=context.character_bible,
        arc_role=arc_role,
    )
    # Phase 2.4: also seed the report with grounding heuristics so the
    # editor LLM (and the repair stage that follows) sees both voice AND
    # grounding defects in the same pass. Order does not matter — we
    # dedupe by (code, scene_id, line_index, speaker_id) below.
    if context.beat_sheet is not None:
        heuristic_issues.extend(
            validate_grounding(
                script=context.manga_script,
                beat_sheet=context.beat_sheet,
            )
        )

    request = StructuredLLMRequest(
        stage_name=LLMStageName.SCRIPT_REVIEW,
        system_prompt=SYSTEM_PROMPT,
        user_message=_build_user_message(context),
        max_tokens=int(context.options.get("script_review_max_tokens", 6000)),
        # Editor temperature stays cooler than the writer's. We want
        # consistent judgement, not creative leaps.
        temperature=float(context.options.get("script_review_temperature", 0.4)),
        max_validation_attempts=int(context.options.get("llm_validation_attempts", 3)),
    )
    result = await run_structured_llm_stage(
        client=context.llm_client,
        request=request,
        output_type=ScriptReviewReport,
    )
    report = result.artifact

    # Merge heuristic issues into the LLM report. We dedupe on (code, scene_id,
    # line_index, speaker_id) because the LLM editor often catches the same
    # SCRIPT_LINE_TOO_LONG the validator did, and double-reporting fattens
    # the repair prompt with no new signal.
    seen_keys: set[tuple[str, str, int | None, str]] = {
        (issue.code, issue.scene_id, issue.line_index, issue.speaker_id)
        for issue in report.issues
    }
    merged_issues = list(report.issues)
    for issue in heuristic_issues:
        key = (issue.code, issue.scene_id, issue.line_index, issue.speaker_id)
        if key not in seen_keys:
            merged_issues.append(issue)
            seen_keys.add(key)

    # Pydantic validators on the model recompute `passed` from the issue list
    # so we don't have to maintain a parallel boolean here.
    context.script_review = report.model_copy(update={"issues": merged_issues})
    context.record_llm_trace(result.trace)
    return context
