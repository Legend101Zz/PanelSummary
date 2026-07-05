"""Vector scene direction stage.

This zero-image-spend stage adds typed SVG primitives to each storyboard panel:
tone, linework, focus effects, silhouettes, and optional drawn SFX lettering.
The renderer turns these primitives into inline SVG behind sprites and bubbles.
"""

from __future__ import annotations

import json
from pydantic import BaseModel, Field

from app.domain.manga import (
    StoryboardPanel,
    VectorScene,
    VectorSceneBackground,
    VectorSceneLine,
    VectorSceneRadialFocus,
    VectorSceneSpeedlineBurst,
    VectorSceneTone,
)
from app.manga_pipeline.context import PipelineContext
from app.manga_pipeline.llm_contracts import (
    LLMOutputValidationError,
    LLMStageName,
    StructuredLLMRequest,
    build_json_contract_prompt,
    run_structured_llm_stage,
)


SYSTEM_PROMPT = """You are the manga visual-direction artist for a zero-image-spend vector layer.

You receive final storyboard pages and must author a constrained VectorScene for
EVERY panel. This layer sits behind sprites and speech bubbles, so it must make
empty panels read as manga art: screentone, hatching, perspective lines,
horizon/interior lines, character silhouettes, speedline bursts, radial focus,
vignette, and drawn SFX lettering.

Rules:
- Do not output raw SVG, HTML, scripts, external URLs, markdown, or extra keys.
- Every panel must get at least tone and line-work. Empty beige panels are a
  failure.
- Match shot_type and purpose: WIDE/EXTREME_WIDE need horizon/interior lines;
  CLOSE_UP/EXTREME_CLOSE_UP need radial focus, hatching, or vignette; REVEAL
  and SYMBOLIC panels can use speedlines or focus bursts.
- SFX lettering is optional, but when action implies a sound or sudden motion,
  add short uppercase lettering with rotation and stroke.
- Keep the vector layer under dialogue; do not put exposition text in SFX.
- Use black ink, restrained accent fills, and manga screentone. This is not a
  colored illustration request.

Return ONE JSON object matching the schema.
"""


class VectorScenePanelDirection(BaseModel):
    panel_id: str
    vector_scene: VectorScene


class VectorScenePageDirection(BaseModel):
    page_index: int
    panels: list[VectorScenePanelDirection] = Field(default_factory=list)


class VectorSceneSliceDirection(BaseModel):
    pages: list[VectorScenePageDirection] = Field(default_factory=list)


def _build_user_message(context: PipelineContext) -> str:
    if not context.storyboard_pages:
        raise ValueError("vector scene direction requires context.storyboard_pages")

    pages_payload = [
        {
            "page_index": page.page_index,
            "page_turn_hook": page.page_turn_hook,
            "panels": [
                {
                    "panel_id": panel.panel_id,
                    "purpose": panel.purpose.value,
                    "shot_type": panel.shot_type.value,
                    "composition": panel.composition,
                    "action": panel.action,
                    "narration": panel.narration,
                    "character_ids": list(panel.character_ids),
                    "dialogue_count": len(panel.dialogue),
                }
                for panel in page.panels
            ],
        }
        for page in context.storyboard_pages
    ]
    payload = {
        "slice_id": context.source_slice.slice_id,
        "visual_style": context.character_bible.visual_style if context.character_bible else "",
        "pages": pages_payload,
    }
    return (
        "Author the vector_scene for every panel. Every panel must get at least "
        "tone and line-work, chosen from the typed primitives only.\n\n"
        f"INPUT_JSON:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
        f"{build_json_contract_prompt(VectorSceneSliceDirection)}"
    )


