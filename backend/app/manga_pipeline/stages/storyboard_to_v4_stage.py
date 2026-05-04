"""Storyboard to V4 pipeline stage.

Bridges the authored ``StoryboardPage`` rows into the
renderer-friendly ``V4Page`` shape. When ``slice_composition`` is
present (Phase C1), each storyboard page is composed against its
matching ``PageComposition`` so the renderer receives a proper gutter
grid and a page-turn anchor instead of a coarse layout token.
"""

from __future__ import annotations

from app.domain.manga import PageComposition
from app.manga_pipeline.context import PipelineContext
from app.rendering.v4 import storyboard_page_to_v4


async def run(context: PipelineContext) -> PipelineContext:
    if not context.storyboard_pages:
        raise ValueError("storyboard_to_v4 needs context.storyboard_pages")

    chapter_index = int(context.options.get("chapter_index", 0))

    # When the composition stage produced a row, look each page up by
    # index. Missing entries fall back to None which the mapper treats
    # as "use the legacy panel-count layout" \u2014 same behaviour as before
    # the composition stage existed.
    composition_lookup: dict[int, PageComposition] = {}
    if context.slice_composition is not None:
        for comp in context.slice_composition.pages:
            if not comp.is_default:
                composition_lookup[comp.page_index] = comp

    context.v4_pages = [
        storyboard_page_to_v4(
            page,
            chapter_index=chapter_index,
            composition=composition_lookup.get(page.page_index),
        ).to_dict()
        for page in context.storyboard_pages
    ]
    return context
