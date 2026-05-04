"""Tests for the CharacterVoiceCard / CharacterVoiceCardBundle domain."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import CharacterVoiceCard, CharacterVoiceCardBundle


def _valid_card(**overrides) -> CharacterVoiceCard:
    base = dict(
        character_id="kai",
        name="Kai",
        core_attitude="Curious and stubborn; trusts patterns.",
        speech_rhythm="Short clipped lines, occasional question pivots.",
        vocabulary_do=["constraint", "tradeoff"],
        vocabulary_dont=["synergy"],
        example_lines=[
            "Constraint flipped on us.",
            "Cheap fix or right fix?",
        ],
    )
    base.update(overrides)
    return CharacterVoiceCard(**base)


def test_voice_card_requires_minimum_examples():
    # One example line is below the floor; the LLM has nothing to imitate.
    with pytest.raises(ValueError, match="example_lines"):
        _valid_card(example_lines=["Just one line."])


def test_voice_card_caps_example_lines_to_keep_prompt_lean():
    # Seven example lines crowd the script prompt without adding signal.
    too_many = [f"Line number {i}." for i in range(7)]
    with pytest.raises(ValueError, match="example_lines"):
        _valid_card(example_lines=too_many)


def test_voice_card_bundle_rejects_duplicate_character_ids():
    card_a = _valid_card()
    card_b = _valid_card()  # same character_id as card_a — collision
    with pytest.raises(ValueError, match="duplicate voice card"):
        CharacterVoiceCardBundle(cards=[card_a, card_b])


def test_voice_card_bundle_card_for_returns_match_or_none():
    bundle = CharacterVoiceCardBundle(cards=[_valid_card()])
    found = bundle.card_for("kai")
    assert found is not None and found.name == "Kai"
    assert bundle.card_for("narrator") is None
