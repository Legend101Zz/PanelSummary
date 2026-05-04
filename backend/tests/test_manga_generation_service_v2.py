"""Unit tests for manga v2 generation service helpers."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.domain.manga import SourceRange, SourceSlice, SourceSliceMode
from app.manga_pipeline.llm_contracts import LLMCallAttempt, LLMInvocationTrace, LLMStageName, LLMValidationIssue
from app.models import BookChapter, BookSection
from app.services.manga.generation_service import (
    build_generation_options,
    build_source_text_for_slice,
    build_v2_generation_stages,
    serialize_llm_trace,
)


class ProjectStub:
    style = "manga"
    engine = "v4"
    project_options = {"llm_validation_attempts": 2, "style": "noir"}


def _slice(start: int = 2, end: int = 5) -> SourceSlice:
    return SourceSlice(
        slice_id="slice_001",
        book_id="book_123",
        mode=SourceSliceMode.PAGES,
        source_range=SourceRange(page_start=start, page_end=end),
    )


def _chapters() -> list[BookChapter]:
    return [
        BookChapter(
            index=0,
            title="Before",
            page_start=1,
            page_end=1,
            sections=[BookSection(title="skip", content="not included", page_start=1, page_end=1)],
        ),
        BookChapter(
            index=1,
            title="Scale",
            page_start=2,
            page_end=8,
            sections=[
                BookSection(title="core", content="Scale changes tradeoffs.", page_start=2, page_end=3),
                BookSection(title="later", content="Outside range.", page_start=7, page_end=8),
            ],
        ),
    ]


def test_build_source_text_for_slice_includes_only_overlapping_sections():
    text = build_source_text_for_slice(_chapters(), _slice(2, 5))

    assert "CHAPTER 1: Scale" in text
    assert "Scale changes tradeoffs." in text
    assert "Outside range" not in text
    assert "not included" not in text


def test_build_source_text_for_slice_keeps_empty_chapter_header():
    text = build_source_text_for_slice(_chapters(), _slice(4, 5))

    assert text == "CHAPTER 1: Scale (pages 2-8)"


def test_build_generation_options_merges_project_and_run_options():
    options = build_generation_options(
        project=ProjectStub(),
        source_has_more=True,
        extra_options={"style": "manga", "source_text": "hello"},
    )

    assert options["style"] == "manga"
    assert options["engine"] == "v4"
    assert options["source_has_more"] is True
    assert options["source_text"] == "hello"
    assert options["llm_validation_attempts"] == 2


def test_build_v2_generation_stages_has_expected_order():
    stage_names = [stage.__module__.rsplit(".", 1)[-1] for stage in build_v2_generation_stages()]

    assert stage_names == [
        "source_fact_extraction_stage",
        "adaptation_plan_stage",
        "character_world_bible_stage",
        "beat_sheet_stage",
        "manga_script_stage",
        "storyboard_stage",
        "quality_gate_stage",
        "quality_repair_stage",
        "quality_gate_stage",
        "storyboard_to_v4_stage",
    ]


def test_serialize_llm_trace_keeps_compact_metadata():
    trace = LLMInvocationTrace(
        stage_name=LLMStageName.MANGA_SCRIPT,
        provider="fake",
        model="fake-scriptwriter",
        attempts=[
            LLMCallAttempt(
                attempt_index=1,
                input_tokens=10,
                output_tokens=20,
                estimated_cost_usd=0.123456,
                content_preview="preview",
                issues=(LLMValidationIssue(code="x", message="bad"),),
            )
        ],
    )

    data = serialize_llm_trace(trace)

    assert data["stage_name"] == "manga_script"
    assert data["total_input_tokens"] == 10
    assert data["attempts"][0]["issues"][0]["message"] == "bad"
