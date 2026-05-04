"""Manga project control-plane routes.

These endpoints create and inspect persistent manga projects. Actual generation
will be wired behind the revamp pipeline later; this route exists so the UI can
start thinking in projects/slices instead of one-off summaries.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.domain.manga import SourceSlice
from app.manga_models import MangaProjectDoc
from app.models import Book, ProcessingStatus
from app.services.manga import (
    choose_next_page_slice,
    get_or_create_project,
    load_project_ledger,
    serialize_project,
)

router = APIRouter(tags=["manga-projects"])


class CreateMangaProjectRequest(BaseModel):
    style: str = "manga"
    engine: str = "v4"
    title: str = ""
    project_options: dict[str, Any] = Field(default_factory=dict)


class NextSourceSliceRequest(BaseModel):
    page_window: int = Field(default=10, ge=1, le=100)


class MangaProjectResponse(BaseModel):
    project: dict[str, Any]


class NextSourceSliceResponse(BaseModel):
    source_slice: dict[str, Any] | None
    fully_covered: bool


def _serialize_source_slice(source_slice: SourceSlice | None) -> dict[str, Any] | None:
    if source_slice is None:
        return None
    return source_slice.model_dump(mode="json")


@router.post("/books/{book_id}/manga-projects", response_model=MangaProjectResponse)
async def create_manga_project(book_id: str, request: CreateMangaProjectRequest):
    book = await Book.get(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if book.status not in (ProcessingStatus.PARSED, ProcessingStatus.COMPLETE):
        raise HTTPException(status_code=400, detail=f"Book is not parsed yet: {book.status}")

    project = await get_or_create_project(
        book=book,
        style=request.style,
        engine=request.engine,
        title=request.title,
        project_options=request.project_options,
    )
    return MangaProjectResponse(project=serialize_project(project))


@router.get("/manga-projects/{project_id}", response_model=MangaProjectResponse)
async def get_manga_project(project_id: str):
    project = await MangaProjectDoc.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Manga project not found")
    return MangaProjectResponse(project=serialize_project(project))


@router.post("/manga-projects/{project_id}/next-source-slice", response_model=NextSourceSliceResponse)
async def preview_next_source_slice(project_id: str, request: NextSourceSliceRequest):
    project = await MangaProjectDoc.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Manga project not found")

    book = await Book.get(project.book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found for manga project")

    ledger = load_project_ledger(project)
    source_slice = choose_next_page_slice(
        book_id=str(book.id),
        total_pages=book.total_pages,
        chapters=book.chapters,
        ledger=ledger,
        page_window=request.page_window,
    )

    return NextSourceSliceResponse(
        source_slice=_serialize_source_slice(source_slice),
        fully_covered=source_slice is None,
    )
