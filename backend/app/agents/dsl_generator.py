"""
dsl_generator.py — Living Panel DSL Generator Agent
=====================================================
Generates Living Panel DSL v2.0 — either per-page (preferred)
or per-panel (fallback).

Per-page generation is the PRIMARY path: the LLM sees all panels
on a page simultaneously and can compose them as a visual unit.
Per-panel is the fallback for single-panel regeneration.

Design principles:
  - Single prompt source (living_panel_prompts.py)
  - Conditionalized context (only send bible when relevant)
  - Content-aware temperature (splash=hot, data=cool)
  - Robust parsing with per-panel fallback
"""

import json
import logging
from typing import Optional

from app.llm_client import LLMClient
from app.living_panel_prompts import (
    get_living_panel_prompt,
    format_full_page_for_living,
)
from app.generate_living_panels import (
    fix_common_dsl_issues,
    validate_living_panel_dsl,
    generate_fallback_living_panel,
)
from app.agents.planner import PanelAssignment
from app.models import SummaryStyle

logger = logging.getLogger(__name__)


# ============================================================
# 2C: POST-GENERATION DSL ENFORCEMENT
# ============================================================

def _enforce_content_requirements(
    dsl: dict,
    assignment: PanelAssignment,
) -> dict:
    """Ensure the DSL actually contains elements appropriate for its content type.

    The LLM sometimes generates a dialogue panel with no sprites or speech bubbles,
    or a splash panel with no effects. This safety net injects missing elements.
    """
    if not dsl.get("acts"):
        return dsl

    content_type = assignment.content_type
    first_act = dsl["acts"][0]

    # Collect all layer types across the first act (including cells)
    all_layers = list(first_act.get("layers", []))
    for cell in first_act.get("cells", []):
        all_layers.extend(cell.get("layers", []))
    layer_types = {l.get("type") for l in all_layers}

    # ── Dialogue panels MUST have sprites + speech bubbles ──
    if content_type == "dialogue":
        if "sprite" not in layer_types and assignment.dialogue:
            logger.info(f"{assignment.panel_id}: Injecting missing sprites for dialogue")
            _inject_dialogue_sprites(first_act, assignment)
        if "speech_bubble" not in layer_types and assignment.dialogue:
            logger.info(f"{assignment.panel_id}: Injecting missing speech bubbles")
            _inject_dialogue_bubbles(first_act, assignment)

    # ── Splash panels SHOULD have at least one effect ──
    if content_type == "splash":
        effect_types = {
            l.get("props", {}).get("effect")
            for l in all_layers if l.get("type") == "effect"
        }
        if not effect_types:
            logger.info(f"{assignment.panel_id}: Injecting speed_lines for splash")
            _inject_splash_effect(first_act)

    # ── Data panels SHOULD have a data_block ──
    if content_type == "data" and "data_block" not in layer_types:
        concepts = [c.strip() for c in assignment.text_content.split("|") if c.strip()]
        if concepts:
            logger.info(f"{assignment.panel_id}: Injecting data_block for data panel")
            _inject_data_block(first_act, concepts)

    # ── Enforce layout hint: if planner said "cuts", at least one act should have cuts ──
    if assignment.layout_hint == "cuts":
        has_cuts = any(
            act.get("layout", {}).get("type") == "cuts"
            for act in dsl.get("acts", [])
        )
        if not has_cuts and content_type in ("dialogue", "montage", "action"):
            logger.info(f"{assignment.panel_id}: Upgrading layout to cuts per planner hint")
            _upgrade_to_cuts_layout(first_act, assignment)

    # ── CRITICAL: Every panel MUST have readable text content ──
    # The LLM spends tokens on illustration layers but forgets text.
    # If there's no text/speech_bubble/data_block, inject one.
    all_layers_final = list(first_act.get("layers", []))
    for cell in first_act.get("cells", []):
        all_layers_final.extend(cell.get("layers", []))
    text_types = {"text", "speech_bubble", "data_block"}
    has_readable = any(l.get("type") in text_types for l in all_layers_final)

    if not has_readable:
        text = assignment.text_content or assignment.narrative_beat or ""
        if content_type == "splash" and text:
            logger.info(f"{assignment.panel_id}: Injecting title text for splash")
            _inject_title_text(first_act, text)
        elif content_type == "narration" and text:
            logger.info(f"{assignment.panel_id}: Injecting narration text")
            _inject_narration_text(first_act, text, assignment)
        elif text:
            logger.info(f"{assignment.panel_id}: Injecting fallback caption")
            _inject_narration_text(first_act, text, assignment)

    return dsl


