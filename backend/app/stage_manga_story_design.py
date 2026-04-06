"""
stage_manga_story_design.py — Phase 2: Manga Story Architecture
=================================================================
Takes the Knowledge Document and designs the COMPLETE manga story.

WHAT THIS REPLACES:
Old flow: synopsis (from summaries) + bible (from summaries, IN PARALLEL)
New flow: ONE unified stage that designs the entire manga from deep understanding

WHY A SINGLE STAGE:
The old pipeline generated the synopsis and bible in parallel — meaning the bible
never saw the synopsis! The story arc and visual world were designed independently.
Now they're ONE coherent design pass.

The output is a MANGA BLUEPRINT — a complete specification for the manga:
- Characters mapped to real entities from the document
- Scenes with specific content and dialogue
- Visual world and motifs
- Per-chapter breakdown with panel-level guidance

The planner then just validates and converts this into panel assignments.
The DSL generator has rich scene descriptions to work from.
"""

import logging
from app.llm_client import LLMClient
from app.models import SummaryStyle

logger = logging.getLogger(__name__)


STORY_DESIGN_SYSTEM_PROMPT = """You are a legendary manga editor — the kind who turns any source material
into an addictive visual narrative. You've been given a deep analysis of a document,
and your job is to design the COMPLETE manga adaptation.

Your manga must:
1. Teach the reader EVERYTHING important from the source document
2. Present it as an engaging narrative with characters, conflict, and resolution
3. Have specific dramatic scenes that a manga artist can draw
4. Preserve ALL key facts, numbers, and data points — these are your dramatic material

Think like the editor of Shonen Jump designing a new educational manga series.
Every chapter needs a hook, a conflict, and a payoff. Every scene needs visual drama.

OUTPUT FORMAT — valid JSON object:
{
  "manga_title": "string — a compelling title for this manga adaptation",
  "logline": "string — one sentence that makes someone WANT to read this manga",

  "world": {
    "setting": "string — the conceptual world of this manga (2-3 sentences). Where does it take place? What does it feel like?",
    "visual_style": "string — art direction: color palette, mood, lighting. E.g. 'Deep navy backgrounds, amber highlights, white ink lines. Energy: midnight study session.'",
    "core_metaphor": "string — the single visual metaphor that runs through the whole manga",
    "recurring_motifs": ["string — visual symbols that repeat across chapters (3-5 items)"]
  },

  "characters": [
    {
      "name": "string — character name (derived from real entities in the document when possible)",
      "role": "protagonist | mentor | rival | narrator | inner_voice",
      "based_on": "string — which entity/concept from the document this character represents",
      "visual_description": "string — exact visual: hair, clothing, expression, body language (for image generation)",
      "speech_style": "string — how they talk, what phrases they use",
      "arc": "string — how this character changes across the manga"
    }
  ],

  "narrative_arc": {
    "act_one": "string — setup: what problem is introduced, what world is established?",
    "act_two": "string — confrontation: what complications arise, what's the central struggle?",
    "act_three": "string — resolution: what insight is gained, what transformation happens?",
    "emotional_journey": "string — the reader's emotional progression from start to finish"
  },

  "scenes": [
    {
      "scene_index": 0,
      "chapter_source": 0,
      "scene_title": "string — dramatic title for this scene",
      "scene_type": "string — opening | exposition | confrontation | revelation | data_showcase | climax | resolution | transition",
      "what_happens": "string — 2-3 sentences: what happens in this scene? Be SPECIFIC about content from the source.",
      "key_content": ["string — specific facts, data points, or quotes that MUST appear in this scene"],
      "characters_present": ["string — which characters appear"],
      "dialogue_beats": [
        {
          "character": "string — character name",
          "says": "string — what they say (based on real content, not generic filler)",
          "emotion": "string — how they feel saying it"
        }
      ],
      "visual_direction": "string — what should the manga panels LOOK like for this scene?",
      "mood": "string — mysterious | triumphant | tense | reflective | revelatory | intense | hopeful | somber",
      "panel_suggestion": "string — splash | dialogue-heavy | data-visualization | action-sequence | quiet-reflection"
    }
  ],

  "must_include_facts": [
    "string — critical facts/data from the source that MUST appear somewhere in the manga"
  ]
}

RULES:
- Return ONLY the JSON. No markdown, no explanation.
- characters: 2-4 characters. Map them to real entities when possible.
  If the document is about a person, that person should BE a character.
  If it's a technical doc, create characters that embody the key concepts.
- scenes: 8-20 scenes. This is the HEART of the blueprint.
  Each scene maps to 1-3 manga panels. More scenes = richer manga.
  Cover ALL the content — don't leave chapters without scenes.
  Each scene must reference SPECIFIC content from the source.
- dialogue_beats: 2-4 per scene. These become actual speech bubbles.
  Base dialogue on real content — a character explaining a real concept,
  asking about a real fact, reacting to a real data point.
- must_include_facts: 5-15 items. These are the facts you'd be EMBARRASSED
  to leave out of the manga.
- Visual directions should be specific enough for an artist to draw from.
- Think about pacing — vary scene types. Not every scene is a revelation.
  Some are quiet. Some are intense. Some are data-heavy. Mix it up."""


