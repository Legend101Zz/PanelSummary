"""Continue with the next section (issue #80, decisions D38 and D39). Offline, a fake worker, no spend.

Part 1 draws section 1. Part 2 is ``continue_from`` part 1 with section 2. Needs a MongoDB at
$TEST_MONGODB_URL (skipped when it is unreachable). Every test uses a throwaway database.
"""

from __future__ import annotations

import pytest
from fastapi import Request

import test_generate_journey as journey
from test_generate_journey import _drive, _run, _mongo_up

pytestmark = pytest.mark.skipif(not _mongo_up(), reason="no MongoDB for the continue tests")


class ContinueWorker(journey.FakeWorker):
    """Like the real worker with a prior: the prior cast and places are kept, new ones are added."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.priors: list = []  # the `prior` of each understanding request (None when there was none)
        self.plan_understandings: list = []
        self.fail_understanding = False  # every understanding request fails while this is set

    async def runs(self, request: Request):
        body = await request.json()
        data = body["input"]
        self.fail_understanding_once = self.fail_understanding_once or (self.fail_understanding and body["goal_type"] == "BOOK_UNDERSTANDING")
        if body["goal_type"] == "BOOK_UNDERSTANDING":
            self.priors.append(data.get("prior"))
        if body["goal_type"] == "ADAPTATION_PLAN":
            self.plan_understandings.append(data["understanding"])
        result = await super().runs(request)
        prior = data.get("prior") if body["goal_type"] == "BOOK_UNDERSTANDING" else None
        if prior and result.get("state") == "SUCCEEDED":
            u = result["result"]["understanding"]
            keep = prior["understanding"]
            new_cast = {"id": "c_new", "name": "Bo", "role": "friend", "description": "d", "look": {"kind": "bird", "species": "robin", "tone": "light"}, "sections": [s["id"] for s in u["sections"]]}
            u["cast"] = [*keep["cast"], new_cast]
            u["locations"] = [*keep["locations"], {"id": "l_new", "name": "Bog", "environment": "sky", "features": [], "description": "d"}]
        return result


def test_a_two_part_journey_reuses_the_cast_and_continues_the_page_numbers(tmp_path, monkeypatch):
    monkeypatch.setattr(journey, "FakeWorker", ContinueWorker)

    async def scenario(api, worker, book):
        from app.documents import BookUnderstanding

        bid = book["id"]
        part1 = await _drive(api, bid, {"section_ids": ["s1"]})
        e1 = (await api.get(f"/editions/{part1}")).json()
        assert e1["status"] == "complete" and e1["page_total"] == 1
        # Part 1: no prior, first page number 1, version 1 produced.
        assert worker.priors == [None]
        assert (e1["continues_edition_id"], e1["first_page_number"]) == (None, 1)
        assert (e1["understanding_version"], e1["understanding_version_produced"]) == (None, 1)

        part2 = await _drive(api, bid, {"section_ids": ["s2"], "continue_from": part1})
        e2 = (await api.get(f"/editions/{part2}")).json()
        assert e2["status"] == "complete" and e2["scope"] == {"section_ids": ["s2"]}
        # The worker request of part 2 carries the prior: the understanding of part 1, version 1.
        prior = worker.priors[1]
        assert prior["version"] == 1 and prior["edition_id"] == part1
        assert [m["id"] for m in prior["understanding"]["cast"]] == ["c_a"]
        # ...and only part 2's text.
        assert worker.understanding_inputs[1]["sections"] == ["s2"]
        # Page numbers continue: part 1 has one page, so part 2 starts at page 2.
        assert (e2["continues_edition_id"], e2["first_page_number"]) == (part1, 2)
        assert (e2["understanding_version"], e2["understanding_version_produced"]) == (1, 2)

        # Stored understanding v2 keeps the prior cast and looks and adds the new ones.
        rows = {r.version: r for r in await BookUnderstanding.find(BookUnderstanding.book_id == bid).to_list()}
        assert sorted(rows) == [1, 2] and rows[2].edition_id == part2 and rows[2].prior_version == 1
        v1_cast, v2_cast = rows[1].understanding["cast"], rows[2].understanding["cast"]
        assert v2_cast[0] == v1_cast[0]  # same id, name, look
        assert [m["id"] for m in v2_cast] == ["c_a", "c_new"]
        assert [m["id"] for m in rows[2].understanding["locations"]] == ["l_a", "l_new"]
        # The plan of part 2 is made from the merged understanding.
        assert [m["id"] for m in worker.plan_understandings[1]["cast"]] == ["c_a", "c_new"]
        # The edition API shows what the reader needs; the reader keeps numbering each edition from 1.
        assert [p["page_number"] for p in e2["pages"]] == [1]

        # The parts of the book as one series, in order, with what remains.
        parts = (await api.get(f"/books/{bid}/parts")).json()
        assert [(p["part"], p["edition_id"], p["first_page_number"], p["last_page_number"]) for p in parts["parts"]] == [(1, part1, 1, 1), (2, part2, 2, 2)]
        assert [p["section_ids"] for p in parts["parts"]] == [["s1"], ["s2"]]
        assert [r["id"] for r in parts["remaining"]] == ["s3"] and parts["can_continue"] is True and parts["continue_from"] == part2

        # Part 3 continues part 2: the prior is the understanding part 2 produced (version 2), pages start at 3.
        part3 = await _drive(api, bid, {"section_ids": ["s3"], "continue_from": part2})
        e3 = (await api.get(f"/editions/{part3}")).json()
        assert worker.priors[2]["version"] == 2
        assert (e3["first_page_number"], e3["understanding_version"], e3["understanding_version_produced"]) == (3, 2, 3)
        done = (await api.get(f"/books/{bid}/parts")).json()
        assert done["remaining"] == [] and done["can_continue"] is False and len(done["parts"]) == 3

    _run(tmp_path, monkeypatch, scenario)


def test_a_scope_that_repeats_a_drawn_scope_is_refused_with_a_reason(tmp_path, monkeypatch):
    monkeypatch.setattr(journey, "FakeWorker", ContinueWorker)

    async def scenario(api, worker, book):
        from app.documents import Edition

        bid = book["id"]
        part1 = await _drive(api, bid, {"section_ids": ["s1", "s2"]})
        before = await Edition.find_all().count()
        calls = len(worker.calls)
        for body in (
            {"section_ids": ["s2", "s3"], "continue_from": part1},  # s2 is drawn
            {"pdf_page_from": 2, "pdf_page_to": 3, "continue_from": part1},  # PDF page 2 is chapter 2
        ):
            r = await api.post(f"/books/{bid}/editions", json=body)
            assert r.status_code == 422, r.text
            assert "repeats text that an earlier part already drew" in r.json()["detail"]
            assert "Chapter Two" in r.json()["detail"] or "Chapter 2" in r.json()["detail"]
        assert await Edition.find_all().count() == before and len(worker.calls) == calls  # no edition, no call

        # The next section is fine.
        ok = await api.post(f"/books/{bid}/editions", json={"section_ids": ["s3"], "continue_from": part1})
        assert ok.status_code == 200 and ok.json()["edition"]["first_page_number"] == 3

    _run(tmp_path, monkeypatch, scenario)


def test_the_overlap_check_covers_the_whole_chain_not_only_the_last_part(tmp_path, monkeypatch):
    monkeypatch.setattr(journey, "FakeWorker", ContinueWorker)

    async def scenario(api, worker, book):
        bid = book["id"]
        part1 = await _drive(api, bid, {"section_ids": ["s1"]})
        part2 = await _drive(api, bid, {"section_ids": ["s2"], "continue_from": part1})
        r = await api.post(f"/books/{bid}/editions", json={"section_ids": ["s1", "s3"], "continue_from": part2})
        assert r.status_code == 422 and "repeats text" in r.json()["detail"]

    _run(tmp_path, monkeypatch, scenario)


def test_continue_needs_a_scope_a_finished_edition_of_this_book(tmp_path, monkeypatch):
    monkeypatch.setattr(journey, "FakeWorker", ContinueWorker)

    async def scenario(api, worker, book):
        bid = book["id"]
        whole = await _drive(api, bid)  # the whole book
        r = await api.post(f"/books/{bid}/editions", json={"continue_from": whole})
        assert r.status_code == 422 and "needs a scope" in r.json()["detail"]
        r = await api.post(f"/books/{bid}/editions", json={"section_ids": ["s1"], "continue_from": whole})
        assert r.status_code == 422 and "whole book" in r.json()["detail"]
        r = await api.post(f"/books/{bid}/editions", json={"section_ids": ["s1"], "continue_from": "f" * 24})
        assert r.status_code == 404
        r = await api.post(f"/books/{bid}/editions", json={"section_ids": ["s1"], "continue_from": "nope"})
        assert r.status_code in (404, 422)
        # An unfinished part cannot be continued.
        from app.documents import Edition

        part = await _drive(api, bid, {"section_ids": ["s1"]})
        edition = await Edition.get(part)
        edition.status = "failed"
        await edition.save()
        r = await api.post(f"/books/{bid}/editions", json={"section_ids": ["s2"], "continue_from": part})
        assert r.status_code == 422 and "not finished" in r.json()["detail"]

    _run(tmp_path, monkeypatch, scenario)


def test_the_limits_apply_to_the_new_scope(tmp_path, monkeypatch):
    monkeypatch.setattr(journey, "FakeWorker", ContinueWorker)

    async def scenario(api, worker, book):
        bid = book["id"]
        part1 = await _drive(api, bid, {"section_ids": ["s1"]})
        # about 360 words per chapter: two chapters are over the 500-word limit of this test
        r = await api.post(f"/books/{bid}/editions", json={"section_ids": ["s2", "s3"], "continue_from": part1})
        assert r.status_code == 422 and "This selection has" in r.json()["detail"]
        ok = await api.post(f"/books/{bid}/editions", json={"section_ids": ["s2"], "continue_from": part1})
        assert ok.status_code == 200

    _run(tmp_path, monkeypatch, scenario, MAX_SOURCE_WORDS="500")


def test_without_continue_from_nothing_changes(tmp_path, monkeypatch):
    monkeypatch.setattr(journey, "FakeWorker", ContinueWorker)

    async def scenario(api, worker, book):
        bid = book["id"]
        a = await _drive(api, bid, {"section_ids": ["s2"]})
        e = (await api.get(f"/editions/{a}")).json()
        # No prior is sent, the page numbers start at 1 and the edition is its own first part.
        assert worker.priors == [None]
        assert (e["continues_edition_id"], e["first_page_number"], e["understanding_version"]) == (None, 1, None)
        # A second scoped edition without continue_from may repeat a scope and gets no prior (a new understanding).
        b = await _drive(api, bid, {"section_ids": ["s2"]})
        assert worker.priors == [None, None]
        eb = (await api.get(f"/editions/{b}")).json()
        assert eb["understanding_version_produced"] == 2 and eb["continues_edition_id"] is None
        parts = (await api.get(f"/books/{bid}/parts")).json()
        assert [p["part"] for p in parts["parts"]] == [1]  # a series is a chain; b is its own first part

    _run(tmp_path, monkeypatch, scenario)


def test_an_edition_from_before_d38_gets_its_understanding_version_when_continued(tmp_path, monkeypatch):
    monkeypatch.setattr(journey, "FakeWorker", ContinueWorker)

    async def scenario(api, worker, book):
        from app.documents import BookUnderstanding

        bid = book["id"]
        part1 = await _drive(api, bid, {"section_ids": ["s1"]})
        await BookUnderstanding.find_all().delete()  # as if part 1 was made by v0.2: the artifact is there, the row is not
        part2 = await _drive(api, bid, {"section_ids": ["s2"], "continue_from": part1})
        e2 = (await api.get(f"/editions/{part2}")).json()
        assert e2["status"] == "complete" and worker.priors[1]["understanding"]["cast"][0]["id"] == "c_a"
        assert e2["understanding_version"] == 1 and e2["understanding_version_produced"] == 2

    _run(tmp_path, monkeypatch, scenario)


def test_a_failed_continuation_can_be_resumed_with_the_same_prior(tmp_path, monkeypatch):
    """#80 live finding: part 2 failed in the understanding. Resume re-runs it with the same prior, no new 422."""
    monkeypatch.setattr(journey, "FakeWorker", ContinueWorker)

    async def scenario(api, worker, book):
        from app.jobs.runner import claim_job, execute

        bid = book["id"]
        part1 = await _drive(api, bid, {"section_ids": ["s1"]})
        worker.fail_understanding = True  # part 2: the understanding fails
        part2 = await _drive(api, bid, {"section_ids": ["s2"], "continue_from": part1})
        failed = (await api.get(f"/editions/{part2}")).json()
        assert failed["status"] == "failed" and failed["understanding_version_produced"] is None
        tried = len(worker.priors)  # the job may try the understanding more than once before it fails
        assert tried >= 2 and all(p["edition_id"] == part1 for p in worker.priors[1:])

        worker.fail_understanding = False
        resumed = await api.post(f"/editions/{part2}/resume")
        assert resumed.status_code == 200  # no 422: the scope overlaps nothing, and the edition's own scope is not a repeat
        await execute(await claim_job())
        done = (await api.get(f"/editions/{part2}")).json()
        assert done["status"] == "complete"
        # The understanding ran again with the same prior (version 1 of part 1) and the same scope.
        assert len(worker.priors) == tried + 1 and worker.priors[-1] == worker.priors[1]
        assert worker.understanding_inputs[1]["sections"] == ["s2"]  # (the failed request is not recorded by the base worker)
        assert (done["continues_edition_id"], done["understanding_version"], done["understanding_version_produced"]) == (part1, 1, 2)

    _run(tmp_path, monkeypatch, scenario)
