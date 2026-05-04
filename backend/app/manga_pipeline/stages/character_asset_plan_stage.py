"""Reusable character asset planning for manga v2.

Phase 3 simplification: the per-slice character asset plan is ALWAYS
deterministic. The LLM path that used to live here was strictly worse:

* It cost money on every slice for a job the bible already specifies fully.
* It produced subtly different prompts each call, breaking visual continuity.
* It "trusted" the LLM to remember the visual lock, instead of mechanically
  enforcing it.

The deterministic planner takes the locked ``CharacterWorldBible`` and emits
the same plan every time. Visual-lock prose is injected mechanically into
every prompt by ``character_sheet_planner._bible_visual_lock_block``.

This stage is now a thin shim over the planner so the pipeline order is
preserved and the existing context plumbing keeps working.
"""

from __future__ import annotations

from app.manga_pipeline.context import PipelineContext


async def run(context: PipelineContext) -> PipelineContext:
    """Populate ``context.asset_specs`` from the deterministic planner."""
    if context.character_bible is None:
        raise ValueError(
            "character asset planning requires context.character_bible; "
            "run the book-understanding pipeline (or the per-slice "
            "character_world_bible_stage for legacy projects) first"
        )
    # Lazy import: keeps the pipeline package free of service-layer imports
    # at module load time so test discovery stays fast.
    from app.services.manga.character_sheet_planner import plan_book_character_sheets

    plan = plan_book_character_sheets(
        bible=context.character_bible,
        project_id=context.project_id,
    )
    context.asset_specs = list(plan.assets)
    return context
