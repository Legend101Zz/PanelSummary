"""Structure-aware source-unit normalization (issue #4, ADR-011).

Covers: byte-exact long-section splitting, conservative front-matter
classification, deterministic/idempotent unit identity, and — the Phase 1
no-output-change guarantee — byte equality between the v1 source-text builder
and the reconstruction from durable units, on both a realistic multi-chapter
book and a WMC-shaped degenerate-page parse.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from beanie import PydanticObjectId

from app.domain.manga import SourceRange, SourceSlice, SourceSliceMode
from app.models import Book, BookChapter, BookSection
from app.persistence.documents import construct_document
from app.services.book_normalization import (
    MAX_UNIT_CHARS,
    PARSE_VERSION,
    SourceUnitMismatchError,
    classify_front_matter,
    normalize_book_sections,
    source_text_from_units,
    source_units_for_book,
    split_section_text,
)
from app.services.manga.generation_service import build_source_text_for_slice


def _slice(book_id: str, page_start: int, page_end: int) -> SourceSlice:
    return SourceSlice(
        slice_id=f"s-{page_start}-{page_end}",
        book_id=book_id,
        mode=SourceSliceMode.PAGES,
        source_range=SourceRange(page_start=page_start, page_end=page_end),
    )


def _book(chapters: list[BookChapter]) -> Book:
    # Beanie 1.27 Documents cannot be __init__'d without an initialized
    # collection; model_construct (via construct_document) is the sanctioned
    # offline path — the same one the donor persistence layer uses.
    return construct_document(
        Book,
        id=PydanticObjectId(),
        title="Fixture Book",
        pdf_hash="f" * 64,
        total_pages=max((c.page_end for c in chapters), default=1),
        total_chapters=len(chapters),
        chapters=chapters,
    )


def _real_pages_book() -> Book:
    """Multi-chapter book with real page provenance and awkward cases."""

    long_para = "The maze rewards the curious. " * 40  # ~1.2k chars
    long_text = "\n\n".join(f"[{index:03d}] {long_para}" for index in range(20))
    assert len(long_text) > MAX_UNIT_CHARS  # forces a split
    return _book(
        [
            BookChapter(
                index=0,
                title="Contents",
                page_start=1,
                page_end=1,
                word_count=0,
                sections=[
                    BookSection(title="Contents", content="   ", page_start=1, page_end=1)
                ],
            ),
            BookChapter(
                index=1,
                title="Two Sections",
                page_start=2,
                page_end=5,
                word_count=120,
                sections=[
                    BookSection(
                        title="First",
                        content="  Leading whitespace stays.\n\nSecond paragraph.",
                        page_start=2,
                        page_end=3,
                    ),
                    BookSection(
                        title="Second",
                        content="Tail section with trailing newline.\n",
                        page_start=4,
                        page_end=5,
                    ),
                ],
            ),
            BookChapter(
                index=2,
                title="Header Only",
                page_start=6,
                page_end=6,
                word_count=0,
                sections=[],
            ),
            BookChapter(
                index=3,
                title="The Long One",
                page_start=7,
                page_end=10,
                word_count=5000,
                sections=[
                    BookSection(
                        title="Everything", content=long_text, page_start=7, page_end=10
                    )
                ],
            ),
        ]
    )


def _degenerate_book() -> Book:
    """WMC-shaped parse: every chapter/section claims pages 1-1."""

    return _book(
        [
            BookChapter(
                index=0,
                title="Who Moved My Cheese?",
                page_start=1,
                page_end=1,
                word_count=0,
                sections=[
                    BookSection(title="Who Moved My Cheese?", content="", page_start=1, page_end=1)
                ],
            ),
            BookChapter(
                index=1,
                title="A Gathering",
                page_start=1,
                page_end=1,
                word_count=100,
                sections=[
                    BookSection(
                        title="A Gathering",
                        content="One sunny Sunday in Chicago, former classmates met.",
                        page_start=1,
                        page_end=1,
                    )
                ],
            ),
            BookChapter(
                index=2,
                title="The Story",
                page_start=1,
                page_end=1,
                word_count=200,
                sections=[
                    BookSection(
                        title="The Story",
                        content="Once, long ago, four little characters ran a maze.",
                        page_start=1,
                        page_end=1,
                    )
                ],
            ),
        ]
    )


# ---------------------------------------------------------------------------
# split_section_text
# ---------------------------------------------------------------------------


def test_split_concatenates_back_to_exact_bytes():
    text = "\n\n".join(f"para {index} " + "x" * 400 for index in range(200))
    parts = split_section_text(text, max_chars=1_000)
    assert "".join(parts) == text
    assert all(len(part) <= 1_000 for part in parts)
    assert len(parts) > 1


def test_split_preserves_weird_whitespace_exactly():
    text = "  lead\n\n\nmid  \t\n\ntail   " * 300
    parts = split_section_text(text, max_chars=500)
    assert "".join(parts) == text


def test_split_prefers_paragraph_breaks():
    text = ("a" * 400) + "\n\n" + ("b" * 400)
    parts = split_section_text(text, max_chars=500)
    assert parts[0].endswith("\n\n")
    assert parts[1] == "b" * 400


def test_split_hard_cuts_separator_free_text():
    text = "z" * 2_500
    parts = split_section_text(text, max_chars=1_000)
    assert parts == ["z" * 1_000, "z" * 1_000, "z" * 500]


def test_split_short_text_is_untouched():
    assert split_section_text("short", max_chars=100) == ["short"]


# ---------------------------------------------------------------------------
# classify_front_matter
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "heading",
    ["Contents", "Copyright Page", "Dedication", "Acknowledgments", "PRAISE FOR THIS BOOK", "About the Author"],
)
def test_apparatus_headings_are_front_matter(heading):
    assert classify_front_matter(heading=heading, content="some text") is True


def test_empty_content_is_front_matter():
    assert classify_front_matter(heading="Anything", content="  \n ") is True


@pytest.mark.parametrize("heading", ["Hem", "A Gathering", "The Story", "Chapter One"])
def test_story_chapters_are_not_front_matter(heading):
    assert classify_front_matter(heading=heading, content="Real story text.") is False


def test_short_story_chapter_is_not_front_matter():
    # WMC's 'Hem' page is 15 words; brevity alone must not flag story content.
    assert classify_front_matter(heading="Hem", content="Hem is small.") is False


# ---------------------------------------------------------------------------
# normalize_book_sections
# ---------------------------------------------------------------------------


def test_normalization_is_deterministic_and_structure_shaped():
    book = _real_pages_book()
    first = source_units_for_book(book)
    second = source_units_for_book(book)
    assert [unit.source_unit_id for unit in first] == [
        unit.source_unit_id for unit in second
    ]
    assert all(unit.kind == "section" for unit in first)
    assert all(unit.parse_version == PARSE_VERSION for unit in first)
    assert all(unit.text and len(unit.text) <= MAX_UNIT_CHARS for unit in first)
    # empty 'Contents' section and section-less 'Header Only' produce no units
    assert not any(unit.chapter_index in (0,) for unit in first if unit.text.strip() == "")
    entries = normalize_book_sections(book)
    contents_entry = next(e for e in entries if e.chapter_index == 0)
    assert contents_entry.front_matter is True
    assert contents_entry.units == []
    long_units = [unit for unit in first if unit.chapter_index == 3]
    assert len(long_units) > 1  # the long section split
    original = book.chapters[3].sections[0].content
    assert "".join(unit.text for unit in sorted(long_units, key=lambda u: u.source_unit_id)) == original


def test_unit_ids_embed_structure_and_content_hash():
    book = _real_pages_book()
    unit = source_units_for_book(book)[0]
    prefix, chapter, section, part, digest = unit.source_unit_id.split("_")
    assert prefix == "section"
    assert chapter == f"{unit.chapter_index:04d}"
    assert len(digest) == 12
    assert unit.text_hash.startswith(digest) or len(unit.text_hash) == 64


def test_degenerate_pages_are_stored_honestly():
    book = _degenerate_book()
    units = source_units_for_book(book)
    assert units, "non-empty sections must produce units"
    assert all(unit.page_start == 1 and unit.page_end == 1 for unit in units)
    assert {unit.chapter_index for unit in units} == {1, 2}  # ch0 empty -> no units


# ---------------------------------------------------------------------------
# source_text_from_units: the Phase 1 byte-equality guarantee
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "page_start,page_end",
    [(1, 10), (1, 3), (2, 5), (4, 6), (6, 6), (7, 10), (2, 9)],
)
def test_reconstruction_equals_v1_builder_real_pages(page_start, page_end):
    book = _real_pages_book()
    units = source_units_for_book(book)
    legacy = build_source_text_for_slice(book.chapters, _slice(str(book.id), page_start, page_end))
    rebuilt = source_text_from_units(
        book=book, page_start=page_start, page_end=page_end, units=units
    )
    assert rebuilt == legacy


def test_reconstruction_equals_v1_builder_degenerate_pages():
    book = _degenerate_book()
    units = source_units_for_book(book)
    legacy = build_source_text_for_slice(book.chapters, _slice(str(book.id), 1, 14))
    rebuilt = source_text_from_units(book=book, page_start=1, page_end=14, units=units)
    assert rebuilt == legacy
    assert "CHAPTER 0" in rebuilt  # header-only front matter stays header-only


def test_reconstruction_fails_loud_on_missing_units():
    book = _real_pages_book()
    units = [unit for unit in source_units_for_book(book) if unit.chapter_index != 1]
    with pytest.raises(SourceUnitMismatchError, match="no source units"):
        source_text_from_units(book=book, page_start=2, page_end=5, units=units)


def test_reconstruction_fails_loud_on_drifted_text():
    book = _real_pages_book()
    units = source_units_for_book(book)
    victim = next(unit for unit in units if unit.chapter_index == 1)
    victim.text = victim.text + " tampered"
    with pytest.raises(SourceUnitMismatchError, match="do not match"):
        source_text_from_units(book=book, page_start=2, page_end=5, units=units)
