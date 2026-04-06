"""Tests for DSL fixer — ensure fix_common_dsl_issues handles edge cases."""

import pytest
from app.generate_living_panels import (
    fix_common_dsl_issues, validate_living_panel_dsl,
    LAYER_TYPE_ALIASES,
    _contrast_ratio, _fix_text_color, _hex_to_rgb,
)


class TestDSLFixer:

    def test_adds_version_and_canvas(self):
        dsl = {"acts": [{"id": "a", "duration_ms": 3000, "layout": {"type": "full"}, "layers": []}]}
        fixed = fix_common_dsl_issues(dsl)
        assert fixed["version"] == "2.0"
        assert fixed["canvas"]["width"] == 800
        assert fixed["canvas"]["height"] == 600

    def test_adds_transition_in_defaults(self):
        dsl = {
            "acts": [
                {"id": "a", "duration_ms": 3000, "layout": {"type": "full"}, "layers": []},
                {"id": "b", "duration_ms": 3000, "layout": {"type": "full"}, "layers": []},
            ]
        }
        fixed = fix_common_dsl_issues(dsl)
        assert fixed["acts"][0]["transition_in"]["type"] == "fade"
        assert fixed["acts"][1]["transition_in"]["type"] == "fade"

    def test_fixes_invalid_transition_type(self):
        dsl = {
            "acts": [{
                "id": "a", "duration_ms": 3000,
                "layout": {"type": "full"}, "layers": [],
                "transition_in": {"type": "explode", "duration_ms": 500},
            }]
        }
        fixed = fix_common_dsl_issues(dsl)
        assert fixed["acts"][0]["transition_in"]["type"] == "fade"

    def test_adds_background_layer_light_mood(self):
        dsl = {
            "canvas": {"mood": "light"},
            "acts": [{
                "id": "a", "duration_ms": 3000,
                "layout": {"type": "full"},
                "layers": [
                    {"id": "text1", "type": "text", "props": {"content": "Hello"}},
                ],
            }]
        }
        fixed = fix_common_dsl_issues(dsl)
        bg = fixed["acts"][0]["layers"][0]
        assert bg["type"] == "background"
        assert "#F2E8D5" in bg["props"]["gradient"]

    def test_adds_background_layer_dark_mood(self):
        dsl = {
            "canvas": {"mood": "dark"},
            "acts": [{
                "id": "a", "duration_ms": 3000,
                "layout": {"type": "full"},
                "layers": [{"id": "t", "type": "text", "props": {}}],
            }]
        }
        fixed = fix_common_dsl_issues(dsl)
        bg = fixed["acts"][0]["layers"][0]
        assert "#1A1825" in bg["props"]["gradient"]

    def test_preserves_existing_background(self):
        dsl = {
            "acts": [{
                "id": "a", "duration_ms": 3000,
                "layout": {"type": "full"},
                "layers": [
                    {"id": "bg", "type": "background", "opacity": 1, "props": {"gradient": ["#000", "#111"]}},
                ],
            }]
        }
        fixed = fix_common_dsl_issues(dsl)
        # Should NOT add another background
        bg_count = sum(1 for l in fixed["acts"][0]["layers"] if l["type"] == "background")
        assert bg_count == 1

    def test_fixes_invalid_layout_type(self):
        dsl = {
            "acts": [{
                "id": "a", "duration_ms": 3000,
                "layout": {"type": "manga_explosive"},
                "layers": [],
            }]
        }
        fixed = fix_common_dsl_issues(dsl)
        assert fixed["acts"][0]["layout"]["type"] == "full"

    def test_normalizes_cell_positions(self):
        dsl = {
            "acts": [{
                "id": "a", "duration_ms": 3000,
                "layout": {"type": "cuts", "cuts": [{"direction": "h", "position": 0.5}]},
                "layers": [{"id": "bg", "type": "background", "opacity": 1, "props": {}}],
                "cells": [
                    {"id": "c0", "position": 0, "layers": []},  # int, not str
                    {"id": "c1", "position": 1, "layers": []},
                ],
            }]
        }
        fixed = fix_common_dsl_issues(dsl)
        assert fixed["acts"][0]["cells"][0]["position"] == "0"
        assert fixed["acts"][0]["cells"][1]["position"] == "1"

    def test_fixes_missing_opacity(self):
        dsl = {
            "acts": [{
                "id": "a", "duration_ms": 3000,
                "layout": {"type": "full"},
                "layers": [
                    {"id": "bg", "type": "background", "props": {}},
                    {"id": "txt", "type": "text", "props": {}},
                ],
            }]
        }
        fixed = fix_common_dsl_issues(dsl)
        assert fixed["acts"][0]["layers"][0]["opacity"] == 1  # background default
        assert fixed["acts"][0]["layers"][1]["opacity"] == 0  # other default

    def test_fixes_timeline_missing_at(self):
        dsl = {
            "acts": [{
                "id": "a", "duration_ms": 3000,
                "layout": {"type": "full"},
                "layers": [
                    {"id": "bg", "type": "background", "opacity": 1, "props": {}},
                    {"id": "txt", "type": "text", "opacity": 0, "props": {}},
                ],
                "timeline": [
                    {"target": "txt", "animate": {"opacity": [0, 1]}},  # missing 'at'
                ],
            }]
        }
        fixed = fix_common_dsl_issues(dsl)
        assert fixed["acts"][0]["timeline"][0]["at"] == 0

    def test_converts_v1_to_v2(self):
        dsl = {
            "version": "1.0",
            "layers": [
                {"id": "bg", "type": "background", "opacity": 1, "props": {}},
            ],
            "timeline": [
                {"at": 100, "target": "bg", "animate": {"opacity": [0, 1]}, "duration": 500},
            ],
        }
        fixed = fix_common_dsl_issues(dsl)
        assert fixed["version"] == "2.0"
        assert len(fixed["acts"]) == 1
        assert fixed["acts"][0]["layers"][0]["type"] == "background"

    def test_removes_orphan_timeline_targets(self):
        dsl = {
            "acts": [{
                "id": "a", "duration_ms": 3000,
                "layout": {"type": "full"},
                "layers": [
                    {"id": "bg", "type": "background", "opacity": 1, "props": {}},
                ],
                "timeline": [
                    {"at": 100, "target": "bg", "animate": {"opacity": [0, 1]}, "duration": 500},
                    {"at": 200, "target": "nonexistent", "animate": {"opacity": [0, 1]}, "duration": 500},
                ],
            }]
        }
        fixed = fix_common_dsl_issues(dsl)
        assert len(fixed["acts"][0]["timeline"]) == 1
        assert fixed["acts"][0]["timeline"][0]["target"] == "bg"

    def test_pads_missing_cells_for_cuts(self):
        dsl = {
            "acts": [{
                "id": "a", "duration_ms": 3000,
                "layout": {
                    "type": "cuts",
                    "cuts": [
                        {"direction": "h", "position": 0.5},
                        {"direction": "v", "position": 0.5, "target": 0},
                    ],
                },
                "layers": [{"id": "bg", "type": "background", "opacity": 1, "props": {}}],
                "cells": [
                    {"id": "c0", "position": "0", "layers": []},
                ],  # Only 1 cell but 3 expected regions
            }]
        }
        fixed = fix_common_dsl_issues(dsl)
        assert len(fixed["acts"][0]["cells"]) == 3

    def test_fixed_dsl_validates_clean(self):
        """A badly formed DSL should pass validation after fixing."""
        bad = {
            "acts": [{
                "duration_ms": 3000,
                "layers": [{"type": "text", "props": {"content": "Hello"}}],
            }]
        }
        fixed = fix_common_dsl_issues(bad)
        is_valid, errors = validate_living_panel_dsl(fixed)
        assert is_valid, f"Fixed DSL should validate but got: {errors}"


