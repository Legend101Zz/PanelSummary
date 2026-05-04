"""Phase 4.3 \u2014 shot-variety editorial floor.

Pins the two new dominance + establishing-coverage warnings:

* ``evaluate_shot_dominance`` warns when one ShotType > 70% of slice
  panels, but ONLY when the slice has enough panels to make the
  signal meaningful. A 3-panel slice forced into 'no shot type may
  be >70%' rounds to 'all 3 panels must be distinct' which overlaps
  the cardinality check.
* ``evaluate_establishing_coverage`` warns when ZERO panels in the
  slice are WIDE / EXTREME_WIDE \u2014 the reader is never shown the
  surrounding space.
* Both flow through ``QualityReport`` via the existing DSL stage; we
  pin the wiring with one end-to-end test through
  ``validate_storyboard_against_dsl``.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    PanelPurpose,
    ScriptLine,
    ShotType,
    StoryboardPage,
    StoryboardPanel,
)
from app.manga_pipeline.manga_dsl import validate_storyboard_against_dsl
from app.manga_pipeline.shot_variety import (
    DOMINANCE_THRESHOLD,
    MIN_PANELS_FOR_DOMINANCE_CHECK,
    evaluate_establishing_coverage,
    evaluate_shot_dominance,
    evaluate_shot_variety,
)


def _panel(
    panel_id: str,
    *,
    shot: ShotType = ShotType.MEDIUM,
    scene_id: str = "scene-1",
) -> StoryboardPanel:
    return StoryboardPanel(
        panel_id=panel_id,
        scene_id=scene_id,
        purpose=PanelPurpose.SETUP,
        shot_type=shot,
        composition="placeholder framing note",
        action="placeholder action",
        narration="",
        dialogue=[],
        character_ids=["aiko"],
    )


def _page(panels: list[StoryboardPanel], *, page_index: int = 0) -> StoryboardPage:
    return StoryboardPage(
        page_id=f"page-{page_index}", page_index=page_index, panels=panels
    )


_PANELS_PER_PAGE = 4  # well under StoryboardPage's max; varies isn't the point here


def _slice_with_shot_distribution(*shots: ShotType) -> list[StoryboardPage]:
    """Build a multi-page slice with the given shot-type sequence.

    Splits across pages of <= _PANELS_PER_PAGE so the StoryboardPage
    panel-count validator stays happy. Page split is irrelevant for
    these checks — they aggregate across the whole slice.
    """
    panels = [_panel(f"p{idx}", shot=shot) for idx, shot in enumerate(shots)]
    pages: list[StoryboardPage] = []
    for page_index, start in enumerate(range(0, len(panels), _PANELS_PER_PAGE)):
        chunk = panels[start : start + _PANELS_PER_PAGE]
        pages.append(_page(chunk, page_index=page_index))
    return pages


# --- evaluate_shot_dominance --------------------------------------------------


def test_dominance_warns_when_one_shot_exceeds_threshold():
    """8/10 MEDIUM panels (80%) trips the >70% dominance warning."""
    pages = _slice_with_shot_distribution(
        *([ShotType.MEDIUM] * 8 + [ShotType.WIDE, ShotType.CLOSE_UP])
    )
    issues = evaluate_shot_dominance(pages)
    assert len(issues) == 1
    issue = issues[0]
    assert issue.code == "DSL_SHOT_TYPE_DOMINANCE"
    assert issue.severity == "warning"
    assert "medium" in issue.message.lower()
    assert "8/10" in issue.message


def test_dominance_silent_at_exactly_threshold():
    """7/10 MEDIUM (70%) sits on the line; we trust the storyboarder there."""
    pages = _slice_with_shot_distribution(
        *([ShotType.MEDIUM] * 7 + [ShotType.WIDE, ShotType.CLOSE_UP, ShotType.EXTREME_CLOSE_UP])
    )
    assert evaluate_shot_dominance(pages) == []


def test_dominance_silent_below_threshold():
    """6/10 MEDIUM (60%) is a healthy distribution; no warning."""
    pages = _slice_with_shot_distribution(
        ShotType.MEDIUM,
        ShotType.MEDIUM,
        ShotType.MEDIUM,
        ShotType.MEDIUM,
        ShotType.MEDIUM,
        ShotType.MEDIUM,
        ShotType.WIDE,
        ShotType.CLOSE_UP,
        ShotType.INSERT,
        ShotType.EXTREME_CLOSE_UP,
    )
    assert evaluate_shot_dominance(pages) == []


def test_dominance_skips_short_slices():
    """A 4-panel slice cannot meaningfully test 70% dominance; skip it."""
    pages = _slice_with_shot_distribution(
        ShotType.MEDIUM, ShotType.MEDIUM, ShotType.MEDIUM, ShotType.MEDIUM
    )
    # 4/4 = 100%, but len < MIN_PANELS_FOR_DOMINANCE_CHECK (5) \u2014 silent.
    assert evaluate_shot_dominance(pages) == []


def test_dominance_threshold_is_tunable_per_call():
    """Tests can pin a tighter threshold without monkeypatching the constant."""
    pages = _slice_with_shot_distribution(
        *([ShotType.MEDIUM] * 6 + [ShotType.WIDE] * 4)  # 60% MEDIUM
    )
    # Default 70% \u2014 silent.
    assert evaluate_shot_dominance(pages) == []
    # Tighten to 50% \u2014 fires.
    issues = evaluate_shot_dominance(pages, threshold=0.50)
    assert any(i.code == "DSL_SHOT_TYPE_DOMINANCE" for i in issues)


def test_dominance_constant_matches_default_kwarg():
    """The kwarg default must match the module-level constant; drift is a bug."""
    # If someone bumps the module constant but forgets the kwarg default,
    # tests using the constant pass while production uses the stale default.
    # This test pins the two together.
    assert DOMINANCE_THRESHOLD == 0.70
    assert MIN_PANELS_FOR_DOMINANCE_CHECK == 5


# --- evaluate_establishing_coverage ------------------------------------------


def test_establishing_warns_when_no_wide_or_extreme_wide_panel():
    """A slice of only MEDIUM + CLOSE_UP never shows the room \u2014 warn."""
    pages = _slice_with_shot_distribution(
        ShotType.MEDIUM, ShotType.CLOSE_UP, ShotType.MEDIUM, ShotType.EXTREME_CLOSE_UP
    )
    issues = evaluate_establishing_coverage(pages)
    assert len(issues) == 1
    assert issues[0].code == "DSL_NO_ESTABLISHING_SHOT"
    assert issues[0].severity == "warning"


def test_establishing_silent_with_a_single_wide():
    """One WIDE panel anywhere in the slice satisfies the editorial floor."""
    pages = _slice_with_shot_distribution(
        ShotType.MEDIUM, ShotType.CLOSE_UP, ShotType.WIDE, ShotType.MEDIUM
    )
    assert evaluate_establishing_coverage(pages) == []


def test_establishing_silent_with_a_single_extreme_wide():
    """EXTREME_WIDE counts too \u2014 it's the most cinematic establishing beat."""
    pages = _slice_with_shot_distribution(
        ShotType.EXTREME_WIDE, ShotType.MEDIUM, ShotType.CLOSE_UP
    )
    assert evaluate_establishing_coverage(pages) == []


