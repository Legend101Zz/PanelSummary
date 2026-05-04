"""Tests for the pure parts of the character library service.

The Beanie-backed parts (``list_project_assets``, ``ensure_book_character_sheets``)
talk to MongoDB and are exercised by integration tests / E2E. The pure parts
that the per-slice short-circuit and the API endpoint depend on are tested
here in isolation.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import MangaAssetSpec
from app.services.manga.character_library_service import specs_missing_from_library


def _spec(asset_id: str) -> MangaAssetSpec:
    return MangaAssetSpec(
        asset_id=asset_id,
        character_id="kai",
        asset_type="reference_sheet",
        expression="neutral",
        prompt="x",
    )


def test_no_existing_assets_returns_full_plan():
    plan = [_spec("a"), _spec("b"), _spec("c")]

    missing = specs_missing_from_library(planned_specs=plan, existing_asset_ids=set())

    assert [spec.asset_id for spec in missing] == ["a", "b", "c"]


def test_all_existing_assets_returns_empty():
    plan = [_spec("a"), _spec("b")]

    missing = specs_missing_from_library(
        planned_specs=plan,
        existing_asset_ids={"a", "b"},
    )

    assert missing == []


def test_returns_only_specs_whose_asset_id_is_unknown():
    plan = [_spec("a"), _spec("b"), _spec("c")]

    missing = specs_missing_from_library(
        planned_specs=plan,
        existing_asset_ids={"a"},
    )

    assert [spec.asset_id for spec in missing] == ["b", "c"]


def test_preserves_planner_order_for_remaining_specs():
    """Order matters: the reference sheet is the first spec the planner emits.
    The library service must preserve that order so generation matches the
    planner's intent (reference first, then expressions).
    """
    plan = [_spec(f"x_{i}") for i in range(5)]

    missing = specs_missing_from_library(
        planned_specs=plan,
        existing_asset_ids={"x_1", "x_3"},
    )

    assert [spec.asset_id for spec in missing] == ["x_0", "x_2", "x_4"]


def test_unknown_existing_id_does_not_filter_anything():
    """Garbage in the existing set must not silently swallow plan specs."""
    plan = [_spec("a")]

    missing = specs_missing_from_library(
        planned_specs=plan,
        existing_asset_ids={"this_id_is_not_in_the_plan"},
    )

    assert [spec.asset_id for spec in missing] == ["a"]
