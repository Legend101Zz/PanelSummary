"""Tests for the Manga DSL constraints module.

These tests pin the executable form of ``docs/MANGA_DSL_SPEC.md`` so a future
prompt edit cannot silently drop the DSL discipline. If a budget changes here,
the spec doc must change too — they are two faces of the same rule.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    ArcRole,
    ArcSliceEntry,
    PanelPurpose,
    ShotType,
    SliceRole,
    SourceRange,
    StoryboardPage,
    StoryboardPanel,
)
from app.manga_pipeline.manga_dsl import (
    DIALOGUE_BUDGETS_BY_ARC_ROLE,
    PANEL_BUDGETS_BY_ARC_ROLE,
    PAGE_BUDGETS_BY_ARC_ROLE,
    dialogue_budget_for,
    page_budget_for,
    panel_budget_for,
    render_dsl_prompt_fragment,
    validate_storyboard_against_dsl,
)


def _arc_entry(role: ArcRole, must_cover: list[str] | None = None) -> ArcSliceEntry:
    return ArcSliceEntry(
        slice_number=1,
        role=role,
        suggested_slice_role=SliceRole.OPENING,
        source_range=SourceRange(page_start=1, page_end=10),
        headline_beat="Kai enters the labyrinth",
        emotional_turn="confident -> wary",
        intellectual_turn="single answer -> doubt",
        must_cover_fact_ids=must_cover or ["f001"],
        closing_hook="The door locks shut.",
    )


def _panel(
    panel_id: str,
    *,
    shot: ShotType = ShotType.MEDIUM,
    dialogue_lines: int = 1,
    dialogue_chars: int = 30,
    fact_ids: list[str] | None = None,
) -> StoryboardPanel:
    """Build a minimal valid panel with knobs that exercise DSL caps."""
    text = "x" * dialogue_chars
    return StoryboardPanel(
        panel_id=panel_id,
        scene_id="scene_1",
        purpose=PanelPurpose.SETUP,
        shot_type=shot,
        composition="medium shot, off-center",
        action="Kai walks forward",
        dialogue=[
            {"speaker_id": "kai", "text": text} for _ in range(dialogue_lines)
        ],
        source_fact_ids=fact_ids or [],
    )


def _page(page_index: int, panels: list[StoryboardPanel]) -> StoryboardPage:
    return StoryboardPage(
        page_id=f"page_{page_index}",
        page_index=page_index,
        panels=panels,
    )


def _baseline_pages_for_ki() -> list[StoryboardPage]:
    """A four-page, four-panel-per-page Ki storyboard with shot variety.

    Used as the "should pass" baseline. Each test mutates a copy to flag a
    single rule.
    """
    return [
        _page(
            i,
            [
                _panel(f"p{i}a", shot=ShotType.WIDE, fact_ids=["f001"]),
                _panel(f"p{i}b", shot=ShotType.MEDIUM, fact_ids=["f001"]),
                _panel(f"p{i}c", shot=ShotType.CLOSE_UP),
                _panel(f"p{i}d", shot=ShotType.INSERT),
            ],
        )
        for i in range(4)
    ]


# --- cap-table sanity --------------------------------------------------------


def test_every_arc_role_has_a_panel_budget():
    for role in ArcRole:
        assert role in PANEL_BUDGETS_BY_ARC_ROLE
        budget = panel_budget_for(role)
        assert budget.min_panels >= 1
        assert budget.max_panels >= budget.min_panels
        assert budget.min_panels <= budget.preferred <= budget.max_panels


def test_every_arc_role_has_a_page_budget():
    for role in ArcRole:
        assert role in PAGE_BUDGETS_BY_ARC_ROLE
        budget = page_budget_for(role)
        assert budget.min_pages <= budget.preferred <= budget.max_pages


def test_every_arc_role_has_a_dialogue_budget():
    for role in ArcRole:
        assert role in DIALOGUE_BUDGETS_BY_ARC_ROLE
        budget = dialogue_budget_for(role)
        assert budget.max_lines_per_panel >= 1
        assert budget.max_chars_per_panel >= 30
        assert budget.max_lines_per_page >= budget.max_lines_per_panel


def test_unknown_arc_role_falls_back_to_safe_defaults():
    assert panel_budget_for(None).max_panels == 6
    assert page_budget_for(None).max_pages == 6
    assert dialogue_budget_for(None).max_lines_per_panel == 3


# --- prompt fragment ---------------------------------------------------------


def test_render_dsl_prompt_fragment_includes_role_and_must_cover():
    fragment = render_dsl_prompt_fragment(_arc_entry(ArcRole.TEN, must_cover=["f001", "f002"]))

    assert "TEN" in fragment
    assert "f001" in fragment
    assert "f002" in fragment
    # Hard caps must be visible to the LLM, not just to the validator.
    ten_panels = panel_budget_for(ArcRole.TEN)
    assert str(ten_panels.max_panels) in fragment
    assert "top-right to bottom-left" in fragment


def test_render_dsl_prompt_fragment_handles_missing_arc_entry():
    fragment = render_dsl_prompt_fragment(None)
    assert "GENERIC" in fragment


# --- validators --------------------------------------------------------------


def test_baseline_storyboard_passes_dsl_validation():
    pages = _baseline_pages_for_ki()
    issues = validate_storyboard_against_dsl(pages=pages, arc_entry=_arc_entry(ArcRole.KI))
    error_codes = [issue.code for issue in issues if issue.severity == "error"]
    assert error_codes == []


def test_dsl_flags_too_many_panels_per_page():
    pages = _baseline_pages_for_ki()
    # Stuff 7 panels into the last page (over the Ki max of 6).
    pages[-1] = _page(
        3,
        [_panel(f"p3-{i}", shot=ShotType.MEDIUM) for i in range(7)],
    )
    issues = validate_storyboard_against_dsl(pages=pages, arc_entry=_arc_entry(ArcRole.KI))
    codes = [issue.code for issue in issues]
    assert "DSL_PAGE_OVER_PANEL_BUDGET" in codes


def test_dsl_flags_too_few_panels_per_page():
    pages = _baseline_pages_for_ki()
    pages[0] = _page(0, [_panel("p0-a", shot=ShotType.WIDE, fact_ids=["f001"])])
    issues = validate_storyboard_against_dsl(pages=pages, arc_entry=_arc_entry(ArcRole.KI))
    codes = [issue.code for issue in issues]
    assert "DSL_PAGE_UNDER_PANEL_BUDGET" in codes


def test_dsl_flags_dialogue_overflow_per_panel():
    pages = _baseline_pages_for_ki()
    # Replace the first panel with one that has 4 dialogue lines (Ki cap = 3).
    pages[0].panels[0] = _panel(
        "p0a",
        shot=ShotType.WIDE,
        dialogue_lines=4,
        dialogue_chars=30,
        fact_ids=["f001"],
    )
    issues = validate_storyboard_against_dsl(pages=pages, arc_entry=_arc_entry(ArcRole.KI))
    codes = [issue.code for issue in issues]
    assert "DSL_PANEL_OVER_DIALOGUE_LINES" in codes


def test_dsl_flags_dialogue_char_overflow_per_panel():
    pages = _baseline_pages_for_ki()
    pages[0].panels[0] = _panel(
        "p0a",
        shot=ShotType.WIDE,
        dialogue_lines=1,
        dialogue_chars=170,  # over the 160 cap
        fact_ids=["f001"],
    )
    issues = validate_storyboard_against_dsl(pages=pages, arc_entry=_arc_entry(ArcRole.KI))
    codes = [issue.code for issue in issues]
    assert "DSL_PANEL_OVER_DIALOGUE_CHARS" in codes


def test_dsl_flags_missing_anchor_facts():
    # Build a storyboard that never references the must-cover fact.
    pages = [
        _page(
            i,
            [
                _panel(f"p{i}a", shot=ShotType.WIDE),
                _panel(f"p{i}b", shot=ShotType.MEDIUM),
                _panel(f"p{i}c", shot=ShotType.CLOSE_UP),
            ],
        )
        for i in range(3)
    ]
    issues = validate_storyboard_against_dsl(
        pages=pages,
        arc_entry=_arc_entry(ArcRole.KI, must_cover=["f001", "f002"]),
    )
    error_codes = [issue.code for issue in issues if issue.severity == "error"]
    assert "DSL_MISSING_ANCHOR_FACTS" in error_codes


def test_dsl_flags_low_shot_variety_as_warning():
    # Every panel uses MEDIUM, so distinct shot count = 1.
    pages = [
        _page(
            i,
            [_panel(f"p{i}-{j}", shot=ShotType.MEDIUM, fact_ids=["f001"]) for j in range(4)],
        )
        for i in range(4)
    ]
    issues = validate_storyboard_against_dsl(pages=pages, arc_entry=_arc_entry(ArcRole.KI))
    warning_codes = [issue.code for issue in issues if issue.severity == "warning"]
    assert "DSL_LOW_SHOT_VARIETY" in warning_codes


def test_dsl_flags_too_few_pages_per_slice():
    # Only 2 pages; Ki minimum is 3.
    pages = [
        _page(
            i,
            [
                _panel(f"p{i}a", shot=ShotType.WIDE, fact_ids=["f001"]),
                _panel(f"p{i}b", shot=ShotType.MEDIUM),
                _panel(f"p{i}c", shot=ShotType.CLOSE_UP),
            ],
        )
        for i in range(2)
    ]
    issues = validate_storyboard_against_dsl(pages=pages, arc_entry=_arc_entry(ArcRole.KI))
    codes = [issue.code for issue in issues]
    assert "DSL_SLICE_UNDER_PAGE_BUDGET" in codes


def test_dsl_flags_too_many_pages_per_slice():
    # 7 pages; Ki maximum is 6.
    pages = [
        _page(
            i,
            [
                _panel(f"p{i}a", shot=ShotType.WIDE, fact_ids=["f001"]),
                _panel(f"p{i}b", shot=ShotType.MEDIUM),
                _panel(f"p{i}c", shot=ShotType.CLOSE_UP),
            ],
        )
        for i in range(7)
    ]
    issues = validate_storyboard_against_dsl(pages=pages, arc_entry=_arc_entry(ArcRole.KI))
    codes = [issue.code for issue in issues]
    assert "DSL_SLICE_OVER_PAGE_BUDGET" in codes
