"""Tests for the v2 LLM-backed storyboard stage."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import (
    AdaptationPlan,
    Beat,
    BeatSheet,
    CharacterDesign,
    CharacterWorldBible,
    ContinuityLedger,
    FactImportance,
    MangaScript,
    MangaScriptScene,
    ProtagonistContract,
    ScriptLine,
    SourceFact,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
)
from app.manga_pipeline import PipelineContext
from app.manga_pipeline.stages import storyboard_stage


class FakeLLMClient:
    provider = "fake"
    model = "fake-storyboard-artist"

    def __init__(self, parsed: dict[str, Any]) -> None:
        self.parsed = parsed
        self.calls: list[dict[str, Any]] = []

    async def chat(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {
            "content": "{}",
            "parsed": self.parsed,
            "input_tokens": 888,
            "output_tokens": 555,
            "estimated_cost_usd": 0.0099,
        }


def _context(llm_client: FakeLLMClient | None = None) -> PipelineContext:
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
                visual_lock="short angular hair and bookmark scarf",
            )
        ],
    )
    context.beat_sheet = BeatSheet(
        slice_id="slice_001",
        slice_role="opening",
        beats=[Beat(beat_id="b001", source_fact_ids=["f001"], story_function="Reveal scale.")],
    )
    context.manga_script = MangaScript(
        slice_id="slice_001",
        to_be_continued=True,
        scenes=[
            MangaScriptScene(
                scene_id="s001",
                beat_ids=["b001"],
                location="Archive",
                scene_goal="Reveal scale.",
                action="Kai tries one key on growing doors.",
                dialogue=[
                    ScriptLine(
                        speaker_id="kai",
                        text="The same key stops working.",
                        source_fact_ids=["f001"],
                    )
                ],
            )
        ],
    )
    return context


def _valid_storyboard() -> dict[str, Any]:
    return {
        "slice_id": "slice_001",
        "thumbnail_notes": "Open with a clear visual metaphor, end on a page-turn hook.",
        "pages": [
            {
                "page_id": "pg001",
                "page_index": 0,
                "page_turn_hook": "The next door grows larger.",
                "reading_flow": "top-right to bottom-left",
                "panels": [
                    {
                        "panel_id": "p001",
                        "scene_id": "s001",
                        "purpose": "reveal",
                        "shot_type": "wide",
                        "composition": "Kai stands before doors that grow from small to enormous.",
                        "action": "The key fits the first door but bends at the second.",
                        "dialogue": [
                            {
                                "speaker_id": "kai",
                                "text": "The same key stops working.",
                                "source_fact_ids": ["f001"],
                            }
                        ],
                        "source_fact_ids": ["f001"],
                        "character_ids": ["kai"],
                    },
                    {
                        "panel_id": "p_tbc",
                        "scene_id": "s001",
                        "purpose": "to_be_continued",
                        "shot_type": "symbolic",
                        "composition": "A giant locked door fills the final panel.",
                        "narration": "The next scale awaits.",
                    },
                ],
            }
        ],
    }


def test_storyboard_stage_calls_llm_and_records_trace():
    client = FakeLLMClient(_valid_storyboard())
    context = _context(client)

    result = asyncio.run(storyboard_stage.run(context))

    assert len(result.storyboard_pages) == 1
    assert result.storyboard_pages[0].panels[0].source_fact_ids == ["f001"]
    assert len(result.llm_traces) == 1
    assert result.llm_traces[0].stage_name.value == "storyboard"
    assert "manga_script" in client.calls[0]["user_message"]
    assert "JSON_SCHEMA" in client.calls[0]["user_message"]


def test_storyboard_stage_requires_script():
    context = _context(FakeLLMClient(_valid_storyboard()))
    context.manga_script = None

    with pytest.raises(ValueError, match="manga_script"):
        asyncio.run(storyboard_stage.run(context))


def test_storyboard_stage_rejects_non_contiguous_pages():
    invalid = _valid_storyboard()
    invalid["pages"][0]["page_index"] = 2
    context = _context(FakeLLMClient(invalid))
    context.options["llm_validation_attempts"] = 1

    with pytest.raises(Exception, match="storyboard"):
        asyncio.run(storyboard_stage.run(context))
