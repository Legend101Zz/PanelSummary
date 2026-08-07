"""Feature-flagged bridge: the v1 manga pipeline consumes compiled context.

Blueprint Phase 1 / issue #4 second half (ADR-011). When
``Settings.use_compiled_context`` is on, ``generate_project_slice`` calls this
bridge to:

1. ensure the project has a genesis memory snapshot (version 0),
2. freeze the chosen slice's page range as a ``ScopeManifestDoc`` (idempotent
   by scope hash),
3. compile a purpose-scoped ``ContextPack`` from the durable source units and
   the ACTIVE memory snapshot,
4. persist the pack as an accepted ``context_pack`` artifact under an
   idempotent ``GenerationRunDoc`` ledger row, and
5. hand back slice source text rebuilt from the durable units.

The caller byte-compares that text against the legacy builder's output and
raises on mismatch, so flag-on can never silently change what the LLM stages
see. After a successful slice, ``record_slice_outcome`` proposes a
deterministic ``MemoryDelta`` (coverage + slice-ending continuity, citing the
context-pack artifact) through the ported ``MemoryMergeService`` — no LLM is
involved anywhere in this module.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from app.contracts.context import (
    ContextPack,
    ContinuityUpdate,
    GenerationConstraints,
    MemoryDelta,
    SourceCoverage,
)
from app.contracts.runs import GenerationBudget
from app.contracts.source import PageRange
from app.domain.manga import SourceSlice
from app.models import Book
from app.persistence.documents import ArtifactDoc, construct_document, utc_now
from app.persistence.protocols import Repositories
from app.persistence.v1_bridge import ensure_genesis_snapshot
from app.services.book_normalization import source_text_from_units
from app.services.context_compiler import ContextCompiler
from app.services.generation_runs import GenerationRunService, StartGenerationRun
from app.services.memory import MemoryMergeService
from app.services.scopes import ScopeService

logger = logging.getLogger(__name__)

CREATED_BY = "v1-bridge"
_IDENTIFIER_SAFE = re.compile(r"[^A-Za-z0-9._:-]")

#: Deterministic ledger budget for the v1-mirror run row. The v1 pipeline
#: enforces its own budgets; this record exists for provenance/idempotency.
_V1_MIRROR_BUDGET = GenerationBudget(
    max_text_cost_usd=0.0,
    max_image_cost_usd=0.0,
    max_render_minutes=0.0,
    max_agent_steps=1,
    max_repair_attempts=0,
    max_sprites=0,
    max_key_panels=0,
    max_reels=0,
)

#: Phase-2 consumer metadata; deterministic constants for the Phase 1 bridge.
_V1_MIRROR_CONSTRAINTS = GenerationConstraints(
    image_mode="budgeted",
    max_pages=100,
    max_panels_per_page=7,
    max_sprites=8,
    max_key_panels=3,
    reading_direction="rtl",
    narration_enabled=False,
)


class CompiledContextError(RuntimeError):
    """Raised when the durable-context path cannot mirror the v1 slice."""


@dataclass
class CompiledSliceContext:
    """Everything the flag-on pipeline path needs from the bridge."""

    pack: ContextPack
    scope_id: str
    run_id: str
    artifact_id: str
    memory_version: int
    source_text: str


def sanitize_identifier(value: str, fallback: str) -> str:
    """Coerce arbitrary text into the contracts' Identifier pattern."""

    cleaned = _IDENTIFIER_SAFE.sub("-", value.strip())[:128]
    if not cleaned or not re.match(r"^[A-Za-z0-9]", cleaned):
        cleaned = f"b{cleaned}" if cleaned else fallback
    return cleaned[:128]


