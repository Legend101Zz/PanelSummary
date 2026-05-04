"""Tests for the book-level character sheet planner.

The planner is the bridge between three layers (bible, art direction, specs).
These tests pin its load-bearing properties:

1. **LLM-authored art direction drives expressions and prose** — when the
   bundle is supplied, the planner uses the LLM's expression repertoire and
   prose verbatim.
2. **Mechanical visual-lock injection is non-negotiable** — every prompt
   ends with the bible's identity block, even when the LLM's prose forgets
   to mention it.
3. **Determinism** — same inputs in, same plan out. The library service
   relies on this.
4. **Legacy path** — projects whose book-understanding ran before art
   direction shipped still produce a valid (degraded) plan.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import (
    CharacterArtDirection,
    CharacterArtDirectionBundle,
    CharacterDesign,
    CharacterWorldBible,
    ExpressionDirection,
)
from app.services.manga.character_sheet_planner import (
    EXPRESSION_ASSET_TYPE,
    LEGACY_DEFAULT_EXPRESSIONS,
    REFERENCE_ASSET_TYPE,
    CharacterSheetPlanOptions,
    plan_book_character_sheets,
)


_GOOD_PROSE = (
    "Ink-wash silhouette under a cold key light with deep negative space "
    "to amplify isolation."
)


def _bible(*characters: CharacterDesign) -> CharacterWorldBible:
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


def _expression(label: str, prose: str = _GOOD_PROSE, body: str = "shoulders relaxed") -> ExpressionDirection:
    return ExpressionDirection(label=label, prose=prose, body_language=body)


def _direction(
    character_id: str,
    *,
    expressions: tuple[str, ...] = ("neutral", "determined", "distress"),
) -> CharacterArtDirection:
    return CharacterArtDirection(
        character_id=character_id,
        reference_sheet_prose=f"Reference sheet for {character_id} — clean ink, neutral pose, calibrated proportions.",
        color_story=f"Limited palette anchored on cool grey ink and a single warm highlight reserved for {character_id}'s arc moments.",
        lighting_recipe=f"High-contrast key light from upper-left, deep negative-space shadows on the right side of {character_id}'s face.",
        lens_recipe="85mm-equivalent for emotional close-ups, medium-wide for action; shallow depth-of-field on close-ups.",
        expressions=[_expression(label) for label in expressions],
    )


def _bundle(*directions: CharacterArtDirection) -> CharacterArtDirectionBundle:
    return CharacterArtDirectionBundle(
        project_id="p1",
        style_anchor="Editorial manga inking with rationed spot color and surgical screentones.",
        directions=list(directions),
    )


# --- LLM-driven expressions and prose ---------------------------------------


def test_llm_authored_expressions_drive_the_plan_when_bundle_is_supplied():
    """The LLM picks expressions per character; planner uses them, not the legacy default."""
    direction = _direction("kai", expressions=("calm", "resolute", "fractured", "blazing"))
    plan = plan_book_character_sheets(
        bible=_bible(_kai()),
        project_id="p1",
        art_direction=_bundle(direction),
    )

    expression_specs = [s for s in plan.assets if s.asset_type == EXPRESSION_ASSET_TYPE]
    labels = sorted(spec.expression for spec in expression_specs)
    assert labels == ["blazing", "calm", "fractured", "resolute"]


def test_planner_inlines_art_direction_prose_into_expression_prompts():
    direction = _direction("kai")
    direction = direction.model_copy(
        update={
            "expressions": [
                ExpressionDirection(
                    label="determined",
                    prose="Jaw set, scarf taut against the wind, lit from below by lantern bounce.",
                    body_language="weight forward, palms open and ready to grip the next page",
                ),
                ExpressionDirection(
                    label="neutral",
                    prose="Quiet stance, posture borrowed from a librarian who has read too many endings.",
                ),
                ExpressionDirection(
                    label="distress",
                    prose="Pupils blown wide; the bookmark scarf trembles like a flag under siege.",
                ),
            ]
        }
    )

    plan = plan_book_character_sheets(
        bible=_bible(_kai()), project_id="p1", art_direction=_bundle(direction)
    )

    determined_spec = next(s for s in plan.assets if s.expression == "determined")
    assert "scarf taut against the wind" in determined_spec.prompt
    assert "weight forward" in determined_spec.prompt  # body_language


def test_planner_inlines_art_direction_lighting_and_lens_into_every_prompt():
    direction = _direction("kai")
    direction = direction.model_copy(
        update={
            "lighting_recipe": "Single rim-light from camera-right, halation on hair edges only.",
            "lens_recipe": "50mm-equivalent for ALL shots; intentional flatness as a stylistic choice.",
        }
    )

    plan = plan_book_character_sheets(
        bible=_bible(_kai()), project_id="p1", art_direction=_bundle(direction)
    )

    for spec in plan.assets:
        assert "rim-light from camera-right" in spec.prompt
        assert "50mm-equivalent" in spec.prompt


# --- mechanical bible lock injection (defense in depth) ---------------------


def test_visual_lock_is_appended_as_the_final_block_of_every_prompt():
    """No matter how creative the LLM gets, the bible identity must close the prompt."""
    plan = plan_book_character_sheets(
        bible=_bible(_kai()), project_id="p1", art_direction=_bundle(_direction("kai"))
    )

    for spec in plan.assets:
        # The visual lock block ALWAYS opens with this exact phrase.
        lock_index = spec.prompt.rfind("Character identity (must be honoured)")
        assert lock_index != -1, "every prompt must include the bible identity block"
        # And it must be near the end — no creative prose after the identity lock.
        assert lock_index > len(spec.prompt) // 2


def test_visual_lock_includes_silhouette_outfit_hair_when_bible_has_them():
    plan = plan_book_character_sheets(
        bible=_bible(_kai()), project_id="p1", art_direction=_bundle(_direction("kai"))
    )

    sample = plan.assets[0]
    assert "bookmark scarf" in sample.prompt  # visual_lock
    assert "satchel" in sample.prompt  # silhouette_notes
    assert "crimson scarf" in sample.prompt  # outfit_notes
    assert "grey eyes" in sample.prompt  # hair_or_face_notes


def test_visual_lock_omits_optional_blocks_when_bible_leaves_them_blank():
    """Mira has only the visual_lock; planner must not inject empty labels."""
    plan = plan_book_character_sheets(
        bible=_bible(_mira()), project_id="p1", art_direction=_bundle(_direction("mira"))
    )

    sample = plan.assets[0]
    assert "silver braid" in sample.prompt
    assert "Silhouette:" not in sample.prompt
    assert "Costume:" not in sample.prompt
    assert "Hair/face:" not in sample.prompt


# --- determinism ------------------------------------------------------------


def test_planner_is_deterministic_for_the_same_inputs():
    bible = _bible(_kai(), _mira())
    bundle = _bundle(_direction("kai"), _direction("mira"))

    plan_a = plan_book_character_sheets(bible=bible, project_id="p1", art_direction=bundle)
    plan_b = plan_book_character_sheets(bible=bible, project_id="p1", art_direction=bundle)

    assert [s.asset_id for s in plan_a.assets] == [s.asset_id for s in plan_b.assets]
    assert [s.prompt for s in plan_a.assets] == [s.prompt for s in plan_b.assets]


def test_asset_ids_are_stable_across_character_order():
    """Order in the bible must not change a character's asset id."""
    bundle = _bundle(_direction("kai"), _direction("mira"))

    kai_first = plan_book_character_sheets(
        bible=_bible(_kai(), _mira()), project_id="p1", art_direction=bundle
    )
    mira_first = plan_book_character_sheets(
        bible=_bible(_mira(), _kai()), project_id="p1", art_direction=bundle
    )

    kai_a = sorted(s.asset_id for s in kai_first.assets if s.character_id == "kai")
    kai_b = sorted(s.asset_id for s in mira_first.assets if s.character_id == "kai")
    assert kai_a == kai_b


