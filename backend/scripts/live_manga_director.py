"""One bounded live Manga Director goal against the sealed agent worker.

Session 3 / blueprint Phase 2 exit. Run with the worker + backend up and
AGENT_WORKER_TOKEN / AGENT_WORKER_URL exported (see NEXT_SESSION):

    uv run python scripts/live_manga_director.py <scope_id> [project_id]

Writes only additive v2-collection rows (context_pack artifact, candidate +
accepted manga_plan artifacts, one generation run + stage run). Prints the
model receipt so the run is auditable. Nothing is deleted or overwritten.
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
from app.services.manga_director import MangaDirectorService

DEFAULT_PROJECT_ID = "6a0b5a5b201a8d03f1d82503"


async def main() -> int:
    scope_id = sys.argv[1]
    project_id = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_PROJECT_ID
    worker_url = os.environ.get("AGENT_WORKER_URL", "http://127.0.0.1:8788")
    worker_token = os.environ["AGENT_WORKER_TOKEN"]

    await _db.connect()
    settings = get_settings()
    client = await init_wired_documents(settings.mongodb_url, settings.db_name)
    try:
        repositories = V1BridgedRepositories()
        service = MangaDirectorService(
            repositories,
            HttpAgentWorkerClient(
                base_url=worker_url, token=worker_token, timeout_seconds=900
            ),
        )
        outcome = await service.run_direction_goal(
            project_id=project_id, scope_id=scope_id
        )
        artifact = outcome.artifact
        plan = artifact.content
        print("=== ACCEPTED MANGA PLAN ===")
        print("artifact_id     :", artifact.artifact_id)
        print("reused          :", outcome.reused)
        print("run_id          :", outcome.run_id)
        print("stage_run_id    :", outcome.stage_run_id)
        print("context_pack_id :", outcome.context_pack_id)
        print("title           :", plan["title"])
        print("target_pages    :", plan["target_page_count"])
        print("beats           :", len(plan["beats"]))
        print("cited units     :", sorted({
            ref["source_unit_id"]
            for beat in plan["beats"]
            for ref in beat["source_refs"]
        }))
        print("cited facts     :", sorted({
            fact_id for beat in plan["beats"] for fact_id in beat["required_fact_ids"]
        }))
        print("=== MODEL RECEIPT ===")
        print(json.dumps(artifact.model_receipt, indent=1))
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
