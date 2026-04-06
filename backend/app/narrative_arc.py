"""
narrative_arc.py — Three-Act Narrative Structure Builder
=========================================================
Takes a KnowledgeGraph + knowledge document and produces a
structured 3-act narrative arc for the manga.

WHY THIS EXISTS:
The current pipeline asks the LLM to design scenes all at once.
This stage provides a STRUCTURED skeleton that the scene designer
and planner can follow — ensuring every manga has:
- Act 1 (Setup ~30%): introduce world, characters, the question
- Act 2 (Confrontation ~40%): develop arguments, show evidence, conflicts
- Act 3 (Resolution ~30%): conclusions, impact, emotional payoff

The narrative arc is a pure data structure — no LLM calls needed.
It's built from the knowledge graph and knowledge document using
rules, not vibes.
"""

import logging
import math
from typing import Optional

from app.knowledge_graph import KnowledgeGraph

logger = logging.getLogger(__name__)


class NarrativeBeat:
    """A single story moment that must appear in the manga."""

    __slots__ = (
        "beat_id", "act", "beat_type", "title", "content",
        "entities", "source_chapter", "dramatic_weight",
        "suggested_panel_type", "suggested_scene",
    )

    def __init__(
        self,
        beat_id: str,
        act: int,
        beat_type: str,
        title: str,
        content: str,
        entities: list[str],
        source_chapter: int = 0,
        dramatic_weight: float = 0.5,
        suggested_panel_type: str = "dialogue",
        suggested_scene: str = "",
    ) -> None:
        self.beat_id = beat_id
        self.act = act
        self.beat_type = beat_type
        self.title = title
        self.content = content
        self.entities = entities
        self.source_chapter = source_chapter
        self.dramatic_weight = dramatic_weight
        self.suggested_panel_type = suggested_panel_type
        self.suggested_scene = suggested_scene

    def to_dict(self) -> dict:
        return {
            "beat_id": self.beat_id,
            "act": self.act,
            "beat_type": self.beat_type,
            "title": self.title,
            "content": self.content,
            "entities": self.entities,
            "source_chapter": self.source_chapter,
            "dramatic_weight": self.dramatic_weight,
            "suggested_panel_type": self.suggested_panel_type,
            "suggested_scene": self.suggested_scene,
        }


class NarrativeArc:
    """A three-act narrative structure for a manga adaptation."""

    def __init__(self) -> None:
        self.acts: dict[int, list[NarrativeBeat]] = {1: [], 2: [], 3: []}
        self.theme: str = ""
        self.central_question: str = ""
        self.emotional_journey: str = ""

    @property
    def all_beats(self) -> list[NarrativeBeat]:
        return self.acts[1] + self.acts[2] + self.acts[3]

    @property
    def total_beats(self) -> int:
        return sum(len(b) for b in self.acts.values())

    def to_dict(self) -> dict:
        return {
            "theme": self.theme,
            "central_question": self.central_question,
            "emotional_journey": self.emotional_journey,
            "acts": {
                str(act): [b.to_dict() for b in beats]
                for act, beats in self.acts.items()
            },
            "total_beats": self.total_beats,
            "beat_distribution": {
                "act_1": len(self.acts[1]),
                "act_2": len(self.acts[2]),
                "act_3": len(self.acts[3]),
            },
        }

    def to_planner_context(self) -> str:
        """Format the arc as context for the planner LLM."""
        lines = [
            "=== NARRATIVE ARC (3-Act Structure) ===",
            f"Central Question: {self.central_question}",
            f"Theme: {self.theme}",
            f"Emotional Journey: {self.emotional_journey}",
            "",
        ]

        act_names = {1: "SETUP", 2: "CONFRONTATION", 3: "RESOLUTION"}
        for act_num in (1, 2, 3):
            beats = self.acts[act_num]
            lines.append(f"--- ACT {act_num}: {act_names[act_num]} ({len(beats)} beats) ---")
            for beat in beats:
                lines.append(
                    f"  [{beat.beat_type}] {beat.title}"
                    f" (ch.{beat.source_chapter}, weight={beat.dramatic_weight:.1f})"
                )
                lines.append(f"    → {beat.content[:120]}")
                if beat.entities:
                    lines.append(f"    Characters: {', '.join(beat.entities[:4])}")
                lines.append(f"    Panel type: {beat.suggested_panel_type}")
                if beat.suggested_scene:
                    lines.append(f"    Scene: {beat.suggested_scene}")
            lines.append("")

        return "\n".join(lines)


