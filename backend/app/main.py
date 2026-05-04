"""
main.py — FastAPI Application
================================
HTTP entry points for PanelSummary.

The endpoint surface here is intentionally small: book CRUD, upload,
job-status polling, plus the routers that own everything else
(``jobs``, ``manga_projects``, ``media``). The legacy ``BookSummary``
flow (``/summarize``, ``/summary/{id}``, ``/books/{id}/summaries``,
``DELETE /summaries/{id}``, ``/reels``, ``/video-reels``,
``/living-panels``) was removed in Phase D — the v2 manga pipeline
in :mod:`app.api.routes.manga_projects` is now the only generation
control plane.
"""

import hashlib
import logging
import os
from datetime import datetime
from typing import Optional

from beanie import init_beanie
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

from app.api.routes.jobs import router as jobs_router
from app.api.routes.manga_projects import router as manga_projects_router
from app.api.routes.media import router as media_router
from app.config import get_settings
from app.manga_models import MangaAssetDoc, MangaPageDoc, MangaProjectDoc, MangaSliceDoc
from app.models import Book, JobStatus, ProcessingStatus

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

# ============================================================
# FASTAPI APP SETUP
# ============================================================

app = FastAPI(
    title="PanelSummary API",
    description="Turn any PDF into a manga adaptation",
    version="2.0.0",
    docs_url="/docs",
)

# CORS: the frontend is served from a different origin in dev.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(jobs_router)
app.include_router(manga_projects_router)
app.include_router(media_router)

# MongoDB connection — created once at startup, reused for the process lifetime.
motor_client: AsyncIOMotorClient | None = None


@app.on_event("startup")
async def startup_event() -> None:
    """Initialize MongoDB + Beanie ODM and ensure storage dirs exist."""
    global motor_client
    motor_client = AsyncIOMotorClient(settings.mongodb_url)
    db = motor_client[settings.db_name]

    await init_beanie(
        database=db,
        document_models=[
            Book, JobStatus,
            MangaProjectDoc, MangaSliceDoc, MangaPageDoc, MangaAssetDoc,
        ],
    )

    os.makedirs(settings.upload_dir, exist_ok=True)
    os.makedirs(settings.pdf_dir, exist_ok=True)
    os.makedirs(settings.image_dir, exist_ok=True)

    logger.info("PanelSummary API started!")
    logger.info("API docs available at: http://localhost:8000/docs")


@app.on_event("shutdown")
async def shutdown_event() -> None:
    if motor_client:
        motor_client.close()


# ============================================================
# REQUEST / RESPONSE MODELS
# ============================================================

class UploadResponse(BaseModel):
    book_id: str
    task_id: str
    is_cached: bool
    message: str


class UpdateTitleRequest(BaseModel):
    title: str


class JobStatusResponse(BaseModel):
    task_id: str
    status: str
    progress: int
    message: str
    result_id: Optional[str] = None
    error: Optional[str] = None
    # Pipeline tracking surfaced in the UI's progress bar.
    phase: Optional[str] = None
    panels_done: int = 0
    panels_total: int = 0
    cost_so_far: float = 0.0
    estimated_total_cost: Optional[float] = None


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


# ============================================================
# UPLOAD
# ============================================================

