"""Tests for the RTL composition validators (Phase C2).

Pure functions \u2014 no LLM, no DB. Each test feeds a hand-built
``SliceComposition`` into ``validate_composition_against_rtl`` and
asserts the issue codes that come out.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    PageComposition,
    PageGridRow,
    PanelPurpose,
    ShotType,
    SliceComposition,
    StoryboardPage,
    StoryboardPanel,
)
from app.manga_pipeline.manga_dsl import validate_composition_against_rtl


# ---------------------------------------------------------------------------
# Fixtures.
# ---------------------------------------------------------------------------


def _panel(panel_id: str, *, purpose: PanelPurpose = PanelPurpose.SETUP) -> StoryboardPanel:
    return StoryboardPanel(
        panel_id=panel_id,
        scene_id="s001",
        purpose=purpose,
        shot_type=ShotType.MEDIUM,
        composition=f"{panel_id} on stage.",
        narration=f"{panel_id} happens.",
    )


def _page(panel_ids: list[str], *, tbc_id: str | None = None) -> StoryboardPage:
    panels = [_panel(pid) for pid in panel_ids]
    if tbc_id:
        for p in panels:
            if p.panel_id == tbc_id:
                # rebuild that panel with TBC purpose
                idx = panels.index(p)
                panels[idx] = _panel(tbc_id, purpose=PanelPurpose.TO_BE_CONTINUED)
    return StoryboardPage(page_id=f"pg-{'-'.join(panel_ids)}", page_index=0, panels=panels)


# ---------------------------------------------------------------------------
# Skip semantics.
# ---------------------------------------------------------------------------


def test_no_composition_returns_no_issues():
    page = _page(["p1", "p2"])
    assert validate_composition_against_rtl(pages=[page], composition=None) == []


def test_default_composition_is_skipped():
    # Empty composition (the stage's fallback when the LLM fails) has
    # nothing to validate \u2014 the legacy layout has no cell positions.
    composition = SliceComposition(
        pages=[PageComposition(page_index=0, gutter_grid=[], panel_order=[])]
    )
    assert validate_composition_against_rtl(pages=[_page(["p1", "p2"])], composition=composition) == []


# ---------------------------------------------------------------------------
# Page-turn anchor rule.
# ---------------------------------------------------------------------------


def test_page_turn_at_last_position_passes():
    page = _page(["p1", "p2", "p3"])
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
    issues = validate_composition_against_rtl(pages=[page], composition=composition)
    assert issues == []


def test_page_turn_in_middle_is_flagged_warning():
    page = _page(["p1", "p2", "p3"])
    composition = SliceComposition(
        pages=[
            PageComposition(
                page_index=0,
                gutter_grid=[PageGridRow(cell_widths_pct=[33, 34, 33])],
                panel_order=["p1", "p2", "p3"],
                # WRONG: page-turn anchor should be the LAST entry, not p2
                page_turn_panel_id="p2",
            )
        ]
    )
    issues = validate_composition_against_rtl(pages=[page], composition=composition)
    codes = {issue.code for issue in issues}
    assert "DSL_RTL_PAGE_TURN_NOT_LAST" in codes
    assert all(issue.severity == "warning" for issue in issues)


# ---------------------------------------------------------------------------
# TBC must be the page-turn cell.
# ---------------------------------------------------------------------------


def test_tbc_panel_at_page_turn_passes():
    page = _page(["p1", "p2", "p3"], tbc_id="p3")
    composition = SliceComposition(
        pages=[
            PageComposition(
                page_index=0,
                gutter_grid=[PageGridRow(cell_widths_pct=[33, 34, 33])],
                panel_order=["p1", "p2", "p3"],
                page_turn_panel_id="p3",
            )
        ]
    )
    issues = validate_composition_against_rtl(pages=[page], composition=composition)
    # Either zero issues, or none of the TBC-related ones.
    assert "DSL_RTL_TBC_NOT_PAGE_TURN" not in {i.code for i in issues}


def test_tbc_panel_not_at_page_turn_is_flagged():
    page = _page(["p1", "p2", "p3"], tbc_id="p1")
    composition = SliceComposition(
        pages=[
            PageComposition(
                page_index=0,
                gutter_grid=[PageGridRow(cell_widths_pct=[33, 34, 33])],
                panel_order=["p1", "p2", "p3"],
                page_turn_panel_id="p3",
            )
        ]
    )
    issues = validate_composition_against_rtl(pages=[page], composition=composition)
    codes = [issue.code for issue in issues]
    assert "DSL_RTL_TBC_NOT_PAGE_TURN" in codes


# ---------------------------------------------------------------------------
# Page-turn cell must not be the narrowest.
# ---------------------------------------------------------------------------


def test_narrow_page_turn_cell_is_flagged():
    page = _page(["p1", "p2"])
    composition = SliceComposition(
        pages=[
            PageComposition(
                page_index=0,
                # p1 sits in the right (80%), p2 (page-turn) gets only 20%.
                gutter_grid=[PageGridRow(cell_widths_pct=[80, 20])],
                panel_order=["p1", "p2"],
                page_turn_panel_id="p2",
            )
        ]
    )
    issues = validate_composition_against_rtl(pages=[page], composition=composition)
    codes = [issue.code for issue in issues]
    assert "DSL_RTL_PAGE_TURN_NARROW" in codes


def test_wide_page_turn_cell_passes():
    page = _page(["p1", "p2"])
    composition = SliceComposition(
        pages=[
            PageComposition(
                page_index=0,
                gutter_grid=[PageGridRow(cell_widths_pct=[30, 70])],
                panel_order=["p1", "p2"],
                page_turn_panel_id="p2",
            )
        ]
    )
    issues = validate_composition_against_rtl(pages=[page], composition=composition)
    assert "DSL_RTL_PAGE_TURN_NARROW" not in {i.code for i in issues}


def test_page_turn_alone_in_its_row_is_not_flagged_as_narrow():
    page = _page(["p1", "p2"])
    composition = SliceComposition(
        pages=[
            PageComposition(
                page_index=0,
                gutter_grid=[
                    PageGridRow(cell_widths_pct=[100]),
                    PageGridRow(cell_widths_pct=[100]),
                ],
                panel_order=["p1", "p2"],
                page_turn_panel_id="p2",
            )
        ]
    )
    issues = validate_composition_against_rtl(pages=[page], composition=composition)
    # Only-cell-in-the-row is by definition not the narrowest.
    assert "DSL_RTL_PAGE_TURN_NARROW" not in {i.code for i in issues}


# ---------------------------------------------------------------------------
# Robustness.
# ---------------------------------------------------------------------------


def test_composition_referencing_unknown_page_index_is_skipped():
    page = _page(["p1", "p2"])
    composition = SliceComposition(
        pages=[
            PageComposition(
                page_index=99,  # storyboard has no page 99
                gutter_grid=[PageGridRow(cell_widths_pct=[50, 50])],
                panel_order=["p1", "p2"],
                page_turn_panel_id="p2",
            )
        ]
    )
    issues = validate_composition_against_rtl(pages=[page], composition=composition)
    assert issues == []
