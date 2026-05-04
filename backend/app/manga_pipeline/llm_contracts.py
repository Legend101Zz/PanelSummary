"""Structured LLM orchestration for the v2 manga pipeline.

The v2 pipeline treats LLMs as first-class creative systems, not optional
helpers. A creative stage either returns a validated artifact or fails with a
traceable contract error. It must never silently downgrade into a cheap local
fallback, because bad manga is worse than an honest generation failure.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Generic, Protocol, TypeVar

from pydantic import BaseModel, TypeAdapter, ValidationError

logger = logging.getLogger(__name__)

ArtifactT = TypeVar("ArtifactT")


class LLMStageName(str, Enum):
    """Canonical names for model-backed manga pipeline stages."""

    SOURCE_FACT_EXTRACTION = "source_fact_extraction"
    WHOLE_BOOK_SYNOPSIS = "whole_book_synopsis"
    BOOK_FACT_REGISTRY = "book_fact_registry"
    ARC_OUTLINE = "arc_outline"
    ADAPTATION_PLANNING = "adaptation_planning"
    CHARACTER_WORLD_BIBLE = "character_world_bible"
    CHARACTER_ART_DIRECTION = "character_art_direction"
    BEAT_SHEET = "beat_sheet"
    MANGA_SCRIPT = "manga_script"
    STORYBOARD = "storyboard"
    QUALITY_REPAIR = "quality_repair"
    CHARACTER_ASSET_PROMPTS = "character_asset_prompts"


class LLMModelClient(Protocol):
    """Minimal protocol implemented by ``LLMClient`` and test fakes."""

    model: str
    provider: str

    async def chat(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: int = 4000,
        temperature: float = 0.7,
        json_mode: bool = True,
    ) -> dict[str, Any]:
        """Return a raw LLM response with ``content`` and ``parsed`` keys."""


class LLMOutputValidationError(RuntimeError):
    """Raised when a model cannot produce a valid artifact after repair."""

    def __init__(self, stage_name: LLMStageName, trace: "LLMInvocationTrace") -> None:
        self.stage_name = stage_name
        self.trace = trace
        attempts = len(trace.attempts)
        last_issue = trace.attempts[-1].issues[0].message if trace.attempts and trace.attempts[-1].issues else "unknown"
        super().__init__(
            f"LLM stage '{stage_name.value}' failed contract validation "
            f"after {attempts} attempt(s): {last_issue}"
        )


@dataclass(frozen=True)
class LLMValidationIssue:
    """A compact validation problem suitable for logs and repair prompts."""

    code: str
    message: str
    location: str = ""


@dataclass(frozen=True)
class LLMCallAttempt:
    """Observability record for one model call attempt."""

    attempt_index: int
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: float
    content_preview: str
    issues: tuple[LLMValidationIssue, ...] = ()


@dataclass
class LLMInvocationTrace:
    """Trace for a structured LLM stage invocation.

    We keep this intentionally small enough to persist on a job/slice document
    later without storing full source text or sensitive user content.
    """

    stage_name: LLMStageName
    provider: str
    model: str
    attempts: list[LLMCallAttempt] = field(default_factory=list)

    @property
    def total_cost_usd(self) -> float:
        return round(sum(attempt.estimated_cost_usd for attempt in self.attempts), 6)

    @property
    def total_input_tokens(self) -> int:
        return sum(attempt.input_tokens for attempt in self.attempts)

    @property
    def total_output_tokens(self) -> int:
        return sum(attempt.output_tokens for attempt in self.attempts)


@dataclass(frozen=True)
class StructuredLLMResult(Generic[ArtifactT]):
    """Validated artifact plus the model trace that produced it."""

    artifact: ArtifactT
    trace: LLMInvocationTrace


@dataclass(frozen=True)
class StructuredLLMRequest:
    """Configuration for one model-backed creative stage."""

    stage_name: LLMStageName
    system_prompt: str
    user_message: str
    max_tokens: int
    temperature: float = 0.7
    max_validation_attempts: int = 3

    def __post_init__(self) -> None:
        if self.max_validation_attempts < 1:
            raise ValueError("max_validation_attempts must be at least 1")
        if not self.system_prompt.strip():
            raise ValueError("system_prompt cannot be blank")
        if not self.user_message.strip():
            raise ValueError("user_message cannot be blank")
        if self.max_tokens < 512:
            raise ValueError("max_tokens is too small for structured manga artifacts")


async def run_structured_llm_stage(
    *,
    client: LLMModelClient,
    request: StructuredLLMRequest,
    output_type: type[ArtifactT],
) -> StructuredLLMResult[ArtifactT]:
    """Run a model-backed stage until its output validates or fail loudly.

    This is the production v2 alternative to the legacy "fallback" approach.
    If the model output is malformed, we call the model again with a repair
    prompt that includes the schema errors. If it still fails, we raise an
    explicit contract error so the job can surface a useful failure state.
    """
    adapter = TypeAdapter(output_type)
    trace = LLMInvocationTrace(
        stage_name=request.stage_name,
        provider=getattr(client, "provider", "unknown"),
        model=getattr(client, "model", "unknown"),
    )
    user_message = request.user_message

    for attempt_index in range(1, request.max_validation_attempts + 1):
        result = await client.chat(
            system_prompt=request.system_prompt,
            user_message=user_message,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            json_mode=True,
        )
        issues = _validate_raw_response(result, adapter)
        trace.attempts.append(_attempt_from_result(attempt_index, result, issues))

        if not issues:
            artifact = adapter.validate_python(result["parsed"])
            logger.info(
                "[MANGA_V2_LLM] %s validated on attempt %s with %s/%s tokens",
                request.stage_name.value,
                attempt_index,
                trace.total_input_tokens,
                trace.total_output_tokens,
            )
            return StructuredLLMResult(artifact=artifact, trace=trace)

        logger.warning(
            "[MANGA_V2_LLM] %s failed validation on attempt %s/%s: %s",
            request.stage_name.value,
            attempt_index,
            request.max_validation_attempts,
            "; ".join(issue.message for issue in issues[:3]),
        )
        if attempt_index < request.max_validation_attempts:
            user_message = build_repair_prompt(
                original_user_message=request.user_message,
                raw_content=str(result.get("content", "")),
                issues=issues,
            )

    raise LLMOutputValidationError(request.stage_name, trace)


def build_json_contract_prompt(model: type[BaseModel]) -> str:
    """Return a compact JSON-schema instruction block for an artifact model."""
    schema = model.model_json_schema()
    return (
        "Return ONLY valid JSON matching this schema. Do not include markdown, "
        "commentary, chain-of-thought, or extra top-level keys.\n"
        f"JSON_SCHEMA:\n{json.dumps(schema, ensure_ascii=False)}"
    )


def build_repair_prompt(
    *,
    original_user_message: str,
    raw_content: str,
    issues: list[LLMValidationIssue],
) -> str:
    """Build a repair request that still asks the model to author the artifact.

    We do not patch creative artifacts locally because that hides story defects.
    The model receives the validation failures and must regenerate clean JSON.
    """
    issue_text = "\n".join(
        f"- {issue.code} at {issue.location or '<root>'}: {issue.message}"
        for issue in issues[:20]
    )
    raw_preview = raw_content[:6000]
    return f"""The previous response did not satisfy the required contract.

