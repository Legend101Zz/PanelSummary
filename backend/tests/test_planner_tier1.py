"""Tests for Tier 1 planner fixes: crash prevention, budget caps, consolidation.

These are pure unit tests — no DB, no LLM, no async.
"""

import sys
from pathlib import Path

# Ensure backend/app is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.agents.planner import (
    _build_manga_plan,
    _generate_fallback_plan,
    consolidate_short_chapters,
)


# ============================================================
# Helpers
# ============================================================

def _make_chapter(idx: int, title: str = "", words: int = 100) -> dict:
    """Create a fake canonical chapter with a given word count."""
    narrative = " ".join(["word"] * words)
    return {
        "chapter_index": idx,
        "chapter_title": title or f"Chapter {idx}",
        "one_liner": f"Summary of chapter {idx}",
        "key_concepts": ["concept_a", "concept_b"],
        "narrative_summary": narrative,
        "dramatic_moment": "Something dramatic",
        "memorable_quotes": [],
        "action_items": [],
    }


def _make_chapters(n: int, words_each: int = 100) -> list[dict]:
    return [_make_chapter(i, words=words_each) for i in range(n)]


def _valid_llm_chapter(ch_idx: int) -> dict:
    """A single valid chapter entry as the LLM would return it."""
    return {
        "chapter_index": ch_idx,
        "pages": [
            {
                "page_index": 0,
                "layout": "full",
                "panels": [
                    {
                        "content_type": "splash",
                        "narrative_beat": f"Chapter {ch_idx} opening",
                        "text_content": f"CHAPTER {ch_idx}",
                        "visual_mood": "dramatic-dark",
                    }
                ],
            }
        ],
    }


# ============================================================
# 1A: _build_manga_plan handles wrong types gracefully
# ============================================================

class TestBuildMangaPlanTypeSafety:
    """Fix for the 'list' object has no attribute 'get' crash."""

    def test_list_input_wrapped_as_chapters(self):
        """If parser returns a list (truncated JSON), wrap it as chapters."""
        chapters_list = [_valid_llm_chapter(0)]
        # This used to crash with 'list' object has no attribute 'get'
        plan = _build_manga_plan(chapters_list, _make_chapters(1), {})
        assert plan.total_panels == 1
        assert plan.panels[0].content_type == "splash"

    def test_empty_dict_falls_to_fallback(self):
        plan = _build_manga_plan({}, _make_chapters(2), {})
        # Fallback generates 2 panels/ch (splash + dialogue)
        assert plan.total_panels >= 2

    def test_none_falls_to_fallback(self):
        plan = _build_manga_plan(None, _make_chapters(2), {}, max_panels=10)
        assert plan.total_panels > 0

    def test_string_falls_to_fallback(self):
        plan = _build_manga_plan("garbage", _make_chapters(1), {}, max_panels=6)
        assert plan.total_panels > 0

    def test_non_dict_chapters_skipped(self):
        """Malformed chapter entries (e.g., strings) should be skipped."""
        plan_data = {
            "chapters": [
                "not a chapter",      # should be skipped
                42,                   # should be skipped
                _valid_llm_chapter(2),  # valid — should be kept
            ]
        }
        plan = _build_manga_plan(plan_data, _make_chapters(3), {})
        assert plan.total_panels == 1  # only the valid chapter
        assert plan.panels[0].chapter_index == 2

    def test_non_dict_pages_skipped(self):
        plan_data = {
            "chapters": [
                {
                    "chapter_index": 0,
                    "pages": [
                        "not a page",
                        {
                            "page_index": 1,
                            "layout": "cuts",
                            "panels": [{"content_type": "dialogue"}],
                        },
                    ],
                }
            ]
        }
        plan = _build_manga_plan(plan_data, _make_chapters(1), {})
        assert plan.total_panels == 1

    def test_zero_usable_panels_triggers_fallback(self):
        """If all chapters/pages/panels are garbage, fallback kicks in."""
        plan_data = {
            "chapters": [
                {"chapter_index": 0, "pages": ["bad", "worse"]},
            ]
        }
        plan = _build_manga_plan(plan_data, _make_chapters(1), {}, max_panels=6)
        assert plan.total_panels > 0  # fallback generated something


