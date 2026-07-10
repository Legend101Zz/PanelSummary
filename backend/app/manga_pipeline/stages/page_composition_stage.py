"""Page composition stage \u2014 author the gutter grid for each page.

Where this fits
---------------
The storyboard stage produces a list of ``StoryboardPage`` rows. Each
row knows *what panels* are on the page but not *how the page is laid
out* beyond a coarse layout token derived from panel count.

This stage runs ONCE per slice (one LLM call covering every page in
the slice) and produces a ``SliceComposition`` row containing one
``PageComposition`` per page. The renderer reads it to build a real
manga grid: tall splash on the page-turn beat, short establishing
strip across the top, two equal mid-page beats, etc.

Why one call per slice and not one per page
-------------------------------------------
A slice has 5\u20138 pages. Asking the LLM to compose them all at once
gives it the visual rhythm of the whole slice (so it does not put a
splash on every single page) and keeps the call budget proportional to
the existing per-slice stages (script, storyboard, quality). Per-page
calls would also be more brittle: each call would need to re-load the
slice context.

Failure mode
------------
If the LLM produces an invalid composition (e.g. cell count does not
match panel count), the structured-call helper retries up to
``llm_validation_attempts``. If it still fails, we fall back to a
deterministic valid grid plus existing-asset sprite and dialogue-bubble
geometry. We do NOT block the pipeline: a less interesting page is
strictly better than a broken page, but newly generated pages must still
carry the RenderedPage placement contract.
"""

from __future__ import annotations

import json

from app.domain.manga import (
    BubblePlacement,
    LayoutBoxPct,
    PageComposition,
    PageGridRow,
    SliceComposition,
    SpriteLayer,
    StoryboardPage,
    StoryboardPanel,
)
from app.llm_client import LLMClient
from app.manga_pipeline.context import PipelineContext
from app.manga_pipeline.llm_contracts import (
    LLMOutputValidationError,
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)
from app.manga_pipeline.strict_json_routing import strict_json_client_for


SYSTEM_PROMPT = """You are a manga page-layout artist composing one page at a time.

You receive one storyboard page and must author a PageComposition that captures
how that page should be physically laid out.

Composition rules:
- Pages are read RIGHT-to-LEFT then top-to-bottom. The "page turn" beat
  (the most arresting panel, the cliffhanger, the visual hook) sits at
  the BOTTOM-LEFT of the page \u2014 it is the last cell the eye lands on.
- Use the gutter_grid to vary panel sizes. A row may have 1\u20135 cells; a
  page may have 1\u20135 rows. Each row's cell widths are integer percentages
  that MUST sum to exactly 100.
- Cell count summed across all rows MUST equal the page's panel count.
  No leftover panels; no empty cells.
- Author row_heights_pct for every non-empty gutter_grid; the values MUST
  sum to 100 and should create manga rhythm (e.g. 22/38/40), not equal
  rows unless the page genuinely needs calm repetition.
- Set gutter_px intentionally between 4 and 18. Use tighter gutters for
  action/reveal pages and wider gutters for quiet explanatory pages.
- panel_order lists the storyboard panel ids in row-major reading order
  (top-row first; within a row, RIGHT-most cell first since manga reads
  right-to-left). It must be a permutation of the page's panel ids.
- Reserve the bottom-left cell for the panel you choose as
  page_turn_panel_id. It usually wants a wider cell than its neighbours
  (e.g. 100% of its row, or 60-70% of a two-cell row).
- Use panel_emphasis_overrides ONLY when you want to change the
  storyboard's authored emphasis. Allowed values: "low", "medium",
  "high". Be sparing: drift from the storyboard intent should be
  intentional.
- When you can make a precise page, author panel_placements. Keys must be
  panel ids and bbox_pct uses visual page coordinates: x_pct=0 is the
  LEFT edge, y_pct=0 is the TOP edge. Every panel in panel_order must
  have a placement if panel_placements is non-empty.
- Author sprite_layers for panels with character_ids. Each sprite layer
  MUST reference an existing character_id/expression pair from asset_manifest
  and gives a panel-local bbox_pct. Place sprites as scene characters,
  grounded to the panel bottom, never as tiny chat avatars.
- Author bubble_placements for dialogue panels. Each bubble targets a
  dialogue line_index and panel-local bbox_pct. Keep bubbles readable,
  inside the panel, and away from faces. Use z_index above sprites.
- z_index convention: panels 0-10, sprites around 20, bubbles around 40.
- Composition variety across the slice matters. Use the supplied slice page
  indices as context, but return only this page's composition. Mix splash
  (1 panel), establishing strip + two beats (1+2), three-beat (1+2 or 2+1),
  and four-beat (2+2 or 1+2+1) pages across a slice.
- composition_notes: 1-2 sentences explaining why this page is laid out
  this way (e.g. "splash on Kai's reveal; bottom-left page-turn anchors
  the cliffhanger").

Return ONE JSON object that conforms to the PageComposition schema.
"""


