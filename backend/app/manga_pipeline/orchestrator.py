"""Thin stage orchestrator for the revamp manga pipeline."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from app.manga_pipeline.context import PipelineContext, PipelineResult

MangaPipelineStage = Callable[[PipelineContext], Awaitable[PipelineContext]]


async def run_pipeline_context(
    context: PipelineContext,
    stages: list[MangaPipelineStage],
) -> PipelineContext:
    """Run ordered pipeline stages and return the enriched context.

    Persistence code needs typed intermediate artifacts, not just rendered pages.
    Returning context here keeps the orchestrator thin while avoiding global state
    or sneaky database writes inside creative stages.
    """
    current = context
    for stage in stages:
        current = await stage(current)
    return current


async def run_pipeline_stages(
    context: PipelineContext,
    stages: list[MangaPipelineStage],
) -> PipelineResult:
    """Run ordered pipeline stages and return the final public result."""
    return (await run_pipeline_context(context, stages)).result()
