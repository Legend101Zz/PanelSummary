"""Tests for Tier 2 DSL enforcement: content-type safety nets.

Tests that _enforce_content_requirements() injects missing elements
when the LLM forgets to generate them.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Mock the MongoDB/ODM dependency chain before any app imports
if "beanie" not in sys.modules:
    _mock = MagicMock()
    for mod in [
        "beanie", "bson", "motor", "motor.motor_asyncio",
        "pymongo", "gridfs",
    ]:
        sys.modules.setdefault(mod, _mock)

from app.agents.planner import PanelAssignment
from app.agents.dsl_generator import _enforce_content_requirements


def _assignment(
    content_type: str = "narration",
    layout_hint: str = "full",
    text: str = "Hello world",
    dialogue: list = None,
    character: str = None,
    expression: str = "neutral",
) -> PanelAssignment:
    return PanelAssignment(
        panel_id="test-0", chapter_index=0, page_index=0, panel_index=0,
        content_type=content_type,
        narrative_beat="Test beat",
        text_content=text,
        dialogue=dialogue or [],
        character=character,
        expression=expression,
        visual_mood="dramatic-dark",
        layout_hint=layout_hint,
        image_budget=False,
        creative_direction="Test",
        dependencies=[],
    )


def _minimal_dsl(layout_type="full", layers=None, cells=None):
    """A minimal valid DSL with one act."""
    return {
        "version": "2.0",
        "canvas": {"width": 800, "height": 600},
        "acts": [{
            "id": "act1",
            "duration_ms": 4000,
            "layout": {"type": layout_type},
            "layers": layers or [
                {"id": "bg", "type": "background", "opacity": 1,
                 "props": {"gradient": ["#F2E8D5", "#EDE0CC"]}},
                {"id": "text1", "type": "text", "x": "10%", "y": "40%",
                 "opacity": 1, "props": {"content": "Hello"}},
            ],
            "cells": cells or [],
            "timeline": [],
        }],
        "meta": {},
    }


# ============================================================
# 2C: Dialogue panels get sprites + bubbles injected
# ============================================================

class TestDialogueEnforcement:

    def test_missing_sprites_injected(self):
        """Dialogue panel with no sprites gets them added."""
        assignment = _assignment(
            content_type="dialogue",
            dialogue=[
                {"character": "Alice", "text": "What's up?"},
                {"character": "Bob", "text": "Not much."},
            ],
        )
        dsl = _minimal_dsl()
        result = _enforce_content_requirements(dsl, assignment)

        act_layers = result["acts"][0]["layers"]
        sprite_layers = [l for l in act_layers if l["type"] == "sprite"]
        assert len(sprite_layers) == 2
        assert sprite_layers[0]["props"]["character"] == "Alice"
        assert sprite_layers[1]["props"]["character"] == "Bob"

    def test_missing_bubbles_injected(self):
        """Dialogue panel with no speech bubbles gets them added."""
        assignment = _assignment(
            content_type="dialogue",
            dialogue=[
                {"character": "Alice", "text": "Hello!"},
            ],
        )
        dsl = _minimal_dsl()
        result = _enforce_content_requirements(dsl, assignment)

        act_layers = result["acts"][0]["layers"]
        bubble_layers = [l for l in act_layers if l["type"] == "speech_bubble"]
        assert len(bubble_layers) >= 1
        assert bubble_layers[0]["props"]["text"] == "Hello!"

    def test_existing_sprites_not_duplicated(self):
        """If sprites already exist, don't add more."""
        assignment = _assignment(
            content_type="dialogue",
            dialogue=[{"character": "Alice", "text": "Hi!"}],
        )
        dsl = _minimal_dsl(layers=[
            {"id": "bg", "type": "background", "opacity": 1, "props": {}},
            {"id": "char", "type": "sprite", "x": "50%", "y": "60%",
             "opacity": 1, "props": {"character": "Alice", "expression": "neutral", "size": 56}},
        ])
        result = _enforce_content_requirements(dsl, assignment)

        act_layers = result["acts"][0]["layers"]
        sprite_layers = [l for l in act_layers if l["type"] == "sprite"]
        assert len(sprite_layers) == 1  # no duplicates


