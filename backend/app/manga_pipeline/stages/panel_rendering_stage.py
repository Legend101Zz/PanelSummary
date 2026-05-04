"""Phase 4 stage \u2014 multimodal panel art rendering.

Phase 4.2 rewrite: the stage now consumes ``context.rendered_pages``
(typed RenderedPage / PanelRenderArtifact) directly. The image_path
and reference assets land on each panel's typed
``PanelRenderArtifact``; the legacy ``context.v4_pages`` dict list is
kept in sync via a tail shadow loop so persistence and the V4 frontend
keep working until the wire flip in Phase 4.5 deletes both. The
shadow has a defined deletion point in the next phase \u2014 it is a
migration bridge, not a permanent abstraction.

The orchestrator only includes this stage when image generation is
enabled AND an API key is configured. There is no in-stage fallback:
by the time this stage runs, image rendering is the contract.
"""

from __future__ import annotations

import logging

from app.manga_pipeline.context import PipelineContext

logger = logging.getLogger(__name__)


def _sync_v4_shadow(context: PipelineContext) -> None:
    """Copy artifact metadata back onto context.v4_pages by panel_id.

    Phase 4.5 deletes both this function and ``context.v4_pages``.
    Until then, persistence (MangaPageDoc.v4_page) and the V4 frontend
    expect the rendered image_path on the V4 dict, so we mirror it.
    Match is on ``panel_id`` because the V4 mapper preserves storyboard
    panel ids verbatim \u2014 there is no separate identifier space.
    """
    if not context.v4_pages:
        return
    artifact_by_panel_id = {
        panel_id: artifact
        for rendered_page in context.rendered_pages
        for panel_id, artifact in rendered_page.panel_artifacts.items()
    }
    for v4_page in context.v4_pages:
        for v4_panel in v4_page.get("panels", []) or []:
            artifact = artifact_by_panel_id.get(v4_panel.get("panel_id"))
            if artifact is None or not artifact.is_rendered:
                continue
            v4_panel["image_path"] = artifact.image_path
            v4_panel["image_aspect_ratio"] = artifact.image_aspect_ratio


async def run(context: PipelineContext) -> PipelineContext:
    """Render every panel in ``context.rendered_pages`` in place."""
    if context.character_bible is None:
        raise ValueError("panel rendering requires context.character_bible")
    if not context.rendered_pages:
        raise ValueError(
            "panel rendering requires context.rendered_pages "
            "(rendered_page_assembly_stage must run first)"
        )

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
    from app.services.manga.storyboard_panel_renderer import render_rendered_pages

    library_assets = await list_project_assets(context.project_id)

    summary = await render_rendered_pages(
        rendered_pages=context.rendered_pages,
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
        # Total failure is hard error \u2014 every panel failing means the model
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

    # Mirror artifact metadata onto the legacy v4_pages dict list so
    # persistence + frontend keep rendering during the Phase 4.5
    # migration window. Deleted in 4.5 alongside context.v4_pages.
    _sync_v4_shadow(context)

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
