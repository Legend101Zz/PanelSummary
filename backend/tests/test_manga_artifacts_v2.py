"""Tests for manga creative artifact contracts."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    AdaptationPlan,
    Beat,
    BeatSheet,
    CharacterDesign,
    CharacterWorldBible,
    EmotionalTone,
    MangaScript,
    MangaScriptScene,
    PanelPurpose,
    ProtagonistContract,
    ScriptLine,
    ShotType,
    StoryboardPage,
    StoryboardPanel,
)


def _contract() -> ProtagonistContract:
    return ProtagonistContract(
        who="Kai, a reader exploring the PDF's argument",
        wants="to understand the source without reading every page",
        why_cannot_have_it="the source hides its logic across many sections",
        what_they_do="turns each key idea into a visual trial",
    )


def test_adaptation_plan_requires_core_gist_backbone():
    plan = AdaptationPlan(
        title="The Archive of Scale",
        logline="A reader enters an archive where every door is a source idea.",
        central_thesis="Scale changes which solutions work.",
        protagonist_contract=_contract(),
        important_fact_ids=["f001", "f002"],
        emotional_journey=["curious", "challenged", "clear"],
        intellectual_journey=["premise", "tradeoff", "synthesis"],
    )

    assert plan.structure == "ki-sho-ten-ketsu"
    assert plan.important_fact_ids == ["f001", "f002"]


def test_adaptation_plan_rejects_missing_facts():
    with pytest.raises(ValueError):
        AdaptationPlan(
            title="Thin Plan",
            logline="Stuff happens.",
            central_thesis="A thesis exists.",
            protagonist_contract=_contract(),
        )


def test_character_world_bible_requires_reusable_characters():
    bible = CharacterWorldBible(
        world_summary="A library of impossible rooms, each room a concept.",
        visual_style="High-contrast manga, readable lettering, symbolic props.",
        recurring_motifs=["doors", "keys", "margin notes"],
        characters=[
            CharacterDesign(
                character_id="kai",
                name="Kai",
                role="protagonist",
                visual_lock="round glasses, black hoodie, spark-shaped bookmark",
                silhouette_notes="small figure with oversized backpack",
            )
        ],
    )

    assert bible.characters[0].character_id == "kai"
    assert "Readable" in bible.lettering_notes


def test_beat_sheet_requires_fact_or_thread_grounding():
    with pytest.raises(ValueError):
        Beat(beat_id="b001", story_function="A vague thing happens")

    beat = Beat(
        beat_id="b001",
        source_fact_ids=["f001"],
        story_function="Reveal the core contradiction.",
    )
    sheet = BeatSheet(slice_id="slice_001", slice_role="opening", beats=[beat])

    assert sheet.beats[0].source_fact_ids == ["f001"]


def test_script_lines_are_short_enough_for_bubbles():
    ScriptLine(speaker_id="kai", text="So the easy answer breaks when the system grows?")
    with pytest.raises(ValueError):
        ScriptLine(speaker_id="kai", text="x" * 181)


def test_manga_script_scene_requires_action_and_text():
    scene = MangaScriptScene(
        scene_id="s001",
        beat_ids=["b001"],
        location="Archive entrance",
        scene_goal="Introduce the thesis as a mystery.",
        action="Kai notices the same key fails in a larger lock.",
        dialogue=[ScriptLine(speaker_id="kai", text="Wait. Same key, different door?")],
        emotional_tone=EmotionalTone.REVELATORY,
    )
    script = MangaScript(slice_id="slice_001", scenes=[scene], to_be_continued=True)

    assert script.scenes[0].emotional_tone == EmotionalTone.REVELATORY
    assert script.to_be_continued is True


def test_storyboard_page_limits_panel_count_and_requires_composition():
    panel = StoryboardPanel(
        panel_id="p001",
        scene_id="s001",
        purpose=PanelPurpose.REVEAL,
        shot_type=ShotType.CLOSE_UP,
        composition="Close-up on the key bending in the lock.",
        action="The lock expands beyond the key's teeth.",
        source_fact_ids=["f001"],
        character_ids=["kai"],
    )
    page = StoryboardPage(page_id="pg001", page_index=0, panels=[panel], page_turn_hook="The door opens anyway.")

    assert page.reading_flow == "top-right to bottom-left"
    assert page.panels[0].shot_type == ShotType.CLOSE_UP


def test_storyboard_page_rejects_crowded_pages():
    panels = [
        StoryboardPanel(
            panel_id=f"p{i}",
            scene_id="s001",
            purpose=PanelPurpose.EXPLANATION,
            shot_type=ShotType.MEDIUM,
            composition="A readable panel.",
            narration="A fact appears.",
        )
        for i in range(8)
    ]

    with pytest.raises(ValueError):
        StoryboardPage(page_id="pg_crowded", page_index=0, panels=panels)
