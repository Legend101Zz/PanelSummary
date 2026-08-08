"""Craft validators: manga-grammar lints on authored page plans (issue #5).

Session 4 NEW code. The ported ``manga_validation`` module owns the
structural, error-level checks (overlap, text fit, source facts); this
module encodes the craft research as ADVISORY warning-level issues so a
page can still be accepted while its craft debt is visible and addressable:

- panel-count norms (~5 average, 3-8 range; 1-2 panels reserved for
  climax treatment),
- page-turn hooks (a page should not end on a flat, wordless setup panel),
- shot variety (no page of identical camera shots),
- text budgets (bubble dialogue past ~90 characters is the historically
  measured failure line in this repo),
- geometric RTL reading flow (the authored chain must move right-to-left
  inside a row and never jump up-and-right across rows) — the one check
  the compiler deliberately does not enforce because ranks are authored.

Wiring these into the broker's ``validate_layout_draft`` response and the
eval harness is Session 5/6 scope (issues #5/#10); here they gate the SVG
preview loop and the template library's own tests.
"""

from __future__ import annotations

from app.contracts.manga import (
    CompiledPageLayout,
    MangaPagePlan,
    PageValidationIssue,
)

CRAFT_VALIDATOR_VERSION = "manga-craft-validator.v1"

#: Historically measured lettering failure line (repo bubble evidence).
DIALOGUE_CHAR_BUDGET = 90
#: Craft norm: 3-8 panels; more is a density smell, fewer is climax-only.
PANEL_COUNT_MAX = 8
#: Vertical overlap ratio at which two panels count as one reading row.
ROW_OVERLAP_RATIO = 0.5
#: Tolerance for geometric comparisons in normalized page units.
FLOW_EPSILON = 0.02

#: Panel purposes that justify a 1-2 panel page (climax treatment) or a
#: non-hooked final panel.
CLIMAX_PURPOSES = {"reveal", "payoff"}
ENDING_HOOK_PURPOSES = {"reveal", "payoff", "reaction", "action"}


def _issue(code: str, message: str, path: str, node_id: str | None = None) -> PageValidationIssue:
    return PageValidationIssue(
        code=code,
        severity="warning",
        message=message,
        path=path,
        node_id=node_id,
    )


def validate_page_craft(
    plan: MangaPagePlan, compiled: CompiledPageLayout
) -> list[PageValidationIssue]:
    issues: list[PageValidationIssue] = []
    issues.extend(_panel_count_issues(plan))
    issues.extend(_shot_variety_issues(plan))
    issues.extend(_page_ending_issues(plan, compiled))
    issues.extend(_text_budget_issues(plan))
    issues.extend(_reading_flow_issues(plan, compiled))
    return issues


def _panel_count_issues(plan: MangaPagePlan) -> list[PageValidationIssue]:
    panels = plan.page_script.panels
    count = len(panels)
    issues: list[PageValidationIssue] = []
    if count > PANEL_COUNT_MAX:
        issues.append(
            _issue(
                "PANEL_COUNT_HIGH",
                f"{count} panels exceeds the craft norm of {PANEL_COUNT_MAX}; "
                "dense pages read as clutter.",
                "/page_script/panels",
            )
        )
    if (
        count <= 2
        and plan.page_script.page_kind == "standard"
        and not any(panel.purpose in CLIMAX_PURPOSES for panel in panels)
        and not any(panel.importance == "page_turn" for panel in panels)
    ):
        issues.append(
            _issue(
                "CLIMAX_PAGE_UNJUSTIFIED",
                "A 1-2 panel standard page is climax treatment; it needs a "
                "reveal/payoff purpose or a page_turn panel to earn the space.",
                "/page_script/panels",
            )
        )
    return issues


