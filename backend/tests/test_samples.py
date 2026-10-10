"""The built-in Andersen sample (S2): files, install, and that it behaves like a normal book.

No model is called. Needs a MongoDB at $TEST_MONGODB_URL for the API tests; the file tests need none.
"""

from __future__ import annotations

import asyncio
import gzip
import hashlib
import json
import re
import uuid
from pathlib import Path

import httpx

from test_preflight import _env, needs_mongo

SAMPLE_DIR = Path(__file__).resolve().parents[1] / "samples" / "andersen"
SECRET_PATTERNS = [
    r"sk-[A-Za-z0-9_-]{16,}",  # API keys
    r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}",  # JWT
    r"Bearer\s+[A-Za-z0-9._-]{10,}",
    r"(?i)api[_-]?key[\"']?\s*[:=]\s*[\"'][^\"']{8,}",
    r"mongodb(\+srv)?://[^\s\"']*@",  # a URL with a password
    r"AGENT_WORKER_TOKEN\s*=",
]
MACHINE_TEXT = ["/Users/", "/Volumes/", "localhost", "127.0.0.1", "C:\\\\"]


def _sample() -> dict:
    return json.loads(gzip.open(SAMPLE_DIR / "sample.json.gz").read().decode("utf-8"))


# --- the files ---


def test_sample_files_have_no_machine_path_or_secret():
    raw = gzip.open(SAMPLE_DIR / "sample.json.gz").read().decode("utf-8")
    texts = {"sample.json.gz": raw}
    for name in ("manifest.json", "NOTICE.md"):
        texts[name] = (SAMPLE_DIR / name).read_text(encoding="utf-8")
    for name, text in texts.items():
        for bad in MACHINE_TEXT:
            assert bad not in text, f"{name} holds machine-specific text {bad!r}"
        for pattern in SECRET_PATTERNS:
            assert not re.search(pattern, text), f"{name} matches the secret pattern {pattern!r}"


def test_sample_matches_the_real_v01_run():
    data = _sample()
    manifest = json.loads((SAMPLE_DIR / "manifest.json").read_text(encoding="utf-8"))
    pdf = (SAMPLE_DIR / manifest["pdf"]).read_bytes()
    assert hashlib.sha256(pdf).hexdigest() == manifest["pdf_hash"] == data["book"]["pdf_hash"]
    assert "pdf_path" not in data["book"]
    edition = data["edition"]
    assert (edition["status"], edition["page_total"], edition["pages_accepted"], edition["pages_failed"]) == ("complete", 18, 18, 0)
    assert edition["totals"]["cost_usd"] == 0.460227 and edition["totals"]["calls"] == 20
    assert edition["coverage"]["claims_total"] == 54
    assert {"generate_started_at", "drawing_started_at", "first_page_at"} <= set(edition["timings"])
    assert [p["page_number"] for p in data["pages"]] == list(range(1, 19))
    assert all(p["status"] == "accepted" and p["svg"].startswith("<svg") for p in data["pages"])
    assert all(j["status"] == "succeeded" for j in data["jobs"])  # no job is left for a runner to pick up
    understanding = next(a for a in data["artifacts"] if a["kind"] == "understanding")
    assert understanding["content_hash"] == manifest["edition_understanding_hash"]


# --- the API ---


def _run(monkeypatch, tmp_path, scenario):
    db_name = f"ps_samples_{uuid.uuid4().hex[:8]}"
    _env(monkeypatch, tmp_path, db_name)
    from app import db as db_module
    from app.settings import get_settings

    async def wrapper():
        from app.db import init_db
        from app.main import app

        client_db = await init_db()
        try:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://api") as api:
                await scenario(api)
        finally:
            await client_db.drop_database(db_name)

    try:
        asyncio.run(wrapper())
    finally:
        get_settings.cache_clear()
        db_module._client = None


