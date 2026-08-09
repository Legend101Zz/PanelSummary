"""Session 6 (issue #5): v2 composition upgrades — bubble tails, the v1
bubble-rule carry, supersedes lineage, and the compose-only stage.

The pure helpers port the v1 reader's rules (dialogue_geometry.ts):
``resolve_tail_side``/``tail_geometry`` mirror ``resolveBubbleTail`` and
``nudge_region_clear`` mirrors ``avoidSpriteFaceZones`` — same side
resolution, same 15-85% offset clamp, same candidate ladder. The stage
tests pin the two lineage behaviors the Session 5 handoff deferred:
regeneration over an accepted page_art populates ``supersedes``, and the
compose-only stage re-letters accepted art at ZERO image cost.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import pytest
from PIL import Image

import app.services.manga_page_art_stage as stage_module
from app.contracts.manga import MangaPagePlan
from app.services.manga_layout import compile_page_layout
from app.services.manga_page_art import (
    COMPOSITION_VERSION,
    TAIL_OFFSET_MAX,
    TAIL_OFFSET_MIN,
    compose_lettered_page,
    nudge_region_clear,
    resolve_tail_side,
    resolve_tail_target,
    tail_geometry,
)
from app.services.manga_page_art_stage import MangaPageArtStageService
from app.services.manga_page_planner import MangaPagePlannerService
from test_manga_page_art_v2 import (
    _echo_skeleton_caller,
    _good_vision,
    _planning_lineage,
)
from test_manga_page_planner_v2 import PROJECT_ID, _fixture

BOX = (0.3, 0.3, 0.3, 0.2)  # left, top, width, height — page-normalized


def run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# v1 rule carry: resolveBubbleTail
# ---------------------------------------------------------------------------


def test_tail_side_tracks_target_position():
    assert resolve_tail_side(BOX, (0.45, 0.9))[0] == "bottom"
    assert resolve_tail_side(BOX, (0.45, 0.1))[0] == "top"
    assert resolve_tail_side(BOX, (0.1, 0.4))[0] == "left"
    assert resolve_tail_side(BOX, (0.9, 0.4))[0] == "right"
    # v1 fallback: a target inside the box keeps the default bottom side.
    assert resolve_tail_side(BOX, (0.45, 0.4))[0] == "bottom"


def test_tail_offset_is_clamped_to_the_v1_band():
    _, offset_far_left = resolve_tail_side(BOX, (0.0, 0.9))
    _, offset_far_right = resolve_tail_side(BOX, (1.0, 0.9))
    assert offset_far_left == TAIL_OFFSET_MIN
    assert offset_far_right == TAIL_OFFSET_MAX
    _, centred = resolve_tail_side(BOX, (0.45, 0.9))
    assert TAIL_OFFSET_MIN < centred < TAIL_OFFSET_MAX


def test_tail_geometry_bases_sit_on_the_resolved_edge():
    tail = tail_geometry(BOX, (0.45, 0.9))
    assert tail.side == "bottom"
    bottom = BOX[1] + BOX[3]
    assert tail.base_a[1] == pytest.approx(bottom)
    assert tail.base_b[1] == pytest.approx(bottom)
    assert tail.tip == (0.45, 0.9)
    left_tail = tail_geometry(BOX, (0.05, 0.38))
    assert left_tail.side == "left"
    assert left_tail.base_a[0] == pytest.approx(BOX[0])


# ---------------------------------------------------------------------------
# v1 rule carry: avoidSpriteFaceZones -> authored avoid/focal regions
# ---------------------------------------------------------------------------


def test_clear_region_is_left_alone():
    box = (0.1, 0.1, 0.2, 0.1)
    assert nudge_region_clear(box, [(0.6, 0.6, 0.3, 0.3)]) == box


def test_overlapping_region_moves_to_a_clear_candidate():
    box = (0.4, 0.45, 0.2, 0.1)
    obstacle = (0.35, 0.4, 0.3, 0.2)
    moved = nudge_region_clear(box, [obstacle])
    assert moved != box
    assert not (
        moved[0] < obstacle[0] + obstacle[2]
        and moved[0] + moved[2] > obstacle[0]
        and moved[1] < obstacle[1] + obstacle[3]
        and moved[1] + moved[3] > obstacle[1]
    )
    # Same width/height — only position changes (the v1 behavior).
    assert moved[2:] == box[2:]


def test_fully_blocked_page_keeps_the_authored_region():
    box = (0.4, 0.45, 0.2, 0.1)
    everywhere = [(0.0, 0.0, 1.0, 1.0)]
    assert nudge_region_clear(box, everywhere) == box


# ---------------------------------------------------------------------------
# tail-target resolution (authored point > speaker blocking anchor)
# ---------------------------------------------------------------------------


def _plan_with_dialogue(*, with_tail_target: bool, with_blocking: bool) -> MangaPagePlan:
    raw = _fixture("manga_page_plan.v1.json")
    script = raw["page_script"]
    if with_blocking:
        script["panels"][0]["blocking"] = [
            {
                "subject_ref": "char_haw",
                "pose": "standing",
                "expression": "worried",
                "anchor": {"x": 0.25, "y": 0.35},
                "scale": 1,
                "facing": "front",
                "depth": "midground",
            }
        ]
    element = {
        "text_id": "text_dialogue",
        "panel_id": script["panels"][0]["panel_id"],
        "kind": "dialogue",
        "content": "The maze changed again.",
        "speaker_ref": "char_haw",
        "writing_direction": "horizontal",
        "shape": "oval",
        "preferred_region": {"x": 0.55, "y": 0.08, "width": 0.3, "height": 0.14},
        "typography": {"font_token": "font_dialogue"},
        "overflow": "fit",
        "z_index": 41,
    }
    if with_tail_target:
        element["tail_target"] = {"subject_ref": "char_haw", "point": {"x": 0.3, "y": 0.5}}
    script["text_elements"].append(element)
    return MangaPagePlan.model_validate(raw)


def test_authored_tail_target_wins():
    plan = _plan_with_dialogue(with_tail_target=True, with_blocking=True)
    text = plan.page_script.text_elements[-1]
    assert resolve_tail_target(text, plan) == (0.3, 0.5)


def test_speaker_blocking_anchor_is_the_fallback():
    plan = _plan_with_dialogue(with_tail_target=False, with_blocking=True)
    text = plan.page_script.text_elements[-1]
    assert resolve_tail_target(text, plan) == (0.25, 0.35)


def test_no_speaker_no_blocking_means_no_tail():
    plan = _plan_with_dialogue(with_tail_target=False, with_blocking=False)
    text = plan.page_script.text_elements[-1]
    assert resolve_tail_target(text, plan) is None


# ---------------------------------------------------------------------------
# composition rendering: tails + shape differentiation
# ---------------------------------------------------------------------------


def _compose(plan: MangaPagePlan) -> Image.Image:
    compiled = compile_page_layout(plan)
    base = Image.new("RGB", (832, 1248), "white")
    return compose_lettered_page(base, plan, compiled)


def test_dialogue_tail_reaches_toward_the_speaker():
    tailed = _compose(_plan_with_dialogue(with_tail_target=True, with_blocking=True))
    untailed = _compose(
        _plan_with_dialogue(with_tail_target=False, with_blocking=False)
    )
    # The tail region (between bubble bottom and the target point) must have
    # gained ink relative to the tail-less composition.
    crop_box = (int(0.24 * 832), int(0.24 * 1248), int(0.5 * 832), int(0.5 * 1248))
    tailed_ink = sum(
        1 for px in tailed.convert("L").crop(crop_box).getdata() if px < 100
    )
    untailed_ink = sum(
        1 for px in untailed.convert("L").crop(crop_box).getdata() if px < 100
    )
    assert tailed_ink > untailed_ink


def test_bubble_shapes_render_distinctly():
    images = {}
    for shape in ("oval", "round_rect", "jagged", "thought_cloud"):
        raw = _fixture("manga_page_plan.v1.json")
        script = raw["page_script"]
        script["text_elements"] = [
            {
                "text_id": "text_shape",
                "panel_id": script["panels"][0]["panel_id"],
                "kind": "thought" if shape == "thought_cloud" else "monologue",
                "content": "The corridor smells of old cheese.",
                "speaker_ref": "char_haw",
                "writing_direction": "horizontal",
                "shape": shape,
                "preferred_region": {"x": 0.55, "y": 0.08, "width": 0.3, "height": 0.14},
                "typography": {"font_token": "font_dialogue"},
                "overflow": "fit",
                "z_index": 41,
            }
        ]
        images[shape] = _compose(MangaPagePlan.model_validate(raw))
    payloads = {shape: image.tobytes() for shape, image in images.items()}
    assert len(set(payloads.values())) == 4  # every shape draws differently


def test_composition_version_is_stamped():
    # v3 (Session 8, issue #6): beat captions for artless panels + the
    # compositor-wide type floor — the bump re-keys compose-only stages.
    assert COMPOSITION_VERSION == "manga-composition.v3"


# ---------------------------------------------------------------------------
# stage lineage: supersedes + the compose-only stage
# ---------------------------------------------------------------------------


@pytest.mark.skipif(
    __import__("shutil").which("tesseract") is None,
    reason="tesseract binary unavailable",
)
def test_policy_rerun_supersedes_accepted_page_art(tmp_path, monkeypatch):
    async def scenario():
        repositories, run_id = await _planning_lineage(tmp_path)
        service = MangaPageArtStageService(
            repositories,
            media_root=tmp_path,
            image_caller=_echo_skeleton_caller(),
            vision_qa=_good_vision(2),
        )
        first = await service.run_page_art_stage(
            project_id=PROJECT_ID, run_id=run_id, image_budget_usd=0.20
        )
        artifacts = await repositories.list_artifacts(run_id, accepted_only=True)
        first_art = {
            artifact.content["page_index"]: artifact
            for artifact in artifacts
            if artifact.kind == "page_art"
        }
        assert all(
            artifact.supersedes_artifact_id is None for artifact in first_art.values()
        )

        # A gate-policy change re-keys the stage (the live v1->v2 shape from
        # Session 5); the regenerated art must chain lineage.
        monkeypatch.setattr(stage_module, "GATE_POLICY_VERSION", "page-art-gates.vtest")
        second = await service.run_page_art_stage(
            project_id=PROJECT_ID, run_id=run_id, image_budget_usd=0.20
        )
        assert second.stage_run_id != first.stage_run_id
        artifacts = await repositories.list_artifacts(run_id, accepted_only=True)
        second_art = [
            artifact
            for artifact in artifacts
            if artifact.kind == "page_art"
            and artifact.stage_run_id == second.stage_run_id
        ]
        assert len(second_art) == 2
        for artifact in second_art:
            page_index = artifact.content["page_index"]
            assert (
                artifact.supersedes_artifact_id
                == first_art[page_index].artifact_id
            )

    run(scenario())


@pytest.mark.skipif(
    __import__("shutil").which("tesseract") is None,
    reason="tesseract binary unavailable",
)
def test_compose_only_stage_reletters_at_zero_image_cost(tmp_path, monkeypatch):
    async def scenario():
        repositories, run_id = await _planning_lineage(tmp_path)
        service = MangaPageArtStageService(
            repositories,
            media_root=tmp_path,
            image_caller=_echo_skeleton_caller(),
            vision_qa=_good_vision(2),
        )
        await service.run_page_art_stage(
            project_id=PROJECT_ID, run_id=run_id, image_budget_usd=0.20
        )
        artifacts = await repositories.list_artifacts(run_id, accepted_only=True)
        receipts_before = [a for a in artifacts if a.kind == "provider_receipt"]
        first_composed = {
            artifact.content["page_index"]: artifact
            for artifact in artifacts
            if artifact.kind == "composed_page"
        }

        # The real use case: artifacts composed under an OLDER composition
        # version get re-lettered by newer code. Same version + same pixels
        # deduplicate to the same immutable artifact, so simulate the
        # upgrade by bumping the version the stage stamps.
        monkeypatch.setattr(
            stage_module, "COMPOSITION_VERSION", "manga-composition.vtest"
        )
        recomposed = await service.recompose_pages(
            project_id=PROJECT_ID, run_id=run_id
        )
        assert len(recomposed) == 2
        for artifact in recomposed:
            page_index = artifact.content["page_index"]
            assert artifact.content["has_art"] is True
            assert artifact.content["composition_version"] == "manga-composition.vtest"
            assert (
                artifact.supersedes_artifact_id
                == first_composed[page_index].artifact_id
            )
            assert artifact.stage_run_id.startswith("stage_manga_page_compose_")

        # ZERO image cost: not a single new provider receipt.
        artifacts = await repositories.list_artifacts(run_id, accepted_only=True)
        receipts_after = [a for a in artifacts if a.kind == "provider_receipt"]
        assert len(receipts_after) == len(receipts_before)

        # Idempotent: the succeeded compose stage is reused, no new rows.
        again = await service.recompose_pages(project_id=PROJECT_ID, run_id=run_id)
        assert {a.artifact_id for a in again} == {a.artifact_id for a in recomposed}
        artifacts = await repositories.list_artifacts(run_id, accepted_only=True)
        composed_rows = [a for a in artifacts if a.kind == "composed_page"]
        assert len(composed_rows) == 4  # 2 original + 2 recomposed, no more

    run(scenario())
