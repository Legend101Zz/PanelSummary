"""Deterministic, addressable validation for page plans and compiled layouts."""

from __future__ import annotations

from collections.abc import Iterable

from app.contracts.manga import (
    CompiledPageLayout,
    MangaPagePlan,
    NormalizedPoint,
    PageValidationIssue,
    PageValidationReport,
)

from .hashing import content_hash
from .manga_layout import point_in_polygon, polygon_overlap_area

VALIDATOR_VERSION = "manga-page-validator.v1"
OVERLAP_EPSILON = 1e-5


def _text_capacity(plan: MangaPagePlan, text_index: int) -> int:
    text = plan.page_script.text_elements[text_index]
    box = text.preferred_region
    width_px = box.width * plan.canvas.width_px
    height_px = box.height * plan.canvas.height_px
    glyph_area = max(1.0, text.typography.min_px**2 * 0.55)
    return max(1, int(width_px * height_px / glyph_area))


def validate_page_plan(
    plan: MangaPagePlan,
    compiled: CompiledPageLayout,
    *,
    known_source_fact_ids: set[str] | None = None,
) -> list[PageValidationIssue]:
    issues: list[PageValidationIssue] = []
    panels = {panel.panel_id: panel for panel in compiled.panels}

    for index, first in enumerate(compiled.panels):
        for second in compiled.panels[index + 1 :]:
            if first.z_index != second.z_index:
                continue
            if polygon_overlap_area(first.polygon, second.polygon) > OVERLAP_EPSILON:
                issues.append(
                    PageValidationIssue(
                        code="ACCIDENTAL_OVERLAP",
                        severity="error",
                        message=(
                            f"Panels {first.panel_id} and {second.panel_id} overlap without an "
                            "explicit overlay z-index."
                        ),
                        path=f"/layout_root/{first.node_id}",
                        node_id=first.node_id,
                    )
                )

    for index, text in enumerate(plan.page_script.text_elements):
        panel = panels[text.panel_id]
        center = NormalizedPoint(
            x=text.preferred_region.x + text.preferred_region.width / 2,
            y=text.preferred_region.y + text.preferred_region.height / 2,
        )
        if not point_in_polygon(center, panel.polygon):
            issues.append(
                PageValidationIssue(
                    code="TEXT_REGION_OUT_OF_PANEL",
                    severity="error",
                    message="The text region center is outside its referenced panel polygon.",
                    path=f"/page_script/text_elements/{index}/preferred_region",
                    node_id=panel.node_id,
                )
            )
        if text.overflow == "reject" and len(text.content) > _text_capacity(plan, index):
            issues.append(
                PageValidationIssue(
                    code="TEXT_FIT_FAIL",
                    severity="error",
                    message="Text exceeds the deterministic minimum-font capacity estimate.",
                    path=f"/page_script/text_elements/{index}/content",
                    node_id=panel.node_id,
                )
            )

    panel_fact_ids = {
        fact_id for panel in plan.page_script.panels for fact_id in panel.source_fact_ids
    }
    for index, fact_id in enumerate(plan.source_fact_ids):
        if fact_id not in panel_fact_ids:
            issues.append(
                PageValidationIssue(
                    code="SOURCE_FACT_NOT_ON_PANEL",
                    severity="error",
                    message=f"Page fact {fact_id} is not carried by any panel.",
                    path=f"/source_fact_ids/{index}",
                    node_id=None,
                )
            )
        if known_source_fact_ids is not None and fact_id not in known_source_fact_ids:
            issues.append(
                PageValidationIssue(
                    code="SOURCE_FACT_NOT_IN_SCOPE",
                    severity="error",
                    message=f"Page fact {fact_id} is outside the persisted source context.",
                    path=f"/source_fact_ids/{index}",
                    node_id=None,
                )
            )
    return issues


def validate_page_sequence(
    plans_and_layouts: Iterable[tuple[MangaPagePlan, CompiledPageLayout]],
) -> list[PageValidationIssue]:
    pairs = list(plans_and_layouts)
    issues: list[PageValidationIssue] = []
    for index, ((previous, _), (current, _)) in enumerate(
        zip(pairs, pairs[1:], strict=False)
    ):
        previous_narration = [
            item for item in previous.page_script.text_elements if item.kind == "narration"
        ]
        current_narration = [
            item for item in current.page_script.text_elements if item.kind == "narration"
        ]
        if (
            len(previous.page_script.panels) == 1
            and len(current.page_script.panels) == 1
            and len(previous_narration) == 1
            and len(current_narration) == 1
            and previous_narration[0].preferred_region == current_narration[0].preferred_region
        ):
            issues.append(
                PageValidationIssue(
                    code="REPEATED_SINGLE_PANEL_NARRATOR",
                    severity="error",
                    message="Adjacent pages repeat the single-panel narrator-card pattern.",
                    path=f"/page_plans/{index + 1}/page_script",
                    node_id=None,
                )
            )
        previous_shots = [panel.camera.shot for panel in previous.page_script.panels]
        current_shots = [panel.camera.shot for panel in current.page_script.panels]
        if previous_shots == current_shots and len(previous_shots) > 1:
            issues.append(
                PageValidationIssue(
                    code="REPEATED_SHOT_SEQUENCE",
                    severity="warning",
                    message="Adjacent pages repeat the same camera-shot sequence.",
                    path=f"/page_plans/{index + 1}/page_script/panels",
                    node_id=None,
                )
            )
    return issues


def validation_report(
    *,
    candidate_artifact_id: str,
    issues: list[PageValidationIssue],
) -> PageValidationReport:
    payload = {
        "candidate_artifact_id": candidate_artifact_id,
        "validator_version": VALIDATOR_VERSION,
        "issues": [issue.model_dump(mode="json") for issue in issues],
    }
    return PageValidationReport(
        schema_version="page-validation-report.v1",
        report_id=f"page_validation_{content_hash(payload)[:24]}",
        candidate_artifact_id=candidate_artifact_id,
        validator_version=VALIDATOR_VERSION,
        passed=not any(issue.severity == "error" for issue in issues),
        issues=issues,
    )
