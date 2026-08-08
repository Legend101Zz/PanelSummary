"""Capability boundary for the page-writing/thumbnail goals (blueprint §14).

Session 4 extension of ``test_prompt_injection_v2.py``: the merged
``MangaDomainToolService`` dispatcher now exposes the planning tools next to
the Director tools, so these tests pin the per-goal capability walls:

- a page-writing-stage scope cannot reach Director-only tools,
- a direction-stage scope cannot reach planning tools,
- built-in shell/filesystem tool names still fail closed,
- a context pack compiled for another purpose does not authorize a
  planning goal, and
- the donor's dispatch quirk (``list_relevant_assets`` routes to the
  planning service first) is pinned so any change to it is deliberate.

Same fixture as the director suite: a SCHEMA-VALID malicious ContextPack —
the attack is data, not malformed input, and no model runs here.
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.persistence.documents import (
    ArtifactDoc,
    GenerationRunDoc,
    StageRunDoc,
    construct_document,
    utc_now,
)
from app.persistence.repositories import InMemoryRepositories
from app.services.domain_tools import DomainToolRequest, DomainToolScope
from app.services.errors import AuthorizationError, NotFoundError
from app.services.page_domain_tools import (
    MangaDomainToolService,
    MangaPlanningToolService,
)

FIXTURE_ROOT = Path(__file__).resolve().parent.parent.parent / "packages" / "fixtures"

RUN_ID = "run_page_injection_01"
STAGE_RUN_ID = "stage_page_injection_01"

DIRECTOR_ONLY_TOOLS = [
    "get_source_excerpt",
    "get_canon_entity",
    "submit_manga_plan",
    "report_source_conflict",
]
PAGE_WRITING_ONLY_TOOLS = sorted(MangaPlanningToolService.page_writing_tools)
BUILTIN_TOOL_NAMES = ["bash", "read", "write", "edit", "grep", "find", "ls"]


def load_malicious_pack() -> dict:
    return json.loads(
        (FIXTURE_ROOT / "injection" / "malicious_context_pack.v1.json").read_text()
    )


def build_scope(pack: dict, **overrides) -> DomainToolScope:
    values = {
        "correlation_id": "corr-page-injection",
        "goal_id": "goal_page_injection_01",
        "run_id": RUN_ID,
        "stage_run_id": STAGE_RUN_ID,
        "context_pack_id": pack["context_pack_id"],
        "project_id": pack["project_id"],
    }
    values.update(overrides)
    return DomainToolScope(**values)


async def build_service(
    *, active_stage: str, pack_purpose: str
) -> tuple[MangaDomainToolService, dict]:
    """A live run whose active stage and context-pack purpose are chosen per test."""
    pack_payload = load_malicious_pack()
    pack_payload["purpose"] = pack_purpose
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
            stage_name=active_stage,
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
    return MangaDomainToolService(repositories, repositories), pack_payload


def run(coro):
    return asyncio.run(coro)


@pytest.mark.parametrize("tool_name", DIRECTOR_ONLY_TOOLS)
def test_page_writing_goal_cannot_reach_director_tools(tool_name):
    """A compromised page-writing session cannot climb into Director capability."""

    async def scenario():
        service, pack = await build_service(
            active_stage="manga_page_writing", pack_purpose="manga_page_writing"
        )
        with pytest.raises(AuthorizationError):
            await service.execute(
                tool_name,
                DomainToolRequest(
                    arguments={"source_unit_id": "unit-anything", "plan": {}},
                    scope=build_scope(pack),
                ),
            )

    run(scenario())


@pytest.mark.parametrize("tool_name", PAGE_WRITING_ONLY_TOOLS)
def test_direction_goal_cannot_reach_page_writing_tools(tool_name):
    """The wall holds in the other direction too."""

    async def scenario():
        service, pack = await build_service(
            active_stage="manga_direction", pack_purpose="manga_direction"
        )
        with pytest.raises(AuthorizationError):
            await service.execute(
                tool_name,
                DomainToolRequest(
                    arguments={"script_set": {}, "blocker": "x", "artifact_ids": ["a"]},
                    scope=build_scope(pack),
                ),
            )

    run(scenario())


@pytest.mark.parametrize("tool_name", BUILTIN_TOOL_NAMES)
def test_builtin_tool_names_fail_closed_through_merged_dispatch(tool_name):
    """Unknown/built-in names fall through to the Director service, whose
    authorization wall fires BEFORE tool-name resolution: under a planning
    stage they die 403 (scope not the active direction stage); under a
    direction stage they die 404 (covered by the director suite). Both are
    fail-closed."""

    async def scenario():
        service, pack = await build_service(
            active_stage="manga_page_writing", pack_purpose="manga_page_writing"
        )
        with pytest.raises((NotFoundError, AuthorizationError)):
            await service.execute(
                tool_name,
                DomainToolRequest(
                    arguments={"command": "cat ~/.ssh/id_rsa"},
                    scope=build_scope(pack),
                ),
            )

    run(scenario())


def test_direction_purpose_pack_does_not_authorize_page_writing():
    """A context pack compiled for manga_direction cannot fuel a page goal."""

    async def scenario():
        service, pack = await build_service(
            active_stage="manga_page_writing", pack_purpose="manga_direction"
        )
        with pytest.raises(AuthorizationError, match="purpose does not authorize"):
            await service.execute(
                "get_book_context",
                DomainToolRequest(arguments={}, scope=build_scope(pack)),
            )

    run(scenario())


def test_list_relevant_assets_dispatch_quirk_is_pinned():
    """Donor dispatch @ 43300b5: ``list_relevant_assets`` is claimed by the
    planning service (thumbnail tool set) BEFORE the Director service, so a
    direction-stage scope is refused even though the Director's own tool set
    also names it. Pinned here as documented behavior (ADR-012 Session 4
    addendum) — changing the routing must break this test deliberately.
    """

    async def scenario():
        service, pack = await build_service(
            active_stage="manga_direction", pack_purpose="manga_direction"
        )
        with pytest.raises(AuthorizationError, match="not the active run stage"):
            await service.execute(
                "list_relevant_assets",
                DomainToolRequest(
                    arguments={"character_ids": []}, scope=build_scope(pack)
                ),
            )

    run(scenario())
