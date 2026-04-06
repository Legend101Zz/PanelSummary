"""
scene_composer.py — Visual Scene Direction for Each Panel
==========================================================
Takes planned panels + manga bible + narrative arc and generates
detailed visual scene descriptions for each panel.

This is the "director's notes" stage — it sits between the planner
(what story to tell) and the DSL generator (how to render it).

WHY THIS EXISTS:
Without this, the DSL generator has to make both creative AND
technical decisions simultaneously. By separating the visual
direction from the DSL encoding, we get:
1. Better visual consistency (scenes reference the same library)
2. More detail per panel (focused LLM call)
3. Illustration layer usage (scenes map to SceneLibrary components)

IMPORTANT: This is a lightweight, rule-based enrichment — NOT
another LLM call. It uses the scene suggestions from narrative_arc
and the manga bible's world/character data to compose directions.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# Maps visual_mood values to illustration style + scene combos
MOOD_TO_ILLUSTRATION = {
    "dramatic-dark": {"style": "manga-ink", "default_scene": "void"},
    "tense": {"style": "manga-ink", "default_scene": "battlefield"},
    "intense-red": {"style": "neon", "default_scene": "battlefield"},
    "cool-mystery": {"style": "blueprint", "default_scene": "void"},
    "warm-amber": {"style": "watercolor", "default_scene": "workshop"},
    "reflective": {"style": "watercolor", "default_scene": "summit"},
    "playful": {"style": "watercolor", "default_scene": "classroom"},
    "triumphant": {"style": "neon", "default_scene": "summit"},
    "somber": {"style": "manga-ink", "default_scene": "void"},
    "revelatory": {"style": "neon", "default_scene": "digital-realm"},
    "light": {"style": "watercolor", "default_scene": "classroom"},
}

# Maps panel content_type to scene element suggestions
CONTENT_TYPE_ELEMENTS = {
    "data": [
        {"type": "chart", "x": "70%", "y": "30%", "size": 40},
        {"type": "node", "x": "20%", "y": "20%", "size": 20},
    ],
    "concept": [
        {"type": "node", "x": "50%", "y": "40%", "size": 32},
        {"type": "spark", "x": "50%", "y": "35%", "size": 24},
    ],
    "splash": [
        {"type": "spark", "x": "50%", "y": "50%", "size": 48},
    ],
}


def compose_scene_directions(
    panels: list[dict],
    manga_bible: dict,
    narrative_arc_dict: Optional[dict] = None,
) -> list[dict]:
    """Enrich panel assignments with visual scene directions.

    For each panel, adds:
    - illustration_scene: which SceneLibrary component to use
    - illustration_style: manga-ink, blueprint, watercolor, neon
    - illustration_elements: placed items in the scene
    - illustration_colors: primary + accent color from the world
    - character_poses: suggested poses based on expression/beat

    Parameters
    ----------
    panels : list[dict]
        Panel assignment dicts from the planner.
    manga_bible : dict
        The manga bible with world + character data.
    narrative_arc_dict : dict, optional
        Serialized NarrativeArc for beat matching.

    Returns
    -------
    list[dict]
        The same panels, enriched with scene composition data.
    """
    # Extract world colors from manga bible
    world = manga_bible.get("world", manga_bible.get("world_description", {}))
    if isinstance(world, str):
        # Old-format bible has world_description as a string
        world = {"visual_style": world}

    visual_style = world.get("visual_style", "") if isinstance(world, dict) else ""

    # Try to extract colors from the visual style description
    primary_color = _extract_color(visual_style, "primary") or "#1A1825"
    accent_color = _extract_color(visual_style, "accent") or "#E8191A"

    # Build character signature lookup
    char_signatures = {}
    for char in manga_bible.get("characters", []):
        char_signatures[char.get("name", "")] = {
            "color": char.get("signature_color", ""),
            "aura": char.get("aura", "none"),
            "pose": char.get("default_pose", "standing"),
        }

    # Build beat lookup from narrative arc
    beat_lookup = {}
    if narrative_arc_dict:
        for act_beats in narrative_arc_dict.get("acts", {}).values():
            for beat in act_beats:
                ch = beat.get("source_chapter", -1)
                if ch not in beat_lookup:
                    beat_lookup[ch] = beat

    # Enrich each panel
    enriched = []
    for panel in panels:
        enriched_panel = {**panel}

        # Get mood-based illustration defaults
        mood = panel.get("visual_mood", "")
        mood_config = MOOD_TO_ILLUSTRATION.get(mood, {})

        # Scene: prefer panel's scene_description hint, then beat suggestion, then mood default
        scene = _infer_scene_from_description(
            panel.get("scene_description", ""),
            panel.get("creative_direction", ""),
        )
        if not scene and panel.get("chapter_index") is not None:
            beat = beat_lookup.get(panel["chapter_index"], {})
            scene = beat.get("suggested_scene", "")
        if not scene:
            scene = mood_config.get("default_scene", "laboratory")

        # Style
        style = mood_config.get("style", "manga-ink")

        # Elements based on content type
        elements = CONTENT_TYPE_ELEMENTS.get(
            panel.get("content_type", ""), []
        )

        # Character pose enrichment
        char_name = panel.get("character", "")
        sig = char_signatures.get(char_name, {})
        if sig:
            enriched_panel["suggested_pose"] = sig.get("pose", "standing")
            enriched_panel["suggested_aura"] = sig.get("aura", "none")
            if sig.get("color"):
                accent_color_panel = sig["color"]
            else:
                accent_color_panel = accent_color
        else:
            accent_color_panel = accent_color

        # Pack it all in
        enriched_panel["illustration"] = {
            "scene": scene,
            "style": style,
            "primaryColor": primary_color,
            "accentColor": accent_color_panel,
            "elements": elements,
            "description": panel.get("scene_description", "")[:100],
        }

        enriched.append(enriched_panel)

    logger.info(f"Scene composition: enriched {len(enriched)} panels with illustration data")
    return enriched


# Scene keywords that map to SceneLibrary component names
_SCENE_KEYWORDS = {
    "laboratory": ["lab", "research", "experiment", "monitor", "screen"],
    "digital-realm": ["code", "digital", "data", "cyber", "virtual", "matrix"],
    "battlefield": ["battle", "fight", "arena", "versus", "clash", "impact"],
    "workshop": ["build", "forge", "craft", "create", "workshop", "tool"],
    "summit": ["mountain", "peak", "summit", "above", "sky", "achievement"],
    "void": ["dark", "empty", "void", "alone", "isolation", "space"],
    "classroom": ["whiteboard", "class", "teach", "learn", "desk", "lecture"],
}


def _infer_scene_from_description(
    scene_description: str,
    creative_direction: str,
) -> str:
    """Infer a SceneLibrary scene from panel description text."""
    text = f"{scene_description} {creative_direction}".lower()
    if not text.strip():
        return ""

    for scene, keywords in _SCENE_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            return scene

    return ""


def _extract_color(text: str, which: str) -> str:
    """Try to extract a hex color from visual style text.

    Looks for patterns like '#E8191A', '#fff', 'primary: #123456'.
    """
    import re
    if not text:
        return ""

    # Look for hex colors
    hex_pattern = r'#[0-9a-fA-F]{3,6}'
    matches = re.findall(hex_pattern, text)

    if not matches:
        return ""

    # If looking for "primary", return first match; "accent" = second
    if which == "accent" and len(matches) > 1:
        return matches[1]
    return matches[0] if matches else ""
