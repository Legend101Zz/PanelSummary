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
from datetime import timedelta

from pymongo import ReturnDocument

from app.db import init_db
from app.documents import GenerationJob, JobEvent, utcnow
from app.settings import get_settings

logger = logging.getLogger("panelsummary.runner")

RUNNER_ID = f"{socket.gethostname()}:{os.getpid()}"
MAX_EVENTS = 200


class JobCancelled(Exception):
    pass


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
    except Exception as error:  # noqa: BLE001 — a job failure must be recorded, not lost
        logger.exception("job %s failed", job.id)
        detail = f"{error.__class__.__name__}: {error}"[:2000]
        outcome = ("failed", "Failed", detail)
        if job.kind == "generate":
            await mark_failed(job, detail)
    finally:
        stop.set()
        await beat
    await finish(job.id, *outcome)


async def run_forever() -> None:
    settings = get_settings()
    await init_db()
    logger.info("job runner %s started", RUNNER_ID)
    running: set[asyncio.Task] = set()
    max_parallel_jobs = 2
    while True:
        running = {task for task in running if not task.done()}
        if len(running) < max_parallel_jobs:
            job = await claim_job()
            if job is not None:
                running.add(asyncio.create_task(execute(job)))
                continue
        await asyncio.sleep(settings.job_poll_seconds)