# ============================================================
# 1B: Fallback plan respects max_panels budget
# ============================================================

class TestFallbackBudget:
    """_generate_fallback_plan must never exceed max_panels."""

    def test_10_chapters_capped_at_12(self):
        plan = _generate_fallback_plan(_make_chapters(10), {}, max_panels=12)
        assert plan.total_panels <= 12
        assert plan.total_panels > 0

    def test_5_chapters_capped_at_6(self):
        plan = _generate_fallback_plan(_make_chapters(5), {}, max_panels=6)
        assert plan.total_panels <= 6

    def test_1_chapter_gets_at_least_2_panels(self):
        plan = _generate_fallback_plan(_make_chapters(1), {}, max_panels=30)
        assert plan.total_panels >= 2  # splash + dialogue

    def test_layout_variety_in_fallback(self):
        """Fallback should NOT be 100% 'full' layout anymore."""
        plan = _generate_fallback_plan(_make_chapters(6), {}, max_panels=30)
        layouts = {p.layout_hint for p in plan.panels}
        assert len(layouts) > 1, f"All panels use same layout: {layouts}"
        assert "cuts" in layouts, "Fallback should include cuts layouts"

    def test_budget_characters_used(self):
        """Fallback should use bible characters if available."""
        bible = {
            "characters": [
                {"name": "Alice", "role": "protagonist"},
                {"name": "Bob", "role": "mentor"},
            ]
        }
        plan = _generate_fallback_plan(_make_chapters(2), bible, max_panels=10)
        dialogue_panels = [p for p in plan.panels if p.content_type == "dialogue"]
        assert len(dialogue_panels) > 0
        # Check that Alice is used as protagonist
        assert any("Alice" in str(p.dialogue) for p in dialogue_panels)


# ============================================================
# 1C: Chapter consolidation for short documents
# ============================================================

class TestChapterConsolidation:
    """Short docs with many tiny chapters should be merged."""

    def test_10_tiny_chapters_consolidated(self):
        """3-page resume: 10 chapters × 50 words → should merge to ~3."""
        chapters = _make_chapters(10, words_each=50)
        result = consolidate_short_chapters(chapters)
        assert len(result) <= 5, f"Expected ≤5 merged chapters, got {len(result)}"
        assert len(result) >= 1

    def test_3_chapters_not_consolidated(self):
        """3 chapters should never be consolidated (already small enough)."""
        chapters = _make_chapters(3, words_each=50)
        result = consolidate_short_chapters(chapters)
        assert len(result) == 3

    def test_large_doc_not_consolidated(self):
        """Documents with 2000+ summary words should NOT be consolidated."""
        chapters = _make_chapters(10, words_each=250)
        result = consolidate_short_chapters(chapters)
        assert len(result) == 10  # unchanged

    def test_merged_chapter_preserves_content(self):
        """Merged chapters should preserve key_concepts and narratives."""
        chapters = [
            _make_chapter(0, title="Identity", words=30),
            _make_chapter(1, title="Background", words=30),
            _make_chapter(2, title="Skills", words=30),
            _make_chapter(3, title="Goals", words=30),
            _make_chapter(4, title="Hobbies", words=30),
            _make_chapter(5, title="Experience", words=30),
            _make_chapter(6, title="Education", words=30),
            _make_chapter(7, title="Awards", words=30),
        ]
        result = consolidate_short_chapters(chapters)
        assert len(result) < 8  # should consolidate 8 thin chapters

        # All key concepts should be preserved somewhere
        all_concepts = set()
        for ch in result:
            all_concepts.update(ch.get("key_concepts", []))
        assert "concept_a" in all_concepts
        assert "concept_b" in all_concepts

    def test_chapter_indices_renumbered(self):
        """Merged chapters should have sequential indices."""
        chapters = _make_chapters(8, words_each=40)
        result = consolidate_short_chapters(chapters)
        indices = [ch["chapter_index"] for ch in result]
        assert indices == list(range(len(result)))

    def test_explicit_max_chapters(self):
        """Can override the target with max_chapters."""
        chapters = _make_chapters(10, words_each=50)
        result = consolidate_short_chapters(chapters, max_chapters=2)
        assert len(result) <= 2
