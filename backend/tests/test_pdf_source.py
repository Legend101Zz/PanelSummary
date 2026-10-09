"""PDF → sections and page-true source units (app.sources.pdf_source).

Builds small born-digital PDFs with PyMuPDF, so the test needs no fixture files.
"""

from __future__ import annotations

from pathlib import Path

import fitz
import pytest

from app.sources.pdf_source import PARSER_NAME, NoTextError, _clean, parse_pdf

BODY = 11
HEADING = 20
LEFT, RIGHT = 72, 523


def _paragraph(marker: str, words: int = 90) -> str:
    """A capitalised paragraph that starts with a unique marker word."""
    filler = "the swallow carried a small gold leaf across the cold city at night".split()
    body = [filler[i % len(filler)] for i in range(words - 1)]
    return f"{marker.capitalize()} " + " ".join(body) + "."


def _write_page(doc: fitz.Document, headings: list[str], paragraphs: list[str]) -> None:
    page = doc.new_page(width=595, height=842)
    y = 90.0
    for heading in headings:
        page.insert_text((LEFT, y), heading, fontsize=HEADING)
        y += HEADING * 1.3
    y += 20
    for text in paragraphs:
        rect = fitz.Rect(LEFT, y, RIGHT, y + 200)
        spare = page.insert_textbox(rect, text, fontsize=BODY)
        assert spare >= 0, "test paragraph does not fit its box"
        y += 200 - spare + 24  # a clear gap, so each paragraph is its own text block


def _book(path: Path) -> Path:
    doc = fitz.open()
    # Page 1: title page (large title line, short author line). Not a section.
    page = doc.new_page(width=595, height=842)
    page.insert_text((LEFT, 200), "The Winter Statue", fontsize=28)
    page.insert_text((LEFT, 260), "Jane Example (1901)", fontsize=BODY)
    # Pages 2-3: chapter one, 7 x 90 words: one unit at the 450-word target, then a 180-word unit.
    _write_page(doc, ["Chapter One"], [_paragraph("alpha"), _paragraph("bravo"), _paragraph("charlie")])
    _write_page(doc, [], [_paragraph("delta"), _paragraph("echo"), _paragraph("foxtrot"), _paragraph("golf")])
    # Pages 4-5: chapter two (one unit), with a heading that wraps onto a second line.
    _write_page(doc, ["Chapter Two: The Long Road Home", "Through the Winter Forest"], [_paragraph("hotel"), _paragraph("india")])
    _write_page(doc, [], [_paragraph("juliet")])
    doc.save(path)
    doc.close()
    return path


@pytest.fixture()
def parsed(tmp_path: Path):
    return parse_pdf(_book(tmp_path / "book.pdf"))


def _unit_with(parsed, marker: str):
    return next(unit for unit in parsed.units if marker.capitalize() in unit.text)


def test_title_author_and_page_count(parsed):
    assert parsed.parser == PARSER_NAME
    assert parsed.page_count == 5
    assert parsed.title == "The Winter Statue"
    assert parsed.author == "Jane Example"  # the "(1901)" year is dropped
    assert len(parsed.content_hash) == 64


def test_sections_from_headings(parsed):
    titles = [section.title for section in parsed.sections]
    # The title page is front matter, not a section; the wrapped heading is one title.
    assert titles == ["Chapter One", "Chapter Two: The Long Road Home Through the Winter Forest"]
    one, two = parsed.sections
    assert (one.id, one.page_start, one.page_end) == ("s1", 2, 3)
    assert (two.id, two.page_start, two.page_end) == ("s2", 4, 5)


def test_units_are_bounded_and_carry_real_pages(parsed):
    one, two = parsed.sections
    assert len(one.unit_ids) == 2, "630 words must split into two units"
    assert len(two.unit_ids) == 1
    assert all(unit.id.startswith(unit.section_id) for unit in parsed.units)
    assert [unit.id for unit in parsed.units] == one.unit_ids + two.unit_ids
    for unit in parsed.units:
        assert 120 <= unit.word_count <= 700
        section = next(s for s in parsed.sections if s.id == unit.section_id)
        assert section.page_start <= unit.page_start <= unit.page_end <= section.page_end

    # Every marker is in exactly one unit, whose page range covers the page it was printed on.
    printed_on = {"alpha": 2, "bravo": 2, "charlie": 2, "delta": 3, "echo": 3, "foxtrot": 3, "golf": 3, "hotel": 4, "india": 4, "juliet": 5}
    for marker, page in printed_on.items():
        holders = [unit for unit in parsed.units if marker.capitalize() in unit.text]
        assert len(holders) == 1, marker
        assert holders[0].page_start <= page <= holders[0].page_end, marker
    first, second = (next(u for u in parsed.units if u.id == uid) for uid in one.unit_ids)
    assert (first.page_start, first.page_end, first.word_count) == (2, 3, 450)
    assert (second.page_start, second.page_end, second.word_count) == (3, 3, 180)
    assert _unit_with(parsed, "echo") is first and _unit_with(parsed, "foxtrot") is second
    assert (_unit_with(parsed, "juliet").page_start, _unit_with(parsed, "juliet").page_end) == (4, 5)
    assert parsed.word_count == sum(unit.word_count for unit in parsed.units)
    # No heading or title-page text leaks into the body units.
    assert not any("Chapter" in unit.text or "Jane Example" in unit.text for unit in parsed.units)


def test_metadata_title_and_author_win(tmp_path: Path):
    path = _book(tmp_path / "meta.pdf")
    doc = fitz.open(path)
    doc.set_metadata({"title": "Metadata Title", "author": "Meta Author"})
    doc.saveIncr()
    doc.close()
    parsed = parse_pdf(path)
    assert (parsed.title, parsed.author) == ("Metadata Title", "Meta Author")


def test_blank_pdf_raises_no_text_error(tmp_path: Path):
    path = tmp_path / "blank.pdf"
    doc = fitz.open()
    doc.new_page()
    doc.new_page()
    doc.save(path)
    doc.close()
    with pytest.raises(NoTextError):
        parse_pdf(path)


def test_ligatures_become_plain_letters():
    # Typeset PDFs extract "off" as "o\ufb00"; the lettering fonts have no glyph for it
    # (acceptance run 4 drew a missing-glyph box inside a quote).
    assert _clean("take it o\ufb00 \ufb03ce \ufb04 \ufb01ne \ufb02y") == "take it off ffice ffl fine fly"


def test_planted_failure():
    assert 1 == 2
