"""Phase 4.1 \u2014 RenderedPage domain model invariants.

Pinning the contract surface that replaces the lossy V4 projection
between the storyboarder and the panel renderer. The model is the wire
format end-to-end (persistence, API, frontend), so the invariants here
are also invariants for every consumer downstream.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    BubblePlacement,
    LayoutBoxPct,
    PageComposition,
    PageGridRow,
    PanelPlacement,
    PanelPurpose,
    PanelRenderArtifact,
    RenderedPage,
    ScriptLine,
    ShotType,
    SpriteLayer,
    StoryboardPage,
    StoryboardPanel,
    empty_rendered_page,
)


# --- Builders -----------------------------------------------------------------
#
# Local, focused, tiny. We deliberately do NOT pull in a shared fixture file:
# the whole point of these tests is to exercise the contract independent of
# any other domain code, so the builders are spelled out here.


def _panel(
    panel_id: str,
    *,
    shot: ShotType = ShotType.MEDIUM,
    purpose: PanelPurpose = PanelPurpose.SETUP,
    character_ids: list[str] | None = None,
) -> StoryboardPanel:
    return StoryboardPanel(
        panel_id=panel_id,
        scene_id="scene-1",
        purpose=purpose,
        shot_type=shot,
        composition="Two-shot, Aiko foregrounded against the lab window.",
        action="Aiko points at the readout.",
        narration="The lab hums.",
        dialogue=[ScriptLine(speaker_id="aiko", text="It worked.")],
        character_ids=list(character_ids) if character_ids is not None else ["aiko"],
    )


def _page(panels: list[StoryboardPanel], *, page_index: int = 0) -> StoryboardPage:
    return StoryboardPage(
        page_id=f"page-{page_index}",
        page_index=page_index,
        panels=panels,
    )


def _composition(
    *,
    page_index: int,
    panel_order: list[str],
    page_turn: str = "",
) -> PageComposition:
    # One row per panel keeps the compositions trivially valid: each row
    # has one cell at 100%. Composition correctness lives in its own
    # tests; here we only need a real PageComposition to plug into
    # RenderedPage so the cross-validators run.
    return PageComposition(
        page_index=page_index,
        gutter_grid=[PageGridRow(cell_widths_pct=[100]) for _ in panel_order],
        panel_order=panel_order,
        page_turn_panel_id=page_turn,
    )


# --- PanelRenderArtifact ------------------------------------------------------


def test_panel_render_artifact_defaults_to_unrendered_state():
    """A fresh artifact reads as 'not yet rendered' so callers can skip safely."""
    artifact = PanelRenderArtifact()
    assert artifact.image_path == ""
    assert artifact.error == ""
    assert artifact.is_rendered is False


def test_panel_render_artifact_is_rendered_only_when_path_set_and_no_error():
    """is_rendered guards both success conditions; errors poison the path."""
    rendered = PanelRenderArtifact(image_path="x.png")
    assert rendered.is_rendered is True

    failed_after_path = PanelRenderArtifact(image_path="x.png", error="renderer 500")
    assert failed_after_path.is_rendered is False

    failed_no_path = PanelRenderArtifact(error="renderer 500")
    assert failed_no_path.is_rendered is False


# --- RenderedPage validators --------------------------------------------------


def test_rendered_page_requires_an_artifact_for_every_panel():
    """Missing an artifact slot is a contract violation \u2014 the renderer would silently skip."""
    page = _page([_panel("a"), _panel("b")])
    with pytest.raises(ValueError, match="missing"):
        RenderedPage(
            storyboard_page=page,
            panel_artifacts={"a": PanelRenderArtifact()},
        )


def test_rendered_page_rejects_artifacts_for_unknown_panel_ids():
    """Extra artifacts mean a panel was renamed or deleted; persistence would lie."""
    page = _page([_panel("a")])
    with pytest.raises(ValueError, match="unknown panel ids"):
        RenderedPage(
            storyboard_page=page,
            panel_artifacts={
                "a": PanelRenderArtifact(),
                "ghost": PanelRenderArtifact(),
            },
        )


def test_rendered_page_accepts_no_composition_for_legacy_pages():
    """composition=None is the documented fallback when the LLM gave up."""
    page = _page([_panel("a")])
    rendered = RenderedPage(
        storyboard_page=page,
        composition=None,
        panel_artifacts={"a": PanelRenderArtifact()},
    )
    assert rendered.composition is None


def test_rendered_page_rejects_composition_with_mismatched_page_index():
    """A composition pointing at a different page index is a wiring bug."""
    page = _page([_panel("a")], page_index=2)
    bad = _composition(page_index=5, panel_order=["a"])
    with pytest.raises(ValueError, match="page_index"):
        RenderedPage(
            storyboard_page=page,
            composition=bad,
            panel_artifacts={"a": PanelRenderArtifact()},
        )


def test_rendered_page_rejects_composition_panel_order_mismatch():
    """panel_order must be a permutation of the storyboard's panel ids."""
    page = _page([_panel("a"), _panel("b")])
    bad = _composition(page_index=0, panel_order=["a", "c"])
    with pytest.raises(ValueError, match="permutation"):
        RenderedPage(
            storyboard_page=page,
            composition=bad,
            panel_artifacts={
                "a": PanelRenderArtifact(),
                "b": PanelRenderArtifact(),
            },
        )


