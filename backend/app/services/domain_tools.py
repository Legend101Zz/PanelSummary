"""Authenticated, project-scoped Manga Director domain-tool implementations."""

from __future__ import annotations

from typing import Any, cast

from pydantic import BaseModel, ConfigDict, Field, JsonValue, ValidationError

from app.contracts.context import ContextPack
from app.contracts.manga import MangaPlan
from app.contracts.source import SourceRef
from app.persistence.documents import ArtifactDoc, construct_document, utc_now
from app.persistence.protocols import (
    ArtifactRepository,
    RunRepository,
)

from .errors import ArtifactValidationError, AuthorizationError, NotFoundError
from .hashing import content_hash


class DomainToolScope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    correlation_id: str = Field(min_length=1, max_length=128)
    goal_id: str = Field(min_length=1, max_length=128)
    run_id: str = Field(min_length=1, max_length=128)
    stage_run_id: str = Field(min_length=1, max_length=128)
    context_pack_id: str = Field(min_length=1, max_length=128)
    project_id: str = Field(min_length=1, max_length=128)


class DomainToolRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    arguments: dict[str, JsonValue] = Field(default_factory=dict, max_length=64)
    scope: DomainToolScope


class DomainToolResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str
    data: JsonValue | None = None
    candidate: JsonValue | None = None


