"""
stage_document_understanding.py — Phase 1: Deep Document Understanding
========================================================================
The brain of the manga pipeline. Before we can DESIGN a manga, we need
to deeply understand what the document is actually about.

WHAT THIS REPLACES:
Old flow: per-chapter summaries → synopsis (from summaries) → bible (from summaries)
New flow: per-chapter summaries → FULL DOCUMENT UNDERSTANDING → manga story design

WHY THIS EXISTS:
NotebookLM, SurfSense, and Open-Notebook all follow the same pattern:
1. Ingest ALL the content
2. Build a rich internal knowledge representation
3. Generate different OUTPUT FORMATS from that understanding

We were skipping step 2 — going straight from compressed summaries to
manga planning. The result was a manga built from a skeleton instead
of from deep understanding.

The Knowledge Document this stage produces is the SINGLE SOURCE OF TRUTH
that everything downstream derives from.
"""

import logging
from app.llm_client import LLMClient

logger = logging.getLogger(__name__)


UNDERSTANDING_SYSTEM_PROMPT = """You are a world-class knowledge architect. Your job is to deeply
understand a document and produce a comprehensive knowledge map that captures EVERYTHING
important about it — not as a summary, but as a structured understanding.

Think like a brilliant reader who has read the document 3 times and can now explain
it to anyone. You understand the thesis, the arguments, the evidence, the emotional
arc, and most importantly — what makes this document WORTH reading.

OUTPUT FORMAT — valid JSON object:
{
  "document_type": "string — what kind of document is this? (e.g. 'technical book', 'resume/portfolio', 'research paper', 'business report', 'personal narrative', 'tutorial/guide')",
  "core_thesis": "string — the single most important idea in 1-2 sentences",
  "target_audience": "string — who is this written for?",

  "key_entities": [
    {
      "name": "string — person, org, concept, or technology",
      "type": "string — person | organization | concept | technology | place | event",
      "significance": "string — why does this matter in the document?",
      "first_appearance": "string — when/where this entity first appears"
    }
  ],

  "argument_structure": {
    "opening_premise": "string — what problem or question does the document start with?",
    "key_arguments": ["string — each major argument or claim the document makes"],
    "evidence_types": ["string — what kinds of evidence are used? (data, anecdotes, case studies, etc.)"],
    "conclusion": "string — what does the document ultimately argue or conclude?"
  },

  "knowledge_clusters": [
    {
      "theme": "string — the topic/theme of this cluster",
      "key_facts": ["string — specific facts, numbers, dates, achievements under this theme"],
      "insights": ["string — non-obvious insights or connections related to this theme"],
      "source_chapters": [0, 1]
    }
  ],

  "emotional_arc": {
    "opening_mood": "string — how does the document feel at the start?",
    "turning_points": ["string — moments where the emotional tone shifts"],
    "climax": "string — the most emotionally intense or intellectually powerful moment",
    "resolution": "string — how does it feel at the end?"
  },

  "quotable_moments": [
    {
      "text": "string — the exact quote or paraphrase",
      "context": "string — why this matters",
      "chapter_ref": 0
    }
  ],

  "data_points": [
    {
      "fact": "string — a specific number, date, achievement, or measurable claim",
      "significance": "string — why this data point matters"
    }
  ],

  "relationships": [
    {
      "from": "string — entity name",
      "to": "string — entity name",
      "relationship": "string — how they relate (e.g. 'mentored by', 'built using', 'conflicts with')"
    }
  ],

  "what_makes_this_interesting": "string — in 2-3 sentences, what makes this document worth turning into a manga? What's the hook?"
}

RULES:
- Return ONLY the JSON. No markdown, no explanation.
- key_entities: 5-15 entries. Capture every important person, concept, and technology.
- knowledge_clusters: 3-8 clusters that organize the document's content thematically.
- data_points: capture EVERY specific number, date, percentage, or measurable claim.
- quotable_moments: 3-8 of the most powerful or memorable lines/ideas.
- relationships: map how entities connect to each other (this drives manga character dynamics).
- Be EXHAUSTIVE with facts. The manga pipeline will use this to decide what to show.
  Missing a fact here = missing it in the manga.
- Think about what would make each piece of content VISUAL and DRAMATIC for manga."""


def _build_understanding_input(canonical_chapters: list[dict]) -> str:
    """Build a rich input document from all canonical chapters.

    We include the FULL narrative summaries, key concepts, dramatic moments,
    and quotes — everything the per-chapter LLM extracted. This is the
    richest compressed representation of the document we have.
    """
    sections = []
    for ch in canonical_chapters:
        idx = ch.get("chapter_index", 0)
        title = ch.get("chapter_title", f"Chapter {idx}")
        parts = [
            f"═══ CHAPTER {idx}: {title} ═══",
            f"One-liner: {ch.get('one_liner', '')}",
        ]

        concepts = ch.get("key_concepts", [])
        if concepts:
            parts.append(f"Key concepts: {', '.join(concepts)}")

        narrative = ch.get("narrative_summary", "")
        if narrative:
            parts.append(f"Full summary:\n{narrative}")

        dramatic = ch.get("dramatic_moment", "")
        if dramatic:
            parts.append(f"Dramatic moment: {dramatic}")

        metaphor = ch.get("metaphor", "")
        if metaphor:
            parts.append(f"Metaphor: {metaphor}")

        quotes = ch.get("memorable_quotes", [])
        if quotes:
            parts.append("Quotes: " + " | ".join(f'"{q}"' for q in quotes))

        actions = ch.get("action_items", [])
        if actions:
            parts.append("Action items: " + "; ".join(actions))

        # Include narrative state updates for richer understanding
        state = ch.get("narrative_state_update", {})
        if state:
            new_chars = state.get("new_characters", [])
            if new_chars:
                parts.append(f"New entities: {', '.join(new_chars)}")
            threads = state.get("unresolved_threads", [])
            if threads:
                parts.append(f"Open threads: {'; '.join(threads)}")
            shift = state.get("emotional_shift", "")
            if shift:
                parts.append(f"Emotional shift: {shift}")

        sections.append("\n".join(parts))

    return "\n\n".join(sections)


