"""Content-quality validators for authored page scripts (Session 6 step 0.1).

Session 5 HEADLINE FINDING, measured live: the Session 4 ACCEPTED WMC page
scripts carried ONE-WORD story beats ("hook", "conflict") and ZERO text
elements. Consequences downstream were all measured, not theoretical — the
lane-C image model drew from nearly-empty briefs (content drift into
invented imagery), vision-QA brief matching was noisy, and code-owned
lettering had nothing to letter. The rendering mechanism was proven while
the page-writing CONTENT became the binding constraint.

This module is the deterministic backstop for that defect class, shaped
exactly like the Session 4/5 craft gate (`manga_craft_validation`): each
rule has a stable code, a warn-vs-block policy, and a red fixture in
``tests/test_manga_content_validation_v2.py``.

Two policy tiers exist ON PURPOSE (enumerated in the ADR-012 Session 6
addendum):

- ``CONTENT_RULE_POLICY`` — applied inside the ported
  ``MangaPagePlanningService.submit_page_script_set`` (every submission
  path). It blocks the measured live defect class: thin beats anywhere and
  a set with no text elements at all. A page-level text gap only WARNS at
  this tier because the donor's verbatim-ported phase1 fixtures (the
  ``manga_page_plan.action.v1`` page carries zero text elements) must stay
  byte-identical and green per the ADR-010/012 port rule.
- ``AGENT_CONTENT_RULE_POLICY`` — applied at the agent submission seam
  (``MangaPlanningToolService._submit_page_script_set``, the only path a
  sealed model can reach). It escalates ``PAGE_TEXT_ELEMENTS_MISSING`` to
  block: narration and captions need no speaker, so an empty accepted
  context is never a reason for an agent to deliver a wordless page.
"""

from __future__ import annotations

from typing import Literal

from app.contracts.manga import PageScriptSet, PageValidationIssue

CONTENT_VALIDATOR_VERSION = "manga-content-validator.v1"

#: Warn-vs-block policy for every submission path (service tier).
CONTENT_RULE_POLICY: dict[str, Literal["warn", "block"]] = {
    "STORY_BEAT_TOO_THIN": "block",
    "SET_TEXT_ELEMENTS_MISSING": "block",
    "PAGE_TEXT_ELEMENTS_MISSING": "warn",
    "DIALOGUE_VOICE_ABSENT": "warn",
    "PANEL_TEXT_COVERAGE_LOW": "warn",
}

#: Agent-seam overlay: a sealed model must letter every page.
AGENT_CONTENT_RULE_POLICY: dict[str, Literal["warn", "block"]] = {
    **CONTENT_RULE_POLICY,
    "PAGE_TEXT_ELEMENTS_MISSING": "block",
}

#: A story beat below BOTH lines is a label, not a beat. The measured
#: defect class ("hook", "conflict", "reveal") sits at one word; real donor
#: fixture beats ("A map collapses into a global network.") sit at 6-8
#: words. The line deliberately passes terse-but-real beats like
#: "Haw finds new cheese" while failing every one-word label.
MIN_BEAT_WORDS = 4
MIN_BEAT_CHARS = 20

#: Fraction of a page's panels that should carry at least one text element
#: before the coverage warning stops firing.
PANEL_TEXT_COVERAGE_MIN = 0.5

#: TextElement kinds that count as spoken/voiced content.
VOICE_KINDS = {"dialogue", "thought", "monologue"}


def _issue(code: str, message: str, path: str) -> PageValidationIssue:
    return PageValidationIssue(
        code=code,
        severity="warning",
        message=message,
        path=path,
        node_id=None,
    )


def validate_script_content(script_set: PageScriptSet) -> list[PageValidationIssue]:
    """All content-quality issues at warning severity (policy applied later)."""
    issues: list[PageValidationIssue] = []
    issues.extend(_beat_substance_issues(script_set))
    issues.extend(_text_presence_issues(script_set))
    issues.extend(_voice_and_coverage_issues(script_set))
    return issues


