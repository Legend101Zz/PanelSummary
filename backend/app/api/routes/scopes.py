"""Scope-selection API for the durable-context lane (issue #4, blueprint §7.2).

Endpoints:

* ``POST /books/{book_id}/scopes``          — freeze a selection as a scope
* ``GET  /books/{book_id}/scopes``          — list frozen scopes
* ``GET  /books/{book_id}/scopes/coverage`` — ToC-shaped coverage view

Selections may be page ranges (donor semantics) or chapter indexes. Chapter
selection exists because parsed books can carry degenerate page provenance —
the WMC benchmark reports pages 1-1 for every chapter of a 39-page PDF — which
makes page overlap unable to discriminate (ADR-011). Chapter selection filters
the unit spine by ``chapter_index`` and reuses the ported ``ScopeService``
verbatim through a filtered repository view, so scope hashing/idempotency
semantics stay donor-identical.

Front matter (issue #4: the 1-unit-per-page pollution defect) is DERIVED per
chapter via ``classify_front_matter`` and surfaced in the coverage view;
chapter selections skip front-matter chapters unless ``include_front_matter``
is set. These routes are additive: no v1 endpoint or behavior changes.
"""

from __future__ import annotations

import logging
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.contracts.source import PageRange, ScopeManifest
from app.models import Book
from app.persistence.documents import SourceUnitDoc
from app.persistence.protocols import Repositories
from app.services.book_normalization import classify_front_matter
from app.services.errors import InvalidScopeError
from app.services.scopes import ScopeService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["scopes"])


def get_repositories() -> Repositories:
    """Repository provider; tests monkeypatch this with InMemoryRepositories."""

    from app.persistence.v1_bridge import V1BridgedRepositories

    return V1BridgedRepositories()


class CreateScopeRequest(BaseModel):
    project_id: str = Field(min_length=1, max_length=128)
    selection_label: str = Field(default="", max_length=500)
    created_by: str = Field(default="api", min_length=1, max_length=128)
    page_ranges: list[PageRange] | None = None
    chapter_indexes: list[int] | None = Field(default=None, max_length=1000)
    include_front_matter: bool = False


class _ChapterFilteredUnits:
    """Read-only unit-repository view limited to the selected chapters.

    Lets the ported ``ScopeService.create`` (page-overlap + hash recipe) run
    verbatim while the effective selection is structural.
    """

    def __init__(self, repositories: Repositories, chapter_indexes: set[int]) -> None:
        self._repositories = repositories
        self._chapter_indexes = chapter_indexes

    async def list_source_units(self, book_id: str) -> list[SourceUnitDoc]:
        units = await self._repositories.list_source_units(book_id)
        return [
            unit
            for unit in units
            if unit.chapter_index in self._chapter_indexes
        ]

    async def get_source_unit(
        self, book_id: str, source_unit_id: str
    ) -> SourceUnitDoc | None:
        return await self._repositories.get_source_unit(book_id, source_unit_id)

    async def save_source_units(self, units: list[SourceUnitDoc]) -> None:
        raise NotImplementedError("scope selection never writes source units")


async def _load_book(book_id: str) -> Book:
    try:
        oid = ObjectId(book_id)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail=f"invalid book id {book_id!r}")
    book = await Book.get(oid)
    if book is None:
        raise HTTPException(status_code=404, detail=f"book {book_id} not found")
    return book


def _scope_payload(scope: ScopeManifest) -> dict[str, Any]:
    return scope.model_dump(mode="json")


