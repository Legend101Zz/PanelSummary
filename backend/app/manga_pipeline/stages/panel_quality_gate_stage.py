"""Phase 10 \u2014 panel-level quality gate.

Runs immediately after ``panel_rendering_stage``. The renderer reports per-panel
results in ``context.options['panel_rendering_summary']``; this stage pairs that
log with the bible and the V4 page graph to surface **structural** defects:

* characters the storyboard claimed but the bible doesn't define (storyboarder
  hallucination \u2014 the renderer can never find an asset for them);
* panels where ``character_ids`` was non-empty but the renderer attached zero
  reference assets (the painted character will drift because the model is
  guessing);
* panels that came back without an ``image_path`` after a ``rendered`` count
  (impossible by contract, but we check defensively because silent
  inconsistencies between ``summary.rendered`` and the panel dicts would mean
  the persistence layer ships broken pages).

This is **not** a vision check \u2014 we do not ask another model to confirm the
character actually appears in the painted panel. That belongs in a later
phase. Here we only catch defects we can see deterministically from the
artifacts in hand.

Design rules:

* The stage **never re-renders**. It can only flag.
* Issues are appended to the slice's ``QualityReport`` so all manga quality
  signals live in one place. We don't spawn a parallel report type.
* The stage is no-op when ``panel_rendering_stage`` was not scheduled, so the
  orchestrator can include it unconditionally without paying for image gen.
"""

from __future__ import annotations

import logging
from typing import Any

from app.domain.manga import (
    PanelRenderArtifact,
    QualityIssue,
    QualityReport,
    RenderedPage,
    StoryboardPanel,
)
from app.manga_pipeline.context import PipelineContext

logger = logging.getLogger(__name__)

# Phase 3.3: when the sprite-bank hit-rate dips below this threshold the
# gate emits a slice-level warning so the editor sees "only 40% of
# panels found a reference asset" without trawling per-panel logs.
# Threshold is 0.6 because below that we are essentially trusting the
# image model to invent a consistent character every panel — the exact
# failure mode the sprite bank exists to prevent.
SPRITE_BANK_HIT_RATE_WARN_THRESHOLD = 0.6


def _issue(
    severity: str, code: str, message: str, artifact_id: str = ""
) -> QualityIssue:
    return QualityIssue(
        severity=severity, code=code, message=message, artifact_id=artifact_id
    )


def _bible_character_ids(context: PipelineContext) -> set[str]:
    if context.character_bible is None:
        return set()
    return {character.character_id for character in context.character_bible.characters}


def _renderer_results(context: PipelineContext) -> list[dict[str, Any]]:
    summary = context.options.get("panel_rendering_summary") or {}
    results = summary.get("results") if isinstance(summary, dict) else None
    return list(results or [])


