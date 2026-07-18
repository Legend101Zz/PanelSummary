"""Tests for the pre-visual quality assert stage."""

from __future__ import annotations

import asyncio

import pytest

from app.domain.manga import (
    ContinuityLedger,
    QualityIssue,
    QualityReport,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
)
from app.manga_pipeline.context import PipelineContext
from app.manga_pipeline.stages import quality_assert_stage


def _context(report: QualityReport | None) -> PipelineContext:
    return PipelineContext(
        book_id="book-1",
        project_id="project-1",
        prior_continuity=ContinuityLedger(project_id="project-1"),
        source_slice=SourceSlice(
            slice_id="slice-1",
            book_id="book-1",
            mode=SourceSliceMode.PAGES,
            source_range=SourceRange(page_start=1, page_end=2),
        ),
        quality_report=report,
    )


def test_quality_assert_stage_allows_passing_or_missing_report():
    assert asyncio.run(quality_assert_stage.run(_context(None))).quality_report is None
    report = QualityReport(passed=True, issues=[])
    assert asyncio.run(quality_assert_stage.run(_context(report))).quality_report is report


def test_quality_assert_stage_raises_before_visual_work_on_errors():
    report = QualityReport(
        passed=False,
        issues=[
            QualityIssue(
                severity="error",
                code="missing_required_fact",
                message="Required source fact is missing.",
            )
        ],
    )

    with pytest.raises(ValueError, match="missing_required_fact"):
        asyncio.run(quality_assert_stage.run(_context(report)))
