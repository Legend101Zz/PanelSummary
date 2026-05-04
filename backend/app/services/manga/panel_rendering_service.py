"""Phase 4 — multimodal panel rendering.

Per-panel image generation that uses the project's character library as
**multimodal conditioning** for the image model. The Gemini Nano Banana family
on OpenRouter accepts ``image_url`` parts in the chat message; we feed the
relevant character reference sheets so the model paints the panel with the
SAME character it has rendered before.

Design rules:

* **No fallback to "skip the image model".** If the orchestrator chose to run
  this stage, image generation must happen. Failures bubble up with the
  failing panel id so the job surface a useful error, not silently degrade
  to text-only manga.
* **Prompt composition is mechanical.** The LLM authored everything upstream
  (storyboard composition, art direction, dialogue). Here we compose those
  layers into a single panel prompt with the bible's visual_lock appended as
  the FINAL block — defense in depth.
* **Reference selection is deterministic.** For each character the panel
  features, we pull the highest-fidelity asset available (a reference sheet
  beats an expression sheet) so the model always sees the canonical look.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.domain.manga import (
    CharacterArtDirectionBundle,
    CharacterDesign,
    CharacterWorldBible,
)
from app.image_generator import DEFAULT_IMAGE_MODEL, generate_image_with_references
from app.manga_models import MangaAssetDoc

logger = logging.getLogger(__name__)


PanelRenderer = Callable[..., Awaitable[bool]]


REFERENCE_ASSET_TYPE = "reference_sheet"
EXPRESSION_ASSET_TYPE = "expression"

# Aspect ratio per V4 panel `type`. Splash panels are tall to land impact;
# dialogue-driven panels are square for tight close-ups; concept/data panels
# get wider framing to fit the cognitive load. These are the same aspect
# choices a manga letterer would pick for the corresponding panel role.
_PANEL_ASPECT_RATIO: dict[str, str] = {
    "splash": "2:3",
    "title": "2:3",
    "transition": "2:3",
    "dialogue": "1:1",
    "narration": "1:1",
    "concept": "3:2",
    "montage": "3:2",
    "data": "3:2",
}


@dataclass
class PanelRenderResult:
    """Per-panel outcome with enough info to surface a useful error."""

    panel_id: str
    page_index: int
    image_path: str = ""  # relative under the project's image dir
    aspect_ratio: str = ""
    error: str = ""
    used_reference_assets: list[str] = field(default_factory=list)


@dataclass
class PageRenderingSummary:
    """Aggregate outcome the stage attaches to ``context.options``."""

    rendered: int = 0
    failed: int = 0
    results: list[PanelRenderResult] = field(default_factory=list)

    @property
    def total(self) -> int:
        return self.rendered + self.failed


def build_asset_lookup(assets: list[MangaAssetDoc]) -> dict[str, dict[str, MangaAssetDoc]]:
    """Group asset docs by ``character_id`` then by ``asset_type``.

    We keep the inner dict by asset_type so the renderer can prefer reference
    sheets and fall back to expression sheets without scanning the list.

    Phase B1: there are now multiple reference sheets per character (front,
    side, back). The selector wants the FRONT view as the canonical
    conditioning image, so we pick deterministically: front > side > back >
    whatever's there. Without this preference order the dict ends up with
    whichever angle was loaded last — nondeterministic and a flaky-test
    factory.
    """
    # asset_type -> expression preference order. Anything not in the list
    # gets a stable insertion-order fallback.
    REFERENCE_ANGLE_PREFERENCE = ("front", "side", "back", "neutral")

    grouped: dict[str, dict[str, list[MangaAssetDoc]]] = {}
    for doc in assets:
        if not doc.character_id:
            continue
        grouped.setdefault(doc.character_id, {}).setdefault(doc.asset_type, []).append(doc)

    lookup: dict[str, dict[str, MangaAssetDoc]] = {}
    for character_id, by_type in grouped.items():
        per_type: dict[str, MangaAssetDoc] = {}
        for asset_type, docs in by_type.items():
            if asset_type == REFERENCE_ASSET_TYPE and len(docs) > 1:
                # Pick by angle preference; fall back to first.
                docs_by_label = {doc.expression: doc for doc in docs}
                chosen = next(
                    (docs_by_label[label] for label in REFERENCE_ANGLE_PREFERENCE if label in docs_by_label),
                    docs[0],
                )
                per_type[asset_type] = chosen
            else:
                per_type[asset_type] = docs[0]
        lookup[character_id] = per_type
    return lookup


def select_reference_paths_for_characters(
    *,
    character_ids: list[str],
    asset_lookup: dict[str, dict[str, MangaAssetDoc]],
    image_root: Path,
) -> list[tuple[str, str]]:
    """Return ``(character_id, absolute_path)`` for each character in the panel.

    Prefers ``reference_sheet`` over any ``expression`` sheet because the
    reference is the canonical full-body model sheet — exactly what we want
    the image model to use as visual conditioning. Characters without any
    asset in the library are silently skipped (the panel still renders, just
    without that character's reference; the bible visual_lock fragment in
    the prompt still constrains the look).
    """
    selections: list[tuple[str, str]] = []
    seen: set[str] = set()
    for character_id in character_ids:
        if character_id in seen:
            continue
        seen.add(character_id)
        per_type = asset_lookup.get(character_id) or {}
        chosen = per_type.get(REFERENCE_ASSET_TYPE) or per_type.get(EXPRESSION_ASSET_TYPE)
        if chosen is None or not chosen.image_path:
            continue
        abs_path = str(image_root / chosen.image_path)
        selections.append((character_id, abs_path))
    return selections


def _bible_lock_block(character: CharacterDesign) -> str:
    """Return the bible identity fragment for one character (mechanical)."""
    parts = [
        f"{character.name} ({character.role}): {character.visual_lock}.",
    ]
    if character.silhouette_notes.strip():
        parts.append(f"Silhouette: {character.silhouette_notes}.")
    if character.outfit_notes.strip():
        parts.append(f"Costume: {character.outfit_notes}.")
    if character.hair_or_face_notes.strip():
        parts.append(f"Hair/face: {character.hair_or_face_notes}.")
    return " ".join(parts)


def _art_direction_recipe_block(
    character_id: str,
    art_direction: CharacterArtDirectionBundle | None,
    expression_label: str,
) -> str:
    """Return the LLM-authored lighting/lens/expression block for one character."""
    if art_direction is None:
        return ""
    direction = art_direction.lookup(character_id)
    if direction is None:
        return ""
    parts = [
        f"Lighting: {direction.lighting_recipe}",
        f"Lens: {direction.lens_recipe}",
    ]
    expression = art_direction.lookup_expression(character_id, expression_label)
    if expression is not None:
        parts.append(f"Expression ({expression.label}): {expression.prose}")
        if expression.body_language.strip():
            parts.append(f"Body language: {expression.body_language}")
    return " ".join(parts)


def build_panel_prompt(
    *,
    panel: dict[str, Any],
    bible: CharacterWorldBible,
    art_direction: CharacterArtDirectionBundle | None,
    style: str,
) -> str:
    """Compose the panel-rendering prompt mechanically.

    The storyboard already authored composition + action + dialogue beats.
    The art direction already authored lighting + lens + expression prose.
    The bible already locked character identity. This function CONCATENATES
    those layers so the prompt is fully grounded; no LLM call here.
    """
    bible_lookup = {character.character_id: character for character in bible.characters}

    panel_type = str(panel.get("type", "narration"))
    scene = str(panel.get("scene", ""))
    mood = str(panel.get("mood", ""))
    narration = str(panel.get("narration", ""))
    title = str(panel.get("title", ""))
    expression = str(panel.get("expression", "neutral")) or "neutral"
    pose = str(panel.get("pose", ""))
    effects = panel.get("effects") or []
    character_ids = panel.get("character_ids") or []
    primary_character = str(panel.get("character", ""))
    if primary_character and primary_character not in character_ids:
        character_ids = [primary_character, *character_ids]

    composition_lines: list[str] = [
        f"Manga panel ({panel_type}). Style: {style}.",
        f"World: {bible.world_summary}",
        f"Visual style anchor: {bible.visual_style}",
    ]
    if scene:
        composition_lines.append(f"Scene: {scene}.")
    if mood:
        composition_lines.append(f"Mood: {mood}.")
    if title:
        composition_lines.append(f"Panel title text (visual element only): {title}.")
    if narration:
        composition_lines.append(f"Narration caption: {narration}")
    lines = panel.get("lines") or []
    if lines:
        dialogue_text = " | ".join(
            f"{line.get('who', '')}: \"{line.get('says', '')}\" ({line.get('emotion', '')})"
            for line in lines
        )
        composition_lines.append(f"Dialogue beats: {dialogue_text}")
    if pose:
        composition_lines.append(f"Pose: {pose}.")
    if expression:
        composition_lines.append(f"Primary expression: {expression}.")
    if effects:
        composition_lines.append(f"Visual effects: {', '.join(effects)}.")

    art_blocks: list[str] = []
    for character_id in character_ids:
        recipe = _art_direction_recipe_block(character_id, art_direction, expression)
        if recipe:
            art_blocks.append(f"[{character_id}] {recipe}")
    if art_blocks:
        composition_lines.append("Art direction recipes per character:")
        composition_lines.extend(art_blocks)

    bible_blocks: list[str] = []
    for character_id in character_ids:
        design = bible_lookup.get(character_id)
        if design is None:
            continue
        bible_blocks.append(_bible_lock_block(design))
    if bible_blocks:
        composition_lines.append("Character identity (must be honoured):")
        composition_lines.extend(bible_blocks)

    composition_lines.append(
        "Render as a single manga panel. Manga reading direction is "
        "right-to-left; compose accordingly. Black ink with screentones, "
        "clean line weight, no speech bubbles in the rendered image (text is "
        "added downstream)."
    )
    return "\n".join(composition_lines)


def aspect_ratio_for_panel(panel: dict[str, Any]) -> str:
    """Return the requested aspect ratio for a V4 panel based on its type.

    Defaults to ``1:1`` for any unmapped type so a future panel-type addition
    still renders something sensible without a code change.
    """
    panel_type = str(panel.get("type", ""))
    return _PANEL_ASPECT_RATIO.get(panel_type, "1:1")


def build_panel_relative_path(
    *,
    project_id: str,
    slice_id: str,
    page_index: int,
    panel_id: str,
) -> str:
    """Return the stable relative path the panel renderer writes to."""
    safe_panel = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in panel_id)
    return f"manga_panels/{project_id}/{slice_id}/page_{page_index:02d}/{safe_panel}.png"


async def _render_one_panel(
    *,
    panel: dict[str, Any],
    page_index: int,
    project_id: str,
    slice_id: str,
    image_root: Path,
    bible: CharacterWorldBible,
    art_direction: CharacterArtDirectionBundle | None,
    asset_lookup: dict[str, dict[str, MangaAssetDoc]],
    image_api_key: str,
    image_model: str,
    style: str,
    panel_renderer: PanelRenderer,
) -> PanelRenderResult:
    """Render exactly one panel; return a structured result either way."""
    panel_id = str(panel.get("panel_id") or f"page{page_index}_panel?")
    character_ids = panel.get("character_ids") or []
    primary_character = str(panel.get("character", ""))
    if primary_character and primary_character not in character_ids:
        character_ids = [primary_character, *character_ids]

    references = select_reference_paths_for_characters(
        character_ids=character_ids,
        asset_lookup=asset_lookup,
        image_root=image_root,
    )
    aspect = aspect_ratio_for_panel(panel)
    prompt = build_panel_prompt(
        panel=panel,
        bible=bible,
        art_direction=art_direction,
        style=style,
    )
    relative_path = build_panel_relative_path(
        project_id=project_id,
        slice_id=slice_id,
        page_index=page_index,
        panel_id=panel_id,
    )
    output_path = str(image_root / relative_path)

    try:
        ok = await panel_renderer(
            prompt=prompt,
            reference_image_paths=[ref_path for _, ref_path in references],
            api_key=image_api_key,
            output_path=output_path,
            image_model=image_model,
            aspect_ratio=aspect,
        )
    except Exception as exc:  # noqa: BLE001 — we re-raise as a structured result
        logger.exception("panel render exception for %s", panel_id)
        return PanelRenderResult(
            panel_id=panel_id,
            page_index=page_index,
            error=f"renderer raised: {exc}",
            used_reference_assets=[char_id for char_id, _ in references],
        )

    if not ok:
        return PanelRenderResult(
            panel_id=panel_id,
            page_index=page_index,
            error="renderer returned False",
            used_reference_assets=[char_id for char_id, _ in references],
        )

    panel["image_path"] = relative_path
    panel["image_aspect_ratio"] = aspect
    return PanelRenderResult(
        panel_id=panel_id,
        page_index=page_index,
        image_path=relative_path,
        aspect_ratio=aspect,
        used_reference_assets=[char_id for char_id, _ in references],
    )


async def render_pages(
    *,
    pages: list[dict[str, Any]],
    project_id: str,
    slice_id: str,
    bible: CharacterWorldBible,
    art_direction: CharacterArtDirectionBundle | None,
    library_assets: list[MangaAssetDoc],
    image_api_key: str,
    image_model: str | None,
    style: str,
    image_root: Path | None = None,
    max_concurrency: int = 3,
    panel_renderer: PanelRenderer = generate_image_with_references,
) -> PageRenderingSummary:
    """Render every panel in ``pages`` in place; return a summary.

    Concurrency is bounded so the OpenRouter rate limit is respected. We do
    not use ``asyncio.gather(..., return_exceptions=True)`` because we want
    structured per-panel results, not opaque exception objects.
    """
    if not image_api_key:
        raise ValueError("render_pages requires an image_api_key (no fallback)")

    settings_image_dir = Path(get_settings().image_dir) if image_root is None else image_root
    asset_lookup = build_asset_lookup(library_assets)
    semaphore = asyncio.Semaphore(max(max_concurrency, 1))
    selected_model = image_model or DEFAULT_IMAGE_MODEL

    summary = PageRenderingSummary()

    async def render_with_limit(page_index: int, panel: dict[str, Any]) -> PanelRenderResult:
        async with semaphore:
            return await _render_one_panel(
                panel=panel,
                page_index=page_index,
                project_id=project_id,
                slice_id=slice_id,
                image_root=settings_image_dir,
                bible=bible,
                art_direction=art_direction,
                asset_lookup=asset_lookup,
                image_api_key=image_api_key,
                image_model=selected_model,
                style=style,
                panel_renderer=panel_renderer,
            )

    tasks: list[asyncio.Task[PanelRenderResult]] = []
    for page in pages:
        page_index = int(page.get("page_index", 0))
        for panel in page.get("panels", []) or []:
            tasks.append(asyncio.create_task(render_with_limit(page_index, panel)))

    for finished in await asyncio.gather(*tasks):
        summary.results.append(finished)
        if finished.error:
            summary.failed += 1
        else:
            summary.rendered += 1
    return summary
