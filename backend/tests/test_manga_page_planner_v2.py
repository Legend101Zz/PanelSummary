"""Page-writing and thumbnail goal drivers: lifecycle, broker round-trip, receipts.

NEW tests (Session 4, issues #5/#6). The fake agent workers here submit their
candidates through the REAL ported ``MangaDomainToolService`` — exactly what
the sealed Node worker does over HTTP — so the drivers' acceptance paths
(candidate durably validated by the broker, receipt matching the issue-#3
provider policy, thumbnail compile/preview lineage) are exercised end to end
in-process on top of a real Manga Director run.
"""

import asyncio
import json
import sys
from copy import deepcopy
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from beanie import PydanticObjectId

from app.contracts.manga import MangaPlan, PageScript
from app.models import Book, BookChapter, BookSection
from app.persistence.documents import MangaProjectDoc, construct_document
from app.persistence.repositories import InMemoryRepositories
from app.services.agent_worker import AgentExecutionResult
from app.services.book_normalization import source_units_for_book
from app.services.domain_tools import DomainToolRequest, DomainToolScope
from app.services.errors import ArtifactValidationError, AuthorizationError
from app.services.manga_director import MangaDirectorService
from app.services.manga_page_planner import (
    MangaPagePlannerError,
    MangaPagePlannerService,
    POLICY_MODEL,
)
from app.services.page_domain_tools import MangaDomainToolService
from app.services.scopes import ScopeService
from app.contracts.source import PageRange

PROJECT_ID = "proj-planner-1"
FIXTURE_ROOT = Path(__file__).resolve().parents[2] / "packages" / "fixtures" / "canonical"


def _fixture(name: str) -> dict:
    return json.loads((FIXTURE_ROOT / name).read_text(encoding="utf-8"))


def _book() -> Book:
    chapters = []
    for index, text in enumerate(
        [
            "The mice woke early and ran the maze.",
            "The cheese was gone; someone had moved it.",
            "Hem shouted at the empty station walls.",
            "Haw laughed at himself and let go.",
        ]
    ):
        chapters.append(
            BookChapter(
                index=index,
                title=f"Chapter {index}",
                page_start=index * 2 + 1,
                page_end=index * 2 + 2,
                word_count=20,
                sections=[
                    BookSection(
                        title=f"Section {index}",
                        content=text,
                        page_start=index * 2 + 1,
                        page_end=index * 2 + 2,
                    )
                ],
            )
        )
    return construct_document(
        Book,
        id=PydanticObjectId(),
        title="Planner Fixture",
        pdf_hash="b" * 64,
        total_pages=8,
        total_chapters=4,
        chapters=chapters,
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
        page_ranges=[PageRange(page_start=1, page_end=8)],
        selection_label="whole planner fixture book",
        created_by="tests",
    )
    return repositories, scope.scope_id


def _plan_payload(goal, context) -> dict:
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
        "summary": "Four grounded beats across the fixture book.",
        "target_page_count": len(beats),
        "beats": beats,
        "character_state_updates": [],
        "terminology_updates": [],
        "new_facts": [],
        "ending_state": "Haw lets go and moves on.",
        "unresolved_thread_updates": [],
    }


class DirectorFakeWorker:
    """Session 3 fake: submits a MangaPlan through the real broker dispatch."""

    def __init__(self, repositories: InMemoryRepositories) -> None:
        self._tools = MangaDomainToolService(repositories, repositories)

    async def run(self, goal, context, *, instructions=None):
        plan = _plan_payload(goal, context)
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
                "session_id": "sess-dir-1",
                "goal_type": "MANGA_DIRECTION",
                "provider": "minimax",
                "model": "MiniMax-M3",
                "skill_name": "manga-direction",
                "skill_version": "1.0.0",
                "skill_hash": "c" * 64,
                "tool_calls": [{"name": "submit_manga_plan", "state": "succeeded"}],
                "tokens": {"input": 1200, "output": 800, "total": 2000},
                "cost_usd": 0.021,
                "latency_ms": 1450,
                "compaction_count": 0,
            },
        )


