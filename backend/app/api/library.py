"""Books: upload, list, read, and the source PDF pages the reader links to."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

import fitz
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response

from app.preflight import build_preflight
from app.documents import BookSource, Edition, GenerationJob, LibraryBook, utcnow
from app.scope import ScopeError, page_words, resolve_scope
from app.settings import get_settings

router = APIRouter()

_OBJECT_ID = re.compile(r"^[0-9a-f]{24}$")


def _check_id(value: str) -> str:
    if not _OBJECT_ID.match(value):
        raise HTTPException(status_code=404, detail="Not found")
    return value


async def get_book_or_404(book_id: str) -> LibraryBook:
    book = await LibraryBook.get(_check_id(book_id))
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


def book_view(book: LibraryBook) -> dict:
    return {
        "id": str(book.id),
        "title": book.title,
        "author": book.author,
        "status": book.status,
        "error": book.error,
        "page_count": book.page_count,
        "word_count": book.word_count,
        "section_count": book.section_count,
        "parser": book.parser,
        "parse_job_id": book.parse_job_id,
        "created_at": book.created_at.isoformat(),
    }


@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)) -> dict:
    settings = get_settings()
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    content = await file.read()
    if len(content) > settings.max_pdf_size_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"PDF too large (max {settings.max_pdf_size_mb} MB)")
    if not content.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="That file is not a PDF")

    pdf_hash = hashlib.sha256(content).hexdigest()
    existing = await LibraryBook.find_one(LibraryBook.pdf_hash == pdf_hash)
    if existing is not None and existing.status in ("parsed", "parsing", "uploaded"):
        return {"book": book_view(existing), "job_id": existing.parse_job_id, "cached": True}

    settings.pdf_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = settings.pdf_dir / f"{pdf_hash}.pdf"
    pdf_path.write_bytes(content)

    if existing is None:
        stem = Path(file.filename).stem.replace("_", " ").replace("-", " ").strip()
        existing = LibraryBook(
            title=stem or "Untitled",
            original_filename=file.filename,
            pdf_hash=pdf_hash,
            pdf_path=str(pdf_path),
        )
        await existing.insert()
    job = GenerationJob(kind="parse", book_id=str(existing.id), message="Waiting to read the PDF")
    await job.insert()
    existing.status = "uploaded"
    existing.error = None
    existing.parse_job_id = str(job.id)
    existing.updated_at = utcnow()
    await existing.save()
    return {"book": book_view(existing), "job_id": str(job.id), "cached": False}


@router.get("/books")
async def list_books() -> list[dict]:
    books = await LibraryBook.find_all().sort("-created_at").to_list()
    out = []
    for book in books:
        view = book_view(book)
        latest = await Edition.find(Edition.book_id == str(book.id)).sort("-created_at").first_or_none()
        view["latest_edition"] = (
            {
                "id": str(latest.id),
                "status": latest.status,
                "page_total": latest.page_total,
                "pages_accepted": latest.pages_accepted,
                "pages_failed": latest.pages_failed,
                # Only the code: the shelf band says why the drawing stopped (D11).
                "provider_stop": {"code": latest.provider_stop.get("code")} if latest.provider_stop else None,
            }
            if latest
            else None
        )
        out.append(view)
    return out


@router.get("/books/{book_id}")
async def get_book(book_id: str) -> dict:
    book = await get_book_or_404(book_id)
    view = book_view(book)
    source = await BookSource.find_one(BookSource.book_id == str(book.id))
    view["sections"] = (
        [
            {k: s[k] for k in ("id", "title", "page_start", "page_end", "word_count")}
            for s in source.sections
        ]
        if source
        else []
    )
    # Words per PDF page (index = PDF page - 1), for the page-range meter. See app/scope.py.
    view["page_words"] = page_words(source.units, book.page_count) if source else []
    return view


@router.get("/books/{book_id}/preflight")
async def preflight(
    book_id: str,
    section_ids: str | None = Query(None, description="Comma-separated section ids, for example s1,s2"),
    page_from: int | None = Query(None),
    page_to: int | None = Query(None),
) -> dict:
    """Size, limits and a cost/time range, shown before Generate. No model call, no spend.

    With ``section_ids`` or ``page_from`` and ``page_to`` the numbers are those of that scope
    (D19: the limits apply to the scope). Without them the numbers are those of the whole book.
    """
    book = await get_book_or_404(book_id)
    if book.status != "parsed":
        raise HTTPException(status_code=409, detail="The book is not parsed yet, so it cannot be measured")
    if section_ids is None and page_from is None and page_to is None:
        return build_preflight(str(book.id), book.page_count, book.word_count, book.section_count, get_settings())
    source = await BookSource.find_one(BookSource.book_id == str(book.id))
    if source is None:
        raise HTTPException(status_code=409, detail="The book has no parsed text, so it cannot be measured")
    ids = [part.strip() for part in section_ids.split(",") if part.strip()] if section_ids is not None else None
    try:
        resolved = resolve_scope(source.sections, source.units, book.page_count, section_ids=ids, page_from=page_from, page_to=page_to)
    except ScopeError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return build_preflight(
        str(book.id), resolved.pdf_pages, resolved.words, len(resolved.sections), get_settings(), scope=resolved.scope
    )


def _pdf_path(book: LibraryBook) -> Path:
    path = Path(book.pdf_path)
    settings = get_settings()
    # Only ever serve PDFs stored by upload, never an arbitrary path.
    if path.parent.resolve() != settings.pdf_dir.resolve() or not path.is_file():
        raise HTTPException(status_code=404, detail="PDF not found")
    return path


@router.get("/books/{book_id}/pdf/info")
async def pdf_info(book_id: str) -> dict:
    book = await get_book_or_404(book_id)
    with fitz.open(_pdf_path(book)) as doc:
        total = doc.page_count
    return {"book_id": book_id, "title": book.title, "total_pages": total}


@router.get("/books/{book_id}/pdf/page/{page_num}")
async def pdf_page(book_id: str, page_num: int, scale: float = 2.0):
    if page_num < 1 or not (0.5 <= scale <= 3.0):
        raise HTTPException(status_code=400, detail="Bad page or scale")
    book = await get_book_or_404(book_id)
    settings = get_settings()
    cache = settings.cache_dir / str(book.id) / f"page-{page_num}-{scale:.1f}.png"
    if cache.is_file():
        return FileResponse(cache, media_type="image/png", headers={"Cache-Control": "public, max-age=604800"})
    with fitz.open(_pdf_path(book)) as doc:
        if page_num > doc.page_count:
            raise HTTPException(status_code=404, detail="Page out of range")
        png = doc[page_num - 1].get_pixmap(matrix=fitz.Matrix(scale, scale)).tobytes("png")
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_bytes(png)
    return Response(png, media_type="image/png", headers={"Cache-Control": "public, max-age=604800"})
