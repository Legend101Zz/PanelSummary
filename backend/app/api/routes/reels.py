"""Text reels and rendered video reel routes."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config import get_settings
from app.models import (
    Book,
    BookReelMemory,
    BookSummary,
    JobStatus,
    ProcessingStatus,
    VideoReelDoc,
)

router = APIRouter(tags=["reels"])


class GenerateReelsRequest(BaseModel):
    api_key: str
    provider: str = "openrouter"
    model: Optional[str] = None


class GenerateVideoReelRequest(BaseModel):
    api_key: str
    provider: str = "openrouter"
    model: Optional[str] = None


@router.post("/summary/{summary_id}/generate-reels")
async def generate_reels_for_summary(summary_id: str, request: GenerateReelsRequest):
    """Trigger on-demand reel generation for a complete manga summary."""
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
    await JobStatus(
        celery_task_id=task.id,
        job_type="generate_reels",
        status="pending",
        progress=0,
        message="Starting reel generation...",
        result_id=summary_id,
    ).insert()

    return {"task_id": task.id, "message": "Reel generation started"}


@router.get("/reels")
async def get_all_reels(
    limit: int = 20,
    offset: int = 0,
    style: Optional[str] = None,
):
    """Get text reels from all completed summaries for infinite scroll."""
    summaries = await BookSummary.find(
        BookSummary.status == ProcessingStatus.COMPLETE,
    ).to_list()

    all_reels = []
    for summary in summaries:
        book = await Book.get(summary.book_id)
        book_info = _book_info(book)

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
                "total_reels_in_book": len(summary.reels),
            })

    total = len(all_reels)
    page = all_reels[offset:offset + limit]
    return {
        "reels": page,
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": offset + limit < total,
    }


@router.post("/summary/{summary_id}/generate-video-reel")
async def generate_video_reel(summary_id: str, request: GenerateVideoReelRequest):
    """Generate one rendered video reel from unused summary content."""
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
    await JobStatus(
        celery_task_id=task.id,
        job_type="generate_video_reel",
        status="pending",
        progress=0,
        message="Starting video reel generation...",
        result_id=summary_id,
    ).insert()

    return {"task_id": task.id, "message": "Video reel generation started"}


@router.get("/video-reels/renderer-status")
async def check_renderer_status():
    """Check if the reel renderer is set up and ready."""
    from app.reel_engine.renderer import check_renderer_ready

    ready, message = check_renderer_ready()
    return {"ready": ready, "message": message}


@router.get("/video-reels/{book_id}")
async def get_video_reels_for_book(book_id: str):
    """Get all video reels for a specific book."""
    reels = await VideoReelDoc.find(
        VideoReelDoc.book_id == book_id,
    ).sort("reel_index").to_list()

    book_info = _book_info(await Book.get(book_id))
    return {
        "book": book_info,
        "reels": [_serialize_video_reel(reel, book_info) for reel in reels],
        "total": len(reels),
    }


def _book_info(book) -> dict:
    if not book:
        return {}
    return {
        "id": str(book.id),
        "title": book.title,
        "author": book.author,
        "cover_image_id": book.cover_image_id,
    }


def _serialize_video_reel(reel, book_info: dict | None = None, total_in_book: int | None = None) -> dict:
    """Serialize a VideoReelDoc to API response dict."""
    result = {
        "id": str(reel.id),
        "reel_index": reel.reel_index,
        "title": reel.title,
        "mood": reel.mood,
        "duration_ms": reel.duration_ms,
        "video_path": reel.video_path if reel.render_status == "complete" else "",
        "render_status": reel.render_status,
        "created_at": reel.created_at.isoformat(),
    }
    if reel.dsl:
        result["dsl"] = reel.dsl
    if book_info:
        result["book"] = book_info
    if total_in_book is not None:
        result["total_reels_in_book"] = total_in_book
    return result


@router.get("/video-reels")
async def get_all_video_reels(limit: int = 20, offset: int = 0):
    """Get video reels from all books for the infinite vertical feed."""
    all_reels = []
    reels = await VideoReelDoc.find().sort("-created_at").to_list()

    for reel in reels:
        book_info = _book_info(await Book.get(reel.book_id))
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


@router.get("/video-reels/{book_id}/{reel_id}/video")
async def serve_video_reel(book_id: str, reel_id: str):
    """Serve the rendered MP4 video file."""
    reel = await VideoReelDoc.get(reel_id)
    if not reel or reel.book_id != book_id:
        raise HTTPException(status_code=404, detail="Reel not found")
    if reel.render_status != "complete" or not reel.video_path:
        raise HTTPException(status_code=404, detail="Video not yet rendered")

    video_file = _video_file_path(reel.video_path)
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


@router.delete("/video-reels/{book_id}/{reel_id}")
async def delete_video_reel(book_id: str, reel_id: str):
    """Delete a single video reel and its rendered video file."""
    reel = await VideoReelDoc.get(reel_id)
    if not reel or reel.book_id != book_id:
        raise HTTPException(status_code=404, detail="Reel not found")

    if reel.video_path:
        video_file = _video_file_path(reel.video_path)
        if video_file.exists():
            video_file.unlink()

    if reel.source_content_ids:
        memory = await BookReelMemory.find_one(BookReelMemory.book_id == book_id)
        if memory:
            memory.used_content_ids = [
                content_id
                for content_id in memory.used_content_ids
                if content_id not in reel.source_content_ids
            ]
            memory.total_reels_generated = max(0, memory.total_reels_generated - 1)
            memory.exhausted = False
            await memory.save()

    await reel.delete()
    return {"ok": True, "message": "Reel deleted"}


@router.get("/video-reels/memory/{book_id}")
async def get_reel_memory(book_id: str):
    """Check how much source content remains for reel generation."""
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


def _video_file_path(video_path: str) -> Path:
    settings = get_settings()
    storage_base = settings.storage_dir or str(Path(settings.pdf_dir).parent)
    return Path(storage_base) / video_path
