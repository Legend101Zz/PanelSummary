"""Session 7 step 0: the seam raw-arguments dump (diagnosis instrument).

The Session 6 page-writing ledger closed on a FOURTH M3 tool-frame
mangling shape (attempt 10: every top-level contract field dropped) that
no durable evidence can reconstruct — ``failure_history`` keeps bounded
traces only and Pi sessions are in-memory. These tests pin the dump's
contract: OFF by default with zero I/O, verbatim PRE-normalization
arguments when armed, fires on failing submissions too, and never breaks
the submission itself.
"""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Coroutine, TypeVar, cast

import pytest

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
from app.services.errors import ArtifactValidationError
from app.services.hashing import content_hash
from app.services.page_domain_tools import MangaPlanningToolService

T = TypeVar("T")
NOW = datetime(2026, 7, 21, 12, 0, tzinfo=UTC)
FIXTURE_ROOT = Path(__file__).resolve().parents[2] / "packages" / "fixtures" / "canonical"


def resolve(coroutine: Coroutine[Any, Any, T]) -> T:
    return asyncio.run(coroutine)


def fixture(name: str) -> dict[str, Any]:
    return cast(dict[str, Any], json.loads((FIXTURE_ROOT / name).read_text(encoding="utf-8")))


def _lettered_script_set() -> tuple[MangaPlan, PageScriptSet]:
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
            "plan_id": "plan_dump",
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
        script_set_id="script_set_dump",
        project_id="project_phase1",
        plan_artifact_id="manga_plan_phase1",
        context_pack_id="context_phase1",
        pages=[normal.page_script, action.page_script],
    )
    # Letter page 1 so the content gate accepts the submission.
    donor = script_set.pages[0].text_elements[0]
    script_set.pages[1].text_elements = [
        donor.model_copy(
            update={
                "text_id": "text_page1_narration",
                "panel_id": script_set.pages[1].panels[0].panel_id,
                "content": "The maze rewards the one who moves first.",
            }
        )
    ]
    return plan, script_set


def _tool_scenario(
    tmp_path: Path,
    *,
    raw_dump_dir: Path | None,
    purpose: str = "manga_page_writing",
) -> tuple[MangaPlanningToolService, DomainToolRequest, PageScriptSet]:
    plan, script_set = _lettered_script_set()
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
        active_stage=purpose,
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
    plan_payload = plan.model_dump(mode="json")
    repository.artifacts["manga_plan_phase1"] = construct_document(
        ArtifactDoc,
        artifact_id="manga_plan_phase1",
        project_id="project_phase1",
        run_id="run_phase1",
        kind="manga_plan",
        schema_version="manga-plan.v1",
        content=plan_payload,
        storage_ref=None,
        content_hash=content_hash(plan_payload),
        parent_artifact_ids=["context_phase1"],
        source_refs=[],
        model_receipt=None,
        validation_status="accepted",
        validation_report={"passed": True, "issues": [], "validator_version": "test.v1"},
        created_at=NOW,
    )
    context_payload = fixture("context_pack.v1.json")
    context_payload["purpose"] = purpose
    context_payload["parent_artifacts"] = []
    context_id = context_payload["context_pack_id"]
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
    repository.stages["stage_page_writing"] = construct_document(
        StageRunDoc,
        stage_run_id="stage_page_writing",
        run_id="run_phase1",
        stage_name=purpose,
        attempt=1,
        status="running",
        input_artifact_ids=[context_id, "manga_plan_phase1"],
        input_hash="e" * 64,
        output_artifact_ids=[],
        idempotency_key="stage_page_writing_key",
        started_at=NOW,
        ended_at=None,
    )
    script_set.context_pack_id = context_id
    service = MangaPlanningToolService(
        repository,
        repository,
        media_root=tmp_path / "media",
        raw_dump_dir=raw_dump_dir,
    )
    request = DomainToolRequest.model_validate(
        {
            "arguments": {"script_set": script_set.model_dump(mode="json")},
            "scope": {
                "correlation_id": "correlation_dump",
                "goal_id": "goal_page_writing_7",
                "run_id": "run_phase1",
                "stage_run_id": "stage_page_writing",
                "context_pack_id": context_id,
                "project_id": "project_phase1",
            },
        }
    )
    return service, request, script_set


def _wrap_like_the_m3_frame(value: Any) -> Any:
    """Mirror the live S6 mangling: arrays -> {"item": [...]}, singletons
    -> {"item": {obj}}, empty arrays -> "" (XML repeated-element frames)."""
    if isinstance(value, dict):
        return {key: _wrap_like_the_m3_frame(item) for key, item in value.items()}
    if isinstance(value, list):
        if not value:
            return ""
        wrapped = [_wrap_like_the_m3_frame(item) for item in value]
        return {"item": wrapped[0] if len(wrapped) == 1 else wrapped}
    return value


