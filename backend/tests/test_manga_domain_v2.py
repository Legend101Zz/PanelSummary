"""Tests for the v2 manga project domain foundation.

These are pure unit tests: no DB, no LLM, no Celery. Exactly how domain tests
should be. Fancy distributed failures can wait outside.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Settings
from app.domain.manga import (
    CharacterContinuityState,
    ContinuityLedger,
    CurrentStoryState,
    FactImportance,
    SliceRole,
    SourceFact,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
    StoryThread,
    build_continuation_prompt_context,
    merge_fact_registry,
    normalize_fact_text,
    should_add_to_be_continued,
    update_ledger_after_slice,
)


def _slice(slice_id: str = "slice_001") -> SourceSlice:
    return SourceSlice(
        slice_id=slice_id,
        book_id="book_123",
        mode=SourceSliceMode.PAGES,
        source_range=SourceRange(page_start=1, page_end=10, chapter_start=0, chapter_end=1),
        word_count=5000,
    )


def test_source_range_labels_pages_and_chapters():
    source_range = SourceRange(page_start=1, page_end=10, chapter_start=0, chapter_end=2)
    assert source_range.label() == "pages 1-10, chapters 0-2"


@pytest.mark.parametrize(
    "kwargs",
    [
        {"page_start": 10, "page_end": 1},
        {"chapter_start": 3, "chapter_end": 2},
        {"page_start": 0, "page_end": 1},
        {},
    ],
)
def test_source_range_rejects_invalid_ranges(kwargs):
    with pytest.raises(ValueError):
        SourceRange(**kwargs)


def test_source_slice_tracks_partial_chapter_boundaries():
    source_slice = SourceSlice(
        slice_id="slice_partial",
        book_id="book_123",
        mode=SourceSliceMode.PAGES,
        source_range=SourceRange(page_start=8, page_end=18, chapter_start=1, chapter_end=1),
        is_partial_chapter_start=True,
    )
    assert source_slice.is_partial is True
    assert source_slice.label() == "pages 8-18, chapters 1-1"


def test_normalize_fact_text_is_conservative():
    assert normalize_fact_text("  Scale-up: costs rise!! ") == "scale up costs rise"


def test_merge_fact_registry_keeps_existing_ids_and_dedupes():
    source_slice = _slice()
    existing = [
        SourceFact(
            fact_id="f001",
            text="The central thesis is that habits compound.",
            source_slice_id="slice_old",
            importance=FactImportance.THESIS,
        )
    ]

    merged, new_ids = merge_fact_registry(
        existing,
        [
            {"text": "The central thesis is that habits compound."},
            {"text": "Identity makes behavior change stick.", "importance": FactImportance.CORE},
        ],
        source_slice,
    )

    assert [fact.fact_id for fact in merged] == ["f001", "f002"]
    assert new_ids == ["f002"]
    assert merged[1].source_slice_id == "slice_001"


def test_merge_fact_registry_reassigns_colliding_ids():
    source_slice = _slice()
    existing = [SourceFact(fact_id="f001", text="Old fact", source_slice_id="slice_old")]

    merged, new_ids = merge_fact_registry(
        existing,
        [{"fact_id": "f001", "text": "New fact"}],
        source_slice,
    )

    assert [fact.fact_id for fact in merged] == ["f001", "f002"]
    assert new_ids == ["f002"]


def test_continuity_prompt_contains_story_state_facts_and_threads():
    source_slice = _slice("slice_002")
    ledger = ContinuityLedger(
        project_id="project_123",
        covered_source_ranges=[SourceRange(page_start=1, page_end=10)],
        current_story_state=CurrentStoryState(
            protagonist_state="Kai understands the first contradiction.",
            emotional_position="curious to unsettled",
            knowledge_state="Reader knows the thesis.",
        ),
        known_fact_ids=["f001"],
        open_threads=[
            StoryThread(
                thread_id="t001",
                question="Why does the obvious solution fail at scale?",
                introduced_in_slice="slice_001",
            )
        ],
        character_state={
            "kai": CharacterContinuityState(
                character_id="kai",
                arc_position="confident but challenged",
            )
        },
        recap_for_next_slice="Kai opened the first archive door.",
        last_page_hook="The numbers were only the shadow.",
    )
    facts = [
        SourceFact(
            fact_id="f001",
            text="The source argues that scale changes the tradeoff.",
            source_slice_id="slice_001",
            importance=FactImportance.CORE,
        )
    ]

    prompt = build_continuation_prompt_context(
        title="The Archive of Scale",
        logline="A reader learns why simple answers break under pressure.",
        ledger=ledger,
        facts=facts,
        source_slice=source_slice,
    )

    assert "MANGA CONTINUITY SO FAR" in prompt
    assert "Covered source: pages 1-10" in prompt
    assert "Next source slice: pages 1-10, chapters 0-1" in prompt
    assert "Kai understands the first contradiction" in prompt
    assert "f001: The source argues" in prompt
    assert "t001: Why does the obvious solution fail" in prompt
    assert "Do not repeat previous exposition" in prompt


def test_update_ledger_after_slice_tracks_coverage_and_version():
    ledger = ContinuityLedger(project_id="project_123")
    updated = update_ledger_after_slice(
        ledger=ledger,
        source_slice=_slice(),
        new_fact_ids=["f001", "f002", "f001"],
        recap_for_next_slice="Kai found the doorway.",
        last_page_hook="A second door appeared.",
    )

    assert updated.version == 2
    assert updated.known_fact_ids == ["f001", "f002"]
    assert updated.source_coverage_label() == "pages 1-10, chapters 0-1"
    assert updated.recap_for_next_slice == "Kai found the doorway."


@pytest.mark.parametrize(
    ("source_has_more", "role", "standalone", "expected"),
    [
        (True, SliceRole.OPENING, False, True),
        (True, SliceRole.CONTINUATION, False, True),
        (True, SliceRole.FINALE, False, False),
        (True, SliceRole.STANDALONE, False, False),
        (True, SliceRole.OPENING, True, False),
        (False, SliceRole.OPENING, False, False),
    ],
)
def test_to_be_continued_rules(source_has_more, role, standalone, expected):
    assert should_add_to_be_continued(
        source_has_more=source_has_more,
        slice_role=role,
        standalone=standalone,
    ) is expected


def test_pipeline_feature_flag_defaults_to_legacy():
    assert Settings().manga_pipeline_version == "legacy"