def build_narrative_arc(
    graph: KnowledgeGraph,
    knowledge_doc: dict,
    canonical_chapters: list[dict],
    target_beats: int = 0,
) -> NarrativeArc:
    """Build a 3-act narrative arc from the knowledge graph.

    This is RULE-BASED, not LLM-based. The rules encode manga storytelling
    structure so the downstream LLM gets a skeleton to fill, not a blank page.

    Parameters
    ----------
    graph : KnowledgeGraph
        The entity/relationship graph.
    knowledge_doc : dict
        Full knowledge document from stage_document_understanding.
    canonical_chapters : list[dict]
        The chapter data.
    target_beats : int
        Target number of beats (0 = auto-calculate from chapter count).
    """
    arc = NarrativeArc()

    # Set the theme from the knowledge doc
    arc.theme = knowledge_doc.get("core_thesis", "A story of discovery")
    arc.central_question = knowledge_doc.get(
        "what_makes_this_interesting",
        arc.theme,
    )

    emotional = knowledge_doc.get("emotional_arc", {})
    arc.emotional_journey = (
        f"{emotional.get('opening_mood', 'Curiosity')} → "
        f"{emotional.get('climax', 'Revelation')} → "
        f"{emotional.get('resolution', 'Understanding')}"
    )

    # Calculate target beats per act
    n_chapters = len(canonical_chapters)
    if target_beats <= 0:
        # ~2-3 beats per chapter, minimum 6 total
        target_beats = max(6, n_chapters * 3)
        target_beats = min(target_beats, 30)  # cap for sanity

    act_1_target = max(2, math.ceil(target_beats * 0.30))
    act_2_target = max(2, math.ceil(target_beats * 0.40))
    act_3_target = max(2, target_beats - act_1_target - act_2_target)

    # Assign chapters to acts based on position
    act_boundaries = _assign_chapters_to_acts(
        canonical_chapters, act_1_target, act_2_target, act_3_target,
    )

    beat_counter = 0
    top_entities = [e["name"] for e in graph.central_entities[:5]]

    for ch_idx, chapter in enumerate(canonical_chapters):
        act = act_boundaries[ch_idx]
        beats = _generate_chapter_beats(
            chapter, ch_idx, act, graph, knowledge_doc,
            top_entities, beat_counter,
        )
        for beat in beats:
            arc.acts[act].append(beat)
            beat_counter += 1

    # Add structural beats (opening hook, climax, resolution)
    _add_structural_beats(arc, knowledge_doc, graph)

    logger.info(
        f"Narrative arc: {arc.total_beats} beats "
        f"(Act 1: {len(arc.acts[1])}, Act 2: {len(arc.acts[2])}, "
        f"Act 3: {len(arc.acts[3])})"
    )

    return arc


def _assign_chapters_to_acts(
    chapters: list[dict],
    act_1_target: int,
    act_2_target: int,
    act_3_target: int,
) -> dict[int, int]:
    """Assign each chapter to an act based on position.

    Simple rule: first 30% → Act 1, next 40% → Act 2, last 30% → Act 3.
    """
    n = len(chapters)
    if n <= 2:
        # Very short: ch0 = Act 1, ch1+ = Act 3
        return {i: (1 if i == 0 else 3) for i in range(n)}

    act_1_end = max(1, round(n * 0.30))
    act_2_end = max(act_1_end + 1, round(n * 0.70))

    mapping = {}
    for i in range(n):
        if i < act_1_end:
            mapping[i] = 1
        elif i < act_2_end:
            mapping[i] = 2
        else:
            mapping[i] = 3

    return mapping