def test_asset_ids_are_stable_across_legacy_and_llm_paths_for_same_labels():
    """The id only depends on (character_id, asset_type, expression). Path-agnostic."""
    bible = _bible(_kai())
    bundle = _bundle(_direction("kai", expressions=LEGACY_DEFAULT_EXPRESSIONS))

    legacy_plan = plan_book_character_sheets(bible=bible, project_id="p1")
    llm_plan = plan_book_character_sheets(bible=bible, project_id="p1", art_direction=bundle)

    legacy_ids = sorted(s.asset_id for s in legacy_plan.assets)
    llm_ids = sorted(s.asset_id for s in llm_plan.assets)
    assert legacy_ids == llm_ids


# --- coverage ---------------------------------------------------------------


def test_each_character_gets_a_full_reference_turnaround():
    plan = plan_book_character_sheets(
        bible=_bible(_kai(), _mira()),
        project_id="p1",
        art_direction=_bundle(_direction("kai"), _direction("mira")),
    )

    references = [s for s in plan.assets if s.asset_type == REFERENCE_ASSET_TYPE]
    # Phase B1: every character carries a turnaround — front, side, back —
    # so the artist can verify silhouette consistency without rerunning the
    # image model.
    assert {r.character_id for r in references} == {"kai", "mira"}
    assert len(references) == 6  # 2 characters × 3 angles
    angles_per_character = {
        char_id: sorted(
            r.expression for r in references if r.character_id == char_id
        )
        for char_id in {"kai", "mira"}
    }
    assert angles_per_character == {
        "kai": ["back", "front", "side"],
        "mira": ["back", "front", "side"],
    }


