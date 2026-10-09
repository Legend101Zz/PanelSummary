"""The edition API returns the stage timings the job runner stores (F2). No model is called."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import httpx

from test_preflight import _env, needs_mongo


@needs_mongo
def test_edition_view_returns_timings(tmp_path, monkeypatch):
    db_name = f"ps_timings_{uuid.uuid4().hex[:8]}"
    _env(monkeypatch, tmp_path, db_name)

    async def scenario():
        from app.db import init_db
        from app.documents import Edition
        from app.main import app

        client_db = await init_db()
        try:
            t0 = datetime(2026, 10, 9, 10, 0, 0, tzinfo=timezone.utc)
            full = Edition(book_id="b1", created_at=t0, finished_at=t0 + timedelta(seconds=900))
            await full.insert()
            # What the job runner writes: raw $set of timings.<key> on the document.
            stamps = {
                "generate_started_at": t0 + timedelta(seconds=2),
                "drawing_started_at": t0 + timedelta(seconds=600),
                "first_page_at": t0 + timedelta(seconds=768),
            }
            await Edition.get_motor_collection().update_one({"_id": full.id}, {"$set": {f"timings.{k}": v for k, v in stamps.items()}})
            fresh = Edition(book_id="b2")  # no milestone yet
            await fresh.insert()
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://api") as api:
                body = (await api.get(f"/editions/{full.id}")).json()
                assert set(body["timings"]) == set(stamps)
                for key, value in stamps.items():
                    assert datetime.fromisoformat(body["timings"][key]).replace(tzinfo=timezone.utc) == value
                empty = (await api.get(f"/editions/{fresh.id}")).json()
                assert empty["timings"] == {}
        finally:
            await client_db.drop_database(db_name)

    from app import db as db_module
    from app.settings import get_settings

    try:
        asyncio.run(scenario())
    finally:
        get_settings.cache_clear()
        db_module._client = None
