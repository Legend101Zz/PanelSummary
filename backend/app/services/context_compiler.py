"""Deterministic, priority-ordered compilation of bounded agent context."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Literal

from pydantic import ValidationError

from app.contracts.artifacts import ArtifactRef, AssetRef
from app.contracts.context import (
    BookCanonView,
    ContextPack,
    ContinuityView,
    GenerationConstraints,
    GroundedFact,
)
from app.contracts.source import SourceRef, SourceUnitExcerpt
from app.persistence.documents import ProjectMemorySnapshotDoc, ScopeManifestDoc, SourceUnitDoc

from .errors import ContextBudgetError
from .hashing import content_hash, estimate_tokens

Purpose = Literal[
    "manga_direction",
    "manga_page_writing",
    "manga_thumbnail",
    "manga_composition",
    "reel_direction",
]
OMITTED_TEXT = "Omitted from this bounded context pack; retrieve from durable memory if needed."


class ContextCompiler:
    compiler_version = "context-compiler.v1"

    def compile(
        self,
        *,
        project_id: str,
        scope: ScopeManifestDoc,
        memory: ProjectMemorySnapshotDoc,
        source_units: list[SourceUnitDoc],
        purpose: Purpose,
        constraints: GenerationConstraints,
        max_input_tokens: int,
        required_fact_ids: set[str] | None = None,
        parent_artifacts: list[ArtifactRef] | None = None,
    ) -> ContextPack:
        required_ids = required_fact_ids or set()
        units_by_id = {unit.source_unit_id: unit for unit in source_units}
        missing = [unit_id for unit_id in scope.source_unit_ids if unit_id not in units_by_id]
        if missing:
            raise ContextBudgetError(f"Scope source units are unavailable: {', '.join(missing)}")

        excerpts = [self._excerpt(units_by_id[unit_id]) for unit_id in scope.source_unit_ids]
        all_facts = sorted(
            (GroundedFact.model_validate(item) for item in memory.facts),
            key=lambda fact: fact.fact_id,
        )
        required_facts = [fact for fact in all_facts if fact.fact_id in required_ids]
        absent_required = sorted(required_ids - {fact.fact_id for fact in required_facts})
        if absent_required:
            raise ContextBudgetError(
                f"Required facts are unavailable: {', '.join(absent_required)}"
            )

        book_spine = memory.book_spine
        base_canon = BookCanonView(
            synopsis=OMITTED_TEXT,
            themes=[],
            facts=required_facts,
            terminology=book_spine.get("terminology", []),
            art_direction=OMITTED_TEXT,
            narrative_voice=OMITTED_TEXT,
        )
        state: dict[str, Any] = {
            "book_canon": base_canon,
            "continuity": ContinuityView(previous_slice_ending=None),
            "assets": [],
        }
        omitted: list[str] = []

        if (
            self._tokens(
                project_id,
                scope,
                memory,
                purpose,
                excerpts,
                state,
                constraints,
                parent_artifacts or [],
                [],
            )
            > max_input_tokens
        ):
            mandatory_tokens = self._tokens(
                project_id,
                scope,
                memory,
                purpose,
                excerpts,
                state,
                constraints,
                parent_artifacts or [],
                [],
            )
            raise ContextBudgetError(
                f"Token budget {max_input_tokens} cannot hold selected source evidence and "
                f"required facts; at least {mandatory_tokens} estimated tokens are required"
            )

        continuity_full = self._continuity(memory)
        character_world = continuity_full.model_copy(
            update={"previous_slice_ending": None, "unresolved_threads": []}
        )
        self._try_section(
            "character_world_canon",
            state,
            omitted,
            lambda candidate: candidate.update(continuity=character_world),
            max_input_tokens,
            project_id,
            scope,
            memory,
            purpose,
            excerpts,
            constraints,
            parent_artifacts or [],
            enabled=bool(character_world.character_state or character_world.world_state),
        )
        self._try_section(
            "previous_slice_continuity",
            state,
            omitted,
            lambda candidate: candidate.update(continuity=continuity_full),
            max_input_tokens,
            project_id,
            scope,
            memory,
            purpose,
            excerpts,
            constraints,
            parent_artifacts or [],
            enabled=bool(
                continuity_full.previous_slice_ending or continuity_full.unresolved_threads
            ),
        )

        assets = self._assets(memory)
        self._try_section(
            "reusable_visual_assets",
            state,
            omitted,
            lambda candidate: candidate.update(assets=assets),
            max_input_tokens,
            project_id,
            scope,
            memory,
            purpose,
            excerpts,
            constraints,
            parent_artifacts or [],
            enabled=bool(assets),
        )

        optional_facts = [fact for fact in all_facts if fact.fact_id not in required_ids]
        self._try_section(
            "optional_facts",
            state,
            omitted,
            lambda candidate: setattr(candidate["book_canon"], "facts", all_facts),
            max_input_tokens,
            project_id,
            scope,
            memory,
            purpose,
            excerpts,
            constraints,
            parent_artifacts or [],
            enabled=bool(optional_facts),
        )

        full_canon = BookCanonView.model_validate(
            {
                "synopsis": book_spine.get("synopsis", OMITTED_TEXT),
                "themes": book_spine.get("themes", []),
                "terminology": state["book_canon"].terminology,
                "art_direction": book_spine.get("art_direction", OMITTED_TEXT),
                "narrative_voice": book_spine.get("narrative_voice", OMITTED_TEXT),
                "facts": state["book_canon"].facts,
            }
        )
        self._try_section(
            "global_synopsis_art_direction",
            state,
            omitted,
            lambda candidate: candidate.update(book_canon=full_canon),
            max_input_tokens,
            project_id,
            scope,
            memory,
            purpose,
            excerpts,
            constraints,
            parent_artifacts or [],
            enabled=True,
        )

        payload = self._payload(
            project_id,
            scope,
            memory,
            purpose,
            excerpts,
            state,
            constraints,
            parent_artifacts or [],
            omitted,
        )
        estimated = 0
        for _ in range(4):
            payload["compilation"]["estimated_tokens"] = estimated
            revised_estimate = estimate_tokens(payload)
            if revised_estimate == estimated:
                break
            estimated = revised_estimate
        payload["compilation"]["estimated_tokens"] = estimated
        payload["content_hash"] = content_hash(
            {key: value for key, value in payload.items() if key != "content_hash"}
        )
        pack = ContextPack.model_validate(payload)
        if pack.compilation.estimated_tokens > max_input_tokens:
            raise ContextBudgetError("Context metadata exceeded the token budget after compilation")
        return pack

    def _try_section(
        self,
        name: str,
        state: dict[str, Any],
        omitted: list[str],
        apply: Any,
        max_tokens: int,
        project_id: str,
        scope: ScopeManifestDoc,
        memory: ProjectMemorySnapshotDoc,
        purpose: Purpose,
        excerpts: list[SourceUnitExcerpt],
        constraints: GenerationConstraints,
        parent_artifacts: list[ArtifactRef],
        *,
        enabled: bool,
    ) -> None:
        if not enabled:
            return
        candidate = deepcopy(state)
        apply(candidate)
        if (
            self._tokens(
                project_id,
                scope,
                memory,
                purpose,
                excerpts,
                candidate,
                constraints,
                parent_artifacts,
                omitted,
            )
            <= max_tokens
        ):
            state.clear()
            state.update(candidate)
        else:
            omitted.append(name)

    def _tokens(
        self,
        project_id: str,
        scope: ScopeManifestDoc,
        memory: ProjectMemorySnapshotDoc,
        purpose: Purpose,
        excerpts: list[SourceUnitExcerpt],
        state: dict[str, Any],
        constraints: GenerationConstraints,
        parent_artifacts: list[ArtifactRef],
        omitted: list[str],
    ) -> int:
        return estimate_tokens(
            self._payload(
                project_id,
                scope,
                memory,
                purpose,
                excerpts,
                state,
                constraints,
                parent_artifacts,
                omitted,
            )
        )

    def _payload(
        self,
        project_id: str,
        scope: ScopeManifestDoc,
        memory: ProjectMemorySnapshotDoc,
        purpose: Purpose,
        excerpts: list[SourceUnitExcerpt],
        state: dict[str, Any],
        constraints: GenerationConstraints,
        parent_artifacts: list[ArtifactRef],
        omitted: list[str],
    ) -> dict[str, Any]:
        identity: dict[str, Any] = {
            "project_id": project_id,
            "scope_id": scope.scope_id,
            "memory_version": memory.memory_version,
            "purpose": purpose,
            "included_source_ids": scope.source_unit_ids,
        }
        if parent_artifacts:
            identity["parent_artifacts"] = [
                item.model_dump(mode="json") for item in parent_artifacts
            ]
            identity["constraints"] = constraints.model_dump(mode="json")
        return {
            "schema_version": "context-pack.v1",
            "context_pack_id": f"context_{content_hash(identity)[:24]}",
            "project_id": project_id,
            "scope_id": scope.scope_id,
            "memory_version": memory.memory_version,
            "purpose": purpose,
            "source_units": [item.model_dump(mode="json") for item in excerpts],
            "book_canon": state["book_canon"].model_dump(mode="json"),
            "continuity": state["continuity"].model_dump(mode="json"),
            "assets": [item.model_dump(mode="json") for item in state["assets"]],
            "parent_artifacts": [item.model_dump(mode="json") for item in parent_artifacts],
            "constraints": constraints.model_dump(mode="json"),
            "compilation": {
                "included_source_ids": scope.source_unit_ids,
                "omitted_optional_sections": omitted,
                "estimated_tokens": 0,
                "compiler_version": self.compiler_version,
            },
            "content_hash": "0" * 64,
        }

    @staticmethod
    def _excerpt(unit: SourceUnitDoc) -> SourceUnitExcerpt:
        if unit.text is None:
            raise ContextBudgetError(
                f"Source unit {unit.source_unit_id} requires a storage text resolver"
            )
        try:
            return SourceUnitExcerpt(
                source_ref=SourceRef(
                    book_id=unit.book_id,
                    source_unit_id=unit.source_unit_id,
                    page_start=unit.page_start,
                    page_end=unit.page_end,
                    text_hash=unit.text_hash,
                ),
                heading_path=unit.heading_path,
                excerpt=unit.text,
                token_count=unit.token_count,
            )
        except ValidationError as error:
            raise ContextBudgetError(
                f"Source unit {unit.source_unit_id} is not excerptable: {error}"
            ) from error

    @staticmethod
    def _continuity(memory: ProjectMemorySnapshotDoc) -> ContinuityView:
        payload = {
            "previous_slice_ending": memory.continuity.get("previous_slice_ending"),
            "character_state": memory.character_state,
            "world_state": memory.world_state,
            "unresolved_threads": memory.continuity.get("unresolved_threads", []),
        }
        return ContinuityView.model_validate(payload)

    @staticmethod
    def _assets(memory: ProjectMemorySnapshotDoc) -> list[AssetRef]:
        return sorted(
            (AssetRef.model_validate(item) for item in memory.asset_index),
            key=lambda asset: asset.asset_id,
        )