def _inject_dialogue_sprites(
    act: dict, assignment: PanelAssignment,
) -> None:
    """Add character sprites for dialogue participants."""
    layers = act.setdefault("layers", [])
    timeline = act.setdefault("timeline", [])
    characters = []
    for d in assignment.dialogue:
        name = d.get("character", "?") if isinstance(d, dict) else "?"
        if name not in characters:
            characters.append(name)

    positions = [("25%", "65%", "right"), ("70%", "62%", "left")]
    for i, char in enumerate(characters[:2]):
        x, y, facing = positions[i % 2]
        layer_id = f"sprite-{i}"
        layers.append({
            "id": layer_id, "type": "sprite",
            "x": x, "y": y, "opacity": 0,
            "props": {
                "character": char,
                "expression": assignment.expression or "neutral",
                "size": 56, "facing": facing,
            },
        })
        timeline.append({
            "at": 200 + i * 200, "target": layer_id,
            "animate": {"opacity": [0, 1]}, "duration": 400,
            "easing": "ease-out",
        })


def _inject_dialogue_bubbles(
    act: dict, assignment: PanelAssignment,
) -> None:
    """Add speech bubbles for dialogue lines."""
    layers = act.setdefault("layers", [])
    timeline = act.setdefault("timeline", [])
    y_positions = ["8%", "18%", "28%"]
    for i, d in enumerate(assignment.dialogue[:3]):
        if isinstance(d, str):
            d = {"text": d, "character": "?"}
        layer_id = f"bubble-{i}"
        layers.append({
            "id": layer_id, "type": "speech_bubble",
            "x": "10%" if i % 2 == 0 else "50%",
            "y": y_positions[i % 3],
            "opacity": 0,
            "props": {
                "text": d.get("text", ""),
                "character": d.get("character", "?"),
                "style": "speech",
                "tailDirection": "bottom" if i % 2 == 0 else "left",
                "typewriter": True, "typewriterSpeed": 30,
            },
        })
        timeline.append({
            "at": 800 + i * 600, "target": layer_id,
            "animate": {"opacity": [0, 1], "typewriter": True},
            "duration": 1200, "easing": "ease-out",
        })


def _inject_splash_effect(act: dict) -> None:
    """Add speed_lines effect to a splash panel."""
    layers = act.setdefault("layers", [])
    timeline = act.setdefault("timeline", [])
    layers.append({
        "id": "speed-inject", "type": "effect", "opacity": 0,
        "props": {
            "effect": "speed_lines", "color": "#F0EEE8",
            "intensity": 0.5, "direction": "radial",
        },
    })
    timeline.insert(0, {
        "at": 100, "target": "speed-inject",
        "animate": {"opacity": [0, 0.7]}, "duration": 300,
        "easing": "ease-out",
    })


def _inject_data_block(act: dict, concepts: list[str]) -> None:
    """Add a data_block layer for concept items."""
    layers = act.setdefault("layers", [])
    timeline = act.setdefault("timeline", [])
    items = [{"label": c} for c in concepts[:6]]
    layers.append({
        "id": "data-inject", "type": "data_block",
        "x": "10%", "y": "25%", "opacity": 0,
        "props": {
            "items": items, "accentColor": "#E8191A",
            "showIndex": True, "animateIn": "stagger",
            "staggerDelay": 200,
        },
    })
    timeline.append({
        "at": 600, "target": "data-inject",
        "animate": {"opacity": [0, 1]}, "duration": 400,
        "easing": "ease-out",
    })


def _inject_title_text(act: dict, title: str) -> None:
    """Add a big title text layer for splash panels.

    Splash panels often have elaborate illustration layers but forget
    the actual title text that the reader sees.
    """
    layers = act.setdefault("layers", [])
    timeline = act.setdefault("timeline", [])
    layers.append({
        "id": "title-inject", "type": "text",
        "x": "50%", "y": "50%", "opacity": 0,
        "props": {
            "content": title[:80],
            "fontSize": 28,
            "fontWeight": "bold",
            "color": "#F0EEE8",
            "textAlign": "center",
            "maxWidth": "80%",
            "textShadow": "0 2px 8px rgba(0,0,0,0.8)",
        },
    })
    timeline.append({
        "at": 400, "target": "title-inject",
        "animate": {"opacity": [0, 1], "y": ["55%", "50%"]},
        "duration": 600, "easing": "ease-out",
    })


