"""Normalize a parsed v1 book into durable source units (issue #4).

Usage (from backend/):
    uv run python app/scripts/normalize_source_units.py <book_id> [--dry-run]

Idempotent: unit ids are deterministic (structure position + content hash), and
the repository upsert only rewrites a unit when its text hash changed. Prints a
summary plus a verification that the stored units reproduce the v1 slice text
byte-for-byte over the book's full page span.
"""

import argparse
import asyncio
import sys

from _db import connect  # noqa: E402  (script-local helper)

from bson import ObjectId  # noqa: E402
from bson.errors import InvalidId  # noqa: E402

from app.models import Book  # noqa: E402
from app.persistence.v1_bridge import V1BridgedRepositories  # noqa: E402
from app.services.book_normalization import (  # noqa: E402
    normalize_book_sections,
    source_text_from_units,
)
from app.services.manga.generation_service import build_source_text_for_slice  # noqa: E402
from app.domain.manga import SourceRange, SourceSlice, SourceSliceMode  # noqa: E402


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book_id", help="Mongo _id of the parsed book")
    parser.add_argument("--dry-run", action="store_true", help="report only, no writes")
    args = parser.parse_args()

    await connect()
    try:
        book = await Book.get(ObjectId(args.book_id))
    except (InvalidId, TypeError):
        print(f"ERROR: invalid book id {args.book_id!r}")
        return 2
    if book is None:
        print(f"ERROR: book {args.book_id} not found")
        return 2

    sections = normalize_book_sections(book)
    units = [unit for entry in sections for unit in entry.units]
    front = [entry for entry in sections if entry.front_matter]
    print(f"book: {book.title!r} ({book.total_pages} pages, {len(book.chapters)} chapters)")
    print(f"sections: {len(sections)} | units: {len(units)} | front-matter sections: {len(front)}")
    for entry in front:
        print(
            f"  front-matter: ch[{entry.chapter_index}] "
            f"{' / '.join(entry.heading_path)!r} units={len(entry.units)}"
        )
    oversize = [unit for unit in units if unit.text and len(unit.text) > 19_000]
    if oversize:
        print(f"ERROR: {len(oversize)} unit(s) exceed the split cap — bug")
        return 1

    if args.dry_run:
        print("dry-run: nothing written")
        return 0

    repositories = V1BridgedRepositories()
    before = {u.source_unit_id: u.text_hash for u in await repositories.list_source_units(str(book.id))}
    await repositories.save_source_units(units)
    after = await repositories.list_source_units(str(book.id))
    created = [u.source_unit_id for u in after if u.source_unit_id not in before]
    print(f"persisted: {len(after)} units total | newly created: {len(created)}")

    # Byte-equality verification over the full page span (the Phase 1 guarantee).
    span = SourceSlice(
        slice_id="normalize-verify",
        book_id=str(book.id),
        mode=SourceSliceMode.PAGES,
        source_range=SourceRange(page_start=1, page_end=max(1, book.total_pages)),
    )
    legacy = build_source_text_for_slice(book.chapters, span)
    rebuilt = source_text_from_units(
        book=book, page_start=1, page_end=max(1, book.total_pages), units=after
    )
    if legacy == rebuilt:
        print(f"byte-equality: PASS ({len(legacy)} chars)")
        return 0
    print("byte-equality: FAIL — stored units cannot reproduce v1 slice text")
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
