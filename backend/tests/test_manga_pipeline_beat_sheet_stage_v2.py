"""Tests for the v2 LLM-backed beat sheet stage."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import (
    AdaptationPlan,
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
from app.manga_pipeline.stages import beat_sheet_stage


class FakeLLMClient:
    provider = "fake"
    model = "fake-story-editor"

    def __init__(self, parsed: dict[str, Any]) -> None:
        self.parsed = parsed
        self.calls: list[dict[str, Any]] = []

    async def chat(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {
            "content": "{}",
            "parsed": self.parsed,
            "input_tokens": 555,
            "output_tokens": 333,
            "estimated_cost_usd": 0.0077,
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
        visual_style="Black ink, clean screentones, blue thesis symbols.",
        characters=[
            CharacterDesign(
                character_id="kai",
                name="Kai",
                role="protagonist",
                visual_lock="short angular hair and bookmark scarf",
            )
        ],
    )
    return context


def _valid_beat_sheet() -> dict[str, Any]:
    return {
        "slice_id": "slice_001",
        "slice_role": "opening",
        "local_opening_hook": "Kai finds a key that only works on small doors.",
        "local_closing_hook": "The next door grows beyond the key's shape.",
        "beats": [
            {
                "beat_id": "b001",
                "source_fact_ids": ["f001"],
                "story_function": "Reveal that scale changes the rules of the problem.",
                "emotional_turn": "curiosity becomes unease",
                "intellectual_turn": "simple answer becomes systems thinking",
                "open_thread_id": "t001",
            }
        ],
    }


def test_beat_sheet_stage_calls_llm_and_records_trace():
    client = FakeLLMClient(_valid_beat_sheet())
    context = _context(client)

    result = asyncio.run(beat_sheet_stage.run(context))

    assert result.beat_sheet is not None
    assert result.beat_sheet.beats[0].source_fact_ids == ["f001"]
    assert len(result.llm_traces) == 1
    assert result.llm_traces[0].stage_name.value == "beat_sheet"
    assert "character_world_bible" in client.calls[0]["user_message"]
    assert "JSON_SCHEMA" in client.calls[0]["user_message"]


def test_beat_sheet_stage_requires_adaptation_plan():
    context = _context(FakeLLMClient(_valid_beat_sheet()))
    context.adaptation_plan = None

    with pytest.raises(ValueError, match="adaptation_plan"):
        asyncio.run(beat_sheet_stage.run(context))


def test_beat_sheet_stage_requires_character_bible():
    context = _context(FakeLLMClient(_valid_beat_sheet()))
    context.character_bible = None

    with pytest.raises(ValueError, match="character_bible"):
        asyncio.run(beat_sheet_stage.run(context))


def test_beat_sheet_stage_rejects_empty_beats():
    invalid = _valid_beat_sheet()
    invalid["beats"] = []
    context = _context(FakeLLMClient(invalid))
    context.options["llm_validation_attempts"] = 1

    with pytest.raises(Exception, match="beat_sheet"):
        asyncio.run(beat_sheet_stage.run(context))
