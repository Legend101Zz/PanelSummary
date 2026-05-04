"""Phase 4.2 stage \u2014 assemble RenderedPage from storyboard + composition.

Sits between ``page_composition_stage`` (and the legacy
``storyboard_to_v4_stage``) and ``panel_rendering_stage``. Pure
projection: no LLM calls, no I/O, no filesystem. Reads the storyboard
pages and the optional slice composition; writes ``context.rendered_pages``
with one ``RenderedPage`` per storyboard page, every page pre-seeded
with empty ``PanelRenderArtifact`` slots.

Why a dedicated stage instead of inlining this into the renderer
--------------------------------------------------------------
The renderer wants a structured surface to mutate; QA wants the same
surface to read; persistence wants the same surface to dump. Authoring
that surface ONCE, in a stage with a single responsibility, means
nothing downstream has to reconstruct it. It is also where future
"split this storyboard page into two render pages" or "drop a panel"
edits would land \u2014 a clean editorial seam between the storyboard's
narrative shape and the renderer's mechanical contract.
"""

from __future__ import annotations

from app.domain.manga import PageComposition, empty_rendered_page
from app.manga_pipeline.context import PipelineContext


async def run(context: PipelineContext) -> PipelineContext:
    """Zip storyboard_pages + slice_composition into context.rendered_pages."""
    if not context.storyboard_pages:
        raise ValueError("rendered_page_assembly needs context.storyboard_pages")

    # Compositions are matched on page_index, not list position, because
    # the composition stage is allowed to omit pages it could not
    # compose. Missing entries fall back to None which the renderer
    # treats as "use the storyboard's authored panel order".
    composition_lookup: dict[int, PageComposition] = {}
    if context.slice_composition is not None:
        for comp in context.slice_composition.pages:
            if not comp.is_default:
                composition_lookup[comp.page_index] = comp

    context.rendered_pages = [
        empty_rendered_page(
            storyboard_page=page,
            composition=composition_lookup.get(page.page_index),
        )
        for page in context.storyboard_pages
    ]
    return context
