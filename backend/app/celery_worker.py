"""celery_worker.py — Background tasks for PDF parsing.

After the Phase D cleanup the only background work this worker owns is
parsing uploaded PDFs into a normalized :class:`Book` document. The
v2 manga generation pipeline (book understanding + slice generation)
lives in :mod:`app.celery_manga_tasks`. The legacy v1 tasks
(``generate_summary_task``, ``generate_video_reel_task``,
``generate_reels_task``) were deleted along with the
``BookSummary``/``LivingPanelDoc``/``VideoReelDoc`` models.
"""

import asyncio
import logging
import os
from datetime import datetime

from celery import Celery
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

celery_app = Celery(
    "panelsummary",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.celery_worker", "app.celery_manga_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_max_retries=3,
    task_default_retry_delay=10,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    broker_connection_retry_on_startup=True,
    # Hard time limits per task (in seconds). PDF parse is bounded by
    # docling's wall clock, which is ~1m for big books on this hardware.
    task_time_limit=600,       # 10 min hard kill
    task_soft_time_limit=540,  # 9 min soft warning
)

# Celery runs in a separate process from FastAPI, so it has to bootstrap
# its own storage dirs. Failure here is non-fatal — the parse task will
# bail out with a clearer error.
try:
    from app.config import get_settings as _boot_settings
    _s = _boot_settings()
    os.makedirs(_s.pdf_dir, exist_ok=True)
    os.makedirs(_s.image_dir, exist_ok=True)
    logger.info("Storage dirs verified: %s, %s", _s.pdf_dir, _s.image_dir)
except Exception as e:  # pragma: no cover — defensive boot log
    logger.warning("Could not verify storage dirs at boot: %s", e)


# ============================================================
# ASYNC ↔ SYNC HELPERS
# Celery tasks run sync; Beanie/Motor are async. These bridges keep
# the async DB story consistent across processes.
# ============================================================

