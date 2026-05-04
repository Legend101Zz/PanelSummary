"""RTL composition validation stage (Phase C2).

Runs immediately after ``page_composition_stage``. Validates that the
LLM-authored gutter grid obeys manga reading-flow conventions
(page-turn anchor at the bottom-left, TBC panels at the page-turn
cell, page-turn cell visually weighty).

We feed the issues into the same ``QualityReport`` that the existing
quality_repair_stage already consumes. This is the "one tool, one issue
stream" rule from Phase 2: a new validator does not get a parallel
report type, it appends to the canonical one.

Why a separate stage instead of folding into ``dsl_validation_stage``?
* ``dsl_validation_stage`` runs BEFORE composition, validating the raw
  storyboard. Sharing the stage would force composition to run before
  storyboard repair, which we don't want \u2014 we want composition to see
  the *settled* storyboard.
* Stage modules in this codebase are intentionally tiny and single-job.
  A 30-line stage is easier to reason about than a multi-mode one.
"""

from __future__ import annotations

from app.domain.manga import QualityReport
from app.manga_pipeline.context import PipelineContext
from app.manga_pipeline.manga_dsl import validate_composition_against_rtl


def _merge_issues_into_report(
    existing: QualityReport | None,
    new_issues: list,
) -> QualityReport:
    """Merge RTL issues into an existing report (or create a fresh one).

    Mirrors the merge in ``dsl_validation_stage`` so both validators
    leave the report shape consistent. We never overwrite the existing
    grounded/missing fact lists; we only append issues and recompute
    ``passed``.
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
    """Validate the slice composition against RTL flow conventions.

    Skips silently when there is no composition to validate \u2014 a slice
    rendered through the legacy panel-count layout has no cell
    positions to check, and the upstream stages don't fail when
    composition is absent.
    """
    if context.slice_composition is None:
        return context
    issues = validate_composition_against_rtl(
        pages=context.storyboard_pages,
        composition=context.slice_composition,
    )
    if not issues:
        return context
    context.quality_report = _merge_issues_into_report(context.quality_report, issues)
    return context
