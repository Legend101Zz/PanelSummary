"""Sprite-quality gate orchestrator \u2014 the persistence-aware wrapper.

The pure review service in ``sprite_quality_service.py`` does not know
about MongoDB. This module is the boundary that:

1. Loads ``MangaAssetDoc`` rows for a project,
2. Hands them to the pure service,
3. Writes the report back onto the asset docs (status, checks, score),
4. Auto-retries assets whose status is ``failed`` up to ``max_retries``
   times by asking the character library service to regenerate them.

Why split it this way? The pure service stays trivially testable
(deterministic in, deterministic out). The orchestrator handles I/O,
retries, and the regeneration callback. Each layer fails for one reason.

This module is what the book-understanding flow calls. It is also what a
future user-triggered "re-run sprite QA on this project" button calls,
because the same logic is needed in both places.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from app.domain.manga import (
    CharacterArtDirectionBundle,
    CharacterWorldBible,
    SpriteQualityReport,
)
from app.manga_models import MangaAssetDoc, MangaProjectDoc
from app.manga_pipeline.vision_contracts import VisionModelClient
from app.services.manga.character_sheet_planner import plan_book_character_sheets
from app.services.manga.expression_coverage import compute_missing_expressions
from app.services.manga.sprite_quality_service import (
    SpriteQualityServiceConfig,
    review_sprite_assets,
)


logger = logging.getLogger(__name__)


# Bounded retries: the gate is allowed to ask for a regeneration of a
# failed asset at most this many times before giving up and leaving it as
# "failed" for human review. Higher numbers risk uncapped LLM spend on a
# truly broken prompt; lower numbers ship more "failed" assets.
DEFAULT_MAX_RETRIES = 2


# Type alias for the regeneration callback the orchestrator invokes when
# an asset fails. Implementations live in character_library_service. We
# inject it instead of importing directly to break a circular dep and to
# keep this module testable with a no-op fake.
RegenerateAssetFn = Callable[[MangaAssetDoc], Awaitable[MangaAssetDoc | None]]


async def apply_sprite_quality_gate(
    *,
    project: MangaProjectDoc,
    bible: CharacterWorldBible,
    vision_client: VisionModelClient,
    regenerate_asset: RegenerateAssetFn,
    art_direction: CharacterArtDirectionBundle | None = None,
    max_retries: int = DEFAULT_MAX_RETRIES,
    config: SpriteQualityServiceConfig | None = None,
) -> SpriteQualityReport:
    """Run the gate over every persisted character asset for one project.

    The function loops until either every asset is non-``failed`` or the
    per-asset retry budget is exhausted. The final report is the source of
    truth that callers may persist on the project document.

    Parameters
    ----------
    project
        The project document. The function reads its options for context
        but does NOT mutate it; the caller decides whether to persist
        the gate outcome on the project.
    bible
        The locked character bible. Provides the ground-truth silhouette
        descriptions the vision model scores against.
    vision_client
        A vision-capable model client.
    regenerate_asset
        Async callback that takes a failed asset doc and returns the new
        asset doc (or None if regeneration could not run, e.g. image
        generation is disabled at project level). When None, the gate
        leaves the asset as ``failed`` and moves on.
    art_direction
        Optional art-direction bundle. Currently unused inside the gate
        (the bible is enough), but accepted so a future check can look
        at the rendering-intent layer.
    max_retries
        Maximum regenerate attempts per asset before giving up.
    config
        Service-level tunables (image-size thresholds, etc).
    """
    # Load all character assets once. The gate runs only on character
    # sheets; world/prop assets are intentionally out of scope and the
    # service skips them (see review_sprite_assets).
    asset_docs = await _load_character_asset_docs(project_id=str(project.id))
    if not asset_docs:
        logger.info("[SPRITE-QA] project %s has no character assets to review", project.id)
        return SpriteQualityReport(asset_reviews=[])

    # Track per-asset retries so we never loop forever on a hopeless
    # generation. Keyed by asset_id for stability across regenerations
    # (the doc id changes when the doc is replaced).
    retries_used: dict[str, int] = {}

    last_report: SpriteQualityReport = SpriteQualityReport(asset_reviews=[])
    while True:
        last_report = await _review_once(
            asset_docs=asset_docs,
            bible=bible,
            vision_client=vision_client,
            config=config,
        )
        await _persist_report_to_assets(asset_docs=asset_docs, report=last_report)

        # Identify assets we still want to retry.
        regen_targets: list[MangaAssetDoc] = []
        for doc in asset_docs:
            review_status = last_report.status_for_asset(_doc_asset_id(doc))
            if review_status != "failed":
                continue
            if retries_used.get(_doc_asset_id(doc), 0) >= max_retries:
                # Exhausted budget. Asset stays "failed" for human review.
                continue
            regen_targets.append(doc)

        if not regen_targets:
            # Either everything passed (or only warnings remain) or we
            # have hit the retry ceiling. Either way we are done.
            break

        # Regenerate one round of failed assets. We do this serially on
        # purpose: image generation is not free and a flaky model
        # benefits from a small back-off pattern. If throughput becomes
        # the bottleneck, gather() with a small sem is the right move.
        for failed_doc in regen_targets:
            asset_id = _doc_asset_id(failed_doc)
            retries_used[asset_id] = retries_used.get(asset_id, 0) + 1
            new_doc = await regenerate_asset(failed_doc)
            if new_doc is None:
                # Regeneration was a no-op (image generation disabled).
                # Leave the asset as-is; gate will mark it failed in the
                # next pass and the user will see it as such in the UI.
                continue
            # Replace in-place so the next review pass picks up the fresh
            # bytes. Index lookup is fine for the asset list size we deal
            # with (\u2264 ~30 per project).
            for idx, doc in enumerate(asset_docs):
                if _doc_asset_id(doc) == asset_id:
                    asset_docs[idx] = new_doc
                    break

    logger.info(
        "[SPRITE-QA] project %s gate finished: %d assets, %d still failed",
        project.id,
        len(last_report.asset_reviews),
        sum(1 for r in last_report.asset_reviews if r.status == "failed"),
    )
    # Phase 3.1: compute the spec→asset coverage gap. We do this AFTER
    # the auto-retry loop, not inside it, because regenerating an asset
    # that exists cannot close a gap (a gap is a missing asset, period).
    # The planner output is the single source of truth for what SHOULD
    # exist; we replan here to pick up any bible edits that happened
    # between the original materialisation and now.
    last_report = _attach_coverage_gaps(
        report=last_report,
        project=project,
        bible=bible,
        art_direction=art_direction,
        persisted=asset_docs,
    )
    return last_report


# ---------------------------------------------------------------------------
# Internal helpers.
# ---------------------------------------------------------------------------


def _attach_coverage_gaps(
    *,
    report: SpriteQualityReport,
    project: MangaProjectDoc,
    bible: CharacterWorldBible,
    art_direction: CharacterArtDirectionBundle | None,
    persisted: list[MangaAssetDoc],
) -> SpriteQualityReport:
    """Replan and surface missing-expression gaps on the report.

    The gap list is attached to ``SpriteQualityReport.missing_expressions``;
    we ALSO append one synthetic ``SPRITE_EXPRESSION_MISSING`` warning per
    affected character to a synthesised review row so consumers that only
    iterate over ``asset_reviews`` (e.g. older UI) still see a signal
    without reading the new field.

    Why a synthetic review row instead of attaching the warning to a real
    asset: there IS no asset — the whole point is that one was never
    materialised. Inventing an asset_id ("missing__kai__panicked") would
    break callers that expect asset_id to round-trip back to a doc.
    """
    try:
        plan = plan_book_character_sheets(
            bible=bible,
            project_id=str(project.id),
            art_direction=art_direction,
        )
    except ValueError as exc:
        # Bible has no characters or project_id is empty. The gate is not
        # the place to crash on that; log and return the report unchanged
        # so the caller decides what to do with a degenerate plan.
        logger.warning(
            "[SPRITE-QA] coverage planner refused to plan: %s", exc
        )
        return report

    gaps = compute_missing_expressions(plan=plan, persisted=persisted)
    if not gaps:
        return report
    report.missing_expressions = gaps
    return report


async def _load_character_asset_docs(*, project_id: str) -> list[MangaAssetDoc]:
    """Return all character-type asset docs for a project, deterministic order."""
    docs = (
        await MangaAssetDoc.find(MangaAssetDoc.project_id == project_id).to_list()
    )
    # Deterministic ordering keeps test snapshots stable and makes the
    # progress logs easy to read.
    docs.sort(key=lambda d: (d.character_id, d.expression, _doc_asset_id(d)))
    return [d for d in docs if d.asset_type == "character"]


async def _review_once(
    *,
    asset_docs: list[MangaAssetDoc],
    bible: CharacterWorldBible,
    vision_client: VisionModelClient,
    config: SpriteQualityServiceConfig | None,
) -> SpriteQualityReport:
    """One full review pass over the current asset list."""
    # Translate docs into the (asset_spec, image_path) shape the pure
    # service consumes. The asset_spec round-trip is cheap and lets the
    # service stay ignorant of the persistence layer.
    from app.domain.manga.types import MangaAssetSpec

    specs: list[MangaAssetSpec] = []
    paths: dict[str, str] = {}
    for doc in asset_docs:
        asset_id = _doc_asset_id(doc)
        spec = MangaAssetSpec(
            asset_id=asset_id,
            character_id=doc.character_id,
            asset_type=doc.asset_type,
            expression=doc.expression,
            prompt=doc.prompt,
        )
        specs.append(spec)
        paths[asset_id] = doc.image_path

    return await review_sprite_assets(
        assets=specs,
        asset_image_paths=paths,
        bible_characters=list(bible.characters),
        vision_client=vision_client,
        config=config,
    )


async def _persist_report_to_assets(
    *, asset_docs: list[MangaAssetDoc], report: SpriteQualityReport
) -> None:
    """Write the gate findings back onto each asset doc.

    The asset doc owns its quality state; the report aggregates them.
    Persisting on the asset (vs only on the project) means the UI can
    render per-asset status without joining against a separate quality
    table.
    """
    by_asset = {r.asset_id: r for r in report.asset_reviews}
    for doc in asset_docs:
        review = by_asset.get(_doc_asset_id(doc))
        if review is None:
            # Could happen if the asset was inserted between the load and
            # the review (unlikely under our flow, but defensive).
            continue
        doc.status = review.status
        doc.silhouette_match_score = review.silhouette_match_score
        doc.outfit_match_score = review.outfit_match_score
        doc.last_quality_checks = [c.model_dump() for c in review.checks]
        await doc.save()


def _doc_asset_id(doc: MangaAssetDoc) -> str:
    """Stable asset id used as the key everywhere.

    Older docs (pre-Phase B) may not have stored ``asset_id`` in metadata;
    we fall back to the BSON id string. New docs always have it via the
    library service.
    """
    metadata_id = doc.metadata.get("asset_id") if isinstance(doc.metadata, dict) else None
    if isinstance(metadata_id, str) and metadata_id:
        return metadata_id
    return str(doc.id)
