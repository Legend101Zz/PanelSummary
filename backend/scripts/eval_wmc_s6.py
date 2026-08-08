"""Session 6 live eval (issue #10): score the S5 accepted WMC lane-C pages.

One command → deterministic structural metrics (REAL Layout-IoU + border
adherence + OCR) on the accepted page_art, M3 judge rubrics on the latest
composed pages AND the raw art, persisted eval_scorecard artifacts +
provider_receipt rows for every judge call, and an evidence dump.

    uv run python scripts/eval_wmc_s6.py [--skip-judges]

Judge budget is stated by the caller before running (see the session
report); every call is receipted including failures.
"""

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.contracts.manga import CompiledPageLayout, MangaPagePlan, MangaPlan, ThumbnailSet
from app.persistence.documents import ArtifactDoc, construct_document, utc_now
from app.persistence.v1_bridge import V1BridgedRepositories, init_wired_documents
from app.scripts import _db
from app.services.hashing import content_hash
from app.services.manga_eval import (
    EVAL_HARNESS_VERSION,
    PageScore,
    build_scorecard,
    judge_page,
    layout_iou,
)
from app.services.manga_page_art import border_adherence, ocr_gate
from app.services.manga_vision_qa import build_vision_qa

from PIL import Image

REPO = Path(__file__).resolve().parents[2]
EVIDENCE = REPO / "docs" / "evidence" / "session6-eval"
STORAGE = REPO / "storage"
PROJECT_ID = "6a0b5a5b201a8d03f1d82503"


def _run_id() -> str:
    arm = json.loads(
        (REPO / "docs" / "evidence" / "session4-bakeoff" / "arm_hs.json").read_text()
    )
    return arm["goals"][0]["run_id"]


def _image(artifact: ArtifactDoc) -> Image.Image | None:
    if not artifact.storage_ref:
        return None
    path = STORAGE / artifact.storage_ref.removeprefix("storage://")
    return Image.open(path).convert("RGB") if path.is_file() else None


def _image_path(artifact: ArtifactDoc) -> Path | None:
    if not artifact.storage_ref:
        return None
    path = STORAGE / artifact.storage_ref.removeprefix("storage://")
    return path if path.is_file() else None