def _build_user_message(context: PipelineContext) -> str:
    if not context.storyboard_pages:
        raise ValueError("page composition requires context.storyboard_pages")

    arc_role = (
        context.arc_entry.role.value
        if context.arc_entry is not None
        else context.options.get("slice_role", "")
    )
    pages_payload = [
        {
            "page_index": page.page_index,
            "panel_count": len(page.panels),
            "panels": [
                {
                    "panel_id": panel.panel_id,
                    "purpose": panel.purpose.value,
                    "shot_type": panel.shot_type.value,
                    "scene_id": panel.scene_id,
                    "character_ids": list(panel.character_ids),
                    "action": panel.action,
                    "narration": panel.narration,
                    "dialogue_count": len(panel.dialogue),
                    "dialogue": [
                        {
                            "line_index": line_index,
                            "speaker_id": line.speaker_id,
                            "intent": line.intent,
                            "text": line.text,
                        }
                        for line_index, line in enumerate(panel.dialogue)
                    ],
                }
                for panel in page.panels
            ],
        }
        for page in context.storyboard_pages
    ]
    payload = {
        "slice_id": context.source_slice.slice_id,
        "arc_role": arc_role,
        "asset_manifest": _asset_manifest_from_options(context),
        "pages": pages_payload,
    }
    return (
        "Compose every page of the slice. Vary panel sizes; reserve the "
        "bottom-left cell of each page for the page-turn beat. Use sprite_layers "
        "only for character_id/expression pairs present in asset_manifest.\n\n"
        f"INPUT_JSON:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{build_json_contract_prompt(SliceComposition)}"
    )


def _page_payload(page: StoryboardPage) -> dict:
    return {
        "page_index": page.page_index,
        "page_turn_hook": page.page_turn_hook,
        "panel_count": len(page.panels),
        "panels": [
            {
                "panel_id": panel.panel_id,
                "purpose": panel.purpose.value,
                "shot_type": panel.shot_type.value,
                "scene_id": panel.scene_id,
                "character_ids": list(panel.character_ids),
                "action": panel.action,
                "narration": panel.narration,
                "dialogue_count": len(panel.dialogue),
                "dialogue": [
                    {
                        "line_index": line_index,
                        "speaker_id": line.speaker_id,
                        "intent": line.intent,
                        "text": line.text,
                    }
                    for line_index, line in enumerate(panel.dialogue)
                ],
            }
            for panel in page.panels
        ],
    }


def _build_page_user_message(context: PipelineContext, page: StoryboardPage) -> str:
    arc_role = (
        context.arc_entry.role.value
        if context.arc_entry is not None
        else context.options.get("slice_role", "")
    )
    payload = {
        "slice_id": context.source_slice.slice_id,
        "arc_role": arc_role,
        "asset_manifest": _asset_manifest_from_options(context),
        "page": _page_payload(page),
        "slice_page_indices": [item.page_index for item in context.storyboard_pages],
    }
    return (
        "Compose one storyboard page. Return a single PageComposition for this "
        "page only, not a SliceComposition wrapper. Keep every bbox inside its "
        "panel/page coordinate space and use sprite_layers only for "
        "character_id/expression pairs present in asset_manifest.\n\n"
        f"INPUT_PAGE_JSON:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{build_json_contract_prompt(PageComposition)}"
    )


