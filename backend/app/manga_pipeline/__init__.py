"""Revamp manga generation pipeline.

This package is intentionally separate from the legacy orchestrator. The legacy
path remains the rollback doghouse; this path is the new good boy.
"""

from app.manga_pipeline.context import PipelineContext, PipelineResult
from app.manga_pipeline.orchestrator import MangaPipelineStage, run_pipeline_stages

__all__ = [
    "MangaPipelineStage",
    "PipelineContext",
    "PipelineResult",
    "run_pipeline_stages",
]