@needs_mongo
def test_install_is_idempotent_and_the_sample_behaves_like_a_book(tmp_path, monkeypatch):
    async def scenario(api: httpx.AsyncClient):
        from app.documents import Edition, EditionArtifact, EditionPage, GenerationJob, LibraryBook

        before = (await api.get("/samples")).json()
        assert before == [{"id": "andersen", "title": "Four Tales by Hans Christian Andersen", "installed": False}]
        assert (await api.get("/books")).json() == []

        first = await api.post("/samples/andersen")
        assert first.status_code == 200
        ids = first.json()
        second = await api.post("/samples/andersen")
        assert second.json() == ids  # same book, same edition
        # two requests at once still make one book
        both = await asyncio.gather(api.post("/samples/andersen"), api.post("/samples/andersen"))
        assert [r.json() for r in both] == [ids, ids]
        assert await LibraryBook.find_all().count() == 1 and await Edition.find_all().count() == 1
        assert await EditionPage.find_all().count() == 18 and await EditionArtifact.find_all().count() == 2

        listed = (await api.get("/samples")).json()
        assert listed[0]["installed"] is True and listed[0]["book_id"] == ids["book_id"] and listed[0]["edition_id"] == ids["edition_id"]
        assert (await api.post("/samples/nope")).status_code == 404

        # the shelf and the book view
        shelf = (await api.get("/books")).json()
        assert len(shelf) == 1 and shelf[0]["is_sample"] is True
        assert shelf[0]["latest_edition"] == {"id": ids["edition_id"], "status": "complete", "page_total": 18, "pages_accepted": 18, "pages_failed": 0, "provider_stop": None}
        book = (await api.get(f"/books/{ids['book_id']}")).json()
        assert book["is_sample"] is True and book["status"] == "parsed"
        assert (book["page_count"], book["word_count"], book["section_count"]) == (22, 4775, 4)
        assert [s["word_count"] for s in book["sections"]] == [1869, 1480, 411, 1015]

        # the edition: 18 accepted pages, real numbers, internal references consistent
        edition = (await api.get(f"/editions/{ids['edition_id']}")).json()
        assert edition["book_id"] == ids["book_id"] and edition["status"] == "complete"
        assert len(edition["pages"]) == 18 and all(p["status"] == "accepted" for p in edition["pages"])
        assert edition["totals"]["cost_usd"] == 0.460227 and edition["coverage"]["claims_total"] == 54
        assert edition["has_plan"] is True and edition["book"]["title"] and len(edition["book"]["cast"]) > 0
        assert edition["job"]["status"] == "succeeded"
        stored = await Edition.get(ids["edition_id"])
        for artifact in await EditionArtifact.find(EditionArtifact.edition_id == ids["edition_id"]).to_list():
            assert str(getattr(stored, f"{artifact.kind}_id")) == str(artifact.id)
        assert await GenerationJob.find(GenerationJob.status == "queued").count() == 0  # nothing for a runner to pick up
        assert await GenerationJob.find(GenerationJob.status == "running").count() == 0

        # every page endpoint returns its SVG, panels and sources
        for number in range(1, 19):
            page = (await api.get(f"/editions/{ids['edition_id']}/pages/{number}")).json()
            assert page["status"] == "accepted" and page["svg"].startswith("<svg"), number
            assert page["panels"] and page["texts"] and page["sources"], number
            assert page["claim_details"], number

        # the preflight, the PDF viewer and the receipts work
        pre = await api.get(f"/books/{ids['book_id']}/preflight")
        assert pre.status_code == 200 and pre.json()["pdf_pages"] == 22 and pre.json()["within_limits"] is True
        assert (await api.get(f"/books/{ids['book_id']}/pdf/info")).json()["total_pages"] == 22
        png = await api.get(f"/books/{ids['book_id']}/pdf/page/3")
        assert png.status_code == 200 and png.content.startswith(b"\x89PNG")
        receipts = (await api.get(f"/editions/{ids['edition_id']}/receipts")).json()
        assert len(receipts["calls"]) == 20 and receipts["totals"]["calls"] == 20

    _run(monkeypatch, tmp_path, scenario)


