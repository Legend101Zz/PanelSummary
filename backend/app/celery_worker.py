"""
celery_worker.py — Background Task Definitions
================================================
Celery runs these tasks in a separate process from FastAPI.
This means heavy work (PDF parsing, LLM calls) doesn't freeze the API server.

HOW IT WORKS:
1. FastAPI receives a request and calls: parse_pdf_task.delay(...)
2. Celery puts the task in Redis queue
3. The Celery worker (separate process) picks it up and runs it
4. Progress updates are stored in MongoDB (JobStatus documents)
5. Frontend polls /status/{task_id} to see progress

START THE WORKER WITH:
  celery -A app.celery_worker worker --loglevel=info
"""

import asyncio
import logging
import os
from datetime import datetime

from celery import Celery
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)

# ============================================================
# CELERY APP SETUP
# ============================================================

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# Create Celery app
# broker = where tasks are queued (Redis)
# backend = where results are stored (also Redis)
celery_app = Celery(
    "panelsummary",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.celery_worker"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Retry failed tasks up to 3 times
    task_max_retries=3,
    task_default_retry_delay=10,
    # Worker settings
    worker_prefetch_multiplier=1,  # Don't grab multiple tasks at once
    task_acks_late=True,           # Acknowledge AFTER completion (safer)
    broker_connection_retry_on_startup=True,  # Silence Celery 6.0 deprecation warning
)


# ============================================================
# HELPER: Run async code in sync Celery task
# WHY: Celery tasks are sync; our DB calls are async
# ============================================================

