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

import httpx
from beanie import init_beanie
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

from app.api.routes.jobs import router as jobs_router
from app.api.routes.living_panels import router as living_panels_router
from app.api.routes.manga_projects import router as manga_projects_router
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


# ============================================================
# REQUEST / RESPONSE MODELS
# ============================================================

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


# ============================================================
# ENDPOINTS
# ============================================================

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


class GenerateReelsRequest(BaseModel):
    api_key: str
    provider: str = "openrouter"
    model: Optional[str] = None


@app.post("/summary/{summary_id}/generate-reels")
async def generate_reels_for_summary(summary_id: str, request: GenerateReelsRequest):
    """
    Trigger on-demand reel generation for an already-complete manga summary.
    Reels are NOT generated automatically with the manga — the user triggers this.
    """
    summary = await BookSummary.get(summary_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")

    if summary.status != ProcessingStatus.COMPLETE:
        raise HTTPException(status_code=400, detail="Summary is not yet complete")

    if summary.reels:
        return {"message": "Reels already exist", "reel_count": len(summary.reels), "task_id": None}

    from app.celery_worker import generate_reels_task

    task = generate_reels_task.delay(
        summary_id=summary_id,
        api_key=request.api_key,
        provider=request.provider,
        model=request.model,
    )

    job_status = JobStatus(
        celery_task_id=task.id,
        job_type="generate_reels",
        status="pending",
        progress=0,
        message="Starting reel generation...",
        result_id=summary_id,
    )
    await job_status.insert()

    return {"task_id": task.id, "message": "Reel generation started"}


@app.get("/image-models")
async def get_image_models():
    """Return the list of supported image generation models (cheapest first)."""
    from app.image_generator import IMAGE_GENERATION_MODELS, DEFAULT_IMAGE_MODEL
    return {"models": IMAGE_GENERATION_MODELS, "default": DEFAULT_IMAGE_MODEL}


@app.get("/openrouter/models")
async def get_openrouter_models(api_key: str = ""):
    """
    Proxy the OpenRouter model list.
    Returns filtered, enriched model info with pricing.
    Uses user-provided key or the server's OPENROUTER_API_KEY.
    """
    key = api_key or settings.openrouter_api_key
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get("https://openrouter.ai/api/v1/models", headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="OpenRouter API error")

        all_models = resp.json().get("data", [])

        # Filter to text generation models with reasonable context
        filtered = []
        for m in all_models:
            ctx = m.get("context_length", 0)
            if ctx < 4000:
                continue
            arch = m.get("architecture", {})
            # Skip image-only or embedding models
            modality = arch.get("modality", "text->text")
            if "text" not in modality:
                continue

            pricing = m.get("pricing", {})
            try:
                input_price  = float(pricing.get("prompt", "0")) * 1_000_000
                output_price = float(pricing.get("completion", "0")) * 1_000_000
            except (ValueError, TypeError):
                input_price = output_price = 0.0

            filtered.append({
                "id":           m["id"],
                "name":         m.get("name", m["id"]),
                "context_length": ctx,
                "input_price_per_1m":  round(input_price, 4),
                "output_price_per_1m": round(output_price, 4),
                "is_free":      input_price == 0 and output_price == 0,
                "provider":     m["id"].split("/")[0] if "/" in m["id"] else "unknown",
            })

        # Sort: free first, then by input price
        filtered.sort(key=lambda x: (not x["is_free"], x["input_price_per_1m"]))

        return {"models": filtered, "total": len(filtered)}

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="OpenRouter request timed out")