def _generate_chapter_beats(
    chapter: dict,
    ch_idx: int,
    act: int,
    graph: KnowledgeGraph,
    knowledge_doc: dict,
    top_entities: list[str],
    beat_offset: int,
) -> list[NarrativeBeat]:
    """Generate narrative beats for a single chapter.

    Rules:
    - Every chapter gets at least 1 beat (its core concept)
    - Chapters with dramatic moments get an extra beat
    - Chapters with key quotes get an extra beat
    - Data-heavy chapters get a data visualization beat
    """
    beats = []
    title = chapter.get("chapter_title", f"Chapter {ch_idx}")
    one_liner = chapter.get("one_liner", "")
    dramatic = chapter.get("dramatic_moment", "")
    key_concepts = chapter.get("key_concepts", [])
    narrative = chapter.get("narrative_summary", "")

    # Find which top entities appear in this chapter
    chapter_text = f"{title} {one_liner} {narrative}".lower()
    present_entities = [
        e for e in top_entities
        if e.lower() in chapter_text
    ]

    # Beat 1: Core concept (always present)
    panel_type = _suggest_panel_type(act, "core", ch_idx == 0)
    scene = _suggest_scene(chapter, act)
    beats.append(NarrativeBeat(
        beat_id=f"beat-{beat_offset + len(beats)}",
        act=act,
        beat_type="core",
        title=title,
        content=one_liner or narrative[:120],
        entities=present_entities[:3],
        source_chapter=ch_idx,
        dramatic_weight=0.6,
        suggested_panel_type=panel_type,
        suggested_scene=scene,
    ))

    # Beat 2: Dramatic moment (if present)
    if dramatic and len(dramatic) > 10:
        beats.append(NarrativeBeat(
            beat_id=f"beat-{beat_offset + len(beats)}",
            act=act,
            beat_type="dramatic",
            title=f"{title} — The Moment",
            content=dramatic[:150],
            entities=present_entities[:3],
            source_chapter=ch_idx,
            dramatic_weight=0.8,
            suggested_panel_type="splash" if act == 2 else "dialogue",
            suggested_scene=scene,
        ))

    # Beat 3: Data visualization (if chapter has numeric data)
    data_points = _find_data_in_chapter(chapter, knowledge_doc)
    if data_points:
        beats.append(NarrativeBeat(
            beat_id=f"beat-{beat_offset + len(beats)}",
            act=act,
            beat_type="data",
            title=f"{title} — By The Numbers",
            content="; ".join(data_points[:3]),
            entities=present_entities[:2],
            source_chapter=ch_idx,
            dramatic_weight=0.5,
            suggested_panel_type="data",
            suggested_scene=scene,
        ))

    # Beat 4: Key quote/dialogue (if present)
    quotes = _find_quotes_for_chapter(ch_idx, knowledge_doc)
    if quotes:
        beats.append(NarrativeBeat(
            beat_id=f"beat-{beat_offset + len(beats)}",
            act=act,
            beat_type="dialogue",
            title=f"{title} — In Their Words",
            content=quotes[0].get("text", "")[:120],
            entities=present_entities[:3],
            source_chapter=ch_idx,
            dramatic_weight=0.65,
            suggested_panel_type="dialogue",
            suggested_scene=scene,
        ))

    return beats


def _suggest_panel_type(act: int, beat_type: str, is_first: bool) -> str:
    """Suggest a panel type based on act and beat type."""
    if is_first:
        return "splash"

    type_map = {
        "core": "dialogue",
        "dramatic": "splash",
        "data": "data",
        "dialogue": "dialogue",
        "resolution": "narration",
    }
    return type_map.get(beat_type, "dialogue")


