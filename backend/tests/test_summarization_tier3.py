"""Tests for Tier 3: anti-hallucination guardrails + content-length guidance.

Pure unit tests — no DB, no LLM, no async.
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

from app.prompts import (
    get_canonical_summary_prompt,
    get_content_length_guidance,
    format_chapter_for_llm,
    STYLE_DESCRIPTORS,
)
from app.models import SummaryStyle


# ============================================================
# 3A: Anti-hallucination guardrails in prompt
# ============================================================

class TestAntiHallucination:

    def test_factual_fidelity_in_prompt(self):
        """The canonical summary prompt must contain fidelity rules."""
        prompt = get_canonical_summary_prompt(SummaryStyle.MANGA)
        assert "FACTUAL FIDELITY" in prompt
        assert "NEVER invent" in prompt
        assert "trace to something in the source" in prompt

    def test_memorable_quotes_must_be_real(self):
        """Prompt must instruct LLM that quotes are from the actual text."""
        prompt = get_canonical_summary_prompt(SummaryStyle.MANGA)
        assert "actual quotes from the text" in prompt

    def test_dramatic_moment_must_be_real(self):
        """Prompt must say dramatic_moment describes something that ACTUALLY happens."""
        prompt = get_canonical_summary_prompt(SummaryStyle.MANGA)
        assert "ACTUALLY happens" in prompt


# ============================================================
# 3B: Content-length adaptive prompt
# ============================================================

class TestContentLengthGuidance:

    def test_very_short_content_gets_strict_guidance(self):
        """< 150 words gets aggressive factual mode."""
        guidance = get_content_length_guidance(80)
        assert "VERY short" in guidance
        assert "80 words" in guidance
        assert "under 80 words" in guidance  # narrative_summary cap
        assert "Do NOT inflate" in guidance

    def test_medium_content_gets_moderate_guidance(self):
        """150-400 words gets moderate guidance."""
        guidance = get_content_length_guidance(250)
        assert "relatively brief" in guidance
        assert "250 words" in guidance
        assert "under 150 words" in guidance

    def test_long_content_gets_no_guidance(self):
        """400+ words gets standard treatment."""
        guidance = get_content_length_guidance(1500)
        assert guidance == ""

    def test_boundary_150(self):
        """Exactly 150 is medium, not short."""
        guidance = get_content_length_guidance(150)
        assert "relatively brief" in guidance

    def test_boundary_400(self):
        """Exactly 400 is long — no guidance."""
        guidance = get_content_length_guidance(400)
        assert guidance == ""


# ============================================================
# 3C: Style fidelity clauses
# ============================================================

class TestStyleFidelity:

    def test_every_style_has_fidelity_rules(self):
        """Every style descriptor must contain FIDELITY RULES."""
        for style, desc in STYLE_DESCRIPTORS.items():
            assert "FIDELITY RULES" in desc, (
                f"Style {style.value} missing FIDELITY RULES"
            )

    def test_manga_fidelity_prevents_fabrication(self):
        """MANGA style must explicitly ban inventing settings."""
        desc = STYLE_DESCRIPTORS[SummaryStyle.MANGA]
        assert "NEVER invent physical settings" in desc
        assert "NEVER fabricate dialogue" in desc
        assert "Dramatize REAL facts" in desc

    def test_manga_no_fixed_patterns(self):
        """MANGA style should NOT hardcode 'And then... everything changed.'"""
        desc = STYLE_DESCRIPTORS[SummaryStyle.MANGA]
        assert "And then... everything changed" not in desc

    def test_academic_highest_fidelity(self):
        """ACADEMIC style should have the strictest fidelity."""
        desc = STYLE_DESCRIPTORS[SummaryStyle.ACADEMIC]
        assert "No embellishment" in desc
