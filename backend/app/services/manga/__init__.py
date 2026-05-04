"""Manga application services."""

from app.services.manga.project_service import (
    build_empty_continuity,
    build_project_seed,
    get_or_create_project,
    load_project_ledger,
    make_project_doc,
    serialize_project,
)
from app.services.manga.quality_service import collect_storyboard_fact_ids, run_quality_gate
from app.services.manga.source_slice_service import (
    build_page_source_slice,
    choose_next_page_slice,
)

__all__ = [
    "build_empty_continuity",
    "build_project_seed",
    "build_page_source_slice",
    "choose_next_page_slice",
    "get_or_create_project",
    "load_project_ledger",
    "collect_storyboard_fact_ids",
    "run_quality_gate",
    "make_project_doc",
    "serialize_project",
]
