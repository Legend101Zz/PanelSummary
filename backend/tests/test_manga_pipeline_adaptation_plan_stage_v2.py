"""Tests for the v2 LLM-backed adaptation planning stage."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import (
    ContinuityLedger,
    FactImportance,
    SourceFact,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
)
from app.manga_pipeline import PipelineContext
from app.manga_pipeline.stages import adaptation_plan_stage


class FakeLLMClient:
    provider = "fake"
    model = "fake-planner"

    def __init__(self, parsed: dict[str, Any]) -> None:
        self.parsed = parsed
        self.calls: list[dict[str, Any]] = []

    async def chat(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {
            "content": "{}",
            "parsed": self.parsed,
            "input_tokens": 321,
            "output_tokens": 123,
            "estimated_cost_usd": 0.0042,
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
        text="The PDF explains that scale changes solution tradeoffs.",
        source_slice_id="slice_001",
        importance=FactImportance.THESIS,
        source_refs=[SourceRange(page_start=2, page_end=3)],
        tags=["thesis", "scale"],
    )


def _context(llm_client: FakeLLMClient | None = None) -> PipelineContext:
    return PipelineContext(
        book_id="book_123",
        project_id="project_123",
        source_slice=_source_slice(),
        prior_continuity=ContinuityLedger(project_id="project_123"),
        llm_client=llm_client,
        fact_registry=[_fact()],
        options={"style": "manga"},
    )


def _valid_plan() -> dict[str, Any]:
    return {
        "title": "Scale Trial",
        "logline": "Kai enters a labyrinth where each door reveals why simple answers break at scale.",
        "central_thesis": "The document teaches that scale changes what solutions are viable.",
        "protagonist_contract": {
            "who": "Kai, a reader chasing the document's core idea",
            "wants": "to understand the PDF without reading every page",
            "why_cannot_have_it": "the argument is distributed across dense source material",
            "what_they_do": "turns important facts into visual trials and revelations",
        },
        "important_fact_ids": ["f001"],
        "emotional_journey": ["curiosity", "confusion", "revelation"],
        "intellectual_journey": ["simple answer", "tradeoff", "systems view"],
        "memorable_metaphors": ["a key that changes shape as the door grows"],
    }


def test_adaptation_plan_stage_calls_llm_and_records_trace():
    client = FakeLLMClient(_valid_plan())
    context = _context(client)

    result = asyncio.run(adaptation_plan_stage.run(context))

    assert result.adaptation_plan is not None
    assert result.adaptation_plan.title == "Scale Trial"
    assert result.adaptation_plan.important_fact_ids == ["f001"]
    assert len(result.llm_traces) == 1
    assert result.llm_traces[0].stage_name.value == "adaptation_planning"
    assert len(client.calls) == 1
    assert "source_facts" in client.calls[0]["user_message"]
    assert "JSON_SCHEMA" in client.calls[0]["user_message"]


def test_adaptation_plan_stage_requires_llm_client():
    context = _context(None)

    with pytest.raises(ValueError, match="llm_client"):
        asyncio.run(adaptation_plan_stage.run(context))


def test_adaptation_plan_stage_requires_source_facts():
    context = _context(FakeLLMClient(_valid_plan()))
    context.fact_registry = []

    with pytest.raises(ValueError, match="source facts"):
        asyncio.run(adaptation_plan_stage.run(context))
