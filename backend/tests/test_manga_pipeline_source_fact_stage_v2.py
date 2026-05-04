"""Tests for the v2 LLM-backed source fact extraction stage."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import ContinuityLedger, SourceRange, SourceSlice, SourceSliceMode
from app.manga_pipeline import PipelineContext
from app.manga_pipeline.stages import source_fact_extraction_stage


class FakeLLMClient:
    provider = "fake"
    model = "fake-fact-extractor"

    def __init__(self, parsed: dict[str, Any]) -> None:
        self.parsed = parsed
        self.calls: list[dict[str, Any]] = []

    async def chat(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {
            "content": "{}",
            "parsed": self.parsed,
            "input_tokens": 222,
            "output_tokens": 111,
            "estimated_cost_usd": 0.0033,
        }


def _source_slice() -> SourceSlice:
    return SourceSlice(
        slice_id="slice_001",
        book_id="book_123",
        mode=SourceSliceMode.PAGES,
        source_range=SourceRange(page_start=1, page_end=10),
    )


def _context(llm_client: FakeLLMClient | None = None) -> PipelineContext:
    return PipelineContext(
        book_id="book_123",
        project_id="project_123",
        source_slice=_source_slice(),
        prior_continuity=ContinuityLedger(project_id="project_123"),
        llm_client=llm_client,
        options={"source_text": "At scale, simple answers break because tradeoffs shift."},
    )


def _valid_extraction() -> dict[str, Any]:
    return {
        "slice_id": "slice_001",
        "facts": [
            {
                "fact_id": "f001",
                "text": "At scale, simple answers break because tradeoffs shift.",
                "source_slice_id": "slice_001",
                "importance": 5,
                "source_refs": [{"page_start": 1, "page_end": 2}],
                "tags": ["scale", "tradeoffs", "thesis"],
            }
        ],
        "extraction_notes": "Core thesis extracted.",
    }


def test_source_fact_stage_calls_llm_and_merges_facts():
    client = FakeLLMClient(_valid_extraction())
    context = _context(client)

    result = asyncio.run(source_fact_extraction_stage.run(context))

    assert [fact.fact_id for fact in result.fact_registry] == ["f001"]
    assert result.new_fact_ids == ["f001"]
    assert len(result.llm_traces) == 1
    assert result.llm_traces[0].stage_name.value == "source_fact_extraction"
    assert len(client.calls) == 1
    assert "source_text" in client.calls[0]["user_message"]
    assert "JSON_SCHEMA" in client.calls[0]["user_message"]


def test_source_fact_stage_requires_llm_client():
    with pytest.raises(ValueError, match="llm_client"):
        asyncio.run(source_fact_extraction_stage.run(_context(None)))


def test_source_fact_stage_requires_source_material():
    context = _context(FakeLLMClient(_valid_extraction()))
    context.options.pop("source_text")

    with pytest.raises(ValueError, match="source_text"):
        asyncio.run(source_fact_extraction_stage.run(context))


def test_source_fact_stage_rejects_mismatched_slice_id():
    invalid = _valid_extraction()
    invalid["facts"][0]["source_slice_id"] = "wrong_slice"
    context = _context(FakeLLMClient(invalid))
    context.options["llm_validation_attempts"] = 1

    with pytest.raises(Exception, match="source_fact_extraction"):
        asyncio.run(source_fact_extraction_stage.run(context))
