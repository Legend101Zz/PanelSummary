"""
v4_dsl_generator.py — V4 Semantic DSL Generator
=================================================
Generates V4 DSL pages from PanelAssignments.

V4 philosophy: LLM generates INTENT, engine renders VISUALS.
Each panel is ~150 tokens instead of ~1000 in V2.

The LLM only specifies:
  - Panel type (splash/dialogue/narration/data/etc.)
  - Scene (laboratory/battlefield/digital-realm/etc.)
  - Characters, dialogue, narration text
  - Mood and emphasis

The engine handles: layout, positioning, animations, effects.
"""

import json
import logging
from typing import Optional

from app.llm_client import LLMClient
from app.agents.planner import PanelAssignment
from app.models import SummaryStyle
from app.v4_types import (
    V4Page, V4Panel, V4DialogueLine, V4DataItem,
    validate_v4_page, validate_v4_panel,
    PANEL_TYPES,
)

logger = logging.getLogger(__name__)


# ============================================================
# PROMPT
# ============================================================

V4_SYSTEM_PROMPT = """You are a manga panel composer. Given panel assignments for a manga page,
generate a V4 DSL JSON object describing each panel's SEMANTIC INTENT.

DO NOT specify pixel positions, animations, or rendering details.
Just describe WHAT to show — the engine handles HOW.

## Output Schema

```json
{
  "layout": "vertical | grid-2 | grid-3 | grid-4 | asymmetric | full",
  "panels": [
    {
      "type": "splash | dialogue | narration | data | concept | transition",
      "scene": "laboratory | digital-realm | battlefield | workshop | summit | void | classroom",
      "mood": "dramatic-dark | tense | light | triumphant | mysterious | melancholy",
      "title": "Big title text (splash/transition only, max 60 chars)",
      "narration": "Caption or narration (max 120 chars)",
      "lines": [
        {"who": "Character Name", "says": "Dialogue text (max 150 chars)", "emotion": "determined | neutral | shocked | angry | smirk | fearful | triumphant | frustrated"}
      ],
      "data_items": [
        {"label": "Key metric or concept", "value": "Optional value"}
      ],
      "character": "Primary character name",
      "pose": "standing | thinking | action | dramatic | defeated | presenting | pointing | celebrating",
      "expression": "determined | neutral | shocked | angry | smirk | fearful | triumphant",
      "effects": ["speed_lines", "screentone", "impact_burst", "vignette", "sparkle", "ink_wash"],
      "emphasis": "high | medium | low"
    }
  ]
}
```

## Rules

1. EVERY panel MUST have `type` and at least one content field (narration, lines, title, or data_items)
2. `dialogue` panels MUST have `lines` with at least 2 exchanges
3. `splash` panels MUST have `title` and `emphasis: "high"`
4. `data` panels MUST have `data_items` with at least 2 items
5. `narration` text should be evocative and punchy — not dry summaries
6. Character dialogue should feel natural and dramatic — this is MANGA
7. Keep text SHORT. Max 150 chars per speech bubble. Max 120 chars narration.
8. Each page should have narrative flow: setup → development → punchline
9. Use `emphasis` to control visual weight: "high" = bigger panel, "low" = smaller
10. Pick `scene` from the library — it determines the background illustration
"""


