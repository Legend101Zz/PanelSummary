"""Continuity gate stage — deterministic checks across slice boundaries.

The DSL validation stage already enforces structural constraints on the
storyboard (panel count, dialogue budget, anchor facts within the slice,
shot variety). What it does NOT check is whether the slice connects
cleanly to its neighbours and to the global arc outline:

* Did the storyboard honour the prior slice's ``last_page_hook``?
* Does the closing page actually deliver the arc entry's
  ``closing_hook``?
* Does the storyboard cover the arc entry's ``must_cover_fact_ids``?
  (DSL enforces the slice-local adaptation_plan.important_fact_ids,
  which can drift from the arc's per-slice plan when both exist.)
* Is the protagonist on stage in any non-recap slice?

These are *cheap* deterministic checks. We push them into the same
``QualityReport`` the existing repair loop consumes — same rationale as
``dsl_validation_stage``: one repair tool, one issue stream.

This stage NEVER calls the LLM.
"""

from __future__ import annotations

from app.domain.manga import (
    ArcRole,
    PanelPurpose,
    QualityIssue,
    QualityReport,
    StoryboardPage,
)
from app.manga_pipeline.context import PipelineContext


# Roles where the protagonist should be on stage. RECAP slices are
# allowed to be montage-style and may legitimately not feature the
# protagonist directly.
ROLES_REQUIRING_PROTAGONIST: frozenset[ArcRole] = frozenset(
    {ArcRole.KI, ArcRole.SHO, ArcRole.TEN, ArcRole.KETSU}
)


def _issue(severity: str, code: str, message: str, artifact_id: str = "") -> QualityIssue:
    return QualityIssue(
        severity=severity, code=code, message=message, artifact_id=artifact_id
    )


def _all_panel_fact_ids(pages: list[StoryboardPage]) -> set[str]:
    return {
        fact_id
        for page in pages
        for panel in page.panels
        for fact_id in panel.source_fact_ids
    }


def _all_character_ids(pages: list[StoryboardPage]) -> set[str]:
    return {
        char_id
        for page in pages
        for panel in page.panels
        for char_id in panel.character_ids
    }


def _hook_text_present(pages: list[StoryboardPage], expected_hook: str) -> bool:
    """Return True when ``expected_hook`` appears in ANY page-turn hook,
    panel narration, or panel action prose. The match is intentionally
    fuzzy (lowercase substring of the first 5 words) because the writer
    will paraphrase rather than copy the editor's hook verbatim.
    """
    if not expected_hook.strip():
        return True  # nothing to honour, nothing to fail.
    needle = " ".join(expected_hook.lower().split()[:5])
    if not needle:
        return True
    for page in pages:
        if needle in page.page_turn_hook.lower():
            return True
        for panel in page.panels:
            if needle in panel.action.lower() or needle in panel.narration.lower():
                return True
    return False


def _closing_page_has_tbc(pages: list[StoryboardPage]) -> bool:
    if not pages:
        return False
    last = pages[-1]
    return any(panel.purpose == PanelPurpose.TO_BE_CONTINUED for panel in last.panels)


def _merge_issues_into_report(
    existing: QualityReport | None,
    new_issues: list[QualityIssue],
    *,
    grounded_fact_ids: set[str] | None = None,
    missing_fact_ids: set[str] | None = None,
) -> QualityReport:
    """Merge new issues into an existing report (same shape as
    dsl_validation_stage._merge_issues_into_report — kept duplicated to
    avoid a cross-import for one tiny helper).

    Phase 2.5: this helper now also populates ``grounded_fact_ids`` and
    ``missing_fact_ids`` on the merged report. The continuity gate is the
    only place in the pipeline that has *both* the storyboard's cited
    facts and the arc entry's must-cover list, so this is where the
    coverage data has to land.

    We MERGE rather than REPLACE: if an upstream stage already populated
    these sets (it doesn't today, but the contract should not depend on
    that), we union, not overwrite.
    """
    grounded = sorted(grounded_fact_ids or set())
    missing = sorted(missing_fact_ids or set())
    if existing is None:
        return QualityReport(
            passed=not any(issue.severity == "error" for issue in new_issues),
            issues=list(new_issues),
            grounded_fact_ids=grounded,
            missing_fact_ids=missing,
        )
    combined = list(existing.issues) + list(new_issues)
    has_error = any(issue.severity == "error" for issue in combined)
    merged_grounded = sorted(set(existing.grounded_fact_ids) | set(grounded))
    merged_missing = sorted(set(existing.missing_fact_ids) | set(missing))
    return QualityReport(
        passed=not has_error,
        issues=combined,
        grounded_fact_ids=merged_grounded,
        missing_fact_ids=merged_missing,
        notes=existing.notes,
    )


def _check_arc_must_cover(
    pages: list[StoryboardPage],
    arc_must_cover: list[str],
) -> list[QualityIssue]:
    if not arc_must_cover:
        return []
    grounded = _all_panel_fact_ids(pages)
    missing = sorted(set(arc_must_cover) - grounded)
    return [
        _issue(
            "error",
            "CONTINUITY_ARC_FACT_MISSING",
            f"Arc entry requires fact {fact_id} but no panel cites it.",
            fact_id,
        )
        for fact_id in missing
    ]


