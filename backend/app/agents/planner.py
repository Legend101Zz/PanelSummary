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
    text_content: str       # brief narrative caption (MAX 80 chars)
    dialogue: list          # [{character, text}]
    character: Optional[str]
    expression: str
    visual_mood: str
    layout_hint: str        # suggested layout type
    image_budget: bool      # whether this panel gets an AI image
    creative_direction: str # specific instructions for the DSL agent
    scene_description: str  # what the scene looks like visually
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

## MANGA STORYTELLING RULES (CRITICAL — this is what separates manga from PowerPoint):

### SHOW, DON'T TELL
- NEVER dump paragraphs of text into a panel. That's a slide, not manga.
- Instead: use SHORT narration (1-2 sentences max) + character dialogue
- Convert information into CHARACTER REACTIONS and VISUAL METAPHORS
- If a fact can be shown through a character's dialogue or reaction, DO THAT

### TEXT CONTENT LIMITS (HARD RULES):
- text_content: MAX 80 characters for narration panels, MAX 40 for splash
- dialogue: MAX 60 characters per dialogue line
- NEVER use bullet points, emoji lists, or numbered lists in text_content
- NEVER start text with "CHAPTER X:" — use scene_description for that
- The text should read like a manga caption: atmospheric, brief, evocative

### BAD (PowerPoint):
  text_content: "Modern agents now:\n📂 Navigate repositories\n✓ Run automated tests\n🔧 Submit patches end-to-end\n⚙ Make autonomous decisions"

### GOOD (Manga):
  text_content: "The old ways were ending."
  dialogue: [
    {{"character": "LIVE-SWE-AGENT", "text": "I don't just follow instructions. I see the whole picture."}},
    {{"character": "Narrator", "text": "Navigate. Test. Patch. Decide. All in one breath."}}
  ]
  scene_description: "Split panel: left shows old agent stumbling in dark code maze. Right shows LIVE-SWE-AGENT standing atop a mountain of resolved issues, surveying the landscape below."

### DIALOGUE IS THE HEART OF MANGA:
- Every concept should be expressed through character interaction
- Characters ARGUE about ideas, DISCOVER insights, REACT to data
- Even technical content becomes dialogue: "77.4%... that's impossible!" / "Not impossible. Evolved."
- Use the characters from the manga bible — give them PERSONALITY in their lines

## PANEL TYPES:
- "splash" — Full-page dramatic moment. Gets image budget priority. MAX 40 chars text.
- "dialogue" — Character conversation. 2-4 dialogue lines. This is your PRIMARY type.
- "narration" — Brief atmospheric narration. MAX 80 chars. Mood-setting only.
- "data" — Key stats/numbers. Use data_block format, NOT text paragraphs.
- "montage" — Quick sequence. Multiple short moments in cut cells.
- "concept" — Visual metaphor. Minimal text, strong visual description.
- "transition" — Scene/chapter break. 1 line of text max.

## LAYOUT TYPES:
- "full" — Single panel, full page
- "cuts" — Manga-style cut panels (most dynamic)
- "split-h" — Left/right split
- "split-v" — Top/bottom split
- "grid-2x2" — 4 panels

## CREATIVE DIRECTION:
For each panel, write a brief creative direction that tells the DSL
agent HOW to make it interesting. Think about:
- What SCENE should the background show? (lab, digital realm, battlefield)
- Which characters are present and what are they DOING?
- What visual metaphor represents this concept?
- What manga techniques (speed lines, impact burst, dramatic zoom)?
- What makes this panel FEEL different from the others?

## RULES:
1. First page of each chapter MUST be a splash (title page)
2. Last page of each chapter should be a transition or cliffhanger
3. Image budget goes to the MOST visually impactful splash panels
4. Every chapter needs at least 1 dialogue panel with character interaction
5. Keep total panels per chapter between 3-8 (scale to content size)
6. NEVER exceed the HARD CAP on total panels specified in constraints
7. If MANGA STORY BEATS are provided, EVERY beat MUST be covered by at least one panel
8. Each panel should contain REAL content from the source — not generic filler
9. AIM FOR THE MAXIMUM panel count allowed. More panels = richer manga experience.
10. At least 50% of all panels MUST be "dialogue" type. Characters drive the story.

