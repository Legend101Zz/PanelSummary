"""Tests for source slice planning used by incremental manga generation."""

import sys
from dataclasses import dataclass
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import ContinuityLedger, SourceRange
from app.services.manga import build_page_source_slice, choose_next_page_slice


@dataclass
class ChapterStub:
    index: int
    page_start: int
    page_end: int
    word_count: int


CHAPTERS = [
    ChapterStub(index=0, page_start=1, page_end=6, word_count=2500),
    ChapterStub(index=1, page_start=7, page_end=14, word_count=4100),
    ChapterStub(index=2, page_start=15, page_end=20, word_count=3000),
]


def test_build_page_source_slice_maps_overlapping_chapters():
    source_slice = build_page_source_slice(
        book_id="book_123",
        chapters=CHAPTERS,
        page_start=1,
        page_end=10,
        slice_id="slice_001",
    )

    assert source_slice.source_range.page_start == 1
    assert source_slice.source_range.page_end == 10
    assert source_slice.source_range.chapter_start == 0
    assert source_slice.source_range.chapter_end == 1
    assert source_slice.word_count == 6600
    assert source_slice.is_partial_chapter_start is False
    assert source_slice.is_partial_chapter_end is True


def test_build_page_source_slice_detects_partial_start():
    source_slice = build_page_source_slice(
        book_id="book_123",
        chapters=CHAPTERS,
        page_start=9,
        page_end=18,
        slice_id="slice_002",
    )

    assert source_slice.source_range.chapter_start == 1
    assert source_slice.source_range.chapter_end == 2
    assert source_slice.is_partial_chapter_start is True
    assert source_slice.is_partial_chapter_end is True


def test_build_page_source_slice_allows_pages_without_chapter_overlap():
    source_slice = build_page_source_slice(
        book_id="book_123",
        chapters=CHAPTERS,
        page_start=21,
        page_end=25,
        slice_id="slice_999",
    )

    assert source_slice.source_range.chapter_start is None
    assert source_slice.source_range.chapter_end is None
    assert source_slice.word_count == 0


@pytest.mark.parametrize(
    "page_start,page_end",
    [(0, 10), (10, 9)],
)
def test_build_page_source_slice_rejects_bad_windows(page_start, page_end):
    with pytest.raises(ValueError):
        build_page_source_slice(
            book_id="book_123",
            chapters=CHAPTERS,
            page_start=page_start,
            page_end=page_end,
            slice_id="slice_bad",
        )


def test_choose_next_page_slice_starts_at_first_uncovered_page():
    ledger = ContinuityLedger(
        project_id="project_123",
        covered_source_ranges=[SourceRange(page_start=1, page_end=10)],
    )

    source_slice = choose_next_page_slice(
        book_id="book_123",
        total_pages=20,
        chapters=CHAPTERS,
        ledger=ledger,
        page_window=10,
    )

    assert source_slice is not None
    assert source_slice.slice_id == "slice_002"
    assert source_slice.source_range.page_start == 11
    assert source_slice.source_range.page_end == 20


def test_choose_next_page_slice_returns_none_when_covered():
    ledger = ContinuityLedger(
        project_id="project_123",
        covered_source_ranges=[SourceRange(page_start=1, page_end=20)],
    )

    assert choose_next_page_slice(
        book_id="book_123",
        total_pages=20,
        chapters=CHAPTERS,
        ledger=ledger,
    ) is None


def test_choose_next_page_slice_rejects_bad_window_size():
    with pytest.raises(ValueError):
        choose_next_page_slice(
            book_id="book_123",
            total_pages=20,
            chapters=CHAPTERS,
            ledger=ContinuityLedger(project_id="project_123"),
            page_window=0,
        )
