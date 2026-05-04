"""Living panel compatibility routes.

These endpoints preserve the existing living-panel reader while the canonical
manga project pipeline moves to V4 pages. Keeping this as a route module makes
legacy compatibility explicit instead of hiding it inside main.py.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models import BookSummary, LivingPanelDoc

router = APIRouter(tags=["living-panels"])


class LivingPanelRequest(BaseModel):
    api_key: str = ""
    provider: str = "openai"
    model: str = ""


def _static_panel_payload(panel: Any) -> dict[str, Any]:
    """Serialize a stored manga panel into the fallback DSL input shape."""
    return {
        "content_type": panel.content_type,
        "text": panel.text,
        "dialogue": panel.dialogue,
        "character": panel.character,
        "expression": panel.expression,
        "visual_mood": panel.visual_mood,
        "position": panel.position,
    }


def _reconstruct_v4_pages(panels: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Reconstruct V4 pages from legacy flat panel docs when needed."""
    from collections import defaultdict

    by_chapter: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for panel in panels:
        chapter_index = panel.get("chapter_index", 0)
        by_chapter[chapter_index].append(panel)

    pages: list[dict[str, Any]] = []
    page_index = 0
    for chapter_index in sorted(by_chapter):
        chapter_panels = by_chapter[chapter_index]
        for start in range(0, len(chapter_panels), 3):
            batch = chapter_panels[start:start + 3]
            layout = "full" if len(batch) == 1 else "grid-2" if len(batch) == 2 else "grid-3"
            pages.append({
                "version": "4.0",
                "page_index": page_index,
                "chapter_index": chapter_index,
                "layout": layout,
                "panels": batch,
            })
            page_index += 1
    return pages


async def _load_summary_page(summary_id: str, chapter_idx: int, page_idx: int):
    summary = await BookSummary.get(summary_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")
    if chapter_idx >= len(summary.manga_chapters):
        raise HTTPException(status_code=404, detail="Chapter not found")
    chapter = summary.manga_chapters[chapter_idx]
    if page_idx >= len(chapter.pages):
        raise HTTPException(status_code=404, detail="Page not found")
    return summary, chapter, chapter.pages[page_idx]


@router.get("/summary/{summary_id}/living-panels/{chapter_idx}/{page_idx}")
async def get_living_panels(
    summary_id: str,
    chapter_idx: int,
    page_idx: int,
):
    """Get fallback Living Panel DSLs for a specific manga page."""
    _, _, page = await _load_summary_page(summary_id, chapter_idx, page_idx)

    from app.generate_living_panels import generate_fallback_living_panel

    living_panels = [
        generate_fallback_living_panel(_static_panel_payload(panel))
        for panel in page.panels
    ]
    return {
        "chapter_index": chapter_idx,
        "page_index": page_idx,
        "layout": page.layout,
        "living_panels": living_panels,
    }


@router.get("/summary/{summary_id}/all-living-panels")
async def get_all_living_panels(summary_id: str):
    """Get stored Living Panel DSLs or fallback panels for a summary."""
    summary = await BookSummary.get(summary_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")

    panel_docs = await LivingPanelDoc.find(
        LivingPanelDoc.summary_id == summary_id,
    ).sort("+panel_index").to_list()

    if panel_docs:
        engine = getattr(summary, "engine", "v2")
        result: dict[str, Any] = {
            "summary_id": summary_id,
            "total_panels": len(panel_docs),
            "living_panels": [doc.dsl for doc in panel_docs],
            "source": "orchestrator",
            "engine": engine,
        }
        v4_pages = getattr(summary, "v4_pages", None)
        if v4_pages:
            result["v4_pages"] = v4_pages
        elif engine == "v4":
            result["v4_pages"] = _reconstruct_v4_pages([doc.dsl for doc in panel_docs])
        return result

    if summary.living_panels:
        return {
            "summary_id": summary_id,
            "total_panels": len(summary.living_panels),
            "living_panels": summary.living_panels,
            "source": "orchestrator-legacy",
        }

    from app.generate_living_panels import generate_fallback_living_panel

    all_panels = [
        generate_fallback_living_panel(_static_panel_payload(panel))
        for chapter in summary.manga_chapters
        for page in chapter.pages
        for panel in page.panels
    ]
    return {
        "summary_id": summary_id,
        "total_panels": len(all_panels),
        "living_panels": all_panels,
        "source": "fallback",
    }


@router.post("/summary/{summary_id}/living-panels/{chapter_idx}/{page_idx}/generate")
async def generate_living_panels_endpoint(
    summary_id: str,
    chapter_idx: int,
    page_idx: int,
    request: LivingPanelRequest,
):
    """Generate Living Panel DSLs via LLM for a specific legacy manga page."""
    summary, chapter, page = await _load_summary_page(summary_id, chapter_idx, page_idx)

    from app.generate_living_panels import generate_living_panels_for_page
    from app.llm_client import LLMClient

    llm_client = LLMClient(
        api_key=request.api_key,
        provider=request.provider,
        model=request.model or None,
    )
    page_dict = {
        "layout": page.layout,
        "panels": [_static_panel_payload(panel) for panel in page.panels],
    }
    manga_bible = summary.manga_bible.dict() if summary.manga_bible else None
    chapter_summary = None
    if chapter_idx < len(summary.canonical_chapters):
        chapter_summary = summary.canonical_chapters[chapter_idx].dict()

    living_panels = await generate_living_panels_for_page(
        page_data=page_dict,
        style=summary.style,
        llm_client=llm_client,
        manga_bible=manga_bible,
        chapter_summary=chapter_summary,
    )

    last_panel = await LivingPanelDoc.find(
        LivingPanelDoc.summary_id == summary_id,
    ).sort("-panel_index").limit(1).to_list()
    next_index = (last_panel[0].panel_index + 1) if last_panel else 0

    panel_docs = [
        LivingPanelDoc(
            summary_id=summary_id,
            panel_id=f"ch{chapter_idx}-pg{page_idx}-p{i}",
            panel_index=next_index + i,
            dsl=panel_dsl if isinstance(panel_dsl, dict) else {},
            content_type=panel_dsl.get("meta", {}).get("content_type", "") if isinstance(panel_dsl, dict) else "",
            chapter_index=chapter_idx,
        )
        for i, panel_dsl in enumerate(living_panels)
    ]

    if panel_docs:
        await LivingPanelDoc.find(
            LivingPanelDoc.summary_id == summary_id,
            {"panel_id": {"$in": [doc.panel_id for doc in panel_docs]}},
        ).delete()
        await LivingPanelDoc.insert_many(panel_docs)

        summary.panel_count = await LivingPanelDoc.find(
            LivingPanelDoc.summary_id == summary_id,
        ).count()
        await summary.save()

    return {
        "chapter_index": chapter_idx,
        "page_index": page_idx,
        "layout": page.layout,
        "living_panels": living_panels,
    }
