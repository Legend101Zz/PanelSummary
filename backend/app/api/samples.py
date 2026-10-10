"""Built-in samples: list them, install one. No model call, no spend (S2)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response

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


@router.get("/samples/{sample_id}/preview")
async def sample_preview(sample_id: str) -> dict:
    """Sample data for the first run and the landing, straight from the package. Installs nothing, writes nothing."""
    data = samples.preview(sample_id)
    if data is None:
        raise HTTPException(status_code=404, detail="No such sample")
    return data


@router.get("/samples/{sample_id}/pdf/page/{page_num}")
async def sample_pdf_page(sample_id: str, page_num: int) -> Response:
    """One PDF page of the sample as a PNG, for the landing proof before the sample is installed. Writes nothing."""
    png = samples.render_pdf_page(sample_id, page_num)
    if png is None:
        raise HTTPException(status_code=404, detail="No such sample page")
    return Response(png, media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})
