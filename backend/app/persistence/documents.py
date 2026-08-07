"""Beanie document definitions for ScrollStack's durable control plane.

The public contracts remain the language boundary. These records deliberately
carry persistence-only fields such as idempotency keys and active pointers.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, TypeVar, cast

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


def utc_now() -> datetime:
    return datetime.now(UTC)


DocumentType = TypeVar("DocumentType", bound=Document)


def construct_document(document_type: type[DocumentType], **values: Any) -> DocumentType:
    """Create a validated-upstream record without requiring an initialized collection.

    Beanie's normal constructor requires Mongo initialization in version 2.0.
    Services accept already validated contracts, so this factory lets the same
    service code run against in-memory repositories without a fake database.
    """

    return cast(DocumentType, document_type.model_construct(**values))


class SourceUnitDoc(Document):
    book_id: str
    source_unit_id: str
    kind: str
    chapter_index: int | None = None
    heading_path: list[str] = Field(default_factory=list)
    page_start: int
    page_end: int
    text: str | None = None
    text_storage_ref: str | None = None
    text_hash: str
    token_count: int
    image_refs: list[str] = Field(default_factory=list)
    parse_version: str

    class Settings:
        name = "source_units"
        indexes = [
            IndexModel(
                [("book_id", ASCENDING), ("source_unit_id", ASCENDING)],
                unique=True,
                name="uq_source_unit",
            ),
            IndexModel(
                [
                    ("book_id", ASCENDING),
                    ("chapter_index", ASCENDING),
                    ("page_start", ASCENDING),
                ],
                name="ix_source_book_chapter_page",
            ),
            IndexModel(
                [("book_id", ASCENDING), ("text_hash", ASCENDING)],
                name="ix_source_book_hash",
            ),
        ]


class BookDoc(Document):
    book_id: str
    owner_id: str
    title: str
    author: str | None = None
    original_filename: str
    pdf_hash: str
    pdf_storage_ref: str
    status: str = "pending"
    total_pages: int = 0
    parse_version: str | None = None
    error_code: str | None = None
    error_detail: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "books"
        indexes = [
            IndexModel([("book_id", ASCENDING)], unique=True, name="uq_book_id"),
            IndexModel(
                [("owner_id", ASCENDING), ("pdf_hash", ASCENDING)],
                unique=True,
                name="uq_book_owner_pdf_hash",
            ),
            IndexModel(
                [("owner_id", ASCENDING), ("created_at", DESCENDING)],
                name="ix_book_owner_created",
            ),
            IndexModel([("status", ASCENDING)], name="ix_book_status"),
        ]


class ScopeManifestDoc(Document):
    project_id: str
    book_id: str
    scope_id: str
    source_unit_ids: list[str]
    page_ranges: list[dict[str, int]]
    selection_label: str
    scope_hash: str
    created_by: str
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "scope_manifests"
        indexes = [
            IndexModel([("scope_id", ASCENDING)], unique=True, name="uq_scope_id"),
            IndexModel(
                [("book_id", ASCENDING), ("created_at", DESCENDING)],
                name="ix_scope_book_created",
            ),
            IndexModel(
                [("project_id", ASCENDING), ("scope_hash", ASCENDING)],
                unique=True,
                name="uq_scope_project_hash",
            ),
        ]


class MangaProjectDoc(Document):
    project_id: str
    book_id: str
    owner_id: str
    active_memory_version: int = 0
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "manga_projects"
        indexes = [
            IndexModel([("project_id", ASCENDING)], unique=True, name="uq_manga_project"),
            IndexModel(
                [("book_id", ASCENDING), ("owner_id", ASCENDING)],
                name="ix_project_book_owner",
            ),
        ]


class ProjectMemorySnapshotDoc(Document):
    project_id: str
    memory_version: int
    parent_version: int | None = None
    book_spine: dict[str, Any] = Field(default_factory=dict)
    facts: list[dict[str, Any]] = Field(default_factory=list)
    character_state: list[dict[str, Any]] = Field(default_factory=list)
    world_state: dict[str, Any] = Field(default_factory=dict)
    continuity: dict[str, Any] = Field(default_factory=dict)
    coverage: dict[str, Any] = Field(default_factory=dict)
    asset_index: list[dict[str, Any]] = Field(default_factory=list)
    source_artifact_ids: list[str] = Field(default_factory=list)
    content_hash: str
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "project_memory_snapshots"
        indexes = [
            IndexModel(
                [("project_id", ASCENDING), ("memory_version", ASCENDING)],
                unique=True,
                name="uq_memory_project_version",
            ),
            IndexModel(
                [("project_id", ASCENDING), ("created_at", DESCENDING)],
                name="ix_memory_project_created",
            ),
            IndexModel([("content_hash", ASCENDING)], name="ix_memory_content_hash"),
        ]


class ArtifactDoc(Document):
    artifact_id: str
    project_id: str
    run_id: str
    stage_run_id: str | None = None
    kind: str
    schema_version: str
    content: dict[str, Any] | None = None
    storage_ref: str | None = None
    content_hash: str
    parent_artifact_ids: list[str] = Field(default_factory=list)
    author: str = "system"
    supersedes_artifact_id: str | None = None
    source_refs: list[dict[str, Any]] = Field(default_factory=list)
    model_receipt: dict[str, Any] | None = None
    validation_status: str
    validation_report: dict[str, Any]
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "artifacts"
        indexes = [
            IndexModel([("artifact_id", ASCENDING)], unique=True, name="uq_artifact_id"),
            IndexModel(
                [("run_id", ASCENDING), ("created_at", ASCENDING)],
                name="ix_artifact_run_created",
            ),
            IndexModel(
                [("project_id", ASCENDING), ("kind", ASCENDING), ("created_at", DESCENDING)],
                name="ix_artifact_project_kind_created",
            ),
            IndexModel(
                [
                    ("project_id", ASCENDING),
                    ("kind", ASCENDING),
                    ("validation_status", ASCENDING),
                    ("content.series_id", ASCENDING),
                    ("content.sequence", ASCENDING),
                ],
                name="ix_artifact_reel_project_catalog",
            ),
            IndexModel(
                [
                    ("kind", ASCENDING),
                    ("validation_status", ASCENDING),
                    ("content.series_id", ASCENDING),
                    ("content.sequence", ASCENDING),
                ],
                name="ix_artifact_reel_series_sequence",
            ),
            IndexModel(
                [
                    ("kind", ASCENDING),
                    ("validation_status", ASCENDING),
                    ("content.reel_id", ASCENDING),
                ],
                name="ix_artifact_reel_id",
            ),
            IndexModel([("content_hash", ASCENDING)], name="ix_artifact_content_hash"),
        ]


class GenerationRunDoc(Document):
    run_id: str
    project_id: str
    scope_id: str
    requested_outputs: list[str]
    pipeline_version: str
    memory_version: int
    status: str
    active_stage: str | None = None
    budget: dict[str, Any]
    created_by: str
    idempotency_key: str
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "generation_runs"
        indexes = [
            IndexModel([("run_id", ASCENDING)], unique=True, name="uq_generation_run"),
            IndexModel([("idempotency_key", ASCENDING)], unique=True, name="uq_run_idempotency"),
            IndexModel(
                [("project_id", ASCENDING), ("created_at", DESCENDING)],
                name="ix_run_project_created",
            ),
            IndexModel([("status", ASCENDING)], name="ix_run_status"),
        ]


class StageRunDoc(Document):
    stage_run_id: str
    run_id: str
    stage_name: str
    attempt: int
    status: str
    input_artifact_ids: list[str] = Field(default_factory=list)
    input_hash: str
    output_artifact_ids: list[str] = Field(default_factory=list)
    idempotency_key: str
    agent_session_id: str | None = None
    error_code: str | None = None
    error_detail: dict[str, Any] | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None

    class Settings:
        name = "stage_runs"
        indexes = [
            IndexModel([("stage_run_id", ASCENDING)], unique=True, name="uq_stage_run"),
            IndexModel([("idempotency_key", ASCENDING)], unique=True, name="uq_stage_idempotency"),
            IndexModel(
                [("run_id", ASCENDING), ("stage_name", ASCENDING), ("attempt", DESCENDING)],
                name="ix_stage_run_name_attempt",
            ),
            IndexModel([("status", ASCENDING)], name="ix_stage_status"),
        ]


class SeriesProgressDoc(Document):
    user_id: str
    series_id: str
    last_manga_page: int
    last_reel_id: str | None = None
    viewed_reel_ids: list[str] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "series_progress"
        indexes = [
            IndexModel(
                [("user_id", ASCENDING), ("series_id", ASCENDING)],
                unique=True,
                name="uq_progress_user_series",
            ),
            IndexModel([("updated_at", DESCENDING)], name="ix_progress_updated"),
        ]


DOCUMENT_MODELS: tuple[type[Document], ...] = (
    BookDoc,
    SourceUnitDoc,
    ScopeManifestDoc,
    MangaProjectDoc,
    ProjectMemorySnapshotDoc,
    ArtifactDoc,
    GenerationRunDoc,
    StageRunDoc,
    SeriesProgressDoc,
)
