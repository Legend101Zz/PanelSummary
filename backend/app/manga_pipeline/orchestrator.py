"""Thin stage orchestrator for the revamp manga pipeline."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from inspect import isawaitable
from typing import Any

from app.manga_pipeline.context import PipelineContext, PipelineResult

MangaPipelineStage = Callable[[PipelineContext], Awaitable[PipelineContext]]
StageProgressCallback = Callable[[int, int, str], Awaitable[None] | None]


def stage_label(stage: MangaPipelineStage) -> str:
    """Return a stable, human-ish label for a pipeline stage."""
    return getattr(stage, "__module__", "stage").rsplit(".", 1)[-1].replace("_stage", "")


async def _maybe_call_progress(
    callback: StageProgressCallback | None,
    completed: int,
    total: int,
    label: str,
) -> None:
    if callback is None:
        return
    result: Any = callback(completed, total, label)
    if isawaitable(result):
        await result


async def run_pipeline_context(
    context: PipelineContext,
    stages: list[MangaPipelineStage],
    progress_callback: StageProgressCallback | None = None,
) -> PipelineContext:
    """Run ordered pipeline stages and return the enriched context.

    Persistence code needs typed intermediate artifacts, not just rendered pages.
    Returning context here keeps the orchestrator thin while avoiding global state
    or sneaky database writes inside creative stages.
    """
    current = context
    total = len(stages)
    for index, stage in enumerate(stages, start=1):
        current = await stage(current)
        await _maybe_call_progress(progress_callback, index, total, stage_label(stage))
    return current


async def run_pipeline_stages(
    context: PipelineContext,
    stages: list[MangaPipelineStage],
    progress_callback: StageProgressCallback | None = None,
) -> PipelineResult:
    """Run ordered pipeline stages and return the final public result."""
    return (await run_pipeline_context(context, stages, progress_callback=progress_callback)).result()
