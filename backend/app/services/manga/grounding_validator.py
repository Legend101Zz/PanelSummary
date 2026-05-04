"""Source-grounding heuristics for the manga script.

Phase 2.4 — keep the LLM honest. The script stage already RECEIVES the
full ``fact_registry`` and the ``ScriptLine`` schema already has a
``source_fact_ids`` field, but nothing actually CHECKS that the writer
used either. The result: dialogue that *sounds* on-topic but cannot be
traced back to a single fact in the source. That's hallucination
dressed as adaptation.

This module is the cheap, deterministic half. It runs alongside
``voice_validator`` inside ``script_review_stage`` so the LLM editor
sees grounding defects in the same report it sees voice defects, and
the existing ``script_repair_stage`` can fix both in one pass.

Two issue codes:

* ``SCRIPT_SCENE_UNGROUNDED`` (error) — a scene whose beats reference
  ≥1 source fact, yet not a single dialogue line OR narration line in
  that scene cites any of those facts. The scene is making claims the
  reader cannot verify.
* ``SCRIPT_LINE_UNGROUNDED`` (warning) — a substantive dialogue line
  (≥ ``_LINE_GROUNDING_MIN_CHARS`` characters) with empty
  ``source_fact_ids`` AND that doesn't match an obvious flavour pattern
  (interjection, single-word question). Warnings only — short character
  beats are legitimately ungrounded; we don't want to noise-flag every
  "Hm." or "Tch.".

Why heuristic-only:
- Free, deterministic, cannot regress when an LLM has a bad day.
- The editor LLM still gets the unredacted script + fact_registry, so
  it remains free to flag *semantic* drift (claim doesn't match the
  cited fact's text) — that's a much harder check, deferred to the
  Phase 5 panel critic.

Pure functions only — no I/O, no LLM calls.
"""

from __future__ import annotations

from app.domain.manga import (
    BeatSheet,
    MangaScript,
    MangaScriptScene,
    ScriptIssue,
)


# Flavour-line escape hatches. A dialogue line under this many characters
# is treated as a character beat (interjection, sigh, single-word reply)
# and not flagged for ungroundedness. The cap is intentionally low: a
# 60-char line ("The protocol fails when both nodes restart simultaneously.")
# IS substantive and SHOULD cite a fact. A 30-char line ("Tch. Knew it.") is
# mood, not exposition.
_LINE_GROUNDING_MIN_CHARS = 60


def _scene_beat_fact_ids(scene: MangaScriptScene, beat_sheet: BeatSheet) -> set[str]:
    """Return the union of source_fact_ids for every beat the scene maps to.

    A scene that maps to a beat with no facts (e.g. a thread-only beat) is
    legitimately ungrounded; the scene-level check ignores it.
    """
    beat_lookup = {beat.beat_id: beat for beat in beat_sheet.beats}
    fact_ids: set[str] = set()
    for beat_id in scene.beat_ids:
        beat = beat_lookup.get(beat_id)
        if beat is None:
            # The scene references a beat we don't have. Voice validator
            # owns "unknown beat" semantics; we just skip rather than
            # double-report.
            continue
        fact_ids.update(beat.source_fact_ids)
    return fact_ids


def _scene_cited_fact_ids(scene: MangaScriptScene) -> set[str]:
    """Return the union of source_fact_ids cited by the scene's lines.

    Narration lines have no fact-id list (they are bare strings on
    ``MangaScriptScene``), so we only inspect dialogue. This is a
    deliberate design choice: narration in manga is exposition glue,
    and asking the writer to attach fact ids to *every* caption line
    would create more friction than it removes hallucinations.
    """
    cited: set[str] = set()
    for line in scene.dialogue:
        cited.update(line.source_fact_ids)
    return cited


def validate_grounding(
    *,
    script: MangaScript,
    beat_sheet: BeatSheet,
) -> list[ScriptIssue]:
    """Run cheap grounding checks across a manga script.

    Returns a (possibly empty) list of ``ScriptIssue`` records the
    ``script_review_stage`` merges into its editor report. Pure function;
    safe to unit-test in isolation.
    """
    issues: list[ScriptIssue] = []

    for scene in script.scenes:
        beat_facts = _scene_beat_fact_ids(scene, beat_sheet)
        if beat_facts:
            cited = _scene_cited_fact_ids(scene)
            if not cited:
                # The beat sheet says this scene is meant to deliver
                # source facts; the writer delivered nothing the reader
                # can trace. That's the worst grounding defect we can
                # detect deterministically.
                issues.append(
                    ScriptIssue(
                        severity="error",
                        code="SCRIPT_SCENE_UNGROUNDED",
                        message=(
                            f"Scene maps to beats citing facts "
                            f"{sorted(beat_facts)} but no dialogue line "
                            f"references any of them."
                        ),
                        scene_id=scene.scene_id,
                        suggestion=(
                            "Attach the fact_id(s) the scene actually "
                            "delivers to the line(s) that deliver them, "
                            "and ensure the dialogue paraphrases the "
                            "source rather than inventing new claims."
                        ),
                    )
                )

        for line_index, line in enumerate(scene.dialogue):
            text = line.text.strip()
            if line.source_fact_ids:
                # The writer attached at least one fact id; we trust the
                # editor LLM to verify the *match*, not us.
                continue
            if len(text) < _LINE_GROUNDING_MIN_CHARS:
                # Short lines are character beats, not exposition. Letting
                # them through is a feature, not a bug.
                continue
            issues.append(
                ScriptIssue(
                    severity="warning",
                    code="SCRIPT_LINE_UNGROUNDED",
                    message=(
                        f"Line is {len(text)} chars (substantive) but "
                        "cites no source_fact_ids. The reader cannot "
                        "verify the claim."
                    ),
                    scene_id=scene.scene_id,
                    line_index=line_index,
                    speaker_id=line.speaker_id,
                    suggestion=(
                        "If the line paraphrases the source, attach the "
                        "matching fact_id. If it does not, rewrite as a "
                        "shorter character beat or replace with a fact "
                        "the source actually contains."
                    ),
                )
            )

    return issues
