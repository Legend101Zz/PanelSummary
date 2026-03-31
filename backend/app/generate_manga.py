"""
generate_manga.py — Page-Based Manga Generation
=================================================
Generates manga PAGES (not individual panels).
Each page is a CSS grid layout filled with content cells.

KEY PHILOSOPHY:
We are NOT generating images — we are generating a STRUCTURED
STORYTELLING SYSTEM where visuals are one component, not the core.
Most panels are text/dialogue with CSS mood backgrounds.
Only 1 "splash" panel per chapter gets an actual AI image.
"""

import logging
from app.llm_client import LLMClient
from app.prompts import get_manga_pages_prompt, format_summary_for_manga
from app.models import (
    PagePanel, MangaPage, MangaChapterSummary, SummaryStyle,
)

logger = logging.getLogger(__name__)

# Valid positions for each layout
LAYOUT_POSITIONS = {
    "full":    {"main"},
    "2-row":   {"top", "bottom"},
    "3-row":   {"top", "middle", "bottom"},
    "2-col":   {"left", "right"},
    "L-shape": {"main", "side-top", "side-bottom"},
    "T-shape": {"top", "bottom-left", "bottom-right"},
    "grid-4":  {"tl", "tr", "bl", "br"},
}


def _validate_page(page_data: dict) -> MangaPage | None:
    """Validate and construct a MangaPage from raw LLM output."""
    layout = page_data.get("layout", "full")
    if layout not in LAYOUT_POSITIONS:
        layout = "full"

    valid_positions = LAYOUT_POSITIONS[layout]
    panels = []

    for p in page_data.get("panels", []):
        if not isinstance(p, dict):
            continue
        pos = p.get("position", "main")
        # Remap common LLM mistakes
        if pos not in valid_positions:
            # Try to pick a valid position that hasn't been used
            used = {pp.position for pp in panels}
            available = valid_positions - used
            pos = next(iter(available)) if available else next(iter(valid_positions))

        panels.append(PagePanel(
            position=pos,
            content_type=p.get("content_type", "narration"),
            text=p.get("text"),
            dialogue=p.get("dialogue", []),
            visual_mood=p.get("visual_mood", "dramatic-dark"),
            character=p.get("character"),
            expression=p.get("expression", "neutral"),
            image_prompt=p.get("image_prompt"),
            image_id=p.get("image_id"),
        ))

    if not panels:
        return None

    return MangaPage(
        page_index=page_data.get("page_index", 0),
        layout=layout,
        panels=panels,
    )


async def generate_manga_chapter(
    canonical_summary: dict,
    style: SummaryStyle,
    llm_client: LLMClient,
    manga_bible: dict = None,
) -> MangaChapterSummary:
    """Generate manga pages for a single chapter."""
    system_prompt = get_manga_pages_prompt(style)
    user_message = format_summary_for_manga(canonical_summary, manga_bible=manga_bible)

    chapter_title = canonical_summary.get('chapter_title', 'Unknown')
    logger.info(f"Generating manga pages for: {chapter_title}")

    result = await llm_client.chat_with_retry(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=6000,
        temperature=0.8,
        json_mode=True,
    )

    parsed = result.get("parsed") or {}
    pages_raw = parsed.get("pages", []) if isinstance(parsed, dict) else []
    # Handle if LLM returns array directly
    if isinstance(parsed, list):
        pages_raw = parsed

    pages = []
    for pd in pages_raw:
        if not isinstance(pd, dict):
            continue
        page = _validate_page(pd)
        if page:
            pages.append(page)

    if not pages:
        logger.warning(f"No pages generated for '{chapter_title}', using fallback")
        pages = _generate_fallback_pages(canonical_summary, manga_bible)

    # Ensure splash count is exactly 1
    splash_count = sum(
        1 for page in pages for panel in page.panels
        if panel.content_type == "splash"
    )
    if splash_count == 0:
        # Add a splash to the first page
        if pages and pages[0].panels:
            pages[0].panels[0].content_type = "splash"
            if not pages[0].panels[0].image_prompt:
                pages[0].panels[0].image_prompt = f"Dramatic manga-style illustration for '{chapter_title}'. Dynamic composition, bold contrast."

    return MangaChapterSummary(
        chapter_index=canonical_summary.get("chapter_index", 0),
        chapter_title=chapter_title,
        pages=pages,
        style=style,
    )


