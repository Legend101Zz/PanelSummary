"""Tests for the sprite-quality vision service.

The service is intentionally pure (no DB), so we exercise it with a fake
``VisionModelClient`` and on-disk PNG fixtures created in tmp_path. The
gate orchestrator (DB-aware) is tested separately.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import CharacterDesign, MangaAssetSpec
from app.manga_pipeline.vision_contracts import VisionImage
from app.services.manga.sprite_quality_service import (
    SpriteQualityServiceConfig,
    review_sprite_assets,
)


# ---------------------------------------------------------------------------
# Fixtures.
# ---------------------------------------------------------------------------


def _png(path: Path, *, size: int = 800) -> Path:
    """Write a flat-colour PNG of the requested short side at ``path``."""
    Image.new("RGB", (size, size), (200, 100, 50)).save(path, format="PNG")
    return path


def _design(character_id: str = "kai") -> CharacterDesign:
    return CharacterDesign(
        character_id=character_id,
        name="Kai",
        role="protagonist",
        visual_lock="short black hair, bookmark scarf",
        silhouette_notes="lean, angular shoulders",
        outfit_notes="indigo coat with gold trim",
        hair_or_face_notes="bright amber eyes",
    )


def _spec(
    asset_id: str = "kai__reference_front", asset_type: str = "character"
) -> MangaAssetSpec:
    return MangaAssetSpec(
        asset_id=asset_id,
        character_id="kai",
        asset_type=asset_type,
        expression="neutral",
        prompt="reference sheet, plain background",
    )


class _FakeVisionClient:
    """In-memory ``VisionModelClient`` returning a canned parsed payload."""

    model = "fake-vision"
    provider = "test"

    def __init__(self, parsed: dict[str, Any]) -> None:
        self._parsed = parsed
        self.calls: list[dict[str, Any]] = []

    async def analyze_image(
        self,
        *,
        system_prompt: str,
        user_message: str,
        images: list[VisionImage],
        max_tokens: int = 1500,
        temperature: float = 0.2,
        json_mode: bool = True,
    ) -> dict[str, Any]:
        self.calls.append(
            {
                "system_prompt": system_prompt,
                "user_message": user_message,
                "image_paths": [str(img.path) for img in images],
            }
        )
        return {
            "content": "{}",
            "parsed": dict(self._parsed),
            "input_tokens": 100,
            "output_tokens": 50,
            "estimated_cost_usd": 0.0001,
        }


def _passing_payload() -> dict[str, Any]:
    return {
        "is_single_character": True,
        "background_is_plain": True,
        "has_text_or_watermark": False,
        "silhouette_match_score": 5,
        "silhouette_notes": "matches",
    }


def _run_review(
    *,
    asset_image_paths: dict[str, str],
    image_base_dir: Path,
    payload: dict[str, Any] | None = None,
    asset: MangaAssetSpec | None = None,
    client: Any = None,
):
    """Tiny helper so each test reads top-down."""
    use_client = client or _FakeVisionClient(payload or _passing_payload())
    use_asset = asset or _spec()
    report = asyncio.run(
        review_sprite_assets(
            assets=[use_asset],
            asset_image_paths=asset_image_paths,
            bible_characters=[_design()],
            vision_client=use_client,
            config=SpriteQualityServiceConfig(image_base_dir=image_base_dir),
        )
    )
    return report, use_client


# ---------------------------------------------------------------------------
# Happy path.
# ---------------------------------------------------------------------------


def test_review_passes_when_image_is_large_and_vision_is_clean(tmp_path):
    image = _png(tmp_path / "kai_front.png", size=900)
    report, client = _run_review(
        asset_image_paths={"kai__reference_front": image.name},
        image_base_dir=tmp_path,
    )

    assert report.passed is True
    assert len(report.asset_reviews) == 1
    review = report.asset_reviews[0]
    assert review.status == "ready"
    assert review.silhouette_match_score == 5
    # Vision call was actually issued with the bible context attached.
    assert len(client.calls) == 1
    assert "Bible description" in client.calls[0]["user_message"]
    assert "indigo coat" in client.calls[0]["user_message"]


# ---------------------------------------------------------------------------
# Heuristic short-circuits.
# ---------------------------------------------------------------------------


def test_missing_image_marks_failed_without_vision_call(tmp_path):
    report, client = _run_review(
        asset_image_paths={"kai__reference_front": ""},
        image_base_dir=tmp_path,
    )

    assert report.passed is False
    review = report.asset_reviews[0]
    assert review.status == "failed"
    assert any(c.code == "SPRITE_FILE_MISSING" for c in review.checks)
    # We must NOT have spent a vision call on an asset with no bytes.
    assert client.calls == []


def test_too_small_image_marks_failed_without_vision_call(tmp_path):
    image = _png(tmp_path / "tiny.png", size=64)
    report, client = _run_review(
        asset_image_paths={"kai__reference_front": image.name},
        image_base_dir=tmp_path,
    )

    review = report.asset_reviews[0]
    assert review.status == "failed"
    assert any(
        c.code == "SPRITE_TOO_SMALL" and c.severity == "error" for c in review.checks
    )
    assert client.calls == [], "tiny image must short-circuit the vision call"


def test_borderline_image_warns_but_still_runs_vision(tmp_path):
    # 600 px is between min (512) and preferred (768) \u2014 warning, not error.
    image = _png(tmp_path / "borderline.png", size=600)
    report, client = _run_review(
        asset_image_paths={"kai__reference_front": image.name},
        image_base_dir=tmp_path,
    )

    review = report.asset_reviews[0]
    assert review.status == "review_required"
    sizes = [c for c in review.checks if c.code == "SPRITE_TOO_SMALL"]
    assert len(sizes) == 1 and sizes[0].severity == "warning"
    assert len(client.calls) == 1


# ---------------------------------------------------------------------------
# Vision-driven outcomes.
# ---------------------------------------------------------------------------


def test_multiple_characters_marks_failed(tmp_path):
    image = _png(tmp_path / "two.png", size=900)
    report, _ = _run_review(
        asset_image_paths={"kai__reference_front": image.name},
        image_base_dir=tmp_path,
        payload=_passing_payload() | {"is_single_character": False},
    )
    review = report.asset_reviews[0]
    assert review.status == "failed"
    assert any(c.code == "SPRITE_MULTIPLE_CHARACTERS" for c in review.checks)


def test_text_in_image_marks_failed(tmp_path):
    image = _png(tmp_path / "captioned.png", size=900)
    report, _ = _run_review(
        asset_image_paths={"kai__reference_front": image.name},
        image_base_dir=tmp_path,
        payload=_passing_payload() | {"has_text_or_watermark": True},
    )
    review = report.asset_reviews[0]
    assert review.status == "failed"
    assert any(c.code == "SPRITE_HAS_TEXT" for c in review.checks)


def test_low_silhouette_score_warns(tmp_path):
    image = _png(tmp_path / "kai.png", size=900)
    report, _ = _run_review(
        asset_image_paths={"kai__reference_front": image.name},
        image_base_dir=tmp_path,
        payload=_passing_payload() | {"silhouette_match_score": 2},
    )
    review = report.asset_reviews[0]
    assert review.status == "review_required"
    assert review.silhouette_match_score == 2
    assert any(c.code == "SPRITE_SILHOUETTE_MISMATCH" for c in review.checks)


def test_cluttered_background_warns_only(tmp_path):
    image = _png(tmp_path / "kai.png", size=900)
    report, _ = _run_review(
        asset_image_paths={"kai__reference_front": image.name},
        image_base_dir=tmp_path,
        payload=_passing_payload() | {"background_is_plain": False},
    )
    review = report.asset_reviews[0]
    # Background-only issues are warnings, the asset is still usable.
    assert review.status == "review_required"
    assert any(
        c.code == "SPRITE_BACKGROUND_NOT_PLAIN" and c.severity == "warning"
        for c in review.checks
    )


# ---------------------------------------------------------------------------
# Failure resilience.
# ---------------------------------------------------------------------------


class _ExplodingVisionClient:
    """Vision client that always raises \u2014 simulates provider outages."""

    model = "broken"
    provider = "test"

    async def analyze_image(self, **_: Any) -> dict[str, Any]:
        raise RuntimeError("vision provider 503")


def test_vision_failure_degrades_to_warning_not_crash(tmp_path):
    image = _png(tmp_path / "kai.png", size=900)
    report, _ = _run_review(
        asset_image_paths={"kai__reference_front": image.name},
        image_base_dir=tmp_path,
        client=_ExplodingVisionClient(),
    )
    review = report.asset_reviews[0]
    # We must NOT block the pipeline on a vision provider hiccup.
    assert review.status == "review_required"
    assert any(c.code == "SPRITE_VISION_CALL_FAILED" for c in review.checks)


# ---------------------------------------------------------------------------
# Scoping.
# ---------------------------------------------------------------------------


def test_non_character_assets_are_skipped(tmp_path):
    image = _png(tmp_path / "world.png", size=900)
    report, client = _run_review(
        asset_image_paths={"world__hub": image.name},
        image_base_dir=tmp_path,
        asset=_spec(asset_id="world__hub", asset_type="world"),
    )
    assert report.asset_reviews == []
    assert client.calls == []
