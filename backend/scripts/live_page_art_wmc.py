"""Session 5 live run: lane-C page-art on the Session 4 accepted WMC pages.

Runs the durable page-art stage against the highspeed bake-off arm's run
(`run_dir_a99464c…`, accepted thumbnail_set + compiled layouts already in
Mongo from Session 4) with the WMC character reference sheets as
conditioning. Every provider call (image AND vision, success AND failure)
persists a `provider_receipt` artifact and appends to the evidence ledger.

    uv run python scripts/live_page_art_wmc.py --budget 0.20 [--smoke-vision]

--smoke-vision runs exactly ONE M3 vision call on an existing spike image
and exits — the pre-batch cost measurement demanded by the session brief.
"""

import argparse
import asyncio
import json
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.persistence.v1_bridge import V1BridgedRepositories, init_wired_documents
from app.scripts import _db
from app.services.manga_page_art_stage import MangaPageArtStageService
from app.services.manga_vision_qa import build_vision_qa

REPO = Path(__file__).resolve().parents[2]
EVIDENCE = REPO / "docs" / "evidence" / "session5-page-art"
ASSETS = REPO / "storage" / "images" / "manga_assets" / "6a0b5a5b201a8d03f1d82503"
REFERENCE_SHEETS = [
    ASSETS / "haw__reference_sheet__front.png",
    ASSETS / "hem__reference_sheet__front.png",
]
PROJECT_ID = "6a0b5a5b201a8d03f1d82503"


def _bakeoff_run_id() -> str:
    arm = json.loads(
        (REPO / "docs" / "evidence" / "session4-bakeoff" / "arm_hs.json").read_text()
    )
    return arm["goals"][0]["run_id"]


async def smoke_vision() -> int:
    image = REPO / "docs" / "research" / "art-economics" / "out" / "v1_conditioned_a2.png"
    if not image.is_file():
        print(f"smoke image missing: {image}")
        return 1
    vision = build_vision_qa()
    started = time.time()
    result = await vision(
        image_path=image,
        briefs="Panel briefs unavailable for the smoke; describe what you see.",
        expected_panel_count=7,
        system_prompt=(
            "You are a strict manga production QA inspector. Respond with ONLY "
            'a JSON object: {"panel_count": <int>, "panels": [], '
            '"overall_ok": <bool>}'
        ),
    )
    elapsed = time.time() - started
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    record = {
        "purpose": "vision_smoke",
        "model": "MiniMax-M3",
        "image": image.name,
        "parsed": result.get("parsed"),
        "usage": result.get("usage"),
        "cost_usd": result.get("cost_usd"),
        "latency_s": round(elapsed, 1),
    }
    (EVIDENCE / "vision_smoke.json").write_text(json.dumps(record, indent=2))
    print(json.dumps(record, indent=2))
    return 0


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--budget", type=float, required=False, default=0.20)
    parser.add_argument("--smoke-vision", action="store_true")
    args = parser.parse_args()

    await _db.connect()
    settings = get_settings()
    client = await init_wired_documents(settings.mongodb_url, settings.db_name)
    try:
        if args.smoke_vision:
            return await smoke_vision()

        for sheet in REFERENCE_SHEETS:
            if not sheet.is_file():
                print(f"missing reference sheet: {sheet}")
                return 1
        run_id = _bakeoff_run_id()
        repositories = V1BridgedRepositories()
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        service = MangaPageArtStageService(
            repositories,
            media_root=REPO / "storage",
            openrouter_api_key=settings.openrouter_api_key,
            vision_qa=build_vision_qa(),
            character_reference_paths=REFERENCE_SHEETS,
            evidence_dir=EVIDENCE,
        )
        outcome = await service.run_page_art_stage(
            project_id=PROJECT_ID,
            run_id=run_id,
            image_budget_usd=args.budget,
        )
        summary = {
            "run_id": outcome.run_id,
            "stage_run_id": outcome.stage_run_id,
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
                    "gate_summary": {
                        key: value
                        for key, value in page.gate_summary.items()
                        if key != "vision_qa"
                    }
                    | {"vision_qa": page.gate_summary.get("vision_qa")},
                }
                for page in outcome.pages
            ],
        }
        (EVIDENCE / "run_summary.json").write_text(json.dumps(summary, indent=2))
        print(json.dumps(summary, indent=2))

        # Copy the accepted art + composed pages into evidence.
        for page in outcome.pages:
            for artifact_id, label in (
                (page.page_art_artifact_id, "page_art"),
                (page.composed_artifact_id, "composed"),
            ):
                if artifact_id is None:
                    continue
                artifact = await repositories.get_artifact(artifact_id)
                if artifact and artifact.storage_ref:
                    src = REPO / "storage" / artifact.storage_ref.removeprefix("storage://")
                    dst = EVIDENCE / f"wmc_{label}_page_{page.page_index}.png"
                    shutil.copyfile(src, dst)
                    print(f"evidence: {dst.name}")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