def run_async(coro):
    """Run an async coroutine from a sync context"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def sync_update_job(task_id: str, status: str, progress: int, message: str,
                    result_id: str = None, error: str = None):
    """
    Synchronous job status update using PyMongo directly.

    WHY THIS EXISTS:
    progress_callback is called from inside synchronous parse_pdf() code which
    is itself running inside an already-running asyncio event loop (_run()).
    Calling run_async() there would attempt loop.run_until_complete() on a loop
    that is ALREADY running → RuntimeError: Cannot run the event loop while
    another loop is running.

    Solution: for callbacks invoked from sync code inside an async context,
    use the synchronous PyMongo driver instead of async Motor.
    """
    from pymongo import MongoClient
    from app.config import get_settings
    settings = get_settings()
    client = MongoClient(settings.mongodb_url)
    db = client[settings.db_name]
    update = {"status": status, "progress": progress, "message": message,
               "updated_at": datetime.utcnow()}
    if result_id:
        update["result_id"] = result_id
    if error:
        update["error"] = error
    db["job_statuses"].update_one({"celery_task_id": task_id}, {"$set": update})
    client.close()


async def get_db():
    """Get MongoDB database connection"""
    from app.config import get_settings
    from beanie import init_beanie
    from app.models import Book, BookSummary, JobStatus

    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_url)
    db = client[settings.db_name]
    await init_beanie(database=db, document_models=[Book, BookSummary, JobStatus])
    return db


async def update_job_status(task_id: str, status: str, progress: int, message: str, result_id: str = None, error: str = None):
    """Update the JobStatus document in MongoDB"""
    from app.models import JobStatus
    job = await JobStatus.find_one(JobStatus.celery_task_id == task_id)
    if job:
        job.status = status
        job.progress = progress
        job.message = message
        job.updated_at = datetime.utcnow()
        if result_id:
            job.result_id = result_id
        if error:
            job.error = error
        await job.save()


# ============================================================
# TASK 1: PDF PARSING
# ============================================================

@celery_app.task(bind=True, name="app.celery_worker.parse_pdf_task")
def parse_pdf_task(self, book_id: str, pdf_path: str):
    """
    Background task: Parse a PDF and populate the Book document.

    bind=True gives us access to `self` (the task instance)
    which lets us update task state and check for retries.
    """
    logger.info(f"Starting PDF parse task for book_id: {book_id}")

    async def _run():
        await get_db()
        from app.models import Book, ProcessingStatus, BookChapter, BookSection
        from app.pdf_parser import parse_pdf
        from app.config import get_settings
        import os

        settings = get_settings()

        book = await Book.get(book_id)
        if not book:
            logger.error(f"Book {book_id} not found")
            return

        book.status = ProcessingStatus.PARSING
        await book.save()

        await update_job_status(self.request.id, "progress", 5, "Starting PDF analysis...")

        def progress_callback(pct: int, msg: str):
            sync_update_job(self.request.id, "progress", pct, msg)

        try:
            parsed = parse_pdf(pdf_path, progress_callback=progress_callback)

            # ── Save images to local filesystem (not GridFS) ──────
            book_img_dir = os.path.join(settings.image_dir, book_id)
            os.makedirs(book_img_dir, exist_ok=True)

            # Cover image
            cover_image_id = None
            if parsed.get("cover_image_bytes"):
                cover_path = os.path.join(book_img_dir, "cover.png")
                with open(cover_path, "wb") as f:
                    f.write(parsed["cover_image_bytes"])
                cover_image_id = f"{book_id}/cover.png"

            # Page images
            image_id_map = {}  # page -> relative path
            for img_data in parsed.get("images", []):
                fname = f"page{img_data['page']}.png"
                fpath = os.path.join(book_img_dir, fname)
                with open(fpath, "wb") as f:
                    f.write(img_data["image_bytes"])
                image_id_map[img_data["page"]] = f"{book_id}/{fname}"

            # Build chapter objects
            chapters = []
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

            # Update the Book document with parsed content
            # Use original_filename as title if PDF metadata is absent/looks like a hash
            meta_title = parsed.get("title", "") or ""
            if not meta_title or len(meta_title) > 80 or all(c in "0123456789abcdef" for c in meta_title[:20]):
                # Metadata title is missing/ugly — use the filename we saved
                meta_title = book.original_filename or book.title or "Untitled"
                meta_title = meta_title.replace(".pdf", "").replace("_", " ").replace("-", " ")
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

            logger.info(f"PDF parse complete for book {book_id}: {len(chapters)} chapters")

        except Exception as e:
            logger.error(f"PDF parse failed for book {book_id}: {e}", exc_info=True)
            book.status = ProcessingStatus.FAILED
            book.error_message = str(e)
            await book.save()

            await update_job_status(
                self.request.id, "failure", 0,
                "Parsing failed", error=str(e)
            )
            raise

    run_async(_run())


# ============================================================
# TASK 2: SUMMARIZATION (canonical summary + manga + reels)
# ============================================================

@celery_app.task(bind=True, name="app.celery_worker.generate_summary_task")
def generate_summary_task(
    self,
    book_id: str,
    summary_id: str,
    api_key: str,
    provider: str = "openrouter",
    model: str = None,
    style: str = "manga",
    chapter_range: list = None,     # [start_idx, end_idx] inclusive; None = all
    generate_images: bool = False,  # run AI image gen after panels
):
    """
    Background task: Generate canonical summaries + manga panels + reels.

    This runs in stages:
    1. For each chapter: generate canonical summary (LLM)
    2. For each chapter: generate manga panels (LLM, uses canonical)
    3. For each chapter: generate reel scripts (LLM, uses canonical)
    """
    logger.info(f"Starting summary generation for book {book_id}")

    async def _run():
        await get_db()
        from app.models import (
            Book, BookSummary, JobStatus, ProcessingStatus,
            SummaryStyle, CanonicalChapterSummary
        )
        from app.llm_client import LLMClient
        from app.generate_manga import generate_manga_for_book

        from app.prompts import get_canonical_summary_prompt, format_chapter_for_llm
        from app.stage_book_synopsis import generate_book_synopsis
        from app.stage_manga_planner import generate_manga_bible
        from app.models import MangaBible, CharacterProfile, ChapterPlan
        import json

        book = await Book.get(book_id)
        summary_doc = await BookSummary.get(summary_id)

        if not book or not summary_doc:
            logger.error(f"Book or summary not found: {book_id}, {summary_id}")
            return

        summary_doc.status = ProcessingStatus.SUMMARIZING
        await summary_doc.save()

        llm = LLMClient(api_key=api_key, provider=provider, model=model)
        summary_style = SummaryStyle(style)

        await update_job_status(
            self.request.id, "progress", 5,
            "Starting AI summarization..."
        )

        # Apply chapter range filter
        all_chapters = book.chapters
        if chapter_range and len(chapter_range) == 2:
            start_idx, end_idx = chapter_range
            all_chapters = [c for c in all_chapters if start_idx <= c.index <= end_idx]
            logger.info(f"Processing chapters {start_idx}–{end_idx} ({len(all_chapters)} of {len(book.chapters)})")

        total_chapters = len(all_chapters)
        canonical_chapters = []
        total_tokens = 0
        total_cost = 0.0

        # STAGE 1: Canonical summaries (one per chapter)
        for i, chapter in enumerate(all_chapters):
            progress = int((i / total_chapters) * 40)  # 0-40%
            await update_job_status(
                self.request.id, "progress", progress,
                f"Summarizing chapter {i + 1}/{total_chapters}: '{chapter.title[:40]}'..."
            )

            # Build chapter content from sections
            content = "\n\n".join(
                section.content for section in chapter.sections
            )
            chapter_dict = {
                "index": chapter.index,
                "title": chapter.title,
                "content": content,
            }

            system_prompt = get_canonical_summary_prompt(summary_style)
            user_message = format_chapter_for_llm(chapter_dict)

            try:
                result = await llm.chat_with_retry(
                    system_prompt=system_prompt,
                    user_message=user_message,
                    max_tokens=4000,   # canonical summary JSON needs room
                    temperature=0.6,
                )

                total_tokens += result["input_tokens"] + result["output_tokens"]
                total_cost += result["estimated_cost_usd"]

                parsed = result.get("parsed") or {}

                canonical = CanonicalChapterSummary(
                    chapter_index=chapter.index,
                    chapter_title=parsed.get("chapter_title", chapter.title),
                    one_liner=parsed.get("one_liner", ""),
                    key_concepts=parsed.get("key_concepts", []),
                    narrative_summary=parsed.get("narrative_summary", ""),
                    memorable_quotes=parsed.get("memorable_quotes", []),
                    action_items=parsed.get("action_items", []),
                )

                # Add extra fields for manga/reels generation
                canonical_dict = canonical.model_dump()
                canonical_dict["dramatic_moment"] = parsed.get("dramatic_moment", "")
                canonical_dict["metaphor"] = parsed.get("metaphor", "")
                canonical_chapters.append(canonical_dict)

            except Exception as e:
                logger.error(f"Failed to summarize chapter {i}: {e}")
                # Add minimal fallback
                canonical_chapters.append({
                    "chapter_index": chapter.index,
                    "chapter_title": chapter.title,
                    "one_liner": f"Chapter {i + 1} of the book",
                    "key_concepts": [],
                    "narrative_summary": content[:500] if content else "",
                    "memorable_quotes": [],
                    "action_items": [],
                    "dramatic_moment": "",
                    "metaphor": "",
                })

        # Save canonical summaries
        summary_doc.canonical_chapters = [
            CanonicalChapterSummary(**{
                k: v for k, v in ch.items()
                if k in CanonicalChapterSummary.model_fields
            })
            for ch in canonical_chapters
        ]
        await summary_doc.save()

        await update_job_status(
            self.request.id, "progress", 40,
            "Chapters summarized! Analyzing the full narrative arc..."
        )

        # STAGE 2: Book synopsis — whole-book narrative arc
        book_synopsis = {}
        try:
            book_synopsis = await generate_book_synopsis(
                canonical_chapters=canonical_chapters,
                llm_client=llm,
            )
            total_cost += 0  # tokens tracked inside llm client; cost negligible for 1 call
        except Exception as e:
            logger.warning(f"Book synopsis failed (non-fatal): {e}")

        await update_job_status(
            self.request.id, "progress", 46,
            "Narrative arc mapped! Designing manga characters and world..."
        )

        # STAGE 3: Manga bible — characters, world, per-chapter plans
        manga_bible_dict = {}
        try:
            manga_bible_dict = await generate_manga_bible(
                book_synopsis=book_synopsis,
                canonical_chapters=canonical_chapters,
                style=summary_style,
                llm_client=llm,
            )

            # Persist the bible in the summary document
            if manga_bible_dict:
                try:
                    summary_doc.manga_bible = MangaBible(
                        world_description=manga_bible_dict.get("world_description", ""),
                        color_palette=manga_bible_dict.get("color_palette", ""),
                        characters=[
                            CharacterProfile(**c) for c in manga_bible_dict.get("characters", [])
                            if isinstance(c, dict)
                        ],
                        recurring_motifs=manga_bible_dict.get("recurring_motifs", []),
                        chapter_plans=[
                            ChapterPlan(**p) for p in manga_bible_dict.get("chapter_plans", [])
                            if isinstance(p, dict)
                        ],
                    )
                    await summary_doc.save()
                except Exception as e:
                    logger.warning(f"Could not save manga bible to DB (non-fatal): {e}")
        except Exception as e:
            logger.warning(f"Manga bible failed (non-fatal, will use fallback): {e}")

        await update_job_status(
            self.request.id, "progress", 55,
            "Story bible ready! Drawing manga panels..."
        )

        # STAGE 4: Manga panels — uses bible for coherent characters and visuals
        summary_doc.status = ProcessingStatus.GENERATING
        await summary_doc.save()

        def manga_progress(pct, msg):
            sync_update_job(self.request.id, "progress", 55 + int(pct * 0.15), msg)

        manga_chapters, manga_cost = await generate_manga_for_book(
            book_id=book_id,
            canonical_chapters=canonical_chapters,
            style=summary_style,
            llm_client=llm,
            manga_bible=manga_bible_dict or None,
            progress_callback=manga_progress,
        )

        summary_doc.manga_chapters = manga_chapters
        total_cost += manga_cost.get("estimated_cost_usd", 0)
        await summary_doc.save()

        # STAGE 5 (optional): AI image generation for splash panels
        if generate_images:
            from app.image_generator import generate_images_for_summary
            from app.config import get_settings as _gs
            img_settings = _gs()

            await update_job_status(self.request.id, "progress", 72, "Generating splash images…")

            def img_progress(pct, msg):
                sync_update_job(self.request.id, "progress", 72, msg)

            updated_chapters, n_images, img_cost = await generate_images_for_summary(
                book_id=book_id,
                manga_chapters=summary_doc.manga_chapters,
                style=style,
                api_key=api_key,
                image_base_dir=img_settings.image_dir,
                progress_callback=img_progress,
            )
            summary_doc.manga_chapters = updated_chapters
            total_cost += img_cost
            logger.info(f"Generated {n_images} splash images")

        summary_doc.total_tokens_used = total_tokens
        summary_doc.estimated_cost_usd = round(total_cost, 4)
        summary_doc.status = ProcessingStatus.COMPLETE
        summary_doc.updated_at = datetime.utcnow()
        await summary_doc.save()

        n_chars = len(manga_bible_dict.get("characters", [])) if manga_bible_dict else 0
        await update_job_status(
            self.request.id, "success", 100,
            f"Done! {len(manga_chapters)} manga chapters, {n_chars} characters. Reels available on demand. Cost: ~${total_cost:.4f}",
            result_id=str(summary_doc.id),
        )

        logger.info(f"Summary generation complete for book {book_id}")

    run_async(_run())


# ============================================================
# TASK: ON-DEMAND REEL GENERATION
# Triggered explicitly by user after manga summary is complete.
# ============================================================

@celery_app.task(bind=True, name="generate_reels_task")
def generate_reels_task(
    self,
    summary_id: str,
    api_key: str,
    provider: str = "openrouter",
    model: str = None,
):
    """Generate reel scripts on demand for an already-complete summary."""

    async def _run():
        await get_db()
        from app.models import BookSummary, JobStatus, ProcessingStatus, CanonicalChapterSummary
        from app.llm_client import LLMClient
        from app.generate_reels import generate_reels_for_book

        summary_doc = await BookSummary.get(summary_id)
        if not summary_doc:
            logger.error(f"Summary not found for reel generation: {summary_id}")
            return

        llm = LLMClient(api_key=api_key, provider=provider, model=model)

        await update_job_status(self.request.id, "progress", 10, "Scripting lesson reels...")

        canonical_chapters = [ch.model_dump() for ch in summary_doc.canonical_chapters]

        def reels_progress(pct, msg):
            sync_update_job(self.request.id, "progress", 10 + int(pct * 0.88), msg)

        try:
            reels, reels_cost = await generate_reels_for_book(
                book_id=summary_doc.book_id,
                canonical_chapters=canonical_chapters,
                style=summary_doc.style,
                llm_client=llm,
                progress_callback=reels_progress,
            )

            summary_doc.reels = reels
            summary_doc.estimated_cost_usd = round(
                summary_doc.estimated_cost_usd + reels_cost.get("estimated_cost_usd", 0), 4
            )
            summary_doc.updated_at = datetime.utcnow()
            await summary_doc.save()

            await update_job_status(
                self.request.id, "success", 100,
                f"Reels ready! {len(reels)} lesson reels generated.",
                result_id=summary_id,
            )
        except Exception as e:
            logger.error(f"Reel generation failed: {e}")
            await update_job_status(self.request.id, "failure", 0, f"Failed: {e}", error=str(e))

    run_async(_run())