def _asset_manifest_from_options(context: PipelineContext) -> list[dict[str, str]]:
    raw_manifest = context.options.get("asset_manifest") or []
    manifest: list[dict[str, str]] = []
    if not isinstance(raw_manifest, list):
        return manifest
    for item in raw_manifest:
        if not isinstance(item, dict):
            continue
        character_id = str(item.get("character_id") or "").strip()
        expression = str(item.get("expression") or "neutral").strip() or "neutral"
        asset_type = str(item.get("asset_type") or "").strip()
        aspect = str(item.get("aspect") or item.get("aspect_ratio") or "1:1").strip() or "1:1"
        if not character_id or not asset_type:
            continue
        manifest.append(
            {
                "character_id": character_id,
                "expression": expression,
                "asset_type": asset_type,
                "aspect": aspect,
            }
        )
    return manifest


def _asset_manifest_keys(context: PipelineContext) -> set[tuple[str, str]]:
    return {
        (item["character_id"], item["expression"])
        for item in _asset_manifest_from_options(context)
    }


def _empty_composition_for(context: PipelineContext) -> SliceComposition:
    """Return an empty composition row \u2014 renderer will use legacy layout.

    Centralising the fallback keeps the failure semantics in one place:
    every caller knows that an empty SliceComposition means "we tried
    and gave up" rather than "we never ran".
    """
    return SliceComposition(
        pages=[
            PageComposition(
                page_index=page.page_index,
                gutter_grid=[],
                panel_order=[],
            )
            for page in context.storyboard_pages
        ]
    )


def _empty_composition_for_page(page: StoryboardPage, reason: str) -> PageComposition:
    return PageComposition(
        page_index=page.page_index,
        gutter_grid=[],
        panel_order=[],
        composition_notes=reason,
    )


def _equal_percentages(count: int) -> list[int]:
    """Split 100 into ``count`` deterministic positive integer shares."""
    base, remainder = divmod(100, max(count, 1))
    return [base + (1 if index < remainder else 0) for index in range(count)]


def _fallback_composition_for_page(
    page: StoryboardPage,
    *,
    expression_by_character: dict[str, str],
    reason: str,
) -> PageComposition:
    """Build valid zero-cost geometry when an authored composition is absent.

    The old fallback deliberately returned empty maps and relied on reader
    heuristics. That is safe for legacy pages but fails the RenderedPage
    placement contract for newly generated pages. This fallback is entirely
    deterministic: it uses only existing asset-manifest entries and existing
    dialogue lines, never schedules image work or authors visible text.
    """
    panels = list(page.panels)
    panel_ids = [panel.panel_id for panel in panels]
    if len(panels) <= 3:
        row_counts = [len(panels)]
    elif len(panels) == 4:
        row_counts = [2, 2]
    else:
        row_counts = [3, len(panels) - 3]

    rows = [
        PageGridRow(cell_widths_pct=_equal_percentages(count))
        for count in row_counts
        if count
    ]
    sprite_layers: dict[str, list[SpriteLayer]] = {}
    bubble_placements: dict[str, list[BubblePlacement]] = {}

    for panel in panels:
        visual_ids = list(dict.fromkeys(
            [*panel.character_ids, *(line.speaker_id for line in panel.dialogue)]
        ))
        usable_ids = [
            character_id for character_id in visual_ids
            if character_id in expression_by_character
        ][:2]
        if usable_ids:
            layers: list[SpriteLayer] = []
            for index, character_id in enumerate(usable_ids):
                x_pct = 54 if len(usable_ids) == 1 else 8 + (index * 48)
                layers.append(
                    SpriteLayer(
                        character_id=character_id,
                        expression=expression_by_character[character_id],
                        bbox_pct=LayoutBoxPct(
                            x_pct=x_pct,
                            y_pct=30,
                            width_pct=38,
                            height_pct=65,
                        ),
                        z_index=20,
                    )
                )
            sprite_layers[panel.panel_id] = layers

        if panel.dialogue:
            placements: list[BubblePlacement] = []
            for line_index, line in enumerate(panel.dialogue[:2]):
                placements.append(
                    BubblePlacement(
                        line_index=line_index,
                        speaker_id=line.speaker_id,
                        # Keep bubbles above the sprite face zone. The later
                        # sanitizer resolves the tail against the speaker.
                        bbox_pct=LayoutBoxPct(
                            x_pct=3 if line_index == 0 else 53,
                            y_pct=3,
                            width_pct=44,
                            height_pct=22,
                        ),
                        tail_side="bottom",
                        z_index=40,
                    )
                )
            bubble_placements[panel.panel_id] = placements

    return PageComposition(
        page_index=page.page_index,
        gutter_grid=rows,
        row_heights_pct=_equal_percentages(len(rows)),
        gutter_px=6,
        panel_order=panel_ids,
        page_turn_panel_id=panel_ids[-1] if panel_ids else "",
        sprite_layers=sprite_layers,
        bubble_placements=bubble_placements,
        composition_notes=reason,
    )