## LAYOUT VARIETY (CRITICAL — this is what makes it feel like MANGA):
- NEVER use the same layout on more than 2 consecutive pages.
- At least 40% of pages MUST use "cuts" layout. This is manga's signature.
- Use this mapping as your guide:
  • splash → "full" (big dramatic moment, full page)
  • dialogue → "cuts" (ALWAYS — characters in separate cells with angled dividers)
  • narration → "full" or "split-v" (atmospheric breathing room)
  • data → "grid-2x2" or "split-h" (structured information)
  • montage → "cuts" with 3+ cells (rapid sequence, steep angles)
  • concept → "full" or "cuts" (abstract visualization)
  • transition → "full" (chapter break, minimal)
- The rhythm of layouts IS the pacing. Full→cuts→cuts→full creates energy.
  Full→full→full→full is a slideshow, not manga.

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
              "narrative_beat": "Chapter opening — the question that started it all",
              "text_content": "Can they evolve?",
              "dialogue": [],
              "character": "LIVE-SWE-AGENT",
              "expression": "determined",
              "visual_mood": "dramatic-dark",
              "image_budget": true,
              "scene_description": "A lone figure stands before a massive screen of scrolling code. Lightning-like energy crackles around their hands. The code begins to reshape itself.",
              "creative_direction": "Speed lines radiating from center. Title text slams in with impact_burst. Dark ink background with screentone gradient. Character silhouette at center, backlit by monitor glow."
            }}
          ]
        }},
        {{
          "page_index": 1,
          "layout": "cuts",
          "panels": [
            {{
              "content_type": "dialogue",
              "narrative_beat": "Researchers debate the core question",
              "text_content": "",
              "dialogue": [
                {{"character": "Researcher", "text": "Every other agent is pre-trained. Fixed. Limited."}},
                {{"character": "LIVE-SWE-AGENT", "text": "But what if I could learn... while fighting?"}}
              ],
              "character": "LIVE-SWE-AGENT",
              "expression": "curious",
              "visual_mood": "tense",
              "image_budget": false,
              "scene_description": "Lab scene. Researcher at whiteboard covered in diagrams. LIVE-SWE-AGENT avatar glows on the monitor behind them.",
              "creative_direction": "Cut layout: researcher on left cell, LIVE-SWE-AGENT on right. Angled divider at 2 degrees. Speech bubbles with typewriter effect."
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
    max_panels: int = 30,
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

        # Story beats — these are specific scenes the manga MUST cover
        story_beats = book_synopsis.get("manga_story_beats", [])
        if story_beats:
            parts.append("")
            parts.append("=== MANGA STORY BEATS (from synopsis) ===")
            parts.append(
                "These are the KEY dramatic moments your manga MUST include. "
                "Each beat should map to at least one panel:"
            )
            for i, beat in enumerate(story_beats):
                parts.append(f"  Beat {i + 1}: {beat}")

        # Key facts that must be preserved
        key_facts = book_synopsis.get("key_facts_to_preserve", [])
        if key_facts:
            parts.append("")
            parts.append("KEY FACTS TO PRESERVE IN PANELS:")
            for fact in key_facts[:8]:
                parts.append(f"  • {fact}")
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
    panels_per_ch = max(3, max_panels // max(1, len(canonical_chapters)))
    parts.append(f"TARGET PANEL COUNT: {max_panels} total panels for the ENTIRE book")
    parts.append(f"Target: 2-4 pages per chapter, {panels_per_ch} panels per chapter")
    parts.append(
        "USE the full panel budget. A richer manga tells a better story. "
        "Every chapter deserves at least 3 panels (splash + dialogue + narration/data)."
    )
    parts.append(
        "Cover ALL the content from the source material. "
        "Don't leave out key facts, achievements, or narrative moments."
    )
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


def consolidate_short_chapters(
    canonical_chapters: list[dict],
    max_chapters: int | None = None,
) -> list[dict]:
    """Merge adjacent thin chapters so short docs don't explode into 40 panels.

    A 3-page resume with 10 section headers shouldn't produce 10 chapters.
    We merge adjacent chapters that are both small (< 200 words) into one,
    capped at `max_chapters`.

    IMPORTANT: Only consolidate genuinely thin documents. A 10-chapter
    research paper with 1400 words of summaries (140 words/chapter) is
    RICH content that deserves individual chapter treatment. Consolidating
    it kills narrative depth and produces incoherent manga.
    """
    total_words = sum(
        len(ch.get("narrative_summary", "").split())
        for ch in canonical_chapters
    )
    n = len(canonical_chapters)

    # Skip consolidation if:
    # - Already few chapters (no point merging)
    # - Lots of total summary words (rich document)
    # - Average chapter is already dense (>80 words = real content)
    avg_words_per_chapter = total_words / max(n, 1)
    if total_words >= 1500 or n <= 5 or avg_words_per_chapter > 80:
        return canonical_chapters

    # Target: keep more chapters — short docs need MORE panels, not fewer.
    # Use ~250 words per chapter, minimum 5 chapters.
    if max_chapters:
        target = max_chapters  # Explicit override — respect it
    else:
        target = max(5, min(n, total_words // 250 + 1))
    if n <= target:
        return canonical_chapters

    logger.info(
        f"Consolidating {n} chapters → ~{target} "
        f"(short doc: ~{total_words} summary words)"
    )

    merged: list[dict] = []
    buf: list[dict] = []
    buf_words = 0
    # How many words each merged chapter should aim for.
    # Floor of 50 (not 150) so very short docs still hit their target count.
    words_per_merged = max(50, total_words // target)

    for ch in canonical_chapters:
        ch_words = len(ch.get("narrative_summary", "").split())
        buf.append(ch)
        buf_words += ch_words

        # Flush when buffer is fat enough (unless we'd overshoot target)
        remaining = n - (len(merged) + len(buf))
        remaining_merges = target - len(merged) - 1  # -1 for current buffer
        if buf_words >= words_per_merged or remaining <= remaining_merges:
            merged.append(_merge_chapter_group(buf, len(merged)))
            buf = []
            buf_words = 0

    # Flush leftover — create a NEW chapter instead of absorbing into the
    # last one, which was collapsing content and losing narrative depth.
    if buf:
        merged.append(_merge_chapter_group(buf, len(merged)))

    logger.info(f"Consolidated {n} → {len(merged)} chapters")
    return merged


def _merge_chapter_group(chapters: list[dict], new_index: int) -> dict:
    """Merge a list of thin chapters into a single combined chapter."""
    if len(chapters) == 1:
        ch = dict(chapters[0])
        ch["chapter_index"] = new_index
        return ch

    titles = [ch.get("chapter_title", "") for ch in chapters]
    return {
        "chapter_index": new_index,
        "chapter_title": " / ".join(t for t in titles if t),
        "one_liner": chapters[0].get("one_liner", ""),
        "key_concepts": _dedup_list([
            c for ch in chapters
            for c in ch.get("key_concepts", [])
        ])[:6],
        "narrative_summary": "\n\n".join(
            ch.get("narrative_summary", "") for ch in chapters
        ),
        "dramatic_moment": next(
            (ch.get("dramatic_moment", "") for ch in chapters
             if ch.get("dramatic_moment")),
            "",
        ),
        "memorable_quotes": _dedup_list([
            q for ch in chapters
            for q in ch.get("memorable_quotes", [])
        ])[:3],
        "action_items": _dedup_list([
            a for ch in chapters
            for a in ch.get("action_items", [])
        ])[:4],
    }


def _dedup_list(items: list) -> list:
    """Deduplicate a list while preserving order."""
    seen = set()
    result = []
    for item in items:
        key = str(item).lower().strip()
        if key not in seen:
            seen.add(key)
            result.append(item)
    return result


async def plan_manga(
    canonical_chapters: list[dict],
    book_synopsis: dict,
    manga_bible: dict,
    llm_client: LLMClient,
    image_budget: int = 5,
    style: str = "manga",
    min_scenes: int = 0,
    narrative_arc_context: str = "",
) -> MangaPlan:
    """Run the planner agent to create a full manga plan.

    Args:
        min_scenes: Minimum number of scenes from the story blueprint.
            When provided, the panel budget is raised to ensure every
            designed scene gets at least one panel.
        narrative_arc_context: Pre-formatted 3-act narrative arc from
            narrative_arc.py. Gives the planner structural guidance.
    """
    # ── 1C: Consolidate inflated chapters for short documents ──
    canonical_chapters = consolidate_short_chapters(canonical_chapters)

    style_key = style.value if hasattr(style, 'value') else str(style)
    style_hint = STYLE_PLANNING_HINTS.get(style_key, STYLE_PLANNING_HINTS["manga"])

    # Scale panel budget proportionally to content size
    total_words = sum(
        len(ch.get("narrative_summary", "").split())
        for ch in canonical_chapters
    )
    n_chapters = len(canonical_chapters)
    # Rule: ~3 panels 0 words of summary, floor of 3 per chapter
    # We want ENOUGH panels to tell a real story, not a slideshow.
    panels_by_content = max(12, min(total_words // 50, n_chapters * 8))
    # Small docs still get generous budgets — short != boring.
    # Minimum: 3 panels per chapter (splash + dialogue + data/narration)
    if total_words < 1000:
        panels_by_content = max(panels_by_content, n_chapters * 3)
        # But still cap at something reasonable
        panels_by_content = min(panels_by_content, max(12, n_chapters * 5))

    # If the story blueprint designed N scenes, we need at LEAST N panels
    # (each scene → at least 1 panel). This prevents the "too few panels" bug.
    if min_scenes > 0:
        panels_by_content = max(panels_by_content, min_scenes)
        logger.info(
            f"Panel budget raised to {panels_by_content} "
            f"(story blueprint has {min_scenes} scenes)"
        )

    logger.info(
        f"Panel budget: {panels_by_content} "
        f"(~{total_words} summary words, {n_chapters} chapters)"
    )

    system_prompt = PLANNER_SYSTEM_PROMPT.format(image_budget=image_budget)
    system_prompt += f"\n\n## STYLE GUIDE\n{style_hint}"

    user_message = _build_planner_context(
        canonical_chapters, book_synopsis, manga_bible, image_budget,
        max_panels=panels_by_content,
    )

    # Inject narrative arc if available — gives the planner structural guidance
    if narrative_arc_context:
        user_message = narrative_arc_context + "\n\n" + user_message

    logger.info(f"Planning manga for {n_chapters} chapters (image budget: {image_budget})")

    # ── 1A: Scale max_tokens with chapter count to prevent truncation ──
    # Each chapter needs ~800-1000 tokens of planning output.
    # Floor of 8000 so even 4-chapter docs don't truncate at 7000.
    max_tokens = max(8000, min(16000, 3000 + n_chapters * 1000))

    result = await llm_client.chat_with_retry(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=max_tokens,
        temperature=0.7,
        json_mode=True,
    )

    parsed = result.get("parsed") or {}

    # ── 1A: Detect truncation — output_tokens hitting max_tokens ──
    output_tokens = result.get("output_tokens", 0)
    if output_tokens >= max_tokens - 10:
        logger.warning(
            f"Planner output likely truncated ({output_tokens}/{max_tokens} tokens). "
            f"JSON may be incomplete — falling back to robust parsing."
        )

    plan = _build_manga_plan(parsed, canonical_chapters, manga_bible,
                             max_panels=panels_by_content)

    # HARD CAP enforcement — if LLM ignored the cap, truncate
    if len(plan.panels) > panels_by_content:
        logger.warning(
            f"LLM planned {len(plan.panels)} panels but cap is {panels_by_content}. Truncating."
        )
        plan.panels = plan.panels[:panels_by_content]
        plan.total_panels = len(plan.panels)

    return plan


def _build_manga_plan(
    plan_data: dict | list,
    canonical_chapters: list[dict],
    manga_bible: dict,
    max_panels: int = 30,
) -> MangaPlan:
    """Convert raw LLM plan output into structured MangaPlan.

    Robust against malformed LLM output:
    - If plan_data is a list, assume it's the chapters array directly
    - If chapter/page/panel entries are wrong type, skip them gracefully
    - Falls back to _generate_fallback_plan() if nothing is salvageable
    """
    # ── 1A: Handle list-type parsed responses ──
    # When the JSON is truncated (hit max_tokens), the parser may extract
    # just the chapters array instead of the outer {"chapters": [...]} dict.
    if isinstance(plan_data, list):
        logger.warning(
            "Planner returned a list instead of dict — "
            "likely truncated JSON. Wrapping as chapters array."
        )
        plan_data = {"chapters": plan_data}

    if not isinstance(plan_data, dict):
        logger.error(f"Planner returned unexpected type: {type(plan_data)}")
        return _generate_fallback_plan(canonical_chapters, manga_bible,
                                       max_panels=max_panels)

    chapters = plan_data.get("chapters", [])

    # Fallback: if LLM didn't return chapters, generate a basic plan
    if not chapters:
        return _generate_fallback_plan(canonical_chapters, manga_bible,
                                       max_panels=max_panels)

    panels = []
    parallel_groups = []
    image_count = 0

    for ch_data in chapters:
        # ── 1A: Type guard — skip malformed chapter entries ──
        if not isinstance(ch_data, dict):
            logger.warning(f"Skipping non-dict chapter entry: {type(ch_data)}")
            continue

        ch_idx = ch_data.get("chapter_index", 0)
        chapter_panels = []

        for page_data in ch_data.get("pages", []):
            if not isinstance(page_data, dict):
                logger.warning(f"Skipping non-dict page entry in ch{ch_idx}")
                continue

            pg_idx = page_data.get("page_index", 0)
            layout = page_data.get("layout", "full")

            for pi, panel_data in enumerate(page_data.get("panels", [])):
                if not isinstance(panel_data, dict):
                    logger.warning(
                        f"Skipping non-dict panel in ch{ch_idx}-pg{pg_idx}"
                    )
                    continue

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
                    scene_description=panel_data.get("scene_description", ""),
                    dependencies=[],
                )

                if assignment.image_budget:
                    image_count += 1

                panels.append(assignment)
                chapter_panels.append(panel_id)

        # Panels within a chapter can be generated in parallel
        if chapter_panels:
            parallel_groups.append(chapter_panels)

    # If we parsed chapters but got zero usable panels, fallback
    if not panels:
        logger.warning("Parsed chapters but extracted 0 panels — using fallback")
        return _generate_fallback_plan(canonical_chapters, manga_bible,
                                       max_panels=max_panels)

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


# Layout rotation for fallback — avoids the "everything is full" monotony
_FALLBACK_LAYOUTS = ["full", "cuts", "split-v", "cuts", "split-h", "cuts"]


def _generate_fallback_plan(
    canonical_chapters: list[dict],
    manga_bible: dict,
    max_panels: int = 30,
) -> MangaPlan:
    """Fallback plan when LLM planning fails.

    ── 1B: Respects the panel budget cap ──
    Generates 2 panels/chapter (splash + dialogue) by default,
    adds a data panel only if budget allows. Never exceeds max_panels.
    """
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

    n_chapters = len(canonical_chapters)
    # Budget: 3 core panels per chapter (splash + dialogue + data/narration)
    core_per_ch = 3
    budget_remaining = max_panels - (n_chapters * core_per_ch)
    # Distribute bonus panels evenly across chapters
    bonus_every_n = max(1, n_chapters // max(1, budget_remaining)) if budget_remaining > 0 else 999

    logger.info(
        f"Fallback plan: {n_chapters} chapters, budget {max_panels}, "
        f"{core_per_ch}/ch + bonus every {bonus_every_n} chapters"
    )

    for ci, ch in enumerate(canonical_chapters):
        ch_idx = ch.get("chapter_index", ci)
        title = ch.get("chapter_title", f"Chapter {ch_idx}")
        one_liner = ch.get("one_liner", "")
        chapter_panels = []

        if len(panels) >= max_panels:
            break

        # Pick layout from rotation (avoids monotonous "full" everywhere)
        page_layout = _FALLBACK_LAYOUTS[ci % len(_FALLBACK_LAYOUTS)]

        # Panel 1: Splash (always full for splash pages)
        pid = f"ch{ch_idx}-pg0-p0"
        panels.append(PanelAssignment(
            panel_id=pid, chapter_index=ch_idx, page_index=0, panel_index=0,
            content_type="splash", narrative_beat=f"Chapter {ch_idx} title splash",
            text_content=title[:40], dialogue=[], character=None,
            expression="neutral", visual_mood="intense-red",
            layout_hint="full", image_budget=(ci == 0),
            creative_direction=(
                "Dramatic title reveal with speed lines and impact_burst. "
                "Use screentone bg. SFX text for emphasis."
            ),
            scene_description="Dark atmospheric scene with dramatic lighting. Title text dominates the frame.",
            dependencies=[],
        ))
        chapter_panels.append(pid)

        if len(panels) >= max_panels:
            parallel_groups.append(chapter_panels)
            break

        # Panel 2: Dialogue (use cuts layout for manga feel)
        pid = f"ch{ch_idx}-pg1-p0"
        panels.append(PanelAssignment(
            panel_id=pid, chapter_index=ch_idx, page_index=1, panel_index=0,
            content_type="dialogue",
            narrative_beat="Characters discuss the key idea",
            text_content="",
            dialogue=[
                {"character": protagonist, "text": "So what's the breakthrough here?"},
                {"character": mentor, "text": ch.get("dramatic_moment", "Let me show you...")[:60]},
            ],
            character=protagonist, expression="curious",
            visual_mood="dramatic-dark",
            layout_hint="cuts",
            image_budget=False,
            creative_direction=(
                "Use cuts layout with angled divider (1-2 degrees). "
                "Character sprites in each cell. Speech bubbles with typewriter. "
                "Sprite fade-in before bubbles appear."
            ),
            scene_description=f"Two characters face each other across a divide. {protagonist} looks questioning, {mentor} looks confident.",
            dependencies=[],
        ))
        chapter_panels.append(pid)

        if len(panels) >= max_panels:
            parallel_groups.append(chapter_panels)
            break

        # Panel 3: Narration — brief atmospheric caption
        narrative = ch.get("dramatic_moment", one_liner)
        # Manga narration is SHORT — one evocative sentence
        if len(narrative) > 80:
            # Find the first sentence
            for sep in ('. ', '! ', '? '):
                idx = narrative.find(sep)
                if 0 < idx < 80:
                    narrative = narrative[:idx + 1]
                    break
            else:
                narrative = narrative[:77] + "..."
        pid = f"ch{ch_idx}-pg1-p1"
        panels.append(PanelAssignment(
            panel_id=pid, chapter_index=ch_idx, page_index=1, panel_index=1,
            content_type="narration",
            narrative_beat=ch.get("dramatic_moment", "Key insight reveal"),
            text_content=narrative,
            dialogue=[], character=None, expression="neutral",
            visual_mood="dramatic-dark",
            layout_hint="full",
            image_budget=False,
            creative_direction=(
                "Atmospheric narration with vignette effect and slow "
                "typewriter text. Crosshatch pattern bg. Particles floating."
            ),
            scene_description="Wide atmospheric shot. Dark gradient background with floating particles of light.",
            dependencies=[],
        ))
        chapter_panels.append(pid)

        # Bonus: Data panel if budget allows (every Nth chapter)
        concepts = ch.get("key_concepts", [])
        if concepts and ci % bonus_every_n == 0 and len(panels) < max_panels:
            pid = f"ch{ch_idx}-pg2-p0"
            panels.append(PanelAssignment(
                panel_id=pid, chapter_index=ch_idx, page_index=2, panel_index=0,
                content_type="data",
                narrative_beat="Core concepts reveal",
                text_content=" | ".join(concepts[:5]),
                dialogue=[], character=None, expression="neutral",
                visual_mood="warm-amber",
                layout_hint=page_layout,
                image_budget=False,
                creative_direction=(
                    "Staggered data_block reveal. Each concept animates in "
                    "with bounce easing. Use amber accent color."
                ),
                scene_description="Data visualization: key concepts float as glowing nodes in a network.",
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
