"""celery_worker.py — Background tasks for PDF parsing & summary generation."""

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
    include=["app.celery_worker"],
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
    # Hard time limits per task (in seconds)
    task_time_limit=600,       # 10 min hard kill
    task_soft_time_limit=540,  # 9 min soft warning
)

# Issue 6.2: Ensure storage dirs exist when Celery worker starts
# (main.py does this for the FastAPI process, but Celery is a separate process)
try:
    from app.config import get_settings as _boot_settings
    _s = _boot_settings()
    os.makedirs(_s.pdf_dir, exist_ok=True)
    os.makedirs(_s.image_dir, exist_ok=True)
    logger.info(f"Storage dirs verified: {_s.pdf_dir}, {_s.image_dir}")
except Exception as e:
    logger.warning(f"Could not verify storage dirs at boot: {e}")

def run_async(coro):
    """Run an async coroutine from a sync context"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()
def sync_update_job(task_id: str, status: str, progress: int, message: str,
                    result_id: str = None, error: str = None,
                    phase: str = None, panels_done: int = None,
                    panels_total: int = None, cost_so_far: float = None,
                    estimated_total_cost: float = None):
    """Synchronous job status update via PyMongo (for callbacks in sync context)."""
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
    """Get MongoDB database connection"""
    from app.config import get_settings
    from beanie import init_beanie
    from app.models import Book, BookSummary, LivingPanelDoc, JobStatus

    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_url)
    db = client[settings.db_name]
    await init_beanie(database=db, document_models=[Book, BookSummary, LivingPanelDoc, JobStatus])
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
# TASK 1: PDF PARSING

@celery_app.task(bind=True, name="app.celery_worker.parse_pdf_task")
def parse_pdf_task(self, book_id: str, pdf_path: str):
    """Background task: Parse a PDF and populate the Book document."""
    logger.info(f"Starting PDF parse for {book_id}")

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

            # Use original_filename as title if PDF metadata is absent/ugly
            meta_title = parsed.get("title", "") or ""
            if not meta_title or len(meta_title) > 80 or all(c in "0123456789abcdef" for c in meta_title[:20]):
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
# TASK 2: SUMMARIZATION

@celery_app.task(bind=True, name="app.celery_worker.generate_summary_task")
def generate_summary_task(
    self,
    book_id: str,
    summary_id: str,
    api_key: str,
    provider: str = "openrouter",
    model: str = None,
    style: str = "manga",
    chapter_range: list = None,       # [start_idx, end_idx] inclusive; None = all
    generate_images: bool = False,    # run AI image gen after panels
    image_model: str = None,          # image generation model (OpenRouter)
):
    """Background task: Compress chapters → Orchestrator (synopsis + bible + DSLs) → Images."""
    logger.info(f"Starting summary generation for book {book_id}")

    async def _run():
        await get_db()
        from app.models import (
            Book, BookSummary, JobStatus, LivingPanelDoc, ProcessingStatus,
            SummaryStyle, CanonicalChapterSummary
        )
        from app.llm_client import LLMClient

        from app.prompts import get_canonical_summary_prompt, format_chapter_for_llm
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
            sync_update_job(
                self.request.id, "progress", progress,
                f"Compressing chapter {i + 1}/{total_chapters}: '{chapter.title[:40]}'...",
                phase="compressing",
                panels_done=i, panels_total=total_chapters,
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
                # LLM sometimes wraps in array
                if isinstance(parsed, list):
                    parsed = parsed[0] if parsed else {}

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
            "Chapters compressed! Handing off to the Orchestrator...",
        )
        # Also set the phase via sync (the async update_job_status doesn't have phase)
        sync_update_job(
            self.request.id, "progress", 40,
            "Chapters compressed! Orchestrator taking over...",
            phase="analysis",
        )

        # STAGE 2: THE ORCHESTRATOR
        summary_doc.status = ProcessingStatus.GENERATING
        await summary_doc.save()

        from app.agents.orchestrator import MangaOrchestrator
        from app.agents.credit_tracker import CreditTracker

        credit_tracker = CreditTracker(api_key=api_key, model=llm.model)

        # Cancel checker — persistent Mongo connection for perf
        from pymongo import MongoClient
        from app.config import get_settings as _cs
        _cs_s = _cs()
        _cc = MongoClient(_cs_s.mongodb_url)
        _cdb = _cc[_cs_s.db_name]
        _ctid = self.request.id

        def check_cancel():
            try:
                job = _cdb["job_statuses"].find_one({"celery_task_id": _ctid})
                return job and job.get("status") == "cancelled"
            except Exception:
                return False

        def orch_progress(pct, msg, detail=None):
            # Orchestrator: 40-90% of overall pipeline
            mapped_pct = 40 + int(pct * 0.50)
            phase = detail.get("stage", "") if detail else ""
            cost_data = detail.get("cost", {}) if detail else {}
            panel_detail = detail.get("detail", {}) if detail else {}

            sync_update_job(
                self.request.id, "progress", mapped_pct, msg,
                phase=phase or None,
                panels_done=panel_detail.get("panels_ok", None),
                panels_total=panel_detail.get("total_panels", None),
                cost_so_far=cost_data.get("run_cost", None),
                estimated_total_cost=panel_detail.get("estimated_cost", None),
            )

        orchestrator = MangaOrchestrator(
            llm_client=llm,
            style=summary_style,
            credit_tracker=credit_tracker,
            progress_callback=orch_progress,
            cancel_check=check_cancel,
            image_budget=5,
            max_concurrent=4,
        )

        orch_result = await orchestrator.run(
            canonical_chapters=canonical_chapters,
            # Don't pass synopsis/bible — let orchestrator generate them
            book_synopsis=None,
            manga_bible=None,
        )

        # Store results — save panels to dedicated collection (not embedded)
        panel_docs = []
        for i, panel_dsl in enumerate(orch_result.living_panels):
            panel_docs.append(LivingPanelDoc(
                summary_id=str(summary_doc.id),
                panel_id=panel_dsl.get("meta", {}).get("panel_id", f"panel-{i}"),
                panel_index=i,
                dsl=panel_dsl,
                content_type=panel_dsl.get("meta", {}).get("content_type", ""),
                chapter_index=panel_dsl.get("meta", {}).get("chapter_index", 0),
            ))
        if panel_docs:
            # Delete old panels for this summary (if re-running)
            await LivingPanelDoc.find(
                LivingPanelDoc.summary_id == str(summary_doc.id)
            ).delete()
            await LivingPanelDoc.insert_many(panel_docs)
            logger.info(f"Saved {len(panel_docs)} panels to living_panels collection")

        summary_doc.panel_count = len(orch_result.living_panels)
        # Don't store panels in summary doc anymore (keep empty for backward compat)
        summary_doc.living_panels = []
        total_cost += orch_result.cost_snapshot.get("run_cost", 0)
        total_tokens += (
            orch_result.cost_snapshot.get("run_input_tokens", 0)
            + orch_result.cost_snapshot.get("run_output_tokens", 0)
        )

        # Track quality flags (issue 3.2: surface silent failures)
        summary_doc.bible_used = orch_result.bible_used
        summary_doc.synopsis_used = orch_result.synopsis_used

        # Store the manga bible the orchestrator produced
        manga_bible_dict = orch_result.manga_bible or {}
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
            except Exception as e:
                logger.warning(f"Could not save manga bible to DB (non-fatal): {e}")

        await summary_doc.save()

        # Clean up cancel connection
        try:
            _cc.close()
        except Exception:
            pass

        if orch_result.cancelled:
            summary_doc.status = ProcessingStatus.COMPLETE
            summary_doc.updated_at = datetime.utcnow()
            await summary_doc.save()
            await update_job_status(
                self.request.id, "success", 100,
                f"Cancelled early. {orch_result.panels_generated} living panels saved. Cost: ~${total_cost:.4f}",
                result_id=str(summary_doc.id),
            )
            return

        logger.info(
            f"Orchestrator done: {orch_result.panels_generated} panels ok, "
            f"{orch_result.panels_failed} fallback, "
            f"{orch_result.total_time_s:.1f}s"
        )

        # STAGE 3 (optional): AI image generation for splash panels
        if generate_images and summary_doc.manga_chapters:
            from app.image_generator import generate_images_for_summary
            from app.config import get_settings as _gs
            img_settings = _gs()

            sync_update_job(self.request.id, "progress", 91, "Generating splash images…", phase="images")

            def img_progress(pct, msg):
                sync_update_job(self.request.id, "progress", 91 + int(pct * 0.07), msg, phase="images")

            updated_chapters, n_images, n_img_failed, img_cost = await generate_images_for_summary(
                book_id=book_id,
                manga_chapters=summary_doc.manga_chapters,
                style=style,
                api_key=api_key,
                image_base_dir=img_settings.image_dir,
                progress_callback=img_progress,
                image_model=image_model,
            )
            summary_doc.manga_chapters = updated_chapters
            summary_doc.images_failed = n_img_failed
            total_cost += img_cost
            logger.info(f"Generated {n_images} splash images ({n_img_failed} failed)")

        summary_doc.total_tokens_used = total_tokens
        summary_doc.estimated_cost_usd = round(total_cost, 4)
        summary_doc.status = ProcessingStatus.COMPLETE
        summary_doc.updated_at = datetime.utcnow()
        await summary_doc.save()

        n_chars = len(manga_bible_dict.get("characters", [])) if manga_bible_dict else 0
        n_living = len(summary_doc.living_panels) if hasattr(summary_doc, 'living_panels') and summary_doc.living_panels else 0
        await update_job_status(
            self.request.id, "success", 100,
            f"Done! {n_living} living panels, {n_chars} characters, {len(canonical_chapters)} chapters. Cost: ~${total_cost:.4f}",
            result_id=str(summary_doc.id),
        )

        logger.info(f"Summary generation complete for book {book_id}")

    async def _run_guarded():
        """Wraps _run() so ANY unhandled exception marks the summary as failed."""
        from app.models import BookSummary, ProcessingStatus
        try:
            await _run()
        except Exception as exc:
            err_msg = str(exc)
            logger.error(f"Summary task FAILED for {summary_id}: {err_msg}", exc_info=True)
            try:
                await get_db()
                summary_doc = await BookSummary.get(summary_id)
                if summary_doc:
                    summary_doc.status = ProcessingStatus.FAILED
                    summary_doc.error_message = err_msg[:500]
                    await summary_doc.save()
            except Exception as save_err:
                logger.error(f"Could not mark summary as failed: {save_err}")
            try:
                await update_job_status(
                    self.request.id, "failure", 0,
                    f"Failed: {err_msg[:200]}", error=err_msg[:500]
                )
            except Exception:
                pass
            raise  # Still propagate so Celery records the task as FAILURE

    run_async(_run_guarded())
# TASK: ON-DEMAND REEL GENERATION

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