@router.post("/books/{book_id}/scopes")
async def create_scope(book_id: str, request: CreateScopeRequest) -> dict[str, Any]:
    book = await _load_book(book_id)
    repositories = get_repositories()

    has_pages = bool(request.page_ranges)
    has_chapters = request.chapter_indexes is not None
    if has_pages == has_chapters:
        raise HTTPException(
            status_code=422,
            detail="provide exactly one of page_ranges or chapter_indexes",
        )

    try:
        if has_pages:
            assert request.page_ranges is not None
            label = request.selection_label or (
                "pages " + ", ".join(
                    f"{item.page_start}-{item.page_end}" for item in request.page_ranges
                )
            )
            service = ScopeService(repositories, repositories, memory=repositories)
            scope = await service.create(
                project_id=request.project_id,
                book_id=str(book.id),
                page_ranges=request.page_ranges,
                selection_label=label,
                created_by=request.created_by,
            )
        else:
            assert request.chapter_indexes is not None
            selected = set(request.chapter_indexes)
            if not selected:
                raise HTTPException(
                    status_code=422, detail="chapter_indexes must not be empty"
                )
            chapters = {chapter.index: chapter for chapter in book.chapters}
            unknown = sorted(selected - set(chapters))
            if unknown:
                raise HTTPException(
                    status_code=422,
                    detail=f"unknown chapter indexes: {unknown}",
                )
            if not request.include_front_matter:
                selected = {
                    index
                    for index in selected
                    if not _chapter_is_front_matter(chapters[index])
                }
                if not selected:
                    raise HTTPException(
                        status_code=422,
                        detail=(
                            "selection contains only front-matter chapters; "
                            "pass include_front_matter=true to adapt them"
                        ),
                    )
            page_span = PageRange(
                page_start=min(chapters[i].page_start for i in selected),
                page_end=max(chapters[i].page_end for i in selected),
            )
            label = request.selection_label or (
                "chapters " + ", ".join(str(i) for i in sorted(selected))
            )
            filtered = _ChapterFilteredUnits(repositories, selected)
            service = ScopeService(filtered, repositories, memory=repositories)
            scope = await service.create(
                project_id=request.project_id,
                book_id=str(book.id),
                page_ranges=[page_span],
                selection_label=label,
                created_by=request.created_by,
            )
    except InvalidScopeError as error:
        raise HTTPException(status_code=422, detail=str(error))

    return _scope_payload(scope)


@router.get("/books/{book_id}/scopes")
async def list_scopes(book_id: str) -> dict[str, Any]:
    book = await _load_book(book_id)
    repositories = get_repositories()
    service = ScopeService(repositories, repositories, memory=repositories)
    scopes = await service.list(str(book.id))
    return {"book_id": str(book.id), "scopes": [_scope_payload(item) for item in scopes]}


def _chapter_is_front_matter(chapter: Any) -> bool:
    content = "\n".join(section.content for section in chapter.sections)
    return classify_front_matter(heading=chapter.title, content=content)


@router.get("/books/{book_id}/scopes/coverage")
async def scope_coverage(book_id: str, project_id: str | None = None) -> dict[str, Any]:
    """ToC-shaped view: units per chapter, front-matter flags, coverage state.

    Coverage comes from the project's ACTIVE memory snapshot (the durable
    canon), keyed by source unit id. Without ``project_id`` the view still
    lists structure so an upload-time ToC picker can render.
    """

    book = await _load_book(book_id)
    repositories = get_repositories()
    units = await repositories.list_source_units(str(book.id))
    units_by_chapter: dict[int, list[SourceUnitDoc]] = {}
    for unit in units:
        if unit.chapter_index is None:
            continue
        units_by_chapter.setdefault(unit.chapter_index, []).append(unit)

    covered: dict[str, Any] = {}
    memory_version: int | None = None
    if project_id is not None:
        project = await repositories.get_project(project_id)
        if project is None:
            raise HTTPException(
                status_code=404, detail=f"manga project {project_id} not found"
            )
        if project.book_id != str(book.id):
            raise HTTPException(
                status_code=422,
                detail=f"project {project_id} does not belong to book {book.id}",
            )
        snapshot = await repositories.get_memory_snapshot(
            project_id, project.active_memory_version
        )
        if snapshot is not None:
            memory_version = snapshot.memory_version
            covered = snapshot.coverage

    chapters_view: list[dict[str, Any]] = []
    for chapter in sorted(book.chapters, key=lambda item: item.index):
        chapter_units = sorted(
            units_by_chapter.get(chapter.index, []),
            key=lambda item: item.source_unit_id,
        )
        chapters_view.append(
            {
                "chapter_index": chapter.index,
                "title": chapter.title,
                "page_start": chapter.page_start,
                "page_end": chapter.page_end,
                "word_count": chapter.word_count,
                "front_matter": _chapter_is_front_matter(chapter),
                "has_units": bool(chapter_units),
                "units": [
                    {
                        "source_unit_id": unit.source_unit_id,
                        "kind": unit.kind,
                        "heading_path": unit.heading_path,
                        "page_start": unit.page_start,
                        "page_end": unit.page_end,
                        "token_count": unit.token_count,
                        "coverage": covered.get(unit.source_unit_id),
                    }
                    for unit in chapter_units
                ],
            }
        )
    return {
        "book_id": str(book.id),
        "project_id": project_id,
        "memory_version": memory_version,
        "total_units": len(units),
        "chapters": chapters_view,
    }