def _fill_missing_layer_geometry(
    composition: PageComposition,
    *,
    page: StoryboardPage,
    expression_by_character: dict[str, str],
) -> PageComposition:
    """Keep valid authored layout, filling only its missing scene layers."""
    fallback = _fallback_composition_for_page(
        page,
        expression_by_character=expression_by_character,
        reason="deterministic layer fallback for missing authored geometry",
    )
    if composition.is_default:
        return fallback

    sprites = dict(composition.sprite_layers)
    bubbles = dict(composition.bubble_placements)
    for panel_id, layers in fallback.sprite_layers.items():
        if not sprites.get(panel_id):
            sprites[panel_id] = layers
    for panel_id, placements in fallback.bubble_placements.items():
        if not bubbles.get(panel_id):
            bubbles[panel_id] = placements
    return composition.model_copy(
        update={"sprite_layers": sprites, "bubble_placements": bubbles}
    )


def _composition_llm_client(context: PipelineContext):
    return strict_json_client_for(
        context,
        model_option_key="page_composition_model",
        timeout_option_key="page_composition_timeout_seconds",
        client_factory=LLMClient,
    )


def _coerce_to_storyboard_panels(
    composition: SliceComposition,
    context: PipelineContext,
) -> SliceComposition:
    """Drop pages whose panel ids do not match the storyboard.

    The validators on PageComposition only check internal consistency
    (cell count == panel_order length). They cannot know that
    panel_order entries must be the *actual* storyboard ids on that
    page. We do that check here, and any page that fails reverts to its
    empty composition. We do not fail the slice: the renderer will fall
    back to the legacy layout for that page only.
    """
    page_id_lookup = {
        page.page_index: {panel.panel_id for panel in page.panels}
        for page in context.storyboard_pages
    }
    fixed: list[PageComposition] = []
    asset_manifest_keys = _asset_manifest_keys(context)
    expression_by_character: dict[str, str] = {}
    for character_id, expression in sorted(asset_manifest_keys):
        expression_by_character.setdefault(character_id, expression)
    for comp in composition.pages:
        expected_ids = page_id_lookup.get(comp.page_index)
        if expected_ids is None:
            # Stage hallucinated a page index that doesn't exist; drop.
            continue
        if set(comp.panel_order) != expected_ids:
            fixed.append(
                _fallback_composition_for_page(
                    next(page for page in context.storyboard_pages if page.page_index == comp.page_index),
                    expression_by_character=expression_by_character,
                    reason="composition replaced with deterministic fallback: panel_order did not match storyboard panel ids",
                )
            )
            continue
        if comp.page_turn_panel_id and comp.page_turn_panel_id not in expected_ids:
            # Wrong page-turn id but otherwise valid: clear the field
            # rather than dropping the whole composition.
            comp = comp.model_copy(update={"page_turn_panel_id": ""})
        comp = _drop_sprite_layers_outside_manifest(comp, asset_manifest_keys)
        storyboard_page = next(
            page for page in context.storyboard_pages if page.page_index == comp.page_index
        )
        comp = _drop_sprite_layers_outside_storyboard(comp, storyboard_page)
        comp = _fill_missing_layer_geometry(
            comp,
            page=storyboard_page,
            expression_by_character=expression_by_character,
        )
        comp = _sanitize_bubble_geometry(comp, storyboard_page)
        fixed.append(comp)

    # Backfill any storyboard pages the LLM forgot.
    seen_indices = {comp.page_index for comp in fixed}
    for page in context.storyboard_pages:
        if page.page_index not in seen_indices:
            fixed.append(
                _fallback_composition_for_page(
                    page,
                    expression_by_character=expression_by_character,
                    reason="page missing from LLM output; using deterministic fallback",
                )
            )
    fixed.sort(key=lambda c: c.page_index)
    return SliceComposition(pages=fixed)


