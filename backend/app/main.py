"""
main.py — FastAPI Application
================================
All HTTP endpoints for PanelSummary.

ENDPOINTS:
  POST /upload          — Upload a PDF
  GET  /books           — List all books
  GET  /books/{id}      — Get book details
  POST /books/{id}/summarize — Start summarization
  GET  /status/{task_id}    — Poll job progress
  GET  /summary/{id}        — Get summary (manga + reels)
  GET  /images/{id}         — Serve GridFS images
  GET  /health              — Health check

WHY FastAPI: Automatic API docs at /docs, type validation,
async support, and it's blazing fast.
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
from app.api.routes.living_panels import router as living_panels_router
from app.api.routes.manga_projects import router as manga_projects_router
from app.api.routes.media import router as media_router
from app.api.routes.reels import router as reels_router
from app.config import get_settings
from app.manga_models import MangaAssetDoc, MangaPageDoc, MangaProjectDoc, MangaSliceDoc
from app.models import (
    Book, BookSummary, LivingPanelDoc, JobStatus, ProcessingStatus, SummaryStyle,
    VideoReelDoc, BookReelMemory,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

# ============================================================
# FASTAPI APP SETUP
# ============================================================

app = FastAPI(
    title="PanelSummary API",
    description="Turn any PDF into manga panels and lesson reels",
    version="1.0.0",
    docs_url="/docs",  # Auto-generated API docs at localhost:8000/docs
)

# CORS: Allow the frontend to call our API
# WHY: Browsers block cross-origin requests by default
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(jobs_router)
app.include_router(living_panels_router)
app.include_router(manga_projects_router)
app.include_router(media_router)
app.include_router(reels_router)

# MongoDB connection (created once at startup)
motor_client: AsyncIOMotorClient = None


@app.on_event("startup")
async def startup_event():
    """
    Called when FastAPI starts.
    Initializes MongoDB connection and Beanie ODM.
    """
    global motor_client
    motor_client = AsyncIOMotorClient(settings.mongodb_url)
    db = motor_client[settings.db_name]

    await init_beanie(
        database=db,
        document_models=[
            Book, BookSummary, LivingPanelDoc, JobStatus,
            VideoReelDoc, BookReelMemory,
            MangaProjectDoc, MangaSliceDoc, MangaPageDoc, MangaAssetDoc,
        ],
    )

    os.makedirs(settings.upload_dir, exist_ok=True)
    os.makedirs(settings.pdf_dir, exist_ok=True)
    os.makedirs(settings.image_dir, exist_ok=True)
    os.makedirs(settings.reels_dir, exist_ok=True)

    logger.info("PanelSummary API started!")
    logger.info(f"API docs available at: http://localhost:8000/docs")


@app.on_event("shutdown")
async def shutdown_event():
    """Close MongoDB connection when app shuts down"""
    if motor_client:
        motor_client.close()


class UploadResponse(BaseModel):
    book_id: str
    task_id: str
    is_cached: bool  # True if this PDF was already parsed
    message: str


class SummarizeRequest(BaseModel):
    api_key: str                        # User's OpenAI or OpenRouter key
    provider: str = "openrouter"        # "openai" or "openrouter"
    model: Optional[str] = None         # specific LLM model ID
    style: str = "manga"
    chapter_range: Optional[list[int]] = None   # [start_idx, end_idx] inclusive, None=all
    generate_images: bool = False       # run AI image gen per panel (costs extra)
    image_model: Optional[str] = None  # image generation model (defaults to cheapest)
    engine: str = "v2"                 # "v2" (verbose DSL) or "v4" (semantic intent)


class UpdateTitleRequest(BaseModel):
    title: str


class SummarizeResponse(BaseModel):
    summary_id: str
    task_id: str
    message: str


class JobStatusResponse(BaseModel):
    task_id: str
    status: str
    progress: int
    message: str
    result_id: Optional[str] = None
    error: Optional[str] = None
    # Pipeline tracking
    phase: Optional[str] = None
    panels_done: int = 0
    panels_total: int = 0
    cost_so_far: float = 0.0
    estimated_total_cost: Optional[float] = None
    reel_cost: Optional[dict] = None  # {input_tokens, output_tokens, estimated_cost_usd}


@app.get("/health")
async def health_check():
    """
    Health check endpoint.
    Used by Docker, load balancers, and monitoring tools.
    """
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@app.post("/upload", response_model=UploadResponse)
async def upload_pdf(
    file: UploadFile = File(...),
):
    """
    Upload a PDF file and start background parsing.

    FLOW:
    1. Receive uploaded file
    2. Save to disk temporarily
    3. Compute SHA-256 hash
    4. Check if we've seen this PDF before (cache hit)
    5. If new: create Book document + launch Celery parse task
    6. Return book_id + task_id immediately (don't wait for parsing)
    """
    # Validate file type
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    # Check file size
    max_bytes = settings.max_pdf_size_mb * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"PDF too large. Maximum size: {settings.max_pdf_size_mb}MB"
        )

    # Compute hash for deduplication
    pdf_hash = hashlib.sha256(content).hexdigest()
    logger.info(f"Upload received: {file.filename} ({len(content) // 1024}KB, hash: {pdf_hash[:16]}...)")

    # Check if this PDF was already seen
    existing_book = await Book.find_one(Book.pdf_hash == pdf_hash)

    if existing_book and existing_book.status == ProcessingStatus.PARSED:
        # Perfect cache hit — no work needed
        logger.info(f"Cache hit! PDF already parsed as book {existing_book.id}")
        return UploadResponse(
            book_id=str(existing_book.id),
            task_id="cached",
            is_cached=True,
            message=f"PDF already processed! Found '{existing_book.title}'",
        )

    # Save PDF to permanent storage folder (not /tmp)
    file_path = os.path.join(settings.pdf_dir, f"{pdf_hash}.pdf")
    with open(file_path, "wb") as f:
        f.write(content)

    if existing_book and existing_book.status == ProcessingStatus.FAILED:
        logger.info(f"Retrying failed book {existing_book.id}")
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

    # Save job status to MongoDB
    job_status = JobStatus(
        celery_task_id=task.id,
        job_type="parse_pdf",
        status="pending",
        progress=0,
        message="Queued for processing...",
    )
    await job_status.insert()

    # Save task ID to book for easy lookup
    book.celery_task_id = task.id
    await book.save()

    logger.info(f"Book {book.id} queued for parsing. Task: {task.id}")

    return UploadResponse(
        book_id=str(book.id),
        task_id=task.id,
        is_cached=False,
        message="PDF uploaded! Parsing started in background.",
    )


@app.get("/books")
async def list_books():
    """List all books, most recent first"""
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
    """Get detailed book information including chapters"""
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


@app.post("/books/{book_id}/summarize", response_model=SummarizeResponse)
async def start_summarization(
    book_id: str,
    request: SummarizeRequest,
):
    """
    Start AI summarization for a book.

    Requires:
    - Book must be in PARSED status
    - User provides their API key (never stored)

    Launches Celery task that:
    1. Generates canonical summaries for each chapter
    2. Generates manga panels from summaries
    3. Generates reel scripts from summaries
    """
    book = await Book.get(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    if book.status not in (ProcessingStatus.PARSED, ProcessingStatus.FAILED):
        raise HTTPException(
            status_code=400,
            detail=f"Book is not ready for summarization. Current status: {book.status}"
        )

    # ── Double-generation guard ──────────────────────────────
    # If there's already an active (pending/summarizing/generating) summary
    # for this book, return its task info instead of creating a duplicate.
    from beanie.operators import In
    active_summary = await BookSummary.find_one(
        BookSummary.book_id == book_id,
        In(BookSummary.status, [  # type: ignore
            ProcessingStatus.PENDING,
            ProcessingStatus.SUMMARIZING,
            ProcessingStatus.GENERATING,
        ]),
    )
    if active_summary and active_summary.celery_task_id:
        return SummarizeResponse(
            summary_id=str(active_summary.id),
            task_id=active_summary.celery_task_id,
            message="A summary is already being generated for this book. Returning the active task.",
        )

    # Validate style
    try:
        style = SummaryStyle(request.style)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid style: {request.style}")

    # Generation mode is always LLM now (template mode removed)

    # Create BookSummary document
    summary = BookSummary(
        book_id=book_id,
        style=style,
        model=request.model,
        chapter_range=request.chapter_range,
        generate_images=request.generate_images,
        status=ProcessingStatus.PENDING,
    )
    await summary.insert()

    # Launch background task
    from app.celery_worker import generate_summary_task

    task = generate_summary_task.delay(
        book_id=book_id,
        summary_id=str(summary.id),
        api_key=request.api_key,
        provider=request.provider,
        model=request.model,
        style=request.style,
        chapter_range=request.chapter_range,
        generate_images=request.generate_images,
        image_model=request.image_model,
        engine=request.engine,
    )

    # Track job status
    job_status = JobStatus(
        celery_task_id=task.id,
        job_type="generate_summary",
        status="pending",
        progress=0,
        message="Queued for AI summarization...",
    )
    await job_status.insert()

    summary.celery_task_id = task.id
    await summary.save()

    return SummarizeResponse(
        summary_id=str(summary.id),
        task_id=task.id,
        message="Summarization started! This takes 2-5 minutes per chapter.",
    )


@app.get("/status/{task_id}", response_model=JobStatusResponse)
async def get_job_status(task_id: str):
    """
    Poll the status of a background job.
    Frontend calls this every 2 seconds to update the progress bar.
    """
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
        reel_cost=job.reel_cost,
    )


@app.get("/summary/{summary_id}")
async def get_summary(summary_id: str):
    """
    Get full summary data including manga chapters and reels.
    Called when the user navigates to the manga reader or reels feed.
    """
    summary = await BookSummary.get(summary_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")

    if summary.status != ProcessingStatus.COMPLETE:
        return {
            "id": str(summary.id),
            "book_id": summary.book_id,
            "status": summary.status,
            "message": "Summary not yet complete",
        }

    # Serialize manga chapters
    manga_chapters = []
    for ch in summary.manga_chapters:
        manga_chapters.append({
            "chapter_index": ch.chapter_index,
            "chapter_title": ch.chapter_title,
            "style": ch.style,
            # New page-based layout
            "pages": [
                {
                    "page_index": page.page_index,
                    "layout": page.layout,
                    "panels": [
                        {
                            "position": pp.position,
                            "content_type": pp.content_type,
                            "text": pp.text,
                            "dialogue": pp.dialogue,
                            "visual_mood": pp.visual_mood,
                            "character": pp.character,
                            "expression": pp.expression,
                            "image_prompt": pp.image_prompt,
                            "image_id": pp.image_id,
                        }
                        for pp in page.panels
                    ],
                }
                for page in ch.pages
            ],
            # Legacy panels (kept for backward compat)
            "panels": [
                {
                    "panel_index": p.panel_index,
                    "panel_type": p.panel_type,
                    "layout": p.layout,
                    "caption": p.caption,
                    "dialogue": p.dialogue,
                    "visual_description": p.visual_description,
                    "image_id": p.image_id,
                }
                for p in ch.panels
            ],
        })

    # Serialize reels
    reels = [
        {
            "reel_index": r.reel_index,
            "chapter_index": r.chapter_index,
            "lesson_title": r.lesson_title,
            "hook": r.hook,
            "key_points": r.key_points,
            "visual_theme": r.visual_theme,
            "duration_seconds": r.duration_seconds,
            "style": r.style,
        }
        for r in summary.reels
    ]

    return {
        "id": str(summary.id),
        "book_id": summary.book_id,
        "style": summary.style,
        "status": summary.status,
        "total_tokens_used": summary.total_tokens_used,
        "estimated_cost_usd": summary.estimated_cost_usd,
        "manga_chapters": manga_chapters,
        "reels": reels,
        "canonical_chapters": [
            {
                "chapter_index": c.chapter_index,
                "chapter_title": c.chapter_title,
                "one_liner": c.one_liner,
                "key_concepts": c.key_concepts,
            }
            for c in summary.canonical_chapters
        ],
    }






@app.get("/books/{book_id}/summaries")
async def get_book_summaries(book_id: str):
    """List all summaries for a book (different styles)"""
    summaries = await BookSummary.find(BookSummary.book_id == book_id).to_list()
    return [
        {
            "id": str(s.id),
            "style": s.style,
            "status": s.status,
            "total_chapters": len(s.canonical_chapters),
            "total_reels": len(s.reels),
            "estimated_cost_usd": s.estimated_cost_usd,
            "created_at": s.created_at.isoformat(),
        }
        for s in summaries
    ]


@app.patch("/books/{book_id}")
async def update_book(book_id: str, req: UpdateTitleRequest):
    """Let users rename a book (replaces the ugly hash default title)"""
    book = await Book.get(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    book.title = req.title.strip()
    await book.save()
    return {"id": book_id, "title": book.title}


@app.delete("/summaries/{summary_id}")
async def delete_summary(summary_id: str):
    """Delete a summary and its associated living panel documents"""
    summary = await BookSummary.get(summary_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")
    # Cascade-delete panel docs from the separate collection
    deleted_panels = await LivingPanelDoc.find(
        LivingPanelDoc.summary_id == summary_id
    ).delete()
    await summary.delete()
    panels_removed = getattr(deleted_panels, "deleted_count", 0) if deleted_panels else 0
    return {"deleted": summary_id, "panels_removed": panels_removed}

