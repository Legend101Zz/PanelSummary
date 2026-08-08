"""Session-4 SVG preview loop: reconstruct accepted WMC thumbnail previews.

Reads the highspeed bake-off arm's receipts, finds its accepted
``thumbnail_set`` artifact, reconstructs the deterministic SVG name previews
from Mongo + storage alone (``MangaPagePlanningService.reconstruct_previews``
— the ADR-009 resume path), runs the Session 4 craft validators over each
compiled page, and writes the SVGs into the evidence folder. No provider or
image-model calls anywhere.

    uv run python scripts/preview_bakeoff_thumbnails.py
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.contracts.manga import MangaPagePlan, ThumbnailSet
from app.persistence.v1_bridge import V1BridgedRepositories, init_wired_documents
from app.scripts import _db
from app.services.manga_craft_validation import validate_page_craft
from app.services.manga_layout import compile_page_layout
from app.services.manga_page_planning import MangaPagePlanningService

EVIDENCE_DIR = Path(__file__).resolve().parents[2] / "docs" / "evidence" / "session4-bakeoff"
PREVIEW_DIR = Path(__file__).resolve().parents[2] / "docs" / "evidence" / "session4-svg-previews"


async def main() -> int:
    arm = json.loads((EVIDENCE_DIR / "arm_hs.json").read_text())
    thumbnail_row = next(row for row in arm["goals"] if row["goal"] == "manga_thumbnail")
    artifact_id = thumbnail_row["artifact_id"]

    await _db.connect()
    settings = get_settings()
    client = await init_wired_documents(settings.mongodb_url, settings.db_name)
    try:
        repositories = V1BridgedRepositories()
        accepted = await repositories.get_artifact(artifact_id)
        thumbnail_set = ThumbnailSet.model_validate(accepted.content)

        # The broker stored the raw previews under the accepted (broker) set
        # artifact; the accepted-driver artifact shares its content hash.
        stored_sets = [
            item
            for item in await repositories.list_artifacts(arm["goals"][0]["run_id"], accepted_only=False)
            if item.kind == "thumbnail_set" and item.content_hash == accepted.content_hash
        ]
        broker_set = next(item for item in stored_sets if item.artifact_id != artifact_id)
        service = MangaPagePlanningService(repositories, repositories)
        svgs = await service.reconstruct_previews(broker_set.artifact_id)

        PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
        report = []
        for index, (plan, svg) in enumerate(
            zip(thumbnail_set.page_plans, svgs, strict=True)
        ):
            page_plan = MangaPagePlan.model_validate(plan.model_dump(mode="json"))
            compiled = compile_page_layout(page_plan)
            craft = validate_page_craft(page_plan, compiled)
            out = PREVIEW_DIR / f"wmc_page_{index}.svg"
            out.write_text(svg, encoding="utf-8")
            ranked = sorted(compiled.panels, key=lambda item: item.read_rank)
            report.append(
                {
                    "page_index": index,
                    "page_id": page_plan.page_script.page_id,
                    "panel_count": len(compiled.panels),
                    "read_order": [panel.panel_id for panel in ranked],
                    "craft_issues": [
                        {"code": issue.code, "message": issue.message}
                        for issue in craft
                    ],
                    "svg": out.name,
                }
            )
        (PREVIEW_DIR / "report.json").write_text(json.dumps(report, indent=2))
        print(json.dumps(report, indent=2))
        print(f"previews -> {PREVIEW_DIR}")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
