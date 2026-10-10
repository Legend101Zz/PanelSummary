"""Preflight estimator, size limits, the preflight endpoint and the Generate refusal (D19).

The estimator tests need no database. The API tests need a MongoDB at
$TEST_MONGODB_URL (default mongodb://127.0.0.1:27018), use a throwaway database
and are skipped if none is reachable. No test calls a model: the fake worker
must never receive a call for a refused book.
"""

from __future__ import annotations

import asyncio
import os
import socket
import uuid
from contextlib import closing

import httpx
import pytest

from app.preflight import (
    FIT_RUNS,
    UNDERSTANDING_S_PER_WORD_HIGH,
    UNDERSTANDING_TIMEOUT_S,
    build_preflight,
    check_limits,
    estimate,
)
from app.settings import Settings

MONGO_URL = os.environ.get("TEST_MONGODB_URL", "mongodb://127.0.0.1:27018")


def _mongo_up() -> bool:
    host, port = MONGO_URL.split("//", 1)[1].split("/")[0].split(":")
    with closing(socket.socket()) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, int(port))) == 0


needs_mongo = pytest.mark.skipif(not _mongo_up(), reason="no MongoDB for the API test")


# --- estimator: the ranges must contain every measured run ---


@pytest.mark.parametrize("run", FIT_RUNS, ids=lambda r: r.name)
def test_ranges_contain_the_measured_run(run):
    est = estimate(run.words, run.sections)
    pages = est["estimated_manga_pages"]
    assert pages["low"] <= run.manga_pages <= pages["high"]
    cost = est["estimated_cost_usd"]
    assert cost["low"] <= run.cost_usd <= cost["high"]
    low_s, high_s = est["_seconds"]["first_page"]
    if run.first_page_s is not None:
        assert low_s <= run.first_page_s <= high_s
    total_low, total_high = est["_seconds"]["total"]
    if run.finish_s is not None:
        assert total_low <= run.finish_s <= total_high


def test_ranges_are_ordered_and_grow_with_the_book():
    small = estimate(3000, 2)
    large = estimate(15000, 5)
    for est in (small, large):
        assert est["estimated_manga_pages"]["low"] <= est["estimated_manga_pages"]["high"]
        assert est["estimated_cost_usd"]["low"] < est["estimated_cost_usd"]["high"]
        minutes = est["estimated_minutes"]
        assert minutes["first_page"]["low"] <= minutes["first_page"]["high"]
        assert minutes["total"]["low"] <= minutes["total"]["high"]
        assert minutes["first_page"]["high"] <= minutes["total"]["high"]
    assert large["estimated_manga_pages"]["high"] > small["estimated_manga_pages"]["high"]
    assert large["estimated_cost_usd"]["high"] > small["estimated_cost_usd"]["high"]
    assert large["estimated_minutes"]["total"]["high"] > small["estimated_minutes"]["total"]["high"]


def test_the_page_range_stays_inside_the_plan_budget():
    # adaptation-plan.ts: min = max(2 per section, words/650, 3); max = max(min+2, min(140, words/260))
    est = estimate(300, 1)
    assert est["estimated_manga_pages"]["low"] >= 3
    huge = estimate(60_000, 10)
    assert huge["estimated_manga_pages"]["high"] <= 140


def test_default_limits_admit_the_largest_tested_book_and_stay_under_the_timeout():
    s = Settings(_env_file=None)
    assert s.max_source_words >= 16159 and s.max_pdf_pages >= 68
    # At the slowest understanding speed measured, a book at the word limit still finishes the
    # understanding inside the goal timeout. If this fails, the limit or the timeout changed.
    assert s.max_source_words * UNDERSTANDING_S_PER_WORD_HIGH < UNDERSTANDING_TIMEOUT_S


# --- limits ---


