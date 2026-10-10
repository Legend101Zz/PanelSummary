"""Journey guard for the production path (offline, no MiniMax spend).

Upload → parse job → Generate → generate job → page API, with a FAKE agent
worker over real HTTP. Fails if:
- Generate does not go through the agent worker for understanding, plan and
  every page (or uses another model/thinking policy than the edition records);
- the page API serves anything other than the exact SVG and panel geometry the
  worker returned;
- a claim planned on a failed page silently disappears from the coverage report,
  or the edition claims "complete" with a failed page;
- resume repeats already-accepted work (repeated provider charges);
- the backend contacts any host other than the worker.

Needs a MongoDB at $TEST_MONGODB_URL (default mongodb://127.0.0.1:27018); the
test uses a throwaway database and drops it afterwards. Skipped if unreachable.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import socket
import threading
import time
import uuid
from contextlib import closing
from pathlib import Path

import fitz
import httpx
import pytest
import uvicorn
from fastapi import FastAPI, Request

MONGO_URL = os.environ.get("TEST_MONGODB_URL", "mongodb://127.0.0.1:27018")
TOKEN = "t" * 40


def _mongo_up() -> bool:
    host, port = MONGO_URL.split("//", 1)[1].split("/")[0].split(":")
    with closing(socket.socket()) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, int(port))) == 0


pytestmark = pytest.mark.skipif(not _mongo_up(), reason="no MongoDB for the journey test")


def _free_port() -> int:
    with closing(socket.socket()) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _svg(page: int) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1500" width="1000" height="1500">'
        f'<g role="group" aria-label="Panel 1 of 1"><text x="10" y="40">page {page}</text></g></svg>'
    )


class FakeWorker:
    """Stands in for apps/agent-worker. Records every call it receives."""

    def __init__(self, fail_pages: set[int], fail_understanding_once: bool = False):
        self.calls: list[dict] = []
        # What the worker received for the book understanding: section ids and unit ids (scope tests).
        self.understanding_inputs: list[dict] = []
        self.fail_pages = fail_pages
        self.fail_understanding_once = fail_understanding_once
        self.app = FastAPI()
        self.app.post("/internal/v2/runs")(self.runs)
        self.app.post("/internal/v2/runs/{run_id}/cancel")(self.cancel)

    async def cancel(self, run_id: str):
        return {"run_id": run_id, "state": "CANCELLED"}

    async def runs(self, request: Request):
        assert request.headers.get("authorization") == f"Bearer {TOKEN}"
        body = await request.json()
        self.calls.append({k: body.get(k) for k in ("goal_type", "run_id", "model", "thinking", "vision")} | {"page": body["input"].get("page_number")})
        trace = {"provider": "minimax", "model": body["model"], "thinking": body["thinking"], "thinking_sent": f"enabled:fake-{body['thinking']}", "cost_basis": "Pi catalog rates", "tokens": {"input": 10, "output": 5, "cache_read": 0, "cache_write": 0}, "cost_usd": 0.001, "latency_ms": 3, "turns": 1, "submits": 1, "tool_calls": [], "stop_reason": "accepted"}
        goal = body["goal_type"]
        data = body["input"]
        if goal == "BOOK_UNDERSTANDING" and self.fail_understanding_once:
            self.fail_understanding_once = False
            return {"run_id": body["run_id"], "state": "FAILED", "error": {"code": "TIMEOUT", "message": "timeout"}, "trace": trace}
        if goal == "BOOK_UNDERSTANDING":
            self.understanding_inputs.append(
                {"sections": [s["id"] for s in data["book"]["sections"]], "units": [u["id"] for u in data["book"]["units"]]}
            )
            sections = data["book"]["sections"]
            units = data["book"]["units"]
            claims = [
                {"id": f"k{i + 1}", "section_id": s["id"], "kind": "event", "importance": "core", "text": f"core event of {s['title']}", "source": [{"unit": s["unit_ids"][0], "page": s["page_start"]}]}
                for i, s in enumerate(sections)
            ]
            understanding = {
                "schema": "book-understanding.v1", "title": data["book"]["title"], "author": "", "kind": "fiction", "logline": "x",
                "sections": [{"id": s["id"], "title": s["title"], "summary": "s", "units": s["unit_ids"]} for s in sections],
                "cast": [{"id": "c_a", "name": "Ada", "role": "hero", "description": "d", "look": {"kind": "bird", "species": "swallow", "tone": "dark"}}],
                "locations": [{"id": "l_a", "name": "Sky", "environment": "sky", "features": [], "description": "d"}],
                "claims": claims, "themes": [],
            }
            assert len(units) >= 1
            return {"run_id": body["run_id"], "state": "SUCCEEDED", "result": {"understanding": understanding}, "trace": trace}
        if goal == "ADAPTATION_PLAN":
            u = data["understanding"]
            pages = [
                {"page_number": i + 1, "section_id": c["section_id"], "beat": f"beat {i + 1}", "claims": [c["id"]], "cast": ["c_a"], "locations": ["l_a"], "units": u["sections"][i]["units"], "page_turn_hook": False}
                for i, c in enumerate(u["claims"])
            ]
            return {"run_id": body["run_id"], "state": "SUCCEEDED", "result": {"plan": {"schema": "adaptation-plan.v1", "pages": pages, "omitted": []}, "page_budget": {"min": 1, "max": 9, "target": 2}}, "trace": trace}
        if goal == "MANGA_PAGE":
            n = data["page_number"]
            planned = next(p for p in data["plan"]["pages"] if p["page_number"] == n)
            if n in self.fail_pages:
                return {"run_id": body["run_id"], "state": "FAILED", "error": {"code": "NO_SUBMISSION", "message": "fake failure"}, "trace": trace}
            svg = _svg(n)
            render = {
                "svg": svg, "svg_hash": hashlib.sha256(svg.encode()).hexdigest(), "renderer_version": "fake/1",
                "panels": [{"id": "p1", "polygon": [{"x": 40, "y": 40}, {"x": 960, "y": 40}, {"x": 960, "y": 1460}, {"x": 40, "y": 1460}], "bbox": {"x": 40, "y": 40, "w": 920, "h": 1420}, "order": 0}],
                "texts": [], "issues": [],
            }
            spec = {"schema": "manga-page.v1", "page_number": n, "section_id": planned["section_id"], "purpose": "p", "layout": {"template": "splash_1"}, "panels": [{"id": "p1"}], "claims": planned["claims"], "page_turn_hook": False}
            return {"run_id": body["run_id"], "state": "SUCCEEDED", "result": {"spec": spec, "render": render}, "trace": trace}
        return {"run_id": body["run_id"], "state": "FAILED", "error": {"code": "UNKNOWN_GOAL", "message": goal}}


def _serve(app: FastAPI, port: int) -> uvicorn.Server:
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    return server


def _make_pdf(path: Path) -> None:
    doc = fitz.open()
    for title, body in [("Chapter One", "The swallow flew over the city. " * 60), ("Chapter Two", "The swallow came home to the prince. " * 60)]:
        page = doc.new_page()
        page.insert_text((72, 90), title, fontsize=22)
        page.insert_textbox(fitz.Rect(72, 120, 520, 780), body, fontsize=10)
    doc.save(path)


def test_generate_goes_through_the_harness_and_failures_stay_visible(tmp_path, monkeypatch):
    # The first understanding attempt times out: its tokens were spent and must stay counted.
    worker = FakeWorker(fail_pages={2}, fail_understanding_once=True)
    port = _free_port()
    server = _serve(worker.app, port)
    db_name = f"ps_journey_{uuid.uuid4().hex[:8]}"
    monkeypatch.setenv("MONGODB_URL", MONGO_URL)
    monkeypatch.setenv("DB_NAME", db_name)
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path / "storage"))
    monkeypatch.setenv("AGENT_WORKER_URL", f"http://127.0.0.1:{port}")
    monkeypatch.setenv("AGENT_WORKER_TOKEN", TOKEN)

    from app import db as db_module
    from app.settings import get_settings

    get_settings.cache_clear()
    db_module._client = None

    hosts: list[str] = []
    real_send = httpx.AsyncClient.send

    async def recording_send(self, request, *args, **kwargs):
        if request.url.host != "api":  # the test's own in-process API client
            hosts.append(request.url.host + ":" + str(request.url.port))
        return await real_send(self, request, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "send", recording_send)

    async def scenario():
        from app.db import init_db
        from app.documents import EditionPage, GenerationJob
        from app.jobs.runner import claim_job, execute
        from app.main import app

        client_db = await init_db()
        try:
            pdf = tmp_path / "book.pdf"
            _make_pdf(pdf)
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://api") as api:
                up = (await api.post("/upload", files={"file": ("book.pdf", pdf.read_bytes(), "application/pdf")})).json()
                book_id = up["book"]["id"]
                job = await claim_job()
                assert job is not None and job.kind == "parse"
                await execute(job)
                book = (await api.get(f"/books/{book_id}")).json()
                assert book["status"] == "parsed" and len(book["sections"]) == 2

                started = (await api.post(f"/books/{book_id}/editions")).json()
                edition_id = started["edition"]["id"]
                assert started["edition"]["policy"]["image_models"] == "none"
                # No body: the whole book, no plan review (the v0.1 behaviour).
                assert started["edition"]["scope"] is None and started["edition"]["policy"]["review_plan"] is False
                assert started["edition"]["draw_estimate_usd"] is None and started["job"]["cancel_requested"] is False
                job = await claim_job()
                assert job is not None and job.kind == "generate"
                await execute(job)

                edition = (await api.get(f"/editions/{edition_id}")).json()
                # Failure is visible, never "complete".
                assert edition["status"] == "completed_with_failures"
                assert edition["pages_accepted"] == 1 and edition["pages_failed"] == 1
                assert edition["coverage"]["lost_to_failed_pages"] == ["k2"]
                assert edition["coverage"]["core_not_conveyed"] == ["k2"]
                assert edition["coverage"]["sections_without_claims"] == []
                assert [p["status"] for p in edition["pages"]] == ["accepted", "failed"]
                assert edition["scope"] is None and edition["plan_omitted"] is None
                assert [c["id"] for c in edition["book"]["claims"]] == ["k1", "k2"]  # coverage is set
                assert set(edition["book"]["claims"][0]) == {"id", "text", "importance", "section_id"}
                assert edition["timings"]["page_1_at"] >= edition["timings"]["first_page_at"]
                assert edition["active_seconds"] is not None and edition["active_seconds"] >= 0
                shelf = (await api.get("/books")).json()
                assert shelf[0]["latest_edition"]["pages_failed"] == 1 and shelf[0]["latest_edition"]["pages_accepted"] == 1
                assert (await GenerationJob.get(job.id)).status == "completed_with_failures"

                # Every model call went through the worker, with the recorded policy.
                goals = [c["goal_type"] for c in worker.calls]
                assert goals.count("BOOK_UNDERSTANDING") == 2 and goals.count("ADAPTATION_PLAN") == 1
                page_calls = [c for c in worker.calls if c["goal_type"] == "MANGA_PAGE"]
                assert sorted(c["page"] for c in page_calls) == [1, 2, 2]
                policy = edition["policy"]
                for c in worker.calls:  # each goal uses its own recorded model (D13)
                    assert c["model"] == policy[{"BOOK_UNDERSTANDING": "understanding_model", "ADAPTATION_PLAN": "plan_model", "MANGA_PAGE": "page_model"}[c["goal_type"]]]
                assert policy["understanding_model"] == "MiniMax-M3.1-Flash-Preview"
                assert policy["plan_model"] == policy["page_model"] == "MiniMax-M3.1-Flash-Preview"
                first, retry = [c for c in page_calls if c["page"] == 2]
                assert first["thinking"] == policy["page_thinking"]
                assert retry["thinking"] == policy["page_retry_thinking"] == "medium"
                assert policy["retry_thinking"] == policy["page_retry_thinking"]
                u_first, u_retry = [c for c in worker.calls if c["goal_type"] == "BOOK_UNDERSTANDING"]
                assert u_first["thinking"] == policy["understanding_thinking"] == "low"
                assert u_retry["thinking"] == policy["understanding_retry_thinking"] == "medium"
                assert all(c["vision"] is True for c in page_calls)

                # The page API serves exactly the worker's artifact and geometry.
                page = (await api.get(f"/editions/{edition_id}/pages/1")).json()
                assert page["svg"] == _svg(1)
                assert page["svg_hash"] == hashlib.sha256(_svg(1).encode()).hexdigest()
                assert page["panels"][0]["bbox"] == {"x": 40, "y": 40, "w": 920, "h": 1420}
                failed = (await api.get(f"/editions/{edition_id}/pages/2")).json()
                assert failed["svg"] is None and failed["error"]["message"] == "fake failure"

                # Totals are exact sums of the receipts (6 calls x 10/5 tokens, $0.001 each),
                # including the understanding attempt that timed out.
                assert edition["totals"]["calls"] == 6 and edition["totals"]["failed_calls"] == 3
                assert edition["totals"]["input_tokens"] == 60 and edition["totals"]["output_tokens"] == 30
                receipts = (await api.get(f"/editions/{edition_id}/receipts")).json()
                assert all(call["provider"] == "minimax" for call in receipts["calls"])
                # Every receipt records the model, the requested thinking level and what was sent.
                assert all(call["model"] in ("MiniMax-M3", "MiniMax-M3.1-Flash-Preview") and call["cost_basis"] == "Pi catalog rates" for call in receipts["calls"])
                assert all(call["thinking_sent"] == f"enabled:fake-{call['thinking']}" for call in receipts["calls"])
                assert len(receipts["calls"]) == 6
                assert [c["artifact"] for c in receipts["calls"] if c.get("state") != "SUCCEEDED" and "artifact" in c] == ["understanding"]

                # Resume: only the failed page is redone; nothing accepted is paid for again.
                worker.fail_pages.clear()
                before = len(worker.calls)
                await api.post(f"/editions/{edition_id}/resume")
                job = await claim_job()
                await execute(job)
                new_calls = worker.calls[before:]
                assert [(c["goal_type"], c["page"]) for c in new_calls] == [("MANGA_PAGE", 2)]
                edition = (await api.get(f"/editions/{edition_id}")).json()
                assert edition["status"] == "complete"
                assert await EditionPage.find(EditionPage.edition_id == edition_id).count() == 2
        finally:
            await client_db.drop_database(db_name)

    try:
        asyncio.run(scenario())
    finally:
        server.should_exit = True
        get_settings.cache_clear()
        db_module._client = None
    assert set(hosts) == {f"127.0.0.1:{port}"}, f"backend contacted other hosts: {sorted(set(hosts))}"


def test_a_book_section_without_claims_is_never_complete(monkeypatch):
    """Acceptance run 6: the understanding had no claims for the last tale, so its pages
    were drawn with nothing to convey. Coverage must name the section and the edition
    must not be complete, even when every page was accepted."""
    db_name = f"ps_cov_{uuid.uuid4().hex[:8]}"
    monkeypatch.setenv("MONGODB_URL", MONGO_URL)
    monkeypatch.setenv("DB_NAME", db_name)

    from app import db as db_module
    from app.settings import get_settings

    get_settings.cache_clear()
    db_module._client = None

    async def scenario():
        from app.db import init_db
        from app.documents import Edition, EditionPage
        from app.jobs.generate import finalize

        client_db = await init_db()
        try:
            edition = Edition(book_id="b1", status="drawing")
            await edition.insert()
            await EditionPage(edition_id=str(edition.id), page_number=1, section_id="s1", claims=["k1"], status="accepted", spec={"claims": ["k1"]}).insert()
            await EditionPage(edition_id=str(edition.id), page_number=2, section_id="s2", claims=[], status="accepted", spec={"claims": []}).insert()
            understanding = {"claims": [{"id": "k1", "section_id": "s1", "importance": "core"}]}
            plan = {"pages": [], "omitted": []}
            status, _ = await finalize(edition, understanding, plan, ["s1", "s2"])
            saved = await Edition.get(edition.id)
            assert status == "completed_with_failures" and saved.status == "completed_with_failures"
            assert saved.coverage["sections_without_claims"] == ["s2"]
            # the same pages with claims for both sections are complete
            understanding["claims"].append({"id": "k2", "section_id": "s2", "importance": "detail"})
            status, _ = await finalize(edition, understanding, plan, ["s1", "s2"])
            assert status == "succeeded"
        finally:
            await client_db.drop_database(db_name)

    try:
        asyncio.run(scenario())
    finally:
        get_settings.cache_clear()
        db_module._client = None


def test_a_cancelled_call_keeps_its_receipt(monkeypatch):
    """Acceptance run 7 was cancelled during the understanding and recorded 0 calls and $0,
    although tokens were spent. A cancelled call must come back with its trace."""
    import threading

    app = FastAPI()
    # The fake worker runs in its own thread and loop: use thread-safe events.
    received = threading.Event()
    cancelled = threading.Event()

    @app.post("/internal/v2/runs")
    async def runs(request: Request):
        body = await request.json()
        received.set()
        await asyncio.to_thread(cancelled.wait, 30)
        trace = {"provider": "minimax", "model": body["model"], "tokens": {"input": 700, "output": 300, "cache_read": 0, "cache_write": 0}, "cost_usd": 0.02, "latency_ms": 50, "turns": 1, "tool_calls": [], "stop_reason": "aborted"}
        return {"run_id": body["run_id"], "state": "CANCELLED", "error": {"code": "CANCELLED", "message": "cancelled"}, "trace": trace}

    @app.post("/internal/v2/runs/{run_id}/cancel")
    async def cancel(run_id: str):
        cancelled.set()
        return {"run_id": run_id, "state": "CANCELLED"}

    port = _free_port()
    server = _serve(app, port)
    monkeypatch.setenv("AGENT_WORKER_URL", f"http://127.0.0.1:{port}")
    monkeypatch.setenv("AGENT_WORKER_TOKEN", TOKEN)
    from app.settings import get_settings

    get_settings.cache_clear()

    async def scenario():
        from app.documents import GenerationJob
        from app.jobs.generate import _call
        from app.jobs.runner import JobContext

        ctx = JobContext(GenerationJob(kind="generate", book_id="b1"))
        task = asyncio.create_task(_call(ctx, "BOOK_UNDERSTANDING", "e1-understanding-a1", {}, model="MiniMax-M3", thinking="low"))
        assert await asyncio.to_thread(received.wait, 10)
        ctx.cancelled.set()
        outcome = await asyncio.wait_for(task, 30)
        assert outcome.state == "CANCELLED"
        assert outcome.trace["tokens"]["output"] == 300

    try:
        asyncio.run(scenario())
    finally:
        server.should_exit = True
        get_settings.cache_clear()


# --- scope and plan review (v0.2, issues #40 and #49) ---


def _make_three_chapter_pdf(path: Path) -> None:
    doc = fitz.open()
    for i in range(3):
        page = doc.new_page()
        page.insert_text((72, 90), f"Chapter {i + 1}", fontsize=22)
        page.insert_textbox(fitz.Rect(72, 120, 520, 780), f"The swallow flew over town number {i + 1}. " * 60, fontsize=10)
    doc.save(path)


def _run(tmp_path, monkeypatch, scenario, *, fail_pages=frozenset(), **env):
    """Run ``scenario(api, worker, ids)`` against the real API app and a fake worker.

    ``ids`` has the parsed book id. The database is a throwaway one. Returns the fake worker.
    """
    worker = FakeWorker(fail_pages=set(fail_pages))
    port = _free_port()
    server = _serve(worker.app, port)
    db_name = f"ps_v02_{uuid.uuid4().hex[:8]}"
    monkeypatch.setenv("MONGODB_URL", MONGO_URL)
    monkeypatch.setenv("DB_NAME", db_name)
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path / "storage"))
    monkeypatch.setenv("AGENT_WORKER_URL", f"http://127.0.0.1:{port}")
    monkeypatch.setenv("AGENT_WORKER_TOKEN", TOKEN)
    for key, value in env.items():
        monkeypatch.setenv(key, value)

    from app import db as db_module
    from app.settings import get_settings

    get_settings.cache_clear()
    db_module._client = None

    async def main():
        from app.db import init_db
        from app.jobs.runner import claim_job, execute
        from app.main import app

        client_db = await init_db()
        try:
            pdf = tmp_path / "book.pdf"
            _make_three_chapter_pdf(pdf)
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://api") as api:
                up = (await api.post("/upload", files={"file": ("book.pdf", pdf.read_bytes(), "application/pdf")})).json()
                await execute(await claim_job())
                book = (await api.get(f"/books/{up['book']['id']}")).json()
                assert book["status"] == "parsed" and [s["id"] for s in book["sections"]] == ["s1", "s2", "s3"]
                await scenario(api, worker, book)
        finally:
            await client_db.drop_database(db_name)

    try:
        asyncio.run(main())
    finally:
        server.should_exit = True
        get_settings.cache_clear()
        db_module._client = None
    return worker


async def _drive(api, book_id, body=None):
    """Press Generate and run the job it queued. Returns the edition id."""
    from app.jobs.runner import claim_job, execute

    started = (await api.post(f"/books/{book_id}/editions", **({"json": body} if body is not None else {}))).json()
    await execute(await claim_job())
    return started["edition"]["id"]


def test_a_scoped_run_draws_only_the_chosen_sections(tmp_path, monkeypatch):
    async def scenario(api, worker, book):
        bid = book["id"]
        eid = await _drive(api, bid, {"section_ids": ["s2"]})
        edition = (await api.get(f"/editions/{eid}")).json()
        assert edition["scope"] == {"section_ids": ["s2"]}
        assert edition["status"] == "complete" and edition["page_total"] == 1
        # The worker saw one section and only that section's units, with their PDF pages.
        assert len(worker.understanding_inputs) == 1
        assert worker.understanding_inputs[0]["sections"] == ["s2"]
        assert all(u.startswith("s2u") for u in worker.understanding_inputs[0]["units"])
        assert [p["section_id"] for p in edition["pages"]] == ["s2"]
        assert edition["coverage"]["sections_without_claims"] == []  # judged on the scope, not on the book
        assert edition["book"]["sections"] == [{"id": "s2", "title": edition["book"]["sections"][0]["title"]}]

        # A page range: PDF page 3 is chapter 3 only. A resume keeps the same scope.
        eid3 = await _drive(api, bid, {"pdf_page_from": 3, "pdf_page_to": 3})
        e3 = (await api.get(f"/editions/{eid3}")).json()
        assert e3["scope"] == {"pdf_page_from": 3, "pdf_page_to": 3}
        assert worker.understanding_inputs[1]["sections"] == ["s3"]
        assert [p["section_id"] for p in e3["pages"]] == ["s3"]

        # A body with only review_plan false is the whole book.
        whole = await _drive(api, bid, {"review_plan": False})
        w = (await api.get(f"/editions/{whole}")).json()
        assert w["scope"] is None and w["page_total"] == 3
        assert worker.understanding_inputs[2]["sections"] == ["s1", "s2", "s3"]

    _run(tmp_path, monkeypatch, scenario)


def test_bad_scopes_are_refused_before_any_edition_or_call(tmp_path, monkeypatch):
    async def scenario(api, worker, book):
        from app.documents import Edition, GenerationJob

        bid = book["id"]
        for body, fragment in (
            ({"section_ids": ["s7"]}, "no section 's7'"),
            ({"section_ids": []}, "scope is empty"),
            ({"pdf_page_from": 3, "pdf_page_to": 1}, "comes after"),
            ({"pdf_page_from": 1, "pdf_page_to": 99}, "pages 1 to 3"),
            ({"pdf_page_from": 2}, "both a first page and a last page"),
            ({"section_ids": ["s1"], "pdf_page_from": 1, "pdf_page_to": 2}, "not both"),
        ):
            r = await api.post(f"/books/{bid}/editions", json=body)
            assert r.status_code == 422 and fragment in r.json()["detail"], (body, r.text)
        assert (await api.post(f"/books/{bid}/editions", json={"surprise": 1})).status_code == 422  # a misspelt key is not ignored
        assert await Edition.find_all().count() == 0
        assert await GenerationJob.find(GenerationJob.kind == "generate").count() == 0
        assert worker.calls == []

    _run(tmp_path, monkeypatch, scenario)


def test_a_scope_over_the_limit_is_refused_on_the_scope(tmp_path, monkeypatch):
    async def scenario(api, worker, book):
        bid = book["id"]
        # chapters have about 360 words each: two chapters are over a 500-word limit, one is inside it.
        two = await api.post(f"/books/{bid}/editions", json={"section_ids": ["s1", "s2"]})
        assert two.status_code == 422 and "This selection has" in two.json()["detail"] and "words" in two.json()["detail"]
        assert (await api.post(f"/books/{bid}/editions")).status_code == 422  # the whole book is over it too
        one = await api.post(f"/books/{bid}/editions", json={"section_ids": ["s1"]})
        assert one.status_code == 200 and one.json()["edition"]["scope"] == {"section_ids": ["s1"]}
        assert worker.calls == []

    _run(tmp_path, monkeypatch, scenario, MAX_SOURCE_WORDS="500")


def test_plan_review_stops_before_drawing_and_approve_completes_it(tmp_path, monkeypatch):
    async def scenario(api, worker, book):
        from app.jobs.runner import claim_job, execute

        bid = book["id"]
        started = (await api.post(f"/books/{bid}/editions", json={"review_plan": True})).json()
        eid = started["edition"]["id"]
        assert started["edition"]["policy"]["review_plan"] is True
        await execute(await claim_job())

        waiting = (await api.get(f"/editions/{eid}")).json()
        assert waiting["status"] == "awaiting_plan_review"
        assert waiting["page_total"] == 3 and [p["status"] for p in waiting["pages"]] == ["pending"] * 3
        assert [p["beat"] for p in waiting["pages"]] == ["beat 1", "beat 2", "beat 3"]  # the review screen reads these
        assert [c["goal_type"] for c in worker.calls] == ["BOOK_UNDERSTANDING", "ADAPTATION_PLAN"]  # 0 drawing calls
        assert waiting["draw_estimate_usd"] == {"low": 0.08, "high": 0.11}  # 3 pages
        assert waiting["plan_omitted"] == []
        assert len(waiting["book"]["claims"]) == 3  # claim text for the review, sent while the plan waits
        assert waiting["totals"]["calls"] == 2 and waiting["totals"]["cost_usd"] == 0.002  # spent so far is live
        assert waiting["job"]["status"] == "succeeded"
        assert (await api.get("/books")).json()[0]["latest_edition"]["status"] == "awaiting_plan_review"

        # It is not an active status, but it blocks a second edition.
        again = (await api.post(f"/books/{bid}/editions")).json()
        assert again["already_running"] is True and again["edition"]["id"] == eid
        assert (await api.post(f"/editions/{eid}/resume")).status_code == 409
        assert (await api.post(f"/editions/{eid}/pages/1/redraw")).status_code == 409

        approved = (await api.post(f"/editions/{eid}/approve-plan")).json()
        assert approved["edition"]["status"] == "queued" and approved["edition"]["policy"]["plan_approved"] is True
        assert approved["edition"]["draw_estimate_usd"] is None
        assert (await api.post(f"/editions/{eid}/approve-plan")).status_code == 409  # no longer waiting
        before = len(worker.calls)
        await execute(await claim_job())
        done = (await api.get(f"/editions/{eid}")).json()
        assert done["status"] == "complete" and done["pages_accepted"] == 3 and done["plan_omitted"] is None
        # The understanding and the plan were reused: only the three pages were paid for.
        assert [c["goal_type"] for c in worker.calls[before:]] == ["MANGA_PAGE"] * 3
        assert done["totals"]["calls"] == 5
        assert "plan_approved_at" in done["policy"]

    _run(tmp_path, monkeypatch, scenario)


def test_plan_review_can_be_cancelled_and_a_run_without_it_is_unchanged(tmp_path, monkeypatch):
    async def scenario(api, worker, book):
        from app.jobs.runner import claim_job, execute

        bid = book["id"]
        eid = await _drive(api, bid, {"section_ids": ["s1", "s2"], "review_plan": True})
        assert (await api.get(f"/editions/{eid}")).json()["status"] == "awaiting_plan_review"
        stopped = (await api.post(f"/editions/{eid}/cancel")).json()
        assert stopped["status"] == "cancelled" and stopped["draw_estimate_usd"] is None
        assert (await api.post(f"/editions/{eid}/approve-plan")).status_code == 409  # not waiting any more
        assert [c["goal_type"] for c in worker.calls].count("MANGA_PAGE") == 0
        # The book is free again: a new edition may start, and with no body it draws without review.
        fresh = (await api.post(f"/books/{bid}/editions")).json()
        assert fresh["already_running"] is False and fresh["edition"]["id"] != eid
        await execute(await claim_job())
        edition = (await api.get(f"/editions/{fresh['edition']['id']}")).json()
        assert edition["status"] == "complete" and edition["policy"]["review_plan"] is False
        assert (await api.post(f"/editions/{fresh['edition']['id']}/approve-plan")).status_code == 409
        assert (await api.post("/editions/ffffffffffffffffffffffff/approve-plan")).status_code == 404

    _run(tmp_path, monkeypatch, scenario)


def test_the_server_default_turns_plan_review_on_and_a_request_turns_it_off(tmp_path, monkeypatch):
    async def scenario(api, worker, book):
        bid = book["id"]
        assert (await api.get("/status")).json()["plan_review_default"] is True
        eid = await _drive(api, bid)  # no body: the default applies
        assert (await api.get(f"/editions/{eid}")).json()["status"] == "awaiting_plan_review"
        await api.post(f"/editions/{eid}/cancel")
        off = await _drive(api, bid, {"review_plan": False})
        assert (await api.get(f"/editions/{off}")).json()["status"] == "complete"

    _run(tmp_path, monkeypatch, scenario, PLAN_REVIEW_DEFAULT="true")


def test_cancel_requested_is_in_the_job_view(tmp_path, monkeypatch):
    async def scenario(api, worker, book):
        started = (await api.post(f"/books/{book['id']}/editions")).json()
        assert started["job"]["cancel_requested"] is False
        await api.post(f"/editions/{started['edition']['id']}/cancel")
        job = (await api.get(f"/jobs/{started['job']['id']}")).json()
        assert job["cancel_requested"] is True and job["status"] == "cancelled"

    _run(tmp_path, monkeypatch, scenario)
