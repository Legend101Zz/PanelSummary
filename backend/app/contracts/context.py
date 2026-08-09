"""Bounded agent context and durable memory-delta contracts."""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal

from pydantic import Field, JsonValue, model_validator

from .artifacts import ArtifactRef, AssetRef
from .base import ContentHash, ContractModel, Identifier, NonEmptyText, ShortText, UnitInterval
from .source import SourceRef, SourceUnitExcerpt


class AgentGoalType(str, Enum):
    BOOK_CANON = "BOOK_CANON"
    MANGA_DIRECTION = "MANGA_DIRECTION"
    MANGA_PAGE_WRITING = "MANGA_PAGE_WRITING"
    MANGA_THUMBNAIL = "MANGA_THUMBNAIL"
    MANGA_COMPOSITION = "MANGA_COMPOSITION"
    REEL_DIRECTION = "REEL_DIRECTION"
    ARTIFACT_REPAIR = "ARTIFACT_REPAIR"


class AcceptanceTestRef(ContractModel):
    test_id: Identifier
    description: ShortText


class AgentBudget(ContractModel):
    max_steps: Annotated[int, Field(ge=1)]
    max_tool_calls: Annotated[int, Field(ge=0)]
    max_input_tokens: Annotated[int, Field(ge=1)]
    max_output_tokens: Annotated[int, Field(ge=1)]
    max_repair_attempts: Annotated[int, Field(ge=0, le=2)]
    max_cost_usd: Annotated[float, Field(ge=0)]


class AgentGoal(ContractModel):
    goal_id: Identifier
    run_id: Identifier
    stage_run_id: Identifier
    goal_type: AgentGoalType
    output_schema: ShortText
    schema_version: ShortText
    input_artifact_refs: list[ArtifactRef] = Field(default_factory=list, max_length=1_000)
    constraints: dict[Identifier, str | int | float | bool] = Field(default_factory=dict, max_length=128)
    acceptance_tests: list[AcceptanceTestRef] = Field(min_length=1, max_length=128)
    allowed_tools: list[Identifier] = Field(default_factory=list, max_length=64)
    budget: AgentBudget

    @model_validator(mode="after")
    def tools_are_unique(self) -> "AgentGoal":
        if len(self.allowed_tools) != len(set(self.allowed_tools)):
            raise ValueError("allowed_tools must be unique")
        return self


class GroundedFact(ContractModel):
    fact_id: Identifier
    claim: NonEmptyText
    source_refs: list[SourceRef] = Field(min_length=1, max_length=128)
    confidence: UnitInterval


class TerminologyEntry(ContractModel):
    term: ShortText
    canonical_form: ShortText
    meaning: NonEmptyText


class TerminologyUpdate(TerminologyEntry):
    source_refs: list[SourceRef] = Field(min_length=1, max_length=128)


class BookCanonView(ContractModel):
    synopsis: NonEmptyText
    themes: list[ShortText] = Field(default_factory=list, max_length=64)
    facts: list[GroundedFact] = Field(default_factory=list, max_length=2_000)
    terminology: list[TerminologyEntry] = Field(default_factory=list, max_length=512)
    art_direction: NonEmptyText
    narrative_voice: NonEmptyText


class CharacterState(ContractModel):
    character_id: Identifier
    display_name: ShortText
    current_state: NonEmptyText
    visual_asset_ids: list[Identifier] = Field(default_factory=list, max_length=64)


class StoryThread(ContractModel):
    thread_id: Identifier
    summary: NonEmptyText
    status: Literal["open", "resolved", "deferred"]


class ContinuityView(ContractModel):
    previous_slice_ending: NonEmptyText | None = None
    character_state: list[CharacterState] = Field(default_factory=list, max_length=256)
    world_state: dict[Identifier, ShortText] = Field(default_factory=dict, max_length=256)
    unresolved_threads: list[StoryThread] = Field(default_factory=list, max_length=256)


class GenerationConstraints(ContractModel):
    image_mode: Literal["sprites_only", "budgeted", "full"] = "budgeted"
    max_pages: Annotated[int, Field(ge=1, le=100)]
    max_panels_per_page: Annotated[int, Field(ge=1, le=7)] = 7
    max_sprites: Annotated[int, Field(ge=0)]
    max_key_panels: Annotated[int, Field(ge=0)]
    reading_direction: Literal["rtl", "ltr"] = "rtl"
    narration_enabled: bool = False


class ContextCompilationReceipt(ContractModel):
    included_source_ids: list[Identifier] = Field(min_length=1, max_length=1_000)
    omitted_optional_sections: list[ShortText] = Field(default_factory=list, max_length=128)
    estimated_tokens: Annotated[int, Field(ge=0)]
    compiler_version: ShortText


class ContextPack(ContractModel):
    schema_version: Literal["context-pack.v1"]
    context_pack_id: Identifier
    project_id: Identifier
    scope_id: Identifier
    memory_version: Annotated[int, Field(ge=0)]
    purpose: Literal[
        "manga_direction",
        "manga_page_writing",
        "manga_thumbnail",
        "manga_composition",
        "reel_direction",
    ]
    source_units: list[SourceUnitExcerpt] = Field(min_length=1, max_length=1_000)
    book_canon: BookCanonView
    continuity: ContinuityView
    assets: list[AssetRef] = Field(default_factory=list, max_length=1_000)
    parent_artifacts: list[ArtifactRef] = Field(default_factory=list, max_length=1_000)
    constraints: GenerationConstraints
    compilation: ContextCompilationReceipt
    content_hash: ContentHash


class FactCorrection(ContractModel):
    fact_id: Identifier
    replacement_claim: NonEmptyText
    reason: NonEmptyText
    source_refs: list[SourceRef] = Field(min_length=1, max_length=128)


class CharacterStateUpdate(ContractModel):
    character_id: Identifier
    state_patch: dict[Identifier, JsonValue] = Field(min_length=1, max_length=64)
    source_refs: list[SourceRef] = Field(default_factory=list, max_length=128)


class ContinuityUpdate(ContractModel):
    key: Identifier
    value: JsonValue
    source_refs: list[SourceRef] = Field(default_factory=list, max_length=128)


class SourceCoverage(ContractModel):
    source_unit_id: Identifier
    beat_ids: list[Identifier] = Field(min_length=1, max_length=1_000)
    coverage_status: Literal["covered", "partially_covered", "deferred"]


class StoryThreadUpdate(ContractModel):
    thread_id: Identifier
    summary: NonEmptyText
    status: Literal["open", "resolved", "deferred"]
    source_refs: list[SourceRef] = Field(default_factory=list, max_length=128)


class MemoryDelta(ContractModel):
    schema_version: Literal["memory-delta.v1"]
    project_id: Identifier
    base_memory_version: Annotated[int, Field(ge=0)]
    new_facts: list[GroundedFact] = Field(default_factory=list, max_length=2_000)
    fact_corrections: list[FactCorrection] = Field(default_factory=list, max_length=1_000)
    character_state_updates: list[CharacterStateUpdate] = Field(default_factory=list, max_length=1_000)
    terminology_updates: list[TerminologyUpdate] = Field(default_factory=list, max_length=512)
    continuity_updates: list[ContinuityUpdate] = Field(default_factory=list, max_length=1_000)
    coverage_additions: list[SourceCoverage] = Field(default_factory=list, max_length=1_000)
    unresolved_thread_updates: list[StoryThreadUpdate] = Field(default_factory=list, max_length=1_000)
    source_artifact_ids: list[Identifier] = Field(min_length=1, max_length=1_000)
