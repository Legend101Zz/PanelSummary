"""Manga DSL — structural constraints for storyboards, scripts, and beats.

This module is the EXECUTABLE form of ``docs/MANGA_DSL_SPEC.md``. The spec
document describes the rules in prose; this module enforces them in code so a
prose drift cannot silently degrade quality.

Why a constraints module instead of just longer prompts:
- LLM prompts are aspirational. They are not enforceable. A model can read
  "use 3-6 panels per page" and still emit 9.
- Validators run AFTER the LLM. If a rule is violated, the existing
  ``quality_repair_stage`` can ask the model to fix the specific violations
  rather than regenerating from scratch.
- The same caps inform the prompt builder so the LLM has the right targets
  in the first place. One source of truth for both ends of the loop.

Design rules for this module:
- No I/O. No LLM calls. Pure functions only.
- Cap tables are tiny dataclasses, not dicts of dicts. Adding a new arc role
  becomes a one-line change.
- Validators return ``QualityIssue`` objects that the existing quality
  pipeline already understands. We do not invent a parallel issue type.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.manga import (
    ArcRole,
    ArcSliceEntry,
    PageComposition,
    PanelPurpose,
    QualityIssue,
    ShotType,
    SliceComposition,
    StoryboardPage,
    StoryboardPanel,
)

# --- Cap tables ---------------------------------------------------------------
#
# These caps are intentionally tight. Manga pages with 9+ panels read like
# storyboard photocopies; pages with 1 panel waste reading rhythm. The caps
# below are the editorial discipline a working manga assistant editor would
# enforce on a junior artist.


@dataclass(frozen=True)
class PanelBudget:
    """Per-page panel-count window enforced for a given arc role.

    ``min_panels`` and ``max_panels`` are both inclusive. ``preferred`` is the
    number we ask the LLM to aim for; the validator only enforces the window.
    Splitting "preferred" from the window keeps the LLM honest while leaving
    room for occasional editorial choices (e.g. one big splash for a reveal).
    """

    min_panels: int
    preferred: int
    max_panels: int


@dataclass(frozen=True)
class PageBudget:
    """Per-slice page-count window enforced for a given arc role.

    A ``ki`` opening earns more establishing pages; a ``ten`` reveal slice can
    afford one more page than ``sho`` development; ``recap`` is intentionally
    short.
    """

    min_pages: int
    preferred: int
    max_pages: int


@dataclass(frozen=True)
class DialogueBudget:
    """Per-panel dialogue character cap and per-page dialogue line cap.

    The 180-character cap on a single line is already enforced by ``ScriptLine``
    itself; this module enforces the AGGREGATE limits so a panel cannot stuff
    five short lines that together drown the art.
    """

    max_lines_per_panel: int
    max_chars_per_panel: int
    max_lines_per_page: int


# Single source of truth for arc-role budgets. Adding a new arc role means
# adding one entry here and one entry to ``docs/MANGA_DSL_SPEC.md``.
PANEL_BUDGETS_BY_ARC_ROLE: dict[ArcRole, PanelBudget] = {
    ArcRole.KI: PanelBudget(min_panels=3, preferred=4, max_panels=6),
    ArcRole.SHO: PanelBudget(min_panels=3, preferred=5, max_panels=6),
    ArcRole.TEN: PanelBudget(min_panels=2, preferred=4, max_panels=5),
    ArcRole.KETSU: PanelBudget(min_panels=3, preferred=4, max_panels=5),
    ArcRole.RECAP: PanelBudget(min_panels=2, preferred=3, max_panels=4),
}

PAGE_BUDGETS_BY_ARC_ROLE: dict[ArcRole, PageBudget] = {
    ArcRole.KI: PageBudget(min_pages=3, preferred=4, max_pages=6),
    ArcRole.SHO: PageBudget(min_pages=3, preferred=4, max_pages=6),
    ArcRole.TEN: PageBudget(min_pages=2, preferred=3, max_pages=5),
    ArcRole.KETSU: PageBudget(min_pages=3, preferred=4, max_pages=6),
    ArcRole.RECAP: PageBudget(min_pages=1, preferred=2, max_pages=3),
}

# Dialogue caps are uniform across roles right now. We keep the per-role lookup
# so a future "TEN slices allow shorter dialogue for stronger reveals" tweak
# is a one-line change without touching the validator.
DIALOGUE_BUDGETS_BY_ARC_ROLE: dict[ArcRole, DialogueBudget] = {
    role: DialogueBudget(max_lines_per_panel=3, max_chars_per_panel=160, max_lines_per_page=10)
    for role in ArcRole
}

# Shot variety: across a slice the storyboard MUST use at least this many
# distinct shot types. Without variety, the manga reads like a wall of medium
# shots. We do not enforce per-page variety because some pages are intentionally
# uniform (e.g. a series of close-ups during emotional escalation).
MIN_DISTINCT_SHOT_TYPES_PER_SLICE = 3


# --- Defaults & lookup helpers ------------------------------------------------


def _default_panel_budget() -> PanelBudget:
    """Conservative fallback used when an unknown arc role is supplied.

    Returning a forgiving but bounded budget means a typo in arc role data
    cannot bypass enforcement entirely.
    """
    return PanelBudget(min_panels=3, preferred=4, max_panels=6)


def _default_page_budget() -> PageBudget:
    return PageBudget(min_pages=3, preferred=4, max_pages=6)


def _default_dialogue_budget() -> DialogueBudget:
    return DialogueBudget(max_lines_per_panel=3, max_chars_per_panel=160, max_lines_per_page=10)


def panel_budget_for(arc_role: ArcRole | None) -> PanelBudget:
    """Return the panel budget for an arc role (with safe fallback)."""
    if arc_role is None:
        return _default_panel_budget()
    return PANEL_BUDGETS_BY_ARC_ROLE.get(arc_role, _default_panel_budget())


def page_budget_for(arc_role: ArcRole | None) -> PageBudget:
    """Return the page budget for an arc role (with safe fallback)."""
    if arc_role is None:
        return _default_page_budget()
    return PAGE_BUDGETS_BY_ARC_ROLE.get(arc_role, _default_page_budget())


def dialogue_budget_for(arc_role: ArcRole | None) -> DialogueBudget:
    """Return the dialogue budget for an arc role (with safe fallback)."""
    if arc_role is None:
        return _default_dialogue_budget()
    return DIALOGUE_BUDGETS_BY_ARC_ROLE.get(arc_role, _default_dialogue_budget())


# --- Prompt fragment builder --------------------------------------------------


def render_dsl_prompt_fragment(arc_entry: ArcSliceEntry | None) -> str:
    """Render the DSL constraints as a prompt fragment.

    The downstream stage prompts append this fragment so the LLM sees the
    SAME budgets the validator will enforce. Without this, the LLM optimises
    for an aspirational "manga-ish" target while the validator measures
    against the real numbers and flags every output.
    """
    arc_role = arc_entry.role if arc_entry else None
    panels = panel_budget_for(arc_role)
    pages = page_budget_for(arc_role)
    dialogue = dialogue_budget_for(arc_role)
    role_label = arc_role.value.upper() if arc_role else "GENERIC"
    headline = arc_entry.headline_beat if arc_entry else "(no arc-level headline beat provided)"
    must_cover = ", ".join(arc_entry.must_cover_fact_ids) if arc_entry else ""
    closing_hook = arc_entry.closing_hook if arc_entry else ""

    return (
        "MANGA_DSL_CONSTRAINTS (these are HARD limits, not suggestions):\n"
        f"- arc role: {role_label}\n"
        f"- headline beat for this slice: {headline}\n"
        f"- must-cover fact IDs: [{must_cover}]\n"
        f"- closing hook to honour: {closing_hook!r}\n"
        f"- pages per slice: between {pages.min_pages} and {pages.max_pages} "
        f"(target {pages.preferred})\n"
        f"- panels per page: between {panels.min_panels} and {panels.max_panels} "
        f"(target {panels.preferred})\n"
        f"- dialogue per panel: at most {dialogue.max_lines_per_panel} lines "
        f"and {dialogue.max_chars_per_panel} characters total\n"
        f"- dialogue per page: at most {dialogue.max_lines_per_page} lines\n"
        f"- shot variety across the slice: at least "
        f"{MIN_DISTINCT_SHOT_TYPES_PER_SLICE} distinct shot types\n"
        "- reading flow: top-right to bottom-left unless project options say "
        "otherwise\n"
        "- every storyboard panel that carries a source idea MUST list its "
        "anchor source_fact_ids; do not paraphrase facts without anchoring them\n"
    )


# --- Validators ---------------------------------------------------------------
#
# Each validator returns a list of ``QualityIssue`` objects. We deliberately
# choose stable issue codes (``DSL_*``) so the repair stage can route by code
# rather than parsing free-text messages.


def _panel_dialogue_chars(panel: StoryboardPanel) -> int:
    return sum(len(line.text) for line in panel.dialogue)


def _validate_panel_count(
    page: StoryboardPage,
    budget: PanelBudget,
) -> list[QualityIssue]:
    panel_count = len(page.panels)
    issues: list[QualityIssue] = []
    if panel_count < budget.min_panels:
        issues.append(
            QualityIssue(
                severity="error",
                code="DSL_PAGE_UNDER_PANEL_BUDGET",
                message=(
                    f"page {page.page_index} has {panel_count} panels; "
                    f"DSL minimum for this slice is {budget.min_panels}"
                ),
                artifact_id=page.page_id,
            )
        )
    elif panel_count > budget.max_panels:
        issues.append(
            QualityIssue(
                severity="error",
                code="DSL_PAGE_OVER_PANEL_BUDGET",
                message=(
                    f"page {page.page_index} has {panel_count} panels; "
                    f"DSL maximum for this slice is {budget.max_panels}"
                ),
                artifact_id=page.page_id,
            )
        )
    return issues


def _validate_dialogue_budget(
    page: StoryboardPage,
    budget: DialogueBudget,
) -> list[QualityIssue]:
    issues: list[QualityIssue] = []
    page_lines = 0
    for panel in page.panels:
        line_count = len(panel.dialogue)
        char_count = _panel_dialogue_chars(panel)
        page_lines += line_count
        if line_count > budget.max_lines_per_panel:
            issues.append(
                QualityIssue(
                    severity="error",
                    code="DSL_PANEL_OVER_DIALOGUE_LINES",
                    message=(
                        f"panel {panel.panel_id} has {line_count} dialogue lines; "
                        f"DSL allows at most {budget.max_lines_per_panel}"
                    ),
                    artifact_id=panel.panel_id,
                )
            )
        if char_count > budget.max_chars_per_panel:
            issues.append(
                QualityIssue(
                    severity="error",
                    code="DSL_PANEL_OVER_DIALOGUE_CHARS",
                    message=(
                        f"panel {panel.panel_id} dialogue totals {char_count} chars; "
                        f"DSL allows at most {budget.max_chars_per_panel}"
                    ),
                    artifact_id=panel.panel_id,
                )
            )
    if page_lines > budget.max_lines_per_page:
        issues.append(
            QualityIssue(
                severity="warning",
                code="DSL_PAGE_OVER_DIALOGUE_LINES",
                message=(
                    f"page {page.page_index} has {page_lines} dialogue lines; "
                    f"DSL prefers at most {budget.max_lines_per_page}"
                ),
                artifact_id=page.page_id,
            )
        )
    return issues


def _validate_anchor_facts(
    pages: list[StoryboardPage],
    must_cover_fact_ids: list[str],
) -> list[QualityIssue]:
    """Every must-cover fact must appear in at least one panel's source_fact_ids.

    Anchoring (not just paraphrasing) is what keeps the manga grounded in the
    source PDF. Without this check, the LLM happily talks AROUND a fact without
    ever pinning it to a panel, which silently fails the reader's "I want the
    gist of the book" expectation.
    """
    if not must_cover_fact_ids:
        return []
    anchored: set[str] = set()
    for page in pages:
        for panel in page.panels:
            anchored.update(panel.source_fact_ids)
    missing = [fact_id for fact_id in must_cover_fact_ids if fact_id not in anchored]
    if not missing:
        return []
    return [
        QualityIssue(
            severity="error",
            code="DSL_MISSING_ANCHOR_FACTS",
            message=(
                "storyboard does not anchor must-cover fact IDs: " + ", ".join(missing)
            ),
            artifact_id="storyboard",
        )
    ]


def _validate_shot_variety(pages: list[StoryboardPage]) -> list[QualityIssue]:
    distinct: set[ShotType] = set()
    for page in pages:
        for panel in page.panels:
            distinct.add(panel.shot_type)
    if len(distinct) >= MIN_DISTINCT_SHOT_TYPES_PER_SLICE:
        return []
    return [
        QualityIssue(
            severity="warning",
            code="DSL_LOW_SHOT_VARIETY",
            message=(
                f"storyboard uses only {len(distinct)} distinct shot type(s); "
                f"DSL prefers at least {MIN_DISTINCT_SHOT_TYPES_PER_SLICE}"
            ),
            artifact_id="storyboard",
        )
    ]


def _validate_page_count(
    pages: list[StoryboardPage],
    budget: PageBudget,
) -> list[QualityIssue]:
    page_count = len(pages)
    if page_count < budget.min_pages:
        return [
            QualityIssue(
                severity="error",
                code="DSL_SLICE_UNDER_PAGE_BUDGET",
                message=(
                    f"slice has {page_count} page(s); DSL minimum is {budget.min_pages}"
                ),
                artifact_id="storyboard",
            )
        ]
    if page_count > budget.max_pages:
        return [
            QualityIssue(
                severity="error",
                code="DSL_SLICE_OVER_PAGE_BUDGET",
                message=(
                    f"slice has {page_count} page(s); DSL maximum is {budget.max_pages}"
                ),
                artifact_id="storyboard",
            )
        ]
    return []


def validate_storyboard_against_dsl(
    *,
    pages: list[StoryboardPage],
    arc_entry: ArcSliceEntry | None,
) -> list[QualityIssue]:
    """Run every DSL validator over a storyboard and return all issues.

    The caller decides what to do with the issues. Phase 2 wires this into a
    pipeline stage that records the issues onto ``context.quality_report`` so
    the existing repair loop can act on them. Returning a flat list keeps the
    integration boundary one type wide.
    """
    issues: list[QualityIssue] = []
    arc_role = arc_entry.role if arc_entry else None
    panel_budget = panel_budget_for(arc_role)
    dialogue_budget = dialogue_budget_for(arc_role)
    page_budget = page_budget_for(arc_role)

    issues.extend(_validate_page_count(pages, page_budget))
    for page in pages:
        issues.extend(_validate_panel_count(page, panel_budget))
        issues.extend(_validate_dialogue_budget(page, dialogue_budget))
    issues.extend(_validate_shot_variety(pages))
    # Phase 4.3: dominance + establishing-coverage checks. Live in a
    # sibling module because manga_dsl.py is at its line-budget; the
    # cardinality check above (DSL_LOW_SHOT_VARIETY) is a different
    # signal we keep — it catches 'only 2 shot types in the entire
    # slice', the new ones catch 'one shot type in 80% of panels' and
    # 'no establishing beat anywhere'. The repair stage handles all
    # three through the same QualityReport.
    from app.manga_pipeline.shot_variety import evaluate_shot_variety

    issues.extend(evaluate_shot_variety(pages))
    must_cover = arc_entry.must_cover_fact_ids if arc_entry else []
    issues.extend(_validate_anchor_facts(pages, must_cover))
    return issues


# --- RTL composition validators (Phase C2) -----------------------------------
#
# These run AFTER ``page_composition_stage`` and validate that the LLM-authored
# gutter grid actually obeys manga reading-flow conventions. They do not
# duplicate ``PageComposition``'s own validators (which check structural sanity
# like "cells == panel_count"); these are *editorial* checks about whether the
# layout is GOOD manga, not just legal manga.
#
# All issues are issued at warning severity by default — a layout that the
# composer chose deliberately should not block the slice. The repair stage
# can pick up warnings if the user has ``repair_warnings_too`` enabled, but
# the default is to surface them in the QA dashboard and ship.


def _row_for_panel_id(
    composition: PageComposition,
    panel_id: str,
) -> tuple[int, int, int] | None:
    """Return ``(row_index, col_index, row_cell_count)`` for ``panel_id``.

    ``col_index`` is the position WITHIN the row in panel_order order, which
    by stage convention is RTL: col 0 is the rightmost cell of the row.
    Returns None when the panel is not in panel_order — callers treat that
    as "nothing to validate".
    """
    pos = 0
    for row_index, row in enumerate(composition.gutter_grid):
        row_cells = len(row.cell_widths_pct)
        if pos <= 0:
            pass
        if panel_id in composition.panel_order[pos : pos + row_cells]:
            col_index = composition.panel_order[pos : pos + row_cells].index(panel_id)
            return row_index, col_index, row_cells
        pos += row_cells
    return None


def _validate_page_turn_anchor(
    page: StoryboardPage,
    composition: PageComposition,
) -> list[QualityIssue]:
    """Page-turn panel must be the LAST cell read on the page (bottom-left).

    Manga reads top-right → bottom-left. The last cell the eye lands on is
    the leftmost cell of the bottom row, which in our RTL panel_order is
    the FINAL entry. If the composer puts the page_turn anchor anywhere
    else, the cliffhanger reads mid-page and loses its punch.
    """
    if not composition.page_turn_panel_id:
        return []
    if not composition.panel_order:
        return []
    if composition.panel_order[-1] != composition.page_turn_panel_id:
        return [
            QualityIssue(
                severity="warning",
                code="DSL_RTL_PAGE_TURN_NOT_LAST",
                message=(
                    f"page {page.page_index}: page_turn_panel_id "
                    f"{composition.page_turn_panel_id!r} is not the last cell "
                    "in panel_order; in RTL flow the page-turn beat MUST be "
                    "the bottom-left cell (the final entry in panel_order)"
                ),
                artifact_id=page.page_id,
            )
        ]
    return []


def _validate_tbc_at_page_turn(
    page: StoryboardPage,
    composition: PageComposition,
) -> list[QualityIssue]:
    """TO_BE_CONTINUED panels must occupy the page-turn cell.

    A TBC panel anywhere except the bottom-left reads as "continued" before
    the reader has finished the page — a hard editorial defect. We surface
    it as a warning rather than an error because some experimental layouts
    intentionally subvert the convention; the repair stage can elevate.
    """
    tbc_panels = [
        panel for panel in page.panels if panel.purpose == PanelPurpose.TO_BE_CONTINUED
    ]
    if not tbc_panels:
        return []
    if not composition.panel_order:
        return []
    last_panel_id = composition.panel_order[-1]
    issues: list[QualityIssue] = []
    for panel in tbc_panels:
        if panel.panel_id != last_panel_id:
            issues.append(
                QualityIssue(
                    severity="warning",
                    code="DSL_RTL_TBC_NOT_PAGE_TURN",
                    message=(
                        f"page {page.page_index}: TO_BE_CONTINUED panel "
                        f"{panel.panel_id!r} is not the page-turn cell; the "
                        "cliffhanger should be the last beat on the page"
                    ),
                    artifact_id=panel.panel_id,
                )
            )
    return issues


def _validate_page_turn_cell_width(
    page: StoryboardPage,
    composition: PageComposition,
) -> list[QualityIssue]:
    """Page-turn cell must not be the narrowest in its row.

    Visual weight matters. A 20%-wide cliffhanger next to an 80% cell
    reads like a footnote, not a hook. We flag a warning when the
    page-turn cell is strictly narrower than every other cell in its
    row; ties pass.
    """
    if not composition.page_turn_panel_id:
        return []
    coords = _row_for_panel_id(composition, composition.page_turn_panel_id)
    if coords is None:
        return []
    row_index, col_index, row_cells = coords
    if row_cells <= 1:
        return []  # only cell in the row is by definition not narrowest
    widths = composition.gutter_grid[row_index].cell_widths_pct
    page_turn_width = widths[col_index]
    other_widths = [w for i, w in enumerate(widths) if i != col_index]
    if page_turn_width < min(other_widths):
        return [
            QualityIssue(
                severity="warning",
                code="DSL_RTL_PAGE_TURN_NARROW",
                message=(
                    f"page {page.page_index}: page-turn cell is {page_turn_width}% "
                    f"wide — narrower than every other cell in its row "
                    f"({other_widths}). The cliffhanger needs visual weight."
                ),
                artifact_id=page.page_id,
            )
        ]
    return []


def validate_composition_against_rtl(
    *,
    pages: list[StoryboardPage],
    composition: SliceComposition | None,
) -> list[QualityIssue]:
    """Run RTL composition validators across a slice's pages.

    When ``composition`` is None or every page composition is the default
    (empty) placeholder, we return no issues — the legacy panel-count layout
    has no notion of cell positions to validate.
    """
    if composition is None:
        return []
    pages_by_index = {page.page_index: page for page in pages}
    issues: list[QualityIssue] = []
    for page_comp in composition.pages:
        if page_comp.is_default:
            continue
        page = pages_by_index.get(page_comp.page_index)
        if page is None:
            continue  # composition references a non-existent storyboard page
        issues.extend(_validate_page_turn_anchor(page, page_comp))
        issues.extend(_validate_tbc_at_page_turn(page, page_comp))
        issues.extend(_validate_page_turn_cell_width(page, page_comp))
    return issues