def _unwrap_parsed(parsed) -> dict:
    """Safely unwrap LLM parsed output to a dict.

    LLMs sometimes wrap JSON responses in an array instead of returning
    a bare object. This caused both v2 stages to crash with:
        'list' object has no attribute 'get'
    """
    if isinstance(parsed, dict):
        return parsed
    if isinstance(parsed, list) and parsed:
        # Take the first dict element — the LLM wrapped the response
        for item in parsed:
            if isinstance(item, dict):
                logger.info("Unwrapped list→dict from LLM response")
                return item
    return {}


async def generate_document_understanding(
    canonical_chapters: list[dict],
    llm_client: LLMClient,
) -> dict:
    """
    Deep understanding of the entire document.

    Takes ALL canonical chapter summaries and produces a comprehensive
    Knowledge Document — the single source of truth for manga design.

    This is the key architectural difference from the old pipeline:
    instead of building manga from per-chapter summaries, we first
    build a holistic understanding, THEN design the manga from it.
    """
    chapters_text = _build_understanding_input(canonical_chapters)
    n = len(canonical_chapters)

    user_message = f"""DOCUMENT CONTENT ({n} chapters/sections):

{chapters_text}

Analyze this document deeply. Capture EVERYTHING that matters — every entity,
every data point, every relationship, every emotional beat. The manga pipeline
depends on the completeness of your analysis. Missing something here means
it won't appear in the manga.

Build the complete knowledge map now."""

    logger.info(f"Generating deep document understanding from {n} chapters")

    # Scale tokens with document size — more chapters = richer understanding needed
    # Previous limit (7500 for 10ch) caused truncation and silent fallbacks.
    # The knowledge document is the SINGLE SOURCE OF TRUTH — don't starve it.
    max_tokens = min(16000, 4000 + n * 1000)

    result = await llm_client.chat_with_retry(
        system_prompt=UNDERSTANDING_SYSTEM_PROMPT,
        user_message=user_message,
        max_tokens=max_tokens,
        temperature=0.4,  # Lower temp for analytical accuracy
        json_mode=True,
    )

    knowledge_doc = _unwrap_parsed(result.get("parsed"))

    if not knowledge_doc or not knowledge_doc.get("core_thesis"):
        logger.warning("Document understanding failed — using fallback")
        knowledge_doc = _fallback_understanding(canonical_chapters)

    # Log what we captured
    n_entities = len(knowledge_doc.get("key_entities", []))
    n_clusters = len(knowledge_doc.get("knowledge_clusters", []))
    n_data = len(knowledge_doc.get("data_points", []))
    logger.info(
        f"Document understanding: {n_entities} entities, "
        f"{n_clusters} knowledge clusters, {n_data} data points"
    )
    return knowledge_doc


def _fallback_understanding(canonical_chapters: list[dict]) -> dict:
    """Minimal fallback when LLM call fails."""
    all_concepts = []
    all_quotes = []
    for ch in canonical_chapters:
        all_concepts.extend(ch.get("key_concepts", []))
        all_quotes.extend(ch.get("memorable_quotes", []))

    # Build basic entities from narrative state updates
    entities = []
    seen_names = set()
    for ch in canonical_chapters:
        state = ch.get("narrative_state_update", {})
        for char in state.get("new_characters", []):
            name = char.split("(")[0].strip() if "(" in char else char
            if name not in seen_names:
                entities.append({
                    "name": name,
                    "type": "person",
                    "significance": "Mentioned in the document",
                    "first_appearance": f"Chapter {ch.get('chapter_index', 0)}",
                })
                seen_names.add(name)

    n = len(canonical_chapters)
    return {
        "document_type": "unknown",
        "core_thesis": (
            canonical_chapters[0].get("one_liner", "A journey of knowledge")
            if canonical_chapters else "A journey of knowledge"
        ),
        "target_audience": "General readers",
        "key_entities": entities[:10],
        "argument_structure": {
            "opening_premise": canonical_chapters[0].get("one_liner", "") if canonical_chapters else "",
            "key_arguments": [ch.get("one_liner", "") for ch in canonical_chapters if ch.get("one_liner")],
            "evidence_types": ["narrative"],
            "conclusion": canonical_chapters[-1].get("one_liner", "") if canonical_chapters else "",
        },
        "knowledge_clusters": [
            {
                "theme": ch.get("chapter_title", f"Section {i}"),
                "key_facts": ch.get("key_concepts", []),
                "insights": [ch.get("one_liner", "")],
                "source_chapters": [ch.get("chapter_index", i)],
            }
            for i, ch in enumerate(canonical_chapters)
        ],
        "emotional_arc": {
            "opening_mood": "curious",
            "turning_points": [],
            "climax": canonical_chapters[n // 2].get("dramatic_moment", "") if canonical_chapters else "",
            "resolution": "informed",
        },
        "quotable_moments": [
            {"text": q, "context": "From the document", "chapter_ref": 0}
            for q in all_quotes[:5]
        ],
        "data_points": [
            {"fact": c, "significance": "Key concept"} for c in all_concepts[:8]
        ],
        "relationships": [],
        "what_makes_this_interesting": "An exploration of ideas worth understanding.",
    }
