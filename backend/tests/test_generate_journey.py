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

    def __init__(self, fail_pages: set[int]):
        self.calls: list[dict] = []
        self.fail_pages = fail_pages
        self.app = FastAPI()
        self.app.post("/internal/v2/runs")(self.runs)
        self.app.post("/internal/v2/runs/{run_id}/cancel")(self.cancel)

    async def cancel(self, run_id: str):
        return {"run_id": run_id, "state": "CANCELLED"}

    async def runs(self, request: Request):
        assert request.headers.get("authorization") == f"Bearer {TOKEN}"
        body = await request.json()
        self.calls.append({k: body.get(k) for k in ("goal_type", "run_id", "model", "thinking", "vision")} | {"page": body["input"].get("page_number")})
        trace = {"provider": "minimax", "model": body["model"], "thinking": body["thinking"], "tokens": {"input": 10, "output": 5, "cache_read": 0, "cache_write": 0}, "cost_usd": 0.001, "latency_ms": 3, "turns": 1, "submits": 1, "tool_calls": [], "stop_reason": "accepted"}
        goal = body["goal_type"]
        data = body["input"]
        if goal == "BOOK_UNDERSTANDING":
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
            assert len(units) >= 2
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
    worker = FakeWorker(fail_pages={2})
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
                job = await claim_job()
                assert job is not None and job.kind == "generate"
                await execute(job)

                edition = (await api.get(f"/editions/{edition_id}")).json()
                # Failure is visible, never "complete".
                assert edition["status"] == "completed_with_failures"
                assert edition["pages_accepted"] == 1 and edition["pages_failed"] == 1
                assert edition["coverage"]["lost_to_failed_pages"] == ["k2"]
                assert edition["coverage"]["core_not_conveyed"] == ["k2"]
                assert [p["status"] for p in edition["pages"]] == ["accepted", "failed"]
                assert (await GenerationJob.get(job.id)).status == "completed_with_failures"

                # Every model call went through the worker, with the recorded policy.
                goals = [c["goal_type"] for c in worker.calls]
                assert goals.count("BOOK_UNDERSTANDING") == 1 and goals.count("ADAPTATION_PLAN") == 1
                page_calls = [c for c in worker.calls if c["goal_type"] == "MANGA_PAGE"]
                assert sorted(c["page"] for c in page_calls) == [1, 2, 2]
                assert all(c["model"] == "MiniMax-M3" for c in worker.calls)
                first, retry = [c for c in page_calls if c["page"] == 2]
                assert first["thinking"] == edition["policy"]["page_thinking"]
                assert retry["thinking"] == edition["policy"]["retry_thinking"]
                assert all(c["vision"] is True for c in page_calls)

                # The page API serves exactly the worker's artifact and geometry.
                page = (await api.get(f"/editions/{edition_id}/pages/1")).json()
                assert page["svg"] == _svg(1)
                assert page["svg_hash"] == hashlib.sha256(_svg(1).encode()).hexdigest()
                assert page["panels"][0]["bbox"] == {"x": 40, "y": 40, "w": 920, "h": 1420}
                failed = (await api.get(f"/editions/{edition_id}/pages/2")).json()
                assert failed["svg"] is None and failed["error"]["message"] == "fake failure"

                # Totals are exact sums of the receipts (5 calls x 10/5 tokens, $0.001 each).
                assert edition["totals"]["calls"] == 5 and edition["totals"]["failed_calls"] == 2
                assert edition["totals"]["input_tokens"] == 50 and edition["totals"]["output_tokens"] == 25
                receipts = (await api.get(f"/editions/{edition_id}/receipts")).json()
                assert all(call["provider"] == "minimax" for call in receipts["calls"])
                assert len(receipts["calls"]) == 5

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
