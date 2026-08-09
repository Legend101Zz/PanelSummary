"""Session 8 step 0: golden-chain wall-4 fixes at the thumbnail seam.

The live diagnosis (stage_manga_thumbnail_9d5460abf387aa8e1eb3, run
run_dir_c6bfbb6ab031c36645ee3151) DISPROVED the stale-ContextPack-parent
hypothesis: all four failing calls were scoped to the pack compiled at
00:55:04.743Z, which lists the accepted script — and the accepted script
postdates nothing. The real walls, from the seam dumps:

1. submit 1 (00:56:08Z) followed "submit without page_script" but omitted
   ``page_index`` entirely -> hydration 422;
2. submit 2 (00:56:51Z) embedded ``page_script`` byte-exact and reached
   the deterministic gate (3x TEXT_REGION_OUT_OF_PANEL — a prompt/skill
   problem, not a seam problem);
3. attempt 2 (00:59Z) invented the truncated id
   ``accepted_page_script_set_cf19f45c6e614cafa06d_1`` -> 403 (correct
   authorization behavior on a nonexistent id).

These tests pin the wall-1 fix (deterministic page_index inference:
page_plan_id digits, then list position) and the S7-deviation-7 negative
page_index guard in ``_coerce_int``.
"""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Coroutine, TypeVar, cast

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.contracts.manga import MangaPagePlan, MangaPlan, PageScriptSet
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
from app.services.page_domain_tools import (
    MangaPlanningToolService,
    _coerce_int,
    _infer_page_index,
)

T = TypeVar("T")
NOW = datetime(2026, 8, 9, 12, 0, tzinfo=UTC)
CANONICAL = Path(__file__).resolve().parents[2] / "packages" / "fixtures" / "canonical"


def resolve(coroutine: Coroutine[Any, Any, T]) -> T:
    return asyncio.run(coroutine)


def fixture(name: str) -> dict[str, Any]:
    return cast(dict[str, Any], json.loads((CANONICAL / name).read_text(encoding="utf-8")))


# ---------------------------------------------------------------------------
# _coerce_int: the negative guard (S7 deviation 7)
# ---------------------------------------------------------------------------


def test_coerce_int_accepts_non_negative_ints_and_digit_strings() -> None:
    assert _coerce_int(0) == 0
    assert _coerce_int(1) == 1
    assert _coerce_int("0") == 0
    assert _coerce_int(" 1 ") == 1


def test_coerce_int_rejects_negatives_in_both_representations() -> None:
    """Python's negative indexing would silently select from the END of the
    accepted set — ``pages[-1]`` passes the ``>= len(pages)`` bound check."""
    assert _coerce_int(-1) is None
    assert _coerce_int("-1") is None
    assert _coerce_int("  -2 ") is None


def test_coerce_int_still_rejects_bools_and_garbage() -> None:
    assert _coerce_int(True) is None
    assert _coerce_int(None) is None
    assert _coerce_int("abc") is None
    assert _coerce_int(1.5) is None


# ---------------------------------------------------------------------------
# _infer_page_index: deterministic fallback order
# ---------------------------------------------------------------------------


def test_infer_page_index_prefers_page_plan_id_digits() -> None:
    assert _infer_page_index({"page_plan_id": "page_plan_1"}, position=0) == 1
    assert _infer_page_index({"page_plan_id": "plan_page_0"}, position=5) == 0


def test_infer_page_index_falls_back_to_list_position() -> None:
    assert _infer_page_index({"page_plan_id": "cover_plan"}, position=1) == 1
    assert _infer_page_index({}, position=0) == 0


# ---------------------------------------------------------------------------
# The seam: a golden-chain-shaped submission (no page_script, no page_index)
# now hydrates by inference and lands.
# ---------------------------------------------------------------------------


def _phase1_scenario() -> tuple[MangaPlan, PageScriptSet, list[MangaPagePlan]]:
    normal = MangaPagePlan.model_validate(fixture("manga_page_plan.v1.json"))
    action = MangaPagePlan.model_validate(fixture("manga_page_plan.action.v1.json"))
    action.page_script.page_index = 1
    source_refs = [
        panel.source_refs[0]
        for page in (normal.page_script, action.page_script)
        for panel in page.panels
    ]
    beats = [
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
        for index, ref in enumerate(source_refs)
    ]
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
        active_stage="manga_thumbnail",
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
    repository.stages["stage_page_writing"] = construct_document(
        StageRunDoc,
        stage_run_id="stage_page_writing",
        run_id="run_phase1",
        stage_name="manga_page_writing",
        attempt=1,
        status="running",
        input_artifact_ids=["manga_plan_phase1"],
        input_hash="e" * 64,
        output_artifact_ids=[],
        idempotency_key="stage_page_writing_key",
        started_at=NOW,
        ended_at=None,
    )
    repository.stages["stage_thumbnail"] = construct_document(
        StageRunDoc,
        stage_run_id="stage_thumbnail",
        run_id="run_phase1",
        stage_name="manga_thumbnail",
        attempt=1,
        status="running",
        input_artifact_ids=[],
        input_hash="f" * 64,
        output_artifact_ids=[],
        idempotency_key="stage_thumbnail_key",
        started_at=NOW,
        ended_at=None,
    )
    return repository


