"""``GET /status``: what the first-run and Settings screens show about this server (D25).

Read only. It spends nothing and makes no model call. The worker check is its free ``/readyz``.
The response has no key, no token and no database URL, by construction: every field below is
named in the code, and ``tests/test_status.py`` and ``tests/test_static_guards.py`` verify it.
"""

from __future__ import annotations

from datetime import timedelta

import httpx
from fastapi import APIRouter

from app import APP_VERSION
from app.documents import RunnerHeartbeat, utcnow
from app.settings import Settings, get_settings

router = APIRouter()

WORKER_TIMEOUT_SECONDS = 2.0
# The runner writes its heartbeat on every poll. It counts as running when the last beat is
# younger than three polls plus this margin (a busy event loop may delay one beat).
RUNNER_MARGIN_SECONDS = 5.0


async def runner_state(settings: Settings) -> dict:
    beat = await RunnerHeartbeat.find_one(RunnerHeartbeat.key == "runner")
    if beat is None:
        return {"running": False, "last_seen": None}
    at = beat.at
    fresh = utcnow() - at.astimezone(utcnow().tzinfo) <= timedelta(seconds=3 * settings.job_poll_seconds + RUNNER_MARGIN_SECONDS)
    return {"running": fresh, "last_seen": at.isoformat()}


async def worker_state(settings: Settings) -> dict:
    """Ask the worker's ``/readyz`` (free). ``ready`` there means the MiniMax key is set.

    The replay worker also answers ``ready: true``, with ``replay: true``. It uses no key, so then
    ``replay`` is true and ``key_set`` is false: the screens never say "key set" for a replay.
    """
    try:
        async with httpx.AsyncClient(timeout=WORKER_TIMEOUT_SECONDS) as client:
            response = await client.get(f"{settings.agent_worker_url}/readyz")
    except httpx.HTTPError:
        return {"reachable": False, "key_set": False, "replay": False}
    try:
        body = response.json()
        ready = body.get("ready") is True
        replay = ready and body.get("replay") is True
    except (ValueError, AttributeError):
        ready, replay = False, False
    return {"reachable": True, "key_set": ready and not replay, "replay": replay}


@router.get("/status")
async def status() -> dict:
    settings = get_settings()
    return {
        "api": "ok",
        "version": APP_VERSION,
        "runner": await runner_state(settings),
        "worker": await worker_state(settings),
        # The thinking level asked for each goal (D13). What the provider was sent is on the receipts.
        "models": [
            {"step": "understanding", "model": settings.understanding_model, "thinking": settings.understanding_thinking},
            {"step": "plan", "model": settings.plan_model, "thinking": settings.plan_thinking},
            {"step": "pages", "model": settings.page_model, "thinking": settings.page_thinking},
        ],
        "limits": {
            "max_pdf_size_mb": settings.max_pdf_size_mb,
            "max_pdf_pages": settings.max_pdf_pages,
            "max_source_words": settings.max_source_words,
            "page_attempts": settings.page_attempts,
            "page_concurrency": settings.page_concurrency,
        },
        "plan_review_default": settings.plan_review_default,
    }
