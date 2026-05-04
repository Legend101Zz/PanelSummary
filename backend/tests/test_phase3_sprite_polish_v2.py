"""Tests for Phase 3 — sprite & character library polish.

Pins the invariants in `docs/MANGA_PHASE_PLAN.md` for:
  3.1 expression coverage gate (compute_missing_expressions)
  3.2 outfit acceptance check (vision LLM scores costume separately)
  3.3 sprite-bank hit-rate metric (PageRenderingSummary)
  3.4 panel selector honours `pinned`
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    CharacterAssetPlan,
    CharacterDesign,
    CharacterWorldBible,
    MangaAssetSpec,
    MissingExpression,
    SpriteQualityReport,
)
from app.manga_pipeline.vision_contracts import VisionImage
from app.services.manga.expression_coverage import compute_missing_expressions
from app.services.manga.panel_rendering_service import (
    PageRenderingSummary,
    PanelRenderResult,
    build_asset_lookup,
    render_pages,
    select_reference_paths_for_characters,
)
from app.services.manga.sprite_quality_gate import apply_sprite_quality_gate
from app.services.manga.sprite_quality_service import (
    SpriteQualityServiceConfig,
    review_sprite_assets,
)


# ---------------------------------------------------------------------------
# Tiny doc/spec/project fakes — kept minimal so each test reads as one fact.
# ---------------------------------------------------------------------------


@dataclass
class _FakeAssetDoc:
    id: str
    project_id: str = "p1"
    character_id: str = "kai"
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
    id: str = "p1"
    project_options: dict[str, Any] = field(default_factory=dict)


def _spec(asset_id: str, *, character_id: str = "kai", expression: str = "neutral", asset_type: str = "expression") -> MangaAssetSpec:
    return MangaAssetSpec(
        asset_id=asset_id,
        character_id=character_id,
        asset_type=asset_type,
        expression=expression,
        prompt="prompt",
    )


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


# ---------------------------------------------------------------------------
# 3.1 — compute_missing_expressions
# ---------------------------------------------------------------------------


def test_coverage_returns_empty_when_every_spec_has_a_doc():
    plan = CharacterAssetPlan(
        project_id="p1",
        assets=[
            _spec("kai__expression__neutral"),
            _spec("kai__expression__panicked", expression="panicked"),
        ],
    )
    docs = [
        _FakeAssetDoc(id="a1", metadata={"asset_id": "kai__expression__neutral"}),
        _FakeAssetDoc(
            id="a2",
            expression="panicked",
            metadata={"asset_id": "kai__expression__panicked"},
        ),
    ]
    assert compute_missing_expressions(plan=plan, persisted=docs) == []  # type: ignore[arg-type]


def test_coverage_flags_each_planned_spec_with_no_doc():
    plan = CharacterAssetPlan(
        project_id="p1",
        assets=[
            _spec("kai__expression__neutral"),
            _spec("kai__expression__panicked", expression="panicked"),
            _spec("kai__expression__contemplative", expression="contemplative"),
        ],
    )
    docs = [
        _FakeAssetDoc(id="a1", metadata={"asset_id": "kai__expression__neutral"})
    ]
    gaps = compute_missing_expressions(plan=plan, persisted=docs)  # type: ignore[arg-type]
    expressions = sorted(gap.expression for gap in gaps)
    assert expressions == ["contemplative", "panicked"]
    # Asset_type is carried through so the UI can render different copy
    # for "missing reference sheet" vs "missing expression".
    assert {gap.asset_type for gap in gaps} == {"expression"}


def test_coverage_includes_missing_reference_sheets_too():
    """Reference sheets are the most expensive miss — they MUST appear in
    the gap list, not be silently downgraded to 'expression'."""
    plan = CharacterAssetPlan(
        project_id="p1",
        assets=[
            _spec(
                "kai__reference_sheet__front",
                expression="front",
                asset_type="reference_sheet",
            ),
        ],
    )
    gaps = compute_missing_expressions(plan=plan, persisted=[])
    assert len(gaps) == 1
    assert gaps[0].asset_type == "reference_sheet"
    assert gaps[0].expression == "front"


def test_sprite_quality_report_passed_is_false_when_coverage_gaps_present():
    """A library that ships with holes is NOT 'passed' even if every
    materialised asset is ready."""
    report = SpriteQualityReport(
        asset_reviews=[],
        missing_expressions=[
            MissingExpression(character_id="kai", expression="panicked")
        ],
    )
    assert report.passed is False


# ---------------------------------------------------------------------------
# 3.2 — outfit acceptance check via vision prompt
# ---------------------------------------------------------------------------


class _FakeVisionClient:
    model = "fake-vision"
    provider = "test"

    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload
        self.calls: list[dict[str, Any]] = []

    async def analyze_image(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {
            "content": "{}",
            "parsed": dict(self._payload),
            "input_tokens": 100,
            "output_tokens": 50,
            "estimated_cost_usd": 0.0001,
        }


def _png(path: Path, *, size: int = 800) -> Path:
    Image.new("RGB", (size, size), (200, 100, 50)).save(path, format="PNG")
    return path


def test_vision_low_outfit_score_emits_outfit_mismatch_warning(tmp_path):
    """outfit_match_score=2 should land a SPRITE_OUTFIT_MISMATCH warning,
    distinct from any silhouette warning."""
    image = _png(tmp_path / "kai.png", size=900)
    spec = MangaAssetSpec(
        asset_id="kai__reference_front",
        character_id="kai",
        asset_type="character",
        expression="front",
        prompt="prompt",
    )
    payload = {
        "is_single_character": True,
        "background_is_plain": True,
        "has_text_or_watermark": False,
        "silhouette_match_score": 5,
        "outfit_match_score": 2,
        "silhouette_notes": "matches",
        "outfit_notes": "wrong jacket colour",
    }
    client = _FakeVisionClient(payload)

    report = asyncio.run(
        review_sprite_assets(
            assets=[spec],
            asset_image_paths={spec.asset_id: image.name},
            bible_characters=list(_bible().characters),
            vision_client=client,
            config=SpriteQualityServiceConfig(image_base_dir=tmp_path),
        )
    )
    review = report.asset_reviews[0]
    codes = [c.code for c in review.checks]
    assert "SPRITE_OUTFIT_MISMATCH" in codes
    # Silhouette score was 5 → no silhouette warning. We pin this so a
    # future tuning of either threshold cannot silently couple the two.
    assert "SPRITE_SILHOUETTE_MISMATCH" not in codes
    assert review.outfit_match_score == 2


def test_vision_prompt_asks_for_both_scores(tmp_path):
    """Pin the system prompt: a future edit cannot drop either score key
    without breaking the parse path the gate depends on."""
    from app.services.manga.sprite_quality_service import SPRITE_QUALITY_SYSTEM_PROMPT

    assert "silhouette_match_score" in SPRITE_QUALITY_SYSTEM_PROMPT
    assert "outfit_match_score" in SPRITE_QUALITY_SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# 3.3 — sprite-bank hit-rate metric
# ---------------------------------------------------------------------------


def test_hit_rate_is_none_when_no_panel_requests_a_character():
    summary = PageRenderingSummary(
        rendered=2,
        results=[
            PanelRenderResult(panel_id="p1", page_index=0, requested_character_count=0),
            PanelRenderResult(panel_id="p2", page_index=0, requested_character_count=0),
        ],
    )
    assert summary.sprite_bank_hit_rate is None


def test_hit_rate_is_partial_when_some_slots_resolved():
    summary = PageRenderingSummary(
        rendered=2,
        results=[
            # Asked for 2 characters, library had 1 → 0.5
            PanelRenderResult(
                panel_id="p1",
                page_index=0,
                requested_character_count=2,
                used_reference_assets=["kai"],
            ),
            # Asked for 2, got 2 → 1.0
            PanelRenderResult(
                panel_id="p2",
                page_index=0,
                requested_character_count=2,
                used_reference_assets=["kai", "rin"],
            ),
        ],
    )
    assert summary.character_slots_requested == 4
    assert summary.character_slots_resolved == 3
    assert summary.sprite_bank_hit_rate == pytest.approx(0.75)


def test_hit_rate_zero_when_nothing_resolved():
    """Zero is meaningfully different from None: every panel asked for a
    character, every panel got prompt-only fallback. UI should scream."""
    summary = PageRenderingSummary(
        rendered=1,
        results=[
            PanelRenderResult(
                panel_id="p1",
                page_index=0,
                requested_character_count=3,
                used_reference_assets=[],
            ),
        ],
    )
    assert summary.sprite_bank_hit_rate == 0.0


def test_render_pages_records_requested_character_count(tmp_path):
    """End-to-end: the renderer must populate requested_character_count
    from the panel's character_ids (after dedup)."""

    async def fake_renderer(*, output_path: str, **_: Any) -> bool:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(output_path).write_bytes(b"png")
        return True

    pages = [
        {
            "page_index": 0,
            "panels": [
                {
                    "panel_id": "p1",
                    "type": "dialogue",
                    "character_ids": ["kai", "rin", "kai"],  # dup
                    "scene": "lab",
                }
            ],
        }
    ]

    summary = asyncio.run(
        render_pages(
            pages=pages,
            project_id="proj",
            slice_id="slice",
            bible=_bible(),
            art_direction=None,
            library_assets=[],
            image_api_key="key",
            image_model="fake-model",
            style="shonen-ink",
            image_root=tmp_path,
            panel_renderer=fake_renderer,
        )
    )
    assert summary.results[0].requested_character_count == 2  # deduped
    # Library was empty → no resolved references → hit rate is 0.0
    assert summary.sprite_bank_hit_rate == 0.0


