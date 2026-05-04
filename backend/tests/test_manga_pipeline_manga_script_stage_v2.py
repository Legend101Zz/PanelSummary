"""Tests for the v2 LLM-backed manga script stage."""

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
    ProtagonistContract,
    SourceFact,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
)
from app.manga_pipeline import PipelineContext
from app.manga_pipeline.stages import manga_script_stage


class FakeLLMClient:
    provider = "fake"
    model = "fake-scriptwriter"

    def __init__(self, parsed: dict[str, Any]) -> None:
        self.parsed = parsed
        self.calls: list[dict[str, Any]] = []

    async def chat(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {
            "content": "{}",
            "parsed": self.parsed,
            "input_tokens": 777,
            "output_tokens": 444,
            "estimated_cost_usd": 0.0088,
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
        options={"source_has_more": True},
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
    return context


def _valid_script() -> dict[str, Any]:
    return {
        "slice_id": "slice_001",
        "to_be_continued": True,
        "scenes": [
            {
                "scene_id": "s001",
                "beat_ids": ["b001"],
                "location": "The Scale Archive",
                "scene_goal": "Reveal the central thesis visually.",
                "action": "Kai tries the same key on doors that keep growing.",
                "dialogue": [
                    {
                        "speaker_id": "kai",
                        "text": "The same key stops working.",
                        "intent": "realization",
                        "source_fact_ids": ["f001"],
                    }
                ],
                "narration": ["A small answer can fail when the world gets larger."],
                "emotional_tone": "revelatory",
            }
        ],
    }


def test_manga_script_stage_calls_llm_and_records_trace():
    client = FakeLLMClient(_valid_script())
    context = _context(client)

    result = asyncio.run(manga_script_stage.run(context))

    assert result.manga_script is not None
    assert result.manga_script.scenes[0].dialogue[0].text == "The same key stops working."
    assert result.manga_script.to_be_continued is True
    assert len(result.llm_traces) == 1
    assert result.llm_traces[0].stage_name.value == "manga_script"
    assert "beat_sheet" in client.calls[0]["user_message"]
    assert "JSON_SCHEMA" in client.calls[0]["user_message"]


def test_manga_script_stage_requires_beat_sheet():
    context = _context(FakeLLMClient(_valid_script()))
    context.beat_sheet = None

    with pytest.raises(ValueError, match="beat_sheet"):
        asyncio.run(manga_script_stage.run(context))


def test_manga_script_stage_rejects_wall_of_text_dialogue():
    invalid = _valid_script()
    invalid["scenes"][0]["dialogue"][0]["text"] = "x" * 181
    context = _context(FakeLLMClient(invalid))
    context.options["llm_validation_attempts"] = 1

    with pytest.raises(Exception, match="manga_script"):
        asyncio.run(manga_script_stage.run(context))
