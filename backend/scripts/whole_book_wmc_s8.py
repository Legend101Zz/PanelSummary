"""Session 8 golden-chain resume (issue #13): ONE WMC chain driven end-to-end.

The ScopeChainPlanner plans the WHOLE book deterministically (skips +
budgets printed and persisted), then the WholeBookChainExecutor drives
the REAL stage drivers scope by scope on POLICY-DEFAULT model modes
(direction=quality/M3 on the 8789 worker, page-writing/thumbnail=speed
on the 8788 worker) with the hard cost preflight, per-scope eval
scorecard persistence, and the rolling canon merge. Budgets are sized by
the CALLER so the chain executes as many scopes as the session's ledger
affords and the preflight REFUSES the rest with a recorded reason — the
no-surprise-bills gate demonstrated live, not stubbed.

    AGENT_WORKER_TOKEN=... uv run python scripts/whole_book_wmc_s7.py \
        --text-budget 0.90 --image-budget 0.25

Every provider call receipts durably (stage receipts, provider_receipt
rows, eval scorecards); evidence lands in
docs/evidence/session8-golden-run/.
"""

import argparse
import asyncio
import json
import os
import sys
import time
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image

from app.config import get_settings
from app.contracts.manga import CompiledPageLayout, MangaPlan, ThumbnailSet
from app.persistence.documents import ArtifactDoc, construct_document, utc_now
from app.persistence.v1_bridge import V1BridgedRepositories, init_wired_documents
from app.scripts import _db
from app.services.agent_worker import HttpAgentWorkerClient
from app.services.hashing import content_hash
from app.services.manga_director import MangaDirectorService
from app.services.manga_eval import PageScore, build_scorecard, judge_page, layout_iou
from app.services.manga_page_art import border_adherence, ocr_gate
from app.services.manga_page_art_stage import MangaPageArtStageService
from app.services.manga_page_planner import MangaPagePlannerService
from app.services.manga_vision_qa import build_vision_qa
from app.services.memory import MemoryMergeService
from app.services.whole_book import (
    PlannedScope,
    ScopeChainPlanner,
    WholeBookChainExecutor,
)

