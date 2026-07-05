"""Quality gate pipeline stage."""

from __future__ import annotations

from app.domain.manga import QualityReport, SliceRole, should_add_to_be_continued
from app.manga_pipeline.context import PipelineContext
from app.services.manga.quality_service import run_quality_gate


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
    gate_report = run_quality_gate(
        required_fact_ids=required_fact_ids,
        script=context.manga_script,
        storyboard_pages=context.storyboard_pages,
        should_have_to_be_continued=should_tbc,
        character_bible=context.character_bible,
    )
    if context.quality_report is None:
        context.quality_report = gate_report
    else:
        combined = list(context.quality_report.issues) + list(gate_report.issues)
        context.quality_report = QualityReport(
            passed=not any(issue.severity == "error" for issue in combined),
            issues=combined,
            grounded_fact_ids=list(gate_report.grounded_fact_ids),
            missing_fact_ids=list(gate_report.missing_fact_ids),
            notes=gate_report.notes or context.quality_report.notes,
        )
    return context
