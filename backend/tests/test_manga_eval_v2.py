"""Issue #10 (Session 6): eval-harness core — real Layout-IoU + judges.

The acceptance bar the issue sets: deliberately broken fixtures move the
intended metric and only that metric. Pinned here deterministically:

- a faithful render (the conditioning skeleton itself) scores near-1.0;
- a border-free page (fill leaks everywhere) collapses the IoU;
- art rendered from a DIFFERENT layout than the one scored against drops
  the IoU while the faithful pairing stays high (structural mismatch);
- the M3 judge call carries the versioned rubric + must-preserve claims
  (fake vision — no provider spend in tests).
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image

from app.contracts.manga import MangaPagePlan
from app.services.manga_eval import (
    JUDGE_RUBRIC_VERSION,
    build_scorecard,
    judge_page,
    layout_iou,
    PageScore,
)
from app.services.manga_layout import compile_page_layout
from app.services.manga_page_art import render_conditioning_skeleton

CANONICAL = Path(__file__).resolve().parents[2] / "packages" / "fixtures" / "canonical"


def _layout(name: str):
    import json

    plan = MangaPagePlan.model_validate(
        json.loads((CANONICAL / name).read_text(encoding="utf-8"))
    )
    return compile_page_layout(plan)


def test_faithful_render_scores_high_iou():
    compiled = _layout("manga_page_plan.v1.json")
    skeleton = render_conditioning_skeleton(compiled)
    result = layout_iou(skeleton, compiled)
    assert result.seeded_panels == len(compiled.panels)
    assert result.page_iou > 0.85
    assert all(value > 0.8 for value in result.panel_ious.values())


def test_borderless_page_collapses_iou():
    compiled = _layout("manga_page_plan.v1.json")
    blank = Image.new("RGB", (832, 1248), "white")
    result = layout_iou(blank, compiled)
    # The fill floods the whole page from every seed: union >> polygon.
    assert result.page_iou < 0.6
    assert result.page_iou < layout_iou(
        render_conditioning_skeleton(compiled), compiled
    ).page_iou


def test_mismatched_layout_moves_only_the_structural_metric():
    match = _layout("manga_page_plan.v1.json")
    mismatch = _layout("manga_page_plan.action.v1.json")
    art_from_match = render_conditioning_skeleton(match)
    faithful = layout_iou(art_from_match, match).page_iou
    crossed = layout_iou(art_from_match, mismatch).page_iou
    assert faithful > crossed + 0.15


def test_judge_call_carries_versioned_rubric_and_claims():
    captured = {}

    async def fake_vision(*, image_path, briefs, expected_panel_count, system_prompt):
        captured.update(
            briefs=briefs,
            system_prompt=system_prompt,
            expected_panel_count=expected_panel_count,
        )
        return {
            "parsed": {
                "readability": 4,
                "fidelity": {"score": 3, "claims_conveyed": 1, "claims_total": 2},
                "craft": {
                    "page_turn_hook": 3,
                    "shot_variety": 4,
                    "text_density_comfort": 4,
                },
                "notes": "ok",
            },
            "usage": {"prompt_tokens": 900, "completion_tokens": 120},
            "cost_usd": 0.003,
        }

    result = asyncio.run(
        judge_page(
            fake_vision,
            image_path=Path("/tmp/page.png"),
            briefs="Panel 1: Haw hesitates at the junction.",
            must_preserve=["Movement beats waiting", "The maze keeps changing"],
            expected_panel_count=2,
        )
    )
    assert result["parsed"]["readability"] == 4
    assert JUDGE_RUBRIC_VERSION in captured["briefs"]
    assert "Movement beats waiting" in captured["briefs"]
    assert "manga editorial judge" in captured["system_prompt"]


def test_scorecard_totals_and_versions():
    compiled = _layout("manga_page_plan.v1.json")
    iou = layout_iou(render_conditioning_skeleton(compiled), compiled)
    card = build_scorecard(
        project_id="project_demo",
        run_id="run_dir_demo",
        lane="C",
        subject="unit-test",
        pages=[
            PageScore(page_index=0, layout_iou=iou, judge_cost_usd=0.003),
            PageScore(page_index=1, layout_iou=None, notes=["dsl_only"]),
        ],
    )
    assert card["schema_version"] == "eval-scorecard.v1"
    assert card["layout_iou_version"] == "layout-iou.v1"
    assert card["totals"]["mean_layout_iou"] == iou.page_iou
    assert card["totals"]["judge_cost_usd"] == 0.003
    assert card["pages"][1]["layout_iou"] is None


# ---------------------------------------------------------------------------
# Session 7 fold (issue #10): scorecard baseline/regression compare
# ---------------------------------------------------------------------------


def _scorecard_payload(
    *,
    iou: float,
    border: float,
    readability: float,
    conveyed: int,
    total: int = 36,
    iou_version: str = "layout-iou.v1",
    rubric_version: str = "m3-judge-rubrics.v1",
) -> dict:
    return {
        "schema_version": "eval-scorecard.v1",
        "layout_iou_version": iou_version,
        "judge_rubric_version": rubric_version,
        "run_id": "run_dir_demo",
        "subject": "composed",
        "pages": [
            {
                "page_index": 0,
                "layout_iou": {"page_iou": iou},
                "border_adherence_score": border,
                "judge": {
                    "readability": readability,
                    "fidelity": {"claims_conveyed": conveyed, "claims_total": total},
                    "craft": {"page_turn_hook": 3, "shot_variety": 4},
                },
            }
        ],
    }


def test_scorecard_diff_flags_a_fidelity_improvement() -> None:
    from app.services.manga_eval import compare_scorecards

    baseline = _scorecard_payload(iou=0.38, border=0.8, readability=4, conveyed=2)
    candidate = _scorecard_payload(iou=0.39, border=0.82, readability=4, conveyed=20)
    diff = compare_scorecards(baseline, candidate)
    assert diff["verdict"] == "improvement"
    assert any("fidelity_rate" in item for item in diff["improvements"])
    assert diff["regressions"] == []
    assert abs(diff["pages"][0]["judge_deltas"]["fidelity_rate"] - 0.5) < 1e-9


def test_scorecard_diff_flags_a_structural_regression() -> None:
    from app.services.manga_eval import compare_scorecards

    baseline = _scorecard_payload(iou=0.38, border=0.80, readability=4, conveyed=2)
    candidate = _scorecard_payload(iou=0.20, border=0.79, readability=4, conveyed=2)
    diff = compare_scorecards(baseline, candidate)
    assert diff["verdict"] == "regression"
    assert any("layout_iou" in item for item in diff["regressions"])


def test_scorecard_diff_is_unchanged_below_thresholds() -> None:
    from app.services.manga_eval import compare_scorecards

    baseline = _scorecard_payload(iou=0.38, border=0.80, readability=4, conveyed=2)
    candidate = _scorecard_payload(iou=0.40, border=0.81, readability=4, conveyed=3)
    diff = compare_scorecards(baseline, candidate)
    assert diff["verdict"] == "unchanged"
    assert diff["regressions"] == [] and diff["improvements"] == []


def test_scorecard_diff_refuses_cross_version_comparison() -> None:
    from app.services.manga_eval import compare_scorecards

    baseline = _scorecard_payload(iou=0.38, border=0.8, readability=4, conveyed=2)
    candidate = _scorecard_payload(
        iou=0.38, border=0.8, readability=4, conveyed=2, iou_version="layout-iou.v2"
    )
    diff = compare_scorecards(baseline, candidate)
    assert diff["verdict"] == "incomparable"
    assert any("layout_iou_version" in reason for reason in diff["reasons"])
