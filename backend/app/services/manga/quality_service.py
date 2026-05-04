"""Quality gates for manga adaptation artifacts."""

from __future__ import annotations

from app.domain.manga import (
    MangaScript,
    PanelPurpose,
    QualityIssue,
    QualityReport,
    StoryboardPage,
)


def _issue(severity: str, code: str, message: str, artifact_id: str = "") -> QualityIssue:
    return QualityIssue(severity=severity, code=code, message=message, artifact_id=artifact_id)


def collect_storyboard_fact_ids(pages: list[StoryboardPage]) -> set[str]:
    fact_ids: set[str] = set()
    for page in pages:
        for panel in page.panels:
            fact_ids.update(panel.source_fact_ids)
            for line in panel.dialogue:
                fact_ids.update(line.source_fact_ids)
    return fact_ids


def run_quality_gate(
    *,
    required_fact_ids: list[str],
    script: MangaScript,
    storyboard_pages: list[StoryboardPage],
    should_have_to_be_continued: bool,
) -> QualityReport:
    """Validate manga slice artifacts before V4 rendering.

    The point is not perfection. The point is catching obvious story/product
    failures early: missing thesis facts, wall-of-text bubbles, unreadable page
    density, and missing continuation promises.
    """
    issues: list[QualityIssue] = []
    grounded_fact_ids = collect_storyboard_fact_ids(storyboard_pages)
    required = set(required_fact_ids)
    missing = sorted(required - grounded_fact_ids)

    for fact_id in missing:
        issues.append(
            _issue(
                "error",
                "missing_required_fact",
                f"Required source fact {fact_id} is not represented in storyboard.",
                fact_id,
            )
        )

    for scene in script.scenes:
        for line in scene.dialogue:
            if len(line.text) > 120:
                issues.append(
                    _issue(
                        "warning",
                        "long_dialogue_line",
                        "Dialogue may be too long for a readable manga bubble.",
                        scene.scene_id,
                    )
                )

    has_tbc_panel = any(
        panel.purpose == PanelPurpose.TO_BE_CONTINUED
        for page in storyboard_pages
        for panel in page.panels
    )
    if should_have_to_be_continued and not has_tbc_panel:
        issues.append(
            _issue(
                "error",
                "missing_to_be_continued",
                "Partial source generation needs a To Be Continued panel/page.",
            )
        )
    if not should_have_to_be_continued and has_tbc_panel:
        issues.append(
            _issue(
                "warning",
                "unexpected_to_be_continued",
                "Storyboard has a To Be Continued panel for a complete/standalone slice.",
            )
        )

    for page in storyboard_pages:
        if len(page.panels) > 6:
            issues.append(
                _issue(
                    "warning",
                    "dense_storyboard_page",
                    "Page may feel crowded; consider fewer panels.",
                    page.page_id,
                )
            )

    has_errors = any(issue.severity == "error" for issue in issues)
    return QualityReport(
        passed=not has_errors,
        issues=issues,
        grounded_fact_ids=sorted(grounded_fact_ids),
        missing_fact_ids=missing,
    )
