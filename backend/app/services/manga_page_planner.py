"""Control-plane drivers for the typed page-writing and thumbnail goals.

Session 4 (issues #5/#6, blueprint Phase 3 first half): the two planning
goals that turn an accepted ``MangaPlan`` into durable page scripts and
compiled thumbnail layouts. This module is NEW code in the same sense as
``manga_director.py`` (ADR-012): the donor's equivalents live inside
ScrollStack's unported ``generation_workflow.py`` @ 43300b5
(``_compile_planning_context``, ``_run_page_writing``, ``_run_thumbnail``,
``_thumbnail_lineage``, ``_planning_budget``, ``_model_receipt``,
``_broker_candidate``, ``_accepted_stage_output``, ``_start_stage``); the
logic below mirrors those methods line-for-line where the driver shape
allows it. Deviations from the donor are documented in the ADR-012
Session 4 addendum:

1. The driver EXTENDS an existing Manga Director run (``run_dir_*``,
   created by ``MangaDirectorService``) instead of owning a whole-workflow
   run — direction, page-writing, and thumbnail stages share one
   ``GenerationRunDoc`` exactly like the donor's single workflow run.
2. The model receipt gate is exact-per-instance (issue #3 policy table:
   ``manga_page_writing``/``manga_thumbnail`` -> MiniMax-M2.7-highspeed),
   not the donor's two-model accepted set. Overriding ``required_model``
   is the documented A/B escape hatch and never happens silently.

Both goals follow the Session 3 driver contract: scope -> purpose-scoped
``ContextPack`` persisted under its own context stage -> typed ``AgentGoal``
(ADR-004 allowlist, bounded budget) -> sealed worker -> candidate must
already exist as a broker-validated artifact -> MiniMax receipt required ->
accepted artifact. The driver fails loud at every step.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal

from pydantic import ValidationError

from app.contracts.artifacts import ArtifactRef, ModelReceipt
from app.contracts.context import (
    AcceptanceTestRef,
    AgentBudget,
    AgentGoal,
    AgentGoalType,
    ContextPack,
    GenerationConstraints,
)
from app.contracts.manga import PageScriptSet, ThumbnailSet
from app.persistence.documents import (
    ArtifactDoc,
    GenerationRunDoc,
    StageRunDoc,
    construct_document,
    utc_now,
)
from app.persistence.protocols import Repositories
from app.services.agent_worker import AgentWorkerGateway
from app.services.context_compiler import ContextCompiler
from app.services.errors import ArtifactValidationError, AuthorizationError, NotFoundError
from app.services.hashing import content_hash

logger = logging.getLogger(__name__)

PlanningPurpose = Literal["manga_page_writing", "manga_thumbnail"]

REQUIRED_PROVIDER = "minimax"
#: Issue #3 provider policy for both planning purposes (inner-loop stages).
POLICY_MODEL = "MiniMax-M2.7-highspeed"
#: Models an accepted upstream Manga Director plan may carry (donor
#: ``ACCEPTED_MANGA_DIRECTION_MODELS`` @ 43300b5) — the direction driver
#: enforces its own policy; the planner only refuses non-MiniMax lineage.
ACCEPTED_DIRECTION_MODELS = {"MiniMax-M3", "MiniMax-M2.7-highspeed"}

PAGE_WRITING_STAGE = "manga_page_writing"
THUMBNAIL_STAGE = "manga_thumbnail"
PAGE_WRITING_PROMPT_VERSION = "manga-page-writing.v2"
THUMBNAIL_PROMPT_VERSION = "manga-thumbnail.v4"

#: Two pages per planning goal (donor vertical-slice shape). The PANEL count
#: is derived from the accepted plan's beat count at runtime — the ported
#: skill demands "map each accepted beat exactly once", the planning service
#: caps panels at the beat count, and Session 4's first live run proved a
#: fixed panel constant contradicts real plans (the model correctly reported
#: a blocker instead of forcing 8 beats into 4 panels).
TARGET_PAGE_COUNT = 2
MAX_TARGET_PANEL_COUNT = 14  # 2 pages x max_panels_per_page (7)

#: Donor `_run_page_writing` / `_run_thumbnail` goal allowlists @ 43300b5
#: (deliberate subsets of the worker's per-goal-type policy sets).
PAGE_WRITING_TOOLS = [
    "get_manga_canon",
    "submit_page_script_set",
    "report_page_script_blocker",
]
THUMBNAIL_TOOLS = [
    "get_page_script_set",
    "validate_layout_draft",
    "submit_thumbnail_set",
    "report_thumbnail_blocker",
]

#: Donor `_compile_planning_context` non-hackathon constraints @ 43300b5.
PLANNING_CONSTRAINTS = GenerationConstraints(
    image_mode="budgeted",
    max_pages=TARGET_PAGE_COUNT,
    max_panels_per_page=7,
    max_sprites=0,
    max_key_panels=0,
    reading_direction="rtl",
    narration_enabled=True,
)

def page_writing_instructions(beat_count: int) -> str:
    """Shape-aware variant of the donor's `_run_page_writing` instructions:
    the panel total tracks the accepted plan's beat count so the skill's
    "map each accepted beat exactly once" rule stays satisfiable."""
    return (
        "Create exactly two source-grounded manga pages with page indices 0 "
        f"and 1. Create exactly {beat_count} panels total across the two "
        "pages, at most 7 panels on a page. Map each accepted MangaPlan beat "
        "exactly once, in source order. Use empty blocking, prop, "
        "focal, avoid-text, source-fact, and text-element lists when no accepted "
        "character, asset, fact, or speaker exists. Use the exact accepted MangaPlan "
        "artifact ID and this fresh ContextPack ID. Fetch the accepted MangaPlan at "
        "most once. Do not create layouts, request assets, or call an image model."
    )


def thumbnail_instructions(panels_per_page: list[int]) -> str:
    """Shape-aware variant of the donor's `_run_thumbnail` instructions: the
    skill's bounded overlay family only applies to the legacy 2+1-panel
    script, so multi-panel pages get split-tree guidance instead."""
    shape = ", ".join(
        f"page {index} has {count} panels" for index, count in enumerate(panels_per_page)
    )
    return (
        "Create exactly "
        f"{len(panels_per_page)} image-free RTL SVG name plans for the accepted "
        f"PageScriptSet ({shape}). Fetch the PageScriptSet exactly once. For "
        "each page use a split-based layout tree that references every panel "
        "of that page exactly once; on RTL horizontal splits the "
        "earlier-reading panel goes on the right. Give each multi-panel page "
        "exactly panel_count minus one reading edges forming one chain in "
        "panel source order. Do not copy PageScript objects. Validate every "
        "page with validate_layout_draft using the accepted script artifact "
        "ID and page index, repair addressable issues, then submit page plans "
        "without page_script using their temporary page_index for broker "
        "hydration. Do not use assets, freeform nodes, or image generation."
    )

DEFAULT_MAX_INPUT_TOKENS = 80_000


class MangaPagePlannerError(RuntimeError):
    """Raised when a planning goal cannot produce its accepted artifact."""


@dataclass
class PlanningOutcome:
    artifact: ArtifactDoc
    run_id: str
    stage_run_id: str
    context_pack_id: str
    reused: bool


class MangaPagePlannerService:
    def __init__(
        self,
        repositories: Repositories,
        agent_worker: AgentWorkerGateway,
        *,
        required_provider: str = REQUIRED_PROVIDER,
        required_model: str = POLICY_MODEL,
        max_input_tokens: int = DEFAULT_MAX_INPUT_TOKENS,
        created_by: str = "manga-page-planner-driver",
    ) -> None:
        self._repositories = repositories
        self._agent_worker = agent_worker
        self._required_provider = required_provider
        self._required_model = required_model
        self._max_input_tokens = max_input_tokens
        self._created_by = created_by
        self._compiler = ContextCompiler()

    # ------------------------------------------------------------------
    # goals
    # ------------------------------------------------------------------

    async def run_page_writing_goal(
        self,
        *,
        project_id: str,
        run_id: str,
        instructions: str | None = None,
    ) -> PlanningOutcome:
        run = await self._authorized_run(project_id, run_id)
        plan_artifact = await self._accepted_manga_plan(run)
        beat_count = len((plan_artifact.content or {}).get("beats", []))
        if not 2 <= beat_count <= MAX_TARGET_PANEL_COUNT:
            raise ArtifactValidationError(
                f"Accepted MangaPlan carries {beat_count} beats; the two-page "
                f"planning goal supports 2..{MAX_TARGET_PANEL_COUNT}"
            )

        context_artifact, context = await self._compile_planning_context(
            run,
            purpose=PAGE_WRITING_STAGE,
            parent_artifacts=[plan_artifact],
        )

        inputs = [plan_artifact.artifact_id, context_artifact.artifact_id]
        stage = await self._start_stage(
            run,
            PAGE_WRITING_STAGE,
            input_artifact_ids=inputs,
            input_hash=content_hash(
                {
                    "manga_plan_hash": plan_artifact.content_hash,
                    "context_hash": context_artifact.content_hash,
                }
            ),
            schema_version="page-script-set.v1",
            prompt_version=PAGE_WRITING_PROMPT_VERSION,
        )
        if stage.status == "succeeded" and stage.output_artifact_ids:
            artifact = await self._accepted_stage_output(stage, kind="page_script_set")
            await self._rest_run(run)
            return PlanningOutcome(
                artifact=artifact,
                run_id=run.run_id,
                stage_run_id=stage.stage_run_id,
                context_pack_id=context.context_pack_id,
                reused=True,
            )

        goal = AgentGoal(
            goal_id=f"goal_{stage.idempotency_key[:20]}_{stage.attempt}",
            run_id=run.run_id,
            stage_run_id=stage.stage_run_id,
            goal_type=AgentGoalType.MANGA_PAGE_WRITING,
            output_schema="page-script-set.v1",
            schema_version="page-script-set.v1",
            input_artifact_refs=[
                self._artifact_ref(context_artifact),
                self._artifact_ref(plan_artifact),
            ],
            constraints={
                "target_page_count": TARGET_PAGE_COUNT,
                "target_panel_count": beat_count,
                "max_panels_per_page": 7,
                "reading_direction": "rtl",
                "image_attempts_allowed": 0,
            },
            acceptance_tests=[
                AcceptanceTestRef(
                    test_id="page_script_schema",
                    description="Candidate validates as PageScriptSet v1.",
                ),
                AcceptanceTestRef(
                    test_id="page_script_source_lineage",
                    description="Every panel cites source evidence accepted by the MangaPlan.",
                ),
            ],
            allowed_tools=list(PAGE_WRITING_TOOLS),
            budget=self._planning_budget(run),
        )
        result = await self._agent_worker.run(
            goal, context, instructions=instructions or page_writing_instructions(beat_count)
        )

        try:
            script_set = PageScriptSet.model_validate(result.candidate)
        except ValidationError as error:
            raise ArtifactValidationError(
                f"Agent worker candidate failed PageScriptSet validation: {error}"
            ) from error
        if (
            script_set.project_id != run.project_id
            or script_set.plan_artifact_id != plan_artifact.artifact_id
            or script_set.context_pack_id != context.context_pack_id
            or len(script_set.pages) != TARGET_PAGE_COUNT
            or sum(len(page.panels) for page in script_set.pages) != beat_count
        ):
            raise ArtifactValidationError(
                "PageScriptSet candidate violates the v2 run identity"
            )
        payload = script_set.model_dump(mode="json")
        digest = content_hash(payload)
        broker_candidate = await self._broker_candidate(
            artifact_id=f"page_script_set_{digest[:24]}",
            run=run,
            stage=stage,
            kind="page_script_set",
            content_hash_value=digest,
        )
        receipt = self._model_receipt(
            result.trace,
            purpose="manga_page_writing",
            prompt_version=PAGE_WRITING_PROMPT_VERSION,
            input_artifact_ids=inputs,
            attempt=stage.attempt,
        )
        accepted = construct_document(
            ArtifactDoc,
            artifact_id=f"accepted_page_script_set_{stage.idempotency_key[:24]}",
            project_id=run.project_id,
            run_id=run.run_id,
            stage_run_id=stage.stage_run_id,
            kind="page_script_set",
            schema_version="page-script-set.v1",
            content=payload,
            storage_ref=None,
            content_hash=digest,
            parent_artifact_ids=[*inputs, broker_candidate.artifact_id],
            author="agent",
            supersedes_artifact_id=None,
            source_refs=broker_candidate.source_refs,
            model_receipt=receipt.model_dump(mode="json"),
            validation_status="accepted",
            validation_report=broker_candidate.validation_report,
            created_at=utc_now(),
        )
        stored = await self._repositories.save_artifact(accepted)
        stage.agent_session_id = str(result.trace.get("session_id") or "") or None
        await self._succeed_stage(run, stage, [stored.artifact_id])
        await self._rest_run(run)
        logger.info(
            "accepted PageScriptSet %s (run=%s tokens=%s cost=%s latency_ms=%s)",
            stored.artifact_id,
            run.run_id,
            result.trace.get("tokens"),
            result.trace.get("cost_usd"),
            result.trace.get("latency_ms"),
        )
        return PlanningOutcome(
            artifact=stored,
            run_id=run.run_id,
            stage_run_id=stage.stage_run_id,
            context_pack_id=context.context_pack_id,
            reused=False,
        )

    async def run_thumbnail_goal(
        self,
        *,
        project_id: str,
        run_id: str,
        instructions: str | None = None,
    ) -> PlanningOutcome:
        run = await self._authorized_run(project_id, run_id)
        plan_artifact = await self._accepted_manga_plan(run)
        script_artifact = await self._accepted_planning_output(
            run, stage_name=PAGE_WRITING_STAGE, kind="page_script_set"
        )
        panels_per_page = [
            len(page["panels"]) for page in (script_artifact.content or {})["pages"]
        ]

        context_artifact, context = await self._compile_planning_context(
            run,
            purpose=THUMBNAIL_STAGE,
            parent_artifacts=[plan_artifact, script_artifact],
        )

        inputs = [script_artifact.artifact_id, context_artifact.artifact_id]
        stage = await self._start_stage(
            run,
            THUMBNAIL_STAGE,
            input_artifact_ids=inputs,
            input_hash=content_hash(
                {
                    "script_hash": script_artifact.content_hash,
                    "context_hash": context_artifact.content_hash,
                }
            ),
            schema_version="thumbnail-set.v1",
            prompt_version=THUMBNAIL_PROMPT_VERSION,
        )
        if stage.status == "succeeded" and stage.output_artifact_ids:
            artifact = await self._accepted_stage_output(stage, kind="thumbnail_set")
            await self._rest_run(run)
            return PlanningOutcome(
                artifact=artifact,
                run_id=run.run_id,
                stage_run_id=stage.stage_run_id,
                context_pack_id=context.context_pack_id,
                reused=True,
            )

        goal = AgentGoal(
            goal_id=f"goal_{stage.idempotency_key[:20]}_{stage.attempt}",
            run_id=run.run_id,
            stage_run_id=stage.stage_run_id,
            goal_type=AgentGoalType.MANGA_THUMBNAIL,
            output_schema="thumbnail-set.v1",
            schema_version="thumbnail-set.v1",
            input_artifact_refs=[
                self._artifact_ref(context_artifact),
                self._artifact_ref(script_artifact),
            ],
            constraints={
                "page_count": TARGET_PAGE_COUNT,
                "reading_direction": "rtl",
                "image_attempts_allowed": 0,
            },
            acceptance_tests=[
                AcceptanceTestRef(
                    test_id="thumbnail_schema",
                    description="Candidate validates as ThumbnailSet v1.",
                ),
                AcceptanceTestRef(
                    test_id="thumbnail_preflight",
                    description=(
                        "Every page compiles and has no deterministic validation errors."
                    ),
                ),
            ],
            allowed_tools=list(THUMBNAIL_TOOLS),
            budget=self._planning_budget(run),
        )
        result = await self._agent_worker.run(
            goal,
            context,
            instructions=instructions or thumbnail_instructions(panels_per_page),
        )

        try:
            thumbnail_set = ThumbnailSet.model_validate(result.candidate)
        except ValidationError as error:
            raise ArtifactValidationError(
                f"Agent worker candidate failed ThumbnailSet validation: {error}"
            ) from error
        if (
            thumbnail_set.project_id != run.project_id
            or thumbnail_set.script_set_artifact_id != script_artifact.artifact_id
            or len(thumbnail_set.page_plans) != TARGET_PAGE_COUNT
        ):
            raise ArtifactValidationError(
                "ThumbnailSet candidate violates the v2 run identity"
            )
        payload = thumbnail_set.model_dump(mode="json")
        digest = content_hash(payload)
        broker_candidate = await self._broker_candidate(
            artifact_id=f"thumbnail_set_{digest[:24]}",
            run=run,
            stage=stage,
            kind="thumbnail_set",
            content_hash_value=digest,
        )
        lineage = await self._thumbnail_lineage(
            stage, broker_candidate, page_count=TARGET_PAGE_COUNT
        )
        receipt = self._model_receipt(
            result.trace,
            purpose="manga_thumbnail",
            prompt_version=THUMBNAIL_PROMPT_VERSION,
            input_artifact_ids=inputs,
            attempt=stage.attempt,
        )
        accepted = construct_document(
            ArtifactDoc,
            artifact_id=f"accepted_thumbnail_set_{stage.idempotency_key[:24]}",
            project_id=run.project_id,
            run_id=run.run_id,
            stage_run_id=stage.stage_run_id,
            kind="thumbnail_set",
            schema_version="thumbnail-set.v1",
            content=payload,
            storage_ref=None,
            content_hash=digest,
            parent_artifact_ids=[*inputs, broker_candidate.artifact_id, *lineage],
            author="agent",
            supersedes_artifact_id=None,
            source_refs=broker_candidate.source_refs,
            model_receipt=receipt.model_dump(mode="json"),
            validation_status="accepted",
            validation_report=broker_candidate.validation_report,
            created_at=utc_now(),
        )
        stored = await self._repositories.save_artifact(accepted)
        stage.agent_session_id = str(result.trace.get("session_id") or "") or None
        await self._succeed_stage(run, stage, [stored.artifact_id, *lineage])
        await self._rest_run(run)
        logger.info(
            "accepted ThumbnailSet %s (run=%s tokens=%s cost=%s latency_ms=%s)",
            stored.artifact_id,
            run.run_id,
            result.trace.get("tokens"),
            result.trace.get("cost_usd"),
            result.trace.get("latency_ms"),
        )
        return PlanningOutcome(
            artifact=stored,
            run_id=run.run_id,
            stage_run_id=stage.stage_run_id,
            context_pack_id=context.context_pack_id,
            reused=False,
        )

    # ------------------------------------------------------------------
    # durable scaffolding (donor mirrors)
    # ------------------------------------------------------------------

    async def _authorized_run(self, project_id: str, run_id: str) -> GenerationRunDoc:
        run = await self._repositories.get_run(run_id)
        if run is None:
            raise NotFoundError(f"Generation run {run_id} does not exist")
        if run.project_id != project_id:
            raise AuthorizationError("Run does not belong to the requested project")
        if run.status not in {"running", "succeeded"}:
            raise MangaPagePlannerError(
                f"Run {run_id} is in state {run.status}; refusing to extend it"
            )
        return run

    async def _accepted_manga_plan(self, run: GenerationRunDoc) -> ArtifactDoc:
        stages = await self._repositories.list_stages(run.run_id)
        stage = next(
            (
                item
                for item in stages
                if item.stage_name == "manga_direction" and item.status == "succeeded"
            ),
            None,
        )
        if stage is None or not stage.output_artifact_ids:
            raise MangaPagePlannerError(
                f"Run {run.run_id} has no succeeded manga_direction stage to plan from"
            )
        artifact = await self._repositories.get_artifact(stage.output_artifact_ids[0])
        receipt = artifact.model_receipt if artifact is not None else None
        if (
            artifact is None
            or artifact.run_id != run.run_id
            or artifact.kind != "manga_plan"
            or artifact.validation_status != "accepted"
            or receipt is None
            or receipt.get("provider") != self._required_provider
            or receipt.get("model") not in ACCEPTED_DIRECTION_MODELS
        ):
            raise ArtifactValidationError(
                "Succeeded manga_direction stage lacks an accepted MiniMax MangaPlan"
            )
        return artifact

    async def _accepted_planning_output(
        self, run: GenerationRunDoc, *, stage_name: str, kind: str
    ) -> ArtifactDoc:
        stages = await self._repositories.list_stages(run.run_id)
        stage = next(
            (
                item
                for item in stages
                if item.stage_name == stage_name and item.status == "succeeded"
            ),
            None,
        )
        if stage is None or not stage.output_artifact_ids:
            raise MangaPagePlannerError(
                f"Run {run.run_id} has no succeeded {stage_name} stage"
            )
        return await self._accepted_stage_output(stage, kind=kind)

    async def _accepted_stage_output(
        self, stage: StageRunDoc, *, kind: str
    ) -> ArtifactDoc:
        artifact = await self._repositories.get_artifact(stage.output_artifact_ids[0])
        receipt = artifact.model_receipt if artifact is not None else None
        if (
            artifact is None
            or artifact.stage_run_id != stage.stage_run_id
            or artifact.kind != kind
            or artifact.validation_status != "accepted"
            or receipt is None
            or receipt.get("provider") != self._required_provider
            or receipt.get("model") != self._required_model
        ):
            raise ArtifactValidationError(
                f"Succeeded {stage.stage_name} stage lacks an accepted "
                f"{self._required_provider}/{self._required_model} output"
            )
        return artifact

    async def _compile_planning_context(
        self,
        run: GenerationRunDoc,
        *,
        purpose: PlanningPurpose,
        parent_artifacts: list[ArtifactDoc],
    ) -> tuple[ArtifactDoc, ContextPack]:
        scope = await self._repositories.get_scope(run.scope_id)
        if scope is None or scope.project_id != run.project_id:
            raise NotFoundError(
                f"Scope {run.scope_id} is unavailable for run {run.run_id}"
            )
        project = await self._repositories.get_project(run.project_id)
        if project is None:
            raise NotFoundError(f"Manga project {run.project_id} does not exist")
        memory = await self._repositories.get_memory_snapshot(
            run.project_id, run.memory_version
        )
        if memory is None:
            raise NotFoundError(
                f"Memory snapshot {run.project_id}@{run.memory_version} does not exist"
            )
        for artifact in parent_artifacts:
            if (
                artifact.project_id != run.project_id
                or artifact.run_id != run.run_id
                or artifact.validation_status != "accepted"
            ):
                raise ArtifactValidationError(
                    f"Planning context parent {artifact.artifact_id} is outside "
                    "accepted run lineage"
                )
        units = await self._repositories.list_source_units(scope.book_id)
        parent_refs = [self._artifact_ref(artifact) for artifact in parent_artifacts]
        compile_input_hash = content_hash(
            {
                "purpose": purpose,
                "scope_hash": scope.scope_hash,
                "memory_hash": memory.content_hash,
                "source_hashes": {
                    item.source_unit_id: item.text_hash
                    for item in units
                    if item.source_unit_id in scope.source_unit_ids
                },
                "constraints": PLANNING_CONSTRAINTS.model_dump(mode="json"),
                "parent_artifacts": [ref.model_dump(mode="json") for ref in parent_refs],
            }
        )
        stage_name = f"{purpose}_context"
        stage = await self._start_stage(
            run,
            stage_name,
            input_artifact_ids=[artifact.artifact_id for artifact in parent_artifacts],
            input_hash=compile_input_hash,
            schema_version="context-pack.v1",
            prompt_version=self._compiler.compiler_version,
        )
        if stage.status == "succeeded" and stage.output_artifact_ids:
            existing = await self._repositories.get_artifact(stage.output_artifact_ids[0])
            if (
                existing is not None
                and existing.content is not None
                and existing.validation_status == "accepted"
            ):
                context = ContextPack.model_validate(existing.content)
                if context.purpose == purpose and context.parent_artifacts == parent_refs:
                    return existing, context
            raise ArtifactValidationError(
                f"Succeeded {stage_name} stage lacks its accepted bounded ContextPack"
            )

        context = self._compiler.compile(
            project_id=run.project_id,
            scope=scope,
            memory=memory,
            source_units=units,
            purpose=purpose,
            constraints=PLANNING_CONSTRAINTS,
            max_input_tokens=self._max_input_tokens,
            parent_artifacts=parent_refs,
        )
        payload = context.model_dump(mode="json")
        artifact = construct_document(
            ArtifactDoc,
            artifact_id=context.context_pack_id,
            project_id=run.project_id,
            run_id=run.run_id,
            stage_run_id=stage.stage_run_id,
            kind="context_pack",
            schema_version="context-pack.v1",
            content=payload,
            storage_ref=None,
            content_hash=context.content_hash,
            parent_artifact_ids=[item.artifact_id for item in parent_artifacts],
            author="system",
            supersedes_artifact_id=None,
            source_refs=[
                excerpt.source_ref.model_dump(mode="json")
                for excerpt in context.source_units
            ],
            model_receipt=None,
            validation_status="accepted",
            validation_report={
                "passed": True,
                "issues": [],
                "validator_version": self._compiler.compiler_version,
            },
            created_at=utc_now(),
        )
        stored = await self._repositories.save_artifact(artifact)
        await self._succeed_stage(run, stage, [stored.artifact_id])
        return stored, context

    async def _start_stage(
        self,
        run: GenerationRunDoc,
        stage_name: str,
        *,
        input_artifact_ids: list[str],
        input_hash: str,
        schema_version: str,
        prompt_version: str,
    ) -> StageRunDoc:
        identity = content_hash(
            {
                "project_id": run.project_id,
                "scope_id": run.scope_id,
                "memory_version": run.memory_version,
                "pipeline_version": run.pipeline_version,
                "stage_name": stage_name,
                "input_hash": input_hash,
                "schema_version": schema_version,
                "prompt_version": prompt_version,
            }
        )
        stage_run_id = f"stage_{stage_name}_{identity[:20]}"
        existing = await self._repositories.get_stage(stage_run_id)
        if existing is not None:
            if existing.status in {"running", "validating", "repairing"}:
                run.status = "running"
                run.active_stage = stage_name
                run.updated_at = utc_now()
                await self._repositories.save_run(run)
            return existing
        now = utc_now()
        stage = construct_document(
            StageRunDoc,
            stage_run_id=stage_run_id,
            run_id=run.run_id,
            stage_name=stage_name,
            attempt=1,
            status="running",
            input_artifact_ids=input_artifact_ids,
            input_hash=input_hash,
            output_artifact_ids=[],
            idempotency_key=identity,
            agent_session_id=None,
            error_code=None,
            error_detail=None,
            started_at=now,
            ended_at=None,
        )
        run.status = "running"
        run.active_stage = stage_name
        run.updated_at = now
        await self._repositories.save_run(run)
        return await self._repositories.save_stage(stage)

    async def _succeed_stage(
        self, run: GenerationRunDoc, stage: StageRunDoc, output_ids: list[str]
    ) -> None:
        now = utc_now()
        stage.status = "succeeded"
        stage.output_artifact_ids = output_ids
        stage.error_code = None
        stage.error_detail = None
        stage.ended_at = now
        await self._repositories.save_stage(stage)
        run.updated_at = now
        await self._repositories.save_run(run)

    async def _rest_run(self, run: GenerationRunDoc) -> None:
        run.status = "succeeded"
        run.active_stage = None
        run.updated_at = utc_now()
        await self._repositories.save_run(run)

    async def _broker_candidate(
        self,
        *,
        artifact_id: str,
        run: GenerationRunDoc,
        stage: StageRunDoc,
        kind: str,
        content_hash_value: str,
    ) -> ArtifactDoc:
        candidate = await self._repositories.get_artifact(artifact_id)
        if (
            candidate is None
            or candidate.project_id != run.project_id
            or candidate.run_id != run.run_id
            or candidate.stage_run_id != stage.stage_run_id
            or candidate.kind != kind
            or candidate.validation_status != "accepted"
            or candidate.content_hash != content_hash_value
        ):
            raise ArtifactValidationError(
                f"{kind} submission was not durably accepted by the domain-tool broker"
            )
        return candidate

    async def _thumbnail_lineage(
        self,
        stage: StageRunDoc,
        broker_candidate: ArtifactDoc,
        *,
        page_count: int,
    ) -> list[str]:
        artifacts = [
            artifact
            for artifact in await self._repositories.list_artifacts(
                broker_candidate.run_id,
                accepted_only=False,
            )
            if artifact.stage_run_id == stage.stage_run_id
        ]
        reports = [
            artifact
            for artifact in artifacts
            if artifact.kind == "validation_report"
            and artifact.artifact_id in broker_candidate.parent_artifact_ids
        ]
        layouts = [
            artifact
            for artifact in artifacts
            if artifact.kind == "page_layout"
            and broker_candidate.artifact_id in artifact.parent_artifact_ids
            and artifact.validation_status == "accepted"
        ]
        compiled = [
            artifact
            for artifact in artifacts
            if artifact.kind == "compiled_layout"
            and broker_candidate.artifact_id in artifact.parent_artifact_ids
            and artifact.validation_status == "accepted"
        ]
        compiled_ids = {artifact.artifact_id for artifact in compiled}
        previews = [
            artifact
            for artifact in artifacts
            if artifact.kind == "thumbnail_preview"
            and compiled_ids.intersection(artifact.parent_artifact_ids)
            and artifact.validation_status == "accepted"
        ]
        if (
            len(reports) != 1
            or len(layouts) != page_count
            or len(compiled) != page_count
            or len(previews) != page_count
        ):
            raise ArtifactValidationError(
                "Accepted ThumbnailSet lacks its complete validation, layout, and "
                "preview lineage"
            )
        report = reports[0]
        if report.content is None or report.content.get("passed") is not True:
            raise ArtifactValidationError(
                "Accepted ThumbnailSet validation report did not pass"
            )
        ordered = [
            report,
            *sorted(layouts, key=lambda item: item.artifact_id),
            *sorted(compiled, key=lambda item: item.artifact_id),
            *sorted(previews, key=lambda item: item.artifact_id),
        ]
        return [artifact.artifact_id for artifact in ordered]

    def _model_receipt(
        self,
        trace: dict,
        *,
        purpose: str,
        prompt_version: str,
        input_artifact_ids: list[str],
        attempt: int,
    ) -> ModelReceipt:
        provider = trace.get("provider")
        model = trace.get("model")
        skill_hash = trace.get("skill_hash")
        tokens = trace.get("tokens")
        if (
            provider != self._required_provider
            or model != self._required_model
            or not isinstance(skill_hash, str)
            or not skill_hash
            or not isinstance(tokens, dict)
        ):
            raise ArtifactValidationError(
                f"{purpose} must record provider={self._required_provider}, "
                f"model={self._required_model}, and skill provenance"
            )
        input_tokens = _optional_int(tokens.get("input"))
        output_tokens = _optional_int(tokens.get("output"))
        cost_usd = _optional_float(trace.get("cost_usd"))
        latency_ms = _optional_int(trace.get("latency_ms"))
        if None in {input_tokens, output_tokens, cost_usd, latency_ms}:
            raise ArtifactValidationError(
                f"{purpose} trace omitted exact tokens, cost_usd, or latency_ms"
            )
        return ModelReceipt(
            provider=provider,
            model=model,
            purpose=purpose,
            prompt_version=prompt_version,
            skill_hashes=[skill_hash],
            input_artifact_ids=input_artifact_ids,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost_usd,
            latency_ms=latency_ms,
            attempt=attempt,
            created_at=utc_now(),
        )

    @staticmethod
    def _artifact_ref(artifact: ArtifactDoc) -> ArtifactRef:
        return ArtifactRef(
            artifact_id=artifact.artifact_id,
            kind=artifact.kind,
            schema_version=artifact.schema_version,
            content_hash=artifact.content_hash,
        )

    @staticmethod
    def _planning_budget(run: GenerationRunDoc) -> AgentBudget:
        return AgentBudget(
            max_steps=min(8, int(run.budget["max_agent_steps"])),
            max_tool_calls=min(10, max(4, int(run.budget["max_agent_steps"]))),
            max_input_tokens=DEFAULT_MAX_INPUT_TOKENS,
            max_output_tokens=8_000,
            max_repair_attempts=int(run.budget["max_repair_attempts"]),
            max_cost_usd=float(run.budget["max_text_cost_usd"]),
        )


def _optional_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 0 else None
    if isinstance(value, float) and value >= 0:
        return int(value)
    return None


def _optional_float(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and value >= 0:
        return float(value)
    return None
