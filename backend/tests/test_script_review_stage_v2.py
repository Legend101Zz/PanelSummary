"""Tests for the v2 script_review_stage (Phase A1)."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    AdaptationPlan,
    ArcRole,
    ArcSliceEntry,
    Beat,
    BeatSheet,
    CharacterDesign,
    CharacterWorldBible,
    ContinuityLedger,
    EmotionalTone,
    FactImportance,
    MangaScript,
    MangaScriptScene,
    ProtagonistContract,
    ScriptLine,
    SourceFact,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
    SliceRole,
)
from app.manga_pipeline import PipelineContext
from app.manga_pipeline.stages import script_review_stage


class FakeLLMClient:
    provider = "fake"
    model = "fake-editor"

    def __init__(self, parsed: dict[str, Any]) -> None:
        self.parsed = parsed
        self.calls: list[dict[str, Any]] = []

    async def chat(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {
            "content": "{}",
            "parsed": self.parsed,
            "input_tokens": 600,
            "output_tokens": 300,
            "estimated_cost_usd": 0.005,
        }


def _context(
    *,
    llm_client: FakeLLMClient,
    extra_dialogue: list[ScriptLine] | None = None,
) -> PipelineContext:
    dialogue = [
        # Phase 2.4: dialogue lines must cite at least one of the beat's
        # source_fact_ids or the new grounding validator (correctly) flags
        # the scene as ungrounded. The fixture's beat below references
        # f001 so we cite f001 here.
        ScriptLine(
            speaker_id="kai",
            text="The same key stops working.",
            source_fact_ids=["f001"],
        )
    ]
    if extra_dialogue:
        dialogue.extend(extra_dialogue)
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
            last_page_hook="Kai notices the key has cracked.",
        ),
        llm_client=llm_client,
        fact_registry=[
            SourceFact(
                fact_id="f001",
                text="Scale changes solution tradeoffs.",
                source_slice_id="slice_001",
                importance=FactImportance.THESIS,
            )
        ],
    )
    context.adaptation_plan = AdaptationPlan(
        title="Scale Trial",
        logline="Kai learns why simple answers break at scale.",
        central_thesis="Scale changes what solutions are viable.",
        protagonist_contract=ProtagonistContract(
            who="Kai",
            wants="understand the source",
            why_cannot_have_it="the source is dense",
            what_they_do="turns facts into trials",
        ),
        important_fact_ids=["f001"],
    )
    context.character_bible = CharacterWorldBible(
        world_summary="A shifting archive of growing doors.",
        visual_style="Black ink and clean screentones.",
        characters=[
            CharacterDesign(
                character_id="kai",
                name="Kai",
                role="protagonist",
                visual_lock="bookmark scarf, angular hair",
                speech_style="short curious questions",
            )
        ],
    )
    context.beat_sheet = BeatSheet(
        slice_id="slice_001",
        slice_role="opening",
        beats=[
            Beat(
                beat_id="b001",
                source_fact_ids=["f001"],
                story_function="Reveal that scale changes the rules.",
            )
        ],
    )
    context.manga_script = MangaScript(
        slice_id="slice_001",
        scenes=[
            MangaScriptScene(
                scene_id="s001",
                beat_ids=["b001"],
                location="The Scale Archive",
                scene_goal="Reveal the central thesis visually.",
                action="Kai tries the same key on doors that keep growing.",
                dialogue=dialogue,
                emotional_tone=EmotionalTone.REVELATORY,
            )
        ],
    )
    context.arc_entry = ArcSliceEntry(
        slice_number=1,
        role=ArcRole.KI,
        suggested_slice_role=SliceRole.OPENING,
        source_range=SourceRange(page_start=1, page_end=10),
        headline_beat="Kai realises one key cannot fit them all.",
        must_cover_fact_ids=["f001"],
        closing_hook="The next door dwarfs the rest.",
    )
    return context


def _passing_review() -> dict[str, Any]:
    return {
        "slice_id": "slice_001",
        "passed": True,
        "issues": [],
        "voice_summary": "Kai sounds like the bible.",
        "tension_summary": "Slice opens cleanly on the central question.",
    }


def _failing_review_with_voice_drift() -> dict[str, Any]:
    return {
        "slice_id": "slice_001",
        "passed": False,
        "issues": [
            {
                "severity": "error",
                "code": "SCRIPT_VOICE_DRIFT",
                "message": "Kai's line reads like an exposition narrator.",
                "scene_id": "s001",
                "line_index": 0,
                "speaker_id": "kai",
                "suggestion": "Rewrite as a one-sentence question.",
            }
        ],
        "voice_summary": "Kai is off-bible in scene s001.",
        "tension_summary": "Tension is fine.",
    }


def test_script_review_stage_records_passed_review_and_trace():
    client = FakeLLMClient(_passing_review())
    context = _context(llm_client=client)

    result = asyncio.run(script_review_stage.run(context))

    assert result.script_review is not None
    assert result.script_review.passed is True
    assert result.script_review.issues == []
    assert result.llm_traces[0].stage_name.value == "script_review"
    # The editor sees the prior closing hook so it can flag dropped hooks.
    assert "cracked" in client.calls[0]["user_message"]


def test_script_review_stage_merges_heuristic_issues():
    # Add a clearly-too-long line so the heuristic produces an extra issue
    # the LLM editor's report did not contain. The merged report MUST
    # include both.
    client = FakeLLMClient(_failing_review_with_voice_drift())
    context = _context(
        llm_client=client,
        extra_dialogue=[ScriptLine(speaker_id="kai", text="x" * 161)],
    )

    result = asyncio.run(script_review_stage.run(context))

    codes = {issue.code for issue in result.script_review.issues}
    assert "SCRIPT_VOICE_DRIFT" in codes
    assert "SCRIPT_LINE_TOO_LONG" in codes
    assert result.script_review.passed is False


def test_script_review_stage_dedupes_overlapping_issues():
    # The LLM and the heuristic both flag the same SCRIPT_LINE_TOO_LONG;
    # the report should not double-count.
    long_line = ScriptLine(speaker_id="kai", text="x" * 161)
    parsed = {
        "slice_id": "slice_001",
        "passed": False,
        "issues": [
            {
                "severity": "error",
                "code": "SCRIPT_LINE_TOO_LONG",
                "message": "duplicate",
                "scene_id": "s001",
                "line_index": 1,
                "speaker_id": "kai",
            }
        ],
    }
    client = FakeLLMClient(parsed)
    context = _context(llm_client=client, extra_dialogue=[long_line])

    result = asyncio.run(script_review_stage.run(context))

    too_long = [i for i in result.script_review.issues if i.code == "SCRIPT_LINE_TOO_LONG"]
    assert len(too_long) == 1


def test_script_review_recomputes_passed_from_issues():
    # The model lies and says passed=true while shipping an error issue.
    # The model_validator on ScriptReviewReport must recompute.
    parsed = {
        "slice_id": "slice_001",
        "passed": True,  # liar
        "issues": [
            {
                "severity": "error",
                "code": "SCRIPT_VOICE_DRIFT",
                "message": "off-voice",
                "scene_id": "s001",
                "line_index": 0,
                "speaker_id": "kai",
            }
        ],
    }
    client = FakeLLMClient(parsed)
    context = _context(llm_client=client)

    result = asyncio.run(script_review_stage.run(context))

    assert result.script_review.passed is False