def _build_v4_page_prompt(
    page_panels: list[PanelAssignment],
    manga_bible: Optional[dict] = None,
    chapter_summary: Optional[dict] = None,
) -> str:
    """Build the user prompt for V4 page generation."""
    parts: list[str] = []

    # World context (brief)
    if manga_bible:
        title = manga_bible.get("manga_title", "")
        world = manga_bible.get("world_description", "")
        if title:
            parts.append(f"MANGA: {title}")
        if world:
            parts.append(f"WORLD: {world[:200]}")

        # Character reference (only ones appearing on this page)
        page_chars = {p.character for p in page_panels if p.character}
        for ch in manga_bible.get("characters", []):
            if ch["name"] in page_chars:
                sig = f" [color:{ch['signature_color']}]" if ch.get("signature_color") else ""
                aura = f" [aura:{ch['aura']}]" if ch.get("aura", "none") not in ("", "none") else ""
                parts.append(
                    f"CHARACTER {ch['name']}: {ch.get('role', '')} — "
                    f"{ch.get('speech_style', '')}{sig}{aura}"
                )

    # Chapter context
    if chapter_summary:
        parts.append(
            f"\nCHAPTER: {chapter_summary.get('chapter_title', '')}"
            f" — {chapter_summary.get('one_liner', '')}"
        )

    # Panel assignments
    parts.append(f"\n=== PAGE ({len(page_panels)} panels) ===")

    for i, p in enumerate(page_panels):
        parts.append(f"\n--- Panel {i + 1} ---")
        parts.append(f"Type: {p.content_type}")
        parts.append(f"Mood: {p.visual_mood}")
        parts.append(f"Beat: {p.narrative_beat}")

        if p.text_content:
            parts.append(f"Content: {p.text_content[:300]}")
        if p.scene_description:
            parts.append(f"Scene: {p.scene_description[:150]}")
        if p.character:
            parts.append(f"Character: {p.character} ({p.expression})")
        if p.dialogue:
            parts.append("Dialogue:")
            for d in p.dialogue[:4]:
                if isinstance(d, str):
                    parts.append(f"  ?: \"{d}\"")
                else:
                    parts.append(f"  {d.get('character', '?')}: \"{d.get('text', '')}\"")
        if p.creative_direction:
            # Extract illustration hints from Phase 3 enrichment
            parts.append(f"Direction: {p.creative_direction[:200]}")

    parts.append("\nGenerate the V4 DSL JSON now. Remember: SEMANTIC INTENT only.")
    return "\n".join(parts)


# ============================================================
# FALLBACK GENERATION (no LLM needed)
# ============================================================

def _make_v4_fallback_panel(assignment: PanelAssignment) -> V4Panel:
    """Create a fallback V4 panel from a PanelAssignment without LLM."""
    panel = V4Panel(
        type=assignment.content_type if assignment.content_type in PANEL_TYPES else "narration",
        panel_id=assignment.panel_id,
        chapter_index=assignment.chapter_index,
        page_index=assignment.page_index,
        mood=assignment.visual_mood or "light",
        emphasis="medium",
    )

    # Scene from creative direction
    if assignment.scene_description:
        for scene in ["laboratory", "digital-realm", "battlefield", "workshop", "summit", "void", "classroom"]:
            if scene in assignment.scene_description.lower():
                panel.scene = scene
                break

    # Character
    if assignment.character:
        panel.character = assignment.character
        panel.pose = "standing"
        panel.expression = assignment.expression or "neutral"

    # Content by type
    if assignment.content_type == "splash":
        panel.title = assignment.text_content[:60] if assignment.text_content else "..."
        panel.emphasis = "high"
        panel.effects = ["speed_lines"]
    elif assignment.content_type == "dialogue" and assignment.dialogue:
        for d in assignment.dialogue[:4]:
            if isinstance(d, str):
                panel.lines.append(V4DialogueLine(who="?", says=d[:150]))
            elif isinstance(d, dict):
                panel.lines.append(V4DialogueLine(
                    who=d.get("character", "?")[:30],
                    says=d.get("text", "...")[:150],
                    emotion=d.get("emotion", "neutral"),
                ))
    elif assignment.content_type == "data":
        # Extract concepts from text_content or creative_direction
        text = (assignment.text_content or "") + " " + (assignment.creative_direction or "")
        # Split on common delimiters
        concepts = [c.strip() for c in text.replace(";", ",").split(",") if c.strip()]
        if not concepts and text.strip():
            concepts = [text.strip()[:80]]
        for concept in concepts[:6]:
            panel.data_items.append(V4DataItem(label=concept[:80]))
    elif assignment.content_type == "transition":
        panel.title = assignment.text_content[:60] if assignment.text_content else "Next..."
        panel.effects = ["ink_wash"]

    # Always have some narration as fallback
    if not panel.narration and not panel.lines and not panel.title:
        panel.narration = assignment.text_content[:120] if assignment.text_content else "..."

    return panel


