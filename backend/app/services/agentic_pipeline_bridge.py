"""Fallback-guarded shadow wiring of the agentic planning lane into v1.

Blueprint §12.3 / Session 4 (issues #5/#6): when
``Settings.agentic_manga_pipeline_v1`` is ON, a SUCCESSFUL v1 slice
additionally runs the agentic planning stages — Manga Director ->
page-writing -> thumbnail — against the same frozen scope the durable-
context bridge compiled for the slice. The lane is a SHADOW comparison
lane (blueprint §12.3 step 3): it writes only v2-lane rows (runs, stages,
artifacts) through the ported repositories and never touches v1 output.

Fallback guarantees:

- Flag OFF (default): ``generate_project_slice`` never imports this module;
  v1 behavior is byte-identical.
- Flag ON, any failure (worker down, budget bust, validation): the error is
  logged and swallowed — the v1 slice result is returned unchanged. The
  agentic lane can never break a v1 generation.
- The lane needs the frozen scope from the ADR-011 compiled-context bridge,
  so it requires ``use_compiled_context`` — without it the lane records a
  skip instead of guessing a scope.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

from app.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class AgenticPlanningOutcome:
    status: str  # "disabled" | "skipped" | "succeeded" | "failed"
    detail: str | None = None
    run_id: str | None = None
    artifact_ids: tuple[str, ...] = ()


def _default_services():
    """Compose the live driver set from the environment (never at import)."""
    from app.config import get_settings as _settings
    from app.persistence.v1_bridge import V1BridgedRepositories
    from app.services.agent_worker import HttpAgentWorkerClient
    from app.services.manga_director import MangaDirectorService
    from app.services.manga_page_art_stage import MangaPageArtStageService
    from app.services.manga_page_planner import MangaPagePlannerService
    from app.services.manga_vision_qa import build_vision_qa

    repositories = V1BridgedRepositories()
    worker = HttpAgentWorkerClient(
        base_url=os.environ.get("AGENT_WORKER_URL", "http://127.0.0.1:8788"),
        token=os.environ["AGENT_WORKER_TOKEN"],
    )
    page_art = MangaPageArtStageService(
        repositories,
        openrouter_api_key=_settings().openrouter_api_key,
        vision_qa=build_vision_qa(),
    )
    return (
        MangaDirectorService(repositories, worker),
        MangaPagePlannerService(repositories, worker),
        page_art,
    )


async def run_agentic_planning_stages(
    *, project_id: str, scope_id: str, director, planner, page_art=None
) -> AgenticPlanningOutcome:
    """Direction -> page scripts -> thumbnails [-> page art] on one run (loud).

    Session 5: when a page-art service is provided, the lane-C rendering
    stage runs after the accepted thumbnails. Its image budget defaults to
    the run's own ``max_image_cost_usd`` (0.0 for planning runs), so the
    shadow lane spends ZERO image dollars unless a budget was explicitly
    granted; pages then compose DSL-only (issue #7 policy).
    """
    direction = await director.run_direction_goal(
        project_id=project_id, scope_id=scope_id
    )
    script = await planner.run_page_writing_goal(
        project_id=project_id, run_id=direction.run_id
    )
    thumbnail = await planner.run_thumbnail_goal(
        project_id=project_id, run_id=direction.run_id
    )
    artifact_ids = [
        direction.artifact.artifact_id,
        script.artifact.artifact_id,
        thumbnail.artifact.artifact_id,
    ]
    if page_art is not None:
        art_outcome = await page_art.run_page_art_stage(
            project_id=project_id, run_id=direction.run_id
        )
        artifact_ids.extend(
            item.composed_artifact_id
            for item in art_outcome.pages
            if item.composed_artifact_id
        )
    return AgenticPlanningOutcome(
        status="succeeded",
        detail=None,
        run_id=direction.run_id,
        artifact_ids=tuple(artifact_ids),
    )


async def maybe_run_agentic_planning(
    *,
    project_id: str,
    compiled_slice_context,
    director=None,
    planner=None,
    page_art=None,
) -> AgenticPlanningOutcome:
    """The fallback-guarded entry point ``generate_project_slice`` calls."""
    if not get_settings().agentic_manga_pipeline_v1:
        return AgenticPlanningOutcome(status="disabled")
    if compiled_slice_context is None:
        logger.warning(
            "agentic planning lane skipped for project %s: "
            "use_compiled_context is off, so no frozen scope exists",
            project_id,
        )
        return AgenticPlanningOutcome(
            status="skipped",
            detail="requires use_compiled_context (frozen scope)",
        )
    try:
        if director is None or planner is None:
            director, planner, default_page_art = _default_services()
            if page_art is None:
                page_art = default_page_art
        outcome = await run_agentic_planning_stages(
            project_id=project_id,
            scope_id=compiled_slice_context.scope_id,
            director=director,
            planner=planner,
            page_art=page_art,
        )
        logger.info(
            "agentic planning lane succeeded for project %s (run=%s artifacts=%s)",
            project_id,
            outcome.run_id,
            list(outcome.artifact_ids),
        )
        return outcome
    except Exception as error:  # noqa: BLE001 — the shadow lane must never break v1
        logger.warning(
            "agentic planning lane failed for project %s (v1 output unaffected): %s",
            project_id,
            error,
        )
        return AgenticPlanningOutcome(status="failed", detail=str(error))