def _two_page_scripts(plan: MangaPlan) -> list[dict]:
    """Two 2-panel page scripts derived from the canonical fixture page.

    Panel source_refs are replaced with the accepted plan's beat refs so the
    ported ``_validate_script_sources`` hash check passes.
    """
    base = _fixture("manga_page_plan.v1.json")["page_script"]
    refs = [ref.model_dump(mode="json") for beat in plan.beats for ref in beat.source_refs]
    assert len(refs) >= 4
    pages = []
    for page_index in range(2):
        raw = json.dumps(base)
        for panel_index, panel in enumerate(base["panels"]):
            raw = raw.replace(
                f'"{panel["panel_id"]}"', f'"p{page_index}_panel_{panel_index}"'
            )
        page = json.loads(raw)
        page["page_id"] = f"page_{page_index}"
        page["page_index"] = page_index
        for panel_index, panel in enumerate(page["panels"]):
            panel["source_refs"] = [refs[page_index * 2 + panel_index]]
            panel["source_fact_ids"] = []
        pages.append(page)
    return pages


class PlanningFakeWorker:
    """Submits planning candidates through the real merged broker dispatch."""

    def __init__(
        self,
        repositories: InMemoryRepositories,
        media_root: Path,
        *,
        provider: str = "minimax",
        model: str = POLICY_MODEL,
        bypass_broker: bool = False,
    ) -> None:
        self._repositories = repositories
        self._tools = MangaDomainToolService(
            repositories, repositories, media_root=media_root
        )
        self._provider = provider
        self._model = model
        self._bypass_broker = bypass_broker
        self.calls = 0

    def _scope(self, goal, context) -> DomainToolScope:
        return DomainToolScope(
            correlation_id=goal.goal_id,
            goal_id=goal.goal_id,
            run_id=goal.run_id,
            stage_run_id=goal.stage_run_id,
            context_pack_id=context.context_pack_id,
            project_id=context.project_id,
        )

    def _trace(self, goal_type: str, skill_name: str) -> dict:
        return {
            "session_id": f"sess-{skill_name}-1",
            "goal_type": goal_type,
            "provider": self._provider,
            "model": self._model,
            "skill_name": skill_name,
            "skill_version": "1.0.0",
            "skill_hash": "d" * 64,
            "tool_calls": [],
            "tokens": {"input": 900, "output": 500, "total": 1400},
            "cost_usd": 0.004,
            "latency_ms": 900,
            "compaction_count": 0,
        }

    async def run(self, goal, context, *, instructions=None):
        self.calls += 1
        if goal.goal_type.value == "MANGA_PAGE_WRITING":
            return await self._run_page_writing(goal, context)
        return await self._run_thumbnail(goal, context)

    async def _run_page_writing(self, goal, context):
        plan_ref = next(
            ref for ref in context.parent_artifacts if ref.kind.value == "manga_plan"
        )
        plan_artifact = await self._repositories.get_artifact(plan_ref.artifact_id)
        plan = MangaPlan.model_validate(plan_artifact.content)
        script_set = {
            "schema_version": "page-script-set.v1",
            "script_set_id": "script_set_planner_test",
            "project_id": context.project_id,
            "plan_artifact_id": plan_ref.artifact_id,
            "context_pack_id": context.context_pack_id,
            "pages": _two_page_scripts(plan),
        }
        if not self._bypass_broker:
            await self._tools.execute(
                "submit_page_script_set",
                DomainToolRequest(
                    arguments={"script_set": script_set},
                    scope=self._scope(goal, context),
                ),
            )
        return AgentExecutionResult(
            candidate=script_set,
            trace=self._trace("MANGA_PAGE_WRITING", "manga-page-writing"),
        )

    async def _run_thumbnail(self, goal, context):
        script_ref = next(
            ref for ref in context.parent_artifacts if ref.kind.value == "page_script_set"
        )
        script_artifact = await self._repositories.get_artifact(script_ref.artifact_id)
        base_plan = _fixture("manga_page_plan.v1.json")
        page_plans = []
        for index, page in enumerate(script_artifact.content["pages"]):
            plan = deepcopy(base_plan)
            plan["page_plan_id"] = f"page_plan_{index}"
            plan["project_id"] = context.project_id
            plan["script_set_artifact_id"] = script_ref.artifact_id
            plan["page_script"] = deepcopy(page)
            plan["source_fact_ids"] = []
            page_script = PageScript.model_validate(page)
            mapping = {}
            for panel_index, panel in enumerate(page_script.panels):
                mapping[f"panel_{panel_index + 1}"] = panel.panel_id
            raw = json.dumps(plan["layout_root"])
            edges = json.dumps(plan["reading_edges"])
            for old, new in mapping.items():
                raw = raw.replace(f'"{old}"', f'"{new}"')
                edges = edges.replace(f'"{old}"', f'"{new}"')
            plan["layout_root"] = json.loads(raw)
            plan["reading_edges"] = json.loads(edges)
            page_plans.append(plan)
        thumbnail_set = {
            "schema_version": "thumbnail-set.v1",
            "thumbnail_set_id": "thumbnail_set_planner_test",
            "project_id": context.project_id,
            "script_set_artifact_id": script_ref.artifact_id,
            "page_plans": page_plans,
        }
        if not self._bypass_broker:
            await self._tools.execute(
                "submit_thumbnail_set",
                DomainToolRequest(
                    arguments={"thumbnail_set": thumbnail_set},
                    scope=self._scope(goal, context),
                ),
            )
        return AgentExecutionResult(
            candidate=thumbnail_set,
            trace=self._trace("MANGA_THUMBNAIL", "manga-thumbnail"),
        )


