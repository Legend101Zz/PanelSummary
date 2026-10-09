"""Provider refusals stop the job (D11), offline, no MiniMax spend.

A FAKE agent worker over real HTTP answers PROVIDER_LIMIT / PROVIDER_UNAVAILABLE like the real worker
does after the provider refuses (the 2026-10-09 incident: HTTP 429 rate_limit_error "Token Plan usage
limit reached", 32 of 50 pages burnt as NO_SUBMISSION). Fails if:
- the job keeps dispatching work after the breaker trips (worker calls are counted);
- an accepted page is lost, or a page never tried is marked failed (it must stay pending);
- the page that met the limit is counted as a model failure or loses its receipt;
- the edition does not say, in plain words, that the provider refused;
- resume repeats accepted work or cannot finish the pending pages.

Needs a MongoDB at $TEST_MONGODB_URL (default mongodb://127.0.0.1:27018); throwaway database.
"""

from __future__ import annotations

import asyncio
import copy
import uuid

import httpx
import pytest
from fastapi import Request

from test_generate_journey import MONGO_URL, TOKEN, FakeWorker, _free_port, _make_pdf, _mongo_up, _serve

pytestmark = pytest.mark.skipif(not _mongo_up(), reason="no MongoDB for the provider-stop test")

LIMIT_TEXT = "Token Plan usage limit reached: Upgrade your Token Plan or purchase Credits for more usage. (2056)"


def _refusal(code: str, run_id: str, trace: dict | None = None) -> dict:
    messages = {
        "PROVIDER_LIMIT": ("rate_limit_error", 429, LIMIT_TEXT),
        "PROVIDER_UNAVAILABLE": ("overloaded_error", 529, "Overloaded"),
        "PROVIDER_AUTH": ("authentication_error", 401, "invalid api key"),
    }
    kind, status, text = messages[code]
    trace = dict(trace or {}) | {"stop_reason": "provider_error", "provider_error": {"code": code, "type": kind, "http_status": status, "message": text}, "tokens": {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0}, "cost_usd": 0.0, "submits": 0}
    return {
        "run_id": run_id,
        "state": "FAILED",
        "error": {"code": code, "message": f"{kind}: {text}", "provider_type": kind, "provider_message": text, "http_status": status},
        "trace": trace,
    }


class RefusingWorker(FakeWorker):
    """FakeWorker with five pages in the plan and scripted provider refusals."""

    def __init__(self):
        super().__init__(fail_pages=set())
        self.refuse: dict[str, tuple[str, set[int] | None]] = {}  # goal -> (code, pages or None for any call)
        self.refuse_once: set[tuple[str, int | None]] = set()

    async def runs(self, request: Request):
        body = await request.json()
        goal = body["goal_type"]
        page = body["input"].get("page_number")
        rule = self.refuse.get(goal)
        if rule and (rule[1] is None or page in rule[1]):
            self.calls.append({k: body.get(k) for k in ("goal_type", "run_id", "model", "thinking", "vision")} | {"page": page})
            return _refusal(rule[0], body["run_id"], {"provider": "minimax", "model": body["model"], "thinking": body["thinking"]})
        if (goal, page) in self.refuse_once:
            self.refuse_once.discard((goal, page))
            self.calls.append({k: body.get(k) for k in ("goal_type", "run_id", "model", "thinking", "vision")} | {"page": page})
            return _refusal("PROVIDER_UNAVAILABLE", body["run_id"], {"provider": "minimax", "model": body["model"], "thinking": body["thinking"]})

        # Rebuild the request so the parent can see it (the body was consumed above).
        class Replay:
            headers = request.headers

            async def json(self_inner):
                return body

        result = await super().runs(Replay())  # type: ignore[arg-type]
        if goal == "ADAPTATION_PLAN":
            pages = result["result"]["plan"]["pages"]
            five = []
            for i in range(5):
                base = copy.deepcopy(pages[i % len(pages)])
                base["page_number"] = i + 1
                base["beat"] = f"beat {i + 1}"
                five.append(base)
            result["result"]["plan"]["pages"] = five
            result["result"]["page_budget"] = {"min": 1, "max": 9, "target": 5}
        return result


