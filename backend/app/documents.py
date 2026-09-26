"""MongoDB documents for the harness-driven manga product.

Collections (new names, so an older database's v1 documents never collide):
- library_books      — uploaded PDFs and their parse status
- book_sources       — parsed sections and page-true source units (one per book)
- editions           — one manga adaptation run of a book
- edition_artifacts  — accepted book understanding and adaptation plan
- edition_pages      — one row per planned page; unique (edition_id, page_number)
- generation_jobs    — leased background jobs (parse, generate)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Optional

import pymongo
from beanie import Document
from pydantic import BaseModel, Field


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


BookStatus = Literal["uploaded", "parsing", "parsed", "failed"]
EditionStatus = Literal[
    "queued",
    "understanding",
    "planning",
    "drawing",
    "complete",
    "completed_with_failures",
    "failed",
    "cancelled",
]
PageStatus = Literal["pending", "drawing", "accepted", "failed"]
JobStatus = Literal["queued", "running", "succeeded", "completed_with_failures", "failed", "cancelled"]


class LibraryBook(Document):
    title: str
    author: str = ""
    original_filename: str = ""
    pdf_hash: str
    pdf_path: str
    status: BookStatus = "uploaded"
    error: Optional[str] = None
    page_count: int = 0
    word_count: int = 0
    section_count: int = 0
    parser: str = ""
    parse_job_id: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    class Settings:
        name = "library_books"
        indexes = [pymongo.IndexModel([("pdf_hash", 1)], unique=True)]


class BookSource(Document):
    book_id: str
    parser: str
    content_hash: str
    title: str = ""
    author: str = ""
    page_count: int = 0
    word_count: int = 0
    sections: list[dict[str, Any]] = Field(default_factory=list)
    units: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utcnow)

    class Settings:
        name = "book_sources"
        indexes = [pymongo.IndexModel([("book_id", 1)], unique=True)]


class Totals(BaseModel):
    calls: int = 0
    failed_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    cost_usd: float = 0.0
    model_ms: int = 0


class Edition(Document):
    book_id: str
    status: EditionStatus = "queued"
    job_id: Optional[str] = None
    policy: dict[str, Any] = Field(default_factory=dict)
    understanding_id: Optional[str] = None
    plan_id: Optional[str] = None
    page_total: int = 0
    pages_accepted: int = 0
    pages_failed: int = 0
    coverage: dict[str, Any] = Field(default_factory=dict)
    totals: Totals = Field(default_factory=Totals)
    # Receipts of understanding/plan attempts that did not produce an artifact
    # (failed, timed out or cancelled): their tokens were spent, so they count.
    stage_failures: list[dict[str, Any]] = Field(default_factory=list)
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    finished_at: Optional[datetime] = None

    class Settings:
        name = "editions"
        indexes = [pymongo.IndexModel([("book_id", 1), ("created_at", -1)])]


class EditionArtifact(Document):
    edition_id: str
    kind: Literal["understanding", "plan"]
    schema_id: str
    content: dict[str, Any]
    content_hash: str
    receipt: dict[str, Any]
    created_at: datetime = Field(default_factory=utcnow)

    class Settings:
        name = "edition_artifacts"
        indexes = [pymongo.IndexModel([("edition_id", 1), ("kind", 1)], unique=True)]


class EditionPage(Document):
    edition_id: str
    page_number: int
    section_id: str
    beat: str = ""
    claims: list[str] = Field(default_factory=list)
    units: list[str] = Field(default_factory=list)
    status: PageStatus = "pending"
    attempts: int = 0
    spec: Optional[dict[str, Any]] = None
    svg: Optional[str] = None
    svg_hash: Optional[str] = None
    renderer_version: Optional[str] = None
    panels: list[dict[str, Any]] = Field(default_factory=list)
    texts: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[dict[str, Any]] = Field(default_factory=list)
    receipts: list[dict[str, Any]] = Field(default_factory=list)
    error: Optional[dict[str, Any]] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    class Settings:
        name = "edition_pages"
        indexes = [pymongo.IndexModel([("edition_id", 1), ("page_number", 1)], unique=True)]


class JobEvent(BaseModel):
    at: datetime = Field(default_factory=utcnow)
    stage: str
    message: str


class GenerationJob(Document):
    kind: Literal["parse", "generate"]
    book_id: str
    edition_id: Optional[str] = None
    status: JobStatus = "queued"
    stage: str = "queued"
    done: int = 0
    total: int = 0
    message: str = "Queued"
    error: Optional[str] = None
    cancel_requested: bool = False
    lease_owner: Optional[str] = None
    lease_expires_at: Optional[datetime] = None
    attempts: int = 0
    events: list[JobEvent] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utcnow)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

    class Settings:
        name = "generation_jobs"
        indexes = [
            pymongo.IndexModel([("status", 1), ("created_at", 1)]),
            pymongo.IndexModel([("edition_id", 1)]),
        ]


DOCUMENTS = [LibraryBook, BookSource, Edition, EditionArtifact, EditionPage, GenerationJob]