def _generate_fallback_pages(
    canonical_summary: dict,
    manga_bible: dict = None,
) -> list[MangaPage]:
    """Fallback pages when LLM generation fails."""
    title = canonical_summary.get("chapter_title", "Chapter")
    one_liner = canonical_summary.get("one_liner", "")
    key_concepts = canonical_summary.get("key_concepts", [])
    dramatic = canonical_summary.get("dramatic_moment", one_liner)
    narrative = canonical_summary.get("narrative_summary", "")

    protagonist = "Kai"
    mentor = "The Sage"
    if manga_bible:
        for c in manga_bible.get("characters", []):
            if c.get("role") == "protagonist":
                protagonist = c.get("name", protagonist)
            elif c.get("role") == "mentor":
                mentor = c.get("name", mentor)

    pages = [
        # Page 1: Title splash
        MangaPage(page_index=0, layout="full", panels=[
            PagePanel(
                position="main", content_type="splash",
                text=title, visual_mood="dramatic-dark",
                image_prompt=f"Dramatic manga title page for '{title}'. Bold typography, atmospheric lighting, cinematic composition.",
            ),
        ]),
        # Page 2: Narration + dialogue
        MangaPage(page_index=1, layout="T-shape", panels=[
            PagePanel(position="top", content_type="narration", text=one_liner or narrative[:200], visual_mood="cool-mystery"),
            PagePanel(
                position="bottom-left", content_type="dialogue",
                dialogue=[{"character": protagonist, "text": f"So what's the key idea here?"}],
                character=protagonist, expression="curious",
            ),
            PagePanel(
                position="bottom-right", content_type="dialogue",
                dialogue=[{"character": mentor, "text": dramatic or "Let me show you..."}],
                character=mentor, expression="wise",
            ),
        ]),
    ]

    # Page 3: Key concepts as data
    if key_concepts:
        pages.append(MangaPage(page_index=2, layout="2-row", panels=[
            PagePanel(position="top", content_type="data", text=" | ".join(key_concepts[:3]), visual_mood="warm-amber"),
            PagePanel(position="bottom", content_type="narration", text=narrative[:300] if narrative else "The core ideas of this chapter.", visual_mood="calm-green"),
        ]))

    # Page 4: Recap
    pages.append(MangaPage(page_index=len(pages), layout="full", panels=[
        PagePanel(position="main", content_type="narration", text=one_liner or f"End of '{title}'", visual_mood="ethereal-purple"),
    ]))

    return pages


async def generate_manga_for_book(
    book_id: str,
    canonical_chapters: list[dict],
    style: SummaryStyle,
    llm_client: LLMClient,
    manga_bible: dict = None,
    progress_callback=None,
) -> tuple[list[MangaChapterSummary], dict]:
    """Generate manga pages for ALL chapters."""
    manga_chapters = []

    for i, chapter_summary in enumerate(canonical_chapters):
        if progress_callback:
            progress_callback(
                int((i / len(canonical_chapters)) * 100),
                f"Laying out manga pages for chapter {i + 1}/{len(canonical_chapters)}: '{chapter_summary.get('chapter_title', '')[:30]}'..."
            )

        try:
            manga_chapter = await generate_manga_chapter(
                canonical_summary=chapter_summary,
                style=style,
                llm_client=llm_client,
                manga_bible=manga_bible,
            )
            manga_chapters.append(manga_chapter)
            n_pages = len(manga_chapter.pages)
            n_splash = sum(1 for p in manga_chapter.pages for pp in p.panels if pp.content_type == "splash")
            logger.info(f"Chapter {i}: {n_pages} pages, {n_splash} splash panels")

        except Exception as e:
            logger.error(f"Failed to generate manga for chapter {i}: {e}")
            pages = _generate_fallback_pages(chapter_summary, manga_bible)
            manga_chapters.append(MangaChapterSummary(
                chapter_index=chapter_summary.get("chapter_index", i),
                chapter_title=chapter_summary.get("chapter_title", f"Chapter {i+1}"),
                pages=pages,
                style=style,
            ))

    cost_summary = {"total_input_tokens": 0, "total_output_tokens": 0, "estimated_cost_usd": 0.0}
    return manga_chapters, cost_summary
