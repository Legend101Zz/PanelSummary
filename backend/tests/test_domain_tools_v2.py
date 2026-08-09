"""Manga Director domain-tool broker: authorization, bounds, and submission.

NEW tests (ADR-012). The donor's only coverage of
``MangaDirectorToolService`` lives in ScrollStack's whole-app
``test_vertical_slice.py``, which depends on the unported
``generation_workflow``; these tests exercise the verbatim-ported service
directly against ``InMemoryRepositories`` plus the canonical
``context_pack.v1`` fixture, so the same evidence shape is used on both
sides of the language boundary.
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

RUN_ID = "run_director_0001"
STAGE_RUN_ID = "stage_director_0001"
PROJECT_ID = "project_demo"
PACK_ID = "context_pack_001"


def load_pack_payload() -> dict:
    path = FIXTURE_ROOT / "canonical" / "context_pack.v1.json"
    return json.loads(path.read_text())


def build_scope(**overrides) -> DomainToolScope:
    values = {
        "correlation_id": "corr-1",
        "goal_id": "goal_director_0001",
        "run_id": RUN_ID,
        "stage_run_id": STAGE_RUN_ID,
        "context_pack_id": PACK_ID,
        "project_id": PROJECT_ID,
    }
    values.update(overrides)
    return DomainToolScope(**values)


async def build_service(
    *,
    run_status: str = "running",
    active_stage: str | None = "manga_direction",
    stage_status: str = "running",
    artifact_status: str = "accepted",
    pipeline_version: str = "manga-agentic.v1",
) -> MangaDirectorToolService:
    repositories = InMemoryRepositories()
    pack_payload = load_pack_payload()
    await repositories.save_run(
        construct_document(
            GenerationRunDoc,
            run_id=RUN_ID,
            project_id=PROJECT_ID,
            scope_id=pack_payload["scope_id"],
            requested_outputs=["manga"],
            pipeline_version=pipeline_version,
            memory_version=pack_payload["memory_version"],
            status=run_status,
            active_stage=active_stage,
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
            status=stage_status,
            input_artifact_ids=[PACK_ID],
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
            artifact_id=PACK_ID,
            project_id=PROJECT_ID,
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
            validation_status=artifact_status,
            validation_report={"passed": True},
            created_at=utc_now(),
        )
    )
    return MangaDirectorToolService(repositories, repositories)


def build_plan_payload(pack_payload: dict) -> dict:
    source_ref = pack_payload["source_units"][0]["source_ref"]
    fact_id = pack_payload["book_canon"]["facts"][0]["fact_id"]
    return {
        "schema_version": "manga-plan.v1",
        "plan_id": "plan_director_0001",
        "project_id": pack_payload["project_id"],
        "scope_id": pack_payload["scope_id"],
        "context_pack_id": pack_payload["context_pack_id"],
        "memory_version": pack_payload["memory_version"],
        "title": "The Map Remembers",
        "summary": "Kael reads the hidden layer and learns the map records failures.",
        "target_page_count": 1,
        "beats": [
            {
                "beat_id": "beat_0000",
                "sequence": 0,
                "source_refs": [source_ref],
                "required_fact_ids": [fact_id],
                "narrative_purpose": "reveal",
                "book_essence": "The map is a record of earlier failed journeys.",
                "dramatization": "Kael tilts the chart toward the lantern; hidden ink surfaces.",
                "character_intent": [],
                "visual_intent": ["hidden ink glowing under lantern light"],
                "must_preserve": ["The map records earlier failed journeys."],
                "may_compress": [],
                "confidence": 0.9,
            }
        ],
        "character_state_updates": [],
        "terminology_updates": [],
        "new_facts": [],
        "ending_state": "Kael understands the map is a warning.",
        "unresolved_thread_updates": [],
    }


def run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# authorization surface
# ---------------------------------------------------------------------------


def test_unknown_tool_fails_closed():
    async def scenario():
        service = await build_service()
        with pytest.raises(NotFoundError):
            await service.execute(
                "run_shell_command", DomainToolRequest(arguments={}, scope=build_scope())
            )

    run(scenario())


def test_cross_project_scope_is_denied():
    async def scenario():
        service = await build_service()
        with pytest.raises(AuthorizationError):
            await service.execute(
                "get_source_excerpt",
                DomainToolRequest(
                    arguments={"source_unit_id": "unit_ch01_p001_010"},
                    scope=build_scope(project_id="project_other"),
                ),
            )

    run(scenario())


def test_inactive_run_stage_is_denied():
    async def scenario():
        service = await build_service(run_status="succeeded", active_stage=None)
        with pytest.raises(AuthorizationError):
            await service.execute(
                "get_source_excerpt",
                DomainToolRequest(
                    arguments={"source_unit_id": "unit_ch01_p001_010"},
                    scope=build_scope(),
                ),
            )

    run(scenario())


def test_finished_stage_is_denied():
    async def scenario():
        service = await build_service(stage_status="succeeded")
        with pytest.raises(AuthorizationError):
            await service.execute(
                "get_source_excerpt",
                DomainToolRequest(
                    arguments={"source_unit_id": "unit_ch01_p001_010"},
                    scope=build_scope(),
                ),
            )

    run(scenario())


def test_unaccepted_context_pack_is_denied():
    async def scenario():
        service = await build_service(artifact_status="valid")
        with pytest.raises(AuthorizationError):
            await service.execute(
                "get_source_excerpt",
                DomainToolRequest(
                    arguments={"source_unit_id": "unit_ch01_p001_010"},
                    scope=build_scope(),
                ),
            )

    run(scenario())


# ---------------------------------------------------------------------------
# read tools
# ---------------------------------------------------------------------------


def test_get_source_excerpt_returns_bounded_evidence():
    async def scenario():
        service = await build_service()
        response = await service.execute(
            "get_source_excerpt",
            DomainToolRequest(
                arguments={"source_unit_id": "unit_ch01_p001_010"},
                scope=build_scope(),
            ),
        )
        assert response.data["excerpt"].startswith("The crew discovers")
        assert response.data["span"] == {"start": 0, "end": len(response.data["excerpt"])}

    run(scenario())


def test_get_source_excerpt_outside_pack_is_denied():
    async def scenario():
        service = await build_service()
        with pytest.raises(AuthorizationError):
            await service.execute(
                "get_source_excerpt",
                DomainToolRequest(
                    arguments={"source_unit_id": "unit_not_in_pack"},
                    scope=build_scope(),
                ),
            )

    run(scenario())


def test_get_source_excerpt_invalid_span_is_rejected():
    async def scenario():
        service = await build_service()
        with pytest.raises(ArtifactValidationError):
            await service.execute(
                "get_source_excerpt",
                DomainToolRequest(
                    arguments={
                        "source_unit_id": "unit_ch01_p001_010",
                        "span": {"start": 0, "end": 10_000_000},
                    },
                    scope=build_scope(),
                ),
            )

    run(scenario())


def test_get_canon_entity_round_trip_and_miss():
    async def scenario():
        service = await build_service()
        response = await service.execute(
            "get_canon_entity",
            DomainToolRequest(
                arguments={"entity_id": "fact_map_records_failures"},
                scope=build_scope(),
            ),
        )
        assert response.data["fact_id"] == "fact_map_records_failures"
        with pytest.raises(NotFoundError):
            await service.execute(
                "get_canon_entity",
                DomainToolRequest(
                    arguments={"entity_id": "fact_invented"},
                    scope=build_scope(),
                ),
            )

    run(scenario())


def test_list_relevant_assets_scopes_to_known_characters():
    async def scenario():
        service = await build_service()
        response = await service.execute(
            "list_relevant_assets",
            DomainToolRequest(
                arguments={"character_ids": ["character_kael"]},
                scope=build_scope(),
            ),
        )
        assets = response.data["assets"]
        assert [item["asset_id"] for item in assets] == [
            "asset_last_observatory_key_panel_v1"
        ]
        empty = await service.execute(
            "list_relevant_assets",
            DomainToolRequest(
                arguments={"character_ids": ["character_unknown"]},
                scope=build_scope(),
            ),
        )
        assert empty.data["assets"] == []

    run(scenario())


# ---------------------------------------------------------------------------
# submission validation
# ---------------------------------------------------------------------------


def test_submit_manga_plan_accepts_grounded_candidate():
    async def scenario():
        service = await build_service()
        pack_payload = load_pack_payload()
        plan_payload = build_plan_payload(pack_payload)
        response = await service.execute(
            "submit_manga_plan",
            DomainToolRequest(arguments={"plan": plan_payload}, scope=build_scope()),
        )
        assert response.candidate == plan_payload
        stored = await service._artifacts.get_artifact(response.data["artifact_id"])
        assert stored is not None
        assert stored.kind == "manga_plan"
        assert stored.validation_status == "valid"
        assert stored.parent_artifact_ids == [PACK_ID]

    run(scenario())


def test_submit_manga_plan_rejects_identity_mismatch():
    async def scenario():
        service = await build_service()
        plan_payload = build_plan_payload(load_pack_payload())
        plan_payload["memory_version"] = 99
        with pytest.raises(AuthorizationError):
            await service.execute(
                "submit_manga_plan",
                DomainToolRequest(arguments={"plan": plan_payload}, scope=build_scope()),
            )

    run(scenario())


def test_submit_manga_plan_rejects_forged_source_evidence():
    async def scenario():
        service = await build_service()
        plan_payload = build_plan_payload(load_pack_payload())
        forged = dict(plan_payload["beats"][0]["source_refs"][0])
        forged["text_hash"] = "b" * 64
        plan_payload["beats"][0]["source_refs"] = [forged]
        with pytest.raises(AuthorizationError):
            await service.execute(
                "submit_manga_plan",
                DomainToolRequest(arguments={"plan": plan_payload}, scope=build_scope()),
            )

    run(scenario())


def test_submit_manga_plan_requires_every_context_fact():
    async def scenario():
        service = await build_service()
        plan_payload = build_plan_payload(load_pack_payload())
        plan_payload["beats"][0]["required_fact_ids"] = []
        with pytest.raises(ArtifactValidationError):
            await service.execute(
                "submit_manga_plan",
                DomainToolRequest(arguments={"plan": plan_payload}, scope=build_scope()),
            )

    run(scenario())


def test_submit_manga_plan_enforces_page_budget():
    async def scenario():
        service = await build_service()
        plan_payload = build_plan_payload(load_pack_payload())
        plan_payload["target_page_count"] = 99  # pack constraints cap at 8
        with pytest.raises(ArtifactValidationError):
            await service.execute(
                "submit_manga_plan",
                DomainToolRequest(arguments={"plan": plan_payload}, scope=build_scope()),
            )

    run(scenario())


def test_submit_manga_plan_normalizes_the_m3_tool_frame_artifacts():
    """S7 golden-run live shape: the DIRECTION seam receives the same
    transport mangling as planning — every empty list arrives as "" (17
    list_type errors on the first live chain direction submission). The
    seam unwraps it losslessly and the grounded candidate is accepted."""

    def wrap(value):
        if isinstance(value, dict):
            return {key: wrap(item) for key, item in value.items()}
        if isinstance(value, list):
            if not value:
                return ""  # the live empty-element artifact
            wrapped = [wrap(item) for item in value]
            return {"item": wrapped[0] if len(wrapped) == 1 else wrapped}
        return value

    async def scenario():
        service = await build_service()
        pack_payload = load_pack_payload()
        plan_payload = build_plan_payload(pack_payload)
        response = await service.execute(
            "submit_manga_plan",
            DomainToolRequest(
                arguments={"plan": wrap(plan_payload)}, scope=build_scope()
            ),
        )
        assert response.candidate == plan_payload
        stored = await service._artifacts.get_artifact(response.data["artifact_id"])
        assert stored is not None
        assert stored.validation_status == "valid"

    run(scenario())
