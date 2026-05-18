"""Celery tasks for the manga v2 project pipeline."""

from __future__ import annotations

import logging
from typing import Any

from app.celery_worker import celery_app, get_db, run_async, update_job_status

logger = logging.getLogger(__name__)


def _sum_trace_cost(llm_traces: list[dict[str, Any]]) -> float:
    """Return rounded total LLM cost from persisted trace metadata."""
    total = sum(float(trace.get("total_cost_usd") or 0.0) for trace in llm_traces)
    return round(total, 6)


def _is_source_covered_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return "fully covered" in text or "source is already fully covered" in text


def _count_rendered_panel_images(page_docs: list[Any]) -> int:
    """Count persisted panel artifacts that received image paths."""
    count = 0
    for page_doc in page_docs:
        rendered_page = getattr(page_doc, "rendered_page", {}) or {}
        artifacts = rendered_page.get("panel_artifacts", {}) if isinstance(rendered_page, dict) else {}
        if not isinstance(artifacts, dict):
            continue
        for artifact in artifacts.values():
            if isinstance(artifact, dict) and artifact.get("image_path"):
                count += 1
    return count


@celery_app.task(bind=True, name="app.celery_manga_tasks.build_manga_project_task")
def build_manga_project_task(
    self,
    project_id: str,
    api_key: str,
    provider: str = "openai",
    model: str | None = None,
    mode: str = "next_chunk",
    page_window: int = 10,
    generate_images: bool = True,
    image_model: str | None = None,
    image_mode: str | None = None,
    sprite_budget_total: int = 8,
    key_panel_budget_per_slice: int = 3,
    key_panel_budget_full_book: int = 8,
    options: dict[str, Any] | None = None,
):
    """User-facing manga build task.

    This task is deliberately an orchestrator around existing services:
    book-understanding still owns the global pass, and generation_service still
    owns slice selection, validation, persistence, and continuity updates.
    """
    logger.info("Starting manga build for project %s mode=%s", project_id, mode)

    async def _run() -> None:
        await get_db()

        from app.llm_client import LLMClient
        from app.manga_models import MangaProjectDoc
        from app.models import Book, ProcessingStatus
        from app.services.manga.book_understanding_service import (
            generate_book_understanding,
            project_understanding_is_ready,
        )
        from app.services.manga.generation_service import generate_project_slice

        project = await MangaProjectDoc.get(project_id)
        if not project:
            raise ValueError(f"Manga project not found: {project_id}")

        book = await Book.get(project.book_id)
        if not book:
            raise ValueError(f"Book not found for manga project: {project.book_id}")
        if book.status not in (ProcessingStatus.PARSED, ProcessingStatus.COMPLETE):
            raise ValueError(f"Book is not parsed yet: {book.status}")

        resolved_image_mode = image_mode or ("budgeted" if generate_images else "none")
        should_generate_sprites = resolved_image_mode in {"sprites_only", "budgeted", "full_panel_art"}

        project_options = dict(project.project_options)
        project_options.update({
            "preferred_provider": provider,
            "preferred_model": model,
            "page_window": page_window,
            "generate_images": should_generate_sprites,
            "image_mode": resolved_image_mode,
            "image_model": image_model,
            "sprite_budget_total": sprite_budget_total,
            "key_panel_budget_per_slice": key_panel_budget_per_slice,
            "key_panel_budget_full_book": key_panel_budget_full_book,
        })
        project.project_options = project_options
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

        await report(1, "Preparing manga workspace...", "build_prepare")
        llm_client = LLMClient(api_key=api_key, provider=provider, model=model)

        run_options = dict(options or {})
        run_options.update({
            "style": project.style,
            "generate_images": should_generate_sprites,
            "image_mode": resolved_image_mode,
            "image_model": image_model,
            "sprite_budget_total": sprite_budget_total,
            "key_panel_budget_per_slice": key_panel_budget_per_slice,
            "key_panel_budget_full_book": key_panel_budget_full_book,
            "build_mode": mode,
        })
        if should_generate_sprites or resolved_image_mode in {"budgeted", "full_panel_art"}:
            run_options["image_api_key"] = api_key
            run_options["api_key"] = api_key

        if not project_understanding_is_ready(project):
            async def understanding_progress(progress: int, message: str, phase: str) -> None:
                mapped = 5 + int(max(0, min(progress, 100)) * 0.35)
                await report(mapped, message, f"understanding:{phase}")

            await generate_book_understanding(
                project=project,
                book=book,
                llm_client=llm_client,
                extra_options=run_options,
                progress_callback=understanding_progress,
            )
            project = await MangaProjectDoc.get(project_id)
            if not project:
                raise ValueError(f"Manga project disappeared during build: {project_id}")
        else:
            await report(40, "Book understanding already complete.", "understanding:ready")

        generated_slices = 0
        generated_pages = 0
        generated_panel_images = 0
        total_cost = 0.0
        max_slices = 100

        while True:
            if generated_slices >= max_slices:
                raise RuntimeError("full-book build stopped after 100 slices; refusing possible infinite loop")

            label = "Generating manga pages..." if mode == "next_chunk" else f"Generating manga chunk {generated_slices + 1}..."
            await report(45, label, "slice:start")

            async def slice_progress(progress: int, message: str, phase: str) -> None:
                if mode == "full_book":
                    mapped = min(95, 45 + generated_slices * 4 + int(max(0, min(progress, 100)) * 0.04))
                else:
                    mapped = 45 + int(max(0, min(progress, 100)) * 0.50)
                await report(mapped, message, f"slice:{phase}")

            try:
                slice_options = dict(run_options)
                if resolved_image_mode == "budgeted":
                    if mode == "full_book":
                        remaining = max(key_panel_budget_full_book - generated_panel_images, 0)
                        slice_options["key_panel_budget"] = min(key_panel_budget_per_slice, remaining)
                    else:
                        slice_options["key_panel_budget"] = key_panel_budget_per_slice
                slice_doc, page_docs = await generate_project_slice(
                    project=project,
                    book=book,
                    llm_client=llm_client,
                    page_window=page_window,
                    image_api_key=api_key,
                    extra_options=slice_options,
                    progress_callback=slice_progress,
                )
            except ValueError as exc:
                if _is_source_covered_error(exc):
                    await report(98, "All source pages are already covered.", "complete")
                    break
                raise

            generated_slices += 1
            generated_pages += len(page_docs)
            generated_panel_images += _count_rendered_panel_images(page_docs)
            total_cost += _sum_trace_cost(slice_doc.llm_traces)
            project = await MangaProjectDoc.get(project_id)
            if not project:
                raise ValueError(f"Manga project disappeared during build: {project_id}")

            if mode != "full_book":
                break

        project.status = "complete"
        await project.save()
        await update_job_status(
            self.request.id,
            "success",
            100,
            f"Manga build complete: {generated_slices} chunk(s), {generated_pages} page(s).",
            result_id=project_id,
            phase="complete",
            panels_done=generated_pages,
            panels_total=generated_pages,
            cost_so_far=round(total_cost, 6),
        )
        logger.info("Manga build complete for project %s", project_id)

    async def _run_guarded() -> None:
        try:
            await _run()
        except Exception as exc:
            logger.error("Manga build failed: %s", exc, exc_info=True)
            try:
                await get_db()
                from app.manga_models import MangaProjectDoc

                project = await MangaProjectDoc.get(project_id)
                if project:
                    project.status = "failed"
                    await project.save()
            except Exception as save_exc:
                logger.error("Could not mark manga build failed: %s", save_exc, exc_info=True)

            await update_job_status(
                self.request.id,
                "failure",
                0,
                f"Manga build failed: {exc}",
                result_id=project_id,
                error=str(exc),
                phase="failed",
            )

    run_async(_run_guarded())


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
    image_mode: str | None = None,
    sprite_budget_total: int = 8,
    key_panel_budget_per_slice: int = 3,
    key_panel_budget_full_book: int = 8,
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

        resolved_image_mode = image_mode or ("budgeted" if generate_images else "none")
        should_generate_sprites = resolved_image_mode in {"sprites_only", "budgeted", "full_panel_art"}
        generation_options = dict(options or {})
        generation_options["generate_images"] = should_generate_sprites
        generation_options["image_mode"] = resolved_image_mode
        generation_options["sprite_budget_total"] = sprite_budget_total
        generation_options["key_panel_budget_per_slice"] = key_panel_budget_per_slice
        generation_options["key_panel_budget_full_book"] = key_panel_budget_full_book
        if resolved_image_mode == "budgeted":
            generation_options["key_panel_budget"] = key_panel_budget_per_slice
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
