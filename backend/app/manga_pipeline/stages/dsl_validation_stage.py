"""DSL validation stage.

Runs immediately after ``storyboard_stage`` and BEFORE ``quality_gate_stage``
so that DSL violations (panel count, dialogue budget, anchor facts, shot
variety) end up on the same ``QualityReport`` that the existing repair loop
already consumes. We do not invent a parallel issue type; the whole point of
keeping the issues unified is that the repair stage stays one tool.

This stage NEVER calls the LLM. It's pure validation. The repair stage is what
asks the LLM to fix the issues this stage flags.
"""

from __future__ import annotations

from app.domain.manga import QualityReport
from app.manga_pipeline.context import PipelineContext
from app.manga_pipeline.manga_dsl import validate_storyboard_against_dsl


def _merge_issues_into_report(
    existing: QualityReport | None,
    new_issues: list,
) -> QualityReport:
    """Merge DSL issues into an existing report (or create a fresh one).

    The pipeline order today is: storyboard -> dsl_validation -> quality_gate.
    The quality gate runs its own checks and may have already populated a
    report; we never overwrite its grounded/missing fact lists, only append
    to ``issues`` and recompute ``passed``.
    """
    if existing is None:
        return QualityReport(
            passed=not any(issue.severity == "error" for issue in new_issues),
            issues=list(new_issues),
        )
    combined_issues = list(existing.issues) + list(new_issues)
    has_error = any(issue.severity == "error" for issue in combined_issues)
    return QualityReport(
        passed=not has_error,
        issues=combined_issues,
        grounded_fact_ids=list(existing.grounded_fact_ids),
        missing_fact_ids=list(existing.missing_fact_ids),
        notes=existing.notes,
    )


async def run(context: PipelineContext) -> PipelineContext:
    """Validate the freshly generated storyboard against the manga DSL.

    Failing loudly when there is no storyboard prevents this stage from being
    reordered before storyboard generation by mistake, which would silently
    pass every project.
    """
    if not context.storyboard_pages:
        raise ValueError(
            "dsl_validation requires context.storyboard_pages; "
            "run storyboard_stage first"
        )
    issues = validate_storyboard_against_dsl(
        pages=context.storyboard_pages,
        arc_entry=context.arc_entry,
    )
    context.quality_report = _merge_issues_into_report(context.quality_report, issues)
    return context
