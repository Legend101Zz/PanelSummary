"""Tests for the v2 script_repair_stage (Phase A1b)."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    AdaptationPlan,
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
    ScriptIssue,
    ScriptLine,
    ScriptReviewReport,
    SourceFact,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
)
from app.manga_pipeline import PipelineContext
from app.manga_pipeline.stages import script_repair_stage


class FakeLLMClient:
    provider = "fake"
    model = "fake-rewriter"

    def __init__(self, parsed: dict[str, Any]) -> None:
        self.parsed = parsed
        self.calls: list[dict[str, Any]] = []

    async def chat(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {
            "content": "{}",
            "parsed": self.parsed,
            "input_tokens": 800,
            "output_tokens": 500,
            "estimated_cost_usd": 0.012,
        }


def _context(*, llm_client: FakeLLMClient | None = None) -> PipelineContext:
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
            last_page_hook="The key cracked.",
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
        visual_style="Blacink and clean screentones.",
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
                dialogue=[ScriptLine(speaker_id="kai", text="we have to do something")],
                emotional_tone=EmotionalTone.REVELATORY,
            )
        ],
    )
    return context


def _rewritten_script() -> dict[str, Any]:
    return {
        "slice_id": "slice_001",
        "to_be_continued": False,
        "scenes": [
            {
                "scene_id": "s001",
                "beat_ids": ["b001"],
                "location": "The Scale Archive",
                "scene_goal": "Reveal the central thesis visually.",
                "action": "Kai tests the same key on a door that keeps growing.",
                "dialogue": [
                    {
                        "speaker_id": "kai",
                        "text": "Why does the same key stop fitting?",
                        "intent": "questioning",
                        "source_fact_ids": ["f001"],
                    }
                ],
                "narration": ["A small answer can fail when the world gets larger."],
                "emotional_tone": "revelatory",
            }
        ],
    }


def test_repair_noops_when_review_is_none():
    context = _context(llm_client=FakeLLMClient(_rewritten_script()))
    context.script_review = None

    result = asyncio.run(script_repair_stage.run(context))

    assert result.manga_script.scenes[0].dialogue[0].text == "we have to do something"


def test_repair_noops_when_review_passed():
    context = _context(llm_client=FakeLLMClient(_rewritten_script()))
    context.script_review = ScriptReviewReport(slice_id="slice_001", passed=True, issues=[])

    result = asyncio.run(script_repair_stage.run(context))

    # Nothing rewritten and no LLM call.
    assert result.manga_script.scenes[0].dialogue[0].text == "we have to do something"
    # The fake client tracks calls; verify none were made.
    assert context.llm_client.calls == []


def test_repair_rewrites_script_and_clears_review():
    client = FakeLLMClient(_rewritten_script())
    context = _context(llm_client=client)
    context.script_review = ScriptReviewReport(
        slice_id="slice_001",
        passed=False,
        issues=[
            ScriptIssue(
                severity="error",
                code="SCRIPT_VOICE_DRIFT",
                message="Off-bible.",
                scene_id="s001",
                line_index=0,
                speaker_id="kai",
            )
        ],
    )

    result = asyncio.run(script_repair_stage.run(context))

    assert result.manga_script.scenes[0].dialogue[0].text.startswith("Why does the same key")
    # The pre-repair review must be cleared so a re-run reflects the fresh
    # script's defects, not the ones we just fixed.
    assert result.script_review is None
    assert result.llm_traces[0].stage_name.value == "script_repair"