def default_vector_scene_for_panel(panel: StoryboardPanel) -> VectorScene:
    """Deterministic fallback so legacy/no-LLM paths are never empty beige."""
    shot = panel.shot_type.value if hasattr(panel.shot_type, "value") else str(panel.shot_type)
    purpose = panel.purpose.value if hasattr(panel.purpose, "value") else str(panel.purpose)
    is_wide = shot in {"wide", "extreme_wide"}
    is_close = shot in {"close_up", "extreme_close_up"}
    is_symbolic = shot in {"insert", "symbolic"} or purpose in {"reveal", "emotional_turn"}

    background = VectorSceneBackground(
        fill="#fbfaf4" if not is_symbolic else "#f6f7fb",
        gradient_to="#e5e8ef" if is_symbolic else "#eee6d4",
        gradient_angle=135,
    )
    tone = VectorSceneTone(
        pattern="hatching" if is_close else "dots",
        opacity=0.18 if is_wide else 0.22,
        scale=5 if is_wide else 7,
    )
    linework: list[VectorSceneLine] = []

    if is_wide:
        linework.extend(
            [
                VectorSceneLine(kind="horizon", x1=4, y1=63, x2=96, y2=60, stroke_width=1.6, opacity=0.42),
                VectorSceneLine(kind="floor", x1=14, y1=100, x2=46, y2=62, stroke_width=0.9, opacity=0.24),
                VectorSceneLine(kind="floor", x1=86, y1=100, x2=54, y2=62, stroke_width=0.9, opacity=0.24),
                VectorSceneLine(kind="interior", x1=8, y1=22, x2=8, y2=84, stroke_width=1.0, opacity=0.22),
                VectorSceneLine(kind="interior", x1=92, y1=18, x2=92, y2=82, stroke_width=1.0, opacity=0.22),
            ]
        )
    elif is_close:
        linework.extend(
            [
                VectorSceneLine(kind="focus", x1=10, y1=16, x2=42, y2=44, stroke_width=1.2, opacity=0.3),
                VectorSceneLine(kind="focus", x1=90, y1=18, x2=58, y2=45, stroke_width=1.2, opacity=0.3),
                VectorSceneLine(kind="hatching", x1=6, y1=76, x2=40, y2=100, stroke_width=0.8, opacity=0.22),
                VectorSceneLine(kind="hatching", x1=60, y1=100, x2=94, y2=76, stroke_width=0.8, opacity=0.22),
            ]
        )
    else:
        linework.extend(
            [
                VectorSceneLine(kind="diagonal", x1=6, y1=78, x2=94, y2=48, stroke_width=1.3, opacity=0.28),
                VectorSceneLine(kind="interior", x1=10, y1=28, x2=90, y2=24, stroke_width=0.9, opacity=0.22),
                VectorSceneLine(kind="interior", x1=16, y1=92, x2=84, y2=92, stroke_width=1.1, opacity=0.24),
            ]
        )

    return VectorScene(
        background=background,
        tone=tone,
        linework=linework,
        speedlines=[
            VectorSceneSpeedlineBurst(origin_x=52, origin_y=48, count=16, spread=66, opacity=0.18)
        ] if is_symbolic else [],
        radial_focus=VectorSceneRadialFocus(x=52, y=45, radius=76, opacity=0.16) if is_close or is_symbolic else None,
        vignette=is_close or purpose in {"reveal", "emotional_turn"},
        mood=purpose,
    )


def _scene_with_required_ink(panel: StoryboardPanel, scene: VectorScene | None) -> VectorScene:
    fallback = default_vector_scene_for_panel(panel)
    if scene is None or not scene.has_visible_ink:
        return fallback

    updates: dict[str, object] = {}
    if scene.background is None:
        updates["background"] = fallback.background
    if scene.tone is None or scene.tone.pattern == "none" or scene.tone.opacity <= 0:
        updates["tone"] = fallback.tone
    if not scene.linework:
        updates["linework"] = fallback.linework
    return scene.model_copy(update=updates) if updates else scene


def _apply_scenes(context: PipelineContext, artifact: VectorSceneSliceDirection | None) -> None:
    authored: dict[str, VectorScene] = {}
    if artifact is not None:
        for page in artifact.pages:
            for panel in page.panels:
                authored[panel.panel_id] = panel.vector_scene

    for page in context.storyboard_pages:
        for panel in page.panels:
            panel.vector_scene = _scene_with_required_ink(panel, authored.get(panel.panel_id))


async def run(context: PipelineContext) -> PipelineContext:
    if not context.storyboard_pages:
        return context

    if context.llm_client is None:
        _apply_scenes(context, None)
        return context

    request = StructuredLLMRequest(
        stage_name=LLMStageName.VISUAL_DIRECTION,
        system_prompt=SYSTEM_PROMPT,
        user_message=_build_user_message(context),
        max_tokens=int(context.options.get("visual_direction_max_tokens", 5000)),
        temperature=float(context.options.get("visual_direction_temperature", 0.45)),
        max_validation_attempts=int(context.options.get("llm_validation_attempts", 3)),
    )
    try:
        result = await run_structured_llm_stage(
            client=context.llm_client,
            request=request,
            output_type=VectorSceneSliceDirection,
        )
    except LLMOutputValidationError:
        _apply_scenes(context, None)
        return context

    _apply_scenes(context, result.artifact)
    context.record_llm_trace(result.trace)
    return context