def _inject_narration_text(
    act: dict, text: str, assignment: PanelAssignment,
) -> None:
    """Add a narration caption for panels with no readable content.

    The LLM generates 500 tokens of illustration descriptions but zero
    text layers — so the panel looks pretty but says nothing.
    """
    layers = act.setdefault("layers", [])
    timeline = act.setdefault("timeline", [])

    # If we have a character, add a small character tag
    if assignment.character:
        layers.append({
            "id": "char-tag-inject", "type": "text",
            "x": "8%", "y": "8%", "opacity": 0,
            "props": {
                "content": assignment.character,
                "fontSize": 10,
                "fontWeight": "bold",
                "color": "#F5A623",
                "letterSpacing": "0.1em",
            },
        })
        timeline.append({
            "at": 200, "target": "char-tag-inject",
            "animate": {"opacity": [0, 0.6]},
            "duration": 300, "easing": "ease-out",
        })

    # Main narration caption
    layers.append({
        "id": "narration-inject", "type": "text",
        "x": "50%", "y": "50%", "opacity": 0,
        "props": {
            "content": text[:120],
            "fontSize": 16,
            "color": "#F0EEE8",
            "textAlign": "center",
            "maxWidth": "75%",
            "fontStyle": "italic",
            "lineHeight": 1.6,
        },
    })
    timeline.append({
        "at": 500, "target": "narration-inject",
        "animate": {"opacity": [0, 1]},
        "duration": 500, "easing": "ease-out",
    })


def _upgrade_to_cuts_layout(
    act: dict, assignment: PanelAssignment,
) -> None:
    """Upgrade a full/split layout to cuts with 2 cells.

    Moves existing non-background layers into cells.
    """
    old_layers = act.get("layers", [])
    old_timeline = act.get("timeline", [])

    # Separate background from content layers
    bg_layers = [l for l in old_layers if l.get("type") == "background"]
    content_layers = [l for l in old_layers if l.get("type") != "background"]

    if len(content_layers) < 2:
        return  # Not enough layers to meaningfully split

    # Split content layers into two cells
    mid = len(content_layers) // 2
    cell0_layers = content_layers[:mid]
    cell1_layers = content_layers[mid:]

    # Build timeline for each cell
    cell0_ids = {l["id"] for l in cell0_layers}
    cell1_ids = {l["id"] for l in cell1_layers}
    cell0_tl = [t for t in old_timeline if t.get("target") in cell0_ids]
    cell1_tl = [t for t in old_timeline if t.get("target") in cell1_ids]

    act["layout"] = {
        "type": "cuts",
        "cuts": [{"direction": "v", "position": 0.55, "angle": 1.5}],
        "gap": 5,
        "stagger_ms": 150,
    }
    act["layers"] = bg_layers
    act["timeline"] = [t for t in old_timeline if t.get("target") not in cell0_ids | cell1_ids]
    act["cells"] = [
        {"id": "left", "position": "0", "layers": cell0_layers, "timeline": cell0_tl},
        {"id": "right", "position": "1", "layers": cell1_layers, "timeline": cell1_tl},
    ]

# Content type → temperature mapping.
# Creative panels run hotter, structured panels run cooler.
TEMPERATURE_MAP = {
    "splash": 0.9,
    "concept": 0.9,
    "montage": 0.85,
    "dialogue": 0.75,
    "narration": 0.7,
    "data": 0.6,
    "transition": 0.65,
}
DEFAULT_TEMPERATURE = 0.8


def _page_temperature(panels: list[PanelAssignment]) -> float:
    """Pick temperature based on the most creative panel type on the page."""
    temps = [TEMPERATURE_MAP.get(p.content_type, DEFAULT_TEMPERATURE) for p in panels]
    return max(temps)  # hottest panel type sets the page temp


