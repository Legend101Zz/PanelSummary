"""Celery tasks for the manga v2 project pipeline.

Kept separate from the legacy summary worker because that file is already a
chunky lasagna. New v2 job code lives here: small, explicit, and reusable.
"""

from __future__ import annotations

import logging
from typing import Any

from app.celery_worker import celery_app, get_db, run_async, update_job_status

logger = logging.getLogger(__name__)


def _sum_trace_cost(llm_traces: list[dict[str, Any]]) -> float:
    """Return rounded total LLM cost from persisted trace metadata."""
    total = sum(float(trace.get("total_cost_usd") or 0.0) for trace in llm_traces)
    return round(total, 6)


@celery_app.task(bind=True, name="app.celery_manga_tasks.generate_manga_slice_task")
def generate_manga_slice_task(
    self,
    project_id: str,
    api_key: str,
    provider: str = "openrouter",
    model: str | None = None,
    page_window: int = 10,
    generate_images: bool = False,
    image_model: str | None = None,
    options: dict[str, Any] | None = None,
):
    """Generate the next manga v2 source slice in the background."""
    logger.info("Starting manga v2 slice generation for project %s", project_id)

    async def _run() -> None:
        await get_db()

        from app.llm_client import LLMClient
        from app.manga_models import MangaProjectDoc
        from app.models import Book, ProcessingStatus
        from app.services.manga.generation_service import generate_project_slice

        project = await MangaProjectDoc.get(project_id)
        if not project:
            raise ValueError(f"Manga project not found: {project_id}")

        book = await Book.get(project.book_id)
        if not book:
            raise ValueError(f"Book not found for manga project: {project.book_id}")
        if book.status not in (ProcessingStatus.PARSED, ProcessingStatus.COMPLETE):
            raise ValueError(f"Book is not parsed yet: {book.status}")

        project.status = "generating"
        await project.save()

        async def report(progress: int, message: str, phase: str) -> None:
            await update_job_status(
                self.request.id,
                "progress",
                progress,
                message,
                result_id=project_id,
                phase=phase,
            )

        await report(1, "Queued manga v2 generation worker…", "queued")

        generation_options = dict(options or {})
        generation_options["generate_images"] = generate_images
        if image_model:
            generation_options["image_model"] = image_model

        llm_client = LLMClient(api_key=api_key, provider=provider, model=model)
        slice_doc, page_docs = await generate_project_slice(
            project=project,
            book=book,
            llm_client=llm_client,
            page_window=page_window,
            image_api_key=api_key,
            extra_options=generation_options,
            progress_callback=report,
        )

        await update_job_status(
            self.request.id,
            "success",
            100,
            f"Manga slice complete: {len(page_docs)} page(s), {len(slice_doc.new_fact_ids)} new fact(s).",
            result_id=project_id,
            phase="complete",
            panels_done=len(page_docs),
            panels_total=len(page_docs),
            cost_so_far=_sum_trace_cost(slice_doc.llm_traces),
        )
        logger.info("Manga v2 slice generation complete for project %s", project_id)

    async def _run_guarded() -> None:
        try:
            await _run()
        except Exception as exc:
            logger.error("Manga v2 slice generation failed: %s", exc, exc_info=True)
            try:
                await get_db()
                from app.manga_models import MangaProjectDoc

                project = await MangaProjectDoc.get(project_id)
                if project:
                    project.status = "failed"
                    await project.save()
            except Exception as save_exc:
                logger.error("Could not mark manga project failed: %s", save_exc, exc_info=True)

            await update_job_status(
                self.request.id,
                "failure",
                0,
                f"Manga generation failed: {exc}",
                result_id=project_id,
                error=str(exc),
                phase="failed",
            )

    run_async(_run_guarded())


@celery_app.task(bind=True, name="app.celery_manga_tasks.generate_book_understanding_task")
def generate_book_understanding_task(
    self,
    project_id: str,
    api_key: str,
    provider: str = "openrouter",
    model: str | None = None,
    options: dict[str, Any] | None = None,
    force: bool = False,
):
    """Run the run-once book-understanding pipeline for a manga project.

    This task is idempotent: if the project already has a complete
    understanding bundle and ``force`` is False, it returns immediately. The
    same task is auto-queued when a project is created and may be re-queued
    on demand from the API.
    """
    logger.info("Starting manga v2 book understanding for project %s", project_id)

    async def _run() -> None:
        await get_db()

        from app.llm_client import LLMClient
        from app.manga_models import MangaProjectDoc
        from app.models import Book, ProcessingStatus
        from app.services.manga.book_understanding_service import (
            generate_book_understanding,
            project_understanding_is_ready,
        )

        project = await MangaProjectDoc.get(project_id)
        if not project:
            raise ValueError(f"Manga project not found: {project_id}")

        if project_understanding_is_ready(project) and not force:
            await update_job_status(
                self.request.id,
                "success",
                100,
                "Book understanding already complete.",
                result_id=project_id,
                phase="ready",
            )
            logger.info("Manga v2 book understanding already ready for %s", project_id)
            return

        book = await Book.get(project.book_id)
        if not book:
            raise ValueError(f"Book not found for manga project: {project.book_id}")
        if book.status not in (ProcessingStatus.PARSED, ProcessingStatus.COMPLETE):
            raise ValueError(f"Book is not parsed yet: {book.status}")

        async def report(progress: int, message: str, phase: str) -> None:
            await update_job_status(
                self.request.id,
                "progress",
                progress,
                message,
                result_id=project_id,
                phase=phase,
            )

        await report(1, "Queued manga v2 book understanding worker…", "queued")

        llm_client = LLMClient(api_key=api_key, provider=provider, model=model)
        result = await generate_book_understanding(
            project=project,
            book=book,
            llm_client=llm_client,
            extra_options=options,
            progress_callback=report,
            force=force,
        )

        await update_job_status(
            self.request.id,
            "success",
            100,
            (
                f"Book understanding complete: {len(result.fact_registry)} fact(s), "
                f"{len(result.character_bible.characters)} character(s), "
                f"{len(result.arc_outline.entries)} planned slice(s)."
            ),
            result_id=project_id,
            phase="ready",
            cost_so_far=_sum_trace_cost([serialize_trace(trace) for trace in result.llm_traces]),
        )
        logger.info("Manga v2 book understanding complete for project %s", project_id)

    async def _run_guarded() -> None:
        try:
            await _run()
        except Exception as exc:
            logger.error("Manga v2 book understanding failed: %s", exc, exc_info=True)
            try:
                await get_db()
                from app.manga_models import MangaProjectDoc

                project = await MangaProjectDoc.get(project_id)
                if project and project.understanding_status != "ready":
                    project.understanding_status = "failed"
                    project.understanding_error = str(exc)
                    await project.save()
            except Exception as save_exc:
                logger.error("Could not mark book understanding failed: %s", save_exc, exc_info=True)

            await update_job_status(
                self.request.id,
                "failure",
                0,
                f"Book understanding failed: {exc}",
                result_id=project_id,
                error=str(exc),
                phase="failed",
            )

    run_async(_run_guarded())


def serialize_trace(trace) -> dict[str, Any]:
    """Local helper to serialize an in-memory LLM trace to plain dicts.

    We keep this small so the celery task does not pull in the service layer.
    """
    return {
        "total_cost_usd": trace.total_cost_usd,
    }
