"""Phase 4 stage — multimodal panel art rendering.

Runs after ``storyboard_to_v4_stage``. Reads ``context.v4_pages`` (the V4 dicts
produced by the storyboard mapper) and asks the panel-rendering service to
populate ``image_path`` on each panel using multimodal image generation
conditioned on the project's character library.

The orchestrator only includes this stage when image generation is enabled
AND an API key is configured. There is **no in-stage fallback**: by the time
this stage runs, image rendering is the contract.
"""

from __future__ import annotations

import logging

from app.manga_pipeline.context import PipelineContext

logger = logging.getLogger(__name__)


async def run(context: PipelineContext) -> PipelineContext:
    """Render every panel in ``context.v4_pages`` in place."""
    if context.character_bible is None:
        raise ValueError("panel rendering requires context.character_bible")
    if not context.v4_pages:
        raise ValueError("panel rendering requires context.v4_pages")

    image_api_key = context.options.get("image_api_key")
    if not image_api_key:
        raise ValueError(
            "panel rendering stage was scheduled without an image_api_key; "
            "the orchestrator must omit this stage when generation is disabled"
        )
    image_model = context.options.get("image_model")
    style = str(context.options.get("style", "shonen-ink"))

    # Lazy imports: keeps the stage importable in tests that don't have the
    # service-layer transitively available.
    from app.services.manga.character_library_service import list_project_assets
    from app.services.manga.panel_rendering_service import render_pages

    library_assets = await list_project_assets(context.project_id)

    summary = await render_pages(
        pages=context.v4_pages,
        project_id=context.project_id,
        slice_id=context.source_slice.slice_id,
        bible=context.character_bible,
        art_direction=context.art_direction,
        library_assets=library_assets,
        image_api_key=str(image_api_key),
        image_model=str(image_model) if image_model else None,
        style=style,
    )

    if summary.failed and not summary.rendered:
        # Total failure is hard error — every panel failing means the model
        # config is wrong; surface it rather than persist text-only pages.
        first_error = next((res.error for res in summary.results if res.error), "unknown")
        raise RuntimeError(
            f"all {summary.failed} panel renders failed; first error: {first_error}"
        )

    if summary.failed:
        logger.warning(
            "panel rendering: %s/%s panels failed for slice %s",
            summary.failed,
            summary.total,
            context.source_slice.slice_id,
        )

    # Stash the per-panel summary so the persistence layer can include it
    # in the slice doc's metadata for debugging without making it part of
    # the typed PipelineResult.
    context.options["panel_rendering_summary"] = {
        "rendered": summary.rendered,
        "failed": summary.failed,
        # Phase 3.3: surface the sprite-bank hit-rate so the QA panel and
        # frontend can render "7/9 character slots resolved" without
        # re-deriving it from the per-panel results list.
        "character_slots_requested": summary.character_slots_requested,
        "character_slots_resolved": summary.character_slots_resolved,
        "sprite_bank_hit_rate": summary.sprite_bank_hit_rate,
        "results": [
            {
                "panel_id": result.panel_id,
                "page_index": result.page_index,
                "image_path": result.image_path,
                "aspect_ratio": result.aspect_ratio,
                "error": result.error,
                "used_reference_assets": result.used_reference_assets,
                "requested_character_count": result.requested_character_count,
            }
            for result in summary.results
        ],
    }
    return context
