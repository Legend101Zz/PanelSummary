"""Tests for the storyboard \u2192 V4 mapper Phase C1 composition path.

Covers the new behaviour layered on top of the legacy mapper:

* gutter_grid + page_turn_panel_id flow through to V4Page
* composition.panel_order reorders the V4 panels
* panel_emphasis_overrides win over the storyboard's derived emphasis
* an empty composition leaves the legacy panel-count layout untouched
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    PageComposition,
    PageGridRow,
    PanelPurpose,
    ShotType,
    StoryboardPage,
    StoryboardPanel,
)
from app.rendering.v4 import storyboard_page_to_v4


def _panel(panel_id: str, *, purpose: PanelPurpose = PanelPurpose.SETUP) -> StoryboardPanel:
    return StoryboardPanel(
        panel_id=panel_id,
        scene_id="s001",
        purpose=purpose,
        shot_type=ShotType.MEDIUM,
        composition=f"Composition for {panel_id}.",
        narration=f"{panel_id} happens.",
    )


def _page() -> StoryboardPage:
    return StoryboardPage(
        page_id="pg001",
        page_index=0,
        panels=[_panel("p001"), _panel("p002"), _panel("p003")],
    )


def test_composition_carries_gutter_grid_and_page_turn_id():
    composition = PageComposition(
        page_index=0,
        gutter_grid=[
            PageGridRow(cell_widths_pct=[60, 40]),
            PageGridRow(cell_widths_pct=[100]),
        ],
        panel_order=["p002", "p001", "p003"],
        page_turn_panel_id="p003",
        composition_notes="Splash on the reveal.",
    )

    v4 = storyboard_page_to_v4(_page(), composition=composition)
    payload = v4.to_dict()

    # Layout token reset to "custom" so any old renderer reading layout
    # alone falls back to a default rather than mis-applying "asymmetric".
    assert payload["layout"] == "custom"
    assert payload["gutter_grid"] == [[60, 40], [100]]
    assert payload["page_turn_panel_id"] == "p003"
    assert payload["composition_notes"] == "Splash on the reveal."
    # Reordered to match the composition's panel_order.
    assert [p["panel_id"] for p in payload["panels"]] == ["p002", "p001", "p003"]


def test_composition_emphasis_override_wins_over_default_derivation():
    # p001 has no purpose/shot trigger for "high" emphasis \u2014 the legacy
    # path would emit "medium". The override should bump it to "high".
    composition = PageComposition(
        page_index=0,
        gutter_grid=[PageGridRow(cell_widths_pct=[100])] * 3,
        panel_order=["p001", "p002", "p003"],
        panel_emphasis_overrides={"p001": "high"},
    )

    panels = storyboard_page_to_v4(_page(), composition=composition).panels
    p001 = next(p for p in panels if p.panel_id == "p001")
    assert p001.emphasis == "high"

    # No override on p002 \u2192 default derivation kicks in (\"medium\").
    p002 = next(p for p in panels if p.panel_id == "p002")
    assert p002.emphasis == "medium"


def test_default_composition_falls_back_to_legacy_layout():
    # An empty (default) composition is what the stage emits when the
    # LLM fails. The mapper must transparently revert to the panel-count
    # layout token \u2014 same behaviour as before Phase C1 existed.
    composition = PageComposition(
        page_index=0,
        gutter_grid=[],
        panel_order=[],
    )
    payload = storyboard_page_to_v4(_page(), composition=composition).to_dict()

    assert payload["layout"] == "asymmetric"  # 3 panels \u2192 legacy mapping
    assert payload["gutter_grid"] == []
    assert payload["page_turn_panel_id"] == ""


def test_composition_with_one_extra_panel_still_renders_all_panels():
    """If panel_order is short, leftover panels still appear at the end.

    We can't easily *construct* a partially-ordered composition through
    the validator (it requires 1:1 panel_order \u2194 cells), but the mapper's
    ``_ordered_panels`` helper has the safety net regardless. Exercise
    it via a short permutation in panel_order; the mapper should keep
    every storyboard panel, even ones the composition forgot.
    """
    # Fake an internal-only condition: a composition whose panel_order
    # is short but legal (one row of one cell, one panel). The other two
    # storyboard panels should still land in V4 \u2014 nothing silently
    # disappears.
    composition = PageComposition(
        page_index=0,
        gutter_grid=[PageGridRow(cell_widths_pct=[100])],
        panel_order=["p002"],
    )
    panels = storyboard_page_to_v4(_page(), composition=composition).panels
    assert {p.panel_id for p in panels} == {"p001", "p002", "p003"}
    # The named panel comes first; leftovers preserve storyboard order.
    assert panels[0].panel_id == "p002"
