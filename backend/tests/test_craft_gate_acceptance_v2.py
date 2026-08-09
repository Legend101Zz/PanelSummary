"""Session 5 (step 0.2): craft warn-vs-block policy on the acceptance surfaces.

The Session 4 SVG preview loop proved the ACCEPTED WMC thumbnails carry
RTL_READING_FLOW_INCOHERENT defects that error-level validators cannot see
(docs/evidence/session4-svg-previews/). These tests pin the Session 5 fix on
both live surfaces:

1. ``validate_layout_draft`` — the model-visible verdict flags the live
   defect page as failed with an error-severity craft issue;
2. ``submit_thumbnail_set`` — a thumbnail set containing an RTL-incoherent
   page is rejected (validation_status "invalid") and the acceptance report
   carries the escalated issue, while pure-warning craft rules do NOT block.

The live plan itself is frozen in
``tests/fixtures/wmc_session4_rtl_defect_page_plan.json``; the Session 4
accepted artifacts in Mongo stay untouched (immutable evidence).
"""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Coroutine, TypeVar, cast

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.contracts.manga import MangaPagePlan, MangaPlan, PageScriptSet, ThumbnailSet
from app.persistence.documents import (
    ArtifactDoc,
    GenerationRunDoc,
    StageRunDoc,
    construct_document,
)
from app.persistence.repositories import InMemoryRepositories
from app.services.domain_tools import DomainToolRequest
from app.services.hashing import content_hash
from app.services.manga_page_planning import MangaPagePlanningService
from app.services.page_domain_tools import MangaPlanningToolService

T = TypeVar("T")
NOW = datetime(2026, 8, 9, 12, 0, tzinfo=UTC)
CANONICAL = Path(__file__).resolve().parents[2] / "packages" / "fixtures" / "canonical"
FIXTURES = Path(__file__).resolve().parent / "fixtures"


def resolve(coroutine: Coroutine[Any, Any, T]) -> T:
    return asyncio.run(coroutine)


def fixture(name: str) -> dict[str, Any]:
    return cast(dict[str, Any], json.loads((CANONICAL / name).read_text(encoding="utf-8")))


def live_defect_plan(project_id: str) -> dict[str, Any]:
    raw = cast(
        dict[str, Any],
        json.loads((FIXTURES / "wmc_session4_rtl_defect_page_plan.json").read_text()),
    )
    raw["project_id"] = project_id  # authorization remap only; geometry untouched
    return raw


def test_validate_layout_draft_fails_the_live_wmc_defect_page(tmp_path: Path) -> None:
    repository = InMemoryRepositories()
    context_payload = fixture("context_pack.v1.json")
    context_payload["purpose"] = "manga_thumbnail"
    context_payload["parent_artifacts"] = []
    repository.runs["run_tool"] = construct_document(
        GenerationRunDoc,
        run_id="run_tool",
        project_id="project_demo",
        scope_id="scope_ch01",
        requested_outputs=["manga"],
        pipeline_version="manga-page-dsl.v2",
        memory_version=3,
        status="running",
        active_stage="manga_thumbnail",
        budget={},
        created_by="user_demo",
        idempotency_key="run_tool_key",
        created_at=NOW,
        updated_at=NOW,
    )
    repository.stages["stage_thumbnail"] = construct_document(
        StageRunDoc,
        stage_run_id="stage_thumbnail",
        run_id="run_tool",
        stage_name="manga_thumbnail",
        attempt=1,
        status="running",
        input_artifact_ids=["context_pack_001"],
        input_hash="e" * 64,
        output_artifact_ids=[],
        idempotency_key="stage_thumbnail_key",
        started_at=NOW,
        ended_at=None,
    )
    repository.artifacts["context_pack_001"] = construct_document(
        ArtifactDoc,
        artifact_id="context_pack_001",
        project_id="project_demo",
        run_id="run_tool",
        kind="context_pack",
        schema_version="context-pack.v1",
        content=context_payload,
        storage_ref=None,
        content_hash=content_hash(context_payload),
        parent_artifact_ids=[],
        source_refs=[],
        model_receipt=None,
        validation_status="accepted",
        validation_report={"passed": True, "issues": [], "validator_version": "test.v1"},
        created_at=NOW,
    )
    request = DomainToolRequest.model_validate(
        {
            "arguments": {"page_plan": live_defect_plan("project_demo")},
            "scope": {
                "correlation_id": "correlation_tool",
                "goal_id": "goal_thumbnail",
                "run_id": "run_tool",
                "stage_run_id": "stage_thumbnail",
                "context_pack_id": "context_pack_001",
                "project_id": "project_demo",
            },
        }
    )
    service = MangaPlanningToolService(repository, repository, media_root=tmp_path)

    response = resolve(service.execute("validate_layout_draft", request))
    assert isinstance(response.data, dict)
    assert response.data["passed"] is False
    issues = cast(list[dict[str, Any]], response.data["issues"])
    escalated = [item for item in issues if item["severity"] == "error"]
    assert [item["code"] for item in escalated] == ["RTL_READING_FLOW_INCOHERENT"]
    # The full payload is still present for the control plane (the MODEL-side
    # trim happens in the worker's tool adapter, not here).
    assert "compiled_layout" in response.data
    assert "preview_svg" in response.data


