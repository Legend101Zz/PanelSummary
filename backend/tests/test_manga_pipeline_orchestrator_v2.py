"""Tests for revamp pipeline orchestrator spine."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio

import pytest

from app.domain.manga import ContinuityLedger, SourceRange, SourceSlice, SourceSliceMode
from app.manga_pipeline import PipelineContext, run_pipeline_context, run_pipeline_stages


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
        # Phase 4.5c: ``v4_pages`` is gone; use the still-public
        # ``options`` channel to prove the second stage ran and the
        # context is mutable across stages.
        context.options["stage_two"] = True
        return context

    result = asyncio.run(run_pipeline_stages(_context(), [stage_one, stage_two]))

    assert calls == ["one", "two"]
    assert result.source_slice.slice_id == "slice_001"
    assert result.rendered_pages == []


def test_run_pipeline_context_returns_enriched_context():
    async def stage(context: PipelineContext) -> PipelineContext:
        context.options["seen"] = True
        return context

    result = asyncio.run(run_pipeline_context(_context(), [stage]))

    assert result.options["seen"] is True


def test_run_pipeline_context_reports_stage_progress():
    events: list[tuple[int, int, str]] = []

    async def first_stage(context: PipelineContext) -> PipelineContext:
        return context

    async def second_stage(context: PipelineContext) -> PipelineContext:
        return context

    def record(completed: int, total: int, label: str) -> None:
        events.append((completed, total, label))

    result = asyncio.run(run_pipeline_context(_context(), [first_stage, second_stage], progress_callback=record))

    assert result.book_id == "book_123"
    assert events == [(1, 2, "test_manga_pipeline_orchestrator_v2"), (2, 2, "test_manga_pipeline_orchestrator_v2")]


def test_run_pipeline_stages_propagates_stage_failure():
    async def bad_stage(context):
        raise RuntimeError("stage exploded")

    with pytest.raises(RuntimeError, match="stage exploded"):
        asyncio.run(run_pipeline_stages(_context(), [bad_stage]))
