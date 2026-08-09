"""v1 build resume mechanism: textless-window skipping, failure
classification, and docling page provenance mapping.

Regression context: a docling parse that stamps every chapter to page 1
made the build loop pick a textless window (pages 9-18 of a 39-page book)
and hard-fail the whole project after slice 1 had already completed.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.celery_manga_tasks import _is_no_text_error, _is_source_covered_error
from app.domain.manga import ContinuityLedger, SourceRange
from app.pdf_parser import _page_from_prov
from app.services.manga.source_slice_service import choose_next_textful_page_slice


class FakeChapter:
    def __init__(self, index: int, page_start: int, page_end: int, word_count: int = 100):
        self.index = index
        self.page_start = page_start
        self.page_end = page_end
        self.word_count = word_count


def _has_text_if_overlaps(chapters):
    def has_text(candidate):
        rng = candidate.source_range
        return any(
            ch.page_start <= rng.page_end and ch.page_end >= rng.page_start
            for ch in chapters
        )

    return has_text


def test_trailing_textless_windows_mean_full_coverage():
    # The exact failure shape: all text within pages 1-8, total_pages 39,
    # slice 1 already covered 1-8. The picker must conclude "fully covered",
    # not fail on the textless window 9-18.
    chapters = [FakeChapter(0, 1, 8)]
    ledger = ContinuityLedger(project_id="p1")
    ledger.add_covered_range(SourceRange(page_start=1, page_end=8, chapter_start=0, chapter_end=0))

    result = choose_next_textful_page_slice(
        book_id="b1",
        total_pages=39,
        chapters=chapters,
        ledger=ledger,
        page_window=10,
        has_text=_has_text_if_overlaps(chapters),
    )

    assert result is None
    assert ledger.covered_source_ranges[-1].page_end == 39


def test_mid_book_textless_gap_is_skipped():
    chapters = [FakeChapter(0, 1, 8), FakeChapter(1, 30, 39)]
    ledger = ContinuityLedger(project_id="p1")
    ledger.add_covered_range(SourceRange(page_start=1, page_end=8, chapter_start=0, chapter_end=0))

    result = choose_next_textful_page_slice(
        book_id="b1",
        total_pages=39,
        chapters=chapters,
        ledger=ledger,
        page_window=10,
        has_text=_has_text_if_overlaps(chapters),
    )

    assert result is not None
    # windows 9-18 and 19-28 were textless and skipped
    assert result.source_range.page_start == 29
    assert result.source_range.page_end == 38


def test_textful_window_returned_immediately_without_ledger_writes():
    chapters = [FakeChapter(0, 1, 39)]
    ledger = ContinuityLedger(project_id="p1")

    result = choose_next_textful_page_slice(
        book_id="b1",
        total_pages=39,
        chapters=chapters,
        ledger=ledger,
        page_window=10,
        has_text=_has_text_if_overlaps(chapters),
    )

    assert result is not None
    assert result.source_range.page_start == 1
    assert ledger.covered_source_ranges == []


def test_error_classification_separates_covered_from_no_text():
    no_text = ValueError("selected source slice has no extractable text")
    covered = ValueError("manga project source is already fully covered")
    assert _is_no_text_error(no_text)
    assert not _is_no_text_error(covered)
    assert _is_source_covered_error(covered)
    assert not _is_source_covered_error(no_text)


class _ProvObj:
    def __init__(self, page_no):
        self.page_no = page_no


def test_page_from_prov_handles_objects_dicts_and_junk():
    assert _page_from_prov([_ProvObj(5)]) == 5
    assert _page_from_prov([{"page_no": 7}]) == 7
    assert _page_from_prov([{"page_no": None}, {"page_no": 3}]) == 3
    assert _page_from_prov([]) == 0
    assert _page_from_prov(None) == 0
    assert _page_from_prov([{"page_no": "not-a-number"}]) == 0