# ---------------------------------------------------------------------------
# 3.4 — selector honours `pinned`
# ---------------------------------------------------------------------------


def test_build_asset_lookup_prefers_pinned_over_angle_order(tmp_path):
    """When two reference sheets exist and one is pinned, the pinned one
    wins regardless of the front/side/back angle preference."""
    front = _FakeAssetDoc(
        id="ref_front",
        asset_type="reference_sheet",
        expression="front",
        image_path="kai_front.png",
        pinned=False,
    )
    side = _FakeAssetDoc(
        id="ref_side",
        asset_type="reference_sheet",
        expression="side",
        image_path="kai_side.png",
        pinned=True,  # user pinned the side view
    )
    lookup = build_asset_lookup([front, side])  # type: ignore[arg-type]
    chosen = lookup["kai"]["reference_sheet"]
    # Without the pinned-first rule this would be the front view.
    assert chosen.expression == "side"
    assert chosen.pinned is True


def test_select_reference_paths_uses_pinned_image(tmp_path):
    """Integration: the path selector returns the pinned image's path."""
    front = _FakeAssetDoc(
        id="ref_front",
        asset_type="reference_sheet",
        expression="front",
        image_path="kai_front.png",
    )
    pinned = _FakeAssetDoc(
        id="ref_side",
        asset_type="reference_sheet",
        expression="side",
        image_path="kai_pinned.png",
        pinned=True,
    )
    lookup = build_asset_lookup([front, pinned])  # type: ignore[arg-type]
    paths = select_reference_paths_for_characters(
        character_ids=["kai"],
        asset_lookup=lookup,
        image_root=tmp_path,
    )
    assert len(paths) == 1
    assert paths[0][0] == "kai"
    assert paths[0][1].endswith("kai_pinned.png")
