"""Revamp manga generation pipeline.

This package is intentionally separate from the legacy orchestrator. The legacy
path remains the rollback doghouse; this path is the new good boy.
"""

from app.manga_pipeline.book_context import BookUnderstandingContext, BookUnderstandingResult
from app.manga_pipeline.book_orchestrator import (
    BookUnderstandingStage,
    run_book_understanding_pipeline,
)
from app.manga_pipeline.context import PipelineContext, PipelineResult
from app.manga_pipeline.llm_contracts import (
    LLMOutputValidationError,
    LLMStageName,
    StructuredLLMRequest,
    StructuredLLMResult,
    build_json_contract_prompt,
    run_structured_llm_stage,
)
from app.manga_pipeline.orchestrator import MangaPipelineStage, StageProgressCallback, run_pipeline_context, run_pipeline_stages

__all__ = [
    "BookUnderstandingContext",
    "BookUnderstandingResult",
    "BookUnderstandingStage",
    "LLMOutputValidationError",
    "LLMStageName",
    "MangaPipelineStage",
    "StageProgressCallback",
    "PipelineContext",
    "PipelineResult",
    "StructuredLLMRequest",
    "StructuredLLMResult",
    "build_json_contract_prompt",
    "run_book_understanding_pipeline",
    "run_pipeline_context",
    "run_pipeline_stages",
    "run_structured_llm_stage",
]
