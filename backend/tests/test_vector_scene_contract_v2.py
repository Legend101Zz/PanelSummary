"""Vector scene DSL contract tests."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import (
    PanelPurpose,
    ShotType,
    StoryboardPanel,
    VectorScene,
)


def _panel(**overrides) -> StoryboardPanel:
    data = {
        "panel_id": "p1",
        "scene_id": "s1",
        "purpose": PanelPurpose.SETUP,
        "shot_type": ShotType.WIDE,
        "composition": "wide room with a low horizon",
        "action": "Kai enters the room.",
    }
    data.update(overrides)
    return StoryboardPanel(**data)


def test_storyboard_panel_vector_scene_is_additive_and_round_trips():
    panel = _panel(
        vector_scene={
            "background": {"fill": "#fff8e7", "gradient_to": "#eadfca"},
            "tone": {"pattern": "dots", "opacity": 0.22, "scale": 5},
            "linework": [
                {"kind": "horizon", "x1": 5, "y1": 62, "x2": 95, "y2": 58, "stroke_width": 1.8}
            ],
            "silhouettes": [
                {"x": 50, "y": 78, "scale": 1.1, "pose": "standing", "opacity": 0.42}
            ],
            "sfx": [
                {"text": "SHH", "x": 70, "y": 24, "size": 16, "rotation": -8, "stroke": "#1f1f29"}
            ],
        }
    )

    assert panel.vector_scene is not None
    assert panel.vector_scene.tone.pattern == "dots"
    assert panel.vector_scene.linework[0].kind == "horizon"

    restored = StoryboardPanel.model_validate(panel.model_dump(mode="json"))

    assert restored.vector_scene == panel.vector_scene


def test_storyboard_panel_legacy_payload_defaults_vector_scene_to_none():
    panel = _panel()

    assert panel.vector_scene is None


def test_vector_scene_requires_visible_ink():
    scene = VectorScene()

    assert scene.has_visible_ink is False