def _shot_variety_issues(plan: MangaPagePlan) -> list[PageValidationIssue]:
    panels = plan.page_script.panels
    if len(panels) < 4:
        return []
    shots = {panel.camera.shot for panel in panels}
    if len(shots) == 1:
        return [
            _issue(
                "MONOTONE_SHOT_PAGE",
                f"All {len(panels)} panels use the {next(iter(shots))} shot; "
                "alternate establishing/medium/close-up for rhythm.",
                "/page_script/panels",
            )
        ]
    return []


def _page_ending_issues(
    plan: MangaPagePlan, compiled: CompiledPageLayout
) -> list[PageValidationIssue]:
    if plan.page_script.page_turn_panel_id is not None:
        return []
    final_panel_id = max(compiled.panels, key=lambda item: item.read_rank).panel_id
    final_panel = next(
        panel for panel in plan.page_script.panels if panel.panel_id == final_panel_id
    )
    if final_panel.purpose in ENDING_HOOK_PURPOSES:
        return []
    has_voice = any(
        text.panel_id == final_panel_id and text.kind in {"dialogue", "thought", "sfx"}
        for text in plan.page_script.text_elements
    )
    if has_voice:
        return []
    return [
        _issue(
            "FLAT_PAGE_ENDING",
            "The last panel in the reading chain is a wordless "
            f"{final_panel.purpose} panel with no page-turn intent; land a "
            "question, reveal, or reaction instead.",
            "/page_script/panels",
            node_id=None,
        )
    ]


def _text_budget_issues(plan: MangaPagePlan) -> list[PageValidationIssue]:
    issues: list[PageValidationIssue] = []
    for index, text in enumerate(plan.page_script.text_elements):
        if text.kind in {"dialogue", "thought"} and len(text.content) > DIALOGUE_CHAR_BUDGET:
            issues.append(
                _issue(
                    "TEXT_BUDGET_EXCEEDED",
                    f"{text.kind} bubble carries {len(text.content)} characters "
                    f"(budget {DIALOGUE_CHAR_BUDGET}); split it or route dense "
                    "explanation into a caption on a calm beat.",
                    f"/page_script/text_elements/{index}/content",
                )
            )
    return issues


def _reading_flow_issues(
    plan: MangaPagePlan, compiled: CompiledPageLayout
) -> list[PageValidationIssue]:
    if plan.reading_direction != "rtl":
        return []
    base_panels = sorted(
        (panel for panel in compiled.panels if panel.z_index == 0),
        key=lambda item: item.read_rank,
    )
    issues: list[PageValidationIssue] = []
    for current, following in zip(base_panels, base_panels[1:]):
        c_x = current.bbox.x + current.bbox.width / 2
        c_y = current.bbox.y + current.bbox.height / 2
        f_x = following.bbox.x + following.bbox.width / 2
        f_y = following.bbox.y + following.bbox.height / 2
        overlap = min(
            current.bbox.y + current.bbox.height, following.bbox.y + following.bbox.height
        ) - max(current.bbox.y, following.bbox.y)
        min_height = max(min(current.bbox.height, following.bbox.height), 1e-6)
        same_row = overlap / min_height >= ROW_OVERLAP_RATIO
        if same_row:
            if f_x > c_x - FLOW_EPSILON:
                issues.append(
                    _issue(
                        "RTL_READING_FLOW_INCOHERENT",
                        f"Panel {following.panel_id} reads after "
                        f"{current.panel_id} but sits to its right in the same "
                        "row; RTL rows must flow right-to-left.",
                        "/reading_edges",
                        node_id=following.node_id,
                    )
                )
        elif f_y < c_y - FLOW_EPSILON and f_x > c_x + FLOW_EPSILON:
            issues.append(
                _issue(
                    "RTL_READING_FLOW_INCOHERENT",
                    f"Panel {following.panel_id} jumps up-and-right from "
                    f"{current.panel_id}; the RTL Z-path only moves left or "
                    "down.",
                    "/reading_edges",
                    node_id=following.node_id,
                )
            )
    return issues
