"""
generate_living_panels.py — Living Panel DSL Generation
========================================================
Generates Living Panel DSL JSON for manga panels using LLM.
Each static manga panel gets converted into an animated,
interactive experience.

ORCHESTRATION FLOW:
1. Take existing MangaPage (static panels)
2. For each panel, generate a LivingPanelDSL via LLM
3. Validate DSL structure
4. Store alongside the static panel data
5. Frontend renders using LivingPanelEngine
"""

import json
import logging
from typing import Optional

from app.llm_client import LLMClient
from app.living_panel_prompts import (
    get_living_panel_prompt,
    format_panel_context_for_living,
    format_full_page_for_living,
)
from app.models import SummaryStyle

logger = logging.getLogger(__name__)

# ============================================================
# DSL VALIDATION
# ============================================================

VALID_LAYER_TYPES = {
    "background", "sprite", "text", "speech_bubble",
    "effect", "shape", "data_block", "scene_transition",
}

VALID_EFFECTS = {
    "particles", "speed_lines", "impact_burst", "sparkle",
    "rain", "snow", "smoke", "screen_shake", "vignette",
    "lens_flare", "floating_kanji", "ink_splash", "lightning",
}

VALID_EASINGS = {
    "linear", "ease-in", "ease-out", "ease-in-out",
    "spring", "bounce", "elastic", "sharp",
}


def validate_living_panel_dsl(dsl: dict) -> tuple[bool, list[str]]:
    """Validate a Living Panel DSL dict. Returns (is_valid, errors)."""
    errors = []

    if dsl.get("version") != "1.0":
        errors.append("Missing or invalid version (must be '1.0')")

    canvas = dsl.get("canvas")
    if not isinstance(canvas, dict):
        errors.append("Missing canvas config")
    else:
        if not isinstance(canvas.get("width"), (int, float)):
            errors.append("canvas.width must be a number")
        if not isinstance(canvas.get("height"), (int, float)):
            errors.append("canvas.height must be a number")

    layers = dsl.get("layers", [])
    if not isinstance(layers, list) or len(layers) == 0:
        errors.append("Must have at least one layer")
    else:
        layer_ids = set()
        for i, layer in enumerate(layers):
            if not isinstance(layer, dict):
                errors.append(f"Layer {i} is not a dict")
                continue
            lid = layer.get("id")
            if not lid:
                errors.append(f"Layer {i} missing id")
            elif lid in layer_ids:
                errors.append(f"Duplicate layer id: {lid}")
            else:
                layer_ids.add(lid)

            ltype = layer.get("type")
            if ltype not in VALID_LAYER_TYPES:
                errors.append(f"Layer '{lid}': invalid type '{ltype}'")

            if not isinstance(layer.get("props"), dict) and ltype not in ("scene_transition",):
                errors.append(f"Layer '{lid}': missing props")

    timeline = dsl.get("timeline", [])
    if not isinstance(timeline, list):
        errors.append("timeline must be an array")
    else:
        for i, step in enumerate(timeline):
            if not isinstance(step, dict):
                errors.append(f"Timeline step {i} is not a dict")
                continue
            if "at" not in step:
                errors.append(f"Timeline step {i}: missing 'at'")
            if "target" not in step:
                errors.append(f"Timeline step {i}: missing 'target'")
            if "duration" not in step:
                errors.append(f"Timeline step {i}: missing 'duration'")

    return len(errors) == 0, errors


def fix_common_dsl_issues(dsl: dict) -> dict:
    """Auto-fix common LLM mistakes in DSL output."""
    # Ensure version
    dsl.setdefault("version", "1.0")

    # Ensure canvas defaults
    canvas = dsl.setdefault("canvas", {})
    canvas.setdefault("width", 800)
    canvas.setdefault("height", 600)
    canvas.setdefault("background", "#0a0a1a")

    # Ensure layers have props
    for layer in dsl.get("layers", []):
        layer.setdefault("props", {})
        layer.setdefault("id", f"layer-{id(layer)}")

    # Ensure timeline has valid structure
    for step in dsl.get("timeline", []):
        step.setdefault("duration", 500)
        step.setdefault("easing", "ease-out")
        if "animate" not in step:
            step["animate"] = {"opacity": [0, 1]}

    # Ensure events is a list
    if "events" not in dsl or not isinstance(dsl.get("events"), list):
        dsl["events"] = []

    # Ensure meta
    dsl.setdefault("meta", {})

    return dsl