# --- panels_in_reading_order --------------------------------------------------


def test_panels_in_reading_order_falls_back_to_storyboard_order_when_no_composition():
    """Without composition, the storyboard's authored order is the reading order."""
    page = _page([_panel("a"), _panel("b"), _panel("c")])
    rendered = RenderedPage(
        storyboard_page=page,
        panel_artifacts={p.panel_id: PanelRenderArtifact() for p in page.panels},
    )
    assert [p.panel_id for p in rendered.panels_in_reading_order()] == ["a", "b", "c"]


def test_panels_in_reading_order_uses_composition_panel_order_when_present():
    """The composition's panel_order is the RTL reading sequence; trust it."""
    page = _page([_panel("a"), _panel("b"), _panel("c")])
    composition = _composition(page_index=0, panel_order=["c", "a", "b"])
    rendered = RenderedPage(
        storyboard_page=page,
        composition=composition,
        panel_artifacts={p.panel_id: PanelRenderArtifact() for p in page.panels},
    )
    assert [p.panel_id for p in rendered.panels_in_reading_order()] == ["c", "a", "b"]


# --- empty_rendered_page ------------------------------------------------------


def test_empty_rendered_page_creates_one_artifact_per_panel():
    """The assembly stage relies on this so every panel id has a slot up front."""
    page = _page([_panel("a"), _panel("b")])
    rendered = empty_rendered_page(storyboard_page=page, composition=None)
    assert set(rendered.panel_artifacts.keys()) == {"a", "b"}
    assert all(not artifact.is_rendered for artifact in rendered.panel_artifacts.values())


def test_empty_rendered_page_seeds_requested_character_count_from_dedup_set():
    """Sprite-bank hit-rate later divides resolved by requested; pre-seed correctly."""
    panel = _panel("a", character_ids=["aiko", "kai", "aiko", ""])
    page = _page([panel])
    rendered = empty_rendered_page(storyboard_page=page, composition=None)
    # "aiko" appears twice; "" is filtered out; dedup yields 2.
    assert rendered.panel_artifacts["a"].requested_character_count == 2


def test_empty_rendered_page_passes_through_composition():
    """The assembly stage hands composition through unchanged when the LLM authored one."""
    page = _page([_panel("a")])
    composition = _composition(page_index=0, panel_order=["a"], page_turn="a")
    rendered = empty_rendered_page(storyboard_page=page, composition=composition)
    assert rendered.composition is composition


# --- Explicit render layout contract -----------------------------------------


