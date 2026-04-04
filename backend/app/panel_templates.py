"""
panel_templates.py — Hand-Crafted Manga Panel Templates
=========================================================
Pre-designed DSL templates for each content type.
The LLM picks the content; templates handle the art.

WHY: LLM-generated DSL converges to identical patterns (gradient →
vignette → text). Templates guarantee visual variety, correct
typography, and zero overlapping text — at ZERO token cost.

Each content type has 2-3 variants rotated by panel index for variety.

IMPORTANT: All templates produce valid Living Panel DSL v2.0.
The existing LivingPanelEngine renders them identically to LLM DSLs.
"""

import hashlib
from typing import Optional


# ============================================================
# MOOD → COLOR PALETTES
# ============================================================

MOOD_PALETTES = {
    "dramatic-dark":   {"bg": "#1A1825", "bg2": "#0F0E17", "ink": "#F0EEE8", "muted": "#A8A6C080", "accent": "#E8191A", "mood": "dark"},
    "warm-amber":      {"bg": "#1E1A10", "bg2": "#141008", "ink": "#F2E8D5", "muted": "#C8B89C80", "accent": "#F5A623", "mood": "dark"},
    "cool-mystery":    {"bg": "#0D1520", "bg2": "#08101A", "ink": "#D0E8F0", "muted": "#6090A880", "accent": "#00BFA5", "mood": "dark"},
    "intense-red":     {"bg": "#1A0A0A", "bg2": "#120505", "ink": "#F0D8D8", "muted": "#C0808080", "accent": "#E8191A", "mood": "dark"},
    "calm-green":      {"bg": "#0A1A10", "bg2": "#051208", "ink": "#D0F0D8", "muted": "#60A87080", "accent": "#4CAF50", "mood": "dark"},
    "ethereal-purple": {"bg": "#15081F", "bg2": "#0E0515", "ink": "#E0D0F0", "muted": "#A080C080", "accent": "#BB86FC", "mood": "dark"},
    # Light variants (for minimalist / academic styles)
    "light":           {"bg": "#F2E8D5", "bg2": "#EDE0CC", "ink": "#1A1825", "muted": "#1A182570", "accent": "#0053E2", "mood": "light"},
    "light-warm":      {"bg": "#F5F0E8", "bg2": "#EDE5D8", "ink": "#2A2520", "muted": "#2A252060", "accent": "#F5A623", "mood": "light"},
}


def _palette(mood: str) -> dict:
    """Get color palette for a mood, with fallback."""
    return MOOD_PALETTES.get(mood, MOOD_PALETTES["dramatic-dark"])


def _pick_variant(panel_index: int, num_variants: int) -> int:
    """Deterministic variant selection that avoids repetition."""
    return panel_index % num_variants


# ============================================================
# SHARED BUILDERS (DRY — used across templates)
# ============================================================

def _bg_layer(pal: dict, pattern: str = "halftone", angle: int = 160) -> dict:
    return {
        "id": "bg", "type": "background", "opacity": 1,
        "props": {
            "gradient": [pal["bg"], pal["bg2"]],
            "gradientAngle": angle,
            "pattern": pattern,
            "patternOpacity": 0.05,
        },
    }


def _text_layer(
    lid: str, content: str, pal: dict,
    x: str = "10%", y: str = "35%",
    font_size: str = "clamp(0.9rem, 3vw, 1.3rem)",
    font_family: str = "body",
    max_width: str = "80%",
    line_height: float = 1.6,
    align: str = "left",
    typewriter: bool = True,
    tw_speed: int = 30,
) -> dict:
    return {
        "id": lid, "type": "text",
        "x": x, "y": y, "opacity": 0,
        "props": {
            "content": content,
            "fontSize": font_size,
            "fontFamily": font_family,
            "color": pal["ink"],
            "textAlign": align,
            "maxWidth": max_width,
            "lineHeight": line_height,
            "typewriter": typewriter,
            "typewriterSpeed": tw_speed,
        },
    }


