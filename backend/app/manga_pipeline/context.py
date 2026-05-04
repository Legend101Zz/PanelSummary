"""Pipeline context for the revamp manga generation flow."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.domain.manga import (
    AdaptationPlan,
    ArcOutline,
    ArcSliceEntry,
    BeatSheet,
    BookSynopsis,
    CharacterWorldBible,
    ContinuityLedger,
    MangaAssetSpec,
    MangaScript,
    QualityReport,
    SourceFact,
    SourceSlice,
    StoryboardPage,
)
from app.manga_pipeline.llm_contracts import LLMInvocationTrace, LLMModelClient


@dataclass
class PipelineResult:
    source_slice: SourceSlice
    v4_pages: list[dict[str, Any]]
    quality_report: QualityReport | None
    new_fact_ids: list[str] = field(default_factory=list)
    llm_traces: list[LLMInvocationTrace] = field(default_factory=list)


@dataclass
class PipelineContext:
    book_id: str
    project_id: str
    source_slice: SourceSlice
    prior_continuity: ContinuityLedger
    options: dict[str, Any] = field(default_factory=dict)
    llm_client: LLMModelClient | None = None

    canonical_chapters: list[dict[str, Any]] = field(default_factory=list)
    knowledge_doc: dict[str, Any] = field(default_factory=dict)
    fact_registry: list[SourceFact] = field(default_factory=list)
    new_fact_ids: list[str] = field(default_factory=list)

    # Book-level artifacts authored ONCE per project before any slice runs.
    # When present, downstream per-slice stages MUST treat these as immutable
    # context: they read them, never overwrite them.
    book_synopsis: BookSynopsis | None = None
    arc_outline: ArcOutline | None = None
    arc_entry: ArcSliceEntry | None = None
    bible_locked: bool = False

    adaptation_plan: AdaptationPlan | None = None
    character_bible: CharacterWorldBible | None = None
    beat_sheet: BeatSheet | None = None
    manga_script: MangaScript | None = None
    storyboard_pages: list[StoryboardPage] = field(default_factory=list)
    asset_specs: list[MangaAssetSpec] = field(default_factory=list)
    v4_pages: list[dict[str, Any]] = field(default_factory=list)
    quality_report: QualityReport | None = None
    llm_traces: list[LLMInvocationTrace] = field(default_factory=list)

    def record_llm_trace(self, trace: LLMInvocationTrace) -> None:
        """Attach a compact model invocation trace to the pipeline context."""
        self.llm_traces.append(trace)

    def result(self) -> PipelineResult:
        return PipelineResult(
            source_slice=self.source_slice,
            v4_pages=self.v4_pages,
            quality_report=self.quality_report,
            new_fact_ids=self.new_fact_ids,
            llm_traces=self.llm_traces,
        )