def _drop_sprite_layers_outside_manifest(
    composition: PageComposition,
    asset_manifest_keys: set[tuple[str, str]],
) -> PageComposition:
    if not asset_manifest_keys or not composition.sprite_layers:
        return composition

    filtered: dict[str, list] = {}
    dropped = 0
    for panel_id, layers in composition.sprite_layers.items():
        kept = []
        for layer in layers:
            key = (layer.character_id, layer.expression or "neutral")
            if key in asset_manifest_keys:
                kept.append(layer)
            else:
                dropped += 1
        if kept:
            filtered[panel_id] = kept

    if not dropped:
        return composition

    note = composition.composition_notes.strip()
    suffix = f"{dropped} sprite refs outside asset_manifest were dropped."
    return composition.model_copy(
        update={
            "sprite_layers": filtered,
            "composition_notes": f"{note} {suffix}".strip(),
        }
    )


def _drop_sprite_layers_outside_storyboard(
    composition: PageComposition,
    page: StoryboardPage,
) -> PageComposition:
    """Drop authored sprites not visually present in their storyboard panel."""
    if not composition.sprite_layers:
        return composition

    panels = _panel_by_id(page)
    filtered: dict[str, list[SpriteLayer]] = {}
    dropped = 0
    for panel_id, layers in composition.sprite_layers.items():
        panel = panels.get(panel_id)
        allowed = set(panel.character_ids) if panel else set()
        kept = [layer for layer in layers if layer.character_id in allowed]
        dropped += len(layers) - len(kept)
        if kept:
            filtered[panel_id] = kept
    if not dropped:
        return composition

    note = composition.composition_notes.strip()
    suffix = f"{dropped} sprite layer(s) outside storyboard character_ids were dropped."
    return composition.model_copy(
        update={
            "sprite_layers": filtered,
            "composition_notes": f"{note} {suffix}".strip(),
        }
    )


def _boxes_overlap(a: LayoutBoxPct, b: LayoutBoxPct) -> bool:
    return (
        a.x_pct < b.x_pct + b.width_pct
        and a.x_pct + a.width_pct > b.x_pct
        and a.y_pct < b.y_pct + b.height_pct
        and a.y_pct + a.height_pct > b.y_pct
    )


def _sprite_face_zone(sprite) -> LayoutBoxPct:
    box = sprite.bbox_pct
    return box.model_copy(update={"height_pct": box.height_pct / 3})


def _expected_tail_side(bubble: BubblePlacement, sprite) -> str:
    bubble_box = bubble.bbox_pct
    sprite_box = sprite.bbox_pct
    target_x = sprite_box.x_pct + sprite_box.width_pct / 2
    target_y = sprite_box.y_pct + sprite_box.height_pct / 6
    left = bubble_box.x_pct
    right = bubble_box.x_pct + bubble_box.width_pct
    top = bubble_box.y_pct
    bottom = bubble_box.y_pct + bubble_box.height_pct

    if target_y > bottom:
        return "bottom"
    if target_y < top:
        return "top"
    if target_x < left:
        return "left"
    if target_x > right:
        return "right"
    return "bottom"


def _bubble_overlaps_any_face(bubble: BubblePlacement, sprites: list) -> bool:
    return any(
        _boxes_overlap(bubble.bbox_pct, _sprite_face_zone(sprite))
        for sprite in sprites
    )


def _bubble_with_y(bubble: BubblePlacement, y_pct: float) -> BubblePlacement:
    clamped_y = max(0, min(100 - bubble.bbox_pct.height_pct, y_pct))
    return bubble.model_copy(
        update={
            "bbox_pct": bubble.bbox_pct.model_copy(update={"y_pct": clamped_y})
        }
    )


def _avoid_sprite_faces(
    bubble: BubblePlacement,
    sprites: list,
) -> BubblePlacement | None:
    if not _bubble_overlaps_any_face(bubble, sprites):
        return bubble

    face_zones = [_sprite_face_zone(sprite) for sprite in sprites]
    lowest_face_bottom = max(
        face.y_pct + face.height_pct
        for face in face_zones
        if _boxes_overlap(bubble.bbox_pct, face)
    )
    highest_face_top = min(
        face.y_pct
        for face in face_zones
        if _boxes_overlap(bubble.bbox_pct, face)
    )
    candidates = [
        _bubble_with_y(bubble, lowest_face_bottom + 4),
        _bubble_with_y(bubble, highest_face_top - bubble.bbox_pct.height_pct - 4),
    ]
    for candidate in candidates:
        if not _bubble_overlaps_any_face(candidate, sprites):
            return candidate
    return None


