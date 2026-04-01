"""
planner.py — Manga Planner Agent
==================================
The brain of the system. Reads the full book context
(chapter summaries, bible, synopsis) and produces a
structured MANGA PLAN that tells downstream DSL agents
exactly what to create.

Inspired by how code agents handle large codebases:
- Read everything first, build a mental model
- Plan the work, assign it to specialists
- Each specialist works independently with clear instructions

OUTPUT: MangaPlan — a list of PanelAssignments
"""

import json
import logging
from dataclasses import dataclass
from typing import Optional

from app.llm_client import LLMClient

logger = logging.getLogger(__name__)


@dataclass
class PanelAssignment:
    """A single panel the DSL agent must create."""
    panel_id: str
    chapter_index: int
    page_index: int
    panel_index: int
    content_type: str       # splash | dialogue | narration | data | montage | concept
    narrative_beat: str     # what story moment this captures
    text_content: str       # main text to display
    dialogue: list          # [{character, text}]
    character: Optional[str]
    expression: str
    visual_mood: str
    layout_hint: str        # suggested layout type
    image_budget: bool      # whether this panel gets an AI image
    creative_direction: str # specific instructions for the DSL agent
    dependencies: list      # panel_ids this depends on (for ordering)


@dataclass
class MangaPlan:
    """The full plan for a book's manga adaptation."""
    total_panels: int
    total_pages: int
    total_chapters: int
    image_budget: int           # max images across entire book
    panels: list[PanelAssignment]
    parallel_groups: list[list[str]]  # groups of panel_ids that can run in parallel
    estimated_cost: float


PLANNER_SYSTEM_PROMPT = """You are the Manga Planning Director. Your job is to analyze a book's content
and create a detailed panel-by-panel plan for a Living Manga adaptation.

You receive:
- Book synopsis (narrative arc, themes)
- Chapter summaries (per-chapter content)
- Manga bible (characters, world, motifs)

You output a JSON plan with:
1. How many pages per chapter (2-5 pages, based on content density)
2. For each page: layout type and panel assignments
3. Which panels get AI images (BUDGET: max {image_budget} for entire book)
4. Creative direction for each panel's DSL generation

## PANEL TYPES:
- "splash" — Full-page dramatic moment. Gets image budget priority.
- "dialogue" — Character conversation. Sprites + speech bubbles.
- "narration" — Story narration. Typewriter text, atmospheric bg.
- "data" — Key concepts/facts. Data blocks, lists, diagrams.
- "montage" — Quick sequence of moments. Multi-cell cuts layout.
- "concept" — Abstract idea visualization. Effects + typography.
- "transition" — Scene/chapter break. Minimal, atmospheric.

## LAYOUT TYPES:
- "full" — Single panel, full page
- "cuts" — Manga-style cut panels (most dynamic)
- "split-h" — Left/right split
- "split-v" — Top/bottom split
- "grid-2x2" — 4 panels

## CREATIVE DIRECTION:
For each panel, write a brief creative direction that tells the DSL
agent HOW to make it interesting. Think about:
- What animations/effects would enhance this moment?
- What manga techniques (speed lines, screen shake, dramatic zoom)?
- Pacing: fast cuts vs slow reveals?
- What makes this panel FEEL different from the others?

## RULES:
1. First page of each chapter MUST be a splash (title page)
2. Last page of each chapter should be a transition or cliffhanger
3. Vary layouts — don't repeat the same layout 3 times in a row
4. Image budget goes to the MOST visually impactful splash panels
5. Every chapter needs at least 1 dialogue panel with character interaction
6. Keep total panels per chapter between 4-12

Return JSON:
{{
  "chapters": [
    {{
      "chapter_index": 0,
      "pages": [
        {{
          "page_index": 0,
          "layout": "full",
          "panels": [
            {{
              "content_type": "splash",
              "narrative_beat": "Chapter opening — protagonist faces the void",
              "text_content": "CHAPTER 1: THE AWAKENING",
              "dialogue": [],
              "character": null,
              "expression": "neutral",
              "visual_mood": "dramatic-dark",
              "image_budget": true,
              "creative_direction": "Speed lines radiating from center. Title text should slam in with impact_burst effect. Dark ink background with screentone gradient."
            }}
          ]
        }}
      ]
    }}
  ],
  "image_budget_used": 3,
  "estimated_total_panels": 25
}}
"""