class TestContrastEnforcement:
    """Ensure text is always readable against its background."""

    def test_hex_to_rgb(self):
        assert _hex_to_rgb("#FF0000") == (255, 0, 0)
        assert _hex_to_rgb("#000") == (0, 0, 0)
        assert _hex_to_rgb("invalid") is None

    def test_white_on_white_bad_contrast(self):
        assert _contrast_ratio("#F0EEE8", "#F2E8D5") < 4.5

    def test_ink_on_cream_good_contrast(self):
        assert _contrast_ratio("#1A1825", "#F2E8D5") >= 4.5

    def test_fixes_white_text_on_light_bg(self):
        fixed = _fix_text_color("#F0EEE8", "#F2E8D5")
        assert fixed == "#1A1825"  # Flipped to dark ink

    def test_fixes_dark_text_on_dark_bg(self):
        fixed = _fix_text_color("#1A1825", "#0F0E17")
        assert fixed == "#F0EEE8"  # Flipped to light paper

    def test_leaves_good_contrast_alone(self):
        fixed = _fix_text_color("#1A1825", "#F2E8D5")
        assert fixed == "#1A1825"  # Already good, untouched

    def test_full_dsl_contrast_fix(self):
        """White text on cream background gets auto-fixed in full pipeline."""
        dsl = {
            "canvas": {"width": 800, "height": 600, "background": "#F2E8D5", "mood": "light"},
            "acts": [{
                "id": "a", "duration_ms": 5000,
                "layout": {"type": "full"},
                "layers": [
                    {"id": "bg", "type": "background", "opacity": 1,
                     "props": {"gradient": ["#F2E8D5", "#EDE0CC"]}},
                    {"id": "txt", "type": "text", "opacity": 0,
                     "props": {"content": "Hello", "color": "#F0EEE8"}},
                ],
            }],
        }
        fixed = fix_common_dsl_issues(dsl)
        txt = fixed["acts"][0]["layers"][1]["props"]
        assert txt["color"] == "#1A1825"
        assert "textShadow" in txt

    def test_cell_text_gets_contrast_fix(self):
        """Text inside cells also gets fixed."""
        dsl = {
            "canvas": {"width": 800, "height": 600, "background": "#1A1825", "mood": "dark"},
            "acts": [{
                "id": "a", "duration_ms": 5000,
                "layout": {"type": "cuts", "cuts": [{"direction": "v", "position": 0.5}]},
                "layers": [
                    {"id": "bg", "type": "background", "opacity": 1,
                     "props": {"gradient": ["#1A1825", "#0F0E17"]}},
                ],
                "cells": [{
                    "id": "c0", "position": "0",
                    "layers": [{
                        "id": "dark-txt", "type": "text", "opacity": 0,
                        "props": {"content": "Dark text on dark bg", "color": "#1A1825"},
                    }],
                }],
            }],
        }
        fixed = fix_common_dsl_issues(dsl)
        txt = fixed["acts"][0]["cells"][0]["layers"][0]["props"]
        assert txt["color"] == "#F0EEE8"  # Flipped to light