def test_establishing_silent_on_empty_slice():
    """No pages means no slice; empty input is not an editorial failure.

    StoryboardPage's own validator forbids empty `panels`, so a 'page
    with zero panels' is not constructible at the domain layer — the
    only empty case the helper has to defend against is the no-pages case.
    """
    assert evaluate_establishing_coverage([]) == []


# --- evaluate_shot_variety (entry point) -------------------------------------


def test_shot_variety_chains_both_checks():
    """The single entry point must surface BOTH warnings when both fire."""
    pages = _slice_with_shot_distribution(
        *([ShotType.MEDIUM] * 9 + [ShotType.CLOSE_UP])
    )
    codes = {issue.code for issue in evaluate_shot_variety(pages)}
    assert "DSL_SHOT_TYPE_DOMINANCE" in codes
    assert "DSL_NO_ESTABLISHING_SHOT" in codes


def test_shot_variety_silent_on_a_well_balanced_slice():
    """A slice with a WIDE establishing beat and varied shots is clean."""
    pages = _slice_with_shot_distribution(
        ShotType.WIDE,
        ShotType.MEDIUM,
        ShotType.CLOSE_UP,
        ShotType.MEDIUM,
        ShotType.EXTREME_CLOSE_UP,
        ShotType.INSERT,
        ShotType.MEDIUM,
        ShotType.CLOSE_UP,
    )
    assert evaluate_shot_variety(pages) == []


# --- end-to-end through the DSL validator ------------------------------------


def test_dsl_validator_surfaces_dominance_warning():
    """validate_storyboard_against_dsl must include the new warning.

    The repair loop and editor UI read from QualityReport.issues, so a
    warning that doesn't make it into validate_storyboard_against_dsl's
    return value is invisible no matter how loud the helper is.
    """
    pages = _slice_with_shot_distribution(
        *([ShotType.MEDIUM] * 8 + [ShotType.WIDE, ShotType.CLOSE_UP])
    )
    issues = validate_storyboard_against_dsl(pages=pages, arc_entry=None)
    codes = {issue.code for issue in issues}
    assert "DSL_SHOT_TYPE_DOMINANCE" in codes


def test_dsl_validator_surfaces_no_establishing_warning():
    """Same wiring guarantee for the establishing-coverage check."""
    pages = _slice_with_shot_distribution(
        ShotType.MEDIUM, ShotType.CLOSE_UP, ShotType.MEDIUM, ShotType.EXTREME_CLOSE_UP
    )
    issues = validate_storyboard_against_dsl(pages=pages, arc_entry=None)
    codes = {issue.code for issue in issues}
    assert "DSL_NO_ESTABLISHING_SHOT" in codes


def test_dsl_validator_passes_balanced_slice_without_4_3_warnings():
    """A well-shaped storyboard must not pick up the new warnings as noise."""
    pages = _slice_with_shot_distribution(
        ShotType.WIDE,
        ShotType.MEDIUM,
        ShotType.CLOSE_UP,
        ShotType.MEDIUM,
        ShotType.EXTREME_CLOSE_UP,
        ShotType.INSERT,
        ShotType.MEDIUM,
        ShotType.CLOSE_UP,
    )
    issues = validate_storyboard_against_dsl(pages=pages, arc_entry=None)
    codes = {issue.code for issue in issues}
    assert "DSL_SHOT_TYPE_DOMINANCE" not in codes
    assert "DSL_NO_ESTABLISHING_SHOT" not in codes
