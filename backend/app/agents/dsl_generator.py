"""
dsl_generator.py — Living Panel DSL Generator Agent
=====================================================
Takes a PanelAssignment from the Planner and generates
a Living Panel DSL v2.0. Runs independently — multiple
instances can execute in parallel via asyncio.gather().

Each agent is a specialist: it knows the DSL spec and
focuses on making ONE panel as visually interesting as
possible within the constraints.
"""

import json
import logging
from typing import Optional

from app.llm_client import LLMClient
from app.generate_living_panels import (
    fix_common_dsl_issues,
    validate_living_panel_dsl,
    generate_fallback_living_panel,
)
from app.agents.planner import PanelAssignment

logger = logging.getLogger(__name__)


DSL_AGENT_SYSTEM_PROMPT = """You are a Living Manga Panel DSL Agent. You create a single animated
manga panel using the Living Panel DSL v2.0.

You receive:
- A panel assignment with content type, text, creative direction
- Character and world context from the manga bible
- The DSL specification

You output: A single valid Living Panel DSL v2.0 JSON.

## DSL v2.0 QUICK REFERENCE

Root: {{ "version": "2.0", "canvas": {{...}}, "acts": [...], "meta": {{...}} }}

Canvas: {{ "width": 800, "height": 600, "background": "#F2E8D5", "mood": "light"|"dark" }}

Act: {{
  "id": "act-name",
  "duration_ms": 3000-8000,
  "transition_in": {{ "type": "fade"|"cut"|"slide_left"|"iris", "duration_ms": 400 }},
  "layout": {{ "type": "full"|"cuts"|"split-h"|"split-v" }},
  "layers": [...],
  "cells": [...],
  "timeline": [...]
}}

Layer types:
- "background" — gradient[], pattern ("halftone"|"crosshatch"|"screentone"), patternOpacity
- "sprite" — character name, expression, size, silhouette, facing
- "text" — content, fontSize (use clamp()), fontFamily, typewriter, typewriterSpeed
- "speech_bubble" — text, character, style (speech|thought|shout|whisper|narrator), tailDirection
- "effect" — effect type (speed_lines|screentone|vignette|sfx|impact_burst|particles|ink_splash)
- "data_block" — items array [{{label, value}}], accentColor, animateIn: "stagger"
- "shape" — circle/rect/line with fill/stroke

Timeline: [{{ at: ms, target: "layerId", animate: {{ opacity: [0,1] }}, duration: ms, easing: "ease-out" }}]

Positioning: Use percentages — x: "15%", y: "30%"
- Sprites: y: 55-75% (lower half)
- Speech bubbles: y: 5-35% (upper half, NEVER overlap sprites)
- Text/narration: y: 20-40%

Cut layouts:
"layout": {{ "type": "cuts", "cuts": [{{ "direction": "h"|"v", "position": 0.0-1.0, "angle": -3 to 3 }}], "gap": 4, "stagger_ms": 200 }}
Cells map to resulting regions by index.

Colors (manga ink-on-paper):
- Paper: #F2E8D5 (cream), #EDE0CC (warm)
- Ink: #1A1825 (black)
- Accent: #E8191A (red), #F5A623 (amber)
- Muted: #1A182570, #A8A6C080

## YOUR CREATIVE MANDATE

You have FULL creative freedom within the DSL. Make each panel UNIQUE.
Don't just put text on a background — think about:
- Pacing: fast slam-in vs slow reveal
- Effects: speed lines for action, vignette for mystery, particles for magic
- Typography: display font for titles, body for narration, bubble for dialogue
- Layout: use cuts for multi-moment panels, full for impact
- Timing: stagger elements for dramatic effect
- Atmosphere: screentone patterns, crosshatch for depth

## RULES
- Return ONLY valid JSON. No markdown. No explanation.
- version MUST be "2.0"
- Every act MUST have a background layer
- Canvas is 800x600
- 1-3 acts per panel
- Total duration: 3-8 seconds per act
- NEVER generate image URLs — everything is code-rendered
"""


def _build_panel_context(
    assignment: PanelAssignment,
    manga_bible: Optional[dict] = None,
    chapter_summary: Optional[dict] = None,
    neighbor_context: str = "",
) -> str:
    """Build context for the DSL generator agent."""
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
        parts.append(f"\n=== CREATIVE DIRECTION ===")
        parts.append(assignment.creative_direction)

    if manga_bible:
        parts.append("\n=== WORLD ===")
        parts.append(manga_bible.get("world_description", "")[:200])
        for ch in manga_bible.get("characters", [])[:3]:
            parts.append(f"  {ch['name']} ({ch['role']}): {ch.get('speech_style', '')}")

    if chapter_summary:
        parts.append(f"\n=== CHAPTER: {chapter_summary.get('chapter_title', '')} ===")
        parts.append(f"Theme: {chapter_summary.get('one_liner', '')}")

    # Adjacent panel context for pacing awareness
    if neighbor_context:
        parts.append(neighbor_context)

    parts.append("\nGenerate the Living Panel DSL v2.0 JSON now.")
    return "\n".join(parts)


async def generate_panel_dsl(
    assignment: PanelAssignment,
    llm_client: LLMClient,
    manga_bible: Optional[dict] = None,
    chapter_summary: Optional[dict] = None,
    neighbor_context: str = "",
) -> dict:
    """Generate a Living Panel DSL v2.0 for a single panel assignment."""
    user_message = _build_panel_context(
        assignment, manga_bible, chapter_summary, neighbor_context
    )

    try:
        result = await llm_client.chat_with_retry(
            system_prompt=DSL_AGENT_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=3000,
            temperature=0.85,
            json_mode=True,
        )

        parsed = result.get("parsed") or {}
        if isinstance(parsed, str):
            parsed = json.loads(parsed)

        # Fix and validate
        parsed = fix_common_dsl_issues(parsed)
        is_valid, errors = validate_living_panel_dsl(parsed)

        if not is_valid:
            logger.warning(f"DSL validation issues for {assignment.panel_id}: {errors}")

        # Inject metadata
        parsed.setdefault("meta", {})
        parsed["meta"]["panel_id"] = assignment.panel_id
        parsed["meta"]["chapter_index"] = assignment.chapter_index
        parsed["meta"]["page_index"] = assignment.page_index
        parsed["meta"]["content_type"] = assignment.content_type
        parsed["meta"]["narrative_beat"] = assignment.narrative_beat

        tokens_used = {
            "input": result.get("input_tokens", 0),
            "output": result.get("output_tokens", 0),
        }

        return {"dsl": parsed, "tokens": tokens_used, "success": True}

    except Exception as e:
        logger.error(f"DSL generation failed for {assignment.panel_id}: {e}")
        # Fall back to programmatic DSL
        fallback = generate_fallback_living_panel({
            "content_type": assignment.content_type,
            "text": assignment.text_content,
            "dialogue": assignment.dialogue,
            "character": assignment.character,
            "expression": assignment.expression,
            "visual_mood": assignment.visual_mood,
            "position": "main",
        })
        fallback.setdefault("meta", {})
        fallback["meta"]["panel_id"] = assignment.panel_id
        fallback["meta"]["chapter_index"] = assignment.chapter_index
        fallback["meta"]["fallback"] = True

        return {"dsl": fallback, "tokens": {"input": 0, "output": 0}, "success": False}
