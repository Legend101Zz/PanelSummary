"""Revamp manga generation pipeline.

This package is intentionally separate from the legacy orchestrator. The legacy
path remains the rollback doghouse; this path is the new good boy.
"""

from app.manga_pipeline.context import PipelineContext, PipelineResult
from app.manga_pipeline.llm_contracts import (
    LLMOutputValidationError,
    LLMStageName,
    StructuredLLMRequest,
    StructuredLLMResult,
    build_json_contract_prompt,
    run_structured_llm_stage,
)
from app.manga_pipeline.orchestrator import MangaPipelineStage, run_pipeline_context, run_pipeline_stages

__all__ = [
    "LLMOutputValidationError",
    "LLMStageName",
    "MangaPipelineStage",
    "PipelineContext",
    "PipelineResult",
    "StructuredLLMRequest",
    "StructuredLLMResult",
    "build_json_contract_prompt",
    "run_pipeline_context",
    "run_pipeline_stages",
    "run_structured_llm_stage",
]
