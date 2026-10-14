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
    CURRENT_POLICY,
    EARLIER_RUNS,
    FIT_RUNS,
    MARGIN,
    UNDERSTANDING_S_PER_WORD_HIGH,
    UNDERSTANDING_TIMEOUT_S,
    build_preflight,
    check_limits,
    draw_cost_range,
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


def test_the_fit_has_the_v02_and_v03_runs_and_only_the_current_policy():
    # 1 v0.1 run with Flash on every goal, 10 v0.2 runs (live lane 1-6 and 8, 2 final journeys, the v0.1.0
    # hold-out journey), the owner's private book (numbers only) and 6 complete v0.3 runs (Gate 1, 1b, 2a).
    # Nothing else may be in the ranges.
    assert len(FIT_RUNS) == 18
    assert sum(run.name.startswith("v0.3 ") for run in FIT_RUNS) == 6
    assert {run.name for run in FIT_RUNS} >= {"understanding A/B, all Flash", "v0.2 private book (numbers only)"}
    assert all(run.policy == CURRENT_POLICY for run in FIT_RUNS)
    assert len({run.name for run in FIT_RUNS}) == len(FIT_RUNS)
    # The earlier M3 runs stay on record, outside the ranges.
    assert len(EARLIER_RUNS) == 11
    assert all(run.policy != CURRENT_POLICY for run in EARLIER_RUNS)


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
    # The minutes the UI shows must contain the run too (floor and ceiling, never a smaller range).
    minutes = est["estimated_minutes"]
    assert minutes["first_page"]["low"] <= run.first_page_s / 60 <= minutes["first_page"]["high"]
    assert minutes["total"]["low"] <= run.finish_s / 60 <= minutes["total"]["high"]


@pytest.mark.parametrize("run", [r for r in FIT_RUNS if r.draw_cost_usd is not None], ids=lambda r: r.name)
def test_the_draw_range_contains_the_page_receipts_of_the_run(run):
    out = draw_cost_range(run.manga_pages)
    assert out["low"] <= run.draw_cost_usd <= out["high"]


def test_the_ranges_are_the_envelope_of_the_runs_widened_by_the_stated_margin():
    # Not wider than the data allows: each bound is within the margin (plus a rounding slack of 5 %)
    # of the extreme that was measured. A bound that moves further out must come with a new run.
    from app import preflight as pf

    slack = 1 + MARGIN + 0.05
    per_kword = [run.manga_pages / run.words * 1000 for run in FIT_RUNS]
    assert pf.PAGES_PER_KWORD_LOW <= min(per_kword) and pf.PAGES_PER_KWORD_LOW >= min(per_kword) / slack
    assert pf.PAGES_PER_KWORD_HIGH >= max(per_kword) and pf.PAGES_PER_KWORD_HIGH <= max(per_kword) * slack
    page_s = [(run.finish_s - run.first_page_s) / (run.manga_pages - 1) for run in FIT_RUNS]
    assert pf.PAGE_S_LOW <= min(page_s) and pf.PAGE_S_LOW >= min(page_s) / slack
    assert pf.PAGE_S_HIGH >= max(page_s) and pf.PAGE_S_HIGH <= max(page_s) * slack
    draw = [run.draw_cost_usd / run.manga_pages for run in FIT_RUNS if run.draw_cost_usd is not None]
    assert pf.DRAW_COST_PER_PAGE_LOW <= min(draw) and pf.DRAW_COST_PER_PAGE_LOW >= min(draw) / slack
    assert pf.DRAW_COST_PER_PAGE_HIGH >= max(draw) and pf.DRAW_COST_PER_PAGE_HIGH <= max(draw) * slack
    # First page: the base after the per-word term, over all fit runs (the slow v0.1 hour is inside it).
    bases = [run.first_page_s - pf.FIRST_PAGE_S_PER_WORD * run.words for run in FIT_RUNS]
    assert pf.FIRST_PAGE_BASE_S_LOW <= min(bases) and pf.FIRST_PAGE_BASE_S_HIGH >= max(bases)
    assert min(bases) - 1 <= pf.FIRST_PAGE_BASE_S_LOW and pf.FIRST_PAGE_BASE_S_HIGH <= max(bases) + 1
    # Cost factors: the smallest and the largest ratio of a measured cost to the cost model at the
    # low and the high page count of the range, widened by the margin (rounded outward, 0.01 slack).
    low, high = [], []
    for run in FIT_RUNS:
        kwords = run.words / 1000
        pages = estimate(run.words, run.sections)["estimated_manga_pages"]
        model = lambda n: pf.COST_PER_KWORD * kwords + pf.COST_PER_PAGE * n  # noqa: E731
        low.append(run.cost_usd / model(pages["low"]))
        high.append(run.cost_usd / model(pages["high"]))
    assert pf.COST_LOW_FACTOR <= min(low) * (1 - MARGIN) + 0.005
    assert pf.COST_HIGH_FACTOR >= max(high) * (1 + MARGIN) and pf.COST_HIGH_FACTOR <= max(high) * (1 + MARGIN) + 0.01


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
    # The basis says what the range rests on: the runs with Flash on every goal.
    basis = out["estimated_cost_usd"]["basis"]
    assert f"{len(FIT_RUNS)} measured runs with Flash on every goal" in basis
    assert "9 books of 26 to 68 PDF pages" in basis
    # The ranges are fitted on the all-Flash policy (D13). Any other policy must say it was not measured.
    for models in (("MiniMax-M3",) * 3, ("MiniMax-M3", "MiniMax-M3", "MiniMax-M3.1-Flash-Preview")):
        s2 = Settings(_env_file=None, understanding_model=models[0], plan_model=models[1], page_model=models[2])
        assert "not measured again" in build_preflight("b1", 26, 5794, 2, s2)["estimated_cost_usd"]["basis"]


def test_the_default_policy_is_the_measured_policy():
    s = Settings(_env_file=None)
    assert (s.understanding_model, s.plan_model, s.page_model) == CURRENT_POLICY  # the all-Flash default (D13)


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


def test_the_basis_counts_the_runs_and_names_no_stale_claim():
    from app.preflight import cost_basis
    from app.settings import Settings
    text = cost_basis(Settings(_env_file=None))
    assert f"{len(FIT_RUNS)} measured runs with Flash on every goal" in text
    assert "M3 on the book understanding in all" not in text
    assert "not measured again" not in text


# --- scope (issue #40) and the plan-review cost range ---


def test_draw_cost_range_for_sixteen_pages():
    from app.preflight import DRAW_COST_PER_PAGE_HIGH, DRAW_COST_PER_PAGE_LOW

    out = draw_cost_range(16)
    assert out == {"low": round(16 * DRAW_COST_PER_PAGE_LOW, 2), "high": round(16 * DRAW_COST_PER_PAGE_HIGH, 2)}
    assert out == {"low": 0.3, "high": 0.58}
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
