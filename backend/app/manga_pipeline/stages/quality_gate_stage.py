"""Quality gate pipeline stage."""

from __future__ import annotations

from app.domain.manga import SliceRole, should_add_to_be_continued
from app.manga_pipeline.context import PipelineContext
from app.services.manga import run_quality_gate


async def run(context: PipelineContext) -> PipelineContext:
    if context.manga_script is None:
        raise ValueError("quality gate needs context.manga_script")
    if not context.storyboard_pages:
        raise ValueError("quality gate needs context.storyboard_pages")

    required_fact_ids = []
    if context.adaptation_plan:
        required_fact_ids = context.adaptation_plan.important_fact_ids

    source_has_more = bool(context.options.get("source_has_more", False))
    standalone = bool(context.options.get("standalone", False))
    slice_role = context.options.get("slice_role")
    if slice_role is None:
        slice_role = SliceRole.OPENING if context.manga_script.to_be_continued else SliceRole.STANDALONE
    elif not isinstance(slice_role, SliceRole):
        slice_role = SliceRole(str(slice_role))

    should_tbc = should_add_to_be_continued(
        source_has_more=source_has_more,
        slice_role=slice_role,
        standalone=standalone,
    )
    context.quality_report = run_quality_gate(
        required_fact_ids=required_fact_ids,
        script=context.manga_script,
        storyboard_pages=context.storyboard_pages,
        should_have_to_be_continued=should_tbc,
    )
    return context
