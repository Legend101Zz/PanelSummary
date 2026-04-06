"""
Tests for Phase 3: Knowledge Graph, Narrative Arc, Scene Composer
"""

import pytest
from app.knowledge_graph import KnowledgeGraph, build_knowledge_graph
from app.narrative_arc import (
    build_narrative_arc,
    NarrativeArc,
    NarrativeBeat,
    _assign_chapters_to_acts,
)
from app.scene_composer import compose_scene_directions, _extract_color


# ── Fixtures ──────────────────────────────────────────────────

@pytest.fixture
def sample_knowledge_doc():
    return {
        "core_thesis": "LIVE-SWE-AGENT evolves during real battles",
        "document_type": "research paper",
        "target_audience": "AI researchers",
        "key_entities": [
            {"name": "LIVE-SWE-AGENT", "type": "technology", "significance": "The protagonist system"},
            {"name": "Dr. Chen", "type": "person", "significance": "Lead researcher"},
            {"name": "SWE-bench", "type": "concept", "significance": "The benchmark arena"},
            {"name": "CodeForge", "type": "technology", "significance": "The code generation engine"},
        ],
        "relationships": [
            {"from": "LIVE-SWE-AGENT", "to": "SWE-bench", "relationship": "competes in"},
            {"from": "Dr. Chen", "to": "LIVE-SWE-AGENT", "relationship": "created"},
            {"from": "LIVE-SWE-AGENT", "to": "CodeForge", "relationship": "built using"},
            {"from": "CodeForge", "to": "SWE-bench", "relationship": "challenges"},
        ],
        "knowledge_clusters": [
            {
                "theme": "Architecture",
                "key_facts": ["LIVE-SWE-AGENT uses tree-of-thought reasoning", "CodeForge compiles patches"],
                "insights": ["The system learns from failures"],
                "source_chapters": [0, 1],
            },
            {
                "theme": "Results",
                "key_facts": ["Achieved 77.4% on SWE-bench", "Beat previous SOTA by 12%"],
                "insights": ["Real-time evolution is the key differentiator"],
                "source_chapters": [2],
            },
        ],
        "emotional_arc": {
            "opening_mood": "Curiosity",
            "turning_points": ["The first benchmark failure", "The breakthrough"],
            "climax": "LIVE-SWE-AGENT achieves 77.4% — shattering the record",
            "resolution": "A new paradigm emerges",
        },
        "argument_structure": {
            "opening_premise": "Can AI agents evolve during deployment?",
            "key_arguments": ["Real-time learning is possible", "Static agents are limited"],
            "evidence_types": ["benchmarks", "case studies"],
            "conclusion": "Live evolution outperforms static training",
        },
        "quotable_moments": [
            {"text": "I don't just follow instructions.", "context": "Agent autonomy", "chapter_ref": 0},
            {"text": "77.4 percent. Impossible.", "context": "The reveal", "chapter_ref": 2},
        ],
        "data_points": [
            {"fact": "77.4% accuracy on SWE-bench", "significance": "New SOTA"},
            {"fact": "12% improvement over previous best", "significance": "Massive jump"},
        ],
        "what_makes_this_interesting": "An AI that gets better while fighting is genuinely terrifying and exciting",
    }


@pytest.fixture
def sample_chapters():
    return [
        {
            "chapter_index": 0,
            "chapter_title": "The Problem",
            "one_liner": "Why current agents fail at real-world tasks",
            "narrative_summary": "Static AI agents are limited by their training data. LIVE-SWE-AGENT proposes a new approach.",
            "key_concepts": ["static agents", "live evolution"],
            "dramatic_moment": "Dr. Chen watches the first agent fail spectacularly",
        },
        {
            "chapter_index": 1,
            "chapter_title": "The Architecture",
            "one_liner": "How LIVE-SWE-AGENT is built",
            "narrative_summary": "The system uses tree-of-thought reasoning with CodeForge engine.",
            "key_concepts": ["tree-of-thought", "CodeForge"],
            "dramatic_moment": "The first successful code patch",
        },
        {
            "chapter_index": 2,
            "chapter_title": "The Results",
            "one_liner": "Benchmark domination",
            "narrative_summary": "LIVE-SWE-AGENT achieves 77.4% on SWE-bench, beating the previous SOTA by 12%.",
            "key_concepts": ["SWE-bench", "SOTA"],
            "dramatic_moment": "The moment the results appear on screen",
        },
        {
            "chapter_index": 3,
            "chapter_title": "The Future",
            "one_liner": "What live evolution means for AI",
            "narrative_summary": "The implications of agents that learn in real-time.",
            "key_concepts": ["future", "implications"],
            "dramatic_moment": "",
        },
    ]