def apply_content_policy(
    issues: list[PageValidationIssue],
    policy: dict[str, Literal["warn", "block"]] | None = None,
) -> list[PageValidationIssue]:
    """Escalate blocked content rules to error severity (craft-gate shape)."""
    effective = policy or CONTENT_RULE_POLICY
    return [
        issue.model_copy(update={"severity": "error"})
        if effective.get(issue.code) == "block"
        else issue
        for issue in issues
    ]


def validate_script_content_enforced(
    script_set: PageScriptSet,
    *,
    policy: dict[str, Literal["warn", "block"]] | None = None,
) -> list[PageValidationIssue]:
    """Content issues with a warn-vs-block policy applied — the live entry."""
    return apply_content_policy(validate_script_content(script_set), policy)


def blocking_content_errors(
    issues: list[PageValidationIssue],
) -> list[PageValidationIssue]:
    return [issue for issue in issues if issue.severity == "error"]


def _beat_substance_issues(script_set: PageScriptSet) -> list[PageValidationIssue]:
    issues: list[PageValidationIssue] = []
    for page_index, page in enumerate(script_set.pages):
        for panel_index, panel in enumerate(page.panels):
            beat = panel.story_beat.strip()
            words = [token for token in beat.split() if token]
            if len(words) < MIN_BEAT_WORDS and len(beat) < MIN_BEAT_CHARS:
                issues.append(
                    _issue(
                        "STORY_BEAT_TOO_THIN",
                        f"Panel {panel.panel_id} story_beat {beat!r} is a "
                        f"{len(words)}-word label, not a story beat. Write a "
                        "concrete, source-grounded sentence: WHO does WHAT, "
                        "WHERE — e.g. 'Haw hesitates at the dark maze "
                        "junction, clutching his last cheese crumb.'",
                        f"/pages/{page_index}/panels/{panel_index}/story_beat",
                    )
                )
    return issues


def _text_presence_issues(script_set: PageScriptSet) -> list[PageValidationIssue]:
    issues: list[PageValidationIssue] = []
    total_text = sum(len(page.text_elements) for page in script_set.pages)
    if total_text == 0:
        issues.append(
            _issue(
                "SET_TEXT_ELEMENTS_MISSING",
                "The entire PageScriptSet carries ZERO text elements — "
                "nothing for the deterministic lettering stage to render. "
                "Author real dialogue (speaker_ref from accepted "
                "continuity) and/or narration captions on every page.",
                "/pages",
            )
        )
    for page_index, page in enumerate(script_set.pages):
        if not page.text_elements:
            issues.append(
                _issue(
                    "PAGE_TEXT_ELEMENTS_MISSING",
                    f"Page {page.page_id} has no text elements. Every page "
                    "needs at least one authored dialogue, thought, or "
                    "narration element; narration captions need no speaker, "
                    "so an empty character context is not a reason to skip "
                    "lettering.",
                    f"/pages/{page_index}/text_elements",
                )
            )
    return issues


def _voice_and_coverage_issues(script_set: PageScriptSet) -> list[PageValidationIssue]:
    issues: list[PageValidationIssue] = []
    has_voice = any(
        text.kind in VOICE_KINDS
        for page in script_set.pages
        for text in page.text_elements
    )
    if not has_voice and any(page.text_elements for page in script_set.pages):
        issues.append(
            _issue(
                "DIALOGUE_VOICE_ABSENT",
                "No dialogue, thought, or monologue anywhere in the set — "
                "caption-only pages read as a slideshow, not manga. Give "
                "characters from accepted continuity real spoken lines "
                "where the source supports them.",
                "/pages",
            )
        )
    for page_index, page in enumerate(script_set.pages):
        if not page.panels or not page.text_elements:
            continue
        covered = {text.panel_id for text in page.text_elements}
        coverage = len([p for p in page.panels if p.panel_id in covered]) / len(
            page.panels
        )
        if coverage < PANEL_TEXT_COVERAGE_MIN:
            issues.append(
                _issue(
                    "PANEL_TEXT_COVERAGE_LOW",
                    f"Only {coverage:.0%} of page {page.page_id}'s panels "
                    "carry text; silent panels are a deliberate craft choice "
                    "for at most a minority of a page's beats.",
                    f"/pages/{page_index}/text_elements",
                )
            )
    return issues