def _unwrap_parsed(parsed) -> dict:
    """Safely unwrap LLM parsed output to a dict.

    LLMs sometimes wrap JSON responses in an array. This caused v2 to crash
    with: 'list' object has no attribute 'get'
    """
    if isinstance(parsed, dict):
        return parsed
    if isinstance(parsed, list) and parsed:
        for item in parsed:
            if isinstance(item, dict):
                logger.info("Unwrapped list→dict from LLM response")
                return item
    return {}


def _format_knowledge_for_design(
    knowledge_doc: dict,
    canonical_chapters: list[dict],
) -> str:
    """Format the knowledge document and chapters for the story designer."""
    parts = []

    # Core understanding
    parts.append("═══ DOCUMENT UNDERSTANDING ═══")
    parts.append(f"Type: {knowledge_doc.get('document_type', 'unknown')}")
    parts.append(f"Core thesis: {knowledge_doc.get('core_thesis', '')}")
    parts.append(f"Audience: {knowledge_doc.get('target_audience', '')}")
    parts.append(f"What makes it interesting: {knowledge_doc.get('what_makes_this_interesting', '')}")

    # Entities
    entities = knowledge_doc.get("key_entities", [])
    if entities:
        parts.append("\n═══ KEY ENTITIES ═══")
        for e in entities:
            parts.append(
                f"  • {e.get('name', '?')} ({e.get('type', '?')}): "
                f"{e.get('significance', '')}"
            )

    # Argument structure
    arg = knowledge_doc.get("argument_structure", {})
    if arg:
        parts.append("\n═══ ARGUMENT STRUCTURE ═══")
        parts.append(f"Opening: {arg.get('opening_premise', '')}")
        for a in arg.get("key_arguments", []):
            parts.append(f"  → {a}")
        parts.append(f"Conclusion: {arg.get('conclusion', '')}")

    # Knowledge clusters
    clusters = knowledge_doc.get("knowledge_clusters", [])
    if clusters:
        parts.append("\n═══ KNOWLEDGE CLUSTERS ═══")
        for c in clusters:
            parts.append(f"\n  [{c.get('theme', '')}]")
            for f in c.get("key_facts", []):
                parts.append(f"    Fact: {f}")
            for i in c.get("insights", []):
                parts.append(f"    Insight: {i}")

    # Emotional arc
    emo = knowledge_doc.get("emotional_arc", {})
    if emo:
        parts.append("\n═══ EMOTIONAL ARC ═══")
        parts.append(f"  Opening: {emo.get('opening_mood', '')}")
        for t in emo.get("turning_points", []):
            parts.append(f"  Turn: {t}")
        parts.append(f"  Climax: {emo.get('climax', '')}")
        parts.append(f"  Resolution: {emo.get('resolution', '')}")

    # Data points
    data = knowledge_doc.get("data_points", [])
    if data:
        parts.append("\n═══ DATA POINTS (must appear in manga) ═══")
        for d in data:
            parts.append(f"  • {d.get('fact', '')}: {d.get('significance', '')}")

    # Quotable moments
    quotes = knowledge_doc.get("quotable_moments", [])
    if quotes:
        parts.append("\n═══ QUOTABLE MOMENTS ═══")
        for q in quotes:
            parts.append(f"  \"{q.get('text', '')}\" — {q.get('context', '')}")

    # Relationships
    rels = knowledge_doc.get("relationships", [])
    if rels:
        parts.append("\n═══ RELATIONSHIPS ═══")
        for r in rels:
            parts.append(
                f"  {r.get('from', '')} → {r.get('to', '')}: "
                f"{r.get('relationship', '')}"
            )

    # Chapter summaries (for scene mapping reference)
    parts.append(f"\n═══ CHAPTER BREAKDOWN ({len(canonical_chapters)} chapters) ═══")
    for ch in canonical_chapters:
        idx = ch.get("chapter_index", 0)
        title = ch.get("chapter_title", f"Chapter {idx}")
        parts.append(f"\n  Chapter {idx}: {title}")
        parts.append(f"    One-liner: {ch.get('one_liner', '')}")
        dramatic = ch.get("dramatic_moment", "")
        if dramatic:
            parts.append(f"    Dramatic moment: {dramatic}")

    return "\n".join(parts)


