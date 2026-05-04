"""Tests for the arc-aware slice planner.

The planner is the boundary between the global arc outline (book-level) and a
single per-slice generation run. A bug here would either generate the same
slice twice (wasting cost) or skip a slice entirely (silently losing a beat),
so the contract is pinned tightly.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from types import SimpleNamespace

from app.domain.manga import (
    ArcOutline,
    ArcRole,
    ArcSliceEntry,
    ContinuityLedger,
    SliceRole,
    SourceRange,
)
from app.services.manga.arc_slice_planning_service import (
    choose_next_arc_slice,
    remaining_arc_entries,
    slice_progress_summary,
)


def _chapter(index: int, page_start: int, page_end: int) -> SimpleNamespace:
    """Tiny stand-in for ``BookChapter`` — duck typing keeps the test small.

    We satisfy the ``ChapterLike`` protocol from ``source_slice_service`` so we
    do not have to spin up a full Beanie document just to plan a slice.
    """
    return SimpleNamespace(
        index=index,
        page_start=page_start,
        page_end=page_end,
        word_count=(page_end - page_start + 1) * 250,
    )


def _entry(slice_number: int, page_start: int, page_end: int, role: ArcRole = ArcRole.SHO) -> ArcSliceEntry:
    return ArcSliceEntry(
        slice_number=slice_number,
        role=ArcRole.KI if slice_number == 1 else role,
        suggested_slice_role=SliceRole.OPENING if slice_number == 1 else SliceRole.CONTINUATION,
        source_range=SourceRange(page_start=page_start, page_end=page_end),
        headline_beat=f"Beat for slice {slice_number}",
        emotional_turn="growing concern",
        intellectual_turn="grasping the tradeoff",
        must_cover_fact_ids=[f"f00{slice_number}"],
        closing_hook=f"Hook {slice_number}",
    )


def _outline(*entries: ArcSliceEntry) -> ArcOutline:
    return ArcOutline(
        book_id="book_123",
        target_slice_count=len(entries),
        entries=list(entries),
    )


def _empty_ledger() -> ContinuityLedger:
    return ContinuityLedger(project_id="project_123")


def _ledger_covering(*ranges: tuple[int, int]) -> ContinuityLedger:
    return ContinuityLedger(
        project_id="project_123",
        covered_source_ranges=[
            SourceRange(page_start=start, page_end=end) for start, end in ranges
        ],
    )


def test_planner_returns_first_entry_when_ledger_is_empty():
    outline = _outline(_entry(1, 1, 10), _entry(2, 11, 20), _entry(3, 21, 30))

    plan = choose_next_arc_slice(
        book_id="book_123",
        chapters=[_chapter(0, 1, 30)],
        ledger=_empty_ledger(),
        arc_outline=outline,
    )

    assert plan is not None
    assert plan.arc_entry.slice_number == 1
    # Source slice should carry the arc entry's page range and a stable id.
    assert plan.source_slice.slice_id == "slice_001"
    assert plan.source_slice.source_range.page_start == 1
    assert plan.source_slice.source_range.page_end == 10
    # Slice role is stamped from the arc entry's suggested role.
    assert plan.source_slice.role == SliceRole.OPENING


def test_planner_skips_already_covered_entries():
    outline = _outline(_entry(1, 1, 10), _entry(2, 11, 20), _entry(3, 21, 30))

    plan = choose_next_arc_slice(
        book_id="book_123",
        chapters=[_chapter(0, 1, 30)],
        ledger=_ledger_covering((1, 10), (11, 20)),
        arc_outline=outline,
    )

    assert plan is not None
    assert plan.arc_entry.slice_number == 3


def test_planner_returns_none_when_outline_is_fully_covered():
    outline = _outline(_entry(1, 1, 10), _entry(2, 11, 20))

    plan = choose_next_arc_slice(
        book_id="book_123",
        chapters=[_chapter(0, 1, 20)],
        ledger=_ledger_covering((1, 10), (11, 20)),
        arc_outline=outline,
    )

    assert plan is None


def test_planner_returns_lowest_slice_number_even_when_ledger_skipped_one():
    # Simulate a case where slice 2 was generated but slice 1 was retried and
    # is still missing. The planner must hand back slice 1, not slice 3.
    outline = _outline(_entry(1, 1, 10), _entry(2, 11, 20), _entry(3, 21, 30))

    plan = choose_next_arc_slice(
        book_id="book_123",
        chapters=[_chapter(0, 1, 30)],
        ledger=_ledger_covering((11, 20)),
        arc_outline=outline,
    )

    assert plan is not None
    assert plan.arc_entry.slice_number == 1


def test_planner_rejects_empty_outline():
    with pytest.raises(ValueError, match="arc_outline.entries is empty"):
        choose_next_arc_slice(
            book_id="book_123",
            chapters=[_chapter(0, 1, 10)],
            ledger=_empty_ledger(),
            arc_outline=ArcOutline(
                book_id="book_123",
                target_slice_count=1,
                entries=[_entry(1, 1, 10)],
            ).model_copy(update={"entries": []}),
        )


def test_remaining_arc_entries_in_slice_number_order():
    outline = _outline(_entry(1, 1, 10), _entry(2, 11, 20), _entry(3, 21, 30))

    remaining = remaining_arc_entries(
        arc_outline=outline,
        ledger=_ledger_covering((1, 10)),
    )

    assert [entry.slice_number for entry in remaining] == [2, 3]


def test_slice_progress_summary_reports_counts_and_next():
    outline = _outline(_entry(1, 1, 10), _entry(2, 11, 20), _entry(3, 21, 30))

    summary = slice_progress_summary(
        arc_outline=outline,
        ledger=_ledger_covering((1, 10)),
    )

    assert summary == {
        "total_slices": 3,
        "remaining_slices": 2,
        "completed_slices": 1,
        "next_slice_number": 2,
    }


def test_slice_progress_summary_when_done():
    outline = _outline(_entry(1, 1, 10), _entry(2, 11, 20))

    summary = slice_progress_summary(
        arc_outline=outline,
        ledger=_ledger_covering((1, 10), (11, 20)),
    )

    assert summary["remaining_slices"] == 0
    assert summary["next_slice_number"] == 0
