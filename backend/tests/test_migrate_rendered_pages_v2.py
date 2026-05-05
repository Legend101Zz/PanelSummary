"""Phase 4.5c.1 — dry-run RenderedPage migration helpers."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.scripts.migrate_rendered_pages import (
    build_rendered_page_dump,
    page_needs_rendered_page,
    plan_rendered_page_rebuilds,
)


@dataclass
class FakeSliceDoc:
    id: str
    storyboard_pages: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class FakePageDoc:
    id: str
    page_index: int
    rendered_page: dict[str, Any] = field(default_factory=dict)


def _storyboard_page(page_index: int = 0, panel_id: str = "panel-1") -> dict[str, Any]:
    return {
        "page_id": f"page-{page_index}",
        "page_index": page_index,
        "page_turn_hook": "turn the page",
        "panels": [
            {
                "panel_id": panel_id,
                "scene_id": "scene-1",
                "purpose": "setup",
                "shot_type": "wide",
                "composition": "A clean establishing view of the core idea.",
                "action": "The protagonist enters with a question.",
                "dialogue": [],
                "narration": "A quiet but useful setup.",
                "source_fact_ids": ["fact-1"],
                "character_ids": ["hero"],
            }
        ],
    }


def test_page_needs_rendered_page_only_flags_empty_payloads():
    """The migration must not rewrite already-migrated pages."""
    assert page_needs_rendered_page(FakePageDoc(id="empty", page_index=0)) is True
    assert page_needs_rendered_page(
        FakePageDoc(id="ready", page_index=0, rendered_page={"storyboard_page": {}})
    ) is False


def test_build_rendered_page_dump_uses_storyboard_and_empty_artifacts():
    """A rebuilt page keeps the storyboard and creates one artifact per panel."""
    dump = build_rendered_page_dump(_storyboard_page())

    assert dump["storyboard_page"]["panels"][0]["panel_id"] == "panel-1"
    assert dump["composition"] is None
    assert dump["panel_artifacts"]["panel-1"]["image_path"] == ""
    assert dump["panel_artifacts"]["panel-1"]["requested_character_count"] == 1


def test_plan_rendered_page_rebuilds_is_dry_run_and_position_based():
    """Planning returns updates without mutating page docs in memory."""
    page = FakePageDoc(id="page-a", page_index=12)
    slice_doc = FakeSliceDoc(id="slice-a", storyboard_pages=[_storyboard_page()])

    plan = plan_rendered_page_rebuilds(slice_doc=slice_doc, page_docs=[page])

    assert len(plan.updates) == 1
    assert page.rendered_page == {}
    assert plan.updates[0].rendered_page["storyboard_page"]["page_id"] == "page-0"
    assert plan.skipped == []


def test_plan_rendered_page_rebuilds_skips_missing_storyboard_snapshot():
    """A page with no matching storyboard is reported, not guessed."""
    pages = [FakePageDoc(id="page-a", page_index=12), FakePageDoc(id="page-b", page_index=13)]
    slice_doc = FakeSliceDoc(id="slice-a", storyboard_pages=[_storyboard_page()])

    plan = plan_rendered_page_rebuilds(slice_doc=slice_doc, page_docs=pages)

    assert len(plan.updates) == 1
    assert len(plan.skipped) == 1
    assert "no storyboard page at local index 1" in plan.skipped[0]


def test_plan_rendered_page_rebuilds_skips_invalid_storyboard_snapshot():
    """Invalid legacy snapshots stay untouched so humans can inspect them."""
    page = FakePageDoc(id="page-a", page_index=12)
    slice_doc = FakeSliceDoc(id="slice-a", storyboard_pages=[{"page_id": "broken"}])

    plan = plan_rendered_page_rebuilds(slice_doc=slice_doc, page_docs=[page])

    assert plan.updates == []
    assert len(plan.skipped) == 1
    assert "invalid storyboard snapshot" in plan.skipped[0]
