"""Tests for the multimodal panel rendering service (Phase 4).

These tests cover the pure pieces — prompt composition, reference selection,
aspect-ratio mapping — and the orchestration shape of ``render_pages`` with a
fake panel renderer. We do NOT test the real OpenRouter call here; that's
exercised by integration runs against the live image model.
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import (
    CharacterArtDirection,
    CharacterArtDirectionBundle,
    CharacterDesign,
    CharacterWorldBible,
    ExpressionDirection,
)
from app.services.manga.panel_rendering_service import (
    aspect_ratio_for_panel,
    build_asset_lookup,
    build_panel_prompt,
    build_panel_relative_path,
    render_pages,
    select_reference_paths_for_characters,
)


# Tests duck-type the asset doc so we don't need to bring up Beanie.
# The renderer only reads ``character_id``, ``asset_type``, ``image_path``,
# and ``expression`` (the last one only when picking among multiple
# reference-sheet angles per character — Phase B1).
@dataclass
class _FakeAssetDoc:
    character_id: str
    asset_type: str
    image_path: str
    expression: str = "neutral"


_PROSE = (
    "Cold rim light against deep negative space, accenting the silhouette "
    "with a single specular highlight."
)


def _bible() -> CharacterWorldBible:
    return CharacterWorldBible(
        world_summary="A neon-soaked agentic AI battleground over many turns.",
        visual_style="Black ink with screentone shading and high contrast.",
        characters=[
            CharacterDesign(
                character_id="agent",
                name="Live-SWE",
                role="protagonist",
                appearance_summary="Lean code-spectre with circuitry tattoos and a long coat.",
                visual_lock="Always wears asymmetric coat with circuitry tattoos and silver hair.",
                silhouette_notes="Tall, narrow shoulders, coat tails sweep low.",
                outfit_notes="Long charcoal coat, white inner tunic, black combat boots.",
                hair_or_face_notes="Silver hair tied back, single circuit tattoo on the cheek.",
            ),
        ],
        story_themes=["evolution under pressure", "identity through code"],
    )


def _art_direction() -> CharacterArtDirectionBundle:
    return CharacterArtDirectionBundle(
        project_id="proj",
        style_anchor=(
            "Black ink with screentone shading, high contrast, and a single "
            "cyan accent reserved for active code streams."
        ),
        directions=[
            CharacterArtDirection(
                character_id="agent",
                lighting_recipe=_PROSE,
                lens_recipe="50mm prime, slight low angle to lend authority and presence.",
                color_story="Monochrome with a single cyan accent for active code streams.",
                texture_story="Crisp ink line over fine screentone gradients on coat folds.",
                reference_sheet_prose=(
                    "Three-quarter front, profile, and back views with a head-only "
                    "close-up emphasising the cheek tattoo."
                ),
                expressions=[
                    ExpressionDirection(
                        label="determined",
                        prose=(
                            "Jaw set, eyes narrowed, brow drawn down with subtle "
                            "tension lines radiating from the brow ridge."
                        ),
                        body_language="Shoulders squared, weight forward on the front foot.",
                    ),
                    ExpressionDirection(
                        label="neutral",
                        prose=(
                            "Relaxed mouth, eyes level on the horizon, brow soft "
                            "and unadorned with no surface tension."
                        ),
                        body_language="Hands at sides, posture neutral and balanced over both feet.",
                    ),
                    ExpressionDirection(
                        label="surprised",
                        prose=(
                            "Eyes widened, brows lifted high, mouth open in a small "
                            "oval; tiny shock lines flicker around the head."
                        ),
                        body_language="Shoulders pulled back, weight rocked onto the heels.",
                    ),
                ],
            ),
        ],
    )


def _asset_doc(
    *, character_id: str, asset_type: str, image_path: str, expression: str = "neutral"
) -> _FakeAssetDoc:
    return _FakeAssetDoc(
        character_id=character_id,
        asset_type=asset_type,
        image_path=image_path,
        expression=expression,
    )


# ── aspect_ratio_for_panel ─────────────────────────────────────────────────


@pytest.mark.parametrize(
    "panel_type,expected",
    [
        ("splash", "2:3"),
        ("dialogue", "1:1"),
        ("concept", "3:2"),
        ("totally_unmapped_type", "1:1"),  # default safety
    ],
)
def test_aspect_ratio_for_panel_returns_role_appropriate_ratio(panel_type, expected):
    assert aspect_ratio_for_panel({"type": panel_type}) == expected


# ── build_asset_lookup ─────────────────────────────────────────────────────


def test_build_asset_lookup_groups_by_character_then_asset_type():
    docs = [
        _asset_doc(character_id="agent", asset_type="reference_sheet", image_path="a/ref.png"),
        _asset_doc(character_id="agent", asset_type="expression", image_path="a/expr.png"),
        _asset_doc(character_id="rival", asset_type="reference_sheet", image_path="r/ref.png"),
    ]
    lookup = build_asset_lookup(docs)
    assert set(lookup) == {"agent", "rival"}
    assert lookup["agent"]["reference_sheet"].image_path == "a/ref.png"
    assert lookup["agent"]["expression"].image_path == "a/expr.png"
    assert lookup["rival"]["reference_sheet"].image_path == "r/ref.png"


def test_build_asset_lookup_skips_docs_without_character_id():
    docs = [
        _asset_doc(character_id="", asset_type="reference_sheet", image_path="floating.png"),
    ]
    assert build_asset_lookup(docs) == {}


def test_build_asset_lookup_prefers_front_when_multiple_reference_angles_exist():
    # Phase B1: every character has 3 reference sheets (front/side/back).
    # The selector must deterministically pick the front view as the
    # canonical conditioning image — otherwise we get nondeterministic
    # per-panel art that depends on dict-iteration order.
    docs = [
        _asset_doc(
            character_id="agent",
            asset_type="reference_sheet",
            image_path="a/back.png",
            expression="back",
        ),
        _asset_doc(
            character_id="agent",
            asset_type="reference_sheet",
            image_path="a/side.png",
            expression="side",
        ),
        _asset_doc(
            character_id="agent",
            asset_type="reference_sheet",
            image_path="a/front.png",
            expression="front",
        ),
    ]
    lookup = build_asset_lookup(docs)
    assert lookup["agent"]["reference_sheet"].image_path == "a/front.png"


def test_build_asset_lookup_falls_back_to_side_when_front_missing():
    docs = [
        _asset_doc(
            character_id="agent",
            asset_type="reference_sheet",
            image_path="a/side.png",
            expression="side",
        ),
        _asset_doc(
            character_id="agent",
            asset_type="reference_sheet",
            image_path="a/back.png",
            expression="back",
        ),
    ]
    lookup = build_asset_lookup(docs)
    assert lookup["agent"]["reference_sheet"].image_path == "a/side.png"


# ── select_reference_paths_for_characters ──────────────────────────────────


def test_select_reference_paths_prefers_reference_sheet_over_expression(tmp_path):
    docs = [
        _asset_doc(character_id="agent", asset_type="reference_sheet", image_path="agent/ref.png"),
        _asset_doc(character_id="agent", asset_type="expression", image_path="agent/expr.png"),
    ]
    selections = select_reference_paths_for_characters(
        character_ids=["agent"],
        asset_lookup=build_asset_lookup(docs),
        image_root=tmp_path,
    )
    assert selections == [("agent", str(tmp_path / "agent/ref.png"))]


def test_select_reference_paths_falls_back_to_expression_when_no_sheet(tmp_path):
    docs = [
        _asset_doc(character_id="agent", asset_type="expression", image_path="agent/expr.png"),
    ]
    selections = select_reference_paths_for_characters(
        character_ids=["agent"],
        asset_lookup=build_asset_lookup(docs),
        image_root=tmp_path,
    )
    assert selections == [("agent", str(tmp_path / "agent/expr.png"))]


def test_select_reference_paths_skips_unknown_characters(tmp_path):
    selections = select_reference_paths_for_characters(
        character_ids=["nobody"],
        asset_lookup={},
        image_root=tmp_path,
    )
    assert selections == []


def test_select_reference_paths_dedupes_repeated_character_ids(tmp_path):
    docs = [
        _asset_doc(character_id="agent", asset_type="reference_sheet", image_path="agent/ref.png"),
    ]
    selections = select_reference_paths_for_characters(
        character_ids=["agent", "agent"],
        asset_lookup=build_asset_lookup(docs),
        image_root=tmp_path,
    )
    assert len(selections) == 1


# ── build_panel_prompt ─────────────────────────────────────────────────────


def test_build_panel_prompt_appends_visual_lock_for_each_character():
    panel = {
        "type": "dialogue",
        "scene": "ops_room",
        "mood": "tense",
        "expression": "determined",
        "character_ids": ["agent"],
        "lines": [{"who": "agent", "says": "On my mark.", "emotion": "resolute"}],
    }
    prompt = build_panel_prompt(
        panel=panel,
        bible=_bible(),
        art_direction=_art_direction(),
        style="shonen-ink",
    )
    # bible visual_lock fragment is mechanically appended
    assert "circuitry tattoos" in prompt
    # art direction recipe surfaces lighting prose
    assert "Cold rim light" in prompt
    # expression-specific direction surfaces
    assert "Jaw set" in prompt
    # the storyboard intent is preserved
    assert "On my mark" in prompt


def test_build_panel_prompt_handles_unknown_characters_gracefully():
    panel = {
        "type": "concept",
        "character_ids": ["ghost"],  # not in bible, not in art direction
    }
    prompt = build_panel_prompt(
        panel=panel,
        bible=_bible(),
        art_direction=_art_direction(),
        style="shonen-ink",
    )
    # Falls through cleanly; the prompt still has the world anchor.
    assert "neon-soaked" in prompt


def test_build_panel_prompt_works_without_art_direction():
    panel = {
        "type": "dialogue",
        "character_ids": ["agent"],
    }
    prompt = build_panel_prompt(
        panel=panel,
        bible=_bible(),
        art_direction=None,
        style="shonen-ink",
    )
    # Bible visual_lock still surfaces; art direction block is silently absent.
    assert "circuitry tattoos" in prompt
    assert "Lighting:" not in prompt


# ── build_panel_relative_path ──────────────────────────────────────────────


def test_build_panel_relative_path_sanitises_panel_id():
    path = build_panel_relative_path(
        project_id="p1",
        slice_id="s1",
        page_index=3,
        panel_id="page1/panel/3?",
    )
    assert path == "manga_panels/p1/s1/page_03/page1_panel_3_.png"


# ── render_pages orchestration ─────────────────────────────────────────────


def test_render_pages_invokes_renderer_and_writes_image_path(tmp_path):
    """``render_pages`` must populate ``image_path`` and ``image_aspect_ratio``
    on each panel and return a populated summary."""

    pages = [
        {
            "page_index": 0,
            "panels": [
                {
                    "panel_id": "p1",
                    "type": "dialogue",
                    "character_ids": ["agent"],
                    "lines": [{"who": "agent", "says": "Hi", "emotion": "calm"}],
                },
                {
                    "panel_id": "p2",
                    "type": "splash",
                    "character_ids": ["agent"],
                },
            ],
        },
    ]

    library = [
        _asset_doc(character_id="agent", asset_type="reference_sheet", image_path="agent/ref.png"),
    ]

    captured_calls: list[dict] = []

    async def fake_renderer(**kwargs):
        captured_calls.append(kwargs)
        # Pretend a panel image was successfully written by the model.
        Path(kwargs["output_path"]).parent.mkdir(parents=True, exist_ok=True)
        Path(kwargs["output_path"]).write_bytes(b"PNG-fake")
        return True

    summary = asyncio.run(
        render_pages(
            pages=pages,
            project_id="proj",
            slice_id="slice-1",
            bible=_bible(),
            art_direction=_art_direction(),
            library_assets=library,
            image_api_key="fake-key",
            image_model="google/gemini-2.5-flash-image",
            style="shonen-ink",
            image_root=tmp_path,
            max_concurrency=1,
            panel_renderer=fake_renderer,
        )
    )

    assert summary.rendered == 2
    assert summary.failed == 0
    panels = pages[0]["panels"]
    assert panels[0]["image_path"].startswith("manga_panels/proj/slice-1/page_00/")
    assert panels[0]["image_aspect_ratio"] == "1:1"
    assert panels[1]["image_aspect_ratio"] == "2:3"
    # Each call carried the reference image path the model needs as conditioning.
    for call in captured_calls:
        assert call["reference_image_paths"] == [str(tmp_path / "agent/ref.png")]


def test_render_pages_records_failures_without_aborting_other_panels(tmp_path):
    pages = [
        {
            "page_index": 0,
            "panels": [
                {"panel_id": "good", "type": "dialogue", "character_ids": ["agent"]},
                {"panel_id": "bad", "type": "dialogue", "character_ids": ["agent"]},
            ],
        },
    ]
    library = [
        _asset_doc(character_id="agent", asset_type="reference_sheet", image_path="agent/ref.png"),
    ]

    async def fake_renderer(**kwargs):
        if "bad" in kwargs["output_path"]:
            return False  # model declined to produce an image
        return True

    summary = asyncio.run(
        render_pages(
            pages=pages,
            project_id="proj",
            slice_id="slice-1",
            bible=_bible(),
            art_direction=_art_direction(),
            library_assets=library,
            image_api_key="fake-key",
            image_model="google/gemini-2.5-flash-image",
            style="shonen-ink",
            image_root=tmp_path,
            max_concurrency=2,
            panel_renderer=fake_renderer,
        )
    )

    assert summary.rendered == 1
    assert summary.failed == 1
    failed = next(res for res in summary.results if res.error)
    assert failed.panel_id == "bad"
    assert "renderer returned False" in failed.error


def test_render_pages_requires_image_api_key():
    with pytest.raises(ValueError, match="image_api_key"):
        asyncio.run(
            render_pages(
                pages=[],
                project_id="proj",
                slice_id="slice-1",
                bible=_bible(),
                art_direction=None,
                library_assets=[],
                image_api_key="",
                image_model=None,
                style="shonen-ink",
            )
        )