@needs_mongo
def test_preview_writes_nothing_and_equals_the_installed_edition(tmp_path, monkeypatch):
    async def scenario(api: httpx.AsyncClient):
        from datetime import datetime

        from app.db import init_db
        from app.settings import get_settings

        db = (await init_db())[get_settings().db_name]

        async def snapshot():
            return {name: await db[name].count_documents({}) for name in sorted(await db.list_collection_names())}

        before = await snapshot()
        files_before = sorted(p.name for p in tmp_path.rglob("*"))
        assert (await api.get("/samples/nope/preview")).status_code == 404
        assert (await api.get("/samples/nope/pdf/page/1")).status_code == 404
        preview = (await api.get("/samples/andersen/preview")).json()
        assert (await api.get("/samples/andersen/pdf/page/3")).content.startswith(b"\x89PNG")
        assert (await api.get("/samples/andersen/pdf/page/99")).status_code == 404
        assert (await api.get("/samples")).json()[0]["installed"] is False
        assert await snapshot() == before  # no document written, nothing installed
        assert sorted(p.name for p in tmp_path.rglob("*")) == files_before  # no file written

        ids = (await api.post("/samples/andersen")).json()
        edition = (await api.get(f"/editions/{ids['edition_id']}")).json()
        book = (await api.get(f"/books/{ids['book_id']}")).json()
        pre = (await api.get(f"/books/{ids['book_id']}/preflight")).json()
        page1 = (await api.get(f"/editions/{ids['edition_id']}/pages/1")).json()

        assert preview["title"] == book["title"] and preview["author"] == book["author"]
        assert (preview["pdf_pages"], preview["sections"]) == (book["page_count"], book["section_count"]) == (22, 4)
        assert (preview["page_total"], preview["pages_accepted"]) == (edition["page_total"], edition["pages_accepted"]) == (18, 18)
        assert preview["cost_usd"] == edition["totals"]["cost_usd"] == 0.460227
        for key in ("estimated_manga_pages", "estimated_minutes", "estimated_cost_usd"):
            assert preview["estimate"][key] == pre[key], key
        assert preview["cover_svg"] == page1["svg"]

        def secs(a, b):
            return round((datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds(), 3)

        t = edition["timings"]
        first = t.get("page_1_at") or t["first_page_at"]
        assert preview["timings"]["first_page_seconds"] == secs(t.get("generate_started_at") or edition["created_at"], first)
        assert preview["timings"]["created_to_first_page_seconds"] == secs(edition["created_at"], first)
        assert preview["timings"]["created_to_finished_seconds"] == secs(edition["created_at"], edition["finished_at"])
        assert preview["timings"]["total_seconds"] == (edition["active_seconds"] or secs(edition["created_at"], edition["finished_at"]))
        assert preview["timings"]["first_is_page_1"] is bool(t.get("page_1_at"))

        proof = preview["proof"]
        panel = next(p for p in page1["panels"] if p["id"] == proof["panel"]["id"])
        assert proof["page"] == 1 and proof["panel"]["bbox"] == panel["bbox"]
        assert proof["texts"] == [
            {k: x.get(k) for k in ("panel", "index", "kind", "speaker", "text", "fidelity")} for x in page1["texts"] if x["panel"] == panel["id"]
        ] and proof["texts"]
        assert proof["speakers"] == page1["speakers"]
        wanted = next(s for s in page1["sources"] if s["panel"] == panel["id"])["source"]
        assert proof["source_pdf_pages"] == sorted({x["page"] for x in wanted}) and proof["source_pdf_pages"]
        for thumb in preview["thumbs"]:
            assert (await api.get(f"/editions/{ids['edition_id']}/pages/{thumb['page']}")).json()["svg"] == thumb["svg"]

    _run(monkeypatch, tmp_path, scenario)


@needs_mongo
def test_install_adopts_a_book_uploaded_from_the_same_pdf(tmp_path, monkeypatch):
    async def scenario(api: httpx.AsyncClient):
        from app.documents import GenerationJob, LibraryBook

        manifest = json.loads((SAMPLE_DIR / "manifest.json").read_text(encoding="utf-8"))
        pdf = (SAMPLE_DIR / manifest["pdf"]).read_bytes()
        up = await api.post("/upload", files={"file": ("my-copy.pdf", pdf, "application/pdf")})
        mine = up.json()["book"]["id"]
        assert up.json()["book"]["is_sample"] is True  # same PDF, same hash
        ids = (await api.post("/samples/andersen")).json()
        assert ids["book_id"] == mine  # the sample joins the book that is already on the shelf
        assert await LibraryBook.find_all().count() == 1
        assert (await api.get(f"/books/{mine}")).json()["status"] == "parsed"
        assert (await api.get(f"/editions/{ids['edition_id']}")).json()["status"] == "complete"
        # the parse job of the upload is still queued, but the book is parsed, so the parse job does nothing
        parse = await GenerationJob.find(GenerationJob.kind == "parse").to_list()
        assert len(parse) >= 1

    _run(monkeypatch, tmp_path, scenario)


# --- the state seeder (scripts/fixtures/seed_states.py) ---

SEEDER = Path(__file__).resolve().parents[2] / "scripts" / "fixtures" / "seed_states.py"


def _seed(db_name: str, storage: Path, out: Path):
    import os
    import subprocess
    import sys

    from test_preflight import MONGO_URL

    return subprocess.run(
        [sys.executable, str(SEEDER), "--db", db_name, "--mongo-url", MONGO_URL, "--storage", str(storage), "--exports", "none", "--out", str(out)],
        capture_output=True, text=True, env={**os.environ, "PYTHONPATH": ""},
    )


def test_seeder_refuses_other_databases_and_remote_servers(tmp_path):
    import subprocess
    import sys

    for db in ("panelsummary", "bookreel_v010_final", "ps_frontend_fixture"):
        run = _seed(db, tmp_path / "s", tmp_path / "o")
        assert run.returncode == 2 and "does not start with" in run.stderr, db
    atlas = subprocess.run(
        [sys.executable, str(SEEDER), "--db", "v02_x", "--mongo-url", "mongodb+srv://user:pw@cluster.example.net/", "--storage", str(tmp_path / "s")],
        capture_output=True, text=True,
    )
    assert atlas.returncode == 2 and "local server" in atlas.stderr


@needs_mongo
def test_seeder_makes_every_state_and_leaves_no_job_for_the_runner(tmp_path, monkeypatch):
    from collections import Counter

    db_name = f"fixture_{uuid.uuid4().hex[:8]}"
    run = _seed(db_name, tmp_path / "storage", tmp_path / "out")
    assert run.returncode == 0, run.stderr[-800:]
    _env(monkeypatch, tmp_path, db_name)
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path / "storage"))
    from app import db as db_module
    from app.settings import get_settings

    get_settings.cache_clear()
    db_module._client = None

    async def scenario():
        from app.db import init_db
        from app.jobs.runner import claim_job
        from app.main import app

        client_db = await init_db()
        try:
            # the runner finds nothing to claim: every active job holds a lease that never ends
            assert await claim_job() is None
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://api") as api:
                shelf = (await api.get("/books")).json()
                from typing import get_args

                from app.documents import EditionStatus

                # 24 minus the 60-page run (needs the exports); the plan-review book is there when the backend knows its status
                assert len(shelf) == 22 + (1 if "awaiting_plan_review" in get_args(EditionStatus) else 0)
                states = Counter(
                    (b["status"] if not b["latest_edition"] else b["latest_edition"]["status"], (b["latest_edition"] or {}).get("provider_stop", None) and b["latest_edition"]["provider_stop"]["code"])
                    for b in shelf
                )
                for expected in [("failed", None), ("parsing", None), ("parsed", None), ("queued", None), ("understanding", None), ("planning", None), ("drawing", None), ("complete", None), ("completed_with_failures", None), ("cancelled", None), ("failed", "PROVIDER_LIMIT"), ("failed", "PROVIDER_AUTH"), ("failed", "PROVIDER_UNAVAILABLE")]:
                    assert states[expected] >= 1, expected
                assert sum(1 for b in shelf if b["is_sample"]) == 1
                assert any(b["title"] == "The Happy Prince and Other Tales (first two tales)" for b in shelf)
                assert any(b["author"] == "" and b["status"] == "failed" for b in shelf)
                for book in shelf:  # every page of every edition loads
                    if book["latest_edition"]:
                        edition = (await api.get(f"/editions/{book['latest_edition']['id']}")).json()
                        for p in edition["pages"]:
                            if p["status"] == "accepted":
                                assert (await api.get(f"/editions/{edition['id']}/pages/{p['page_number']}")).json()["svg"]
                over = next(b for b in shelf if b["title"].startswith("Sample: A Long Book"))
                assert (await api.get(f"/books/{over['id']}/preflight")).json()["within_limits"] is False
        finally:
            await client_db.drop_database(db_name)

    try:
        asyncio.run(scenario())
    finally:
        get_settings.cache_clear()
        db_module._client = None
