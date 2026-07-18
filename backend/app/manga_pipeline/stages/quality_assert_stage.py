"""Fail-fast guard before visual generation spends image budget."""

from __future__ import annotations

from app.manga_pipeline.context import PipelineContext


async def run(context: PipelineContext) -> PipelineContext:
    """Require story/DSL quality to pass before composition and rendering."""
    report = context.quality_report
    if report is None or report.passed:
        return context

    error_issues = [issue for issue in report.issues if issue.severity == "error"]
    if not error_issues:
        return context
    code_summary = ", ".join(sorted({issue.code for issue in error_issues}))
    raise ValueError(
        f"manga quality gate failed before visual stages "
        f"({len(error_issues)} error(s): {code_summary})"
    )