def _suggest_scene(chapter: dict, act: int) -> str:
    """Suggest an illustration scene based on chapter content."""
    text = f"{chapter.get('chapter_title', '')} {chapter.get('one_liner', '')}".lower()

    # Keyword-to-scene mapping
    scene_hints = {
        "laboratory": ["lab", "research", "experiment", "study", "analysis"],
        "digital-realm": ["code", "software", "algorithm", "data", "compute", "ai", "model"],
        "battlefield": ["compete", "benchmark", "versus", "fight", "challenge", "battle"],
        "workshop": ["build", "create", "design", "architect", "develop", "engineer"],
        "summit": ["achieve", "result", "conclusion", "success", "impact", "peak"],
        "classroom": ["learn", "teach", "train", "education", "tutorial", "guide"],
        "void": ["unknown", "mystery", "question", "problem", "challenge"],
    }

    for scene, keywords in scene_hints.items():
        if any(kw in text for kw in keywords):
            return scene

    # Default by act
    act_defaults = {1: "classroom", 2: "digital-realm", 3: "summit"}
    return act_defaults.get(act, "laboratory")


def _find_data_in_chapter(chapter: dict, knowledge_doc: dict) -> list[str]:
    """Find data points that belong to a chapter."""
    ch_idx = chapter.get("chapter_index", -1)
    narrative = chapter.get("narrative_summary", "").lower()

    relevant = []
    for dp in knowledge_doc.get("data_points", []):
        fact = dp.get("fact", "")
        # Check if this data point's text appears in the chapter narrative
        if fact.lower()[:30] in narrative:
            relevant.append(fact)
        elif len(relevant) < 2 and any(
            c.isdigit() for c in fact
        ) and ch_idx < len(knowledge_doc.get("knowledge_clusters", [])):
            relevant.append(fact)

    return relevant[:3]


def _find_quotes_for_chapter(
    ch_idx: int,
    knowledge_doc: dict,
) -> list[dict]:
    """Find quotable moments that belong to a chapter."""
    return [
        q for q in knowledge_doc.get("quotable_moments", [])
        if q.get("chapter_ref") == ch_idx
    ]


def _add_structural_beats(
    arc: NarrativeArc,
    knowledge_doc: dict,
    graph: KnowledgeGraph,
) -> None:
    """Add mandatory structural beats at act boundaries.

    Every good manga has:
    - An opening hook (Act 1 start)
    - A midpoint crisis (Act 2 middle)
    - A climax (Act 2 end / Act 3 start)
    - A resolution (Act 3 end)
    """
    emotional = knowledge_doc.get("emotional_arc", {})
    top_entity = graph.central_entities[0]["name"] if graph.central_entities else "Hero"
    argument = knowledge_doc.get("argument_structure", {})

    # Opening hook — insert at start of Act 1
    premise = argument.get("opening_premise", knowledge_doc.get("core_thesis", ""))
    if premise:
        hook = NarrativeBeat(
            beat_id="beat-hook",
            act=1,
            beat_type="hook",
            title="The Question",
            content=premise[:150],
            entities=[top_entity],
            source_chapter=0,
            dramatic_weight=1.0,
            suggested_panel_type="splash",
            suggested_scene="void",
        )
        arc.acts[1].insert(0, hook)

    # Climax — insert at end of Act 2
    climax = emotional.get("climax", "")
    if climax:
        climax_beat = NarrativeBeat(
            beat_id="beat-climax",
            act=2,
            beat_type="climax",
            title="The Revelation",
            content=climax[:150],
            entities=[top_entity],
            source_chapter=max(0, len(arc.acts[2]) - 1),
            dramatic_weight=1.0,
            suggested_panel_type="splash",
            suggested_scene="battlefield",
        )
        arc.acts[2].append(climax_beat)

    # Resolution — insert at end of Act 3
    conclusion = argument.get("conclusion", "")
    resolution = emotional.get("resolution", "")
    ending = conclusion or resolution
    if ending:
        resolution_beat = NarrativeBeat(
            beat_id="beat-resolution",
            act=3,
            beat_type="resolution",
            title="The New Understanding",
            content=ending[:150],
            entities=[top_entity],
            source_chapter=max(0, len(arc.acts[3]) - 1),
            dramatic_weight=0.9,
            suggested_panel_type="narration",
            suggested_scene="summit",
        )
        arc.acts[3].append(resolution_beat)
