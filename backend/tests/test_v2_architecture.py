"""Tests for the v2 architecture: Document Understanding + Manga Story Design."""

import pytest
from app.stage_document_understanding import (
    _fallback_understanding,
    _build_understanding_input,
)
from app.stage_manga_story_design import (
    _fallback_blueprint,
    _validate_blueprint,
    _default_characters,
    blueprint_to_synopsis,
    blueprint_to_bible,
    _format_knowledge_for_design,
)
from app.models import SummaryStyle


def _make_chapters(n, words_each=100):
    return [
        {
            "chapter_index": i,
            "chapter_title": f"Chapter {i}",
            "one_liner": f"One liner for chapter {i}",
            "key_concepts": [f"concept_{i}_a", f"concept_{i}_b"],
            "narrative_summary": " ".join([f"word{j}" for j in range(words_each)]),
            "memorable_quotes": [f"Quote from chapter {i}"],
            "action_items": [f"Do thing {i}"],
            "dramatic_moment": f"The big reveal in chapter {i}",
            "metaphor": f"Metaphor {i}",
            "narrative_state_update": {
                "new_characters": [f"Entity{i}"],
                "new_terms": [f"term{i}: definition"],
                "unresolved_threads": [f"thread_{i}"],
                "emotional_shift": f"curious → excited",
            },
        }
        for i in range(n)
    ]


# ────────────────────────────────────────────────────────────
# Document Understanding Tests
# ────────────────────────────────────────────────────────────

class TestDocumentUnderstanding:

    def test_fallback_has_required_fields(self):
        chapters = _make_chapters(3)
        result = _fallback_understanding(chapters)
        assert result["core_thesis"]
        assert result["document_type"]
        assert isinstance(result["key_entities"], list)
        assert isinstance(result["knowledge_clusters"], list)
        assert isinstance(result["data_points"], list)
        assert isinstance(result["emotional_arc"], dict)
        assert len(result["knowledge_clusters"]) == 3  # one per chapter

    def test_fallback_extracts_entities_from_state(self):
        chapters = _make_chapters(3)
        result = _fallback_understanding(chapters)
        names = {e["name"] for e in result["key_entities"]}
        assert "Entity0" in names
        assert "Entity1" in names

    def test_fallback_preserves_quotes(self):
        chapters = _make_chapters(2)
        result = _fallback_understanding(chapters)
        assert len(result["quotable_moments"]) > 0
        assert "Quote from chapter" in result["quotable_moments"][0]["text"]

    def test_understanding_input_includes_all_chapters(self):
        chapters = _make_chapters(5)
        text = _build_understanding_input(chapters)
        for i in range(5):
            assert f"Chapter {i}" in text
            assert f"concept_{i}_a" in text

    def test_understanding_input_includes_dramatic_moments(self):
        chapters = _make_chapters(3)
        text = _build_understanding_input(chapters)
        assert "big reveal" in text

    def test_understanding_input_includes_state_updates(self):
        chapters = _make_chapters(2)
        text = _build_understanding_input(chapters)
        assert "Entity0" in text
        assert "thread_0" in text


# ────────────────────────────────────────────────────────────
# Manga Story Design Tests
# ────────────────────────────────────────────────────────────

class TestMangaStoryDesign:

    def test_fallback_blueprint_has_required_fields(self):
        chapters = _make_chapters(3)
        knowledge = _fallback_understanding(chapters)
        bp = _fallback_blueprint(knowledge, chapters, SummaryStyle.MANGA)
        assert bp["manga_title"]
        assert bp["logline"]
        assert bp["world"]["setting"]
        assert len(bp["characters"]) >= 2
        assert len(bp["scenes"]) == 3  # one per chapter

    def test_fallback_characters_have_names(self):
        chapters = _make_chapters(2)
        knowledge = _fallback_understanding(chapters)
        bp = _fallback_blueprint(knowledge, chapters, SummaryStyle.MANGA)
        for char in bp["characters"]:
            assert char["name"]
            assert char["role"]
            assert char["visual_description"]

    def test_scenes_cover_all_chapters(self):
        chapters = _make_chapters(5)
        knowledge = _fallback_understanding(chapters)
        bp = _fallback_blueprint(knowledge, chapters, SummaryStyle.MANGA)
        covered = {s["chapter_source"] for s in bp["scenes"]}
        for i in range(5):
            assert i in covered

    def test_validate_adds_missing_chapter_scenes(self):
        chapters = _make_chapters(4)
        # Blueprint that only covers chapters 0 and 2
        bp = {
            "characters": [{"name": "Kai", "role": "protagonist"}],
            "scenes": [
                {"scene_index": 0, "chapter_source": 0, "scene_title": "A", "what_happens": "x"},
                {"scene_index": 1, "chapter_source": 2, "scene_title": "B", "what_happens": "y"},
            ],
        }
        result = _validate_blueprint(bp, {}, chapters)
        covered = {s["chapter_source"] for s in result["scenes"]}
        assert 1 in covered
        assert 3 in covered

    def test_default_characters_uses_person_entities(self):
        knowledge = {
            "key_entities": [
                {"name": "Mrigesh", "type": "person", "significance": "The main person"},
                {"name": "React", "type": "technology", "significance": "A framework"},
            ]
        }
        chars = _default_characters(knowledge)
        assert chars[0]["name"] == "Mrigesh"
        assert chars[0]["role"] == "protagonist"

    def test_default_characters_fallback_without_person(self):
        knowledge = {"key_entities": [{"name": "AI", "type": "concept", "significance": "tech"}]}
        chars = _default_characters(knowledge)
        assert chars[0]["name"] == "Kai"  # generic fallback