def _panel_by_id(page: StoryboardPage) -> dict[str, StoryboardPanel]:
    return {panel.panel_id: panel for panel in page.panels}


def _sanitize_bubble_geometry(
    composition: PageComposition,
    page: StoryboardPage,
) -> PageComposition:
    if not composition.bubble_placements:
        return composition

    panels = _panel_by_id(page)
    sanitized: dict[str, list[BubblePlacement]] = {}
    dropped = 0
    moved = 0
    for panel_id, bubbles in composition.bubble_placements.items():
        panel = panels.get(panel_id)
        if panel is None:
            dropped += len(bubbles)
            continue
        sprites = composition.sprite_layers.get(panel_id, [])
        kept: list[BubblePlacement] = []
        for bubble in bubbles:
            if bubble.line_index >= len(panel.dialogue):
                dropped += 1
                continue
            speaker_id = bubble.speaker_id or panel.dialogue[bubble.line_index].speaker_id
            speaker_sprite = next(
                (sprite for sprite in sprites if sprite.character_id == speaker_id),
                None,
            )
            fixed = bubble
            if speaker_sprite is not None:
                fixed = fixed.model_copy(
                    update={
                        "speaker_id": speaker_id,
                        "tail_side": _expected_tail_side(fixed, speaker_sprite),
                    }
                )
            avoided = _avoid_sprite_faces(fixed, sprites)
            if avoided is None:
                dropped += 1
                continue
            if speaker_sprite is not None:
                avoided = avoided.model_copy(
                    update={
                        "tail_side": _expected_tail_side(avoided, speaker_sprite),
                    }
                )
            if avoided.bbox_pct != bubble.bbox_pct or avoided.tail_side != bubble.tail_side:
                moved += 1
            kept.append(avoided)
        if kept:
            sanitized[panel_id] = kept

    if not dropped and not moved:
        return composition

    note = composition.composition_notes.strip()
    changes = []
    if moved:
        changes.append(f"{moved} bubble placement(s) moved away from sprite face zones")
    if dropped:
        changes.append(f"{dropped} invalid bubble placement(s) dropped")
    suffix = "; ".join(changes) + "."
    return composition.model_copy(
        update={
            "bubble_placements": sanitized,
            "composition_notes": f"{note} {suffix}".strip(),
        }
    )


async def run(context: PipelineContext) -> PipelineContext:
    """Author one ``SliceComposition`` for the slice and stash it.

    Always sets ``context.slice_composition``. Even on total failure we
    set an empty composition so downstream consumers can rely on the
    field being present (Zen of Python: explicit is better than
    implicit; ``None`` would force every renderer call to re-check).
    """
    if context.llm_client is None:
        raise ValueError("page composition requires context.llm_client")
    if not context.storyboard_pages:
        # Nothing to compose; record an empty row so callers don't need
        # to special-case "stage skipped" vs "stage failed".
        context.slice_composition = SliceComposition(pages=[])
        return context

    llm_client = _composition_llm_client(context)
    composed_pages: list[PageComposition] = []
    for page in context.storyboard_pages:
        request = StructuredLLMRequest(
            stage_name=LLMStageName.PAGE_COMPOSITION,
            system_prompt=SYSTEM_PROMPT,
            user_message=_build_page_user_message(context, page),
            max_tokens=int(context.options.get("page_composition_max_tokens", 6000)),
            temperature=float(context.options.get("page_composition_temperature", 0.25)),
            max_validation_attempts=int(
                context.options.get("page_composition_validation_attempts", 5)
            ),
        )
        try:
            result = await run_structured_llm_stage(
                client=llm_client,
                request=request,
                output_type=PageComposition,
            )
        except LLMOutputValidationError as exc:
            context.record_llm_trace(exc.trace)
            composed_pages.append(
                _empty_composition_for_page(
                    page,
                    "page composition failed validation; using default",
                )
            )
            continue
        composed_pages.append(result.artifact)
        context.record_llm_trace(result.trace)

    context.slice_composition = _coerce_to_storyboard_panels(
        SliceComposition(pages=composed_pages),
        context,
    )
    return context
