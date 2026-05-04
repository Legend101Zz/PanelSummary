"""Arc-aware slice planning for incremental manga generation.

Phase 2 swaps the naive ``page_window`` slicer for an arc-driven planner. The
book-understanding phase produces an ``ArcOutline`` whose entries describe
exactly which slice comes next, what role it plays (Ki/Sho/Ten/Ketsu/Recap),
which pages it covers, which facts it must anchor, and what closing hook it
must honour.

This service is the boundary that turns one of those entries into a concrete
``SourceSlice`` ready for the per-slice pipeline. We keep the legacy
``choose_next_page_slice`` available as a fallback so legacy projects without
an arc outline still generate; nothing breaks under us.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.manga import (
    ArcOutline,
    ArcSliceEntry,
    ContinuityLedger,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
)
from app.services.manga.source_slice_service import ChapterLike, build_page_source_slice


@dataclass(frozen=True)
class ArcSlicePlan:
    """The plan for the next per-slice pipeline run.

    Why a wrapper instead of returning ``(SourceSlice, ArcSliceEntry)``:
    callers consume both, and a positional tuple loses meaning two refactors
    later. A tiny dataclass keeps the API self-describing without buying a
    full domain model.
    """

    source_slice: SourceSlice
    arc_entry: ArcSliceEntry


def _highest_covered_slice_number(ledger: ContinuityLedger) -> int:
    """Return the highest slice_number already represented in the ledger.

    The ledger tracks ``covered_source_ranges`` in order of generation. We use
    its length as the natural slice counter so we never assign the same
    slice_number twice even if the user re-runs after a failure.
    """
    return len(ledger.covered_source_ranges)


def _entry_already_covered(entry: ArcSliceEntry, ledger: ContinuityLedger) -> bool:
    """Decide whether the ledger already covers an arc entry's pages.

    We use a generous overlap test: if any covered range starts within the
    entry's page span, the entry is treated as done. This protects us from
    fence-post errors after a slice was generated then a chapter renumbered.
    """
    entry_start = entry.source_range.page_start
    entry_end = entry.source_range.page_end
    if entry_start is None or entry_end is None:
        return False
    for covered in ledger.covered_source_ranges:
        covered_start = covered.page_start
        covered_end = covered.page_end
        if covered_start is None or covered_end is None:
            continue
        if covered_start <= entry_end and covered_end >= entry_start:
            return True
    return False


def _next_uncovered_entry(outline: ArcOutline, ledger: ContinuityLedger) -> ArcSliceEntry | None:
    """Return the lowest-numbered arc entry that has not been generated yet.

    Iterating in slice_number order rather than ledger order means that if the
    user retries a failed Ten slice, we still hand back the same Ten entry
    instead of skipping forward to Ketsu and silently dropping the reveal.
    """
    for entry in sorted(outline.entries, key=lambda item: item.slice_number):
        if not _entry_already_covered(entry, ledger):
            return entry
    return None


def _slice_id_for_entry(entry: ArcSliceEntry) -> str:
    """Stable, sortable slice id derived from the arc entry's slice_number."""
    return f"slice_{entry.slice_number:03d}"


def _source_range_from_entry(entry: ArcSliceEntry) -> tuple[int, int]:
    """Extract the page window from an arc entry, validating loudly.

    Arc entries are required to carry a concrete page range (the schema
    enforces it on construction), but we re-check at the boundary so a
    hand-edited persisted outline cannot crash deep inside a prompt builder.
    """
    page_start = entry.source_range.page_start
    page_end = entry.source_range.page_end
    if page_start is None or page_end is None:
        raise ValueError(
            "arc entry source_range must carry concrete page_start and page_end"
        )
    if page_end < page_start:
        raise ValueError("arc entry source_range page_end must be >= page_start")
    return page_start, page_end


def choose_next_arc_slice(
    *,
    book_id: str,
    chapters: list[ChapterLike],
    ledger: ContinuityLedger,
    arc_outline: ArcOutline,
) -> ArcSlicePlan | None:
    """Return the next arc-driven slice plan, or ``None`` when complete.

    The pipeline preflight guarantees ``arc_outline`` is populated; we still
    guard against an empty outline so a future caller cannot trip a silent
    "no work to do" return on a misconfigured project.
    """
    if not arc_outline.entries:
        raise ValueError("arc_outline.entries is empty; book understanding incomplete")
    next_entry = _next_uncovered_entry(arc_outline, ledger)
    if next_entry is None:
        return None

    page_start, page_end = _source_range_from_entry(next_entry)
    source_slice = build_page_source_slice(
        book_id=book_id,
        chapters=chapters,
        page_start=page_start,
        page_end=page_end,
        slice_id=_slice_id_for_entry(next_entry),
    )
    # Stamp the slice with the arc entry's role so downstream stages can read
    # it without dragging the whole outline through every prompt.
    source_slice = source_slice.model_copy(update={"role": next_entry.suggested_slice_role})
    return ArcSlicePlan(source_slice=source_slice, arc_entry=next_entry)


def remaining_arc_entries(*, arc_outline: ArcOutline, ledger: ContinuityLedger) -> list[ArcSliceEntry]:
    """Return arc entries not yet covered, in slice_number order.

    Useful for UI progress reporting ("3 of 7 slices remaining"). Kept here
    next to ``choose_next_arc_slice`` because the same overlap definition
    governs both.
    """
    return [
        entry
        for entry in sorted(arc_outline.entries, key=lambda item: item.slice_number)
        if not _entry_already_covered(entry, ledger)
    ]


def slice_progress_summary(*, arc_outline: ArcOutline, ledger: ContinuityLedger) -> dict[str, int]:
    """Compact, JSON-friendly progress summary for surfaces that show coverage."""
    remaining = remaining_arc_entries(arc_outline=arc_outline, ledger=ledger)
    total = len(arc_outline.entries)
    return {
        "total_slices": total,
        "remaining_slices": len(remaining),
        "completed_slices": total - len(remaining),
        "next_slice_number": remaining[0].slice_number if remaining else 0,
    }


# ``SourceRange`` and ``SourceSliceMode`` are re-exported so callers building
# fallback slices in tests do not have to reach into the domain package.
__all__ = [
    "ArcSlicePlan",
    "choose_next_arc_slice",
    "remaining_arc_entries",
    "slice_progress_summary",
    "SourceRange",
    "SourceSliceMode",
]
