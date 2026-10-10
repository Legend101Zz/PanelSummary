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
    both = check_limits(120, 20000, 75, 17500)
    assert len(both) == 3  # two reasons plus the note that the PDF stays readable
    assert "read the PDF" in both[-1]
    assert not any("BookReel" in r for r in both)


def test_limits_are_configuration(monkeypatch):
    monkeypatch.setenv("MAX_PDF_PAGES", "10")
    monkeypatch.setenv("MAX_SOURCE_WORDS", "2000")
    s = Settings(_env_file=None)
    assert (s.max_pdf_pages, s.max_source_words) == (10, 2000)


def test_build_preflight_shape_and_basis():
    s = Settings(_env_file=None)
    out = build_preflight("b1", 26, 5794, 2, s)
    assert list(out) == [
        "book_id", "scope", "pdf_pages", "source_words", "sections", "estimated_manga_pages", "estimated_cost_usd",
        "estimated_minutes", "limits", "within_limits", "blocking_reasons",
    ]
    assert out["scope"] is None  # the whole book
    assert list(out["estimated_cost_usd"]) == ["low", "high", "basis_short", "basis"]
    assert out["estimated_cost_usd"]["basis_short"] == "Estimate at MiniMax-M3 rates, not a bill."
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


# --- scope (issue #40) and the plan-review cost range ---


def test_draw_cost_range_for_sixteen_pages():
    from app.preflight import COST_HIGH_FACTOR, COST_LOW_FACTOR, COST_PER_PAGE, draw_cost_range

    out = draw_cost_range(16)
    assert out == {"low": round(16 * COST_PER_PAGE * COST_LOW_FACTOR, 2), "high": round(16 * COST_PER_PAGE * COST_HIGH_FACTOR, 2)}
    assert out == {"low": 0.41, "high": 0.6}
    assert draw_cost_range(0) == {"low": 0.0, "high": 0.0}


def test_scoped_limit_reasons_say_selection_and_keep_the_numbers():
    reasons = check_limits(120, 20000, 75, 17500, scoped=True)
    assert reasons[0] == "This selection has 20,000 words. PanelSummary can adapt up to 17,500 words in one run."
    assert reasons[1].startswith("This selection has 120 PDF pages.")
    assert reasons[-1] == "Choose fewer sections or a shorter page range."
    assert check_limits(75, 17500, 75, 17500, scoped=True) == []
    # the unscoped words are the v0.1 words, unchanged
    assert check_limits(60, 20000, 75, 17500)[0].startswith("This book has 20,000 words. PanelSummary can adapt books up to")


def _big_book(pdf_pages=150):
    """A 150-page, 30,000-word book that is parsed: three sections of 50 pages and 10,000 words."""
    from app.documents import BookSource, LibraryBook

    book = LibraryBook(
        title="Big", original_filename="big.pdf", pdf_hash=uuid.uuid4().hex, pdf_path="/nonexistent.pdf",
        status="parsed", page_count=pdf_pages, word_count=30000, section_count=3,
    )
    sections, units = [], []
    for i in range(3):
        sid = f"s{i + 1}"
        first = i * 50 + 1
        sections.append({"id": sid, "title": f"Part {i + 1}", "page_start": first, "page_end": first + 49, "word_count": 10000, "unit_ids": [f"{sid}u1", f"{sid}u2"]})
        for j in range(2):
            start = first + j * 25
            units.append({"id": f"{sid}u{j + 1}", "section_id": sid, "page_start": start, "page_end": start + 24, "word_count": 5000, "text": f"text of {sid}u{j + 1}"})
    return book, BookSource(book_id="", parser="test", content_hash="x", page_count=pdf_pages, word_count=30000, sections=sections, units=units)


