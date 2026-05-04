from app.manga_pipeline.stages.book import (
    arc_outline_stage,
    bible_silhouette_uniqueness_stage,
    book_fact_registry_stage,
    character_art_direction_stage,
    global_adaptation_plan_stage,
    global_character_world_bible_stage,
    whole_book_synopsis_stage,
)

__all__ = [
    "arc_outline_stage",
    "bible_silhouette_uniqueness_stage",
    "book_fact_registry_stage",
    "character_art_direction_stage",
    "global_adaptation_plan_stage",
    "global_character_world_bible_stage",
    "whole_book_synopsis_stage",
]
"""Book-level (run-once-per-project) manga pipeline stages.

These stages produce stable artifacts that every per-slice generation reads
from. They run before any slice is generated and do not mutate per-slice
state in the pipeline context. Keep them small and read-only with respect
to slice fields.
"""
