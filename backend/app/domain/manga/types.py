"""Core manga adaptation domain types.

These models describe *what* the system is producing. They intentionally do not
know about MongoDB, Celery, FastAPI, or prompt execution. Keep the domain clean;
future-you will send snacks.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


class MangaPipelineVersion(str, Enum):
    LEGACY = "legacy"
    REVAMP = "revamp"


class SourceSliceMode(str, Enum):
    PAGES = "pages"
    CHAPTERS = "chapters"
    SECTIONS = "sections"


class SliceRole(str, Enum):
    OPENING = "opening"
    CONTINUATION = "continuation"
    FINALE = "finale"
    STANDALONE = "standalone"


class FactImportance(int, Enum):
    SUPPORTING = 1
    USEFUL = 2
    IMPORTANT = 3
    CORE = 4
    THESIS = 5


class SourceRange(BaseModel):
    """A concrete range inside the source PDF/book."""

    page_start: int | None = None
    page_end: int | None = None
    chapter_start: int | None = None
    chapter_end: int | None = None
    section_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_ranges(self) -> "SourceRange":
        if self.page_start is not None and self.page_start < 1:
            raise ValueError("page_start is 1-based and must be >= 1")
        if self.page_end is not None and self.page_end < 1:
            raise ValueError("page_end is 1-based and must be >= 1")
        if None not in (self.page_start, self.page_end) and self.page_end < self.page_start:
            raise ValueError("page_end must be >= page_start")
        if self.chapter_start is not None and self.chapter_start < 0:
            raise ValueError("chapter_start is 0-based and must be >= 0")
        if self.chapter_end is not None and self.chapter_end < 0:
            raise ValueError("chapter_end is 0-based and must be >= 0")
        if None not in (self.chapter_start, self.chapter_end) and self.chapter_end < self.chapter_start:
            raise ValueError("chapter_end must be >= chapter_start")
        if not any(
            value is not None for value in (
                self.page_start,
                self.page_end,
                self.chapter_start,
                self.chapter_end,
            )
        ) and not self.section_ids:
            raise ValueError("SourceRange needs pages, chapters, or section IDs")
        return self

    def label(self) -> str:
        parts: list[str] = []
        if self.page_start is not None and self.page_end is not None:
            parts.append(f"pages {self.page_start}-{self.page_end}")
        if self.chapter_start is not None and self.chapter_end is not None:
            parts.append(f"chapters {self.chapter_start}-{self.chapter_end}")
        if self.section_ids:
            parts.append(f"{len(self.section_ids)} sections")
        return ", ".join(parts) or "unknown source range"


class SourceSlice(BaseModel):
    """The chunk of source material being adapted in one generation run."""

    slice_id: str
    book_id: str
    mode: SourceSliceMode
    source_range: SourceRange
    word_count: int = 0
    is_partial_chapter_start: bool = False
    is_partial_chapter_end: bool = False

    @field_validator("slice_id", "book_id")
    @classmethod
    def non_empty_id(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("IDs cannot be blank")
        return value.strip()

    @field_validator("word_count")
    @classmethod
    def word_count_cannot_be_negative(cls, value: int) -> int:
        if value < 0:
            raise ValueError("word_count cannot be negative")
        return value

    @property
    def is_partial(self) -> bool:
        return self.is_partial_chapter_start or self.is_partial_chapter_end

    def label(self) -> str:
        return self.source_range.label()


class SourceFact(BaseModel):
    """A source-grounded fact that the manga adaptation must preserve."""

    fact_id: str
    text: str
    source_slice_id: str
    importance: FactImportance = FactImportance.IMPORTANT
    source_refs: list[SourceRange] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    extends_fact_id: str | None = None
    contrasts_with_fact_id: str | None = None
    resolves_thread_id: str | None = None

    @field_validator("fact_id", "text", "source_slice_id")
    @classmethod
    def required_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("fact_id, text, and source_slice_id cannot be blank")
        return value.strip()


class StoryThread(BaseModel):
    """A story question/promise that spans pages or slices."""

    thread_id: str
    question: str
    introduced_in_slice: str
    related_fact_ids: list[str] = Field(default_factory=list)
    status: str = "open"

    @field_validator("status")
    @classmethod
    def status_is_known(cls, value: str) -> str:
        allowed = {"open", "resolved", "dropped"}
        if value not in allowed:
            raise ValueError(f"thread status must be one of {sorted(allowed)}")
        return value


class CharacterContinuityState(BaseModel):
    """Mutable story state for a recurring manga character."""

    character_id: str
    arc_position: str = ""
    known_fact_ids: list[str] = Field(default_factory=list)
    visual_changes_allowed: list[str] = Field(default_factory=list)
    speech_constraints: list[str] = Field(default_factory=list)


class CurrentStoryState(BaseModel):
    """Reader-facing state at the end of the latest manga slice."""

    protagonist_state: str = ""
    emotional_position: str = ""
    knowledge_state: str = ""
    world_state: str = ""

    def compact_lines(self) -> list[str]:
        values = {
            "Protagonist": self.protagonist_state,
            "Emotion": self.emotional_position,
            "Reader knowledge": self.knowledge_state,
            "World": self.world_state,
        }
        return [f"{label}: {text}" for label, text in values.items() if text]


class ContinuityLedger(BaseModel):
    """Durable memory for incremental manga generation."""

    project_id: str
    covered_source_ranges: list[SourceRange] = Field(default_factory=list)
    current_story_state: CurrentStoryState = Field(default_factory=CurrentStoryState)
    open_threads: list[StoryThread] = Field(default_factory=list)
    resolved_threads: list[StoryThread] = Field(default_factory=list)
    character_state: dict[str, CharacterContinuityState] = Field(default_factory=dict)
    known_fact_ids: list[str] = Field(default_factory=list)
    recap_for_next_slice: str = ""
    last_page_hook: str = ""
    version: int = 1
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @field_validator("project_id")
    @classmethod
    def project_id_required(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("project_id cannot be blank")
        return value.strip()

    def add_covered_range(self, source_range: SourceRange) -> None:
        self.covered_source_ranges.append(source_range)
        self.updated_at = datetime.now(UTC)

    def mark_facts_known(self, fact_ids: list[str]) -> None:
        seen = set(self.known_fact_ids)
        for fact_id in fact_ids:
            if fact_id not in seen:
                self.known_fact_ids.append(fact_id)
                seen.add(fact_id)
        self.updated_at = datetime.now(UTC)

    def source_coverage_label(self) -> str:
        if not self.covered_source_ranges:
            return "nothing yet"
        return "; ".join(source_range.label() for source_range in self.covered_source_ranges)


class MangaGenerationOptions(BaseModel):
    """User/system choices for manga generation."""

    style: str = "manga"
    engine: str = "v4"
    generate_images: bool = False
    image_model: str | None = None
    max_pages: int | None = None
    standalone: bool = False


class MangaAssetSpec(BaseModel):
    """Reusable generated asset metadata, independent of storage backend."""

    asset_id: str
    character_id: str
    asset_type: str
    expression: str = "neutral"
    image_path: str = ""
    prompt: str = ""
    model: str = ""


class MangaPageArtifact(BaseModel):
    """A rendered/planned page belonging to a project slice."""

    page_id: str
    page_index: int
    source_range: SourceRange | None = None
    v4_page: dict[str, Any] = Field(default_factory=dict)
    # Phase 4.5a: typed sibling to ``v4_page``. Serialised ``RenderedPage``
    # (model_dump(mode="json")). Default factory keeps legacy artifacts
    # constructible without arguments; 4.5c deletes ``v4_page`` outright.
    rendered_page: dict[str, Any] = Field(default_factory=dict)


class MangaSliceSnapshot(BaseModel):
    """Storage-agnostic snapshot of one generated manga slice."""

    slice_id: str
    project_id: str
    source_slice: SourceSlice
    slice_index: int
    slice_role: SliceRole
    status: str = "pending"
    new_fact_ids: list[str] = Field(default_factory=list)
    storyboard_page_ids: list[str] = Field(default_factory=list)
    quality_report: dict[str, Any] = Field(default_factory=dict)


class MangaProjectSnapshot(BaseModel):
    """Storage-agnostic project state used by services and API adapters."""

    project_id: str
    book_id: str
    title: str = ""
    style: str = "manga"
    engine: str = "v4"
    status: str = "pending"
    adaptation_plan: dict[str, Any] = Field(default_factory=dict)
    character_world_bible: dict[str, Any] = Field(default_factory=dict)
    fact_registry: list[SourceFact] = Field(default_factory=list)
    continuity_ledger: ContinuityLedger
    assets: list[MangaAssetSpec] = Field(default_factory=list)
    active_version: int = 1
