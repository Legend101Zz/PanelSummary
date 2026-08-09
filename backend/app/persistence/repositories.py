"""In-memory test adapter and Beanie production adapter."""

from __future__ import annotations

import asyncio
from typing import TypeVar, cast

from pymongo.errors import DuplicateKeyError

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
    utc_now,
)

DocumentRecord = TypeVar("DocumentRecord")


def _copy_document(record: DocumentRecord) -> DocumentRecord:
    return cast(DocumentRecord, record.model_copy(deep=True))  # type: ignore[attr-defined]


class InMemoryRepositories:
    """A deterministic adapter for unit tests and local contract exploration."""

    def __init__(self) -> None:
        self.books: dict[str, BookDoc] = {}
        self.source_units: dict[tuple[str, str], SourceUnitDoc] = {}
        self.scopes: dict[str, ScopeManifestDoc] = {}
        self.projects: dict[str, MangaProjectDoc] = {}
        self.memory_snapshots: dict[tuple[str, int], ProjectMemorySnapshotDoc] = {}
        self.artifacts: dict[str, ArtifactDoc] = {}
        self.series_progress: dict[tuple[str, str], SeriesProgressDoc] = {}
        self.runs: dict[str, GenerationRunDoc] = {}
        self.stages: dict[str, StageRunDoc] = {}
        self._lock = asyncio.Lock()

    async def create_book_if_absent(self, book: BookDoc) -> tuple[BookDoc, bool]:
        async with self._lock:
            existing = next(
                (
                    item
                    for item in self.books.values()
                    if item.owner_id == book.owner_id and item.pdf_hash == book.pdf_hash
                ),
                None,
            )
            if existing is not None:
                return _copy_document(existing), False
            self.books[book.book_id] = _copy_document(book)
            return _copy_document(book), True

    async def get_book(self, book_id: str) -> BookDoc | None:
        book = self.books.get(book_id)
        return _copy_document(book) if book else None

    async def list_books(self, owner_id: str | None = None) -> list[BookDoc]:
        books = [
            item.model_copy(deep=True)
            for item in self.books.values()
            if owner_id is None or item.owner_id == owner_id
        ]
        return sorted(books, key=lambda item: (item.created_at, item.book_id), reverse=True)

    async def save_book(self, book: BookDoc) -> BookDoc:
        self.books[book.book_id] = _copy_document(book)
        return _copy_document(book)

    async def save_source_units(self, units: list[SourceUnitDoc]) -> None:
        for unit in units:
            self.source_units[(unit.book_id, unit.source_unit_id)] = unit.model_copy(deep=True)

    async def list_source_units(self, book_id: str) -> list[SourceUnitDoc]:
        units = [
            unit.model_copy(deep=True)
            for (bid, _), unit in self.source_units.items()
            if bid == book_id
        ]
        return sorted(
            units,
            key=lambda unit: (
                unit.page_start,
                unit.page_end,
                unit.chapter_index if unit.chapter_index is not None else 1_000_000,
                unit.source_unit_id,
            ),
        )

    async def get_source_unit(self, book_id: str, source_unit_id: str) -> SourceUnitDoc | None:
        unit = self.source_units.get((book_id, source_unit_id))
        return _copy_document(unit) if unit else None

    async def create_scope(self, scope: ScopeManifestDoc) -> ScopeManifestDoc:
        async with self._lock:
            existing = self.scopes.get(scope.scope_id)
            if existing is not None:
                return _copy_document(existing)
            self.scopes[scope.scope_id] = _copy_document(scope)
            return _copy_document(scope)

    async def get_scope(self, scope_id: str) -> ScopeManifestDoc | None:
        scope = self.scopes.get(scope_id)
        return _copy_document(scope) if scope else None

    async def list_scopes(self, book_id: str) -> list[ScopeManifestDoc]:
        scopes = [
            scope.model_copy(deep=True)
            for scope in self.scopes.values()
            if scope.book_id == book_id
        ]
        return sorted(scopes, key=lambda scope: (scope.created_at, scope.scope_id), reverse=True)

    async def get_project(self, project_id: str) -> MangaProjectDoc | None:
        project = self.projects.get(project_id)
        return _copy_document(project) if project else None

    async def save_project(self, project: MangaProjectDoc) -> MangaProjectDoc:
        self.projects[project.project_id] = _copy_document(project)
        return _copy_document(project)

    async def save_memory_snapshot(
        self, snapshot: ProjectMemorySnapshotDoc
    ) -> ProjectMemorySnapshotDoc:
        key = (snapshot.project_id, snapshot.memory_version)
        existing = self.memory_snapshots.get(key)
        if existing is not None and existing.content_hash != snapshot.content_hash:
            raise ValueError("memory snapshot identity already has different content")
        self.memory_snapshots[key] = _copy_document(snapshot)
        return _copy_document(snapshot)

    async def get_memory_snapshot(
        self, project_id: str, memory_version: int
    ) -> ProjectMemorySnapshotDoc | None:
        snapshot = self.memory_snapshots.get((project_id, memory_version))
        return _copy_document(snapshot) if snapshot else None

    async def advance_memory(
        self,
        project_id: str,
        expected_version: int,
        snapshot: ProjectMemorySnapshotDoc,
    ) -> bool:
        async with self._lock:
            project = self.projects.get(project_id)
            if project is None or project.active_memory_version != expected_version:
                return False
            key = (project_id, snapshot.memory_version)
            if key in self.memory_snapshots:
                return False
            self.memory_snapshots[key] = snapshot.model_copy(deep=True)
            project.active_memory_version = snapshot.memory_version
            project.updated_at = utc_now()
            self.projects[project_id] = project
            return True

    async def save_artifact(self, artifact: ArtifactDoc) -> ArtifactDoc:
        async with self._lock:
            existing = self.artifacts.get(artifact.artifact_id)
            if existing is not None:
                if existing.content_hash != artifact.content_hash:
                    raise ValueError("artifact identity already has different content")
                return _copy_document(existing)
            self.artifacts[artifact.artifact_id] = _copy_document(artifact)
            return _copy_document(artifact)

    async def get_artifact(self, artifact_id: str) -> ArtifactDoc | None:
        artifact = self.artifacts.get(artifact_id)
        return _copy_document(artifact) if artifact else None

    async def list_artifacts(self, run_id: str, *, accepted_only: bool) -> list[ArtifactDoc]:
        artifacts = [
            artifact.model_copy(deep=True)
            for artifact in self.artifacts.values()
            if artifact.run_id == run_id
            and (not accepted_only or artifact.validation_status == "accepted")
        ]
        return sorted(artifacts, key=lambda artifact: (artifact.created_at, artifact.artifact_id))

    async def list_accepted_reel_specs(self, project_id: str) -> list[ArtifactDoc]:
        artifacts = [
            artifact.model_copy(deep=True)
            for artifact in self.artifacts.values()
            if artifact.project_id == project_id
            and artifact.kind == "reel_spec"
            and artifact.validation_status == "accepted"
            and artifact.content is not None
        ]
        return sorted(
            artifacts,
            key=lambda artifact: (artifact.created_at, artifact.artifact_id),
        )

    async def list_accepted_reel_specs_for_series(
        self, series_id: str
    ) -> list[ArtifactDoc]:
        artifacts = [
            artifact.model_copy(deep=True)
            for artifact in self.artifacts.values()
            if artifact.kind == "reel_spec"
            and artifact.validation_status == "accepted"
            and artifact.content is not None
            and artifact.content.get("series_id") == series_id
        ]
        return sorted(
            artifacts,
            key=lambda artifact: (artifact.created_at, artifact.artifact_id),
        )

    async def get_accepted_reel_spec(self, reel_id: str) -> ArtifactDoc | None:
        matches = [
            artifact
            for artifact in self.artifacts.values()
            if artifact.kind == "reel_spec"
            and artifact.validation_status == "accepted"
            and artifact.content is not None
            and artifact.content.get("reel_id") == reel_id
        ]
        if not matches:
            return None
        latest = max(matches, key=lambda artifact: (artifact.created_at, artifact.artifact_id))
        return _copy_document(latest)

    async def get_series_progress(
        self, user_id: str, series_id: str
    ) -> SeriesProgressDoc | None:
        progress = self.series_progress.get((user_id, series_id))
        return _copy_document(progress) if progress else None

    async def save_series_progress(
        self, progress: SeriesProgressDoc
    ) -> SeriesProgressDoc:
        key = (progress.user_id, progress.series_id)
        async with self._lock:
            existing = self.series_progress.get(key)
            if existing is not None and _same_progress(existing, progress):
                return _copy_document(existing)
            self.series_progress[key] = _copy_document(progress)
            return _copy_document(progress)

    async def create_run_if_absent(self, run: GenerationRunDoc) -> tuple[GenerationRunDoc, bool]:
        async with self._lock:
            existing = next(
                (
                    item
                    for item in self.runs.values()
                    if item.idempotency_key == run.idempotency_key
                ),
                None,
            )
            if existing:
                return _copy_document(existing), False
            self.runs[run.run_id] = _copy_document(run)
            return _copy_document(run), True

    async def get_run(self, run_id: str) -> GenerationRunDoc | None:
        run = self.runs.get(run_id)
        return _copy_document(run) if run else None

    async def list_project_runs(self, project_id: str) -> list[GenerationRunDoc]:
        runs = [
            item.model_copy(deep=True)
            for item in self.runs.values()
            if item.project_id == project_id
        ]
        return sorted(runs, key=lambda item: (item.updated_at, item.run_id), reverse=True)

    async def save_run(self, run: GenerationRunDoc) -> GenerationRunDoc:
        self.runs[run.run_id] = _copy_document(run)
        return _copy_document(run)

    async def list_stages(self, run_id: str) -> list[StageRunDoc]:
        stages = [
            stage.model_copy(deep=True) for stage in self.stages.values() if stage.run_id == run_id
        ]
        return sorted(
            stages,
            key=lambda stage: (stage.stage_name, stage.attempt, stage.stage_run_id),
        )

    async def get_stage(self, stage_run_id: str) -> StageRunDoc | None:
        stage = self.stages.get(stage_run_id)
        return _copy_document(stage) if stage else None

    async def save_stage(self, stage: StageRunDoc) -> StageRunDoc:
        self.stages[stage.stage_run_id] = _copy_document(stage)
        return _copy_document(stage)


