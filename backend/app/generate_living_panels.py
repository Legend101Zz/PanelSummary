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
    "illustration",  # LLMs consistently use this — treat as background
}

# Map LLM-invented types to valid ones (the LLM is creative with names)
LAYER_TYPE_ALIASES = {
    "illustration": "background",
    "bg": "background",
    "dialog": "speech_bubble",
    "dialogue": "speech_bubble",
    "bubble": "speech_bubble",
    "char": "sprite",
    "character": "sprite",
    "fx": "effect",
    "sfx": "effect",
    "transition": "scene_transition",
    "img": "image",
    "picture": "image",
    "data": "data_block",
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
                # Normalize LLM-invented type names
                layer_type = layer.get("type", "")
                if layer_type in LAYER_TYPE_ALIASES:
                    layer["type"] = LAYER_TYPE_ALIASES[layer_type]
                elif layer_type not in VALID_LAYER_TYPES:
                    errors.append(f"Act {ai} layer {li}: invalid type '{layer_type}'")

            # Validate cells
            for ci, cell in enumerate(act.get("cells", [])):
                if not isinstance(cell, dict):
                    continue
                if not cell.get("id"):
                    errors.append(f"Act {ai} cell {ci} missing id")
                # Normalize layer types inside cells too
                for li, layer in enumerate(cell.get("layers", [])):
                    if not isinstance(layer, dict):
                        continue
                    layer_type = layer.get("type", "")
                    if layer_type in LAYER_TYPE_ALIASES:
                        layer["type"] = LAYER_TYPE_ALIASES[layer_type]

    return len(errors) == 0, errors


# ============================================================
# TEXT CONTRAST ENFORCEMENT (WCAG AA)
# ============================================================

# Pre-computed: dark ink on cream paper, light text on dark backgrounds
_DARK_TEXT = "#1A1825"  # Ink black — for light/cream backgrounds
_LIGHT_TEXT = "#F0EEE8"  # Paper white — for dark backgrounds


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int] | None:
    """Parse #RRGGBB or #RGB to (r, g, b). Returns None on failure."""
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = h[0]*2 + h[1]*2 + h[2]*2
    if len(h) < 6:
        return None
    try:
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        return None


def _relative_luminance(r: int, g: int, b: int) -> float:
    """WCAG 2.x relative luminance."""
    def linearize(c: int) -> float:
        s = c / 255.0
        return s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4
    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)


def _contrast_ratio(fg: str, bg: str) -> float:
    """Compute WCAG contrast ratio between two hex colors. Returns 1.0 on error."""
    fg_rgb = _hex_to_rgb(fg)
    bg_rgb = _hex_to_rgb(bg)
    if not fg_rgb or not bg_rgb:
        return 1.0  # Assume bad contrast if we can't parse
    l1 = _relative_luminance(*fg_rgb)
    l2 = _relative_luminance(*bg_rgb)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def _is_dark_color(hex_color: str) -> bool:
    """Returns True if the color is perceptually dark."""
    rgb = _hex_to_rgb(hex_color)
    if not rgb:
        return False
    return _relative_luminance(*rgb) < 0.2


def _fix_text_color(text_color: str, bg_color: str) -> str:
    """Ensure text has at least 4.5:1 contrast against background.

    If contrast is insufficient, flip to dark ink or light paper
    depending on the background luminance.
    """
    ratio = _contrast_ratio(text_color, bg_color)
    if ratio >= 4.5:
        return text_color  # Already good

    # Pick the color with better contrast against this background
    dark_ratio = _contrast_ratio(_DARK_TEXT, bg_color)
    light_ratio = _contrast_ratio(_LIGHT_TEXT, bg_color)
    fixed = _DARK_TEXT if dark_ratio > light_ratio else _LIGHT_TEXT
    logger.debug(
        f"Contrast fix: {text_color} on {bg_color} = {ratio:.1f}:1 → "
        f"{fixed} ({max(dark_ratio, light_ratio):.1f}:1)"
    )
    return fixed