def _sprite_layer(
    lid: str, character: str, expression: str,
    x: str = "50%", y: str = "60%", size: int = 64,
) -> dict:
    return {
        "id": lid, "type": "sprite",
        "x": x, "y": y, "opacity": 0,
        "props": {
            "character": character,
            "expression": expression,
            "size": size,
            "showName": True,
        },
    }


def _bubble_layer(
    lid: str, text: str, character: str,
    x: str = "10%", y: str = "10%",
    style: str = "speech",
    tail: str = "bottom",
    max_width: int = 220,
) -> dict:
    return {
        "id": lid, "type": "speech_bubble",
        "x": x, "y": y, "opacity": 0,
        "props": {
            "text": text,
            "character": character,
            "style": style,
            "tailDirection": tail,
            "maxWidth": max_width,
            "typewriter": True,
            "typewriterSpeed": 30,
        },
    }


def _effect_layer(lid: str, effect: str, pal: dict, intensity: float = 0.3, **extra) -> dict:
    props = {"effect": effect, "color": pal["ink"], "intensity": intensity}
    props.update(extra)
    return {"id": lid, "type": "effect", "opacity": 0, "props": props}


def _fade_in(target: str, at: int, duration: int = 500) -> dict:
    return {"at": at, "target": target, "animate": {"opacity": [0, 1]}, "duration": duration}


def _typewriter_in(target: str, at: int, duration: int = 1500) -> dict:
    return {"at": at, "target": target, "animate": {"opacity": [0, 1], "typewriter": True}, "duration": duration}


def _wrap_dsl(
    layers: list, timeline: list, content_type: str,
    narrative_beat: str, pal: dict,
    layout: dict | None = None,
    cells: list | None = None,
) -> dict:
    """Assemble a complete DSL v2.0 document."""
    total_ms = max(3000, len(timeline) * 800 + 2000)
    return {
        "version": "2.0",
        "canvas": {
            "width": 800, "height": 600,
            "background": pal["bg"], "mood": pal["mood"],
        },
        "acts": [{
            "id": "main",
            "duration_ms": total_ms,
            "layout": layout or {"type": "full"},
            "layers": layers,
            "cells": cells or [],
            "timeline": timeline,
        }],
        "meta": {
            "content_type": content_type,
            "narrative_beat": narrative_beat[:80] if narrative_beat else "Panel",
            "duration_ms": total_ms,
            "source": "template",
        },
    }


# ============================================================
# SPLASH TEMPLATES — Chapter openers, dramatic moments
# ============================================================

def _splash_v1(text: str, pal: dict, beat: str) -> dict:
    """Classic splash: speed lines → big title text with impact."""
    layers = [
        _bg_layer(pal, pattern="halftone", angle=135),
        _effect_layer("speed", "speed_lines", pal, intensity=0.4, direction="radial"),
        _effect_layer("vignette", "vignette", pal, intensity=0.6),
        _text_layer("title", text, pal,
                    x="8%", y="25%",
                    font_size="clamp(1.5rem, 5vw, 2.8rem)",
                    font_family="display",
                    line_height=1.2, tw_speed=45),
    ]
    timeline = [
        _fade_in("speed", 100, 400),
        _fade_in("vignette", 0, 600),
        _typewriter_in("title", 300, 2500),
    ]
    return _wrap_dsl(layers, timeline, "splash", beat, pal)


def _splash_v2(text: str, pal: dict, beat: str) -> dict:
    """Dramatic splash: screentone base → ink splash → text from bottom."""
    layers = [
        _bg_layer(pal, pattern="manga_screen", angle=180),
        _effect_layer("ink", "ink_splash", pal, intensity=0.3),
        _effect_layer("crosshatch", "crosshatch", pal, intensity=0.08),
        _text_layer("title", text, pal,
                    x="10%", y="55%",
                    font_size="clamp(1.4rem, 4.5vw, 2.4rem)",
                    font_family="display",
                    line_height=1.15, tw_speed=50),
    ]
    timeline = [
        _fade_in("ink", 200, 500),
        _fade_in("crosshatch", 100, 400),
        {"at": 400, "target": "title",
         "animate": {"opacity": [0, 1], "y": ["70%", "55%"], "typewriter": True},
         "duration": 2000},
    ]
    return _wrap_dsl(layers, timeline, "splash", beat, pal)


