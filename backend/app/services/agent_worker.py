"""Bounded HTTP client for the authenticated Node agent worker."""

from __future__ import annotations

from typing import Any, Protocol

import httpx
from pydantic import BaseModel, ConfigDict, JsonValue

from app.contracts.context import AgentGoal, ContextPack


class AgentWorkerError(Exception):
    code = "agent_worker_failed"


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
            raise AgentWorkerError(f"Agent worker request failed: {error}") from error
        if len(response.content) > self._max_response_bytes:
            raise AgentWorkerError("Agent worker response exceeded the configured limit")
        if response.status_code != 200:
            raise AgentWorkerError(
                f"Agent worker returned HTTP {response.status_code}"
            )
        try:
            payload = response.json()
        except ValueError as error:
            raise AgentWorkerError("Agent worker returned invalid JSON") from error
        if not isinstance(payload, dict) or payload.get("state") != "SUCCEEDED":
            raise AgentWorkerError("Agent worker did not report a successful bounded run")
        result = payload.get("result")
        if not isinstance(result, dict):
            raise AgentWorkerError("Agent worker response omitted its result")
        candidate = result.get("candidate")
        trace = result.get("trace")
        if not isinstance(candidate, dict) or not isinstance(trace, dict):
            raise AgentWorkerError("Agent worker result omitted candidate or trace evidence")
        return AgentExecutionResult(candidate=candidate, trace=trace)
