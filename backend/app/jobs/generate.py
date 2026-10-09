"""Generate job: book understanding → adaptation plan → manga pages.

Every model call goes through the agent worker (MiniMax via the sealed Pi
harness). Idempotency:
- an accepted understanding / plan artifact is reused, never regenerated;
- page rows are unique per (edition, page_number); accepted pages are skipped;
- worker run ids are stable per (edition, stage, attempt), so a runner that
  dies mid-call and resumes gets the same worker run instead of a new charge.

Failure stays visible: a page that fails every attempt is stored as
``failed`` with its reasons, and the edition ends ``completed_with_failures``.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from typing import Any, Optional

from app.documents import (
    BookSource,
    Totals,
    Edition,
    EditionArtifact,
    EditionPage,
    GenerationJob,
    LibraryBook,
    utcnow,
)
from app.jobs.runner import JobCancelled, JobContext, ProviderStop
from app.settings import get_settings
from app.worker_client import WorkerOutcome, WorkerUnavailable, cancel_run, run_goal

logger = logging.getLogger("panelsummary.generate")

WORKER_RETRY_DELAYS = [5, 15, 30, 60]

# Machine codes the worker returns when the model provider refused a call (D11).
# LIMIT and AUTH stop the job at once; UNAVAILABLE stops it when the normal retries are used up.
PROVIDER_STOP_NOW = {"PROVIDER_LIMIT", "PROVIDER_AUTH"}
PROVIDER_CODES = PROVIDER_STOP_NOW | {"PROVIDER_UNAVAILABLE"}


def provider_code(outcome: WorkerOutcome) -> str | None:
    code = (outcome.error or {}).get("code")
    return code if outcome.state == "FAILED" and code in PROVIDER_CODES else None


def provider_stop_message(outcome: WorkerOutcome) -> str:
    """The visible reason, in plain words. It carries the provider's own text and no key."""
    error = outcome.error or {}
    code = error.get("code")
    detail = str(error.get("provider_message") or error.get("message") or "no detail").strip().rstrip(".")[:300]
    if code == "PROVIDER_LIMIT":
        return f"MiniMax refused the request: {detail}. Nothing more was sent. Resume when the limit resets or after you add credits."
    if code == "PROVIDER_AUTH":
        return f"MiniMax did not accept the key or the plan: {detail}. Nothing more was sent. Fix the key or the plan, then resume."
    return f"MiniMax was not available: {detail}. Nothing more was sent. Resume when the service is back."


def provider_stop_detail(outcome: WorkerOutcome, **where: Any) -> dict[str, Any]:
    error = outcome.error or {}
    return {
        "code": error.get("code"),
        "type": error.get("provider_type"),
        "http_status": error.get("http_status"),
        "message": error.get("provider_message") or error.get("message"),
        "at": utcnow().isoformat(),
        **where,
    }


def refusals_in(receipts: list[dict[str, Any]]) -> int:
    """How many earlier calls were refused by the provider (their run ids must not be reused)."""
    return sum(1 for r in receipts if ((r.get("error") or {}).get("code")) in PROVIDER_CODES)


def _hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def receipt_from(goal_type: str, run_id: str, outcome: WorkerOutcome) -> dict[str, Any]:
    trace = outcome.trace or {}
    return {
        "goal_type": goal_type,
        "run_id": run_id,
        "state": outcome.state,
        "provider": trace.get("provider"),
        "model": trace.get("model"),
        "thinking": trace.get("thinking"),
        "thinking_sent": trace.get("thinking_sent"),
        "cost_basis": trace.get("cost_basis"),
        "skill": trace.get("skill"),
        "tokens": trace.get("tokens"),
        "cost_usd": trace.get("cost_usd"),
        "latency_ms": trace.get("latency_ms"),
        "turns": trace.get("turns"),
        "submits": trace.get("submits"),
        "tool_calls": trace.get("tool_calls"),
        "text_fallback_used": trace.get("text_fallback_used"),
        "stop_reason": trace.get("stop_reason"),
        "provider_error": trace.get("provider_error"),
        "truncated_turns": trace.get("truncated_turns"),
        "nudges": trace.get("nudges"),
        "last_output_excerpt": trace.get("last_output_excerpt") if outcome.state != "SUCCEEDED" else None,
        "error": outcome.error,
        "at": utcnow().isoformat(),
    }


