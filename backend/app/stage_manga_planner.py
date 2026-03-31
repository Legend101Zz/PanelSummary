"""
stage_manga_planner.py — Stage 2: Manga Story Planner
======================================================
Takes the whole-book synopsis + canonical chapters and creates
the "manga bible" — consistent visual world, named characters,
and a per-chapter visual plan.

WHY THIS EXISTS:
Without a bible, each chapter gets generic "student" and "sensei"
with no visual consistency. Image prompts are vague. The whole manga
feels like 12 different books stacked together.

With the bible, every panel references the SAME characters by name,
the SAME world, the SAME visual motifs — it coheres into a real story.
"""

import logging
from app.llm_client import LLMClient
from app.prompts import get_manga_bible_prompt
from app.models import SummaryStyle

logger = logging.getLogger(__name__)


async def generate_manga_bible(
    book_synopsis: dict,
    canonical_chapters: list[dict],
    style: SummaryStyle,
    llm_client: LLMClient,
) -> dict:
    """
    Create the manga visual and narrative bible.

    Returns a bible dict with:
    - world_description, color_palette
    - characters (named, with visual descriptions for image gen)
    - recurring_motifs (visual vocabulary)
    - chapter_plans (one per chapter: mood, dramatic_beat, image_theme, panel_emphasis)
    """
    system_prompt = get_manga_bible_prompt(style)

    chapter_list = "\n".join(
        f"  Chapter {ch.get('chapter_index', i)}: {ch.get('chapter_title', 'Unknown')} — {ch.get('one_liner', '')}"
        for i, ch in enumerate(canonical_chapters)
    )

    user_message = f"""BOOK SYNOPSIS:
  Thesis: {book_synopsis.get('book_thesis', '')}
  Core conflict: {book_synopsis.get('core_conflict', '')}
  Narrative arc: {book_synopsis.get('narrative_arc', '')}
  Protagonist arc: {book_synopsis.get('protagonist_arc', '')}
  World: {book_synopsis.get('world_description', '')}
  Core metaphor: {book_synopsis.get('core_metaphor', '')}
  Act One: {book_synopsis.get('act_one', '')}
  Act Two: {book_synopsis.get('act_two', '')}
  Act Three: {book_synopsis.get('act_three', '')}
  Emotional journey: {book_synopsis.get('emotional_journey', '')}

CHAPTERS ({len(canonical_chapters)} total):
{chapter_list}

Design the complete manga bible for this adaptation."""

    logger.info(f"Generating manga bible for {len(canonical_chapters)} chapters")

    result = await llm_client.chat_with_retry(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=4000,
        temperature=0.7,
        json_mode=True,
    )

    bible = result.get("parsed") or {}

    if not bible:
        logger.warning("Manga bible generation failed — using fallback")
        bible = _fallback_bible(book_synopsis, canonical_chapters, style)
    else:
        bible = _ensure_all_chapters_covered(bible, canonical_chapters, book_synopsis)

    n_chars = len(bible.get("characters", []))
    n_plans = len(bible.get("chapter_plans", []))
    logger.info(f"Manga bible: {n_chars} characters, {n_plans} chapter plans, {len(bible.get('recurring_motifs', []))} motifs")
    return bible


def _ensure_all_chapters_covered(
    bible: dict,
    canonical_chapters: list[dict],
    book_synopsis: dict,
) -> dict:
    """Ensure chapter_plans has an entry for every chapter index."""
    plans = bible.get("chapter_plans", [])
    existing_indices = {p.get("chapter_index") for p in plans}

    for ch in canonical_chapters:
        idx = ch.get("chapter_index", 0)
        if idx not in existing_indices:
            logger.debug(f"Bible missing chapter plan for index {idx} — adding fallback")
            plans.append({
                "chapter_index": idx,
                "mood": "reflective",
                "dramatic_beat": ch.get("dramatic_moment", ch.get("one_liner", f"Key insight from chapter {idx}")),
                "image_theme": ch.get("metaphor", book_synopsis.get("core_metaphor", "abstract concept visualization")),
                "panel_emphasis": "dialogue-heavy",
            })

    bible["chapter_plans"] = sorted(plans, key=lambda p: p.get("chapter_index", 0))
    return bible


def _fallback_bible(
    book_synopsis: dict,
    canonical_chapters: list[dict],
    style: SummaryStyle,
) -> dict:
    """Minimal fallback bible when LLM generation fails."""
    world = book_synopsis.get("world_description", "A world of ideas and discovery")
    metaphor = book_synopsis.get("core_metaphor", "a flickering torch of understanding")

    style_palettes = {
        "manga":      "Deep navy blue bg, bright white ink lines, amber accent highlights. Energy: midnight study session.",
        "noir":       "Near-black bg, silver-grey ink, single harsh spotlight. Energy: rain-soaked city night.",
        "minimalist": "Pure white bg, thin black lines, minimal grey shading. Energy: clean academic clarity.",
        "comedy":     "Bright pastel bg, thick bouncy outlines, primary color pops. Energy: Saturday morning cartoons.",
        "academic":   "Off-white bg, structured ink diagrams, blue accent for emphasis. Energy: well-lit lecture hall.",
    }

    chapter_plans = []
    n = len(canonical_chapters)
    for i, ch in enumerate(canonical_chapters):
        idx = ch.get("chapter_index", i)
        # Simple 3-act mood progression
        if i < n // 3:
            mood = "mysterious"
        elif i < 2 * n // 3:
            mood = "intense"
        else:
            mood = "triumphant"

        chapter_plans.append({
            "chapter_index": idx,
            "mood": mood,
            "dramatic_beat": ch.get("dramatic_moment", ch.get("one_liner", "")),
            "image_theme": ch.get("metaphor", metaphor),
            "panel_emphasis": "balanced",
        })

    return {
        "world_description": world,
        "color_palette": style_palettes.get(style.value if hasattr(style, 'value') else str(style), style_palettes["manga"]),
        "characters": [
            {
                "name": "Kai",
                "role": "protagonist",
                "visual_description": "Young person, casual clothes, wide curious eyes, messy hair, always leaning forward with interest",
                "speech_style": "Asks direct questions, expresses wonder with '...!' moments",
                "represents": "The reader — curious, growing, discovering",
            },
            {
                "name": "The Sage",
                "role": "mentor",
                "visual_description": "Calm figure, simple clean attire, knowing half-smile, gestures expressively when explaining",
                "speech_style": "Speaks in clear principles, uses analogies, lets silence do work",
                "represents": "The author's distilled wisdom",
            },
            {
                "name": "Doubt",
                "role": "inner_voice",
                "visual_description": "Shadow version of Kai, slightly distorted, appears in thought bubbles only",
                "speech_style": "Challenges with 'But what if...?' and 'Are you sure...?'",
                "represents": "The reader's skepticism and resistance to change",
            },
        ],
        "recurring_motifs": [
            metaphor,
            "An open book with light streaming from its pages",
            "A path that forks — one worn smooth, one into unknown territory",
        ],
        "chapter_plans": chapter_plans,
    }
