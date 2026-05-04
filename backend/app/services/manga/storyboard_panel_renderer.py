"""Phase 4.2 \u2014 storyboard-panel-shaped panel renderer.

The end-state panel renderer for the manga pipeline. Consumes
``StoryboardPanel`` (the LLM-authored DSL) directly and writes
``PanelRenderArtifact`` instances on the typed ``RenderedPage`` surface.

Why this lives next to ``panel_rendering_service`` rather than inside it
----------------------------------------------------------------------
``panel_rendering_service`` carries the legacy V4-dict path the rest of
the pipeline still consumes during the Phase 4 migration window. Both
paths share infrastructure (``build_asset_lookup``,
``select_reference_paths_for_characters``, ``build_panel_relative_path``,
the bible/art-direction text fragments, the result/summary dataclasses)
which we import from there \u2014 there is no parallel implementation, only
parallel surfaces. The legacy path and this whole module's import-from
the legacy module both go away in 4.5; the names will then shrink back
into one file.

What this module owns
---------------------
* ``aspect_ratio_for_storyboard_panel`` \u2014 framing-true aspect ratio
  keyed off ``ShotType``. Replaces the role-keyed table in the legacy
  module so an ``EXTREME_WIDE`` shot no longer renders 1:1.
* ``build_storyboard_panel_prompt`` \u2014 prompt composition that includes
  the LLM-authored ``purpose``, ``shot_type``, and ``composition`` prose
  (all dropped by the V4 projection).
* ``render_rendered_pages`` \u2014 top-level entry the pipeline stage calls.
  Mutates each ``PanelRenderArtifact`` in place and also returns a
  ``PageRenderingSummary`` so the QA gate's existing summary plumbing
  is unchanged. Both writes happen in the same function so we cannot
  end up with a populated result and an empty artifact.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from app.config import get_settings
from app.domain.manga import (
    CharacterArtDirectionBundle,
    CharacterWorldBible,
    PanelRenderArtifact,
    RenderedPage,
    ShotType,
    StoryboardPanel,
)
from app.image_generator import DEFAULT_IMAGE_MODEL, generate_image_with_references
from app.manga_models import MangaAssetDoc
from app.services.manga.panel_rendering_service import (
    PageRenderingSummary,
    PanelRenderer,
    PanelRenderResult,
    _art_direction_recipe_block,
    _bible_lock_block,
    build_asset_lookup,
    build_panel_relative_path,
    select_reference_paths_for_characters,
)

logger = logging.getLogger(__name__)


# Aspect ratio per ``StoryboardPanel.shot_type``. Keying on shot type
# instead of panel role means the LLM-authored framing intent (a wide
# establishing shot vs a tight close-up) survives all the way to the
# image model \u2014 the previous V4 mapping discarded shot_type entirely
# and an extreme-wide dialogue panel rendered 1:1. Ratios picked to
# match how a manga editor frames each shot type:
#   EXTREME_WIDE      21:9   cinemascope establishing
#   WIDE              16:9   room-scale staging
#   MEDIUM             4:3   conversational two-shot
#   CLOSE_UP           4:5   tall portrait
#   EXTREME_CLOSE_UP   9:16  vertical sliver (eyes / mouth)
#   INSERT             1:1   object / hand / text insert
#   SYMBOLIC           3:2   motif / metaphor beat
_SHOT_TYPE_ASPECT_RATIO: dict[ShotType, str] = {
    ShotType.EXTREME_WIDE: "21:9",
    ShotType.WIDE: "16:9",
    ShotType.MEDIUM: "4:3",
    ShotType.CLOSE_UP: "4:5",
    ShotType.EXTREME_CLOSE_UP: "9:16",
    ShotType.INSERT: "1:1",
    ShotType.SYMBOLIC: "3:2",
}


def aspect_ratio_for_storyboard_panel(panel: StoryboardPanel) -> str:
    """Return the requested aspect ratio for a storyboard panel.

    Unknown shot types raise rather than silently default to 1:1. A
    missing entry means the ``ShotType`` enum was extended without
    updating the table here \u2014 a code change we want to notice
    immediately, not paper over with a generic ratio.
    """
    try:
        return _SHOT_TYPE_ASPECT_RATIO[panel.shot_type]
    except KeyError as exc:
        raise ValueError(
            f"no aspect ratio mapped for shot_type={panel.shot_type!r}; "
            "update _SHOT_TYPE_ASPECT_RATIO when adding a ShotType variant"
        ) from exc


def build_storyboard_panel_prompt(
    *,
    panel: StoryboardPanel,
    bible: CharacterWorldBible,
    art_direction: CharacterArtDirectionBundle | None,
    style: str,
) -> str:
    """Compose the panel-rendering prompt directly from a StoryboardPanel.

    Reading order of the assembled prompt is fixed: editorial framing
    first (purpose, shot, composition), then world/style context, then
    action/dialogue, then per-character art direction recipes, then
    bible identity locks, then the global render footer. Keeping the
    order stable means prompt diffs in production logs are diffs of
    *content*, not of layout.
    """
    bible_lookup = {character.character_id: character for character in bible.characters}
    character_ids = [cid for cid in panel.character_ids if cid]

    composition_lines: list[str] = [
        f"Manga panel. Style: {style}.",
        f"Editorial purpose: {panel.purpose.value}.",
        f"Shot: {panel.shot_type.value}.",
    ]
    if panel.composition.strip():
        # The storyboarder writes a one-sentence framing note per panel
        # ("two-shot, Aiko foregrounded against the lab window"). The
        # V4 projection threw this away; we send it verbatim because no
        # downstream rewrite improves on the LLM's own framing prose.
        composition_lines.append(f"Composition: {panel.composition.strip()}")
    composition_lines.append(f"World: {bible.world_summary}")
    composition_lines.append(f"Visual style anchor: {bible.visual_style}")
    if panel.action.strip():
        composition_lines.append(f"Action: {panel.action.strip()}")
    if panel.narration.strip():
        composition_lines.append(f"Narration caption: {panel.narration.strip()}")
    if panel.dialogue:
        dialogue_text = " | ".join(
            f"{line.speaker_id}: \"{line.text}\" ({line.intent or 'neutral'})"
            for line in panel.dialogue
        )
        composition_lines.append(f"Dialogue beats: {dialogue_text}")

    # Use the panel's first dialogue intent (if any) as the expression
    # cue when looking up a per-character expression direction. Falling
    # back to "neutral" matches the legacy behaviour for narration-only
    # panels and keeps the lookup table simple.
    expression_cue = (
        panel.dialogue[0].intent
        if panel.dialogue and panel.dialogue[0].intent
        else "neutral"
    )

    art_blocks: list[str] = []
    for character_id in character_ids:
        recipe = _art_direction_recipe_block(character_id, art_direction, expression_cue)
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


async def _render_one_storyboard_panel(
    *,
    panel: StoryboardPanel,
    artifact: PanelRenderArtifact,
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
    """Render exactly one storyboard panel; mutate its artifact in place.

    Returns a ``PanelRenderResult`` for the renderer summary AND mutates
    the typed ``PanelRenderArtifact``. Both writes happen here so the
    artifact and the result are guaranteed to agree \u2014 the renderer
    cannot drift into a state where the summary says success but the
    artifact carries an error string (or vice versa).
    """
    character_ids = [cid for cid in panel.character_ids if cid]
    references = select_reference_paths_for_characters(
        character_ids=character_ids,
        asset_lookup=asset_lookup,
        image_root=image_root,
    )
    requested_character_count = len(set(character_ids))
    aspect = aspect_ratio_for_storyboard_panel(panel)
    prompt = build_storyboard_panel_prompt(
        panel=panel,
        bible=bible,
        art_direction=art_direction,
        style=style,
    )
    relative_path = build_panel_relative_path(
        project_id=project_id,
        slice_id=slice_id,
        page_index=page_index,
        panel_id=panel.panel_id,
    )
    output_path = str(image_root / relative_path)
    used_reference_assets = [char_id for char_id, _ in references]

    # Pre-populate the artifact's accounting fields once. The success/
    # failure branches below only need to set image_path or error, not
    # repeat the metadata writes.
    artifact.used_reference_assets = used_reference_assets
    artifact.requested_character_count = requested_character_count

    try:
        ok = await panel_renderer(
            prompt=prompt,
            reference_image_paths=[ref_path for _, ref_path in references],
            api_key=image_api_key,
            output_path=output_path,
            image_model=image_model,
            aspect_ratio=aspect,
        )
    except Exception as exc:  # noqa: BLE001 \u2014 re-raised as a structured artifact + result
        logger.exception("storyboard panel render exception for %s", panel.panel_id)
        artifact.error = f"renderer raised: {exc}"
        return PanelRenderResult(
            panel_id=panel.panel_id,
            page_index=page_index,
            error=artifact.error,
            used_reference_assets=used_reference_assets,
            requested_character_count=requested_character_count,
        )

    if not ok:
        artifact.error = "renderer returned False"
        return PanelRenderResult(
            panel_id=panel.panel_id,
            page_index=page_index,
            error=artifact.error,
            used_reference_assets=used_reference_assets,
            requested_character_count=requested_character_count,
        )

    artifact.image_path = relative_path
    artifact.image_aspect_ratio = aspect
    return PanelRenderResult(
        panel_id=panel.panel_id,
        page_index=page_index,
        image_path=relative_path,
        aspect_ratio=aspect,
        used_reference_assets=used_reference_assets,
        requested_character_count=requested_character_count,
    )


async def render_rendered_pages(
    *,
    rendered_pages: list[RenderedPage],
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
    """Render every panel on every ``RenderedPage`` in place.

    Same concurrency contract and ``PageRenderingSummary`` shape as the
    legacy ``render_pages`` so the QA gate's summary plumbing is
    unchanged. The semantic difference is that the per-panel image_path
    lives on the typed ``PanelRenderArtifact`` rather than mutating an
    untyped V4 dict.
    """
    if not image_api_key:
        raise ValueError("render_rendered_pages requires an image_api_key (no fallback)")

    settings_image_dir = (
        Path(get_settings().image_dir) if image_root is None else image_root
    )
    asset_lookup = build_asset_lookup(library_assets)
    semaphore = asyncio.Semaphore(max(max_concurrency, 1))
    selected_model = image_model or DEFAULT_IMAGE_MODEL

    summary = PageRenderingSummary()

    async def render_with_limit(
        page_index: int,
        panel: StoryboardPanel,
        artifact: PanelRenderArtifact,
    ) -> PanelRenderResult:
        async with semaphore:
            return await _render_one_storyboard_panel(
                panel=panel,
                artifact=artifact,
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
    for rendered_page in rendered_pages:
        page_index = rendered_page.storyboard_page.page_index
        for panel in rendered_page.storyboard_page.panels:
            artifact = rendered_page.panel_artifacts[panel.panel_id]
            tasks.append(
                asyncio.create_task(render_with_limit(page_index, panel, artifact))
            )

    for finished in await asyncio.gather(*tasks):
        summary.results.append(finished)
        if finished.error:
            summary.failed += 1
        else:
            summary.rendered += 1
    return summary