async def _scenario(tmp_path, monkeypatch, worker: RefusingWorker, body, *, concurrency: int = 1):
    port = _free_port()
    server = _serve(worker.app, port)
    db_name = f"ps_stop_{uuid.uuid4().hex[:8]}"
    monkeypatch.setenv("MONGODB_URL", MONGO_URL)
    monkeypatch.setenv("DB_NAME", db_name)
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path / "storage"))
    monkeypatch.setenv("AGENT_WORKER_URL", f"http://127.0.0.1:{port}")
    monkeypatch.setenv("AGENT_WORKER_TOKEN", TOKEN)
    monkeypatch.setenv("PAGE_CONCURRENCY", str(concurrency))

    from app import db as db_module
    from app.settings import get_settings

    get_settings.cache_clear()
    db_module._client = None
    try:
        from app.db import init_db
        from app.jobs.runner import claim_job, execute
        from app.main import app

        client_db = await init_db()
        try:
            pdf = tmp_path / "book.pdf"
            _make_pdf(pdf)
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://api") as api:
                up = (await api.post("/upload", files={"file": ("book.pdf", pdf.read_bytes(), "application/pdf")})).json()
                book_id = up["book"]["id"]
                await execute(await claim_job())  # parse
                edition_id = (await api.post(f"/books/{book_id}/editions")).json()["edition"]["id"]

                async def run_next_job():
                    job = await claim_job()
                    assert job is not None and job.kind == "generate"
                    await execute(job)
                    return job

                async def edition():
                    return (await api.get(f"/editions/{edition_id}")).json()

                async def resume():
                    await api.post(f"/editions/{edition_id}/resume")

                await body(api, edition_id, run_next_job, edition, resume)
        finally:
            await client_db.drop_database(db_name)
    finally:
        server.should_exit = True
        get_settings.cache_clear()
        db_module._client = None


def _page_calls(worker: RefusingWorker) -> list[int]:
    return [c["page"] for c in worker.calls if c["goal_type"] == "MANGA_PAGE"]


def test_a_plan_limit_on_page_3_stops_the_job_and_resume_finishes(tmp_path, monkeypatch):
    worker = RefusingWorker()
    worker.refuse["MANGA_PAGE"] = ("PROVIDER_LIMIT", {3, 4, 5})

    async def body(api, edition_id, run_next_job, edition, resume):
        from app.documents import EditionPage, GenerationJob

        job = await run_next_job()
        e = await edition()
        # Visible, honest status and reason.
        assert e["status"] == "failed"
        assert e["error"].startswith("MiniMax refused the request:")
        assert "Token Plan usage limit reached" in e["error"]
        assert "Nothing more was sent. Resume when the limit resets" in e["error"]
        assert e["provider_stop"]["code"] == "PROVIDER_LIMIT" and e["provider_stop"]["type"] == "rate_limit_error"
        assert e["provider_stop"]["page"] == 3 and e["provider_stop"]["http_status"] == 429
        # Accepted pages stay accepted; pages never tried stay pending, none is failed.
        assert [p["status"] for p in e["pages"]] == ["accepted", "accepted", "pending", "pending", "pending"]
        assert e["pages_accepted"] == 2 and e["pages_failed"] == 0
        # The breaker: the worker saw pages 1, 2 and the refused page 3, nothing after.
        assert _page_calls(worker) == [1, 2, 3]
        # The refused page is not a model failure: its attempt is given back, its receipt is kept (D12).
        page3 = await EditionPage.find_one(EditionPage.edition_id == edition_id, EditionPage.page_number == 3)
        assert page3.status == "pending" and page3.attempts == 0 and page3.error is None
        assert len(page3.receipts) == 1 and page3.receipts[0]["error"]["code"] == "PROVIDER_LIMIT"
        assert page3.receipts[0]["stop_reason"] == "provider_error" and page3.receipts[0]["provider_error"]["type"] == "rate_limit_error"
        receipts = (await api.get(f"/editions/{edition_id}/receipts")).json()
        assert len(receipts["calls"]) == e["totals"]["calls"] == 5  # understanding, plan, pages 1-3
        assert e["totals"]["failed_calls"] == 1
        stored_job = await GenerationJob.get(job.id)
        assert stored_job.status == "failed" and "Token Plan usage limit reached" in stored_job.error

        # Resume: only the pending pages are drawn; accepted pages and artifacts are reused.
        worker.refuse.clear()
        before = len(worker.calls)
        await resume()
        resumed = await edition()
        assert resumed["status"] == "queued" and resumed["error"] is None and resumed["provider_stop"] is None
        await run_next_job()
        assert [(c["goal_type"], c["page"]) for c in worker.calls[before:]] == [("MANGA_PAGE", 3), ("MANGA_PAGE", 4), ("MANGA_PAGE", 5)]
        final = await edition()
        assert final["status"] == "complete" and final["pages_accepted"] == 5 and final["pages_failed"] == 0
        # The retried page 3 used a new run id (no duplicate id in the receipts).
        page3 = await EditionPage.find_one(EditionPage.edition_id == edition_id, EditionPage.page_number == 3)
        ids = [r["run_id"] for r in page3.receipts]
        assert len(ids) == len(set(ids)) == 2 and ids[1].endswith("-page3-a1-r1")

    asyncio.run(_scenario(tmp_path, monkeypatch, worker, body))


