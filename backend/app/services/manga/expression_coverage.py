"""Expression-matrix coverage check for the sprite quality gate.

Phase 3.1 — close the loop between *what the planner asked for* and *what
the library actually persisted*. Until now:

* the planner emitted one ``MangaAssetSpec`` per (character, expression),
* the library service materialised them into ``MangaAssetDoc`` rows,
* the sprite-quality gate inspected every persisted row.

What was missing: nothing checked that the SET of materialised rows
matched the SET of planned specs. If image generation throws on one
expression, or a doc gets deleted, the spec stays in the planner output
but the asset bytes (and the asset doc) are gone. The renderer then
silently falls back to the reference sheet, which is fine *visually* but
breaks the design intent: the writer asked for a "panicked" face on
page 4 and got the neutral reference.

This module is the cheap, deterministic half. Pure functions, no I/O,
no LLM calls — exactly the same design as ``grounding_validator``.
"""

from __future__ import annotations

from app.domain.manga import (
    CharacterAssetPlan,
    MissingExpression,
)
from app.manga_models import MangaAssetDoc


def _doc_asset_id(doc: MangaAssetDoc) -> str:
    """Return the planner-stable asset id stored on the doc.

    Mirrors ``character_library_service._asset_doc_id`` so the two layers
    agree on what \"this is the same asset\" means. Duplicated rather than
    cross-imported because importing the library service from a domain
    helper inverts the dependency arrow and pulls Mongo into pure code.
    """
    metadata_id = doc.metadata.get("asset_id") if isinstance(doc.metadata, dict) else None
    if isinstance(metadata_id, str) and metadata_id:
        return metadata_id
    return ""


def compute_missing_expressions(
    *,
    plan: CharacterAssetPlan,
    persisted: list[MangaAssetDoc],
) -> list[MissingExpression]:
    """Return the planned specs that have no persisted asset doc.

    Both inputs are keyed by the planner-stable asset id. We return the
    planned specs (not the docs) because the gap is *the absence* — the
    doc by definition does not exist.

    Reference-sheet specs (asset_type == "reference_sheet") are
    intentionally INCLUDED in the gap check: a missing front-view sheet
    is the most expensive failure mode in the whole pipeline because the
    panel renderer's multimodal conditioning is keyed off it. The asset
    type is carried through on the ``MissingExpression`` so the UI can
    render different copy for "missing reference sheet (regenerate)"
    vs "missing expression (will fall back to reference)".
    """
    persisted_ids = {asset_id for asset_id in (_doc_asset_id(doc) for doc in persisted) if asset_id}
    gaps: list[MissingExpression] = []
    for spec in plan.assets:
        if spec.asset_id in persisted_ids:
            continue
        gaps.append(
            MissingExpression(
                character_id=spec.character_id,
                expression=spec.expression,
                asset_type=spec.asset_type,
            )
        )
    return gaps
