from __future__ import annotations

import asyncio
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Coroutine, TypeVar

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.contracts.context import GenerationConstraints, MemoryDelta
from app.contracts.runs import GenerationBudget
from app.contracts.source import PageRange
from app.persistence.documents import (
    ArtifactDoc,
    GenerationRunDoc,
    MangaProjectDoc,
    ProjectMemorySnapshotDoc,
    ScopeManifestDoc,
    SourceUnitDoc,
    StageRunDoc,
    construct_document,
)
from app.persistence.repositories import InMemoryRepositories
from app.services.context_compiler import ContextCompiler, Purpose
from app.services.errors import (
    ContextBudgetError,
    StaleMemoryDeltaError,
    UnsupportedSourceError,
)
from app.services.generation_runs import GenerationRunService, StartGenerationRun
from app.services.hashing import content_hash, estimate_tokens
from app.services.memory import MemoryMergeService
from app.services.scopes import ScopeService

T = TypeVar("T")
NOW = datetime(2026, 7, 19, 12, 0, tzinfo=UTC)


def resolve(coroutine: Coroutine[Any, Any, T]) -> T:
    return asyncio.run(coroutine)


def source_unit(
    source_unit_id: str,
    page_start: int,
    page_end: int,
    text: str,
) -> SourceUnitDoc:
    return construct_document(
        SourceUnitDoc,
        book_id="book_1",
        source_unit_id=source_unit_id,
        kind="page_window",
        chapter_index=0,
        heading_path=["The Last Observatory"],
        page_start=page_start,
        page_end=page_end,
        text=text,
        text_hash=content_hash(text),
        token_count=estimate_tokens(text),
        image_refs=[],
        parse_version="parser.v1",
    )


def scope(source_unit_ids: list[str], scope_id: str = "scope_1") -> ScopeManifestDoc:
    return construct_document(
        ScopeManifestDoc,
        project_id="project_1",
        book_id="book_1",
        scope_id=scope_id,
        source_unit_ids=source_unit_ids,
        page_ranges=[{"page_start": 1, "page_end": 10}],
        selection_label="First ten pages",
        scope_hash=content_hash(source_unit_ids),
        created_by="user_1",
        created_at=NOW,
    )


def memory_snapshot(source: SourceUnitDoc) -> ProjectMemorySnapshotDoc:
    ref = {
        "book_id": source.book_id,
        "source_unit_id": source.source_unit_id,
        "page_start": source.page_start,
        "page_end": source.page_end,
        "text_hash": source.text_hash,
    }
    return construct_document(
        ProjectMemorySnapshotDoc,
        project_id="project_1",
        memory_version=0,
        parent_version=None,
        book_spine={
            "synopsis": "A lighthouse keeper follows a signal through a drowned city. " * 40,
            "themes": ["memory", "duty"],
            "terminology": [
                {
                    "term": "wake light",
                    "canonical_form": "Wake Light",
                    "meaning": "The signal emitted by the observatory lens.",
                }
            ],
            "art_direction": "Dense ink, warm paper, and vermilion signal accents. " * 20,
            "narrative_voice": "Close third person, restrained and observant.",
        },
        facts=[
            {
                "fact_id": "fact_required",
                "claim": "The observatory signal returns at low tide.",
                "source_refs": [ref],
                "confidence": 1.0,
            },
            {
                "fact_id": "fact_optional",
                "claim": "The old harbor ledger has salt-stained margins. " * 80,
                "source_refs": [ref],
                "confidence": 0.8,
            },
        ],
        character_state=[
            {
                "character_id": "heroine",
                "display_name": "Mara",
                "current_state": "She has reached the observatory door.",
                "visual_asset_ids": [],
            }
        ],
        world_state={"tide": "rising"},
        continuity={
            "previous_slice_ending": "Mara hears three knocks from inside the sealed lens room.",
            "unresolved_threads": [
                {
                    "thread_id": "three_knocks",
                    "summary": "The source of the knocks is unknown.",
                    "status": "open",
                }
            ],
        },
        coverage={},
        asset_index=[],
        source_artifact_ids=["artifact_seed"],
        content_hash="a" * 64,
        created_at=NOW,
    )


def constraints() -> GenerationConstraints:
    return GenerationConstraints(
        image_mode="budgeted",
        max_pages=10,
        max_panels_per_page=7,
        max_sprites=8,
        max_key_panels=2,
        reading_direction="rtl",
        narration_enabled=False,
    )


def generation_budget() -> GenerationBudget:
    return GenerationBudget(
        max_text_cost_usd=3,
        max_image_cost_usd=8,
        max_render_minutes=5,
        max_agent_steps=20,
        max_repair_attempts=2,
        max_sprites=8,
        max_key_panels=2,
        max_reels=0,
    )


