"""Domain types for sprite-quality vision checks.

A ``SpriteQualityReport`` is the structured outcome of running the
sprite-quality gate over one project's character assets. It is consumed
by:
* the book-understanding pipeline (to decide whether to auto-retry an
  asset before declaring book understanding "ready"),
* the persistence layer (each asset gets a status field driven by the
  worst check that touched it),
* the Character Library UI (to surface "review required" assets).

Why structured types instead of dicts?
A sprite asset can fail many ways (too small, no character detected,
silhouette mismatch, watermark, etc). Each is a distinct, named
concern with its own message and severity. Coercing all of that into a
``dict[str, Any]`` would mean every consumer reinvents the same
parsing. A typed model centralises that vocabulary in one place and
lets the type-checker catch typos at the boundary.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# Severity vocabulary mirrors ``QualityIssue`` so a future merge into the
# same QualityReport object stays trivial. ``error`` blocks shipping;
# ``warning`` requires manual review but does not auto-retry; ``info`` is
# informational only.
SpriteCheckSeverity = Literal["error", "warning", "info"]


# Codes are deliberately namespaced under SPRITE_ to avoid collision with
# QualityIssue codes from the script/storyboard pipeline. Add new codes
# at the end of the doc list when adding checks; consumers MAY switch on
# code strings.
SpriteCheckCode = Literal[
    "SPRITE_FILE_MISSING",          # image_path on disk does not exist
    "SPRITE_TOO_SMALL",             # short side < min_dimension_px
    "SPRITE_NOT_A_CHARACTER",       # vision LLM cannot find a character
    "SPRITE_BACKGROUND_NOT_PLAIN",  # vision LLM reports cluttered bg
    "SPRITE_HAS_TEXT",              # vision LLM detected captions/letters
    "SPRITE_SILHOUETTE_MISMATCH",   # vision LLM reports outfit/silhouette drift
    "SPRITE_MULTIPLE_CHARACTERS",   # >1 character in a single-character sheet
    "SPRITE_VISION_CALL_FAILED",    # vision LLM threw; treat as warning
]


class SpriteCheck(BaseModel):
    """One named check outcome on one sprite asset.

    Multiple checks can apply to a single asset; the asset's overall
    status is computed by ``SpriteQualityReport.status_for_asset``.
    """

    code: SpriteCheckCode
    severity: SpriteCheckSeverity
    message: str = Field(
        ..., description="Human-readable, surfaced in the Library UI verbatim"
    )
    detail: str = Field(
        default="",
        description="Optional extra context (numbers, raw model output)",
    )


class AssetSpriteReview(BaseModel):
    """All checks that ran against one asset, plus a derived status.

    The ``status`` field is what the persistence layer copies onto
    ``MangaAssetDoc.status``. We compute it here (not at the call site)
    so every consumer reads the same definition of "passed".
    """

    asset_id: str
    character_id: str
    image_path: str
    checks: list[SpriteCheck] = Field(default_factory=list)

    # Vision-LLM rated 1\u20135 on whether the sprite matches the bible's
    # silhouette/outfit description. None when no vision call ran (e.g.
    # only cheap heuristic checks fired). Surfaced in the UI as a star
    # rating to help the user decide whether to keep or regenerate.
    silhouette_match_score: int | None = None

    @property
    def status(self) -> Literal["ready", "review_required", "failed"]:
        """Worst-severity-wins. Mirrors classic CI status semantics.

        * ``failed``    \u2014 any error code; the asset MUST not be used in
          panel rendering until regenerated. UI shows red.
        * ``review_required`` \u2014 only warnings; the asset is usable but a
          human should glance at it. UI shows amber.
        * ``ready``     \u2014 only info-level (or no) findings. UI shows green.
        """
        severities = {c.severity for c in self.checks}
        if "error" in severities:
            return "failed"
        if "warning" in severities:
            return "review_required"
        return "ready"


class SpriteQualityReport(BaseModel):
    """Aggregate report for every asset in a single quality-gate run.

    Persisted on the project document so the Library UI can render the
    last-known quality summary without re-running the gate.
    """

    asset_reviews: list[AssetSpriteReview] = Field(default_factory=list)

    @property
    def passed(self) -> bool:
        """True iff every asset is at least ``review_required`` (no errors).

        The gate auto-retries on ``failed`` assets up to a bounded retry
        count; ``passed=False`` after all retries means the book stays
        out of "ready" until a human intervenes.
        """
        return all(r.status != "failed" for r in self.asset_reviews)

    def status_for_asset(self, asset_id: str) -> str | None:
        for review in self.asset_reviews:
            if review.asset_id == asset_id:
                return review.status
        return None
