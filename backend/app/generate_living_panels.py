"""
generate_living_panels.py — Living Panel DSL v2.0 Generation
=============================================================
Generates act-based Living Panel DSL with cut layouts,
manga ink aesthetic, and user-controlled pacing.

ORCHESTRATION FLOW:
1. Take existing MangaPage (static panels)
2. For each panel, generate a LivingPanelDSL v2.0 via LLM
3. Validate + auto-fix DSL structure
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
# VALID VALUES
# ============================================================

VALID_LAYER_TYPES = {
    "background", "sprite", "text", "speech_bubble",
    "effect", "shape", "data_block", "scene_transition", "image",
}

VALID_EFFECTS = {
    "particles", "speed_lines", "impact_burst", "sparkle",
    "rain", "snow", "smoke", "screen_shake", "vignette",
    "floating_kanji", "ink_splash", "lightning",
    "screentone", "crosshatch", "sfx",
}

VALID_LAYOUTS = {
    "full", "split-h", "split-v", "grid-2x2", "grid-3",
    "l-shape", "t-shape", "diagonal", "overlap", "free", "cuts",
}

VALID_TRANSITIONS = {
    "cut", "fade", "crack", "morph", "iris",
    "slide_left", "slide_up", "dissolve",
}


# ============================================================
# DSL v2.0 VALIDATION
# ============================================================

def validate_living_panel_dsl(dsl: dict) -> tuple[bool, list[str]]:
    """Validate a Living Panel DSL v2.0 dict."""
    errors = []

    if dsl.get("version") not in ("2.0", "1.0"):
        errors.append("version must be '2.0'")

    canvas = dsl.get("canvas")
    if not isinstance(canvas, dict):
        errors.append("Missing canvas config")
    else:
        if not isinstance(canvas.get("width"), (int, float)):
            errors.append("canvas.width must be a number")
        if not isinstance(canvas.get("height"), (int, float)):
            errors.append("canvas.height must be a number")

    acts = dsl.get("acts", [])
    if not isinstance(acts, list) or len(acts) == 0:
        errors.append("Must have at least one act")
    else:
        for ai, act in enumerate(acts):
            if not isinstance(act, dict):
                errors.append(f"Act {ai} is not a dict")
                continue
            if not act.get("id"):
                errors.append(f"Act {ai} missing id")
            if not isinstance(act.get("duration_ms"), (int, float)):
                errors.append(f"Act {ai} missing duration_ms")

            layout = act.get("layout", {})
            if layout.get("type") not in VALID_LAYOUTS:
                errors.append(f"Act {ai}: invalid layout type '{layout.get('type')}'")

            # Validate layers within act
            for li, layer in enumerate(act.get("layers", [])):
                if not isinstance(layer, dict):
                    continue
                if layer.get("type") not in VALID_LAYER_TYPES:
                    errors.append(f"Act {ai} layer {li}: invalid type '{layer.get('type')}'")

            # Validate cells
            for ci, cell in enumerate(act.get("cells", [])):
                if not isinstance(cell, dict):
                    continue
                if not cell.get("id"):
                    errors.append(f"Act {ai} cell {ci} missing id")

    return len(errors) == 0, errors


def fix_common_dsl_issues(dsl: dict) -> dict:
    """Auto-fix common LLM mistakes in DSL output."""
    # Version
    dsl["version"] = "2.0"

    # Canvas defaults
    canvas = dsl.setdefault("canvas", {})
    canvas.setdefault("width", 800)
    canvas.setdefault("height", 600)
    canvas.setdefault("background", "#F2E8D5")
    canvas.setdefault("mood", "light")

    # If v1.0 format (flat layers + timeline), convert to v2.0 act format
    if "layers" in dsl and "acts" not in dsl:
        dsl["acts"] = [{
            "id": "main",
            "duration_ms": dsl.get("meta", {}).get("duration_ms", 5000),
            "layout": {"type": "full"},
            "layers": dsl.pop("layers", []),
            "cells": [],
            "timeline": dsl.pop("timeline", []),
            "events": dsl.pop("events", []),
        }]

    # Fix acts
    for act in dsl.get("acts", []):
        act.setdefault("id", f"act-{id(act)}")
        act.setdefault("duration_ms", 5000)
        act.setdefault("layout", {"type": "full"})
        act.setdefault("layers", [])
        act.setdefault("cells", [])
        act.setdefault("timeline", [])

        # Ensure all layers have props and id
        for layer in act.get("layers", []):
            layer.setdefault("props", {})
            layer.setdefault("id", f"layer-{id(layer)}")

        # Ensure timeline steps have required fields
        for step in act.get("timeline", []):
            step.setdefault("duration", 500)
            step.setdefault("easing", "ease-out")
            if "animate" not in step:
                step["animate"] = {"opacity": [0, 1]}

        # Fix cells
        for cell in act.get("cells", []):
            cell.setdefault("id", f"cell-{id(cell)}")
            cell.setdefault("layers", [])
            cell.setdefault("timeline", [])
            for layer in cell.get("layers", []):
                layer.setdefault("props", {})
                layer.setdefault("id", f"layer-{id(layer)}")

        # ── Cuts layout validation ──
        # If layout is "cuts", ensure cells[] count matches the
        # expected region count from cuts[]. N cuts = N+1 regions.
        layout = act.get("layout", {})
        if layout.get("type") == "cuts":
            cuts = layout.get("cuts", [])
            expected_regions = len(cuts) + 1 if cuts else 2
            actual_cells = len(act.get("cells", []))

            if actual_cells == 0 and act.get("layers"):
                # LLM put everything in layers but declared cuts layout.
                # Downgrade to "full" since there are no cells to render.
                layout["type"] = "full"
                logger.debug(
                    "Cuts layout with 0 cells — downgrading to full"
                )
            elif actual_cells > 0 and actual_cells < expected_regions:
                # Fewer cells than regions — pad with empty cells
                for ci in range(actual_cells, expected_regions):
                    act["cells"].append({
                        "id": f"cell-pad-{ci}",
                        "position": str(ci),
                        "layers": [],
                        "timeline": [],
                    })

        # ── Timeline target validation ──
        # Ensure all timeline targets reference actual layer IDs
        all_ids = {l.get("id") for l in act.get("layers", [])}
        for cell in act.get("cells", []):
            all_ids.update(l.get("id") for l in cell.get("layers", []))
        act["timeline"] = [
            step for step in act.get("timeline", [])
            if step.get("target") in all_ids
        ]

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
    """Generate a Living Panel DSL v2.0 for a single panel."""
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
            try:
                parsed = json.loads(parsed)
            except (json.JSONDecodeError, ValueError):
                parsed = {}
        if isinstance(parsed, list):
            parsed = parsed[0] if parsed else {}
        if not isinstance(parsed, dict):
            parsed = {}

        parsed = fix_common_dsl_issues(parsed)

        is_valid, errors = validate_living_panel_dsl(parsed)
        if not is_valid:
            logger.warning(f"Living panel DSL validation issues: {errors}")

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
# FALLBACK DSL (v2.0 format, no LLM needed)
# ============================================================

def generate_fallback_living_panel(panel_data: dict) -> dict:
    """Generate a basic Living Panel DSL v2.0 from static panel data.

    This is the safety net when LLM generation fails. It produces
    a clean, readable panel with proper animation sequencing.
    """
    content_type = panel_data.get("content_type", "narration")
    text = panel_data.get("text", "") or panel_data.get("text_content", "")
    dialogue = panel_data.get("dialogue", [])
    character = panel_data.get("character")
    expression = panel_data.get("expression", "neutral")
    mood = panel_data.get("visual_mood", "dramatic-dark")
    layout_hint = panel_data.get("layout_hint", "full")

    is_dark = mood in ("dramatic-dark", "cool-mystery", "intense-red")
    bg_color = "#1A1825" if is_dark else "#F2E8D5"
    bg_color2 = "#0F0E17" if is_dark else "#EDE0CC"
    ink = "#F0EEE8" if is_dark else "#1A1825"
    muted = "#A8A6C080" if is_dark else "#1A182570"
    pattern = "halftone" if is_dark else "manga_screen"
    canvas_mood = "dark" if is_dark else "light"

    layers = [
        {
            "id": "bg", "type": "background", "opacity": 1,
            "props": {
                "gradient": [bg_color, bg_color2],
                "gradientAngle": 160,
                "pattern": pattern,
                "patternOpacity": 0.05,
            },
        },
    ]
    timeline = []

    if content_type == "narration" and text:
        layers.append({
            "id": "narration", "type": "text",
            "x": "15%", "y": "35%", "opacity": 0,
            "props": {
                "content": text,
                "fontSize": "clamp(0.9rem, 3vw, 1.4rem)",
                "fontFamily": "body",
                "color": ink,
                "textAlign": "left",
                "maxWidth": "70%",
                "lineHeight": 1.5,
                "typewriter": True,
                "typewriterSpeed": 35,
            },
        })
        timeline.append(
            {"at": 400, "target": "narration",
             "animate": {"opacity": [0, 1], "typewriter": True}, "duration": 2000}
        )

    elif content_type == "dialogue" and dialogue:
        if character:
            layers.append({
                "id": "char", "type": "sprite",
                "x": "50%", "y": "65%", "opacity": 0,
                "props": {
                    "character": character,
                    "expression": expression,
                    "size": 56,
                    "showName": True,
                },
            })
            timeline.append(
                {"at": 200, "target": "char",
                 "animate": {"opacity": [0, 1]}, "duration": 400}
            )

        for i, line in enumerate(dialogue[:4]):
            # dialogue entries can be dicts {"character":..,"text":..} or plain strings
            if isinstance(line, str):
                line = {"text": line, "character": character or "?"}
            bid = f"bubble-{i}"
            x_pos = "8%" if i % 2 == 0 else "48%"
            y_pos = f"{8 + i * 15}%"  # more vertical space between bubbles
            layers.append({
                "id": bid, "type": "speech_bubble",
                "x": x_pos, "y": y_pos, "opacity": 0,
                "props": {
                    "text": line.get("text", ""),
                    "character": line.get("character", character or "?"),
                    "style": "speech",
                    "tailDirection": "bottom" if i < 2 else "top",
                    "maxWidth": 210,
                    "typewriter": True,
                    "typewriterSpeed": 35,
                },
            })
            timeline.append(
                {"at": 600 + i * 1200, "target": bid,
                 "animate": {"opacity": [0, 1], "typewriter": True}, "duration": 900}
            )

    elif content_type == "splash" and text:
        layers.extend([
            {
                "id": "speed", "type": "effect", "opacity": 0,
                "props": {"effect": "speed_lines", "color": ink,
                          "intensity": 0.3, "direction": "radial"},
            },
            {
                "id": "title", "type": "text",
                "x": "10%", "y": "30%", "opacity": 0,
                "props": {
                    "content": text,
                    "fontSize": "clamp(1.4rem, 5vw, 2.8rem)",
                    "fontFamily": "display",
                    "color": ink,
                    "lineHeight": 1.2,
                    "typewriter": True,
                    "typewriterSpeed": 50,
                },
            },
        ])
        timeline.extend([
            {"at": 200, "target": "speed",
             "animate": {"opacity": [0, 1]}, "duration": 500},
            {"at": 300, "target": "title",
             "animate": {"opacity": [0, 1], "typewriter": True}, "duration": 2000},
        ])

    else:
        layers.append({
            "id": "transition", "type": "scene_transition", "opacity": 0,
            "props": {"color": muted, "text": text or "..."},
        })
        timeline.append(
            {"at": 300, "target": "transition",
             "animate": {"opacity": [0, 1]}, "duration": 600}
        )

    total_ms = max(3000, len(timeline) * 1200 + 2000)

    return {
        "version": "2.0",
        "canvas": {
            "width": 800, "height": 600,
            "background": bg_color, "mood": canvas_mood,
        },
        "acts": [{
            "id": "main",
            "duration_ms": total_ms,
            "layout": {"type": "full"},
            "layers": layers,
            "cells": [],
            "timeline": timeline,
        }],
        "meta": {
            "content_type": content_type,
            "narrative_beat": text[:80] if text else "Panel",
            "duration_ms": total_ms,
        },
    }
