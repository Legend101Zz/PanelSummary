from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, cast

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.contracts.manga import RenderedPage
from app.contracts.reel import ReelSpec
from app.contracts.reel_delivery import ReelPlayerPayload, ReelSeries, SeriesProgressUpdate
from app.contracts.registry import CONTRACT_MODELS
from scripts.export_contracts import DEFAULT_OUTPUT, export_contracts


FIXTURE_ROOT = Path(__file__).resolve().parents[2] / "packages" / "fixtures"


def fixture_manifest() -> dict[str, Any]:
    return cast(
        dict[str, Any],
        json.loads((FIXTURE_ROOT / "manifest.json").read_text(encoding="utf-8")),
    )


@pytest.mark.parametrize("entry", fixture_manifest()["fixtures"])
def test_canonical_fixture_validates_in_python(entry: dict[str, Any]) -> None:
    payload = (FIXTURE_ROOT / entry["path"]).read_text(encoding="utf-8")
    model = CONTRACT_MODELS[entry["schema"]]

    restored = model.model_validate_json(payload)

    assert model.model_validate(restored.model_dump(mode="json")) == restored


def test_fixture_manifest_matches_registry() -> None:
    fixture_names = {entry["schema"] for entry in fixture_manifest()["fixtures"]}
    assert fixture_names == set(CONTRACT_MODELS)


def test_exported_schemas_are_deterministic() -> None:
    assert export_contracts(DEFAULT_OUTPUT, check=True) == []


def test_contract_json_uses_snake_case_and_rejects_unknown_fields() -> None:
    schema = CONTRACT_MODELS["agent_goal.v1"].model_json_schema()
    properties = schema["properties"]

    assert "goal_id" in properties
    assert "goalId" not in properties
    assert schema["additionalProperties"] is False


def test_rendered_page_rejects_artifact_layer_drift() -> None:
    payload = json.loads(
        (FIXTURE_ROOT / "canonical/rendered_page.v1.json").read_text(encoding="utf-8")
    )
    payload["panel_artifacts"]["unknown_panel"] = payload["panel_artifacts"]["panel_001"]

    with pytest.raises(ValidationError, match="panel_artifacts must cover"):
        RenderedPage.model_validate(payload)


def test_reel_spec_rejects_unknown_components_and_urls() -> None:
    payload = json.loads(
        (FIXTURE_ROOT / "canonical/reel_spec.v1.json").read_text(encoding="utf-8")
    )
    payload["scenes"][0]["asset_id"] = "https://attacker.invalid/panel.png"

    with pytest.raises(ValidationError):
        ReelSpec.model_validate(payload)


def test_reel_spec_rejects_timeline_drift() -> None:
    payload = json.loads(
        (FIXTURE_ROOT / "canonical/reel_spec.v1.json").read_text(encoding="utf-8")
    )
    payload["format"]["duration_frames"] = 181

    with pytest.raises(ValidationError, match="scene durations"):
        ReelSpec.model_validate(payload)


def test_reel_series_rejects_non_contiguous_sequences() -> None:
    payload = json.loads(
        (FIXTURE_ROOT / "canonical/reel_series.v1.json").read_text(encoding="utf-8")
    )
    payload["reels"][0]["sequence"] = 1

    with pytest.raises(ValidationError, match="contiguous from zero"):
        ReelSeries.model_validate(payload)


def test_reel_player_rejects_unresolved_assets() -> None:
    payload = json.loads(
        (FIXTURE_ROOT / "canonical/reel_player_payload.v1.json").read_text(encoding="utf-8")
    )
    payload["assets"].pop("asset_music_tension_001")

    with pytest.raises(ValidationError, match="must be resolved"):
        ReelPlayerPayload.model_validate(payload)


def test_reel_player_rejects_panel_asset_drift() -> None:
    payload = json.loads(
        (FIXTURE_ROOT / "canonical/reel_player_payload.v1.json").read_text(encoding="utf-8")
    )
    payload["reel_spec"]["scenes"][0]["asset_id"] = "asset_music_tension_001"

    with pytest.raises(ValidationError, match="must belong"):
        ReelPlayerPayload.model_validate(payload)


def test_reel_player_only_requires_the_primary_panel_asset() -> None:
    payload = json.loads(
        (FIXTURE_ROOT / "canonical/reel_player_payload.v1.json").read_text(encoding="utf-8")
    )
    payload["manga_manifest"]["panels"][0]["visual_asset_ids"].append(
        "asset_unused_secondary_crop"
    )

    ReelPlayerPayload.model_validate(payload)


def test_reel_player_rejects_overlapping_captions() -> None:
    payload = json.loads(
        (FIXTURE_ROOT / "canonical/reel_player_payload.v1.json").read_text(encoding="utf-8")
    )
    payload["captions"][1]["start_frame"] = 89

    with pytest.raises(ValidationError, match="ordered and non-overlapping"):
        ReelPlayerPayload.model_validate(payload)


def test_series_progress_update_requires_last_reel_to_be_viewed() -> None:
    payload = json.loads(
        (FIXTURE_ROOT / "canonical/series_progress_update.v1.json").read_text(encoding="utf-8")
    )
    payload["viewed_reel_ids"] = []

    with pytest.raises(ValidationError, match="must appear"):
        SeriesProgressUpdate.model_validate(payload)
