"""Tests for the Phase 2 source-grounding & memory deliverables.

Pins the invariants spelled out in `docs/MANGA_PHASE_PLAN.md` so a
future change cannot silently regress them.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.domain.manga import (
    Beat,
    BeatSheet,
    EmotionalTone,
    MangaScript,
    MangaScriptScene,
    ScriptLine,
    SourceFact,
    SourceRange,
    SourceSlice,
    SourceSliceMode,
    StoryboardPage,
    StoryboardPanel,
    PanelPurpose,
    ShotType,
    ContinuityLedger,
    build_continuation_prompt_context,
    build_recap_seed,
    update_ledger_after_slice,
)
from app.services.manga.grounding_validator import validate_grounding


# ---------------------------------------------------------------------------
# Tiny fixture helpers. Keep them minimal so the tests read as one assertion
# each.
# ---------------------------------------------------------------------------

def _slice(slice_id: str = "slice_001") -> SourceSlice:
    return SourceSlice(
        slice_id=slice_id,
        book_id="book_123",
        mode=SourceSliceMode.PAGES,
        source_range=SourceRange(page_start=1, page_end=10),
    )


def _beat_sheet(*, fact_ids: list[str]) -> BeatSheet:
    return BeatSheet(
        slice_id="slice_001",
        slice_role="ki",
        beats=[
            Beat(
                beat_id="b1",
                story_function="Setup the puzzle.",
                source_fact_ids=fact_ids,
            )
        ],
    )


def _scene(*, scene_id: str, dialogue: list[ScriptLine]) -> MangaScriptScene:
    return MangaScriptScene(
        scene_id=scene_id,
        beat_ids=["b1"],
        location="lab",
        scene_goal="Establish the failing protocol.",
        action="Kai stares at the failing dashboard.",
        dialogue=dialogue,
        narration=[],
        emotional_tone=EmotionalTone.CURIOUS,
    )


def _storyboard_pages(*, hook: str = "") -> list[StoryboardPage]:
    panel = StoryboardPanel(
        panel_id="p1",
        scene_id="s1",
        purpose=PanelPurpose.SETUP,
        shot_type=ShotType.MEDIUM,
        composition="Kai centered, dashboard glow rim-lighting their face.",
        action="Kai stares.",
        narration="",
        character_ids=["kai"],
        source_fact_ids=["f001"],
    )
    return [
        StoryboardPage(
            page_id="page_001",
            page_index=0,
            panels=[panel],
            page_turn_hook=hook,
        )
    ]


# ---------------------------------------------------------------------------
# 2.1 — update_ledger_after_slice contract.
# ---------------------------------------------------------------------------

def test_update_ledger_after_slice_requires_keyword_arguments():
    """Pin the function signature so the generation_service call site
    cannot regress to positional args (the previous bug)."""
    ledger = ContinuityLedger(project_id="project_123")
    with pytest.raises(TypeError):
        # Positional ledger should be rejected — every arg is keyword-only.
        update_ledger_after_slice(  # type: ignore[misc]
            ledger,
            source_slice=_slice(),
            new_fact_ids=[],
            recap_for_next_slice="",
            last_page_hook="",
        )


def test_update_ledger_after_slice_advances_state():
    """Sanity-check the happy path: covered range added, fact set merged,
    recap + hook persisted, version bumped."""
    ledger = ContinuityLedger(project_id="project_123")
    starting_version = ledger.version
    updated = update_ledger_after_slice(
        ledger=ledger,
        source_slice=_slice(),
        new_fact_ids=["f001", "f002"],
        recap_for_next_slice="  Kai found the bug.  ",
        last_page_hook="  Cliffhanger: dashboard goes red.  ",
    )
    assert len(updated.covered_source_ranges) == 1
    assert updated.known_fact_ids == ["f001", "f002"]
    assert updated.recap_for_next_slice == "Kai found the bug."
    assert updated.last_page_hook == "Cliffhanger: dashboard goes red."
    assert updated.version == starting_version + 1


# ---------------------------------------------------------------------------
# 2.2 — build_recap_seed.
# ---------------------------------------------------------------------------

def test_build_recap_seed_combines_scene_goal_and_page_turn_hook():
    script = MangaScript(
        slice_id="slice_001",
        scenes=[
            _scene(
                scene_id="s1",
                dialogue=[
                    ScriptLine(
                        speaker_id="kai",
                        text="Same key fails.",
                        source_fact_ids=["f001"],
                    )
                ],
            )
        ],
    )
    pages = _storyboard_pages(hook="dashboard goes red")
    recap = build_recap_seed(manga_script=script, storyboard_pages=pages)
    assert "Establish the failing protocol." in recap
    assert "Cliffhanger: dashboard goes red" in recap


def test_build_recap_seed_is_deterministic_for_same_inputs():
    """Same inputs → byte-identical output. Required so the next slice's
    prompt does not flip-flop between regenerations."""
    script = MangaScript(
        slice_id="slice_001",
        scenes=[
            _scene(
                scene_id="s1",
                dialogue=[
                    ScriptLine(
                        speaker_id="kai",
                        text="Same key fails.",
                        source_fact_ids=["f001"],
                    )
                ],
            )
        ],
    )
    pages = _storyboard_pages(hook="dashboard goes red")
    assert build_recap_seed(manga_script=script, storyboard_pages=pages) == (
        build_recap_seed(manga_script=script, storyboard_pages=pages)
    )


def test_build_recap_seed_handles_missing_inputs_gracefully():
    # No script, no pages → empty string (the caller will store "" on the
    # ledger; downstream stages already tolerate that).
    assert build_recap_seed(manga_script=None, storyboard_pages=None) == ""
    assert build_recap_seed(manga_script=None, storyboard_pages=[]) == ""


def test_build_recap_seed_caps_long_output():
    long_goal = "x" * 500
    script = MangaScript(
        slice_id="slice_001",
        scenes=[
            MangaScriptScene(
                scene_id="s1",
                beat_ids=["b1"],
                location="lab",
                scene_goal=long_goal,
                action="…",
                dialogue=[
                    ScriptLine(
                        speaker_id="kai",
                        text="Same key fails.",
                        source_fact_ids=["f001"],
                    )
                ],
            )
        ],
    )
    recap = build_recap_seed(manga_script=script, storyboard_pages=[])
    # Cap is 240 chars (one ellipsis allowed). Hard ceiling so the next
    # slice's prompt budget cannot inflate via runaway scene goals.
    assert len(recap) <= 240


# ---------------------------------------------------------------------------
# 2.3 — manga_script_stage prompt includes continuity context.
# ---------------------------------------------------------------------------

def test_continuation_prompt_block_marker_present_when_ledger_has_history():
    """The script stage relies on the literal `MANGA CONTINUITY SO FAR:`
    marker to signal prior-slice context to the writer LLM. Pin it here so
    a refactor of `build_continuation_prompt_context` cannot silently
    drop the marker."""
    ledger = ContinuityLedger(project_id="project_123")
    ledger.add_covered_range(SourceRange(page_start=1, page_end=10))
    block = build_continuation_prompt_context(
        title="The Coherence Engine",
        logline="Curious engineer chases a bug that rewrites the rules.",
        ledger=ledger,
        facts=[],
        source_slice=_slice("slice_002"),
    )
    assert "MANGA CONTINUITY SO FAR:" in block


# ---------------------------------------------------------------------------
# 2.4 — grounding_validator.
# ---------------------------------------------------------------------------

def test_grounding_validator_flags_scene_with_no_cited_facts():
    """The scene's beat references f001 but no dialogue line cites
    anything → SCRIPT_SCENE_UNGROUNDED (error)."""
    script = MangaScript(
        slice_id="slice_001",
        scenes=[
            _scene(
                scene_id="s1",
                dialogue=[
                    ScriptLine(
                        speaker_id="kai",
                        text="The protocol fails when both nodes restart simultaneously and lose quorum.",
                    )
                ],
            )
        ],
    )
    issues = validate_grounding(script=script, beat_sheet=_beat_sheet(fact_ids=["f001"]))
    codes = {(issue.code, issue.severity) for issue in issues}
    assert ("SCRIPT_SCENE_UNGROUNDED", "error") in codes


def test_grounding_validator_passes_when_dialogue_cites_a_beat_fact():
    script = MangaScript(
        slice_id="slice_001",
        scenes=[
            _scene(
                scene_id="s1",
                dialogue=[
                    ScriptLine(
                        speaker_id="kai",
                        text="Same key, two writers, last one wins.",
                        source_fact_ids=["f001"],
                    )
                ],
            )
        ],
    )
    issues = validate_grounding(script=script, beat_sheet=_beat_sheet(fact_ids=["f001"]))
    assert all(issue.code != "SCRIPT_SCENE_UNGROUNDED" for issue in issues)


def test_grounding_validator_warns_only_for_substantive_ungrounded_lines():
    """A ≥60-char ungrounded line warns; a short flavour line does not."""
    script = MangaScript(
        slice_id="slice_001",
        scenes=[
            _scene(
                scene_id="s1",
                dialogue=[
                    ScriptLine(  # short flavour beat — must NOT trip the warn
                        speaker_id="kai",
                        text="Tch. Knew it.",
                    ),
                    ScriptLine(  # the substantive cited line keeps the scene grounded
                        speaker_id="kai",
                        text="Same key fails.",
                        source_fact_ids=["f001"],
                    ),
                    ScriptLine(  # 60+ chars, no fact id → WARN
                        speaker_id="rin",
                        text="That is exactly the symptom we should expect from a quorum split.",
                    ),
                ],
            )
        ],
    )
    issues = validate_grounding(script=script, beat_sheet=_beat_sheet(fact_ids=["f001"]))
    line_warnings = [
        issue for issue in issues if issue.code == "SCRIPT_LINE_UNGROUNDED"
    ]
    assert len(line_warnings) == 1
    assert line_warnings[0].speaker_id == "rin"
    assert line_warnings[0].severity == "warning"


def test_grounding_validator_ignores_scenes_whose_beats_have_no_facts():
    """Thread-only beats (no source_fact_ids) are legitimately ungrounded;
    flagging them would punish character-only scenes."""
    bs = BeatSheet(
        slice_id="slice_001",
        slice_role="ki",
        beats=[
            Beat(
                beat_id="b1",
                story_function="Open story thread about the missing key.",
                open_thread_id="t1",
            )
        ],
    )
    script = MangaScript(
        slice_id="slice_001",
        scenes=[
            _scene(
                scene_id="s1",
                dialogue=[ScriptLine(speaker_id="kai", text="Where is the key?")],
            )
        ],
    )
    issues = validate_grounding(script=script, beat_sheet=bs)
    assert issues == []
