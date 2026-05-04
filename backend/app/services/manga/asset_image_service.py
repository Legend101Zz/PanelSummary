"""Image-model execution for reusable manga character assets."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from pathlib import Path

from app.config import get_settings
from app.domain.manga import CharacterDesign, MangaAssetSpec
from app.image_generator import DEFAULT_IMAGE_MODEL, generate_image_with_model
from app.manga_models import MangaAssetDoc

ImageGenerator = Callable[..., Awaitable[bool]]


def build_asset_relative_path(project_id: str, asset: MangaAssetSpec) -> str:
    """Return stable relative path for a generated manga asset image."""
    safe_asset_id = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in asset.asset_id)
    return f"manga_assets/{project_id}/{safe_asset_id}.png"


def _visual_lock_block(character: CharacterDesign) -> str:
    """Mechanically render the bible's visual-lock fields as prompt prose.

    Phase 3 invariant: the visual lock is enforced by string concatenation,
    NOT by trusting the LLM-authored ``asset.prompt`` to remember it. If the
    bible says the character has a scar over their left eye, that scar must
    appear in every prompt for that character — full stop.
    """
    parts: list[str] = [
        f"Character {character.name} ({character.role}).",
        f"Visual lock: {character.visual_lock}.",
    ]
    if character.silhouette_notes.strip():
        parts.append(f"Silhouette: {character.silhouette_notes}.")
    if character.outfit_notes.strip():
        parts.append(f"Costume: {character.outfit_notes}.")
    if character.hair_or_face_notes.strip():
        parts.append(f"Hair/face: {character.hair_or_face_notes}.")
    return " ".join(parts)


def build_asset_prompt(
    asset: MangaAssetSpec,
    style: str,
    *,
    character_design: CharacterDesign | None = None,
) -> str:
    """Create the final image-model prompt for a reusable asset.

    When ``character_design`` is provided we mechanically inject the bible's
    visual lock fields. The asset's own prompt remains the primary creative
    direction; the visual-lock block is appended as a non-negotiable constraint
    so a sloppy LLM-authored prompt cannot lose the character's identity.
    """
    visual_lock = (
        f"\n\nVisual continuity (must be honoured): {_visual_lock_block(character_design)}"
        if character_design is not None
        else ""
    )
    return (
        f"{asset.prompt}\n\n"
        f"Asset type: {asset.asset_type}. Expression/pose: {asset.expression or 'neutral'}.\n"
        f"Manga production asset, reusable sprite/reference, clean white or transparent background.\n"
        f"Style key: {style}. Keep silhouette and costume details consistent across future images."
        f"{visual_lock}"
    ).strip()


async def build_generated_asset_doc(
    *,
    project_id: str,
    asset: MangaAssetSpec,
    api_key: str,
    style: str,
    image_model: str | None,
    character_design: CharacterDesign | None = None,
    image_generator: ImageGenerator = generate_image_with_model,
) -> MangaAssetDoc:
    """Generate one asset image and return an unsaved asset document.

    This is intentionally strict: no local placeholder fallback and no silent
    model switching. The caller controls persistence ordering so page/slice docs
    are not saved before required image assets succeed.
    """
    model = asset.model or image_model or DEFAULT_IMAGE_MODEL
    relative_path = build_asset_relative_path(project_id, asset)
    output_path = str(Path(get_settings().image_dir) / relative_path)
    prompt = build_asset_prompt(asset, style, character_design=character_design)

    ok = await image_generator(
        prompt=prompt,
        api_key=api_key,
        output_path=output_path,
        image_model=model,
        aspect_ratio="1:1",
    )
    if not ok:
        raise ValueError(f"image model failed to generate asset {asset.asset_id} with {model}")

    doc = MangaAssetDoc(
        project_id=project_id,
        character_id=asset.character_id,
        asset_type=asset.asset_type,
        expression=asset.expression,
        image_path=relative_path,
        prompt=prompt,
        model=model,
        metadata={"asset_id": asset.asset_id, "generation": "strict_image_model"},
    )
    return doc


async def generate_asset_image_doc(
    *,
    project_id: str,
    asset: MangaAssetSpec,
    api_key: str,
    style: str,
    image_model: str | None,
    character_design: CharacterDesign | None = None,
    image_generator: ImageGenerator = generate_image_with_model,
) -> MangaAssetDoc:
    """Generate one asset image, persist, and return its document."""
    doc = await build_generated_asset_doc(
        project_id=project_id,
        asset=asset,
        api_key=api_key,
        style=style,
        image_model=image_model,
        character_design=character_design,
        image_generator=image_generator,
    )
    await doc.insert()
    return doc


async def persist_asset_prompt_doc(
    *,
    project_id: str,
    asset: MangaAssetSpec,
    style: str,
    image_model: str | None,
    character_design: CharacterDesign | None = None,
) -> MangaAssetDoc:
    """Persist a prompt-only asset doc when image generation is disabled."""
    doc = await build_prompt_asset_doc(
        project_id=project_id,
        asset=asset,
        style=style,
        image_model=image_model,
        character_design=character_design,
    )
    await doc.insert()
    return doc


async def build_prompt_asset_doc(
    *,
    project_id: str,
    asset: MangaAssetSpec,
    style: str,
    image_model: str | None,
    character_design: CharacterDesign | None = None,
) -> MangaAssetDoc:
    """Return an unsaved prompt-only asset doc when image generation is disabled."""
    model = asset.model or image_model or ""
    return MangaAssetDoc(
        project_id=project_id,
        character_id=asset.character_id,
        asset_type=asset.asset_type,
        expression=asset.expression,
        image_path=asset.image_path,
        prompt=build_asset_prompt(asset, style, character_design=character_design),
        model=model,
        metadata={"asset_id": asset.asset_id, "generation": "prompt_only"},
    )
