"""Tests for ``build_asset_prompt`` Phase 3 visual-lock injection.

The prompt builder is the LAST line of defense for visual continuity. Even if
every upstream stage forgets the bible's visual lock, the prompt builder
re-injects it mechanically when a ``CharacterDesign`` is supplied. This test
file pins that contract.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import CharacterDesign, MangaAssetSpec
from app.services.manga.asset_image_service import build_asset_prompt


def _spec(prompt: str = "Manga reference sheet of someone.") -> MangaAssetSpec:
    return MangaAssetSpec(
        asset_id="kai__reference_sheet__neutral",
        character_id="kai",
        asset_type="reference_sheet",
        expression="neutral",
        prompt=prompt,
    )


def _kai_design() -> CharacterDesign:
    return CharacterDesign(
        character_id="kai",
        name="Kai",
        role="protagonist",
        visual_lock="short angular hair and bookmark scarf",
        silhouette_notes="lean, tall, satchel over left shoulder",
        outfit_notes="dark coat, long crimson scarf",
        hair_or_face_notes="angular black hair, sharp grey eyes",
    )


def test_prompt_falls_back_to_legacy_shape_without_character_design():
    """Backward compatibility: legacy callers that omit character_design must keep working."""
    rendered = build_asset_prompt(_spec(), style="manga")

    assert "Asset type: reference_sheet" in rendered
    assert "Style key: manga" in rendered
    # No visual continuity block when the design is not supplied.
    assert "Visual continuity" not in rendered


def test_prompt_appends_visual_lock_block_when_character_design_supplied():
    rendered = build_asset_prompt(_spec(), style="manga", character_design=_kai_design())

    assert "Visual continuity (must be honoured):" in rendered
    assert "bookmark scarf" in rendered
    assert "angular" in rendered


def test_prompt_includes_optional_silhouette_outfit_hair_notes():
    rendered = build_asset_prompt(_spec(), style="manga", character_design=_kai_design())

    assert "satchel" in rendered  # silhouette_notes
    assert "crimson scarf" in rendered  # outfit_notes
    assert "grey eyes" in rendered  # hair_or_face_notes


def test_prompt_omits_optional_blocks_when_design_leaves_them_blank():
    bare_design = CharacterDesign(
        character_id="mira",
        name="Mira",
        role="mentor",
        visual_lock="silver braid and bronze monocle",
    )

    rendered = build_asset_prompt(_spec(), style="manga", character_design=bare_design)

    # Visual lock is mandatory; silhouette/outfit/hair labels are NOT present
    # because the design did not carry them.
    assert "silver braid" in rendered
    assert "Silhouette:" not in rendered
    assert "Costume:" not in rendered
    assert "Hair/face:" not in rendered


def test_visual_lock_is_appended_after_the_planner_prompt_so_the_planner_text_survives():
    """The planner-authored prompt must remain at the START of the rendered string."""
    rendered = build_asset_prompt(
        _spec("PLANNER PROMPT FIRST"),
        style="manga",
        character_design=_kai_design(),
    )

    # Planner content stays at the start.
    assert rendered.startswith("PLANNER PROMPT FIRST")
    # Visual continuity block appears later.
    planner_index = rendered.index("PLANNER PROMPT FIRST")
    visual_index = rendered.index("Visual continuity")
    assert planner_index < visual_index
