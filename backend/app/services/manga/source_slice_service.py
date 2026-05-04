"""Source slice planning for incremental manga generation."""

from __future__ import annotations

from typing import Protocol

from app.domain.manga import ContinuityLedger, SourceRange, SourceSlice, SourceSliceMode


class ChapterLike(Protocol):
    index: int
    page_start: int
    page_end: int
    word_count: int


def _overlapping_chapters(chapters: list[ChapterLike], page_start: int, page_end: int) -> list[ChapterLike]:
    return [chapter for chapter in chapters if chapter.page_start <= page_end and chapter.page_end >= page_start]


def _covered_page_end(ledger: ContinuityLedger) -> int:
    page_ends = [source_range.page_end for source_range in ledger.covered_source_ranges if source_range.page_end]
    return max(page_ends, default=0)


def build_page_source_slice(
    *,
    book_id: str,
    chapters: list[ChapterLike],
    page_start: int,
    page_end: int,
    slice_id: str,
) -> SourceSlice:
    """Build a `SourceSlice` for a page window.

    The service infers chapter overlap and whether the slice cuts through a
    chapter. That avoids the current bug-shaped ambiguity where UI says pages
    but backend thinks chapters. Sneaky little gremlin, now caged.
    """
    if page_start < 1:
        raise ValueError("page_start must be >= 1")
    if page_end < page_start:
        raise ValueError("page_end must be >= page_start")

    overlapping = _overlapping_chapters(chapters, page_start, page_end)
    chapter_start = overlapping[0].index if overlapping else None
    chapter_end = overlapping[-1].index if overlapping else None
    word_count = sum(chapter.word_count for chapter in overlapping)

    is_partial_start = bool(overlapping and page_start > overlapping[0].page_start)
    is_partial_end = bool(overlapping and page_end < overlapping[-1].page_end)

    return SourceSlice(
        slice_id=slice_id,
        book_id=book_id,
        mode=SourceSliceMode.PAGES,
        source_range=SourceRange(
            page_start=page_start,
            page_end=page_end,
            chapter_start=chapter_start,
            chapter_end=chapter_end,
        ),
        word_count=word_count,
        is_partial_chapter_start=is_partial_start,
        is_partial_chapter_end=is_partial_end,
    )


def choose_next_page_slice(
    *,
    book_id: str,
    total_pages: int,
    chapters: list[ChapterLike],
    ledger: ContinuityLedger,
    page_window: int = 10,
    slice_number: int | None = None,
) -> SourceSlice | None:
    """Return the next unprocessed page slice, or None when fully covered."""
    if total_pages < 1:
        return None
    if page_window < 1:
        raise ValueError("page_window must be >= 1")

    next_start = _covered_page_end(ledger) + 1
    if next_start > total_pages:
        return None

    next_end = min(total_pages, next_start + page_window - 1)
    if slice_number is None:
        slice_number = len(ledger.covered_source_ranges) + 1

    return build_page_source_slice(
        book_id=book_id,
        chapters=chapters,
        page_start=next_start,
        page_end=next_end,
        slice_id=f"slice_{slice_number:03d}",
    )
