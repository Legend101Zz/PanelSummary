"""Small operational routes for credits and job cancellation."""

from __future__ import annotations

from datetime import datetime

import httpx
from fastapi import APIRouter, HTTPException

from app.models import JobStatus

router = APIRouter(tags=["jobs"])


@router.get("/credits")
async def check_credits(api_key: str):
    """Check OpenRouter credits for the given API key."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                "https://openrouter.ai/api/v1/credits",
                headers={"Authorization": f"Bearer {api_key}"},
            )
        if response.status_code != 200:
            return {"error": f"OpenRouter returned {response.status_code}"}

        data = response.json().get("data", {})
        total = data.get("total_credits", 0)
        used = data.get("total_usage", 0)
        return {
            "total_credits": total,
            "used_credits": used,
            "remaining_credits": round(total - used, 4),
        }
    except Exception as exc:
        return {"error": str(exc)}


@router.post("/jobs/{task_id}/cancel")
async def cancel_job(task_id: str):
    """Mark a running generation job as cancelled."""
    job = await JobStatus.find_one(JobStatus.celery_task_id == task_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status in ("success", "failure"):
        return {"message": f"Job already {job.status}", "cancelled": False}

    job.status = "cancelled"
    job.message = "Cancelled by user"
    job.updated_at = datetime.utcnow()
    await job.save()

    return {"message": "Job cancellation requested", "cancelled": True}