def run(coro):
    return asyncio.run(coro)


async def _direction_run(repositories, scope_id) -> str:
    director = MangaDirectorService(repositories, DirectorFakeWorker(repositories))
    outcome = await director.run_direction_goal(project_id=PROJECT_ID, scope_id=scope_id)
    return outcome.run_id


def test_page_writing_goal_accepts_script_set_with_policy_receipt(tmp_path):
    async def scenario():
        repositories, scope_id = await _seeded()
        run_id = await _direction_run(repositories, scope_id)
        worker = PlanningFakeWorker(repositories, tmp_path)
        planner = MangaPagePlannerService(repositories, worker)
        outcome = await planner.run_page_writing_goal(
            project_id=PROJECT_ID, run_id=run_id
        )

        assert outcome.reused is False
        artifact = outcome.artifact
        assert artifact.kind == "page_script_set"
        assert artifact.validation_status == "accepted"
        receipt = artifact.model_receipt
        assert receipt["provider"] == "minimax"
        assert receipt["model"] == POLICY_MODEL
        assert receipt["purpose"] == "manga_page_writing"
        assert receipt["cost_usd"] == 0.004

        pack = await repositories.get_artifact(outcome.context_pack_id)
        assert pack is not None and pack.validation_status == "accepted"
        assert pack.content["purpose"] == "manga_page_writing"
        # The fresh pack's parents carry the accepted MangaPlan lineage.
        assert pack.content["parent_artifacts"][0]["kind"] == "manga_plan"

        run_doc = await repositories.get_run(run_id)
        assert run_doc.status == "succeeded" and run_doc.active_stage is None
        stage = await repositories.get_stage(outcome.stage_run_id)
        assert stage.stage_name == "manga_page_writing"
        assert stage.status == "succeeded"
        assert stage.agent_session_id == "sess-manga-page-writing-1"

    run(scenario())


def test_page_writing_goal_is_idempotent_and_does_not_pay_twice(tmp_path):
    async def scenario():
        repositories, scope_id = await _seeded()
        run_id = await _direction_run(repositories, scope_id)
        worker = PlanningFakeWorker(repositories, tmp_path)
        planner = MangaPagePlannerService(repositories, worker)
        first = await planner.run_page_writing_goal(project_id=PROJECT_ID, run_id=run_id)
        second = await planner.run_page_writing_goal(project_id=PROJECT_ID, run_id=run_id)
        assert worker.calls == 1
        assert second.reused is True
        assert second.artifact.artifact_id == first.artifact.artifact_id

    run(scenario())


def test_page_writing_goal_rejects_off_policy_model(tmp_path):
    async def scenario():
        repositories, scope_id = await _seeded()
        run_id = await _direction_run(repositories, scope_id)
        # Worker answers on M3 while the planner instance requires the
        # issue-#3 policy model — never silently switch models.
        worker = PlanningFakeWorker(repositories, tmp_path, model="MiniMax-M3")
        planner = MangaPagePlannerService(repositories, worker)
        with pytest.raises(ArtifactValidationError, match="manga_page_writing must record"):
            await planner.run_page_writing_goal(project_id=PROJECT_ID, run_id=run_id)

    run(scenario())