def test_parallel_pages_stop_after_the_in_flight_calls(tmp_path, monkeypatch):
    worker = RefusingWorker()
    worker.refuse["MANGA_PAGE"] = ("PROVIDER_LIMIT", {1, 2, 3, 4, 5})

    async def body(api, edition_id, run_next_job, edition, resume):
        await run_next_job()
        e = await edition()
        assert e["status"] == "failed" and e["provider_stop"]["code"] == "PROVIDER_LIMIT"
        # Three pages were in flight when the first refusal came; the other two never started.
        assert sorted(_page_calls(worker)) == [1, 2, 3]
        assert [p["status"] for p in e["pages"]] == ["pending"] * 5
        assert e["pages_failed"] == 0 and e["pages_accepted"] == 0
        assert e["totals"]["calls"] == 5 and e["totals"]["failed_calls"] == 3

    asyncio.run(_scenario(tmp_path, monkeypatch, worker, body, concurrency=3))


def test_a_limit_in_the_understanding_stops_at_once_without_a_second_attempt(tmp_path, monkeypatch):
    worker = RefusingWorker()
    worker.refuse["BOOK_UNDERSTANDING"] = ("PROVIDER_LIMIT", None)

    async def body(api, edition_id, run_next_job, edition, resume):
        await run_next_job()
        e = await edition()
        assert e["status"] == "failed" and e["error"].startswith("MiniMax refused the request:")
        assert e["provider_stop"]["stage"] == "understanding"
        assert [c["goal_type"] for c in worker.calls] == ["BOOK_UNDERSTANDING"]  # one call, no second attempt
        assert e["totals"]["calls"] == 1 and e["totals"]["failed_calls"] == 1
        receipts = (await api.get(f"/editions/{edition_id}/receipts")).json()
        assert receipts["calls"][0]["error"]["code"] == "PROVIDER_LIMIT"
        # Resume once the limit is gone.
        worker.refuse.clear()
        await resume()
        await run_next_job()
        final = await edition()
        assert final["status"] == "complete" and final["pages_accepted"] == 5
        ids = [c["run_id"] for c in worker.calls if c["goal_type"] == "BOOK_UNDERSTANDING"]
        assert len(ids) == len(set(ids)) == 2

    asyncio.run(_scenario(tmp_path, monkeypatch, worker, body))


