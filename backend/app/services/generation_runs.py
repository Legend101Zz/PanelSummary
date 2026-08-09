"""Generation-run lifecycle, idempotency, cancellation, and artifact reads."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.contracts.artifacts import Artifact
from app.contracts.runs import GenerationBudget, GenerationRun, GenerationRunStatus, StageRun
from app.persistence.documents import (
    ArtifactDoc,
    GenerationRunDoc,
    StageRunDoc,
    construct_document,
    utc_now,
)
from app.persistence.protocols import (
    ArtifactRepository,
    MemoryRepository,
    RunRepository,
    ScopeRepository,
    WorkflowDispatcher,
)

from .errors import InvalidRunStateError, NotFoundError
from .hashing import content_hash

RequestedOutput = Literal["manga", "reels", "reel_render"]
PipelineVersion = Literal[
    "manga-pipeline.v1",
    "manga-page-dsl.v2",
    "manga-edition.v1",
    "manga-demo-deterministic.v1",
]


def default_requested_outputs() -> list[RequestedOutput]:
    return ["manga"]


class StartGenerationRun(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scope_id: str = Field(min_length=1, max_length=128)
    requested_outputs: list[RequestedOutput] = Field(
        default_factory=default_requested_outputs, min_length=1, max_length=3
    )
    pipeline_version: PipelineVersion = "manga-pipeline.v1"
    budget: GenerationBudget
    created_by: str = Field(min_length=1, max_length=128)


class GenerationRunView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run: GenerationRun
    stages: list[StageRun]


class NoopWorkflowDispatcher:
    def enqueue_generation_run(self, run_id: str) -> None:
        del run_id


class GenerationRunService:
    def __init__(
        self,
        runs: RunRepository,
        scopes: ScopeRepository,
        memory: MemoryRepository,
        artifacts: ArtifactRepository,
        dispatcher: WorkflowDispatcher | None = None,
    ) -> None:
        self._runs = runs
        self._scopes = scopes
        self._memory = memory
        self._artifacts = artifacts
        self._dispatcher = dispatcher or NoopWorkflowDispatcher()

    async def start(
        self,
        project_id: str,
        request: StartGenerationRun,
        *,
        now: datetime | None = None,
    ) -> tuple[GenerationRun, bool]:
        scope = await self._scopes.get_scope(request.scope_id)
        if scope is None or scope.project_id != project_id:
            raise NotFoundError(f"Scope {request.scope_id} does not belong to project {project_id}")
        project = await self._memory.get_project(project_id)
        if project is None:
            raise NotFoundError(f"Manga project {project_id} does not exist")
        instant = now or utc_now()
        idempotency_payload = {
            "project_id": project_id,
            "scope_hash": scope.scope_hash,
            "memory_version": project.active_memory_version,
            "pipeline_version": request.pipeline_version,
            "requested_outputs": sorted(request.requested_outputs),
            "budget": request.budget.model_dump(mode="json"),
        }
        idempotency_key = content_hash(idempotency_payload)
        doc = construct_document(
            GenerationRunDoc,
            run_id=f"run_{idempotency_key[:24]}",
            project_id=project_id,
            scope_id=request.scope_id,
            requested_outputs=sorted(request.requested_outputs),
            pipeline_version=request.pipeline_version,
            memory_version=project.active_memory_version,
            status=GenerationRunStatus.QUEUED.value,
            budget=request.budget.model_dump(mode="json"),
            created_by=request.created_by,
            idempotency_key=idempotency_key,
            created_at=instant,
            updated_at=instant,
        )
        stored, created = await self._runs.create_run_if_absent(doc)
        if created:
            self._dispatcher.enqueue_generation_run(stored.run_id)
        return run_contract(stored), created

    async def get(self, run_id: str) -> GenerationRunView:
        run = await self._runs.get_run(run_id)
        if run is None:
            raise NotFoundError(f"Generation run {run_id} does not exist")
        stages = await self._runs.list_stages(run_id)
        return GenerationRunView(
            run=run_contract(run),
            stages=[stage_contract(item) for item in stages],
        )

    async def cancel(self, run_id: str, *, now: datetime | None = None) -> GenerationRunView:
        run = await self._runs.get_run(run_id)
        if run is None:
            raise NotFoundError(f"Generation run {run_id} does not exist")
        terminal = {
            GenerationRunStatus.SUCCEEDED.value,
            GenerationRunStatus.TERMINAL_FAILED.value,
            GenerationRunStatus.CANCELLED.value,
            GenerationRunStatus.SUPERSEDED.value,
        }
        if run.status == GenerationRunStatus.SUCCEEDED.value:
            raise InvalidRunStateError("A succeeded run cannot be cancelled")
        if run.status not in terminal:
            instant = now or utc_now()
            run.status = GenerationRunStatus.CANCELLED.value
            run.active_stage = None
            run.updated_at = instant
            await self._runs.save_run(run)
            for stage in await self._runs.list_stages(run_id):
                if stage.status not in {
                    "succeeded",
                    "retryable_failed",
                    "terminal_failed",
                    "cancelled",
                    "superseded",
                }:
                    if stage.started_at is None:
                        stage.started_at = instant
                    stage.status = "cancelled"
                    stage.ended_at = instant
                    await self._runs.save_stage(stage)
        return await self.get(run_id)

    async def artifacts(self, run_id: str) -> list[Artifact]:
        if await self._runs.get_run(run_id) is None:
            raise NotFoundError(f"Generation run {run_id} does not exist")
        docs = await self._artifacts.list_artifacts(run_id, accepted_only=True)
        return [artifact_contract(item) for item in docs]


def run_contract(doc: GenerationRunDoc) -> GenerationRun:
    return GenerationRun.model_validate(
        {
            "schema_version": "generation-run.v1",
            "run_id": doc.run_id,
            "project_id": doc.project_id,
            "scope_id": doc.scope_id,
            "requested_outputs": doc.requested_outputs,
            "pipeline_version": doc.pipeline_version,
            "status": doc.status,
            "active_stage": doc.active_stage,
            "budget": doc.budget,
            "created_by": doc.created_by,
            "created_at": doc.created_at,
            "updated_at": doc.updated_at,
        }
    )


def stage_contract(doc: StageRunDoc) -> StageRun:
    return StageRun.model_validate(
        {
            "schema_version": "stage-run.v1",
            "stage_run_id": doc.stage_run_id,
            "run_id": doc.run_id,
            "stage_name": doc.stage_name,
            "attempt": doc.attempt,
            "status": doc.status,
            "input_artifact_ids": doc.input_artifact_ids,
            "input_hash": doc.input_hash,
            "output_artifact_ids": doc.output_artifact_ids,
            "agent_session_id": doc.agent_session_id,
            "error_code": doc.error_code,
            "error_detail": doc.error_detail,
            "started_at": doc.started_at,
            "ended_at": doc.ended_at,
        }
    )


def artifact_contract(doc: ArtifactDoc) -> Artifact:
    return Artifact.model_validate(
        {
            "artifact_id": doc.artifact_id,
            "project_id": doc.project_id,
            "run_id": doc.run_id,
            "stage_run_id": doc.stage_run_id,
            "kind": doc.kind,
            "schema_version": doc.schema_version,
            "content": doc.content,
            "storage_ref": doc.storage_ref,
            "content_hash": doc.content_hash,
            "parent_artifact_ids": doc.parent_artifact_ids,
            "source_refs": doc.source_refs,
            "model_receipt": doc.model_receipt,
            "validation_status": doc.validation_status,
            "validation_report": doc.validation_report,
            "created_at": doc.created_at,
        }
    )
