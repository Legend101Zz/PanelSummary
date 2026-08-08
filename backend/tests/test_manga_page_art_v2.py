"""Session 5 main goal: lane-C page-art mechanics + durable stage driver.

Pure mechanics (no provider calls): rendering-mode policy is code, the
conditioning skeleton and masks come from compiled geometry only, the OCR
gate filters screentone noise but catches real lettering, border adherence
is a deterministic accept/retry signal (explicitly NOT Layout-IoU — issue
#10 owns real metrics), and composition renders ALL text by code.

Stage driver (fake image caller + fake vision QA over the REAL planning
lineage from the Session 4 driver harness): acceptance, refusal-class
no-image retries with receipts, budget exhaustion degrading to DSL-only
pages, and vision panel-count rejection.
"""

import asyncio
import base64
import io
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import pytest
from PIL import Image, ImageDraw

from app.contracts.manga import MangaPagePlan, PageScript
from app.services.manga_page_art import (
    FALLBACK_DICTIONARY,
    border_adherence,
    compose_lettered_page,
    crop_panel,
    ocr_gate,
    render_conditioning_skeleton,
    render_panel_masks,
    rendering_mode_for_page,
)
from app.services.manga_page_art_stage import MangaPageArtStageService
from app.services.manga_layout import compile_page_layout
from app.services.manga_page_planner import MangaPagePlannerService
from test_manga_page_planner_v2 import (
    PROJECT_ID,
    PlanningFakeWorker,
    _direction_run,
    _fixture,
    _seeded,
)

HAS_TESSERACT = shutil.which("tesseract") is not None


def _plan() -> MangaPagePlan:
    return MangaPagePlan.model_validate(_fixture("manga_page_plan.v1.json"))


def _script(**overrides) -> PageScript:
    raw = _fixture("manga_page_plan.v1.json")["page_script"]
    raw.update(overrides)
    return PageScript.model_validate(raw)


# ---------------------------------------------------------------------------
# rendering-mode policy (issue #12: policy is code)
# ---------------------------------------------------------------------------


def test_standard_page_defaults_to_lane_c():
    assert rendering_mode_for_page(_script()) == "C"


def test_splash_page_is_lane_b():
    assert rendering_mode_for_page(_script(page_kind="splash")) == "B"


def test_quiet_all_hold_page_is_lane_a():
    raw = _fixture("manga_page_plan.v1.json")["page_script"]
    for panel in raw["panels"]:
        panel["tempo"] = "hold"
        if panel["purpose"] == "action":
            panel["purpose"] = "setup"
    assert rendering_mode_for_page(PageScript.model_validate(raw)) == "A"


# ---------------------------------------------------------------------------
# conditioning skeleton + masks (the deferred polygon->mask export)
# ---------------------------------------------------------------------------


def test_skeleton_has_hard_borders_and_masks_cover_panels():
    plan = _plan()
    compiled = compile_page_layout(plan)
    skeleton = render_conditioning_skeleton(compiled)
    assert skeleton.size == (832, 1248)
    # The skeleton itself must score ~perfect border adherence: every
    # sampled border point sits on the thick black frame it just drew.
    result = border_adherence(skeleton, compiled)
    assert result.passed
    assert result.page_score > 0.95

    masks = render_panel_masks(compiled)
    assert set(masks) == {panel.panel_id for panel in compiled.panels}
    for panel in compiled.panels:
        mask = masks[panel.panel_id]
        coverage = sum(1 for value in mask.getdata() if value == 255) / (
            mask.size[0] * mask.size[1]
        )
        bbox_area = panel.bbox.width * panel.bbox.height
        assert coverage == pytest.approx(bbox_area, abs=0.05)


def test_blank_page_fails_border_adherence():
    plan = _plan()
    compiled = compile_page_layout(plan)
    blank = Image.new("RGB", (832, 1248), "white")
    result = border_adherence(blank, compiled)
    assert not result.passed
    assert result.page_score < 0.1
    assert result.metric_version == "page-art-border-adherence.v1"


