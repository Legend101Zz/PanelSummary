"""Tests for the character asset planning stage.

Phase 3 contract: the stage is a thin deterministic shim over the planner.
No LLM call, ever. The bible MUST be hydrated (book-understanding ran, OR
legacy ``character_world_bible_stage`` ran upstream).

These tests pin:
* the deterministic happy path,
* visual-lock prose mechanically lands in every spec,
* idempotency,
* the loud failure when the bible is missing.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import (
    CharacterDesign,
    CharacterWorldBible,
    ContinuityLedger,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
)
from app.manga_pipeline import PipelineContext
from app.manga_pipeline.stages import character_asset_plan_stage


class ExplodingLLMClient:
    """Any chat call would be a Phase 3 regression — explode loudly."""

    provider = "exploding"
    model = "must-not-be-called"

    async def chat(self, **kwargs: Any) -> dict[str, Any]:
        raise AssertionError(
            "character_asset_plan_stage must NOT call the LLM in Phase 3"
        )


def _bible() -> CharacterWorldBible:
    return CharacterWorldBible(
        world_summary="A shifting archive of forgotten methods.",
        visual_style="Black ink with clean screentones.",
        characters=[
            CharacterDesign(
                character_id="kai",
                name="Kai",
                role="protagonist",
                visual_lock="short angular hair and bookmark scarf",
                silhouette_notes="lean, tall, satchel always over left shoulder",
                outfit_notes="dark coat, long crimson scarf",
                hair_or_face_notes="angular black hair, sharp grey eyes",
            ),
            CharacterDesign(
                character_id="mira",
                name="Mira",
                role="mentor",
                visual_lock="silver braid and bronze monocle",
            ),
        ],
    )


def _context(*, bible: CharacterWorldBible | None) -> PipelineContext:
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
        # Hydrate an exploding client so a regression that re-introduces an
        # LLM call fails the test instead of silently working.
        llm_client=ExplodingLLMClient(),
        options={"image_model": "test-image-model"},
    )
    context.character_bible = bible
    return context


def test_stage_uses_deterministic_planner_and_does_not_touch_llm():
    context = _context(bible=_bible())

    result = asyncio.run(character_asset_plan_stage.run(context))

    assert result.llm_traces == []
    # Two characters * (1 reference + 3 expressions) = 8 specs.
    assert len(result.asset_specs) == 8


def test_specs_carry_visual_lock_in_prompt():
    """Bible's visual_lock fields must reach the prompt mechanically."""
    context = _context(bible=_bible())

    result = asyncio.run(character_asset_plan_stage.run(context))
    kai_specs = [spec for spec in result.asset_specs if spec.character_id == "kai"]

    assert kai_specs, "Kai must have at least one spec"
    for spec in kai_specs:
        assert "bookmark scarf" in spec.prompt
        assert "angular" in spec.prompt
        assert "satchel" in spec.prompt  # silhouette_notes


def test_specs_are_idempotent_across_runs():
    """Same bible -> same asset_ids; the library service relies on this."""
    result_a = asyncio.run(character_asset_plan_stage.run(_context(bible=_bible())))
    result_b = asyncio.run(character_asset_plan_stage.run(_context(bible=_bible())))

    ids_a = sorted(spec.asset_id for spec in result_a.asset_specs)
    ids_b = sorted(spec.asset_id for spec in result_b.asset_specs)
    assert ids_a == ids_b


def test_stage_demands_a_hydrated_bible():
    """Without a bible the stage must fail loudly so a misconfigured pipeline cannot ship."""
    context = _context(bible=None)

    with pytest.raises(ValueError, match="character_bible"):
        asyncio.run(character_asset_plan_stage.run(context))