class BeanieRepositories:
    """Mongo-backed implementation used after ``initialize_mongo``."""

    async def create_book_if_absent(self, book: BookDoc) -> tuple[BookDoc, bool]:
        try:
            return cast(BookDoc, await book.insert()), True
        except DuplicateKeyError:
            existing = await BookDoc.find_one(
                BookDoc.owner_id == book.owner_id,
                BookDoc.pdf_hash == book.pdf_hash,
            )
            if existing is None:
                raise
            return existing, False

    async def get_book(self, book_id: str) -> BookDoc | None:
        return await BookDoc.find_one(BookDoc.book_id == book_id)

    async def list_books(self, owner_id: str | None = None) -> list[BookDoc]:
        query: dict[str, object] = {}
        if owner_id is not None:
            query["owner_id"] = owner_id
        return await BookDoc.find(query).sort(-BookDoc.created_at).to_list()

    async def save_book(self, book: BookDoc) -> BookDoc:
        existing = await self.get_book(book.book_id)
        if existing is None:
            return cast(BookDoc, await book.insert())
        book.id = existing.id
        return cast(BookDoc, await book.replace())

    async def save_source_units(self, units: list[SourceUnitDoc]) -> None:
        for unit in units:
            existing = await SourceUnitDoc.find_one(
                SourceUnitDoc.book_id == unit.book_id,
                SourceUnitDoc.source_unit_id == unit.source_unit_id,
            )
            if existing is None:
                await unit.insert()
            elif existing.text_hash != unit.text_hash:
                unit.id = existing.id
                await unit.replace()

    async def list_source_units(self, book_id: str) -> list[SourceUnitDoc]:
        return (
            await SourceUnitDoc.find(SourceUnitDoc.book_id == book_id)
            .sort(+SourceUnitDoc.page_start, +SourceUnitDoc.source_unit_id)
            .to_list()
        )

    async def get_source_unit(self, book_id: str, source_unit_id: str) -> SourceUnitDoc | None:
        return await SourceUnitDoc.find_one(
            SourceUnitDoc.book_id == book_id,
            SourceUnitDoc.source_unit_id == source_unit_id,
        )

    async def create_scope(self, scope: ScopeManifestDoc) -> ScopeManifestDoc:
        try:
            return cast(ScopeManifestDoc, await scope.insert())
        except DuplicateKeyError:
            existing = await ScopeManifestDoc.find_one(ScopeManifestDoc.scope_id == scope.scope_id)
            if existing is None:
                raise
            return existing

    async def get_scope(self, scope_id: str) -> ScopeManifestDoc | None:
        return await ScopeManifestDoc.find_one(ScopeManifestDoc.scope_id == scope_id)

    async def list_scopes(self, book_id: str) -> list[ScopeManifestDoc]:
        return (
            await ScopeManifestDoc.find(ScopeManifestDoc.book_id == book_id)
            .sort(-ScopeManifestDoc.created_at)
            .to_list()
        )

    async def get_project(self, project_id: str) -> MangaProjectDoc | None:
        return await MangaProjectDoc.find_one(MangaProjectDoc.project_id == project_id)

    async def save_project(self, project: MangaProjectDoc) -> MangaProjectDoc:
        existing = await self.get_project(project.project_id)
        if existing is None:
            return cast(MangaProjectDoc, await project.insert())
        project.id = existing.id
        return cast(MangaProjectDoc, await project.replace())

    async def save_memory_snapshot(
        self, snapshot: ProjectMemorySnapshotDoc
    ) -> ProjectMemorySnapshotDoc:
        try:
            return cast(ProjectMemorySnapshotDoc, await snapshot.insert())
        except DuplicateKeyError:
            existing = await self.get_memory_snapshot(snapshot.project_id, snapshot.memory_version)
            if existing is None or existing.content_hash != snapshot.content_hash:
                raise
            return existing

    async def get_memory_snapshot(
        self, project_id: str, memory_version: int
    ) -> ProjectMemorySnapshotDoc | None:
        return await ProjectMemorySnapshotDoc.find_one(
            ProjectMemorySnapshotDoc.project_id == project_id,
            ProjectMemorySnapshotDoc.memory_version == memory_version,
        )

    async def advance_memory(
        self,
        project_id: str,
        expected_version: int,
        snapshot: ProjectMemorySnapshotDoc,
    ) -> bool:
        try:
            await snapshot.insert()
        except DuplicateKeyError:
            existing = await self.get_memory_snapshot(project_id, snapshot.memory_version)
            if existing is None or existing.content_hash != snapshot.content_hash:
                return False
        result = await MangaProjectDoc.find_one(
            MangaProjectDoc.project_id == project_id,
            MangaProjectDoc.active_memory_version == expected_version,
        ).update(
            {
                "$set": {
                    "active_memory_version": snapshot.memory_version,
                    "updated_at": utc_now(),
                }
            }
        )
        return bool(result.modified_count)

    async def save_artifact(self, artifact: ArtifactDoc) -> ArtifactDoc:
        try:
            return cast(ArtifactDoc, await artifact.insert())
        except DuplicateKeyError:
            existing = await self.get_artifact(artifact.artifact_id)
            if existing is None or existing.content_hash != artifact.content_hash:
                raise
            return existing

    async def get_artifact(self, artifact_id: str) -> ArtifactDoc | None:
        return await ArtifactDoc.find_one(ArtifactDoc.artifact_id == artifact_id)

    async def list_artifacts(self, run_id: str, *, accepted_only: bool) -> list[ArtifactDoc]:
        query: dict[str, object] = {"run_id": run_id}
        if accepted_only:
            query["validation_status"] = "accepted"
        return await ArtifactDoc.find(query).sort(+ArtifactDoc.created_at).to_list()

    async def list_accepted_reel_specs(self, project_id: str) -> list[ArtifactDoc]:
        return (
            await ArtifactDoc.find(
                {
                    "project_id": project_id,
                    "kind": "reel_spec",
                    "validation_status": "accepted",
                    "content": {"$ne": None},
                }
            )
            .sort(+ArtifactDoc.created_at, +ArtifactDoc.artifact_id)
            .to_list()
        )

    async def list_accepted_reel_specs_for_series(
        self, series_id: str
    ) -> list[ArtifactDoc]:
        return (
            await ArtifactDoc.find(
                {
                    "kind": "reel_spec",
                    "validation_status": "accepted",
                    "content.series_id": series_id,
                }
            )
            .sort(+ArtifactDoc.created_at, +ArtifactDoc.artifact_id)
            .to_list()
        )

    async def get_accepted_reel_spec(self, reel_id: str) -> ArtifactDoc | None:
        return await ArtifactDoc.find(
            {
                "kind": "reel_spec",
                "validation_status": "accepted",
                "content.reel_id": reel_id,
            }
        ).sort(-ArtifactDoc.created_at, -ArtifactDoc.artifact_id).first_or_none()

    async def get_series_progress(
        self, user_id: str, series_id: str
    ) -> SeriesProgressDoc | None:
        return await SeriesProgressDoc.find_one(
            SeriesProgressDoc.user_id == user_id,
            SeriesProgressDoc.series_id == series_id,
        )

    async def save_series_progress(
        self, progress: SeriesProgressDoc
    ) -> SeriesProgressDoc:
        existing = await self.get_series_progress(progress.user_id, progress.series_id)
        if existing is not None:
            if _same_progress(existing, progress):
                return existing
            progress.id = existing.id
            return cast(SeriesProgressDoc, await progress.replace())
        try:
            return cast(SeriesProgressDoc, await progress.insert())
        except DuplicateKeyError:
            existing = await self.get_series_progress(progress.user_id, progress.series_id)
            if existing is None:
                raise
            if _same_progress(existing, progress):
                return existing
            progress.id = existing.id
            return cast(SeriesProgressDoc, await progress.replace())

    async def create_run_if_absent(self, run: GenerationRunDoc) -> tuple[GenerationRunDoc, bool]:
        try:
            return await run.insert(), True
        except DuplicateKeyError:
            existing = await GenerationRunDoc.find_one(
                GenerationRunDoc.idempotency_key == run.idempotency_key
            )
            if existing is None:
                raise
            return existing, False

    async def get_run(self, run_id: str) -> GenerationRunDoc | None:
        return await GenerationRunDoc.find_one(GenerationRunDoc.run_id == run_id)

    async def list_project_runs(self, project_id: str) -> list[GenerationRunDoc]:
        return (
            await GenerationRunDoc.find(GenerationRunDoc.project_id == project_id)
            .sort(-GenerationRunDoc.updated_at)
            .to_list()
        )

    async def save_run(self, run: GenerationRunDoc) -> GenerationRunDoc:
        existing = await self.get_run(run.run_id)
        if existing is None:
            return cast(GenerationRunDoc, await run.insert())
        run.id = existing.id
        return cast(GenerationRunDoc, await run.replace())

    async def list_stages(self, run_id: str) -> list[StageRunDoc]:
        return (
            await StageRunDoc.find(StageRunDoc.run_id == run_id)
            .sort(+StageRunDoc.stage_name, +StageRunDoc.attempt)
            .to_list()
        )

    async def get_stage(self, stage_run_id: str) -> StageRunDoc | None:
        return await StageRunDoc.find_one(StageRunDoc.stage_run_id == stage_run_id)

    async def save_stage(self, stage: StageRunDoc) -> StageRunDoc:
        existing = await StageRunDoc.find_one(StageRunDoc.stage_run_id == stage.stage_run_id)
        if existing is None:
            return cast(StageRunDoc, await stage.insert())
        stage.id = existing.id
        return cast(StageRunDoc, await stage.replace())


def _same_progress(left: SeriesProgressDoc, right: SeriesProgressDoc) -> bool:
    return (
        left.last_manga_page == right.last_manga_page
        and left.last_reel_id == right.last_reel_id
        and left.viewed_reel_ids == right.viewed_reel_ids
    )