def test_crop_panel_matches_bbox():
    plan = _plan()
    compiled = compile_page_layout(plan)
    page = Image.new("RGB", (832, 1248), "white")
    panel = compiled.panels[0]
    crop = crop_panel(page, compiled, panel.panel_id)
    assert crop.size[0] == pytest.approx(panel.bbox.width * 832, abs=2)
    assert crop.size[1] == pytest.approx(panel.bbox.height * 1248, abs=2)


# ---------------------------------------------------------------------------
# OCR gate (findings guardrail 3 — screentone noise filter)
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not HAS_TESSERACT, reason="tesseract binary unavailable")
def test_ocr_gate_catches_real_lettering(tmp_path):
    image = Image.new("RGB", (832, 400), "white")
    draw = ImageDraw.Draw(image)
    from app.services.manga_page_art import _load_font

    font = _load_font(48)
    draw.text((60, 80), "WHO MOVED MY CHEESE", fill="black", font=font)
    draw.text((60, 200), "THE STATION WAS EMPTY", fill="black", font=font)
    path = tmp_path / "lettered.png"
    image.save(path)
    result = ocr_gate(path)
    assert not result.clean
    assert len(result.text_words) >= 2


@pytest.mark.skipif(not HAS_TESSERACT, reason="tesseract binary unavailable")
def test_ocr_gate_ignores_screentone_class_noise(tmp_path):
    # Diagonal stroke clutter: the class of texture the raw spike gate
    # false-positived on ("Nel", "SZ," — non-dictionary, low-confidence).
    image = Image.new("RGB", (832, 400), "white")
    draw = ImageDraw.Draw(image)
    for x in range(0, 832, 7):
        draw.line([(x, 0), (x - 60, 400)], fill="black", width=1)
    for x in range(0, 832, 23):
        draw.arc([x, 100, x + 40, 160], 20, 200, fill="black", width=2)
    path = tmp_path / "tones.png"
    image.save(path)
    result = ocr_gate(path)
    assert result.clean


def test_fallback_dictionary_covers_the_observed_defect_words():
    for word in ("who", "moved", "my", "cheese", "chapter", "empty", "station"):
        assert word in FALLBACK_DICTIONARY


# ---------------------------------------------------------------------------
# v2 composition: code-owned lettering
# ---------------------------------------------------------------------------


def test_composition_renders_all_text_elements_by_code():
    plan = _plan()
    compiled = compile_page_layout(plan)
    art = Image.new("RGB", (832, 1248), "white")
    composed = compose_lettered_page(art, plan, compiled)
    assert composed.size == art.size
    gray = composed.convert("L")
    width, height = gray.size
    # Every authored text element leaves ink inside its preferred region.
    for text in plan.page_script.text_elements:
        region = text.preferred_region
        box = (
            int(region.x * width),
            int(region.y * height),
            int((region.x + region.width) * width),
            min(int((region.y + region.height * 3) * height), height),
        )
        crop = gray.crop(box)
        assert min(crop.getdata()) < 100, f"text element {text.text_id} left no ink"
    # Frames are drawn from compiled geometry.
    frames = border_adherence(composed, compiled)
    assert frames.page_score > 0.9


# ---------------------------------------------------------------------------
# stage driver on the real planning lineage
# ---------------------------------------------------------------------------