def _build_planner_context(
    canonical_chapters: list[dict],
    book_synopsis: dict,
    manga_bible: dict,
    image_budget: int,
) -> str:
    """Build the full context for the planner LLM."""
    parts = []

    # Synopsis
    if book_synopsis:
        parts.append("=== BOOK SYNOPSIS ===")
        parts.append(f"Thesis: {book_synopsis.get('book_thesis', '')}")
        parts.append(f"Arc: {book_synopsis.get('narrative_arc', '')}")
        parts.append(f"World: {book_synopsis.get('world_description', '')}")
        parts.append(f"Metaphor: {book_synopsis.get('core_metaphor', '')}")
        parts.append("")

    # Manga Bible
    if manga_bible:
        parts.append("=== MANGA BIBLE ===")
        for ch in manga_bible.get("characters", []):
            parts.append(f"Character: {ch['name']} ({ch['role']}) — {ch.get('speech_style', '')}")
        parts.append(f"Motifs: {', '.join(manga_bible.get('recurring_motifs', [])[:5])}")
        parts.append("")

    # Chapters
    parts.append(f"=== CHAPTERS ({len(canonical_chapters)} total) ===")
    for ch in canonical_chapters:
        parts.append(f"\n--- Chapter {ch.get('chapter_index', '?')}: {ch.get('chapter_title', '')} ---")
        parts.append(f"One-liner: {ch.get('one_liner', '')}")
        parts.append(f"Key concepts: {', '.join(ch.get('key_concepts', [])[:4])}")
        parts.append(f"Dramatic moment: {ch.get('dramatic_moment', '')}")
        # Truncate narrative to save tokens
        narrative = ch.get("narrative_summary", "")
        if len(narrative) > 400:
            narrative = narrative[:400] + "..."
        parts.append(f"Narrative: {narrative}")

    parts.append(f"\n=== CONSTRAINTS ===")
    parts.append(f"Image budget: {image_budget} images for the ENTIRE book")
    parts.append(f"Target: 2-5 pages per chapter, 4-12 panels total per chapter")
    parts.append("Plan the manga now.")

    return "\n".join(parts)


# Style-specific planning guidance injected into the planner prompt
STYLE_PLANNING_HINTS = {
    "manga": """STYLE: Shonen Manga. High energy, dramatic reveals, speed lines.
Favor: splash panels for reveals, rapid cuts for action, bold SFX.
Mood palette: dramatic-dark, intense-red, warm-amber.""",
    "noir": """STYLE: Film Noir. Cynical, atmospheric, shadow-heavy.
Favor: vignette effects, slow typewriter reveals, moody transitions.
Mood palette: cool-mystery, dramatic-dark. Avoid bright/warm moods.
Use more narration panels than dialogue. Sparse layouts.""",
    "comedy": """STYLE: Comedy. Expressive, reaction-heavy, playful.
Favor: dialogue panels with exaggerated expressions, quick cuts.
Mood palette: warm-amber, playful. Use speech_bubble style: shout/thought.
Include more character interaction panels.""",
    "minimalist": """STYLE: Minimalist. Clean, precise, lots of whitespace.
Favor: full layouts, data panels, restrained animation.
Mood palette: light moods only. No speed lines or SFX.
Every element must serve a purpose. Less is more.""",
    "academic": """STYLE: Academic. Structured, diagrammatic, clear.
Favor: data panels, split layouts for compare/contrast, narration.
Mood palette: neutral. Focus on typography and data_block layers.
Use dialogue sparingly — prefer narration with key quotes.""",
}


async def plan_manga(
    canonical_chapters: list[dict],
    book_synopsis: dict,
    manga_bible: dict,
    llm_client: LLMClient,
    image_budget: int = 5,
    style: str = "manga",
) -> MangaPlan:
    """Run the planner agent to create a full manga plan."""
    style_key = style.value if hasattr(style, 'value') else str(style)
    style_hint = STYLE_PLANNING_HINTS.get(style_key, STYLE_PLANNING_HINTS["manga"])

    system_prompt = PLANNER_SYSTEM_PROMPT.format(image_budget=image_budget)
    system_prompt += f"\n\n## STYLE GUIDE\n{style_hint}"

    user_message = _build_planner_context(
        canonical_chapters, book_synopsis, manga_bible, image_budget
    )

    logger.info(f"Planning manga for {len(canonical_chapters)} chapters (image budget: {image_budget})")

    result = await llm_client.chat_with_retry(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=8000,
        temperature=0.7,
        json_mode=True,
    )

    parsed = result.get("parsed") or {}
    return _build_manga_plan(parsed, canonical_chapters, manga_bible)


