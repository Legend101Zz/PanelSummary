"""Goal-specific page-writing and thumbnail tools behind the sealed broker."""

from __future__ import annotations

import logging
from copy import deepcopy
from pathlib import Path
from typing import cast

from pydantic import JsonValue, ValidationError

from app.contracts.context import ContextPack
from app.contracts.manga import MangaPagePlan, PageScript, PageScriptSet, ThumbnailSet
from app.persistence.protocols import ArtifactRepository, RunRepository

from .domain_tools import (
    DomainToolRequest,
    DomainToolResponse,
    DomainToolScope,
    MangaDirectorToolService,
)
from .errors import ArtifactValidationError, AuthorizationError, NotFoundError
from .hashing import binary_content_hash
from .manga_layout import LayoutCompilationError, compile_page_layout, render_thumbnail_svg
from .manga_page_planning import MangaPagePlanningService
from .manga_validation import validate_page_plan

logger = logging.getLogger(__name__)


class MangaPlanningToolService:
    page_writing_tools = {
        "get_book_context",
        "get_manga_canon",
        "submit_page_script_set",
        "report_page_script_blocker",
    }
    thumbnail_tools = {
        "get_page_script_set",
        "list_relevant_assets",
        "validate_layout_draft",
        "submit_thumbnail_set",
        "report_thumbnail_blocker",
    }

    def __init__(
        self,
        runs: RunRepository,
        artifacts: ArtifactRepository,
        *,
        media_root: Path = Path("storage"),
    ) -> None:
        self._runs = runs
        self._artifacts = artifacts
        self._planning = MangaPagePlanningService(runs, artifacts, media_root=media_root)

    async def execute(self, tool_name: str, request: DomainToolRequest) -> DomainToolResponse:
        if tool_name in self.page_writing_tools:
            stage_name = "manga_page_writing"
        elif tool_name in self.thumbnail_tools:
            stage_name = "manga_thumbnail"
        else:
            raise NotFoundError(f"Domain tool {tool_name} is not a page-planning tool")
        context = await self._authorized_context(request.scope, stage_name=stage_name)

        if tool_name == "get_book_context":
            return self._get_book_context(context, request.arguments)
        if tool_name == "get_manga_canon":
            return await self._get_manga_canon(request.scope, request.arguments)
        if tool_name == "submit_page_script_set":
            return await self._submit_page_script_set(request.scope, request.arguments)
        if tool_name == "report_page_script_blocker":
            return self._report_blocker("Page-writing", request.arguments)
        if tool_name == "get_page_script_set":
            return await self._get_page_script_set(request.scope, request.arguments)
        if tool_name == "list_relevant_assets":
            return self._list_relevant_assets(context, request.arguments)
        if tool_name == "validate_layout_draft":
            return await self._validate_layout_draft(
                request.scope,
                context,
                request.arguments,
            )
        if tool_name == "submit_thumbnail_set":
            return await self._submit_thumbnail_set(
                request.scope,
                context,
                request.arguments,
            )
        return self._report_blocker("Thumbnail", request.arguments)

    async def _authorized_context(
        self,
        scope: DomainToolScope,
        *,
        stage_name: str,
    ) -> ContextPack:
        run = await self._runs.get_run(scope.run_id)
        if run is None:
            raise AuthorizationError("Agent tool scope references an unknown run")
        if run.project_id != scope.project_id:
            raise AuthorizationError("Agent tool scope crosses project ownership")
        if run.status != "running" or run.active_stage != stage_name:
            raise AuthorizationError("Agent tool scope is not the active run stage")
        stage = await self._runs.get_stage(scope.stage_run_id)
        if stage is None or stage.run_id != scope.run_id:
            raise AuthorizationError("Agent tool scope references an unknown stage")
        if stage.stage_name != stage_name:
            raise AuthorizationError("Agent tool is not authorized for this stage")
        if stage.status not in {"running", "validating", "repairing"}:
            raise AuthorizationError("Agent tool stage is not active")
        if scope.context_pack_id not in stage.input_artifact_ids:
            raise AuthorizationError("ContextPack is not authorized as an input to this stage")
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
        if context.purpose != stage_name:
            raise AuthorizationError("ContextPack purpose does not authorize this planning goal")
        for parent_ref in context.parent_artifacts:
            parent = await self._artifacts.get_artifact(parent_ref.artifact_id)
            if (
                parent is None
                or parent.project_id != scope.project_id
                or parent.run_id != scope.run_id
                or parent.validation_status != "accepted"
                or parent.kind != parent_ref.kind.value
                or parent.schema_version != parent_ref.schema_version
                or parent.content_hash != parent_ref.content_hash
            ):
                raise AuthorizationError(
                    f"ContextPack parent {parent_ref.artifact_id} is outside accepted run lineage"
                )
        return context

    @staticmethod
    def _get_book_context(
        context: ContextPack,
        arguments: dict[str, JsonValue],
    ) -> DomainToolResponse:
        section = arguments.get("section")
        query = arguments.get("query")
        if section is not None and not isinstance(section, str):
            raise ArtifactValidationError("section must be a string")
        if query is not None and not isinstance(query, str):
            raise ArtifactValidationError("query must be a string")
        payload = {
            "context_pack_id": context.context_pack_id,
            "scope_id": context.scope_id,
            "memory_version": context.memory_version,
            "book_canon": context.book_canon.model_dump(mode="json"),
            "continuity": context.continuity.model_dump(mode="json"),
            "source_units": [item.model_dump(mode="json") for item in context.source_units],
            "section": section,
            "query": query,
        }
        if len(str(payload).encode("utf-8")) > 200_000:
            raise ArtifactValidationError("book context response exceeds 200,000 bytes")
        return DomainToolResponse(
            content="Bounded persisted book context returned.",
            data=payload,
        )

    async def _get_manga_canon(
        self,
        scope: DomainToolScope,
        arguments: dict[str, JsonValue],
    ) -> DomainToolResponse:
        artifact_ids = arguments.get("artifact_ids")
        if (
            not isinstance(artifact_ids, list)
            or not artifact_ids
            or any(not isinstance(item, str) for item in artifact_ids)
        ):
            raise ArtifactValidationError("artifact_ids must be a non-empty string array")
        if len(artifact_ids) > 20:
            raise ArtifactValidationError("artifact_ids exceeds the 20-artifact response cap")
        payloads: list[dict[str, JsonValue]] = []
        for artifact_id in cast(list[str], artifact_ids):
            artifact = await self._artifacts.get_artifact(artifact_id)
            if (
                artifact is None
                or artifact.project_id != scope.project_id
                or artifact.run_id != scope.run_id
                or artifact.validation_status != "accepted"
                or artifact.kind not in {"manga_plan", "page_script_set"}
                or artifact.content is None
            ):
                raise AuthorizationError(f"Artifact {artifact_id} is outside accepted canon")
            payloads.append(
                {
                    "artifact_id": artifact.artifact_id,
                    "kind": artifact.kind,
                    "schema_version": artifact.schema_version,
                    "content_hash": artifact.content_hash,
                    "content": artifact.content,
                }
            )
        return DomainToolResponse(
            content="Accepted project-scoped manga canon returned.",
            data={"artifacts": payloads},
        )

    async def _submit_page_script_set(
        self,
        scope: DomainToolScope,
        arguments: dict[str, JsonValue],
    ) -> DomainToolResponse:
        raw = arguments.get("script_set")
        if not isinstance(raw, dict):
            raise ArtifactValidationError("script_set must be an object")
        try:
            script_set = PageScriptSet.model_validate(raw)
        except ValidationError as error:
            raise ArtifactValidationError(f"PageScriptSet validation failed: {error}") from error
        artifact = await self._planning.submit_page_script_set(
            run_id=scope.run_id,
            stage_run_id=scope.stage_run_id,
            plan_artifact_id=script_set.plan_artifact_id,
            script_set=script_set,
            context_pack_id=scope.context_pack_id,
        )
        return DomainToolResponse(
            content="PageScriptSet validated and durably accepted.",
            data={
                "artifact_id": artifact.artifact_id,
                "content_hash": artifact.content_hash,
                "validation_status": artifact.validation_status,
            },
            candidate=script_set.model_dump(mode="json"),
        )

    async def _get_page_script_set(
        self,
        scope: DomainToolScope,
        arguments: dict[str, JsonValue],
    ) -> DomainToolResponse:
        artifact_id = arguments.get("artifact_id")
        if not isinstance(artifact_id, str):
            raise ArtifactValidationError("artifact_id is required")
        artifact = await self._artifacts.get_artifact(artifact_id)
        if (
            artifact is None
            or artifact.project_id != scope.project_id
            or artifact.run_id != scope.run_id
            or artifact.kind != "page_script_set"
            or artifact.validation_status != "accepted"
            or artifact.content is None
        ):
            raise AuthorizationError("PageScriptSet is outside accepted run lineage")
        return DomainToolResponse(
            content="Accepted PageScriptSet returned.",
            data={
                "artifact_id": artifact.artifact_id,
                "content_hash": artifact.content_hash,
                "script_set": artifact.content,
            },
        )

    @staticmethod
    def _list_relevant_assets(
        context: ContextPack,
        arguments: dict[str, JsonValue],
    ) -> DomainToolResponse:
        character_ids = arguments.get("character_ids")
        if not isinstance(character_ids, list) or any(
            not isinstance(item, str) for item in character_ids
        ):
            raise ArtifactValidationError("character_ids must be a string array")
        requested = set(cast(list[str], character_ids))
        known = {
            state.character_id: set(state.visual_asset_ids)
            for state in context.continuity.character_state
        }
        allowed = (
            set().union(*(known.get(item, set()) for item in requested)) if requested else set()
        )
        assets = [
            item.model_dump(mode="json")
            for item in context.assets
            if not requested or item.asset_id in allowed
        ][:100]
        return DomainToolResponse(
            content="Project-scoped reusable asset metadata returned.",
            data={"assets": assets},
        )

    async def _validate_layout_draft(
        self,
        scope: DomainToolScope,
        context: ContextPack,
        arguments: dict[str, JsonValue],
    ) -> DomainToolResponse:
        raw = arguments.get("page_plan")
        if not isinstance(raw, dict):
            raise ArtifactValidationError("page_plan must be an object")
        normalized = deepcopy(raw)
        if "page_script" not in normalized:
            script_set_artifact_id = arguments.get("script_set_artifact_id")
            page_index = arguments.get("page_index")
            if not isinstance(script_set_artifact_id, str) or not isinstance(page_index, int):
                raise ArtifactValidationError(
                    "script_set_artifact_id and page_index are required when page_script is omitted"
                )
            script_set = await self._authorized_script_set(
                scope,
                context,
                script_set_artifact_id,
            )
            if page_index >= len(script_set.pages):
                raise ArtifactValidationError("page_index is outside the accepted PageScriptSet")
            normalized = self._normalize_page_plan(
                normalized,
                page_script=script_set.pages[page_index],
                project_id=scope.project_id,
                script_set_artifact_id=script_set_artifact_id,
            )
        try:
            plan = MangaPagePlan.model_validate(normalized)
        except ValidationError as error:
            logger.warning(
                "MangaPagePlan draft rejected for stage %s: %s",
                scope.stage_run_id,
                error.errors(include_input=False),
            )
            raise ArtifactValidationError(f"MangaPagePlan validation failed: {error}") from error
        if plan.project_id != scope.project_id:
            raise AuthorizationError("MangaPagePlan crosses project ownership")
        try:
            compiled = compile_page_layout(plan)
        except LayoutCompilationError as error:
            return DomainToolResponse(
                content="Layout draft failed deterministic compilation.",
                data={
                    "passed": False,
                    "issues": [issue.model_dump(mode="json") for issue in error.issues],
                },
            )
        issues = validate_page_plan(plan, compiled)
        svg = render_thumbnail_svg(plan, compiled)
        return DomainToolResponse(
            content="Layout draft compiled without any provider or image call.",
            data={
                "passed": not any(issue.severity == "error" for issue in issues),
                "compiler_hash": compiled.compiler_hash,
                "compiled_layout": compiled.model_dump(mode="json"),
                "normalized_page_plan": plan.model_dump(mode="json"),
                "preview_svg": svg,
                "preview_hash": binary_content_hash(svg.encode("utf-8")),
                "issues": [issue.model_dump(mode="json") for issue in issues],
            },
        )

    async def _submit_thumbnail_set(
        self,
        scope: DomainToolScope,
        context: ContextPack,
        arguments: dict[str, JsonValue],
    ) -> DomainToolResponse:
        raw = arguments.get("thumbnail_set")
        if not isinstance(raw, dict):
            raise ArtifactValidationError("thumbnail_set must be an object")
        normalized = deepcopy(raw)
        normalized["project_id"] = scope.project_id
        script_set_artifact_id = normalized.get("script_set_artifact_id")
        raw_plans = normalized.get("page_plans")
        if isinstance(script_set_artifact_id, str) and isinstance(raw_plans, list):
            script_set = await self._authorized_script_set(
                scope,
                context,
                script_set_artifact_id,
            )
            hydrated_plans: list[JsonValue] = []
            for raw_plan in raw_plans:
                if not isinstance(raw_plan, dict):
                    hydrated_plans.append(raw_plan)
                    continue
                plan = deepcopy(raw_plan)
                page_index = plan.pop("page_index", None)
                if "page_script" not in plan:
                    if not isinstance(page_index, int) or page_index >= len(script_set.pages):
                        raise ArtifactValidationError(
                            "Each page plan without page_script requires a valid page_index"
                        )
                    plan = self._normalize_page_plan(
                        plan,
                        page_script=script_set.pages[page_index],
                        project_id=scope.project_id,
                        script_set_artifact_id=script_set_artifact_id,
                    )
                hydrated_plans.append(plan)
            normalized["page_plans"] = hydrated_plans
        try:
            thumbnail_set = ThumbnailSet.model_validate(normalized)
        except ValidationError as error:
            raise ArtifactValidationError(f"ThumbnailSet validation failed: {error}") from error
        result = await self._planning.submit_thumbnail_set(
            run_id=scope.run_id,
            stage_run_id=scope.stage_run_id,
            script_artifact_id=thumbnail_set.script_set_artifact_id,
            thumbnail_set=thumbnail_set,
        )
        if result.thumbnail_artifact.validation_status != "accepted":
            issues = result.thumbnail_artifact.validation_report.get("issues", [])
            raise ArtifactValidationError(f"ThumbnailSet validation failed: {issues}")
        return DomainToolResponse(
            content="ThumbnailSet and deterministic SVG previews durably accepted.",
            data={
                "artifact_id": result.thumbnail_artifact.artifact_id,
                "content_hash": result.thumbnail_artifact.content_hash,
                "report_id": result.report_artifact.artifact_id,
                "compiled_artifact_ids": [
                    artifact.artifact_id for artifact in result.compiled_artifacts
                ],
                "preview_artifact_ids": [
                    artifact.artifact_id for artifact in result.preview_artifacts
                ],
                "image_cost_usd": 0,
            },
            candidate=thumbnail_set.model_dump(mode="json"),
        )

    async def _authorized_script_set(
        self,
        scope: DomainToolScope,
        context: ContextPack,
        artifact_id: str,
    ) -> PageScriptSet:
        if artifact_id not in {item.artifact_id for item in context.parent_artifacts}:
            raise AuthorizationError("PageScriptSet is not an accepted ContextPack parent")
        artifact = await self._artifacts.get_artifact(artifact_id)
        if (
            artifact is None
            or artifact.project_id != scope.project_id
            or artifact.run_id != scope.run_id
            or artifact.kind != "page_script_set"
            or artifact.validation_status != "accepted"
            or artifact.content is None
        ):
            raise AuthorizationError("PageScriptSet is outside accepted run lineage")
        try:
            return PageScriptSet.model_validate(artifact.content)
        except ValidationError as error:
            raise ArtifactValidationError("Accepted PageScriptSet content is invalid") from error

    @staticmethod
    def _normalize_page_plan(
        raw: dict[str, JsonValue],
        *,
        page_script: PageScript,
        project_id: str,
        script_set_artifact_id: str,
    ) -> dict[str, JsonValue]:
        normalized = deepcopy(raw)
        normalized["schema_version"] = "manga-page-plan.v1"
        normalized["project_id"] = project_id
        normalized["script_set_artifact_id"] = script_set_artifact_id
        normalized["page_script"] = page_script.model_dump(mode="json")
        normalized["reading_direction"] = "rtl"
        normalized["source_fact_ids"] = []

        canvas = normalized.get("canvas")
        if isinstance(canvas, dict):
            for box_name in ("trim", "safe"):
                box = canvas.get(box_name)
                if isinstance(box, dict):
                    box.pop("unit", None)

        layout = normalized.get("layout_root")
        panels = page_script.panels
        if len(panels) == 2 and isinstance(layout, dict) and layout.get("kind") == "split":
            children = layout.get("children")
            if (
                isinstance(children, list)
                and len(children) == 2
                and all(isinstance(child, dict) for child in children)
            ):
                later, earlier = panels[1].panel_id, panels[0].panel_id
                child_nodes = cast(list[dict[str, JsonValue]], children)
                child_nodes[0]["panel_id"] = later
                child_nodes[1]["panel_id"] = earlier
                normalized["reading_edges"] = [
                    {
                        "from_panel_id": earlier,
                        "to_panel_id": later,
                        "reason": "RTL page-turn progression",
                    }
                ]
        elif len(panels) == 2 and isinstance(layout, dict) and layout.get("kind") == "overlay":
            base = layout.get("base")
            insets = layout.get("insets")
            if (
                isinstance(base, dict)
                and isinstance(insets, list)
                and len(insets) == 1
                and isinstance(insets[0], dict)
                and isinstance(insets[0].get("node"), dict)
            ):
                earlier, later = panels[0].panel_id, panels[1].panel_id
                base["panel_id"] = earlier
                inset = insets[0]
                inset_node = cast(dict[str, JsonValue], inset["node"])
                inset_node["panel_id"] = later
                normalized["reading_edges"] = [
                    {
                        "from_panel_id": earlier,
                        "to_panel_id": later,
                        "reason": "RTL page-turn progression",
                    }
                ]
        elif len(panels) == 1 and isinstance(layout, dict) and layout.get("kind") == "panel":
            layout["panel_id"] = panels[0].panel_id
            normalized["reading_edges"] = []
        return normalized

    @staticmethod
    def _report_blocker(
        label: str,
        arguments: dict[str, JsonValue],
    ) -> DomainToolResponse:
        blocker = arguments.get("blocker")
        if not isinstance(blocker, str) or not blocker.strip():
            raise ArtifactValidationError("blocker must be non-empty text")
        if len(blocker) > 4_000:
            raise ArtifactValidationError("blocker exceeds 4,000 characters")
        return DomainToolResponse(
            content=f"{label} blocker recorded for the active bounded goal.",
            data={"blocker": blocker},
        )


class MangaDomainToolService:
    """Dispatch the stable Director tools and additive Phase 1 planning tools."""

    def __init__(
        self,
        runs: RunRepository,
        artifacts: ArtifactRepository,
        *,
        media_root: Path = Path("storage"),
    ) -> None:
        self._director = MangaDirectorToolService(runs, artifacts)
        self._planning = MangaPlanningToolService(
            runs,
            artifacts,
            media_root=media_root,
        )

    async def execute(self, tool_name: str, request: DomainToolRequest) -> DomainToolResponse:
        if (
            tool_name in MangaPlanningToolService.page_writing_tools
            or tool_name in MangaPlanningToolService.thumbnail_tools
        ):
            return await self._planning.execute(tool_name, request)
        return await self._director.execute(tool_name, request)
