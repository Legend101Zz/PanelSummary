"""Session 5 (step 0.3): durable receipts/traces for FAILED agent runs.

Session 4's ledger had to ESTIMATE every failed-run cost because a failed
worker run persisted nothing. These tests pin the fix end to end at the
driver seam:

- a worker failure durably marks the stage row failed WITH the measured
  worker-side trace (tokens, cost, latency, tool calls, session id) and an
  appended ``failure_history`` receipt;
- a retry re-arms the stage with an incremented attempt and cannot
  overwrite the failure receipt;
- successful runs store their full trace (including the ``tool_calls``
  list — issue #8 traces checkbox) on the stage row;
- network-class failures (no worker body) persist with ``trace=None``.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import pytest

from app.services.agent_worker import AgentWorkerError
from app.services.manga_director import MangaDirectorService
from app.services.manga_page_planner import MangaPagePlannerService
from test_manga_page_planner_v2 import (
    PROJECT_ID,
    DirectorFakeWorker,
    PlanningFakeWorker,
    _direction_run,
    _seeded,
)

FAILURE_TRACE = {
    "session_id": "sess-failed-page-writing",
    "goal_type": "MANGA_PAGE_WRITING",
    "provider": "minimax",
    "model": "MiniMax-M2.7-highspeed",
    "skill_name": "manga-page-writing",
    "skill_version": "1.3.0",
    "skill_hash": "d" * 64,
    "tool_calls": [
        {"name": "get_manga_canon", "state": "succeeded"},
        {"name": "submit_page_script_set", "state": "failed"},
    ],
    "tokens": {"input": 34135, "output": 220, "total": 34355},
    "cost_usd": 0.0287,
    "latency_ms": 41800,
    "compaction_count": 0,
}


class FailingWorker:
    def __init__(self, trace: dict | None):
        self.calls = 0
        self._trace = trace

    async def run(self, goal, context, *, instructions=None):
        self.calls += 1
        if self._trace is None:
            raise AgentWorkerError(
                "Agent worker request failed: connection refused",
                error_code="network_error",
            )
        raise AgentWorkerError(
            "Agent worker returned HTTP 422",
            state="FAILED",
            error_code="AGENT_RUNTIME_ERROR",
            error_message="Agent finished without submit_page_script_set",
            trace=self._trace,
            http_status=422,
        )


def run(coro):
    return asyncio.run(coro)


def test_failed_page_writing_run_persists_trace_receipt():
    async def scenario():
        repositories, scope_id = await _seeded()
        run_id = await _direction_run(repositories, scope_id)
        planner = MangaPagePlannerService(repositories, FailingWorker(FAILURE_TRACE))
        with pytest.raises(AgentWorkerError):
            await planner.run_page_writing_goal(project_id=PROJECT_ID, run_id=run_id)

        run_doc = await repositories.get_run(run_id)
        assert run_doc.status == "failed"
        assert run_doc.active_stage is None
        stages = await repositories.list_stages(run_id)
        stage = next(s for s in stages if s.stage_name == "manga_page_writing")
        assert stage.status == "failed"
        assert stage.error_code == "AGENT_RUNTIME_ERROR"
        assert stage.error_detail["worker_state"] == "FAILED"
        assert stage.error_detail["http_status"] == 422
        assert stage.trace == FAILURE_TRACE
        assert stage.agent_session_id == "sess-failed-page-writing"
        assert stage.ended_at is not None
        assert len(stage.failure_history) == 1
        receipt = stage.failure_history[0]
        assert receipt["attempt"] == 1
        assert receipt["error_code"] == "AGENT_RUNTIME_ERROR"
        assert receipt["trace"]["cost_usd"] == 0.0287
        assert receipt["trace"]["tokens"]["input"] == 34135

    run(scenario())


def test_retry_after_failure_increments_attempt_and_keeps_failure_receipt(tmp_path):
    async def scenario():
        repositories, scope_id = await _seeded()
        run_id = await _direction_run(repositories, scope_id)
        planner = MangaPagePlannerService(repositories, FailingWorker(FAILURE_TRACE))
        with pytest.raises(AgentWorkerError):
            await planner.run_page_writing_goal(project_id=PROJECT_ID, run_id=run_id)

        retry_planner = MangaPagePlannerService(
            repositories, PlanningFakeWorker(repositories, tmp_path)
        )
        outcome = await retry_planner.run_page_writing_goal(
            project_id=PROJECT_ID, run_id=run_id
        )
        assert outcome.reused is False
        assert outcome.artifact.validation_status == "accepted"
        assert outcome.artifact.model_receipt["attempt"] == 2

        stage = await repositories.get_stage(outcome.stage_run_id)
        assert stage.status == "succeeded"
        assert stage.attempt == 2
        # The success trace (with its tool_calls list) is durably stored...
        assert stage.trace is not None
        assert stage.trace["session_id"] == "sess-manga-page-writing-1"
        assert "tool_calls" in stage.trace
        # ...and the failure receipt survives the retry.
        assert len(stage.failure_history) == 1
        assert stage.failure_history[0]["trace"]["cost_usd"] == 0.0287

        run_doc = await repositories.get_run(run_id)
        assert run_doc.status == "succeeded"

    run(scenario())


def test_network_failure_persists_stage_failure_without_trace():
    async def scenario():
        repositories, scope_id = await _seeded()
        run_id = await _direction_run(repositories, scope_id)
        planner = MangaPagePlannerService(repositories, FailingWorker(None))
        with pytest.raises(AgentWorkerError):
            await planner.run_page_writing_goal(project_id=PROJECT_ID, run_id=run_id)

        stages = await repositories.list_stages(run_id)
        stage = next(s for s in stages if s.stage_name == "manga_page_writing")
        assert stage.status == "failed"
        assert stage.error_code == "network_error"
        assert stage.trace is None
        assert stage.failure_history[0]["trace"] is None

    run(scenario())


def test_successful_direction_run_stores_tool_calls_on_stage_row():
    async def scenario():
        repositories, scope_id = await _seeded()
        run_id = await _direction_run(repositories, scope_id)
        stages = await repositories.list_stages(run_id)
        stage = next(s for s in stages if s.stage_name == "manga_direction")
        assert stage.status == "succeeded"
        assert stage.trace is not None
        assert stage.trace["tool_calls"] == [
            {"name": "submit_manga_plan", "state": "succeeded"}
        ]
        assert stage.trace["cost_usd"] == 0.021

    run(scenario())


class FailingDirectorWorker:
    async def run(self, goal, context, *, instructions=None):
        raise AgentWorkerError(
            "Agent worker returned HTTP 422",
            state="FAILED",
            error_code="RUN_TIMEOUT",
            error_message="Agent run exceeded its bounded timeout",
            trace={
                "session_id": "sess-failed-direction",
                "tokens": {"input": 16102, "output": 0, "total": 16102},
                "cost_usd": 0.0112,
                "latency_ms": 900000,
                "tool_calls": [],
            },
            http_status=422,
        )


def test_failed_direction_run_persists_and_is_retryable():
    async def scenario():
        repositories, scope_id = await _seeded()
        director = MangaDirectorService(repositories, FailingDirectorWorker())
        with pytest.raises(AgentWorkerError):
            await director.run_direction_goal(project_id=PROJECT_ID, scope_id=scope_id)

        failed_stage = next(
            s for s in repositories.stages.values() if s.stage_name == "manga_direction"
        )
        assert failed_stage.status == "failed"
        assert failed_stage.error_code == "RUN_TIMEOUT"
        assert failed_stage.trace["cost_usd"] == 0.0112
        run_doc = await repositories.get_run(failed_stage.run_id)
        assert run_doc.status == "failed"

        retry = MangaDirectorService(repositories, DirectorFakeWorker(repositories))
        outcome = await retry.run_direction_goal(
            project_id=PROJECT_ID, scope_id=scope_id
        )
        assert outcome.reused is False
        assert outcome.artifact.validation_status == "accepted"
        assert outcome.artifact.model_receipt["attempt"] == 2
        stage = await repositories.get_stage(outcome.stage_run_id)
        assert stage.attempt == 2
        assert stage.status == "succeeded"
        assert len(stage.failure_history) == 1

    run(scenario())
