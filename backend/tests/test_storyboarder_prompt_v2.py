"""Phase 4.4 \u2014 storyboarder prompt copy is the editorial intervention.

Pins the prompt directives that turn the storyboarder into a deliberate
shot designer instead of a default-MEDIUM emitter. The 4.3 validators
*measure* shot variety after the fact; 4.4 makes the LLM *author* it
upfront.

Why these tests exist
---------------------
The prompt copy is hand-tuned text that flows through three stages
(storyboard, manga_script, beat_sheet) via a shared fragment. Without
snapshot tests, a well-meaning edit ("this paragraph reads better")
can silently delete the only line that tells the LLM about the
dominance ceiling, and the only signal is a real generation regressing
weeks later.

Each test pins a single directive by substring. We deliberately don't
snapshot the whole fragment \u2014 verbatim snapshots break on every minor
copy edit and train people to rubber-stamp diffs. Substring asserts
break only when a specific *invariant* gets dropped.

What this module owns vs. what 4.3 owns
---------------------------------------
4.3 owns the validators (the measurement). 4.4 owns the LLM-facing
copy (the intervention). The constants live in shot_variety.py
once \u2014 both modules consume them \u2014 so a threshold tweak (e.g.
dominance to 65%) updates the validator AND the prompt in one edit
and the same test run pins both surfaces.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.manga_pipeline.manga_dsl import render_dsl_prompt_fragment
from app.manga_pipeline.shot_variety import (
    DOMINANCE_THRESHOLD,
    MAX_CONSECUTIVE_SAME_SHOT_TYPE,
    render_shot_variety_prompt_fragment,
)
from app.manga_pipeline.stages.storyboard_stage import SYSTEM_PROMPT


# --- render_shot_variety_prompt_fragment -------------------------------------


def test_fragment_mentions_shot_rotation_with_consecutive_cap():
    """The LLM must be told the consecutive-shot ceiling explicitly."""
    fragment = render_shot_variety_prompt_fragment()
    assert "rotation" in fragment.lower()
    # The number itself must appear so a future bump to 3 surfaces in the prompt.
    assert str(MAX_CONSECUTIVE_SAME_SHOT_TYPE) in fragment


def test_fragment_mentions_dominance_ceiling_with_threshold_percent():
    """Dominance ceiling must be communicated in the same units the validator uses."""
    fragment = render_shot_variety_prompt_fragment()
    expected_pct = f"{int(DOMINANCE_THRESHOLD * 100)}%"
    assert "dominance" in fragment.lower()
    assert expected_pct in fragment


def test_fragment_mentions_establishing_beat_with_wide_shot_types():
    """The establishing-beat rule must name the shot types that satisfy it."""
    fragment = render_shot_variety_prompt_fragment()
    assert "establishing" in fragment.lower()
    assert "WIDE" in fragment
    assert "EXTREME_WIDE" in fragment


def test_fragment_links_shot_choice_to_editorial_purpose():
    """The 'purpose drives shot' rule is the lever that prevents lazy MEDIUM-everything."""
    fragment = render_shot_variety_prompt_fragment()
    lower = fragment.lower()
    assert "purpose" in lower
    # Each named purpose -> shot type pairing must reach the LLM. We pin a
    # representative pair from each cluster (close vs wide vs insert vs symbolic).
    assert "REVEAL" in fragment or "REACTION" in fragment
    assert "CLOSE_UP" in fragment
    assert "WIDE" in fragment
    assert "INSERT" in fragment
    assert "SYMBOLIC" in fragment


def test_fragment_has_no_leading_or_trailing_newline():
    """Caller controls join behaviour; the fragment must not pre-pad newlines.

    Otherwise it lands in the larger DSL fragment as a blank line and the
    bullet styling breaks.
    """
    fragment = render_shot_variety_prompt_fragment()
    assert not fragment.startswith("\n")
    assert not fragment.endswith("\n")


def test_fragment_uses_dash_bullet_style_to_match_surrounding_block():
    """Style consistency \u2014 every line in the fragment is a `- ` bullet."""
    fragment = render_shot_variety_prompt_fragment()
    for line in fragment.split("\n"):
        # Continuation lines for wrapped bullets are indented; only the
        # first column matters. Every non-empty starting line must be a bullet.
        if line and not line.startswith(" "):
            assert line.startswith("- "), f"non-bullet leading line: {line!r}"


# --- render_dsl_prompt_fragment composes the shot-variety fragment -----------


def test_dsl_fragment_includes_shot_variety_directives():
    """The DSL fragment is the wire \u2014 the shot-variety block must land in it.

    A future refactor that drops the call from render_dsl_prompt_fragment
    would silently revert the LLM to the pre-4.4 prompt; this test fails
    that refactor immediately.
    """
    dsl_fragment = render_dsl_prompt_fragment(None)
    shot_fragment = render_shot_variety_prompt_fragment()
    # Pin the substantive substrings rather than the whole block so that
    # cosmetic edits to surrounding lines don't cascade into snapshot churn.
    assert "shot rotation" in dsl_fragment
    assert "dominance ceiling" in dsl_fragment
    assert "establishing beat" in dsl_fragment
    # And confirm the threshold percent reaches the LLM through the DSL.
    expected_pct = f"{int(DOMINANCE_THRESHOLD * 100)}%"
    assert expected_pct in dsl_fragment
    # Sanity: the shot fragment as a contiguous block exists in the DSL
    # fragment (not just its parts in different orders).
    assert shot_fragment in dsl_fragment


def test_dsl_fragment_keeps_existing_cardinality_line():
    """Backwards compatibility: the legacy 'distinct shot types' line stays.

    The cardinality validator (DSL_LOW_SHOT_VARIETY) is independent of the
    new 4.3 checks; it must keep firing AND the LLM must keep being told.
    """
    dsl_fragment = render_dsl_prompt_fragment(None)
    assert "distinct shot types" in dsl_fragment


# --- storyboard_stage SYSTEM_PROMPT (the system message context) ------------


def test_storyboard_system_prompt_mentions_shot_rotation():
    """The system prompt sets the storyboarder's stance before the user message."""
    assert "vary shot types panel-to-panel" in SYSTEM_PROMPT


def test_storyboard_system_prompt_mentions_establishing_beat():
    """The system message must reinforce the establishing-beat rule."""
    lower = SYSTEM_PROMPT.lower()
    assert "establishing beat" in lower
    assert "in-medias-res" in lower  # acknowledge the legitimate exception


def test_storyboard_system_prompt_mentions_purpose_drives_shot():
    """The 'shot follows purpose' rule is the lever; it must be in the system prompt."""
    lower = SYSTEM_PROMPT.lower()
    assert "editorial intent" in lower or "purpose" in lower
    assert "REVEAL" in SYSTEM_PROMPT or "REACTION" in SYSTEM_PROMPT


def test_storyboard_system_prompt_requires_composition_note_per_panel():
    """Phase 4.2 reads composition prose verbatim; the LLM must know to write it."""
    assert "composition" in SYSTEM_PROMPT.lower()
    assert "framing" in SYSTEM_PROMPT.lower()