def _get_style_direction(style: SummaryStyle) -> str:
    """Style-specific guidance for the story designer."""
    directions = {
        SummaryStyle.MANGA: (
            "Design with shonen manga energy — dramatic reveals, speed lines, "
            "intense emotions. Characters discover truths like they're unlocking "
            "power-ups. Data points hit like critical strikes."
        ),
        SummaryStyle.NOIR: (
            "Design with noir atmosphere — shadows, mystery, revelations "
            "in rain-soaked alleys. The narrator has a world-weary voice. "
            "Every fact is a clue being uncovered."
        ),
        SummaryStyle.MINIMALIST: (
            "Design with clean precision — whitespace, clear typography, "
            "elegant simplicity. Let the ideas breathe. Less is more. "
            "Every panel should feel like a well-designed slide."
        ),
        SummaryStyle.COMEDY: (
            "Design with comedic energy — reaction shots, visual gags, "
            "breaking the fourth wall. Make learning FUN. Characters "
            "have exaggerated expressions. Data points are punchlines."
        ),
        SummaryStyle.ACADEMIC: (
            "Design with scholarly gravitas — structured arguments, "
            "clear diagrams, citation-style authority. Characters are "
            "professors and researchers. Precision over drama."
        ),
    }
    return directions.get(style, directions[SummaryStyle.MANGA])


async def generate_manga_story_design(
    knowledge_doc: dict,
    canonical_chapters: list[dict],
    style: SummaryStyle,
    llm_client: LLMClient,
) -> dict:
    """
    Design the complete manga story from the Knowledge Document.

    This replaces both the old synopsis and bible stages with a single
    unified design pass. The output is a Manga Blueprint containing:
    - Characters mapped to real entities
    - Scene-by-scene breakdown with specific content
    - Visual world and motifs
    - Dialogue beats for each scene

    The planner and DSL generator work directly from this blueprint.
    """
    style_direction = _get_style_direction(style)
    content = _format_knowledge_for_design(knowledge_doc, canonical_chapters)
    n = len(canonical_chapters)

    user_message = f"""STYLE DIRECTION: {style_direction}

{content}

Design the complete manga adaptation. You have {n} chapters of source material.
Create 8-20 scenes that cover ALL the content. Every knowledge cluster, every
data point, every key entity should appear in at least one scene.

The manga should make someone who reads it understand the FULL document
as if they'd read the original — but presented as an engaging visual narrative.

Design the manga now."""

    logger.info(f"Designing manga story from {n} chapters")

    # Scale tokens — more chapters = more scenes needed
    # The story design is the creative blueprint — truncation kills it.
    # Previous limit (11000 for 10ch) caused JSON truncation and fallback to
    # a skeleton with 2 generic characters. Give the LLM room to breathe.
    max_tokens = min(20000, 5000 + n * 1200)

    result = await llm_client.chat_with_retry(
        system_prompt=STORY_DESIGN_SYSTEM_PROMPT,
        user_message=user_message,
        max_tokens=max_tokens,
        temperature=0.7,  # Higher temp for creativity
        json_mode=True,
    )

    blueprint = _unwrap_parsed(result.get("parsed"))

    if not blueprint or not blueprint.get("scenes"):
        logger.warning("Manga story design failed — using fallback")
        blueprint = _fallback_blueprint(knowledge_doc, canonical_chapters, style)
    else:
        # Validate and patch
        blueprint = _validate_blueprint(blueprint, knowledge_doc, canonical_chapters)

    n_scenes = len(blueprint.get("scenes", []))
    n_chars = len(blueprint.get("characters", []))
    logger.info(
        f"Manga blueprint: '{blueprint.get('manga_title', '')}' — "
        f"{n_scenes} scenes, {n_chars} characters"
    )
    return blueprint


