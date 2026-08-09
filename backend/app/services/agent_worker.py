"""Bounded HTTP client for the authenticated Node agent worker."""

from __future__ import annotations

from typing import Any, Protocol

import httpx
from pydantic import BaseModel, ConfigDict, JsonValue

from app.contracts.context import AgentGoal, ContextPack


class AgentWorkerError(Exception):
    """Agent worker failure.

    Session 5 (step 0.3): failures now CARRY the worker-side evidence when
    the response body includes it — the run state, the worker error, and the
    measured failure trace (tokens, cost, latency, tool calls, session id) —
    so drivers can persist a real receipt for failed runs instead of an
    estimate. Network-class failures have no body and carry ``trace=None``.
    """

    code = "agent_worker_failed"

    def __init__(
        self,
        message: str,
        *,
        state: str | None = None,
        error_code: str | None = None,
        error_message: str | None = None,
        trace: dict[str, Any] | None = None,
        http_status: int | None = None,
    ) -> None:
        super().__init__(message)
        self.state = state
        self.error_code = error_code
        self.error_message = error_message
        self.trace = trace
        self.http_status = http_status


class AgentExecutionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidate: dict[str, JsonValue]
    trace: dict[str, Any]


class AgentWorkerGateway(Protocol):
    async def run(
        self,
        goal: AgentGoal,
        context: ContextPack,
        *,
        instructions: str | None = None,
    ) -> AgentExecutionResult: ...


class HttpAgentWorkerClient:
    def __init__(
        self,
        *,
        base_url: str,
        token: str,
        timeout_seconds: float = 900,
        max_response_bytes: int = 2 * 1024 * 1024,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = token
        self._timeout_seconds = timeout_seconds
        self._max_response_bytes = max_response_bytes

    async def run(
        self,
        goal: AgentGoal,
        context: ContextPack,
        *,
        instructions: str | None = None,
    ) -> AgentExecutionResult:
        body: dict[str, Any] = {
            "goal": goal.model_dump(mode="json"),
            "context": context.model_dump(mode="json"),
        }
        if instructions:
            body["instructions"] = instructions
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(self._timeout_seconds),
                follow_redirects=False,
            ) as client:
                response = await client.post(
                    f"{self._base_url}/internal/v1/agent-runs",
                    headers={
                        "authorization": f"Bearer {self._token}",
                        "content-type": "application/json",
                        "x-correlation-id": goal.goal_id,
                    },
                    json=body,
                )
        except httpx.HTTPError as error:
            raise AgentWorkerError(
                f"Agent worker request failed: {error}",
                error_code="network_error",
            ) from error
        if len(response.content) > self._max_response_bytes:
            raise AgentWorkerError("Agent worker response exceeded the configured limit")
        if response.status_code != 200:
            raise AgentWorkerError(
                f"Agent worker returned HTTP {response.status_code}",
                http_status=response.status_code,
                **_failure_evidence(response),
            )
        try:
            payload = response.json()
        except ValueError as error:
            raise AgentWorkerError("Agent worker returned invalid JSON") from error
        if not isinstance(payload, dict) or payload.get("state") != "SUCCEEDED":
            raise AgentWorkerError(
                "Agent worker did not report a successful bounded run",
                http_status=response.status_code,
                **_failure_payload_evidence(payload if isinstance(payload, dict) else {}),
            )
        result = payload.get("result")
        if not isinstance(result, dict):
            raise AgentWorkerError("Agent worker response omitted its result")
        candidate = result.get("candidate")
        trace = result.get("trace")
        if not isinstance(candidate, dict) or not isinstance(trace, dict):
            raise AgentWorkerError("Agent worker result omitted candidate or trace evidence")
        return AgentExecutionResult(candidate=candidate, trace=trace)


def _failure_evidence(response: httpx.Response) -> dict[str, Any]:
    """Extract worker failure evidence from a non-200 body (Session 5 0.3)."""
    try:
        payload = response.json()
    except ValueError:
        return {}
    if not isinstance(payload, dict):
        return {}
    return _failure_payload_evidence(payload)


def _failure_payload_evidence(payload: dict[str, Any]) -> dict[str, Any]:
    evidence: dict[str, Any] = {}
    state = payload.get("state")
    if isinstance(state, str):
        evidence["state"] = state
    error = payload.get("error")
    if isinstance(error, dict):
        code = error.get("code")
        message = error.get("message")
        if isinstance(code, str):
            evidence["error_code"] = code
        if isinstance(message, str):
            evidence["error_message"] = message
    trace = payload.get("failure_trace")
    if not isinstance(trace, dict):
        result = payload.get("result")
        trace = result.get("trace") if isinstance(result, dict) else None
    if isinstance(trace, dict):
        evidence["trace"] = trace
    return evidence
