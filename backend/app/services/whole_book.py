"""Whole-book single-run orchestration (issue #13, Session 7 cut).

Two mechanisms, one durable spine:

1. ``ScopeChainPlanner`` — DETERMINISTIC code (no LLM) that turns a book's
   structure-aware source units into an ordered chain of planned scopes
   with per-scope cost budgets derived from the MEASURED matrix numbers
   (docs/research/rendering-lane-matrix.md). Front/back matter and
   too-thin marketing sections are skipped with recorded reasons (the
   donor demo adapted 15 pages of contents/copyright — issue #13 names
   that bug as the motivation), and oversized chapters split at unit
   boundaries under the context-pack token budget.
2. ``WholeBookChainExecutor`` — drives direction -> page-writing ->
   thumbnail -> page-art (+compose) -> eval per scope through INJECTED
   stage runners (the live wiring passes the real drivers; tests pass
   stubs), with a HARD cost preflight (a scope whose projected spend
   exceeds the remaining budget refuses to start — no surprise bills),
   per-scope eval scorecards, and rolling memory continuity: each scope's
   accepted MangaPlan merges as a MemoryDelta so the NEXT scope compiles
   its context from updated canon (characters, terminology, facts,
   threads, coverage — the asset_index rides the same snapshots, which is
   how character references reuse across scopes).

Resume falls out of the existing durable machinery on purpose: scope ids
are content hashes (create_scope is get-or-create), every stage driver
reuses its succeeded stages by idempotency key, and the memory merge is
guarded by the plan's compiled ``memory_version`` so a re-run can never
double-merge. Killing the chain anywhere and re-executing continues at
the first non-accepted stage with zero duplicate paid calls.

Sequential by design (issue #13: canon merge order is the point); no
parallel scope execution in v1.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Protocol

from app.contracts.context import ContinuityUpdate, MemoryDelta, SourceCoverage
from app.contracts.manga import MangaPlan
from app.persistence.documents import (
    ScopeManifestDoc,
    SourceUnitDoc,
    construct_document,
    utc_now,
)
from app.persistence.protocols import Repositories

from .errors import ArtifactValidationError
from .hashing import content_hash
from .memory import MemoryMergeService

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# measured economics (every number is a persisted-receipt actual)
# ---------------------------------------------------------------------------

#: Measured per-goal / per-page actuals from the rendering-lane matrix
#: (docs/research/rendering-lane-matrix.md) and the session ledgers. These
#: are PLANNING numbers for preflight ceilings — receipts remain the only
#: source of actual spend.
MEASURED_COSTS_USD: dict[str, float] = {
    "direction_text": 0.0679,  # S3 M3 actual per direction goal
    "page_writing_text": 0.16,  # S4 speed-lane post-trim actual (2-page scope)
    "thumbnail_text": 0.26,  # S4 speed-lane upper bound (2-page scope)
    "image_per_page": 0.039,  # S5 lane-C exact-reconciled
    "vision_qa_per_page": 0.0004,  # S5/S6 measured per gated page call
    "judge_per_page": 0.0005,  # S6 measured per judge rubric call
}
#: Text retries happen (the S6/S7 ledgers are the proof); plan ceilings
#: carry headroom so one repair pass never kills a chain mid-scope.
TEXT_BUDGET_HEADROOM = 1.5
#: Matrix worst case: lane-C pages with retries cost 2x the clean number.
IMAGE_RETRY_FACTOR = 2.0

#: The current planning goal shape (manga_page_planner.TARGET_PAGE_COUNT):
#: every scope adapts to exactly two pages until multi-page goals land.
SCOPE_TARGET_PAGE_COUNT = 2

#: Headings that mark non-narrative front/back matter. Deliberately
#: conservative — the token floor below catches most marketing debris;
#: these markers catch the *large* non-narrative units (contents pages,
#: praise sections) that token counts cannot.
DEFAULT_NON_NARRATIVE_MARKERS: tuple[str, ...] = (
    "contents",
    "copyright",
    "praise for",
    "acknowledg",
    "dedication",
    "about the author",
    "also by",
    "index",
    "appendix",
    "glossary",
    "ordering information",
)
#: Units thinner than this cannot carry a two-page adaptation; the WMC
#: back-matter marketing sections measure 20-60 tokens each.
DEFAULT_MIN_ADAPTABLE_TOKENS = 200
#: Bound on a scope's summed source tokens. The measured healthy scope
#: (the S4 bake-off arm: one chapter + its continuation) is ~9.7k tokens;
#: the context compiler's input ceiling is 80k.
DEFAULT_SCOPE_TOKEN_BUDGET = 10_000


# ---------------------------------------------------------------------------
# plan shapes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ScopeBudget:
    """Per-scope preflight ceilings (planning numbers, not receipts)."""

    text_usd: float
    image_usd: float
    judge_usd: float


@dataclass(frozen=True)
class PlannedScope:
    sequence: int
    label: str
    source_unit_ids: tuple[str, ...]
    page_start: int
    page_end: int
    token_count: int
    target_page_count: int
    budget: ScopeBudget


@dataclass(frozen=True)
class SkippedUnit:
    source_unit_id: str
    reason: str  # "non_narrative_heading" | "below_token_floor"
    heading: str
    token_count: int


@dataclass(frozen=True)
class ScopeChainPlan:
    book_id: str
    project_id: str
    plan_hash: str
    scopes: tuple[PlannedScope, ...]
    skipped: tuple[SkippedUnit, ...]

    @property
    def projected_text_usd(self) -> float:
        return sum(item.budget.text_usd for item in self.scopes)

    @property
    def projected_image_usd(self) -> float:
        return sum(item.budget.image_usd for item in self.scopes)

    @property
    def projected_judge_usd(self) -> float:
        return sum(item.budget.judge_usd for item in self.scopes)


def default_scope_budget(target_page_count: int) -> ScopeBudget:
    """Preflight ceilings for one scope from the measured matrix numbers."""
    text = (
        MEASURED_COSTS_USD["direction_text"]
        + MEASURED_COSTS_USD["page_writing_text"]
        + MEASURED_COSTS_USD["thumbnail_text"]
    ) * TEXT_BUDGET_HEADROOM
    image = (
        target_page_count
        * MEASURED_COSTS_USD["image_per_page"]
        * IMAGE_RETRY_FACTOR
    )
    judge = target_page_count * (
        MEASURED_COSTS_USD["judge_per_page"]
        + MEASURED_COSTS_USD["vision_qa_per_page"]
    )
    return ScopeBudget(
        text_usd=round(text, 6), image_usd=round(image, 6), judge_usd=round(judge, 6)
    )


class ScopeChainPlanner:
    """Deterministic chapter-set -> ordered scope chain with budgets."""

    def __init__(
        self,
        *,
        scope_token_budget: int = DEFAULT_SCOPE_TOKEN_BUDGET,
        min_adaptable_tokens: int = DEFAULT_MIN_ADAPTABLE_TOKENS,
        non_narrative_markers: tuple[str, ...] = DEFAULT_NON_NARRATIVE_MARKERS,
        target_page_count: int = SCOPE_TARGET_PAGE_COUNT,
    ) -> None:
        if scope_token_budget <= 0:
            raise ValueError("scope_token_budget must be positive")
        self._scope_token_budget = scope_token_budget
        self._min_adaptable_tokens = min_adaptable_tokens
        self._markers = tuple(marker.lower() for marker in non_narrative_markers)
        self._target_page_count = target_page_count

    async def plan(
        self, repositories: Repositories, *, book_id: str, project_id: str
    ) -> ScopeChainPlan:
        units = await repositories.list_source_units(book_id)
        if not units:
            raise ArtifactValidationError(
                f"Book {book_id} has no parsed source units to plan from"
            )
        return self.plan_units(units, book_id=book_id, project_id=project_id)

    def plan_units(
        self,
        units: list[SourceUnitDoc],
        *,
        book_id: str,
        project_id: str,
    ) -> ScopeChainPlan:
        ordered = sorted(
            units,
            key=lambda unit: (
                unit.chapter_index if unit.chapter_index is not None else 10**6,
                unit.page_start,
                unit.source_unit_id,
            ),
        )
        adaptable: list[SourceUnitDoc] = []
        skipped: list[SkippedUnit] = []
        for unit in ordered:
            heading = " / ".join(unit.heading_path) if unit.heading_path else ""
            reason = self._skip_reason(unit, heading)
            if reason is not None:
                skipped.append(
                    SkippedUnit(
                        source_unit_id=unit.source_unit_id,
                        reason=reason,
                        heading=heading,
                        token_count=unit.token_count,
                    )
                )
            else:
                adaptable.append(unit)
        if not adaptable:
            raise ArtifactValidationError(
                f"Book {book_id} has no adaptable source units after "
                "front/back-matter and token-floor skips"
            )

        scopes: list[PlannedScope] = []
        for group in self._pack(adaptable):
            sequence = len(scopes)
            heading = " / ".join(group[0].heading_path) if group[0].heading_path else ""
            label = f"chain {sequence:02d}: {heading or group[0].source_unit_id}"[:120]
            scopes.append(
                PlannedScope(
                    sequence=sequence,
                    label=label,
                    source_unit_ids=tuple(unit.source_unit_id for unit in group),
                    page_start=min(unit.page_start for unit in group),
                    page_end=max(unit.page_end for unit in group),
                    token_count=sum(unit.token_count for unit in group),
                    target_page_count=self._target_page_count,
                    budget=default_scope_budget(self._target_page_count),
                )
            )

        payload = {
            "book_id": book_id,
            "project_id": project_id,
            "scope_token_budget": self._scope_token_budget,
            "min_adaptable_tokens": self._min_adaptable_tokens,
            "non_narrative_markers": list(self._markers),
            "target_page_count": self._target_page_count,
            "scopes": [
                {
                    "sequence": scope.sequence,
                    "source_unit_ids": list(scope.source_unit_ids),
                    "token_count": scope.token_count,
                }
                for scope in scopes
            ],
            "skipped": [
                {"source_unit_id": item.source_unit_id, "reason": item.reason}
                for item in skipped
            ],
        }
        return ScopeChainPlan(
            book_id=book_id,
            project_id=project_id,
            plan_hash=content_hash(payload),
            scopes=tuple(scopes),
            skipped=tuple(skipped),
        )

    def _skip_reason(self, unit: SourceUnitDoc, heading: str) -> str | None:
        lowered = heading.lower()
        if any(marker in lowered for marker in self._markers):
            return "non_narrative_heading"
        if unit.token_count < self._min_adaptable_tokens:
            return "below_token_floor"
        return None

    def _pack(self, units: list[SourceUnitDoc]) -> list[list[SourceUnitDoc]]:
        """Greedy consecutive packing: whole chapters together while the
        scope stays under the token budget; a chapter that alone exceeds
        the budget splits at unit boundaries (issue #13 sizing rule)."""
        chapters: list[list[SourceUnitDoc]] = []
        for unit in units:
            key = unit.chapter_index
            if (
                chapters
                and key is not None
                and chapters[-1][0].chapter_index == key
            ):
                chapters[-1].append(unit)
            else:
                chapters.append([unit])

        groups: list[list[SourceUnitDoc]] = []
        current: list[SourceUnitDoc] = []
        current_tokens = 0
        for chapter in chapters:
            chapter_tokens = sum(unit.token_count for unit in chapter)
            if chapter_tokens > self._scope_token_budget:
                if current:
                    groups.append(current)
                    current, current_tokens = [], 0
                # Split the oversized chapter at unit boundaries.
                run: list[SourceUnitDoc] = []
                run_tokens = 0
                for unit in chapter:
                    if run and run_tokens + unit.token_count > self._scope_token_budget:
                        groups.append(run)
                        run, run_tokens = [], 0
                    run.append(unit)
                    run_tokens += unit.token_count
                if run:
                    groups.append(run)
                continue
            if current and current_tokens + chapter_tokens > self._scope_token_budget:
                groups.append(current)
                current, current_tokens = [], 0
            current.extend(chapter)
            current_tokens += chapter_tokens
        if current:
            groups.append(current)
        return groups


# ---------------------------------------------------------------------------
# memory continuity
# ---------------------------------------------------------------------------


def plan_memory_delta(plan: MangaPlan, *, plan_artifact_id: str) -> MemoryDelta:
    """Build the rolling-canon delta from an accepted MangaPlan.

    The plan already carries the delta-shaped fields (character state,
    terminology, grounded facts, thread updates); coverage additions are
    derived from each beat's source references so the coverage map grows
    scope by scope. ``base_memory_version`` is the version the plan's
    context COMPILED from — the executor merges only while that is still
    the active version, which makes resume idempotent by construction.
    """
    unit_beats: dict[str, set[str]] = {}
    for beat in plan.beats:
        for ref in beat.source_refs:
            unit_beats.setdefault(ref.source_unit_id, set()).add(beat.beat_id)
    coverage = [
        SourceCoverage(
            source_unit_id=unit_id,
            beat_ids=sorted(beat_ids),
            coverage_status="covered",
        )
        for unit_id, beat_ids in sorted(unit_beats.items())
    ]
    return MemoryDelta(
        schema_version="memory-delta.v1",
        project_id=plan.project_id,
        base_memory_version=plan.memory_version,
        new_facts=plan.new_facts,
        character_state_updates=plan.character_state_updates,
        terminology_updates=plan.terminology_updates,
        continuity_updates=[
            ContinuityUpdate(key="previous_scope_ending", value=plan.ending_state)
        ],
        coverage_additions=coverage,
        unresolved_thread_updates=plan.unresolved_thread_updates,
        source_artifact_ids=[plan_artifact_id],
    )


# ---------------------------------------------------------------------------
# chain executor
# ---------------------------------------------------------------------------


class DirectionRunnerProtocol(Protocol):
    def __call__(self, *, project_id: str, scope_id: str) -> Awaitable[Any]: ...


class PlanningRunnerProtocol(Protocol):
    def __call__(self, *, project_id: str, run_id: str) -> Awaitable[Any]: ...


class PageArtRunnerProtocol(Protocol):
    def __call__(
        self,
        *,
        project_id: str,
        run_id: str,
        image_budget_usd: float,
        thumbnail_artifact_id: str,
    ) -> Awaitable[Any]: ...


#: eval runner: (project_id, run_id, planned scope) -> (scorecard artifact
#: id or None, judge+vision cost in USD)
EvalRunner = Callable[[str, str, PlannedScope], Awaitable[tuple[str | None, float]]]


@dataclass
class ScopeExecutionResult:
    sequence: int
    scope_id: str | None
    run_id: str | None
    status: str  # "succeeded" | "refused_preflight" | "failed"
    text_cost_usd: float = 0.0
    image_cost_usd: float = 0.0
    judge_cost_usd: float = 0.0
    reused_stages: list[str] = field(default_factory=list)
    plan_artifact_id: str | None = None
    script_artifact_id: str | None = None
    thumbnail_artifact_id: str | None = None
    scorecard_artifact_id: str | None = None
    memory_version_after: int | None = None
    error: str | None = None


@dataclass
class ChainOutcome:
    status: str  # "completed" | "stopped_preflight" | "stopped_failure"
    executions: list[ScopeExecutionResult]
    remaining_text_usd: float
    remaining_image_usd: float

    @property
    def total_text_cost_usd(self) -> float:
        return sum(item.text_cost_usd + item.judge_cost_usd for item in self.executions)

    @property
    def total_image_cost_usd(self) -> float:
        return sum(item.image_cost_usd for item in self.executions)


class WholeBookChainExecutor:
    """Sequential scope-chain execution over injected stage runners."""

    def __init__(
        self,
        repositories: Repositories,
        *,
        direction_runner: DirectionRunnerProtocol,
        page_writing_runner: PlanningRunnerProtocol,
        thumbnail_runner: PlanningRunnerProtocol,
        page_art_runner: PageArtRunnerProtocol,
        eval_runner: EvalRunner | None = None,
        memory_merge: MemoryMergeService | None = None,
        text_budget_usd: float,
        image_budget_usd: float,
        created_by: str = "whole-book-chain",
    ) -> None:
        self._repositories = repositories
        self._direction_runner = direction_runner
        self._page_writing_runner = page_writing_runner
        self._thumbnail_runner = thumbnail_runner
        self._page_art_runner = page_art_runner
        self._eval_runner = eval_runner
        self._memory_merge = memory_merge
        self._text_budget_usd = text_budget_usd
        self._image_budget_usd = image_budget_usd
        self._created_by = created_by

    async def execute(self, plan: ScopeChainPlan) -> ChainOutcome:
        remaining_text = self._text_budget_usd
        remaining_image = self._image_budget_usd
        executions: list[ScopeExecutionResult] = []
        status = "completed"

        for planned in plan.scopes:
            projected_text = planned.budget.text_usd + planned.budget.judge_usd
            if projected_text > remaining_text or planned.budget.image_usd > remaining_image:
                # The hard preflight gate (issue #13): never START a scope
                # the remaining budget cannot cover.
                executions.append(
                    ScopeExecutionResult(
                        sequence=planned.sequence,
                        scope_id=None,
                        run_id=None,
                        status="refused_preflight",
                        error=(
                            f"projected text ${projected_text:.4f} / image "
                            f"${planned.budget.image_usd:.4f} exceeds remaining "
                            f"text ${remaining_text:.4f} / image "
                            f"${remaining_image:.4f}"
                        ),
                    )
                )
                status = "stopped_preflight"
                break

            result = await self._execute_scope(plan, planned, remaining_image)
            executions.append(result)
            remaining_text -= result.text_cost_usd + result.judge_cost_usd
            remaining_image -= result.image_cost_usd
            if result.status != "succeeded":
                status = "stopped_failure"
                break

        return ChainOutcome(
            status=status,
            executions=executions,
            remaining_text_usd=round(remaining_text, 6),
            remaining_image_usd=round(remaining_image, 6),
        )

    # ------------------------------------------------------------------
    # one scope
    # ------------------------------------------------------------------

    async def _execute_scope(
        self,
        plan: ScopeChainPlan,
        planned: PlannedScope,
        remaining_image: float,
    ) -> ScopeExecutionResult:
        result = ScopeExecutionResult(
            sequence=planned.sequence, scope_id=None, run_id=None, status="failed"
        )
        try:
            scope = await self._ensure_scope(plan, planned)
            result.scope_id = scope.scope_id

            direction = await self._direction_runner(
                project_id=plan.project_id, scope_id=scope.scope_id
            )
            result.run_id = direction.run_id
            result.plan_artifact_id = direction.artifact.artifact_id
            self._record_stage(result, "manga_direction", direction)

            script = await self._page_writing_runner(
                project_id=plan.project_id, run_id=direction.run_id
            )
            result.script_artifact_id = script.artifact.artifact_id
            self._record_stage(result, "manga_page_writing", script)

            thumbnail = await self._thumbnail_runner(
                project_id=plan.project_id, run_id=direction.run_id
            )
            result.thumbnail_artifact_id = thumbnail.artifact.artifact_id
            self._record_stage(result, "manga_thumbnail", thumbnail)

            art = await self._page_art_runner(
                project_id=plan.project_id,
                run_id=direction.run_id,
                image_budget_usd=min(planned.budget.image_usd, remaining_image),
                thumbnail_artifact_id=thumbnail.artifact.artifact_id,
            )
            result.image_cost_usd += float(getattr(art, "total_image_cost_usd", 0.0))
            result.judge_cost_usd += float(getattr(art, "total_vision_cost_usd", 0.0))
            if getattr(art, "reused", False):
                result.reused_stages.append("manga_page_art")

            if self._eval_runner is not None:
                scorecard_id, judge_cost = await self._eval_runner(
                    plan.project_id, direction.run_id, planned
                )
                result.scorecard_artifact_id = scorecard_id
                result.judge_cost_usd += judge_cost

            result.memory_version_after = await self._merge_plan_memory(
                plan.project_id, direction.artifact
            )
            result.status = "succeeded"
        except Exception as error:  # noqa: BLE001 — the chain stops, durably
            result.error = f"{type(error).__name__}: {error}"
            logger.warning(
                "scope chain stopped at sequence %s (%s)",
                planned.sequence,
                result.error,
            )
        return result

    async def _ensure_scope(
        self, plan: ScopeChainPlan, planned: PlannedScope
    ) -> ScopeManifestDoc:
        """Content-hashed get-or-create (mirrors ScopeService.create so ids
        are deterministic; create_scope returns the existing doc on replay)."""
        page_ranges = [
            {"page_start": planned.page_start, "page_end": planned.page_end}
        ]
        scope_payload = {
            "project_id": plan.project_id,
            "book_id": plan.book_id,
            "source_unit_ids": list(planned.source_unit_ids),
            "page_ranges": page_ranges,
            "selection_label": planned.label,
            "created_by": self._created_by,
        }
        scope_hash = content_hash(scope_payload)
        doc = construct_document(
            ScopeManifestDoc,
            **scope_payload,
            scope_id=f"scope_{scope_hash[:24]}",
            scope_hash=scope_hash,
            created_at=utc_now(),
        )
        return await self._repositories.create_scope(doc)

    async def _merge_plan_memory(
        self, project_id: str, plan_artifact: Any
    ) -> int | None:
        """Advance rolling canon exactly once per scope (resume-safe)."""
        if self._memory_merge is None:
            return None
        project = await self._repositories.get_project(project_id)
        if project is None:
            return None
        plan = MangaPlan.model_validate(plan_artifact.content)
        if plan.memory_version != project.active_memory_version:
            # Already merged on a previous (crashed / resumed) pass — the
            # active version moved past the plan's compile version.
            return project.active_memory_version
        delta = plan_memory_delta(plan, plan_artifact_id=plan_artifact.artifact_id)
        snapshot = await self._memory_merge.merge(delta)
        return snapshot.memory_version

    @staticmethod
    def _record_stage(result: ScopeExecutionResult, stage: str, outcome: Any) -> None:
        if getattr(outcome, "reused", False):
            result.reused_stages.append(stage)
            return
        receipt = getattr(outcome.artifact, "model_receipt", None) or {}
        cost = receipt.get("cost_usd")
        if isinstance(cost, (int, float)):
            result.text_cost_usd += float(cost)
