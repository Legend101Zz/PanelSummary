"""Tests for the v2 book-level understanding pipeline stages.

Each stage is exercised in isolation with a FakeLLMClient that returns a
hand-written valid artifact. We assert: the LLM was called exactly once with
the expected JSON-schema contract, the artifact lands on the context, and a
trace was recorded.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import (
    AdaptationPlan,
    BookSynopsis,
    CharacterDesign,
    CharacterWorldBible,
    FactImportance,
    ProtagonistContract,
    SourceFact,
    SourceRange,
)
from app.manga_pipeline import BookUnderstandingContext
from app.manga_pipeline.stages.book import (
    arc_outline_stage,
    book_fact_registry_stage,
    global_adaptation_plan_stage,
    global_character_world_bible_stage,
    whole_book_synopsis_stage,
)


class FakeLLMClient:
    """Single-use stub that returns a parsed artifact and records the call."""

    provider = "fake"
    model = "fake-model"

    def __init__(self, parsed: dict[str, Any]) -> None:
        self.parsed = parsed
        self.calls: list[dict[str, Any]] = []

    async def chat(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {
            "content": "{}",
            "parsed": self.parsed,
            "input_tokens": 100,
            "output_tokens": 200,
            "estimated_cost_usd": 0.001,
        }


def _canonical_chapters() -> list[dict[str, Any]]:
    return [
        {
            "index": 0,
            "title": "Why scale matters",
            "page_start": 1,
            "page_end": 10,
            "content": "Small systems behave nothing like large ones.",
        },
        {
            "index": 1,
            "title": "Tradeoffs",
            "page_start": 11,
            "page_end": 25,
            "content": "Every architectural choice trades one cost for another.",
        },
    ]


def _context(client: FakeLLMClient | None = None, **overrides: Any) -> BookUnderstandingContext:
    base = dict(
        book_id="book_123",
        project_id="project_123",
        book_title="Scale Trial",
        total_pages=25,
        canonical_chapters=_canonical_chapters(),
        options={},
        llm_client=client,
    )
    base.update(overrides)
    return BookUnderstandingContext(**base)


def _valid_synopsis_payload() -> dict[str, Any]:
    return {
        "title": "Scale Trial",
        "author_voice": "Pragmatic systems engineer",
        "intended_reader": "Developers growing a system",
        "central_thesis": "What works small fails differently large.",
        "logline": "A reader earns a systems view.",
        "structural_signal": "Three-part arc",
        "themes": ["scaling"],
        "key_concepts": ["Amdahl's law"],
        "emotional_arc": ["confidence", "doubt", "clarity"],
        "notable_evidence": ["Twitter rewrite"],
    }


def _valid_fact_registry_payload() -> dict[str, Any]:
    return {
        "slice_id": book_fact_registry_stage.GLOBAL_SLICE_ID,
        "extraction_notes": "global pass",
        "facts": [
            {
                "fact_id": "f001",
                "text": "Small systems hide failure modes that large systems expose.",
                "source_slice_id": book_fact_registry_stage.GLOBAL_SLICE_ID,
                "importance": int(FactImportance.THESIS),
                "source_refs": [{"page_start": 1, "page_end": 10}],
                "tags": ["scale"],
            },
            {
                "fact_id": "f002",
                "text": "Every architectural choice trades cost for benefit.",
                "source_slice_id": book_fact_registry_stage.GLOBAL_SLICE_ID,
                "importance": int(FactImportance.CORE),
                "source_refs": [{"page_start": 11, "page_end": 25}],
                "tags": ["tradeoffs"],
            },
        ],
    }


def _valid_adaptation_plan_payload() -> dict[str, Any]:
    return {
        "title": "Scale Trial",
        "logline": "Kai walks the labyrinth of scale and earns a systems view.",
        "central_thesis": "What works small fails differently large.",
        "protagonist_contract": {
            "who": "Kai, a developer chasing a clean answer",
            "wants": "to ship one elegant fix that scales forever",
            "why_cannot_have_it": "scale changes which constraints dominate",
            "what_they_do": "iterates through trials, each revealing a tradeoff",
        },
        "important_fact_ids": ["f001", "f002"],
        "emotional_journey": ["confidence", "doubt", "clarity"],
        "intellectual_journey": ["simple answer", "tradeoff", "systems view"],
        "memorable_metaphors": ["a key that changes shape with the door"],
    }


def _valid_bible_payload() -> dict[str, Any]:
    return {
        "world_summary": "A labyrinth where every door imposes a new constraint.",
        "visual_style": "Bold ink lines, deep screentones, sparse colour highlights",
        "recurring_motifs": ["doors", "shifting keys"],
        "characters": [
            {
                "character_id": "kai",
                "name": "Kai",
                "role": "protagonist",
                "represents": "the developer chasing a clean answer",
                "personality": "curious, stubborn",
                "strengths": ["pattern recognition"],
                "flaws": ["over-confidence"],
                "visual_lock": "Ink-haired engineer in a grey jacket",
                "silhouette_notes": "Thin frame, asymmetric jacket cut",
                "outfit_notes": "Pocketed grey field jacket, leather boots",
                "hair_or_face_notes": "Wind-blown black hair, sharp eyes",
                "speech_style": "Direct, technical, sparingly sentimental",
            }
        ],
        "palette_notes": "Cool greys, single warm accent",
        "lettering_notes": "Sparse bubbles, strong hierarchy",
    }


def _valid_arc_outline_payload() -> dict[str, Any]:
    return {
        "book_id": "book_123",
        "target_slice_count": 2,
        "structure": "ki-sho-ten-ketsu",
        "notes": "Compressed arc",
        "entries": [
            {
                "slice_number": 1,
                "role": "ki",
                "suggested_slice_role": "opening",
                "source_range": {"page_start": 1, "page_end": 10},
                "headline_beat": "Kai enters the labyrinth",
                "emotional_turn": "confident -> wary",
                "intellectual_turn": "single answer -> doubt",
                "must_cover_fact_ids": ["f001"],
                "closing_hook": "The door behind Kai locks shut.",
            },
            {
                "slice_number": 2,
                "role": "ketsu",
                "suggested_slice_role": "finale",
                "source_range": {"page_start": 11, "page_end": 25},
                "headline_beat": "Kai earns the systems view",
                "emotional_turn": "wary -> grounded",
                "intellectual_turn": "doubt -> clarity",
                "must_cover_fact_ids": ["f002"],
                "closing_hook": "",
            },
        ],
    }


# ---------------- whole_book_synopsis_stage ----------------


def test_whole_book_synopsis_stage_calls_llm_and_records_trace():
    client = FakeLLMClient(_valid_synopsis_payload())
    context = _context(client)

    result = asyncio.run(whole_book_synopsis_stage.run(context))

    assert isinstance(result.synopsis, BookSynopsis)
    assert result.synopsis.title == "Scale Trial"
    assert len(client.calls) == 1
    user_message = client.calls[0]["user_message"]
    assert "JSON_SCHEMA" in user_message
    assert "SOURCE_TEXT" in user_message
    assert len(result.llm_traces) == 1
    assert result.llm_traces[0].stage_name.value == "whole_book_synopsis"


def test_whole_book_synopsis_stage_requires_llm_client():
    context = _context(None)
    with pytest.raises(ValueError, match="llm_client"):
        asyncio.run(whole_book_synopsis_stage.run(context))


def test_whole_book_synopsis_stage_requires_chapters():
    context = _context(FakeLLMClient(_valid_synopsis_payload()), canonical_chapters=[])
    with pytest.raises(ValueError, match="canonical_chapters"):
        asyncio.run(whole_book_synopsis_stage.run(context))


# ---------------- book_fact_registry_stage ----------------


def test_book_fact_registry_stage_requires_synopsis_first():
    context = _context(FakeLLMClient(_valid_fact_registry_payload()))
    with pytest.raises(ValueError, match="synopsis"):
        asyncio.run(book_fact_registry_stage.run(context))


def test_book_fact_registry_stage_populates_registry_with_global_slice_id():
    client = FakeLLMClient(_valid_fact_registry_payload())
    context = _context(client)
    context.synopsis = BookSynopsis(**_valid_synopsis_payload())

    result = asyncio.run(book_fact_registry_stage.run(context))

    assert len(result.fact_registry) == 2
    assert all(isinstance(fact, SourceFact) for fact in result.fact_registry)
    assert all(fact.source_slice_id == "book_global" for fact in result.fact_registry)
    assert result.llm_traces[-1].stage_name.value == "book_fact_registry"


def test_book_fact_registry_stage_rejects_wrong_slice_id():
    payload = _valid_fact_registry_payload()
    payload["slice_id"] = "not_book_global"
    payload["facts"][0]["source_slice_id"] = "not_book_global"
    payload["facts"][1]["source_slice_id"] = "not_book_global"
    context = _context(FakeLLMClient(payload))
    context.synopsis = BookSynopsis(**_valid_synopsis_payload())

    with pytest.raises(ValueError, match="book_global"):
        asyncio.run(book_fact_registry_stage.run(context))


# ---------------- global_adaptation_plan_stage ----------------


def test_global_adaptation_plan_stage_requires_upstream_artifacts():
    context = _context(FakeLLMClient(_valid_adaptation_plan_payload()))
    # Missing synopsis & registry.
    with pytest.raises(ValueError, match="synopsis"):
        asyncio.run(global_adaptation_plan_stage.run(context))


def test_global_adaptation_plan_stage_produces_typed_plan():
    client = FakeLLMClient(_valid_adaptation_plan_payload())
    context = _context(client)
    context.synopsis = BookSynopsis(**_valid_synopsis_payload())
    context.fact_registry = [
        SourceFact(
            fact_id="f001",
            text="Scale changes constraints.",
            source_slice_id="book_global",
            importance=FactImportance.THESIS,
            source_refs=[SourceRange(page_start=1, page_end=10)],
        )
    ]

    result = asyncio.run(global_adaptation_plan_stage.run(context))

    assert isinstance(result.adaptation_plan, AdaptationPlan)
    assert result.adaptation_plan.protagonist_contract.who.startswith("Kai")
    assert "f001" in result.adaptation_plan.important_fact_ids


# ---------------- global_character_world_bible_stage ----------------


def test_global_character_world_bible_stage_requires_plan_and_facts():
    context = _context(FakeLLMClient(_valid_bible_payload()))
    context.synopsis = BookSynopsis(**_valid_synopsis_payload())
    with pytest.raises(ValueError, match="adaptation plan"):
        asyncio.run(global_character_world_bible_stage.run(context))


def test_global_character_world_bible_stage_produces_typed_bible():
    client = FakeLLMClient(_valid_bible_payload())
    context = _context(client)
    context.synopsis = BookSynopsis(**_valid_synopsis_payload())
    context.fact_registry = [
        SourceFact(
            fact_id="f001",
            text="Scale changes constraints.",
            source_slice_id="book_global",
            importance=FactImportance.THESIS,
        )
    ]
    context.adaptation_plan = AdaptationPlan(**_valid_adaptation_plan_payload())

    result = asyncio.run(global_character_world_bible_stage.run(context))

    assert isinstance(result.character_bible, CharacterWorldBible)
    assert len(result.character_bible.characters) == 1
    assert isinstance(result.character_bible.characters[0], CharacterDesign)
    assert result.character_bible.characters[0].name == "Kai"


# ---------------- arc_outline_stage ----------------


def test_arc_outline_stage_requires_full_upstream():
    context = _context(FakeLLMClient(_valid_arc_outline_payload()))
    with pytest.raises(ValueError, match="synopsis"):
        asyncio.run(arc_outline_stage.run(context))


def test_arc_outline_stage_produces_outline_and_validates_book_id():
    client = FakeLLMClient(_valid_arc_outline_payload())
    context = _context(client)
    context.synopsis = BookSynopsis(**_valid_synopsis_payload())
    context.fact_registry = [
        SourceFact(
            fact_id="f001",
            text="Scale changes constraints.",
            source_slice_id="book_global",
            importance=FactImportance.THESIS,
        )
    ]
    context.adaptation_plan = AdaptationPlan(**_valid_adaptation_plan_payload())
    context.character_bible = CharacterWorldBible(**_valid_bible_payload())

    result = asyncio.run(arc_outline_stage.run(context))

    assert result.arc_outline is not None
    assert result.arc_outline.target_slice_count == 2
    assert [entry.slice_number for entry in result.arc_outline.entries] == [1, 2]


def test_arc_outline_stage_rejects_mismatched_book_id():
    payload = _valid_arc_outline_payload()
    payload["book_id"] = "wrong_book"
    client = FakeLLMClient(payload)
    context = _context(client)
    context.synopsis = BookSynopsis(**_valid_synopsis_payload())
    context.fact_registry = [
        SourceFact(
            fact_id="f001",
            text="Scale changes constraints.",
            source_slice_id="book_global",
            importance=FactImportance.THESIS,
        )
    ]
    context.adaptation_plan = AdaptationPlan(**_valid_adaptation_plan_payload())
    context.character_bible = CharacterWorldBible(**_valid_bible_payload())

    with pytest.raises(ValueError, match="book_id must match"):
        asyncio.run(arc_outline_stage.run(context))
