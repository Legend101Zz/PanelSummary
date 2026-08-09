"""Session 7: lane-C regeneration from the FIRST fully-authored planning set.

Runs the paid page-art stage against the S7 fresh thumbnail set with the
EXPLICIT thumbnail lineage (the run carries the S4 set beside it — the
implicit path must never pick silently), then the deterministic compose
pass letters the real dialogue/narration. Gates v3 stay as calibrated by
scripts/smoke_gates_v3_s7.py (no empty-balloon false positive on the S5
accepted art).

    uv run python scripts/live_page_art_wmc_s7.py --budget 0.20

Budget is stated by the caller BEFORE running (2 pages x $0.039 + retry
margin); every image/vision call persists a provider_receipt.
"""

import argparse
import asyncio
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.persistence.v1_bridge import V1BridgedRepositories, init_wired_documents
from app.scripts import _db
from app.services.manga_page_art_stage import MangaPageArtStageService
from app.services.manga_vision_qa import build_vision_qa

REPO = Path(__file__).resolve().parents[2]
EVIDENCE = REPO / "docs" / "evidence" / "session7-page-art"
STORAGE = REPO / "storage"
ASSETS = STORAGE / "images" / "manga_assets" / "6a0b5a5b201a8d03f1d82503"
REFERENCE_SHEETS = [
    ASSETS / "haw__reference_sheet__front.png",
    ASSETS / "hem__reference_sheet__front.png",
]
PROJECT_ID = "6a0b5a5b201a8d03f1d82503"
#: The S7 fresh set (M3 page-writing v5 + speed thumbnail v5) — explicit
#: lineage, never the implicit latest-stage pick.
THUMBNAIL_ARTIFACT_ID = "accepted_thumbnail_set_8f57b8f9a2bbd3fe849f7b19"


def _bakeoff_run_id() -> str:
    arm = json.loads(
        (REPO / "docs" / "evidence" / "session4-bakeoff" / "arm_hs.json").read_text()
    )
    return arm["goals"][0]["run_id"]


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--budget", type=float, default=0.20)
    args = parser.parse_args()

    await _db.connect()
    settings = get_settings()
    client = await init_wired_documents(settings.mongodb_url, settings.db_name)
    try:
        for sheet in REFERENCE_SHEETS:
            if not sheet.is_file():
                print(f"missing reference sheet: {sheet}")
                return 1
        run_id = _bakeoff_run_id()
        repositories = V1BridgedRepositories()
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        service = MangaPageArtStageService(
            repositories,
            media_root=STORAGE,
            openrouter_api_key=settings.openrouter_api_key,
            vision_qa=build_vision_qa(),
            character_reference_paths=REFERENCE_SHEETS,
            evidence_dir=EVIDENCE,
        )
        outcome = await service.run_page_art_stage(
            project_id=PROJECT_ID,
            run_id=run_id,
            image_budget_usd=args.budget,
            thumbnail_artifact_id=THUMBNAIL_ARTIFACT_ID,
        )
        summary = {
            "run_id": outcome.run_id,
            "stage_run_id": outcome.stage_run_id,
            "thumbnail_artifact_id": THUMBNAIL_ARTIFACT_ID,
            "reused": outcome.reused,
            "total_image_cost_usd": outcome.total_image_cost_usd,
            "total_vision_cost_usd": outcome.total_vision_cost_usd,
            "pages": [
                {
                    "page_index": page.page_index,
                    "mode": page.mode,
                    "status": page.status,
                    "attempts": page.attempts,
                    "image_cost_usd": page.image_cost_usd,
                    "page_art_artifact_id": page.page_art_artifact_id,
                    "composed_artifact_id": page.composed_artifact_id,
                    "receipt_artifact_ids": page.receipt_artifact_ids,
                    "qa_report_artifact_ids": page.qa_report_artifact_ids,
                    "gate_summary": page.gate_summary,
                }
                for page in outcome.pages
            ],
        }
        (EVIDENCE / "run_summary.json").write_text(json.dumps(summary, indent=2))
        print(json.dumps({**summary, "pages": [
            {k: v for k, v in p.items() if k != "gate_summary"}
            for p in summary["pages"]
        ]}, indent=2))

        for page in outcome.pages:
            for artifact_id, label in (
                (page.page_art_artifact_id, "page_art"),
                (page.composed_artifact_id, "composed"),
            ):
                if artifact_id is None:
                    continue
                artifact = await repositories.get_artifact(artifact_id)
                if artifact is None or not artifact.storage_ref:
                    continue
                source = STORAGE / artifact.storage_ref.removeprefix("storage://")
                if source.is_file():
                    shutil.copy2(
                        source,
                        EVIDENCE / f"{label}_page{page.page_index}{source.suffix}",
                    )
        print(f"evidence -> {EVIDENCE}")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
