"""Built-in samples: list them, install one. No model call, no spend (S2)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app import samples

router = APIRouter()


@router.get("/samples")
async def list_samples() -> list[dict]:
    out = []
    for sample_id in samples.list_sample_ids():
        info = samples.sample_info(sample_id)
        assert info is not None
        out.append({"id": sample_id, "title": info.title, **await samples.installed_state(sample_id)})
    return out


@router.post("/samples/{sample_id}")
async def install_sample(sample_id: str) -> dict:
    if samples.sample_info(sample_id) is None:
        raise HTTPException(status_code=404, detail="No such sample")
    return await samples.install_sample(sample_id)
