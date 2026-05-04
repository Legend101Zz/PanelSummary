"""Tests for the heuristic voice validator (Phase A2)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    CharacterDesign,
    CharacterWorldBible,
    EmotionalTone,
    MangaScript,
    MangaScriptScene,
    ScriptLine,
)
from app.services.manga.voice_validator import GENERIC_PHRASES, validate_voice


def _bible_with(*characters: CharacterDesign) -> CharacterWorldBible:
    return CharacterWorldBible(
        world_summary="A world.",
        visual_style="Manga ink.",
        characters=list(characters),
    )


def _kai() -> CharacterDesign:
    return CharacterDesign(
        character_id="kai",
        name="Kai",
        role="protagonist",
        visual_lock="bookmark scarf, angular hair",
        speech_style="short curious questions",
    )


def _script_with_lines(*lines: ScriptLine) -> MangaScript:
    return MangaScript(
        slice_id="slice_001",
        scenes=[
            MangaScriptScene(
                scene_id="s001",
                beat_ids=["b001"],
                location="The Archive",
                scene_goal="Reveal the truth.",
                action="Kai turns the key.",
                dialogue=list(lines),
                emotional_tone=EmotionalTone.CURIOUS,
            )
        ],
    )


def test_validate_voice_passes_for_clean_script():
    bible = _bible_with(_kai())
    script = _script_with_lines(
        ScriptLine(speaker_id="kai", text="The same key stops working.")
    )

    issues = validate_voice(script=script, bible=bible)

    assert issues == []


def test_unknown_speaker_is_an_error():
    bible = _bible_with(_kai())
    script = _script_with_lines(
        ScriptLine(speaker_id="ghost", text="I am not in the bible.")
    )

    issues = validate_voice(script=script, bible=bible)

    assert len(issues) == 1
    assert issues[0].code == "SCRIPT_UNKNOWN_SPEAKER"
    assert issues[0].severity == "error"
    assert issues[0].speaker_id == "ghost"


def test_oversize_line_is_flagged():
    bible = _bible_with(_kai())
    long_text = "k" * 161
    script = _script_with_lines(ScriptLine(speaker_id="kai", text=long_text))

    issues = validate_voice(script=script, bible=bible)

    assert any(issue.code == "SCRIPT_LINE_TOO_LONG" for issue in issues)


def test_generic_phrase_is_a_warning_not_error():
    bible = _bible_with(_kai())
    # Use a phrase from the canonical list so the test does not drift if we
    # add new phrases.
    phrase = GENERIC_PHRASES[0]
    script = _script_with_lines(
        ScriptLine(speaker_id="kai", text=f"Listen — {phrase}.")
    )

    issues = validate_voice(script=script, bible=bible)

    cliche = [issue for issue in issues if issue.code == "SCRIPT_GENERIC_PHRASE"]
    assert len(cliche) == 1
    assert cliche[0].severity == "warning"
    assert phrase in cliche[0].message


def test_validate_voice_locates_line_index_per_scene():
    bible = _bible_with(_kai())
    script = _script_with_lines(
        ScriptLine(speaker_id="kai", text="ok"),
        ScriptLine(speaker_id="ghost", text="hi"),
    )

    issues = validate_voice(script=script, bible=bible)
    unknown = [i for i in issues if i.code == "SCRIPT_UNKNOWN_SPEAKER"][0]

    assert unknown.line_index == 1
    assert unknown.scene_id == "s001"
