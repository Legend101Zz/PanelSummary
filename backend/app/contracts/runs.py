"""Control-plane run, stage, state, and budget contracts."""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, JsonValue, model_validator

from .base import ContractModel, Identifier, ShortText


class StageStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    WAITING_FOR_ASSETS = "waiting_for_assets"
    VALIDATING = "validating"
    REPAIRING = "repairing"
    SUCCEEDED = "succeeded"
    RETRYABLE_FAILED = "retryable_failed"
    TERMINAL_FAILED = "terminal_failed"
    CANCELLED = "cancelled"
    SUPERSEDED = "superseded"


class GenerationRunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    RETRYABLE_FAILED = "retryable_failed"
    TERMINAL_FAILED = "terminal_failed"
    CANCELLED = "cancelled"
    SUPERSEDED = "superseded"


class GenerationBudget(ContractModel):
    max_text_cost_usd: Annotated[float, Field(ge=0)]
    max_image_cost_usd: Annotated[float, Field(ge=0)]
    max_render_minutes: Annotated[float, Field(ge=0)]
    max_agent_steps: Annotated[int, Field(ge=1)]
    max_repair_attempts: Annotated[int, Field(ge=0, le=2)]
    max_sprites: Annotated[int, Field(ge=0)]
    max_key_panels: Annotated[int, Field(ge=0)]
    max_reels: Annotated[int, Field(ge=0)]


class GenerationRun(ContractModel):
    schema_version: Literal["generation-run.v1"]
    run_id: Identifier
    project_id: Identifier
    scope_id: Identifier
    requested_outputs: list[Literal["manga", "reels", "reel_render"]] = Field(
        min_length=1, max_length=3
    )
    pipeline_version: ShortText
    status: GenerationRunStatus
    active_stage: Identifier | None = None
    budget: GenerationBudget
    created_by: Identifier
    created_at: AwareDatetime
    updated_at: AwareDatetime

    @model_validator(mode="after")
    def validate_run(self) -> "GenerationRun":
        if self.updated_at < self.created_at:
            raise ValueError("updated_at must not precede created_at")
        if len(self.requested_outputs) != len(set(self.requested_outputs)):
            raise ValueError("requested_outputs must be unique")
        if self.status == GenerationRunStatus.RUNNING and self.active_stage is None:
            raise ValueError("running GenerationRun requires active_stage")
        return self


class StageRun(ContractModel):
    schema_version: Literal["stage-run.v1"]
    stage_run_id: Identifier
    run_id: Identifier
    stage_name: Identifier
    attempt: Annotated[int, Field(ge=1)]
    status: StageStatus
    input_artifact_ids: list[Identifier] = Field(default_factory=list, max_length=1_000)
    input_hash: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
    output_artifact_ids: list[Identifier] = Field(default_factory=list, max_length=1_000)
    agent_session_id: Identifier | None = None
    error_code: Identifier | None = None
    error_detail: dict[str, JsonValue] | None = None
    started_at: AwareDatetime | None = None
    ended_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def validate_stage_lifecycle(self) -> "StageRun":
        terminal = {
            StageStatus.SUCCEEDED,
            StageStatus.RETRYABLE_FAILED,
            StageStatus.TERMINAL_FAILED,
            StageStatus.CANCELLED,
            StageStatus.SUPERSEDED,
        }
        failed = {StageStatus.RETRYABLE_FAILED, StageStatus.TERMINAL_FAILED}
        if self.status != StageStatus.QUEUED and self.started_at is None:
            raise ValueError("non-queued stages require started_at")
        if self.status in terminal and self.ended_at is None:
            raise ValueError("terminal stages require ended_at")
        if self.started_at is not None and self.ended_at is not None and self.ended_at < self.started_at:
            raise ValueError("ended_at must not precede started_at")
        if self.status in failed and self.error_code is None:
            raise ValueError("failed stages require error_code")
        if self.status == StageStatus.SUCCEEDED and not self.output_artifact_ids:
            raise ValueError("succeeded stages require output_artifact_ids")
        return self