# ============================================================
# GENERATION
# ============================================================

async def generate_living_panel(
    panel_data: dict,
    style: SummaryStyle,
    llm_client: LLMClient,
    manga_bible: dict = None,
    chapter_summary: dict = None,
) -> Optional[dict]:
    """Generate a Living Panel DSL for a single panel."""
    system_prompt = get_living_panel_prompt(style)
    user_message = format_panel_context_for_living(
        panel_data, manga_bible, chapter_summary
    )

    try:
        result = await llm_client.chat_with_retry(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=4000,
            temperature=0.8,
            json_mode=True,
        )

        parsed = result.get("parsed") or {}
        if isinstance(parsed, str):
            parsed = json.loads(parsed)

        # Auto-fix common issues
        parsed = fix_common_dsl_issues(parsed)

        # Validate
        is_valid, errors = validate_living_panel_dsl(parsed)
        if not is_valid:
            logger.warning(
                f"Living panel DSL validation failed: {errors}. "
                f"Attempting to use with fixes applied."
            )

        return parsed

    except Exception as e:
        logger.error(f"Failed to generate living panel: {e}")
        return generate_fallback_living_panel(panel_data)


async def generate_living_panels_for_page(
    page_data: dict,
    style: SummaryStyle,
    llm_client: LLMClient,
    manga_bible: dict = None,
    chapter_summary: dict = None,
) -> list[dict]:
    """Generate Living Panel DSLs for all panels in a page."""
    panels = page_data.get("panels", [])
    living_panels = []

    for panel in panels:
        dsl = await generate_living_panel(
            panel_data=panel,
            style=style,
            llm_client=llm_client,
            manga_bible=manga_bible,
            chapter_summary=chapter_summary,
        )
        living_panels.append(dsl or generate_fallback_living_panel(panel))

    return living_panels


# ============================================================
# FALLBACK DSL GENERATION (no LLM needed)
# ============================================================