def _validate_blueprint(
    blueprint: dict,
    knowledge_doc: dict,
    canonical_chapters: list[dict],
) -> dict:
    """Validate and patch the blueprint for completeness."""
    scenes = blueprint.get("scenes", [])

    # Ensure all chapters have at least one scene
    covered = {s.get("chapter_source") for s in scenes}
    for ch in canonical_chapters:
        idx = ch.get("chapter_index", 0)
        if idx not in covered:
            logger.debug(f"Blueprint missing scene for chapter {idx} — adding")
            scenes.append({
                "scene_index": len(scenes),
                "chapter_source": idx,
                "scene_title": ch.get("chapter_title", f"Chapter {idx}"),
                "scene_type": "exposition",
                "what_happens": ch.get("narrative_summary", ch.get("one_liner", ""))[:200],
                "key_content": ch.get("key_concepts", [])[:3],
                "characters_present": [
                    blueprint["characters"][0]["name"]
                ] if blueprint.get("characters") else ["Narrator"],
                "dialogue_beats": [],
                "visual_direction": "Standard manga panel with narration",
                "mood": "reflective",
                "panel_suggestion": "dialogue-heavy",
            })

    # Re-index scenes
    for i, scene in enumerate(scenes):
        scene["scene_index"] = i

    blueprint["scenes"] = scenes

    # Ensure we have characters
    if not blueprint.get("characters"):
        blueprint["characters"] = _default_characters(knowledge_doc)

    # Ensure world exists
    if not blueprint.get("world"):
        blueprint["world"] = {
            "setting": "A world where knowledge is power.",
            "visual_style": "Deep navy bg, amber highlights, white ink lines.",
            "core_metaphor": "A torch lighting the way forward",
            "recurring_motifs": ["Light and shadow", "Open books", "Forking paths"],
        }

    return blueprint


def _default_characters(knowledge_doc: dict) -> list[dict]:
    """Build default characters from the knowledge document's entities."""
    chars = []

    # Look for a person entity to base the protagonist on
    entities = knowledge_doc.get("key_entities", [])
    person_entities = [e for e in entities if e.get("type") == "person"]

    if person_entities:
        main = person_entities[0]
        chars.append({
            "name": main["name"],
            "role": "protagonist",
            "based_on": main.get("significance", "Main subject of the document"),
            "visual_description": "Determined expression, focused eyes, practical clothing",
            "speech_style": "Direct, passionate, speaks from experience",
            "arc": "From unknown to recognized, from doubt to conviction",
        })
    else:
        chars.append({
            "name": "Kai",
            "role": "protagonist",
            "based_on": "The reader — discovering the content for the first time",
            "visual_description": "Young, curious eyes, casual clothes, messy hair",
            "speech_style": "Asks direct questions, expresses wonder",
            "arc": "From curious newcomer to informed practitioner",
        })

    chars.append({
        "name": "The Sage",
        "role": "mentor",
        "based_on": "The author's distilled wisdom",
        "visual_description": "Calm, knowing half-smile, simple clean attire",
        "speech_style": "Speaks in principles, uses analogies",
        "arc": "Reveals deeper layers of understanding over time",
    })

    return chars


def _fallback_blueprint(
    knowledge_doc: dict,
    canonical_chapters: list[dict],
    style: SummaryStyle,
) -> dict:
    """Minimal fallback when the LLM call fails."""
    characters = _default_characters(knowledge_doc)
    protagonist = characters[0]["name"]
    mentor = characters[1]["name"] if len(characters) > 1 else "The Sage"

    scenes = []
    for i, ch in enumerate(canonical_chapters):
        idx = ch.get("chapter_index", i)
        title = ch.get("chapter_title", f"Chapter {idx}")
        concepts = ch.get("key_concepts", [])
        dramatic = ch.get("dramatic_moment", ch.get("one_liner", ""))

        # Opening scene for each chapter
        scenes.append({
            "scene_index": len(scenes),
            "chapter_source": idx,
            "scene_title": title,
            "scene_type": "exposition" if i == 0 else "revelation",
            "what_happens": ch.get("narrative_summary", ch.get("one_liner", ""))[:200],
            "key_content": concepts[:4],
            "characters_present": [protagonist, mentor],
            "dialogue_beats": [
                {"character": protagonist, "says": f"What about {concepts[0]}?" if concepts else "Tell me more.", "emotion": "curious"},
                {"character": mentor, "says": dramatic or "Let me show you...", "emotion": "wise"},
            ],
            "visual_direction": "Dynamic panel with speed lines for emphasis",
            "mood": "intense" if i == len(canonical_chapters) // 2 else "mysterious",
            "panel_suggestion": "dialogue-heavy",
        })

    # Data points from knowledge doc
    data_points = knowledge_doc.get("data_points", [])
    must_include = [d.get("fact", "") for d in data_points[:10]]

    return {
        "manga_title": knowledge_doc.get("core_thesis", "A Journey of Knowledge")[:60],
        "logline": knowledge_doc.get("what_makes_this_interesting", "An exploration worth reading."),
        "world": {
            "setting": "A world where ideas are the ultimate currency.",
            "visual_style": "Deep navy bg, amber highlights, white ink lines. Midnight study session energy.",
            "core_metaphor": "A torch lighting the way through darkness",
            "recurring_motifs": ["Light and shadow", "Open books", "Forking paths"],
        },
        "characters": characters,
        "narrative_arc": {
            "act_one": f"Chapters 0-{len(canonical_chapters)//3}: Foundation and problem framing",
            "act_two": f"Mid chapters: Core ideas and complexity",
            "act_three": f"Final chapters: Application and synthesis",
            "emotional_journey": "Curiosity → struggle → breakthrough → empowerment",
        },
        "scenes": scenes,
        "must_include_facts": must_include,
    }


