"""Tests for deterministic storyboard grounding repair."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    AdaptationPlan,
    CharacterDesign,
    CharacterWorldBible,
    ContinuityLedger,
    PanelPurpose,
    ProtagonistContract,
    QualityReport,
    ScriptLine,
    ShotType,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
    StoryboardPage,
    StoryboardPanel,
)
from app.manga_pipeline import PipelineContext
from app.manga_pipeline.stages import storyboard_grounding_repair_stage


def _context() -> PipelineContext:
    context = PipelineContext(
        book_id="book_123",
        project_id="project_123",
        source_slice=SourceSlice(
            slice_id="slice_001",
            book_id="book_123",
            mode=SourceSliceMode.PAGES,
            source_range=SourceRange(page_start=1, page_end=10),
        ),
        prior_continuity=ContinuityLedger(project_id="project_123"),
    )
    context.adaptation_plan = AdaptationPlan(
        title="Scale Trial",
        logline="Kai learns why simple answers break at scale.",
        central_thesis="Scale changes what solutions are viable.",
        protagonist_contract=ProtagonistContract(
            who="Kai",
            wants="understand the source",
            why_cannot_have_it="the source is dense",
            what_they_do="turns facts into trials",
        ),
        important_fact_ids=["f001", "f002"],
    )
    context.character_bible = CharacterWorldBible(
        world_summary="A shifting archive.",
        visual_style="Black ink and screentone.",
        characters=[
            CharacterDesign(
                character_id="kai",
                name="Kai",
                role="protagonist",
                visual_lock="bookmark scarf",
            )
        ],
    )
    return context


def test_storyboard_grounding_repair_anchors_required_facts_without_visible_text():
    context = _context()
    context.storyboard_pages = [
        StoryboardPage(
            page_id="pg001",
            page_index=0,
            panels=[
                StoryboardPanel(
                    panel_id="p001",
                    scene_id="s001",
                    purpose=PanelPurpose.REVEAL,
                    shot_type=ShotType.WIDE,
                    composition="Kai studies the growing lock.",
                    action="The lock changes scale.",
                    source_fact_ids=["f001"],
                    character_ids=["kai"],
                )
            ],
        )
    ]

    result = asyncio.run(storyboard_grounding_repair_stage.run(context))

    assert result.storyboard_pages[0].panels[0].source_fact_ids == ["f001", "f002"]
    assert result.storyboard_pages[0].panels[0].narration == ""
    assert result.storyboard_pages[0].panels[0].dialogue == []


def test_storyboard_grounding_repair_removes_unknown_visual_characters_and_dialogue():
    context = _context()
    context.quality_report = QualityReport(passed=False)
    context.storyboard_pages = [
        StoryboardPage(
            page_id="pg001",
            page_index=0,
            panels=[
                StoryboardPanel(
                    panel_id="p001",
                    scene_id="s001",
                    purpose=PanelPurpose.REVEAL,
                    shot_type=ShotType.MEDIUM,
                    composition="Kai and an unnamed classmate face the lock.",
                    action="The lock grows.",
                    dialogue=[
                        ScriptLine(
                            speaker_id="classmate",
                            text="That key is useless now.",
                            source_fact_ids=["f002"],
                        )
                    ],
                    source_fact_ids=["f001"],
                    character_ids=["kai", "classmate"],
                )
            ],
        )
    ]

    result = asyncio.run(storyboard_grounding_repair_stage.run(context))
    panel = result.storyboard_pages[0].panels[0]

    assert panel.character_ids == ["kai"]
    assert panel.dialogue == []
    assert "That key is useless now." in panel.action
    assert panel.source_fact_ids == ["f001", "f002"]
    assert result.quality_report is None


def test_storyboard_grounding_repair_moves_excess_narration_to_action():
    context = _context()
    context.storyboard_pages = [
        StoryboardPage(
            page_id="pg001",
            page_index=0,
            panels=[
                StoryboardPanel(
                    panel_id=f"p00{i}",
                    scene_id="s001",
                    purpose=PanelPurpose.EXPLANATION,
                    shot_type=ShotType.MEDIUM,
                    composition="Kai studies the lock.",
                    action="The lock shifts.",
                    narration=f"Caption {i}",
                    source_fact_ids=["f001"],
                    character_ids=["kai"],
                )
                for i in range(3)
            ],
        )
    ]

    result = asyncio.run(storyboard_grounding_repair_stage.run(context))
    panels = result.storyboard_pages[0].panels

    assert [panel.narration for panel in panels] == ["Caption 0", "", ""]
    assert "Caption 1" in panels[1].action
    assert "Caption 2" in panels[2].action


def test_storyboard_grounding_repair_splits_over_budget_dialogue_into_panels():
    context = _context()
    context.storyboard_pages = [
        StoryboardPage(
            page_id="pg001",
            page_index=0,
            panels=[
                StoryboardPanel(
                    panel_id="p001",
                    scene_id="s001",
                    purpose=PanelPurpose.EXPLANATION,
                    shot_type=ShotType.MEDIUM,
                    composition="Kai explains the changing lock.",
                    action="Kai points to the lock.",
                    dialogue=[
                        ScriptLine(speaker_id="kai", text="A" * 60),
                        ScriptLine(speaker_id="kai", text="B" * 60),
                    ],
                    source_fact_ids=["f001"],
                    character_ids=["kai"],
                ),
                StoryboardPanel(
                    panel_id="p002",
                    scene_id="s001",
                    purpose=PanelPurpose.REVEAL,
                    shot_type=ShotType.WIDE,
                    composition="The lock fills the archive.",
                    action="The lock expands.",
                    source_fact_ids=["f002"],
                    character_ids=["kai"],
                ),
            ],
        )
    ]

    result = asyncio.run(storyboard_grounding_repair_stage.run(context))
    panels = result.storyboard_pages[0].panels

    assert len(panels) >= 3
    assert len({panel.panel_id for panel in panels}) == len(panels)
    assert all(sum(len(line.text) for line in panel.dialogue) <= 90 for panel in panels)
    assert all(len(line.text) <= 90 for panel in panels for line in panel.dialogue)


def test_storyboard_grounding_repair_cuts_unbroken_dialogue_at_word_boundary():
    context = _context()
    context.storyboard_pages = [
        StoryboardPage(
            page_id="pg001",
            page_index=0,
            panels=[
                StoryboardPanel(
                    panel_id="p001",
                    scene_id="s001",
                    purpose=PanelPurpose.EXPLANATION,
                    shot_type=ShotType.MEDIUM,
                    composition="Kai explains the changing lock.",
                    action="Kai points to the lock.",
                    dialogue=[
                        ScriptLine(
                            speaker_id="kai",
                            text="scale changes every answer " * 6,
                        )
                    ],
                    source_fact_ids=["f001"],
                    character_ids=["kai"],
                )
            ],
        )
    ]

    result = asyncio.run(storyboard_grounding_repair_stage.run(context))
    lines = [
        line.text
        for panel in result.storyboard_pages[0].panels
        for line in panel.dialogue
    ]

    assert lines
    assert all(len(text) <= 90 for text in lines)
    assert all(not text.endswith("-") for text in lines)


def test_storyboard_grounding_repair_adds_required_to_be_continued_panel():
    context = _context()
    context.options.update({"source_has_more": True, "slice_role": "opening"})
    context.storyboard_pages = [
        StoryboardPage(
            page_id="pg000",
            page_index=0,
            panels=[
                StoryboardPanel(
                    panel_id="p000",
                    scene_id="s001",
                    purpose=PanelPurpose.SETUP,
                    shot_type=ShotType.WIDE,
                    composition="Kai studies the archive.",
                    action="Kai studies the archive.",
                    source_fact_ids=["f001"],
                    character_ids=["kai"],
                )
            ],
        ),
        StoryboardPage(
            page_id="pg000b",
            page_index=1,
            panels=[
                StoryboardPanel(
                    panel_id="p000b",
                    scene_id="s001",
                    purpose=PanelPurpose.SETUP,
                    shot_type=ShotType.WIDE,
                    composition="The archive shifts.",
                    action="The archive shifts.",
                    source_fact_ids=["f002"],
                    character_ids=["kai"],
                )
            ],
        ),
        StoryboardPage(
            page_id="pg001",
            page_index=2,
            page_turn_hook="The next door waits.",
            panels=[
                StoryboardPanel(
                    panel_id="p001",
                    scene_id="s001",
                    purpose=PanelPurpose.REVEAL,
                    shot_type=ShotType.WIDE,
                    composition="Kai sees another door.",
                    action="Kai reaches for the handle.",
                    source_fact_ids=["f001", "f002"],
                    character_ids=["kai"],
                )
            ],
        )
    ]

    result = asyncio.run(storyboard_grounding_repair_stage.run(context))
    panel = result.storyboard_pages[-1].panels[-1]

    assert panel.purpose == PanelPurpose.TO_BE_CONTINUED
    assert panel.narration == "To be continued."
    assert result.storyboard_pages[-1].page_turn_hook == "The next door waits."


def test_storyboard_grounding_repair_clamps_pages_to_configured_max():
    context = _context()
    context.options.update({"max_storyboard_pages": 3, "target_storyboard_pages": 3})
    context.storyboard_pages = [
        StoryboardPage(
            page_id=f"pg{i:03d}",
            page_index=i,
            panels=[
                StoryboardPanel(
                    panel_id=f"p{i:03d}",
                    scene_id="s001",
                    purpose=PanelPurpose.REVEAL,
                    shot_type=ShotType.WIDE,
                    composition="Kai studies the growing lock.",
                    action="The lock changes scale.",
                    source_fact_ids=["f001", "f002"],
                    character_ids=["kai"],
                )
            ],
        )
        for i in range(5)
    ]

    result = asyncio.run(storyboard_grounding_repair_stage.run(context))

    assert len(result.storyboard_pages) == 3
    assert [page.page_index for page in result.storyboard_pages] == [0, 1, 2]


def test_storyboard_grounding_repair_expands_to_explicit_target_page_count():
    context = _context()
    context.options.update({"max_storyboard_pages": 5, "target_storyboard_pages": 5})
    context.storyboard_pages = [
        StoryboardPage(
            page_id=f"pg{i:03d}",
            page_index=i,
            panels=[
                StoryboardPanel(
                    panel_id=f"p{i:03d}",
                    scene_id="s001",
                    purpose=PanelPurpose.REVEAL,
                    shot_type=ShotType.WIDE,
                    composition="Kai studies the growing lock.",
                    action="The lock changes scale.",
                    source_fact_ids=["f001", "f002"],
                    character_ids=["kai"],
                )
            ],
        )
        for i in range(3)
    ]

    result = asyncio.run(storyboard_grounding_repair_stage.run(context))

    assert len(result.storyboard_pages) == 5
    assert [page.page_index for page in result.storyboard_pages] == [0, 1, 2, 3, 4]


def test_storyboard_grounding_repair_rechecks_narration_after_tbc():
    context = _context()
    context.options.update({"source_has_more": True, "slice_role": "opening"})
    context.storyboard_pages = [
        StoryboardPage(
            page_id="pg000",
            page_index=0,
            panels=[
                StoryboardPanel(
                    panel_id="p000",
                    scene_id="s001",
                    purpose=PanelPurpose.SETUP,
                    shot_type=ShotType.WIDE,
                    composition="Kai studies the archive.",
                    action="Kai studies the archive.",
                    source_fact_ids=["f001"],
                    character_ids=["kai"],
                )
            ],
        ),
        StoryboardPage(
            page_id="pg000b",
            page_index=1,
            panels=[
                StoryboardPanel(
                    panel_id="p000b",
                    scene_id="s001",
                    purpose=PanelPurpose.SETUP,
                    shot_type=ShotType.WIDE,
                    composition="The archive shifts.",
                    action="The archive shifts.",
                    source_fact_ids=["f002"],
                    character_ids=["kai"],
                )
            ],
        ),
        StoryboardPage(
            page_id="pg001",
            page_index=2,
            page_turn_hook="The next door waits.",
            panels=[
                StoryboardPanel(
                    panel_id="p001",
                    scene_id="s001",
                    purpose=PanelPurpose.REVEAL,
                    shot_type=ShotType.WIDE,
                    composition="Kai sees another door.",
                    action="Kai reaches for the handle.",
                    narration="One caption stays.",
                    source_fact_ids=["f001"],
                    character_ids=["kai"],
                ),
                StoryboardPanel(
                    panel_id="p002",
                    scene_id="s001",
                    purpose=PanelPurpose.REVEAL,
                    shot_type=ShotType.WIDE,
                    composition="The door glows.",
                    action="The door glows.",
                    source_fact_ids=["f002"],
                    character_ids=["kai"],
                ),
                StoryboardPanel(
                    panel_id="p003",
                    scene_id="s001",
                    purpose=PanelPurpose.REVEAL,
                    shot_type=ShotType.WIDE,
                    composition="Kai pauses.",
                    action="Kai pauses.",
                    source_fact_ids=["f002"],
                    character_ids=["kai"],
                ),
            ],
        )
    ]

    result = asyncio.run(storyboard_grounding_repair_stage.run(context))
    panels = result.storyboard_pages[-1].panels

    assert panels[-1].purpose == PanelPurpose.TO_BE_CONTINUED
    assert [panel.narration for panel in panels].count("To be continued.") == 0
    assert sum(1 for panel in panels if panel.narration) == 1
    assert "To be continued." in panels[-1].action
