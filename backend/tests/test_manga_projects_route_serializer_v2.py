"""Tests for the asset doc serializer in ``manga_projects`` route module.

The serializer feeds the Phase B4 Character Library UI; the badges and
tooltips on each card depend on every QA field landing in the JSON
payload. These tests pin the schema so a future refactor can't
silently drop a field and gut the UI.
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.api.routes.manga_projects import _serialize_asset_doc


def _doc(**overrides) -> SimpleNamespace:
    """Build a duck-typed asset doc without going near MongoDB.

    The serializer just reads attributes — we don't need a real Beanie
    Document (which would refuse to instantiate without a live
    collection). A SimpleNamespace mirrors the attribute access exactly
    while staying I/O-free.
    """
    base = dict(
        id="asset_abc",
        project_id="proj_1",
        character_id="kai",
        asset_type="reference_sheet",
        expression="neutral",
        image_path="proj_1/kai/neutral.png",
        prompt="A determined silver-haired kid in a navy hoodie…",
        model="google/gemini-2.5-flash-image",
        metadata={"angle": "front"},
        status="ready",
        pinned=False,
        regen_count=0,
        silhouette_match_score=4,
        last_quality_checks=[],
        created_at=datetime(2026, 5, 4, 10, 0, 0, tzinfo=UTC),
        updated_at=datetime(2026, 5, 4, 10, 5, 0, tzinfo=UTC),
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def test_serializer_emits_phase_b2_qa_fields():
    """The B2 sprite-quality gate writes status/score/checks; the UI
    reads them. Drop a field, break the badges."""
    doc = _doc()
    payload = _serialize_asset_doc(doc)

    for field in (
        "status",
        "pinned",
        "regen_count",
        "silhouette_match_score",
        "last_quality_checks",
    ):
        assert field in payload, f"missing field {field!r}"


def test_serializer_carries_pinned_and_regen_count_through():
    doc = _doc(pinned=True, regen_count=2)
    payload = _serialize_asset_doc(doc)

    assert payload["pinned"] is True
    assert payload["regen_count"] == 2


def test_serializer_carries_quality_checks_as_list_of_dicts():
    checks = [
        {"check": "sprite_multiple_characters", "severity": "ok", "details": ""},
        {"check": "background_is_clean", "severity": "warning", "details": "busy bg"},
    ]
    doc = _doc(status="review_required", last_quality_checks=checks)
    payload = _serialize_asset_doc(doc)

    assert payload["status"] == "review_required"
    assert payload["last_quality_checks"] == checks


def test_serializer_handles_silhouette_match_score_of_zero_correctly():
    """0 is a legitimate score (means "completely off"). The serializer
    must not coerce it to None or omit the key."""
    doc = _doc(silhouette_match_score=0)
    payload = _serialize_asset_doc(doc)
    assert payload["silhouette_match_score"] == 0


def test_serializer_handles_unset_silhouette_match_score():
    doc = _doc(silhouette_match_score=None)
    payload = _serialize_asset_doc(doc)
    # Explicit None survives, so the UI can render "not yet checked".
    assert payload["silhouette_match_score"] is None


def test_serializer_emits_created_and_updated_iso_timestamps():
    doc = _doc()
    payload = _serialize_asset_doc(doc)
    # Both timestamps should be ISO 8601 strings the JS Date parser can eat.
    assert payload["created_at"].startswith("2026-05-04T10:00:00")
    assert payload["updated_at"].startswith("2026-05-04T10:05:00")
