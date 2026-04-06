"""
Tests for V4 Engine — types, DSL generator, fallbacks
"""

import pytest
from app.v4_types import (
    V4Page, V4Panel, V4DialogueLine, V4DataItem,
    validate_v4_page, validate_v4_panel,
    PANEL_TYPES, EMPHASIS_LEVELS, PAGE_LAYOUTS,
)
from app.v4_dsl_generator import (
    _make_v4_fallback_panel,
    _make_v4_fallback_page,
    _build_v4_page_prompt,
    _page_temperature,
)
from app.agents.planner import PanelAssignment


# ── Fixtures ──────────────────────────────────────────────────

def _make_assignment(**overrides) -> PanelAssignment:
    """Helper to create PanelAssignment with sensible defaults."""
    defaults = dict(
        panel_id="test-panel",
        chapter_index=0,
        page_index=0,
        panel_index=0,
        content_type="narration",
        narrative_beat="",
        text_content="",
        dialogue=[],
        character=None,
        expression="neutral",
        visual_mood="light",
        layout_hint="full",
        image_budget=False,
        creative_direction="",
        scene_description="",
        dependencies=[],
    )
    defaults.update(overrides)
    return PanelAssignment(**defaults)


@pytest.fixture
def splash_assignment():
    return _make_assignment(
        panel_id="ch0-pg0-p0",
        content_type="splash",
        visual_mood="dramatic-dark",
        narrative_beat="opening hook",
        text_content="Can AI agents evolve on the fly?",
        character="LIVE-SWE-AGENT",
        expression="determined",
        scene_description="A dark void with digital particles",
        creative_direction="Speed lines, dramatic entry",
    )


@pytest.fixture
def dialogue_assignment():
    return _make_assignment(
        panel_id="ch0-pg1-p1",
        page_index=1,
        panel_index=1,
        content_type="dialogue",
        visual_mood="tense",
        layout_hint="split-h",
        narrative_beat="confrontation",
        character="Dr. Chen",
        expression="frustrated",
        dialogue=[
            {"character": "Dr. Chen", "text": "Every other agent is fixed.", "emotion": "frustrated"},
            {"character": "LIVE-SWE-AGENT", "text": "But I can learn while fighting.", "emotion": "determined"},
        ],
    )


@pytest.fixture
def data_assignment():
    return _make_assignment(
        panel_id="ch2-pg0-p0",
        chapter_index=2,
        content_type="data",
        visual_mood="light",
        narrative_beat="evidence reveal",
        text_content="77.4% accuracy, 12% improvement, Real-time evolution",
    )


# ── V4Panel Tests ─────────────────────────────────────────────

class TestV4Panel:
    def test_to_dict_minimal(self):
        panel = V4Panel(type="narration", narration="Hello world")
        d = panel.to_dict()
        assert d["type"] == "narration"
        assert d["narration"] == "Hello world"
        assert "lines" not in d  # Empty lists omitted
        assert "character" not in d  # Empty strings omitted

    def test_to_dict_full(self):
        panel = V4Panel(
            type="dialogue",
            scene="laboratory",
            mood="tense",
            character="Dr. Chen",
            pose="presenting",
            expression="frustrated",
            lines=[V4DialogueLine(who="Dr. Chen", says="Interesting.", emotion="neutral")],
            effects=["screentone"],
            emphasis="high",
        )
        d = panel.to_dict()
        assert d["scene"] == "laboratory"
        assert d["mood"] == "tense"
        assert d["character"] == "Dr. Chen"
        assert d["pose"] == "presenting"
        assert d["expression"] == "frustrated"
        assert len(d["lines"]) == 1
        assert d["lines"][0]["who"] == "Dr. Chen"
        assert d["effects"] == ["screentone"]
        assert d["emphasis"] == "high"


class TestV4Page:
    def test_to_dict(self):
        page = V4Page(
            page_index=0,
            chapter_index=0,
            layout="vertical",
            panels=[V4Panel(type="narration", narration="Test")],
        )
        d = page.to_dict()
        assert d["version"] == "4.0"
        assert d["page_index"] == 0
        assert d["layout"] == "vertical"
        assert len(d["panels"]) == 1


# ── Validation Tests ──────────────────────────────────────────

class TestValidation:
    def test_validate_panel_basic(self):
        panel = validate_v4_panel({
            "type": "splash",
            "title": "Big Title",
            "character": "Hero",
            "emphasis": "high",
        })
        assert panel.type == "splash"
        assert panel.title == "Big Title"
        assert panel.character == "Hero"
        assert panel.emphasis == "high"

    def test_validate_panel_bad_type_defaults_to_narration(self):
        panel = validate_v4_panel({"type": "invalid_type"})
        assert panel.type == "narration"

    def test_validate_panel_bad_emphasis_defaults_to_medium(self):
        panel = validate_v4_panel({"type": "narration", "emphasis": "ultra"})
        assert panel.emphasis == "medium"

    def test_validate_panel_truncates_long_text(self):
        panel = validate_v4_panel({
            "type": "narration",
            "narration": "x" * 500,
            "title": "y" * 200,
        })
        assert len(panel.narration) <= 200
        assert len(panel.title) <= 80

    def test_validate_panel_dialogue(self):
        panel = validate_v4_panel({
            "type": "dialogue",
            "lines": [
                {"who": "Alice", "says": "Hello!", "emotion": "happy"},
                {"who": "Bob", "says": "Hi there!"},
            ],
        })
        assert len(panel.lines) == 2
        assert panel.lines[0].emotion == "happy"
        assert panel.lines[1].emotion == "neutral"  # default

    def test_validate_panel_data_items(self):
        panel = validate_v4_panel({
            "type": "data",
            "data_items": [
                {"label": "Accuracy", "value": "77.4%"},
                {"label": "Improvement"},
            ],
        })
        assert len(panel.data_items) == 2
        assert panel.data_items[0].value == "77.4%"
        assert panel.data_items[1].value == ""  # default

    def test_validate_panel_effects_capped(self):
        panel = validate_v4_panel({
            "type": "splash",
            "effects": ["a", "b", "c", "d", "e", "f", "g"],
        })
        assert len(panel.effects) <= 5

    def test_validate_page_auto_layout(self):
        page = validate_v4_page({
            "layout": "full",
            "panels": [
                {"type": "narration", "narration": "A"},
                {"type": "narration", "narration": "B"},
            ],
        })
        # 2 panels can't be "full" — auto-corrects to vertical
        assert page.layout == "vertical"

    def test_validate_page_single_panel_forced_to_full(self):
        page = validate_v4_page({
            "layout": "grid-4",
            "panels": [{"type": "splash", "title": "Big"}],
        })
        assert page.layout == "full"

    def test_validate_page_empty_panels_gets_fallback(self):
        page = validate_v4_page({"panels": []})
        assert len(page.panels) == 1
        assert page.panels[0].type == "narration"


