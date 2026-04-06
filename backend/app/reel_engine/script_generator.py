"""
script_generator.py — LLM → Video DSL
========================================
Calls the LLM with selected content and the Video DSL spec.
Returns a validated, auto-fixed DSL dict ready for rendering.
"""

import json
import logging
from typing import Any, Callable

from app.llm_client import LLMClient
from app.models import SummaryStyle
from app.reel_engine.prompts import get_video_dsl_prompt, format_content_for_reel
from app.reel_engine.dsl_validator import validate_video_dsl, fix_video_dsl

logger = logging.getLogger(__name__)


async def generate_video_dsl(
    content_items: list[dict],
    book_title: str,
    book_author: str | None,
    style: SummaryStyle,
    llm_client: LLMClient,
) -> tuple[dict, dict]:
    """
    Generate a Video DSL from selected book content.

    Returns:
        (dsl_dict, cost_info)
    """
    system_prompt = get_video_dsl_prompt(style)
    user_message = format_content_for_reel(content_items, book_title, book_author)

    logger.info(f"Generating Video DSL for '{book_title}' ({len(content_items)} items)")

    result = await llm_client.chat_with_retry(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=4000,
        temperature=0.85,  # Higher temp = more creative variety
        json_mode=True,
    )

    dsl = result.get("parsed", {})

    # Handle case where LLM returns a list or wrapped object
    if isinstance(dsl, list) and len(dsl) > 0:
        dsl = dsl[0]
    if not isinstance(dsl, dict):
        logger.error(f"LLM returned non-dict: {type(dsl)}")
        dsl = _fallback_dsl(content_items, book_title)

    # Auto-fix common issues
    dsl = fix_video_dsl(dsl)

    # Inject book metadata
    meta = dsl.setdefault("meta", {})
    meta["book_title"] = book_title
    meta.setdefault("title", f"Insights from {book_title}")
    meta["source_content_ids"] = [item["id"] for item in content_items]

    # Validate
    is_valid, errors = validate_video_dsl(dsl)
    if not is_valid:
        logger.warning(f"DSL validation errors after fix: {errors}")
        # Try once more with a fallback
        dsl = fix_video_dsl(dsl)
        is_valid, errors = validate_video_dsl(dsl)
        if not is_valid:
            logger.error(f"DSL still invalid, using fallback: {errors}")
            dsl = _fallback_dsl(content_items, book_title)

    cost_info = {
        "input_tokens": result.get("input_tokens", 0),
        "output_tokens": result.get("output_tokens", 0),
        "estimated_cost_usd": result.get("estimated_cost_usd", 0),
    }

    logger.info(
        f"Video DSL generated: {len(dsl.get('scenes', []))} scenes, "
        f"{dsl.get('meta', {}).get('total_duration_ms', 0)}ms total"
    )

    return dsl, cost_info


def _fallback_dsl(content_items: list[dict], book_title: str) -> dict:
    """Minimal valid DSL when LLM output is unusable."""
    # Grab the best content for a simple reel
    hook = ""
    points = []
    for item in content_items:
        if item["type"] in ("oneliner", "quote") and not hook:
            hook = item["content"]
        elif item["type"] in ("concept", "action"):
            points.append(item["content"])

    if not hook:
        hook = f"Key insights from {book_title}"

    scenes = [
        {
            "id": "hook",
            "duration_ms": 4000,
            "transition": {"type": "cut"},
            "layers": [
                {
                    "id": "bg-hook",
                    "type": "background",
                    "props": {
                        "gradient": ["#0F0E17", "#1A0A2E"],
                        "pattern": "halftone",
                        "patternOpacity": 0.06,
                    },
                },
                {
                    "id": "hook-text",
                    "type": "text",
                    "x": "10%",
                    "y": "35%",
                    "props": {
                        "content": hook,
                        "fontSize": "clamp(2rem, 7vw, 3.5rem)",
                        "fontFamily": "Dela Gothic One",
                        "color": "#F0EEE8",
                        "maxWidth": "80%",
                    },
                },
            ],
            "timeline": [
                {
                    "at": 200,
                    "target": "hook-text",
                    "animate": {"opacity": [0, 1], "y": ["38%", "35%"]},
                    "duration": 600,
                    "easing": "spring",
                },
            ],
        },
    ]

    # Add a scene for each point
    for i, point in enumerate(points[:4]):
        scenes.append({
            "id": f"point-{i}",
            "duration_ms": 5000,
            "transition": {"type": "fade", "duration_ms": 400},
            "layers": [
                {
                    "id": f"bg-{i}",
                    "type": "background",
                    "props": {"gradient": ["#0F0E17", "#17161F"]},
                },
                {
                    "id": f"num-{i}",
                    "type": "text",
                    "x": "10%",
                    "y": "25%",
                    "props": {
                        "content": f"0{i + 1}",
                        "fontSize": "6rem",
                        "fontFamily": "Dela Gothic One",
                        "color": "#F5A62340",
                    },
                },
                {
                    "id": f"text-{i}",
                    "type": "text",
                    "x": "10%",
                    "y": "45%",
                    "props": {
                        "content": point,
                        "fontSize": "1.6rem",
                        "fontFamily": "Outfit",
                        "color": "#F0EEE8",
                        "maxWidth": "80%",
                        "lineHeight": 1.5,
                    },
                },
            ],
            "timeline": [
                {
                    "at": 100,
                    "target": f"num-{i}",
                    "animate": {"opacity": [0, 1], "scale": [0.8, 1.0]},
                    "duration": 300,
                    "easing": "spring",
                },
                {
                    "at": 400,
                    "target": f"text-{i}",
                    "animate": {"opacity": [0, 1], "y": ["48%", "45%"]},
                    "duration": 500,
                    "easing": "ease-out",
                },
            ],
        })

    total_ms = sum(s["duration_ms"] for s in scenes)

    return {
        "version": "1.0",
        "canvas": {"width": 1080, "height": 1920, "fps": 30, "background": "#0F0E17"},
        "fonts": ["Dela Gothic One", "Outfit"],
        "palette": {
            "bg": "#0F0E17",
            "fg": "#F0EEE8",
            "accent": "#F5A623",
            "accent2": "#E8191A",
            "muted": "#5E5C78",
        },
        "scenes": scenes,
        "meta": {
            "title": f"Insights from {book_title}",
            "book_title": book_title,
            "total_duration_ms": total_ms,
            "mood": "informative",
            "source_content_ids": [item["id"] for item in content_items],
        },
    }
