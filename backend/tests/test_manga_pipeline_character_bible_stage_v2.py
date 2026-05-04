"""Tests for the v2 LLM-backed character/world bible stage."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import (
    AdaptationPlan,
    ContinuityLedger,
    FactImportance,
    ProtagonistContract,
    SourceFact,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
)
from app.manga_pipeline import PipelineContext
from app.manga_pipeline.stages import character_world_bible_stage


class FakeLLMClient:
    provider = "fake"
    model = "fake-character-designer"

    def __init__(self, parsed: dict[str, Any]) -> None:
        self.parsed = parsed
        self.calls: list[dict[str, Any]] = []

    async def chat(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {
            "content": "{}",
            "parsed": self.parsed,
            "input_tokens": 444,
            "output_tokens": 222,
            "estimated_cost_usd": 0.0066,
        }


def _source_slice() -> SourceSlice:
    return SourceSlice(
        slice_id="slice_001",
        book_id="book_123",
        mode=SourceSliceMode.PAGES,
        source_range=SourceRange(page_start=1, page_end=10),
    )


def _fact() -> SourceFact:
    return SourceFact(
        fact_id="f001",
        text="Scale changes solution tradeoffs.",
        source_slice_id="slice_001",
        importance=FactImportance.THESIS,
    )


def _plan() -> AdaptationPlan:
    return AdaptationPlan(
        title="Scale Trial",
        logline="Kai enters a labyrinth where simple answers break at scale.",
        central_thesis="Scale changes what solutions are viable.",
        protagonist_contract=ProtagonistContract(
            who="Kai",
            wants="understand the source",
            why_cannot_have_it="the source is dense",
            what_they_do="turns facts into visual trials",
        ),
        important_fact_ids=["f001"],
    )


def _context(llm_client: FakeLLMClient | None = None) -> PipelineContext:
    context = PipelineContext(
        book_id="book_123",
        project_id="project_123",
        source_slice=_source_slice(),
        prior_continuity=ContinuityLedger(project_id="project_123"),
        llm_client=llm_client,
        fact_registry=[_fact()],
    )
    context.adaptation_plan = _plan()
    return context


def _valid_bible() -> dict[str, Any]:
    return {
        "world_summary": "A shifting archive where doors grow with the scale of each idea.",
        "visual_style": "High-contrast black ink, clean screentones, luminous blue thesis symbols.",
        "recurring_motifs": ["growing doors", "bending keys", "scale grids"],
        "characters": [
            {
                "character_id": "kai",
                "name": "Kai",
                "role": "protagonist",
                "represents": "the curious reader",
                "personality": "restless, observant, stubbornly hopeful",
                "strengths": ["pattern recognition"],
                "flaws": ["rushes to simple answers"],
                "visual_lock": "short angular hair, oversized scarf shaped like a bookmark",
                "silhouette_notes": "small figure with a long trailing scarf and square satchel",
                "outfit_notes": "dark jacket with white page-edge seams",
                "hair_or_face_notes": "sharp eyebrows, bright eyes, ink-smudge cheek mark",
                "speech_style": "short curious questions that become confident declarations",
            }
        ],
        "palette_notes": "black, white, Walmart blue highlights, sparse spark accents",
    }


def test_character_bible_stage_calls_llm_and_records_trace():
    client = FakeLLMClient(_valid_bible())
    context = _context(client)

    result = asyncio.run(character_world_bible_stage.run(context))

    assert result.character_bible is not None
    assert result.character_bible.characters[0].character_id == "kai"
    assert len(result.llm_traces) == 1
    assert result.llm_traces[0].stage_name.value == "character_world_bible"
    assert len(client.calls) == 1
    assert "adaptation_plan" in client.calls[0]["user_message"]
    assert "JSON_SCHEMA" in client.calls[0]["user_message"]


def test_character_bible_stage_requires_adaptation_plan():
    context = _context(FakeLLMClient(_valid_bible()))
    context.adaptation_plan = None

    with pytest.raises(ValueError, match="adaptation_plan"):
        asyncio.run(character_world_bible_stage.run(context))


def test_character_bible_stage_requires_source_facts():
    context = _context(FakeLLMClient(_valid_bible()))
    context.fact_registry = []

    with pytest.raises(ValueError, match="source facts"):
        asyncio.run(character_world_bible_stage.run(context))


def test_character_bible_stage_rejects_empty_characters():
    invalid = _valid_bible()
    invalid["characters"] = []
    context = _context(FakeLLMClient(invalid))
    context.options["llm_validation_attempts"] = 1

    with pytest.raises(Exception, match="character_world_bible"):
        asyncio.run(character_world_bible_stage.run(context))
