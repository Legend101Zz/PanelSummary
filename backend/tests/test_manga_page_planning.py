from __future__ import annotations

import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Coroutine, TypeVar, cast

import pytest

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
from app.services.errors import AuthorizationError
from app.services.hashing import content_hash
from app.services.manga_page_planning import MangaPagePlanningService
from app.services.page_domain_tools import MangaPlanningToolService

T = TypeVar("T")
NOW = datetime(2026, 7, 21, 12, 0, tzinfo=UTC)
FIXTURE_ROOT = Path(__file__).resolve().parents[2] / "packages" / "fixtures" / "canonical"


def resolve(coroutine: Coroutine[Any, Any, T]) -> T:
    return asyncio.run(coroutine)


def fixture(name: str) -> dict[str, Any]:
    return cast(dict[str, Any], json.loads((FIXTURE_ROOT / name).read_text(encoding="utf-8")))


def phase1_inputs() -> tuple[MangaPlan, PageScriptSet, list[MangaPagePlan]]:
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


def seeded_repository(plan: MangaPlan) -> InMemoryRepositories:
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


def test_phase1_persists_two_distinct_zero_image_previews_and_restarts(
    tmp_path: Path,
) -> None:
    plan, script_set, page_plans = phase1_inputs()
    repository = seeded_repository(plan)
    service = MangaPagePlanningService(repository, repository, media_root=tmp_path / "first")

    script_artifact = resolve(
        service.submit_page_script_set(
            run_id="run_phase1",
            stage_run_id="stage_page_writing",
            plan_artifact_id="manga_plan_phase1",
            script_set=script_set,
            author="human",
        )
    )
    for page_plan in page_plans:
        page_plan.script_set_artifact_id = script_artifact.artifact_id
    thumbnail_set = ThumbnailSet(
        schema_version="thumbnail-set.v1",
        thumbnail_set_id="thumbnail_set_phase1",
        project_id="project_phase1",
        script_set_artifact_id=script_artifact.artifact_id,
        page_plans=page_plans,
    )
    result = resolve(
        service.submit_thumbnail_set(
            run_id="run_phase1",
            stage_run_id="stage_thumbnail",
            script_artifact_id=script_artifact.artifact_id,
            thumbnail_set=thumbnail_set,
            author="human",
        )
    )
    replay = resolve(
        service.submit_thumbnail_set(
            run_id="run_phase1",
            stage_run_id="stage_thumbnail",
            script_artifact_id=script_artifact.artifact_id,
            thumbnail_set=thumbnail_set,
            author="human",
        )
    )

    assert result.thumbnail_artifact.validation_status == "accepted"
    assert replay.thumbnail_artifact.artifact_id == result.thumbnail_artifact.artifact_id
    assert [item.artifact_id for item in replay.preview_artifacts] == [
        item.artifact_id for item in result.preview_artifacts
    ]
    assert result.report_artifact.content is not None
    assert result.report_artifact.content["passed"] is True
    assert len(result.compiled_artifacts) == 2
    compiled_hashes: set[object] = set()
    for item in result.compiled_artifacts:
        assert item.content is not None
        compiled_hashes.add(item.content["compiler_hash"])
    assert len(compiled_hashes) == 2
    assert len(result.preview_artifacts) == 2
    assert all(item.model_receipt is None for item in result.preview_artifacts)
    assert not any(item.kind == "image_attempt" for item in repository.artifacts.values())

    stored_svgs = []
    for preview in result.preview_artifacts:
        assert preview.storage_ref is not None
        path = tmp_path / "first" / preview.storage_ref.removeprefix("storage://")
        stored_svgs.append(path.read_text(encoding="utf-8"))
    assert stored_svgs[0] != stored_svgs[1]
    assert all("<image" not in svg for svg in stored_svgs)

    fresh = InMemoryRepositories()
    fresh.runs = {key: value.model_copy(deep=True) for key, value in repository.runs.items()}
    fresh.artifacts = {
        key: value.model_copy(deep=True) for key, value in repository.artifacts.items()
    }
    reconstructed = resolve(
        MangaPagePlanningService(
            fresh,
            fresh,
            media_root=tmp_path / "fresh-process",
        ).reconstruct_previews(result.thumbnail_artifact.artifact_id)
    )
    assert reconstructed == tuple(stored_svgs)


def test_invalid_thumbnail_persists_addressable_report_without_preview(tmp_path: Path) -> None:
    plan, script_set, page_plans = phase1_inputs()
    repository = seeded_repository(plan)
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
    page_plans[0].reading_edges[0].from_panel_id = "panel_2"
    page_plans[0].reading_edges[0].to_panel_id = "panel_1"
    invalid = ThumbnailSet(
        schema_version="thumbnail-set.v1",
        thumbnail_set_id="thumbnail_set_invalid",
        project_id="project_phase1",
        script_set_artifact_id=script_artifact.artifact_id,
        page_plans=page_plans,
    )
    result = resolve(
        service.submit_thumbnail_set(
            run_id="run_phase1",
            stage_run_id="stage_thumbnail",
            script_artifact_id=script_artifact.artifact_id,
            thumbnail_set=invalid,
        )
    )

    assert result.thumbnail_artifact.validation_status == "invalid"
    assert result.compiled_artifacts == ()
    assert result.preview_artifacts == ()
    assert result.report_artifact.content is not None
    assert result.report_artifact.content["issues"][0]["code"] == "PAGE_TURN_NOT_LAST"
    assert result.report_artifact.content["issues"][0]["path"].startswith("/page_plans/0/")


def test_thumbnail_tool_enforces_project_and_active_stage_before_compiling(tmp_path: Path) -> None:
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
    plan_payload = fixture("manga_page_plan.splash.v1.json")
    plan_payload["project_id"] = "project_demo"
    request = DomainToolRequest.model_validate(
        {
            "arguments": {"page_plan": plan_payload},
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
    assert response.data["passed"] is True
    preview_svg = response.data["preview_svg"]
    assert isinstance(preview_svg, str)
    assert preview_svg.startswith("<svg")

    request.scope.project_id = "project_other"
    with pytest.raises(AuthorizationError, match="crosses project ownership"):
        resolve(service.execute("validate_layout_draft", request))

    request.scope.project_id = "project_demo"
    repository.runs["run_tool"].active_stage = "manga_page_writing"
    with pytest.raises(AuthorizationError, match="active run stage"):
        resolve(service.execute("validate_layout_draft", request))