# ── Knowledge Graph Tests ─────────────────────────────────────

class TestKnowledgeGraph:
    def test_build_from_knowledge_doc(self, sample_knowledge_doc):
        graph = build_knowledge_graph(sample_knowledge_doc)
        assert len(graph.entities) >= 4
        assert len(graph.edges) >= 4
        assert "LIVE-SWE-AGENT" in graph.entities

    def test_central_entities(self, sample_knowledge_doc):
        graph = build_knowledge_graph(sample_knowledge_doc)
        central = graph.central_entities
        # LIVE-SWE-AGENT should be most connected (it has 3 edges)
        assert central[0]["name"] == "LIVE-SWE-AGENT"

    def test_dramatic_weight_scoring(self, sample_knowledge_doc):
        graph = build_knowledge_graph(sample_knowledge_doc)
        # LIVE-SWE-AGENT is mentioned in thesis, climax, and interesting
        # It should have the highest dramatic weight (normalized to 1.0)
        agent = graph.entities["LIVE-SWE-AGENT"]
        assert agent["dramatic_weight"] == 1.0

    def test_conflict_detection(self, sample_knowledge_doc):
        # Add a conflict relationship
        sample_knowledge_doc["relationships"].append(
            {"from": "LIVE-SWE-AGENT", "to": "OldAgent", "relationship": "challenges and conflicts with"}
        )
        graph = build_knowledge_graph(sample_knowledge_doc)
        assert len(graph.conflict_pairs) >= 1

    def test_mentor_detection(self, sample_knowledge_doc):
        graph = build_knowledge_graph(sample_knowledge_doc)
        mentors = graph.mentor_pairs
        # "Dr. Chen created LIVE-SWE-AGENT" should be detected
        assert any(e["from"] == "Dr. Chen" for e in mentors)

    def test_subgraph_around(self, sample_knowledge_doc):
        graph = build_knowledge_graph(sample_knowledge_doc)
        neighbors = graph.subgraph_around("LIVE-SWE-AGENT", depth=1)
        assert "SWE-bench" in neighbors
        assert "Dr. Chen" in neighbors

    def test_to_dict(self, sample_knowledge_doc):
        graph = build_knowledge_graph(sample_knowledge_doc)
        d = graph.to_dict()
        assert "entities" in d
        assert "edges" in d
        assert "stats" in d
        assert d["stats"]["entity_count"] >= 4

    def test_co_occurrence_edges(self, sample_knowledge_doc):
        graph = build_knowledge_graph(sample_knowledge_doc)
        # Should have at least the explicit relationships
        assert len(graph.edges) >= 4
        # Co-occurrence won't add duplicates of existing edges
        # but will add new ones for co-occurring entities without edges

    def test_empty_knowledge_doc(self):
        graph = build_knowledge_graph({})
        assert len(graph.entities) == 0
        assert len(graph.edges) == 0


# ── Narrative Arc Tests ───────────────────────────────────────

