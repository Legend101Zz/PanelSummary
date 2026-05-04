"""Tests for the RTL composition validation stage (Phase C2).

Smoke test that the stage merges issues into the existing
QualityReport (rather than overwriting) and skips silently when no
composition is present.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    ContinuityLedger,
    PageComposition,
    PageGridRow,
    PanelPurpose,
    QualityIssue,
    QualityReport,
    ScriptLine,
    ShotType,
    SliceComposition,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
    StoryboardPage,
    StoryboardPanel,
)
from app.manga_pipeline import PipelineContext
from app.manga_pipeline.stages import rtl_composition_validation_stage


def _panel(panel_id: str, *, purpose: PanelPurpose = PanelPurpose.SETUP) -> StoryboardPanel:
    return StoryboardPanel(
        panel_id=panel_id,
        scene_id="s001",
        purpose=purpose,
        shot_type=ShotType.MEDIUM,
        composition=f"{panel_id} on stage.",
        narration=f"{panel_id} happens.",
    )


def _context(*, composition: SliceComposition | None) -> PipelineContext:
    pages = [
        StoryboardPage(
            page_id="pg001",
            page_index=0,
            panels=[_panel("p1"), _panel("p2"), _panel("p3")],
        )
    ]
    context = PipelineContext(
        book_id="book_123",
        project_id="project_123",
        source_slice=SourceSlice(
            slice_id="slice_001",
            book_id="book_123",
            mode=SourceSliceMode.PAGES,
            source_range=SourceRange(page_start=1, page_end=10),
        ),
        prior_continuity=ContinuityLedger(project_id="project_123"),
    )
    context.storyboard_pages = pages
    context.slice_composition = composition
    return context


def test_no_composition_short_circuits():
    context = _context(composition=None)
    out = asyncio.run(rtl_composition_validation_stage.run(context))
    assert out.quality_report is None  # nothing changed


def test_clean_composition_does_not_mutate_existing_report():
    composition = SliceComposition(
        pages=[
            PageComposition(
                page_index=0,
                gutter_grid=[
                    PageGridRow(cell_widths_pct=[60, 40]),
                    PageGridRow(cell_widths_pct=[100]),
                ],
                panel_order=["p1", "p2", "p3"],
                page_turn_panel_id="p3",
            )
        ]
    )
    context = _context(composition=composition)
    pre_existing = QualityReport(passed=True, issues=[])
    context.quality_report = pre_existing
    out = asyncio.run(rtl_composition_validation_stage.run(context))
    # Clean composition \u2192 no issues to merge \u2192 the existing report is
    # left as-is (not even copied).
    assert out.quality_report is pre_existing


def test_dirty_composition_appends_issues_to_existing_report():
    composition = SliceComposition(
        pages=[
            PageComposition(
                page_index=0,
                gutter_grid=[PageGridRow(cell_widths_pct=[33, 34, 33])],
                panel_order=["p1", "p2", "p3"],
                # WRONG: page-turn must be the last entry
                page_turn_panel_id="p1",
            )
        ]
    )
    context = _context(composition=composition)
    pre_existing = QualityReport(
        passed=True,
        issues=[
            QualityIssue(
                severity="warning",
                code="DSL_LOW_SHOT_VARIETY",
                message="only 1 distinct shot type",
                artifact_id="storyboard",
            )
        ],
    )
    context.quality_report = pre_existing
    out = asyncio.run(rtl_composition_validation_stage.run(context))
    # New report contains BOTH the prior warning AND the RTL warning.
    codes = {issue.code for issue in out.quality_report.issues}
    assert "DSL_LOW_SHOT_VARIETY" in codes
    assert "DSL_RTL_PAGE_TURN_NOT_LAST" in codes