def _golden_chain_shaped_submission(tmp_path: Path) -> tuple[
    MangaPlanningToolService, DomainToolRequest
]:
    """The exact live shape: page plans WITHOUT page_script and WITHOUT
    page_index, ids ``page_plan_0`` / ``page_plan_1`` (dump
    submit_thumbnail_set_..._9d5460ab..._20260809T005608Z)."""
    plan, script_set, page_plans = _phase1_scenario()
    repository = _seeded_repository(plan)
    planning = MangaPagePlanningService(repository, repository, media_root=tmp_path)
    script_artifact = resolve(
        planning.submit_page_script_set(
            run_id="run_phase1",
            stage_run_id="stage_page_writing",
            plan_artifact_id="manga_plan_phase1",
            script_set=script_set,
        )
    )
    assert script_artifact.validation_status == "accepted"

    context_payload = fixture("context_pack.v1.json")
    context_payload["purpose"] = "manga_thumbnail"
    context_payload["parent_artifacts"] = [
        {
            "artifact_id": script_artifact.artifact_id,
            "kind": "page_script_set",
            "schema_version": "page-script-set.v1",
            "content_hash": script_artifact.content_hash,
        }
    ]
    context_id = context_payload["context_pack_id"]
    repository.stages["stage_thumbnail"].input_artifact_ids = [context_id]
    repository.artifacts[context_id] = construct_document(
        ArtifactDoc,
        artifact_id=context_id,
        project_id="project_phase1",
        run_id="run_phase1",
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

    submitted_plans = []
    for index, page_plan in enumerate(page_plans):
        payload = page_plan.model_dump(mode="json")
        payload.pop("page_script")  # the live shape omits it
        payload["page_plan_id"] = f"page_plan_{index}"
        payload["script_set_artifact_id"] = script_artifact.artifact_id
        # NO page_index key — the wall-1 shape.
        submitted_plans.append(payload)

    request = DomainToolRequest.model_validate(
        {
            "arguments": {
                "thumbnail_set": {
                    "schema_version": "thumbnail-set.v1",
                    "thumbnail_set_id": "thumbnail_set_s8",
                    "project_id": "project_phase1",
                    "script_set_artifact_id": script_artifact.artifact_id,
                    "page_plans": submitted_plans,
                }
            },
            "scope": {
                "correlation_id": "correlation_s8",
                "goal_id": "goal_thumbnail_s8",
                "run_id": "run_phase1",
                "stage_run_id": "stage_thumbnail",
                "context_pack_id": context_id,
                "project_id": "project_phase1",
            },
        }
    )
    service = MangaPlanningToolService(repository, repository, media_root=tmp_path)
    return service, request


def test_seam_infers_missing_page_index_and_lands_the_golden_chain_shape(
    tmp_path: Path,
) -> None:
    service, request = _golden_chain_shaped_submission(tmp_path)
    response = resolve(service.execute("submit_thumbnail_set", request))
    assert isinstance(response.data, dict)
    assert response.data["artifact_id"].startswith("thumbnail_set_")
    assert response.data["image_cost_usd"] == 0


def test_seam_inference_prefers_explicit_page_index_when_present(
    tmp_path: Path,
) -> None:
    """An explicit page_index always wins over inference — swap the ids so
    inference WOULD mis-assign, and the explicit values still land."""
    service, request = _golden_chain_shaped_submission(tmp_path)
    thumbnail_set = cast(dict[str, Any], request.arguments["thumbnail_set"])
    plans = cast(list[dict[str, Any]], thumbnail_set["page_plans"])
    plans[0]["page_plan_id"] = "page_plan_9"  # digits lie; explicit index is 0
    plans[0]["page_index"] = 0
    plans[1]["page_index"] = 1
    response = resolve(service.execute("submit_thumbnail_set", request))
    assert isinstance(response.data, dict)
    assert response.data["artifact_id"].startswith("thumbnail_set_")


def test_validate_layout_draft_tolerates_in_plan_page_index(tmp_path: Path) -> None:
    """Resume #1's live wall: the v6 instructions mandate a top-level
    page_index INSIDE each submitted plan, and the submit seam pops it —
    but validate_layout_draft did not, so the exact shape the instructions
    demand failed extra_forbidden on ALL 8 draft iterations. The dump
    shape (page_index both beside AND inside the plan) must now validate."""
    service, request = _golden_chain_shaped_submission(tmp_path)
    thumbnail_set = cast(dict[str, Any], request.arguments["thumbnail_set"])
    plan_payload = cast(list[dict[str, Any]], thumbnail_set["page_plans"])[0]
    plan_payload = dict(plan_payload)
    plan_payload["page_index"] = 0  # the live dump shape
    request.arguments.clear()
    request.arguments["page_plan"] = plan_payload
    request.arguments["script_set_artifact_id"] = plan_payload["script_set_artifact_id"]
    request.arguments["page_index"] = 0

    response = resolve(service.execute("validate_layout_draft", request))
    assert isinstance(response.data, dict)
    assert "passed" in response.data  # data verdict, never extra_forbidden


def test_validate_layout_draft_argument_page_index_wins_disagreement(
    tmp_path: Path,
) -> None:
    """When the argument-level and in-plan page_index disagree, the
    argument wins (the in-plan value hydrating the WRONG page's script
    would mismatch every panel reference)."""
    service, request = _golden_chain_shaped_submission(tmp_path)
    thumbnail_set = cast(dict[str, Any], request.arguments["thumbnail_set"])
    plan_payload = dict(cast(list[dict[str, Any]], thumbnail_set["page_plans"])[0])
    plan_payload["page_index"] = 1  # lies — this layout belongs to page 0
    request.arguments.clear()
    request.arguments["page_plan"] = plan_payload
    request.arguments["script_set_artifact_id"] = plan_payload["script_set_artifact_id"]
    request.arguments["page_index"] = 0

    response = resolve(service.execute("validate_layout_draft", request))
    assert isinstance(response.data, dict)
    # Hydrated with page 0 (the argument) the layout compiles cleanly; had
    # the in-plan 1 won, page 1's panel ids would mismatch every node.
    assert response.data["passed"] is True


def test_validate_layout_draft_in_plan_index_is_the_fallback(tmp_path: Path) -> None:
    """A draft carrying page_index ONLY inside the plan (no argument) still
    hydrates — symmetric with the submit seam's tolerance."""
    service, request = _golden_chain_shaped_submission(tmp_path)
    thumbnail_set = cast(dict[str, Any], request.arguments["thumbnail_set"])
    plan_payload = dict(cast(list[dict[str, Any]], thumbnail_set["page_plans"])[0])
    plan_payload["page_index"] = 0
    request.arguments.clear()
    request.arguments["page_plan"] = plan_payload
    request.arguments["script_set_artifact_id"] = plan_payload["script_set_artifact_id"]

    response = resolve(service.execute("validate_layout_draft", request))
    assert isinstance(response.data, dict)
    assert response.data["passed"] is True


def test_normalize_page_plan_keeps_y_split_panel_order() -> None:
    """The 2-panel remap is axis-aware (Session 8): vertical reading order
    is unaffected by RTL, so a y-split keeps the earlier panel on TOP
    (children[0]); the unconditional [later, earlier] swap — correct only
    for x-splits — moved every authored text region out of its panel."""
    _, script_set, page_plans = _phase1_scenario()
    plan_payload = page_plans[0].model_dump(mode="json")
    plan_payload.pop("page_script")
    assert plan_payload["layout_root"]["axis"] == "y"

    normalized = MangaPlanningToolService._normalize_page_plan(
        plan_payload,
        page_script=script_set.pages[0],
        project_id="project_phase1",
        script_set_artifact_id="script_artifact_x",
    )
    children = normalized["layout_root"]["children"]
    panel_ids = [script_set.pages[0].panels[0].panel_id, script_set.pages[0].panels[1].panel_id]
    assert [children[0]["panel_id"], children[1]["panel_id"]] == panel_ids


def test_seam_rejects_out_of_range_inferred_index_with_clear_message(
    tmp_path: Path,
) -> None:
    import pytest

    from app.services.errors import ArtifactValidationError

    service, request = _golden_chain_shaped_submission(tmp_path)
    thumbnail_set = cast(dict[str, Any], request.arguments["thumbnail_set"])
    plans = cast(list[dict[str, Any]], thumbnail_set["page_plans"])
    plans[1]["page_plan_id"] = "page_plan_7"  # digits out of range, no explicit index
    with pytest.raises(ArtifactValidationError, match="non-negative page_index"):
        resolve(service.execute("submit_thumbnail_set", request))