def test_page_writing_ab_override_is_explicit_not_silent(tmp_path):
    async def scenario():
        repositories, scope_id = await _seeded()
        run_id = await _direction_run(repositories, scope_id)
        worker = PlanningFakeWorker(repositories, tmp_path, model="MiniMax-M3")
        planner = MangaPagePlannerService(
            repositories, worker, required_model="MiniMax-M3"
        )
        outcome = await planner.run_page_writing_goal(
            project_id=PROJECT_ID, run_id=run_id
        )
        assert outcome.artifact.model_receipt["model"] == "MiniMax-M3"

    run(scenario())


def test_page_writing_goal_requires_broker_validated_candidate(tmp_path):
    async def scenario():
        repositories, scope_id = await _seeded()
        run_id = await _direction_run(repositories, scope_id)
        worker = PlanningFakeWorker(repositories, tmp_path, bypass_broker=True)
        planner = MangaPagePlannerService(repositories, worker)
        with pytest.raises(ArtifactValidationError, match="not durably accepted"):
            await planner.run_page_writing_goal(project_id=PROJECT_ID, run_id=run_id)

    run(scenario())


def test_thumbnail_goal_accepts_set_with_full_preview_lineage(tmp_path):
    async def scenario():
        repositories, scope_id = await _seeded()
        run_id = await _direction_run(repositories, scope_id)
        worker = PlanningFakeWorker(repositories, tmp_path)
        planner = MangaPagePlannerService(repositories, worker)
        await planner.run_page_writing_goal(project_id=PROJECT_ID, run_id=run_id)
        outcome = await planner.run_thumbnail_goal(project_id=PROJECT_ID, run_id=run_id)

        artifact = outcome.artifact
        assert artifact.kind == "thumbnail_set"
        assert artifact.validation_status == "accepted"
        assert artifact.model_receipt["purpose"] == "manga_thumbnail"
        assert artifact.model_receipt["model"] == POLICY_MODEL

        stage = await repositories.get_stage(outcome.stage_run_id)
        # accepted set + report + 2 layouts + 2 compiled + 2 previews
        assert len(stage.output_artifact_ids) == 8
        kinds = []
        for artifact_id in stage.output_artifact_ids:
            item = await repositories.get_artifact(artifact_id)
            kinds.append(item.kind)
        assert kinds.count("thumbnail_set") == 1
        assert kinds.count("validation_report") == 1
        assert kinds.count("page_layout") == 2
        assert kinds.count("compiled_layout") == 2
        assert kinds.count("thumbnail_preview") == 2
        # Zero image artifacts anywhere in the run (image-free planning lane).
        all_artifacts = await repositories.list_artifacts(run_id, accepted_only=False)
        assert not any(item.kind == "image_attempt" for item in all_artifacts)

        run_doc = await repositories.get_run(run_id)
        assert run_doc.status == "succeeded" and run_doc.active_stage is None

    run(scenario())


def test_thumbnail_goal_requires_accepted_page_scripts_first(tmp_path):
    async def scenario():
        repositories, scope_id = await _seeded()
        run_id = await _direction_run(repositories, scope_id)
        worker = PlanningFakeWorker(repositories, tmp_path)
        planner = MangaPagePlannerService(repositories, worker)
        with pytest.raises(MangaPagePlannerError, match="no succeeded manga_page_writing"):
            await planner.run_thumbnail_goal(project_id=PROJECT_ID, run_id=run_id)

    run(scenario())


def test_planner_denies_foreign_project_run(tmp_path):
    async def scenario():
        repositories, scope_id = await _seeded()
        run_id = await _direction_run(repositories, scope_id)
        worker = PlanningFakeWorker(repositories, tmp_path)
        planner = MangaPagePlannerService(repositories, worker)
        with pytest.raises(AuthorizationError):
            await planner.run_page_writing_goal(
                project_id="proj-other", run_id=run_id
            )

    run(scenario())
