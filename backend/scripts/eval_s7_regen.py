"""Session 7: re-score the FIRST fully-authored composed set + live diff.

Scores the two S7 composed pages (real dialogue/narration lettered by the
compositor over the DSL base — art stayed rejected, see the run summary)
with the structural metrics + M3 judge rubrics, persists an
eval_scorecard artifact, and runs the NEW compare_scorecards fold against
the Session 6 composed-subject baseline — the first live measurement of
whether authored text moved the fidelity needle.

    uv run python scripts/eval_s7_regen.py

Judge budget: 2 pages x ~$0.0005 (+ receipts persisted for every call).
"""

import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image

from app.config import get_settings
from app.contracts.evaluation import EvalScorecard
from app.contracts.manga import CompiledPageLayout, MangaPlan, ThumbnailSet
from app.persistence.documents import ArtifactDoc, construct_document, utc_now
from app.persistence.v1_bridge import V1BridgedRepositories, init_wired_documents
from app.scripts import _db
from app.services.hashing import content_hash
from app.services.manga_eval import (
    PageScore,
    build_scorecard,
    compare_scorecards,
    judge_page,
    layout_iou,
)
from app.services.manga_page_art import border_adherence, ocr_gate
from app.services.manga_vision_qa import build_vision_qa

REPO = Path(__file__).resolve().parents[2]
EVIDENCE = REPO / "docs" / "evidence" / "session7-eval"
STORAGE = REPO / "storage"
PROJECT_ID = "6a0b5a5b201a8d03f1d82503"
#: The S7 fresh planning lineage (landed this session).
THUMBNAIL_ARTIFACT_ID = "accepted_thumbnail_set_8f57b8f9a2bbd3fe849f7b19"
COMPOSED_IDS = [
    "composed_page_1460e3dd1b4f6cb9a1dd51eb",
    "composed_page_981262c6d0840ee2bc059227",
]


def _run_id() -> str:
    arm = json.loads(
        (REPO / "docs" / "evidence" / "session4-bakeoff" / "arm_hs.json").read_text()
    )
    return arm["goals"][0]["run_id"]


