"""
stage_book_synopsis.py — Stage 1: Whole-Book Synopsis
=======================================================
Takes all canonical chapter summaries and creates a cohesive
narrative structure for the entire book.

WHY THIS EXISTS:
Without this, each chapter's manga panels are drawn in isolation —
no consistent story arc, no emotional journey, no narrative coherence.
This gives every downstream agent the full picture.
"""

import logging
from app.llm_client import LLMClient
from app.prompts import get_book_synopsis_prompt, format_all_summaries_for_synopsis

logger = logging.getLogger(__name__)


async def generate_book_synopsis(
    canonical_chapters: list[dict],
    llm_client: LLMClient,
) -> dict:
    """
    Create a whole-book synopsis from all canonical chapter summaries.

    Returns a synopsis dict with: book_thesis, core_conflict, narrative_arc,
    protagonist_arc, world_description, core_metaphor, act_one/two/three,
    emotional_journey.
    """
    system_prompt = get_book_synopsis_prompt()
    chapters_text = format_all_summaries_for_synopsis(canonical_chapters)

    user_message = f"""BOOK CHAPTERS ({len(canonical_chapters)} total):

{chapters_text}

Create the whole-book narrative synopsis for this manga adaptation."""

    logger.info(f"Generating book synopsis from {len(canonical_chapters)} chapters")

    result = await llm_client.chat_with_retry(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=2000,
        temperature=0.6,
        json_mode=True,
    )

    synopsis = result.get("parsed") or {}

    if not synopsis:
        logger.warning("Book synopsis generation failed — using fallback")
        synopsis = _fallback_synopsis(canonical_chapters)

    logger.info(f"Book synopsis: {synopsis.get('book_thesis', '')[:80]}")
    return synopsis


def _fallback_synopsis(canonical_chapters: list[dict]) -> dict:
    """Minimal fallback when LLM call fails"""
    titles = [ch.get('chapter_title', f'Chapter {i}') for i, ch in enumerate(canonical_chapters)]
    all_concepts = []
    for ch in canonical_chapters:
        all_concepts.extend(ch.get('key_concepts', []))

    n = len(canonical_chapters)
    act_split = max(1, n // 3)

    return {
        "book_thesis": canonical_chapters[0].get('one_liner', 'A journey of knowledge') if canonical_chapters else 'A journey of knowledge',
        "core_conflict": "Understanding versus ignorance",
        "narrative_arc": f"A {n}-chapter exploration building from foundations to mastery.",
        "protagonist_arc": "The reader transforms from curious newcomer to informed practitioner.",
        "world_description": "A world where ideas are the ultimate currency.",
        "core_metaphor": canonical_chapters[0].get('metaphor', 'A torch lighting the way') if canonical_chapters else 'A torch lighting the way',
        "act_one": f"Chapters 0-{act_split-1}: Foundation and problem framing",
        "act_two": f"Chapters {act_split}-{2*act_split-1}: Core ideas and complexity",
        "act_three": f"Chapters {2*act_split}-{n-1}: Application and synthesis",
        "emotional_journey": "Curiosity → struggle → breakthrough → empowerment",
    }
