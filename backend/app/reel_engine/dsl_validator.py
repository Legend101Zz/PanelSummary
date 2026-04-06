"""
dsl_validator.py — Validate + Auto-Fix Video DSL
===================================================
Same battle-tested pattern as Living Panel DSL validation.
Catch LLM mistakes, normalize aliases, enforce contrast.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)

# ── Valid values ─────────────────────────────────────────────

VALID_LAYER_TYPES = {
    "background", "text", "counter", "speech_bubble",
    "effect", "sprite", "data_block", "shape", "illustration",
}

LAYER_TYPE_ALIASES = {
    "bg": "background",
    "dialog": "speech_bubble",
    "dialogue": "speech_bubble",
    "bubble": "speech_bubble",
    "char": "sprite",
    "character": "sprite",
    "fx": "effect",
    "sfx": "effect",
    "img": "illustration",
    "image": "illustration",
    "number": "counter",
    "stat": "counter",
    "list": "data_block",
    "bullets": "data_block",
    "rect": "shape",
    "circle": "shape",
}

VALID_TRANSITIONS = {
    "cut", "fade", "wipe", "zoom", "glitch",
    "ink_wash", "slide", "iris",
}

VALID_EFFECTS = {
    "speed_lines", "particles", "halftone", "crosshatch",
    "vignette", "sfx", "impact_burst", "ink_splash",
    "sparkle", "screentone", "dots", "lines", "noise",
}

VALID_EASINGS = {
    "linear", "ease-in", "ease-out", "ease-in-out",
    "spring", "bounce",
}

# ── Contrast enforcement ─────────────────────────────────────

_DARK_TEXT = "#1A1825"
_LIGHT_TEXT = "#F0EEE8"


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int] | None:
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
    def linearize(c: int) -> float:
        s = c / 255.0
        return s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4
    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)


def _contrast_ratio(fg: str, bg: str) -> float:
    fg_rgb = _hex_to_rgb(fg)
    bg_rgb = _hex_to_rgb(bg)
    if not fg_rgb or not bg_rgb:
        return 1.0
    l1 = _relative_luminance(*fg_rgb)
    l2 = _relative_luminance(*bg_rgb)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def _is_dark_color(hex_color: str) -> bool:
    rgb = _hex_to_rgb(hex_color)
    if not rgb:
        return True
    return _relative_luminance(*rgb) < 0.2


# ── Validation ───────────────────────────────────────────────

def validate_video_dsl(dsl: dict) -> tuple[bool, list[str]]:
    """Validate a Video DSL dict. Returns (is_valid, errors)."""
    errors = []

    if dsl.get("version") != "1.0":
        errors.append("version must be '1.0'")

    canvas = dsl.get("canvas")
    if not isinstance(canvas, dict):
        errors.append("Missing canvas config")
    else:
        for field in ("width", "height", "fps"):
            if not isinstance(canvas.get(field), (int, float)):
                errors.append(f"canvas.{field} must be a number")

    scenes = dsl.get("scenes", [])
    if not isinstance(scenes, list) or len(scenes) == 0:
        errors.append("Must have at least one scene")
    else:
        for si, scene in enumerate(scenes):
            if not isinstance(scene, dict):
                errors.append(f"Scene {si} is not a dict")
                continue
            if not scene.get("id"):
                errors.append(f"Scene {si} missing id")
            if not isinstance(scene.get("duration_ms"), (int, float)):
                errors.append(f"Scene {si} missing duration_ms")

            for li, layer in enumerate(scene.get("layers", [])):
                if not isinstance(layer, dict):
                    continue
                layer_type = layer.get("type", "")
                if layer_type in LAYER_TYPE_ALIASES:
                    layer["type"] = LAYER_TYPE_ALIASES[layer_type]
                elif layer_type not in VALID_LAYER_TYPES:
                    errors.append(
                        f"Scene {si} layer {li}: invalid type '{layer_type}'"
                    )

    meta = dsl.get("meta")
    if not isinstance(meta, dict):
        errors.append("Missing meta block")

    return len(errors) == 0, errors


# ── Auto-Fix ─────────────────────────────────────────────────

def fix_video_dsl(dsl: dict) -> dict:
    """Auto-fix common LLM mistakes in Video DSL. Mutates in place."""
    fixes = 0

    # Ensure version
    if dsl.get("version") != "1.0":
        dsl["version"] = "1.0"
        fixes += 1

    # Ensure canvas defaults
    canvas = dsl.setdefault("canvas", {})
    canvas.setdefault("width", 1080)
    canvas.setdefault("height", 1920)
    canvas.setdefault("fps", 30)
    canvas.setdefault("background", "#0F0E17")

    # Ensure fonts
    dsl.setdefault("fonts", ["Outfit", "Dela Gothic One"])

    # Ensure palette
    palette = dsl.setdefault("palette", {})
    palette.setdefault("bg", canvas.get("background", "#0F0E17"))
    palette.setdefault("fg", "#F0EEE8")
    palette.setdefault("accent", "#F5A623")
    palette.setdefault("accent2", "#E8191A")
    palette.setdefault("muted", "#5E5C78")

    # Ensure meta
    meta = dsl.setdefault("meta", {})
    meta.setdefault("title", "Untitled Reel")
    meta.setdefault("mood", "neutral")

    # Determine if global bg is dark for contrast checks
    bg_color = canvas.get("background", "#0F0E17")
    bg_is_dark = _is_dark_color(bg_color)

    scenes = dsl.get("scenes", [])
    layer_ids_seen = set()

    for si, scene in enumerate(scenes):
        if not isinstance(scene, dict):
            continue

        # Fix missing scene ID
        if not scene.get("id"):
            scene["id"] = f"scene-{si}"
            fixes += 1

        # Fix missing duration
        if not isinstance(scene.get("duration_ms"), (int, float)):
            scene["duration_ms"] = 5000
            fixes += 1

        # Fix transition
        transition = scene.get("transition", {})
        if isinstance(transition, dict):
            if transition.get("type") not in VALID_TRANSITIONS:
                transition["type"] = "fade"
                fixes += 1
            transition.setdefault("duration_ms", 400)
        else:
            scene["transition"] = {"type": "fade", "duration_ms": 400}
            fixes += 1

        # Determine scene background for contrast
        scene_bg = bg_color
        for layer in scene.get("layers", []):
            if isinstance(layer, dict) and layer.get("type") == "background":
                props = layer.get("props", {})
                gradient = props.get("gradient", [])
                if gradient and isinstance(gradient, list):
                    scene_bg = gradient[0]
                break
        scene_bg_dark = _is_dark_color(scene_bg)

        for li, layer in enumerate(scene.get("layers", [])):
            if not isinstance(layer, dict):
                continue

            # Normalize type aliases
            layer_type = layer.get("type", "")
            if layer_type in LAYER_TYPE_ALIASES:
                layer["type"] = LAYER_TYPE_ALIASES[layer_type]
                fixes += 1

            # Ensure unique IDs
            lid = layer.get("id")
            if not lid or lid in layer_ids_seen:
                lid = f"s{si}-l{li}"
                layer["id"] = lid
                fixes += 1
            layer_ids_seen.add(lid)

            # Ensure props exist
            layer.setdefault("props", {})

            # Fix text contrast
            if layer["type"] in ("text", "counter", "speech_bubble"):
                props = layer.get("props", {})
                text_color = props.get("color", "")
                if text_color and scene_bg:
                    ratio = _contrast_ratio(text_color, scene_bg)
                    if ratio < 4.5:
                        # Fix: use opposite color
                        props["color"] = _LIGHT_TEXT if scene_bg_dark else _DARK_TEXT
                        fixes += 1
                elif not text_color:
                    # Default based on bg
                    props["color"] = _LIGHT_TEXT if scene_bg_dark else _DARK_TEXT

        # Fix timeline easing
        for entry in scene.get("timeline", []):
            if isinstance(entry, dict):
                if entry.get("easing") not in VALID_EASINGS:
                    entry["easing"] = "ease-out"

    # Calculate total duration
    total_ms = sum(
        s.get("duration_ms", 0) for s in scenes if isinstance(s, dict)
    )
    meta["total_duration_ms"] = total_ms

    if fixes > 0:
        logger.info(f"Auto-fixed {fixes} issues in Video DSL")

    return dsl
