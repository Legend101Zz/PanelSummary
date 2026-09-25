"""Editions: Generate, progress, pages, cancel, resume, receipts."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.api.library import _check_id, get_book_or_404
from app.documents import Edition, EditionArtifact, EditionPage, GenerationJob, utcnow
from app.settings import get_settings
from app import worker_client

router = APIRouter()

ACTIVE = ("queued", "understanding", "planning", "drawing")


def policy_snapshot() -> dict:
    s = get_settings()
    return {
        "understanding_model": s.understanding_model,
        "understanding_thinking": s.understanding_thinking,
        "plan_model": s.plan_model,
        "plan_thinking": s.plan_thinking,
        "page_model": s.page_model,
        "page_thinking": s.page_thinking,
        "page_vision": s.page_vision,
        "page_attempts": s.page_attempts,
        "retry_thinking": s.retry_thinking,
        "harness": "apps/agent-worker (Pi sealed session) -> MiniMax",
        "image_models": "none",
    }


async def get_edition_or_404(edition_id: str) -> Edition:
    edition = await Edition.get(_check_id(edition_id))
    if edition is None:
        raise HTTPException(status_code=404, detail="Edition not found")
    return edition


async def job_view(job_id: str | None) -> dict | None:
    if not job_id:
        return None
    job = await GenerationJob.get(job_id)
    if job is None:
        return None
    return {
        "id": str(job.id),
        "kind": job.kind,
        "status": job.status,
        "stage": job.stage,
        "done": job.done,
        "total": job.total,
        "message": job.message,
        "error": job.error,
        "events": [{"at": e.at.isoformat(), "stage": e.stage, "message": e.message} for e in job.events[-30:]],
        "created_at": job.created_at.isoformat(),
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }


def edition_view(edition: Edition) -> dict:
    return {
        "id": str(edition.id),
        "book_id": edition.book_id,
        "status": edition.status,
        "page_total": edition.page_total,
        "pages_accepted": edition.pages_accepted,
        "pages_failed": edition.pages_failed,
        "coverage": edition.coverage,
        "totals": edition.totals.model_dump(),
        "policy": edition.policy,
        "error": edition.error,
        "job_id": edition.job_id,
        "created_at": edition.created_at.isoformat(),
        "finished_at": edition.finished_at.isoformat() if edition.finished_at else None,
    }


@router.post("/books/{book_id}/editions")
async def generate(book_id: str) -> dict:
    """The Generate button: start a harness-driven MiniMax adaptation."""
    book = await get_book_or_404(book_id)
    if book.status != "parsed":
        raise HTTPException(status_code=409, detail="The book is not parsed yet")
    running = await Edition.find(Edition.book_id == book_id, {"status": {"$in": list(ACTIVE)}}).first_or_none()
    if running is not None:
        return {"edition": edition_view(running), "job": await job_view(running.job_id), "already_running": True}
    edition = Edition(book_id=book_id, policy=policy_snapshot())
    await edition.insert()
    job = GenerationJob(kind="generate", book_id=book_id, edition_id=str(edition.id), message="Waiting for the generator")
    await job.insert()
    edition.job_id = str(job.id)
    await edition.save()
    return {"edition": edition_view(edition), "job": await job_view(edition.job_id), "already_running": False}


@router.get("/books/{book_id}/editions")
async def list_editions(book_id: str) -> list[dict]:
    await get_book_or_404(book_id)
    editions = await Edition.find(Edition.book_id == book_id).sort("-created_at").to_list()
    return [edition_view(e) for e in editions]


@router.get("/editions/{edition_id}")
async def get_edition(edition_id: str) -> dict:
    edition = await get_edition_or_404(edition_id)
    pages = await EditionPage.find(EditionPage.edition_id == edition_id).sort("+page_number").to_list()
    view = edition_view(edition)
    view["job"] = await job_view(edition.job_id)
    view["pages"] = [
        {
            "page_number": p.page_number,
            "section_id": p.section_id,
            "status": p.status,
            "attempts": p.attempts,
            "beat": p.beat,
            "error": (p.error or {}).get("message") if p.status == "failed" else None,
        }
        for p in pages
    ]
    plan = await EditionArtifact.find_one(EditionArtifact.edition_id == edition_id, EditionArtifact.kind == "plan")
    understanding = await EditionArtifact.find_one(EditionArtifact.edition_id == edition_id, EditionArtifact.kind == "understanding")
    if understanding is not None:
        u = understanding.content
        view["book"] = {
            "title": u.get("title"),
            "author": u.get("author"),
            "logline": u.get("logline"),
            "kind": u.get("kind"),
            "sections": [{"id": s["id"], "title": s["title"]} for s in u.get("sections", [])],
            "cast": [{"id": c["id"], "name": c["name"], "role": c.get("role", "")} for c in u.get("cast", [])],
        }
    view["has_plan"] = plan is not None
    return view


@router.get("/editions/{edition_id}/pages/{page_number}")
async def get_page(edition_id: str, page_number: int) -> dict:
    await get_edition_or_404(edition_id)
    page = await EditionPage.find_one(EditionPage.edition_id == edition_id, EditionPage.page_number == page_number)
    if page is None:
        raise HTTPException(status_code=404, detail="Page not found")
    understanding = await EditionArtifact.find_one(EditionArtifact.edition_id == edition_id, EditionArtifact.kind == "understanding")
    claim_ids = (page.spec or {}).get("claims", page.claims)
    claim_index = {c["id"]: c for c in (understanding.content.get("claims", []) if understanding else [])}
    cast_index = {c["id"]: c.get("name", c["id"]) for c in (understanding.content.get("cast", []) if understanding else [])}
    return {
        "claim_details": [
            {"id": cid, "text": claim_index[cid].get("text", ""), "kind": claim_index[cid].get("kind"), "importance": claim_index[cid].get("importance"), "source": claim_index[cid].get("source", [])}
            for cid in claim_ids
            if cid in claim_index
        ],
        "speakers": {t.get("speaker"): cast_index.get(t.get("speaker"), "") for t in page.texts if t.get("speaker")},
        "page_number": page.page_number,
        "section_id": page.section_id,
        "status": page.status,
        "beat": page.beat,
        "svg": page.svg if page.status == "accepted" else None,
        "svg_hash": page.svg_hash,
        "renderer_version": page.renderer_version,
        "panels": page.panels,
        "texts": page.texts,
        "claims": (page.spec or {}).get("claims", page.claims),
        "sources": [
            {"panel": panel.get("id"), "source": panel.get("source", [])} for panel in (page.spec or {}).get("panels", [])
        ],
        "error": page.error if page.status == "failed" else None,
    }


@router.post("/editions/{edition_id}/cancel")
async def cancel(edition_id: str) -> dict:
    edition = await get_edition_or_404(edition_id)
    if edition.job_id:
        job = await GenerationJob.get(edition.job_id)
        if job is not None and job.status in ("queued", "running"):
            job.cancel_requested = True
            if job.status == "queued":
                job.status = "cancelled"
                job.finished_at = utcnow()
                edition.status = "cancelled"
                await edition.save()
            await job.save()
    return edition_view(edition)


@router.post("/editions/{edition_id}/resume")
async def resume(edition_id: str) -> dict:
    """Continue an edition: reuses every accepted artifact and page."""
    edition = await get_edition_or_404(edition_id)
    if edition.status in ACTIVE:
        return {"edition": edition_view(edition), "job": await job_view(edition.job_id)}
    job = GenerationJob(kind="generate", book_id=edition.book_id, edition_id=edition_id, message="Resuming")
    await job.insert()
    edition.job_id = str(job.id)
    edition.status = "queued"
    edition.error = None
    await edition.save()
    return {"edition": edition_view(edition), "job": await job_view(edition.job_id)}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str) -> dict:
    view = await job_view(_check_id(job_id))
    if view is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return view


@router.get("/editions/{edition_id}/receipts")
async def receipts(edition_id: str) -> dict:
    """Every model call behind this edition, for audit."""
    edition = await get_edition_or_404(edition_id)
    artifacts = await EditionArtifact.find(EditionArtifact.edition_id == edition_id).to_list()
    pages = await EditionPage.find(EditionPage.edition_id == edition_id).sort("+page_number").to_list()
    calls = [a.receipt | {"artifact": a.kind} for a in artifacts]
    for page in pages:
        calls.extend(r | {"page_number": page.page_number} for r in page.receipts)
    try:
        egress = await worker_client.egress()
    except Exception:  # noqa: BLE001 — the worker may be down; say so
        egress = None
    return {"edition_id": edition_id, "totals": edition.totals.model_dump(), "calls": calls, "worker_egress": egress}
