"""Image-model execution for reusable manga character assets."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from pathlib import Path

from app.config import get_settings
from app.domain.manga import MangaAssetSpec
from app.image_generator import DEFAULT_IMAGE_MODEL, generate_image_with_model
from app.manga_models import MangaAssetDoc

ImageGenerator = Callable[..., Awaitable[bool]]


def build_asset_relative_path(project_id: str, asset: MangaAssetSpec) -> str:
    """Return stable relative path for a generated manga asset image."""
    safe_asset_id = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in asset.asset_id)
    return f"manga_assets/{project_id}/{safe_asset_id}.png"


def build_asset_prompt(asset: MangaAssetSpec, style: str) -> str:
    """Create the final image-model prompt for a reusable asset."""
    return (
        f"{asset.prompt}\n\n"
        f"Asset type: {asset.asset_type}. Expression/pose: {asset.expression or 'neutral'}.\n"
        f"Manga production asset, reusable sprite/reference, clean white or transparent background.\n"
        f"Style key: {style}. Keep silhouette and costume details consistent across future images."
    ).strip()


async def generate_asset_image_doc(
    *,
    project_id: str,
    asset: MangaAssetSpec,
    api_key: str,
    style: str,
    image_model: str | None,
    image_generator: ImageGenerator = generate_image_with_model,
) -> MangaAssetDoc:
    """Generate one asset image and persist its asset document.

    This is intentionally strict: no local placeholder fallback and no silent
    model switching. If the image model fails, the caller receives a clear error.
    """
    model = asset.model or image_model or DEFAULT_IMAGE_MODEL
    relative_path = build_asset_relative_path(project_id, asset)
    output_path = str(Path(get_settings().image_dir) / relative_path)
    prompt = build_asset_prompt(asset, style)

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
    await doc.insert()
    return doc


async def persist_asset_prompt_doc(
    *,
    project_id: str,
    asset: MangaAssetSpec,
    style: str,
    image_model: str | None,
) -> MangaAssetDoc:
    """Persist a prompt-only asset doc when image generation is disabled."""
    model = asset.model or image_model or ""
    doc = MangaAssetDoc(
        project_id=project_id,
        character_id=asset.character_id,
        asset_type=asset.asset_type,
        expression=asset.expression,
        image_path=asset.image_path,
        prompt=build_asset_prompt(asset, style),
        model=model,
        metadata={"asset_id": asset.asset_id, "generation": "prompt_only"},
    )
    await doc.insert()
    return doc
