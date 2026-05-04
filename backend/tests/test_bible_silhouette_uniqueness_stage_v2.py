"""Test the bible silhouette uniqueness stage (Phase B3).

The stage is a thin shim around ``find_silhouette_clashes`` (covered in
test_bible_uniqueness_v2.py); these tests cover the integration: the
stage reads the right field from the context, populates the warnings
list, and never raises on a clean bible.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import CharacterDesign, CharacterWorldBible
from app.manga_pipeline.book_context import BookUnderstandingContext
from app.manga_pipeline.stages.book import bible_silhouette_uniqueness_stage


def _context(bible: CharacterWorldBible | None) -> BookUnderstandingContext:
    context = BookUnderstandingContext(
        book_id="b1",
        project_id="p1",
        book_title="A Book",
        total_pages=10,
        canonical_chapters=[],
    )
    context.character_bible = bible
    return context


def _distinct_bible() -> CharacterWorldBible:
    return CharacterWorldBible(
        world_summary="Archive of growing doors.",
        visual_style="Black ink and screentones.",
        characters=[
            CharacterDesign(
                character_id="kai",
                name="Kai",
                role="protagonist",
                visual_lock="bookmark scarf, angular jet hair",
                outfit_notes="patchwork waistcoat",
            ),
            CharacterDesign(
                character_id="mira",
                name="Mira",
                role="mentor",
                visual_lock="silver braid and bronze monocle",
                outfit_notes="long burgundy duster",
            ),
        ],
    )


def _clashing_bible() -> CharacterWorldBible:
    return CharacterWorldBible(
        world_summary="Twin doors.",
        visual_style="Black ink.",
        characters=[
            CharacterDesign(
                character_id="ren",
                name="Ren",
                role="hero",
                visual_lock="scarred face tattered black coat raven sigil",
                silhouette_notes="broad shoulders heavy stance",
                outfit_notes="tattered black coat heavy boots",
                hair_or_face_notes="scar across left cheek raven feather",
            ),
            CharacterDesign(
                character_id="rin",
                name="Rin",
                role="rival",
                visual_lock="scarred face tattered black coat raven sigil",
                silhouette_notes="broad shoulders heavy stance",
                outfit_notes="tattered black coat heavy boots",
                hair_or_face_notes="scar across left cheek raven feather",
            ),
        ],
    )


def test_clean_bible_yields_no_warnings():
    ctx = _context(_distinct_bible())

    asyncio.run(bible_silhouette_uniqueness_stage.run(ctx))

    assert ctx.bible_warnings == []


def test_clashing_bible_populates_warnings_but_does_not_raise():
    ctx = _context(_clashing_bible())

    # Stage must NEVER raise on a clash; it's surfaced as a warning so
    # twin/body-double bibles can ship intentionally.
    asyncio.run(bible_silhouette_uniqueness_stage.run(ctx))

    assert len(ctx.bible_warnings) == 1
    assert ctx.bible_warnings[0].code == "BIBLE_SILHOUETTE_CLASH"


def test_stage_requires_a_locked_bible():
    ctx = _context(None)

    with pytest.raises(ValueError, match="character_bible"):
        asyncio.run(bible_silhouette_uniqueness_stage.run(ctx))
