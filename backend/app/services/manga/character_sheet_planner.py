"""Book-level character sheet planning.

The planner is the bridge between three layers:

1. **Bible** (``CharacterWorldBible``) — IDENTITY of each character. Hard
   constraint, mechanically spliced into every prompt. Defense in depth.
2. **Art direction** (``CharacterArtDirectionBundle``) — LLM-authored
   RENDERING INTENT (lens, lighting, color story, expression repertoire).
   Run once per project at book-understanding time.
3. **Spec list** (``CharacterAssetPlan``) — concrete ``MangaAssetSpec`` rows
   the library service materializes into ``MangaAssetDoc``.

This module is intentionally simple. It does not call the LLM (the LLM ran
upstream when the art direction bundle was authored). It does not call the
image model (the library service does). It composes prompts that already
carry both the LLM's creative direction AND the bible's hard identity lock.

The planner asks the **art direction** which expressions to render for each
character — the LLM picks expressions that match the character's specific
arc beats, instead of forcing a one-size-fits-all default. The bible
visual-lock fragment is concatenated into every prompt as the LAST line so
even a hallucinated art-direction prose cannot lose the character's identity.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.manga import (
    CharacterArtDirection,
    CharacterArtDirectionBundle,
    CharacterAssetPlan,
    CharacterDesign,
    CharacterWorldBible,
    ExpressionDirection,
    MangaAssetSpec,
)


REFERENCE_ASSET_TYPE = "reference_sheet"
EXPRESSION_ASSET_TYPE = "expression"

# Used only when no art_direction is supplied (legacy projects that ran
# book-understanding before Phase 3 shipped). New projects ALWAYS carry art
# direction and use whatever expressions the LLM picked per character.
LEGACY_DEFAULT_EXPRESSIONS: tuple[str, ...] = ("neutral", "determined", "distress")


@dataclass(frozen=True)
class CharacterSheetPlanOptions:
    """Knobs for sheet planning.

    We expose only the minimum useful knobs. Anything bigger (extra angle
    sheets, body-type variants, costume variants) belongs in a follow-up
    feature, not in a kitchen-sink options object.
    """

    expressions: tuple[str, ...] | None = None  # legacy override; ignored when art_direction present
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
    bytes the image model sees. Concatenated as the FINAL line of every
    prompt so it cannot be diluted by upstream creative prose.
    """
    parts: list[str] = [
        f"Character identity (must be honoured): {character.name} ({character.role}).",
        f"Visual lock: {character.visual_lock}.",
    ]
    if character.silhouette_notes.strip():
        parts.append(f"Silhouette: {character.silhouette_notes}.")
    if character.outfit_notes.strip():
        parts.append(f"Costume: {character.outfit_notes}.")
    if character.hair_or_face_notes.strip():
        parts.append(f"Hair/face: {character.hair_or_face_notes}.")
    return " ".join(parts)


def _art_direction_block(direction: CharacterArtDirection) -> str:
    """Render the LLM-authored art-direction header for a character."""
    return (
        f"Color story: {direction.color_story} "
        f"Lighting: {direction.lighting_recipe} "
        f"Lens: {direction.lens_recipe}"
    )


def _reference_prompt(
    *,
    character: CharacterDesign,
    direction: CharacterArtDirection | None,
    world_summary: str,
    visual_style: str,
) -> str:
    """Compose the reference sheet prompt — the canonical model sheet."""
    art_header = direction.reference_sheet_prose if direction else (
        "Manga character reference sheet, front view, full body, neutral pose, "
        "T-pose-friendly, plain white background, suitable as a model sheet "
        "for downstream panel art."
    )
    art_recipe = _art_direction_block(direction) if direction else ""
    return (
        f"{art_header} "
        f"{art_recipe} "
        f"World context: {world_summary}. "
        f"Style: {visual_style}. "
        f"{_bible_visual_lock_block(character)}"
    ).strip()


