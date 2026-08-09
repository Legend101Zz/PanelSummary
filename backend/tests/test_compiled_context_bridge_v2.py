"""Flag-gated durable-context consumption for the v1 pipeline (ADR-011).

Exercises CompiledContextBridge against InMemoryRepositories: genesis
snapshots, idempotent scope/run/artifact persistence, byte-equal source text,
the post-slice memory delta, two-slice continuity, stale-delta rejection, and
the fail-loud drift guard. The live-Atlas equivalents run in
backend/scripts/continuity_proof_wmc.py.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from beanie import PydanticObjectId

from app.config import Settings
from app.domain.manga import SourceRange, SourceSlice, SourceSliceMode
from app.models import Book, BookChapter, BookSection
from app.persistence.documents import MangaProjectDoc, construct_document
from app.persistence.repositories import InMemoryRepositories
from app.persistence.v1_bridge import WIRED_DOCUMENT_MODELS, ensure_genesis_snapshot
from app.services.book_normalization import source_units_for_book
from app.services.compiled_context_bridge import (
    CompiledContextBridge,
    CompiledContextError,
    sanitize_identifier,
)
from app.services.errors import StaleMemoryDeltaError
from app.services.manga.generation_service import build_source_text_for_slice

PROJECT_ID = "proj-bridge-1"


def _book() -> Book:
    return construct_document(
        Book,
        id=PydanticObjectId(),
        title="Bridge Fixture",
        pdf_hash="a" * 64,
        total_pages=6,
        total_chapters=3,
        chapters=[
            BookChapter(
                index=0,
                title="Opening",
                page_start=1,
                page_end=2,
                word_count=20,
                sections=[
                    BookSection(
                        title="Start",
                        content="The mice woke early and ran the maze.",
                        page_start=1,
                        page_end=2,
                    )
                ],
            ),
            BookChapter(
                index=1,
                title="Middle",
                page_start=3,
                page_end=4,
                word_count=20,
                sections=[
                    BookSection(
                        title="Turn",
                        content="The cheese was gone; someone had moved it.",
                        page_start=3,
                        page_end=4,
                    )
                ],
            ),
            BookChapter(
                index=2,
                title="End",
                page_start=5,
                page_end=6,
                word_count=20,
                sections=[
                    BookSection(
                        title="Close",
                        content="Haw laughed at himself and let go.",
                        page_start=5,
                        page_end=6,
                    )
                ],
            ),
        ],
    )


def _slice(book: Book, page_start: int, page_end: int) -> SourceSlice:
    return SourceSlice(
        slice_id=f"s{page_start}",
        book_id=str(book.id),
        mode=SourceSliceMode.PAGES,
        source_range=SourceRange(page_start=page_start, page_end=page_end),
    )


async def _seeded(book: Book) -> InMemoryRepositories:
    repositories = InMemoryRepositories()
    repositories.projects[PROJECT_ID] = construct_document(
        MangaProjectDoc,
        project_id=PROJECT_ID,
        book_id=str(book.id),
        owner_id="local",
        active_memory_version=0,
    )
    await repositories.save_source_units(source_units_for_book(book))
    return repositories


def _bridge(repositories: InMemoryRepositories) -> CompiledContextBridge:
    return CompiledContextBridge(repositories, max_input_tokens=100_000)


def test_wired_models_exclude_colliding_docs():
    names = {model.__name__ for model in WIRED_DOCUMENT_MODELS}
    assert "BookDoc" not in names
    assert "MangaProjectDoc" not in names
    assert len(WIRED_DOCUMENT_MODELS) == 7


def test_use_compiled_context_defaults_off():
    assert Settings(_env_file=None).use_compiled_context is False


def test_sanitize_identifier_matches_contract_pattern():
    assert sanitize_identifier("beat 1!", "fb") == "beat-1-"
    assert sanitize_identifier("  ", "fb") == "fb"
    assert sanitize_identifier("-lead", "fb").startswith("b")
    assert sanitize_identifier("ok_id:2", "fb") == "ok_id:2"


def test_genesis_snapshot_created_once():
    async def scenario():
        book = _book()
        repositories = await _seeded(book)
        first = await ensure_genesis_snapshot(repositories, PROJECT_ID)
        second = await ensure_genesis_snapshot(repositories, PROJECT_ID)
        assert first.memory_version == 0
        assert second.content_hash == first.content_hash
        with pytest.raises(ValueError, match="does not exist"):
            await ensure_genesis_snapshot(repositories, "missing-project")

    asyncio.run(scenario())


def test_compile_slice_context_is_byte_equal_and_idempotent():
    async def scenario():
        book = _book()
        repositories = await _seeded(book)
        bridge = _bridge(repositories)
        source_slice = _slice(book, 1, 4)

        compiled = await bridge.compile_slice_context(
            book=book, project_id=PROJECT_ID, source_slice=source_slice
        )
        legacy = build_source_text_for_slice(book.chapters, source_slice)
        assert compiled.source_text == legacy
        assert compiled.memory_version == 0

        artifact = await repositories.get_artifact(compiled.artifact_id)
        assert artifact is not None
        assert artifact.kind == "context_pack"
        assert artifact.validation_status == "accepted"
        assert artifact.content_hash == compiled.pack.content_hash

        run = await repositories.get_run(compiled.run_id)
        assert run is not None and run.scope_id == compiled.scope_id

        again = await bridge.compile_slice_context(
            book=book, project_id=PROJECT_ID, source_slice=source_slice
        )
        assert again.scope_id == compiled.scope_id
        assert again.run_id == compiled.run_id
        assert again.artifact_id == compiled.artifact_id
        assert again.pack.content_hash == compiled.pack.content_hash

    asyncio.run(scenario())


def test_compile_requires_normalized_book():
    async def scenario():
        book = _book()
        repositories = InMemoryRepositories()
        repositories.projects[PROJECT_ID] = construct_document(
            MangaProjectDoc,
            project_id=PROJECT_ID,
            book_id=str(book.id),
            owner_id="local",
            active_memory_version=0,
        )
        bridge = _bridge(repositories)
        with pytest.raises(CompiledContextError, match="no source units"):
            await bridge.compile_slice_context(
                book=book, project_id=PROJECT_ID, source_slice=_slice(book, 1, 2)
            )

    asyncio.run(scenario())


def test_compile_fails_loud_on_unit_drift():
    async def scenario():
        book = _book()
        repositories = await _seeded(book)
        # tamper with the stored copy of chapter 0's unit
        for key, unit in repositories.source_units.items():
            if unit.chapter_index == 0:
                unit.text = unit.text + " tampered"
        bridge = _bridge(repositories)
        from app.services.book_normalization import SourceUnitMismatchError

        with pytest.raises(SourceUnitMismatchError):
            await bridge.compile_slice_context(
                book=book, project_id=PROJECT_ID, source_slice=_slice(book, 1, 2)
            )

    asyncio.run(scenario())


def test_record_slice_outcome_advances_memory_with_coverage_and_continuity():
    async def scenario():
        book = _book()
        repositories = await _seeded(book)
        bridge = _bridge(repositories)
        compiled = await bridge.compile_slice_context(
            book=book, project_id=PROJECT_ID, source_slice=_slice(book, 1, 4)
        )
        version = await bridge.record_slice_outcome(
            compiled=compiled,
            project_id=PROJECT_ID,
            beat_ids=["beat 1!", "beat_02"],
            previous_slice_ending="Haw stepped into the dark corridor.",
            last_page_hook="What lay beyond?",
        )
        assert version == 1
        project = await repositories.get_project(PROJECT_ID)
        assert project.active_memory_version == 1
        snapshot = await repositories.get_memory_snapshot(PROJECT_ID, 1)
        scope = await repositories.get_scope(compiled.scope_id)
        assert set(snapshot.coverage) == set(scope.source_unit_ids)
        for entry in snapshot.coverage.values():
            assert entry["beat_ids"] == ["beat-1-", "beat_02"]
        assert snapshot.continuity["previous_slice_ending"] == (
            "Haw stepped into the dark corridor."
        )
        assert snapshot.continuity["last_page_hook"] == "What lay beyond?"
        run = await repositories.get_run(compiled.run_id)
        assert run.status == "succeeded"

        # replaying the same outcome against the advanced pointer is stale
        with pytest.raises(StaleMemoryDeltaError):
            await bridge.record_slice_outcome(
                compiled=compiled,
                project_id=PROJECT_ID,
                beat_ids=["beat_02"],
                previous_slice_ending="Different ending.",
                last_page_hook="",
            )

    asyncio.run(scenario())


def test_outcome_without_beats_skips_coverage_but_keeps_continuity():
    async def scenario():
        book = _book()
        repositories = await _seeded(book)
        bridge = _bridge(repositories)
        compiled = await bridge.compile_slice_context(
            book=book, project_id=PROJECT_ID, source_slice=_slice(book, 1, 2)
        )
        version = await bridge.record_slice_outcome(
            compiled=compiled,
            project_id=PROJECT_ID,
            beat_ids=[],
            previous_slice_ending="An ending.",
            last_page_hook="",
        )
        snapshot = await repositories.get_memory_snapshot(PROJECT_ID, version)
        assert snapshot.coverage == {}
        assert snapshot.continuity["previous_slice_ending"] == "An ending."

    asyncio.run(scenario())


def test_second_slice_pack_carries_first_slice_memory():
    """In-memory mirror of the Phase 1 exit: slice B's compiled context
    contains slice A's accepted continuity, via Mongo-shaped state only."""

    async def scenario():
        book = _book()
        repositories = await _seeded(book)
        bridge = _bridge(repositories)

        slice_a = await bridge.compile_slice_context(
            book=book, project_id=PROJECT_ID, source_slice=_slice(book, 1, 4)
        )
        assert slice_a.pack.continuity.previous_slice_ending is None
        await bridge.record_slice_outcome(
            compiled=slice_a,
            project_id=PROJECT_ID,
            beat_ids=["beat_01"],
            previous_slice_ending="The cheese was gone; Haw chose the maze.",
            last_page_hook="Deeper in.",
        )

        slice_b = await bridge.compile_slice_context(
            book=book, project_id=PROJECT_ID, source_slice=_slice(book, 5, 6)
        )
        assert slice_b.memory_version == 1
        assert slice_b.pack.continuity.previous_slice_ending == (
            "The cheese was gone; Haw chose the maze."
        )
        assert slice_b.scope_id != slice_a.scope_id
        legacy_b = build_source_text_for_slice(book.chapters, _slice(book, 5, 6))
        assert slice_b.source_text == legacy_b

    asyncio.run(scenario())