class MangaDirectorToolService:
    readable_tools = {
        "get_source_excerpt",
        "get_canon_entity",
        "list_relevant_assets",
    }
    submission_tools = {"submit_manga_plan"}
    report_tools = {"report_source_conflict"}

    def __init__(self, runs: RunRepository, artifacts: ArtifactRepository) -> None:
        self._runs = runs
        self._artifacts = artifacts

    async def execute(self, tool_name: str, request: DomainToolRequest) -> DomainToolResponse:
        context_artifact, context = await self._authorized_context(request.scope)
        if tool_name == "get_source_excerpt":
            return self._get_source_excerpt(context, request.arguments)
        if tool_name == "get_canon_entity":
            return self._get_canon_entity(context, request.arguments)
        if tool_name == "list_relevant_assets":
            return self._list_relevant_assets(context, request.arguments)
        if tool_name == "submit_manga_plan":
            return await self._submit_manga_plan(
                request.scope,
                context_artifact,
                context,
                request.arguments,
            )
        if tool_name == "report_source_conflict":
            return self._report_source_conflict(context, request.arguments)
        raise NotFoundError(f"Domain tool {tool_name} is not enabled for Manga Director")

    async def _authorized_context(self, scope: DomainToolScope) -> tuple[ArtifactDoc, ContextPack]:
        run = await self._runs.get_run(scope.run_id)
        if run is None:
            raise AuthorizationError("Agent tool scope references an unknown run")
        if run.project_id != scope.project_id:
            raise AuthorizationError("Agent tool scope crosses project ownership")
        if run.status != "running" or run.active_stage != "manga_direction":
            raise AuthorizationError("Agent tool scope is not the active run stage")
        stage = await self._runs.get_stage(scope.stage_run_id)
        if stage is None or stage.run_id != scope.run_id:
            raise AuthorizationError("Agent tool scope references an unknown stage")
        if stage.stage_name != "manga_direction":
            raise AuthorizationError("Agent tool is not authorized for this stage")
        if stage.status not in {"running", "validating", "repairing"}:
            raise AuthorizationError("Agent tool stage is not active")

        artifact = await self._artifacts.get_artifact(scope.context_pack_id)
        if (
            artifact is None
            or artifact.project_id != scope.project_id
            or artifact.run_id != scope.run_id
            or artifact.kind != "context_pack"
            or artifact.validation_status != "accepted"
            or artifact.content is None
        ):
            raise AuthorizationError("ContextPack artifact is not accepted for this run")
        try:
            context = ContextPack.model_validate(artifact.content)
        except ValidationError as error:
            raise ArtifactValidationError("Persisted ContextPack is invalid") from error
        if context.context_pack_id != scope.context_pack_id:
            raise AuthorizationError("ContextPack identity does not match tool scope")
        return artifact, context

    @staticmethod
    def _get_source_excerpt(
        context: ContextPack, arguments: dict[str, JsonValue]
    ) -> DomainToolResponse:
        source_unit_id = arguments.get("source_unit_id")
        if not isinstance(source_unit_id, str):
            raise ArtifactValidationError("source_unit_id is required")
        excerpt = next(
            (
                item
                for item in context.source_units
                if item.source_ref.source_unit_id == source_unit_id
            ),
            None,
        )
        if excerpt is None:
            raise AuthorizationError("Source unit is outside the persisted ContextPack")

        start = 0
        end = len(excerpt.excerpt)
        span = arguments.get("span")
        if span is not None:
            if not isinstance(span, dict):
                raise ArtifactValidationError("span must be an object")
            raw_start = span.get("start", 0)
            raw_end = span.get("end", end)
            if not isinstance(raw_start, int) or not isinstance(raw_end, int):
                raise ArtifactValidationError("span offsets must be integers")
            start, end = raw_start, raw_end
        if start < 0 or end <= start or end > len(excerpt.excerpt):
            raise ArtifactValidationError("span is outside the source excerpt")
        if end - start > 20_000:
            raise ArtifactValidationError("source excerpt response exceeds 20,000 characters")
        payload = {
            "source_ref": excerpt.source_ref.model_dump(mode="json"),
            "heading_path": excerpt.heading_path,
            "excerpt": excerpt.excerpt[start:end],
            "span": {"start": start, "end": end},
        }
        return DomainToolResponse(
            content="Bounded untrusted source evidence returned.",
            data=payload,
        )

    @staticmethod
    def _get_canon_entity(
        context: ContextPack, arguments: dict[str, JsonValue]
    ) -> DomainToolResponse:
        entity_id = arguments.get("entity_id")
        if not isinstance(entity_id, str):
            raise ArtifactValidationError("entity_id is required")
        candidates: list[tuple[str, Any]] = []
        candidates.extend((item.fact_id, item) for item in context.book_canon.facts)
        candidates.extend((item.character_id, item) for item in context.continuity.character_state)
        candidates.extend((item.thread_id, item) for item in context.continuity.unresolved_threads)
        candidates.extend((item.canonical_form, item) for item in context.book_canon.terminology)
        if entity_id in context.continuity.world_state:
            return DomainToolResponse(
                content="Project-scoped canon entity returned.",
                data={
                    "entity_id": entity_id,
                    "value": context.continuity.world_state[entity_id],
                },
            )
        for candidate_id, value in candidates:
            if candidate_id == entity_id:
                return DomainToolResponse(
                    content="Project-scoped canon entity returned.",
                    data=value.model_dump(mode="json"),
                )
        raise NotFoundError(f"Canon entity {entity_id} is not in the ContextPack")

    @staticmethod
    def _list_relevant_assets(
        context: ContextPack, arguments: dict[str, JsonValue]
    ) -> DomainToolResponse:
        character_ids = arguments.get("character_ids")
        if not isinstance(character_ids, list) or any(
            not isinstance(item, str) for item in character_ids
        ):
            raise ArtifactValidationError("character_ids must be a string array")
        normalized_character_ids = cast(list[str], character_ids)
        known = {
            state.character_id: set(state.visual_asset_ids)
            for state in context.continuity.character_state
        }
        allowed_ids = (
            set().union(*(known.get(item, set()) for item in normalized_character_ids))
            if normalized_character_ids
            else set()
        )
        assets = [
            item.model_dump(mode="json")
            for item in context.assets
            if not normalized_character_ids or item.asset_id in allowed_ids
        ][:100]
        return DomainToolResponse(
            content="Project-scoped reusable asset metadata returned.",
            data={"assets": assets},
        )

    async def _submit_manga_plan(
        self,
        scope: DomainToolScope,
        context_artifact: ArtifactDoc,
        context: ContextPack,
        arguments: dict[str, JsonValue],
    ) -> DomainToolResponse:
        raw_plan = arguments.get("plan")
        if not isinstance(raw_plan, dict):
            raise ArtifactValidationError("plan must be an object")
        try:
            plan = MangaPlan.model_validate(raw_plan)
        except ValidationError as error:
            raise ArtifactValidationError(f"MangaPlan validation failed: {error}") from error
        if (
            plan.project_id != scope.project_id
            or plan.scope_id != context.scope_id
            or plan.context_pack_id != context.context_pack_id
            or plan.memory_version != context.memory_version
        ):
            raise AuthorizationError("MangaPlan identity does not match its ContextPack")
        if plan.target_page_count > context.constraints.max_pages:
            raise ArtifactValidationError("MangaPlan exceeds the page budget")
        if plan.target_page_count > len(plan.beats):
            raise ArtifactValidationError(
                "MangaPlan target_page_count cannot exceed its grounded beat count"
            )
        if len(plan.beats) > plan.target_page_count * context.constraints.max_panels_per_page:
            raise ArtifactValidationError(
                "MangaPlan beat count exceeds the per-page panel budget"
            )

        source_refs = self._plan_source_refs(plan)
        expected = {
            item.source_ref.source_unit_id: item.source_ref for item in context.source_units
        }
        for ref in source_refs:
            context_ref = expected.get(ref.source_unit_id)
            if (
                context_ref is None
                or ref.book_id != context_ref.book_id
                or ref.text_hash != context_ref.text_hash
                or ref.page_start < context_ref.page_start
                or ref.page_end > context_ref.page_end
            ):
                raise AuthorizationError(
                    f"MangaPlan source {ref.source_unit_id} is outside persisted evidence"
                )
        cited_source_ids = {ref.source_unit_id for ref in source_refs}
        run = await self._runs.get_run(scope.run_id)
        if run is None:
            raise AuthorizationError("Agent tool scope references an unknown run")
        if run.pipeline_version == "manga-demo-deterministic.v1":
            beat_refs = [ref for beat in plan.beats for ref in beat.source_refs]
            cited_pages = [ref.page_start for ref in beat_refs]
            if (
                plan.target_page_count != 5
                or len(plan.beats) != 10
                or len(beat_refs) != 10
                or len(cited_source_ids) != 10
            ):
                raise ArtifactValidationError(
                    "Deterministic demo MangaPlan requires five pages and exactly one "
                    "distinct persisted source unit per beat"
                )
            if cited_pages != sorted(cited_pages):
                raise ArtifactValidationError(
                    "Deterministic demo sources must remain in page order"
                )
            for ref in beat_refs:
                context_ref = expected[ref.source_unit_id]
                if ref != context_ref:
                    raise ArtifactValidationError(
                        "Deterministic demo panels must copy complete persisted SourceRefs"
                    )
        elif run.pipeline_version == "manga-edition.v1":
            beat_refs = [ref for beat in plan.beats for ref in beat.source_refs]
            context_pages = sorted(ref.page_start for ref in expected.values())
            cited_pages = [ref.page_start for ref in beat_refs]
            if (
                len(plan.beats) != 20
                or len(beat_refs) != 20
                or len(cited_source_ids) != 20
            ):
                raise ArtifactValidationError(
                    "Hackathon MangaPlan requires exactly one distinct representative "
                    "ContextPack source unit per beat"
                )
            if cited_pages != sorted(cited_pages):
                raise ArtifactValidationError(
                    "Hackathon MangaPlan representative sources must remain in page order"
                )
            if (
                not context_pages
                or cited_pages[0] > context_pages[0] + 10
                or cited_pages[-1] < context_pages[-1] - 10
            ):
                raise ArtifactValidationError(
                    "Hackathon MangaPlan representative sources must span the beginning "
                    "through the end of the selected book"
                )
        elif not set(expected).issubset(cited_source_ids):
            missing = ", ".join(sorted(set(expected) - cited_source_ids))
            raise ArtifactValidationError(
                f"MangaPlan omits selected ContextPack source units: {missing}"
            )
        required_fact_ids = {fact.fact_id for fact in context.book_canon.facts}
        cited_fact_ids = {fact_id for beat in plan.beats for fact_id in beat.required_fact_ids}
        if not cited_fact_ids.issubset(required_fact_ids):
            unknown = ", ".join(sorted(cited_fact_ids - required_fact_ids))
            raise ArtifactValidationError(
                f"MangaPlan cites unknown ContextPack fact IDs: {unknown}"
            )
        if not required_fact_ids.issubset(cited_fact_ids):
            missing = ", ".join(sorted(required_fact_ids - cited_fact_ids))
            raise ArtifactValidationError(f"MangaPlan omits required ContextPack facts: {missing}")

        payload = plan.model_dump(mode="json")
        digest = content_hash(payload)
        artifact_id = f"candidate_manga_plan_{digest[:24]}"
        unique_refs = {
            content_hash(ref.model_dump(mode="json")): ref.model_dump(mode="json")
            for ref in source_refs
        }
        artifact = construct_document(
            ArtifactDoc,
            artifact_id=artifact_id,
            project_id=scope.project_id,
            run_id=scope.run_id,
            kind="manga_plan",
            schema_version="manga-plan.v1",
            content=payload,
            storage_ref=None,
            content_hash=digest,
            parent_artifact_ids=[context_artifact.artifact_id],
            source_refs=[unique_refs[key] for key in sorted(unique_refs)],
            model_receipt=None,
            validation_status="valid",
            validation_report={
                "passed": True,
                "issues": [],
                "validator_version": "manga-plan-validator.v1",
            },
            created_at=utc_now(),
        )
        stored = await self._artifacts.save_artifact(artifact)
        return DomainToolResponse(
            content="MangaPlan validated and durably stored as a candidate.",
            data={
                "artifact_id": stored.artifact_id,
                "validation_status": stored.validation_status,
            },
            candidate=payload,
        )

    @staticmethod
    def _report_source_conflict(
        context: ContextPack, arguments: dict[str, JsonValue]
    ) -> DomainToolResponse:
        source_ids = arguments.get("source_unit_ids")
        description = arguments.get("description")
        if (
            not isinstance(source_ids, list)
            or not source_ids
            or any(not isinstance(item, str) for item in source_ids)
            or not isinstance(description, str)
            or not description.strip()
        ):
            raise ArtifactValidationError(
                "source_unit_ids and a non-empty description are required"
            )
        allowed = {item.source_ref.source_unit_id for item in context.source_units}
        if not set(source_ids).issubset(allowed):
            raise AuthorizationError("Conflict report references source outside ContextPack")
        return DomainToolResponse(
            content="Source conflict recorded for the current bounded agent run.",
            data={"source_unit_ids": source_ids, "description": description[:4_000]},
        )

    @staticmethod
    def _plan_source_refs(plan: MangaPlan) -> list[SourceRef]:
        refs: list[SourceRef] = []
        for beat in plan.beats:
            refs.extend(beat.source_refs)
        for fact in plan.new_facts:
            refs.extend(fact.source_refs)
        for character_update in plan.character_state_updates:
            refs.extend(character_update.source_refs)
        for terminology_update in plan.terminology_updates:
            refs.extend(terminology_update.source_refs)
        for thread_update in plan.unresolved_thread_updates:
            refs.extend(thread_update.source_refs)
        return refs