def _splash_v3_sfx(text: str, pal: dict, beat: str) -> dict:
    """SFX splash: big sound effect text → title reveal."""
    # Pick an SFX based on content
    sfx = "BOOM!!" if any(w in text.lower() for w in ["impact", "break", "start", "begin"]) else "WHOOSH!!"
    layers = [
        _bg_layer(pal, pattern="halftone", angle=160),
        _effect_layer("sfx", "sfx", pal, intensity=0.6,
                      sfxText=sfx, sfxSize=72, sfxRotate=-15, sfxOutline=True),
        _effect_layer("lines", "speed_lines", pal, intensity=0.25, direction="radial"),
        _text_layer("title", text, pal,
                    x="10%", y="40%",
                    font_size="clamp(1.3rem, 4vw, 2.2rem)",
                    font_family="display",
                    line_height=1.2, tw_speed=40),
    ]
    timeline = [
        {"at": 0, "target": "sfx",
         "animate": {"opacity": [0, 1], "scale": [2.0, 1.0]}, "duration": 400},
        _fade_in("lines", 200, 500),
        _typewriter_in("title", 600, 2000),
    ]
    return _wrap_dsl(layers, timeline, "splash", beat, pal)


SPLASH_TEMPLATES = [_splash_v1, _splash_v2, _splash_v3_sfx]


# ============================================================
# DIALOGUE TEMPLATES — Character conversations with bubbles
# ============================================================

def _dialogue_v1_cuts(
    dialogue: list[dict], character: str, expression: str,
    pal: dict, beat: str,
) -> dict:
    """Cuts layout: character on left, staggered bubbles on right."""
    layers = [_bg_layer(pal, pattern="manga_screen")]

    # Character cell
    char_cell = {
        "id": "char-cell", "position": "left",
        "layers": [
            _sprite_layer("char", character, expression, x="50%", y="50%", size=80),
        ],
        "timeline": [_fade_in("char", 200, 400)],
    }

    # Bubbles cell
    bubble_layers = []
    bubble_tl = []
    for i, line in enumerate(dialogue[:4]):
        if isinstance(line, str):
            line = {"text": line, "character": character}
        bid = f"bubble-{i}"
        y_pos = f"{10 + i * 22}%"
        style = "shout" if "!" in line.get("text", "") else "speech"
        bubble_layers.append(
            _bubble_layer(bid, line.get("text", ""), line.get("character", "?"),
                          x="8%", y=y_pos, style=style,
                          tail="left" if i % 2 == 0 else "right")
        )
        bubble_tl.append(_typewriter_in(bid, 400 + i * 900, 800))

    bubble_cell = {
        "id": "bubble-cell", "position": "right",
        "layers": bubble_layers,
        "timeline": bubble_tl,
    }

    return _wrap_dsl(
        layers, [], "dialogue", beat, pal,
        layout={"type": "split-h", "gap": 4, "borderWidth": 3},
        cells=[char_cell, bubble_cell],
    )


def _dialogue_v2_stack(
    dialogue: list[dict], character: str, expression: str,
    pal: dict, beat: str,
) -> dict:
    """Vertical stack: character at top, bubbles cascade down."""
    layers = [
        _bg_layer(pal, pattern="halftone"),
        _sprite_layer("char", character, expression, x="50%", y="20%", size=56),
    ]
    timeline = [_fade_in("char", 100, 400)]

    for i, line in enumerate(dialogue[:4]):
        if isinstance(line, str):
            line = {"text": line, "character": character}
        bid = f"bubble-{i}"
        x_pos = "8%" if i % 2 == 0 else "45%"
        y_pos = f"{38 + i * 16}%"
        layers.append(
            _bubble_layer(bid, line.get("text", ""), line.get("character", "?"),
                          x=x_pos, y=y_pos,
                          style="thought" if i == len(dialogue) - 1 else "speech",
                          tail="top")
        )
        timeline.append(_typewriter_in(bid, 500 + i * 1000, 800))

    return _wrap_dsl(layers, timeline, "dialogue", beat, pal)


