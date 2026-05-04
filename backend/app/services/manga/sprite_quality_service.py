"""Sprite quality service \u2014 vision-driven QA for character reference assets.

This is the editorial layer between "the image model returned bytes" and
"the character library shows the asset as ready". The image model is good
but not perfect; without a gate, the panel-rendering stage will happily
condition on a blurry blob and ship blurry panels forever.

Design notes
------------
* The service is a **pure dependency** on the asset list + a vision client.
  It does NOT mutate persistence; the caller (book stage) is responsible
  for writing ``MangaAssetDoc.status`` from the report. Keeping I/O at the
  edge means this service tests with no DB at all.
* Cheap heuristic checks (file exists, image dimensions) run BEFORE the
  vision call. A failed heuristic short-circuits the vision call \u2014 we are
  not going to ask a $0.001 vision LLM whether a 64-pixel JPEG is a
  character.
* Vision call shape: one call per asset. We do NOT batch images into one
  call because (a) batched comparisons cost more attention and produce
  worse single-asset signal, (b) one asset per call lets us retry only the
  asset that failed, (c) cost is bounded by the number of assets (\u224810),
  not the number of slices.
* The vision prompt is intentionally narrow: yes/no + a 1\u20135 score + brief
  reason. Open-ended "review this character" prompts produce flowery prose
  that no validator can act on. We design AROUND the LLM's strengths
  (perception) without asking it to be a creative writer too.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image

from app.domain.manga.artifacts import CharacterDesign
from app.domain.manga.sprite_quality import (
    AssetSpriteReview,
    SpriteCheck,
    SpriteQualityReport,
)
from app.domain.manga.types import MangaAssetSpec
from app.manga_pipeline.vision_contracts import VisionImage, VisionModelClient


logger = logging.getLogger(__name__)


# Tunables \u2014 exposed at module level so a deployment can override via a
# settings layer later, but live as constants today.

# Below this short-side dimension we mark the asset failed without
# wasting a vision call. 512 px is the smallest the image model is
# specced to return; anything smaller was almost certainly a generation
# error.
MIN_DIMENSION_PX = 512

# A reference sheet is "ideal" at >= this short-side. Smaller-but-OK
# images get a warning, not an error.
PREFERRED_DIMENSION_PX = 768

# 1\u20135 score the vision LLM assigns to silhouette match. <= this is a
# warning (review_required). We do not error here because the vision
# model's perception of "matches the bible" is fuzzier than its
# perception of "this is a person".
SILHOUETTE_MATCH_WARN_THRESHOLD = 3


@dataclass(frozen=True)
class SpriteQualityServiceConfig:
    """Knobs the caller may override per-project / per-test.

    A frozen dataclass instead of bare kwargs so the surface is explicit
    and so tests can construct a single config and reuse it.
    """

    min_dimension_px: int = MIN_DIMENSION_PX
    preferred_dimension_px: int = PREFERRED_DIMENSION_PX
    silhouette_match_warn_threshold: int = SILHOUETTE_MATCH_WARN_THRESHOLD
    # Image base directory. Asset specs/docs hold paths *relative* to this
    # root; the service resolves them when reading the file. Injected so
    # tests do not need to set environment variables.
    image_base_dir: Path | None = None


# ---------------------------------------------------------------------------
# Vision prompt \u2014 the editorial system prompt for the sprite gate.
# ---------------------------------------------------------------------------
#
# Narrow on purpose. The model's job is perception + adherence-checking,
# not creative critique. Open-ended prompts produce essays; this prompt
# produces a JSON object every consumer can act on.
SPRITE_QUALITY_SYSTEM_PROMPT = """You are an editorial QA reviewer for a manga production pipeline.

You are shown ONE character reference sheet (a single character, plain
background, intended to be used as conditioning for downstream panel art).

Your job: answer in JSON the following questions about the image, using
ONLY what is visible. Do not invent details. Do not editorialize.

Return EXACTLY this JSON shape, with no surrounding prose:

{
  "is_single_character": true | false,
  "background_is_plain": true | false,
  "has_text_or_watermark": true | false,
  "silhouette_match_score": <integer 1\u20135>,
  "silhouette_notes": "<\u2264 200 chars: what matches or differs>"
}

