"""Reusable character asset planning for manga v2.

Phase 3: per-slice asset planning is a thin shim over the book-level planner.
The LLM call that authors creative art direction happens ONCE per project at
book-understanding time (``stages/book/character_art_direction_stage.py``).
This stage just composes the planner's output into ``context.asset_specs`` so
the renderer downstream sees a uniform list.

Why this stage still exists despite being thin:

* It keeps a clean seam between book-level state (bible, art direction) and
  per-slice state (the spec list the renderer consumes), so a future change
  to which characters appear in which slice doesn't reach back into the
  bible.
* It lets the per-slice pipeline document fail loudly when the bible isn't
  hydrated (a misconfiguration), rather than crashing deep in the renderer.
"""

from __future__ import annotations

from app.manga_pipeline.context import PipelineContext


async def run(context: PipelineContext) -> PipelineContext:
    """Populate ``context.asset_specs`` from the book-level planner."""
    if context.character_bible is None:
        raise ValueError(
            "character asset planning requires context.character_bible; "
            "run the book-understanding pipeline first"
        )
    # Lazy import: keeps the pipeline package free of service-layer imports
    # at module load time so test discovery stays fast.
    from app.services.manga.character_sheet_planner import plan_book_character_sheets

    plan = plan_book_character_sheets(
        bible=context.character_bible,
        project_id=context.project_id,
        art_direction=context.art_direction,
    )
    context.asset_specs = list(plan.assets)
    return context
