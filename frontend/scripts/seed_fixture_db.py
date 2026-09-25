"""Database side of the frontend fixture seed (see seed-fixture.ts).

Run with the backend venv, never directly against a real database:

    backend/.venv/bin/python frontend/scripts/seed_fixture_db.py parse <pdf>
        -> prints {"source": ParsedSource, "page_texts": [...]} as JSON

    backend/.venv/bin/python frontend/scripts/seed_fixture_db.py insert < docs.json
        -> wipes and fills the disposable fixture database

The target is hard-wired to the disposable MongoDB on 127.0.0.1:27018 and the
database "ps_frontend_fixture". Any other MONGODB_URL / DB_NAME is refused.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

FIXTURE_URL = "mongodb://127.0.0.1:27018"
FIXTURE_DB = "ps_frontend_fixture"
BACKEND = Path(__file__).resolve().parents[2] / "backend"
COLLECTIONS = [
    "library_books",
    "book_sources",
    "editions",
    "edition_artifacts",
    "edition_pages",
    "generation_jobs",
]


def parse(pdf: str) -> None:
    sys.path.insert(0, str(BACKEND))
    import fitz  # noqa: PLC0415 — only needed for this command

    from app.sources.pdf_source import parse_pdf  # noqa: PLC0415

    parsed = parse_pdf(pdf).to_dict()
    with fitz.open(pdf) as doc:
        page_texts = [page.get_text() for page in doc]
    json.dump({"source": parsed, "page_texts": page_texts}, sys.stdout)


def _dates(value, now: datetime):
    """Turn {"$ago": seconds} / {"$ahead": seconds} markers into datetimes."""
    if isinstance(value, dict):
        if set(value) == {"$ago"}:
            return now - timedelta(seconds=float(value["$ago"]))
        if set(value) == {"$ahead"}:
            return now + timedelta(seconds=float(value["$ahead"]))
        return {k: _dates(v, now) for k, v in value.items()}
    if isinstance(value, list):
        return [_dates(v, now) for v in value]
    return value


def insert(payload: dict) -> None:
    import os

    from bson import ObjectId
    from pymongo import MongoClient

    url = os.environ.get("MONGODB_URL", FIXTURE_URL)
    name = os.environ.get("DB_NAME", FIXTURE_DB)
    if url.rstrip("/") != FIXTURE_URL or name != FIXTURE_DB:
        raise SystemExit(f"refusing to seed {url}/{name}: only {FIXTURE_URL}/{FIXTURE_DB} is allowed")

    storage = Path(payload["storage_dir"]).resolve()
    pdf_dir = storage / "pdfs"
    pdf_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.now(timezone.utc)
    client = MongoClient(url, tz_aware=True)
    db = client[name]
    for collection in COLLECTIONS:
        db[collection].delete_many({})

    counts: dict[str, int] = {}
    for book in payload["books"]:
        pdf = Path(book.pop("pdf_source"))
        raw = pdf.read_bytes()
        pdf_hash = hashlib.sha256(raw).hexdigest()
        target = pdf_dir / f"{pdf_hash}.pdf"
        if not target.exists():
            shutil.copyfile(pdf, target)
        book["doc"].update({"pdf_hash": pdf_hash, "pdf_path": str(target)})

    def put(collection: str, doc: dict) -> None:
        doc = _dates(doc, now)
        doc["_id"] = ObjectId(doc.pop("_id"))
        db[collection].insert_one(doc)
        counts[collection] = counts.get(collection, 0) + 1

    for book in payload["books"]:
        put("library_books", book["doc"])
        if book.get("source"):
            put("book_sources", book["source"])
    for collection in ("generation_jobs", "editions", "edition_artifacts", "edition_pages"):
        for doc in payload.get(collection, []):
            put(collection, doc)

    json.dump({"db": f"{url}/{name}", "storage_dir": str(storage), "inserted": counts}, sys.stdout)
    client.close()


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "parse" and len(sys.argv) == 3:
        parse(sys.argv[2])
    elif command == "insert":
        insert(json.load(sys.stdin))
    else:
        raise SystemExit(__doc__)