# ────────────────────────────────────────────────────────────
# Conversion Helpers Tests
# ────────────────────────────────────────────────────────────

class TestConversionHelpers:

    def test_blueprint_to_synopsis_maps_fields(self):
        bp = {
            "logline": "A hero's journey",
            "narrative_arc": {
                "act_one": "Setup",
                "act_two": "Conflict",
                "act_three": "Resolution",
                "emotional_journey": "Fear to courage",
            },
            "world": {"setting": "Fantasy world", "core_metaphor": "A flame"},
            "scenes": [
                {"scene_title": "Opening", "what_happens": "Hero wakes up"},
                {"scene_title": "Battle", "what_happens": "Hero fights"},
            ],
            "must_include_facts": ["fact1", "fact2"],
        }
        synopsis = blueprint_to_synopsis(bp)
        assert synopsis["book_thesis"] == "A hero's journey"
        assert "Setup" in synopsis["narrative_arc"]
        assert synopsis["core_metaphor"] == "A flame"
        assert len(synopsis["manga_story_beats"]) == 2
        assert len(synopsis["key_facts_to_preserve"]) == 2

    def test_blueprint_to_bible_maps_characters(self):
        bp = {
            "world": {
                "setting": "Dark city",
                "visual_style": "Noir",
                "recurring_motifs": ["Rain", "Neon"],
            },
            "characters": [
                {
                    "name": "Kai",
                    "role": "protagonist",
                    "based_on": "Reader",
                    "visual_description": "Young, messy hair",
                    "speech_style": "Curious",
                },
            ],
            "scenes": [
                {"chapter_source": 0, "mood": "mysterious", "what_happens": "x", "visual_direction": "y", "panel_suggestion": "dialogue-heavy"},
            ],
        }
        chapters = [{"chapter_index": 0, "chapter_title": "Ch0"}]
        bible = blueprint_to_bible(bp, chapters)
        assert bible["world_description"] == "Dark city"
        assert bible["color_palette"] == "Noir"
        assert len(bible["characters"]) == 1
        assert bible["characters"][0]["name"] == "Kai"
        assert len(bible["chapter_plans"]) == 1

    def test_blueprint_to_bible_fills_missing_chapters(self):
        bp = {
            "world": {"setting": "x", "visual_style": "y", "recurring_motifs": []},
            "characters": [],
            "scenes": [{"chapter_source": 0, "mood": "tense", "what_happens": "a", "visual_direction": "b", "panel_suggestion": "c"}],
        }
        chapters = [
            {"chapter_index": 0, "chapter_title": "Ch0"},
            {"chapter_index": 1, "chapter_title": "Ch1", "dramatic_moment": "Big moment"},
        ]
        bible = blueprint_to_bible(bp, chapters)
        assert len(bible["chapter_plans"]) == 2
        assert bible["chapter_plans"][1]["chapter_index"] == 1

    def test_knowledge_formatting_includes_all_sections(self):
        knowledge = {
            "document_type": "resume",
            "core_thesis": "A talented dev",
            "target_audience": "Recruiters",
            "what_makes_this_interesting": "Unique journey",
            "key_entities": [{"name": "X", "type": "person", "significance": "main"}],
            "argument_structure": {"opening_premise": "Start", "key_arguments": ["A"], "conclusion": "End"},
            "knowledge_clusters": [{"theme": "Skills", "key_facts": ["React"], "insights": ["Fast learner"]}],
            "emotional_arc": {"opening_mood": "hopeful", "turning_points": [], "climax": "Big win", "resolution": "Satisfied"},
            "data_points": [{"fact": "719 GitHub contributions", "significance": "Prolific"}],
            "quotable_moments": [{"text": "Code is poetry", "context": "Bio"}],
            "relationships": [{"from": "X", "to": "Y", "relationship": "mentored"}],
        }
        chapters = _make_chapters(2)
        text = _format_knowledge_for_design(knowledge, chapters)
        assert "resume" in text
        assert "719 GitHub contributions" in text
        assert "Code is poetry" in text
        assert "Skills" in text
