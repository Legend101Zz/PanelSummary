"""Tests for revamp pipeline orchestrator spine."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio

import pytest

from app.domain.manga import ContinuityLedger, SourceRange, SourceSlice, SourceSliceMode
from app.manga_pipeline import PipelineContext, run_pipeline_stages


def _context() -> PipelineContext:
    source_slice = SourceSlice(
        slice_id="slice_001",
        book_id="book_123",
        mode=SourceSliceMode.PAGES,
        source_range=SourceRange(page_start=1, page_end=10),
    )
    return PipelineContext(
        book_id="book_123",
        project_id="project_123",
        source_slice=source_slice,
        prior_continuity=ContinuityLedger(project_id="project_123"),
    )


def test_run_pipeline_stages_applies_stages_in_order():
    calls = []

    async def stage_one(context):
        calls.append("one")
        context.knowledge_doc["stage_one"] = True
        return context

    async def stage_two(context):
        calls.append("two")
        context.v4_pages.append({"page_index": 0, "version": "4.0"})
        return context

    result = asyncio.run(run_pipeline_stages(_context(), [stage_one, stage_two]))

    assert calls == ["one", "two"]
    assert result.source_slice.slice_id == "slice_001"
    assert result.v4_pages == [{"page_index": 0, "version": "4.0"}]


def test_run_pipeline_stages_propagates_stage_failure():
    async def bad_stage(context):
        raise RuntimeError("stage exploded")

    with pytest.raises(RuntimeError, match="stage exploded"):
        asyncio.run(run_pipeline_stages(_context(), [bad_stage]))