def test_each_character_gets_one_expression_per_llm_authored_label():
    plan = plan_book_character_sheets(
        bible=_bible(_kai(), _mira()),
        project_id="p1",
        art_direction=_bundle(
            _direction("kai", expressions=("calm", "resolute", "fractured")),
            _direction("mira", expressions=("watchful", "patient", "wry")),
        ),
    )

    kai_expressions = sorted(
        s.expression
        for s in plan.assets
        if s.character_id == "kai" and s.asset_type == EXPRESSION_ASSET_TYPE
    )
    mira_expressions = sorted(
        s.expression
        for s in plan.assets
        if s.character_id == "mira" and s.asset_type == EXPRESSION_ASSET_TYPE
    )
    assert kai_expressions == ["calm", "fractured", "resolute"]
    assert mira_expressions == ["patient", "watchful", "wry"]


# --- legacy path (no art direction) -----------------------------------------


def test_legacy_path_falls_back_to_default_expression_set():
    """Projects whose book-understanding ran pre-Phase-3 still produce a plan."""
    plan = plan_book_character_sheets(bible=_bible(_kai()), project_id="p1")

    expressions = sorted(
        s.expression for s in plan.assets if s.asset_type == EXPRESSION_ASSET_TYPE
    )
    assert expressions == sorted(LEGACY_DEFAULT_EXPRESSIONS)


def test_legacy_path_still_appends_the_visual_lock_block():
    plan = plan_book_character_sheets(bible=_bible(_kai()), project_id="p1")

    for spec in plan.assets:
        assert "Character identity (must be honoured)" in spec.prompt
        assert "bookmark scarf" in spec.prompt


def test_consistency_notes_record_which_path_produced_the_plan():
    legacy = plan_book_character_sheets(bible=_bible(_kai()), project_id="p1")
    enriched = plan_book_character_sheets(
        bible=_bible(_kai()), project_id="p1", art_direction=_bundle(_direction("kai"))
    )

    assert "legacy project" in legacy.consistency_notes
    assert "LLM-authored" in enriched.consistency_notes


# --- guardrails -------------------------------------------------------------


def test_planner_rejects_empty_bible():
    """Defensive: bible already validates this, but planner adds its own guard."""
    bible = _bible(_kai()).model_copy(update={"characters": []})

    with pytest.raises(ValueError, match="no characters"):
        plan_book_character_sheets(bible=bible, project_id="p1")


def test_planner_rejects_blank_project_id():
    with pytest.raises(ValueError, match="project_id"):
        plan_book_character_sheets(bible=_bible(_kai()), project_id="   ")


def test_planner_threads_image_model_into_specs_when_provided():
    options = CharacterSheetPlanOptions(image_model="gemini-image-1")
    plan = plan_book_character_sheets(
        bible=_bible(_kai()),
        project_id="p1",
        art_direction=_bundle(_direction("kai")),
        options=options,
    )

    assert all(spec.model == "gemini-image-1" for spec in plan.assets)