def _get_panel_bg_color(dsl: dict) -> str:
    """Extract the dominant background color from the DSL."""
    canvas_bg = dsl.get("canvas", {}).get("background", "#F2E8D5")
    # Check first act's background layer for gradient override
    for act in dsl.get("acts", []):
        for layer in act.get("layers", []):
            if layer.get("type") == "background":
                gradient = layer.get("props", {}).get("gradient", [])
                if gradient:
                    return gradient[0]  # Dominant color is first gradient stop
        break  # Only check first act for the dominant background
    return canvas_bg


def _enforce_text_contrast(dsl: dict) -> None:
    """Walk all text/speech_bubble layers and fix contrast against background.

    This is the safety net that prevents white-text-on-cream-paper disasters.
    Mutates the DSL in place.
    """
    bg_color = _get_panel_bg_color(dsl)

    def fix_layers(layers: list[dict]) -> None:
        for layer in layers:
            ltype = layer.get("type", "")
            props = layer.get("props", {})

            if ltype == "text" and "color" in props:
                props["color"] = _fix_text_color(props["color"], bg_color)
                # Add text shadow as readability safety net
                if not props.get("textShadow"):
                    if _is_dark_color(bg_color):
                        props["textShadow"] = "0 1px 3px rgba(0,0,0,0.6)"
                    else:
                        props["textShadow"] = "0 1px 2px rgba(255,255,255,0.5)"

            elif ltype == "speech_bubble":
                # Bubble interiors are always light, so text should be dark
                # unless it's a "shout" or "narrator" style on dark bg
                pass  # Bubbles handle their own contrast in the renderer

            elif ltype == "effect" and "color" in props:
                # SFX text needs contrast too
                effect = props.get("effect", "")
                if effect == "sfx" and "sfxText" in props:
                    props["color"] = _fix_text_color(props["color"], bg_color)

    for act in dsl.get("acts", []):
        fix_layers(act.get("layers", []))
        for cell in act.get("cells", []):
            fix_layers(cell.get("layers", []))


