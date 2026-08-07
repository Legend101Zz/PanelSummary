"""Validated, optimistic merging of agent-proposed durable memory deltas."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from pydantic import ValidationError

from app.contracts.artifacts import AssetRef
from app.contracts.context import MemoryDelta
from app.contracts.source import SourceRef
from app.persistence.documents import ArtifactDoc, ProjectMemorySnapshotDoc, construct_document
from app.persistence.protocols import (
    ArtifactRepository,
    MemoryRepository,
    SourceUnitRepository,
)

from .errors import (
    MemoryConflictError,
    NotFoundError,
    StaleMemoryDeltaError,
    UnsupportedSourceError,
)
from .hashing import content_hash


class MemoryMergeService:
    def __init__(
        self,
        memory: MemoryRepository,
        sources: SourceUnitRepository,
        artifacts: ArtifactRepository,
    ) -> None:
        self._memory = memory
        self._sources = sources
        self._artifacts = artifacts

    async def merge(self, delta: MemoryDelta) -> ProjectMemorySnapshotDoc:
        project = await self._memory.get_project(delta.project_id)
        if project is None:
            raise NotFoundError(f"Manga project {delta.project_id} does not exist")
        if project.active_memory_version != delta.base_memory_version:
            raise StaleMemoryDeltaError(
                f"Memory delta is based on version {delta.base_memory_version}; "
                f"active version is {project.active_memory_version}"
            )
        current = await self._memory.get_memory_snapshot(
            delta.project_id, delta.base_memory_version
        )
        if current is None:
            raise NotFoundError(
                f"Memory snapshot {delta.project_id}@{delta.base_memory_version} does not exist"
            )

        await self._validate_sources(project.book_id, delta)
        accepted_artifacts = await self._validate_artifacts(delta)
        accepted_assets = self._accepted_assets(delta.project_id, accepted_artifacts)
        state = self._apply(current, delta, accepted_assets)
        snapshot_payload = {
            "project_id": current.project_id,
            "memory_version": current.memory_version + 1,
            "parent_version": current.memory_version,
            **state,
        }
        snapshot = construct_document(
            ProjectMemorySnapshotDoc,
            **snapshot_payload,
            content_hash=content_hash(snapshot_payload),
        )
        advanced = await self._memory.advance_memory(
            delta.project_id,
            delta.base_memory_version,
            snapshot,
        )
        if not advanced:
            raise StaleMemoryDeltaError(
                "The active memory version changed during merge; recompile and reconcile"
            )
        return snapshot

    async def _validate_sources(self, book_id: str, delta: MemoryDelta) -> None:
        refs: list[SourceRef] = []
        for fact in delta.new_facts:
            refs.extend(fact.source_refs)
        for correction in delta.fact_corrections:
            refs.extend(correction.source_refs)
        for character_update in delta.character_state_updates:
            refs.extend(character_update.source_refs)
        for terminology_update in delta.terminology_updates:
            refs.extend(terminology_update.source_refs)
        for continuity_update in delta.continuity_updates:
            refs.extend(continuity_update.source_refs)
        for thread_update in delta.unresolved_thread_updates:
            refs.extend(thread_update.source_refs)

        for ref in refs:
            if ref.book_id != book_id:
                raise UnsupportedSourceError(
                    f"Source reference {ref.source_unit_id} belongs to a different book"
                )
            unit = await self._sources.get_source_unit(book_id, ref.source_unit_id)
            if unit is None:
                raise UnsupportedSourceError(
                    f"Source unit {ref.source_unit_id} does not exist for book {book_id}"
                )
            if unit.text_hash != ref.text_hash:
                raise UnsupportedSourceError(
                    f"Source reference {ref.source_unit_id} has a stale text hash"
                )
            if ref.page_start < unit.page_start or ref.page_end > unit.page_end:
                raise UnsupportedSourceError(
                    f"Source reference {ref.source_unit_id} exceeds its page provenance"
                )

        for addition in delta.coverage_additions:
            if await self._sources.get_source_unit(book_id, addition.source_unit_id) is None:
                raise UnsupportedSourceError(
                    f"Coverage cites unknown source unit {addition.source_unit_id}"
                )

    async def _validate_artifacts(self, delta: MemoryDelta) -> list[ArtifactDoc]:
        artifacts: list[ArtifactDoc] = []
        for artifact_id in delta.source_artifact_ids:
            artifact = await self._artifacts.get_artifact(artifact_id)
            if (
                artifact is None
                or artifact.project_id != delta.project_id
                or artifact.validation_status != "accepted"
            ):
                raise UnsupportedSourceError(
                    f"Memory delta cites unaccepted artifact {artifact_id}"
                )
            artifacts.append(artifact)
        return artifacts

    @staticmethod
    def _accepted_assets(
        project_id: str,
        artifacts: list[ArtifactDoc],
    ) -> list[dict[str, Any]]:
        accepted: dict[str, dict[str, Any]] = {}
        for artifact in artifacts:
            if artifact.schema_version != "asset-set.v1" or artifact.content is None:
                continue
            raw_assets = artifact.content.get("assets")
            if not isinstance(raw_assets, list):
                raise UnsupportedSourceError("Accepted asset set omitted asset metadata")
            for raw_asset in raw_assets:
                try:
                    asset = AssetRef.model_validate(raw_asset)
                except ValidationError as error:
                    raise UnsupportedSourceError(
                        "Accepted asset set contains invalid asset metadata"
                    ) from error
                if asset.project_id != project_id:
                    raise UnsupportedSourceError(
                        f"Accepted asset {asset.asset_id} belongs to a different project"
                    )
                accepted[asset.asset_id] = asset.model_dump(mode="json")
        return [accepted[key] for key in sorted(accepted)]

    @staticmethod
    def _apply(
        current: ProjectMemorySnapshotDoc,
        delta: MemoryDelta,
        accepted_assets: list[dict[str, Any]],
    ) -> dict[str, Any]:
        facts = {item["fact_id"]: deepcopy(item) for item in current.facts}
        corrections = {item.fact_id: item for item in delta.fact_corrections}
        for fact in sorted(delta.new_facts, key=lambda item: item.fact_id):
            payload = fact.model_dump(mode="json")
            existing = facts.get(fact.fact_id)
            if existing is not None and existing != payload and fact.fact_id not in corrections:
                raise MemoryConflictError(
                    f"Fact {fact.fact_id} contradicts accepted canon; submit a fact correction"
                )
            facts[fact.fact_id] = payload

        for correction in sorted(delta.fact_corrections, key=lambda item: item.fact_id):
            existing = facts.get(correction.fact_id)
            if existing is None:
                raise MemoryConflictError(f"Cannot correct missing fact {correction.fact_id}")
            existing["claim"] = correction.replacement_claim
            existing["source_refs"] = [
                ref.model_dump(mode="json") for ref in correction.source_refs
            ]
            facts[correction.fact_id] = existing

        character_state = {item["character_id"]: deepcopy(item) for item in current.character_state}
        for character_update in sorted(
            delta.character_state_updates, key=lambda item: item.character_id
        ):
            existing = character_state.get(
                character_update.character_id,
                {"character_id": character_update.character_id},
            )
            for key, value in sorted(character_update.state_patch.items()):
                existing[key] = value
            character_state[character_update.character_id] = existing

        continuity = deepcopy(current.continuity)
        for continuity_update in sorted(delta.continuity_updates, key=lambda item: item.key):
            continuity[continuity_update.key] = continuity_update.value
        threads = {
            item["thread_id"]: deepcopy(item) for item in continuity.get("unresolved_threads", [])
        }
        for thread_update in sorted(
            delta.unresolved_thread_updates, key=lambda item: item.thread_id
        ):
            threads[thread_update.thread_id] = {
                "thread_id": thread_update.thread_id,
                "summary": thread_update.summary,
                "status": thread_update.status,
            }
        continuity["unresolved_threads"] = [threads[key] for key in sorted(threads)]

        coverage = deepcopy(current.coverage)
        for addition in sorted(delta.coverage_additions, key=lambda item: item.source_unit_id):
            coverage[addition.source_unit_id] = {
                "beat_ids": sorted(set(addition.beat_ids)),
                "coverage_status": addition.coverage_status,
            }

        book_spine = deepcopy(current.book_spine)
        terminology = {
            item["canonical_form"]: deepcopy(item) for item in book_spine.get("terminology", [])
        }
        for update in sorted(delta.terminology_updates, key=lambda item: item.canonical_form):
            terminology[update.canonical_form] = {
                "term": update.term,
                "canonical_form": update.canonical_form,
                "meaning": update.meaning,
            }
        book_spine["terminology"] = [terminology[key] for key in sorted(terminology)]
        assets = {
            str(item["asset_id"]): deepcopy(item)
            for item in [*current.asset_index, *accepted_assets]
        }

        return {
            "book_spine": book_spine,
            "facts": [facts[key] for key in sorted(facts)],
            "character_state": [character_state[key] for key in sorted(character_state)],
            "world_state": deepcopy(current.world_state),
            "continuity": continuity,
            "coverage": coverage,
            "asset_index": [assets[key] for key in sorted(assets)],
            "source_artifact_ids": sorted(
                set(current.source_artifact_ids) | set(delta.source_artifact_ids)
            ),
        }
