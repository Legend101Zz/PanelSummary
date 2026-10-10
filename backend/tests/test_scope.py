"""Scope cutting and words per PDF page (app.scope). Pure functions: no database, no network."""

from __future__ import annotations

import pytest

from app.scope import ScopeError, page_words, resolve_scope, scope_of

SECTIONS = [
    {"id": "s1", "title": "One", "page_start": 2, "page_end": 3, "word_count": 700, "unit_ids": ["s1u1", "s1u2"]},
    {"id": "s2", "title": "Two", "page_start": 4, "page_end": 6, "word_count": 300, "unit_ids": ["s2u1"]},
]
UNITS = [
    {"id": "s1u1", "section_id": "s1", "page_start": 2, "page_end": 2, "word_count": 400, "text": "a"},
    {"id": "s1u2", "section_id": "s1", "page_start": 3, "page_end": 3, "word_count": 300, "text": "b"},
    {"id": "s2u1", "section_id": "s2", "page_start": 4, "page_end": 6, "word_count": 300, "text": "c"},
]


def test_no_scope_is_the_whole_book():
    r = resolve_scope(SECTIONS, UNITS, 6)
    assert r.scope is None and r.sections == SECTIONS and r.units == UNITS
    assert (r.pdf_pages, r.words) == (6, 1000)


def test_sections_keep_book_order_and_drop_duplicates():
    r = resolve_scope(SECTIONS, UNITS, 6, section_ids=["s2", "s1", "s2"])
    assert r.scope == {"section_ids": ["s1", "s2"]}
    assert [u["id"] for u in r.units] == ["s1u1", "s1u2", "s2u1"]
    one = resolve_scope(SECTIONS, UNITS, 6, section_ids=["s2"])
    assert (one.pdf_pages, one.words, [s["id"] for s in one.sections]) == (3, 300, ["s2"])


def test_a_page_range_takes_the_units_that_overlap_it_and_cuts_the_sections():
    r = resolve_scope(SECTIONS, UNITS, 6, page_from=3, page_to=4)
    assert r.scope == {"pdf_page_from": 3, "pdf_page_to": 4}
    assert [u["id"] for u in r.units] == ["s1u2", "s2u1"]
    assert (r.pdf_pages, r.words) == (2, 600)
    s1 = r.sections[0]
    assert s1["unit_ids"] == ["s1u2"] and (s1["page_start"], s1["page_end"], s1["word_count"]) == (3, 3, 300)
    assert SECTIONS[0]["unit_ids"] == ["s1u1", "s1u2"]  # the stored section is not changed


@pytest.mark.parametrize(
    "kwargs, fragment",
    [
        ({"section_ids": []}, "scope is empty"),
        ({"section_ids": ["nope"]}, "no section 'nope'"),
        ({"page_from": 5, "page_to": 2}, "comes after"),
        ({"page_from": 0, "page_to": 2}, "inside the book"),
        ({"page_from": 1, "page_to": 7}, "pages 1 to 6"),
        ({"page_from": 1}, "both a first page and a last page"),
        ({"page_to": 3}, "both a first page and a last page"),
        ({"section_ids": ["s1"], "page_from": 1, "page_to": 2}, "not both"),
    ],
)
def test_bad_scopes_have_plain_reasons(kwargs, fragment):
    with pytest.raises(ScopeError) as error:
        resolve_scope(SECTIONS, UNITS, 6, **kwargs)
    assert fragment in str(error.value)


def test_a_range_without_text_is_an_empty_scope():
    with pytest.raises(ScopeError) as error:
        resolve_scope(SECTIONS, UNITS, 9, page_from=8, page_to=9)
    assert "no text to adapt" in str(error.value)


def test_scope_round_trips_through_the_stored_form():
    for stored in ({"section_ids": ["s2"]}, {"pdf_page_from": 3, "pdf_page_to": 4}):
        again = resolve_scope(SECTIONS, UNITS, 6, **scope_of(stored))
        assert again.scope == stored
    assert scope_of(None) == {}


def test_page_words_sum_to_the_word_count_and_index_is_page_minus_one():
    words = page_words(UNITS, 7)
    assert len(words) == 7
    assert words[0] == 0 and words[1] == 400 and words[2] == 300  # pages 1, 2, 3
    assert words[3:6] == [100, 100, 100] and words[6] == 0  # the unit on pages 4-6 is spread evenly
    assert sum(words) == sum(u["word_count"] for u in UNITS)
    uneven = page_words([{"page_start": 1, "page_end": 3, "word_count": 10}], 3)
    assert uneven == [4, 3, 3] and sum(uneven) == 10
    assert page_words([], 0) == []
