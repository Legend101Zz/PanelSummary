"""Manga adaptation domain foundation."""

from app.domain.manga.continuity import (
    build_continuation_prompt_context,
    should_add_to_be_continued,
    update_ledger_after_slice,
)
from app.domain.manga.facts import merge_fact_registry, normalize_fact_text
from app.domain.manga.types import (
    CharacterContinuityState,
    ContinuityLedger,
    CurrentStoryState,
    FactImportance,
    MangaAssetSpec,
    MangaGenerationOptions,
    MangaPageArtifact,
    MangaPipelineVersion,
    MangaProjectSnapshot,
    MangaSliceSnapshot,
    SliceRole,
    SourceFact,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
    StoryThread,
)

__all__ = [
    "CharacterContinuityState",
    "ContinuityLedger",
    "CurrentStoryState",
    "FactImportance",
    "MangaAssetSpec",
    "MangaGenerationOptions",
    "MangaPageArtifact",
    "MangaPipelineVersion",
    "MangaProjectSnapshot",
    "MangaSliceSnapshot",
    "SliceRole",
    "SourceFact",
    "SourceRange",
    "SourceSlice",
    "SourceSliceMode",
    "StoryThread",
    "build_continuation_prompt_context",
    "should_add_to_be_continued",
    "update_ledger_after_slice",
    "merge_fact_registry",
    "normalize_fact_text",
]
