"""Tests for the deterministic character sheet planner.

The planner is a pure function. These tests pin its three load-bearing
properties:

1. **Determinism** — same bible in, same plan out. The library service
   relies on this to dedupe.
2. **Coverage** — every character in the bible gets a reference sheet plus
   the configured expression set.
3. **Visual-lock injection** — every prompt mechanically includes the
   bible's visual_lock + silhouette/outfit/hair notes so the image model
   cannot drift across slices.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import CharacterDesign, CharacterWorldBible
from app.services.manga.character_sheet_planner import (
    DEFAULT_EXPRESSIONS,
    EXPRESSION_ASSET_TYPE,
    REFERENCE_ASSET_TYPE,
    CharacterSheetPlanOptions,
    plan_book_character_sheets,
)


def _bible(*characters: CharacterDesign) -> CharacterWorldBible:
    """Build a bible with the given characters; sensible defaults elsewhere."""
    return CharacterWorldBible(
        world_summary="A shifting archive of forgotten methods.",
        visual_style="Black ink with screentones.",
        characters=list(characters),
    )


def _kai() -> CharacterDesign:
    return CharacterDesign(
        character_id="kai",
        name="Kai",
        role="protagonist",
        visual_lock="short angular hair and bookmark scarf",
        silhouette_notes="lean, tall, satchel always over left shoulder",
        outfit_notes="dark coat, long crimson scarf",
        hair_or_face_notes="angular black hair, sharp grey eyes",
    )


def _mira() -> CharacterDesign:
    return CharacterDesign(
        character_id="mira",
        name="Mira",
        role="mentor",
        visual_lock="silver braid and bronze monocle",
    )


# --- determinism ------------------------------------------------------------


def test_planner_is_deterministic_for_the_same_bible():
    bible = _bible(_kai(), _mira())

    plan_a = plan_book_character_sheets(bible=bible, project_id="p1")
    plan_b = plan_book_character_sheets(bible=bible, project_id="p1")

    ids_a = [spec.asset_id for spec in plan_a.assets]
    ids_b = [spec.asset_id for spec in plan_b.assets]
    assert ids_a == ids_b
    prompts_a = [spec.prompt for spec in plan_a.assets]
    prompts_b = [spec.prompt for spec in plan_b.assets]
    assert prompts_a == prompts_b


def test_planner_asset_ids_are_stable_across_character_order():
    """Order in the bible must NOT change a character's asset id."""
    plan_kai_first = plan_book_character_sheets(
        bible=_bible(_kai(), _mira()), project_id="p1"
    )
    plan_mira_first = plan_book_character_sheets(
        bible=_bible(_mira(), _kai()), project_id="p1"
    )

    kai_ids_a = sorted(s.asset_id for s in plan_kai_first.assets if s.character_id == "kai")
    kai_ids_b = sorted(s.asset_id for s in plan_mira_first.assets if s.character_id == "kai")
    assert kai_ids_a == kai_ids_b


# --- coverage ---------------------------------------------------------------


def test_each_character_gets_one_reference_sheet():
    plan = plan_book_character_sheets(bible=_bible(_kai(), _mira()), project_id="p1")

    references = [s for s in plan.assets if s.asset_type == REFERENCE_ASSET_TYPE]
    assert {ref.character_id for ref in references} == {"kai", "mira"}
    # Exactly one reference sheet per character — the model sheet is unique.
    assert len(references) == 2


def test_each_character_gets_every_default_expression():
    plan = plan_book_character_sheets(bible=_bible(_kai(), _mira()), project_id="p1")

    for character_id in ("kai", "mira"):
        expressions = {
            spec.expression
            for spec in plan.assets
            if spec.character_id == character_id and spec.asset_type == EXPRESSION_ASSET_TYPE
        }
        assert expressions == set(DEFAULT_EXPRESSIONS)


def test_planner_dedupes_duplicate_expressions_in_options():
    """Caller passes ('neutral', 'neutral', 'angry') -> only two specs emitted."""
    options = CharacterSheetPlanOptions(expressions=("neutral", "neutral", "angry"))
    plan = plan_book_character_sheets(bible=_bible(_kai()), project_id="p1", options=options)

    expressions = [
        spec.expression
        for spec in plan.assets
        if spec.character_id == "kai" and spec.asset_type == EXPRESSION_ASSET_TYPE
    ]
    assert sorted(expressions) == ["angry", "neutral"]


# --- visual-lock injection --------------------------------------------------


def test_every_prompt_includes_the_bible_visual_lock():
    plan = plan_book_character_sheets(bible=_bible(_kai()), project_id="p1")

    for spec in plan.assets:
        assert "bookmark scarf" in spec.prompt
        assert "angular" in spec.prompt


def test_prompts_include_optional_silhouette_outfit_hair_notes_when_present():
    plan = plan_book_character_sheets(bible=_bible(_kai()), project_id="p1")
    sample = plan.assets[0]

    assert "satchel" in sample.prompt  # silhouette_notes
    assert "crimson scarf" in sample.prompt  # outfit_notes
    assert "grey eyes" in sample.prompt  # hair_or_face_notes


def test_prompts_omit_optional_blocks_when_bible_leaves_them_empty():
    """Mira has no silhouette/outfit/hair notes; planner must still produce valid prompts."""
    plan = plan_book_character_sheets(bible=_bible(_mira()), project_id="p1")
    mira_specs = [s for s in plan.assets if s.character_id == "mira"]

    assert mira_specs
    for spec in mira_specs:
        # Visual lock is the only mandatory enrichment.
        assert "silver braid" in spec.prompt


def test_prompts_carry_the_bible_world_summary_and_visual_style():
    bible = _bible(_kai())
    plan = plan_book_character_sheets(bible=bible, project_id="p1")
    sample = plan.assets[0]

    assert "shifting archive" in sample.prompt
    assert "screentones" in sample.prompt


# --- guardrails -------------------------------------------------------------


def test_planner_rejects_empty_bible():
    """Defense in depth: the bible already blocks empty character lists at
    the domain layer, but the planner adds its own guard so a future bible
    schema relaxation cannot silently produce empty asset plans.
    """
    # We construct the bible with one character then strip the list so we can
    # bypass the upstream validator and exercise the planner's own guard.
    bible = _bible(_kai())
    bible = bible.model_copy(update={"characters": []})

    with pytest.raises(ValueError, match="no characters"):
        plan_book_character_sheets(bible=bible, project_id="p1")


def test_planner_rejects_blank_project_id():
    with pytest.raises(ValueError, match="project_id"):
        plan_book_character_sheets(bible=_bible(_kai()), project_id="   ")


def test_planner_threads_image_model_into_specs_when_provided():
    options = CharacterSheetPlanOptions(image_model="gemini-image-1")
    plan = plan_book_character_sheets(bible=_bible(_kai()), project_id="p1", options=options)

    assert all(spec.model == "gemini-image-1" for spec in plan.assets)


def test_consistency_notes_explain_the_invariant():
    """The notes block is human-readable documentation embedded in the artifact."""
    plan = plan_book_character_sheets(bible=_bible(_kai()), project_id="p1")

    assert "deterministically" in plan.consistency_notes
    assert "visual_lock" in plan.consistency_notes
