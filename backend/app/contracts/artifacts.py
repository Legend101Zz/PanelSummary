"""Immutable artifact, asset, and model provenance contracts."""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, JsonValue, model_validator

from .base import ContentHash, ContractModel, Identifier, ShortText
from .source import SourceRef


StorageRef = Annotated[
    str,
    Field(
        min_length=1,
        max_length=500,
        pattern=(
            r"^(?:storage://|public/)"
            r"[A-Za-z0-9][A-Za-z0-9._-]*"
            r"(?:/[A-Za-z0-9][A-Za-z0-9._-]*)*$"
        ),
    ),
]


class ArtifactKind(str, Enum):
    CONTEXT_PACK = "context_pack"
    ADAPTATION_BEAT_SET = "adaptation_beat_set"
    MANGA_PLAN = "manga_plan"
    PAGE_SCRIPT_SET = "page_script_set"
    THUMBNAIL_SET = "thumbnail_set"
    PAGE_LAYOUT = "page_layout"
    COMPILED_LAYOUT = "compiled_layout"
    THUMBNAIL_PREVIEW = "thumbnail_preview"
    VALIDATION_REPORT = "validation_report"
    REVISION_REQUEST = "revision_request"
    IMAGE_ATTEMPT = "image_attempt"
    IMAGE_ASSET = "image_asset"
    ASSET_REQUEST_SET = "asset_request_set"
    MANGA_SCRIPT = "manga_script"
    STORYBOARD = "storyboard"
    PAGE_COMPOSITION = "page_composition"
    RENDERED_PAGE = "rendered_page"
    RENDERED_PAGE_SET = "rendered_page_set"
    MANGA_EDITION = "manga_edition"
    MANGA_MANIFEST = "manga_manifest"
    REEL_SPEC = "reel_spec"
    RENDER_RECEIPT = "render_receipt"
    MEMORY_DELTA = "memory_delta"


class ArtifactRef(ContractModel):
    artifact_id: Identifier
    kind: ArtifactKind
    schema_version: ShortText
    content_hash: ContentHash


class ModelReceipt(ContractModel):
    provider: ShortText
    model: ShortText
    purpose: ShortText
    prompt_version: ShortText
    skill_hashes: list[ContentHash] = Field(default_factory=list, max_length=64)
    input_artifact_ids: list[Identifier] = Field(default_factory=list, max_length=1_000)
    input_tokens: Annotated[int, Field(ge=0)] | None = None
    output_tokens: Annotated[int, Field(ge=0)] | None = None
    cost_usd: Annotated[float, Field(ge=0)] | None = None
    latency_ms: Annotated[int, Field(ge=0)]
    attempt: Annotated[int, Field(ge=1)]
    created_at: AwareDatetime


class ValidationIssue(ContractModel):
    code: Identifier
    message: Annotated[str, Field(min_length=1, max_length=2_000)]
    path: Annotated[str, Field(min_length=1, max_length=500)] | None = None


class ValidationReport(ContractModel):
    passed: bool
    issues: list[ValidationIssue] = Field(default_factory=list, max_length=1_000)
    validator_version: ShortText
    implementation_version: ShortText | None = None
    text_model_executed: bool | None = None


class Artifact(ContractModel):
    artifact_id: Identifier
    project_id: Identifier
    run_id: Identifier
    stage_run_id: Identifier | None = None
    kind: ArtifactKind
    schema_version: ShortText
    content: dict[str, JsonValue] | None = None
    storage_ref: StorageRef | None = None
    content_hash: ContentHash
    parent_artifact_ids: list[Identifier] = Field(default_factory=list, max_length=1_000)
    author: Literal["agent", "human", "system"] = "system"
    supersedes_artifact_id: Identifier | None = None
    source_refs: list[SourceRef] = Field(default_factory=list, max_length=10_000)
    model_receipt: ModelReceipt | None = None
    validation_status: Literal[
        "pending", "valid", "invalid", "accepted", "rejected", "superseded"
    ]
    validation_report: ValidationReport
    created_at: AwareDatetime

    @model_validator(mode="after")
    def validate_payload_location(self) -> "Artifact":
        if (self.content is None) == (self.storage_ref is None):
            raise ValueError("exactly one of content or storage_ref is required")
        if self.validation_status == "accepted" and not self.validation_report.passed:
            raise ValueError("accepted artifacts require a passing validation report")
        return self


class AssetRef(ContractModel):
    asset_id: Identifier
    project_id: Identifier
    asset_type: Literal["character_sprite", "expression", "key_panel", "background", "audio", "caption_track"]
    content_hash: ContentHash
    storage_ref: StorageRef
    mime_type: ShortText
    width: Annotated[int, Field(gt=0)] | None = None
    height: Annotated[int, Field(gt=0)] | None = None
    duration_ms: Annotated[int, Field(gt=0)] | None = None
    model_receipt: ModelReceipt | None = None


class AssetRequest(ContractModel):
    asset_request_id: Identifier
    project_id: Identifier
    character_id: Identifier | None = None
    asset_type: Literal["character_sprite", "expression", "key_panel", "background"]
    pose: ShortText | None = None
    expression: ShortText | None = None
    camera: ShortText | None = None
    aspect_ratio: Annotated[str, Field(pattern=r"^[1-9][0-9]*:[1-9][0-9]*$")]
    prompt_fields: dict[Identifier, ShortText] = Field(min_length=1, max_length=32)
    consistency_reference_asset_ids: list[Identifier] = Field(default_factory=list, max_length=16)
    model_policy_id: Identifier
    idempotency_key: ContentHash

    @model_validator(mode="after")
    def validate_character_asset(self) -> "AssetRequest":
        if self.asset_type in {"character_sprite", "expression"} and self.character_id is None:
            raise ValueError("character_id is required for character sprites and expressions")
        return self
