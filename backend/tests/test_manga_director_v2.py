"""Manga Director driver: goal lifecycle, broker round-trip, receipts (ADR-012).

NEW tests. The fake agent worker used here submits its candidate through the
REAL ported ``MangaDirectorToolService`` — exactly what the sealed Node
worker does over HTTP — so the driver's acceptance path (candidate must be
durably validated by the broker, receipt must match the provider policy) is
exercised end to end in-process.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from beanie import PydanticObjectId

from app.contracts.context import AgentGoal, ContextPack
from app.models import Book, BookChapter, BookSection
from app.persistence.documents import MangaProjectDoc, construct_document
from app.persistence.repositories import InMemoryRepositories
from app.services.agent_worker import AgentExecutionResult
from app.services.book_normalization import source_units_for_book
from app.services.domain_tools import (
    DomainToolRequest,
    DomainToolScope,
    MangaDirectorToolService,
)
from app.services.errors import ArtifactValidationError, AuthorizationError
from app.services.manga_director import (
    DEFAULT_BUDGET,
    DEFAULT_CONSTRAINTS,
    MangaDirectorService,
)
from app.services.scopes import ScopeService
from app.contracts.source import PageRange

PROJECT_ID = "proj-director-1"


def _book() -> Book:
    return construct_document(
        Book,
        id=PydanticObjectId(),
        title="Director Fixture",
        pdf_hash="a" * 64,
        total_pages=6,
        total_chapters=3,
        chapters=[
            BookChapter(
                index=0,
                title="Opening",
                page_start=1,
                page_end=2,
                word_count=20,
                sections=[
                    BookSection(
                        title="Start",
                        content="The mice woke early and ran the maze.",
                        page_start=1,
                        page_end=2,
                    )
                ],
            ),
            BookChapter(
                index=1,
                title="Middle",
                page_start=3,
                page_end=4,
                word_count=20,
                sections=[
                    BookSection(
                        title="Turn",
                        content="The cheese was gone; someone had moved it.",
                        page_start=3,
                        page_end=4,
                    )
                ],
            ),
            BookChapter(
                index=2,
                title="End",
                page_start=5,
                page_end=6,
                word_count=20,
                sections=[
                    BookSection(
                        title="Close",
                        content="Haw laughed at himself and let go.",
                        page_start=5,
                        page_end=6,
                    )
                ],
            ),
        ],
    )


async def _seeded() -> tuple[InMemoryRepositories, str]:
    book = _book()
    repositories = InMemoryRepositories()
    repositories.projects[PROJECT_ID] = construct_document(
        MangaProjectDoc,
        project_id=PROJECT_ID,
        book_id=str(book.id),
        owner_id="local",
        active_memory_version=0,
    )
    await repositories.save_source_units(source_units_for_book(book))
    scopes = ScopeService(repositories, repositories, memory=repositories)
    scope = await scopes.create(
        project_id=PROJECT_ID,
        book_id=str(book.id),
        page_ranges=[PageRange(page_start=1, page_end=6)],
        selection_label="whole fixture book",
        created_by="tests",
    )
    return repositories, scope.scope_id


def _plan_payload(goal: AgentGoal, context: ContextPack) -> dict:
    beats = []
    for index, excerpt in enumerate(context.source_units):
        beats.append(
            {
                "beat_id": f"beat_{index:04d}",
                "sequence": index,
                "source_refs": [excerpt.source_ref.model_dump(mode="json")],
                "required_fact_ids": [],
                "narrative_purpose": "setup" if index == 0 else "conflict",
                "book_essence": excerpt.excerpt,
                "dramatization": f"Panelized rendition of unit {index}.",
                "character_intent": [],
                "visual_intent": ["clear staging of the scene"],
                "must_preserve": [excerpt.excerpt],
                "may_compress": [],
                "confidence": 0.9,
            }
        )
    return {
        "schema_version": "manga-plan.v1",
        "plan_id": f"plan_{goal.goal_id[-8:]}",
        "project_id": context.project_id,
        "scope_id": context.scope_id,
        "context_pack_id": context.context_pack_id,
        "memory_version": context.memory_version,
        "title": "Who Moved The Cheese",
        "summary": "Three grounded beats across the fixture book.",
        "target_page_count": len(beats),
        "beats": beats,
        "character_state_updates": [],
        "terminology_updates": [],
        "new_facts": [],
        "ending_state": "Haw lets go and moves on.",
        "unresolved_thread_updates": [],
    }


class BrokeredFakeWorker:
    """Submits its candidate through the real domain-tool broker service."""

    def __init__(
        self,
        repositories: InMemoryRepositories,
        *,
        provider: str = "minimax",
        model: str = "MiniMax-M3",
        bypass_broker: bool = False,
    ) -> None:
        self._tools = MangaDirectorToolService(repositories, repositories)
        self._provider = provider
        self._model = model
        self._bypass_broker = bypass_broker
        self.calls = 0

    async def run(self, goal, context, *, instructions=None):
        self.calls += 1
        assert goal.allowed_tools[-2:] != []  # typed goal reached the worker
        plan = _plan_payload(goal, context)
        if not self._bypass_broker:
            await self._tools.execute(
                "submit_manga_plan",
                DomainToolRequest(
                    arguments={"plan": plan},
                    scope=DomainToolScope(
                        correlation_id=goal.goal_id,
                        goal_id=goal.goal_id,
                        run_id=goal.run_id,
                        stage_run_id=goal.stage_run_id,
                        context_pack_id=context.context_pack_id,
                        project_id=context.project_id,
                    ),
                ),
            )
        return AgentExecutionResult(
            candidate=plan,
            trace={
                "session_id": "sess-test-1",
                "goal_type": "MANGA_DIRECTION",
                "provider": self._provider,
                "model": self._model,
                "skill_name": "manga-direction",
                "skill_version": "1.0.0",
                "skill_hash": "c" * 64,
                "tool_calls": [{"name": "submit_manga_plan", "state": "succeeded"}],
                "tokens": {
                    "input": 1200,
                    "output": 800,
                    "cache_read": 0,
                    "cache_write": 0,
                    "total": 2000,
                },
                "cost_usd": 0.021,
                "latency_ms": 1450,
                "compaction_count": 0,
            },
        )


def run(coro):
    return asyncio.run(coro)


def test_direction_goal_accepts_plan_with_minimax_receipt():
    async def scenario():
        repositories, scope_id = await _seeded()
        worker = BrokeredFakeWorker(repositories)
        service = MangaDirectorService(repositories, worker)
        outcome = await service.run_direction_goal(
            project_id=PROJECT_ID, scope_id=scope_id
        )

        assert outcome.reused is False
        artifact = outcome.artifact
        assert artifact.kind == "manga_plan"
        assert artifact.validation_status == "accepted"
        receipt = artifact.model_receipt
        assert receipt["provider"] == "minimax"
        assert receipt["model"] == "MiniMax-M3"
        assert receipt["purpose"] == "manga_direction"
        assert receipt["input_tokens"] == 1200
        assert receipt["latency_ms"] == 1450
        assert receipt["skill_hashes"] == ["c" * 64]

        pack_artifact = await repositories.get_artifact(outcome.context_pack_id)
        assert pack_artifact is not None
        assert pack_artifact.validation_status == "accepted"
        assert artifact.parent_artifact_ids[0] == pack_artifact.artifact_id
        candidate = await repositories.get_artifact(artifact.parent_artifact_ids[1])
        assert candidate is not None and candidate.validation_status == "valid"

        run_doc = await repositories.get_run(outcome.run_id)
        stage_doc = await repositories.get_stage(outcome.stage_run_id)
        assert run_doc.status == "succeeded" and run_doc.active_stage is None
        assert stage_doc.status == "succeeded"
        assert stage_doc.output_artifact_ids == [artifact.artifact_id]
        assert stage_doc.agent_session_id == "sess-test-1"

    run(scenario())


def test_direction_goal_is_idempotent_and_does_not_pay_twice():
    async def scenario():
        repositories, scope_id = await _seeded()
        worker = BrokeredFakeWorker(repositories)
        service = MangaDirectorService(repositories, worker)
        first = await service.run_direction_goal(project_id=PROJECT_ID, scope_id=scope_id)
        second = await service.run_direction_goal(project_id=PROJECT_ID, scope_id=scope_id)
        assert worker.calls == 1
        assert second.reused is True
        assert second.artifact.artifact_id == first.artifact.artifact_id

    run(scenario())


def test_direction_goal_rejects_off_policy_provider():
    async def scenario():
        repositories, scope_id = await _seeded()
        worker = BrokeredFakeWorker(repositories, provider="openai", model="gpt-x")
        service = MangaDirectorService(repositories, worker)
        with pytest.raises(ArtifactValidationError):
            await service.run_direction_goal(project_id=PROJECT_ID, scope_id=scope_id)
        stage_ids = [s.stage_run_id for s in repositories.stages.values()]
        assert len(stage_ids) == 1
        stage = await repositories.get_stage(stage_ids[0])
        assert stage.status == "running"  # not marked succeeded on rejection

    run(scenario())


def test_direction_goal_requires_broker_validated_candidate():
    async def scenario():
        repositories, scope_id = await _seeded()
        worker = BrokeredFakeWorker(repositories, bypass_broker=True)
        service = MangaDirectorService(repositories, worker)
        with pytest.raises(ArtifactValidationError):
            await service.run_direction_goal(project_id=PROJECT_ID, scope_id=scope_id)

    run(scenario())


def test_direction_goal_denies_foreign_scope():
    async def scenario():
        repositories, scope_id = await _seeded()
        worker = BrokeredFakeWorker(repositories)
        service = MangaDirectorService(repositories, worker)
        with pytest.raises(AuthorizationError):
            await service.run_direction_goal(
                project_id="proj-other", scope_id=scope_id
            )

    run(scenario())


def test_default_constraints_and_budget_are_bounded():
    assert DEFAULT_CONSTRAINTS.max_pages <= 10
    assert DEFAULT_BUDGET.max_text_cost_usd <= 1.0
    assert DEFAULT_BUDGET.max_image_cost_usd == 0.0
    assert DEFAULT_BUDGET.max_repair_attempts <= 2
