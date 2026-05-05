"""Tests for deterministic revamp pipeline stages."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import (
    AdaptationPlan,
    ContinuityLedger,
    MangaScript,
    MangaScriptScene,
    PanelPurpose,
    ProtagonistContract,
    ScriptLine,
    ShotType,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
    StoryboardPage,
    StoryboardPanel,
)
from app.manga_pipeline import PipelineContext
from app.manga_pipeline.stages import quality_gate_stage


def _context() -> PipelineContext:
    source_slice = SourceSlice(
        slice_id="slice_001",
        book_id="book_123",
        mode=SourceSliceMode.PAGES,
        source_range=SourceRange(page_start=1, page_end=10),
    )
    return PipelineContext(
        book_id="book_123",
        project_id="project_123",
        source_slice=source_slice,
        prior_continuity=ContinuityLedger(project_id="project_123"),
        options={"source_has_more": True, "slice_role": "opening"},
    )


def _script() -> MangaScript:
    return MangaScript(
        slice_id="slice_001",
        scenes=[
            MangaScriptScene(
                scene_id="s001",
                beat_ids=["b001"],
                location="Archive",
                scene_goal="Reveal the fact.",
                action="Kai studies the lock.",
                dialogue=[ScriptLine(speaker_id="kai", text="The key fails at scale.", source_fact_ids=["f001"])],
            )
        ],
        to_be_continued=True,
    )


def _storyboard(include_tbc: bool = True) -> list[StoryboardPage]:
    panels = [
        StoryboardPanel(
            panel_id="p001",
            scene_id="s001",
            purpose=PanelPurpose.REVEAL,
            shot_type=ShotType.CLOSE_UP,
            composition="Kai sees the lock expand.",
            action="The key bends.",
            source_fact_ids=["f001"],
            character_ids=["kai"],
        )
    ]
    if include_tbc:
        panels.append(
            StoryboardPanel(
                panel_id="p_tbc",
                scene_id="s_tbc",
                purpose=PanelPurpose.TO_BE_CONTINUED,
                shot_type=ShotType.SYMBOLIC,
                composition="A glowing second door.",
                narration="The next chamber waits.",
            )
        )
    return [StoryboardPage(page_id="pg001", page_index=0, panels=panels)]


def _plan() -> AdaptationPlan:
    return AdaptationPlan(
        title="Scale Archive",
        logline="Kai discovers why simple answers break.",
        central_thesis="Scale changes solution tradeoffs.",
        protagonist_contract=ProtagonistContract(
            who="Kai",
            wants="understand the PDF",
            why_cannot_have_it="the ideas are spread out",
            what_they_do="turns facts into visual trials",
        ),
        important_fact_ids=["f001"],
    )


def test_quality_gate_stage_sets_report():
    context = _context()
    context.adaptation_plan = _plan()
    context.manga_script = _script()
    context.storyboard_pages = _storyboard(include_tbc=True)

    result = asyncio.run(quality_gate_stage.run(context))

    assert result.quality_report is not None
    assert result.quality_report.passed is True


def test_quality_gate_stage_fails_without_script():
    context = _context()
    context.storyboard_pages = _storyboard()

    with pytest.raises(ValueError, match="manga_script"):
        asyncio.run(quality_gate_stage.run(context))