DIALOGUE_TEMPLATES = [_dialogue_v1_cuts, _dialogue_v2_stack]


# ============================================================
# NARRATION TEMPLATES — Story text with atmosphere
# ============================================================

def _narration_v1_center(text: str, pal: dict, beat: str) -> dict:
    """Centered narration with screentone backdrop."""
    layers = [
        _bg_layer(pal, pattern="manga_screen", angle=170),
        _effect_layer("tone", "screentone", pal, intensity=0.1),
        _text_layer("narration", text, pal,
                    x="12%", y="20%",
                    max_width="76%", line_height=1.7, tw_speed=28),
    ]
    timeline = [
        _fade_in("tone", 0, 500),
        _typewriter_in("narration", 300, 2000),
    ]
    return _wrap_dsl(layers, timeline, "narration", beat, pal)


def _narration_v2_sidebar(text: str, pal: dict, beat: str) -> dict:
    """Sidebar accent: narrow color bar on left, text on right."""
    layers = [
        _bg_layer(pal, pattern="halftone"),
        {"id": "bar", "type": "shape", "x": "0%", "y": "0%",
         "width": "4%", "height": "100%", "opacity": 0,
         "props": {"shape": "rect", "fill": pal["accent"]}},
        _text_layer("narration", text, pal,
                    x="10%", y="15%",
                    max_width="82%", line_height=1.7, tw_speed=30),
    ]
    timeline = [
        {"at": 0, "target": "bar",
         "animate": {"opacity": [0, 0.7], "height": ["0%", "100%"]}, "duration": 600},
        _typewriter_in("narration", 400, 2000),
    ]
    return _wrap_dsl(layers, timeline, "narration", beat, pal)


def _narration_v3_quote(text: str, pal: dict, beat: str) -> dict:
    """Quote style: large opening quote mark, indented text."""
    layers = [
        _bg_layer(pal, pattern="manga_screen", angle=145),
        _text_layer("quote-mark", "❝", pal,
                    x="6%", y="8%",
                    font_size="clamp(3rem, 8vw, 5rem)",
                    font_family="display", typewriter=False),
        _text_layer("narration", text, pal,
                    x="14%", y="22%",
                    max_width="72%", line_height=1.7, tw_speed=28,
                    font_size="clamp(0.85rem, 2.5vw, 1.2rem)"),
    ]
    timeline = [
        {"at": 0, "target": "quote-mark",
         "animate": {"opacity": [0, 0.2]}, "duration": 400},
        _typewriter_in("narration", 300, 2200),
    ]
    return _wrap_dsl(layers, timeline, "narration", beat, pal)


NARRATION_TEMPLATES = [_narration_v1_center, _narration_v2_sidebar, _narration_v3_quote]


# ============================================================
# DATA TEMPLATES — Key concepts, facts, structured info
# ============================================================

def _data_v1_blocks(text: str, items: list[str], pal: dict, beat: str) -> dict:
    """Data block list with staggered reveal."""
    data_items = [{"label": item, "value": ""} for item in items[:6]]
    layers = [
        _bg_layer(pal, pattern="crosshatch"),
        {"id": "data", "type": "data_block",
         "x": "8%", "y": "12%", "opacity": 0,
         "props": {
             "items": data_items,
             "layout": "list",
             "accentColor": pal["accent"],
             "showIndex": True,
             "animateIn": "stagger",
             "staggerDelay": 300,
         }},
    ]
    if text:
        layers.append(
            _text_layer("label", text, pal,
                        x="8%", y="4%",
                        font_size="clamp(0.7rem, 2vw, 0.9rem)",
                        font_family="label", typewriter=False,
                        max_width="84%")
        )
    timeline = [
        _fade_in("data", 200, 600),
    ]
    if text:
        timeline.insert(0, _fade_in("label", 0, 300))
    return _wrap_dsl(layers, timeline, "data", beat, pal)


