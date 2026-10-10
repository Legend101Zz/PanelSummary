"""Latency guards for the Generate job (offline; the fake worker stands in for MiniMax).

- Pages are dispatched in reading order: with N slots, the first N calls are pages 1..N,
  and no later page starts before an earlier one has started.
- The edition stores when Generate started, when drawing started and when the first page
  became readable (``timings``); a resume keeps the first values.
No test calls a model.
"""

from __future__ import annotations

import asyncio
import uuid

import fitz
import httpx
import pytest

import test_generate_journey as journey

pytestmark = journey.pytestmark


def _make_pdf(path, chapters: int) -> None:
    doc = fitz.open()
    for i in range(chapters):
        page = doc.new_page()
        page.insert_text((72, 90), f"Chapter {i + 1}", fontsize=22)
        page.insert_textbox(fitz.Rect(72, 120, 520, 780), f"The swallow flew over town number {i + 1}. " * 60, fontsize=10)
    doc.save(path)


@pytest.mark.parametrize("slots", [1, 3])
def test_pages_start_in_reading_order_and_timings_are_stored(tmp_path, monkeypatch, slots):
    worker = journey.FakeWorker(fail_pages={4})
    port = journey._free_port()
    server = journey._serve(worker.app, port)
    db_name = f"ps_latency_{uuid.uuid4().hex[:8]}"
    monkeypatch.setenv("MONGODB_URL", journey.MONGO_URL)
    monkeypatch.setenv("DB_NAME", db_name)
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path / "storage"))
    monkeypatch.setenv("AGENT_WORKER_URL", f"http://127.0.0.1:{port}")
    monkeypatch.setenv("AGENT_WORKER_TOKEN", journey.TOKEN)
    monkeypatch.setenv("PAGE_CONCURRENCY", str(slots))

    from app import db as db_module
    from app.settings import get_settings

    get_settings.cache_clear()
    db_module._client = None

    async def scenario():
        from app.db import init_db
        from app.documents import Edition
        from app.jobs.runner import claim_job, execute
        from app.main import app

        client_db = await init_db()
        try:
            pdf = tmp_path / "book.pdf"
            _make_pdf(pdf, 6)
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://api") as api:
                up = (await api.post("/upload", files={"file": ("book.pdf", pdf.read_bytes(), "application/pdf")})).json()
                book_id = up["book"]["id"]
                await execute(await claim_job())
                assert (await api.get(f"/books/{book_id}")).json()["status"] == "parsed"
                edition_id = (await api.post(f"/books/{book_id}/editions")).json()["edition"]["id"]
                await execute(await claim_job())

                first_attempts = [c["page"] for c in worker.calls if c["goal_type"] == "MANGA_PAGE" and c["run_id"].endswith("-a1")]
                assert sorted(first_attempts) == [1, 2, 3, 4, 5, 6]
                if slots == 1:
                    assert first_attempts == [1, 2, 3, 4, 5, 6]
                else:
                    assert set(first_attempts[:slots]) == set(range(1, slots + 1))
                    # a later page never starts before an earlier page's slot was taken
                    assert min(first_attempts[slots:]) > slots

                raw = await Edition.get_motor_collection().find_one({"_id": __import__("bson").ObjectId(edition_id)})
                t = raw["timings"]
                assert set(t) == {"generate_started_at", "drawing_started_at", "first_page_at", "page_1_at"}
                assert t["generate_started_at"] <= t["drawing_started_at"] <= t["first_page_at"] <= raw["finished_at"]
                # The timings are extra fields; the edition document still loads and saves with them.
                edition = await Edition.get(edition_id)
                assert edition.status == "completed_with_failures"

                # A resume keeps the first values.
                worker.fail_pages.clear()
                await api.post(f"/editions/{edition_id}/resume")
                await execute(await claim_job())
                after = await Edition.get_motor_collection().find_one({"_id": raw["_id"]})
                assert after["timings"] == t
                assert after["status"] == "complete"
        finally:
            await client_db.drop_database(db_name)

    try:
        asyncio.run(scenario())
    finally:
        server.should_exit = True
        get_settings.cache_clear()
        db_module._client = None
