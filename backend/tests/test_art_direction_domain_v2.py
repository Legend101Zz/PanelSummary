"""Tests for the LLM-enriched art-direction domain artifacts.

These contracts are what the LLM stage MUST produce. They fail loudly when
the LLM returns vibes-only prose so a degraded LLM output cannot silently
ship to the renderer.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import (
    CharacterArtDirection,
    CharacterArtDirectionBundle,
    ExpressionDirection,
)


# Substantive prose long enough to clear the 40-char minimum.
_GOOD_PROSE = (
    "Ink-wash silhouette under a cold key light with deep negative space "
    "to amplify isolation."
)


def _expression(label: str = "neutral") -> ExpressionDirection:
    return ExpressionDirection(
        label=label,
        prose=_GOOD_PROSE,
        body_language="shoulders relaxed, hands loose at the sides",
    )


def _direction(character_id: str = "kai") -> CharacterArtDirection:
    return CharacterArtDirection(
        character_id=character_id,
        reference_sheet_prose=_GOOD_PROSE,
        color_story=_GOOD_PROSE,
        lighting_recipe=_GOOD_PROSE,
        lens_recipe=_GOOD_PROSE,
        expressions=[
            _expression("neutral"),
            _expression("determined"),
            _expression("distress"),
        ],
    )


# --- ExpressionDirection ----------------------------------------------------


def test_expression_label_is_lowercased_and_trimmed():
    expression = ExpressionDirection(label="  Determined  ", prose=_GOOD_PROSE)
    assert expression.label == "determined"


def test_expression_label_cannot_be_blank():
    with pytest.raises(ValueError, match="blank"):
        ExpressionDirection(label="   ", prose=_GOOD_PROSE)


def test_expression_label_cannot_be_a_sentence():
    with pytest.raises(ValueError, match="short key"):
        ExpressionDirection(
            label="this is way too long to be a key okay seriously stop typing",
            prose=_GOOD_PROSE,
        )


def test_expression_prose_must_be_substantive():
    with pytest.raises(ValueError, match="substantive|art direction"):
        ExpressionDirection(label="neutral", prose="too short")


# --- CharacterArtDirection --------------------------------------------------


def test_character_direction_requires_three_expressions():
    with pytest.raises(ValueError, match="at least 3"):
        CharacterArtDirection(
            character_id="kai",
            reference_sheet_prose=_GOOD_PROSE,
            color_story=_GOOD_PROSE,
            lighting_recipe=_GOOD_PROSE,
            lens_recipe=_GOOD_PROSE,
            expressions=[_expression("neutral"), _expression("determined")],
        )


def test_character_direction_rejects_duplicate_expression_labels():
    with pytest.raises(ValueError, match="duplicate expression"):
        CharacterArtDirection(
            character_id="kai",
            reference_sheet_prose=_GOOD_PROSE,
            color_story=_GOOD_PROSE,
            lighting_recipe=_GOOD_PROSE,
            lens_recipe=_GOOD_PROSE,
            expressions=[
                _expression("neutral"),
                _expression("neutral"),
                _expression("determined"),
            ],
        )


def test_character_direction_rejects_thin_prose_in_any_field():
    """All four prose fields must clear the substance threshold."""
    for field in ("reference_sheet_prose", "color_story", "lighting_recipe", "lens_recipe"):
        kwargs: dict[str, object] = dict(
            character_id="kai",
            reference_sheet_prose=_GOOD_PROSE,
            color_story=_GOOD_PROSE,
            lighting_recipe=_GOOD_PROSE,
            lens_recipe=_GOOD_PROSE,
            expressions=[
                _expression("neutral"),
                _expression("determined"),
                _expression("distress"),
            ],
        )
        kwargs[field] = "too thin"
        with pytest.raises(ValueError, match="substantive"):
            CharacterArtDirection(**kwargs)


def test_character_direction_requires_non_blank_id():
    with pytest.raises(ValueError, match="character_id"):
        CharacterArtDirection(
            character_id="   ",
            reference_sheet_prose=_GOOD_PROSE,
            color_story=_GOOD_PROSE,
            lighting_recipe=_GOOD_PROSE,
            lens_recipe=_GOOD_PROSE,
            expressions=[
                _expression("neutral"),
                _expression("determined"),
                _expression("distress"),
            ],
        )


# --- CharacterArtDirectionBundle --------------------------------------------


def test_bundle_rejects_empty_directions_list():
    with pytest.raises(ValueError, match="at least one character"):
        CharacterArtDirectionBundle(
            project_id="p1",
            style_anchor=_GOOD_PROSE,
            directions=[],
        )


def test_bundle_rejects_duplicate_character_ids():
    with pytest.raises(ValueError, match="duplicate character_id"):
        CharacterArtDirectionBundle(
            project_id="p1",
            style_anchor=_GOOD_PROSE,
            directions=[_direction("kai"), _direction("kai")],
        )


def test_bundle_lookup_returns_direction_by_character_id():
    bundle = CharacterArtDirectionBundle(
        project_id="p1",
        style_anchor=_GOOD_PROSE,
        directions=[_direction("kai"), _direction("mira")],
    )
    assert bundle.lookup("kai").character_id == "kai"
    assert bundle.lookup("mira").character_id == "mira"
    assert bundle.lookup("unknown") is None


def test_bundle_lookup_expression_handles_label_normalization():
    """Renderer passes labels in any case; the bundle must normalize on lookup."""
    bundle = CharacterArtDirectionBundle(
        project_id="p1",
        style_anchor=_GOOD_PROSE,
        directions=[_direction("kai")],
    )

    expression = bundle.lookup_expression("kai", "  DETERMINED  ")

    assert expression is not None
    assert expression.label == "determined"


def test_bundle_lookup_expression_returns_none_for_unknown_character():
    bundle = CharacterArtDirectionBundle(
        project_id="p1",
        style_anchor=_GOOD_PROSE,
        directions=[_direction("kai")],
    )

    assert bundle.lookup_expression("ghost", "neutral") is None


def test_bundle_style_anchor_must_be_substantive():
    with pytest.raises(ValueError, match="substantive"):
        CharacterArtDirectionBundle(
            project_id="p1",
            style_anchor="thin",
            directions=[_direction("kai")],
        )
