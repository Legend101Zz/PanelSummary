"""``GET /status``: worker readiness, runner heartbeat, models, limits, and no secret (D25).

The worker is a fake app over real HTTP. No test calls a model. Needs a MongoDB at
$TEST_MONGODB_URL (skipped when none is reachable); the database is a throwaway one.
"""

from __future__ import annotations

import asyncio
import json
import re
import uuid
from datetime import timedelta

import httpx
from fastapi import FastAPI
from fastapi.responses import JSONResponse

import test_generate_journey as journey
from test_preflight import _env, needs_mongo

SECRET_NAME = re.compile(r"key|token|secret|password|passwd|credential|auth|url|uri|mongo", re.IGNORECASE)
ALLOWED_NAMES = {"key_set", "replay"}  # a boolean: says that a key exists, never the key


def _worker(ready: bool | None, extra: dict | None = None) -> FastAPI:
    """A fake worker. ``ready`` None = no /readyz route at all (an old worker)."""
    app = FastAPI()
    if ready is not None:

        @app.get("/readyz")
        async def readyz():
            body = {"ready": ready, "active_runs": 0, **(extra or {})}
            return JSONResponse(body, status_code=200 if ready else 503)  # the real worker answers 503 without a key

    return app


def _names(value, path=""):
    """Every key name in a JSON value."""
    if isinstance(value, dict):
        for key, inner in value.items():
            yield key
            yield from _names(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from _names(inner)


async def _status(app_under_test, **_):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app_under_test), base_url="http://api") as api:
        return (await api.get("/status")).json()


def _with_stack(tmp_path, monkeypatch, worker_app, scenario, port=None, **env):
    server = None
    if worker_app is not None:
        port = journey._free_port()
        server = journey._serve(worker_app, port)
    elif port is None:
        port = journey._free_port()  # nothing listens here: the worker is down
    db_name = f"ps_status_{uuid.uuid4().hex[:8]}"
    _env(monkeypatch, tmp_path, db_name, worker_port=port, **env)

    async def main():
        from app.db import init_db
        from app.main import app

        client_db = await init_db()
        try:
            await scenario(app)
        finally:
            await client_db.drop_database(db_name)

    from app import db as db_module
    from app.settings import get_settings

    try:
        asyncio.run(main())
    finally:
        if server:
            server.should_exit = True
        get_settings.cache_clear()
        db_module._client = None


@needs_mongo
def test_worker_up_with_key(tmp_path, monkeypatch):
    async def scenario(app):
        body = await _status(app)
        assert body["worker"] == {"reachable": True, "key_set": True, "replay": False}
        assert body["api"] == "ok" and body["version"] == "0.2.0"

    _with_stack(tmp_path, monkeypatch, _worker(True), scenario)


@needs_mongo
def test_worker_up_without_key(tmp_path, monkeypatch):
    async def scenario(app):
        assert (await _status(app))["worker"] == {"reachable": True, "key_set": False, "replay": False}

    _with_stack(tmp_path, monkeypatch, _worker(False), scenario)


@needs_mongo
def test_replay_worker_is_replay_and_has_no_key_set(tmp_path, monkeypatch):
    async def scenario(app):
        body = await _status(app)
        assert body["worker"] == {"reachable": True, "key_set": False, "replay": True}
        assert not SECRET_NAME.search("replay")  # the new field name is not secret-looking
        assert set(_names(body)) >= {"replay"}

    _with_stack(tmp_path, monkeypatch, _worker(True, {"replay": True}), scenario)


@needs_mongo
def test_replay_flag_needs_a_ready_worker(tmp_path, monkeypatch):
    async def scenario(app):
        assert (await _status(app))["worker"] == {"reachable": True, "key_set": False, "replay": False}

    _with_stack(tmp_path, monkeypatch, _worker(False, {"replay": True}), scenario)


@needs_mongo
def test_worker_down(tmp_path, monkeypatch):
    async def scenario(app):
        assert (await _status(app))["worker"] == {"reachable": False, "key_set": False, "replay": False}

    _with_stack(tmp_path, monkeypatch, None, scenario)


@needs_mongo
def test_an_old_worker_without_readyz_has_no_key_set(tmp_path, monkeypatch):
    async def scenario(app):
        assert (await _status(app))["worker"] == {"reachable": True, "key_set": False, "replay": False}

    _with_stack(tmp_path, monkeypatch, _worker(None), scenario)