class TestNarrativeArc:
    def test_build_arc(self, sample_knowledge_doc, sample_chapters):
        graph = build_knowledge_graph(sample_knowledge_doc)
        arc = build_narrative_arc(graph, sample_knowledge_doc, sample_chapters)
        assert arc.total_beats > 0
        assert len(arc.acts[1]) > 0  # Act 1 has beats
        assert len(arc.acts[2]) > 0  # Act 2 has beats
        assert len(arc.acts[3]) > 0  # Act 3 has beats

    def test_structural_beats_added(self, sample_knowledge_doc, sample_chapters):
        graph = build_knowledge_graph(sample_knowledge_doc)
        arc = build_narrative_arc(graph, sample_knowledge_doc, sample_chapters)
        # Should have hook, climax, resolution
        beat_types = [b.beat_type for b in arc.all_beats]
        assert "hook" in beat_types
        assert "climax" in beat_types
        assert "resolution" in beat_types

    def test_chapter_to_act_assignment(self):
        # 4 chapters: ch0 → Act 1, ch1-2 → Act 2, ch3 → Act 3
        mapping = _assign_chapters_to_acts(
            [{"chapter_index": i} for i in range(4)],
            act_1_target=3, act_2_target=4, act_3_target=3,
        )
        assert mapping[0] == 1
        assert mapping[3] == 3

    def test_to_planner_context(self, sample_knowledge_doc, sample_chapters):
        graph = build_knowledge_graph(sample_knowledge_doc)
        arc = build_narrative_arc(graph, sample_knowledge_doc, sample_chapters)
        ctx = arc.to_planner_context()
        assert "NARRATIVE ARC" in ctx
        assert "ACT 1" in ctx
        assert "ACT 2" in ctx
        assert "ACT 3" in ctx

    def test_to_dict(self, sample_knowledge_doc, sample_chapters):
        graph = build_knowledge_graph(sample_knowledge_doc)
        arc = build_narrative_arc(graph, sample_knowledge_doc, sample_chapters)
        d = arc.to_dict()
        assert "acts" in d
        assert "total_beats" in d
        assert d["total_beats"] > 0

    def test_two_chapter_doc(self, sample_knowledge_doc):
        """Very short doc still gets a valid arc."""
        chapters = [
            {"chapter_index": 0, "chapter_title": "Start", "one_liner": "Begin", "narrative_summary": "The beginning"},
            {"chapter_index": 1, "chapter_title": "End", "one_liner": "Finish", "narrative_summary": "The end"},
        ]
        graph = build_knowledge_graph(sample_knowledge_doc)
        arc = build_narrative_arc(graph, sample_knowledge_doc, chapters)
        assert arc.total_beats >= 4  # At least hook + 2 core + resolution


# ── Scene Composer Tests ──────────────────────────────────────

class TestSceneComposer:
    def test_compose_enriches_panels(self):
        panels = [
            {
                "panel_id": "p1",
                "chapter_index": 0,
                "content_type": "splash",
                "visual_mood": "dramatic-dark",
                "scene_description": "A dark laboratory with monitors",
                "creative_direction": "Speed lines, dramatic entry",
                "character": "Hero",
            },
        ]
        bible = {
            "characters": [
                {"name": "Hero", "role": "protagonist", "signature_color": "#E8191A", "aura": "energy"},
            ],
            "world": {"visual_style": "Deep navy #0F0E17 with amber #ffc220 highlights"},
        }
        enriched = compose_scene_directions(panels, bible)
        assert len(enriched) == 1
        assert "illustration" in enriched[0]
        assert enriched[0]["illustration"]["scene"] == "laboratory"

    def test_scene_inference_from_keywords(self):
        panels = [
            {"panel_id": "p1", "chapter_index": 0, "content_type": "dialogue",
             "visual_mood": "tense", "scene_description": "The code compiles",
             "creative_direction": "Digital landscape", "character": ""},
        ]
        enriched = compose_scene_directions(panels, {})
        assert enriched[0]["illustration"]["scene"] == "digital-realm"

    def test_character_signature_injection(self):
        panels = [
            {"panel_id": "p1", "chapter_index": 0, "content_type": "dialogue",
             "visual_mood": "light", "scene_description": "",
             "creative_direction": "", "character": "Mentor"},
        ]
        bible = {
            "characters": [
                {"name": "Mentor", "role": "mentor", "signature_color": "#0053e2",
                 "aura": "calm", "default_pose": "presenting"},
            ],
        }
        enriched = compose_scene_directions(panels, bible)
        assert enriched[0]["suggested_pose"] == "presenting"
        assert enriched[0]["suggested_aura"] == "calm"

    def test_extract_color(self):
        assert _extract_color("#E8191A and #ffc220", "primary") == "#E8191A"
        assert _extract_color("#E8191A and #ffc220", "accent") == "#ffc220"
        assert _extract_color("no colors here", "primary") == ""

    def test_data_panel_gets_chart_elements(self):
        panels = [
            {"panel_id": "p1", "chapter_index": 0, "content_type": "data",
             "visual_mood": "light", "scene_description": "",
             "creative_direction": "", "character": ""},
        ]
        enriched = compose_scene_directions(panels, {})
        elements = enriched[0]["illustration"]["elements"]
        assert any(e["type"] == "chart" for e in elements)
