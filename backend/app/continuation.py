"""Continue with the next section (issue #80, decisions D38 and D39).

A book is drawn in parts. Each part is one edition with a scope. A part may continue an earlier part
(``continue_from``): it reads only its own scope, and it receives the understanding that the earlier
part produced as a prior (data, not instructions), so the cast, the looks and the places stay the same.

This module holds the rules that do not belong to one route:
- the overlap check (a new part must not repeat text that an earlier part of the chain drew);
- the versioned understandings of a book (``book_understandings``);
- the parts of a book as one series, and what remains after the last part.

Every reason is plain words. ``ContinuationError`` carries them and the API answers 422.
"""

from __future__ import annotations

from typing import Any, Optional

from pymongo.errors import DuplicateKeyError

from app.documents import BookUnderstanding, Edition, EditionArtifact
from app.scope import ResolvedScope, ScopeError, resolve_scope, scope_of

# An edition that finished with pages can be continued. Others are still running or stopped early.
CONTINUABLE = ("complete", "completed_with_failures")
MAX_CHAIN = 200


class ContinuationError(ValueError):
    """``continue_from`` cannot be used. ``str(error)`` is the plain reason."""


def _unit_ids(source_sections: list[dict[str, Any]], units: list[dict[str, Any]], page_count: int, scope: Optional[dict[str, Any]]) -> set[str]:
    resolved = resolve_scope(source_sections, units, page_count, **scope_of(scope))
    return {str(u["id"]) for u in resolved.units}


async def chain_of(edition: Edition) -> list[Edition]:
    """The parts of the series that ends at ``edition``, oldest first. Stops at a missing edition."""
    chain = [edition]
    current = edition
    for _ in range(MAX_CHAIN):
        if not current.continues_edition_id:
            break
        earlier = await Edition.get(current.continues_edition_id)
        if earlier is None or any(e.id == earlier.id for e in chain):
            break
        chain.insert(0, earlier)
        current = earlier
    return chain


def overlap_reason(
    chain: list[Edition],
    new_units: list[dict[str, Any]],
    sections: list[dict[str, Any]],
    all_units: list[dict[str, Any]],
    page_count: int,
) -> Optional[str]:
    """Why the new scope repeats an earlier part, or None. The test is on source units, because a unit is never cut."""
    drawn: set[str] = set()
    for part in chain:
        if part.scope is None:
            return "The earlier part drew the whole book. There is nothing left to continue with."
        drawn |= _unit_ids(sections, all_units, page_count, part.scope)
    repeated = [u for u in new_units if str(u["id"]) in drawn]
    if not repeated:
        return None
    titles = {s["id"]: s.get("title") or s["id"] for s in sections}
    where = list(dict.fromkeys(titles.get(u["section_id"], u["section_id"]) for u in repeated))
    named = ", ".join(f"“{t}”" for t in where[:3]) + (f" and {len(where) - 3} more" if len(where) > 3 else "")
    return (
        f"This scope repeats text that an earlier part already drew ({named}). "
        "Choose sections or pages after the earlier part. A part never repeats a drawn scope."
    )


async def understanding_of_edition(edition: Edition) -> Optional[BookUnderstanding]:
    """The stored understanding that ``edition`` produced. An edition made before D38 gets its row now."""
    row = await BookUnderstanding.find_one(BookUnderstanding.edition_id == str(edition.id))
    if row is not None:
        return row
    artifact = await EditionArtifact.find_one(EditionArtifact.edition_id == str(edition.id), EditionArtifact.kind == "understanding")
    if artifact is None:
        return None
    return await store_understanding(edition, artifact.content, prior_version=edition.understanding_version)


async def store_understanding(edition: Edition, content: dict[str, Any], prior_version: Optional[int]) -> BookUnderstanding:
    """Store the understanding of an edition as the next version of its book. One row per edition."""
    existing = await BookUnderstanding.find_one(BookUnderstanding.edition_id == str(edition.id))
    if existing is not None:
        return existing
    for _ in range(5):
        latest = await BookUnderstanding.find(BookUnderstanding.book_id == edition.book_id).sort("-version").first_or_none()
        row = BookUnderstanding(
            book_id=edition.book_id,
            version=(latest.version if latest else 0) + 1,
            understanding=content,
            edition_id=str(edition.id),
            scope=edition.scope,
            prior_version=prior_version,
        )
        try:
            await row.insert()
            return row
        except DuplicateKeyError:
            # Another writer took this version, or this edition's row appeared: read again.
            again = await BookUnderstanding.find_one(BookUnderstanding.edition_id == str(edition.id))
            if again is not None:
                return again
    raise RuntimeError("could not store the understanding version")


