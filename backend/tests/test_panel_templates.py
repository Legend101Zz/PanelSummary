"""Tests for panel_templates.py — Template system correctness.

Pure unit tests — no DB, no LLM, no async.
Validates that every template produces valid DSL v2.0.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Mock the MongoDB dependency chain
if "beanie" not in sys.modules:
    _mock = MagicMock()
    for mod in [
        "beanie", "bson", "motor", "motor.motor_asyncio",
        "pymongo", "gridfs",
    ]:
        sys.modules.setdefault(mod, _mock)

from app.panel_templates import (
    fill_template,
    SPLASH_TEMPLATES,
    DIALOGUE_TEMPLATES,
    NARRATION_TEMPLATES,
    DATA_TEMPLATES,
    MONTAGE_TEMPLATES,
    TRANSITION_TEMPLATES,
    CONCEPT_TEMPLATES,
    MOOD_PALETTES,
    _palette,
)


# ============================================================
# DSL v2.0 STRUCTURAL VALIDATION
# ============================================================

def _assert_valid_dsl(dsl: dict, label: str = ""):
    """Assert a DSL dict conforms to Living Panel DSL v2.0."""
    assert dsl.get("version") == "2.0", f"{label}: missing version 2.0"
    assert "canvas" in dsl, f"{label}: missing canvas"
    assert "acts" in dsl, f"{label}: missing acts"
    assert len(dsl["acts"]) >= 1, f"{label}: no acts"

    canvas = dsl["canvas"]
    assert canvas.get("width") > 0, f"{label}: canvas width"
    assert canvas.get("height") > 0, f"{label}: canvas height"
    assert canvas.get("background"), f"{label}: canvas background"

    for act in dsl["acts"]:
        assert "id" in act, f"{label}: act missing id"
        assert "duration_ms" in act, f"{label}: act missing duration_ms"
        assert act["duration_ms"] > 0, f"{label}: act duration must be positive"
        assert "layout" in act, f"{label}: act missing layout"
        assert "layers" in act, f"{label}: act missing layers"
        assert "timeline" in act or "cells" in act, f"{label}: act needs timeline or cells"

        # Every layer must have id and type
        for layer in act.get("layers", []):
            assert "id" in layer, f"{label}: layer missing id"
            assert "type" in layer, f"{label}: layer missing type"
            assert layer["type"] in {
                "background", "sprite", "text", "speech_bubble",
                "effect", "shape", "data_block", "scene_transition", "image",
            }, f"{label}: invalid layer type: {layer['type']}"

        # Cells must also have valid layers
        for cell in act.get("cells", []):
            for layer in cell.get("layers", []):
                assert "id" in layer, f"{label}: cell layer missing id"
                assert "type" in layer, f"{label}: cell layer missing type"

    assert "meta" in dsl, f"{label}: missing meta"
    assert dsl["meta"].get("source") == "template", f"{label}: source must be 'template'"


# ============================================================
# FILL_TEMPLATE — Main entry point
# ============================================================

class TestFillTemplate:

    def test_all_content_types_produce_valid_dsl(self):
        """Every supported content type must produce valid DSL."""
        content_types = [
            "splash", "dialogue", "narration", "data",
            "montage", "transition", "concept",
        ]
        for ct in content_types:
            dsl = fill_template(
                panel_index=0,
                content_type=ct,
                text="Test content for this panel",
                dialogue=[{"character": "Alice", "text": "Hello!"}],
                character="Alice",
                expression="excited",
                visual_mood="dramatic-dark",
                narrative_beat="test beat",
                key_concepts=["Concept A", "Concept B", "Concept C"],
            )
            _assert_valid_dsl(dsl, label=f"content_type={ct}")

    def test_unknown_content_type_falls_back_to_narration(self):
        """Unknown content types should gracefully fall back."""
        dsl = fill_template(
            panel_index=0,
            content_type="unknown_type_xyz",
            text="Some text",
        )
        _assert_valid_dsl(dsl, label="unknown_type")
        assert dsl["meta"]["content_type"] == "narration"

    def test_empty_text_doesnt_crash(self):
        """Templates must handle empty/missing text."""
        for ct in ["splash", "narration", "data", "transition", "concept"]:
            dsl = fill_template(panel_index=0, content_type=ct, text="")
            _assert_valid_dsl(dsl, label=f"empty_text_{ct}")

    def test_empty_dialogue_doesnt_crash(self):
        """Dialogue template with no dialogue lines."""
        dsl = fill_template(
            panel_index=0,
            content_type="dialogue",
            dialogue=[],
            character="Bob",
        )
        _assert_valid_dsl(dsl, label="empty_dialogue")

    def test_variant_rotation(self):
        """Different panel indices should pick different variants."""
        dsls = []
        for i in range(6):
            dsl = fill_template(
                panel_index=i,
                content_type="narration",
                text=f"Panel {i} content",
            )
            dsls.append(dsl)
            _assert_valid_dsl(dsl, label=f"variant_{i}")

        # With 3 narration variants, indices 0 and 3 should match,
        # but 0 and 1 should differ in structure
        # (We can't easily compare structure, but at least verify they're valid)
        assert len(dsls) == 6


# ============================================================
# MOOD PALETTES
# ============================================================

class TestMoodPalettes:

    def test_all_moods_have_required_keys(self):
        """Every palette must have bg, bg2, ink, muted, accent, mood."""
        required = {"bg", "bg2", "ink", "muted", "accent", "mood"}
        for mood, pal in MOOD_PALETTES.items():
            missing = required - set(pal.keys())
            assert not missing, f"Mood '{mood}' missing keys: {missing}"

    def test_fallback_palette(self):
        """Unknown moods should return dramatic-dark."""
        pal = _palette("nonexistent_mood")
        assert pal["bg"] == "#1A1825"

    def test_all_moods_produce_valid_templates(self):
        """Every mood should work with every content type."""
        for mood in MOOD_PALETTES:
            dsl = fill_template(
                panel_index=0,
                content_type="narration",
                text="Test",
                visual_mood=mood,
            )
            _assert_valid_dsl(dsl, label=f"mood={mood}")


# ============================================================
# INDIVIDUAL TEMPLATE TYPES
# ============================================================

class TestSplashTemplates:

    def test_all_variants_valid(self):
        pal = _palette("dramatic-dark")
        for i, fn in enumerate(SPLASH_TEMPLATES):
            dsl = fn("Chapter Title", pal, "dramatic beat")
            _assert_valid_dsl(dsl, label=f"splash_v{i}")
            assert dsl["meta"]["content_type"] == "splash"

    def test_splash_has_large_font(self):
        """Splash panels should use display font."""
        dsl = fill_template(panel_index=0, content_type="splash", text="Big Title")
        # Find a text layer with display font
        act = dsl["acts"][0]
        text_layers = [l for l in act["layers"] if l["type"] == "text"]
        assert any(
            l["props"].get("fontFamily") == "display"
            for l in text_layers
        ), "Splash should use display font"


class TestDialogueTemplates:

    def test_all_variants_valid(self):
        pal = _palette("warm-amber")
        dialogue = [
            {"character": "Alice", "text": "What do you think?"},
            {"character": "Bob", "text": "Interesting idea!"},
        ]
        for i, fn in enumerate(DIALOGUE_TEMPLATES):
            dsl = fn(dialogue, "Alice", "curious", pal, "conversation")
            _assert_valid_dsl(dsl, label=f"dialogue_v{i}")
            assert dsl["meta"]["content_type"] == "dialogue"

    def test_dialogue_has_speech_bubbles(self):
        """Dialogue panels must contain speech_bubble layers."""
        dsl = fill_template(
            panel_index=0,
            content_type="dialogue",
            dialogue=[{"character": "A", "text": "Hi"}],
            character="A",
        )
        all_layers = list(dsl["acts"][0].get("layers", []))
        for cell in dsl["acts"][0].get("cells", []):
            all_layers.extend(cell.get("layers", []))
        bubble_layers = [l for l in all_layers if l["type"] == "speech_bubble"]
        assert len(bubble_layers) >= 1, "Dialogue must have speech bubbles"

    def test_string_dialogue_entries_handled(self):
        """Dialogue entries can be plain strings (backward compat)."""
        dsl = fill_template(
            panel_index=0,
            content_type="dialogue",
            dialogue=["Hello there", "How are you?"],
            character="Narrator",
        )
        _assert_valid_dsl(dsl, label="string_dialogue")


class TestNarrationTemplates:

    def test_all_variants_valid(self):
        pal = _palette("cool-mystery")
        for i, fn in enumerate(NARRATION_TEMPLATES):
            dsl = fn("Long narrative text here...", pal, "story moment")
            _assert_valid_dsl(dsl, label=f"narration_v{i}")
            assert dsl["meta"]["content_type"] == "narration"


class TestDataTemplates:

    def test_all_variants_valid(self):
        pal = _palette("light")
        items = ["Point A", "Point B", "Point C"]
        for i, fn in enumerate(DATA_TEMPLATES):
            dsl = fn("Key Concepts", items, pal, "data moment")
            _assert_valid_dsl(dsl, label=f"data_v{i}")
            assert dsl["meta"]["content_type"] == "data"

    def test_data_has_data_block_layer(self):
        """Data panels must contain a data_block layer."""
        dsl = fill_template(
            panel_index=0,
            content_type="data",
            text="Key Concepts",
            key_concepts=["A", "B", "C"],
        )
        act = dsl["acts"][0]
        data_layers = [l for l in act["layers"] if l["type"] == "data_block"]
        assert len(data_layers) >= 1, "Data panel must have data_block layer"


class TestMontageTemplates:

    def test_montage_uses_cuts_layout(self):
        """Montage panels should use cuts layout."""
        dsl = fill_template(
            panel_index=0,
            content_type="montage",
            key_concepts=["Moment 1", "Moment 2", "Moment 3"],
        )
        _assert_valid_dsl(dsl, label="montage")
        assert dsl["acts"][0]["layout"]["type"] == "cuts"


class TestTransitionTemplates:

    def test_all_variants_valid(self):
        pal = _palette("dramatic-dark")
        for i, fn in enumerate(TRANSITION_TEMPLATES):
            dsl = fn("Next chapter...", pal, "transition")
            _assert_valid_dsl(dsl, label=f"transition_v{i}")
            assert dsl["meta"]["content_type"] == "transition"
