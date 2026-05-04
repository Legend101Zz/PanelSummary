"""Deterministic book-level character sheet planning.

The original per-slice ``character_asset_plan_stage`` asked the LLM to invent
asset prompts every slice. That cost money on every run AND let the prompts
drift from the locked visual bible — defeating the whole point of the bible.

This module replaces that for the common case: given the frozen
``CharacterWorldBible``, produce a ``CharacterAssetPlan`` mechanically. Every
character gets:

* ONE reference sheet — front view, neutral, full body. The "model sheet" a
  manga artist would draw before any panel work.
* N expression sheets — the smallest set of poses that cover the emotional
  range a slice can need. We default to neutral, determined, distress.

Determinism matters here: feeding the same bible twice MUST yield the same
plan, otherwise the library service can't tell whether it has the assets it
needs. We pin this with a unit test.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.manga import (
    CharacterAssetPlan,
    CharacterDesign,
    CharacterWorldBible,
    MangaAssetSpec,
)


# Default expression set covering the editorial range a slice can need.
# Three is the smallest set that gives a colorist/letterer real reach without
# bloating the asset library. We chose pose anchors that survive translation
# to image-model prompts (a sad face is harder to render reliably than a
# distressed posture, so we lean on body language).
DEFAULT_EXPRESSIONS: tuple[str, ...] = ("neutral", "determined", "distress")

REFERENCE_ASSET_TYPE = "reference_sheet"
EXPRESSION_ASSET_TYPE = "expression"


@dataclass(frozen=True)
class CharacterSheetPlanOptions:
    """Knobs for sheet planning.

    We expose only the minimum useful knobs. Anything bigger (extra angle
    sheets, body-type variants, costume variants) belongs in a follow-up
    feature, not in a kitchen-sink options object.
    """

    expressions: tuple[str, ...] = DEFAULT_EXPRESSIONS
    image_model: str | None = None


def _stable_asset_id(character_id: str, asset_type: str, expression: str) -> str:
    """Build a stable, collision-resistant asset id.

    The id MUST be a pure function of the inputs so the library service can
    deduplicate without doing fuzzy matching. We sanitize the same way the
    image path builder does for the same reason.
    """
    safe_char = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in character_id)
    safe_expr = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in expression)
    return f"{safe_char}__{asset_type}__{safe_expr}"


def _bible_visual_lock_block(character: CharacterDesign) -> str:
    """Render the bible's visual-lock fields as deterministic prose.

    This is the prompt fragment we want to MECHANICALLY include in every asset
    prompt for this character — not "the LLM will remember", but the actual
    bytes the image model sees. It's the only way to guarantee a sprite
    looks like the same person across every panel.
    """
    parts: list[str] = [
        f"Character: {character.name} ({character.role}).",
        f"Visual lock: {character.visual_lock}.",
    ]
    if character.silhouette_notes.strip():
        parts.append(f"Silhouette: {character.silhouette_notes}.")
    if character.outfit_notes.strip():
        parts.append(f"Costume: {character.outfit_notes}.")
    if character.hair_or_face_notes.strip():
        parts.append(f"Hair/face: {character.hair_or_face_notes}.")
    return " ".join(parts)


def _reference_prompt(character: CharacterDesign, world_summary: str, visual_style: str) -> str:
    """Compose the reference sheet prompt.

    The reference sheet is what a comic artist would call a model sheet — front
    view, neutral pose, clean background. Every later expression sheet inherits
    this prompt so they all share the same anatomy.
    """
    return (
        f"Manga character reference sheet, front view, full body, neutral pose, T-pose-friendly. "
        f"{_bible_visual_lock_block(character)} "
        f"World context: {world_summary}. "
        f"Style: {visual_style}. "
        f"Plain white background, no props beyond costume, suitable as a model sheet for downstream panel art."
    )


def _expression_prompt(
    character: CharacterDesign,
    expression: str,
    world_summary: str,
    visual_style: str,
) -> str:
    """Compose an expression sheet prompt for the given pose label."""
    return (
        f"Manga character expression study: {expression}. "
        f"Bust shot, focus on face and upper body language. "
        f"{_bible_visual_lock_block(character)} "
        f"World context: {world_summary}. "
        f"Style: {visual_style}. "
        f"Plain white background, single subject, consistent with the reference sheet for this character."
    )


def _specs_for_character(
    *,
    character: CharacterDesign,
    project_id: str,
    world_summary: str,
    visual_style: str,
    options: CharacterSheetPlanOptions,
) -> list[MangaAssetSpec]:
    """Build the deterministic spec list for one character.

    Order matters: reference sheet first so the library service generates it
    before anything that conceptually inherits from it. (We do not actually
    chain image generations today, but the order future-proofs the contract.)
    """
    specs: list[MangaAssetSpec] = [
        MangaAssetSpec(
            asset_id=_stable_asset_id(character.character_id, REFERENCE_ASSET_TYPE, "neutral"),
            character_id=character.character_id,
            asset_type=REFERENCE_ASSET_TYPE,
            expression="neutral",
            prompt=_reference_prompt(character, world_summary, visual_style),
            model=options.image_model or "",
        )
    ]
    seen_expressions: set[str] = set()
    for expression in options.expressions:
        normalized = expression.strip().lower()
        if not normalized or normalized in seen_expressions:
            # Defensive: callers can pass duplicates; we silently dedupe so the
            # library service does not see two specs with the same asset_id.
            continue
        seen_expressions.add(normalized)
        specs.append(
            MangaAssetSpec(
                asset_id=_stable_asset_id(character.character_id, EXPRESSION_ASSET_TYPE, normalized),
                character_id=character.character_id,
                asset_type=EXPRESSION_ASSET_TYPE,
                expression=normalized,
                prompt=_expression_prompt(character, normalized, world_summary, visual_style),
                model=options.image_model or "",
            )
        )
    return specs


def plan_book_character_sheets(
    *,
    bible: CharacterWorldBible,
    project_id: str,
    options: CharacterSheetPlanOptions | None = None,
) -> CharacterAssetPlan:
    """Build the deterministic asset plan for every character in the bible.

    Pure function. No I/O, no LLM. Called once after book understanding is
    complete; the resulting plan is then handed to the library service to
    materialize into ``MangaAssetDoc`` rows (or persisted as prompt-only when
    image generation is disabled).
    """
    if not bible.characters:
        raise ValueError(
            "cannot plan character sheets: bible has no characters "
            "(book understanding probably failed silently)"
        )
    if not project_id.strip():
        raise ValueError("plan_book_character_sheets requires a project_id")

    plan_options = options or CharacterSheetPlanOptions()

    all_specs: list[MangaAssetSpec] = []
    for character in bible.characters:
        all_specs.extend(
            _specs_for_character(
                character=character,
                project_id=project_id,
                world_summary=bible.world_summary,
                visual_style=bible.visual_style,
                options=plan_options,
            )
        )

    return CharacterAssetPlan(
        project_id=project_id,
        assets=all_specs,
        consistency_notes=(
            "Plan generated deterministically from the locked CharacterWorldBible. "
            "Every prompt mechanically includes the character's visual_lock, silhouette, "
            "outfit, and hair/face notes so the image model cannot drift across slices."
        ),
    )
