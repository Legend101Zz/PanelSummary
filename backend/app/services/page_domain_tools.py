"""Goal-specific page-writing and thumbnail tools behind the sealed broker."""

from __future__ import annotations

import json
import logging
from copy import deepcopy
from datetime import UTC, datetime
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
from .manga_content_validation import (
    AGENT_CONTENT_RULE_POLICY,
    blocking_content_errors,
    content_gate_detail,
    validate_script_content_enforced,
)
from .manga_craft_validation import validate_page_craft_enforced
from .manga_layout import LayoutCompilationError, compile_page_layout, render_thumbnail_svg
from .manga_page_planning import MangaPagePlanningService
from .manga_validation import validate_page_plan

logger = logging.getLogger(__name__)


#: Contract fields that are ALWAYS lists — used to normalize the M3
#: tool-frame's empty-element representation ("" / {} / null) back to [].
#: Name-keyed on purpose: the normalizer stays schema-light and lossless.
_LIST_FIELD_NAMES = frozenset(
    {
        "pages",
        "panels",
        "text_elements",
        "blocking",
        "prop_refs",
        "focal_regions",
        "avoid_text_regions",
        "effects",
        "source_refs",
        "source_fact_ids",
        "page_plans",
        "reading_edges",
        "children",
        # MangaPlan submission fields (S7 golden run: the direction seam
        # hit the SAME empty-list-as-"" artifact — 17 list_type errors,
        # every one input_value='').
        "beats",
        "required_fact_ids",
        "character_intent",
        "visual_intent",
        "must_preserve",
        "may_compress",
        "character_state_updates",
        "terminology_updates",
        "new_facts",
        "unresolved_thread_updates",
    }
)

#: Contract fields typed ``X | None`` whose ABSENT value the transport
#: cannot express: the XML-style tool frame renders an intended-omitted
#: scalar as ``{}`` (S7 attempt 11, submits 1-2: ``speaker_ref`` on
#: narration failed ``string_type`` as an empty dict) and models on the
#: bare-JSON text lane write ``""`` for "no value" (submit 3:
#: ``string_too_short``). ``None`` is contractually VALID for every name
#: here, so mapping empty representations to ``None`` is lossless
#: normalization — it can never overwrite an authored value, and a
#: dialogue element whose ``speaker_ref`` normalizes away still fails the
#: DIALOGUE_REQUIRES_SPEAKER contract rule with its clear message.
_OPTIONAL_NULLABLE_FIELD_NAMES = frozenset(
    {
        "speaker_ref",
        "emotion",
        "environment_ref",
        "tail_target",
        "page_turn_panel_id",
        # SourceRef optionals (S7 attempt 13, submit 2): the frame rendered
        # the model's CORRECT nulls as "" — quote failed string_too_short
        # and the offsets failed int_parsing on an otherwise complete,
        # lineage-clean submission. These names exist only on SourceRef.
        "quote",
        "start_offset",
        "end_offset",
    }
)