async def _persist(repos, run, *, kind: str, schema: str, content: dict) -> ArtifactDoc:
    digest = content_hash(content)
    artifact = construct_document(
        ArtifactDoc,
        artifact_id=f"{kind}_{digest[:24]}",
        project_id=run.project_id,
        run_id=run.run_id,
        stage_run_id=None,
        kind=kind,
        schema_version=schema,
        content=content,
        storage_ref=None,
        content_hash=digest,
        parent_artifact_ids=[],
        author="manga-eval-harness",
        supersedes_artifact_id=None,
        source_refs=[],
        model_receipt=None,
        validation_status="accepted",
        validation_report={
            "passed": True,
            "issues": [],
            "validator_version": EVAL_HARNESS_VERSION,
        },
        created_at=utc_now(),
    )
    return await repos.save_artifact(artifact)


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-judges", action="store_true")
    args = parser.parse_args()

    await _db.connect()
    settings = get_settings()
    client = await init_wired_documents(settings.mongodb_url, settings.db_name)
    try:
        repos = V1BridgedRepositories()
        run_id = _run_id()
        run = await repos.get_run(run_id)
        artifacts = await repos.list_artifacts(run_id, accepted_only=True)
        by_kind: dict[str, list[ArtifactDoc]] = {}
        for artifact in artifacts:
            by_kind.setdefault(artifact.kind, []).append(artifact)

        # Authored lineage: plan (must_preserve) + page plans (briefs).
        plan = MangaPlan.model_validate(by_kind["manga_plan"][0].content)
        must_preserve = sorted(
            {claim for beat in plan.beats for claim in beat.must_preserve}
        )
        thumbnails = sorted(
            by_kind.get("thumbnail_set", []), key=lambda a: a.created_at
        )
        thumbnail_set = ThumbnailSet.model_validate(thumbnails[-1].content)
        plans_by_index = {
            p.page_script.page_index: p for p in thumbnail_set.page_plans
        }
        layouts_by_plan: dict[str, CompiledPageLayout] = {}
        for artifact in by_kind.get("compiled_layout", []):
            layout = CompiledPageLayout.model_validate(artifact.content)
            layouts_by_plan[layout.page_plan_id] = layout

        def briefs_for(plan_doc: MangaPagePlan, compiled: CompiledPageLayout) -> str:
            script_by_id = {p.panel_id: p for p in plan_doc.page_script.panels}
            lines = []
            for panel in sorted(compiled.panels, key=lambda item: item.read_rank):
                script = script_by_id[panel.panel_id]
                lines.append(
                    f"Panel {panel.read_rank + 1}: {script.camera.shot} shot, "
                    f"{script.purpose} — {script.story_beat}"
                )
            return "\n".join(lines)

        vision = None if args.skip_judges else build_vision_qa()
        receipts: list[dict] = []

        async def judged(image_path: Path, plan_doc, compiled) -> tuple[dict | None, float]:
            if vision is None:
                return None, 0.0
            started = time.time()
            error_text = None
            result: dict = {}
            try:
                result = await judge_page(
                    vision,
                    image_path=image_path,
                    briefs=briefs_for(plan_doc, compiled),
                    must_preserve=must_preserve,
                    expected_panel_count=len(compiled.panels),
                )
            except Exception as error:  # noqa: BLE001 — receipt then continue
                error_text = f"{type(error).__name__}: {error}"
            cost = float(result.get("cost_usd") or 0.0)
            receipt_content = {
                "schema_version": "provider-receipt.v1",
                "purpose": "m3_judge",
                "provider": "minimax",
                "model": "MiniMax-M3",
                "request": {
                    "image": image_path.name,
                    "rubric_version": "m3-judge-rubrics.v1",
                    "claims": len(must_preserve),
                },
                "usage": result.get("usage"),
                "cost_usd": cost,
                "latency_ms": int((time.time() - started) * 1000),
                "error": error_text,
                "response_text": json.dumps(result.get("parsed"))
                if result.get("parsed") is not None
                else None,
                "n_images": 0,
                "at": utc_now().isoformat(),
            }
            stored = await _persist(
                repos,
                run,
                kind="provider_receipt",
                schema="provider-receipt.v1",
                content=receipt_content,
            )
            receipts.append({**receipt_content, "artifact_id": stored.artifact_id})
            return (result.get("parsed") if error_text is None else None), cost

        EVIDENCE.mkdir(parents=True, exist_ok=True)
        scorecards = []

        # ---- subject 1: accepted lane-C page_art (raw text-free art) ----
        art_scores: list[PageScore] = []
        for artifact in sorted(
            by_kind.get("page_art", []),
            key=lambda a: (a.content or {}).get("page_index", 0),
        ):
            content = artifact.content or {}
            page_index = int(content.get("page_index", 0))
            plan_doc = plans_by_index[page_index]
            compiled = layouts_by_plan[plan_doc.page_plan_id]
            image = _image(artifact)
            path = _image_path(artifact)
            score = PageScore(page_index=page_index)
            if image is not None and path is not None:
                score.layout_iou = layout_iou(image, compiled)
                score.border_adherence_score = border_adherence(
                    image, compiled
                ).page_score
                score.ocr_clean = ocr_gate(path).clean
                verdict, cost = await judged(path, plan_doc, compiled)
                score.judge = verdict
                score.judge_cost_usd = cost
            else:
                score.notes.append("art image missing on disk")
            art_scores.append(score)
        card = build_scorecard(
            project_id=PROJECT_ID,
            run_id=run_id,
            lane="C",
            subject="s5-accepted-page-art",
            pages=art_scores,
        )
        stored = await _persist(
            repos, run, kind="eval_scorecard", schema="eval-scorecard.v1", content=card
        )
        scorecards.append({**card, "artifact_id": stored.artifact_id})

        # ---- subject 2: latest composed pages (reader-served rasters) ----
        composed_rows = [
            a
            for a in by_kind.get("composed_page", [])
            if a.content is not None
        ]
        superseded = {
            a.supersedes_artifact_id for a in composed_rows if a.supersedes_artifact_id
        }
        latest: dict[int, ArtifactDoc] = {}
        for artifact in composed_rows:
            if artifact.artifact_id in superseded:
                continue
            index = int(artifact.content.get("page_index", 0))
            current = latest.get(index)
            if current is None or artifact.created_at > current.created_at:
                latest[index] = artifact
        composed_scores: list[PageScore] = []
        for page_index in sorted(latest):
            artifact = latest[page_index]
            plan_doc = plans_by_index[page_index]
            compiled = layouts_by_plan[plan_doc.page_plan_id]
            path = _image_path(artifact)
            score = PageScore(page_index=page_index)
            score.notes.append(
                f"composition={artifact.content.get('composition_version')}"
            )
            if path is not None:
                verdict, cost = await judged(path, plan_doc, compiled)
                score.judge = verdict
                score.judge_cost_usd = cost
            composed_scores.append(score)
        card = build_scorecard(
            project_id=PROJECT_ID,
            run_id=run_id,
            lane="C",
            subject="latest-composed-pages",
            pages=composed_scores,
            extra={
                "note": (
                    "Structural metrics live on the page_art subject; the "
                    "composed subject is judge-only (the compositor draws "
                    "frames at compiled geometry by construction)."
                )
            },
        )
        stored = await _persist(
            repos, run, kind="eval_scorecard", schema="eval-scorecard.v1", content=card
        )
        scorecards.append({**card, "artifact_id": stored.artifact_id})

        payload = {"scorecards": scorecards, "judge_receipts": receipts}
        (EVIDENCE / "eval_scorecards.json").write_text(
            json.dumps(payload, indent=2, default=str)
        )
        print(json.dumps(payload, indent=2, default=str))
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