def test_selected_page_range_produces_only_overlapping_source_units() -> None:
    repository = InMemoryRepositories()
    first = source_unit("pages_1_10", 1, 10, "First slice evidence.")
    second = source_unit("pages_11_20", 11, 20, "Second slice evidence.")
    resolve(repository.save_source_units([first, second]))
    service = ScopeService(repository, repository)

    selected = resolve(
        service.create(
            project_id="project_1",
            book_id="book_1",
            page_ranges=[PageRange(page_start=11, page_end=20)],
            selection_label="Pages 11-20",
            created_by="user_1",
            created_at=NOW,
        )
    )

    assert selected.source_unit_ids == ["pages_11_20"]


def test_context_reduction_preserves_source_and_required_facts() -> None:
    unit = source_unit("pages_1_10", 1, 10, "The signal appears above the drowned breakwater.")
    memory = memory_snapshot(unit)
    compiler = ContextCompiler()
    large = compiler.compile(
        project_id="project_1",
        scope=scope([unit.source_unit_id]),
        memory=memory,
        source_units=[unit],
        purpose="manga_direction",
        constraints=constraints(),
        max_input_tokens=20_000,
        required_fact_ids={"fact_required"},
    )
    reduced_budget = max(700, large.compilation.estimated_tokens // 3)
    reduced = compiler.compile(
        project_id="project_1",
        scope=scope([unit.source_unit_id]),
        memory=memory,
        source_units=[unit],
        purpose="manga_direction",
        constraints=constraints(),
        max_input_tokens=reduced_budget,
        required_fact_ids={"fact_required"},
    )

    assert reduced.compilation.included_source_ids == ["pages_1_10"]
    assert reduced.source_units[0].excerpt.startswith("The signal appears")
    assert [fact.fact_id for fact in reduced.book_canon.facts] == ["fact_required"]
    assert "optional_facts" in reduced.compilation.omitted_optional_sections


def test_next_slice_context_includes_previous_ending_and_is_reproducible() -> None:
    unit = source_unit("pages_11_20", 11, 20, "Mara opens the sealed lens room.")
    memory = memory_snapshot(unit)
    next_scope = scope([unit.source_unit_id], "scope_next")
    next_scope.page_ranges = [{"page_start": 11, "page_end": 20}]
    first = ContextCompiler().compile(
        project_id="project_1",
        scope=next_scope,
        memory=memory,
        source_units=[unit],
        purpose="manga_composition",
        constraints=constraints(),
        max_input_tokens=20_000,
        required_fact_ids={"fact_required"},
    )
    fresh_session = ContextCompiler().compile(
        project_id="project_1",
        scope=next_scope,
        memory=memory,
        source_units=[unit],
        purpose="manga_composition",
        constraints=constraints(),
        max_input_tokens=20_000,
        required_fact_ids={"fact_required"},
    )

    assert first.continuity.previous_slice_ending == (
        "Mara hears three knocks from inside the sealed lens room."
    )
    assert first.content_hash == fresh_session.content_hash
    assert first.context_pack_id == fresh_session.context_pack_id


@pytest.mark.parametrize("purpose", ["manga_page_writing", "manga_thumbnail"])
def test_context_compiler_accepts_page_planning_purposes(purpose: Purpose) -> None:
    unit = source_unit("pages_1_10", 1, 10, "A source-grounded locality trade-off.")

    context = ContextCompiler().compile(
        project_id="project_1",
        scope=scope([unit.source_unit_id]),
        memory=memory_snapshot(unit),
        source_units=[unit],
        purpose=purpose,
        constraints=constraints(),
        max_input_tokens=20_000,
    )

    assert context.purpose == purpose


def test_context_compiler_fails_when_mandatory_evidence_cannot_fit() -> None:
    unit = source_unit("pages_1_10", 1, 10, "Evidence " * 500)
    with pytest.raises(ContextBudgetError, match="cannot hold selected source evidence"):
        ContextCompiler().compile(
            project_id="project_1",
            scope=scope([unit.source_unit_id]),
            memory=memory_snapshot(unit),
            source_units=[unit],
            purpose="manga_direction",
            constraints=constraints(),
            max_input_tokens=100,
            required_fact_ids={"fact_required"},
        )


def seeded_memory_repository() -> tuple[InMemoryRepositories, SourceUnitDoc]:
    repository = InMemoryRepositories()
    unit = source_unit("pages_1_10", 1, 10, "The tide exposes the observatory stairs.")
    repository.source_units[(unit.book_id, unit.source_unit_id)] = unit
    repository.projects["project_1"] = construct_document(
        MangaProjectDoc,
        project_id="project_1",
        book_id="book_1",
        owner_id="user_1",
        active_memory_version=0,
        created_at=NOW,
        updated_at=NOW,
    )
    repository.memory_snapshots[("project_1", 0)] = memory_snapshot(unit)
    repository.artifacts["artifact_delta"] = construct_document(
        ArtifactDoc,
        artifact_id="artifact_delta",
        project_id="project_1",
        run_id="run_1",
        kind="manga_plan",
        schema_version="manga-plan.v1",
        content={"accepted": True},
        storage_ref=None,
        content_hash="d" * 64,
        parent_artifact_ids=[],
        source_refs=[],
        model_receipt=None,
        validation_status="accepted",
        validation_report={"passed": True, "issues": [], "validator_version": "test.v1"},
        created_at=NOW,
    )
    return repository, unit


def delta_for(unit: SourceUnitDoc, *, base_version: int = 0) -> MemoryDelta:
    return MemoryDelta.model_validate(
        {
            "schema_version": "memory-delta.v1",
            "project_id": "project_1",
            "base_memory_version": base_version,
            "new_facts": [
                {
                    "fact_id": "fact_new",
                    "claim": "The stairs are visible only at low tide.",
                    "source_refs": [
                        {
                            "book_id": unit.book_id,
                            "source_unit_id": unit.source_unit_id,
                            "page_start": unit.page_start,
                            "page_end": unit.page_end,
                            "text_hash": unit.text_hash,
                        }
                    ],
                    "confidence": 1,
                }
            ],
            "fact_corrections": [],
            "character_state_updates": [],
            "continuity_updates": [
                {
                    "key": "previous_slice_ending",
                    "value": "Mara descends the newly exposed stairs.",
                    "source_refs": [],
                }
            ],
            "coverage_additions": [
                {
                    "source_unit_id": unit.source_unit_id,
                    "beat_ids": ["beat_2", "beat_1", "beat_1"],
                    "coverage_status": "covered",
                }
            ],
            "unresolved_thread_updates": [],
            "source_artifact_ids": ["artifact_delta"],
        }
    )


def test_memory_merge_rejects_unsupported_fact_sources() -> None:
    repository, unit = seeded_memory_repository()
    delta = delta_for(unit)
    delta.new_facts[0].source_refs[0].source_unit_id = "missing_unit"

    with pytest.raises(UnsupportedSourceError, match="does not exist"):
        resolve(MemoryMergeService(repository, repository, repository).merge(delta))


def test_memory_merge_is_deterministic_and_rejects_stale_delta() -> None:
    repository, unit = seeded_memory_repository()
    service = MemoryMergeService(repository, repository, repository)
    delta = delta_for(unit)

    merged = resolve(service.merge(delta))

    assert merged.memory_version == 1
    assert merged.parent_version == 0
    assert merged.coverage[unit.source_unit_id]["beat_ids"] == ["beat_1", "beat_2"]
    assert repository.projects["project_1"].active_memory_version == 1
    with pytest.raises(StaleMemoryDeltaError, match="active version is 1"):
        resolve(service.merge(delta))


class RecordingDispatcher:
    def __init__(self) -> None:
        self.run_ids: list[str] = []

    def enqueue_generation_run(self, run_id: str) -> None:
        self.run_ids.append(run_id)


def test_generation_run_idempotency_and_safe_cancellation() -> None:
    repository, _ = seeded_memory_repository()
    manifest = scope(["pages_1_10"])
    repository.scopes[manifest.scope_id] = manifest
    dispatcher = RecordingDispatcher()
    service = GenerationRunService(
        repository,
        repository,
        repository,
        repository,
        dispatcher,
    )
    request = StartGenerationRun(
        scope_id=manifest.scope_id,
        requested_outputs=["manga"],
        pipeline_version="manga-pipeline.v1",
        budget=generation_budget(),
        created_by="user_1",
    )

    first, first_created = resolve(service.start("project_1", request, now=NOW))
    second, second_created = resolve(service.start("project_1", request, now=NOW))
    repository.stages["stage_1"] = construct_document(
        StageRunDoc,
        stage_run_id="stage_1",
        run_id=first.run_id,
        stage_name="context_compilation",
        attempt=1,
        status="queued",
        input_artifact_ids=[],
        input_hash="b" * 64,
        output_artifact_ids=[],
        idempotency_key="c" * 64,
    )

    cancelled = resolve(service.cancel(first.run_id, now=NOW))
    cancelled_again = resolve(service.cancel(first.run_id, now=NOW))

    assert first_created is True
    assert second_created is False
    assert first.run_id == second.run_id
    assert dispatcher.run_ids == [first.run_id]
    assert cancelled.run.status.value == "cancelled"
    assert cancelled.stages[0].status.value == "cancelled"
    assert cancelled_again == cancelled


def test_document_collections_and_unique_indexes_are_declared() -> None:
    assert SourceUnitDoc.Settings.name == "source_units"
    assert ScopeManifestDoc.Settings.name == "scope_manifests"
    assert GenerationRunDoc.Settings.name == "generation_runs"
    assert any(index.document.get("unique") for index in SourceUnitDoc.Settings.indexes)