def _phase1_scenario() -> tuple[MangaPlan, PageScriptSet, list[MangaPagePlan]]:
    normal = MangaPagePlan.model_validate(fixture("manga_page_plan.v1.json"))
    action = MangaPagePlan.model_validate(fixture("manga_page_plan.action.v1.json"))
    action.page_script.page_index = 1
    source_refs = [
        panel.source_refs[0]
        for page in (normal.page_script, action.page_script)
        for panel in page.panels
    ]
    beats = []
    for index, ref in enumerate(source_refs):
        beats.append(
            {
                "beat_id": f"beat_{index}",
                "sequence": index,
                "source_refs": [ref.model_dump(mode="json")],
                "required_fact_ids": [],
                "narrative_purpose": "payoff" if index == len(source_refs) - 1 else "explanation",
                "book_essence": f"Grounded source beat {index}.",
                "dramatization": f"Visual dramatization {index}.",
                "character_intent": [],
                "visual_intent": ["clear manga staging"],
                "must_preserve": ["source meaning"],
                "may_compress": [],
                "confidence": 1,
            }
        )
    plan = MangaPlan.model_validate(
        {
            "schema_version": "manga-plan.v1",
            "plan_id": "plan_phase1",
            "project_id": "project_phase1",
            "scope_id": "scope_phase1",
            "context_pack_id": "context_phase1",
            "memory_version": 1,
            "title": "Locality",
            "summary": "Global access meets local opportunity.",
            "target_page_count": 2,
            "beats": beats,
            "character_state_updates": [],
            "terminology_updates": [],
            "new_facts": [],
            "ending_state": "The narrator sees the local trade-off.",
            "unresolved_thread_updates": [],
        }
    )
    script_set = PageScriptSet(
        schema_version="page-script-set.v1",
        script_set_id="script_set_phase1",
        project_id="project_phase1",
        plan_artifact_id="manga_plan_phase1",
        context_pack_id="context_phase1",
        pages=[normal.page_script, action.page_script],
    )
    return plan, script_set, [normal, action]


def _seeded_repository(plan: MangaPlan) -> InMemoryRepositories:
    repository = InMemoryRepositories()
    repository.runs["run_phase1"] = construct_document(
        GenerationRunDoc,
        run_id="run_phase1",
        project_id="project_phase1",
        scope_id="scope_phase1",
        requested_outputs=["manga"],
        pipeline_version="manga-page-dsl.v2",
        memory_version=1,
        status="running",
        active_stage="manga_page_writing",
        budget={
            "max_text_cost_usd": 1,
            "max_image_cost_usd": 0,
            "max_render_minutes": 1,
            "max_agent_steps": 10,
            "max_repair_attempts": 2,
            "max_sprites": 0,
            "max_key_panels": 0,
            "max_reels": 0,
        },
        created_by="user_phase1",
        idempotency_key="run_phase1_key",
        created_at=NOW,
        updated_at=NOW,
    )
    payload = plan.model_dump(mode="json")
    repository.artifacts["manga_plan_phase1"] = construct_document(
        ArtifactDoc,
        artifact_id="manga_plan_phase1",
        project_id="project_phase1",
        run_id="run_phase1",
        kind="manga_plan",
        schema_version="manga-plan.v1",
        content=payload,
        storage_ref=None,
        content_hash=content_hash(payload),
        parent_artifact_ids=["context_phase1"],
        source_refs=[],
        model_receipt=None,
        validation_status="accepted",
        validation_report={"passed": True, "issues": [], "validator_version": "test.v1"},
        created_at=NOW,
    )
    return repository


