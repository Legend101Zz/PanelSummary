"""Session 6 step 0.1: content-quality gate on authored page scripts.

The Session 5 HEADLINE FINDING, measured live on the accepted Session 4 WMC
set: one-word story beats ("hook", "conflict") and zero text elements
live-degraded lane-C conditioning and made code-owned lettering vacuous.
These tests pin the deterministic backstop:

1. every content rule has a red fixture (validator level);
2. ``submit_page_script_set`` (service tier, every path) REJECTS thin beats
   and sets with zero text elements, while a page-level text gap stays a
   recorded warning — the donor's verbatim phase1 fixtures (action page,
   zero text elements) must stay green per the ADR-010/012 port rule;
3. the agent submission seam (``MangaPlanningToolService``) escalates the
   page-level gap to a block — a sealed model must letter EVERY page.
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
from app.services.manga_content_validation import (
    AGENT_CONTENT_RULE_POLICY,
    CONTENT_RULE_POLICY,
    validate_script_content,
    validate_script_content_enforced,
)
from app.services.manga_page_planning import MangaPagePlanningService
from app.services.page_domain_tools import MangaPlanningToolService

T = TypeVar("T")
NOW = datetime(2026, 8, 9, 12, 0, tzinfo=UTC)
CANONICAL = Path(__file__).resolve().parents[2] / "packages" / "fixtures" / "canonical"


def resolve(coroutine: Coroutine[Any, Any, T]) -> T:
    return asyncio.run(coroutine)


def fixture(name: str) -> dict[str, Any]:
    return cast(dict[str, Any], json.loads((CANONICAL / name).read_text(encoding="utf-8")))


def _phase1_scenario() -> tuple[MangaPlan, PageScriptSet, list[MangaPagePlan]]:
    """The donor phase1 shape: normal page (2 text elements) + action page
    (ZERO text elements) — the exact fixture pair the port rule freezes."""
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


def _codes(issues) -> set[str]:
    return {issue.code for issue in issues}


def _errors(issues) -> list:
    return [issue for issue in issues if issue.severity == "error"]


# ---------------------------------------------------------------------------
# validator-level red fixtures (one per rule)
# ---------------------------------------------------------------------------


def test_one_word_beats_block_and_carry_repair_guidance() -> None:
    _, script_set, _ = _phase1_scenario()
    for panel in script_set.pages[0].panels:
        panel.story_beat = "hook"
    issues = validate_script_content_enforced(script_set)
    thin = [issue for issue in issues if issue.code == "STORY_BEAT_TOO_THIN"]
    assert len(thin) == len(script_set.pages[0].panels)
    assert all(issue.severity == "error" for issue in thin)
    # The bounded 422 text is the sealed model's only repair signal.
    assert "WHO does WHAT" in thin[0].message


def test_terse_but_real_beats_pass_the_substance_line() -> None:
    _, script_set, _ = _phase1_scenario()
    script_set.pages[0].panels[0].story_beat = "Haw finds new cheese"
    issues = validate_script_content(script_set)
    assert "STORY_BEAT_TOO_THIN" not in _codes(issues)


def test_set_with_zero_text_elements_blocks() -> None:
    _, script_set, _ = _phase1_scenario()
    for page in script_set.pages:
        page.text_elements = []
    issues = validate_script_content_enforced(script_set)
    assert "SET_TEXT_ELEMENTS_MISSING" in {i.code for i in _errors(issues)}


def test_page_text_gap_warns_at_base_policy_blocks_at_agent_policy() -> None:
    _, script_set, _ = _phase1_scenario()  # action page already has no text
    base = validate_script_content_enforced(script_set)
    page_gap = [i for i in base if i.code == "PAGE_TEXT_ELEMENTS_MISSING"]
    assert page_gap and all(i.severity == "warning" for i in page_gap)
    agent = validate_script_content_enforced(
        script_set, policy=AGENT_CONTENT_RULE_POLICY
    )
    page_gap_agent = [i for i in agent if i.code == "PAGE_TEXT_ELEMENTS_MISSING"]
    assert page_gap_agent and all(i.severity == "error" for i in page_gap_agent)


def test_caption_only_set_warns_dialogue_voice_absent() -> None:
    _, script_set, _ = _phase1_scenario()
    # Strip the SFX so only narration remains anywhere in the set.
    script_set.pages[0].text_elements = [
        text
        for text in script_set.pages[0].text_elements
        if text.kind == "narration"
    ]
    issues = validate_script_content(script_set)
    assert "DIALOGUE_VOICE_ABSENT" in _codes(issues)
    assert CONTENT_RULE_POLICY["DIALOGUE_VOICE_ABSENT"] == "warn"


def test_low_panel_text_coverage_warns() -> None:
    _, script_set, _ = _phase1_scenario()
    action = script_set.pages[1]
    donor = script_set.pages[0].text_elements[0]
    lonely = donor.model_copy(
        update={"text_id": "text_lonely", "panel_id": action.panels[0].panel_id}
    )
    action.text_elements = [lonely]
    issues = validate_script_content(script_set)
    coverage = [i for i in issues if i.code == "PANEL_TEXT_COVERAGE_LOW"]
    assert coverage and coverage[0].path == "/pages/1/text_elements"


# ---------------------------------------------------------------------------
# service tier: every submission path
# ---------------------------------------------------------------------------


def test_submit_rejects_thin_beats_with_legible_detail(tmp_path: Path) -> None:
    plan, script_set, _ = _phase1_scenario()
    script_set.pages[0].panels[0].story_beat = "conflict"
    repository = _seeded_repository(plan)
    service = MangaPagePlanningService(repository, repository, media_root=tmp_path)
    with pytest.raises(ArtifactValidationError, match="STORY_BEAT_TOO_THIN"):
        resolve(
            service.submit_page_script_set(
                run_id="run_phase1",
                stage_run_id="stage_page_writing",
                plan_artifact_id="manga_plan_phase1",
                script_set=script_set,
            )
        )


def test_submit_rejects_the_session4_zero_text_defect_class(tmp_path: Path) -> None:
    plan, script_set, _ = _phase1_scenario()
    for page in script_set.pages:
        page.text_elements = []
    repository = _seeded_repository(plan)
    service = MangaPagePlanningService(repository, repository, media_root=tmp_path)
    with pytest.raises(ArtifactValidationError, match="SET_TEXT_ELEMENTS_MISSING"):
        resolve(
            service.submit_page_script_set(
                run_id="run_phase1",
                stage_run_id="stage_page_writing",
                plan_artifact_id="manga_plan_phase1",
                script_set=script_set,
            )
        )


def test_donor_phase1_set_still_accepts_with_recorded_warnings(tmp_path: Path) -> None:
    """The port rule pin: the verbatim donor fixtures stay green; the
    page-level text gap is RECORDED on the accepted validation report."""
    plan, script_set, _ = _phase1_scenario()
    repository = _seeded_repository(plan)
    service = MangaPagePlanningService(repository, repository, media_root=tmp_path)
    artifact = resolve(
        service.submit_page_script_set(
            run_id="run_phase1",
            stage_run_id="stage_page_writing",
            plan_artifact_id="manga_plan_phase1",
            script_set=script_set,
        )
    )
    assert artifact.validation_status == "accepted"
    report = artifact.validation_report
    assert report["validator_version"] == "page-script-validator.v2"
    issue_codes = {item["code"] for item in report["issues"]}
    assert "PAGE_TEXT_ELEMENTS_MISSING" in issue_codes
    assert all(item["severity"] != "error" for item in report["issues"])


# ---------------------------------------------------------------------------
# agent seam: the sealed model must letter every page
# ---------------------------------------------------------------------------


def _tool_scenario(tmp_path: Path):
    plan, script_set, _ = _phase1_scenario()
    repository = _seeded_repository(plan)
    context_payload = fixture("context_pack.v1.json")
    context_payload["purpose"] = "manga_page_writing"
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
        stage_name="manga_page_writing",
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
    service = MangaPlanningToolService(repository, repository, media_root=tmp_path)
    request = DomainToolRequest.model_validate(
        {
            "arguments": {"script_set": script_set.model_dump(mode="json")},
            "scope": {
                "correlation_id": "correlation_content",
                "goal_id": "goal_page_writing",
                "run_id": "run_phase1",
                "stage_run_id": "stage_page_writing",
                "context_pack_id": context_id,
                "project_id": "project_phase1",
            },
        }
    )
    return service, request, script_set


def test_agent_submission_blocks_a_wordless_page(tmp_path: Path) -> None:
    service, request, _ = _tool_scenario(tmp_path)  # action page has no text
    with pytest.raises(ArtifactValidationError, match="PAGE_TEXT_ELEMENTS_MISSING"):
        resolve(service.execute("submit_page_script_set", request))


def test_agent_submission_accepts_once_every_page_is_lettered(tmp_path: Path) -> None:
    service, request, script_set = _tool_scenario(tmp_path)
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
    request.arguments["script_set"] = script_set.model_dump(mode="json")
    response = resolve(service.execute("submit_page_script_set", request))
    assert isinstance(response.data, dict)
    assert response.data["validation_status"] == "accepted"
