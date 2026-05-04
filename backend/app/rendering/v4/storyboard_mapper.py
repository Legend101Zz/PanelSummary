"""Map authored storyboard pages into V4 semantic pages.

Two layout paths
----------------
1. Legacy (no composition): keep the original 4-entry layout lookup
   keyed on panel count. This path is what every test fixture and
   every page rendered before Phase C1 expects, so we keep it as the
   default.
2. Composition (Phase C1): when the caller provides a ``PageComposition``
   we forward its gutter grid and page-turn anchor onto the V4Page.
   ``layout`` is set to ``"custom"`` so older renderers fall back to a
   sensible default rather than silently mis-rendering against a
   layout token they don't understand.

The mapper also applies ``panel_emphasis_overrides`` so a panel that the
composition wants to promote shows ``emphasis="high"`` even if the
storyboard authored it as medium. Renderer code reading panel.emphasis
sees one truth.
"""

from __future__ import annotations

from app.domain.manga import (
    PageComposition,
    PanelPurpose,
    ShotType,
    StoryboardPage,
    StoryboardPanel,
)
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


def _emphasis(panel: StoryboardPanel, override: str | None = None) -> str:
    """Return the emphasis level for a panel.

    The composition's override wins because it is the latest editorial
    decision; otherwise we derive from purpose / shot type the same way
    the v1 mapper did.
    """
    if override:
        return override
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


def storyboard_panel_to_v4(
    panel: StoryboardPanel,
    *,
    page_index: int,
    chapter_index: int,
    emphasis_override: str | None = None,
) -> V4Panel:
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
        # Phase 7: forward the FULL list so the panel renderer can attach
        # one reference sheet per character. Without this, the renderer
        # only saw the primary character and panels with two characters
        # drifted off-model for the secondary speaker.
        character_ids=list(panel.character_ids),
        pose="standing" if panel.character_ids else "",
        expression="determined" if panel.purpose == PanelPurpose.REVEAL else "neutral",
        effects=_effects(panel),
        emphasis=_emphasis(panel, override=emphasis_override),
        panel_id=panel.panel_id,
        chapter_index=chapter_index,
        page_index=page_index,
    )


def _ordered_panels(
    page: StoryboardPage, composition: PageComposition
) -> list[StoryboardPanel]:
    """Return page.panels reordered to match composition.panel_order.

    Coercion already filtered out compositions whose ids do not match
    the storyboard, so this is purely a lookup-and-reorder. Any panel
    not mentioned (which shouldn't happen post-coercion) lands at the
    end so we never silently drop a beat.
    """
    by_id = {panel.panel_id: panel for panel in page.panels}
    ordered = [by_id[pid] for pid in composition.panel_order if pid in by_id]
    leftovers = [p for p in page.panels if p.panel_id not in composition.panel_order]
    return ordered + leftovers


def storyboard_page_to_v4(
    page: StoryboardPage,
    *,
    chapter_index: int = 0,
    composition: PageComposition | None = None,
) -> V4Page:
    """Convert an authored storyboard page into a V4 page.

    With ``composition`` supplied the V4Page carries the gutter grid and
    page-turn anchor; without it we keep the legacy panel-count layout.
    """
    if composition is not None and not composition.is_default:
        ordered = _ordered_panels(page, composition)
        panels = [
            storyboard_panel_to_v4(
                panel,
                page_index=page.page_index,
                chapter_index=chapter_index,
                emphasis_override=composition.panel_emphasis_overrides.get(
                    panel.panel_id
                ),
            )
            for panel in ordered
        ]
        return V4Page(
            page_index=page.page_index,
            chapter_index=chapter_index,
            layout="custom",
            panels=panels,
            gutter_grid=[list(row.cell_widths_pct) for row in composition.gutter_grid],
            page_turn_panel_id=composition.page_turn_panel_id,
            composition_notes=composition.composition_notes,
        )

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