Definitions:
* ``is_single_character`` \u2014 true iff exactly one character is depicted.
  Background props/scenery do not count as characters.
* ``background_is_plain`` \u2014 true iff the background is a flat colour or
  a soft gradient suitable for use as a turnaround sheet.
* ``has_text_or_watermark`` \u2014 true if any letters, numbers, signature,
  or watermark are visible anywhere in the image.
* ``silhouette_match_score`` \u2014 5 = perfect match to the description
  provided in the user message; 1 = clearly a different character.
"""


# ---------------------------------------------------------------------------
# Public service entry point.
# ---------------------------------------------------------------------------


async def review_sprite_assets(
    *,
    assets: list[MangaAssetSpec],
    asset_image_paths: dict[str, str],
    bible_characters: list[CharacterDesign],
    vision_client: VisionModelClient,
    config: SpriteQualityServiceConfig | None = None,
) -> SpriteQualityReport:
    """Run the full sprite-quality gate over every supplied asset.

    Parameters
    ----------
    assets
        The asset specs we want to review. Only specs whose
        ``asset_type == "character"`` are considered; world/prop sheets
        are skipped (they have a separate, looser gate).
    asset_image_paths
        Map of ``asset_id \u2192 image_path`` (relative to
        ``config.image_base_dir``). Decoupled from ``assets`` so the
        service does not need to know how persistence stores the file
        location \u2014 the caller hands us the resolved path.
    bible_characters
        The frozen bible. The vision call is told the bible's
        silhouette/outfit description for each character so it can score
        adherence.
    vision_client
        Anything implementing ``VisionModelClient``. Tests pass a fake.
    config
        Optional overrides; sensible defaults otherwise.
    """
    cfg = config or SpriteQualityServiceConfig()
    bible_lookup = {c.character_id: c for c in bible_characters}

    reviews: list[AssetSpriteReview] = []
    for spec in assets:
        if spec.asset_type != "character":
            # World/prop sheets are out of scope for this gate. They
            # have neither a silhouette description nor a notion of
            # "single character", so the same prompt would produce
            # noise. Add a sibling gate when we need one.
            continue

        image_path_rel = asset_image_paths.get(spec.asset_id, "")
        if not image_path_rel:
            # Asset spec was queued but never rendered (image generation
            # disabled, or upstream failure). Mark missing so the UI can
            # surface a "regenerate" button instead of silently shipping
            # a prompt-only asset into panel rendering.
            reviews.append(
                AssetSpriteReview(
                    asset_id=spec.asset_id,
                    character_id=spec.character_id,
                    image_path="",
                    checks=[
                        SpriteCheck(
                            code="SPRITE_FILE_MISSING",
                            severity="error",
                            message="No image was generated for this asset.",
                        )
                    ],
                )
            )
            continue

        review = await _review_one_asset(
            spec=spec,
            image_path_rel=image_path_rel,
            bible_character=bible_lookup.get(spec.character_id),
            vision_client=vision_client,
            cfg=cfg,
        )
        reviews.append(review)

    return SpriteQualityReport(asset_reviews=reviews)


# ---------------------------------------------------------------------------
# Per-asset pipeline.
# ---------------------------------------------------------------------------


async def _review_one_asset(
    *,
    spec: MangaAssetSpec,
    image_path_rel: str,
    bible_character: CharacterDesign | None,
    vision_client: VisionModelClient,
    cfg: SpriteQualityServiceConfig,
) -> AssetSpriteReview:
    """Run cheap heuristics, then (if they pass) the vision call."""
    checks: list[SpriteCheck] = []
    abs_path = _resolve_image_path(image_path_rel, cfg.image_base_dir)

    # ---- heuristic 1: file exists --------------------------------------
    if not abs_path.is_file():
        checks.append(
            SpriteCheck(
                code="SPRITE_FILE_MISSING",
                severity="error",
                message=f"Image file is missing on disk: {image_path_rel}",
            )
        )
        # No point attempting dimension or vision check.
        return AssetSpriteReview(
            asset_id=spec.asset_id,
            character_id=spec.character_id,
            image_path=image_path_rel,
            checks=checks,
        )

    # ---- heuristic 2: image dimensions ---------------------------------
    short_side = _short_side_px(abs_path)
    if short_side is None:
        # Pillow could not open the file. Treat as a hard failure; the
        # downstream image model will fail too.
        checks.append(
            SpriteCheck(
                code="SPRITE_FILE_MISSING",
                severity="error",
                message="Image bytes are unreadable or corrupt.",
            )
        )
        return AssetSpriteReview(
            asset_id=spec.asset_id,
            character_id=spec.character_id,
            image_path=image_path_rel,
            checks=checks,
        )
    if short_side < cfg.min_dimension_px:
        checks.append(
            SpriteCheck(
                code="SPRITE_TOO_SMALL",
                severity="error",
                message=(
                    f"Image short side is {short_side}px; minimum is "
                    f"{cfg.min_dimension_px}px."
                ),
            )
        )
        # Skip the vision call; we know the asset has to be regenerated.
        return AssetSpriteReview(
            asset_id=spec.asset_id,
            character_id=spec.character_id,
            image_path=image_path_rel,
            checks=checks,
        )
    if short_side < cfg.preferred_dimension_px:
        # Warning, not error: the asset is technically usable but lower
        # detail than we want for panel conditioning. Surfaced in UI.
        checks.append(
            SpriteCheck(
                code="SPRITE_TOO_SMALL",
                severity="warning",
                message=(
                    f"Image short side is {short_side}px; preferred is "
                    f"\u2265 {cfg.preferred_dimension_px}px."
                ),
            )
        )

    # ---- vision call ---------------------------------------------------
    silhouette_score: int | None = None
    try:
        vision_result = await _run_vision_check(
            spec=spec,
            abs_path=abs_path,
            bible_character=bible_character,
            vision_client=vision_client,
        )
    except Exception as exc:  # noqa: BLE001 \u2014 surface ANY vision failure as a warning
        # We deliberately do NOT propagate. A vision-LLM outage cannot
        # block the entire book understanding flow; we degrade gracefully
        # to the heuristic findings we already have. The check itself is
        # the audit trail.
        logger.warning(
            "[SPRITE-QA] vision call failed for asset %s: %s", spec.asset_id, exc
        )
        checks.append(
            SpriteCheck(
                code="SPRITE_VISION_CALL_FAILED",
                severity="warning",
                message=(
                    "Vision QA call failed; asset shipped with heuristic "
                    "checks only. Run the gate again to re-score."
                ),
                detail=str(exc)[:240],
            )
        )
    else:
        checks.extend(_translate_vision_result(vision_result))
        score = vision_result.get("silhouette_match_score")
        if isinstance(score, int) and 1 <= score <= 5:
            silhouette_score = score
            if score <= cfg.silhouette_match_warn_threshold:
                checks.append(
                    SpriteCheck(
                        code="SPRITE_SILHOUETTE_MISMATCH",
                        severity="warning",
                        message=(
                            f"Silhouette match score is {score}/5. Notes: "
                            f"{vision_result.get('silhouette_notes', '').strip()}"
                        ),
                    )
                )

    return AssetSpriteReview(
        asset_id=spec.asset_id,
        character_id=spec.character_id,
        image_path=image_path_rel,
        checks=checks,
        silhouette_match_score=silhouette_score,
    )


def _translate_vision_result(parsed: dict[str, Any]) -> list[SpriteCheck]:
    """Convert the vision LLM's JSON answer into SpriteCheck rows.

    Each boolean from the prompt maps to at most one named check. We do
    NOT push raw model output into the report \u2014 every check has a stable
    code so the UI can switch on it.
    """
    out: list[SpriteCheck] = []
    if parsed.get("is_single_character") is False:
        out.append(
            SpriteCheck(
                code="SPRITE_MULTIPLE_CHARACTERS",
                severity="error",
                message="More than one character detected in this reference sheet.",
            )
        )
    if parsed.get("background_is_plain") is False:
        out.append(
            SpriteCheck(
                code="SPRITE_BACKGROUND_NOT_PLAIN",
                severity="warning",
                message=(
                    "Background is not plain; downstream panel rendering "
                    "may bleed scene elements into other panels."
                ),
            )
        )
    if parsed.get("has_text_or_watermark") is True:
        out.append(
            SpriteCheck(
                code="SPRITE_HAS_TEXT",
                severity="error",
                message=(
                    "Image contains text or a watermark. Sprite sheets must "
                    "be text-free."
                ),
            )
        )
    return out


async def _run_vision_check(
    *,
    spec: MangaAssetSpec,
    abs_path: Path,
    bible_character: CharacterDesign | None,
    vision_client: VisionModelClient,
) -> dict[str, Any]:
    """Issue the single vision call for one asset and return parsed JSON.

    Raises if the model returns unparseable output \u2014 the caller catches
    and converts to a SPRITE_VISION_CALL_FAILED warning.
    """
    user_message = _build_vision_user_message(spec=spec, bible=bible_character)
    response = await vision_client.analyze_image(
        system_prompt=SPRITE_QUALITY_SYSTEM_PROMPT,
        user_message=user_message,
        images=[VisionImage(path=abs_path, label=spec.asset_id)],
        max_tokens=400,
        temperature=0.1,  # we want consistent perception, not creativity
        json_mode=True,
    )
    parsed = response.get("parsed")
    if not isinstance(parsed, dict):
        # Some providers ignore json_mode for vision; try one more parse
        # attempt before giving up.
        content = response.get("content", "") or ""
        parsed = _extract_json(content)
    if not isinstance(parsed, dict):
        raise ValueError(
            f"vision response was not valid JSON: {response.get('content','')!r}"
        )
    return parsed


def _build_vision_user_message(
    *, spec: MangaAssetSpec, bible: CharacterDesign | None
) -> str:
    """Render the user side of the vision prompt for one asset.

    The bible description is the *ground truth* the model scores against.
    We feed it as labelled fields, not free prose, because the model gives
    cleaner adherence judgements when the criteria are enumerated.
    """
    lines = [
        f"Asset id: {spec.asset_id}",
        f"Character id: {spec.character_id}",
        f"Intended use: {spec.asset_type} reference sheet",
    ]
    if bible is not None:
        lines.append("")
        lines.append("Bible description (treat as ground truth):")
        lines.append(f"  Name: {bible.name}")
        lines.append(f"  Visual lock: {bible.visual_lock}")
        if bible.silhouette_notes:
            lines.append(f"  Silhouette notes: {bible.silhouette_notes}")
        if bible.outfit_notes:
            lines.append(f"  Outfit notes: {bible.outfit_notes}")
        if bible.hair_or_face_notes:
            lines.append(f"  Hair/face notes: {bible.hair_or_face_notes}")
    else:
        # Should not happen in production (every asset is built from a
        # bible character), but the gate must not crash if it does.
        lines.append("")
        lines.append("(No bible description available; score 3 by default.)")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Helpers.
# ---------------------------------------------------------------------------


def _resolve_image_path(rel: str, base: Path | None) -> Path:
    """Resolve an asset-relative path against the configured image dir.

    A None ``base`` resolves to the image dir from settings. We import
    settings lazily so unit tests with no environment can pass an
    explicit base in ``SpriteQualityServiceConfig``.
    """
    rel_path = Path(rel)
    if rel_path.is_absolute():
        return rel_path
    if base is not None:
        return base / rel_path
    from app.config import get_settings  # local import: avoid module-level dep

    return Path(get_settings().image_dir) / rel_path


def _short_side_px(path: Path) -> int | None:
    """Return the image's shorter dimension, or None if Pillow chokes."""
    try:
        with Image.open(path) as img:
            return min(img.size)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[SPRITE-QA] Pillow could not open %s: %s", path, exc)
        return None


def _extract_json(text: str) -> dict[str, Any] | None:
    """Best-effort JSON extraction from a possibly-prose response.

    Some vision providers wrap JSON in code fences or surrounding prose
    even when asked not to. We strip the most common shapes; anything
    weirder is simply rejected by the caller.
    """
    text = text.strip()
    if text.startswith("```"):
        # ```json\n{...}\n```
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None