async def _add_totals(edition_id: str, receipt: dict[str, Any]) -> None:
    tokens = receipt.get("tokens") or {}
    inc = {
        "totals.calls": 1,
        "totals.failed_calls": 0 if receipt.get("state") == "SUCCEEDED" else 1,
        "totals.input_tokens": int(tokens.get("input") or 0),
        "totals.output_tokens": int(tokens.get("output") or 0),
        "totals.cache_read_tokens": int(tokens.get("cache_read") or 0),
        "totals.cache_write_tokens": int(tokens.get("cache_write") or 0),
        "totals.cost_usd": float(receipt.get("cost_usd") or 0.0),
        "totals.model_ms": int(receipt.get("latency_ms") or 0),
    }
    await Edition.get_motor_collection().update_one({"_id": _oid(edition_id)}, {"$inc": inc, "$set": {"updated_at": utcnow()}})


def _oid(value: str):
    from bson import ObjectId

    return ObjectId(value)


# How long a cancelled call may take to come back with its trace.
CANCEL_TRACE_WAIT_SECONDS = 20


async def _call(ctx: JobContext, goal_type: str, run_id: str, payload: dict[str, Any], *, model: str, thinking: str, vision: bool = False) -> WorkerOutcome:
    """Call the worker; retry only when the worker itself is unavailable."""
    for delay in [*WORKER_RETRY_DELAYS, None]:
        ctx.check_cancel()
        call = asyncio.create_task(run_goal(goal_type, run_id, payload, model=model, thinking=thinking, vision=vision))
        cancel_wait = asyncio.create_task(ctx.cancelled.wait())
        done, _ = await asyncio.wait({call, cancel_wait}, return_when=asyncio.FIRST_COMPLETED)
        if cancel_wait in done and call not in done:
            await cancel_run(run_id)
            # The worker answers a cancelled run with its trace (tokens already spent):
            # return it so the caller records the receipt before stopping.
            finished, _ = await asyncio.wait({call}, timeout=CANCEL_TRACE_WAIT_SECONDS)
            if call in finished and call.exception() is None:
                return call.result()
            call.cancel()
            raise JobCancelled()
        cancel_wait.cancel()
        try:
            return call.result()
        except WorkerUnavailable as error:
            if delay is None:
                raise
            logger.warning("worker unavailable for %s (%s); retrying in %ss", run_id, error, delay)
            await asyncio.sleep(delay)
    raise RuntimeError("unreachable")


def _book_payload(book: LibraryBook, source: BookSource) -> dict[str, Any]:
    return {
        "title": source.title or book.title,
        "author": source.author or book.author,
        "page_count": source.page_count,
        "sections": source.sections,
        "units": [
            {k: unit[k] for k in ("id", "section_id", "page_start", "page_end", "text")}
            for unit in source.units
        ],
    }


async def _set_edition(edition: Edition, **fields: Any) -> None:
    """Partial update: never overwrite counters other writers increment ($inc totals)."""
    fields["updated_at"] = utcnow()
    for key, value in fields.items():
        setattr(edition, key, value)
    payload = {key: (value.model_dump() if hasattr(value, "model_dump") else value) for key, value in fields.items()}
    await Edition.get_motor_collection().update_one({"_id": edition.id}, {"$set": payload})


async def _mark_timing(edition_id: str, key: str) -> None:
    """Record when a milestone first happened (``timings.<key>``). The first value stays.

    A resumed job keeps the first value, so the timings describe the edition's first
    pass. The milestones are read from the database; they do not change any receipt.
    """
    await Edition.get_motor_collection().update_one(
        {"_id": _oid(edition_id), f"timings.{key}": {"$exists": False}}, {"$set": {f"timings.{key}": utcnow()}}
    )