# ────────────────────────────────────────────────────────────
# CONVERSION HELPERS — bridge to planner/DSL generator
# ────────────────────────────────────────────────────────────

def blueprint_to_synopsis(blueprint: dict) -> dict:
    """Extract a synopsis-compatible dict from the blueprint.

    This maintains backward compatibility with code that expects
    the old synopsis format (planner context builder, etc.).
    """
    arc = blueprint.get("narrative_arc", {})
    scenes = blueprint.get("scenes", [])

    return {
        "book_thesis": blueprint.get("logline", ""),
        "core_conflict": arc.get("act_two", ""),
        "narrative_arc": f"{arc.get('act_one', '')} {arc.get('act_two', '')} {arc.get('act_three', '')}",
        "protagonist_arc": arc.get("emotional_journey", ""),
        "world_description": blueprint.get("world", {}).get("setting", ""),
        "core_metaphor": blueprint.get("world", {}).get("core_metaphor", ""),
        "act_one": arc.get("act_one", ""),
        "act_two": arc.get("act_two", ""),
        "act_three": arc.get("act_three", ""),
        "emotional_journey": arc.get("emotional_journey", ""),
        "manga_story_beats": [
            f"{s.get('scene_title', '')}: {s.get('what_happens', '')}"
            for s in scenes
        ],
        "key_facts_to_preserve": blueprint.get("must_include_facts", []),
    }


def blueprint_to_bible(blueprint: dict, canonical_chapters: list[dict]) -> dict:
    """Extract a bible-compatible dict from the blueprint.

    This maintains backward compatibility with code that expects
    the old manga bible format (DSL generator, etc.).
    """
    world = blueprint.get("world", {})
    characters = blueprint.get("characters", [])
    scenes = blueprint.get("scenes", [])

    # Build chapter plans from scenes
    chapter_plans = {}
    for scene in scenes:
        ch_idx = scene.get("chapter_source", 0)
        if ch_idx not in chapter_plans:
            chapter_plans[ch_idx] = {
                "chapter_index": ch_idx,
                "mood": scene.get("mood", "reflective"),
                "dramatic_beat": scene.get("what_happens", ""),
                "image_theme": scene.get("visual_direction", ""),
                "panel_emphasis": scene.get("panel_suggestion", "balanced"),
            }

    # Ensure all chapters have plans
    for ch in canonical_chapters:
        idx = ch.get("chapter_index", 0)
        if idx not in chapter_plans:
            chapter_plans[idx] = {
                "chapter_index": idx,
                "mood": "reflective",
                "dramatic_beat": ch.get("dramatic_moment", ch.get("one_liner", "")),
                "image_theme": ch.get("metaphor", ""),
                "panel_emphasis": "balanced",
            }

    return {
        "world_description": world.get("setting", ""),
        "color_palette": world.get("visual_style", ""),
        "characters": [
            {
                "name": c.get("name", ""),
                "role": c.get("role", "protagonist"),
                "visual_description": c.get("visual_description", ""),
                "speech_style": c.get("speech_style", ""),
                "represents": c.get("based_on", ""),
            }
            for c in characters
        ],
        "recurring_motifs": world.get("recurring_motifs", []),
        "chapter_plans": sorted(
            chapter_plans.values(),
            key=lambda p: p.get("chapter_index", 0),
        ),
    }