def run_async(coro):
    """Run an async coroutine from a sync (Celery) context."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def sync_update_job(
    task_id: str, status: str, progress: int, message: str,
    result_id: str | None = None, error: str | None = None,
    phase: str | None = None, panels_done: int | None = None,
    panels_total: int | None = None, cost_so_far: float | None = None,
    estimated_total_cost: float | None = None,
):
    """Synchronous job-status update via PyMongo.

    Used by callbacks that already live in a sync context (e.g. the
    parse-pdf progress hook fires inside docling's blocking loop).
    """
    from pymongo import MongoClient
    from app.config import get_settings
    settings = get_settings()
    client = MongoClient(settings.mongodb_url)
    db = client[settings.db_name]
    update: dict = {
        "status": status, "progress": progress, "message": message,
        "updated_at": datetime.utcnow(),
    }
    if result_id is not None:
        update["result_id"] = result_id
    if error is not None:
        update["error"] = error
    if phase is not None:
        update["phase"] = phase
    if panels_done is not None:
        update["panels_done"] = panels_done
    if panels_total is not None:
        update["panels_total"] = panels_total
    if cost_so_far is not None:
        update["cost_so_far"] = cost_so_far
    if estimated_total_cost is not None:
        update["estimated_total_cost"] = estimated_total_cost
    db["job_statuses"].update_one({"celery_task_id": task_id}, {"$set": update})
    client.close()


async def get_db():
    """Get a Beanie-initialized MongoDB database connection."""
    from app.config import get_settings
    from beanie import init_beanie
    from app.manga_models import MangaAssetDoc, MangaPageDoc, MangaProjectDoc, MangaSliceDoc
    from app.models import Book, JobStatus

    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_url)
    db = client[settings.db_name]
    await init_beanie(database=db, document_models=[
        Book, JobStatus,
        MangaProjectDoc, MangaSliceDoc, MangaPageDoc, MangaAssetDoc,
    ])
    return db


async def update_job_status(
    task_id: str, status: str, progress: int, message: str,
    result_id: str | None = None, error: str | None = None, **extra,
):
    """Update the JobStatus document in MongoDB.

    Extra kwargs (cost_so_far, phase, etc.) are stored as top-level
    fields on the JobStatus document so the frontend can display them
    in real time.
    """
    from app.models import JobStatus
    job = await JobStatus.find_one(JobStatus.celery_task_id == task_id)
    if not job:
        return
    job.status = status
    job.progress = progress
    job.message = message
    job.updated_at = datetime.utcnow()
    if result_id:
        job.result_id = result_id
    if error:
        job.error = error
    for k, v in extra.items():
        setattr(job, k, v)
    await job.save()


# ============================================================
# TASK: PDF PARSING
# ============================================================

@celery_app.task(bind=True, name="app.celery_worker.parse_pdf_task")
def parse_pdf_task(self, book_id: str, pdf_path: str):
    """Background task: parse a PDF and populate the Book document."""
    logger.info("Starting PDF parse for %s", book_id)

    async def _run():
        await get_db()
        from app.config import get_settings
        from app.models import Book, BookChapter, BookSection, ProcessingStatus
        from app.pdf_parser import parse_pdf

        settings = get_settings()

        book = await Book.get(book_id)
        if not book:
            logger.error("Book %s not found", book_id)
            return

        book.status = ProcessingStatus.PARSING
        await book.save()

        await update_job_status(self.request.id, "progress", 5, "Starting PDF analysis...")

        def progress_callback(pct: int, msg: str):
            sync_update_job(self.request.id, "progress", pct, msg)

        try:
            parsed = parse_pdf(pdf_path, progress_callback=progress_callback)

            # Save images to local filesystem (not GridFS — the renderer
            # streams raw PNGs and GridFS adds latency we don't need).
            book_img_dir = os.path.join(settings.image_dir, book_id)
            os.makedirs(book_img_dir, exist_ok=True)

            cover_image_id = None
            if parsed.get("cover_image_bytes"):
                cover_path = os.path.join(book_img_dir, "cover.png")
                with open(cover_path, "wb") as f:
                    f.write(parsed["cover_image_bytes"])
                cover_image_id = f"{book_id}/cover.png"

            image_id_map: dict[int, str] = {}
            for img_data in parsed.get("images", []):
                fname = f"page{img_data['page']}.png"
                fpath = os.path.join(book_img_dir, fname)
                with open(fpath, "wb") as f:
                    f.write(img_data["image_bytes"])
                image_id_map[img_data["page"]] = f"{book_id}/{fname}"

            chapters: list[BookChapter] = []
            for ch in parsed["chapters"]:
                chapter_image_ids = [
                    path for page, path in image_id_map.items()
                    if ch["page_start"] <= page <= ch["page_end"]
                ]
                chapters.append(BookChapter(
                    index=ch["index"],
                    title=ch["title"],
                    sections=[BookSection(
                        title=ch["title"],
                        content=ch["content"],
                        page_start=ch["page_start"],
                        page_end=ch["page_end"],
                        image_ids=chapter_image_ids,
                    )],
                    page_start=ch["page_start"],
                    page_end=ch["page_end"],
                    word_count=ch["word_count"],
                ))

            # Replace the raw filename "title" with PDF metadata if
            # available, falling back to a cleaned filename. The hash
            # check guards against PDFs whose metadata is just the
            # SHA — a surprisingly common docling output.
            meta_title = parsed.get("title", "") or ""
            if (
                not meta_title
                or len(meta_title) > 80
                or all(c in "0123456789abcdef" for c in meta_title[:20])
            ):
                meta_title = book.original_filename or book.title or "Untitled"
                meta_title = meta_title.replace(".pdf", "").replace("_", " ")
            book.title = meta_title
            book.author = parsed.get("author")
            book.total_pages = parsed.get("total_pages", 0)
            book.total_chapters = len(chapters)
            book.total_words = parsed.get("total_words", 0)
            book.chapters = chapters
            book.cover_image_id = cover_image_id
            book.status = ProcessingStatus.PARSED
            book.parse_progress = 100
            book.updated_at = datetime.utcnow()
            await book.save()

            await update_job_status(
                self.request.id, "success", 100,
                f"Parsing complete! Found {len(chapters)} chapters.",
                result_id=str(book.id),
            )

            logger.info("PDF parse complete for book %s: %d chapters", book_id, len(chapters))

        except Exception as e:
            logger.error("PDF parse failed for book %s: %s", book_id, e, exc_info=True)
            book.status = ProcessingStatus.FAILED
            book.error_message = str(e)
            await book.save()

            await update_job_status(
                self.request.id, "failure", 0,
                "Parsing failed", error=str(e),
            )
            raise

    run_async(_run())
