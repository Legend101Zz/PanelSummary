"""Session-4 model bake-off harness (issue #3): one arm per invocation.

    uv run python scripts/bakeoff_session4.py hs    # MiniMax-M2.7-highspeed
    uv run python scripts/bakeoff_session4.py m3    # MiniMax-M3

Each arm runs the SAME goals against identically-populated inputs:
direction -> page-writing (the ``hs`` arm additionally runs the thumbnail
goal, which feeds the Session 4 SVG preview loop). The agent worker must be
running with a matching ``AGENT_MODEL`` — the drivers' exact-receipt gates
refuse a mismatched worker, so an arm can never silently run on the wrong
model.

Isolation: the base scope is Session 3's live scope
(``scope_e440233874519846e51c4e2c``). Each arm freezes its OWN scope over
the same chapter set with a distinct ``selection_label`` — the label is part
of the scope hash, so runs, context packs, and artifacts stay per-arm while
the selected source units stay byte-identical (verified before running).

Writes are purely additive v2-lane rows. Take the DB backup first
(``scripts/backup_db.py``).
"""

import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.api.routes.scopes import _ChapterFilteredUnits
from app.config import get_settings
from app.contracts.source import PageRange
from app.persistence.v1_bridge import V1BridgedRepositories, init_wired_documents
from app.scripts import _db
from app.services.agent_worker import HttpAgentWorkerClient
from app.services.manga_director import MangaDirectorService
from app.services.manga_page_planner import MangaPagePlannerService
from app.services.scopes import ScopeService

BASE_SCOPE_ID = "scope_e440233874519846e51c4e2c"
PROJECT_ID = "6a0b5a5b201a8d03f1d82503"
EVIDENCE_DIR = Path(__file__).resolve().parents[2] / "docs" / "evidence" / "session4-bakeoff"

ARMS = {
    "hs": {
        "model": "MiniMax-M2.7-highspeed",
        "scope_label": "bakeoff-2026-08-08 highspeed arm",
        "run_thumbnail": True,
    },
    "m3": {
        "model": "MiniMax-M3",
        "scope_label": "bakeoff-2026-08-08 m3 arm",
        "run_thumbnail": False,
    },
}


def _receipt_row(kind: str, outcome) -> dict:
    artifact = outcome.artifact
    return {
        "goal": kind,
        "reused": outcome.reused,
        "run_id": outcome.run_id,
        "stage_run_id": outcome.stage_run_id,
        "context_pack_id": outcome.context_pack_id,
        "artifact_id": artifact.artifact_id,
        "content_hash": artifact.content_hash,
        "model_receipt": artifact.model_receipt,
    }


async def _arm_scope(repositories, arm: dict) -> str:
    base = await repositories.get_scope(BASE_SCOPE_ID)
    if base is None:
        raise SystemExit(f"base scope {BASE_SCOPE_ID} not found")
    units = await repositories.list_source_units(base.book_id)
    by_id = {unit.source_unit_id: unit for unit in units}
    chapter_indexes = {by_id[uid].chapter_index for uid in base.source_unit_ids}
    filtered = _ChapterFilteredUnits(repositories, chapter_indexes)
    service = ScopeService(filtered, repositories, memory=repositories)
    page_ranges = [
        item if isinstance(item, PageRange) else PageRange.model_validate(item)
        for item in base.page_ranges
    ]
    scope = await service.create(
        project_id=base.project_id,
        book_id=base.book_id,
        page_ranges=page_ranges,
        selection_label=arm["scope_label"],
        created_by="session4-bakeoff",
    )
    if sorted(scope.source_unit_ids) != sorted(base.source_unit_ids):
        raise SystemExit(
            "arm scope selected different units than the base scope — refusing"
        )
    print(f"arm scope: {scope.scope_id} (units identical to {BASE_SCOPE_ID})")
    return scope.scope_id


async def main() -> int:
    arm_name = sys.argv[1]
    arm = ARMS[arm_name]
    worker_url = os.environ.get("AGENT_WORKER_URL", "http://127.0.0.1:8788")
    worker_token = os.environ["AGENT_WORKER_TOKEN"]

    await _db.connect()
    settings = get_settings()
    client = await init_wired_documents(settings.mongodb_url, settings.db_name)
    try:
        repositories = V1BridgedRepositories()
        worker = HttpAgentWorkerClient(
            base_url=worker_url, token=worker_token, timeout_seconds=900
        )
        scope_id = await _arm_scope(repositories, arm)

        director = MangaDirectorService(
            repositories, worker, required_model=arm["model"]
        )
        planner = MangaPagePlannerService(
            repositories, worker, required_model=arm["model"]
        )

        rows = []
        direction = await director.run_direction_goal(
            project_id=PROJECT_ID, scope_id=scope_id
        )
        rows.append(_receipt_row("manga_direction", direction))
        print(f"direction done: {direction.artifact.artifact_id} reused={direction.reused}")

        script = await planner.run_page_writing_goal(
            project_id=PROJECT_ID, run_id=direction.run_id
        )
        rows.append(_receipt_row("manga_page_writing", script))
        print(f"page-writing done: {script.artifact.artifact_id} reused={script.reused}")

        if arm["run_thumbnail"]:
            thumbnail = await planner.run_thumbnail_goal(
                project_id=PROJECT_ID, run_id=direction.run_id
            )
            rows.append(_receipt_row("manga_thumbnail", thumbnail))
            print(
                f"thumbnail done: {thumbnail.artifact.artifact_id} "
                f"reused={thumbnail.reused}"
            )

        EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
        out = EVIDENCE_DIR / f"arm_{arm_name}.json"
        out.write_text(
            json.dumps(
                {
                    "arm": arm_name,
                    "model": arm["model"],
                    "scope_id": scope_id,
                    "base_scope_id": BASE_SCOPE_ID,
                    "goals": rows,
                },
                indent=2,
                default=str,
            )
        )
        print(f"receipts -> {out}")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