def test_check_limits():
    assert check_limits(68, 16159, 75, 17500) == []
    assert check_limits(75, 17500, 75, 17500) == []  # the limit itself is inside
    words = check_limits(60, 20000, 75, 17500)
    assert len(words) == 2 and "20,000 words" in words[0] and "17,500" in words[0]
    pages = check_limits(120, 9000, 75, 17500)
    assert "120 PDF pages" in pages[0]
    assert pages[0].endswith("PanelSummary can adapt books up to 75 PDF pages in one run.")
    assert words[0].endswith("PanelSummary can adapt books up to 17,500 words in one run.")
    assert not any("BookReel" in r for r in both)
    both = check_limits(120, 20000, 75, 17500)
    assert len(both) == 3  # two reasons plus the note that the PDF stays readable
    assert "read the PDF" in both[-1]


def test_limits_are_configuration(monkeypatch):
    monkeypatch.setenv("MAX_PDF_PAGES", "10")
    monkeypatch.setenv("MAX_SOURCE_WORDS", "2000")
    s = Settings(_env_file=None)
    assert (s.max_pdf_pages, s.max_source_words) == (10, 2000)


def test_build_preflight_shape_and_basis():
    s = Settings(_env_file=None)
    out = build_preflight("b1", 26, 5794, 2, s)
    assert list(out) == [
        "book_id", "pdf_pages", "source_words", "sections", "estimated_manga_pages", "estimated_cost_usd",
        "estimated_minutes", "limits", "within_limits", "blocking_reasons",
    ]
    assert list(out["estimated_cost_usd"]) == ["low", "high", "basis"]
    assert list(out["estimated_minutes"]) == ["first_page", "total"]
    assert out["within_limits"] is True and out["blocking_reasons"] == []
    assert "not a bill" in out["estimated_cost_usd"]["basis"]
    assert "not measured again" not in out["estimated_cost_usd"]["basis"]
    # The basis says what the range rests on, and names the Flash policy runs.
    basis = out["estimated_cost_usd"]["basis"]
    assert f"{len(FIT_RUNS)} measured runs" in basis and "Flash" in basis
    # The measured policies need no warning: all M3, M3 understanding with Flash plan and pages, and all Flash.
    for models in (("MiniMax-M3",) * 3, ("MiniMax-M3", "MiniMax-M3", "MiniMax-M3.1-Flash-Preview"), ("MiniMax-M3.1-Flash-Preview",) * 3):
        s2 = Settings(_env_file=None, understanding_model=models[0], plan_model=models[1], page_model=models[2])
        assert "not measured again" not in build_preflight("b1", 26, 5794, 2, s2)["estimated_cost_usd"]["basis"]
    # A policy nobody measured (Flash understanding with M3 plan and pages) must say so.
    other = Settings(_env_file=None, understanding_model="MiniMax-M3.1-Flash-Preview", plan_model="MiniMax-M3", page_model="MiniMax-M3")
    assert "not measured again" in build_preflight("b1", 26, 5794, 2, other)["estimated_cost_usd"]["basis"]


def test_the_fit_includes_the_flash_policy_runs():
    flash = [run for run in FIT_RUNS if "MiniMax-M3.1-Flash-Preview" in run.policy]
    assert len(flash) == 5
    assert sum(run.policy == ("MiniMax-M3.1-Flash-Preview",) * 3 for run in flash) == 1  # the all-Flash default (D13)


# --- API ---


def _env(monkeypatch, tmp_path, db_name, worker_port=None, **extra):
    monkeypatch.setenv("MONGODB_URL", MONGO_URL)
    monkeypatch.setenv("DB_NAME", db_name)
    monkeypatch.setenv("STORAGE_DIR", str(tmp_path / "storage"))
    if worker_port:
        monkeypatch.setenv("AGENT_WORKER_URL", f"http://127.0.0.1:{worker_port}")
        monkeypatch.setenv("AGENT_WORKER_TOKEN", "t" * 40)
    for key, value in extra.items():
        monkeypatch.setenv(key, value)
    from app import db as db_module
    from app.settings import get_settings

    get_settings.cache_clear()
    db_module._client = None


