"""Tests proving the per-slice stages honour the locked book-level artifacts.

After Phase 1, the per-slice stages are READ-THROUGH: when the project's
book-understanding bundle is loaded into the slice context, the slice stages
must NOT call the LLM for adaptation_plan, character_world_bible, or source
fact extraction. This file pins that behaviour so a later refactor cannot
silently regress us into per-slice regeneration.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    AdaptationPlan,
    CharacterWorldBible,
    ContinuityLedger,
    FactImportance,
    SliceRole,
    SourceFact,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
)
from app.manga_pipeline import PipelineContext
from app.manga_pipeline.stages import (
    adaptation_plan_stage,
    character_world_bible_stage,
    source_fact_extraction_stage,
)


class ExplodingClient:
    """LLM client whose every call fails the test loudly.

    Used to assert that a stage short-circuits BEFORE invoking the model.
    """

    provider = "explode"
    model = "explode"

    async def chat(self, **_):
        raise AssertionError("Stage was supposed to short-circuit before calling the LLM")


def _slice() -> SourceSlice:
    return SourceSlice(
        slice_id="slice_1",
        book_id="book_123",
        slice_number=1,
        mode=SourceSliceMode.PAGES,
        role=SliceRole.OPENING,
        source_range=SourceRange(page_start=1, page_end=10),
    )


def _adaptation_plan() -> AdaptationPlan:
    return AdaptationPlan(
        title="Scale Trial",
        logline="Kai earns a systems view.",
        central_thesis="Scaling changes which constraints dominate.",
        protagonist_contract={
            "who": "Kai, a developer",
            "wants": "to ship one elegant fix",
            "why_cannot_have_it": "scale shifts constraints",
            "what_they_do": "iterates through tradeoff trials",
        },
        important_fact_ids=["f001"],
        emotional_journey=["confidence", "doubt", "clarity"],
        intellectual_journey=["simple", "tradeoff", "system"],
    )


def _bible() -> CharacterWorldBible:
    return CharacterWorldBible(
        world_summary="A labyrinth where every door changes the rules.",
        visual_style="Bold ink lines, deep screentones",
        recurring_motifs=["doors"],
        characters=[
            {
                "character_id": "kai",
                "name": "Kai",
                "role": "protagonist",
                "represents": "the developer chasing answers",
                "personality": "stubborn, curious",
                "strengths": ["pattern recognition"],
                "flaws": ["over-confidence"],
                "visual_lock": "Ink-haired engineer in grey jacket",
                "silhouette_notes": "Thin frame",
                "outfit_notes": "Grey jacket, boots",
                "hair_or_face_notes": "Wind-blown black hair",
                "speech_style": "Direct",
            }
        ],
    )


def _registry() -> list[SourceFact]:
    return [
        SourceFact(
            fact_id="f001",
            text="Small systems hide failure modes that large systems expose.",
            source_slice_id="book_global",
            importance=FactImportance.THESIS,
            source_refs=[SourceRange(page_start=1, page_end=10)],
        ),
        SourceFact(
            fact_id="f002",
            text="Every architectural choice trades cost for benefit.",
            source_slice_id="book_global",
            importance=FactImportance.CORE,
            source_refs=[SourceRange(page_start=11, page_end=25)],
        ),
    ]


def _context_with_book_artifacts() -> PipelineContext:
    context = PipelineContext(
        book_id="book_123",
        project_id="project_123",
        source_slice=_slice(),
        prior_continuity=ContinuityLedger(project_id="project_123"),
        options={},
        llm_client=ExplodingClient(),
        fact_registry=_registry(),
    )
    context.adaptation_plan = _adaptation_plan()
    context.character_bible = _bible()
    context.bible_locked = True
    return context


def test_adaptation_plan_stage_short_circuits_when_plan_already_present():
    context = _context_with_book_artifacts()

    result = asyncio.run(adaptation_plan_stage.run(context))

    # No exception means the ExplodingClient was not invoked.
    assert result.adaptation_plan is context.adaptation_plan


def test_character_world_bible_stage_short_circuits_when_bible_locked():
    context = _context_with_book_artifacts()

    result = asyncio.run(character_world_bible_stage.run(context))

    assert result.character_bible is context.character_bible


def test_source_fact_stage_short_circuits_when_registry_present_and_records_overlap():
    context = _context_with_book_artifacts()

    result = asyncio.run(source_fact_extraction_stage.run(context))

    # Only f001 overlaps pages 1..10; f002 lives at 11..25.
    assert result.new_fact_ids == ["f001"]


def test_source_fact_stage_skips_facts_already_known_to_the_ledger():
    context = _context_with_book_artifacts()
    context.prior_continuity = ContinuityLedger(
        project_id="project_123",
        known_fact_ids=["f001"],
    )

    result = asyncio.run(source_fact_extraction_stage.run(context))

    # f001 was already known and f002 does not overlap; nothing is "new".
    assert result.new_fact_ids == []