@app.post("/upload", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)) -> UploadResponse:
    """Upload a PDF and dispatch a background parse job.

    Idempotent on the SHA-256 of the file payload: if we've parsed
    this exact PDF before, the cached :class:`Book` is returned and
    no Celery work is queued.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    max_bytes = settings.max_pdf_size_mb * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"PDF too large. Maximum size: {settings.max_pdf_size_mb}MB",
        )

    pdf_hash = hashlib.sha256(content).hexdigest()
    logger.info(
        "Upload received: %s (%dKB, hash: %s...)",
        file.filename, len(content) // 1024, pdf_hash[:16],
    )

    existing_book = await Book.find_one(Book.pdf_hash == pdf_hash)

    if existing_book and existing_book.status == ProcessingStatus.PARSED:
        logger.info("Cache hit! PDF already parsed as book %s", existing_book.id)
        return UploadResponse(
            book_id=str(existing_book.id),
            task_id="cached",
            is_cached=True,
            message=f"PDF already processed! Found '{existing_book.title}'",
        )

    file_path = os.path.join(settings.pdf_dir, f"{pdf_hash}.pdf")
    with open(file_path, "wb") as f:
        f.write(content)

    if existing_book and existing_book.status == ProcessingStatus.FAILED:
        logger.info("Retrying failed book %s", existing_book.id)
        existing_book.status = ProcessingStatus.PENDING
        existing_book.error_message = None
        existing_book.parse_progress = 0
        existing_book.chapters = []
        await existing_book.save()
        book = existing_book
    else:
        clean_name = file.filename.replace(".pdf", "").replace("_", " ").replace("-", " ")
        book = Book(
            title=clean_name,
            original_filename=file.filename,
            pdf_hash=pdf_hash,
            status=ProcessingStatus.PENDING,
        )
        await book.insert()

    from app.celery_worker import parse_pdf_task
    task = parse_pdf_task.delay(str(book.id), file_path)

    job_status = JobStatus(
        celery_task_id=task.id,
        job_type="parse_pdf",
        status="pending",
        progress=0,
        message="Queued for processing...",
    )
    await job_status.insert()

    book.celery_task_id = task.id
    await book.save()

    logger.info("Book %s queued for parsing. Task: %s", book.id, task.id)

    return UploadResponse(
        book_id=str(book.id),
        task_id=task.id,
        is_cached=False,
        message="PDF uploaded! Parsing started in background.",
    )


# ============================================================
# BOOK READS
# ============================================================

@app.get("/books")
async def list_books():
    books = await Book.find_all().sort(-Book.created_at).to_list()
    return [
        {
            "id": str(b.id),
            "title": b.title,
            "author": b.author,
            "status": b.status,
            "total_chapters": b.total_chapters,
            "total_pages": b.total_pages,
            "cover_image_id": b.cover_image_id,
            "created_at": b.created_at.isoformat(),
        }
        for b in books
    ]


@app.get("/books/{book_id}")
async def get_book(book_id: str):
    book = await Book.get(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    return {
        "id": str(book.id),
        "title": book.title,
        "author": book.author,
        "status": book.status,
        "total_chapters": book.total_chapters,
        "total_pages": book.total_pages,
        "total_words": book.total_words,
        "cover_image_id": book.cover_image_id,
        "parse_progress": book.parse_progress,
        "error_message": book.error_message,
        "celery_task_id": book.celery_task_id,
        "chapters": [
            {
                "index": ch.index,
                "title": ch.title,
                "page_start": ch.page_start,
                "page_end": ch.page_end,
                "word_count": ch.word_count,
                "image_count": sum(len(s.image_ids) for s in ch.sections),
            }
            for ch in book.chapters
        ],
        "created_at": book.created_at.isoformat(),
    }


@app.patch("/books/{book_id}")
async def update_book(book_id: str, req: UpdateTitleRequest):
    """Let users rename a book (replaces the ugly hash default title)."""
    book = await Book.get(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    book.title = req.title.strip()
    await book.save()
    return {"id": book_id, "title": book.title}


# ============================================================
# JOB STATUS POLLING
# ============================================================

@app.get("/status/{task_id}", response_model=JobStatusResponse)
async def get_job_status(task_id: str) -> JobStatusResponse:
    if task_id == "cached":
        return JobStatusResponse(
            task_id="cached",
            status="success",
            progress=100,
            message="Loaded from cache",
        )

    job = await JobStatus.find_one(JobStatus.celery_task_id == task_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return JobStatusResponse(
        task_id=task_id,
        status=job.status,
        progress=job.progress,
        message=job.message,
        result_id=job.result_id,
        error=job.error,
        phase=job.phase,
        panels_done=job.panels_done,
        panels_total=job.panels_total,
        cost_so_far=job.cost_so_far,
        estimated_total_cost=job.estimated_total_cost,
    )
