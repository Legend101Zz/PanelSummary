"""Tests for storyboard → V4 mapper."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import PanelPurpose, ScriptLine, ShotType, StoryboardPage, StoryboardPanel
from app.rendering.v4 import storyboard_page_to_v4


def test_storyboard_page_to_v4_maps_dialogue_panel():
    page = StoryboardPage(
        page_id="pg001",
        page_index=2,
        panels=[
            StoryboardPanel(
                panel_id="p001",
                scene_id="s001",
                purpose=PanelPurpose.REVEAL,
                shot_type=ShotType.CLOSE_UP,
                composition="Kai grips the cracked key.",
                action="The key bends under pressure.",
                dialogue=[ScriptLine(speaker_id="kai", text="It only worked when the lock was small.", intent="shocked")],
                character_ids=["kai"],
            )
        ],
    )

    v4_page = storyboard_page_to_v4(page, chapter_index=3)
    payload = v4_page.to_dict()

    assert payload["version"] == "4.0"
    assert payload["layout"] == "full"
    assert payload["chapter_index"] == 3
    assert payload["panels"][0]["type"] == "dialogue"
    assert payload["panels"][0]["lines"][0]["who"] == "kai"
    assert payload["panels"][0]["effects"] == ["impact"]


def test_storyboard_page_to_v4_maps_to_be_continued_panel():
    page = StoryboardPage(
        page_id="pg002",
        page_index=3,
        panels=[
            StoryboardPanel(
                panel_id="p_tbc",
                scene_id="s_tbc",
                purpose=PanelPurpose.TO_BE_CONTINUED,
                shot_type=ShotType.SYMBOLIC,
                composition="A half-open door glows on the final page.",
                narration="The first door opened. The real mechanism waits ahead.",
            )
        ],
    )

    panel = storyboard_page_to_v4(page).to_dict()["panels"][0]

    assert panel["type"] == "transition"
    assert panel["title"] == "To be continued..."
    assert panel["effects"] == ["page_turn"]
    assert panel["emphasis"] == "high"


def test_storyboard_page_to_v4_uses_asymmetric_layout_for_three_panels():
    panels = [
        StoryboardPanel(
            panel_id=f"p{i}",
            scene_id="s001",
            purpose=PanelPurpose.EXPLANATION,
            shot_type=ShotType.MEDIUM,
            composition="Readable composition.",
            narration=f"Fact {i}",
        )
        for i in range(3)
    ]
    page = StoryboardPage(page_id="pg003", page_index=4, panels=panels)

    assert storyboard_page_to_v4(page).layout == "asymmetric"