def generate_fallback_living_panel(panel_data: dict) -> dict:
    """Generate a basic Living Panel DSL from static panel data without LLM."""
    content_type = panel_data.get("content_type", "narration")
    text = panel_data.get("text", "")
    dialogue = panel_data.get("dialogue", [])
    character = panel_data.get("character")
    expression = panel_data.get("expression", "neutral")
    mood = panel_data.get("visual_mood", "dramatic-dark")

    mood_colors = {
        "dramatic-dark":  ["#0a0a1a", "#1a1025", "#0d0d1e"],
        "warm-amber":     ["#1a1408", "#2a1c0a", "#1a1205"],
        "cool-mystery":   ["#081018", "#0a1520", "#060e18"],
        "intense-red":    ["#1a0808", "#250a0a", "#1a0505"],
        "calm-green":     ["#081a10", "#0a2015", "#051a0c"],
        "ethereal-purple": ["#120820", "#1a0a28", "#100618"],
    }
    mood_accents = {
        "dramatic-dark": "#8080ff", "warm-amber": "#f5a623",
        "cool-mystery": "#00bfa5", "intense-red": "#e8191a",
        "calm-green": "#4caf50", "ethereal-purple": "#bb86fc",
    }

    colors = mood_colors.get(mood, mood_colors["dramatic-dark"])
    accent = mood_accents.get(mood, "#8080ff")

    layers = [
        {
            "id": "bg",
            "type": "background",
            "opacity": 0,
            "props": {
                "gradient": colors,
                "gradientAngle": 160,
                "pattern": "halftone",
                "patternColor": accent,
                "patternOpacity": 0.08,
            },
        },
    ]
    timeline = [
        {"at": 0, "target": "bg", "animate": {"opacity": [0, 1]}, "duration": 500, "easing": "ease-in"},
    ]

    if content_type == "narration" and text:
        layers.append({
            "id": "narration-text",
            "type": "text",
            "x": "50%", "y": "50%", "opacity": 0,
            "props": {
                "content": text,
                "fontSize": "clamp(0.9rem, 3vw, 1.4rem)",
                "fontFamily": "body",
                "color": accent,
                "textAlign": "center",
                "maxWidth": 500,
                "lineHeight": 1.5,
                "typewriter": True,
                "typewriterSpeed": 30,
            },
        })
        timeline.append(
            {"at": 500, "target": "narration-text", "animate": {"opacity": [0, 1], "typewriter": True}, "duration": 1500}
        )

    elif content_type == "dialogue" and dialogue:
        if character:
            layers.append({
                "id": f"sprite-{character.lower().replace(' ', '-')}",
                "type": "sprite",
                "x": "50%", "y": "30%", "opacity": 0,
                "props": {
                    "character": character,
                    "expression": expression,
                    "size": 56,
                    "showName": True,
                },
            })
            timeline.append(
                {"at": 300, "target": f"sprite-{character.lower().replace(' ', '-')}",
                 "animate": {"opacity": [0, 1], "scale": [0.8, 1]}, "duration": 500, "easing": "spring"}
            )

        for i, line in enumerate(dialogue):
            bubble_id = f"bubble-{i}"
            layers.append({
                "id": bubble_id,
                "type": "speech_bubble",
                "x": "50%", "y": f"{50 + i * 15}%", "opacity": 0,
                "props": {
                    "text": line.get("text", ""),
                    "character": line.get("character", character or "?"),
                    "style": "speech",
                    "tailDirection": "top",
                    "maxWidth": 240,
                    "typewriter": True,
                    "typewriterSpeed": 35,
                },
            })
            timeline.append(
                {"at": 800 + i * 1200, "target": bubble_id,
                 "animate": {"opacity": [0, 1], "typewriter": True}, "duration": 800}
            )

    elif content_type == "splash" and text:
        layers.extend([
            {
                "id": "speed-lines",
                "type": "effect", "opacity": 0,
                "props": {"effect": "speed_lines", "color": accent, "intensity": 0.5, "count": 24},
            },
            {
                "id": "vignette",
                "type": "effect", "opacity": 0,
                "props": {"effect": "vignette", "color": "#000000", "intensity": 0.7},
            },
            {
                "id": "splash-title",
                "type": "text",
                "x": "50%", "y": "45%", "opacity": 0, "scale": 1.5,
                "props": {
                    "content": text,
                    "fontSize": "clamp(2rem, 7vw, 4.5rem)",
                    "fontFamily": "display",
                    "color": "#ffffff",
                    "textAlign": "center",
                    "textShadow": f"3px 3px 0 {accent}60, 0 0 40px rgba(0,0,0,0.8)",
                    "letterSpacing": "0.05em",
                },
            },
        ])
        timeline.extend([
            {"at": 200, "target": "speed-lines", "animate": {"opacity": [0, 0.5]}, "duration": 400},
            {"at": 300, "target": "vignette", "animate": {"opacity": [0, 1]}, "duration": 600},
            {"at": 400, "target": "splash-title", "animate": {"opacity": [0, 1], "scale": [1.4, 1]}, "duration": 800, "easing": "spring"},
        ])

    elif content_type == "data" and text:
        items = [s.strip() for s in text.split("|") if s.strip()]
        layers.append({
            "id": "data-block",
            "type": "data_block",
            "x": "50%", "y": "50%", "opacity": 0,
            "props": {
                "items": [{"label": item, "highlight": i == 0} for i, item in enumerate(items)],
                "layout": "stack",
                "accentColor": accent,
                "showIndex": True,
                "animateIn": "stagger",
                "staggerDelay": 250,
            },
        })
        timeline.append(
            {"at": 500, "target": "data-block", "animate": {"opacity": [0, 1], "y": ["60%", "50%"]}, "duration": 600, "easing": "ease-out"}
        )

    else:
        # transition or unknown
        layers.append({
            "id": "transition",
            "type": "scene_transition",
            "opacity": 0,
            "props": {"transition": "fade_black", "color": accent, "text": text or "..."},
        })
        timeline.append(
            {"at": 300, "target": "transition", "animate": {"opacity": [0, 1]}, "duration": 800}
        )

    return {
        "version": "1.0",
        "canvas": {"width": 800, "height": 600, "background": colors[0], "mood": mood},
        "layers": layers,
        "timeline": timeline,
        "events": [],
        "meta": {
            "content_type": content_type,
            "narrative_context": text[:100] if text else "Panel",
        },
    }