def _data_v2_grid(text: str, items: list[str], pal: dict, beat: str) -> dict:
    """Grid layout: 2-column grid of data items."""
    data_items = [{"label": item, "value": ""} for item in items[:8]]
    layers = [
        _bg_layer(pal, pattern="manga_screen"),
        _effect_layer("cross", "crosshatch", pal, intensity=0.06),
        {"id": "data", "type": "data_block",
         "x": "6%", "y": "15%", "opacity": 0,
         "width": "88%",
         "props": {
             "items": data_items,
             "layout": "grid",
             "accentColor": pal["accent"],
             "showIndex": False,
             "animateIn": "cascade",
             "staggerDelay": 200,
         }},
    ]
    if text:
        layers.append(
            _text_layer("heading", text, pal,
                        x="6%", y="4%",
                        font_size="clamp(0.8rem, 2.5vw, 1.1rem)",
                        font_family="display", typewriter=False)
        )
    timeline = [
        _fade_in("cross", 0, 400),
        _fade_in("data", 300, 500),
    ]
    if text:
        timeline.insert(0, _fade_in("heading", 100, 300))
    return _wrap_dsl(layers, timeline, "data", beat, pal)


DATA_TEMPLATES = [_data_v1_blocks, _data_v2_grid]


# ============================================================
# MONTAGE TEMPLATES — Quick sequence of moments
# ============================================================

def _montage_cuts(items: list[str], pal: dict, beat: str) -> dict:
    """Manga cuts: 2-3 angled panels, each with a short text."""
    display_items = items[:3] if len(items) >= 3 else items[:2]
    n = len(display_items)

    # Build cut specs for n panels
    cuts = [{"direction": "v", "position": 0.5, "angle": 2}]
    if n == 3:
        cuts.append({"direction": "h", "position": 0.5, "angle": -1, "target": 1})

    layers = [_bg_layer(pal, pattern="halftone")]
    cells = []
    cell_tl = []

    for i, item_text in enumerate(display_items):
        cell_id = f"cell-{i}"
        cells.append({
            "id": cell_id, "position": str(i),
            "layers": [
                _text_layer(f"text-{i}", item_text, pal,
                            x="10%", y="30%",
                            font_size="clamp(0.8rem, 2.5vw, 1.1rem)",
                            max_width="80%", line_height=1.5, tw_speed=25),
            ],
            "timeline": [_typewriter_in(f"text-{i}", 200, 1200)],
        })

    return _wrap_dsl(
        layers, [], "montage", beat, pal,
        layout={"type": "cuts", "cuts": cuts, "gap": 3, "borderWidth": 2,
                "stagger_ms": 400},
        cells=cells,
    )


MONTAGE_TEMPLATES = [_montage_cuts]


# ============================================================
# TRANSITION TEMPLATES — Chapter/scene breaks
# ============================================================

def _transition_v1(text: str, pal: dict, beat: str) -> dict:
    """Minimal scene transition with centered text."""
    layers = [
        _bg_layer(pal, pattern="halftone", angle=180),
        {"id": "line", "type": "shape",
         "x": "30%", "y": "48%", "width": "40%", "height": "1px", "opacity": 0,
         "props": {"shape": "line", "stroke": pal["muted"], "strokeWidth": 1}},
        _text_layer("label", text or "· · ·", pal,
                    x="50%", y="52%",
                    font_size="clamp(0.75rem, 2vw, 1rem)",
                    font_family="label", align="center",
                    max_width="60%", typewriter=False),
    ]
    timeline = [
        {"at": 0, "target": "line",
         "animate": {"opacity": [0, 0.4], "width": ["0%", "40%"]}, "duration": 800},
        _fade_in("label", 500, 600),
    ]
    return _wrap_dsl(layers, timeline, "transition", beat, pal)