@app.get("/images/{image_path:path}")
async def get_image(image_path: str):
    """
    Serve images from local filesystem.
    image_path is relative to settings.image_dir, e.g. "{book_id}/cover.png"
    """
    full_path = os.path.join(settings.image_dir, image_path)
    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(
        full_path,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.get("/books/{book_id}/pdf/info")
async def get_pdf_info(book_id: str):
    """Return PDF metadata needed by the reader (total pages, title)."""
    book = await Book.get(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    pdf_path = os.path.join(settings.pdf_dir, f"{book.pdf_hash}.pdf")
    if not os.path.isfile(pdf_path):
        raise HTTPException(status_code=404, detail="PDF file not found on disk")
    import fitz
    doc = fitz.open(pdf_path)
    total = len(doc)
    doc.close()
    return {"book_id": book_id, "title": book.title, "total_pages": total, "pdf_hash": book.pdf_hash}


@app.get("/books/{book_id}/pdf/page/{page_num}")
async def get_pdf_page(book_id: str, page_num: int, scale: float = 2.0):
    """
    Render one PDF page as a PNG and return it.
    Pages are cached in storage/images/{book_id}/pdfpage_{n}.png so they're
    only rendered once. The frontend lazy-loads pages on demand.
    """
    if page_num < 1:
        raise HTTPException(status_code=400, detail="Page numbers start at 1")

    book = await Book.get(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    cache_path = os.path.join(settings.image_dir, book_id, f"pdfpage_{page_num}.png")

    # Serve cached version if available
    if os.path.isfile(cache_path):
        return FileResponse(cache_path, media_type="image/png",
                            headers={"Cache-Control": "public, max-age=604800"})

    pdf_path = os.path.join(settings.pdf_dir, f"{book.pdf_hash}.pdf")
    if not os.path.isfile(pdf_path):
        raise HTTPException(status_code=404, detail="PDF not found on disk")

    import fitz
    doc = fitz.open(pdf_path)
    if page_num > len(doc):
        raise HTTPException(status_code=404, detail=f"Page {page_num} exceeds {len(doc)}")

    page = doc[page_num - 1]
    mat  = fitz.Matrix(scale, scale)
    pix  = page.get_pixmap(matrix=mat)
    img_bytes = pix.tobytes("png")
    doc.close()

    # Cache to disk
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with open(cache_path, "wb") as f:
        f.write(img_bytes)

    return Response(img_bytes, media_type="image/png",
                    headers={"Cache-Control": "public, max-age=604800"})


@app.get("/reels")
async def get_all_reels(
    limit: int = 20,
    offset: int = 0,
    style: Optional[str] = None,
):
    """
    Get reels from ALL books for the infinite scroll feed.
    This powers the "discover" vertical scroll experience.

    Returns reels interleaved from multiple books for variety.
    """
    query = {"status": "complete"}
    if style:
        query["style"] = style

    summaries = await BookSummary.find(
        BookSummary.status == ProcessingStatus.COMPLETE
    ).to_list()

    # Flatten all reels from all books
    all_reels = []
    for summary in summaries:
        # Get book info for context
        book = await Book.get(summary.book_id)
        book_info = {
            "id": str(book.id),
            "title": book.title,
            "author": book.author,
            "cover_image_id": book.cover_image_id,
        } if book else {}

        for reel in summary.reels:
            all_reels.append({
                "reel_index": reel.reel_index,
                "chapter_index": reel.chapter_index,
                "lesson_title": reel.lesson_title,
                "hook": reel.hook,
                "key_points": reel.key_points,
                "visual_theme": reel.visual_theme,
                "duration_seconds": reel.duration_seconds,
                "style": reel.style,
                "summary_id": str(summary.id),
                "book": book_info,
                # Position info for horizontal swipe
                "total_reels_in_book": len(summary.reels),
            })

    # Simple interleaving for variety (in production: use proper recommendation)
    # Sort by creation time (newest books first) then take page
    total = len(all_reels)
    page = all_reels[offset:offset + limit]

    return {
        "reels": page,
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": offset + limit < total,
    }


# ============================================================
# VIDEO REELS — DSL-driven rendered video reels
# ============================================================

class GenerateVideoReelRequest(BaseModel):
    api_key: str
    provider: str = "openrouter"
    model: Optional[str] = None


@app.post("/summary/{summary_id}/generate-video-reel")
async def generate_video_reel(summary_id: str, request: GenerateVideoReelRequest):
    """
    Generate a new video reel for a book. Each call produces one reel
    from unused content. Memory ensures no repeats.
    """
    summary = await BookSummary.get(summary_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")
    if summary.status != ProcessingStatus.COMPLETE:
        raise HTTPException(status_code=400, detail="Summary must be complete first")

    from app.celery_worker import generate_video_reel_task

    task = generate_video_reel_task.delay(
        summary_id=summary_id,
        api_key=request.api_key,
        provider=request.provider,
        model=request.model,
    )

    job = JobStatus(
        celery_task_id=task.id,
        job_type="generate_video_reel",
        status="pending",
        progress=0,
        message="Starting video reel generation...",
        result_id=summary_id,
    )
    await job.insert()

    return {"task_id": task.id, "message": "Video reel generation started"}


# ── Fixed routes BEFORE parameterized /{book_id} to avoid shadowing ──

@app.get("/video-reels/renderer-status")
async def check_renderer_status():
    """Check if the reel-renderer is set up and ready."""
    from app.reel_engine.renderer import check_renderer_ready
    ready, message = check_renderer_ready()
    return {"ready": ready, "message": message}


@app.get("/video-reels/{book_id}")
async def get_video_reels_for_book(book_id: str):
    """Get all video reels for a specific book (includes DSL for browser rendering)."""
    reels = await VideoReelDoc.find(
        VideoReelDoc.book_id == book_id,
    ).sort("reel_index").to_list()

    book = await Book.get(book_id)
    book_info = {
        "id": str(book.id),
        "title": book.title,
        "author": book.author,
        "cover_image_id": book.cover_image_id,
    } if book else {}

    return {
        "book": book_info,
        "reels": [
            _serialize_video_reel(r, book_info)
            for r in reels
        ],
        "total": len(reels),
    }


def _serialize_video_reel(r, book_info: dict | None = None, total_in_book: int | None = None) -> dict:
    """Serialize a VideoReelDoc to API response dict. Includes DSL for browser rendering."""
    result = {
        "id": str(r.id),
        "reel_index": r.reel_index,
        "title": r.title,
        "mood": r.mood,
        "duration_ms": r.duration_ms,
        "video_path": r.video_path if r.render_status == "complete" else "",
        "render_status": r.render_status,
        "created_at": r.created_at.isoformat(),
    }
    # Always include DSL so browser can render without MP4
    if r.dsl:
        result["dsl"] = r.dsl
    if book_info:
        result["book"] = book_info
    if total_in_book is not None:
        result["total_reels_in_book"] = total_in_book
    return result


@app.get("/video-reels")
async def get_all_video_reels(limit: int = 20, offset: int = 0):
    """
    Get video reels from ALL books for the infinite vertical feed.
    Includes DSL for browser-side rendering when MP4 isn't available.
    """
    all_reels = []

    reels = await VideoReelDoc.find().sort("-created_at").to_list()

    for reel in reels:
        book = await Book.get(reel.book_id)
        book_info = {
            "id": str(book.id),
            "title": book.title,
            "author": book.author,
            "cover_image_id": book.cover_image_id,
        } if book else {}

        book_total = await VideoReelDoc.find(
            VideoReelDoc.book_id == reel.book_id,
        ).count()

        all_reels.append(_serialize_video_reel(reel, book_info, book_total))

    total = len(all_reels)
    page = all_reels[offset:offset + limit]

    return {
        "reels": page,
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": offset + limit < total,
    }


@app.get("/video-reels/{book_id}/{reel_id}/video")
async def serve_video_reel(book_id: str, reel_id: str):
    """Serve the rendered MP4 video file."""
    reel = await VideoReelDoc.get(reel_id)
    if not reel or reel.book_id != book_id:
        raise HTTPException(status_code=404, detail="Reel not found")
    if reel.render_status != "complete" or not reel.video_path:
        raise HTTPException(status_code=404, detail="Video not yet rendered")

    settings = get_settings()
    storage_base = settings.storage_dir or str(Path(settings.pdf_dir).parent)
    video_file = Path(storage_base) / reel.video_path

    if not video_file.exists():
        raise HTTPException(status_code=404, detail="Video file not found on disk")

    return FileResponse(
        str(video_file),
        media_type="video/mp4",
        headers={
            "Cache-Control": "public, max-age=604800",
            "Accept-Ranges": "bytes",
        },
    )


@app.delete("/video-reels/{book_id}/{reel_id}")
async def delete_video_reel(book_id: str, reel_id: str):
    """Delete a single video reel and its rendered video file."""
    reel = await VideoReelDoc.get(reel_id)
    if not reel or reel.book_id != book_id:
        raise HTTPException(status_code=404, detail="Reel not found")

    # Delete rendered MP4 if it exists
    if reel.video_path:
        settings = get_settings()
        storage_base = settings.storage_dir or str(Path(settings.pdf_dir).parent)
        video_file = Path(storage_base) / reel.video_path
        if video_file.exists():
            video_file.unlink()

    # Remove from reel memory's used content IDs so content can be reused
    if reel.source_content_ids:
        memory = await BookReelMemory.find_one(BookReelMemory.book_id == book_id)
        if memory:
            memory.used_content_ids = [
                cid for cid in memory.used_content_ids
                if cid not in reel.source_content_ids
            ]
            memory.total_reels_generated = max(0, memory.total_reels_generated - 1)
            memory.exhausted = False  # Content freed up
            await memory.save()

    await reel.delete()
    return {"ok": True, "message": "Reel deleted"}


@app.get("/video-reels/memory/{book_id}")
async def get_reel_memory(book_id: str):
    """Check reel generation memory — how much content is left."""
    memory = await BookReelMemory.find_one(BookReelMemory.book_id == book_id)
    if not memory:
        return {
            "total_reels_generated": 0,
            "used_content_count": 0,
            "exhausted": False,
        }
    return {
        "total_reels_generated": memory.total_reels_generated,
        "used_content_count": len(memory.used_content_ids),
        "exhausted": memory.exhausted,
    }
