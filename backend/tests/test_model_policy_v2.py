"""Session 5 Goal B: speed/quality ModelPolicy modes (issue #3).

Owner policy 2026-08-08 (standing): mode "speed" = MiniMax-M2.7-highspeed,
mode "quality" = MiniMax-M3, DEFAULT quality; per-purpose defaults are
config-not-code (direction=quality, page-writing/thumbnail=speed per the
Session 4 bake-off confirmation, vision=M3 always); receipts must prove the
mode; no silent default switches.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import pytest

from app.config import Settings
from app.services.errors import ArtifactValidationError
from app.services.manga_page_planner import MangaPagePlannerService
from app.services.model_policy import (
    DEFAULT_MODE,
    MODES,
    mode_for_model,
    receipt_mode_fields,
    resolve_model_policy,
)
from test_manga_page_planner_v2 import (
    PROJECT_ID,
    PlanningFakeWorker,
    _direction_run,
    _seeded,
)


def test_owner_mode_table_is_exact():
    assert MODES == {
        "speed": "MiniMax-M2.7-highspeed",
        "quality": "MiniMax-M3",
    }
    assert DEFAULT_MODE == "quality"


def test_per_purpose_config_defaults_match_owner_policy():
    settings = Settings(_env_file=None)
    direction = resolve_model_policy("manga_direction", settings=settings)
    assert (direction.mode, direction.model) == ("quality", "MiniMax-M3")
    assert direction.source == "config-default"
    page_writing = resolve_model_policy("manga_page_writing", settings=settings)
    assert (page_writing.mode, page_writing.model) == ("speed", "MiniMax-M2.7-highspeed")
    thumbnail = resolve_model_policy("manga_thumbnail", settings=settings)
    assert (thumbnail.mode, thumbnail.model) == ("speed", "MiniMax-M2.7-highspeed")
    assert all(p.provider == "minimax" for p in (direction, page_writing, thumbnail))


def test_config_override_changes_a_purpose_default_without_code():
    settings = Settings(_env_file=None, agent_model_mode_direction="speed")
    resolved = resolve_model_policy("manga_direction", settings=settings)
    assert resolved.mode == "speed"
    assert resolved.model == "MiniMax-M2.7-highspeed"
    assert resolved.source == "config-default"


def test_unknown_purpose_falls_back_to_quality_never_speed():
    resolved = resolve_model_policy("some_future_purpose", settings=Settings(_env_file=None))
    assert resolved.mode == "quality"
    assert resolved.model == "MiniMax-M3"


def test_explicit_override_is_receipted_as_override():
    resolved = resolve_model_policy(
        "manga_direction", override_mode="speed", settings=Settings(_env_file=None)
    )
    assert resolved.mode == "speed"
    assert resolved.source == "explicit-override"


def test_vision_is_locked_to_m3_and_refuses_speed():
    resolved = resolve_model_policy("manga_vision_qa", settings=Settings(_env_file=None))
    assert resolved.mode == "quality"
    assert resolved.model == "MiniMax-M3"
    assert resolved.source == "locked"
    with pytest.raises(ArtifactValidationError, match="locked to mode"):
        resolve_model_policy("manga_vision_qa", override_mode="speed")
    # Even a config attempt cannot move vision: it has no config field.
    settings = Settings(_env_file=None, agent_model_mode_direction="speed")
    assert resolve_model_policy("manga_vision_qa", settings=settings).model == "MiniMax-M3"


def test_unknown_modes_fail_loud():
    with pytest.raises(ArtifactValidationError, match="Unknown model mode"):
        resolve_model_policy("manga_direction", override_mode="turbo")
    with pytest.raises(ArtifactValidationError, match="is unknown"):
        resolve_model_policy(
            "manga_direction",
            settings=Settings(_env_file=None, agent_model_mode_direction="turbo"),
        )


def test_mode_is_always_derivable_from_the_model_id():
    assert mode_for_model("MiniMax-M3") == "quality"
    assert mode_for_model("MiniMax-M2.7-highspeed") == "speed"
    assert mode_for_model("gpt-oss-120b") is None
    fields = receipt_mode_fields("MiniMax-M2.7-highspeed", explicit_override=False)
    assert fields == {"model_mode": "speed", "model_mode_source": "config-default"}
    fields = receipt_mode_fields("MiniMax-M3", explicit_override=True)
    assert fields == {"model_mode": "quality", "model_mode_source": "explicit-override"}


# ---------------------------------------------------------------------------
# Receipts prove the mode at the driver seam
# ---------------------------------------------------------------------------


def run(coro):
    return asyncio.run(coro)


def test_planning_receipts_prove_the_speed_mode(tmp_path):
    async def scenario():
        repositories, scope_id = await _seeded()
        run_id = await _direction_run(repositories, scope_id)
        planner = MangaPagePlannerService(
            repositories, PlanningFakeWorker(repositories, tmp_path)
        )
        outcome = await planner.run_page_writing_goal(
            project_id=PROJECT_ID, run_id=run_id
        )
        receipt = outcome.artifact.model_receipt
        assert receipt["model"] == "MiniMax-M2.7-highspeed"
        assert receipt["model_mode"] == "speed"
        assert receipt["model_mode_source"] == "config-default"

    run(scenario())


def test_ab_override_receipt_proves_quality_mode_and_provenance(tmp_path):
    async def scenario():
        repositories, scope_id = await _seeded()
        run_id = await _direction_run(repositories, scope_id)
        worker = PlanningFakeWorker(repositories, tmp_path, model="MiniMax-M3")
        planner = MangaPagePlannerService(
            repositories, worker, required_model="MiniMax-M3"
        )
        outcome = await planner.run_page_writing_goal(
            project_id=PROJECT_ID, run_id=run_id
        )
        receipt = outcome.artifact.model_receipt
        assert receipt["model"] == "MiniMax-M3"
        assert receipt["model_mode"] == "quality"
        assert receipt["model_mode_source"] == "explicit-override"

    run(scenario())
