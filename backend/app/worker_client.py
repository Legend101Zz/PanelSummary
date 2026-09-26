"""Client for the agent worker (the sealed Pi + MiniMax harness).

The backend never talks to MiniMax itself. Every model call goes through the
worker, which returns the accepted artifact plus the measured trace.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import httpx

from app.settings import get_settings


class WorkerUnavailable(RuntimeError):
    """The worker could not be reached or refused the call (retryable)."""


@dataclass
class WorkerOutcome:
    state: str  # SUCCEEDED | FAILED | CANCELLED
    result: Optional[dict[str, Any]]
    error: Optional[dict[str, Any]]
    trace: Optional[dict[str, Any]]


def _headers() -> dict[str, str]:
    token = get_settings().agent_worker_token
    if len(token) < 32:
        raise WorkerUnavailable("AGENT_WORKER_TOKEN is not configured for the backend")
    return {"authorization": f"Bearer {token}"}


async def run_goal(
    goal_type: str,
    run_id: str,
    payload: dict[str, Any],
    *,
    model: str,
    thinking: str,
    vision: bool = False,
) -> WorkerOutcome:
    settings = get_settings()
    body = {
        "goal_type": goal_type,
        "run_id": run_id,
        "input": payload,
        "model": model,
        "thinking": thinking,
        "vision": vision,
    }
    try:
        async with httpx.AsyncClient(timeout=settings.agent_call_timeout_seconds) as client:
            response = await client.post(f"{settings.agent_worker_url}/internal/v2/runs", json=body, headers=_headers())
    except httpx.HTTPError as error:
        raise WorkerUnavailable(f"agent worker unreachable: {error.__class__.__name__}") from error
    if response.status_code in (429, 502, 503):
        raise WorkerUnavailable(f"agent worker busy ({response.status_code})")
    if response.status_code != 200:
        raise WorkerUnavailable(f"agent worker HTTP {response.status_code}: {response.text[:300]}")
    data = response.json()
    return WorkerOutcome(
        state=data.get("state", "FAILED"),
        result=data.get("result"),
        error=data.get("error"),
        trace=data.get("trace"),
    )


async def cancel_run(run_id: str) -> None:
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            await client.post(f"{settings.agent_worker_url}/internal/v2/runs/{run_id}/cancel", headers=_headers())
    except (httpx.HTTPError, WorkerUnavailable):
        pass


async def egress() -> dict[str, int]:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(f"{settings.agent_worker_url}/internal/v2/egress", headers=_headers())
    response.raise_for_status()
    return response.json().get("hosts", {})