@needs_mongo
def test_a_slow_worker_is_cut_off_after_two_seconds(tmp_path, monkeypatch):
    app = FastAPI()

    @app.get("/readyz")
    async def readyz():
        await asyncio.sleep(5)
        return {"ready": True}

    async def scenario(api_app):
        loop = asyncio.get_running_loop()
        started = loop.time()
        body = await _status(api_app)
        assert body["worker"] == {"reachable": False, "key_set": False, "replay": False}
        assert loop.time() - started < 4.5

    _with_stack(tmp_path, monkeypatch, app, scenario)


@needs_mongo
def test_runner_heartbeat_fresh_stale_and_missing(tmp_path, monkeypatch):
    async def scenario(app):
        from app.documents import RunnerHeartbeat, utcnow
        from app.jobs.runner import beat_runner

        assert (await _status(app))["runner"] == {"running": False, "last_seen": None}  # no runner ever ran

        await beat_runner()
        await beat_runner()  # one document, updated in place
        assert await RunnerHeartbeat.find_all().count() == 1
        fresh = (await _status(app))["runner"]
        assert fresh["running"] is True and fresh["last_seen"]

        # POLL 1.5 s: 3 polls + 5 s = 9.5 s. A beat 60 s old means the runner stopped.
        await RunnerHeartbeat.get_motor_collection().update_one({"key": "runner"}, {"$set": {"at": utcnow() - timedelta(seconds=60)}})
        stale = (await _status(app))["runner"]
        assert stale["running"] is False and stale["last_seen"]
        just_inside = utcnow() - timedelta(seconds=8)
        await RunnerHeartbeat.get_motor_collection().update_one({"key": "runner"}, {"$set": {"at": just_inside}})
        assert (await _status(app))["runner"]["running"] is True

    _with_stack(tmp_path, monkeypatch, _worker(True), scenario, JOB_POLL_SECONDS="1.5")


@needs_mongo
def test_models_limits_and_plan_review_default_equal_the_settings(tmp_path, monkeypatch):
    async def scenario(app):
        from app.settings import get_settings

        s = get_settings()
        body = await _status(app)
        assert body["models"] == [
            {"step": "understanding", "model": s.understanding_model, "thinking": s.understanding_thinking},
            {"step": "plan", "model": s.plan_model, "thinking": s.plan_thinking},
            {"step": "pages", "model": s.page_model, "thinking": s.page_thinking},
        ]
        assert body["limits"] == {
            "max_pdf_size_mb": s.max_pdf_size_mb, "max_pdf_pages": s.max_pdf_pages, "max_source_words": s.max_source_words,
            "page_attempts": s.page_attempts, "page_concurrency": s.page_concurrency,
        }
        assert body["limits"]["max_pdf_pages"] == 75 and body["limits"]["max_source_words"] == 17500
        assert body["plan_review_default"] is False
        assert list(body) == ["api", "version", "runner", "worker", "models", "limits", "plan_review_default"]

    _with_stack(tmp_path, monkeypatch, _worker(True), scenario)


@needs_mongo
def test_the_response_has_no_secret(tmp_path, monkeypatch):
    token = "tok-" + "x" * 40
    atlas = "mongodb+srv://owner:hunter2@cluster0.example.mongodb.net/prod"

    async def scenario(app):
        text = json.dumps(await _status(app))
        names = set(_names(json.loads(text)))
        suspicious = {n for n in names if SECRET_NAME.search(n) and n not in ALLOWED_NAMES}
        assert not suspicious, f"secret-looking field names in /status: {sorted(suspicious)}"
        # No secret VALUE either: not the service token, not the database URL, not what the worker's body held.
        for value in (token, "hunter2", "mongodb", "sk-live-SECRET", "MINIMAX"):
            assert value not in text
        assert "127.0.0.1" not in text  # no URL at all
        key_set = json.loads(text)["worker"]["key_set"]
        assert key_set is True and isinstance(key_set, bool)

    # The fake worker's /readyz body even carries a key. /status must not pass it on.
    _with_stack(
        tmp_path, monkeypatch, _worker(True, {"api_key": "sk-live-SECRET", "minimax_api_key": "sk-live-SECRET"}), scenario,
        AGENT_WORKER_TOKEN=token, MONGODB_URL=atlas.replace("mongodb+srv://owner:hunter2@cluster0.example.mongodb.net/prod", journey.MONGO_URL),
    )