@needs_mongo
def test_preflight_endpoint_and_generate_refusal(tmp_path, monkeypatch):
    import test_generate_journey as journey  # the offline journey's fake worker and helpers

    worker = journey.FakeWorker(fail_pages=set())
    port = journey._free_port()
    server = journey._serve(worker.app, port)
    db_name = f"ps_preflight_{uuid.uuid4().hex[:8]}"
    _env(monkeypatch, tmp_path, db_name, worker_port=port, MAX_SOURCE_WORDS="6000", MAX_PDF_PAGES="30")

    async def scenario():
        from app.db import init_db
        from app.documents import Edition, GenerationJob, LibraryBook
        from app.main import app

        client_db = await init_db()
        try:
            def book(name, status, pages, words, sections):
                return LibraryBook(
                    title=name, original_filename=f"{name}.pdf", pdf_hash=uuid.uuid4().hex, pdf_path="/nonexistent.pdf",
                    status=status, page_count=pages, word_count=words, section_count=sections,
                )

            ok, too_long, too_many_pages, unparsed = (
                book("ok", "parsed", 26, 5794, 2),
                book("long", "parsed", 20, 6001, 2),
                book("pages", "parsed", 31, 3000, 2),
                book("unparsed", "uploaded", 0, 0, 0),
            )
            for b in (ok, too_long, too_many_pages, unparsed):
                await b.insert()
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://api") as api:
                # inside the limits: exact shape, limits echoed from configuration
                r = await api.get(f"/books/{ok.id}/preflight")
                assert r.status_code == 200
                body = r.json()
                assert body["book_id"] == str(ok.id) and body["pdf_pages"] == 26 and body["source_words"] == 5794 and body["sections"] == 2
                assert body["limits"] == {"max_pdf_pages": 30, "max_source_words": 6000}
                assert body["within_limits"] is True and body["blocking_reasons"] == []
                assert body["estimated_manga_pages"]["low"] <= 16 <= body["estimated_manga_pages"]["high"]

                # over the limits: preflight says why; Generate answers 422 and creates nothing
                for over, fragment in ((too_long, "6,001 words"), (too_many_pages, "31 PDF pages")):
                    pre = (await api.get(f"/books/{over.id}/preflight")).json()
                    assert pre["within_limits"] is False and fragment in pre["blocking_reasons"][0]
                    refused = await api.post(f"/books/{over.id}/editions")
                    assert refused.status_code == 422
                    assert fragment in refused.json()["detail"]
                assert await Edition.find_all().count() == 0
                assert await GenerationJob.find(GenerationJob.kind == "generate").count() == 0
                assert worker.calls == []  # the worker was never called for a refused book

                # not parsed: 409 for both
                assert (await api.get(f"/books/{unparsed.id}/preflight")).status_code == 409
                assert (await api.post(f"/books/{unparsed.id}/editions")).status_code == 409
                assert (await api.get("/books/ffffffffffffffffffffffff/preflight")).status_code == 404

                # a book inside the limits still starts an edition (the guard does not block it)
                started = await api.post(f"/books/{ok.id}/editions")
                assert started.status_code == 200 and started.json()["already_running"] is False
                assert await Edition.find_all().count() == 1
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


def test_the_basis_counts_each_policy_and_names_no_stale_claim():
    from app.preflight import cost_basis
    from app.settings import Settings
    text = cost_basis(Settings(_env_file=None))
    flash = "MiniMax-M3.1-Flash-Preview"
    n_all_flash = sum(1 for run in FIT_RUNS if run.policy == (flash,) * 3)
    assert n_all_flash >= 1
    assert f"and {n_all_flash} with Flash on every goal" in text
    assert "M3 on the book understanding in all" not in text
