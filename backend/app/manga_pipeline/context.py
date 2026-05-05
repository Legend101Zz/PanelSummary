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
    CharacterArtDirectionBundle,
    CharacterVoiceCardBundle,
    CharacterWorldBible,
    ContinuityLedger,
    MangaAssetSpec,
    MangaScript,
    QualityReport,
    RenderedPage,
    ScriptReviewReport,
    SliceComposition,
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
    # Phase 4.5a: typed sibling to ``v4_pages``. One serialised
    # ``RenderedPage`` per page, in the same order. We carry both for the
    # 4.5a -> 4.5c migration window so the V4 frontend keeps working
    # untouched while 4.5b cuts the reader over to the new shape; 4.5c
    # then deletes ``v4_pages`` and this becomes the only contract.
    rendered_pages: list[dict[str, Any]] = field(default_factory=list)


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
    # Phase 3: LLM-authored rendering intent for every bible character.
    # Read by character_asset_plan_stage and panel_rendering_stage so prompts
    # carry both the bible's identity lock AND the LLM's art direction.
    art_direction: CharacterArtDirectionBundle | None = None
    # Phase 1 polish: per-character speech-style cards. Read by the script
    # stage so each character keeps a distinct dialogue voice. Read-only at
    # the slice tier — the bundle is authored once during book understanding.
    voice_cards: CharacterVoiceCardBundle | None = None
    beat_sheet: BeatSheet | None = None
    manga_script: MangaScript | None = None
    # Phase A: editorial review of the generated script. Populated by
    # script_review_stage; consumed by script_repair_stage and any later
    # stage that wants to surface voice/tension warnings.
    script_review: ScriptReviewReport | None = None
    storyboard_pages: list[StoryboardPage] = field(default_factory=list)
    # Phase C1: per-page composition (gutter grid + emphasis overrides +
    # page-turn anchor) authored after the storyboard. Optional so legacy
    # rendering paths (no composition stage) still produce a page.
    slice_composition: SliceComposition | None = None
    asset_specs: list[MangaAssetSpec] = field(default_factory=list)
    v4_pages: list[dict[str, Any]] = field(default_factory=list)
    # Phase 4.2: typed end-to-end render contract. Authored by the
    # rendered_page_assembly_stage by zipping storyboard_pages +
    # slice_composition; mutated in place by panel_rendering_stage as
    # each panel's PanelRenderArtifact gets its image_path. The v4_pages
    # list above is a transitional shadow kept in sync at the end of
    # rendering so persistence + the V4 frontend keep working until the
    # wire flip in 4.5; both are deleted then.
    rendered_pages: list[RenderedPage] = field(default_factory=list)
    quality_report: QualityReport | None = None
    llm_traces: list[LLMInvocationTrace] = field(default_factory=list)

    def record_llm_trace(self, trace: LLMInvocationTrace) -> None:
        """Attach a compact model invocation trace to the pipeline context."""
        self.llm_traces.append(trace)

    def result(self) -> PipelineResult:
        # ``mode="json"`` so enums (e.g. ShotType.WIDE) become strings the
        # downstream Beanie / FastAPI layers can serialise without further
        # coercion. Empty list is the legitimate steady-state when image
        # generation is disabled (see panel_rendering_stage's no-op path).
        rendered_pages_dump = [
            page.model_dump(mode="json") for page in self.rendered_pages
        ]
        return PipelineResult(
            source_slice=self.source_slice,
            v4_pages=self.v4_pages,
            quality_report=self.quality_report,
            new_fact_ids=self.new_fact_ids,
            llm_traces=self.llm_traces,
            rendered_pages=rendered_pages_dump,
        )