VALIDATION ISSUES:
{issue_text}

PREVIOUS RESPONSE PREVIEW:
{raw_preview}

Regenerate the artifact from the original request below. Preserve the creative
intent, fix the contract violations, and return ONLY valid JSON.

ORIGINAL REQUEST:
{original_user_message}"""


def _validate_raw_response(
    result: dict[str, Any],
    adapter: TypeAdapter[ArtifactT],
) -> list[LLMValidationIssue]:
    parsed = result.get("parsed")
    if parsed is None:
        return [
            LLMValidationIssue(
                code="json_parse_failed",
                message="Model response did not parse as JSON.",
            )
        ]

    try:
        adapter.validate_python(parsed)
    except ValidationError as exc:
        return _issues_from_validation_error(exc)
    return []


def _issues_from_validation_error(exc: ValidationError) -> list[LLMValidationIssue]:
    issues: list[LLMValidationIssue] = []
    for error in exc.errors()[:25]:
        location = ".".join(str(part) for part in error.get("loc", ()))
        issues.append(
            LLMValidationIssue(
                code=str(error.get("type", "schema_validation_failed")),
                message=str(error.get("msg", "schema validation failed")),
                location=location,
            )
        )
    return issues or [
        LLMValidationIssue(
            code="schema_validation_failed",
            message="Model response failed schema validation.",
        )
    ]


def _attempt_from_result(
    attempt_index: int,
    result: dict[str, Any],
    issues: list[LLMValidationIssue],
) -> LLMCallAttempt:
    content = str(result.get("content", ""))
    preview = content[:1000] + ("…" if len(content) > 1000 else "")
    return LLMCallAttempt(
        attempt_index=attempt_index,
        input_tokens=int(result.get("input_tokens", 0) or 0),
        output_tokens=int(result.get("output_tokens", 0) or 0),
        estimated_cost_usd=float(result.get("estimated_cost_usd", 0) or 0),
        content_preview=preview,
        issues=tuple(issues),
    )
