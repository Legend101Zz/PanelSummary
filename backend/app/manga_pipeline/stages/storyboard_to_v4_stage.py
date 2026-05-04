"""Storyboard to V4 pipeline stage."""

from __future__ import annotations

from app.manga_pipeline.context import PipelineContext
from app.rendering.v4 import storyboard_page_to_v4


async def run(context: PipelineContext) -> PipelineContext:
    if not context.storyboard_pages:
        raise ValueError("storyboard_to_v4 needs context.storyboard_pages")

    chapter_index = int(context.options.get("chapter_index", 0))
    context.v4_pages = [
        storyboard_page_to_v4(page, chapter_index=chapter_index).to_dict()
        for page in context.storyboard_pages
    ]
    return context
