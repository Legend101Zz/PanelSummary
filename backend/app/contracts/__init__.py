"""Canonical Pydantic v2 contracts exported by ScrollStack."""

from .artifacts import Artifact, ArtifactRef, AssetRef, AssetRequest, ModelReceipt
from .context import AgentGoal, ContextPack, MemoryDelta
from .manga import AdaptationBeat, MangaManifest, RenderedPage
from .reel import ReelSpec
from .reel_delivery import (
    CaptionCue,
    ReelPlayerPayload,
    ReelSeries,
    ReelSummary,
    ResolvedReelAsset,
    SeriesProgress,
    SeriesProgressUpdate,
)
from .runs import GenerationRun, StageRun
from .source import ScopeManifest, SourceRef, SourceUnit

__all__ = [
    "AdaptationBeat",
    "AgentGoal",
    "Artifact",
    "ArtifactRef",
    "AssetRef",
    "AssetRequest",
    "ContextPack",
    "GenerationRun",
    "MangaManifest",
    "MemoryDelta",
    "ModelReceipt",
    "ReelSpec",
    "CaptionCue",
    "ReelPlayerPayload",
    "ReelSeries",
    "ReelSummary",
    "ResolvedReelAsset",
    "RenderedPage",
    "ScopeManifest",
    "SourceRef",
    "SourceUnit",
    "SeriesProgress",
    "SeriesProgressUpdate",
    "StageRun",
]
