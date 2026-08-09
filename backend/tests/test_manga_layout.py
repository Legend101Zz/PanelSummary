from __future__ import annotations

import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any, cast

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.contracts.manga import CompiledPageLayout, MangaPagePlan
from app.services.manga_layout import (
    LayoutCompilationError,
    compile_page_layout,
    render_thumbnail_svg,
)
from app.services.manga_validation import validate_page_plan, validate_page_sequence

FIXTURE_ROOT = Path(__file__).resolve().parents[2] / "packages" / "fixtures"


def payload(path: str) -> dict[str, Any]:
    return cast(
        dict[str, Any],
        json.loads((FIXTURE_ROOT / path).read_text(encoding="utf-8")),
    )


def page_plan(path: str = "canonical/manga_page_plan.v1.json") -> MangaPagePlan:
    return MangaPagePlan.model_validate(payload(path))


def replace_at(document: dict[str, Any], pointer: str, value: Any) -> None:
    parts = pointer.removeprefix("/").split("/")
    target: Any = document
    for part in parts[:-1]:
        target = target[int(part)] if isinstance(target, list) else target[part]
    last = parts[-1]
    if isinstance(target, list):
        target[int(last)] = value
    else:
        target[last] = value


def remove_at(document: dict[str, Any], pointer: str) -> None:
    parts = pointer.removeprefix("/").split("/")
    target: Any = document
    for part in parts[:-1]:
        target = target[int(part)] if isinstance(target, list) else target[part]
    last = parts[-1]
    if isinstance(target, list):
        target.pop(int(last))
    else:
        del target[last]


def test_recursive_compiler_is_deterministic_and_preserves_trim() -> None:
    plan = page_plan()
    first = compile_page_layout(plan)
    second = compile_page_layout(MangaPagePlan.model_validate(plan.model_dump(mode="json")))

    assert first == second
    assert first.compiler_hash == "5654353bbdcab2be5b7bd51d034015711cedc56225aa7e303db263e5a513e54c"
    assert [panel.read_rank for panel in first.panels] == [0, 1]
    assert first.panels[0].bbox.model_dump() == {
        "x": 0.03,
        "y": 0.02,
        "width": 0.94,
        "height": 0.39815999999999996,
    }
    assert first.panels[-1].bbox.y + first.panels[-1].bbox.height == pytest.approx(0.98)


def test_angled_split_and_inset_emit_distinct_geometry_and_allowed_overlap() -> None:
    plan = page_plan("canonical/manga_page_plan.action.v1.json")
    compiled = compile_page_layout(plan)

    assert compiled.compiler_hash == (
        "bbaa561134b1cb4d86af7492d316b2b5b1c2f9ff95d9d3cd18017c06eda703ec"
    )
    assert compiled.panels[0].polygon[0].y != compiled.panels[0].polygon[-1].y
    assert next(panel for panel in compiled.panels if panel.panel_id == "action_3").z_index == 20
    assert any(item.relation == "overlap" for item in compiled.adjacency)
    assert validate_page_plan(plan, compiled) == []


def test_splash_and_ltr_compile_without_invented_reading_edges() -> None:
    splash = page_plan("canonical/manga_page_plan.splash.v1.json")
    splash.reading_direction = "ltr"
    compiled = compile_page_layout(splash)

    assert len(compiled.panels) == 1
    assert compiled.panels[0].read_rank == 0
    assert compiled.panels[0].bbox == splash.canvas.trim


def test_svg_preview_is_byte_stable_and_contains_structure_not_images() -> None:
    plan = page_plan("canonical/manga_page_plan.action.v1.json")
    compiled = compile_page_layout(plan)
    first = render_thumbnail_svg(plan, compiled)
    second = render_thumbnail_svg(plan, compiled)

    assert first == second
    assert first.startswith('<svg xmlns="http://www.w3.org/2000/svg"')
    assert 'data-panel-id="action_3"' in first
    assert 'data-reading-edge="action_2:action_3"' in first
    assert "<image" not in first
    assert first.count("http://") == 1  # SVG namespace only.
    assert "href=" not in first

    normal = page_plan()
    normal_svg = render_thumbnail_svg(normal, compile_page_layout(normal))
    assert 'data-focal-region="panel_1:0"' in normal_svg
    assert 'data-avoid-text-region="panel_2:0"' in normal_svg
    assert 'marker-end="url(#reading_arrow)"' in normal_svg


