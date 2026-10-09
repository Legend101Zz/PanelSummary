"""Per-goal model policy (D13, 2026-10-09): defaults, env overrides, recorded policy, retry levels.

No MongoDB and no model call is needed except for the one test marked needs_mongo.
"""

from __future__ import annotations

import asyncio
import os
import socket
import uuid
from contextlib import closing

import pytest

from app.settings import ALLOWED_MODELS, Settings

FLASH = "MiniMax-M3.1-Flash-Preview"
MONGO_URL = os.environ.get("TEST_MONGODB_URL", "mongodb://127.0.0.1:27018")


def _mongo_up() -> bool:
    host, port = MONGO_URL.split("//", 1)[1].split("/")[0].split(":")
    with closing(socket.socket()) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, int(port))) == 0


def test_defaults_are_the_measured_policy():
    s = Settings(_env_file=None)
    assert (s.understanding_model, s.understanding_thinking, s.understanding_retry_thinking) == ("MiniMax-M3", "low", "low")
    assert (s.plan_model, s.plan_thinking, s.plan_retry_thinking) == (FLASH, "off", "medium")
    assert (s.page_model, s.page_thinking, s.page_retry_thinking) == (FLASH, "off", "medium")
    assert s.page_vision is True


def test_policy_fields_record_every_goal():
    fields = Settings(_env_file=None).policy_fields()
    for goal in ("understanding", "plan", "page"):
        for suffix in ("model", "thinking", "retry_thinking"):
            assert fields[f"{goal}_{suffix}"], f"{goal}_{suffix} is not recorded"
    assert fields["retry_thinking"] == fields["page_retry_thinking"]  # legacy mirror


def test_env_overrides_every_goal(monkeypatch):
    monkeypatch.setenv("UNDERSTANDING_MODEL", FLASH)
    monkeypatch.setenv("UNDERSTANDING_RETRY_THINKING", "medium")
    monkeypatch.setenv("PLAN_MODEL", "MiniMax-M3")
    monkeypatch.setenv("PLAN_RETRY_THINKING", "low")
    monkeypatch.setenv("PAGE_MODEL", "MiniMax-M3")
    monkeypatch.setenv("PAGE_RETRY_THINKING", "off")
    s = Settings(_env_file=None)
    assert (s.understanding_model, s.understanding_retry_thinking) == (FLASH, "medium")
    assert (s.plan_model, s.plan_retry_thinking) == ("MiniMax-M3", "low")
    assert (s.page_model, s.page_retry_thinking) == ("MiniMax-M3", "off")


def test_old_retry_thinking_is_a_fallback_for_plan_and_pages_only(monkeypatch):
    monkeypatch.setenv("RETRY_THINKING", "high")
    s = Settings(_env_file=None)
    assert s.plan_retry_thinking == "high" and s.page_retry_thinking == "high"
    assert s.understanding_retry_thinking == "low"  # the understanding retry has its own setting
    monkeypatch.setenv("PAGE_RETRY_THINKING", "off")  # a per-goal variable wins over the old one
    s = Settings(_env_file=None)
    assert s.page_retry_thinking == "off" and s.plan_retry_thinking == "high"


def test_unknown_model_is_refused(monkeypatch):
    monkeypatch.setenv("PAGE_MODEL", "gpt-4o")
    with pytest.raises(ValueError):
        Settings(_env_file=None)
    assert FLASH in ALLOWED_MODELS and "MiniMax-M3" in ALLOWED_MODELS


@pytest.mark.skipif(not _mongo_up(), reason="no MongoDB")
def test_record_policy_fills_old_editions_and_keeps_recorded_values(tmp_path, monkeypatch):
    db_name = f"ps_policy_{uuid.uuid4().hex[:8]}"
    monkeypatch.setenv("MONGODB_URL", MONGO_URL)
    monkeypatch.setenv("DB_NAME", db_name)
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path / "storage"))
    from app import db as db_module
    from app.settings import get_settings

    get_settings.cache_clear()
    db_module._client = None

    async def scenario():
        from app.db import init_db
        from app.documents import Edition
        from app.jobs.generate import _record_policy

        client_db = await init_db()
        try:
            settings = get_settings()
            # An edition made before the per-goal settings: all M3 and one retry level.
            old = Edition(book_id="b", policy={
                "understanding_model": "MiniMax-M3", "understanding_thinking": "low", "plan_model": "MiniMax-M3",
                "plan_thinking": "off", "page_model": "MiniMax-M3", "page_thinking": "off", "retry_thinking": "low",
            })
            await old.insert()
            policy = await _record_policy(old, settings)
            assert policy["page_model"] == "MiniMax-M3" and policy["plan_model"] == "MiniMax-M3"  # recorded values stay
            assert policy["page_retry_thinking"] == "low" and policy["plan_retry_thinking"] == "low"
            assert policy["understanding_retry_thinking"] == "low"
            stored = (await Edition.get(old.id)).policy
            assert stored["page_retry_thinking"] == "low"

            # A new edition (current settings) records the per-goal values and keeps them.
            new = Edition(book_id="b", policy={"page_model": FLASH, "retry_thinking": None})
            await new.insert()
            policy = await _record_policy(new, settings)
            assert policy["page_model"] == FLASH and policy["plan_model"] == FLASH and policy["understanding_model"] == "MiniMax-M3"
            assert policy["page_retry_thinking"] == "medium" and policy["retry_thinking"] == "medium"
        finally:
            await client_db.drop_database(db_name)

    try:
        asyncio.run(scenario())
    finally:
        get_settings.cache_clear()
        db_module._client = None
