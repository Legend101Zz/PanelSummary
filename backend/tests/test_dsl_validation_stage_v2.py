"""Tests for the DSL validation pipeline stage.

The stage's job is plumbing: take ``context.storyboard_pages``, run the
validators, merge the issues into ``context.quality_report`` so the existing
repair loop sees them. We pin both: the merge does not destroy upstream
fields, and the stage refuses to run before the storyboard exists.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import (
    ArcRole,
    ArcSliceEntry,
    ContinuityLedger,
    PanelPurpose,
    QualityIssue,
    QualityReport,
    ShotType,
    SliceRole,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
    StoryboardPage,
    StoryboardPanel,
)
from app.manga_pipeline import PipelineContext
from app.manga_pipeline.stages import dsl_validation_stage


def _arc_entry(must_cover: list[str]) -> ArcSliceEntry:
    return ArcSliceEntry(
        slice_number=1,
        role=ArcRole.KI,
        suggested_slice_role=SliceRole.OPENING,
        source_range=SourceRange(page_start=1, page_end=10),
        headline_beat="Kai enters the labyrinth",
        emotional_turn="confident -> wary",
        intellectual_turn="single answer -> doubt",
        must_cover_fact_ids=must_cover,
        closing_hook="The door locks shut.",
    )


def _passing_pages() -> list[StoryboardPage]:
    """Storyboard that satisfies every Ki-role DSL rule."""
    return [
        StoryboardPage(
            page_id=f"page_{i}",
            page_index=i,
            panels=[
                StoryboardPanel(
                    panel_id=f"p{i}a",
                    scene_id="scene_1",
                    purpose=PanelPurpose.SETUP,
                    shot_type=ShotType.WIDE,
                    composition="wide establishing shot",
                    action="Kai walks forward",
                    source_fact_ids=["f001"],
                ),
                StoryboardPanel(
                    panel_id=f"p{i}b",
                    scene_id="scene_1",
                    purpose=PanelPurpose.EXPLANATION,
                    shot_type=ShotType.MEDIUM,
                    composition="medium two-shot",
                    action="Kai meets the skeptic",
                    source_fact_ids=["f001"],
                ),
                StoryboardPanel(
                    panel_id=f"p{i}c",
                    scene_id="scene_1",
                    purpose=PanelPurpose.EMOTIONAL_TURN,
                    shot_type=ShotType.CLOSE_UP,
                    composition="tight close-up",
                    action="Kai's resolve falters",
                ),
            ],
        )
        for i in range(4)
    ]


def _failing_pages() -> list[StoryboardPage]:
    """Storyboard that breaks several DSL rules at once.

    Triggers BOTH:
    - DSL_PAGE_OVER_PANEL_BUDGET (too many panels)
    - DSL_MISSING_ANCHOR_FACTS (no panel anchors f002)
    """
    return [
        StoryboardPage(
            page_id=f"page_{i}",
            page_index=i,
            panels=[
                StoryboardPanel(
                    panel_id=f"p{i}-{j}",
                    scene_id="scene_1",
                    purpose=PanelPurpose.SETUP,
                    shot_type=ShotType.MEDIUM,
                    composition="cramped panel",
                    action="filler",
                    source_fact_ids=["f001"],
                )
                for j in range(7)  # 7 panels > Ki max of 6
            ],
        )
        for i in range(4)
    ]


def _context(pages: list[StoryboardPage], must_cover: list[str]) -> PipelineContext:
    source_slice = SourceSlice(
        slice_id="slice_001",
        book_id="book_123",
        slice_number=1,
        mode=SourceSliceMode.PAGES,
        role=SliceRole.OPENING,
        source_range=SourceRange(page_start=1, page_end=10),
    )
    context = PipelineContext(
        book_id="book_123",
        project_id="project_123",
        source_slice=source_slice,
        prior_continuity=ContinuityLedger(project_id="project_123"),
    )
    context.storyboard_pages = pages
    context.arc_entry = _arc_entry(must_cover)
    return context


def test_dsl_validation_stage_passes_clean_storyboard():
    context = _context(_passing_pages(), must_cover=["f001"])

    result = asyncio.run(dsl_validation_stage.run(context))

    assert result.quality_report is not None
    assert result.quality_report.passed is True
    error_codes = [i.code for i in result.quality_report.issues if i.severity == "error"]
    assert error_codes == []


def test_dsl_validation_stage_flags_violations_and_marks_failed():
    context = _context(_failing_pages(), must_cover=["f001", "f002"])

    result = asyncio.run(dsl_validation_stage.run(context))

    assert result.quality_report is not None
    assert result.quality_report.passed is False
    codes = {i.code for i in result.quality_report.issues}
    assert "DSL_PAGE_OVER_PANEL_BUDGET" in codes
    assert "DSL_MISSING_ANCHOR_FACTS" in codes


def test_dsl_validation_stage_preserves_existing_quality_report_fields():
    context = _context(_passing_pages(), must_cover=["f001"])
    context.quality_report = QualityReport(
        passed=True,
        issues=[QualityIssue(severity="info", code="UPSTREAM", message="from earlier stage")],
        grounded_fact_ids=["f001"],
        missing_fact_ids=[],
        notes="upstream notes",
    )

    result = asyncio.run(dsl_validation_stage.run(context))

    assert result.quality_report is not None
    # Upstream fields survive untouched.
    assert result.quality_report.grounded_fact_ids == ["f001"]
    assert result.quality_report.notes == "upstream notes"
    # Upstream issue is still there alongside any new DSL issues.
    issue_codes = [i.code for i in result.quality_report.issues]
    assert "UPSTREAM" in issue_codes


def test_dsl_validation_stage_demands_a_storyboard():
    context = _context([], must_cover=["f001"])
    context.storyboard_pages = []

    with pytest.raises(ValueError, match="storyboard"):
        asyncio.run(dsl_validation_stage.run(context))
