"""Book-understanding service.

Owns the full lifecycle of book-level (run-once-per-project) artifact creation
and persistence. It is the boundary between the pipeline's typed artifacts and
``MangaProjectDoc``.

Why a separate service from ``generation_service``:
- Different cadence: book understanding runs ONCE per project, slice generation
  runs many times. Mixing them in the same module hides which fields are
  written when.
- Different failure semantics: book-understanding failure should mark the
  project as ``understanding_status="failed"`` and block slice generation,
  whereas slice failure only fails that one slice.
- Different inputs: book-understanding consumes the WHOLE book; slice
  generation consumes one slice.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from inspect import isawaitable
from typing import Any

from app.manga_models import MangaProjectDoc
from app.manga_pipeline import (
    BookUnderstandingContext,
    BookUnderstandingResult,
    LLMOutputValidationError,
    run_book_understanding_pipeline,
)
from app.manga_pipeline.llm_contracts import LLMInvocationTrace, LLMModelClient
from app.manga_pipeline.stages.book import (
    arc_outline_stage,
    book_fact_registry_stage,
    global_adaptation_plan_stage,
    global_character_world_bible_stage,
    whole_book_synopsis_stage,
)
from app.models import Book

UnderstandingProgressCallback = Callable[[int, str, str], Awaitable[None] | None]


def build_book_understanding_stages():
    """Return the ordered book-level pipeline stages.

    The order matters: synopsis grounds the registry, registry grounds the
    plan, plan grounds the bible, and the arc outline reads everything.
    """
    return [
        whole_book_synopsis_stage.run,
        book_fact_registry_stage.run,
        global_adaptation_plan_stage.run,
        global_character_world_bible_stage.run,
        arc_outline_stage.run,
    ]


def book_chapters_to_canonical(book: Book) -> list[dict[str, Any]]:
    """Convert ``Book.chapters`` to the dict shape the book stages expect.

    The pipeline is intentionally storage-agnostic: it consumes plain dicts,
    not ``BookChapter`` instances. This keeps stage tests simple and avoids
    importing Beanie models from the pipeline package.
    """
    canonical: list[dict[str, Any]] = []
    for chapter in book.chapters:
        body_parts: list[str] = []
        for section in chapter.sections:
            text = (section.content or "").strip()
            if text:
                body_parts.append(f"{section.title}\n{text}")
        body = "\n\n".join(body_parts)
        canonical.append(
            {
                "index": chapter.index,
                "title": chapter.title,
                "page_start": chapter.page_start,
                "page_end": chapter.page_end,
                "content": body,
            }
        )
    return canonical


def serialize_llm_trace(trace: LLMInvocationTrace) -> dict[str, Any]:
    """Serialize a compact trace for persistence on the project document."""
    return {
        "stage_name": trace.stage_name.value,
        "provider": trace.provider,
        "model": trace.model,
        "total_input_tokens": trace.total_input_tokens,
        "total_output_tokens": trace.total_output_tokens,
        "total_cost_usd": trace.total_cost_usd,
        "attempts": [
            {
                "attempt_index": attempt.attempt_index,
                "input_tokens": attempt.input_tokens,
                "output_tokens": attempt.output_tokens,
                "estimated_cost_usd": attempt.estimated_cost_usd,
                "content_preview": attempt.content_preview,
                "issues": [issue.__dict__ for issue in attempt.issues],
            }
            for attempt in trace.attempts
        ],
    }


def _persist_understanding_to_project(
    *,
    project: MangaProjectDoc,
    result: BookUnderstandingResult,
) -> None:
    """Copy a typed understanding result into the project document fields.

    This is the only place that writes the book-level artifact fields. Per-slice
    code MUST go through this function (or do nothing) so the bible_locked
    invariant is enforceable.
    """
    project.book_synopsis = result.synopsis.model_dump(mode="json")
    project.fact_registry = [fact.model_dump(mode="json") for fact in result.fact_registry]
    project.adaptation_plan = result.adaptation_plan.model_dump(mode="json")
    project.character_world_bible = result.character_bible.model_dump(mode="json")
    project.arc_outline = result.arc_outline.model_dump(mode="json")
    project.book_understanding_traces = [serialize_llm_trace(trace) for trace in result.llm_traces]
    project.bible_locked = True
    project.understanding_status = "ready"
    project.understanding_error = ""


def project_understanding_is_ready(project: MangaProjectDoc) -> bool:
    """Return True when the project's book-understanding phase is complete.

    Used by the per-slice generator to decide whether to read book-level
    artifacts from the project doc or queue an understanding job first.
    """
    if project.understanding_status != "ready":
        return False
    if not project.book_synopsis:
        return False
    if not project.adaptation_plan:
        return False
    if not project.character_world_bible:
        return False
    if not project.arc_outline:
        return False
    if not project.fact_registry:
        return False
    return True


def load_understanding_result(project: MangaProjectDoc) -> BookUnderstandingResult | None:
    """Hydrate the persisted book-level artifacts back into typed form.

    Returns ``None`` when the understanding phase has not completed yet.
    Domain validators run during hydration; if a stored artifact has drifted
    out of contract (e.g. bible was edited by hand to remove characters), the
    error surfaces here loudly instead of silently mis-rendering downstream.
    """
    if not project_understanding_is_ready(project):
        return None
    return _hydrate_existing_result(project)


async def _emit_progress(
    callback: UnderstandingProgressCallback | None,
    progress: int,
    message: str,
    phase: str,
) -> None:
    if callback is None:
        return
    awaited = callback(progress, message, phase)
    if isawaitable(awaited):
        await awaited


async def generate_book_understanding(
    *,
    project: MangaProjectDoc,
    book: Book,
    llm_client: LLMModelClient,
    extra_options: dict[str, Any] | None = None,
    progress_callback: UnderstandingProgressCallback | None = None,
    force: bool = False,
) -> BookUnderstandingResult:
    """Run the book-understanding pipeline and persist the results.

    Idempotent: when the project already has a complete understanding bundle
    and ``force`` is False, this is a no-op that returns the persisted result
    re-hydrated as a typed bundle.
    """
    if project_understanding_is_ready(project) and not force:
        await _emit_progress(progress_callback, 100, "Book understanding already complete.", "ready")
        return _hydrate_existing_result(project)

    if project.bible_locked and not force:
        # The bible is locked but other artifacts are missing — this is an
        # impossible state in normal operation. We refuse to proceed because
        # silently re-running would overwrite a locked bible.
        raise RuntimeError(
            "project bible is locked but understanding is incomplete; "
            "manual repair required (or pass force=True after auditing)"
        )

    canonical_chapters = book_chapters_to_canonical(book)
    if not canonical_chapters:
        raise ValueError("book has no chapters; parse the PDF before book understanding")

    options = dict(project.project_options)
    options.update(extra_options or {})

    context = BookUnderstandingContext(
        book_id=str(book.id),
        project_id=str(project.id),
        book_title=book.title or "",
        total_pages=book.total_pages,
        canonical_chapters=canonical_chapters,
        options=options,
        llm_client=llm_client,
    )

    project.understanding_status = "running"
    project.understanding_error = ""
    await project.save()
    await _emit_progress(progress_callback, 5, "Reading the whole book…", "synopsis")

    stages = build_book_understanding_stages()
    progress_steps = max(len(stages), 1)

    async def report(completed: int, total: int, label: str) -> None:
        # We reserve the first 5% for the queue/launch and the last 5% for
        # persistence; stages own the middle 90%.
        progress = 5 + int((completed / progress_steps) * 90)
        await _emit_progress(progress_callback, progress, f"Completed {label.replace('_', ' ')}", label)

    try:
        result = await run_book_understanding_pipeline(
            context=context,
            stages=stages,
            progress_callback=report,
        )
    except LLMOutputValidationError as exc:
        project.understanding_status = "failed"
        project.understanding_error = str(exc)
        await project.save()
        raise
    except Exception as exc:  # noqa: BLE001 — surface the cause but always mark failed
        project.understanding_status = "failed"
        project.understanding_error = str(exc)
        await project.save()
        raise

    _persist_understanding_to_project(project=project, result=result)
    await project.save()
    await _emit_progress(progress_callback, 100, "Book understanding complete.", "ready")
    return result


def _hydrate_existing_result(project: MangaProjectDoc) -> BookUnderstandingResult:
    """Rehydrate a persisted understanding result into typed artifacts."""
    from app.domain.manga import (
        AdaptationPlan,
        ArcOutline,
        BookSynopsis,
        CharacterWorldBible,
        SourceFact,
    )

    return BookUnderstandingResult(
        synopsis=BookSynopsis(**project.book_synopsis),
        fact_registry=[SourceFact(**fact) for fact in project.fact_registry],
        adaptation_plan=AdaptationPlan(**project.adaptation_plan),
        character_bible=CharacterWorldBible(**project.character_world_bible),
        arc_outline=ArcOutline(**project.arc_outline),
        llm_traces=[],
    )