# ── Fallback Generation Tests ─────────────────────────────────

class TestFallbackGeneration:
    def test_splash_fallback(self, splash_assignment):
        panel = _make_v4_fallback_panel(splash_assignment)
        assert panel.type == "splash"
        assert panel.emphasis == "high"
        assert "speed_lines" in panel.effects
        assert panel.title != ""
        assert panel.character == "LIVE-SWE-AGENT"

    def test_dialogue_fallback(self, dialogue_assignment):
        panel = _make_v4_fallback_panel(dialogue_assignment)
        assert panel.type == "dialogue"
        assert len(panel.lines) == 2
        assert panel.lines[0].who == "Dr. Chen"
        assert panel.lines[1].who == "LIVE-SWE-AGENT"

    def test_data_fallback(self, data_assignment):
        panel = _make_v4_fallback_panel(data_assignment)
        assert panel.type == "data"
        assert len(panel.data_items) >= 2
        assert any("77.4" in di.label for di in panel.data_items)

    def test_fallback_page_single_panel(self, splash_assignment):
        page = _make_v4_fallback_page([splash_assignment])
        assert page.layout == "full"
        assert len(page.panels) == 1

    def test_fallback_page_two_panels(self, splash_assignment, dialogue_assignment):
        page = _make_v4_fallback_page([splash_assignment, dialogue_assignment])
        assert page.layout == "vertical"
        assert len(page.panels) == 2

    def test_fallback_page_three_panels(self, splash_assignment, dialogue_assignment, data_assignment):
        page = _make_v4_fallback_page([splash_assignment, dialogue_assignment, data_assignment])
        assert page.layout == "asymmetric"
        assert len(page.panels) == 3

    def test_fallback_narration_type(self):
        """Unknown content type defaults to narration."""
        assignment = _make_assignment(
            content_type="unknown_type",
            text_content="Some text here",
        )
        panel = _make_v4_fallback_panel(assignment)
        assert panel.type == "narration"
        assert panel.narration != ""


# ── Prompt Building Tests ─────────────────────────────────────

class TestPromptBuilding:
    def test_prompt_includes_panel_info(self, splash_assignment):
        prompt = _build_v4_page_prompt([splash_assignment])
        assert "splash" in prompt
        assert "dramatic-dark" in prompt
        assert "opening hook" in prompt

    def test_prompt_includes_chapter_context(self, splash_assignment):
        chapter = {"chapter_title": "The Beginning", "one_liner": "How it started"}
        prompt = _build_v4_page_prompt([splash_assignment], chapter_summary=chapter)
        assert "The Beginning" in prompt
        assert "How it started" in prompt

    def test_prompt_includes_bible_characters(self, splash_assignment):
        bible = {
            "manga_title": "Evolution Unleashed",
            "world_description": "A digital battleground",
            "characters": [
                {"name": "LIVE-SWE-AGENT", "role": "protagonist", "speech_style": "confident"},
            ],
        }
        prompt = _build_v4_page_prompt([splash_assignment], manga_bible=bible)
        assert "Evolution Unleashed" in prompt
        assert "LIVE-SWE-AGENT" in prompt
        assert "protagonist" in prompt

    def test_prompt_only_includes_relevant_characters(self, splash_assignment):
        bible = {
            "characters": [
                {"name": "LIVE-SWE-AGENT", "role": "protagonist", "speech_style": "bold"},
                {"name": "OtherChar", "role": "side", "speech_style": "quiet"},
            ],
        }
        prompt = _build_v4_page_prompt([splash_assignment], manga_bible=bible)
        assert "LIVE-SWE-AGENT" in prompt
        assert "OtherChar" not in prompt  # Not on this page

    def test_prompt_includes_dialogue(self, dialogue_assignment):
        prompt = _build_v4_page_prompt([dialogue_assignment])
        assert "Every other agent is fixed." in prompt


# ── Temperature Tests ─────────────────────────────────────────

class TestTemperature:
    def test_splash_is_hottest(self, splash_assignment):
        assert _page_temperature([splash_assignment]) == 0.85

    def test_data_is_coolest(self, data_assignment):
        assert _page_temperature([data_assignment]) == 0.5

    def test_mixed_page_uses_hottest(self, splash_assignment, data_assignment):
        temp = _page_temperature([splash_assignment, data_assignment])
        assert temp == 0.85  # Splash wins

    def test_empty_page(self):
        assert _page_temperature([]) == 0.7