def _data_url(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def _echo_skeleton_caller(cost: float = 0.039):
    """Return the conditioning skeleton itself as the 'generated' page —
    a perfectly boundary-adherent, text-free lane-C output."""

    async def caller(payload):
        skeleton_url = payload["messages"][0]["content"][1]["image_url"]["url"]
        return {
            "choices": [
                {"message": {"content": None, "images": [{"image_url": {"url": skeleton_url}}]}}
            ],
            "usage": {"cost": cost},
        }

    return caller


def _refusal_caller():
    async def caller(payload):
        return {
            "choices": [
                {"message": {"content": "I cannot draw this page.", "images": []}}
            ],
            "usage": {"cost": 0.0005},
        }

    return caller


def _good_vision(expected: int):
    async def vision_qa(*, image_path, briefs, expected_panel_count, system_prompt):
        return {
            "parsed": {
                "panel_count": expected,
                "panels": [
                    {
                        "index": i + 1,
                        "matches_brief": True,
                        "identity_ok": True,
                        "contains_text": False,
                        "notes": "ok",
                    }
                    for i in range(expected)
                ],
                "overall_ok": True,
            },
            "usage": {"prompt_tokens": 900, "completion_tokens": 150},
            "cost_usd": 0.002,
        }

    return vision_qa


def _wrong_count_vision():
    async def vision_qa(*, image_path, briefs, expected_panel_count, system_prompt):
        return {
            "parsed": {
                "panel_count": expected_panel_count + 1,
                "panels": [],
                "overall_ok": False,
            },
            "usage": {"prompt_tokens": 900, "completion_tokens": 80},
            "cost_usd": 0.002,
        }

    return vision_qa


async def _planning_lineage(tmp_path):
    repositories, scope_id = await _seeded()
    run_id = await _direction_run(repositories, scope_id)
    planner = MangaPagePlannerService(
        repositories, PlanningFakeWorker(repositories, tmp_path)
    )
    await planner.run_page_writing_goal(project_id=PROJECT_ID, run_id=run_id)
    await planner.run_thumbnail_goal(project_id=PROJECT_ID, run_id=run_id)
    return repositories, run_id


def run(coro):
    return asyncio.run(coro)


@pytest.mark.skipif(not HAS_TESSERACT, reason="tesseract binary unavailable")
def test_stage_accepts_conditioned_art_with_full_lineage(tmp_path):
    async def scenario():
        repositories, run_id = await _planning_lineage(tmp_path)
        service = MangaPageArtStageService(
            repositories,
            media_root=tmp_path,
            image_caller=_echo_skeleton_caller(),
            vision_qa=_good_vision(2),
        )
        outcome = await service.run_page_art_stage(
            project_id=PROJECT_ID, run_id=run_id, image_budget_usd=0.20
        )
        assert [page.status for page in outcome.pages] == ["art_accepted"] * 2
        assert [page.mode for page in outcome.pages] == ["C", "C"]
        assert outcome.total_image_cost_usd == pytest.approx(0.078)
        assert outcome.total_vision_cost_usd == pytest.approx(0.004)

        artifacts = await repositories.list_artifacts(run_id, accepted_only=True)
        kinds = {}
        for artifact in artifacts:
            kinds.setdefault(artifact.kind, []).append(artifact)
        assert len(kinds["page_art"]) == 2
        assert len(kinds["composed_page"]) == 2
        # One image receipt + one vision receipt per page.
        assert len(kinds["provider_receipt"]) == 4
        art = kinds["page_art"][0]
        assert art.content["gates"]["accepted"] is True
        assert art.content["slicing_map"]
        assert art.storage_ref and art.storage_ref.startswith("storage://page-art/")
        composed = kinds["composed_page"][0]
        assert composed.content["has_art"] is True
        assert composed.content["text_element_count"] >= 1

        stage = await repositories.get_stage(outcome.stage_run_id)
        assert stage.status == "succeeded"
        assert stage.trace["total_image_cost_usd"] == pytest.approx(0.078)

        # Idempotent reuse: a second call re-reads the succeeded stage.
        again = await service.run_page_art_stage(
            project_id=PROJECT_ID, run_id=run_id, image_budget_usd=0.20
        )
        assert again.reused is True
        assert again.total_image_cost_usd == pytest.approx(0.078)

    run(scenario())


@pytest.mark.skipif(not HAS_TESSERACT, reason="tesseract binary unavailable")
def test_no_image_refusals_are_receipted_and_page_degrades(tmp_path):
    async def scenario():
        repositories, run_id = await _planning_lineage(tmp_path)
        service = MangaPageArtStageService(
            repositories,
            media_root=tmp_path,
            image_caller=_refusal_caller(),
            vision_qa=_good_vision(2),
        )
        outcome = await service.run_page_art_stage(
            project_id=PROJECT_ID, run_id=run_id, image_budget_usd=0.50
        )
        for page in outcome.pages:
            assert page.status == "dsl_only_after_rejected"
            assert page.attempts == 2
            assert page.composed_artifact_id is not None
            assert page.page_art_artifact_id is None

        artifacts = await repositories.list_artifacts(run_id, accepted_only=True)
        receipts = [a for a in artifacts if a.kind == "provider_receipt"]
        image_receipts = [
            r for r in receipts if r.content["purpose"] == "page_art_image"
        ]
        # 2 pages x 2 attempts, every one receipted with the refusal text.
        assert len(image_receipts) == 4
        for receipt in image_receipts:
            assert receipt.content["n_images"] == 0
            assert receipt.content["response_text"] == "I cannot draw this page."
            assert receipt.content["cost_usd"] == pytest.approx(0.0005)
        composed = [a for a in artifacts if a.kind == "composed_page"]
        assert len(composed) == 2
        assert all(item.content["has_art"] is False for item in composed)

    run(scenario())


def test_zero_budget_spends_nothing_and_composes_dsl_only(tmp_path):
    async def scenario():
        repositories, run_id = await _planning_lineage(tmp_path)
        calls = {"count": 0}

        async def exploding_caller(payload):
            calls["count"] += 1
            raise AssertionError("image caller must not run at zero budget")

        service = MangaPageArtStageService(
            repositories,
            media_root=tmp_path,
            image_caller=exploding_caller,
            vision_qa=None,
        )
        outcome = await service.run_page_art_stage(
            project_id=PROJECT_ID, run_id=run_id  # budget defaults to run's 0.0
        )
        assert calls["count"] == 0
        assert outcome.total_image_cost_usd == 0.0
        for page in outcome.pages:
            assert page.status == "dsl_only_after_budget_exhausted"
            assert page.composed_artifact_id is not None
        artifacts = await repositories.list_artifacts(run_id, accepted_only=True)
        assert not any(a.kind == "provider_receipt" for a in artifacts)
        assert len([a for a in artifacts if a.kind == "composed_page"]) == 2

    run(scenario())


def _text_flagging_vision(expected: int):
    async def vision_qa(*, image_path, briefs, expected_panel_count, system_prompt):
        return {
            "parsed": {
                "panel_count": expected,
                "panels": [
                    {
                        "index": 1,
                        "matches_brief": True,
                        "identity_ok": True,
                        "contains_text": True,  # scribble/pseudo-glyph class
                        "notes": "hand-drawn scribbles in a notebook",
                    }
                ],
                "overall_ok": True,
            },
            "usage": {"prompt_tokens": 900, "completion_tokens": 100},
            "cost_usd": 0.002,
        }

    return vision_qa


@pytest.mark.skipif(not HAS_TESSERACT, reason="tesseract binary unavailable")
def test_vision_text_flag_is_advisory_ocr_is_the_text_authority(tmp_path):
    """GATE_POLICY_VERSION v2 (live-run calibration): vision's contains_text
    fired on drawn scribble texture on BOTH live pages while the dictionary
    OCR gate was clean — it must not reject on its own, only be recorded."""

    async def scenario():
        repositories, run_id = await _planning_lineage(tmp_path)
        service = MangaPageArtStageService(
            repositories,
            media_root=tmp_path,
            image_caller=_echo_skeleton_caller(),
            vision_qa=_text_flagging_vision(2),
        )
        outcome = await service.run_page_art_stage(
            project_id=PROJECT_ID, run_id=run_id, image_budget_usd=0.20
        )
        for page in outcome.pages:
            assert page.status == "art_accepted"
            assert page.gate_summary["vision_text_advisory"] is True
            assert page.gate_summary["gate_policy_version"] == "page-art-gates.v2"

    run(scenario())


@pytest.mark.skipif(not HAS_TESSERACT, reason="tesseract binary unavailable")
def test_vision_panel_count_mismatch_rejects_the_page(tmp_path):
    async def scenario():
        repositories, run_id = await _planning_lineage(tmp_path)
        service = MangaPageArtStageService(
            repositories,
            media_root=tmp_path,
            image_caller=_echo_skeleton_caller(),
            vision_qa=_wrong_count_vision(),
        )
        outcome = await service.run_page_art_stage(
            project_id=PROJECT_ID, run_id=run_id, image_budget_usd=0.50
        )
        for page in outcome.pages:
            assert page.status == "dsl_only_after_rejected"
            assert "vision QA counted" in page.gate_summary["reject_reason"]

    run(scenario())