def _build_single_panel_context(
    assignment: PanelAssignment,
    manga_bible: Optional[dict] = None,
    chapter_summary: Optional[dict] = None,
) -> str:
    """Build context for a SINGLE panel generation (fallback path)."""
    parts = [
        f"=== PANEL ASSIGNMENT ===",
        f"Panel ID: {assignment.panel_id}",
        f"Type: {assignment.content_type}",
        f"Mood: {assignment.visual_mood}",
        f"Layout hint: {assignment.layout_hint}",
        f"Narrative beat: {assignment.narrative_beat}",
    ]

    if assignment.text_content:
        parts.append(f"Text: {assignment.text_content}")

    if assignment.dialogue:
        parts.append("Dialogue:")
        for d in assignment.dialogue:
            if isinstance(d, str):
                d = {"text": d, "character": "?"}
            parts.append(f"  {d.get('character', '?')}: \"{d.get('text', '')}\"")

    if assignment.character:
        parts.append(f"Character: {assignment.character} ({assignment.expression})")

    if assignment.creative_direction:
        parts.append(f"Creative direction: {assignment.creative_direction}")

    if assignment.scene_description:
        parts.append(f"Scene: {assignment.scene_description}")

    # Bible context: only inject characters when this panel features one
    if manga_bible:
        world = manga_bible.get("world_description", "")
        if world:
            parts.append(f"\nWorld: {world[:150]}")

        if assignment.character:
            for ch in manga_bible.get("characters", []):
                if ch["name"] == assignment.character:
                    parts.append(
                        f"Character style: {ch.get('speech_style', '')} "
                        f"/ {ch.get('visual_description', '')[:100]}"
                    )
                    break

    if chapter_summary:
        parts.append(f"\nChapter: {chapter_summary.get('chapter_title', '')}")
        parts.append(f"Theme: {chapter_summary.get('one_liner', '')}")

    parts.append("\nGenerate the Living Panel DSL v2.0 JSON now.")
    return "\n".join(parts)


def _inject_panel_meta(
    dsl: dict, assignment: PanelAssignment,
) -> dict:
    """Inject metadata into a generated DSL dict."""
    dsl.setdefault("meta", {})
    dsl["meta"]["panel_id"] = assignment.panel_id
    dsl["meta"]["chapter_index"] = assignment.chapter_index
    dsl["meta"]["page_index"] = assignment.page_index
    dsl["meta"]["content_type"] = assignment.content_type
    dsl["meta"]["narrative_beat"] = assignment.narrative_beat
    return dsl


def _make_fallback(assignment: PanelAssignment) -> dict:
    """Create a fallback DSL for a panel that failed LLM generation."""
    fb = generate_fallback_living_panel({
        "content_type": assignment.content_type,
        "text": assignment.text_content,
        "dialogue": assignment.dialogue,
        "character": assignment.character,
        "expression": assignment.expression,
        "visual_mood": assignment.visual_mood,
        "layout_hint": assignment.layout_hint,
        "position": "main",
    })
    _inject_panel_meta(fb, assignment)
    fb["meta"]["fallback"] = True
    return fb


# ============================================================
# PER-PAGE GENERATION (primary path)
# ============================================================