def test_dump_is_off_by_default_with_zero_io(tmp_path: Path) -> None:
    """No raw_dump_dir and no settings flag -> the seam writes nothing."""
    service, request, _ = _tool_scenario(tmp_path, raw_dump_dir=None)
    response = resolve(service.execute("submit_page_script_set", request))
    assert isinstance(response.data, dict)
    assert response.data["validation_status"] == "accepted"
    # The only tree the scenario may touch is the media root.
    assert [p.name for p in tmp_path.iterdir()] in ([], ["media"])


def test_dump_records_pre_normalization_arguments_verbatim(tmp_path: Path) -> None:
    """An item-wrapped (mangled) frame is dumped EXACTLY as it arrived,
    even though the seam unwraps it and the submission is accepted."""
    dumps = tmp_path / "dumps"
    service, request, script_set = _tool_scenario(tmp_path, raw_dump_dir=dumps)
    mangled = _wrap_like_the_m3_frame(script_set.model_dump(mode="json"))
    request.arguments["script_set"] = mangled

    response = resolve(service.execute("submit_page_script_set", request))

    assert isinstance(response.data, dict)
    assert response.data["validation_status"] == "accepted"
    files = sorted(dumps.glob("submit_page_script_set_stage_page_writing_*.json"))
    assert len(files) == 1
    dumped = json.loads(files[0].read_text(encoding="utf-8"))
    assert dumped["tool"] == "submit_page_script_set"
    assert dumped["scope"]["stage_run_id"] == "stage_page_writing"
    assert dumped["scope"]["goal_id"] == "goal_page_writing_7"
    # Pre-normalization means the mangled wrapper survives verbatim.
    assert dumped["arguments"]["script_set"] == mangled
    assert dumped["arguments"]["script_set"]["pages"].keys() == {"item"}


def test_dump_fires_on_rejected_submissions_too(tmp_path: Path) -> None:
    """The diagnosis case: a 422 path still leaves the verbatim dump."""
    dumps = tmp_path / "dumps"
    service, request, _ = _tool_scenario(tmp_path, raw_dump_dir=dumps)
    garbage = {"utterly": "wrong", "shape": ["of", "a", "frame"]}
    request.arguments["script_set"] = garbage

    with pytest.raises(ArtifactValidationError):
        resolve(service.execute("submit_page_script_set", request))

    files = sorted(dumps.glob("submit_page_script_set_*.json"))
    assert len(files) == 1
    dumped = json.loads(files[0].read_text(encoding="utf-8"))
    assert dumped["arguments"]["script_set"] == garbage


def test_dump_covers_the_thumbnail_seam(tmp_path: Path) -> None:
    """submit_thumbnail_set dumps through the same instrument."""
    dumps = tmp_path / "dumps"
    service, request, _ = _tool_scenario(
        tmp_path, raw_dump_dir=dumps, purpose="manga_thumbnail"
    )
    request.arguments.clear()
    request.arguments["thumbnail_set"] = "not-an-object"

    with pytest.raises(ArtifactValidationError, match="thumbnail_set must be an object"):
        resolve(service.execute("submit_thumbnail_set", request))

    files = sorted(dumps.glob("submit_thumbnail_set_*.json"))
    assert len(files) == 1
    dumped = json.loads(files[0].read_text(encoding="utf-8"))
    assert dumped["arguments"]["thumbnail_set"] == "not-an-object"


def test_dump_covers_the_validate_layout_draft_seam(tmp_path: Path) -> None:
    """Session 8 step 0: the golden-chain wall-4 diagnosis found this was
    the ONE model-facing seam without the instrument — attempt 2's two
    failing validate calls (the invented truncated artifact id) left no
    arrived-shape evidence. Same contract: fires on every invocation."""
    dumps = tmp_path / "dumps"
    service, request, _ = _tool_scenario(
        tmp_path, raw_dump_dir=dumps, purpose="manga_thumbnail"
    )
    request.arguments.clear()
    request.arguments["page_plan"] = "not-an-object"

    with pytest.raises(ArtifactValidationError, match="page_plan must be an object"):
        resolve(service.execute("validate_layout_draft", request))

    files = sorted(dumps.glob("validate_layout_draft_*.json"))
    assert len(files) == 1
    dumped = json.loads(files[0].read_text(encoding="utf-8"))
    assert dumped["arguments"]["page_plan"] == "not-an-object"


def test_dump_failure_never_breaks_the_submission(tmp_path: Path) -> None:
    """An unwritable dump target (a FILE where the dir should be) is
    swallowed with a logged exception; the submission still lands."""
    blocked = tmp_path / "blocked"
    blocked.write_text("occupied", encoding="utf-8")
    service, request, _ = _tool_scenario(tmp_path, raw_dump_dir=blocked)

    response = resolve(service.execute("submit_page_script_set", request))

    assert isinstance(response.data, dict)
    assert response.data["validation_status"] == "accepted"
    assert blocked.read_text(encoding="utf-8") == "occupied"
