"""Manga project service.

This service owns project-level persistence decisions. Generation stages should
not rummage through Mongo documents like raccoons in a pantry.
"""

from __future__ import annotations

from typing import Any

from app.domain.manga import ContinuityLedger
from app.manga_models import MangaProjectDoc
from app.models import Book


def build_empty_continuity(project_id: str) -> ContinuityLedger:
    return ContinuityLedger(project_id=project_id)


def build_project_seed(
    *,
    book_id: str,
    style: str = "manga",
    engine: str = "v4",
    title: str = "",
    project_options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build constructor data for a new project.

    Kept separate from `MangaProjectDoc(...)` so unit tests can validate the
    shape without requiring Beanie initialization.
    """
    return {
        "book_id": book_id,
        "style": style,
        "engine": engine,
        "title": title,
        "project_options": project_options or {},
        "continuity_ledger": build_empty_continuity("pending").model_dump(mode="json"),
    }


def make_project_doc(
    *,
    book_id: str,
    style: str = "manga",
    engine: str = "v4",
    title: str = "",
    project_options: dict[str, Any] | None = None,
) -> MangaProjectDoc:
    """Create an unsaved project document with a valid empty ledger."""
    return MangaProjectDoc(
        **build_project_seed(
            book_id=book_id,
            style=style,
            engine=engine,
            title=title,
            project_options=project_options,
        )
    )


def serialize_project(project: MangaProjectDoc) -> dict[str, Any]:
    return {
        "id": str(project.id) if project.id else "",
        "book_id": project.book_id,
        "style": project.style,
        "engine": project.engine,
        "title": project.title,
        "status": project.status,
        "project_options": project.project_options,
        "adaptation_plan": project.adaptation_plan,
        "character_world_bible": project.character_world_bible,
        "character_voice_cards": project.character_voice_cards,
        "book_synopsis": project.book_synopsis,
        "arc_outline": project.arc_outline,
        "understanding_status": project.understanding_status,
        "understanding_error": project.understanding_error,
        "bible_locked": project.bible_locked,
        "book_understanding_traces": project.book_understanding_traces,
        "fact_count": len(project.fact_registry),
        "continuity_ledger": project.continuity_ledger,
        "coverage": project.coverage,
        "legacy_summary_id": project.legacy_summary_id,
        "active_version": project.active_version,
        "created_at": project.created_at.isoformat(),
        "updated_at": project.updated_at.isoformat(),
    }


async def get_or_create_project(
    *,
    book: Book,
    style: str = "manga",
    engine: str = "v4",
    title: str = "",
    project_options: dict[str, Any] | None = None,
) -> MangaProjectDoc:
    """Find an existing project for book/style/engine or create one."""
    existing = await MangaProjectDoc.find_one(
        MangaProjectDoc.book_id == str(book.id),
        MangaProjectDoc.style == style,
        MangaProjectDoc.engine == engine,
    )
    if existing:
        return existing

    project = MangaProjectDoc(
        **build_project_seed(
            book_id=str(book.id),
            style=style,
            engine=engine,
            title=title or book.title,
            project_options=project_options,
        )
    )
    await project.insert()
    project.continuity_ledger = build_empty_continuity(str(project.id)).model_dump(mode="json")
    await project.save()
    return project


def load_project_ledger(project: MangaProjectDoc) -> ContinuityLedger:
    if project.continuity_ledger:
        return ContinuityLedger(**project.continuity_ledger)
    project_id = str(project.id) if project.id else "pending"
    return build_empty_continuity(project_id)
