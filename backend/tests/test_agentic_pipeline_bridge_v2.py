"""AGENTIC_MANGA_PIPELINE_V1 shadow-lane bridge: default OFF, fallback-guarded.

NEW tests (Session 4, issues #5/#6, blueprint §12.3). The lane must be
impossible to feel from v1: disabled by default, skipped without a frozen
scope, and swallowing every failure. The success path runs the three goals
in order on one shared run.
"""

import asyncio
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Settings, get_settings
from app.services.agentic_pipeline_bridge import (
    AgenticPlanningOutcome,
    maybe_run_agentic_planning,
    run_agentic_planning_stages,
)


def run(coro):
    return asyncio.run(coro)


@dataclass
class _Artifact:
    artifact_id: str


@dataclass
class _Outcome:
    artifact: _Artifact
    run_id: str


class FakeDirector:
    def __init__(self, fail=False):
        self.fail = fail
        self.calls = []

    async def run_direction_goal(self, *, project_id, scope_id):
        self.calls.append((project_id, scope_id))
        if self.fail:
            raise RuntimeError("worker unreachable")
        return _Outcome(artifact=_Artifact("manga_plan_x"), run_id="run_dir_x")


class FakePlanner:
    def __init__(self):
        self.calls = []

    async def run_page_writing_goal(self, *, project_id, run_id):
        self.calls.append(("page_writing", project_id, run_id))
        return _Outcome(artifact=_Artifact("script_set_x"), run_id=run_id)

    async def run_thumbnail_goal(self, *, project_id, run_id):
        self.calls.append(("thumbnail", project_id, run_id))
        return _Outcome(artifact=_Artifact("thumbnail_set_x"), run_id=run_id)


@dataclass
class _CompiledContext:
    scope_id: str


def _set_flag(monkeypatch, value: bool):
    settings = Settings(agentic_manga_pipeline_v1=value)
    monkeypatch.setattr(
        "app.services.agentic_pipeline_bridge.get_settings", lambda: settings
    )


def test_flag_defaults_off_in_settings():
    assert Settings().agentic_manga_pipeline_v1 is False
    assert get_settings().agentic_manga_pipeline_v1 is False


def test_disabled_flag_touches_nothing(monkeypatch):
    _set_flag(monkeypatch, False)
    director, planner = FakeDirector(), FakePlanner()
    outcome = run(
        maybe_run_agentic_planning(
            project_id="proj",
            compiled_slice_context=_CompiledContext("scope_a"),
            director=director,
            planner=planner,
        )
    )
    assert outcome.status == "disabled"
    assert director.calls == [] and planner.calls == []


def test_flag_on_without_frozen_scope_skips(monkeypatch):
    _set_flag(monkeypatch, True)
    outcome = run(
        maybe_run_agentic_planning(
            project_id="proj",
            compiled_slice_context=None,
            director=FakeDirector(),
            planner=FakePlanner(),
        )
    )
    assert outcome.status == "skipped"
    assert "use_compiled_context" in outcome.detail


def test_failures_are_swallowed_not_raised(monkeypatch):
    _set_flag(monkeypatch, True)
    outcome = run(
        maybe_run_agentic_planning(
            project_id="proj",
            compiled_slice_context=_CompiledContext("scope_a"),
            director=FakeDirector(fail=True),
            planner=FakePlanner(),
        )
    )
    assert outcome.status == "failed"
    assert "worker unreachable" in outcome.detail


def test_success_runs_three_goals_in_order_on_one_run(monkeypatch):
    _set_flag(monkeypatch, True)
    director, planner = FakeDirector(), FakePlanner()
    outcome = run(
        maybe_run_agentic_planning(
            project_id="proj",
            compiled_slice_context=_CompiledContext("scope_a"),
            director=director,
            planner=planner,
        )
    )
    assert outcome.status == "succeeded"
    assert outcome.run_id == "run_dir_x"
    assert outcome.artifact_ids == ("manga_plan_x", "script_set_x", "thumbnail_set_x")
    assert director.calls == [("proj", "scope_a")]
    assert planner.calls == [
        ("page_writing", "proj", "run_dir_x"),
        ("thumbnail", "proj", "run_dir_x"),
    ]


def test_stage_runner_is_loud_without_the_guard():
    director = FakeDirector(fail=True)
    try:
        run(
            run_agentic_planning_stages(
                project_id="proj",
                scope_id="scope_a",
                director=director,
                planner=FakePlanner(),
            )
        )
    except RuntimeError as error:
        assert "worker unreachable" in str(error)
    else:  # pragma: no cover
        raise AssertionError("stage runner must fail loud")


def test_outcome_dataclass_defaults():
    outcome = AgenticPlanningOutcome(status="disabled")
    assert outcome.detail is None and outcome.run_id is None
    assert outcome.artifact_ids == ()
