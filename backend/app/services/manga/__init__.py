"""Manga application services."""

from app.services.manga.arc_slice_planning_service import (
    ArcSlicePlan,
    choose_next_arc_slice,
    remaining_arc_entries,
    slice_progress_summary,
)
from app.services.manga.asset_image_service import (
    build_asset_prompt,
    build_asset_relative_path,
    generate_asset_image_doc,
    persist_asset_prompt_doc,
)
from app.services.manga.book_understanding_service import (
    book_chapters_to_canonical,
    build_book_understanding_stages,
    generate_book_understanding,
    load_understanding_result,
    project_understanding_is_ready,
    serialize_llm_trace as serialize_book_understanding_trace,
)
from app.services.manga.character_library_service import (
    asset_specs_for_project,
    ensure_book_character_sheets,
    existing_asset_id_set,
    list_project_assets,
    specs_missing_from_library,
)
from app.services.manga.character_sheet_planner import (
    CharacterSheetPlanOptions,
    plan_book_character_sheets,
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
    "ArcSlicePlan",
    "CharacterSheetPlanOptions",
    "asset_specs_for_project",
    "book_chapters_to_canonical",
    "build_asset_prompt",
    "build_asset_relative_path",
    "build_book_understanding_stages",
    "build_empty_continuity",
    "build_generation_options",
    "build_project_seed",
    "build_page_source_slice",
    "build_source_text_for_slice",
    "build_v2_generation_stages",
    "choose_next_arc_slice",
    "choose_next_page_slice",
    "ensure_book_character_sheets",
    "existing_asset_id_set",
    "generate_asset_image_doc",
    "generate_book_understanding",
    "generate_project_slice",
    "get_or_create_project",
    "load_fact_registry",
    "load_project_ledger",
    "load_understanding_result",
    "list_project_assets",
    "plan_book_character_sheets",
    "project_understanding_is_ready",
    "remaining_arc_entries",
    "collect_storyboard_fact_ids",
    "persist_asset_prompt_doc",
    "run_quality_gate",
    "make_project_doc",
    "serialize_book_understanding_trace",
    "serialize_llm_trace",
    "slice_progress_summary",
    "specs_missing_from_library",
    "serialize_project",
]
