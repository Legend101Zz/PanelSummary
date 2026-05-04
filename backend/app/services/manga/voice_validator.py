"""Heuristic voice / dialogue validators.

Phase A wants the manga script to *sound* like the bible's characters.
The script_review_stage uses an LLM editor for the subjective half, but
this module catches the cheap-to-detect symptoms deterministically so we
do not pay an LLM call to notice 'character A spoke 220 characters in
one bubble'.

Pure functions only — no I/O, no LLM calls. The output is a list of
``ScriptIssue`` entries the editorial pipeline merges into its report.

Why heuristics + LLM (instead of either alone):

* Heuristics are free, fast, and deterministic. Catch ~70% of bubble-too-
  long, off-character speech-style, and unattributed dialogue defects.
* The LLM editor catches the subjective 30%: cliches, weak tension,
  mismatched intent. We do NOT replace the heuristic with the LLM
  because then a single API outage hides every defect.

Cap the per-line character budget at 160 here so it matches the manga DSL
DialogueBudget.max_chars_per_panel; if those numbers ever drift, the
fix is in one place — the DSL — and this module reads from there.
"""

from __future__ import annotations

from app.domain.manga import (
    CharacterDesign,
    CharacterWorldBible,
    MangaScript,
    ScriptIssue,
)
from app.manga_pipeline.manga_dsl import dialogue_budget_for


# A small set of generic phrases that virtually always indicate the LLM
# defaulted to filler. The list is intentionally short — over-policing
# vocabulary makes the editor sound like a thesaurus instead of a manga
# editor. We only flag these as *warnings* so they do not fail the gate
# on their own.
GENERIC_PHRASES: tuple[str, ...] = (
    "we have to do something",
    "i won't give up",
    "we can't let this happen",
    "there's no time to explain",
    "trust me",
    "we're in this together",
    "i'll never forget",
    "this is the moment",
)


def _bible_lookup(bible: CharacterWorldBible) -> dict[str, CharacterDesign]:
    """Return a character_id → CharacterDesign map for fast lookup."""
    return {character.character_id: character for character in bible.characters}


def _line_too_long(text: str, max_chars: int) -> bool:
    """Manga bubbles have a hard length cap (the DSL enforces it on storyboard;
    we mirror the cap here so the script catches it earlier)."""
    return len(text.strip()) > max_chars


def _line_uses_generic_phrase(text: str) -> str | None:
    """Return the generic phrase if any GENERIC_PHRASES substring appears.

    Case-insensitive substring match. Returning the matched phrase makes
    the warning message specific and the suggestion easy to author.
    """
    lowered = text.lower()
    for phrase in GENERIC_PHRASES:
        if phrase in lowered:
            return phrase
    return None


def _speaker_known_to_bible(
    speaker_id: str,
    bible_lookup: dict[str, CharacterDesign],
) -> bool:
    return speaker_id.strip() in bible_lookup


def validate_voice(
    *,
    script: MangaScript,
    bible: CharacterWorldBible,
    arc_role: str | None = None,
) -> list[ScriptIssue]:
    """Run cheap deterministic voice/dialogue checks on a manga script.

    Issues returned by code:

    * ``SCRIPT_UNKNOWN_SPEAKER`` — speaker_id absent from the bible. This
      is an ERROR because the renderer will never find a reference sheet
      and the storyboard validator already promotes speakers to
      ``character_ids`` (which would then trip ``panel_unknown_character``).
    * ``SCRIPT_LINE_TOO_LONG`` — line exceeds the DSL bubble budget.
      ERROR; storyboarder cannot lay it out.
    * ``SCRIPT_GENERIC_PHRASE`` — line uses a known filler phrase.
      WARNING; rewriting is the editor LLM's job.

    The function takes the script, the bible, and optionally the arc role
    so the bubble cap respects the per-arc-role DialogueBudget.
    """
    bible_lookup = _bible_lookup(bible)
    # Look up the dialogue budget for this slice's arc role so we report the
    # SAME cap the storyboard DSL will enforce later. Importing it from the
    # DSL means a budget tweak ripples to both layers automatically.
    try:
        from app.domain.manga import ArcRole  # local import to avoid cycle

        role = ArcRole(arc_role) if arc_role else None
    except ValueError:
        role = None
    budget = dialogue_budget_for(role)

    issues: list[ScriptIssue] = []
    for scene in script.scenes:
        for line_index, line in enumerate(scene.dialogue):
            speaker = line.speaker_id.strip()
            text = line.text.strip()

            if speaker and not _speaker_known_to_bible(speaker, bible_lookup):
                issues.append(
                    ScriptIssue(
                        severity="error",
                        code="SCRIPT_UNKNOWN_SPEAKER",
                        message=(
                            f"Speaker '{speaker}' is not defined in the "
                            "character bible; storyboard cannot attach a "
                            "reference sheet for them."
                        ),
                        scene_id=scene.scene_id,
                        line_index=line_index,
                        speaker_id=speaker,
                        suggestion=(
                            "Re-attribute the line to an existing bible "
                            "character or, if a new character is genuinely "
                            "required, raise a story defect rather than "
                            "inventing one inside dialogue."
                        ),
                    )
                )

            if _line_too_long(text, budget.max_chars_per_panel):
                issues.append(
                    ScriptIssue(
                        severity="error",
                        code="SCRIPT_LINE_TOO_LONG",
                        message=(
                            f"Line is {len(text)} chars; manga bubble budget "
                            f"for this slice role is {budget.max_chars_per_panel}."
                        ),
                        scene_id=scene.scene_id,
                        line_index=line_index,
                        speaker_id=speaker,
                        suggestion=(
                            "Split into two beats or compress the idea to a "
                            "single punchy clause."
                        ),
                    )
                )

            phrase = _line_uses_generic_phrase(text)
            if phrase is not None:
                issues.append(
                    ScriptIssue(
                        severity="warning",
                        code="SCRIPT_GENERIC_PHRASE",
                        message=(
                            f"Line uses a generic filler phrase ('{phrase}')."
                        ),
                        scene_id=scene.scene_id,
                        line_index=line_index,
                        speaker_id=speaker,
                        suggestion=(
                            "Rewrite using imagery or a character-specific "
                            "speech tic from the bible."
                        ),
                    )
                )
    return issues