class CompiledContextBridge:
    """Deterministic durable-context consumption for the v1 pipeline."""

    def __init__(
        self,
        repositories: Repositories,
        *,
        max_input_tokens: int,
        created_by: str = CREATED_BY,
    ) -> None:
        self._repositories = repositories
        self._max_input_tokens = max_input_tokens
        self._created_by = created_by
        self._scopes = ScopeService(repositories, repositories, memory=repositories)
        self._runs = GenerationRunService(
            runs=repositories,
            scopes=repositories,
            memory=repositories,
            artifacts=repositories,
        )
        self._memory_merge = MemoryMergeService(
            memory=repositories,
            sources=repositories,
            artifacts=repositories,
        )
        self._compiler = ContextCompiler()

    async def compile_slice_context(
        self,
        *,
        book: Book,
        project_id: str,
        source_slice: SourceSlice,
    ) -> CompiledSliceContext:
        page_start = source_slice.source_range.page_start
        page_end = source_slice.source_range.page_end
        if page_start is None or page_end is None:
            raise CompiledContextError(
                "compiled context requires a concrete page range on the slice"
            )

        book_id = str(book.id)
        units = await self._repositories.list_source_units(book_id)
        if not units:
            raise CompiledContextError(
                f"book {book_id} has no source units; run "
                "app/scripts/normalize_source_units.py before enabling "
                "use_compiled_context"
            )

        await ensure_genesis_snapshot(self._repositories, project_id)

        scope = await self._scopes.create(
            project_id=project_id,
            book_id=book_id,
            page_ranges=[PageRange(page_start=page_start, page_end=page_end)],
            selection_label=f"v1 slice pages {page_start}-{page_end}",
            created_by=self._created_by,
        )
        scope_doc = await self._repositories.get_scope(scope.scope_id)
        if scope_doc is None:
            raise CompiledContextError(f"scope {scope.scope_id} vanished after creation")

        project = await self._repositories.get_project(project_id)
        if project is None:
            raise CompiledContextError(f"manga project {project_id} does not exist")
        memory = await self._repositories.get_memory_snapshot(
            project_id, project.active_memory_version
        )
        if memory is None:
            raise CompiledContextError(
                f"memory snapshot {project_id}@{project.active_memory_version} is missing"
            )

        selected_ids = set(scope_doc.source_unit_ids)
        selected_units = [
            unit for unit in units if unit.source_unit_id in selected_ids
        ]
        pack = self._compiler.compile(
            project_id=project_id,
            scope=scope_doc,
            memory=memory,
            source_units=selected_units,
            purpose="manga_direction",
            constraints=_V1_MIRROR_CONSTRAINTS,
            max_input_tokens=self._max_input_tokens,
        )

        run, _created = await self._runs.start(
            project_id,
            StartGenerationRun(
                scope_id=scope.scope_id,
                requested_outputs=["manga"],
                pipeline_version="manga-pipeline.v1",
                budget=_V1_MIRROR_BUDGET,
                created_by=self._created_by,
            ),
        )

        artifact_id = f"artifact_{pack.content_hash[:24]}"
        artifact = construct_document(
            ArtifactDoc,
            artifact_id=artifact_id,
            project_id=project_id,
            run_id=run.run_id,
            stage_run_id=None,
            kind="context_pack",
            schema_version="context-pack.v1",
            content=pack.model_dump(mode="json"),
            storage_ref=None,
            content_hash=pack.content_hash,
            parent_artifact_ids=[],
            author="system",
            supersedes_artifact_id=None,
            source_refs=[
                excerpt.source_ref.model_dump(mode="json")
                for excerpt in pack.source_units
            ],
            model_receipt=None,
            validation_status="accepted",
            validation_report={
                "validator": pack.compilation.compiler_version,
                "deterministic": True,
                "estimated_tokens": pack.compilation.estimated_tokens,
                "omitted_optional_sections": pack.compilation.omitted_optional_sections,
            },
        )
        await self._repositories.save_artifact(artifact)

        derived_text = source_text_from_units(
            book=book,
            page_start=page_start,
            page_end=page_end,
            units=selected_units,
        )
        logger.info(
            "compiled context pack %s (scope=%s run=%s memory_v%d, ~%d tokens)",
            pack.context_pack_id,
            scope.scope_id,
            run.run_id,
            pack.memory_version,
            pack.compilation.estimated_tokens,
        )
        return CompiledSliceContext(
            pack=pack,
            scope_id=scope.scope_id,
            run_id=run.run_id,
            artifact_id=artifact_id,
            memory_version=pack.memory_version,
            source_text=derived_text,
        )

    async def record_slice_outcome(
        self,
        *,
        compiled: CompiledSliceContext,
        project_id: str,
        beat_ids: list[str],
        previous_slice_ending: str,
        last_page_hook: str,
    ) -> int:
        """Merge the slice's deterministic memory delta; returns new version.

        Coverage marks every scope unit as covered by the slice's beat ids
        (sanitized to the Identifier pattern). Continuity mirrors exactly what
        v1 wrote to its own ledger, so the durable layer and the v1 ledger
        cannot diverge. The delta cites the accepted context-pack artifact.
        """

        scope_doc = await self._repositories.get_scope(compiled.scope_id)
        if scope_doc is None:
            raise CompiledContextError(f"scope {compiled.scope_id} does not exist")

        safe_beat_ids = [
            sanitize_identifier(beat_id, f"beat-{index:03d}")
            for index, beat_id in enumerate(beat_ids)
            if beat_id and beat_id.strip()
        ]
        coverage_additions = []
        if safe_beat_ids:
            coverage_additions = [
                SourceCoverage(
                    source_unit_id=unit_id,
                    beat_ids=safe_beat_ids,
                    coverage_status="covered",
                )
                for unit_id in scope_doc.source_unit_ids
            ]
        else:
            logger.warning(
                "slice for scope %s produced no beat ids; skipping coverage "
                "additions (SourceCoverage requires at least one beat id)",
                compiled.scope_id,
            )

        continuity_updates = []
        if previous_slice_ending.strip():
            continuity_updates.append(
                ContinuityUpdate(
                    key="previous_slice_ending", value=previous_slice_ending
                )
            )
        if last_page_hook.strip():
            continuity_updates.append(
                ContinuityUpdate(key="last_page_hook", value=last_page_hook)
            )

        delta = MemoryDelta(
            schema_version="memory-delta.v1",
            project_id=project_id,
            base_memory_version=compiled.memory_version,
            continuity_updates=continuity_updates,
            coverage_additions=coverage_additions,
            source_artifact_ids=[compiled.artifact_id],
        )
        snapshot = await self._memory_merge.merge(delta)

        run_doc = await self._repositories.get_run(compiled.run_id)
        if run_doc is not None and run_doc.status != "succeeded":
            run_doc.status = "succeeded"
            run_doc.active_stage = None
            run_doc.updated_at = utc_now()
            await self._repositories.save_run(run_doc)

        logger.info(
            "durable memory advanced to v%d for project %s (delta cites %s)",
            snapshot.memory_version,
            project_id,
            compiled.artifact_id,
        )
        return snapshot.memory_version


def build_default_bridge() -> CompiledContextBridge:
    """Bridge wired to the live v1 collections (used by the real pipeline)."""

    from app.config import get_settings
    from app.persistence.v1_bridge import V1BridgedRepositories

    settings = get_settings()
    return CompiledContextBridge(
        V1BridgedRepositories(),
        max_input_tokens=settings.compiled_context_max_input_tokens,
    )