class TestLayerTypeAliasing:
    """LLMs invent layer type names. We should normalize them, not reject."""

    def _make_dsl_with_layer_type(self, layer_type: str) -> dict:
        return {
            "version": "2.0",
            "canvas": {"width": 800, "height": 600, "background": "#1A1825"},
            "meta": {"narrative_beat": "test"},
            "acts": [{
                "id": "act-1",
                "duration_ms": 3000,
                "transition_in": {"type": "fade"},
                "layout": {"type": "full"},
                "layers": [{
                    "id": "layer-1",
                    "type": layer_type,
                    "opacity": 1,
                    "props": {"description": "test"},
                }],
            }],
        }

    @pytest.mark.parametrize("alias,expected", list(LAYER_TYPE_ALIASES.items()))
    def test_alias_normalizes_during_validation(self, alias, expected):
        dsl = self._make_dsl_with_layer_type(alias)
        is_valid, errors = validate_living_panel_dsl(dsl)
        # Should pass validation (alias is recognized)
        alias_errors = [e for e in errors if "invalid type" in e]
        assert not alias_errors, f"Alias '{alias}' should not cause invalid type error: {errors}"
        # Layer type should be normalized
        assert dsl["acts"][0]["layers"][0]["type"] == expected

    def test_illustration_becomes_background(self):
        """The most common LLM invention: 'illustration'."""
        dsl = self._make_dsl_with_layer_type("illustration")
        validate_living_panel_dsl(dsl)
        assert dsl["acts"][0]["layers"][0]["type"] == "background"

    def test_truly_invalid_type_still_errors(self):
        dsl = self._make_dsl_with_layer_type("banana_layer")
        is_valid, errors = validate_living_panel_dsl(dsl)
        assert any("invalid type" in e for e in errors)