def _make_top_row_read_left_to_right(plan: MangaPagePlan) -> None:
    """Turn the action page's vertical base split into a horizontal row whose
    earlier-reading panel sits LEFT — the live WMC defect class (an LTR row on
    an RTL page) — without touching the authored reading edges."""
    base = plan.layout_root.base  # type: ignore[union-attr]
    assert base.kind == "split" and base.axis == "y"
    base.axis = "x"


def test_thumbnail_set_with_rtl_incoherent_page_is_rejected(tmp_path: Path) -> None:
    plan, script_set, page_plans = _phase1_scenario()
    repository = _seeded_repository(plan)
    service = MangaPagePlanningService(repository, repository, media_root=tmp_path)
    script_artifact = resolve(
        service.submit_page_script_set(
            run_id="run_phase1",
            stage_run_id="stage_page_writing",
            plan_artifact_id="manga_plan_phase1",
            script_set=script_set,
        )
    )
    for page_plan in page_plans:
        page_plan.script_set_artifact_id = script_artifact.artifact_id
    _make_top_row_read_left_to_right(page_plans[1])
    incoherent = ThumbnailSet(
        schema_version="thumbnail-set.v1",
        thumbnail_set_id="thumbnail_set_rtl_defect",
        project_id="project_phase1",
        script_set_artifact_id=script_artifact.artifact_id,
        page_plans=page_plans,
    )
    result = resolve(
        service.submit_thumbnail_set(
            run_id="run_phase1",
            stage_run_id="stage_thumbnail",
            script_artifact_id=script_artifact.artifact_id,
            thumbnail_set=incoherent,
        )
    )

    assert result.thumbnail_artifact.validation_status == "invalid"
    assert result.compiled_artifacts == ()
    assert result.preview_artifacts == ()
    assert result.report_artifact.content is not None
    assert result.report_artifact.content["passed"] is False
    report_issues = cast(list[dict[str, Any]], result.report_artifact.content["issues"])
    escalated = [item for item in report_issues if item["severity"] == "error"]
    assert escalated
    assert all(item["code"] == "RTL_READING_FLOW_INCOHERENT" for item in escalated)
    assert all(item["path"].startswith("/page_plans/1/") for item in escalated)
    # The artifact's own validation_report now carries severity per issue.
    artifact_issues = cast(
        list[dict[str, Any]], result.thumbnail_artifact.validation_report["issues"]
    )
    assert all("severity" in item for item in artifact_issues)


def test_warning_only_craft_issues_do_not_block_acceptance(tmp_path: Path) -> None:
    plan, script_set, page_plans = _phase1_scenario()
    repository = _seeded_repository(plan)
    service = MangaPagePlanningService(repository, repository, media_root=tmp_path)
    script_artifact = resolve(
        service.submit_page_script_set(
            run_id="run_phase1",
            stage_run_id="stage_page_writing",
            plan_artifact_id="manga_plan_phase1",
            script_set=script_set,
        )
    )
    for page_plan in page_plans:
        page_plan.script_set_artifact_id = script_artifact.artifact_id
    accepted_set = ThumbnailSet(
        schema_version="thumbnail-set.v1",
        thumbnail_set_id="thumbnail_set_clean",
        project_id="project_phase1",
        script_set_artifact_id=script_artifact.artifact_id,
        page_plans=page_plans,
    )
    result = resolve(
        service.submit_thumbnail_set(
            run_id="run_phase1",
            stage_run_id="stage_thumbnail",
            script_artifact_id=script_artifact.artifact_id,
            thumbnail_set=accepted_set,
        )
    )

    assert result.thumbnail_artifact.validation_status == "accepted"
    assert result.report_artifact.content is not None
    assert result.report_artifact.content["passed"] is True
    report_issues = cast(list[dict[str, Any]], result.report_artifact.content["issues"])
    assert all(item["severity"] != "error" for item in report_issues)
