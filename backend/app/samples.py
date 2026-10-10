"""Built-in sample editions (S2).

A sample is a finished edition from a real run, stored in the repository. Installing it
puts a book and its edition into the database, exactly as a normal run would have. It makes
no worker call and spends nothing. See docs/v0.2/S2-sample-and-fixtures.md.

Installing is idempotent: the book is found by ``pdf_hash`` (it has a unique index) and the
edition by the content hash of its book-understanding artifact.
"""

from __future__ import annotations

import gzip
import json
from datetime import datetime
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from beanie import PydanticObjectId
from pymongo.errors import DuplicateKeyError

from app.documents import BookSource, Edition, EditionArtifact, EditionPage, GenerationJob, LibraryBook, utcnow
from app.preflight import build_preflight
from app.settings import get_settings

SAMPLES_DIR = Path(__file__).resolve().parents[1] / "samples"


@dataclass(frozen=True)
class SampleInfo:
    id: str
    title: str
    pdf_hash: str
    pdf: str
    understanding_hash: str
    directory: Path


def _load(sample_id: str) -> dict[str, Any]:
    """The whole sample (about 6 MB as JSON). Read on install only, never kept in memory."""
    with gzip.open(SAMPLES_DIR / sample_id / "sample.json.gz", "rb") as handle:
        return json.loads(handle.read().decode("utf-8"))


def list_sample_ids() -> list[str]:
    return sorted(p.name for p in SAMPLES_DIR.iterdir() if (p / "manifest.json").is_file())


@lru_cache(maxsize=None)
def sample_info(sample_id: str) -> SampleInfo | None:
    if sample_id not in list_sample_ids():
        return None
    manifest = json.loads((SAMPLES_DIR / sample_id / "manifest.json").read_text(encoding="utf-8"))
    return SampleInfo(
        sample_id,
        manifest["title"],
        manifest["pdf_hash"],
        manifest["pdf"],
        manifest["edition_understanding_hash"],
        SAMPLES_DIR / sample_id,
    )


@lru_cache(maxsize=None)
def sample_hashes() -> frozenset[str]:
    """The ``pdf_hash`` of every sample book: a book with one of these is shown as a sample."""
    return frozenset(info.pdf_hash for info in (sample_info(i) for i in list_sample_ids()) if info)


def _drop(doc: dict[str, Any], *keys: str) -> dict[str, Any]:
    return {k: v for k, v in doc.items() if k not in keys}


async def _find_sample_edition(book_id: str, understanding_hash: str) -> Edition | None:
    editions = await Edition.find(Edition.book_id == book_id).to_list()
    for edition in editions:
        artifact = await EditionArtifact.find_one(
            EditionArtifact.edition_id == str(edition.id), EditionArtifact.kind == "understanding"
        )
        if artifact is not None and artifact.content_hash == understanding_hash:
            return edition
    return None


async def installed_state(sample_id: str) -> dict[str, Any]:
    info = sample_info(sample_id)
    assert info is not None
    book = await LibraryBook.find_one(LibraryBook.pdf_hash == info.pdf_hash)
    if book is None:
        return {"installed": False}
    edition = await _find_sample_edition(str(book.id), info.understanding_hash)
    if edition is None:
        return {"installed": False}
    return {"installed": True, "book_id": str(book.id), "edition_id": str(edition.id)}


async def install_sample(sample_id: str) -> dict[str, str]:
    """Insert the sample once. Returns ``{book_id, edition_id}``. No worker call, no spend."""
    info = sample_info(sample_id)
    if info is None:
        raise KeyError(sample_id)
    state = await installed_state(sample_id)
    if state["installed"]:
        return {"book_id": state["book_id"], "edition_id": state["edition_id"]}

    data = _load(sample_id)
    settings = get_settings()

    # The PDF goes to the configured storage directory, named by its hash like an upload.
    settings.pdf_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = settings.pdf_dir / f"{info.pdf_hash}.pdf"
    if not pdf_path.is_file():
        tmp = pdf_path.with_suffix(".pdf.part")
        tmp.write_bytes((info.directory / info.pdf).read_bytes())
        tmp.replace(pdf_path)

    # The book: reuse one that exists for this PDF (the user may have uploaded it), else insert.
    book_doc = _drop(data["book"], "_id", "created_at", "updated_at", "parse_job_id")
    book = await LibraryBook.find_one(LibraryBook.pdf_hash == info.pdf_hash)
    if book is None:
        book = LibraryBook(**book_doc, pdf_path=str(pdf_path), created_at=utcnow(), updated_at=utcnow())
        try:
            await book.insert()
        except DuplicateKeyError:  # a second request won the race
            book = await LibraryBook.find_one(LibraryBook.pdf_hash == info.pdf_hash)
            assert book is not None
    else:
        for key, value in book_doc.items():
            setattr(book, key, value)
        book.pdf_path = str(pdf_path)
        book.updated_at = utcnow()
        await book.save()
    book_id = str(book.id)

    # The source: ids inside units and sections are local ("s1u1"), so it is copied unchanged.
    source = await BookSource.find_one(BookSource.book_id == book_id)
    source_doc = _drop(data["book_source"], "_id", "book_id")
    if source is None:
        await BookSource(book_id=book_id, **source_doc).insert()
    else:
        for key, value in source_doc.items():
            setattr(source, key, value)
        await source.save()

    # A second request may have inserted the edition while this one worked.
    existing = await _find_sample_edition(book_id, info.understanding_hash)
    if existing is not None:
        return {"book_id": book_id, "edition_id": str(existing.id)}

    edition_new_id = PydanticObjectId()
    edition_id = str(edition_new_id)
    artifact_ids = {a["kind"]: PydanticObjectId() for a in data["artifacts"]}
    for artifact in data["artifacts"]:
        await EditionArtifact(
            id=artifact_ids[artifact["kind"]], edition_id=edition_id, **_drop(artifact, "_id", "edition_id")
        ).insert()
    for page in data["pages"]:
        await EditionPage(edition_id=edition_id, **_drop(page, "_id", "edition_id")).insert()

    # Jobs keep their finished state; none is queued, so no runner ever picks one up.
    job_ids: dict[str, str] = {}
    for job in data["jobs"]:
        fresh = PydanticObjectId()
        job_ids[job["_id"]] = str(fresh)
        is_generate = job["kind"] == "generate"
        await GenerationJob(
            id=fresh,
            book_id=book_id,
            edition_id=edition_id if is_generate else None,
            **_drop(job, "_id", "book_id", "edition_id"),
        ).insert()
        if not is_generate and book.parse_job_id is None:
            book.parse_job_id = str(fresh)
            await book.save()

    edition_doc = _drop(data["edition"], "_id", "book_id", "job_id", "understanding_id", "plan_id")
    await Edition(
        id=edition_new_id,
        book_id=book_id,
        job_id=job_ids.get(data["edition"]["job_id"]),
        understanding_id=str(artifact_ids["understanding"]),
        plan_id=str(artifact_ids["plan"]),
        **edition_doc,
    ).insert()
    return {"book_id": book_id, "edition_id": edition_id}