async def _recompute_totals(edition_id: str) -> dict[str, Any]:
    """Exact totals from every stored receipt (artifacts, failed stage attempts, every page attempt)."""
    totals = {"calls": 0, "failed_calls": 0, "input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0, "cache_write_tokens": 0, "cost_usd": 0.0, "model_ms": 0}
    receipts = [a.receipt for a in await EditionArtifact.find(EditionArtifact.edition_id == edition_id).to_list()]
    edition = await Edition.get(_oid(edition_id))
    if edition is not None:
        receipts.extend(edition.stage_failures)
    for page in await EditionPage.find(EditionPage.edition_id == edition_id).to_list():
        receipts.extend(page.receipts)
    for receipt in receipts:
        tokens = receipt.get("tokens") or {}
        totals["calls"] += 1
        totals["failed_calls"] += 0 if receipt.get("state") == "SUCCEEDED" else 1
        totals["input_tokens"] += int(tokens.get("input") or 0)
        totals["output_tokens"] += int(tokens.get("output") or 0)
        totals["cache_read_tokens"] += int(tokens.get("cache_read") or 0)
        totals["cache_write_tokens"] += int(tokens.get("cache_write") or 0)
        totals["cost_usd"] += float(receipt.get("cost_usd") or 0.0)
        totals["model_ms"] += int(receipt.get("latency_ms") or 0)
    totals["cost_usd"] = round(totals["cost_usd"], 6)
    return totals


async def _artifact_stage(
    ctx: JobContext,
    edition: Edition,
    kind: str,
    goal_type: str,
    payload: dict[str, Any],
    *,
    model: str,
    thinking: str,
    retry_thinking: str,
    extract,
) -> EditionArtifact:
    existing = await EditionArtifact.find_one(EditionArtifact.edition_id == str(edition.id), EditionArtifact.kind == kind)
    if existing is not None:
        await ctx.event(kind, f"Reusing the accepted {kind}")
        return existing
    last_error = "unknown error"
    previous = await Edition.get(_oid(str(edition.id)))
    refused_before = refusals_in([r for r in (previous.stage_failures if previous else []) if r.get("artifact") == kind])
    for attempt in range(1, 3):
        # a stage refused by the provider before is called again under a new run id (resume)
        run_id = f"{edition.id}-{kind}-a{attempt}" + (f"-r{refused_before}" if refused_before else "")
        await ctx.event(kind, f"MiniMax is working on the {kind} (attempt {attempt})")
        attempt_thinking = thinking if attempt == 1 else retry_thinking
        outcome = await _call(ctx, goal_type, run_id, payload, model=model, thinking=attempt_thinking)
        receipt = receipt_from(goal_type, run_id, outcome)
        await _add_totals(str(edition.id), receipt)
        if not (outcome.state == "SUCCEEDED" and outcome.result):
            await Edition.get_motor_collection().update_one(
                {"_id": _oid(str(edition.id))}, {"$push": {"stage_failures": receipt | {"artifact": kind}}}
            )
        if outcome.state == "SUCCEEDED" and outcome.result:
            content = extract(outcome.result)
            artifact = EditionArtifact(
                edition_id=str(edition.id),
                kind=kind,  # type: ignore[arg-type]
                schema_id=str(content.get("schema", "")),
                content=content,
                content_hash=_hash(content),
                receipt=receipt,
            )
            await artifact.insert()
            return artifact
        if outcome.state == "CANCELLED":
            raise JobCancelled()
        last_error = (outcome.error or {}).get("message", "failed")
        code = provider_code(outcome)
        if code in PROVIDER_STOP_NOW or (code == "PROVIDER_UNAVAILABLE" and attempt == 2):
            # No second attempt against a dead quota or a bad key.
            reason = provider_stop_message(outcome)
            await ctx.event(kind, reason)
            raise ProviderStop(code, reason, provider_stop_detail(outcome, stage=kind))
        await ctx.event(kind, f"The {kind} attempt {attempt} failed: {last_error[:300]}")
    raise RuntimeError(f"{kind} failed after 2 attempts: {last_error}")


async def _record_policy(edition: Edition, settings: Any) -> dict[str, Any]:
    """Make sure the edition records model, thinking and retry thinking for every goal (D13).

    An edition made before the per-goal retry settings has only the old keys. Missing keys are
    filled from the legacy ``retry_thinking`` (page and plan goals) and from the current settings
    (understanding). Keys already recorded are never changed, so a resumed edition keeps the
    policy it started with.
    """
    policy = dict(edition.policy)
    legacy = policy.get("retry_thinking")
    defaults = settings.policy_fields()
    if legacy and legacy != settings.retry_thinking:  # an older edition: keep the level it recorded
        defaults["plan_retry_thinking"] = legacy
        defaults["page_retry_thinking"] = legacy
    changed = {key: value for key, value in defaults.items() if key not in policy or policy[key] is None}
    if changed:
        policy.update(changed)
        await Edition.get_motor_collection().update_one(
            {"_id": _oid(str(edition.id))}, {"$set": {f"policy.{key}": value for key, value in changed.items()}}
        )
        edition.policy = policy
    return policy


async def run_generate_job(ctx: JobContext) -> tuple[str, str]:
    settings = get_settings()
    job = ctx.job
    edition = await Edition.get(job.edition_id)
    book = await LibraryBook.get(job.book_id)
    source = await BookSource.find_one(BookSource.book_id == job.book_id)
    if edition is None or book is None or source is None:
        raise RuntimeError("edition, book or parsed source is missing")
    policy = await _record_policy(edition, settings)
    await _mark_timing(str(edition.id), "generate_started_at")

    # 1. Book understanding (whole text, one MiniMax session).
    await _set_edition(edition, status="understanding", error=None)
    book_payload = _book_payload(book, source)
    understanding_artifact = await _artifact_stage(
        ctx,
        edition,
        "understanding",
        "BOOK_UNDERSTANDING",
        {"book": book_payload},
        model=policy["understanding_model"],
        thinking=policy["understanding_thinking"],
        retry_thinking=policy["understanding_retry_thinking"],
        extract=lambda result: result["understanding"],
    )
    understanding = understanding_artifact.content
    await _set_edition(edition, understanding_id=str(understanding_artifact.id))

    # 2. Adaptation plan.
    await _set_edition(edition, status="planning")
    plan_artifact = await _artifact_stage(
        ctx,
        edition,
        "plan",
        "ADAPTATION_PLAN",
        {"book": book_payload, "understanding": understanding},
        model=policy["plan_model"],
        thinking=policy["plan_thinking"],
        retry_thinking=policy["plan_retry_thinking"],
        extract=lambda result: {**result["plan"], "page_budget": result.get("page_budget")},
    )
    plan = plan_artifact.content
    planned_pages: list[dict[str, Any]] = plan["pages"]
    await _set_edition(edition, plan_id=str(plan_artifact.id), page_total=len(planned_pages), status="drawing", pages_failed=0)
    await _mark_timing(str(edition.id), "drawing_started_at")

    # 3. Page rows (unique per edition + page number).
    collection = EditionPage.get_motor_collection()
    for planned in planned_pages:
        await collection.update_one(
            {"edition_id": str(edition.id), "page_number": planned["page_number"]},
            {
                "$setOnInsert": {
                    "edition_id": str(edition.id),
                    "page_number": planned["page_number"],
                    "section_id": planned["section_id"],
                    "beat": planned.get("beat", ""),
                    "claims": planned.get("claims", []),
                    "units": planned.get("units", []),
                    "status": "pending",
                    "attempts": 0,
                    "receipts": [],
                    "panels": [],
                    "texts": [],
                    "warnings": [],
                    "created_at": utcnow(),
                    "updated_at": utcnow(),
                }
            },
            upsert=True,
        )
    # Pages left "drawing" by a dead runner go back to pending.
    await collection.update_many({"edition_id": str(edition.id), "status": "drawing"}, {"$set": {"status": "pending"}})
    # A resumed edition retries failed pages with a fresh attempt budget.
    await collection.update_many({"edition_id": str(edition.id), "status": "failed"}, {"$set": {"status": "pending", "attempts": 0}})

    units_by_id = {unit["id"]: unit for unit in book_payload["units"]}
    semaphore = asyncio.Semaphore(max(1, settings.page_concurrency))
    progress = {"done": await EditionPage.find(EditionPage.edition_id == str(edition.id), EditionPage.status == "accepted").count()}
    await ctx.event("drawing", f"{progress['done']} of {len(planned_pages)} pages ready", done=progress["done"], total=len(planned_pages))

    # Circuit breaker (D11): the first provider refusal that must stop the job lands here. After that no
    # page starts a new call. Accepted pages stay accepted; pages never tried stay pending.
    breaker: dict[str, Any] = {"stop": None}

    async def draw(planned: dict[str, Any]) -> None:
        number = planned["page_number"]
        async with semaphore:
            ctx.check_cancel()
            if breaker["stop"] is not None:
                return
            page = await EditionPage.find_one(EditionPage.edition_id == str(edition.id), EditionPage.page_number == number)
            if page is None or page.status == "accepted":
                return
            previous = await EditionPage.find_one(EditionPage.edition_id == str(edition.id), EditionPage.page_number == number - 1)
            previous_info: Optional[dict[str, Any]] = None
            if previous is not None and previous.status == "accepted" and previous.spec:
                last = (previous.spec.get("panels") or [{}])[-1]
                previous_info = {"template": (previous.spec.get("layout") or {}).get("template"), "last_panel": last.get("beat")}
            payload = {
                "book": {"title": book_payload["title"], "author": book_payload["author"]},
                "understanding": understanding,
                "plan": {"pages": planned_pages, "omitted": plan.get("omitted", [])},
                "page_number": number,
                "units": [units_by_id[u] for u in planned.get("units", []) if u in units_by_id],
                "previous": previous_info,
            }
            while page.attempts < settings.page_attempts:
                ctx.check_cancel()
                if breaker["stop"] is not None:
                    # Another page met a provider refusal. Send nothing more; this page can be drawn on resume.
                    if page.status == "drawing":
                        page.status = "pending"
                        page.updated_at = utcnow()
                        await page.save()
                    return
                page.attempts += 1
                page.status = "drawing"
                page.updated_at = utcnow()
                await page.save()
                # A page refused by the provider before is called again under a new run id (resume).
                refused_before = refusals_in(page.receipts)
                run_id = f"{edition.id}-page{number}-a{page.attempts}" + (f"-r{refused_before}" if refused_before else "")
                outcome = await _call(
                    ctx,
                    "MANGA_PAGE",
                    run_id,
                    payload,
                    model=policy["page_model"],
                    thinking=policy["page_thinking"] if page.attempts == 1 else policy["page_retry_thinking"],
                    vision=bool(policy.get("page_vision")),
                )
                receipt = receipt_from("MANGA_PAGE", run_id, outcome)
                await _add_totals(str(edition.id), receipt)
                page.receipts.append(receipt)
                if outcome.state == "SUCCEEDED" and outcome.result:
                    render = outcome.result["render"]
                    page.status = "accepted"
                    page.spec = outcome.result["spec"]
                    page.svg = render["svg"]
                    page.svg_hash = render["svg_hash"]
                    page.renderer_version = render["renderer_version"]
                    page.panels = render["panels"]
                    page.texts = render["texts"]
                    page.warnings = [issue for issue in render.get("issues", []) if issue.get("severity") == "warning"]
                    page.error = None
                    page.updated_at = utcnow()
                    await page.save()
                    progress["done"] += 1
                    # The moment a page first becomes readable in the reader (the stored page is final).
                    await _mark_timing(str(edition.id), "first_page_at")
                    await Edition.get_motor_collection().update_one(
                        {"_id": edition.id}, {"$set": {"pages_accepted": progress["done"], "updated_at": utcnow()}}
                    )
                    await ctx.event("drawing", f"Page {number} is ready ({progress['done']} of {len(planned_pages)})", done=progress["done"])
                    return
                if outcome.state == "CANCELLED":
                    page.status = "pending"
                    await page.save()
                    raise JobCancelled()
                code = provider_code(outcome)
                if code in PROVIDER_STOP_NOW or (code == "PROVIDER_UNAVAILABLE" and page.attempts >= settings.page_attempts):
                    # The provider refused, not the model: this is no model failure. The receipt is kept (D12),
                    # the page goes back to pending with its attempt given back, and the job stops.
                    page.status = "pending"
                    page.attempts = max(0, page.attempts - 1)
                    page.error = None
                    page.updated_at = utcnow()
                    await page.save()
                    reason = provider_stop_message(outcome)
                    if breaker["stop"] is None:
                        breaker["stop"] = ProviderStop(code, reason, provider_stop_detail(outcome, stage="drawing", page=number))
                        await ctx.event("drawing", f"Page {number}: {reason}")
                    return
                page.error = outcome.error or {"message": "failed"}
                page.updated_at = utcnow()
                await page.save()
                await ctx.event("drawing", f"Page {number} attempt {page.attempts} failed: {str(page.error.get('message'))[:200]}")
            page.status = "failed"
            page.updated_at = utcnow()
            await page.save()
            await Edition.get_motor_collection().update_one({"_id": edition.id}, {"$inc": {"pages_failed": 1}})

    results = await asyncio.gather(*(draw(p) for p in sorted(planned_pages, key=lambda p: p["page_number"])), return_exceptions=True)
    for result in results:
        if isinstance(result, JobCancelled):
            raise result
        if isinstance(result, BaseException):
            raise result
    if breaker["stop"] is not None:
        raise breaker["stop"]

    # 4. Coverage + final status.
    return await finalize(edition, understanding, plan, [str(section["id"]) for section in source.sections])


async def finalize(
    edition: Edition, understanding: dict[str, Any], plan: dict[str, Any], book_sections: list[str] | None = None
) -> tuple[str, str]:
    pages = await EditionPage.find(EditionPage.edition_id == str(edition.id)).sort("+page_number").to_list()
    accepted = [p for p in pages if p.status == "accepted"]
    failed = [p for p in pages if p.status != "accepted"]
    conveyed = {claim for p in accepted for claim in ((p.spec or {}).get("claims") or [])}
    planned_claims = {claim: p.page_number for p in pages for claim in p.claims}
    omitted = {entry["claim"]: entry.get("reason", "") for entry in plan.get("omitted", [])}
    claims = understanding.get("claims", [])
    report = {
        "claims_total": len(claims),
        "conveyed": sorted(conveyed),
        "lost_to_failed_pages": sorted(c for c, n in planned_claims.items() if c not in conveyed),
        "omitted_by_plan": [{"claim": c, "reason": r} for c, r in omitted.items()],
        "not_planned": sorted(
            c["id"] for c in claims if c["id"] not in planned_claims and c["id"] not in omitted
        ),
        "required_not_planned": sorted(
            c["id"]
            for c in claims
            if c.get("importance") in ("core", "supporting") and c["id"] not in planned_claims and c["id"] not in omitted
        ),
        "core_not_conveyed": sorted(
            c["id"] for c in claims if c.get("importance") == "core" and c["id"] not in conveyed and c["id"] not in omitted
        ),
        # A part of the book with no claims was adapted with nothing to convey
        # (acceptance run 6: the understanding had no claims for its last tale).
        "sections_without_claims": [
            section for section in (book_sections or []) if not any(c.get("section_id") == section for c in claims)
        ],
    }
    status = (
        "complete"
        if not failed
        and not report["core_not_conveyed"]
        and not report["required_not_planned"]
        and not report["sections_without_claims"]
        else "completed_with_failures"
    )
    await _set_edition(
        edition,
        status=status,
        totals=Totals(**await _recompute_totals(str(edition.id))),
        pages_accepted=len(accepted),
        pages_failed=len(failed),
        coverage=report,
        finished_at=utcnow(),
    )
    message = f"{len(accepted)} of {len(pages)} pages accepted"
    if failed:
        message += f"; {len(failed)} failed: pages {', '.join(str(p.page_number) for p in failed)}"
    return ("succeeded" if status == "complete" else "completed_with_failures"), message


async def mark_cancelled(job: GenerationJob) -> None:
    edition = await Edition.get(job.edition_id) if job.edition_id else None
    if edition is not None:
        await EditionPage.get_motor_collection().update_many(
            {"edition_id": str(edition.id), "status": "drawing"}, {"$set": {"status": "pending"}}
        )
        await _set_edition(edition, status="cancelled")


async def mark_failed(job: GenerationJob, message: str, provider_stop: dict[str, Any] | None = None) -> None:
    edition = await Edition.get(job.edition_id) if job.edition_id else None
    if edition is not None:
        await EditionPage.get_motor_collection().update_many(
            {"edition_id": str(edition.id), "status": "drawing"}, {"$set": {"status": "pending"}}
        )
        if provider_stop is None:
            await _set_edition(edition, status="failed", error=message)
            return
        # The provider refused: show it as itself, with exact counters. Pages never tried stay pending.
        pages = await EditionPage.find(EditionPage.edition_id == str(edition.id)).to_list()
        await _set_edition(
            edition,
            status="failed",
            error=message,
            provider_stop=provider_stop,
            totals=Totals(**await _recompute_totals(str(edition.id))),
            pages_accepted=sum(1 for p in pages if p.status == "accepted"),
            pages_failed=sum(1 for p in pages if p.status == "failed"),
            finished_at=utcnow(),
        )
