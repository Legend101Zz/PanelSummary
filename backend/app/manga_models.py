"""MongoDB documents for the revamp manga project pipeline.

These are persistence snapshots, not business logic. The typed domain models live
under `app.domain.manga`; this layer stores durable project/slice/page/asset
state and keeps legacy `BookSummary` free to remain a compatibility adapter.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from beanie import Document, Indexed
from pydantic import Field


def _now() -> datetime:
    return datetime.now(UTC)


class MangaProjectDoc(Document):
    """Root document for a persistent manga adaptation project."""

    book_id: Indexed(str)  # type: ignore
    style: str = "manga"
    engine: str = "v4"
    title: str = ""
    status: str = "pending"

    project_options: dict[str, Any] = Field(default_factory=dict)
    adaptation_plan: dict[str, Any] = Field(default_factory=dict)
    character_world_bible: dict[str, Any] = Field(default_factory=dict)
    fact_registry: list[dict[str, Any]] = Field(default_factory=list)
    continuity_ledger: dict[str, Any] = Field(default_factory=dict)
    coverage: dict[str, Any] = Field(default_factory=dict)

    legacy_summary_id: str | None = None
    active_version: int = 1
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

    class Settings:
        name = "manga_projects"
        indexes = [
            [("book_id", 1), ("style", 1), ("engine", 1)],
            [("status", 1)],
        ]


class MangaSliceDoc(Document):
    """One generated source slice inside a manga project."""

    project_id: Indexed(str)  # type: ignore
    book_id: Indexed(str)  # type: ignore
    source_slice: dict[str, Any]
    slice_index: int
    slice_role: str = "opening"
    status: str = "pending"

    input_continuity_version: int = 1
    output_continuity_version: int = 1
    canonical_summaries: list[dict[str, Any]] = Field(default_factory=list)
    beat_sheet_fragment: dict[str, Any] = Field(default_factory=dict)
    manga_script_fragment: dict[str, Any] = Field(default_factory=dict)
    storyboard_pages: list[dict[str, Any]] = Field(default_factory=list)
    new_fact_ids: list[str] = Field(default_factory=list)
    quality_report: dict[str, Any] = Field(default_factory=dict)
    llm_traces: list[dict[str, Any]] = Field(default_factory=list)

    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

    class Settings:
        name = "manga_slices"
        indexes = [
            [("project_id", 1), ("slice_index", 1)],
            [("book_id", 1)],
            [("status", 1)],
        ]


class MangaPageDoc(Document):
    """A durable V4 manga page belonging to one project slice."""

    project_id: Indexed(str)  # type: ignore
    slice_id: Indexed(str)  # type: ignore
    page_index: int
    source_range: dict[str, Any] = Field(default_factory=dict)
    v4_page: dict[str, Any] = Field(default_factory=dict)

    created_at: datetime = Field(default_factory=_now)

    class Settings:
        name = "manga_pages"
        indexes = [
            [("project_id", 1), ("page_index", 1)],
            [("slice_id", 1), ("page_index", 1)],
        ]


class MangaAssetDoc(Document):
    """Reusable generated asset for a manga project character/world."""

    project_id: Indexed(str)  # type: ignore
    character_id: str = ""
    asset_type: str = "character"
    expression: str = "neutral"
    image_path: str = ""
    prompt: str = ""
    model: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)

    created_at: datetime = Field(default_factory=_now)

    class Settings:
        name = "manga_assets"
        indexes = [
            [("project_id", 1), ("character_id", 1)],
            [("project_id", 1), ("asset_type", 1)],
        ]