def _check_prior_hook(
    pages: list[StoryboardPage],
    prior_hook: str,
) -> list[QualityIssue]:
    if not prior_hook.strip():
        return []
    if _hook_text_present(pages, prior_hook):
        return []
    return [
        _issue(
            "warning",
            "CONTINUITY_HOOK_DROPPED",
            "Storyboard does not appear to honour the prior slice's closing hook.",
        )
    ]


def _check_arc_closing_hook(
    pages: list[StoryboardPage],
    arc_closing_hook: str,
) -> list[QualityIssue]:
    if not arc_closing_hook.strip() or not pages:
        return []
    last_page = pages[-1]
    text = last_page.page_turn_hook.lower()
    needle = " ".join(arc_closing_hook.lower().split()[:5])
    if needle and needle in text:
        return []
    # Also accept the hook prose appearing in the last page's panel narration
    # since the writer often pays it off in the bubble rather than as a meta
    # hook line.
    if any(needle in panel.narration.lower() for panel in last_page.panels):
        return []
    return [
        _issue(
            "warning",
            "CONTINUITY_ARC_CLOSING_HOOK_MISSING",
            "Last page does not deliver the arc entry's closing hook.",
            last_page.page_id,
        )
    ]


def _check_protagonist_on_stage(
    pages: list[StoryboardPage],
    arc_role: ArcRole | None,
    protagonist_id: str,
) -> list[QualityIssue]:
    if arc_role is None or arc_role not in ROLES_REQUIRING_PROTAGONIST:
        return []
    if not protagonist_id.strip():
        return []
    if protagonist_id in _all_character_ids(pages):
        return []
    return [
        _issue(
            "error",
            "CONTINUITY_PROTAGONIST_OFFSCREEN",
            f"Protagonist '{protagonist_id}' is absent from a {arc_role.value.upper()} slice.",
        )
    ]


def _resolve_protagonist_id(context: PipelineContext) -> str:
    """Find the protagonist's character_id by matching the adaptation plan's
    ``protagonist_contract.who`` against the bible's character roles.

    We do a forgiving match: if any character has role 'protagonist' (or
    similar), use them. Otherwise, look for a name match. We return an
    empty string when we cannot resolve — the gate then skips the
    protagonist check rather than emitting a false-positive error.
    """
    bible = context.character_bible
    plan = context.adaptation_plan
    if bible is None or plan is None:
        return ""
    who = plan.protagonist_contract.who.strip().lower()
    # Prefer an explicit role match first.
    for character in bible.characters:
        if character.role.lower() in {"protagonist", "lead", "main", "main character"}:
            return character.character_id
    # Fall back to a name match against the protagonist contract.
    for character in bible.characters:
        if character.name.strip().lower() in who:
            return character.character_id
        if who and who in character.name.strip().lower():
            return character.character_id
    return ""


async def run(context: PipelineContext) -> PipelineContext:
    """Run continuity checks and merge issues into the quality report."""
    if not context.storyboard_pages:
        # The dsl_validation_stage raises in this situation; we mirror that
        # contract so this stage cannot be reordered before storyboarding.
        raise ValueError(
            "continuity_gate requires context.storyboard_pages; run storyboard first"
        )

    issues: list[QualityIssue] = []

    arc_entry = context.arc_entry
    arc_must_cover = arc_entry.must_cover_fact_ids if arc_entry else []
    arc_closing_hook = arc_entry.closing_hook if arc_entry else ""
    arc_role = arc_entry.role if arc_entry else None

    issues.extend(_check_arc_must_cover(context.storyboard_pages, arc_must_cover))
    issues.extend(_check_arc_closing_hook(context.storyboard_pages, arc_closing_hook))

    prior_hook = ""
    if context.prior_continuity is not None:
        prior_hook = context.prior_continuity.last_page_hook or ""
    issues.extend(_check_prior_hook(context.storyboard_pages, prior_hook))

    protagonist_id = _resolve_protagonist_id(context)
    issues.extend(
        _check_protagonist_on_stage(context.storyboard_pages, arc_role, protagonist_id)
    )

    # If this slice has a TBC panel but the arc says we are at the FINAL
    # entry, that is a continuity defect (the arc has nothing to continue
    # to). The DSL gate catches "missing TBC when expected"; we add the
    # symmetric check here because the arc outline is the source of truth
    # for "is this the final slice".
    if (
        arc_entry is not None
        and arc_role == ArcRole.KETSU
        and _closing_page_has_tbc(context.storyboard_pages)
    ):
        issues.append(
            _issue(
                "warning",
                "CONTINUITY_TBC_AFTER_KETSU",
                "Final (KETSU) slice ends with a To Be Continued panel; the arc is meant to land here.",
            )
        )

    # Phase 2.5: the storyboard's per-panel cited facts and the arc
    # entry's must-cover list together tell us what landed and what got
    # dropped. Surface that into the QualityReport so the QA panel can
    # show "5/7 critical facts covered" without re-deriving it.
    cited_in_storyboard = _all_panel_fact_ids(context.storyboard_pages)
    arc_must_cover_set = set(arc_must_cover)
    grounded_for_arc = (
        cited_in_storyboard & arc_must_cover_set
        if arc_must_cover_set
        else cited_in_storyboard
    )
    missing_for_arc = arc_must_cover_set - cited_in_storyboard

    context.quality_report = _merge_issues_into_report(
        context.quality_report,
        issues,
        grounded_fact_ids=grounded_for_arc,
        missing_fact_ids=missing_for_arc,
    )
    return context
