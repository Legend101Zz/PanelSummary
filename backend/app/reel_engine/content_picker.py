"""
content_picker.py — Select Catchy Content for Reels
=====================================================
Picks the most compelling unused content from the book's
knowledge_doc, knowledge_graph, and narrative_arc.

No LLM needed here — just smart ranking and filtering.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


def select_reel_content(
    canonical_chapters: list[dict],
    manga_bible: dict | None,
    used_content_ids: list[str],
    max_items: int = 8,
) -> list[dict]:
    """
    Pick unused, high-weight content for the next reel.

    Each content item gets an ID like:
      - "quote-{chapter_idx}-{idx}"
      - "concept-{chapter_idx}-{idx}"
      - "oneliner-{chapter_idx}"
      - "action-{chapter_idx}-{idx}"

    Returns a sorted list of content items, best first.
    """
    pool: list[dict] = []

    for ch in canonical_chapters:
        ch_idx = ch.get("chapter_index", 0)
        ch_title = ch.get("chapter_title", f"Chapter {ch_idx + 1}")

        # One-liners are great hooks
        one_liner = ch.get("one_liner", "")
        if one_liner:
            cid = f"oneliner-{ch_idx}"
            if cid not in used_content_ids:
                pool.append({
                    "id": cid,
                    "type": "oneliner",
                    "content": one_liner,
                    "chapter_title": ch_title,
                    "chapter_index": ch_idx,
                    "weight": 0.95,
                })

        # Key concepts — the meat of the content
        for i, concept in enumerate(ch.get("key_concepts", [])):
            cid = f"concept-{ch_idx}-{i}"
            if cid not in used_content_ids:
                pool.append({
                    "id": cid,
                    "type": "concept",
                    "content": concept,
                    "chapter_title": ch_title,
                    "chapter_index": ch_idx,
                    "weight": 0.8,
                })

        # Memorable quotes — instant scroll-stoppers
        for i, quote in enumerate(ch.get("memorable_quotes", [])):
            cid = f"quote-{ch_idx}-{i}"
            if cid not in used_content_ids:
                pool.append({
                    "id": cid,
                    "type": "quote",
                    "content": quote,
                    "chapter_title": ch_title,
                    "chapter_index": ch_idx,
                    "weight": 0.92,
                })

        # Action items — practical, shareable
        for i, action in enumerate(ch.get("action_items", [])):
            cid = f"action-{ch_idx}-{i}"
            if cid not in used_content_ids:
                pool.append({
                    "id": cid,
                    "type": "action",
                    "content": action,
                    "chapter_title": ch_title,
                    "chapter_index": ch_idx,
                    "weight": 0.75,
                })

        # Narrative summary chunks — good for story-style reels
        narrative = ch.get("narrative_summary", "")
        if narrative and len(narrative) > 100:
            cid = f"narrative-{ch_idx}"
            if cid not in used_content_ids:
                pool.append({
                    "id": cid,
                    "type": "narrative",
                    "content": narrative[:500],  # Cap length
                    "chapter_title": ch_title,
                    "chapter_index": ch_idx,
                    "weight": 0.65,
                })

    # Add character profiles from manga bible (great for sprite scenes)
    if manga_bible and isinstance(manga_bible, dict):
        for i, char in enumerate(manga_bible.get("characters", [])):
            cid = f"character-{i}"
            if cid not in used_content_ids:
                pool.append({
                    "id": cid,
                    "type": "character",
                    "content": f"{char.get('name', 'Unknown')}: {char.get('represents', '')}",
                    "chapter_title": "Characters",
                    "chapter_index": -1,
                    "weight": 0.7,
                })

    # Sort by weight (highest first), then pick top N
    pool.sort(key=lambda x: x["weight"], reverse=True)

    selected = pool[:max_items]

    if not selected:
        logger.warning("No unused content available — book may be exhausted")

    logger.info(
        f"Selected {len(selected)}/{len(pool)} content items "
        f"(used: {len(used_content_ids)})"
    )

    return selected


def get_total_content_count(
    canonical_chapters: list[dict],
    manga_bible: dict | None,
) -> int:
    """Count total available content items for exhaustion tracking."""
    count = 0
    for ch in canonical_chapters:
        if ch.get("one_liner"):
            count += 1
        count += len(ch.get("key_concepts", []))
        count += len(ch.get("memorable_quotes", []))
        count += len(ch.get("action_items", []))
        if ch.get("narrative_summary", "") and len(ch.get("narrative_summary", "")) > 100:
            count += 1

    if manga_bible and isinstance(manga_bible, dict):
        count += len(manga_bible.get("characters", []))

    return count
