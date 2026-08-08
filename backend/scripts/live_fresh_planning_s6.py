"""Session 6 step 0.2: FRESH accepted WMC planning set on the speed lane.

Extends the Session 4 highspeed-arm run (`run_dir_a99464c…`): the accepted
direction plan is REUSED (its stage already succeeded — lineage allows),
while page-writing re-runs under prompt v3 + skill 1.4.0 (real story-beat
sentences + authored text elements, content gate live) and the thumbnail
goal re-runs against the fresh script under the live craft gate (RTL
blocks). The Session 4 accepted set stays untouched in Mongo — the fresh
stages land beside it and the latest-succeeded selectors pick them up.

    uv run python scripts/live_fresh_planning_s6.py

Requires: backend uvicorn on :8000 (broker), agent worker on :8788 bound
to MiniMax-M2.7-highspeed, AGENT_WORKER_TOKEN in the environment.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.persistence.v1_bridge import V1BridgedRepositories, init_wired_documents
from app.scripts import _db
from app.services.agent_worker import HttpAgentWorkerClient
from app.services.manga_page_planner import MangaPagePlannerService

REPO = Path(__file__).resolve().parents[2]
EVIDENCE = REPO / "docs" / "evidence" / "session6-fresh-planning"
PROJECT_ID = "6a0b5a5b201a8d03f1d82503"


def _bakeoff_run_id() -> str:
    arm = json.loads(
        (REPO / "docs" / "evidence" / "session4-bakeoff" / "arm_hs.json").read_text()
    )
    return arm["goals"][0]["run_id"]


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
        "validation_report": artifact.validation_report,
    }


async def main() -> int:
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
        run_id = _bakeoff_run_id()
        # Default: the ModelPolicy per-purpose defaults route both planning
        # purposes to the speed lane (receipts prove it). S6_REQUIRED_MODEL
        # is the EXPLICIT, receipted A/B hatch (owner policy: overrides are
        # never silent) — used after four speed-lane page-writing attempts
        # each failed on a distinct contract-detail class with an
        # identical-resubmit give-up pattern.
        required_model = os.environ.get("S6_REQUIRED_MODEL")
        planner = MangaPagePlannerService(
            repositories, worker, required_model=required_model
        )

        rows = []
        script = await planner.run_page_writing_goal(
            project_id=PROJECT_ID, run_id=run_id
        )
        rows.append(_receipt_row("manga_page_writing", script))
        print(
            f"page-writing done: {script.artifact.artifact_id} "
            f"reused={script.reused}"
        )
        pages = (script.artifact.content or {}).get("pages", [])
        for page in pages:
            beats = [panel["story_beat"] for panel in page["panels"]]
            texts = [
                (t["kind"], t.get("speaker_ref"), t["content"])
                for t in page.get("text_elements", [])
            ]
            print(f"  page {page['page_index']}: beats={beats}")
            print(f"  page {page['page_index']}: text_elements={texts}")

        if os.environ.get("S6_SKIP_THUMBNAIL") == "1":
            print("skipping thumbnail goal (S6_SKIP_THUMBNAIL=1)")
        else:
            thumbnail = await planner.run_thumbnail_goal(
                project_id=PROJECT_ID, run_id=run_id
            )
            rows.append(_receipt_row("manga_thumbnail", thumbnail))
            print(
                f"thumbnail done: {thumbnail.artifact.artifact_id} "
                f"reused={thumbnail.reused}"
            )

        EVIDENCE.mkdir(parents=True, exist_ok=True)
        out = EVIDENCE / "fresh_planning_receipts.json"
        out.write_text(json.dumps({"run_id": run_id, "goals": rows}, indent=2, default=str))
        print(f"receipts -> {out}")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
