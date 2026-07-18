"""Tests for manga v2 character asset image service helpers."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import MangaAssetSpec
from app.services.manga.asset_image_service import (
    build_asset_prompt,
    build_asset_relative_path,
    build_generated_asset_doc,
)


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


def test_generated_asset_doc_requests_transparent_background(monkeypatch):
    calls = []

    async def fake_generator(**kwargs):
        calls.append(kwargs)
        return True

    class FakeAssetDoc:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    monkeypatch.setattr(
        "app.services.manga.asset_image_service.MangaAssetDoc",
        FakeAssetDoc,
    )

    doc = asyncio.run(
        build_generated_asset_doc(
            project_id="project_123",
            asset=_asset("asset_kai_neutral"),
            api_key="fake-key",
            style="manga",
            image_model="google/gemini-2.5-flash-image",
            image_generator=fake_generator,
        )
    )

    assert doc.metadata["background"] == "transparent"
    assert calls[0]["background"] == "transparent"
    assert calls[0]["aspect_ratio"] == "1:1"