def _unwrap_item_wrappers(value: object) -> object:
    """Undo the pinned Pi runtime's M3 tool-frame list mangling.

    Live-measured (Session 6 page-writing attempt 7, run record in
    docs/evidence/session6-fresh-planning/): the anthropic-lane tool-call
    frame serializes every JSON array as ``{"item": [...]}``, so a
    structurally perfect submission arrives with ``pages`` (and every
    nested list) wrapped and fails ``list_type`` validation. This is a
    TRANSPORT artifact, not authored content — unwrapping is mechanical
    and lossless (no contract field is named ``item``). The same quirk is
    why the donor's M3 direction submissions only ever landed through the
    assistant-text fallback (ADR-012 live-run observation).
    """
    if isinstance(value, dict):
        if set(value.keys()) == {"item"}:
            # XML-style repeated-element semantics (live attempt 8): a
            # single-element array arrives as {"item": {object}} — bare,
            # not wrapped in a list — so an item-wrapper ALWAYS denotes an
            # array and its payload is normalized to a list.
            inner = _unwrap_item_wrappers(value["item"])
            return inner if isinstance(inner, list) else [inner]
        normalized: dict[str, object] = {}
        for key, item in value.items():
            unwrapped = _unwrap_item_wrappers(item)
            if key in _LIST_FIELD_NAMES and not isinstance(unwrapped, list):
                # Empty XML elements arrive as "" / {} / null — and the
                # golden-run direction frame stringified null as "null"
                # (every scalar arrived string-typed).
                unwrapped = (
                    [] if unwrapped in ("", None, {}, "null") else [unwrapped]
                )
            elif key in _OPTIONAL_NULLABLE_FIELD_NAMES and unwrapped in (
                "",
                {},
                "null",
            ):
                # Empty representations of an intended-omitted optional
                # scalar (S7 attempts 11/13 + the golden-run direction
                # frame's literal "null" strings) normalize to the
                # contractually valid None.
                unwrapped = None
            normalized[key] = unwrapped
        return normalized
    if isinstance(value, list):
        return [_unwrap_item_wrappers(item) for item in value]
    return value


def _dump_raw_submission(
    tool_name: str,
    scope: DomainToolScope,
    arguments: dict[str, JsonValue],
    dump_dir: Path | None,
) -> None:
    """Persist the PRE-normalization submit arguments verbatim (Session 7).

    The Session 6 ledger closed with a FOURTH M3 tool-frame mangling shape
    (attempt 10: every top-level contract field dropped) that nothing
    durable can reconstruct — ``failure_history`` carries bounded traces
    only and Pi sessions are in-memory. This dump is the diagnosis
    instrument: it fires on EVERY submit-seam invocation (success needs no
    dump but proves a fix worked; placement in an except branch risks
    missing a path), writes the arguments exactly as they arrived (before
    ``_unwrap_item_wrappers``), and MUST NEVER break the submission itself.

    ``dump_dir`` is the explicit test seam; live callers leave it ``None``
    and the settings flag ``agent_seam_raw_dump_dir`` decides (config, not
    code — empty string means off and this function does zero I/O).
    """
    if dump_dir is None:
        from app.config import get_settings

        configured = get_settings().agent_seam_raw_dump_dir
        if not configured:
            return
        dump_dir = Path(configured)
    try:
        dump_dir.mkdir(parents=True, exist_ok=True)
        received_at = datetime.now(UTC)
        stamp = received_at.strftime("%Y%m%dT%H%M%S_%fZ")
        out = dump_dir / f"{tool_name}_{scope.stage_run_id}_{stamp}.json"
        out.write_text(
            json.dumps(
                {
                    "tool": tool_name,
                    "scope": scope.model_dump(mode="json"),
                    "received_at": received_at.isoformat(),
                    "arguments": arguments,
                },
                indent=2,
                default=str,
            ),
            encoding="utf-8",
        )
        shapes = {
            key: (
                f"dict(keys={sorted(str(k) for k in value)[:24]})"
                if isinstance(value, dict)
                else type(value).__name__
            )
            for key, value in arguments.items()
        }
        logger.warning(
            "raw submission dump -> %s (argument shapes=%s)", out, shapes
        )
    except Exception:  # noqa: BLE001 — diagnosis must never break the seam
        logger.exception("raw submission dump FAILED for %s", tool_name)


