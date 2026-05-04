"""Tests for manga quality gate service."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    MangaScript,
    MangaScriptScene,
    PanelPurpose,
    ScriptLine,
    ShotType,
    StoryboardPage,
    StoryboardPanel,
)
from app.services.manga import collect_storyboard_fact_ids, run_quality_gate


def _script(line_text: str = "The small answer breaks at large scale.") -> MangaScript:
    return MangaScript(
        slice_id="slice_001",
        scenes=[
            MangaScriptScene(
                scene_id="s001",
                beat_ids=["b001"],
                location="Archive",
                scene_goal="Reveal the fact.",
                action="Kai compares two locks.",
                dialogue=[ScriptLine(speaker_id="kai", text=line_text, source_fact_ids=["f001"])],
            )
        ],
    )


def _page(*, fact_ids=None, purpose=PanelPurpose.REVEAL) -> StoryboardPage:
    return StoryboardPage(
        page_id="pg001",
        page_index=0,
        panels=[
            StoryboardPanel(
                panel_id="p001",
                scene_id="s001",
                purpose=purpose,
                shot_type=ShotType.CLOSE_UP,
                composition="Close-up on an expanding lock.",
                action="The lock outgrows the key.",
                source_fact_ids=fact_ids or ["f001"],
            )
        ],
    )


def test_collect_storyboard_fact_ids_includes_panel_and_dialogue_facts():
    page = StoryboardPage(
        page_id="pg001",
        page_index=0,
        panels=[
            StoryboardPanel(
                panel_id="p001",
                scene_id="s001",
                purpose=PanelPurpose.REVEAL,
                shot_type=ShotType.CLOSE_UP,
                composition="Kai sees the clue.",
                action="A note glows.",
                source_fact_ids=["f001"],
                dialogue=[ScriptLine(speaker_id="kai", text="This explains it.", source_fact_ids=["f002"])],
            )
        ],
    )

    assert collect_storyboard_fact_ids([page]) == {"f001", "f002"}


def test_quality_gate_passes_when_required_facts_are_grounded():
    report = run_quality_gate(
        required_fact_ids=["f001"],
        script=_script(),
        storyboard_pages=[_page()],
        should_have_to_be_continued=False,
    )

    assert report.passed is True
    assert report.missing_fact_ids == []


def test_quality_gate_fails_missing_required_fact():
    report = run_quality_gate(
        required_fact_ids=["f001", "f999"],
        script=_script(),
        storyboard_pages=[_page()],
        should_have_to_be_continued=False,
    )

    assert report.passed is False
    assert report.missing_fact_ids == ["f999"]
    assert report.issues[0].code == "missing_required_fact"


def test_quality_gate_requires_to_be_continued_for_partial_generation():
    report = run_quality_gate(
        required_fact_ids=["f001"],
        script=_script(),
        storyboard_pages=[_page()],
        should_have_to_be_continued=True,
    )

    assert report.passed is False
    assert any(issue.code == "missing_to_be_continued" for issue in report.issues)


def test_quality_gate_accepts_to_be_continued_when_needed():
    report = run_quality_gate(
        required_fact_ids=[],
        script=_script(),
        storyboard_pages=[_page(fact_ids=[], purpose=PanelPurpose.TO_BE_CONTINUED)],
        should_have_to_be_continued=True,
    )

    assert report.passed is True


def test_quality_gate_warns_on_unexpected_to_be_continued():
    report = run_quality_gate(
        required_fact_ids=[],
        script=_script(),
        storyboard_pages=[_page(fact_ids=[], purpose=PanelPurpose.TO_BE_CONTINUED)],
        should_have_to_be_continued=False,
    )

    assert report.passed is True
    assert any(issue.code == "unexpected_to_be_continued" for issue in report.issues)
