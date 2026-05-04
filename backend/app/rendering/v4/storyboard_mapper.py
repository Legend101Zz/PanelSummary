"""Map authored storyboard pages into V4 semantic pages."""

from __future__ import annotations

from app.domain.manga import PanelPurpose, ShotType, StoryboardPage, StoryboardPanel
from app.v4_types import V4DialogueLine, V4Page, V4Panel


def _layout_for_panel_count(count: int) -> str:
    if count <= 1:
        return "full"
    if count == 2:
        return "vertical"
    if count == 3:
        return "asymmetric"
    return "grid-4"


def _panel_type(panel: StoryboardPanel) -> str:
    if panel.purpose == PanelPurpose.TO_BE_CONTINUED:
        return "transition"
    if panel.purpose == PanelPurpose.TRANSITION:
        return "transition"
    if panel.dialogue:
        return "dialogue"
    if panel.purpose == PanelPurpose.REVEAL and panel.shot_type in {ShotType.SYMBOLIC, ShotType.INSERT}:
        return "concept"
    if panel.purpose == PanelPurpose.RECAP:
        return "narration"
    return "narration" if panel.narration else "concept"


def _emphasis(panel: StoryboardPanel) -> str:
    if panel.purpose in {PanelPurpose.REVEAL, PanelPurpose.TO_BE_CONTINUED}:
        return "high"
    if panel.shot_type in {ShotType.CLOSE_UP, ShotType.EXTREME_CLOSE_UP, ShotType.SYMBOLIC}:
        return "high"
    if panel.purpose == PanelPurpose.TRANSITION:
        return "low"
    return "medium"


def _effects(panel: StoryboardPanel) -> list[str]:
    effects: list[str] = []
    if panel.purpose == PanelPurpose.REVEAL:
        effects.append("impact")
    if panel.purpose == PanelPurpose.TO_BE_CONTINUED:
        effects.append("page_turn")
    if panel.shot_type == ShotType.EXTREME_CLOSE_UP:
        effects.append("zoom")
    return effects


def _primary_character(panel: StoryboardPanel) -> str:
    return panel.character_ids[0] if panel.character_ids else ""


def _dialogue_lines(panel: StoryboardPanel) -> list[V4DialogueLine]:
    return [
        V4DialogueLine(
            who=line.speaker_id,
            says=line.text,
            emotion=line.intent or "neutral",
        )
        for line in panel.dialogue
    ]


def storyboard_panel_to_v4(panel: StoryboardPanel, *, page_index: int, chapter_index: int) -> V4Panel:
    """Convert one storyboard panel into V4 semantic intent."""
    narration = panel.narration or panel.action
    title = "To be continued..." if panel.purpose == PanelPurpose.TO_BE_CONTINUED else ""

    return V4Panel(
        type=_panel_type(panel),
        scene=panel.scene_id,
        mood="revelatory" if panel.purpose == PanelPurpose.REVEAL else "",
        title=title,
        narration=narration[:200],
        lines=_dialogue_lines(panel),
        character=_primary_character(panel),
        pose="standing" if panel.character_ids else "",
        expression="determined" if panel.purpose == PanelPurpose.REVEAL else "neutral",
        effects=_effects(panel),
        emphasis=_emphasis(panel),
        panel_id=panel.panel_id,
        chapter_index=chapter_index,
        page_index=page_index,
    )


def storyboard_page_to_v4(page: StoryboardPage, *, chapter_index: int = 0) -> V4Page:
    """Convert an authored storyboard page into a V4 page."""
    panels = [
        storyboard_panel_to_v4(panel, page_index=page.page_index, chapter_index=chapter_index)
        for panel in page.panels
    ]
    return V4Page(
        page_index=page.page_index,
        chapter_index=chapter_index,
        layout=_layout_for_panel_count(len(panels)),
        panels=panels,
    )
