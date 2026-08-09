"""Issue #13 (Session 7 cut): scope-chain planner + whole-book executor.

The planner is deterministic code over structure-aware source units; the
executor drives the per-scope stage runners with a hard cost preflight,
per-scope eval, and rolling memory continuity. These tests prove the
session's acceptance shape with stubbed runners and a REAL
MemoryMergeService: order, budgets, preflight refusal, resume without
double-spend, and merge-exactly-once continuity.
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Coroutine, TypeVar

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.contracts.manga import MangaPlan
from app.persistence.documents import (
    ArtifactDoc,
    MangaProjectDoc,
    ProjectMemorySnapshotDoc,
    SourceUnitDoc,
    construct_document,
)
from app.persistence.repositories import InMemoryRepositories
from app.services.errors import ArtifactValidationError
from app.services.hashing import content_hash
from app.services.memory import MemoryMergeService
from app.services.whole_book import (
    MEASURED_COSTS_USD,
    IMAGE_RETRY_FACTOR,
    TEXT_BUDGET_HEADROOM,
    PlannedScope,
    ScopeChainPlanner,
    WholeBookChainExecutor,
    default_scope_budget,
    plan_memory_delta,
)

T = TypeVar("T")
NOW = datetime(2026, 8, 9, 12, 0, tzinfo=UTC)
BOOK = "book_wmc"
PROJECT = "project_wmc"


def resolve(coroutine: Coroutine[Any, Any, T]) -> T:
    return asyncio.run(coroutine)


def unit(
    unit_id: str,
    *,
    chapter: int | None,
    heading: str,
    tokens: int,
    page: int = 1,
) -> SourceUnitDoc:
    return construct_document(
        SourceUnitDoc,
        book_id=BOOK,
        source_unit_id=unit_id,
        kind="section",
        chapter_index=chapter,
        heading_path=[heading],
        page_start=page,
        page_end=page,
        text="body " * max(1, tokens // 2),
        text_hash=content_hash(unit_id),
        token_count=tokens,
        image_refs=[],
        parse_version="test.v1",
    )


def wmc_like_units() -> list[SourceUnitDoc]:
    return [
        unit("u_contents", chapter=0, heading="Contents", tokens=900),
        unit("u_praise", chapter=1, heading="Praise for Who Moved My Cheese?", tokens=2_000),
        unit("u_gathering", chapter=7, heading="A Gathering", tokens=900),
        unit("u_story_a", chapter=8, heading="The Story", tokens=4_800),
        unit("u_story_b", chapter=8, heading="The Story", tokens=1_400),
        unit("u_beliefs", chapter=9, heading="Fearful Beliefs", tokens=4_400),
        unit("u_discussion", chapter=10, heading="A Discussion", tokens=4_900),
        unit("u_services", chapter=11, heading="Services", tokens=21),
        unit("u_planner", chapter=15, heading="Personal Planner Inserts", tokens=40),
    ]


# ---------------------------------------------------------------------------
# planner
# ---------------------------------------------------------------------------


def test_planner_skips_non_narrative_and_thin_units_with_reasons() -> None:
    plan = ScopeChainPlanner(scope_token_budget=10_000).plan_units(
        wmc_like_units(), book_id=BOOK, project_id=PROJECT
    )
    skipped = {item.source_unit_id: item.reason for item in plan.skipped}
    assert skipped == {
        "u_contents": "non_narrative_heading",
        "u_praise": "non_narrative_heading",
        "u_services": "below_token_floor",
        "u_planner": "below_token_floor",
    }
    planned_units = [uid for scope in plan.scopes for uid in scope.source_unit_ids]
    assert planned_units == [
        "u_gathering",
        "u_story_a",
        "u_story_b",
        "u_beliefs",
        "u_discussion",
    ]


def test_planner_packs_whole_chapters_under_the_token_budget() -> None:
    plan = ScopeChainPlanner(scope_token_budget=10_000).plan_units(
        wmc_like_units(), book_id=BOOK, project_id=PROJECT
    )
    groups = [scope.source_unit_ids for scope in plan.scopes]
    # ch7 (900) + ch8 (4800+1400=6200) = 7100 fits; adding ch9 (4400)
    # would blow the 10k budget, so ch9 opens scope 2; ch10 (4900) fits
    # beside it (9300).
    assert groups == [
        ("u_gathering", "u_story_a", "u_story_b"),
        ("u_beliefs", "u_discussion"),
    ]
    assert [scope.sequence for scope in plan.scopes] == [0, 1]
    assert plan.scopes[0].token_count == 7_100
    assert plan.scopes[1].token_count == 9_300


def test_planner_splits_an_oversized_chapter_at_unit_boundaries() -> None:
    units = [
        unit("u_big_a", chapter=3, heading="Big Chapter", tokens=6_000),
        unit("u_big_b", chapter=3, heading="Big Chapter", tokens=6_000),
        unit("u_next", chapter=4, heading="Next Chapter", tokens=800),
    ]
    plan = ScopeChainPlanner(scope_token_budget=10_000).plan_units(
        units, book_id=BOOK, project_id=PROJECT
    )
    assert [scope.source_unit_ids for scope in plan.scopes] == [
        ("u_big_a",),
        ("u_big_b",),
        ("u_next",),
    ]


def test_planner_budgets_derive_from_the_measured_matrix_numbers() -> None:
    budget = default_scope_budget(2)
    expected_text = (
        MEASURED_COSTS_USD["direction_text"]
        + MEASURED_COSTS_USD["page_writing_text"]
        + MEASURED_COSTS_USD["thumbnail_text"]
    ) * TEXT_BUDGET_HEADROOM
    assert budget.text_usd == pytest.approx(expected_text, abs=1e-6)
    assert budget.image_usd == pytest.approx(
        2 * MEASURED_COSTS_USD["image_per_page"] * IMAGE_RETRY_FACTOR, abs=1e-6
    )
    assert budget.judge_usd == pytest.approx(2 * 0.0009, abs=1e-6)


def test_planner_is_deterministic_and_order_insensitive() -> None:
    planner = ScopeChainPlanner(scope_token_budget=10_000)
    forward = planner.plan_units(wmc_like_units(), book_id=BOOK, project_id=PROJECT)
    reversed_input = planner.plan_units(
        list(reversed(wmc_like_units())), book_id=BOOK, project_id=PROJECT
    )
    assert forward.plan_hash == reversed_input.plan_hash
    assert forward.scopes == reversed_input.scopes


def test_planner_refuses_a_book_with_nothing_adaptable() -> None:
    units = [unit("u_contents", chapter=0, heading="Contents", tokens=900)]
    with pytest.raises(ArtifactValidationError, match="no adaptable source units"):
        ScopeChainPlanner().plan_units(units, book_id=BOOK, project_id=PROJECT)


# ---------------------------------------------------------------------------
# memory continuity
# ---------------------------------------------------------------------------


def sample_plan(memory_version: int, *, unit_id: str = "u_gathering") -> MangaPlan:
    ref = {
        "book_id": BOOK,
        "source_unit_id": unit_id,
        "page_start": 1,
        "page_end": 1,
        "quote": None,
        "text_hash": content_hash(unit_id),
    }
    beats = [
        {
            "beat_id": f"beat_{index}",
            "sequence": index,
            "source_refs": [ref],
            "required_fact_ids": [],
            "narrative_purpose": "explanation",
            "book_essence": f"Essence {index}.",
            "dramatization": f"Dramatization {index}.",
            "character_intent": [],
            "visual_intent": ["staging"],
            "must_preserve": ["meaning"],
            "may_compress": [],
            "confidence": 1,
        }
        for index in range(2)
    ]
    return MangaPlan.model_validate(
        {
            "schema_version": "manga-plan.v1",
            "plan_id": f"plan_v{memory_version}_{unit_id}",
            "project_id": PROJECT,
            "scope_id": "scope_test",
            "context_pack_id": "context_test",
            "memory_version": memory_version,
            "title": "Scope",
            "summary": "Scope summary.",
            "target_page_count": 2,
            "beats": beats,
            "character_state_updates": [],
            "terminology_updates": [
                {
                    "term": "New Cheese",
                    "canonical_form": "new_cheese",
                    "meaning": "What you find when you move.",
                    "source_refs": [ref],
                }
            ],
            "new_facts": [],
            "ending_state": "Haw keeps moving.",
            "unresolved_thread_updates": [],
        }
    )


def test_plan_memory_delta_maps_plan_fields_and_coverage() -> None:
    plan = sample_plan(3)
    delta = plan_memory_delta(plan, plan_artifact_id="manga_plan_x")
    assert delta.base_memory_version == 3
    assert delta.source_artifact_ids == ["manga_plan_x"]
    assert [item.canonical_form for item in delta.terminology_updates] == ["new_cheese"]
    assert len(delta.coverage_additions) == 1
    coverage = delta.coverage_additions[0]
    assert coverage.source_unit_id == "u_gathering"
    assert coverage.beat_ids == ["beat_0", "beat_1"]
    assert delta.continuity_updates[0].key == "previous_scope_ending"
    assert delta.continuity_updates[0].value == "Haw keeps moving."


# ---------------------------------------------------------------------------
# executor
# ---------------------------------------------------------------------------


@dataclass
class FakeArtifact:
    artifact_id: str
    content: dict[str, Any]
    model_receipt: dict[str, Any] | None


@dataclass
class FakeOutcome:
    artifact: FakeArtifact
    run_id: str
    reused: bool = False


@dataclass
class FakeArtOutcome:
    total_image_cost_usd: float
    total_vision_cost_usd: float
    reused: bool = False


def seeded_executor_repo() -> InMemoryRepositories:
    repository = InMemoryRepositories()
    repository.projects[PROJECT] = construct_document(
        MangaProjectDoc,
        project_id=PROJECT,
        book_id=BOOK,
        owner_id="owner_wmc",
        active_memory_version=0,
        created_at=NOW,
        updated_at=NOW,
    )
    genesis = {
        "project_id": PROJECT,
        "memory_version": 0,
        "parent_version": None,
        "book_spine": {},
        "facts": [],
        "character_state": [],
        "world_state": {},
        "continuity": {},
        "coverage": {},
        "asset_index": [],
        "source_artifact_ids": [],
    }
    repository.memory_snapshots[(PROJECT, 0)] = construct_document(
        ProjectMemorySnapshotDoc, **genesis, content_hash=content_hash(genesis)
    )
    for source in wmc_like_units():
        repository.source_units[(BOOK, source.source_unit_id)] = source
    return repository


class StubStages:
    """Scope-aware stage runners that persist the accepted plan artifact
    (the executor's memory merge cites it) and count live vs reused calls."""

    def __init__(self, repository: InMemoryRepositories) -> None:
        self.repository = repository
        self.direction_calls: list[str] = []
        self.page_writing_calls: list[str] = []
        self.thumbnail_calls: list[str] = []
        self.page_art_calls: list[dict[str, Any]] = []
        self.eval_calls: list[str] = []
        self.completed_scopes: set[str] = set()
        self.fail_on_scope_sequence: int | None = None
        self.memory_versions_at_direction: list[int] = []

    async def direction(self, *, project_id: str, scope_id: str) -> FakeOutcome:
        self.direction_calls.append(scope_id)
        project = await self.repository.get_project(project_id)
        assert project is not None
        self.memory_versions_at_direction.append(project.active_memory_version)
        reused = scope_id in self.completed_scopes
        scope = await self.repository.get_scope(scope_id)
        assert scope is not None
        plan = sample_plan(
            project.active_memory_version, unit_id=scope.source_unit_ids[0]
        )
        payload = plan.model_dump(mode="json")
        artifact_id = f"manga_plan_{scope_id}"
        if not reused:
            self.repository.artifacts[artifact_id] = construct_document(
                ArtifactDoc,
                artifact_id=artifact_id,
                project_id=project_id,
                run_id=f"run_{scope_id}",
                kind="manga_plan",
                schema_version="manga-plan.v1",
                content=payload,
                storage_ref=None,
                content_hash=content_hash(payload),
                parent_artifact_ids=[],
                source_refs=[],
                model_receipt={"cost_usd": 0.07},
                validation_status="accepted",
                validation_report={"passed": True, "issues": [], "validator_version": "t"},
                created_at=NOW,
            )
        artifact = self.repository.artifacts[artifact_id]
        return FakeOutcome(
            artifact=FakeArtifact(artifact_id, artifact.content or {}, artifact.model_receipt),
            run_id=f"run_{scope_id}",
            reused=reused,
        )

    async def page_writing(self, *, project_id: str, run_id: str) -> FakeOutcome:
        self.page_writing_calls.append(run_id)
        scope_id = run_id.removeprefix("run_")
        if (
            self.fail_on_scope_sequence is not None
            and len(self.completed_scopes) == self.fail_on_scope_sequence
        ):
            self.fail_on_scope_sequence = None
            raise RuntimeError("simulated crash mid-scope")
        reused = scope_id in self.completed_scopes
        return FakeOutcome(
            artifact=FakeArtifact(f"script_{scope_id}", {}, {"cost_usd": 0.16}),
            run_id=run_id,
            reused=reused,
        )

    async def thumbnail(self, *, project_id: str, run_id: str) -> FakeOutcome:
        self.thumbnail_calls.append(run_id)
        scope_id = run_id.removeprefix("run_")
        reused = scope_id in self.completed_scopes
        return FakeOutcome(
            artifact=FakeArtifact(f"thumb_{scope_id}", {}, {"cost_usd": 0.2}),
            run_id=run_id,
            reused=reused,
        )

    async def page_art(self, **kwargs: Any) -> FakeArtOutcome:
        self.page_art_calls.append(kwargs)
        scope_id = kwargs["run_id"].removeprefix("run_")
        reused = scope_id in self.completed_scopes
        self.completed_scopes.add(scope_id)
        return FakeArtOutcome(
            total_image_cost_usd=0.0 if reused else 0.078,
            total_vision_cost_usd=0.0 if reused else 0.0008,
            reused=reused,
        )

    async def evaluate(
        self, project_id: str, run_id: str, planned: PlannedScope
    ) -> tuple[str | None, float]:
        self.eval_calls.append(run_id)
        return f"scorecard_{run_id}", 0.001


def build_executor(
    repository: InMemoryRepositories,
    stages: StubStages,
    *,
    text_budget: float,
    image_budget: float,
) -> WholeBookChainExecutor:
    return WholeBookChainExecutor(
        repository,
        direction_runner=stages.direction,
        page_writing_runner=stages.page_writing,
        thumbnail_runner=stages.thumbnail,
        page_art_runner=stages.page_art,
        eval_runner=stages.evaluate,
        memory_merge=MemoryMergeService(repository, repository, repository),
        text_budget_usd=text_budget,
        image_budget_usd=image_budget,
    )


def chain_plan():
    return ScopeChainPlanner(scope_token_budget=10_000).plan_units(
        wmc_like_units(), book_id=BOOK, project_id=PROJECT
    )


def test_chain_executes_in_order_with_memory_continuity_and_scorecards() -> None:
    repository = seeded_executor_repo()
    stages = StubStages(repository)
    executor = build_executor(repository, stages, text_budget=5.0, image_budget=1.0)

    outcome = resolve(executor.execute(chain_plan()))

    assert outcome.status == "completed"
    assert [item.status for item in outcome.executions] == ["succeeded", "succeeded"]
    # Scope 2 compiled AFTER scope 1's canon merge (rolling memory).
    assert stages.memory_versions_at_direction == [0, 1]
    assert [item.memory_version_after for item in outcome.executions] == [1, 2]
    assert [item.scorecard_artifact_id for item in outcome.executions] == [
        f"scorecard_{run}" for run in stages.eval_calls
    ]
    # Receipted stage costs + judge costs are subtracted from the budgets.
    per_scope_text = 0.07 + 0.16 + 0.2 + 0.0008 + 0.001
    assert outcome.remaining_text_usd == pytest.approx(5.0 - 2 * per_scope_text, abs=1e-6)
    assert outcome.remaining_image_usd == pytest.approx(1.0 - 2 * 0.078, abs=1e-6)
    # The paid art stage received the EXPLICIT thumbnail lineage.
    assert [call["thumbnail_artifact_id"] for call in stages.page_art_calls] == [
        f"thumb_{call['run_id'].removeprefix('run_')}" for call in stages.page_art_calls
    ]


def test_preflight_refuses_a_scope_the_remaining_budget_cannot_cover() -> None:
    repository = seeded_executor_repo()
    stages = StubStages(repository)
    scope_budget = default_scope_budget(2)
    # Enough for exactly one scope (stub actuals are lower than plan
    # ceilings, but the SECOND scope's projection must not fit).
    text_budget = scope_budget.text_usd + scope_budget.judge_usd + 0.05
    executor = build_executor(
        repository, stages, text_budget=text_budget, image_budget=1.0
    )

    outcome = resolve(executor.execute(chain_plan()))

    assert outcome.status == "stopped_preflight"
    assert [item.status for item in outcome.executions] == [
        "succeeded",
        "refused_preflight",
    ]
    refused = outcome.executions[1]
    assert refused.run_id is None
    assert refused.error is not None and "exceeds remaining" in refused.error
    # No runner ever started for the refused scope.
    assert len(stages.direction_calls) == 1


def test_resume_reuses_completed_scopes_without_respend_or_double_merge() -> None:
    repository = seeded_executor_repo()
    stages = StubStages(repository)
    stages.fail_on_scope_sequence = 1  # crash in scope 2's page-writing
    executor = build_executor(repository, stages, text_budget=5.0, image_budget=1.0)

    first = resolve(executor.execute(chain_plan()))
    assert first.status == "stopped_failure"
    assert [item.status for item in first.executions] == ["succeeded", "failed"]
    assert first.executions[1].error is not None
    assert "simulated crash" in first.executions[1].error

    second = resolve(executor.execute(chain_plan()))
    assert second.status == "completed"
    assert [item.status for item in second.executions] == ["succeeded", "succeeded"]
    # Scope 1 replayed as pure reuse: zero new text/image spend.
    replayed = second.executions[0]
    assert replayed.text_cost_usd == 0.0
    assert replayed.image_cost_usd == 0.0
    assert set(replayed.reused_stages) >= {
        "manga_direction",
        "manga_page_writing",
        "manga_thumbnail",
        "manga_page_art",
    }
    # Memory advanced exactly once per scope across BOTH passes: the
    # resume pass sees scope 1's plan compiled at v0 while the active
    # version is already 1 -> merge skipped, active version reported.
    assert replayed.memory_version_after == 1
    assert second.executions[1].memory_version_after == 2
    project = resolve(repository.get_project(PROJECT))
    assert project is not None
    assert project.active_memory_version == 2


# ---------------------------------------------------------------------------
# Session 8: failed-attempt spend decrements the chain budget (S7 dev. 6)
# ---------------------------------------------------------------------------


def _stage_doc_with_failures(
    run_id: str, stage_run_id: str, costs: list[float]
) -> Any:
    from app.persistence.documents import StageRunDoc

    return construct_document(
        StageRunDoc,
        stage_run_id=stage_run_id,
        run_id=run_id,
        stage_name="manga_thumbnail",
        attempt=len(costs),
        status="failed",
        input_artifact_ids=[],
        input_hash="a" * 64,
        output_artifact_ids=[],
        idempotency_key=f"{stage_run_id}_key",
        started_at=NOW,
        ended_at=None,
        failure_history=[
            {"attempt": index + 1, "trace": {"cost_usd": cost}}
            for index, cost in enumerate(costs)
        ],
    )


def test_failed_attempt_spend_decrements_the_chain_budget() -> None:
    """A failed attempt's receipted cost is real spend: it must reduce the
    chain's remaining text budget even though no accepted receipt exists."""
    repository = seeded_executor_repo()
    stages = StubStages(repository)

    original_thumbnail = stages.thumbnail

    async def thumbnail_with_failed_attempt(*, project_id: str, run_id: str):
        # A failed attempt lands in failure_history DURING this execution
        # (the live golden-chain shape: receipted, then the retry succeeds).
        repository.stages[f"stage_thumb_fail_{run_id}"] = _stage_doc_with_failures(
            run_id, f"stage_thumb_fail_{run_id}", [0.06]
        )
        return await original_thumbnail(project_id=project_id, run_id=run_id)

    executor = WholeBookChainExecutor(
        repository,
        direction_runner=stages.direction,
        page_writing_runner=stages.page_writing,
        thumbnail_runner=thumbnail_with_failed_attempt,
        page_art_runner=stages.page_art,
        eval_runner=stages.evaluate,
        memory_merge=MemoryMergeService(repository, repository, repository),
        text_budget_usd=5.0,
        image_budget_usd=1.0,
    )
    outcome = resolve(executor.execute(chain_plan()))

    assert outcome.status == "completed"
    first = outcome.executions[0]
    # Accepted receipts (0.07 + 0.16 + 0.2) PLUS the failed attempt's 0.06.
    assert first.text_cost_usd == pytest.approx(0.49)
    expected_remaining = 5.0 - sum(
        item.text_cost_usd + item.judge_cost_usd for item in outcome.executions
    )
    assert outcome.remaining_text_usd == pytest.approx(expected_remaining)


def test_prior_invocation_failures_are_never_recharged_on_resume() -> None:
    """Resume-safety: failure_history rows that predate this chain
    invocation were paid under an earlier ledger — the delta accounting
    must not subtract them again."""
    repository = seeded_executor_repo()
    stages = StubStages(repository)
    plan = chain_plan()
    # Pre-existing failures from a previous session on BOTH scopes' runs.
    for planned in plan.scopes:
        scope_payload = {
            "project_id": PROJECT,
            "book_id": BOOK,
            "source_unit_ids": list(planned.source_unit_ids),
            "page_ranges": [
                {"page_start": planned.page_start, "page_end": planned.page_end}
            ],
            "selection_label": planned.label,
            "created_by": "whole-book-chain",
        }
        scope_id = f"scope_{content_hash(scope_payload)[:24]}"
        run_id = f"run_{scope_id}"
        repository.stages[f"stage_old_fail_{run_id}"] = _stage_doc_with_failures(
            run_id, f"stage_old_fail_{run_id}", [0.15, 0.06]
        )

    executor = build_executor(repository, stages, text_budget=5.0, image_budget=1.0)
    outcome = resolve(executor.execute(plan))

    assert outcome.status == "completed"
    for execution in outcome.executions:
        # Only the accepted receipts (0.43) — never the 0.21 of old failures.
        assert execution.text_cost_usd == pytest.approx(0.43)


# ---------------------------------------------------------------------------
# Session 8: include/exclude overrides (#13 fold)
# ---------------------------------------------------------------------------


def test_exclude_override_force_skips_an_admitted_unit() -> None:
    """The live case: WMC's 406-token title section plans into scope 0
    because its heading escapes the conservative marker list — the owner
    can now exclude it explicitly, with the reason recorded."""
    units = wmc_like_units()
    baseline = ScopeChainPlanner(scope_token_budget=10_000).plan_units(
        units, book_id=BOOK, project_id=PROJECT
    )
    target = baseline.scopes[0].source_unit_ids[0]
    plan = ScopeChainPlanner(
        scope_token_budget=10_000, exclude_unit_ids={target}
    ).plan_units(units, book_id=BOOK, project_id=PROJECT)
    assert all(target not in scope.source_unit_ids for scope in plan.scopes)
    skip = next(s for s in plan.skipped if s.source_unit_id == target)
    assert skip.reason == "excluded_by_override"
    assert plan.plan_hash != baseline.plan_hash


def test_include_override_admits_a_skipped_unit() -> None:
    units = wmc_like_units()
    baseline = ScopeChainPlanner(scope_token_budget=10_000).plan_units(
        units, book_id=BOOK, project_id=PROJECT
    )
    floored = next(
        s for s in baseline.skipped if s.reason == "below_token_floor"
    )
    plan = ScopeChainPlanner(
        scope_token_budget=10_000, include_unit_ids={floored.source_unit_id}
    ).plan_units(units, book_id=BOOK, project_id=PROJECT)
    planned_ids = {
        unit_id for scope in plan.scopes for unit_id in scope.source_unit_ids
    }
    assert floored.source_unit_id in planned_ids
    assert plan.plan_hash != baseline.plan_hash


def test_no_overrides_keeps_the_s7_plan_hash_byte_stable() -> None:
    """Defaults must never perturb existing plan hashes — the golden
    chain's $0 stage reuse depends on the plan identity."""
    units = wmc_like_units()
    a = ScopeChainPlanner(scope_token_budget=10_000).plan_units(
        units, book_id=BOOK, project_id=PROJECT
    )
    b = ScopeChainPlanner(
        scope_token_budget=10_000, include_unit_ids=set(), exclude_unit_ids=None
    ).plan_units(units, book_id=BOOK, project_id=PROJECT)
    assert a.plan_hash == b.plan_hash


def test_conflicting_overrides_are_rejected() -> None:
    with pytest.raises(ValueError, match="both included and excluded"):
        ScopeChainPlanner(include_unit_ids={"u1"}, exclude_unit_ids={"u1"})
