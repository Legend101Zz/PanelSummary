"""
generate_reels.py — Canonical Summary → Reel Scripts
======================================================
Takes canonical chapter summaries and generates TikTok-style
lesson reel scripts. Each chapter produces 2-4 reels.

VIBE: This creates the ADDICTIVE dual-swipe experience.
Vertical = browse all lessons from any book
Horizontal = deep-dive into one book's lessons
"""

import logging
from app.llm_client import LLMClient
from app.prompts import get_reel_scripts_prompt, format_summary_for_reels
from app.models import ReelLesson, SummaryStyle

logger = logging.getLogger(__name__)


async def generate_reels_for_chapter(
    canonical_summary: dict,
    style: SummaryStyle,
    llm_client: LLMClient,
) -> list[ReelLesson]:
    """
    Generate reel lessons for a single chapter.
    Returns 2-4 ReelLesson objects.
    """
    system_prompt = get_reel_scripts_prompt(style)
    user_message = format_summary_for_reels(canonical_summary)

    logger.info(f"Generating reels for chapter: {canonical_summary.get('chapter_title', 'Unknown')}")

    result = await llm_client.chat_with_retry(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=4000,
        temperature=0.75,
        json_mode=True,
    )

    reels_raw = result.get("parsed", [])
    chapter_index = canonical_summary.get("chapter_index", 0)

    reels = []
    if isinstance(reels_raw, list):
        for i, reel_data in enumerate(reels_raw):
            if not isinstance(reel_data, dict):
                continue

            try:
                reel = ReelLesson(
                    reel_index=reel_data.get("reel_index", i),
                    chapter_index=chapter_index,
                    lesson_title=reel_data.get("lesson_title", f"Lesson {i + 1}"),
                    hook=reel_data.get("hook", ""),
                    key_points=reel_data.get("key_points", []),
                    visual_theme=reel_data.get("visual_theme", "dark"),
                    duration_seconds=reel_data.get("duration_seconds", 45),
                    style=style,
                )
                reels.append(reel)
            except Exception as e:
                logger.warning(f"Skipping malformed reel {i}: {e}")

    if not reels:
        logger.warning("No reels generated, using fallback")
        reels = _generate_fallback_reels(canonical_summary, style)

    return reels


def _generate_fallback_reels(
    canonical_summary: dict,
    style: SummaryStyle,
) -> list[ReelLesson]:
    """Fallback reels when LLM generation fails"""
    chapter_index = canonical_summary.get("chapter_index", 0)
    title = canonical_summary.get("chapter_title", "Chapter")
    key_concepts = canonical_summary.get("key_concepts", [])
    one_liner = canonical_summary.get("one_liner", "")

    return [
        ReelLesson(
            reel_index=0,
            chapter_index=chapter_index,
            lesson_title=f"{len(key_concepts)} Key Ideas from '{title}'",
            hook=one_liner or f"Here's what you need to know about {title}",
            key_points=key_concepts[:5] or ["Read the full chapter for details"],
            visual_theme="deep-space-dark neon-cyan-accents",
            duration_seconds=45,
            style=style,
        )
    ]


async def generate_reels_for_book(
    book_id: str,
    canonical_chapters: list[dict],
    style: SummaryStyle,
    llm_client: LLMClient,
    progress_callback=None,
) -> tuple[list[ReelLesson], dict]:
    """
    Generate reels for ALL chapters of a book.

    Returns:
    - Flat list of all ReelLesson objects (2-4 per chapter)
    - Cost summary dict

    VIBE: This flat list is what powers the infinite scroll feed.
    All lessons from all chapters, ordered for optimal discovery.
    """
    all_reels = []
    total_input_tokens = 0
    total_output_tokens = 0
    total_cost = 0.0
    global_reel_index = 0  # Continuous index across all chapters

    for i, chapter_summary in enumerate(canonical_chapters):
        if progress_callback:
            progress_callback(
                int((i / len(canonical_chapters)) * 100),
                f"Generating reels for chapter {i + 1}/{len(canonical_chapters)}..."
            )

        try:
            chapter_reels = await generate_reels_for_chapter(
                canonical_summary=chapter_summary,
                style=style,
                llm_client=llm_client,
            )

            # Re-index globally
            for reel in chapter_reels:
                reel.reel_index = global_reel_index
                global_reel_index += 1
                all_reels.append(reel)

            logger.info(f"Generated {len(chapter_reels)} reels for chapter {i}")

        except Exception as e:
            logger.error(f"Failed to generate reels for chapter {i}: {e}")
            fallback = _generate_fallback_reels(chapter_summary, style)
            for reel in fallback:
                reel.reel_index = global_reel_index
                global_reel_index += 1
                all_reels.append(reel)

    cost_summary = {
        "total_input_tokens": total_input_tokens,
        "total_output_tokens": total_output_tokens,
        "estimated_cost_usd": total_cost,
    }

    logger.info(f"Total reels generated: {len(all_reels)}")
    return all_reels, cost_summary