async def generate_page_dsls(
    page_panels: list[PanelAssignment],
    llm_client: LLMClient,
    style: SummaryStyle,
    manga_bible: Optional[dict] = None,
    chapter_summary: Optional[dict] = None,
    prev_chapter_ending: Optional[str] = None,
) -> list[dict]:
    """
    Generate DSLs for ALL panels on a single page in one LLM call.

    This is the primary generation path. The LLM sees all panels
    simultaneously and can compose them as a visual unit.

    Returns a list of {dsl, tokens, success} dicts, one per panel.
    """
    if not page_panels:
        return []

    system_prompt = get_living_panel_prompt(style)

    # Convert PanelAssignments to the dict format expected by format_full_page_for_living
    page_data = {
        "layout": page_panels[0].layout_hint or "full",
        "panels": [
            {
                "content_type": p.content_type,
                "visual_mood": p.visual_mood,
                "narrative_beat": p.narrative_beat,
                "text": p.text_content or p.text_content,
                "text_content": p.text_content,
                "dialogue": p.dialogue,
                "character": p.character,
                "expression": p.expression,
                "creative_direction": p.creative_direction,
                "scene_description": p.scene_description,
            }
            for p in page_panels
        ],
    }

    user_message = format_full_page_for_living(
        page_data, manga_bible, chapter_summary,
    )

    # Add previous chapter context for continuity (issue 2.6)
    if prev_chapter_ending:
        user_message = (
            f"Previous chapter ended with: {prev_chapter_ending}\n\n"
            + user_message
        )

    temperature = _page_temperature(page_panels)

    try:
        result = await llm_client.chat_with_retry(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=4000 * len(page_panels),  # scale with panel count
            temperature=temperature,
            json_mode=True,
        )

        parsed = result.get("parsed") or {}
        if isinstance(parsed, str):
            try:
                parsed = json.loads(parsed)
            except (json.JSONDecodeError, ValueError):
                parsed = {}

        tokens_used = {
            "input": result.get("input_tokens", 0),
            "output": result.get("output_tokens", 0),
        }

        # Extract panels array
        raw_panels = []
        if isinstance(parsed, dict):
            raw_panels = parsed.get("panels", [])
        elif isinstance(parsed, list):
            raw_panels = parsed

        # Process each panel individually (robust against partial failures)
        results = []
        for i, assignment in enumerate(page_panels):
            if i < len(raw_panels) and isinstance(raw_panels[i], dict):
                dsl = fix_common_dsl_issues(raw_panels[i])
                is_valid, errors = validate_living_panel_dsl(dsl)
                if not is_valid:
                    logger.warning(
                        f"DSL issues for {assignment.panel_id}: {errors[:3]}"
                    )
                _inject_panel_meta(dsl, assignment)
                # 2C: Enforce content type requirements
                dsl = _enforce_content_requirements(dsl, assignment)
                per_panel_tokens = {
                    "input": tokens_used["input"] // len(page_panels),
                    "output": tokens_used["output"] // len(page_panels),
                }
                results.append({
                    "dsl": dsl, "tokens": per_panel_tokens, "success": True,
                })
            else:
                # LLM didn't return enough panels — fallback for this one
                logger.warning(
                    f"Page gen missing panel {i} ({assignment.panel_id}), "
                    f"using fallback"
                )
                results.append({
                    "dsl": _make_fallback(assignment),
                    "tokens": {"input": 0, "output": 0},
                    "success": False,
                })

        return results

    except Exception as e:
        logger.error(f"Page DSL generation failed: {e}")
        return [
            {
                "dsl": _make_fallback(p),
                "tokens": {"input": 0, "output": 0},
                "success": False,
            }
            for p in page_panels
        ]


# ============================================================
# PER-PANEL GENERATION (fallback / single-panel regeneration)
# ============================================================

async def generate_panel_dsl(
    assignment: PanelAssignment,
    llm_client: LLMClient,
    style: SummaryStyle = SummaryStyle.MANGA,
    manga_bible: Optional[dict] = None,
    chapter_summary: Optional[dict] = None,
) -> dict:
    """Generate a Living Panel DSL v2.0 for a single panel.

    This is the FALLBACK path for single-panel regeneration.
    For full book generation, use generate_page_dsls() instead.
    """
    system_prompt = get_living_panel_prompt(style)
    user_message = _build_single_panel_context(
        assignment, manga_bible, chapter_summary,
    )
    temperature = TEMPERATURE_MAP.get(
        assignment.content_type, DEFAULT_TEMPERATURE
    )

    try:
        result = await llm_client.chat_with_retry(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=3000,
            temperature=temperature,
            json_mode=True,
        )

        parsed = result.get("parsed") or {}
        if isinstance(parsed, str):
            parsed = json.loads(parsed)

        # If LLM returned {panels: [...]}, unwrap
        if isinstance(parsed, dict) and "panels" in parsed:
            panels_list = parsed["panels"]
            parsed = panels_list[0] if panels_list else {}
        if isinstance(parsed, list):
            parsed = parsed[0] if parsed else {}
        if not isinstance(parsed, dict):
            parsed = {}

        parsed = fix_common_dsl_issues(parsed)
        is_valid, errors = validate_living_panel_dsl(parsed)
        if not is_valid:
            logger.warning(
                f"DSL validation issues for {assignment.panel_id}: {errors}"
            )

        _inject_panel_meta(parsed, assignment)
        # 2C: Enforce content type requirements
        parsed = _enforce_content_requirements(parsed, assignment)

        tokens_used = {
            "input": result.get("input_tokens", 0),
            "output": result.get("output_tokens", 0),
        }

        return {"dsl": parsed, "tokens": tokens_used, "success": True}

    except Exception as e:
        logger.error(f"DSL generation failed for {assignment.panel_id}: {e}")
        return {
            "dsl": _make_fallback(assignment),
            "tokens": {"input": 0, "output": 0},
            "success": False,
        }