def test_a_limit_in_the_plan_stops_at_once(tmp_path, monkeypatch):
    worker = RefusingWorker()
    worker.refuse["ADAPTATION_PLAN"] = ("PROVIDER_LIMIT", None)

    async def body(api, edition_id, run_next_job, edition, resume):
        await run_next_job()
        e = await edition()
        assert e["status"] == "failed" and e["provider_stop"]["stage"] == "plan"
        assert [c["goal_type"] for c in worker.calls] == ["BOOK_UNDERSTANDING", "ADAPTATION_PLAN"]
        worker.refuse.clear()
        before = len(worker.calls)
        await resume()
        await run_next_job()
        # The accepted understanding is reused: only the plan and the pages are called.
        assert "BOOK_UNDERSTANDING" not in [c["goal_type"] for c in worker.calls[before:]]
        assert (await edition())["status"] == "complete"

    asyncio.run(_scenario(tmp_path, monkeypatch, worker, body))


def test_a_bad_key_stops_at_once(tmp_path, monkeypatch):
    worker = RefusingWorker()
    worker.refuse["MANGA_PAGE"] = ("PROVIDER_AUTH", None)

    async def body(api, edition_id, run_next_job, edition, resume):
        await run_next_job()
        e = await edition()
        assert e["status"] == "failed" and e["provider_stop"]["code"] == "PROVIDER_AUTH"
        assert e["error"].startswith("MiniMax did not accept the key or the plan:")
        assert _page_calls(worker) == [1]
        assert [p["status"] for p in e["pages"]] == ["pending"] * 5

    asyncio.run(_scenario(tmp_path, monkeypatch, worker, body))


def test_an_unavailable_provider_stops_only_after_the_normal_attempts(tmp_path, monkeypatch):
    worker = RefusingWorker()
    worker.refuse["MANGA_PAGE"] = ("PROVIDER_UNAVAILABLE", {2})

    async def body(api, edition_id, run_next_job, edition, resume):
        from app.documents import EditionPage

        await run_next_job()
        e = await edition()
        assert e["status"] == "failed" and e["provider_stop"]["code"] == "PROVIDER_UNAVAILABLE"
        assert e["error"].startswith("MiniMax was not available:")
        assert _page_calls(worker) == [1, 2, 2]  # the page got its two attempts, then the job stopped
        assert [p["status"] for p in e["pages"]] == ["accepted", "pending", "pending", "pending", "pending"]
        page2 = await EditionPage.find_one(EditionPage.edition_id == edition_id, EditionPage.page_number == 2)
        assert page2.attempts == 1 and len(page2.receipts) == 2

    asyncio.run(_scenario(tmp_path, monkeypatch, worker, body))


def test_one_unavailable_answer_that_recovers_does_not_stop_the_job(tmp_path, monkeypatch):
    worker = RefusingWorker()
    worker.refuse_once.add(("MANGA_PAGE", 2))

    async def body(api, edition_id, run_next_job, edition, resume):
        await run_next_job()
        e = await edition()
        assert e["status"] == "complete" and e["provider_stop"] is None
        assert _page_calls(worker) == [1, 2, 2, 3, 4, 5]

    asyncio.run(_scenario(tmp_path, monkeypatch, worker, body))


def test_the_shelf_view_says_the_provider_refused(tmp_path, monkeypatch):
    worker = RefusingWorker()
    worker.refuse["MANGA_PAGE"] = ("PROVIDER_LIMIT", {3, 4, 5})

    async def body(api, edition_id, run_next_job, edition, resume):
        await run_next_job()
        shelf = (await api.get("/books")).json()
        latest = shelf[0]["latest_edition"]
        # The cover band can say why the drawing stopped; only the code is sent, not the provider text.
        assert latest["status"] == "failed" and latest["provider_stop"] == {"code": "PROVIDER_LIMIT"}
        await resume()
        worker.refuse.clear()
        await run_next_job()
        assert (await api.get("/books")).json()[0]["latest_edition"]["provider_stop"] is None

    asyncio.run(_scenario(tmp_path, monkeypatch, worker, body))