def _expression_prompt(
    *,
    character: CharacterDesign,
    direction: CharacterArtDirection | None,
    expression_label: str,
    expression_direction: ExpressionDirection | None,
    world_summary: str,
    visual_style: str,
) -> str:
    """Compose an expression sheet prompt for the given pose label."""
    if expression_direction is not None:
        art_header = (
            f"Manga character expression study: {expression_direction.label}. "
            f"{expression_direction.prose} "
        )
        if expression_direction.body_language.strip():
            art_header += f"Body language: {expression_direction.body_language}. "
    else:
        art_header = (
            f"Manga character expression study: {expression_label}. "
            f"Bust shot, focus on face and upper body language. "
        )
    art_recipe = _art_direction_block(direction) if direction else ""
    return (
        f"{art_header}"
        f"{art_recipe} "
        f"World context: {world_summary}. "
        f"Style: {visual_style}. "
        f"Plain white background, single subject, consistent with the reference "
        f"sheet for this character. "
        f"{_bible_visual_lock_block(character)}"
    ).strip()


def _expressions_for_character(
    *,
    character_id: str,
    direction: CharacterArtDirection | None,
    options: CharacterSheetPlanOptions,
) -> list[tuple[str, ExpressionDirection | None]]:
    """Return ``(label, expression_direction)`` pairs for one character.

    When the LLM-authored art direction is present we use its expression
    repertoire (one per arc-relevant beat). When it is not (legacy projects)
    we fall back to options.expressions or the legacy default set.

    NOTE: this is not a "fallback to avoid the LLM" — it's a backwards-compat
    path for projects whose book-understanding ran before Phase 3 shipped.
    New projects always have art direction.
    """
    if direction is not None:
        return [(exp.label, exp) for exp in direction.expressions]

    labels = options.expressions if options.expressions is not None else LEGACY_DEFAULT_EXPRESSIONS
    deduped: list[str] = []
    seen: set[str] = set()
    for label in labels:
        normalized = label.strip().lower()
        if normalized and normalized not in seen:
            seen.add(normalized)
            deduped.append(normalized)
    return [(label, None) for label in deduped]


def _specs_for_character(
    *,
    character: CharacterDesign,
    direction: CharacterArtDirection | None,
    project_id: str,
    world_summary: str,
    visual_style: str,
    options: CharacterSheetPlanOptions,
) -> list[MangaAssetSpec]:
    """Build the spec list for one character.

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
            prompt=_reference_prompt(
                character=character,
                direction=direction,
                world_summary=world_summary,
                visual_style=visual_style,
            ),
            model=options.image_model or "",
        )
    ]
    for label, expression_direction in _expressions_for_character(
        character_id=character.character_id,
        direction=direction,
        options=options,
    ):
        specs.append(
            MangaAssetSpec(
                asset_id=_stable_asset_id(character.character_id, EXPRESSION_ASSET_TYPE, label),
                character_id=character.character_id,
                asset_type=EXPRESSION_ASSET_TYPE,
                expression=label,
                prompt=_expression_prompt(
                    character=character,
                    direction=direction,
                    expression_label=label,
                    expression_direction=expression_direction,
                    world_summary=world_summary,
                    visual_style=visual_style,
                ),
                model=options.image_model or "",
            )
        )
    return specs


def plan_book_character_sheets(
    *,
    bible: CharacterWorldBible,
    project_id: str,
    art_direction: CharacterArtDirectionBundle | None = None,
    options: CharacterSheetPlanOptions | None = None,
) -> CharacterAssetPlan:
    """Build the asset plan for every character in the bible.

    When ``art_direction`` is supplied (the normal Phase 3 case) the LLM's
    creative direction drives the expression repertoire and the prose. The
    bible's visual-lock is mechanically appended as the LAST line of every
    prompt — defense in depth so a hallucinated art-direction line cannot
    lose the character's identity.

    When ``art_direction`` is None (legacy projects) the planner still runs
    using the bible alone; this path exists strictly for backwards
    compatibility and emits a degraded but valid plan.
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
        direction = (
            art_direction.lookup(character.character_id) if art_direction is not None else None
        )
        all_specs.extend(
            _specs_for_character(
                character=character,
                direction=direction,
                project_id=project_id,
                world_summary=bible.world_summary,
                visual_style=bible.visual_style,
                options=plan_options,
            )
        )

    notes = (
        "Plan composed from the locked CharacterWorldBible AND the LLM-authored "
        "CharacterArtDirectionBundle. Visual_lock is mechanically appended to "
        "every prompt as the final line so the image model cannot drift across "
        "slices."
        if art_direction is not None
        else (
            "Plan composed from the locked CharacterWorldBible alone (legacy "
            "project without art direction). Visual_lock is mechanically "
            "appended to every prompt as the final line."
        )
    )

    return CharacterAssetPlan(
        project_id=project_id,
        assets=all_specs,
        consistency_notes=notes,
    )
