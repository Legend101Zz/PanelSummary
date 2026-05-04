"""Tests for manga v2 character asset image service helpers."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import MangaAssetSpec
from app.services.manga.asset_image_service import build_asset_prompt, build_asset_relative_path


def _asset(asset_id: str = "asset kai neutral!") -> MangaAssetSpec:
    return MangaAssetSpec(
        asset_id=asset_id,
        character_id="kai",
        asset_type="character_sheet",
        expression="neutral",
        prompt="Kai with angular hair and bookmark scarf, front side back views.",
    )


def test_build_asset_relative_path_sanitizes_asset_id():
    path = build_asset_relative_path("project_123", _asset())

    assert path == "manga_assets/project_123/asset_kai_neutral_.png"


def test_build_asset_prompt_adds_reusable_asset_constraints():
    prompt = build_asset_prompt(_asset("asset_kai_neutral"), "manga")

    assert "Kai with angular hair" in prompt
    assert "character_sheet" in prompt
    assert "reusable sprite/reference" in prompt
    assert "Style key: manga" in prompt
