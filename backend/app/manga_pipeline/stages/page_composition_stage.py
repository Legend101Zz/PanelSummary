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
``llm_validation_attempts``. If it still fails, we fall back to an
*empty* ``SliceComposition`` and the renderer transparently reverts to
the legacy ``_layout_for_panel_count`` path. We do NOT block the
pipeline: a less interesting page is strictly better than a broken
page.
"""

from __future__ import annotations

import json

from app.domain.manga import (
    PageComposition,
    PageGridRow,
    SliceComposition,
    StoryboardPage,
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
    for comp in composition.pages:
        expected_ids = page_id_lookup.get(comp.page_index)
        if expected_ids is None:
            # Stage hallucinated a page index that doesn't exist; drop.
            continue
        if set(comp.panel_order) != expected_ids:
            fixed.append(
                PageComposition(
                    page_index=comp.page_index,
                    gutter_grid=[],
                    panel_order=[],
                    composition_notes=(
                        "composition replaced with default: panel_order did "
                        "not match storyboard panel ids"
                    ),
                )
            )
            continue
        if comp.page_turn_panel_id and comp.page_turn_panel_id not in expected_ids:
            # Wrong page-turn id but otherwise valid: clear the field
            # rather than dropping the whole composition.
            comp = comp.model_copy(update={"page_turn_panel_id": ""})
        comp = _drop_sprite_layers_outside_manifest(comp, asset_manifest_keys)
        fixed.append(comp)

    # Backfill any storyboard pages the LLM forgot.
    seen_indices = {comp.page_index for comp in fixed}
    for page in context.storyboard_pages:
        if page.page_index not in seen_indices:
            fixed.append(
                PageComposition(
                    page_index=page.page_index,
                    gutter_grid=[],
                    panel_order=[],
                    composition_notes="page missing from LLM output; using default",
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
