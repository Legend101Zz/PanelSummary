"""Tests for the sprite-quality gate orchestrator.

The orchestrator is the persistence-aware wrapper around the pure
service. Here we use very thin stand-ins for ``MangaAssetDoc`` so we do
not need a live MongoDB; the gate's invariants (status persistence,
auto-retry budget, regenerate callback handling) are testable against
this fake.
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    CharacterDesign,
    CharacterWorldBible,
    SpriteQualityReport,
)
from app.manga_pipeline.vision_contracts import VisionImage
from app.services.manga.sprite_quality_gate import apply_sprite_quality_gate
from app.services.manga.sprite_quality_service import SpriteQualityServiceConfig


# ---------------------------------------------------------------------------
# In-memory stand-ins for the persistence layer.
# ---------------------------------------------------------------------------


def _png(path: Path, *, size: int = 800) -> Path:
    Image.new("RGB", (size, size), (200, 100, 50)).save(path, format="PNG")
    return path


@dataclass
class _FakeAssetDoc:
    """Fields used by the gate orchestrator. Intentionally minimal."""

    id: str
    project_id: str
    character_id: str
    expression: str = "neutral"
    asset_type: str = "character"
    image_path: str = ""
    prompt: str = "ref"
    model: str = "image-model"
    pinned: bool = False
    regen_count: int = 0
    status: str = ""
    silhouette_match_score: int | None = None
    outfit_match_score: int | None = None
    last_quality_checks: list[dict[str, Any]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    saved_count: int = 0

    async def save(self) -> None:
        self.saved_count += 1


@dataclass
class _FakeProject:
    id: str
    project_options: dict[str, Any] = field(default_factory=dict)


def _bible() -> CharacterWorldBible:
    return CharacterWorldBible(
        world_summary="a quiet town built around a library",
        visual_style="classic black-and-white shonen ink",
        characters=[
            CharacterDesign(
                character_id="kai",
                name="Kai",
                role="protagonist",
                visual_lock="bookmark scarf",
                silhouette_notes="lean",
                outfit_notes="indigo coat",
            )
        ],
        locations=[],
        motifs=[],
    )


class _FakeVisionClient:
    model = "fake-vision"
    provider = "test"

    def __init__(self, payloads: list[dict[str, Any]]) -> None:
        self._payloads = list(payloads)
        self.calls = 0

    async def analyze_image(self, **_: Any) -> dict[str, Any]:
        self.calls += 1
        idx = min(self.calls - 1, len(self._payloads) - 1)
        return {
            "content": "{}",
            "parsed": dict(self._payloads[idx]),
            "input_tokens": 100,
            "output_tokens": 50,
            "estimated_cost_usd": 0.0001,
        }


def _passing() -> dict[str, Any]:
    return {
        "is_single_character": True,
        "background_is_plain": True,
        "has_text_or_watermark": False,
        "silhouette_match_score": 5,
        "outfit_match_score": 5,
        "silhouette_notes": "matches",
        "outfit_notes": "matches",
    }


def _failing_text() -> dict[str, Any]:
    # Text-in-image is an error, so the asset will be marked failed and
    # the regenerate callback should fire.
    return _passing() | {"has_text_or_watermark": True}


# ---------------------------------------------------------------------------
# Patching the DB loader.
# ---------------------------------------------------------------------------


def _patch_loader(monkeypatch, asset_docs: list[_FakeAssetDoc]) -> None:
    """Make ``_load_character_asset_docs`` return our fake docs."""
    from app.services.manga import sprite_quality_gate as mod

    async def fake_load(*, project_id: str) -> list[_FakeAssetDoc]:
        # Filter by project_id to mirror the real query semantics.
        return [d for d in asset_docs if d.project_id == project_id]

    monkeypatch.setattr(mod, "_load_character_asset_docs", fake_load)


def _stub_no_coverage_gaps(monkeypatch) -> None:
    """Phase 3.1 coverage check is its own concern — stub it out for the
    per-asset tests so they keep testing the per-asset path. Tests that
    care about coverage exercise ``compute_missing_expressions`` directly.
    """
    from app.services.manga import sprite_quality_gate as mod

    monkeypatch.setattr(
        mod, "compute_missing_expressions", lambda **_: []
    )


# ---------------------------------------------------------------------------
# Tests.
# ---------------------------------------------------------------------------


def test_gate_passes_writes_status_to_asset(tmp_path, monkeypatch):
    image = _png(tmp_path / "kai.png", size=900)
    project = _FakeProject(id="p1", project_options={"generate_images": True})
    asset = _FakeAssetDoc(
        id="a1",
        project_id="p1",
        character_id="kai",
        image_path=image.name,
        metadata={"asset_id": "kai__reference_front"},
    )
    _patch_loader(monkeypatch, [asset])
    _stub_no_coverage_gaps(monkeypatch)

    async def regenerate(_doc):
        raise AssertionError("regenerate must not run on a passing asset")

    report = asyncio.run(
        apply_sprite_quality_gate(
            project=project,  # type: ignore[arg-type]
            bible=_bible(),
            vision_client=_FakeVisionClient([_passing()]),
            regenerate_asset=regenerate,
            config=SpriteQualityServiceConfig(image_base_dir=tmp_path),
        )
    )

    assert isinstance(report, SpriteQualityReport)
    assert report.passed is True
    assert asset.status == "ready"
    assert asset.silhouette_match_score == 5
    assert asset.saved_count >= 1


def test_gate_retries_failed_asset_until_budget_exhausted(tmp_path, monkeypatch):
    image = _png(tmp_path / "kai.png", size=900)
    project = _FakeProject(id="p1", project_options={"generate_images": True})
    asset = _FakeAssetDoc(
        id="a1",
        project_id="p1",
        character_id="kai",
        image_path=image.name,
        metadata={"asset_id": "kai__reference_front"},
    )
    _patch_loader(monkeypatch, [asset])
    _stub_no_coverage_gaps(monkeypatch)

    # Vision keeps reporting text-in-image; regen callback always returns
    # the same doc (simulating: the image model produces the same kind of
    # bad output every time).
    regen_calls: list[str] = []

    async def regenerate(doc):
        regen_calls.append(doc.metadata.get("asset_id", ""))
        # Pretend regen produced a fresh doc with same image \u2014 the gate
        # will rescore and fail again.
        return _FakeAssetDoc(
            id=doc.id,
            project_id=doc.project_id,
            character_id=doc.character_id,
            image_path=doc.image_path,
            metadata=dict(doc.metadata),
            regen_count=doc.regen_count + 1,
        )

    report = asyncio.run(
        apply_sprite_quality_gate(
            project=project,  # type: ignore[arg-type]
            bible=_bible(),
            vision_client=_FakeVisionClient([_failing_text()]),
            regenerate_asset=regenerate,
            max_retries=2,
            config=SpriteQualityServiceConfig(image_base_dir=tmp_path),
        )
    )

    # 2 retries means the regen callback fires exactly twice; on the
    # third pass, retries_used hits the cap and the gate gives up.
    assert len(regen_calls) == 2
    assert report.passed is False
    assert report.asset_reviews[0].status == "failed"


def test_gate_ignores_regen_when_callback_returns_none(tmp_path, monkeypatch):
    image = _png(tmp_path / "kai.png", size=900)
    project = _FakeProject(id="p1", project_options={"generate_images": True})
    asset = _FakeAssetDoc(
        id="a1",
        project_id="p1",
        character_id="kai",
        image_path=image.name,
        metadata={"asset_id": "kai__reference_front"},
    )
    _patch_loader(monkeypatch, [asset])
    _stub_no_coverage_gaps(monkeypatch)

    async def regenerate(_doc):
        # Simulates "image generation disabled" \u2014 the orchestrator
        # accepts this and stops asking, even though the asset is failed.
        return None

    report = asyncio.run(
        apply_sprite_quality_gate(
            project=project,  # type: ignore[arg-type]
            bible=_bible(),
            vision_client=_FakeVisionClient([_failing_text()]),
            regenerate_asset=regenerate,
            max_retries=3,
            config=SpriteQualityServiceConfig(image_base_dir=tmp_path),
        )
    )

    # The orchestrator is allowed to consume retry budget calling the
    # no-op regen, but we MUST end with the asset still failed and the
    # loop terminated (not infinite).
    assert report.passed is False
    assert asset.status == "failed"


def test_gate_no_assets_returns_empty_report(monkeypatch):
    project = _FakeProject(id="p1", project_options={"generate_images": True})
    _patch_loader(monkeypatch, [])
    _stub_no_coverage_gaps(monkeypatch)

    async def regenerate(_doc):
        return None

    report = asyncio.run(
        apply_sprite_quality_gate(
            project=project,  # type: ignore[arg-type]
            bible=_bible(),
            vision_client=_FakeVisionClient([_passing()]),
            regenerate_asset=regenerate,
        )
    )

    assert report.asset_reviews == []
    assert report.passed is True
