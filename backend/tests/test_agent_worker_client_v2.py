"""Bounded agent-worker HTTP client + internal tools router boundary.

NEW tests (ADR-012): the ported ``HttpAgentWorkerClient`` against a stubbed
transport, and the adapted ``internal_tools_router`` auth/error mapping via
the FastAPI test client (no Mongo required — the domain-tool service is
faked at the protocol seam).
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.internal_tools import internal_tools_router
from app.contracts.context import AgentGoal, ContextPack
from app.services.agent_worker import AgentWorkerError, HttpAgentWorkerClient
from app.services.domain_tools import DomainToolResponse
from app.services.errors import ArtifactValidationError, AuthorizationError, NotFoundError

FIXTURE_ROOT = Path(__file__).resolve().parent.parent.parent / "packages" / "fixtures"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURE_ROOT / "canonical" / name).read_text())


def build_goal_and_context() -> tuple[AgentGoal, ContextPack]:
    return (
        AgentGoal.model_validate(load_fixture("agent_goal.v1.json")),
        ContextPack.model_validate(load_fixture("context_pack.v1.json")),
    )


class StubAsyncClient:
    """Stands in for httpx.AsyncClient; returns a canned response."""

    def __init__(self, response: httpx.Response) -> None:
        self._response = response
        self.request_kwargs: dict = {}

    def __call__(self, *args, **kwargs):  # constructor stand-in
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, **kwargs):
        self.request_kwargs = {"url": url, **kwargs}
        return self._response


def run_client_with(monkeypatch, response: httpx.Response):
    stub = StubAsyncClient(response)
    monkeypatch.setattr(httpx, "AsyncClient", stub)
    client = HttpAgentWorkerClient(base_url="http://worker.internal", token="t" * 40)
    goal, context = build_goal_and_context()
    return stub, asyncio.run(client.run(goal, context, instructions="bounded test"))


def test_client_returns_candidate_and_trace(monkeypatch):
    payload = {
        "state": "SUCCEEDED",
        "result": {
            "candidate": {"plan_id": "plan_1"},
            "trace": {"provider": "minimax", "model": "MiniMax-M3"},
        },
    }
    stub, result = run_client_with(monkeypatch, httpx.Response(200, json=payload))
    assert result.candidate == {"plan_id": "plan_1"}
    assert result.trace["provider"] == "minimax"
    assert stub.request_kwargs["url"] == "http://worker.internal/internal/v1/agent-runs"
    assert stub.request_kwargs["headers"]["authorization"] == "Bearer " + "t" * 40
    goal, context = build_goal_and_context()
    assert stub.request_kwargs["json"]["goal"] == goal.model_dump(mode="json")
    assert stub.request_kwargs["json"]["context"] == context.model_dump(mode="json")


def test_client_rejects_unsuccessful_state(monkeypatch):
    payload = {"state": "FAILED", "error": {"code": "RUN_TIMEOUT", "message": "boom"}}
    with pytest.raises(AgentWorkerError):
        run_client_with(monkeypatch, httpx.Response(200, json=payload))


def test_client_rejects_http_error(monkeypatch):
    with pytest.raises(AgentWorkerError):
        run_client_with(monkeypatch, httpx.Response(503, json={"error": {}}))


def test_client_rejects_missing_result(monkeypatch):
    with pytest.raises(AgentWorkerError):
        run_client_with(monkeypatch, httpx.Response(200, json={"state": "SUCCEEDED"}))


# ---------------------------------------------------------------------------
# internal tools router
# ---------------------------------------------------------------------------

TOKEN = "internal-tool-token-for-tests-0123456789"


class FakeDomainTools:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.calls: list[str] = []

    async def execute(self, tool_name, request):
        self.calls.append(tool_name)
        if self.error is not None:
            raise self.error
        return DomainToolResponse(content="ok", data={"tool": tool_name})


def build_app(error: Exception | None = None) -> tuple[TestClient, FakeDomainTools]:
    fake = FakeDomainTools(error)
    app = FastAPI()
    app.include_router(internal_tools_router(fake, service_token=TOKEN))
    return TestClient(app), fake


def tool_body() -> dict:
    return {
        "arguments": {"source_unit_id": "unit_ch01_p001_010"},
        "scope": {
            "correlation_id": "corr-1",
            "goal_id": "goal_1",
            "run_id": "run_1",
            "stage_run_id": "stage_1",
            "context_pack_id": "context_pack_001",
            "project_id": "project_demo",
        },
    }


def test_router_requires_service_token():
    client, fake = build_app()
    denied = client.post("/internal/v1/agent-tools/get_source_excerpt", json=tool_body())
    assert denied.status_code == 401
    wrong = client.post(
        "/internal/v1/agent-tools/get_source_excerpt",
        json=tool_body(),
        headers={"authorization": "Bearer nope"},
    )
    assert wrong.status_code == 401
    assert fake.calls == []


def test_router_executes_with_valid_token():
    client, fake = build_app()
    response = client.post(
        "/internal/v1/agent-tools/get_source_excerpt",
        json=tool_body(),
        headers={"authorization": f"Bearer {TOKEN}"},
    )
    assert response.status_code == 200
    assert response.json()["content"] == "ok"
    assert fake.calls == ["get_source_excerpt"]


@pytest.mark.parametrize(
    "error,expected_status",
    [
        (AuthorizationError("nope"), 403),
        (NotFoundError("missing"), 404),
        (ArtifactValidationError("invalid"), 422),
    ],
)
def test_router_maps_control_plane_errors(error, expected_status):
    client, _ = build_app(error)
    response = client.post(
        "/internal/v1/agent-tools/get_source_excerpt",
        json=tool_body(),
        headers={"authorization": f"Bearer {TOKEN}"},
    )
    assert response.status_code == expected_status
    assert response.json()["detail"]["code"] == error.code
