"""Session 7: gates-v3 empty-balloon calibration smoke (BEFORE the paid batch).

The v3 empty-balloon REJECT has never fired on real art. This smoke runs
the exact stage vision call (VISION_QA_SYSTEM, v3 policy) on the S5
ACCEPTED page_art — known-good pages full of round white shapes (floating
stones, cheese chunks), the named false-positive risk. If empty_balloon
fires on either page, gates v4 must demote it to advisory before the S7
regen (the S5 contains_text lesson: $0.156 of rejected-good-art burn).

    uv run python scripts/smoke_gates_v3_s7.py

Cost: one M3 vision call per accepted page (~$0.0004 each), receipted as
provider_receipt rows (purpose manga_vision_qa_smoke) + evidence JSON.
"""

import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.contracts.manga import CompiledPageLayout, MangaPagePlan, ThumbnailSet
from app.persistence.documents import ArtifactDoc, construct_document, utc_now
from app.persistence.v1_bridge import V1BridgedRepositories, init_wired_documents
from app.scripts import _db
from app.services.hashing import content_hash
from app.services.manga_page_art_stage import GATE_POLICY_VERSION, VISION_QA_SYSTEM
from app.services.manga_vision_qa import build_vision_qa

REPO = Path(__file__).resolve().parents[2]
EVIDENCE = REPO / "docs" / "evidence" / "session7-gates-smoke"
STORAGE = REPO / "storage"


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
        by_kind: dict[str, list[ArtifactDoc]] = {}
        for artifact in artifacts:
            by_kind.setdefault(artifact.kind, []).append(artifact)

        thumbnails = sorted(by_kind["thumbnail_set"], key=lambda a: a.created_at)
        thumbnail_set = ThumbnailSet.model_validate(thumbnails[0].content)
        plans_by_id = {p.page_plan_id: p for p in thumbnail_set.page_plans}
        layouts_by_plan: dict[str, CompiledPageLayout] = {}
        for artifact in by_kind.get("compiled_layout", []):
            layout = CompiledPageLayout.model_validate(artifact.content)
            layouts_by_plan[layout.page_plan_id] = layout

        vision = build_vision_qa()
        rows = []
        for artifact in sorted(
            by_kind.get("page_art", []),
            key=lambda a: (a.content or {}).get("page_index", 0),
        ):
            content = artifact.content or {}
            plan_id = content.get("page_plan_id")
            plan: MangaPagePlan | None = plans_by_id.get(plan_id)
            compiled = layouts_by_plan.get(plan_id)
            if plan is None or compiled is None or not artifact.storage_ref:
                print(f"skipping {artifact.artifact_id}: incomplete lineage")
                continue
            image_path = STORAGE / artifact.storage_ref.removeprefix("storage://")
            script_by_id = {p.panel_id: p for p in plan.page_script.panels}
            briefs = "\n".join(
                f"Panel {panel.read_rank + 1}: "
                f"{script_by_id[panel.panel_id].camera.shot} shot, "
                f"{script_by_id[panel.panel_id].purpose} — "
                f"{script_by_id[panel.panel_id].story_beat}"
                for panel in sorted(compiled.panels, key=lambda item: item.read_rank)
            )
            started = time.time()
            error_text = None
            verdict: dict = {}
            try:
                verdict = await vision(
                    image_path=image_path,
                    briefs=briefs,
                    expected_panel_count=len(compiled.panels),
                    system_prompt=VISION_QA_SYSTEM,
                )
            except Exception as error:  # noqa: BLE001 — receipt then continue
                error_text = f"{type(error).__name__}: {error}"
            latency_ms = int((time.time() - started) * 1000)
            cost = float(verdict.get("cost_usd") or 0.0)
            parsed = verdict.get("parsed") if error_text is None else None
            empty_balloon = (
                any(p.get("empty_balloon") for p in parsed.get("panels", []))
                if isinstance(parsed, dict)
                else None
            )
            receipt_content = {
                "schema_version": "provider-receipt.v1",
                "purpose": "manga_vision_qa_smoke",
                "provider": "minimax",
                "model": "MiniMax-M3",
                "request": {
                    "image": image_path.name,
                    "gate_policy_version": GATE_POLICY_VERSION,
                    "page_index": content.get("page_index"),
                    "calibration": "empty-balloon false-positive smoke on accepted S5 art",
                },
                "usage": verdict.get("usage"),
                "cost_usd": cost,
                "latency_ms": latency_ms,
                "error": error_text,
                "response_text": json.dumps(parsed) if parsed is not None else None,
                "n_images": 0,
                "at": utc_now().isoformat(),
            }
            digest = content_hash(receipt_content)
            stored = await repos.save_artifact(
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
                    parent_artifact_ids=[artifact.artifact_id],
                    author="gates-v3-smoke",
                    supersedes_artifact_id=None,
                    source_refs=[],
                    model_receipt=None,
                    validation_status="accepted",
                    validation_report={
                        "passed": True,
                        "issues": [],
                        "validator_version": GATE_POLICY_VERSION,
                    },
                    created_at=utc_now(),
                )
            )
            row = {
                "page_art_artifact_id": artifact.artifact_id,
                "page_index": content.get("page_index"),
                "receipt_artifact_id": stored.artifact_id,
                "cost_usd": cost,
                "error": error_text,
                "empty_balloon": empty_balloon,
                "panel_count": parsed.get("panel_count") if isinstance(parsed, dict) else None,
                "overall_ok": parsed.get("overall_ok") if isinstance(parsed, dict) else None,
                "panels": parsed.get("panels") if isinstance(parsed, dict) else None,
            }
            rows.append(row)
            print(
                f"page {row['page_index']}: empty_balloon={empty_balloon} "
                f"panel_count={row['panel_count']} overall_ok={row['overall_ok']} "
                f"cost=${cost:.6f} receipt={stored.artifact_id}"
            )

        EVIDENCE.mkdir(parents=True, exist_ok=True)
        out = EVIDENCE / "empty_balloon_smoke.json"
        out.write_text(
            json.dumps(
                {
                    "gate_policy_version": GATE_POLICY_VERSION,
                    "run_id": run_id,
                    "total_cost_usd": sum(r["cost_usd"] for r in rows),
                    "verdict": (
                        "empty_balloon fired on ACCEPTED art -> demote to advisory (gates v4)"
                        if any(r["empty_balloon"] for r in rows)
                        else "no false positive on accepted art -> v3 reject stays"
                    ),
                    "pages": rows,
                },
                indent=2,
            )
        )
        print(f"evidence -> {out}")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
