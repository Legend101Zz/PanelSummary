"""Parse job: PDF → sections + page-true source units (idempotent per book)."""

from __future__ import annotations

import asyncio

from app.documents import BookSource, LibraryBook, utcnow
from app.jobs.runner import JobContext
from app.sources.pdf_source import NoTextError, parse_pdf


async def run_parse_job(ctx: JobContext) -> tuple[str, str]:
    book = await LibraryBook.get(ctx.job.book_id)
    if book is None:
        raise RuntimeError(f"book {ctx.job.book_id} not found")
    existing = await BookSource.find_one(BookSource.book_id == str(book.id))
    if existing is not None and book.status == "parsed":
        return "succeeded", "Already parsed"

    book.status = "parsing"
    book.updated_at = utcnow()
    await book.save()
    await ctx.event("parsing", "Reading the PDF")
    try:
        parsed = await asyncio.to_thread(parse_pdf, book.pdf_path)
    except NoTextError as error:
        book.status = "failed"
        book.error = str(error)
        book.updated_at = utcnow()
        await book.save()
        return "failed", str(error)

    data = parsed.to_dict()
    if existing is None:
        existing = BookSource(book_id=str(book.id), parser=parsed.parser, content_hash=parsed.content_hash)
    existing.parser = parsed.parser
    existing.content_hash = parsed.content_hash
    existing.title = parsed.title
    existing.author = parsed.author
    existing.page_count = parsed.page_count
    existing.word_count = parsed.word_count
    existing.sections = data["sections"]
    existing.units = data["units"]
    await existing.save()

    if parsed.title:
        book.title = parsed.title
    book.author = parsed.author or book.author
    book.page_count = parsed.page_count
    book.word_count = parsed.word_count
    book.section_count = len(parsed.sections)
    book.parser = parsed.parser
    book.status = "parsed"
    book.error = None
    book.updated_at = utcnow()
    await book.save()
    message = f"Parsed {parsed.page_count} pages into {len(parsed.sections)} sections and {len(parsed.units)} source units"
    await ctx.event("parsed", message)
    return "succeeded", message