def test_page_composition_accepts_explicit_layout_fields():
    """The expanded wire contract carries row rhythm, boxes, sprites, and bubbles."""
    page = _page([_panel("a")])
    composition = PageComposition(
        page_index=0,
        gutter_grid=[PageGridRow(cell_widths_pct=[100])],
        panel_order=["a"],
        row_heights_pct=[100],
        gutter_px=10,
        panel_placements={
            "a": PanelPlacement(
                bbox_pct=LayoutBoxPct(x_pct=0, y_pct=0, width_pct=100, height_pct=100),
                bleed_edges=["top", "bottom"],
            )
        },
        sprite_layers={
            "a": [
                SpriteLayer(
                    character_id="aiko",
                    bbox_pct=LayoutBoxPct(x_pct=18, y_pct=30, width_pct=42, height_pct=62),
                    z_index=20,
                )
            ]
        },
        bubble_placements={
            "a": [
                BubblePlacement(
                    line_index=0,
                    speaker_id="aiko",
                    bbox_pct=LayoutBoxPct(x_pct=50, y_pct=8, width_pct=42, height_pct=24),
                    z_index=40,
                )
            ]
        },
    )

    rendered = RenderedPage(
        storyboard_page=page,
        composition=composition,
        panel_artifacts={"a": PanelRenderArtifact()},
    )
    payload = rendered.model_dump(mode="json")
    restored = RenderedPage.model_validate(payload)

    assert restored.composition is not None
    assert restored.composition.row_heights_pct == [100]
    assert restored.composition.gutter_px == 10
    assert restored.composition.panel_placements["a"].bleed_edges == ["top", "bottom"]
    assert restored.composition.sprite_layers["a"][0].character_id == "aiko"
    assert restored.composition.bubble_placements["a"][0].line_index == 0


def test_page_composition_rejects_bad_row_height_sum():
    """Row heights are percentages, so partial totals are rejected loudly."""
    with pytest.raises(ValueError, match="row_heights_pct must sum"):
        PageComposition(
            page_index=0,
            gutter_grid=[
                PageGridRow(cell_widths_pct=[100]),
                PageGridRow(cell_widths_pct=[100]),
            ],
            panel_order=["a", "b"],
            row_heights_pct=[40, 40],
        )


def test_rendered_page_rejects_sprite_for_character_not_in_panel():
    """Sprite placement must reference on-stage characters, not random assets."""
    page = _page([_panel("a", character_ids=["aiko"])])
    composition = _composition(page_index=0, panel_order=["a"])
    composition.sprite_layers["a"] = [
        SpriteLayer(
            character_id="ghost",
            bbox_pct=LayoutBoxPct(x_pct=10, y_pct=20, width_pct=30, height_pct=70),
        )
    ]
    with pytest.raises(ValueError, match="outside panel"):
        RenderedPage(
            storyboard_page=page,
            composition=composition,
            panel_artifacts={"a": PanelRenderArtifact()},
        )


def test_rendered_page_rejects_bubble_line_index_out_of_range():
    """Bubble placements target real dialogue rows by zero-based line_index."""
    page = _page([_panel("a")])
    composition = _composition(page_index=0, panel_order=["a"])
    composition.bubble_placements["a"] = [
        BubblePlacement(
            line_index=3,
            bbox_pct=LayoutBoxPct(x_pct=10, y_pct=10, width_pct=80, height_pct=30),
        )
    ]
    with pytest.raises(ValueError, match="line_index"):
        RenderedPage(
            storyboard_page=page,
            composition=composition,
            panel_artifacts={"a": PanelRenderArtifact()},
        )


# --- Wire-format round-trip ---------------------------------------------------


def test_rendered_page_round_trips_through_model_dump_and_validate():
    """The persistence layer writes model_dump and reads model_validate \u2014 invariant."""
    page = _page([_panel("a"), _panel("b")])
    composition = _composition(page_index=0, panel_order=["b", "a"], page_turn="a")
    rendered = empty_rendered_page(storyboard_page=page, composition=composition)
    rendered.panel_artifacts["a"].image_path = "panels/a.png"
    rendered.panel_artifacts["a"].image_aspect_ratio = "4:5"

    payload = rendered.model_dump(mode="json")
    restored = RenderedPage.model_validate(payload)

    assert restored.storyboard_page.page_id == "page-0"
    assert restored.composition is not None
    assert restored.composition.panel_order == ["b", "a"]
    assert restored.panel_artifacts["a"].image_path == "panels/a.png"
    assert restored.panel_artifacts["a"].is_rendered is True
    assert restored.panel_artifacts["b"].is_rendered is False