# ============================================================
# 2C: Splash panels get effects injected
# ============================================================

class TestSplashEnforcement:

    def test_missing_effect_injected(self):
        """Splash panel with no effects gets speed_lines."""
        assignment = _assignment(content_type="splash")
        dsl = _minimal_dsl()
        result = _enforce_content_requirements(dsl, assignment)

        act_layers = result["acts"][0]["layers"]
        effect_layers = [l for l in act_layers if l["type"] == "effect"]
        assert len(effect_layers) >= 1
        assert effect_layers[0]["props"]["effect"] == "speed_lines"

    def test_existing_effect_not_duplicated(self):
        """If effects already exist, don't add more."""
        assignment = _assignment(content_type="splash")
        dsl = _minimal_dsl(layers=[
            {"id": "bg", "type": "background", "opacity": 1, "props": {}},
            {"id": "fx", "type": "effect", "opacity": 1,
             "props": {"effect": "impact_burst", "color": "#E8191A"}},
        ])
        result = _enforce_content_requirements(dsl, assignment)

        act_layers = result["acts"][0]["layers"]
        effect_layers = [l for l in act_layers if l["type"] == "effect"]
        assert len(effect_layers) == 1  # no duplicates


# ============================================================
# 2C: Data panels get data_block injected
# ============================================================

class TestDataEnforcement:

    def test_missing_data_block_injected(self):
        """Data panel with no data_block gets one from text_content."""
        assignment = _assignment(
            content_type="data",
            text="Revenue Growth | Market Share | Team Size",
        )
        dsl = _minimal_dsl()
        result = _enforce_content_requirements(dsl, assignment)

        act_layers = result["acts"][0]["layers"]
        data_layers = [l for l in act_layers if l["type"] == "data_block"]
        assert len(data_layers) >= 1
        items = data_layers[0]["props"]["items"]
        assert len(items) == 3
        assert items[0]["label"] == "Revenue Growth"


# ============================================================
# 2C: Layout hint enforcement
# ============================================================

class TestLayoutEnforcement:

    def test_cuts_hint_upgrades_full(self):
        """If planner said 'cuts' but LLM used 'full', upgrade for dialogue."""
        assignment = _assignment(
            content_type="dialogue",
            layout_hint="cuts",
            dialogue=[
                {"character": "A", "text": "Line 1"},
                {"character": "B", "text": "Line 2"},
            ],
        )
        # Start with sprites + bubbles (enough layers to split)
        dsl = _minimal_dsl(layers=[
            {"id": "bg", "type": "background", "opacity": 1, "props": {}},
            {"id": "s1", "type": "sprite", "x": "25%", "y": "65%",
             "opacity": 1, "props": {"character": "A"}},
            {"id": "b1", "type": "speech_bubble", "x": "10%", "y": "10%",
             "opacity": 1, "props": {"text": "Line 1", "character": "A"}},
            {"id": "s2", "type": "sprite", "x": "70%", "y": "62%",
             "opacity": 1, "props": {"character": "B"}},
            {"id": "b2", "type": "speech_bubble", "x": "50%", "y": "10%",
             "opacity": 1, "props": {"text": "Line 2", "character": "B"}},
        ])
        result = _enforce_content_requirements(dsl, assignment)

        act = result["acts"][0]
        assert act["layout"]["type"] == "cuts"
        assert len(act.get("cells", [])) == 2

    def test_no_acts_returns_unchanged(self):
        """If DSL has no acts, enforcement is a no-op."""
        dsl = {"version": "2.0", "acts": []}
        assignment = _assignment(content_type="splash")
        result = _enforce_content_requirements(dsl, assignment)
        assert result == dsl
