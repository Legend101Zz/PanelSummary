"""Thin orchestrator for book-level (run-once-per-project) stages.

Mirrors the per-slice ``orchestrator.py`` but on a separate context. We keep
the two orchestrators distinct so a developer scanning the file knows whether
they are looking at book-level or slice-level pipeline plumbing without having
to read three layers of conditionals.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from inspect import isawaitable
from typing import Any

from app.manga_pipeline.book_context import BookUnderstandingContext, BookUnderstandingResult

BookUnderstandingStage = Callable[[BookUnderstandingContext], Awaitable[BookUnderstandingContext]]
StageProgressCallback = Callable[[int, int, str], Awaitable[None] | None]


def stage_label(stage: BookUnderstandingStage) -> str:
    """Return a stable, human-readable label for a book-level stage."""
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


async def run_book_understanding_pipeline(
    context: BookUnderstandingContext,
    stages: list[BookUnderstandingStage],
    progress_callback: StageProgressCallback | None = None,
) -> BookUnderstandingResult:
    """Run the ordered book-level stages and return the typed result."""
    current = context
    total = len(stages)
    for index, stage in enumerate(stages, start=1):
        current = await stage(current)
        await _maybe_call_progress(progress_callback, index, total, stage_label(stage))
    return current.result()
