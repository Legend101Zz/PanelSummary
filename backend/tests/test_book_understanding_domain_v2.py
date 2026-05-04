"""Tests for the v2 book-level understanding domain models.

These artifacts are FROZEN per project after the book-understanding phase. The
contract validators must catch shapes that would silently degrade downstream
manga quality (thin synopses, unordered arcs, mismatched slice counts).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import (
    ArcOutline,
    ArcRole,
    ArcSliceEntry,
    BookSynopsis,
    SliceRole,
    SourceRange,
)


def _valid_synopsis() -> BookSynopsis:
    return BookSynopsis(
        title="Scale Trial",
        author_voice="Pragmatic, plainspoken systems engineer",
        intended_reader="Developers tasked with growing a small system",
        central_thesis="Solutions that work at small scale fail differently at large scale.",
        logline="A reader confronts the hidden cost of scaling and earns a systems view.",
        structural_signal="Three-part essay arc",
        themes=["scaling", "tradeoffs"],
        key_concepts=["Amdahl's law", "p99 latency"],
        emotional_arc=["confidence", "doubt", "clarity"],
        notable_evidence=["Twitter timeline rewrite", "Slack scale story"],
    )


def test_synopsis_requires_substance_beyond_required_strings():
    with pytest.raises(ValueError, match="too thin"):
        BookSynopsis(
            title="Scale Trial",
            central_thesis="Scaling changes everything.",
            logline="A reader earns a systems view.",
        )


def test_synopsis_requires_non_blank_required_fields():
    with pytest.raises(ValueError):
        BookSynopsis(
            title="   ",
            central_thesis="Scaling changes everything.",
            logline="A reader earns a systems view.",
        )


def _valid_arc_entry(slice_number: int, page_start: int, page_end: int) -> ArcSliceEntry:
    return ArcSliceEntry(
        slice_number=slice_number,
        role=ArcRole.KI if slice_number == 1 else ArcRole.SHO,
        suggested_slice_role=SliceRole.OPENING if slice_number == 1 else SliceRole.CONTINUATION,
        source_range=SourceRange(page_start=page_start, page_end=page_end),
        headline_beat=f"Beat for slice {slice_number}",
        emotional_turn="growing concern",
        intellectual_turn="grasping the tradeoff",
        must_cover_fact_ids=[f"f00{slice_number}"],
        closing_hook="What breaks first?",
    )


def test_arc_outline_must_match_target_count():
    with pytest.raises(ValueError, match="entries length must equal target_slice_count"):
        ArcOutline(
            book_id="book_123",
            target_slice_count=2,
            entries=[_valid_arc_entry(1, 1, 10)],
        )


def test_arc_outline_entries_must_be_numbered_sequentially():
    with pytest.raises(ValueError, match="numbered 1..N"):
        ArcOutline(
            book_id="book_123",
            target_slice_count=2,
            entries=[
                _valid_arc_entry(2, 1, 10),
                _valid_arc_entry(1, 11, 20),
            ],
        )


def test_arc_outline_page_starts_must_not_regress():
    with pytest.raises(ValueError, match="page ranges regress"):
        ArcOutline(
            book_id="book_123",
            target_slice_count=2,
            entries=[
                _valid_arc_entry(1, 50, 60),
                _valid_arc_entry(2, 10, 20),
            ],
        )


def test_arc_outline_entry_for_slice_number_round_trip():
    outline = ArcOutline(
        book_id="book_123",
        target_slice_count=3,
        entries=[
            _valid_arc_entry(1, 1, 10),
            _valid_arc_entry(2, 11, 20),
            _valid_arc_entry(3, 21, 30),
        ],
    )

    found = outline.entry_for_slice_number(2)

    assert found is not None
    assert found.source_range.page_start == 11
    assert outline.entry_for_slice_number(99) is None


def test_arc_outline_target_slice_count_clamped_at_24():
    with pytest.raises(ValueError, match="<= 24"):
        ArcOutline(
            book_id="book_123",
            target_slice_count=25,
            entries=[_valid_arc_entry(i, i, i) for i in range(1, 26)],
        )


def test_arc_outline_book_id_required():
    with pytest.raises(ValueError):
        ArcOutline(
            book_id="   ",
            target_slice_count=1,
            entries=[_valid_arc_entry(1, 1, 10)],
        )


def test_synopsis_round_trip_via_model_dump():
    original = _valid_synopsis()
    payload = original.model_dump(mode="json")
    revived = BookSynopsis(**payload)
    assert revived == original
