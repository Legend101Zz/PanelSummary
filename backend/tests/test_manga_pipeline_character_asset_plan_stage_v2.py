"""Tests for the v2 LLM-backed character asset planning stage."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import CharacterDesign, CharacterWorldBible, ContinuityLedger, SourceRange, SourceSlice, SourceSliceMode
from app.manga_pipeline import PipelineContext
from app.manga_pipeline.stages import character_asset_plan_stage


class FakeLLMClient:
    provider = "fake"
    model = "fake-prompt-director"

    def __init__(self, parsed: dict[str, Any]) -> None:
        self.parsed = parsed
        self.calls: list[dict[str, Any]] = []

    async def chat(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {
            "content": "{}",
            "parsed": self.parsed,
            "input_tokens": 333,
            "output_tokens": 222,
            "estimated_cost_usd": 0.005,
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
        options={"image_model": "test-image-model"},
    )
    context.character_bible = CharacterWorldBible(
        world_summary="A shifting archive.",
        visual_style="Black ink with clean screentones.",
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


def _valid_asset_plan() -> dict[str, Any]:
    return {
        "project_id": "project_123",
        "consistency_notes": "Always keep Kai's bookmark scarf and angular hair.",
        "assets": [
            {
                "asset_id": "asset_kai_neutral_sheet",
                "character_id": "kai",
                "asset_type": "character_sheet",
                "expression": "neutral",
                "prompt": "Manga character sheet of Kai, short angular hair, long bookmark scarf, front side back views, clean black ink screentones, white background.",
                "model": "test-image-model",
            }
        ],
    }


def test_character_asset_plan_stage_calls_llm_and_records_trace():
    client = FakeLLMClient(_valid_asset_plan())
    context = _context(client)

    result = asyncio.run(character_asset_plan_stage.run(context))

    assert result.asset_specs[0].asset_id == "asset_kai_neutral_sheet"
    assert result.asset_specs[0].prompt.startswith("Manga character sheet")
    assert result.llm_traces[0].stage_name.value == "character_asset_prompts"
    assert "character_world_bible" in client.calls[0]["user_message"]
    assert "JSON_SCHEMA" in client.calls[0]["user_message"]


def test_character_asset_plan_stage_requires_character_bible():
    context = _context(FakeLLMClient(_valid_asset_plan()))
    context.character_bible = None

    with pytest.raises(ValueError, match="character_bible"):
        asyncio.run(character_asset_plan_stage.run(context))


def test_character_asset_plan_stage_rejects_missing_prompt():
    invalid = _valid_asset_plan()
    invalid["assets"][0]["prompt"] = ""
    context = _context(FakeLLMClient(invalid))
    context.options["llm_validation_attempts"] = 1

    with pytest.raises(Exception, match="character_asset_prompts"):
        asyncio.run(character_asset_plan_stage.run(context))
