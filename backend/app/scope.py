"""Edition scope (issue #40): draw a part of a book, not all of it.

A scope is one of:
- ``{"section_ids": ["s1", "s3"]}``                    whole sections;
- ``{"pdf_page_from": 3, "pdf_page_to": 40}``          a PDF page range (1-based, inclusive);
- ``None``                                             the whole book (the v0.1 behaviour).

Rules:
- A source unit is in a page range when its pages overlap the range. No text inside the range is
  lost, and a unit is never cut, so the source grounding stays whole. A unit that starts before
  or ends after the range can bring a few words from outside it.
- The numbers of a scope (``pdf_pages``, ``words``) are what the worker would receive. The D19
  limits are checked on these numbers.
- Every reason is plain words. ``ScopeError`` carries them and the API answers 422.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


class ScopeError(ValueError):
    """The scope is not valid. ``str(error)`` is the plain reason."""


@dataclass
class ResolvedScope:
    scope: Optional[dict[str, Any]]  # what is stored on the edition (None = whole book)
    sections: list[dict[str, Any]] = field(default_factory=list)
    units: list[dict[str, Any]] = field(default_factory=list)
    pdf_pages: int = 0
    words: int = 0


def _page_union(spans: list[tuple[int, int]]) -> int:
    """How many distinct PDF pages the spans cover."""
    pages: set[int] = set()
    for start, end in spans:
        pages.update(range(start, end + 1))
    return len(pages)


def resolve_scope(
    sections: list[dict[str, Any]],
    units: list[dict[str, Any]],
    page_count: int,
    *,
    section_ids: Optional[list[str]] = None,
    page_from: Optional[int] = None,
    page_to: Optional[int] = None,
) -> ResolvedScope:
    """Cut the parsed book to a scope. Raises ``ScopeError`` for a scope that cannot be drawn."""
    has_range = page_from is not None or page_to is not None
    if section_ids is not None and has_range:
        raise ScopeError("Choose sections or a page range, not both.")

    if section_ids is None and not has_range:
        return ResolvedScope(
            scope=None,
            sections=sections,
            units=units,
            pdf_pages=page_count,
            words=sum(int(u.get("word_count") or 0) for u in units),
        )

    if section_ids is not None:
        wanted = list(dict.fromkeys(section_ids))
        if not wanted:
            raise ScopeError("The scope is empty. Choose at least one section.")
        known = {s["id"] for s in sections}
        unknown = [sid for sid in wanted if sid not in known]
        if unknown:
            raise ScopeError(f"This book has no section {', '.join(repr(sid) for sid in unknown)}.")
        chosen = [s for s in sections if s["id"] in set(wanted)]  # book order, not request order
        chosen_ids = {s["id"] for s in chosen}
        scoped_units = [u for u in units if u["section_id"] in chosen_ids]
        if not scoped_units:
            raise ScopeError("The scope is empty. The chosen sections have no text.")
        return ResolvedScope(
            scope={"section_ids": [s["id"] for s in chosen]},
            sections=chosen,
            units=scoped_units,
            pdf_pages=_page_union([(int(s["page_start"]), int(s["page_end"])) for s in chosen]),
            words=sum(int(u.get("word_count") or 0) for u in scoped_units),
        )

    if page_from is None or page_to is None:
        raise ScopeError("A page range needs both a first page and a last page.")
    if page_from < 1 or page_to > page_count:
        raise ScopeError(f"The page range must be inside the book: pages 1 to {page_count}.")
    if page_from > page_to:
        raise ScopeError("The first page of the range comes after the last page.")
    scoped_units = [u for u in units if int(u["page_start"]) <= page_to and int(u["page_end"]) >= page_from]
    if not scoped_units:
        raise ScopeError(f"Pages {page_from} to {page_to} have no text to adapt.")
    by_section: dict[str, list[dict[str, Any]]] = {}
    for unit in scoped_units:
        by_section.setdefault(unit["section_id"], []).append(unit)
    cut: list[dict[str, Any]] = []
    for section in sections:
        inside = by_section.get(section["id"])
        if not inside:
            continue
        cut.append(
            {
                **section,
                "page_start": min(int(u["page_start"]) for u in inside),
                "page_end": max(int(u["page_end"]) for u in inside),
                "word_count": sum(int(u.get("word_count") or 0) for u in inside),
                "unit_ids": [u["id"] for u in inside],
            }
        )
    return ResolvedScope(
        scope={"pdf_page_from": page_from, "pdf_page_to": page_to},
        sections=cut,
        units=scoped_units,
        pdf_pages=page_to - page_from + 1,
        words=sum(int(u.get("word_count") or 0) for u in scoped_units),
    )


def scope_of(edition_scope: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Keyword arguments for ``resolve_scope`` from the scope stored on an edition."""
    if not edition_scope:
        return {}
    if "section_ids" in edition_scope:
        return {"section_ids": list(edition_scope["section_ids"])}
    return {"page_from": edition_scope.get("pdf_page_from"), "page_to": edition_scope.get("pdf_page_to")}


def page_words(units: list[dict[str, Any]], page_count: int) -> list[int]:
    """Words per PDF page (index = PDF page - 1), from the source units.

    A unit that sits on one page counts fully on that page. A unit across several pages is spread
    evenly over them (the first pages take the remainder), because the parser keeps the page span
    of a unit, not of each paragraph. The sum is the book's ``word_count``. A page with no body
    text (cover, blank page, title page) is 0.
    """
    out = [0] * max(0, page_count)
    for unit in units:
        start, end = int(unit["page_start"]), int(unit["page_end"])
        words = int(unit.get("word_count") or 0)
        span = [p for p in range(start, end + 1) if 1 <= p <= len(out)]
        if not span:
            continue
        share, extra = divmod(words, len(span))
        for i, p in enumerate(span):
            out[p - 1] += share + (1 if i < extra else 0)
    return out