# --- the read-only preview (U1) ---


def _seconds(start: str | None, end: str | None) -> float | None:
    if not start or not end:
        return None
    value = (datetime.fromisoformat(end) - datetime.fromisoformat(start)).total_seconds()
    return round(value, 3) if value >= 0 else None


def preview(sample_id: str) -> dict[str, Any] | None:
    """The package part (cached) plus the estimate, which follows the current settings."""
    base = _preview_base(sample_id)
    if base is None:
        return None
    out = dict(base)
    pre = build_preflight(sample_id, out["pdf_pages"], out.pop("_words"), out["sections"], get_settings())
    out["estimate"] = {key: pre[key] for key in ("estimated_manga_pages", "estimated_minutes", "estimated_cost_usd")}
    return out


@lru_cache(maxsize=None)
def _preview_base(sample_id: str) -> dict[str, Any] | None:
    """What the first run and the landing show, read from the package. No database, no write, no model call.

    Every number is computed the way the installed edition's API would give it, so the screens
    show the same value before and after install. The result is small (page 1 and three more pages);
    the 6 MB package itself is not kept in memory.
    """
    info = sample_info(sample_id)
    if info is None:
        return None
    data = _load(sample_id)
    book, edition = data["book"], data["edition"]
    timings = edition.get("timings") or {}
    started = timings.get("generate_started_at") or edition["created_at"]
    first = timings.get("page_1_at") or timings.get("first_page_at")
    total = edition.get("active_seconds") or _seconds(edition["created_at"], edition.get("finished_at"))
    pages = {p["page_number"]: p for p in data["pages"]}
    page1 = pages[1]
    panels = sorted(page1["panels"], key=lambda p: p["order"])
    shown = panels[1] if len(panels) > 1 else panels[0]
    sources = next((p.get("source", []) for p in (page1.get("spec") or {}).get("panels", []) if p.get("id") == shown["id"]), [])
    understanding = next((a for a in data["artifacts"] if a["kind"] == "understanding"), None)
    cast = {c["id"]: c.get("name", c["id"]) for c in ((understanding or {}).get("content", {}).get("cast", []))}
    return {
        "id": sample_id,
        "title": info.title,
        "author": book.get("author", ""),
        "pdf_pages": book["page_count"],
        "sections": book["section_count"],
        "page_total": edition["page_total"],
        "pages_accepted": edition["pages_accepted"],
        "timings": {
            "created_to_first_page_seconds": _seconds(edition["created_at"], first),
            "created_to_finished_seconds": _seconds(edition["created_at"], edition.get("finished_at")),
            "first_page_seconds": _seconds(started, first),
            "first_is_page_1": bool(timings.get("page_1_at")),
            "total_seconds": total,
        },
        "cost_usd": edition["totals"]["cost_usd"],
        "_words": book["word_count"],
        "cover_svg": page1["svg"],
        "hero": {"page": 13, "svg": pages[13]["svg"]} if 13 in pages and pages[13]["status"] == "accepted" else None,
        "thumbs": [{"page": n, "svg": pages[n]["svg"]} for n in (13, 17, 18) if n in pages and pages[n]["status"] == "accepted"],
        "proof": {
            "page": 1,
            "panel": {"id": shown["id"], "order": shown["order"], "bbox": shown["bbox"]},
            "texts": [
                {"panel": t["panel"], "index": t["index"], "kind": t["kind"], "speaker": t.get("speaker"), "text": t["text"], "fidelity": t["fidelity"]}
                for t in page1["texts"]
                if t["panel"] == shown["id"]
            ],
            "speakers": {t["speaker"]: cast.get(t["speaker"], "") for t in page1["texts"] if t.get("speaker")},
            "source_pdf_pages": sorted({s["page"] for s in sources}),
        },
    }


def render_pdf_page(sample_id: str, page_num: int, scale: float = 2.0) -> bytes | None:
    """A PNG of one page of the sample's PDF, straight from the package. Writes nothing."""
    import fitz

    info = sample_info(sample_id)
    if info is None:
        return None
    with fitz.open(info.directory / info.pdf) as doc:
        if page_num < 1 or page_num > doc.page_count:
            return None
        return doc[page_num - 1].get_pixmap(matrix=fitz.Matrix(scale, scale)).tobytes("png")