REPO = Path(__file__).resolve().parents[2]
EVIDENCE = REPO / "docs" / "evidence" / "session8-golden-run"
STORAGE = REPO / "storage"
ASSETS = STORAGE / "images" / "manga_assets" / "6a0b5a5b201a8d03f1d82503"
REFERENCE_SHEETS = [
    ASSETS / "haw__reference_sheet__front.png",
    ASSETS / "hem__reference_sheet__front.png",
]
PROJECT_ID = "6a0b5a5b201a8d03f1d82503"
BOOK_ID = "6a0b5a11201a8d03f1d82501"


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--text-budget", type=float, required=True)
    parser.add_argument("--image-budget", type=float, required=True)
    args = parser.parse_args()

    speed_worker_url = os.environ.get("SPEED_WORKER_URL", "http://127.0.0.1:8788")
    m3_worker_url = os.environ.get("M3_WORKER_URL", "http://127.0.0.1:8789")
    worker_token = os.environ["AGENT_WORKER_TOKEN"]

    await _db.connect()
    settings = get_settings()
    client = await init_wired_documents(settings.mongodb_url, settings.db_name)
    try:
        repos = V1BridgedRepositories()
        planner = ScopeChainPlanner()
        plan = await planner.plan(repos, book_id=BOOK_ID, project_id=PROJECT_ID)
        print(f"chain plan {plan.plan_hash[:16]}: {len(plan.scopes)} scopes, "
              f"{len(plan.skipped)} skipped units")
        for scope in plan.scopes:
            print(
                f"  scope {scope.sequence}: {scope.label} | units="
                f"{list(scope.source_unit_ids)} tokens={scope.token_count} "
                f"budget text=${scope.budget.text_usd} image=${scope.budget.image_usd}"
            )
        for skip in plan.skipped:
            print(f"  skip {skip.source_unit_id}: {skip.reason} ({skip.heading[:40]!r})")
        print(
            f"projected totals: text=${plan.projected_text_usd:.4f} "
            f"image=${plan.projected_image_usd:.4f} judge=${plan.projected_judge_usd:.4f}"
        )
        print(
            f"granted budgets: text=${args.text_budget:.4f} image=${args.image_budget:.4f}"
        )

        m3_worker = HttpAgentWorkerClient(
            base_url=m3_worker_url, token=worker_token, timeout_seconds=900
        )
        speed_worker = HttpAgentWorkerClient(
            base_url=speed_worker_url, token=worker_token, timeout_seconds=900
        )
        director = MangaDirectorService(repos, m3_worker)
        page_planner = MangaPagePlannerService(repos, speed_worker)
        art_service = MangaPageArtStageService(
            repos,
            media_root=STORAGE,
            openrouter_api_key=settings.openrouter_api_key,
            vision_qa=build_vision_qa(),
            character_reference_paths=REFERENCE_SHEETS,
            evidence_dir=EVIDENCE,
        )
        vision = build_vision_qa()

        async def direction_runner(*, project_id: str, scope_id: str):
            return await director.run_direction_goal(
                project_id=project_id, scope_id=scope_id
            )

        async def page_writing_runner(*, project_id: str, run_id: str):
            return await page_planner.run_page_writing_goal(
                project_id=project_id, run_id=run_id
            )

        async def thumbnail_runner(*, project_id: str, run_id: str):
            return await page_planner.run_thumbnail_goal(
                project_id=project_id, run_id=run_id
            )

        async def page_art_runner(
            *,
            project_id: str,
            run_id: str,
            image_budget_usd: float,
            thumbnail_artifact_id: str,
        ):
            return await art_service.run_page_art_stage(
                project_id=project_id,
                run_id=run_id,
                image_budget_usd=image_budget_usd,
                thumbnail_artifact_id=thumbnail_artifact_id,
            )

        async def eval_runner(
            project_id: str, run_id: str, planned: PlannedScope
        ) -> tuple[str | None, float]:
            run = await repos.get_run(run_id)
            artifacts = await repos.list_artifacts(run_id, accepted_only=True)
            by_kind: dict[str, list[ArtifactDoc]] = {}
            for artifact in artifacts:
                by_kind.setdefault(artifact.kind, []).append(artifact)
            plans = by_kind.get("manga_plan", [])
            if not plans:
                return None, 0.0
            manga_plan = MangaPlan.model_validate(plans[0].content)
            must_preserve = sorted(
                {claim for beat in manga_plan.beats for claim in beat.must_preserve}
            )
            thumbs = sorted(
                by_kind.get("thumbnail_set", []), key=lambda a: a.created_at
            )
            if not thumbs:
                return None, 0.0
            thumbnail_set = ThumbnailSet.model_validate(thumbs[-1].content)
            plans_by_id = {
                p.page_plan_id: p for p in thumbnail_set.page_plans
            }
            layouts: dict[str, CompiledPageLayout] = {}
            for artifact in by_kind.get("compiled_layout", []):
                layout = CompiledPageLayout.model_validate(artifact.content)
                layouts[layout.page_plan_id] = layout
            composed = sorted(
                (
                    a
                    for a in by_kind.get("composed_page", [])
                    if a.content is not None
                ),
                key=lambda a: (a.content or {}).get("page_index", 0),
            )
            pages: list[PageScore] = []
            judge_cost = 0.0
            for artifact in composed:
                content = artifact.content or {}
                page_index = int(content.get("page_index", 0))
                plan_doc = plans_by_id.get(content.get("page_plan_id"))
                compiled = layouts.get(content.get("page_plan_id"))
                score = PageScore(page_index=page_index)
                if artifact.storage_ref and compiled is not None:
                    image_path = STORAGE / artifact.storage_ref.removeprefix(
                        "storage://"
                    )
                    if image_path.is_file():
                        image = Image.open(image_path).convert("RGB")
                        score.layout_iou = layout_iou(image, compiled)
                        borders = border_adherence(image, compiled)
                        score.border_adherence_score = borders.page_score
                        if plan_doc is not None:
                            script_by_id = {
                                p.panel_id: p for p in plan_doc.page_script.panels
                            }
                            briefs = "\n".join(
                                f"Panel {panel.read_rank + 1}: "
                                f"{script_by_id[panel.panel_id].camera.shot} shot, "
                                f"{script_by_id[panel.panel_id].purpose} — "
                                f"{script_by_id[panel.panel_id].story_beat}"
                                for panel in sorted(
                                    compiled.panels, key=lambda item: item.read_rank
                                )
                            )
                            try:
                                result = await judge_page(
                                    vision,
                                    image_path=image_path,
                                    briefs=briefs,
                                    must_preserve=must_preserve,
                                    expected_panel_count=len(compiled.panels),
                                )
                                score.judge = result.get("parsed")
                                score.judge_cost_usd = float(
                                    result.get("cost_usd") or 0.0
                                )
                                judge_cost += score.judge_cost_usd
                            except Exception as error:  # noqa: BLE001
                                score.notes.append(
                                    f"judge failed: {type(error).__name__}: {error}"
                                )
                pages.append(score)
            if not pages:
                return None, 0.0
            scorecard = build_scorecard(
                project_id=project_id,
                run_id=run_id,
                lane="C",
                subject="composed",
                pages=pages,
                extra={
                    "golden_run": True,
                    "scope_sequence": planned.sequence,
                    "scope_label": planned.label,
                },
            )
            digest = content_hash(scorecard)
            stored = await repos.save_artifact(
                construct_document(
                    ArtifactDoc,
                    artifact_id=f"eval_scorecard_{digest[:24]}",
                    project_id=project_id,
                    run_id=run_id,
                    stage_run_id=None,
                    kind="eval_scorecard",
                    schema_version="eval-scorecard.v1",
                    content=scorecard,
                    storage_ref=None,
                    content_hash=digest,
                    parent_artifact_ids=[a.artifact_id for a in composed],
                    author="whole-book-chain",
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
            return stored.artifact_id, judge_cost

        executor = WholeBookChainExecutor(
            repos,
            direction_runner=direction_runner,
            page_writing_runner=page_writing_runner,
            thumbnail_runner=thumbnail_runner,
            page_art_runner=page_art_runner,
            eval_runner=eval_runner,
            memory_merge=MemoryMergeService(repos, repos, repos),
            text_budget_usd=args.text_budget,
            image_budget_usd=args.image_budget,
        )
        started = time.time()
        outcome = await executor.execute(plan)
        elapsed = time.time() - started

        record = {
            "plan_hash": plan.plan_hash,
            "status": outcome.status,
            "elapsed_seconds": round(elapsed, 1),
            "granted": {
                "text_usd": args.text_budget,
                "image_usd": args.image_budget,
            },
            "remaining": {
                "text_usd": outcome.remaining_text_usd,
                "image_usd": outcome.remaining_image_usd,
            },
            "totals": {
                "text_usd": outcome.total_text_cost_usd,
                "image_usd": outcome.total_image_cost_usd,
            },
            "scopes_planned": [
                {
                    "sequence": s.sequence,
                    "label": s.label,
                    "source_unit_ids": list(s.source_unit_ids),
                    "token_count": s.token_count,
                    "budget": asdict(s.budget),
                }
                for s in plan.scopes
            ],
            "skipped_units": [asdict(s) for s in plan.skipped],
            "executions": [asdict(e) for e in outcome.executions],
        }
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        out = EVIDENCE / "chain_outcome.json"
        out.write_text(json.dumps(record, indent=2, default=str))
        print(json.dumps(record, indent=2, default=str))
        print(f"evidence -> {out}")
        return 0 if outcome.status in {"completed", "stopped_preflight"} else 1
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
