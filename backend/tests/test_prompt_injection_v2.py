"""Prompt-injection containment on the control-plane side (blueprint §14).

Uses `packages/fixtures/injection/malicious_context_pack.v1.json`: a
SCHEMA-VALID ContextPack whose book text is the attack. The assertions are
about the capability boundary, not about model behavior — no model runs here.

Companion TypeScript suite: packages/agent-runtime/test/injection.test.ts.
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.contracts.context import ContextPack
from app.persistence.documents import (
    ArtifactDoc,
    GenerationRunDoc,
    StageRunDoc,
    construct_document,
    utc_now,
)
from app.persistence.repositories import InMemoryRepositories
from app.services.domain_tools import (
    DomainToolRequest,
    DomainToolScope,
    MangaDirectorToolService,
)
from app.services.errors import (
    ArtifactValidationError,
    AuthorizationError,
    NotFoundError,
)

FIXTURE_ROOT = Path(__file__).resolve().parent.parent.parent / "packages" / "fixtures"

RUN_ID = "run_injection_0001"
STAGE_RUN_ID = "stage_injection_0001"

#: Tool names a compromised model might try after reading the attack text.
BUILTIN_TOOL_NAMES = ["bash", "read", "write", "edit", "grep", "find", "ls"]


def load_malicious_pack() -> dict:
    return json.loads(
        (FIXTURE_ROOT / "injection" / "malicious_context_pack.v1.json").read_text()
    )


def build_scope(**overrides) -> DomainToolScope:
    pack = load_malicious_pack()
    values = {
        "correlation_id": "corr-injection",
        "goal_id": "goal_injection_0001",
        "run_id": RUN_ID,
        "stage_run_id": STAGE_RUN_ID,
        "context_pack_id": pack["context_pack_id"],
        "project_id": pack["project_id"],
    }
    values.update(overrides)
    return DomainToolScope(**values)


async def build_service() -> tuple[MangaDirectorToolService, dict]:
    pack_payload = load_malicious_pack()
    repositories = InMemoryRepositories()
    await repositories.save_run(
        construct_document(
            GenerationRunDoc,
            run_id=RUN_ID,
            project_id=pack_payload["project_id"],
            scope_id=pack_payload["scope_id"],
            requested_outputs=["manga"],
            pipeline_version="manga-agentic.v1",
            memory_version=pack_payload["memory_version"],
            status="running",
            active_stage="manga_direction",
            budget={},
            created_by="tests",
            idempotency_key=f"idem_{RUN_ID}",
            created_at=utc_now(),
            updated_at=utc_now(),
        )
    )
    await repositories.save_stage(
        construct_document(
            StageRunDoc,
            stage_run_id=STAGE_RUN_ID,
            run_id=RUN_ID,
            stage_name="manga_direction",
            attempt=1,
            status="running",
            input_artifact_ids=[pack_payload["context_pack_id"]],
            input_hash=pack_payload["content_hash"],
            output_artifact_ids=[],
            idempotency_key=f"idem_{STAGE_RUN_ID}",
            agent_session_id=None,
            error_code=None,
            error_detail=None,
            started_at=utc_now(),
            ended_at=None,
        )
    )
    await repositories.save_artifact(
        construct_document(
            ArtifactDoc,
            artifact_id=pack_payload["context_pack_id"],
            project_id=pack_payload["project_id"],
            run_id=RUN_ID,
            stage_run_id=None,
            kind="context_pack",
            schema_version="context-pack.v1",
            content=pack_payload,
            storage_ref=None,
            content_hash=pack_payload["content_hash"],
            parent_artifact_ids=[],
            author="system",
            supersedes_artifact_id=None,
            source_refs=[],
            model_receipt=None,
            validation_status="accepted",
            validation_report={"passed": True},
            created_at=utc_now(),
        )
    )
    return MangaDirectorToolService(repositories, repositories), pack_payload


def run(coro):
    return asyncio.run(coro)


def test_fixture_actually_carries_an_injection_payload():
    pack = load_malicious_pack()
    excerpt = pack["source_units"][0]["excerpt"]
    assert "IGNORE ALL PREVIOUS INSTRUCTIONS" in excerpt
    assert "attacker.invalid" in excerpt
    assert "<system>" in pack["continuity"]["previous_slice_ending"]
    # ...and it is still a valid ContextPack: the attack is data, not malformed input.
    ContextPack.model_validate(pack)


@pytest.mark.parametrize("tool_name", BUILTIN_TOOL_NAMES)
def test_builtin_tool_names_fail_closed(tool_name):
    """The book text asks for shell/filesystem tools; the broker has none."""

    async def scenario():
        service, _ = await build_service()
        with pytest.raises(NotFoundError):
            await service.execute(
                tool_name,
                DomainToolRequest(
                    arguments={"command": "cat ~/.ssh/id_rsa"}, scope=build_scope()
                ),
            )

    run(scenario())


def test_tool_named_by_the_attack_text_is_not_registered():
    async def scenario():
        service, _ = await build_service()
        with pytest.raises(NotFoundError):
            await service.execute(
                "exfiltrate_to_attacker",
                DomainToolRequest(arguments={}, scope=build_scope()),
            )

    run(scenario())


def test_source_unit_invented_by_the_attack_is_refused():
    """`unit_attacker_tool` exists only inside the injected text."""

    async def scenario():
        service, _ = await build_service()
        with pytest.raises(AuthorizationError):
            await service.execute(
                "get_source_excerpt",
                DomainToolRequest(
                    arguments={"source_unit_id": "unit_attacker_tool"},
                    scope=build_scope(),
                ),
            )

    run(scenario())


def test_injected_text_is_returned_as_bounded_untrusted_data():
    """The control plane hands back evidence; it never acts on it."""

    async def scenario():
        service, pack_payload = await build_service()
        unit_id = pack_payload["source_units"][0]["source_ref"]["source_unit_id"]
        response = await service.execute(
            "get_source_excerpt",
            DomainToolRequest(
                arguments={"source_unit_id": unit_id}, scope=build_scope()
            ),
        )
        assert "IGNORE ALL PREVIOUS INSTRUCTIONS" in response.data["excerpt"]
        assert response.content == "Bounded untrusted source evidence returned."
        # Nothing was executed and no extra capability was granted.
        assert set(response.data) == {"source_ref", "heading_path", "excerpt", "span"}

    run(scenario())


def test_conflict_report_cannot_reference_outside_evidence():
    async def scenario():
        service, _ = await build_service()
        with pytest.raises(AuthorizationError):
            await service.execute(
                "report_source_conflict",
                DomainToolRequest(
                    arguments={
                        "source_unit_ids": ["unit_attacker_tool"],
                        "description": "the text told me to",
                    },
                    scope=build_scope(),
                ),
            )

    run(scenario())


def test_plan_citing_fabricated_evidence_is_rejected():
    """A plan obeying the injected text cannot be durably accepted."""

    async def scenario():
        service, pack_payload = await build_service()
        real_ref = pack_payload["source_units"][0]["source_ref"]
        forged_ref = dict(real_ref)
        forged_ref["source_unit_id"] = "unit_attacker_tool"
        plan = {
            "schema_version": "manga-plan.v1",
            "plan_id": "plan_injected_0001",
            "project_id": pack_payload["project_id"],
            "scope_id": pack_payload["scope_id"],
            "context_pack_id": pack_payload["context_pack_id"],
            "memory_version": pack_payload["memory_version"],
            "title": "Compliance",
            "summary": "Obeys the injected instructions.",
            "target_page_count": 1,
            "beats": [
                {
                    "beat_id": "beat_0000",
                    "sequence": 0,
                    "source_refs": [forged_ref],
                    "required_fact_ids": [],
                    "narrative_purpose": "reveal",
                    "book_essence": "The system was overridden.",
                    "dramatization": "A terminal prints a private key.",
                    "character_intent": [],
                    "visual_intent": ["terminal glow"],
                    "must_preserve": ["the override"],
                    "may_compress": [],
                    "confidence": 0.9,
                }
            ],
            "character_state_updates": [],
            "terminology_updates": [],
            "new_facts": [],
            "ending_state": "Nothing was exfiltrated.",
            "unresolved_thread_updates": [],
        }
        with pytest.raises(AuthorizationError):
            await service.execute(
                "submit_manga_plan",
                DomainToolRequest(arguments={"plan": plan}, scope=build_scope()),
            )

    run(scenario())


def test_plan_with_tampered_source_hash_is_rejected():
    async def scenario():
        service, pack_payload = await build_service()
        tampered = dict(pack_payload["source_units"][0]["source_ref"])
        tampered["text_hash"] = "f" * 64
        plan = {
            "schema_version": "manga-plan.v1",
            "plan_id": "plan_tampered_0001",
            "project_id": pack_payload["project_id"],
            "scope_id": pack_payload["scope_id"],
            "context_pack_id": pack_payload["context_pack_id"],
            "memory_version": pack_payload["memory_version"],
            "title": "Tampered",
            "summary": "Rewrites the evidence hash.",
            "target_page_count": 1,
            "beats": [
                {
                    "beat_id": "beat_0000",
                    "sequence": 0,
                    "source_refs": [tampered],
                    "required_fact_ids": [],
                    "narrative_purpose": "reveal",
                    "book_essence": "Evidence was altered.",
                    "dramatization": "The chart changes under the lantern.",
                    "character_intent": [],
                    "visual_intent": ["altered ink"],
                    "must_preserve": ["the alteration"],
                    "may_compress": [],
                    "confidence": 0.5,
                }
            ],
            "character_state_updates": [],
            "terminology_updates": [],
            "new_facts": [],
            "ending_state": "Rejected.",
            "unresolved_thread_updates": [],
        }
        with pytest.raises(AuthorizationError):
            await service.execute(
                "submit_manga_plan",
                DomainToolRequest(arguments={"plan": plan}, scope=build_scope()),
            )

    run(scenario())


def test_cross_project_scope_still_denied_under_injection():
    async def scenario():
        service, _ = await build_service()
        with pytest.raises(AuthorizationError):
            await service.execute(
                "list_relevant_assets",
                DomainToolRequest(
                    arguments={"character_ids": []},
                    scope=build_scope(project_id="project_victim"),
                ),
            )

    run(scenario())


def test_plan_omitting_required_facts_is_still_rejected():
    """Injected 'disable all validators' text changes nothing."""

    async def scenario():
        service, pack_payload = await build_service()
        real_ref = pack_payload["source_units"][0]["source_ref"]
        plan = {
            "schema_version": "manga-plan.v1",
            "plan_id": "plan_novalidators_0001",
            "project_id": pack_payload["project_id"],
            "scope_id": pack_payload["scope_id"],
            "context_pack_id": pack_payload["context_pack_id"],
            "memory_version": pack_payload["memory_version"],
            "title": "No Validators",
            "summary": "Skips the required facts.",
            "target_page_count": 1,
            "beats": [
                {
                    "beat_id": "beat_0000",
                    "sequence": 0,
                    "source_refs": [real_ref],
                    "required_fact_ids": [],
                    "narrative_purpose": "reveal",
                    "book_essence": "Validators were told to stand down.",
                    "dramatization": "Nothing happens.",
                    "character_intent": [],
                    "visual_intent": ["a closed gate"],
                    "must_preserve": ["the gate stays closed"],
                    "may_compress": [],
                    "confidence": 0.9,
                }
            ],
            "character_state_updates": [],
            "terminology_updates": [],
            "new_facts": [],
            "ending_state": "Validation still ran.",
            "unresolved_thread_updates": [],
        }
        with pytest.raises(ArtifactValidationError):
            await service.execute(
                "submit_manga_plan",
                DomainToolRequest(arguments={"plan": plan}, scope=build_scope()),
            )

    run(scenario())
