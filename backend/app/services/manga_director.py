"""Control-plane driver for the first typed Manga Director goal (ADR-012).

Blueprint Phase 2, step 6: one typed ``MANGA_DIRECTION`` goal executed
through the sealed Node agent worker. This module is NEW code (the donor's
equivalent lives inside ScrollStack's unported 1792-line
``generation_workflow.py``); the goal construction, candidate acceptance,
and receipt requirements mirror the donor's ``_execute_manga_direction``
stage line-for-line where the contracts allow it.

Flow (all durable writes go through the ported repositories):

1. Load a frozen ``ScopeManifestDoc`` (scope selection is owned by the
   scopes API / ``ScopeService``; the driver never invents scopes).
2. Compile a purpose-scoped ``ContextPack`` at the project's ACTIVE memory
   version and persist it as an accepted ``context_pack`` artifact under an
   idempotent ``GenerationRunDoc`` + ``StageRunDoc`` pair whose active stage
   is ``manga_direction`` — exactly the state the domain-tool broker's
   authorization demands.
3. Build the typed ``AgentGoal`` (per-goal tool allowlist and budget,
   ADR-004) and call the authenticated agent worker.
4. Re-validate the candidate as a canonical ``MangaPlan``, require the
   broker-stored candidate artifact, require a MiniMax receipt matching the
   provider policy (issue #3: ``manga_direction -> minimax / MiniMax-M3``),
   and persist the accepted artifact with its ``ModelReceipt``.

The driver fails loud at every step; nothing falls back silently.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

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
from app.contracts.manga import MangaPlan
from app.contracts.runs import GenerationBudget
from app.persistence.documents import (
    ArtifactDoc,
    GenerationRunDoc,
    StageRunDoc,
    construct_document,
    utc_now,
)
from app.persistence.protocols import Repositories
from app.persistence.v1_bridge import ensure_genesis_snapshot
from app.services.agent_worker import AgentWorkerError, AgentWorkerGateway
from app.services.context_compiler import ContextCompiler
from app.services.errors import ArtifactValidationError, AuthorizationError, NotFoundError
from app.services.hashing import content_hash

logger = logging.getLogger(__name__)

PIPELINE_VERSION = "manga-agentic.v1"
STAGE_NAME = "manga_direction"
PROMPT_VERSION = "manga-direction.v2"

#: Issue #3 provider policy for the manga_direction purpose. Overridable per
#: instance only for the documented A/B escape hatch — never silently.
REQUIRED_PROVIDER = "minimax"
REQUIRED_MODEL = "MiniMax-M3"

MANGA_DIRECTOR_TOOLS = [
    "get_source_excerpt",
    "get_canon_entity",
    "list_relevant_assets",
    "submit_manga_plan",
    "report_source_conflict",
]

DEFAULT_CONSTRAINTS = GenerationConstraints(
    image_mode="budgeted",
    max_pages=8,
    max_panels_per_page=7,
    max_sprites=8,
    max_key_panels=3,
    reading_direction="rtl",
    narration_enabled=False,
)

DEFAULT_BUDGET = GenerationBudget(
    max_text_cost_usd=0.50,
    max_image_cost_usd=0.0,
    max_render_minutes=0.0,
    max_agent_steps=8,
    max_repair_attempts=1,
    max_sprites=8,
    max_key_panels=3,
    max_reels=0,
)

DEFAULT_MAX_INPUT_TOKENS = 80_000
DEFAULT_MAX_OUTPUT_TOKENS = 16_000


class MangaDirectorError(RuntimeError):
    """Raised when the direction goal cannot produce an accepted MangaPlan."""


@dataclass
class DirectionOutcome:
    artifact: ArtifactDoc
    run_id: str
    stage_run_id: str
    context_pack_id: str
    reused: bool


class MangaDirectorService:
    def __init__(
        self,
        repositories: Repositories,
        agent_worker: AgentWorkerGateway,
        *,
        required_provider: str = REQUIRED_PROVIDER,
        required_model: str = REQUIRED_MODEL,
        max_input_tokens: int = DEFAULT_MAX_INPUT_TOKENS,
        created_by: str = "manga-director-driver",
    ) -> None:
        self._repositories = repositories
        self._agent_worker = agent_worker
        self._required_provider = required_provider
        self._required_model = required_model
        self._max_input_tokens = max_input_tokens
        self._created_by = created_by
        self._compiler = ContextCompiler()

    async def run_direction_goal(
        self,
        *,
        project_id: str,
        scope_id: str,
        constraints: GenerationConstraints = DEFAULT_CONSTRAINTS,
        budget: GenerationBudget = DEFAULT_BUDGET,
        instructions: str | None = None,
    ) -> DirectionOutcome:
        scope = await self._repositories.get_scope(scope_id)
        if scope is None:
            raise NotFoundError(f"Scope {scope_id} does not exist")
        if scope.project_id != project_id:
            raise AuthorizationError("Scope does not belong to the requested project")

        await ensure_genesis_snapshot(self._repositories, project_id)
        project = await self._repositories.get_project(project_id)
        if project is None:
            raise NotFoundError(f"Project {project_id} does not exist")
        memory = await self._repositories.get_memory_snapshot(
            project_id, project.active_memory_version
        )
        if memory is None:
            raise MangaDirectorError(
                f"Active memory snapshot v{project.active_memory_version} is missing"
            )

        units = await self._repositories.list_source_units(scope.book_id)
        selected_ids = set(scope.source_unit_ids)
        selected_units = [u for u in units if u.source_unit_id in selected_ids]
        if len(selected_units) != len(scope.source_unit_ids):
            raise MangaDirectorError(
                "Scope references source units that are no longer persisted"
            )

        pack = self._compiler.compile(
            project_id=project_id,
            scope=scope,
            memory=memory,
            source_units=selected_units,
            purpose="manga_direction",
            constraints=constraints,
            max_input_tokens=self._max_input_tokens,
        )

        run, stage = await self._ensure_run_and_stage(
            project_id=project_id, scope_id=scope_id, pack=pack, budget=budget
        )

        existing = await self._existing_accepted_plan(run, stage)
        if existing is not None:
            return DirectionOutcome(
                artifact=existing,
                run_id=run.run_id,
                stage_run_id=stage.stage_run_id,
                context_pack_id=pack.context_pack_id,
                reused=True,
            )

        context_artifact = await self._persist_context_pack(run, stage, pack)
        goal = self._build_goal(run, stage, context_artifact, pack)

        try:
            result = await self._agent_worker.run(
                goal,
                pack,
                instructions=instructions or self._default_instructions(pack),
            )
        except AgentWorkerError as error:
            await self._fail_stage(run, stage, error)
            raise

        plan = self._validate_candidate(result.candidate, pack, project_id)
        payload = plan.model_dump(mode="json")
        digest = content_hash(payload)

        candidate = await self._repositories.get_artifact(
            f"candidate_manga_plan_{digest[:24]}"
        )
        if (
            candidate is None
            or candidate.run_id != run.run_id
            or candidate.project_id != project_id
            or candidate.validation_status != "valid"
            or candidate.content_hash != digest
        ):
            raise ArtifactValidationError(
                "MangaPlan submission was not durably validated by the domain-tool broker"
            )

        receipt = self._build_receipt(result.trace, context_artifact, stage)
        accepted = construct_document(
            ArtifactDoc,
            artifact_id=f"manga_plan_{digest[:24]}",
            project_id=project_id,
            run_id=run.run_id,
            stage_run_id=stage.stage_run_id,
            kind="manga_plan",
            schema_version="manga-plan.v1",
            content=payload,
            storage_ref=None,
            content_hash=digest,
            parent_artifact_ids=[context_artifact.artifact_id, candidate.artifact_id],
            author="agent",
            supersedes_artifact_id=None,
            source_refs=candidate.source_refs,
            model_receipt=receipt.model_dump(mode="json"),
            validation_status="accepted",
            validation_report={
                "passed": True,
                "issues": [],
                "validator_version": "manga-plan-validator.v1",
            },
            created_at=utc_now(),
        )
        stored = await self._repositories.save_artifact(accepted)

        stage.status = "succeeded"
        stage.output_artifact_ids = [stored.artifact_id]
        stage.agent_session_id = (
            str(result.trace.get("session_id") or "") or None
        )
        stage.trace = result.trace
        stage.ended_at = utc_now()
        await self._repositories.save_stage(stage)
        run.status = "succeeded"
        run.active_stage = None
        run.updated_at = utc_now()
        await self._repositories.save_run(run)

        logger.info(
            "accepted MangaPlan %s (run=%s tokens=%s cost=%s latency_ms=%s)",
            stored.artifact_id,
            run.run_id,
            result.trace.get("tokens"),
            result.trace.get("cost_usd"),
            result.trace.get("latency_ms"),
        )
        return DirectionOutcome(
            artifact=stored,
            run_id=run.run_id,
            stage_run_id=stage.stage_run_id,
            context_pack_id=pack.context_pack_id,
            reused=False,
        )

    # ------------------------------------------------------------------
    # durable scaffolding
    # ------------------------------------------------------------------

    async def _ensure_run_and_stage(
        self,
        *,
        project_id: str,
        scope_id: str,
        pack: ContextPack,
        budget: GenerationBudget,
    ) -> tuple[GenerationRunDoc, StageRunDoc]:
        run_key = content_hash(
            {
                "kind": "agentic-direction-run",
                "project_id": project_id,
                "scope_id": scope_id,
                "memory_version": pack.memory_version,
                "pipeline_version": PIPELINE_VERSION,
            }
        )
        run_id = f"run_dir_{run_key[:24]}"
        run = await self._repositories.get_run(run_id)
        if run is None:
            run = await self._repositories.save_run(
                construct_document(
                    GenerationRunDoc,
                    run_id=run_id,
                    project_id=project_id,
                    scope_id=scope_id,
                    requested_outputs=["manga"],
                    pipeline_version=PIPELINE_VERSION,
                    memory_version=pack.memory_version,
                    status="running",
                    active_stage=STAGE_NAME,
                    budget=budget.model_dump(mode="json"),
                    created_by=self._created_by,
                    idempotency_key=run_key,
                    created_at=utc_now(),
                    updated_at=utc_now(),
                )
            )
        elif run.status == "failed":
            # Session 5 (step 0.3): a durably-failed direction run is
            # re-armed; the stage retry below increments the attempt.
            run.status = "running"
            run.active_stage = STAGE_NAME
            run.updated_at = utc_now()
            run = await self._repositories.save_run(run)
        elif run.status not in {"running", "succeeded"}:
            raise MangaDirectorError(
                f"Direction run {run_id} is in state {run.status}; refusing to reuse"
            )

        stage_key = content_hash({"run_id": run_id, "stage": STAGE_NAME, "attempt": 1})
        stage_run_id = f"stage_dir_{stage_key[:24]}"
        stage = await self._repositories.get_stage(stage_run_id)
        if stage is not None and stage.status == "failed":
            stage.attempt += 1
            stage.status = "running"
            stage.error_code = None
            stage.error_detail = None
            stage.trace = None
            stage.output_artifact_ids = []
            stage.started_at = utc_now()
            stage.ended_at = None
            stage = await self._repositories.save_stage(stage)
        if stage is None:
            stage = await self._repositories.save_stage(
                construct_document(
                    StageRunDoc,
                    stage_run_id=stage_run_id,
                    run_id=run_id,
                    stage_name=STAGE_NAME,
                    attempt=1,
                    status="running",
                    input_artifact_ids=[],
                    input_hash=pack.content_hash,
                    output_artifact_ids=[],
                    idempotency_key=stage_key,
                    agent_session_id=None,
                    error_code=None,
                    error_detail=None,
                    started_at=utc_now(),
                    ended_at=None,
                )
            )
        return run, stage

    async def _fail_stage(
        self, run: GenerationRunDoc, stage: StageRunDoc, error: AgentWorkerError
    ) -> None:
        """Durably persist a FAILED direction run (Session 5 step 0.3)."""
        now = utc_now()
        stage.status = "failed"
        stage.error_code = error.error_code or error.code
        stage.error_detail = {
            "message": str(error),
            "worker_state": error.state,
            "worker_error_message": error.error_message,
            "http_status": error.http_status,
        }
        stage.trace = error.trace
        if error.trace:
            stage.agent_session_id = str(error.trace.get("session_id") or "") or None
        stage.failure_history = [
            *stage.failure_history[-9:],
            {
                "attempt": stage.attempt,
                "error_code": stage.error_code,
                "trace": error.trace,
                "at": now.isoformat(),
            },
        ]
        stage.ended_at = now
        await self._repositories.save_stage(stage)
        run.status = "failed"
        run.active_stage = None
        run.updated_at = now
        await self._repositories.save_run(run)
        logger.warning(
            "direction stage %s FAILED durably (run=%s attempt=%s error=%s "
            "tokens=%s cost=%s latency_ms=%s)",
            stage.stage_run_id,
            run.run_id,
            stage.attempt,
            stage.error_code,
            (error.trace or {}).get("tokens"),
            (error.trace or {}).get("cost_usd"),
            (error.trace or {}).get("latency_ms"),
        )

    async def _existing_accepted_plan(
        self, run: GenerationRunDoc, stage: StageRunDoc
    ) -> ArtifactDoc | None:
        if stage.status != "succeeded" or not stage.output_artifact_ids:
            return None
        existing = await self._repositories.get_artifact(stage.output_artifact_ids[0])
        receipt = existing.model_receipt if existing is not None else None
        if (
            existing is not None
            and receipt is not None
            and receipt.get("provider") == self._required_provider
            and receipt.get("model") == self._required_model
        ):
            return existing
        raise ArtifactValidationError(
            "Succeeded Manga Director stage lacks an accepted MiniMax receipt"
        )

    async def _persist_context_pack(
        self, run: GenerationRunDoc, stage: StageRunDoc, pack: ContextPack
    ) -> ArtifactDoc:
        artifact = construct_document(
            ArtifactDoc,
            artifact_id=pack.context_pack_id,
            project_id=pack.project_id,
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
            created_at=utc_now(),
        )
        stored = await self._repositories.save_artifact(artifact)
        stage.input_artifact_ids = [stored.artifact_id]
        await self._repositories.save_stage(stage)
        return stored

    def _build_goal(
        self,
        run: GenerationRunDoc,
        stage: StageRunDoc,
        context_artifact: ArtifactDoc,
        pack: ContextPack,
    ) -> AgentGoal:
        return AgentGoal(
            goal_id=f"goal_{stage.idempotency_key[:20]}_{stage.attempt}",
            run_id=run.run_id,
            stage_run_id=stage.stage_run_id,
            goal_type=AgentGoalType.MANGA_DIRECTION,
            output_schema="manga-plan.v1",
            schema_version="manga-plan.v1",
            input_artifact_refs=[
                ArtifactRef(
                    artifact_id=context_artifact.artifact_id,
                    kind="context_pack",
                    schema_version=context_artifact.schema_version,
                    content_hash=context_artifact.content_hash,
                )
            ],
            constraints={
                "max_pages": pack.constraints.max_pages,
                "max_sprites": pack.constraints.max_sprites,
                "max_key_panels": pack.constraints.max_key_panels,
                "reading_direction": pack.constraints.reading_direction,
            },
            acceptance_tests=[
                AcceptanceTestRef(
                    test_id="manga_plan_schema",
                    description="Candidate validates as MangaPlan v1.",
                ),
                AcceptanceTestRef(
                    test_id="source_grounding",
                    description="Every plan claim cites persisted source evidence.",
                ),
            ],
            allowed_tools=list(MANGA_DIRECTOR_TOOLS),
            budget=AgentBudget(
                max_steps=int(run.budget["max_agent_steps"]),
                max_tool_calls=max(4, int(run.budget["max_agent_steps"]) * 2),
                max_input_tokens=self._max_input_tokens,
                max_output_tokens=DEFAULT_MAX_OUTPUT_TOKENS,
                max_repair_attempts=int(run.budget["max_repair_attempts"]),
                max_cost_usd=float(run.budget["max_text_cost_usd"]),
            ),
        )

    def _default_instructions(self, pack: ContextPack) -> str:
        unit_count = len(pack.source_units)
        fact_ids = [fact.fact_id for fact in pack.book_canon.facts]
        fact_clause = (
            "Cite every one of these ContextPack fact IDs in beat "
            f"required_fact_ids (each at least once, none invented): {', '.join(fact_ids)}. "
            if fact_ids
            else "The ContextPack has no canonical facts; keep required_fact_ids empty. "
        )
        return (
            "Produce one grounded MangaPlan for the supplied scope only. "
            f"Cover ALL {unit_count} ContextPack source units: every source unit "
            "must be cited by at least one beat, with source_ref objects copied "
            "COMPLETE and byte-exact from the ContextPack (book_id, "
            "source_unit_id, pages, offsets, quote, text_hash). "
            + fact_clause
            + f"Keep target_page_count at most {pack.constraints.max_pages} and "
            "no larger than the number of beats. Keep character_intent entries "
            "only for characters present in continuity.character_state. Do not "
            "request images or compose RenderedPage output in this run."
        )

    # ------------------------------------------------------------------
    # acceptance
    # ------------------------------------------------------------------

    def _validate_candidate(
        self, candidate: dict, pack: ContextPack, project_id: str
    ) -> MangaPlan:
        try:
            plan = MangaPlan.model_validate(candidate)
        except ValidationError as error:
            raise ArtifactValidationError(
                f"Agent worker candidate failed MangaPlan validation: {error}"
            ) from error
        if (
            plan.project_id != project_id
            or plan.scope_id != pack.scope_id
            or plan.context_pack_id != pack.context_pack_id
            or plan.memory_version != pack.memory_version
        ):
            raise ArtifactValidationError(
                "Accepted MangaPlan identity does not match its ContextPack"
            )
        return plan

    def _build_receipt(
        self,
        trace: dict,
        context_artifact: ArtifactDoc,
        stage: StageRunDoc,
    ) -> ModelReceipt:
        provider = trace.get("provider")
        model = trace.get("model")
        skill_hash = trace.get("skill_hash")
        tokens = trace.get("tokens")
        if (
            not isinstance(provider, str)
            or not provider
            or not isinstance(model, str)
            or not model
            or not isinstance(skill_hash, str)
            or not isinstance(tokens, dict)
        ):
            raise ArtifactValidationError("Agent trace omitted model provenance")
        if provider != self._required_provider or model != self._required_model:
            raise ArtifactValidationError(
                "Manga Director must use provider="
                f"{self._required_provider} and model={self._required_model}"
            )
        latency_ms = _optional_int(trace.get("latency_ms"))
        if latency_ms is None:
            raise ArtifactValidationError("Agent trace omitted measured latency_ms")
        return ModelReceipt(
            provider=provider,
            model=model,
            purpose="manga_direction",
            prompt_version=PROMPT_VERSION,
            skill_hashes=[skill_hash],
            input_artifact_ids=[context_artifact.artifact_id],
            input_tokens=_optional_int(tokens.get("input")),
            output_tokens=_optional_int(tokens.get("output")),
            cost_usd=_optional_float(trace.get("cost_usd")),
            latency_ms=latency_ms,
            attempt=stage.attempt,
            created_at=utc_now(),
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
