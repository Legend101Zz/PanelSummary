"""Scope-selection API routes (issue #4, ADR-011).

Runs the router against InMemoryRepositories with a stubbed book loader:
page-range and chapter-index selection, front-matter skip semantics,
idempotent scope hashes, listing, and the ToC-shaped coverage view.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from beanie import PydanticObjectId
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

import app.api.routes.scopes as scopes_module
from app.models import Book, BookChapter, BookSection
from app.persistence.documents import (
    MangaProjectDoc,
    ProjectMemorySnapshotDoc,
    construct_document,
)
from app.persistence.repositories import InMemoryRepositories
from app.services.book_normalization import source_units_for_book

PROJECT_ID = "proj-api-1"


def _degenerate_book() -> Book:
    """WMC-shaped: all pages 1-1, front matter present (empty + apparatus)."""

    return construct_document(
        Book,
        id=PydanticObjectId(),
        title="API Fixture",
        pdf_hash="b" * 64,
        total_pages=9,
        total_chapters=4,
        chapters=[
            BookChapter(
                index=0,
                title="Contents",
                page_start=1,
                page_end=1,
                word_count=0,
                sections=[
                    BookSection(title="Contents", content="", page_start=1, page_end=1)
                ],
            ),
            BookChapter(
                index=1,
                title="Copyright",
                page_start=1,
                page_end=1,
                word_count=10,
                sections=[
                    BookSection(
                        title="Copyright",
                        content="All rights reserved by the fixture press.",
                        page_start=1,
                        page_end=1,
                    )
                ],
            ),
            BookChapter(
                index=2,
                title="The Story",
                page_start=1,
                page_end=1,
                word_count=50,
                sections=[
                    BookSection(
                        title="The Story",
                        content="Four characters lived in a maze and hunted cheese.",
                        page_start=1,
                        page_end=1,
                    )
                ],
            ),
            BookChapter(
                index=3,
                title="A Discussion",
                page_start=1,
                page_end=1,
                word_count=40,
                sections=[
                    BookSection(
                        title="A Discussion",
                        content="The classmates argued about change over dinner.",
                        page_start=1,
                        page_end=1,
                    )
                ],
            ),
        ],
    )


@pytest.fixture()
def api(monkeypatch):
    book = _degenerate_book()
    repositories = InMemoryRepositories()
    repositories.projects[PROJECT_ID] = construct_document(
        MangaProjectDoc,
        project_id=PROJECT_ID,
        book_id=str(book.id),
        owner_id="local",
        active_memory_version=0,
    )

    import asyncio

    async def seed():
        await repositories.save_source_units(source_units_for_book(book))

    asyncio.run(seed())

    async def fake_load(book_id: str) -> Book:
        if book_id == str(book.id):
            return book
        raise HTTPException(status_code=404, detail=f"book {book_id} not found")

    monkeypatch.setattr(scopes_module, "get_repositories", lambda: repositories)
    monkeypatch.setattr(scopes_module, "_load_book", fake_load)

    app = FastAPI()
    app.include_router(scopes_module.router)
    client = TestClient(app)
    return client, book, repositories


def test_create_scope_by_pages_and_idempotency(api):
    client, book, _ = api
    body = {
        "project_id": PROJECT_ID,
        "page_ranges": [{"page_start": 1, "page_end": 1}],
    }
    first = client.post(f"/books/{book.id}/scopes", json=body)
    assert first.status_code == 200, first.text
    second = client.post(f"/books/{book.id}/scopes", json=body)
    assert second.json()["scope_id"] == first.json()["scope_id"]
    # degenerate pages: a page scope catches every unit, front matter included
    assert len(first.json()["source_unit_ids"]) == 3


def test_create_scope_by_chapters_skips_front_matter_by_default(api):
    client, book, _ = api
    response = client.post(
        f"/books/{book.id}/scopes",
        json={"project_id": PROJECT_ID, "chapter_indexes": [1, 2]},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    # chapter 1 (Copyright) is front matter -> only The Story's unit remains
    assert len(payload["source_unit_ids"]) == 1
    assert payload["source_unit_ids"][0].startswith("section_0002_")
    assert payload["selection_label"] == "chapters 2"


def test_front_matter_only_selection_is_rejected_unless_included(api):
    client, book, _ = api
    refused = client.post(
        f"/books/{book.id}/scopes",
        json={"project_id": PROJECT_ID, "chapter_indexes": [1]},
    )
    assert refused.status_code == 422
    allowed = client.post(
        f"/books/{book.id}/scopes",
        json={
            "project_id": PROJECT_ID,
            "chapter_indexes": [1],
            "include_front_matter": True,
        },
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["source_unit_ids"][0].startswith("section_0001_")


def test_distinct_chapter_selections_get_distinct_scopes(api):
    client, book, _ = api
    story = client.post(
        f"/books/{book.id}/scopes",
        json={"project_id": PROJECT_ID, "chapter_indexes": [2]},
    ).json()
    discussion = client.post(
        f"/books/{book.id}/scopes",
        json={"project_id": PROJECT_ID, "chapter_indexes": [3]},
    ).json()
    assert story["scope_id"] != discussion["scope_id"]
    assert story["scope_hash"] != discussion["scope_hash"]


def test_selection_validation_errors(api):
    client, book, _ = api
    both = client.post(
        f"/books/{book.id}/scopes",
        json={
            "project_id": PROJECT_ID,
            "page_ranges": [{"page_start": 1, "page_end": 1}],
            "chapter_indexes": [2],
        },
    )
    assert both.status_code == 422
    neither = client.post(
        f"/books/{book.id}/scopes", json={"project_id": PROJECT_ID}
    )
    assert neither.status_code == 422
    unknown = client.post(
        f"/books/{book.id}/scopes",
        json={"project_id": PROJECT_ID, "chapter_indexes": [99]},
    )
    assert unknown.status_code == 422
    no_overlap = client.post(
        f"/books/{book.id}/scopes",
        json={
            "project_id": PROJECT_ID,
            "page_ranges": [{"page_start": 5, "page_end": 6}],
        },
    )
    assert no_overlap.status_code == 422  # degenerate pages: nothing beyond 1
    wrong_project = client.post(
        f"/books/{book.id}/scopes",
        json={"project_id": "someone-else", "chapter_indexes": [2]},
    )
    assert wrong_project.status_code == 422
    missing_book = client.post(
        "/books/000000000000000000000000/scopes",
        json={"project_id": PROJECT_ID, "chapter_indexes": [2]},
    )
    assert missing_book.status_code == 404


def test_list_scopes(api):
    client, book, _ = api
    client.post(
        f"/books/{book.id}/scopes",
        json={"project_id": PROJECT_ID, "chapter_indexes": [2]},
    )
    client.post(
        f"/books/{book.id}/scopes",
        json={"project_id": PROJECT_ID, "chapter_indexes": [3]},
    )
    listing = client.get(f"/books/{book.id}/scopes")
    assert listing.status_code == 200
    assert len(listing.json()["scopes"]) == 2


def test_coverage_view_shows_structure_front_matter_and_memory(api):
    client, book, repositories = api

    bare = client.get(f"/books/{book.id}/scopes/coverage")
    assert bare.status_code == 200
    chapters = bare.json()["chapters"]
    assert [c["chapter_index"] for c in chapters] == [0, 1, 2, 3]
    flags = {c["chapter_index"]: c["front_matter"] for c in chapters}
    assert flags == {0: True, 1: True, 2: False, 3: False}
    assert chapters[0]["has_units"] is False  # empty content -> no units
    assert chapters[2]["has_units"] is True
    assert bare.json()["memory_version"] is None

    # seed an accepted snapshot with coverage for The Story's unit
    story_unit = chapters[2]["units"][0]["source_unit_id"]
    snapshot_payload = {
        "project_id": PROJECT_ID,
        "memory_version": 1,
        "parent_version": 0,
        "coverage": {story_unit: {"beat_ids": ["b1"], "coverage_status": "covered"}},
    }
    import asyncio

    async def seed_snapshot():
        await repositories.save_memory_snapshot(
            construct_document(
                ProjectMemorySnapshotDoc,
                **snapshot_payload,
                content_hash="e" * 64,
            )
        )
        repositories.projects[PROJECT_ID].active_memory_version = 1

    asyncio.run(seed_snapshot())

    covered = client.get(
        f"/books/{book.id}/scopes/coverage", params={"project_id": PROJECT_ID}
    )
    assert covered.status_code == 200
    payload = covered.json()
    assert payload["memory_version"] == 1
    story_units = next(
        c for c in payload["chapters"] if c["chapter_index"] == 2
    )["units"]
    assert story_units[0]["coverage"] == {
        "beat_ids": ["b1"],
        "coverage_status": "covered",
    }

    unknown = client.get(
        f"/books/{book.id}/scopes/coverage", params={"project_id": "nope"}
    )
    assert unknown.status_code == 404