async def check_continue(
    earlier: Edition,
    book_id: str,
    resolved: ResolvedScope,
    sections: list[dict[str, Any]],
    all_units: list[dict[str, Any]],
    page_count: int,
) -> tuple[BookUnderstanding, int]:
    """Check ``continue_from`` and return the prior understanding and the first page number of the new part.

    Raises ``ContinuationError`` with a plain reason.
    """
    if earlier.book_id != book_id:
        raise ContinuationError("The edition to continue belongs to another book.")
    if earlier.status not in CONTINUABLE:
        raise ContinuationError("The earlier part has not finished. Continue after it is complete.")
    prior = await understanding_of_edition(earlier)
    if prior is None:
        raise ContinuationError("The earlier part has no stored understanding, so there is no cast to reuse.")
    reason = overlap_reason(await chain_of(earlier), resolved.units, sections, all_units, page_count)
    if reason:
        raise ContinuationError(reason)
    return prior, earlier.first_page_number + earlier.page_total


# --- the parts of a book as one series ---------------------------------------------------------------------


def _scope_section_ids(sections: list[dict[str, Any]], units: list[dict[str, Any]], page_count: int, scope: Optional[dict[str, Any]]) -> list[str]:
    try:
        resolved = resolve_scope(sections, units, page_count, **scope_of(scope))
    except ScopeError:
        return []
    return [s["id"] for s in resolved.sections]


async def parts_view(book_id: str, page_count: int, sections: list[dict[str, Any]], units: list[dict[str, Any]]) -> dict[str, Any]:
    """The parts of the newest series of a book, and what is left after the last part.

    The series is the chain that ends at the newest edition. ``remaining`` lists the sections after the last
    part that no part of the series touched, in book order. ``can_continue`` is true when the newest part is
    finished with pages and something remains.
    """
    newest = await Edition.find(Edition.book_id == book_id).sort("-created_at").first_or_none()
    if newest is None:
        return {"book_id": book_id, "parts": [], "remaining": [], "can_continue": False, "continue_from": None}
    chain = await chain_of(newest)
    titles = {s["id"]: s.get("title") or s["id"] for s in sections}
    parts: list[dict[str, Any]] = []
    touched: set[str] = set()
    used_units: set[str] = set()
    for index, part in enumerate(chain, start=1):
        ids = _scope_section_ids(sections, units, page_count, part.scope)
        touched.update(ids)
        try:
            used_units |= _unit_ids(sections, units, page_count, part.scope)
        except ScopeError:
            pass
        total = part.page_total
        parts.append(
            {
                "part": index,
                "edition_id": str(part.id),
                "status": part.status,
                "scope": part.scope,
                "section_ids": ids,
                "section_titles": [titles.get(i, i) for i in ids],
                "first_page_number": part.first_page_number,
                "last_page_number": part.first_page_number + total - 1 if total > 0 else None,
                "page_total": total,
                "pages_accepted": part.pages_accepted,
                "pages_failed": part.pages_failed,
                "understanding_version": part.understanding_version,
                "understanding_version_produced": part.understanding_version_produced,
            }
        )
    remaining: list[dict[str, Any]] = []
    last_scope_ids = parts[-1]["section_ids"]
    if newest.scope is not None and last_scope_ids:
        order = {s["id"]: i for i, s in enumerate(sections)}
        after = max(order[i] for i in last_scope_ids if i in order)
        for s in sections:
            if order[s["id"]] <= after or s["id"] in touched:
                continue
            if any(str(u["id"]) in used_units for u in units if u["section_id"] == s["id"]):
                continue
            if not any(u["section_id"] == s["id"] for u in units):
                continue  # no text, nothing to draw
            remaining.append(
                {
                    "id": s["id"],
                    "title": s.get("title") or s["id"],
                    "page_start": s["page_start"],
                    "page_end": s["page_end"],
                    "word_count": s.get("word_count", 0),
                }
            )
    can = newest.status in CONTINUABLE and bool(remaining)
    return {"book_id": book_id, "parts": parts, "remaining": remaining, "can_continue": can, "continue_from": str(newest.id) if can else None}
