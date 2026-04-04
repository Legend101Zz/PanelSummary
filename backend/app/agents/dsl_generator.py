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