async def main() -> int:
    await _db.connect()
    settings = get_settings()
    client = await init_wired_documents(settings.mongodb_url, settings.db_name)
    try:
        repos = V1BridgedRepositories()
        run_id = _run_id()
        run = await repos.get_run(run_id)
        artifacts = await repos.list_artifacts(run_id, accepted_only=True)
        by_id = {a.artifact_id: a for a in artifacts}
        by_kind: dict[str, list[ArtifactDoc]] = {}
        for artifact in artifacts:
            by_kind.setdefault(artifact.kind, []).append(artifact)

        plan = MangaPlan.model_validate(by_kind["manga_plan"][0].content)
        must_preserve = sorted(
            {claim for beat in plan.beats for claim in beat.must_preserve}
        )
        thumbnail_set = ThumbnailSet.model_validate(
            by_id[THUMBNAIL_ARTIFACT_ID].content
        )
        plans_by_id = {p.page_plan_id: p for p in thumbnail_set.page_plans}
        script_panel_ids = {
            plan_id: {p.panel_id for p in plan_doc.page_script.panels}
            for plan_id, plan_doc in plans_by_id.items()
        }
        layouts: dict[str, CompiledPageLayout] = {}
        for artifact in by_kind.get("compiled_layout", []):
            layout = CompiledPageLayout.model_validate(artifact.content)
            panel_ids = {p.panel_id for p in layout.panels}
            if script_panel_ids.get(layout.page_plan_id) == panel_ids:
                layouts[layout.page_plan_id] = layout

        vision = build_vision_qa()
        receipts = []
        pages: list[PageScore] = []
        for composed_id in COMPOSED_IDS:
            artifact = by_id[composed_id]
            content = artifact.content or {}
            page_index = int(content.get("page_index", 0))
            plan_doc = plans_by_id[content["page_plan_id"]]
            compiled = layouts[content["page_plan_id"]]
            image_path = STORAGE / artifact.storage_ref.removeprefix("storage://")
            image = Image.open(image_path).convert("RGB")
            score = PageScore(page_index=page_index)
            score.layout_iou = layout_iou(image, compiled)
            score.border_adherence_score = border_adherence(image, compiled).page_score
            score.ocr_clean = ocr_gate(image_path).clean
            score.notes.append("subject: S7 composed (dsl_only base, authored text)")
            script_by_id = {p.panel_id: p for p in plan_doc.page_script.panels}
            briefs = "\n".join(
                f"Panel {panel.read_rank + 1}: "
                f"{script_by_id[panel.panel_id].camera.shot} shot, "
                f"{script_by_id[panel.panel_id].purpose} — "
                f"{script_by_id[panel.panel_id].story_beat}"
                for panel in sorted(compiled.panels, key=lambda item: item.read_rank)
            )
            started = time.time()
            error_text = None
            result: dict = {}
            try:
                result = await judge_page(
                    vision,
                    image_path=image_path,
                    briefs=briefs,
                    must_preserve=must_preserve,
                    expected_panel_count=len(compiled.panels),
                )
            except Exception as error:  # noqa: BLE001 — receipt then continue
                error_text = f"{type(error).__name__}: {error}"
            cost = float(result.get("cost_usd") or 0.0)
            score.judge = result.get("parsed") if error_text is None else None
            score.judge_cost_usd = cost
            receipt_content = {
                "schema_version": "provider-receipt.v1",
                "purpose": "m3_judge",
                "provider": "minimax",
                "model": "MiniMax-M3",
                "request": {
                    "image": image_path.name,
                    "rubric_version": "m3-judge-rubrics.v1",
                    "claims": len(must_preserve),
                    "subject": "s7_composed",
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
            digest = content_hash(receipt_content)
            stored_receipt = await repos.save_artifact(
                construct_document(
                    ArtifactDoc,
                    artifact_id=f"provider_receipt_{digest[:24]}",
                    project_id=run.project_id,
                    run_id=run.run_id,
                    stage_run_id=None,
                    kind="provider_receipt",
                    schema_version="provider-receipt.v1",
                    content=receipt_content,
                    storage_ref=None,
                    content_hash=digest,
                    parent_artifact_ids=[composed_id],
                    author="manga-eval-harness",
                    supersedes_artifact_id=None,
                    source_refs=[],
                    model_receipt=None,
                    validation_status="accepted",
                    validation_report={
                        "passed": True,
                        "issues": [],
                        "validator_version": "provider-receipt.v1",
                    },
                    created_at=utc_now(),
                )
            )
            receipts.append({**receipt_content, "artifact_id": stored_receipt.artifact_id})
            pages.append(score)
            print(
                f"page {page_index}: iou={score.layout_iou.page_iou:.3f} "
                f"border={score.border_adherence_score:.3f} "
                f"judge={json.dumps(score.judge)[:220] if score.judge else error_text} "
                f"cost=${cost:.6f}"
            )

        scorecard = build_scorecard(
            project_id=PROJECT_ID,
            run_id=run_id,
            lane="C",
            subject="composed",
            pages=pages,
            extra={
                "session": 7,
                "planning_set": "S7 fresh (page-writing v5 M3 + thumbnail v5 speed)",
                "art_status": "dsl_only_after_rejected (8/8 art attempts rejected)",
            },
        )
        EvalScorecard.model_validate(scorecard)
        digest = content_hash(scorecard)
        stored = await repos.save_artifact(
            construct_document(
                ArtifactDoc,
                artifact_id=f"eval_scorecard_{digest[:24]}",
                project_id=PROJECT_ID,
                run_id=run_id,
                stage_run_id=None,
                kind="eval_scorecard",
                schema_version="eval-scorecard.v1",
                content=scorecard,
                storage_ref=None,
                content_hash=digest,
                parent_artifact_ids=COMPOSED_IDS,
                author="manga-eval-harness",
                supersedes_artifact_id=None,
                source_refs=[],
                model_receipt=None,
                validation_status="accepted",
                validation_report={
                    "passed": True,
                    "issues": [],
                    "validator_version": "eval-scorecard.v1",
                },
                created_at=utc_now(),
            )
        )
        print(f"scorecard -> {stored.artifact_id}")

        # Live diff vs the Session 6 composed-subject baseline.
        baselines = sorted(
            (
                a
                for a in by_kind.get("eval_scorecard", [])
                if (a.content or {}).get("subject") == "composed"
                and a.artifact_id != stored.artifact_id
            ),
            key=lambda a: a.created_at,
        )
        diff = None
        if baselines:
            diff = compare_scorecards(baselines[-1].content, scorecard)
            print("diff verdict:", diff["verdict"])
            for line in diff["improvements"]:
                print("  improvement:", line)
            for line in diff["regressions"]:
                print("  regression:", line)

        EVIDENCE.mkdir(parents=True, exist_ok=True)
        (EVIDENCE / "s7_composed_scorecard.json").write_text(
            json.dumps(
                {
                    "scorecard_artifact_id": stored.artifact_id,
                    "scorecard": scorecard,
                    "receipts": receipts,
                    "baseline_artifact_id": baselines[-1].artifact_id if baselines else None,
                    "diff": diff,
                },
                indent=2,
                default=str,
            )
        )
        print(f"evidence -> {EVIDENCE / 's7_composed_scorecard.json'}")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
