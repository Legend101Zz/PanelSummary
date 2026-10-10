"""The edition API returns the stage timings the job runner stores (F2). No model is called."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import Request

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


# --- page_1_at and active_seconds (v0.2, G-T1 and G-T3) ---


@needs_mongo
def test_page_1_at_is_stamped_when_page_1_is_accepted_not_the_first_page(tmp_path, monkeypatch):
    import test_generate_journey as journey

    class SlowPageOne(journey.FakeWorker):
        async def runs(self, request: Request):
            body = await request.json()
            if body["goal_type"] == "MANGA_PAGE" and body["input"]["page_number"] == 1:
                await asyncio.sleep(0.6)  # pages 2 and 3 are accepted first
            return await super().runs(request)

    worker = SlowPageOne(fail_pages=set())
    port = journey._free_port()
    server = journey._serve(worker.app, port)
    db_name = f"ps_page1_{uuid.uuid4().hex[:8]}"
    _env(monkeypatch, tmp_path, db_name, worker_port=port, PAGE_CONCURRENCY="3")

    async def scenario():
        from bson import ObjectId

        from app.db import init_db
        from app.documents import Edition
        from app.jobs.runner import claim_job, execute
        from app.main import app

        client_db = await init_db()
        try:
            pdf = tmp_path / "book.pdf"
            journey._make_three_chapter_pdf(pdf)
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://api") as api:
                await api.post("/upload", files={"file": ("book.pdf", pdf.read_bytes(), "application/pdf")})
                await execute(await claim_job())
                book_id = (await api.get("/books")).json()[0]["id"]
                eid = (await api.post(f"/books/{book_id}/editions")).json()["edition"]["id"]
                await execute(await claim_job())
                timings = (await api.get(f"/editions/{eid}")).json()["timings"]
                first, page_1 = (datetime.fromisoformat(timings[k]) for k in ("first_page_at", "page_1_at"))
                assert first < page_1  # page 1 was not the first page accepted
                assert (page_1 - first).total_seconds() >= 0.3
                # A redraw of page 1 keeps the first value.
                await api.post(f"/editions/{eid}/pages/1/redraw")
                await execute(await claim_job())
                raw = await Edition.get_motor_collection().find_one({"_id": ObjectId(eid)})
                assert raw["timings"]["page_1_at"].replace(tzinfo=timezone.utc) == page_1.astimezone(timezone.utc)
        finally:
            await client_db.drop_database(db_name)

    from app import db as db_module
    from app.settings import get_settings

    try:
        asyncio.run(scenario())
    finally:
        server.should_exit = True
        get_settings.cache_clear()
        db_module._client = None


@needs_mongo
def test_active_seconds_adds_job_run_times_and_skips_the_pause_between_them(tmp_path, monkeypatch):
    import test_generate_journey as journey

    async def scenario(api, worker, book):
        from app.documents import Edition
        from app.jobs.runner import claim_job, execute

        from app.documents import utcnow

        bid = book["id"]
        worker.fail_pages.add(2)
        eid = (await api.post(f"/books/{bid}/editions", json={"section_ids": ["s1", "s2"]})).json()["edition"]["id"]
        assert (await api.get(f"/editions/{eid}")).json()["active_seconds"] is None  # nothing ran yet
        job = await claim_job()
        job.started_at = utcnow() - timedelta(seconds=100)  # this run took 100 s
        await execute(job)
        first = (await api.get(f"/editions/{eid}")).json()
        assert first["status"] == "completed_with_failures"
        assert 100 <= first["active_seconds"] < 110

        # The edition waits for an hour, then the owner resumes it. The hour is not counted.
        worker.fail_pages.clear()
        await Edition.get_motor_collection().update_one(
            {"_id": __import__("bson").ObjectId(eid)}, {"$set": {"finished_at": utcnow() - timedelta(hours=1)}}
        )
        await api.post(f"/editions/{eid}/resume")
        job = await claim_job()
        job.started_at = utcnow() - timedelta(seconds=50)
        await execute(job)
        done = (await api.get(f"/editions/{eid}")).json()
        assert done["status"] == "complete"
        assert 150 <= done["active_seconds"] < 165
        # A parse job adds nothing to any edition.
        assert (await Edition.find_all().count()) == 1

    journey._run(tmp_path, monkeypatch, scenario)
