"""Export the built-in Andersen sample from a saved v0.1 run database.

This script was used ONCE to make backend/samples/andersen/sample.json.gz. It is kept so
that the sample can be audited and made again. It only READS the source database.

    # a COPY of the v0.1 final-journey MongoDB data, started on its own port
    backend/.venv/bin/python scripts/fixtures/export_sample.py \
        --mongo-url mongodb://127.0.0.1:27270 --db bookreel_v010_final \
        --pdf <the stored PDF> --out backend/samples/andersen

What it removes: absolute paths (pdf_path), and nothing else. All numbers are the measured
values of the real v0.1 run. No model is called.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import shutil
from datetime import datetime
from pathlib import Path

from bson import ObjectId
from pymongo import MongoClient

EDITION_ID = "6ac8bceae6b720cce478a8c2"
BOOK_ID = "6ac8bce6e6b720cce478a8c0"
FORBIDDEN = ("/Users/", "/Volumes/", "localhost", "127.0.0.1")


def plain(value):
    """BSON -> plain JSON: ObjectId -> str, datetime -> ISO 8601 with a time zone."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.replace(tzinfo=value.tzinfo or __import__("datetime").timezone.utc).isoformat()
    if isinstance(value, dict):
        return {k: plain(v) for k, v in value.items()}
    if isinstance(value, list):
        return [plain(v) for v in value]
    return value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mongo-url", required=True)
    parser.add_argument("--db", required=True)
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    db = MongoClient(args.mongo_url)[args.db]
    book = db.library_books.find_one({"_id": ObjectId(BOOK_ID)})
    edition = db.editions.find_one({"_id": ObjectId(EDITION_ID)})
    assert book and edition, "the final-journey book or edition is not in this database"
    assert edition["status"] == "complete" and edition["pages_accepted"] == 18
    pdf_bytes = Path(args.pdf).read_bytes()
    assert hashlib.sha256(pdf_bytes).hexdigest() == book["pdf_hash"], "the PDF does not match the book"

    book.pop("pdf_path")
    sample = {
        "format": 1,
        "id": "andersen",
        "provenance": "v0.1 final-journey run (database bookreel_v010_final), exported unchanged except pdf_path",
        "book": plain(book),
        "book_source": plain(db.book_sources.find_one({"book_id": BOOK_ID})),
        "edition": plain(edition),
        "artifacts": [plain(d) for d in db.edition_artifacts.find({"edition_id": EDITION_ID}).sort("kind", 1)],
        "pages": [plain(d) for d in db.edition_pages.find({"edition_id": EDITION_ID}).sort("page_number", 1)],
        "jobs": [plain(d) for d in db.generation_jobs.find({"book_id": BOOK_ID}).sort("created_at", 1)],
    }
    text = json.dumps(sample, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    for bad in FORBIDDEN:
        assert bad not in text, f"machine-specific text {bad!r} in the export"
    assert not re.search(r"sk-[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{20,}|Bearer\s", text)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    with gzip.GzipFile(out / "sample.json.gz", "wb", mtime=0) as handle:  # mtime=0: the same bytes every time
        handle.write(text.encode("utf-8"))
    shutil.copyfile(args.pdf, out / "andersen-four-tales.pdf")
    manifest = {
        "id": "andersen",
        "title": book["title"],
        "pdf": "andersen-four-tales.pdf",
        "pdf_hash": book["pdf_hash"],
        "edition_understanding_hash": next(a["content_hash"] for a in sample["artifacts"] if a["kind"] == "understanding"),
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"json {len(text):,} bytes -> gz {(out / 'sample.json.gz').stat().st_size:,} bytes; pdf {len(pdf_bytes):,} bytes")


if __name__ == "__main__":
    main()