def _make_v4_fallback_page(
    page_panels: list[PanelAssignment],
    page_index: int = 0,
) -> V4Page:
    """Create a complete fallback V4 page without LLM."""
    panels = [_make_v4_fallback_panel(p) for p in page_panels]
    n = len(panels)
    if n == 1:
        layout = "full"
    elif n == 2:
        layout = "vertical"
    elif n == 3:
        layout = "asymmetric"
    else:
        layout = "grid-4"

    return V4Page(
        page_index=page_index,
        chapter_index=page_panels[0].chapter_index if page_panels else 0,
        layout=layout,
        panels=panels,
    )


# ============================================================
# TEMPERATURE (same as v2 — creative panels run hotter)
# ============================================================

TEMPERATURE_MAP = {
    "splash": 0.85,
    "concept": 0.85,
    "montage": 0.8,
    "dialogue": 0.7,
    "narration": 0.65,
    "data": 0.5,
    "transition": 0.6,
}


def _page_temperature(panels: list[PanelAssignment]) -> float:
    temps = [TEMPERATURE_MAP.get(p.content_type, 0.7) for p in panels]
    return max(temps) if temps else 0.7


# ============================================================
# PRIMARY GENERATION PATH
# ============================================================

async def generate_v4_page(
    page_panels: list[PanelAssignment],
    llm_client: LLMClient,
    style: SummaryStyle,
    manga_bible: Optional[dict] = None,
    chapter_summary: Optional[dict] = None,
    prev_chapter_ending: Optional[str] = None,
    visual_context: Optional[str] = None,
) -> dict:
    """
    Generate a V4 DSL page for all panels in one LLM call.

    Returns {"page": V4Page.to_dict(), "tokens": {...}, "success": True/False}
    """
    if not page_panels:
        return {"page": V4Page(page_index=0, chapter_index=0).to_dict(), "tokens": {}, "success": False}

    page_index = page_panels[0].page_index

    user_prompt = _build_v4_page_prompt(
        page_panels, manga_bible, chapter_summary,
    )

    if prev_chapter_ending:
        user_prompt = f"Previous chapter ended: {prev_chapter_ending}\n\n" + user_prompt

    if visual_context:
        user_prompt = f"=== VISUAL CONTINUITY ===\n{visual_context}\n\n" + user_prompt

    temperature = _page_temperature(page_panels)

    # V4 DSL is much smaller — 800 tokens per panel is generous
    max_tokens = 800 * len(page_panels)

    try:
        result = await llm_client.chat_with_retry(
            system_prompt=V4_SYSTEM_PROMPT,
            user_message=user_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            json_mode=True,
        )

        parsed = result.get("parsed") or {}
        if isinstance(parsed, str):
            try:
                parsed = json.loads(parsed)
            except (json.JSONDecodeError, ValueError):
                parsed = {}

        tokens = {
            "input": result.get("input_tokens", 0),
            "output": result.get("output_tokens", 0),
        }

        if not parsed or not isinstance(parsed, dict):
            logger.warning(f"V4 page {page_index}: empty/invalid LLM response, using fallback")
            fallback = _make_v4_fallback_page(page_panels, page_index)
            return {"page": fallback.to_dict(), "tokens": tokens, "success": False}

        # Parse the LLM response
        page = validate_v4_page(parsed, page_index)
        page.chapter_index = page_panels[0].chapter_index

        # Inject panel IDs, chapter indices, and page indices
        for i, (panel, assignment) in enumerate(zip(page.panels, page_panels)):
            panel.panel_id = assignment.panel_id
            panel.chapter_index = assignment.chapter_index
            panel.page_index = assignment.page_index

        # If LLM returned fewer panels than requested, fill with fallbacks
        if len(page.panels) < len(page_panels):
            for j in range(len(page.panels), len(page_panels)):
                fb = _make_v4_fallback_panel(page_panels[j])
                page.panels.append(fb)

        logger.info(
            f"V4 page {page_index}: {len(page.panels)} panels, "
            f"{tokens.get('output', 0)} tokens"
        )

        return {"page": page.to_dict(), "tokens": tokens, "success": True}

    except Exception as e:
        logger.error(f"V4 page {page_index} generation failed: {e}")
        fallback = _make_v4_fallback_page(page_panels, page_index)
        return {"page": fallback.to_dict(), "tokens": {}, "success": False}
