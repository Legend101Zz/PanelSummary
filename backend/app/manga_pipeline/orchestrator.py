"""Thin stage orchestrator for the revamp manga pipeline."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from app.manga_pipeline.context import PipelineContext, PipelineResult

MangaPipelineStage = Callable[[PipelineContext], Awaitable[PipelineContext]]


async def run_pipeline_stages(
    context: PipelineContext,
    stages: list[MangaPipelineStage],
) -> PipelineResult:
    """Run ordered pipeline stages and return the final result.

    Stages are explicit and testable. If a stage wants to do IO, that IO lives
    in that stage, not secretly in the orchestrator. Revolutionary stuff,
    apparently.
    """
    current = context
    for stage in stages:
        current = await stage(current)
    return current.result()
