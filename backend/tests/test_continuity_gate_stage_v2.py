"""Tests for the v2 continuity_gate_stage (Phase A3)."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    AdaptationPlan,
    ArcRole,
    ArcSliceEntry,
    CharacterDesign,
    CharacterWorldBible,
    ContinuityLedger,
    PanelPurpose,
    ProtagonistContract,
    ShotType,
    SliceRole,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
    StoryboardPage,
    StoryboardPanel,
)
from app.manga_pipeline import PipelineContext
from app.manga_pipeline.stages import continuity_gate_stage


def _arc(
    *,
    role: ArcRole = ArcRole.KI,
    must_cover: list[str] | None = None,
    closing_hook: str = "The next door dwarfs the rest.",
) -> ArcSliceEntry:
    return ArcSliceEntry(
        slice_number=1,
        role=role,
        suggested_slice_role=SliceRole.OPENING,
        source_range=SourceRange(page_start=1, page_end=10),
        headline_beat="Kai realises one key cannot fit them all.",
        must_cover_fact_ids=must_cover or ["f001"],
        closing_hook=closing_hook,
    )


def _bible() -> CharacterWorldBible:
    return CharacterWorldBible(
        world_summary="A shifting archive.",
        visual_style="Black ink and screentones.",
        characters=[
            CharacterDesign(
                character_id="kai",
                name="Kai",
                role="protagonist",
                visual_lock="bookmark scarf",
            )
        ],
    )


def _plan() -> AdaptationPlan:
    return AdaptationPlan(
        title="Scale Trial",
        logline="Kai learns scale.",
        central_thesis="Scale changes solutions.",
        protagonist_contract=ProtagonistContract(
            who="Kai",
            wants="understand scale",
            why_cannot_have_it="answers shrink",
            what_they_do="he tests doors",
        ),
        important_fact_ids=["f001"],
    )


def _page(
    *,
    page_id: str = "pg001",
    page_index: int = 0,
    panels: list[StoryboardPanel] | None = None,
    page_turn_hook: str = "",
) -> StoryboardPage:
    return StoryboardPage(
        page_id=page_id,
        page_index=page_index,
        panels=panels
        or [
            StoryboardPanel(
                panel_id="p001",
                scene_id="s001",
                purpose=PanelPurpose.REVEAL,
                shot_type=ShotType.WIDE,
                composition="Kai before a growing door.",
                action="Kai presses the key.",
                source_fact_ids=["f001"],
                character_ids=["kai"],
            )
        ],
        page_turn_hook=page_turn_hook,
    )


def _context(
    *,
    pages: list[StoryboardPage],
    arc: ArcSliceEntry | None,
    prior_hook: str = "",
) -> PipelineContext:
    context = PipelineContext(
        book_id="book_123",
        project_id="project_123",
        source_slice=SourceSlice(
            slice_id="slice_001",
            book_id="book_123",
            mode=SourceSliceMode.PAGES,
            source_range=SourceRange(page_start=1, page_end=10),
        ),
        prior_continuity=ContinuityLedger(
            project_id="project_123",
            last_page_hook=prior_hook,
        ),
    )
    context.adaptation_plan = _plan()
    context.character_bible = _bible()
    context.storyboard_pages = pages
    context.arc_entry = arc
    return context


def test_continuity_gate_passes_clean_storyboard():
    arc = _arc(closing_hook="growing door")
    context = _context(
        pages=[_page(page_turn_hook="A growing door waits.")],
        arc=arc,
    )

    result = asyncio.run(continuity_gate_stage.run(context))

    assert result.quality_report is not None
    assert result.quality_report.passed is True


def test_arc_must_cover_missing_fact_is_error():
    arc = _arc(must_cover=["f001", "f_missing"])
    context = _context(pages=[_page()], arc=arc)

    result = asyncio.run(continuity_gate_stage.run(context))

    codes = {issue.code for issue in result.quality_report.issues}
    assert "CONTINUITY_ARC_FACT_MISSING" in codes
    assert result.quality_report.passed is False


def test_prior_hook_dropped_is_warning_only():
    arc = _arc()
    context = _context(
        pages=[_page(page_turn_hook="Something else entirely.")],
        arc=arc,
        prior_hook="Kai noticed the key has cracked.",
    )

    result = asyncio.run(continuity_gate_stage.run(context))

    issues = result.quality_report.issues
    hook_issues = [i for i in issues if i.code == "CONTINUITY_HOOK_DROPPED"]
    assert len(hook_issues) == 1
    assert hook_issues[0].severity == "warning"
    # Warnings alone do not fail the gate.
    assert result.quality_report.passed is True


def test_prior_hook_present_in_panel_action_is_accepted():
    arc = _arc()
    context = _context(
        pages=[
            _page(
                panels=[
                    StoryboardPanel(
                        panel_id="p001",
                        scene_id="s001",
                        purpose=PanelPurpose.REVEAL,
                        shot_type=ShotType.WIDE,
                        composition="Kai with the cracked key.",
                        action="Kai noticed the key has cracked across its teeth.",
                        source_fact_ids=["f001"],
                        character_ids=["kai"],
                    )
                ],
                page_turn_hook="growing door",
            )
        ],
        arc=arc,
        prior_hook="Kai noticed the key has cracked",
    )

    result = asyncio.run(continuity_gate_stage.run(context))

    codes = {issue.code for issue in result.quality_report.issues}
    assert "CONTINUITY_HOOK_DROPPED" not in codes


def test_protagonist_offscreen_in_ki_slice_is_error():
    arc = _arc(role=ArcRole.KI)
    page = _page(
        panels=[
            StoryboardPanel(
                panel_id="p001",
                scene_id="s001",
                purpose=PanelPurpose.SETUP,
                shot_type=ShotType.WIDE,
                composition="Empty archive.",
                action="The archive is silent.",
                source_fact_ids=["f001"],
                character_ids=[],
            )
        ],
        page_turn_hook="growing door",
    )
    context = _context(pages=[page], arc=arc)

    result = asyncio.run(continuity_gate_stage.run(context))

    codes = {issue.code for issue in result.quality_report.issues}
    assert "CONTINUITY_PROTAGONIST_OFFSCREEN" in codes
    assert result.quality_report.passed is False


def test_protagonist_check_skipped_for_recap():
    arc = _arc(role=ArcRole.RECAP)
    page = _page(
        panels=[
            StoryboardPanel(
                panel_id="p001",
                scene_id="s001",
                purpose=PanelPurpose.RECAP,
                shot_type=ShotType.WIDE,
                composition="Symbolic recap montage.",
                action="Echoes of past panels.",
                source_fact_ids=["f001"],
                character_ids=[],
            )
        ],
        page_turn_hook="growing door",
    )
    context = _context(pages=[page], arc=arc)

    result = asyncio.run(continuity_gate_stage.run(context))

    codes = {issue.code for issue in result.quality_report.issues}
    assert "CONTINUITY_PROTAGONIST_OFFSCREEN" not in codes


def test_tbc_after_ketsu_is_warning():
    arc = _arc(role=ArcRole.KETSU)
    page = _page(
        panels=[
            StoryboardPanel(
                panel_id="p001",
                scene_id="s001",
                purpose=PanelPurpose.TO_BE_CONTINUED,
                shot_type=ShotType.SYMBOLIC,
                composition="A continuation card.",
                narration="To be continued.",
                source_fact_ids=["f001"],
                character_ids=["kai"],
            )
        ],
        page_turn_hook="growing door",
    )
    context = _context(pages=[page], arc=arc)

    result = asyncio.run(continuity_gate_stage.run(context))

    codes = {issue.code for issue in result.quality_report.issues}
    assert "CONTINUITY_TBC_AFTER_KETSU" in codes


def test_continuity_gate_requires_storyboard_pages():
    context = _context(pages=[], arc=_arc())
    context.storyboard_pages = []

    import pytest

    with pytest.raises(ValueError, match="storyboard_pages"):
        asyncio.run(continuity_gate_stage.run(context))


# ---------------------------------------------------------------------------
# Phase 2.5 — fact-coverage data is surfaced on the QualityReport so the QA
# panel can render "5/7 critical facts covered" without re-deriving it.
# ---------------------------------------------------------------------------


def test_continuity_gate_populates_grounded_and_missing_fact_ids():
    """A storyboard that cites f001 against an arc that requires f001 + f002
    should land grounded={f001}, missing={f002} on the report."""
    arc = _arc(must_cover=["f001", "f002"])  # storyboard only cites f001
    context = _context(pages=[_page()], arc=arc)

    result = asyncio.run(continuity_gate_stage.run(context))

    assert result.quality_report is not None
    assert set(result.quality_report.grounded_fact_ids) == {"f001"}
    assert set(result.quality_report.missing_fact_ids) == {"f002"}


def test_continuity_gate_grounded_set_is_empty_when_no_arc_must_cover():
    """When the arc has no must-cover list, the gate falls back to citing
    every fact the storyboard mentions — useful coverage data, no warnings."""
    arc = _arc(must_cover=["f001"])  # only f001 required, storyboard cites f001
    context = _context(pages=[_page()], arc=arc)

    result = asyncio.run(continuity_gate_stage.run(context))

    assert result.quality_report is not None
    assert result.quality_report.missing_fact_ids == []
    assert "f001" in result.quality_report.grounded_fact_ids
