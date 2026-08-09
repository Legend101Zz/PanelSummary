"""Layout-template library: every template compiles through the production
compiler, reads RTL-coherently, and covers the narrative-purpose space.

NEW tests (Session 4, issue #5). The spike goldens under
``docs/research/layout-templates/golden/index.json`` are cross-checked where
the template ids overlap (panel counts and row structure), but geometry
comes only from the ported ADR-009 compiler.
"""

import json
import sys
from itertools import cycle
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.contracts.manga import MangaPagePlan
from app.services.manga_craft_validation import validate_page_craft
from app.services.manga_layout import compile_page_layout, render_thumbnail_svg
from app.services.manga_layout_templates import (
    NARRATIVE_PURPOSES,
    TEMPLATES,
    TemplateError,
    get_template,
    instantiate_template,
    list_templates,
)

GOLDEN_INDEX = (
    Path(__file__).resolve().parents[2]
    / "docs"
    / "research"
    / "layout-templates"
    / "golden"
    / "index.json"
)

CANVAS = {
    "width_px": 1600,
    "height_px": 2400,
    "trim": {"x": 0.03, "y": 0.02, "width": 0.94, "height": 0.96},
    "safe": {"x": 0.06, "y": 0.05, "width": 0.88, "height": 0.9},
    "bleed_pct": 0.02,
}

SOURCE_REF = {
    "book_id": "book_templates",
    "source_unit_id": "unit_templates_1",
    "page_start": 1,
    "page_end": 2,
    "text_hash": "a" * 64,
}

SHOTS = ["extreme_wide", "medium", "close_up", "wide", "insert"]


def build_plan(template_id: str) -> MangaPagePlan:
    template = get_template(template_id)
    panel_ids = [f"{template_id}_p{i}" for i in range(template.panel_count)]
    layout_root, edges = instantiate_template(template_id, panel_ids)
    shot = cycle(SHOTS)
    panels = []
    for index, panel_id in enumerate(panel_ids):
        last = index == len(panel_ids) - 1
        panels.append(
            {
                "panel_id": panel_id,
                "purpose": "reveal" if last else "setup",
                "story_beat": f"Beat {index} of the template fixture page.",
                "importance": "page_turn" if last else "medium",
                "tempo": template.tempo,
                "camera": {"shot": next(shot), "angle": "eye", "movement": "static"},
                "source_refs": [SOURCE_REF],
                "source_fact_ids": [],
            }
        )
    return MangaPagePlan.model_validate(
        {
            "schema_version": "manga-page-plan.v1",
            "page_plan_id": f"plan_{template_id}",
            "project_id": "project_templates",
            "script_set_artifact_id": "script_set_templates",
            "canvas": CANVAS,
            "reading_direction": "rtl",
            "page_script": {
                "page_id": f"page_{template_id}",
                "page_index": 0,
                "page_kind": "splash" if template.panel_count == 1 else "standard",
                "entry_state": "Fixture entry state.",
                "exit_state": "Fixture exit state.",
                "page_turn_panel_id": panel_ids[-1],
                "panels": panels,
                "text_elements": [],
            },
            "layout_root": layout_root,
            "reading_edges": edges,
        }
    )


@pytest.mark.parametrize("template_id", sorted(TEMPLATES))
def test_template_compiles_clean_with_rtl_coherent_flow(template_id):
    template = get_template(template_id)
    plan = build_plan(template_id)
    compiled = compile_page_layout(plan)

    assert len(compiled.panels) == template.panel_count
    # Authored reading order survives compilation as contiguous read ranks.
    ranked = sorted(compiled.panels, key=lambda item: item.read_rank)
    assert [panel.panel_id for panel in ranked] == [
        f"{template_id}_p{i}" for i in range(template.panel_count)
    ]
    # The craft RTL flow lint agrees with the authored chain.
    flow_issues = [
        issue
        for issue in validate_page_craft(plan, compiled)
        if issue.code == "RTL_READING_FLOW_INCOHERENT"
    ]
    assert flow_issues == []
    # SVG name preview renders from the same geometry, image-free.
    svg = render_thumbnail_svg(plan, compiled)
    assert svg.startswith("<svg") and "<image" not in svg


def test_catalog_covers_every_narrative_purpose_twice():
    for purpose in NARRATIVE_PURPOSES:
        matches = list_templates(purpose=purpose)
        assert len(matches) >= 2, f"purpose {purpose} has {len(matches)} templates"


def test_catalog_matches_spike_goldens_where_ids_overlap():
    golden = json.loads(GOLDEN_INDEX.read_text(encoding="utf-8"))
    overlap = sorted(set(golden) & set(TEMPLATES))
    assert len(overlap) == 5  # the five starred spike templates
    for template_id in overlap:
        assert TEMPLATES[template_id].panel_count == golden[template_id]["panel_count"]


def test_reference_template_reproduces_2_3_2_row_structure():
    plan = build_plan("t_ref_rows_2_3_2")
    compiled = compile_page_layout(plan)
    ranked = sorted(compiled.panels, key=lambda item: item.read_rank)
    centers = [panel.bbox.y + panel.bbox.height / 2 for panel in ranked]
    rows = [1]
    for previous, current in zip(centers, centers[1:]):
        if current - previous > 0.12:
            rows.append(1)
        else:
            rows[-1] += 1
    assert rows == [2, 3, 2]


def test_row_reading_order_is_right_to_left():
    plan = build_plan("t_dense_7_grid")
    compiled = compile_page_layout(plan)
    ranked = sorted(compiled.panels, key=lambda item: item.read_rank)
    top_row = ranked[0:2]
    assert top_row[0].bbox.x > top_row[1].bbox.x  # first read = rightmost
    middle_row = ranked[2:5]
    xs = [panel.bbox.x for panel in middle_row]
    assert xs == sorted(xs, reverse=True)


def test_overlay_insets_sit_above_their_base():
    plan = build_plan("t_splash_inset")
    compiled = compile_page_layout(plan)
    by_id = {panel.panel_id: panel for panel in compiled.panels}
    assert by_id["t_splash_inset_p0"].z_index == 0
    assert by_id["t_splash_inset_p1"].z_index == 10
    assert by_id["t_splash_inset_p2"].z_index == 20


def test_instantiation_rejects_wrong_panel_count_and_unknown_ids():
    with pytest.raises(TemplateError, match="slots"):
        instantiate_template("t_quiet_grid_4", ["a", "b", "c"])
    with pytest.raises(TemplateError, match="unique"):
        instantiate_template("t_beat_pause_2", ["a", "a"])
    with pytest.raises(TemplateError, match="Unknown"):
        instantiate_template("t_missing", ["a"])


def test_list_templates_filters_compose():
    assert [t.template_id for t in list_templates(purpose="cliffhanger")] == [
        "t_cliffhanger_bottom",
        "t_stairs_down",
    ]
    assert [t.template_id for t in list_templates(tempo="impact", panel_count=1)] == [
        "t_spread_splash"
    ]
    assert list_templates(purpose="hook", tempo="quick") == []
