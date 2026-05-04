"""Tests for the bible silhouette/costume uniqueness service (Phase B3)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import CharacterDesign, CharacterWorldBible
from app.services.manga.bible_uniqueness import (
    DEFAULT_MIN_SHARED_TOKENS,
    find_silhouette_clashes,
)


def _bible(*characters: CharacterDesign) -> CharacterWorldBible:
    return CharacterWorldBible(
        world_summary="A shifting archive.",
        visual_style="Black ink and screentones.",
        characters=list(characters),
    )


def _kai_distinct() -> CharacterDesign:
    return CharacterDesign(
        character_id="kai",
        name="Kai",
        role="protagonist",
        visual_lock="bookmark scarf, angular jet hair",
        silhouette_notes="lanky frame leaning forward",
        outfit_notes="patchwork waistcoat over linen",
        hair_or_face_notes="grey eyes",
    )


def _mira_distinct() -> CharacterDesign:
    return CharacterDesign(
        character_id="mira",
        name="Mira",
        role="mentor",
        visual_lock="silver braid and bronze monocle",
        silhouette_notes="rounded shoulders, hands clasped",
        outfit_notes="long burgundy duster, brass buckles",
        hair_or_face_notes="dark olive complexion",
    )


def test_distinct_characters_produce_no_warnings():
    issues = find_silhouette_clashes(_bible(_kai_distinct(), _mira_distinct()))
    assert issues == []


def test_clashing_characters_emit_a_warning():
    twin_a = CharacterDesign(
        character_id="ren",
        name="Ren",
        role="hero",
        visual_lock="scarred face, tattered black coat, raven sigil",
        silhouette_notes="broad shoulders heavy stance",
        outfit_notes="tattered black coat heavy boots",
        hair_or_face_notes="scar across left cheek raven feather",
    )
    twin_b = CharacterDesign(
        character_id="rin",
        name="Rin",
        role="rival",
        visual_lock="scarred face, tattered black coat, raven sigil",
        silhouette_notes="broad shoulders heavy stance",
        outfit_notes="tattered black coat heavy boots",
        hair_or_face_notes="scar across left cheek raven feather",
    )

    issues = find_silhouette_clashes(_bible(twin_a, twin_b))

    assert len(issues) == 1
    issue = issues[0]
    assert issue.code == "BIBLE_SILHOUETTE_CLASH"
    assert issue.severity == "warning"
    assert "ren" in issue.message and "rin" in issue.message


def test_only_pairs_above_threshold_are_flagged():
    # Override threshold to a value the distinct pair cannot reach.
    issues = find_silhouette_clashes(
        _bible(_kai_distinct(), _mira_distinct()),
        min_shared_tokens=999,
    )
    assert issues == []


def test_threshold_constant_is_reasonable():
    # We hard-coded the default; a regression that drops it to 1 or 2
    # would flag every reasonable bible. Lock it down.
    assert DEFAULT_MIN_SHARED_TOKENS >= 3


def test_each_pair_emitted_only_once():
    # Three near-identical characters \u2192 C(3,2) = 3 pairs, not 6.
    base = dict(
        role="hero",
        visual_lock="scarred face tattered black coat raven sigil heavy boots",
    )
    a = CharacterDesign(character_id="a", name="A", **base)
    b = CharacterDesign(character_id="b", name="B", **base)
    c = CharacterDesign(character_id="c", name="C", **base)

    issues = find_silhouette_clashes(_bible(a, b, c))

    pair_keys = {issue.artifact_id for issue in issues}
    assert pair_keys == {"a|b", "a|c", "b|c"}