def test_invalid_cycle_ratio_order_text_and_reference_fixtures_are_actionable() -> None:
    cycle = payload("invalid/layout_cycle.v1.json")
    cycle_plan = payload(cycle["base_fixture"])
    replace_at(cycle_plan, cycle["path"], cycle["value"])
    with pytest.raises(ValidationError, match="layout node IDs must be unique"):
        MangaPagePlan.model_validate(cycle_plan)

    ratio = payload("invalid/layout_ratio.v1.json")
    ratio_plan = payload(ratio["base_fixture"])
    remove_at(ratio_plan, ratio["path"])
    with pytest.raises(ValidationError, match="at least 2 items|split ratios must cover children"):
        MangaPagePlan.model_validate(ratio_plan)

    order = payload("invalid/reading_order.v1.json")
    order_plan = payload(order["base_fixture"])
    order_plan["reading_edges"][0] = {
        "from_panel_id": "panel_2",
        "to_panel_id": "panel_1",
        "reason": "reversed on purpose",
    }
    with pytest.raises(LayoutCompilationError) as error:
        compile_page_layout(MangaPagePlan.model_validate(order_plan))
    assert [issue.code for issue in error.value.issues] == [order["expected_code"]]

    text = payload("invalid/text_reference.v1.json")
    text_plan = payload(text["base_fixture"])
    replace_at(text_plan, text["path"], text["value"])
    with pytest.raises(ValidationError, match="text element must reference"):
        MangaPagePlan.model_validate(text_plan)

    reference = payload("invalid/source_reference.v1.json")
    reference_plan = payload(reference["base_fixture"])
    replace_at(reference_plan, reference["path"], reference["value"])
    parsed = MangaPagePlan.model_validate(reference_plan)
    issues = validate_page_plan(
        parsed,
        compile_page_layout(parsed),
        known_source_fact_ids={"fact_global_access", "fact_locality"},
    )
    assert reference["expected_code"] in {issue.code for issue in issues}


def test_accidental_overlap_fixture_is_rejected_but_explicit_inset_is_allowed() -> None:
    plan = page_plan()
    compiled_payload = compile_page_layout(plan).model_dump(mode="json")
    compiled_payload["panels"][1]["polygon"] = deepcopy(compiled_payload["panels"][0]["polygon"])
    compiled_payload["panels"][1]["bbox"] = deepcopy(compiled_payload["panels"][0]["bbox"])
    compiled_payload["panels"][1]["clip_path"] = compiled_payload["panels"][0]["clip_path"]
    compiled = CompiledPageLayout.model_validate(compiled_payload)

    fixture = payload("invalid/layout_overlap.v1.json")
    issues = validate_page_plan(plan, compiled)
    assert fixture["expected_code"] in {issue.code for issue in issues}


def test_sequence_validator_flags_old_pattern_but_accepts_distinct_pages() -> None:
    normal = page_plan()
    action = page_plan("canonical/manga_page_plan.action.v1.json")
    assert validate_page_sequence(
        [(normal, compile_page_layout(normal)), (action, compile_page_layout(action))]
    ) == []

    old_pattern_payload = payload("canonical/manga_page_plan.splash.v1.json")
    old_pattern_payload["page_script"]["text_elements"] = [
        {
            "text_id": "narrator_card",
            "panel_id": "panel_splash",
            "kind": "narration",
            "content": "The same narrator card appears again.",
            "shape": "caption",
            "preferred_region": {"x": 0.08, "y": 0.78, "width": 0.3, "height": 0.1},
            "typography": {
                "font_token": "manga_narration",
                "weight": 600,
                "min_px": 18,
                "max_px": 36,
            },
        }
    ]
    splash = MangaPagePlan.model_validate(old_pattern_payload)
    repeated = MangaPagePlan.model_validate(old_pattern_payload)
    repeated.page_plan_id = "page_plan_splash_repeat"
    repeated.page_script.page_id = "page_splash_repeat"
    repeated.page_script.page_index = 1
    issues = validate_page_sequence(
        [(splash, compile_page_layout(splash)), (repeated, compile_page_layout(repeated))]
    )
    assert [issue.code for issue in issues] == ["REPEATED_SINGLE_PANEL_NARRATOR"]
