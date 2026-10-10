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
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from beanie import PydanticObjectId
from pymongo.errors import DuplicateKeyError

from app.documents import BookSource, Edition, EditionArtifact, EditionPage, GenerationJob, LibraryBook, utcnow
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