@needs_mongo
def test_a_150_page_book_is_outside_the_limit_but_one_section_is_inside(tmp_path, monkeypatch):
    import test_generate_journey as journey

    worker = journey.FakeWorker(fail_pages=set())
    port = journey._free_port()
    server = journey._serve(worker.app, port)
    db_name = f"ps_scope_{uuid.uuid4().hex[:8]}"
    _env(monkeypatch, tmp_path, db_name, worker_port=port)  # default limits: 75 pages, 17,500 words

    async def scenario():
        from app.db import init_db
        from app.documents import Edition, GenerationJob
        from app.main import app

        client_db = await init_db()
        try:
            book, source = _big_book()
            await book.insert()
            source.book_id = str(book.id)
            await source.insert()
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://api") as api:
                detail = (await api.get(f"/books/{book.id}")).json()
                assert len(detail["page_words"]) == 150 and sum(detail["page_words"]) == detail["word_count"] == 30000
                assert detail["page_words"][0] == 200 and detail["page_words"][149] == 200  # 5,000 words over 25 pages
                whole = (await api.get(f"/books/{book.id}/preflight")).json()
                assert whole["scope"] is None and whole["pdf_pages"] == 150 and whole["source_words"] == 30000
                assert whole["within_limits"] is False and whole["sections"] == 3
                assert (await api.post(f"/books/{book.id}/editions")).status_code == 422  # unchanged v0.1 refusal

                one = (await api.get(f"/books/{book.id}/preflight", params={"section_ids": "s2"})).json()
                assert one["scope"] == {"section_ids": ["s2"]}
                assert (one["pdf_pages"], one["source_words"], one["sections"]) == (50, 10000, 1)
                assert one["within_limits"] is True and one["blocking_reasons"] == []
                assert one["estimated_manga_pages"]["high"] < whole["estimated_manga_pages"]["high"]
                assert one["estimated_cost_usd"]["high"] < whole["estimated_cost_usd"]["high"]
                assert one["estimated_cost_usd"]["basis_short"] == "Estimate at MiniMax-M3 rates, not a bill."
                assert list(one) == list(whole)  # the same shape

                # two sections: 100 pages and 20,000 words are over both limits, with plain reasons
                two = (await api.get(f"/books/{book.id}/preflight", params={"section_ids": "s1,s3"})).json()
                assert two["within_limits"] is False and (two["pdf_pages"], two["source_words"]) == (100, 20000)
                assert two["blocking_reasons"][0].startswith("This selection has 20,000 words")
                refused = await api.post(f"/books/{book.id}/editions", json={"section_ids": ["s1", "s3"]})
                assert refused.status_code == 422 and "This selection has 20,000 words" in refused.json()["detail"]

                # a page range: units that overlap pages 40 to 60 (s1u2 on 26-50 and s2u1 on 51-75)
                ranged = (await api.get(f"/books/{book.id}/preflight", params={"page_from": 40, "page_to": 60})).json()
                assert ranged["scope"] == {"pdf_page_from": 40, "pdf_page_to": 60}
                assert (ranged["pdf_pages"], ranged["source_words"], ranged["sections"]) == (21, 10000, 2)

                # bad scopes: 422 with a reason, on the estimate and on Generate
                bad = [
                    ({"section_ids": "s9"}, {"section_ids": ["s9"]}, "no section 's9'"),
                    ({"section_ids": ""}, {"section_ids": []}, "scope is empty"),
                    ({"page_from": 60, "page_to": 40}, {"pdf_page_from": 60, "pdf_page_to": 40}, "comes after"),
                    ({"page_from": 0, "page_to": 10}, {"pdf_page_from": 0, "pdf_page_to": 10}, "inside the book"),
                    ({"page_from": 100, "page_to": 151}, {"pdf_page_from": 100, "pdf_page_to": 151}, "pages 1 to 150"),
                    ({"page_from": 5}, {"pdf_page_from": 5}, "both a first page and a last page"),
                    ({"section_ids": "s1", "page_from": 1, "page_to": 5}, {"section_ids": ["s1"], "pdf_page_from": 1, "pdf_page_to": 5}, "not both"),
                ]
                for query, body, fragment in bad:
                    r = await api.get(f"/books/{book.id}/preflight", params=query)
                    assert r.status_code == 422 and fragment in r.json()["detail"], (query, r.text)
                    r = await api.post(f"/books/{book.id}/editions", json=body)
                    assert r.status_code == 422 and fragment in r.json()["detail"], (body, r.text)
                assert await Edition.find_all().count() == 0
                assert await GenerationJob.find(GenerationJob.kind == "generate").count() == 0

                # one section starts an edition that stores its scope; every view returns it
                started = (await api.post(f"/books/{book.id}/editions", json={"section_ids": ["s2"]})).json()
                assert started["already_running"] is False and started["edition"]["scope"] == {"section_ids": ["s2"]}
                eid = started["edition"]["id"]
                assert (await api.get(f"/editions/{eid}")).json()["scope"] == {"section_ids": ["s2"]}
                assert (await api.get(f"/books/{book.id}/editions")).json()[0]["scope"] == {"section_ids": ["s2"]}
                assert worker.calls == []  # nothing reached the worker
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
