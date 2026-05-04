"""Manga application services."""

from app.services.manga.asset_image_service import (
    build_asset_prompt,
    build_asset_relative_path,
    generate_asset_image_doc,
    persist_asset_prompt_doc,
)
from app.services.manga.generation_service import (
    build_generation_options,
    build_source_text_for_slice,
    build_v2_generation_stages,
    generate_project_slice,
    load_fact_registry,
    serialize_llm_trace,
)
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
    "build_asset_prompt",
    "build_asset_relative_path",
    "build_empty_continuity",
    "build_generation_options",
    "build_project_seed",
    "build_page_source_slice",
    "build_source_text_for_slice",
    "build_v2_generation_stages",
    "choose_next_page_slice",
    "generate_asset_image_doc",
    "generate_project_slice",
    "get_or_create_project",
    "load_fact_registry",
    "load_project_ledger",
    "collect_storyboard_fact_ids",
    "persist_asset_prompt_doc",
    "run_quality_gate",
    "make_project_doc",
    "serialize_llm_trace",
    "serialize_project",
]