def _build_manga_plan(
    plan_data: dict,
    canonical_chapters: list[dict],
    manga_bible: dict,
) -> MangaPlan:
    """Convert raw LLM plan output into structured MangaPlan."""
    panels = []
    parallel_groups = []
    current_group = []
    image_count = 0

    chapters = plan_data.get("chapters", [])

    # Fallback: if LLM didn't return chapters, generate a basic plan
    if not chapters:
        return _generate_fallback_plan(canonical_chapters, manga_bible)

    for ch_data in chapters:
        ch_idx = ch_data.get("chapter_index", 0)
        chapter_panels = []

        for page_data in ch_data.get("pages", []):
            pg_idx = page_data.get("page_index", 0)
            layout = page_data.get("layout", "full")

            for pi, panel_data in enumerate(page_data.get("panels", [])):
                panel_id = f"ch{ch_idx}-pg{pg_idx}-p{pi}"

                assignment = PanelAssignment(
                    panel_id=panel_id,
                    chapter_index=ch_idx,
                    page_index=pg_idx,
                    panel_index=pi,
                    content_type=panel_data.get("content_type", "narration"),
                    narrative_beat=panel_data.get("narrative_beat", ""),
                    text_content=panel_data.get("text_content", ""),
                    dialogue=panel_data.get("dialogue", []),
                    character=panel_data.get("character"),
                    expression=panel_data.get("expression", "neutral"),
                    visual_mood=panel_data.get("visual_mood", "dramatic-dark"),
                    layout_hint=layout,
                    image_budget=panel_data.get("image_budget", False),
                    creative_direction=panel_data.get("creative_direction", ""),
                    dependencies=[],
                )

                if assignment.image_budget:
                    image_count += 1

                panels.append(assignment)
                chapter_panels.append(panel_id)

        # Panels within a chapter can be generated in parallel
        if chapter_panels:
            parallel_groups.append(chapter_panels)

    # Calculate total pages
    page_set = set()
    for p in panels:
        page_set.add((p.chapter_index, p.page_index))

    return MangaPlan(
        total_panels=len(panels),
        total_pages=len(page_set),
        total_chapters=len(chapters),
        image_budget=image_count,
        panels=panels,
        parallel_groups=parallel_groups,
        estimated_cost=0.0,
    )


def _generate_fallback_plan(
    canonical_chapters: list[dict],
    manga_bible: dict,
) -> MangaPlan:
    """Fallback plan when LLM planning fails."""
    panels = []
    parallel_groups = []

    protagonist = "Kai"
    mentor = "The Sage"
    if manga_bible:
        for c in manga_bible.get("characters", []):
            if c.get("role") == "protagonist":
                protagonist = c.get("name", protagonist)
            elif c.get("role") in ("mentor", "guide"):
                mentor = c.get("name", mentor)

    for ch in canonical_chapters:
        ch_idx = ch.get("chapter_index", 0)
        title = ch.get("chapter_title", f"Chapter {ch_idx}")
        one_liner = ch.get("one_liner", "")
        chapter_panels = []

        # Page 0: Splash
        pid = f"ch{ch_idx}-pg0-p0"
        panels.append(PanelAssignment(
            panel_id=pid, chapter_index=ch_idx, page_index=0, panel_index=0,
            content_type="splash", narrative_beat=f"Chapter {ch_idx} title splash",
            text_content=title, dialogue=[], character=None,
            expression="neutral", visual_mood="intense-red",
            layout_hint="full", image_budget=(ch_idx == 0),
            creative_direction="Dramatic title reveal with speed lines and impact_burst. Use screentone bg.",
            dependencies=[],
        ))
        chapter_panels.append(pid)

        # Page 1: Narration + Dialogue
        pid = f"ch{ch_idx}-pg1-p0"
        panels.append(PanelAssignment(
            panel_id=pid, chapter_index=ch_idx, page_index=1, panel_index=0,
            content_type="narration", narrative_beat="Setting the scene",
            text_content=one_liner, dialogue=[], character=None,
            expression="neutral", visual_mood="cool-mystery",
            layout_hint="split-v", image_budget=False,
            creative_direction="Slow typewriter reveal. Crosshatch pattern background.",
            dependencies=[],
        ))
        chapter_panels.append(pid)

        pid = f"ch{ch_idx}-pg1-p1"
        panels.append(PanelAssignment(
            panel_id=pid, chapter_index=ch_idx, page_index=1, panel_index=1,
            content_type="dialogue",
            narrative_beat="Characters discuss the key idea",
            text_content="",
            dialogue=[
                {"character": protagonist, "text": "So what's the breakthrough here?"},
                {"character": mentor, "text": ch.get("dramatic_moment", "Let me show you...")},
            ],
            character=protagonist, expression="curious",
            visual_mood="dramatic-dark",
            layout_hint="split-v", image_budget=False,
            creative_direction="Characters face each other. Bubbles appear with typewriter. Sprite fade-in.",
            dependencies=[],
        ))
        chapter_panels.append(pid)

        # Page 2: Key concepts
        concepts = ch.get("key_concepts", [])
        if concepts:
            pid = f"ch{ch_idx}-pg2-p0"
            panels.append(PanelAssignment(
                panel_id=pid, chapter_index=ch_idx, page_index=2, panel_index=0,
                content_type="data",
                narrative_beat="Core concepts reveal",
                text_content=" | ".join(concepts[:5]),
                dialogue=[], character=None, expression="neutral",
                visual_mood="warm-amber",
                layout_hint="full", image_budget=False,
                creative_direction="Staggered data block reveal. Each concept animates in with a bounce. Amber accent.",
                dependencies=[],
            ))
            chapter_panels.append(pid)

        parallel_groups.append(chapter_panels)

    page_set = set()
    for p in panels:
        page_set.add((p.chapter_index, p.page_index))

    return MangaPlan(
        total_panels=len(panels),
        total_pages=len(page_set),
        total_chapters=len(canonical_chapters),
        image_budget=1,
        panels=panels,
        parallel_groups=parallel_groups,
        estimated_cost=0.0,
    )
