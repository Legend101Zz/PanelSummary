"""Mongo-leased job runner. Run with ``python -m app.runner``.

- Jobs are claimed atomically (queued, or running with an expired lease — the
  previous runner died), so a crash resumes instead of losing work.
- A heartbeat extends the lease and watches ``cancel_requested``.
- Each job kind is idempotent at its own granularity (see parse.py and
  generate.py), so a resumed job never repeats accepted work or its charges.
"""

from __future__ import annotations

import asyncio
import logging
import os
import socket
from datetime import timedelta, timezone

from bson import ObjectId
from pymongo import ReturnDocument

from app.db import init_db
from app.documents import Edition, GenerationJob, JobEvent, RunnerHeartbeat, utcnow
from app.settings import get_settings

logger = logging.getLogger("panelsummary.runner")

RUNNER_ID = f"{socket.gethostname()}:{os.getpid()}"
MAX_EVENTS = 200


class JobCancelled(Exception):
    pass


class ProviderStop(Exception):
    """The model provider refused the work (limit, auth, or unavailable after retries).

    The job stops at once and sends nothing more. ``str(error)`` is the visible reason.
    """

    def __init__(self, code: str, message: str, detail: dict | None = None):
        super().__init__(message)
        self.code = code
        self.detail = detail or {}


class JobContext:
    """Handle a job implementation uses to report progress and observe cancel."""

    def __init__(self, job: GenerationJob):
        self.job = job
        self.cancelled = asyncio.Event()

    async def event(self, stage: str, message: str, *, done: int | None = None, total: int | None = None) -> None:
        update: dict = {"stage": stage, "message": message}
        if done is not None:
            update["done"] = done
        if total is not None:
            update["total"] = total
        entry = JobEvent(stage=stage, message=message).model_dump()
        await GenerationJob.get_motor_collection().update_one(
            {"_id": self.job.id},
            {"$set": update, "$push": {"events": {"$each": [entry], "$slice": -MAX_EVENTS}}},
        )
        logger.info("[%s %s] %s: %s", self.job.kind, self.job.id, stage, message)

    def check_cancel(self) -> None:
        if self.cancelled.is_set():
            raise JobCancelled()


async def claim_job() -> GenerationJob | None:
    settings = get_settings()
    now = utcnow()
    raw = await GenerationJob.get_motor_collection().find_one_and_update(
        {
            "$or": [
                {"status": "queued"},
                {"status": "running", "lease_expires_at": {"$lt": now}},
            ]
        },
        {
            "$set": {
                "status": "running",
                "lease_owner": RUNNER_ID,
                "lease_expires_at": now + timedelta(seconds=settings.job_lease_seconds),
                "started_at": now,
            },
            "$inc": {"attempts": 1},
        },
        sort=[("created_at", 1)],
        return_document=ReturnDocument.AFTER,
    )
    return GenerationJob.model_validate(raw) if raw else None


async def _heartbeat(ctx: JobContext, stop: asyncio.Event) -> None:
    settings = get_settings()
    interval = max(5.0, settings.job_lease_seconds / 3)
    collection = GenerationJob.get_motor_collection()
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass
        raw = await collection.find_one_and_update(
            {"_id": ctx.job.id, "lease_owner": RUNNER_ID},
            {"$set": {"lease_expires_at": utcnow() + timedelta(seconds=settings.job_lease_seconds)}},
            return_document=ReturnDocument.AFTER,
        )
        if raw is None:
            logger.warning("lost lease on job %s", ctx.job.id)
            ctx.cancelled.set()
            return
        if raw.get("cancel_requested"):
            ctx.cancelled.set()


async def finish(job_id, status: str, message: str, error: str | None = None) -> None:
    await GenerationJob.get_motor_collection().update_one(
        {"_id": job_id},
        {
            "$set": {
                "status": status,
                "message": message,
                "error": error,
                "finished_at": utcnow(),
                "lease_owner": None,
                "lease_expires_at": None,
            },
            "$push": {"events": {"$each": [JobEvent(stage=status, message=message).model_dump()], "$slice": -MAX_EVENTS}},
        },
    )


async def beat_runner() -> None:
    """Write the runner heartbeat: one document, updated on every poll (not the job lease).

    ``GET /status`` reads it. A failed write is logged and never stops the runner.
    """
    try:
        await RunnerHeartbeat.get_motor_collection().update_one(
            {"key": "runner"}, {"$set": {"runner_id": RUNNER_ID, "at": utcnow()}}, upsert=True
        )
    except Exception:  # noqa: BLE001 — the heartbeat is information, not work
        logger.warning("could not write the runner heartbeat", exc_info=True)


async def add_active_time(job: GenerationJob) -> None:
    """Add this job's run time to its edition (``active_seconds``). Idle time between jobs is not counted."""
    if job.kind != "generate" or not job.edition_id or job.started_at is None:
        return
    started = job.started_at if job.started_at.tzinfo else job.started_at.replace(tzinfo=timezone.utc)
    seconds = max(0.0, (utcnow() - started).total_seconds())
    try:
        await Edition.get_motor_collection().update_one({"_id": ObjectId(job.edition_id)}, {"$inc": {"active_seconds": seconds}})
    except Exception:  # noqa: BLE001
        logger.warning("could not add the run time to edition %s", job.edition_id, exc_info=True)


async def execute(job: GenerationJob) -> None:
    from app.jobs.generate import mark_cancelled, mark_failed, run_generate_job
    from app.jobs.parse import run_parse_job

    ctx = JobContext(job)
    stop = asyncio.Event()
    beat = asyncio.create_task(_heartbeat(ctx, stop))
    outcome: tuple[str, str, str | None]
    try:
        if job.cancel_requested:
            raise JobCancelled()
        if job.kind == "parse":
            status, message = await run_parse_job(ctx)
        else:
            status, message = await run_generate_job(ctx)
        outcome = (status, message, None)
    except JobCancelled:
        outcome = ("cancelled", "Cancelled", None)
        if job.kind == "generate":
            await mark_cancelled(job)
    except ProviderStop as refused:
        # Not a crash: the provider said no. The reason is the message; resume continues later.
        logger.warning("job %s stopped by the provider (%s)", job.id, refused.code)
        outcome = ("failed", "Stopped: the model provider refused the request", str(refused))
        if job.kind == "generate":
            await mark_failed(job, str(refused), refused.detail | {"code": refused.code})
    except Exception as error:  # noqa: BLE001 — a job failure must be recorded, not lost
        logger.exception("job %s failed", job.id)
        detail = f"{error.__class__.__name__}: {error}"[:2000]
        outcome = ("failed", "Failed", detail)
        if job.kind == "generate":
            await mark_failed(job, detail)
    finally:
        stop.set()
        await beat
    await add_active_time(job)
    await finish(job.id, *outcome)


async def run_forever() -> None:
    settings = get_settings()
    await init_db()
    logger.info("job runner %s started", RUNNER_ID)
    running: set[asyncio.Task] = set()
    max_parallel_jobs = 2
    while True:
        await beat_runner()
        running = {task for task in running if not task.done()}
        if len(running) < max_parallel_jobs:
            job = await claim_job()
            if job is not None:
                running.add(asyncio.create_task(execute(job)))
                continue
        await asyncio.sleep(settings.job_poll_seconds)