def _result_lookup(
    results: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    return {str(result.get("panel_id", "")): result for result in results if result.get("panel_id")}


def _evaluate_panel(
    *,
    panel: dict[str, Any],
    page_index: int,
    bible_ids: set[str],
    result: dict[str, Any] | None,
) -> list[QualityIssue]:
    """Return all issues found for one panel.

    Pure: takes the panel + its renderer result + the set of bible ids and
    returns issues. Easy to test in isolation; no I/O, no globals.
    """
    issues: list[QualityIssue] = []
    panel_id = str(panel.get("panel_id") or f"page{page_index}_panel?")
    raw_character_ids = panel.get("character_ids") or []
    character_ids = [str(cid).strip() for cid in raw_character_ids if str(cid).strip()]

    # 1. Storyboarder hallucinations \u2014 character_ids that the bible doesn't
    #    define mean the renderer could never have found a reference asset.
    if bible_ids:
        unknown = [cid for cid in character_ids if cid not in bible_ids]
        for cid in unknown:
            issues.append(
                _issue(
                    "error",
                    "panel_unknown_character",
                    f"Panel references character '{cid}' which is not in the character bible.",
                    panel_id,
                )
            )

    # 2. Renderer-result vs claimed-presence consistency. If the panel was
    #    rendered (no error) but no reference assets were attached AND the
    #    storyboard said characters were on-stage, the painted character will
    #    drift. We log a warning, not an error \u2014 the panel still ships, but
    #    the operator should know.
    if result is not None and not result.get("error"):
        used_refs = list(result.get("used_reference_assets") or [])
        if character_ids and not used_refs:
            issues.append(
                _issue(
                    "warning",
                    "panel_no_reference_attached",
                    (
                        "Panel claimed visible characters but no reference "
                        "sheets were attached; painted character may drift."
                    ),
                    panel_id,
                )
            )

    # 3. Renderer success/failure invariants. Panels rendered cleanly must
    #    carry an ``image_path``; failed panels must NOT carry one. Either
    #    inconsistency is a bug in the persistence path, not user-fixable.
    has_path = bool(panel.get("image_path"))
    if result is not None:
        had_error = bool(result.get("error"))
        if had_error and has_path:
            issues.append(
                _issue(
                    "error",
                    "panel_failed_but_has_path",
                    "Panel rendering reported failure yet image_path was set.",
                    panel_id,
                )
            )
        if not had_error and not has_path:
            issues.append(
                _issue(
                    "error",
                    "panel_rendered_without_path",
                    "Panel rendering reported success but image_path is missing.",
                    panel_id,
                )
            )
    return issues


def evaluate_v4_pages(
    *,
    v4_pages: list[dict[str, Any]],
    bible_ids: set[str],
    renderer_results: list[dict[str, Any]],
) -> list[QualityIssue]:
    """Walk every panel on every page and collect quality issues."""
    lookup = _result_lookup(renderer_results)
    issues: list[QualityIssue] = []
    for page in v4_pages:
        page_index = int(page.get("page_index", 0))
        for panel in page.get("panels", []) or []:
            panel_id = str(panel.get("panel_id") or "")
            issues.extend(
                _evaluate_panel(
                    panel=panel,
                    page_index=page_index,
                    bible_ids=bible_ids,
                    result=lookup.get(panel_id),
                )
            )
    return issues


def _evaluate_storyboard_panel(
    *,
    panel: StoryboardPanel,
    artifact: PanelRenderArtifact | None,
    page_index: int,
    bible_ids: set[str],
) -> list[QualityIssue]:
    """Phase 4.2 — the typed twin of ``_evaluate_panel``.

    Same three checks (unknown character, no reference attached, render
    success/failure invariants) but reads from typed fields so the gate
    cannot disagree with the renderer about what was attempted.
    ``artifact`` is ``None`` when the orchestrator scheduled the gate
    without rendering — the run() handler short-circuits before
    reaching here, so reaching this branch with None means a wiring
    bug and we treat it as 'no artifact' (only character checks fire).
    """
    issues: list[QualityIssue] = []
    panel_id = panel.panel_id or f"page{page_index}_panel?"
    character_ids = [cid.strip() for cid in panel.character_ids if cid and cid.strip()]

    # 1. Storyboarder hallucinations — character_ids the bible doesn't
    #    define mean the renderer could never have found a reference.
    if bible_ids:
        for cid in character_ids:
            if cid not in bible_ids:
                issues.append(
                    _issue(
                        "error",
                        "panel_unknown_character",
                        f"Panel references character '{cid}' which is not in the character bible.",
                        panel_id,
                    )
                )

    if artifact is None:
        return issues

    # 2. Renderer-result vs claimed-presence consistency. If the panel
    #    rendered cleanly but no reference assets were attached AND the
    #    storyboard said characters were on-stage, the painted character
    #    will drift. Warning, not error — the panel still ships.
    if not artifact.error and character_ids and not artifact.used_reference_assets:
        issues.append(
            _issue(
                "warning",
                "panel_no_reference_attached",
                (
                    "Panel claimed visible characters but no reference "
                    "sheets were attached; painted character may drift."
                ),
                panel_id,
            )
        )

    # 3. Render success/failure invariants. Cleanly rendered panels MUST
    #    carry an image_path; failed panels must NOT. Either inconsistency
    #    is a bug in the persistence path, not user-fixable.
    has_path = bool(artifact.image_path)
    had_error = bool(artifact.error)
    if had_error and has_path:
        issues.append(
            _issue(
                "error",
                "panel_failed_but_has_path",
                "Panel rendering reported failure yet image_path was set.",
                panel_id,
            )
        )
    if not had_error and not has_path:
        issues.append(
            _issue(
                "error",
                "panel_rendered_without_path",
                "Panel rendering reported success but image_path is missing.",
                panel_id,
            )
        )
    return issues


def evaluate_rendered_pages(
    *,
    rendered_pages: list[RenderedPage],
    bible_ids: set[str],
) -> list[QualityIssue]:
    """Walk every panel on every rendered page and collect quality issues.

    Phase 4.2: the typed twin of ``evaluate_v4_pages``. Reads the panel
    artifact straight off the ``RenderedPage`` instead of joining the
    renderer-summary results list back to the V4 dict by panel_id. One
    fewer place where the gate and the renderer can disagree.
    """
    issues: list[QualityIssue] = []
    for rendered_page in rendered_pages:
        page_index = rendered_page.storyboard_page.page_index
        for panel in rendered_page.storyboard_page.panels:
            artifact = rendered_page.panel_artifacts.get(panel.panel_id)
            issues.extend(
                _evaluate_storyboard_panel(
                    panel=panel,
                    artifact=artifact,
                    page_index=page_index,
                    bible_ids=bible_ids,
                )
            )
    return issues


def _merge_into_report(
    existing: QualityReport | None,
    new_issues: list[QualityIssue],
) -> QualityReport:
    """Combine the panel-level issues with whatever the prior gate produced.

    We never replace the upstream report \u2014 the storyboard quality_gate_stage
    already checked thesis facts and continuation hooks. This stage adds
    panel-level issues on top and recomputes ``passed``.
    """
    if existing is None:
        existing = QualityReport(passed=True, issues=[])
    combined = list(existing.issues) + list(new_issues)
    has_error = any(issue.severity == "error" for issue in combined)
    return QualityReport(
        passed=not has_error,
        issues=combined,
        grounded_fact_ids=list(existing.grounded_fact_ids),
        missing_fact_ids=list(existing.missing_fact_ids),
        notes=existing.notes,
    )


async def run(context: PipelineContext) -> PipelineContext:
    """Inspect rendered panels for structural defects; mutate quality report."""
    if not context.rendered_pages:
        # Nothing to evaluate; an upstream stage failed loudly already.
        return context

    # Phase 4.2: detect whether image generation actually ran by
    # asking the typed artifacts directly. If every artifact is still
    # in its empty default state, the orchestrator skipped panel
    # rendering for this run and there are no result-derived defects
    # to surface. Character-id sanity could still be checked here, but
    # the storyboard quality_gate_stage already covers that on the
    # scriptside; skipping prevents duplicate issues in the report.
    rendered_or_errored = any(
        artifact.is_rendered or bool(artifact.error)
        for rendered_page in context.rendered_pages
        for artifact in rendered_page.panel_artifacts.values()
    )
    if not rendered_or_errored:
        return context

    bible_ids = _bible_character_ids(context)
    new_issues = evaluate_rendered_pages(
        rendered_pages=context.rendered_pages,
        bible_ids=bible_ids,
    )
    # Phase 3.3: surface the slice-wide sprite-bank hit-rate as a single
    # warning when it dips below the threshold. We piggyback on the
    # existing QualityReport instead of inventing a parallel metric pipe
    # because every other slice-level QA signal already lives there —
    # one source of truth for the editor UI to render.
    summary = context.options.get("panel_rendering_summary") or {}
    if isinstance(summary, dict):
        hit_rate = summary.get("sprite_bank_hit_rate")
        if isinstance(hit_rate, (int, float)) and hit_rate < SPRITE_BANK_HIT_RATE_WARN_THRESHOLD:
            requested = int(summary.get("character_slots_requested") or 0)
            resolved = int(summary.get("character_slots_resolved") or 0)
            new_issues.append(
                _issue(
                    "warning",
                    "sprite_bank_low_hit_rate",
                    (
                        f"Sprite-bank hit-rate is {hit_rate:.0%} "
                        f"({resolved}/{requested} character slots resolved). "
                        "Painted characters will drift; check the Library for missing sheets."
                    ),
                )
            )
    if new_issues:
        logger.info(
            "panel quality gate: %s issue(s) for slice %s",
            len(new_issues),
            context.source_slice.slice_id,
        )
    context.quality_report = _merge_into_report(context.quality_report, new_issues)
    return context