def _coerce_int(value: object) -> int | None:
    """Accept the tool frame's stringified integers (golden-run live shape:
    a whole submission arrived string-typed — page_index "0"). Pydantic's
    lax mode coerces at model level, but the pre-validation hydration
    checks run on raw dicts and must tolerate the same artifact."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().lstrip("-").isdigit():
        return int(value.strip())
    return None


def _pydantic_error_digest(error: ValidationError, *, budget: int = 900) -> str:
    """Class-summarized validation digest for the sealed model.

    The broker bounds the model-visible 422 text to 1,000 characters, so a
    raw multi-error pydantic dump truncates into noise (live-measured:
    Session 6 page-writing attempts saw 3 of 12 errors). Group by error
    class, list every offending path, and instruct the class-wide fix —
    the same shape as ``manga_content_validation.content_gate_detail``.
    """
    groups: dict[str, list[str]] = {}
    for item in error.errors(include_input=False):
        key = f"{item['type']}: {item['msg']}"
        path = ".".join(str(part) for part in item["loc"])
        groups.setdefault(key, []).append(path)
    parts = []
    for key, paths in groups.items():
        shown = ", ".join(paths[:8])
        if len(paths) > 8:
            shown += f" (+{len(paths) - 8} more)"
        parts.append(f"{key} at [{shown}] — fix EVERY field of this class")
    return "; ".join(parts)[:budget]


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
        raw_dump_dir: Path | None = None,
    ) -> None:
        self._runs = runs
        self._artifacts = artifacts
        self._raw_dump_dir = raw_dump_dir
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
        _dump_raw_submission(
            "submit_page_script_set", scope, arguments, self._raw_dump_dir
        )
        raw = _unwrap_item_wrappers(arguments.get("script_set"))
        if not isinstance(raw, dict):
            raise ArtifactValidationError("script_set must be an object")
        try:
            script_set = PageScriptSet.model_validate(raw)
        except ValidationError as error:
            raise ArtifactValidationError(
                "PageScriptSet validation failed — "
                f"{_pydantic_error_digest(error)}"
            ) from error
        # Session 6 step 0.1 (boundary edit, ADR-012 S6 addendum): the agent
        # submission seam applies the stricter content policy — a sealed
        # model must letter EVERY page (narration needs no speaker, so an
        # empty character context never justifies a wordless page). The
        # service tier below re-checks with the base policy on every path.
        agent_content_errors = blocking_content_errors(
            validate_script_content_enforced(
                script_set, policy=AGENT_CONTENT_RULE_POLICY
            )
        )
        if agent_content_errors:
            raise ArtifactValidationError(
                "PageScriptSet failed the content-quality gate — "
                f"{content_gate_detail(agent_content_errors)}"
            )
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
            page_index = _coerce_int(arguments.get("page_index"))
            if not isinstance(script_set_artifact_id, str) or page_index is None:
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
        # Session 5 (step 0.2): craft rules ride the same issue list with the
        # warn-vs-block policy applied, so the model sees RTL flow defects as
        # blocking errors and the remaining craft rules as repairable warnings.
        issues = [
            *validate_page_plan(plan, compiled),
            *validate_page_craft_enforced(plan, compiled),
        ]
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
        _dump_raw_submission(
            "submit_thumbnail_set", scope, arguments, self._raw_dump_dir
        )
        raw = _unwrap_item_wrappers(arguments.get("thumbnail_set"))
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
                page_index = _coerce_int(plan.pop("page_index", None))
                if "page_script" not in plan:
                    if page_index is None or page_index >= len(script_set.pages):
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
            raise ArtifactValidationError(
                "ThumbnailSet validation failed — "
                f"{_pydantic_error_digest(error)}"
            ) from error
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
        raw_dump_dir: Path | None = None,
    ) -> None:
        self._director = MangaDirectorToolService(runs, artifacts)
        self._planning = MangaPlanningToolService(
            runs,
            artifacts,
            media_root=media_root,
            raw_dump_dir=raw_dump_dir,
        )

    async def execute(self, tool_name: str, request: DomainToolRequest) -> DomainToolResponse:
        if (
            tool_name in MangaPlanningToolService.page_writing_tools
            or tool_name in MangaPlanningToolService.thumbnail_tools
        ):
            return await self._planning.execute(tool_name, request)
        return await self._director.execute(tool_name, request)
