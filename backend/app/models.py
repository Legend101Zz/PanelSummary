"""
models.py — MongoDB Document Schemas
=====================================
The PDF-shaped persistence layer.

Two documents live here:
  * :class:`Book` — what we get out of docling for an uploaded PDF.
  * :class:`JobStatus` — Celery task progress, polled by the UI.

The v1 BookSummary / LivingPanelDoc / VideoReelDoc / BookReelMemory
models were deleted in Phase D. The v2 manga generation persistence
(MangaProjectDoc, MangaSliceDoc, MangaPageDoc, MangaAssetDoc) lives
in :mod:`app.manga_models`.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Document, Indexed
from pydantic import BaseModel, Field


# ============================================================
# ENUMS
# ============================================================

class ProcessingStatus(str, Enum):
    PENDING = "pending"          # Job created, not started
    PARSING = "parsing"          # PDF being parsed by docling
    PARSED = "parsed"            # Parsing done, ready for manga generation
    SUMMARIZING = "summarizing"  # v2 understanding pass running
    GENERATING = "generating"    # v2 slice/page pipeline running
    COMPLETE = "complete"
    FAILED = "failed"


class SummaryStyle(str, Enum):
    """Style preset for manga generation. Drives prompt + colour choices."""
    MANGA = "manga"            # Shonen energy, speech bubbles, action panels
    NOIR = "noir"              # Dark, atmospheric, film noir aesthetic
    MINIMALIST = "minimalist"  # Clean, whitespace, scholarly
    COMEDY = "comedy"          # Fun, emoji-heavy, meme energy
    ACADEMIC = "academic"      # Formal, structured, citation-style


# ============================================================
# BOOK SUB-MODELS
# ============================================================

class BookSection(BaseModel):
    """A single section/subsection within a chapter."""
    title: str
    content: str
    page_start: int
    page_end: int
    image_ids: list[str] = []   # Storage paths for images extracted from this section.


class BookChapter(BaseModel):
    """A chapter detected by docling."""
    index: int                  # 0-based
    title: str
    sections: list[BookSection] = []
    page_start: int
    page_end: int
    word_count: int = 0


# ============================================================
# DOCUMENTS
# ============================================================

class Book(Document):
    """A parsed book. Created when a PDF upload completes parsing."""

    # Identification
    title: str
    original_filename: Optional[str] = None
    author: Optional[str] = None
    pdf_hash: Indexed(str, unique=True)  # type: ignore  # SHA-256 for dedup
    pdf_gridfs_id: Optional[str] = None  # legacy field, kept for schema compat

    # Metadata
    total_pages: int = 0
    total_chapters: int = 0
    total_words: int = 0
    cover_image_id: Optional[str] = None  # First page rendered as the cover

    # Content
    chapters: list[BookChapter] = []

    # Status tracking
    status: ProcessingStatus = ProcessingStatus.PENDING
    celery_task_id: Optional[str] = None
    error_message: Optional[str] = None
    parse_progress: int = 0  # 0-100

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "books"


class JobStatus(Document):
    """Progress record for a background Celery task.

    The frontend polls ``/status/{task_id}`` to drive its progress bars.
    Pipeline-level fields (``phase``, ``panels_done`` etc.) are written
    by the v2 manga pipeline as it advances.
    """
    celery_task_id: Indexed(str, unique=True)  # type: ignore
    job_type: str           # "parse_pdf" | "manga_book_understanding" | "manga_slice"
    status: str             # "pending" | "progress" | "success" | "failure"
    progress: int = 0       # 0-100
    message: str = ""       # Human-readable status message
    result_id: Optional[str] = None  # ID of the created Book / MangaProject / MangaSlice
    error: Optional[str] = None

    # Pipeline tracking surfaced in the UI
    phase: Optional[str] = None
    panels_done: int = 0
    panels_total: int = 0
    cost_so_far: float = 0.0
    estimated_total_cost: Optional[float] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "job_statuses"
