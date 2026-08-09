"""Craft validators: one red fixture per rule (issue #5 acceptance).

NEW tests (Session 4). Each craft rule has a fixture page that fails it and
the template library's pages stay clean, so skills/validators keep a single
source of truth for every threshold.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.contracts.manga import MangaPagePlan
from app.services.manga_craft_validation import (
    CRAFT_RULE_POLICY,
    DIALOGUE_CHAR_BUDGET,
    apply_craft_policy,
    validate_page_craft,
    validate_page_craft_enforced,
)
from app.services.manga_layout import compile_page_layout

FIXTURES = Path(__file__).resolve().parent / "fixtures"

CANVAS = {
    "width_px": 1600,
    "height_px": 2400,
    "trim": {"x": 0.03, "y": 0.02, "width": 0.94, "height": 0.96},
    "safe": {"x": 0.06, "y": 0.05, "width": 0.88, "height": 0.9},
    "bleed_pct": 0.02,
}

SOURCE_REF = {
    "book_id": "book_craft",
    "source_unit_id": "unit_craft_1",
    "page_start": 1,
    "page_end": 2,
    "text_hash": "b" * 64,
}


def _panel(panel_id: str, *, purpose="setup", importance="medium", shot="medium") -> dict:
    return {
        "panel_id": panel_id,
        "purpose": purpose,
        "story_beat": f"Beat for {panel_id}.",
        "importance": importance,
        "tempo": "normal",
        "camera": {"shot": shot, "angle": "eye", "movement": "static"},
        "source_refs": [SOURCE_REF],
        "source_fact_ids": [],
    }


def _grid_layout(panel_ids: list[str], *, reading_rtl: bool = True) -> tuple[dict, list]:
    """A 2xN grid: rows of two panels; panel_ids arrive in reading order."""
    rows = [panel_ids[i : i + 2] for i in range(0, len(panel_ids), 2)]
    children = []
    counter = 0

    def node_id() -> str:
        nonlocal counter
        counter += 1
        return f"craft_n{counter}"

    for row in rows:
        if len(row) == 1:
            children.append({"kind": "panel", "node_id": node_id(), "panel_id": row[0]})
            continue
        geometric = list(reversed(row)) if reading_rtl else list(row)
        children.append(
            {
                "kind": "split",
                "node_id": node_id(),
                "axis": "x",
                "ratios": [1, 1],
                "gutter": {"value": 0.012, "unit": "page_pct"},
                "angle_deg": 0,
                "children": [
                    {"kind": "panel", "node_id": node_id(), "panel_id": item}
                    for item in geometric
                ],
            }
        )
    if len(children) == 1:
        layout_root = children[0]
    else:
        layout_root = {
            "kind": "split",
            "node_id": node_id(),
            "axis": "y",
            "ratios": [1] * len(children),
            "gutter": {"value": 0.03, "unit": "page_pct"},
            "angle_deg": 0,
            "children": children,
        }
    edges = [
        {"from_panel_id": earlier, "to_panel_id": later, "reason": "authored flow"}
        for earlier, later in zip(panel_ids, panel_ids[1:])
    ]
    return layout_root, edges


def _plan(panels: list[dict], panel_order: list[str], *, page_turn=None, texts=None,
          reading_rtl=True) -> MangaPagePlan:
    layout_root, edges = _grid_layout(panel_order, reading_rtl=reading_rtl)
    return MangaPagePlan.model_validate(
        {
            "schema_version": "manga-page-plan.v1",
            "page_plan_id": "plan_craft_fixture",
            "project_id": "project_craft",
            "script_set_artifact_id": "script_set_craft",
            "canvas": CANVAS,
            "reading_direction": "rtl",
            "page_script": {
                "page_id": "page_craft",
                "page_index": 0,
                "page_kind": "standard",
                "entry_state": "Entry.",
                "exit_state": "Exit.",
                "page_turn_panel_id": page_turn,
                "panels": panels,
                "text_elements": texts or [],
            },
            "layout_root": layout_root,
            "reading_edges": edges,
        }
    )


def _codes(plan: MangaPagePlan) -> list[str]:
    return [issue.code for issue in validate_page_craft(plan, compile_page_layout(plan))]


def test_two_panel_standard_page_without_climax_is_flagged():
    ids = ["p0", "p1"]
    plan = _plan([_panel(i, shot=s) for i, s in zip(ids, ["wide", "close_up"])], ids)
    codes = _codes(plan)
    assert "CLIMAX_PAGE_UNJUSTIFIED" in codes


def test_two_panel_reveal_page_is_climax_justified():
    ids = ["p0", "p1"]
    panels = [
        _panel("p0", shot="wide"),
        _panel("p1", purpose="reveal", importance="page_turn", shot="close_up"),
    ]
    plan = _plan(panels, ids, page_turn="p1")
    assert "CLIMAX_PAGE_UNJUSTIFIED" not in _codes(plan)


def test_nine_panel_page_exceeds_density_norm():
    ids = [f"p{i}" for i in range(9)]
    shots = ["wide", "medium", "close_up"] * 3
    panels = [_panel(i, shot=s) for i, s in zip(ids, shots)]
    panels[-1]["purpose"] = "reveal"
    plan = _plan(panels, ids, page_turn=ids[-1])
    assert "PANEL_COUNT_HIGH" in _codes(plan)


def test_all_close_up_page_is_monotone():
    ids = [f"p{i}" for i in range(4)]
    panels = [_panel(i, shot="close_up") for i in ids]
    panels[-1]["purpose"] = "reveal"
    plan = _plan(panels, ids, page_turn=ids[-1])
    assert "MONOTONE_SHOT_PAGE" in _codes(plan)


def test_wordless_setup_ending_without_page_turn_is_flat():
    ids = [f"p{i}" for i in range(4)]
    shots = ["wide", "medium", "close_up", "medium"]
    panels = [_panel(i, shot=s) for i, s in zip(ids, shots)]
    plan = _plan(panels, ids)  # ends on a wordless setup panel, no page_turn
    assert "FLAT_PAGE_ENDING" in _codes(plan)


def test_overlong_dialogue_bubble_breaks_text_budget():
    ids = ["p0", "p1"]
    panels = [
        _panel("p0", shot="wide"),
        _panel("p1", purpose="reveal", importance="page_turn", shot="close_up"),
    ]
    text = {
        "text_id": "t0",
        "panel_id": "p1",
        "kind": "dialogue",
        "content": "x" * (DIALOGUE_CHAR_BUDGET + 1),
        "speaker_ref": "char_haw",
        "shape": "oval",
        "preferred_region": {"x": 0.1, "y": 0.1, "width": 0.3, "height": 0.15},
        "typography": {"font_token": "font_dialogue"},
    }
    plan = _plan(panels, ids, page_turn="p1", texts=[text])
    assert "TEXT_BUDGET_EXCEEDED" in _codes(plan)


def test_left_to_right_row_order_is_incoherent_for_rtl():
    ids = [f"p{i}" for i in range(4)]
    shots = ["wide", "medium", "close_up", "medium"]
    panels = [_panel(i, shot=s) for i, s in zip(ids, shots)]
    panels[-1]["purpose"] = "reveal"
    # reading_rtl=False lays each row out so the FIRST-read panel is leftmost:
    # an LTR page pretending to be RTL.
    plan = _plan(panels, ids, page_turn=ids[-1], reading_rtl=False)
    assert "RTL_READING_FLOW_INCOHERENT" in _codes(plan)


def test_clean_rtl_page_produces_no_craft_issues():
    ids = [f"p{i}" for i in range(4)]
    shots = ["wide", "medium", "close_up", "extreme_close_up"]
    panels = [_panel(i, shot=s) for i, s in zip(ids, shots)]
    panels[-1]["purpose"] = "reveal"
    plan = _plan(panels, ids, page_turn=ids[-1])
    assert _codes(plan) == []


# ---------------------------------------------------------------------------
# Session 5 (step 0.2): warn-vs-block policy + the live WMC regression fixture
# ---------------------------------------------------------------------------


def test_policy_covers_every_craft_rule_exactly_once():
    assert set(CRAFT_RULE_POLICY) == {
        "PANEL_COUNT_HIGH",
        "CLIMAX_PAGE_UNJUSTIFIED",
        "MONOTONE_SHOT_PAGE",
        "FLAT_PAGE_ENDING",
        "TEXT_BUDGET_EXCEEDED",
        "RTL_READING_FLOW_INCOHERENT",
    }
    assert CRAFT_RULE_POLICY["RTL_READING_FLOW_INCOHERENT"] == "block"
    assert all(
        policy == "warn"
        for code, policy in CRAFT_RULE_POLICY.items()
        if code != "RTL_READING_FLOW_INCOHERENT"
    )


def test_policy_escalates_rtl_flow_to_error_and_keeps_warnings():
    ids = [f"p{i}" for i in range(4)]
    shots = ["close_up"] * 4  # monotone (warn) on an LTR-shaped page (block)
    panels = [_panel(i, shot=s) for i, s in zip(ids, shots)]
    plan = _plan(panels, ids, reading_rtl=False)
    enforced = validate_page_craft_enforced(plan, compile_page_layout(plan))
    by_code = {issue.code: issue.severity for issue in enforced}
    assert by_code["RTL_READING_FLOW_INCOHERENT"] == "error"
    assert by_code["MONOTONE_SHOT_PAGE"] == "warning"
    assert by_code["FLAT_PAGE_ENDING"] == "warning"
    # apply_craft_policy is idempotent and preserves order/count.
    assert apply_craft_policy(enforced) == enforced


def test_live_wmc_session4_accepted_page_is_now_blocked():
    """Regression fixture from the LIVE defect (Session 4 handoff item 8).

    The frozen plan is page 0 of the ACCEPTED WMC thumbnail set
    (`accepted_thumbnail_set_e02b371798056f72398af1cc`, run
    `run_dir_a99464c56fa3b96e777fe750`), reconstructed from Mongo — its top
    row reads left-to-right, which every error-level validator missed and
    the Session 4 SVG preview loop caught. Under the Session 5 policy the
    same plan must carry an error-severity RTL flow issue, i.e. it can no
    longer be accepted.
    """
    raw = json.loads(
        (FIXTURES / "wmc_session4_rtl_defect_page_plan.json").read_text()
    )
    plan = MangaPagePlan.model_validate(raw)
    compiled = compile_page_layout(plan)
    advisory = validate_page_craft(plan, compiled)
    assert any(
        issue.code == "RTL_READING_FLOW_INCOHERENT" and issue.severity == "warning"
        for issue in advisory
    ), "the raw validator should still see the live defect as advisory"
    enforced = validate_page_craft_enforced(plan, compiled)
    errors = [issue for issue in enforced if issue.severity == "error"]
    assert [issue.code for issue in errors] == ["RTL_READING_FLOW_INCOHERENT"]
    assert errors[0].message.startswith("Panel panel_0_0 reads after panel_0_1")