def _enforce_text_limits(layer: dict, is_cell: bool = False) -> None:
    """Enforce text length limits to prevent overflow.

    Full panels can hold ~200 chars of body text comfortably.
    Cell panels (sub-panels) can hold ~100 chars.
    Speech bubbles should be even shorter (~120/80 chars).

    When text is too long, we truncate at the last sentence boundary
    and add an ellipsis.
    """
    ltype = layer.get("type", "")
    props = layer.get("props", {})

    if ltype == "text":
        content = props.get("content", "")
        max_len = 120 if is_cell else 220
        if len(content) > max_len:
            # Truncate at last sentence boundary
            truncated = content[:max_len]
            for sep in ('. ', '\n', '! ', '? ', '; '):
                last_sep = truncated.rfind(sep)
                if last_sep > max_len * 0.4:
                    truncated = truncated[:last_sep + 1]
                    break
            props["content"] = truncated.rstrip() + "…"
            logger.debug(
                f"Text truncated: {len(content)} → {len(props['content'])} chars"
            )

    elif ltype == "speech_bubble":
        text = props.get("text", "")
        max_len = 80 if is_cell else 140
        if len(text) > max_len:
            truncated = text[:max_len]
            for sep in ('. ', '! ', '? ', ', '):
                last_sep = truncated.rfind(sep)
                if last_sep > max_len * 0.4:
                    truncated = truncated[:last_sep + 1]
                    break
            props["text"] = truncated.rstrip() + "…"


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
    for ai, act in enumerate(dsl.get("acts", [])):
        act.setdefault("id", f"act-{ai}")
        act.setdefault("duration_ms", 5000)
        act.setdefault("layout", {"type": "full"})
        act.setdefault("layers", [])
        act.setdefault("cells", [])
        act.setdefault("timeline", [])

        # ── Transition defaults ──
        # Every act needs a transition_in. LLMs often omit this.
        act.setdefault("transition_in", {
            "type": "fade",
            "duration_ms": 400 if ai == 0 else 350,
        })
        transition = act["transition_in"]
        if transition.get("type") not in VALID_TRANSITIONS:
            transition["type"] = "fade"
        transition.setdefault("duration_ms", 400)

        # ── Layout type validation ──
        layout = act.get("layout", {})
        if layout.get("type") not in VALID_LAYOUTS:
            logger.debug(
                f"Unknown layout '{layout.get('type')}' → downgrade to full"
            )
            layout["type"] = "full"

        # ── Background layer guarantee ──
        # Every act MUST have a background layer. Renderer breaks without one.
        has_bg = any(
            l.get("type") == "background"
            for l in act.get("layers", [])
        )
        if not has_bg:
            mood = canvas.get("mood", "light")
            bg_color = "#F2E8D5" if mood == "light" else "#1A1825"
            bg_color2 = "#EDE0CC" if mood == "light" else "#0F0E17"
            act["layers"].insert(0, {
                "id": f"bg-fix-{ai}",
                "type": "background",
                "opacity": 1,
                "props": {
                    "gradient": [bg_color, bg_color2],
                    "pattern": "crosshatch",
                    "patternOpacity": 0.04,
                },
            })

        # Ensure all layers have props and id
        for li, layer in enumerate(act.get("layers", [])):
            layer.setdefault("props", {})
            layer.setdefault("id", f"layer-{ai}-{li}")
            # Fix opacity: must be a number
            if not isinstance(layer.get("opacity"), (int, float)):
                layer["opacity"] = 1 if layer.get("type") == "background" else 0
            # Enforce text length limits to prevent overflow
            _enforce_text_limits(layer, is_cell=False)

        # Ensure timeline steps have required fields
        for step in act.get("timeline", []):
            step.setdefault("duration", 500)
            step.setdefault("easing", "ease-out")
            if "animate" not in step:
                step["animate"] = {"opacity": [0, 1]}
            # Fix 'at' — must be a number
            if not isinstance(step.get("at"), (int, float)):
                step["at"] = 0

        # Fix cells
        for ci, cell in enumerate(act.get("cells", [])):
            cell.setdefault("id", f"cell-{ai}-{ci}")
            cell.setdefault("layers", [])
            cell.setdefault("timeline", [])
            # Normalize position to string (renderer expects "0", "1", etc.)
            if isinstance(cell.get("position"), int):
                cell["position"] = str(cell["position"])
            elif cell.get("position") is None:
                cell["position"] = str(ci)
            # Prevent empty cells — add a subtle screentone if no layers
            if not cell.get("layers"):
                cell["layers"] = [{
                    "id": f"cell-{ai}-{ci}-fill",
                    "type": "effect",
                    "opacity": 1,
                    "props": {
                        "effect": "screentone",
                        "intensity": 0.06,
                    },
                }]
            for li, layer in enumerate(cell.get("layers", [])):
                layer.setdefault("props", {})
                layer.setdefault("id", f"cell-{ai}-{ci}-layer-{li}")
                if not isinstance(layer.get("opacity"), (int, float)):
                    layer["opacity"] = 0
                # Cells are smaller — stricter text limits
                _enforce_text_limits(layer, is_cell=True)
            # Fix cell timelines too
            for step in cell.get("timeline", []):
                step.setdefault("duration", 500)
                step.setdefault("easing", "ease-out")
                if "animate" not in step:
                    step["animate"] = {"opacity": [0, 1]}
                if not isinstance(step.get("at"), (int, float)):
                    step["at"] = 0

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

    # ── Text contrast enforcement (WCAG AA: 4.5:1) ──────────────────
    _enforce_text_contrast(dsl)

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
