"""Media, PDF preview, and model-list utility routes."""

from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

from app.config import get_settings
from app.models import Book

router = APIRouter(tags=["media"])
settings = get_settings()


@router.get("/image-models")
async def get_image_models():
    """Return supported image generation models."""
    from app.image_generator import DEFAULT_IMAGE_MODEL, IMAGE_GENERATION_MODELS

    return {"models": IMAGE_GENERATION_MODELS, "default": DEFAULT_IMAGE_MODEL}


@router.get("/openrouter/models")
async def get_openrouter_models(api_key: str = ""):
    """Proxy and simplify the OpenRouter model list."""
    key = api_key or settings.openrouter_api_key
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get("https://openrouter.ai/api/v1/models", headers=headers)
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="OpenRouter API error")

        filtered = []
        for model in response.json().get("data", []):
            context_length = model.get("context_length", 0)
            if context_length < 4000:
                continue
            modality = model.get("architecture", {}).get("modality", "text->text")
            if "text" not in modality:
                continue

            pricing = model.get("pricing", {})
            try:
                input_price = float(pricing.get("prompt", "0")) * 1_000_000
                output_price = float(pricing.get("completion", "0")) * 1_000_000
            except (TypeError, ValueError):
                input_price = output_price = 0.0

            filtered.append({
                "id": model["id"],
                "name": model.get("name", model["id"]),
                "context_length": context_length,
                "input_price_per_1m": round(input_price, 4),
                "output_price_per_1m": round(output_price, 4),
                "is_free": input_price == 0 and output_price == 0,
                "provider": model["id"].split("/")[0] if "/" in model["id"] else "unknown",
            })

        filtered.sort(key=lambda item: (not item["is_free"], item["input_price_per_1m"]))
        return {"models": filtered, "total": len(filtered)}
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="OpenRouter request timed out")


@router.get("/images/{image_path:path}")
async def get_image(image_path: str):
    """Serve images from local filesystem relative to settings.image_dir."""
    full_path = os.path.join(settings.image_dir, image_path)
    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(
        full_path,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/books/{book_id}/pdf/info")
async def get_pdf_info(book_id: str):
    """Return PDF metadata needed by the reader."""
    book = await Book.get(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    pdf_path = os.path.join(settings.pdf_dir, f"{book.pdf_hash}.pdf")
    if not os.path.isfile(pdf_path):
        raise HTTPException(status_code=404, detail="PDF file not found on disk")

    import fitz

    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    doc.close()
    return {
        "book_id": book_id,
        "title": book.title,
        "total_pages": total_pages,
        "pdf_hash": book.pdf_hash,
    }


@router.get("/books/{book_id}/pdf/page/{page_num}")
async def get_pdf_page(book_id: str, page_num: int, scale: float = 2.0):
    """Render one PDF page as a PNG, cached on disk."""
    if page_num < 1:
        raise HTTPException(status_code=400, detail="Page numbers start at 1")

    book = await Book.get(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    cache_path = os.path.join(settings.image_dir, book_id, f"pdfpage_{page_num}.png")
    if os.path.isfile(cache_path):
        return FileResponse(
            cache_path,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=604800"},
        )

    pdf_path = os.path.join(settings.pdf_dir, f"{book.pdf_hash}.pdf")
    if not os.path.isfile(pdf_path):
        raise HTTPException(status_code=404, detail="PDF not found on disk")

    import fitz

    doc = fitz.open(pdf_path)
    if page_num > len(doc):
        raise HTTPException(status_code=404, detail=f"Page {page_num} exceeds {len(doc)}")

    page = doc[page_num - 1]
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
    image_bytes = pix.tobytes("png")
    doc.close()

    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with open(cache_path, "wb") as file:
        file.write(image_bytes)

    return Response(
        image_bytes,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=604800"},
    )