def _transition_v2_fade(text: str, pal: dict, beat: str) -> dict:
    """Atmospheric fade with vignette."""
    layers = [
        _bg_layer(pal, pattern="manga_screen"),
        _effect_layer("vig", "vignette", pal, intensity=0.7),
        _text_layer("label", text or "— — —", pal,
                    x="50%", y="45%",
                    font_size="clamp(0.8rem, 2.5vw, 1.1rem)",
                    font_family="display", align="center",
                    max_width="70%", typewriter=False),
    ]
    timeline = [
        _fade_in("vig", 0, 800),
        {"at": 400, "target": "label",
         "animate": {"opacity": [0, 0.8]}, "duration": 1000},
    ]
    return _wrap_dsl(layers, timeline, "transition", beat, pal)


TRANSITION_TEMPLATES = [_transition_v1, _transition_v2_fade]


# ============================================================
# CONCEPT TEMPLATES — Abstract ideas, emphasis
# ============================================================

def _concept_v1(text: str, pal: dict, beat: str) -> dict:
    """Concept panel: crosshatch bg, centered bold text, sparkle effect."""
    layers = [
        _bg_layer(pal, pattern="crosshatch", angle=135),
        _effect_layer("sparkle", "sparkle", pal, intensity=0.15, count=8),
        _text_layer("concept", text, pal,
                    x="50%", y="35%",
                    font_size="clamp(1.1rem, 3.5vw, 1.8rem)",
                    font_family="display", align="center",
                    max_width="70%", line_height=1.4, tw_speed=40),
    ]
    timeline = [
        _fade_in("sparkle", 100, 500),
        _typewriter_in("concept", 300, 1800),
    ]
    return _wrap_dsl(layers, timeline, "concept", beat, pal)


CONCEPT_TEMPLATES = [_concept_v1]


# ============================================================
# MAIN ENTRY POINT — Template Selection + Filling
# ============================================================

def fill_template(
    panel_index: int,
    content_type: str,
    text: str = "",
    dialogue: list[dict] | None = None,
    character: str | None = None,
    expression: str = "neutral",
    visual_mood: str = "dramatic-dark",
    narrative_beat: str = "",
    key_concepts: list[str] | None = None,
) -> dict:
    """Select and fill a template based on content type.

    This is the main entry point. The planner's PanelAssignment
    provides all the parameters; this function picks the right
    template variant and fills it.

    Returns a complete Living Panel DSL v2.0 dict.
    """
    pal = _palette(visual_mood)
    beat = narrative_beat or text[:80] if text else "Panel"
    dialogue = dialogue or []

    if content_type == "splash":
        variant = _pick_variant(panel_index, len(SPLASH_TEMPLATES))
        return SPLASH_TEMPLATES[variant](text or beat, pal, beat)

    elif content_type == "dialogue":
        variant = _pick_variant(panel_index, len(DIALOGUE_TEMPLATES))
        return DIALOGUE_TEMPLATES[variant](
            dialogue, character or "?", expression, pal, beat,
        )

    elif content_type == "narration":
        variant = _pick_variant(panel_index, len(NARRATION_TEMPLATES))
        return NARRATION_TEMPLATES[variant](text or "", pal, beat)

    elif content_type == "data":
        items = key_concepts or []
        if not items and text:
            # Extract bullet points from text
            items = [line.strip("- •·") for line in text.split("\n") if line.strip()]
        variant = _pick_variant(panel_index, len(DATA_TEMPLATES))
        return DATA_TEMPLATES[variant](text or "", items, pal, beat)

    elif content_type == "montage":
        items = key_concepts or [text] if text else ["..."]
        return MONTAGE_TEMPLATES[0](items, pal, beat)

    elif content_type in ("transition", "chapter_break"):
        variant = _pick_variant(panel_index, len(TRANSITION_TEMPLATES))
        return TRANSITION_TEMPLATES[variant](text or "", pal, beat)

    elif content_type == "concept":
        return CONCEPT_TEMPLATES[0](text or beat, pal, beat)

    else:
        # Unknown content type — fall back to narration
        variant = _pick_variant(panel_index, len(NARRATION_TEMPLATES))
        return NARRATION_TEMPLATES[variant](text or beat, pal, beat)
