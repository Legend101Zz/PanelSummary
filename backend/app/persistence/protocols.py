"""Narrow repository protocols for testable control-plane services."""

from __future__ import annotations

from typing import Protocol

from .documents import (
    ArtifactDoc,
    BookDoc,
    GenerationRunDoc,
    MangaProjectDoc,
    ProjectMemorySnapshotDoc,
    ScopeManifestDoc,
    SeriesProgressDoc,
    SourceUnitDoc,
    StageRunDoc,
)


class BookRepository(Protocol):
    async def create_book_if_absent(self, book: BookDoc) -> tuple[BookDoc, bool]: ...

    async def get_book(self, book_id: str) -> BookDoc | None: ...

    async def list_books(self, owner_id: str | None = None) -> list[BookDoc]: ...

    async def save_book(self, book: BookDoc) -> BookDoc: ...


class SourceUnitRepository(Protocol):
    async def save_source_units(self, units: list[SourceUnitDoc]) -> None: ...

    async def list_source_units(self, book_id: str) -> list[SourceUnitDoc]: ...

    async def get_source_unit(self, book_id: str, source_unit_id: str) -> SourceUnitDoc | None: ...


class ScopeRepository(Protocol):
    async def create_scope(self, scope: ScopeManifestDoc) -> ScopeManifestDoc: ...

    async def get_scope(self, scope_id: str) -> ScopeManifestDoc | None: ...

    async def list_scopes(self, book_id: str) -> list[ScopeManifestDoc]: ...


class MemoryRepository(Protocol):
    async def get_project(self, project_id: str) -> MangaProjectDoc | None: ...

    async def save_project(self, project: MangaProjectDoc) -> MangaProjectDoc: ...

    async def save_memory_snapshot(
        self, snapshot: ProjectMemorySnapshotDoc
    ) -> ProjectMemorySnapshotDoc: ...

    async def get_memory_snapshot(
        self, project_id: str, memory_version: int
    ) -> ProjectMemorySnapshotDoc | None: ...

    async def advance_memory(
        self,
        project_id: str,
        expected_version: int,
        snapshot: ProjectMemorySnapshotDoc,
    ) -> bool: ...


class ArtifactRepository(Protocol):
    async def save_artifact(self, artifact: ArtifactDoc) -> ArtifactDoc: ...

    async def get_artifact(self, artifact_id: str) -> ArtifactDoc | None: ...

    async def list_artifacts(self, run_id: str, *, accepted_only: bool) -> list[ArtifactDoc]: ...


class ReelReadRepository(Protocol):
    async def list_accepted_reel_specs(self, project_id: str) -> list[ArtifactDoc]: ...

    async def list_accepted_reel_specs_for_series(
        self, series_id: str
    ) -> list[ArtifactDoc]: ...

    async def get_accepted_reel_spec(self, reel_id: str) -> ArtifactDoc | None: ...


class SeriesProgressRepository(Protocol):
    async def get_series_progress(
        self, user_id: str, series_id: str
    ) -> SeriesProgressDoc | None: ...

    async def save_series_progress(
        self, progress: SeriesProgressDoc
    ) -> SeriesProgressDoc: ...


class RunRepository(Protocol):
    async def create_run_if_absent(
        self, run: GenerationRunDoc
    ) -> tuple[GenerationRunDoc, bool]: ...

    async def get_run(self, run_id: str) -> GenerationRunDoc | None: ...

    async def list_project_runs(self, project_id: str) -> list[GenerationRunDoc]: ...

    async def save_run(self, run: GenerationRunDoc) -> GenerationRunDoc: ...

    async def list_stages(self, run_id: str) -> list[StageRunDoc]: ...

    async def get_stage(self, stage_run_id: str) -> StageRunDoc | None: ...

    async def save_stage(self, stage: StageRunDoc) -> StageRunDoc: ...


class WorkflowDispatcher(Protocol):
    def enqueue_generation_run(self, run_id: str) -> None: ...


class PdfIngestionDispatcher(Protocol):
    def enqueue_pdf_ingestion(self, book_id: str) -> str: ...


class Repositories(
    BookRepository,
    SourceUnitRepository,
    ScopeRepository,
    MemoryRepository,
    ArtifactRepository,
    ReelReadRepository,
    SeriesProgressRepository,
    RunRepository,
    Protocol,
):
    """Aggregate adapter contract used only by the composition root."""
