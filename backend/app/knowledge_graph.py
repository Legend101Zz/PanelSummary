"""
knowledge_graph.py — Entity-Relationship Graph Builder
========================================================
Takes the knowledge document from stage_document_understanding
and builds a structured graph of entities and relationships.

WHY THIS EXISTS:
The knowledge doc has entities and relationships, but they're flat
lists. A graph structure lets us:
1. Find central characters (most connections)
2. Identify conflict pairs (opposing relationships)
3. Discover story clusters (connected subgraphs)
4. Assign dramatic weight to each entity

This feeds directly into narrative_arc.py for story structuring.
"""

import logging
import re
from collections import defaultdict
from typing import Optional

logger = logging.getLogger(__name__)


class KnowledgeGraph:
    """A lightweight directed graph of entities and relationships.

    Not using networkx — we don't need the dependency for something
    this simple. Flat is better than nested. Simple is better than complex.
    """

    def __init__(self) -> None:
        self.entities: dict[str, dict] = {}
        self.edges: list[dict] = []
        self._adjacency: dict[str, list[str]] = defaultdict(list)

    def add_entity(
        self,
        name: str,
        entity_type: str = "concept",
        significance: str = "",
        **extra,
    ) -> None:
        """Add an entity node to the graph."""
        self.entities[name] = {
            "name": name,
            "type": entity_type,
            "significance": significance,
            "connections": 0,
            "dramatic_weight": 0.0,
            **extra,
        }

    def add_edge(
        self,
        source: str,
        target: str,
        relationship: str,
        weight: float = 1.0,
    ) -> None:
        """Add a directed relationship edge."""
        self.edges.append({
            "from": source,
            "to": target,
            "relationship": relationship,
            "weight": weight,
        })
        self._adjacency[source].append(target)
        self._adjacency[target].append(source)

        # Bump connection counts
        for name in (source, target):
            if name in self.entities:
                self.entities[name]["connections"] += 1

    @property
    def central_entities(self) -> list[dict]:
        """Entities sorted by connection count (most connected first)."""
        return sorted(
            self.entities.values(),
            key=lambda e: e["connections"],
            reverse=True,
        )

    @property
    def conflict_pairs(self) -> list[dict]:
        """Edges that represent conflict/tension."""
        conflict_words = {
            "conflicts", "opposes", "challenges", "competes",
            "versus", "rival", "against", "threatens",
        }
        return [
            e for e in self.edges
            if any(w in e["relationship"].lower() for w in conflict_words)
        ]

    @property
    def mentor_pairs(self) -> list[dict]:
        """Edges that represent guidance/teaching."""
        mentor_words = {
            "mentor", "teaches", "guides", "inspires",
            "built", "created", "founded", "developed",
        }
        return [
            e for e in self.edges
            if any(w in e["relationship"].lower() for w in mentor_words)
        ]

    def neighbors(self, entity_name: str) -> list[str]:
        """Get all directly connected entities."""
        return self._adjacency.get(entity_name, [])

    def subgraph_around(self, entity_name: str, depth: int = 1) -> set[str]:
        """Get all entities within N hops of the given entity."""
        visited = {entity_name}
        frontier = {entity_name}
        for _ in range(depth):
            next_frontier = set()
            for node in frontier:
                for neighbor in self.neighbors(node):
                    if neighbor not in visited:
                        visited.add(neighbor)
                        next_frontier.add(neighbor)
            frontier = next_frontier
        return visited

    def to_dict(self) -> dict:
        """Serialize for JSON storage / LLM context."""
        return {
            "entities": list(self.entities.values()),
            "edges": self.edges,
            "stats": {
                "entity_count": len(self.entities),
                "edge_count": len(self.edges),
                "conflict_pairs": len(self.conflict_pairs),
                "central_entity": (
                    self.central_entities[0]["name"]
                    if self.central_entities else None
                ),
            },
        }


def build_knowledge_graph(knowledge_doc: dict) -> KnowledgeGraph:
    """Build a KnowledgeGraph from a knowledge document.

    Combines:
    1. Explicit entities from the knowledge doc
    2. Explicit relationships from the knowledge doc
    3. Inferred relationships from knowledge clusters
    4. Dramatic weight scoring based on multiple signals
    """
    graph = KnowledgeGraph()

    # 1. Add explicit entities
    for entity in knowledge_doc.get("key_entities", []):
        graph.add_entity(
            name=entity["name"],
            entity_type=entity.get("type", "concept"),
            significance=entity.get("significance", ""),
            first_appearance=entity.get("first_appearance", ""),
        )

    # 2. Add explicit relationships
    for rel in knowledge_doc.get("relationships", []):
        source = rel.get("from", "")
        target = rel.get("to", "")
        if source and target:
            # Auto-create entities that exist in relationships but
            # weren't in key_entities (LLM sometimes forgets)
            if source not in graph.entities:
                graph.add_entity(source, "concept", "Referenced in relationship")
            if target not in graph.entities:
                graph.add_entity(target, "concept", "Referenced in relationship")
            graph.add_edge(source, target, rel.get("relationship", "related to"))

    # 3. Infer co-occurrence relationships from knowledge clusters
    for cluster in knowledge_doc.get("knowledge_clusters", []):
        # Entities mentioned in the same cluster are related
        cluster_text = " ".join(cluster.get("key_facts", []))
        cluster_entities = [
            name for name in graph.entities
            if name.lower() in cluster_text.lower()
        ]
        # Create weak co-occurrence edges between cluster members
        for i, e1 in enumerate(cluster_entities):
            for e2 in cluster_entities[i + 1:]:
                # Don't duplicate existing edges
                existing = any(
                    (edge["from"] == e1 and edge["to"] == e2)
                    or (edge["from"] == e2 and edge["to"] == e1)
                    for edge in graph.edges
                )
                if not existing:
                    graph.add_edge(
                        e1, e2,
                        f"co-occur in theme: {cluster.get('theme', 'unknown')}",
                        weight=0.5,
                    )

    # 4. Score dramatic weight
    _score_dramatic_weight(graph, knowledge_doc)

    logger.info(
        f"Knowledge graph: {len(graph.entities)} entities, "
        f"{len(graph.edges)} edges, "
        f"{len(graph.conflict_pairs)} conflicts"
    )

    return graph


def _score_dramatic_weight(graph: KnowledgeGraph, knowledge_doc: dict) -> None:
    """Score each entity's dramatic potential for manga storytelling.

    Dramatic weight = how important this entity is for the story.
    High weight → this entity becomes a character or major plot element.
    """
    # Signals that increase dramatic weight:
    thesis = knowledge_doc.get("core_thesis", "").lower()
    climax = knowledge_doc.get("emotional_arc", {}).get("climax", "").lower()
    interesting = knowledge_doc.get("what_makes_this_interesting", "").lower()

    for name, entity in graph.entities.items():
        weight = 0.0
        name_lower = name.lower()

        # Connection count (more connected = more central)
        weight += min(entity["connections"] * 0.15, 0.6)

        # Mentioned in thesis (very important)
        if name_lower in thesis:
            weight += 0.3

        # Mentioned in climax
        if name_lower in climax:
            weight += 0.2

        # Mentioned in "what makes this interesting"
        if name_lower in interesting:
            weight += 0.15

        # Entity type bonus (people are more dramatic than concepts)
        type_bonus = {
            "person": 0.2,
            "organization": 0.1,
            "technology": 0.15,
            "event": 0.1,
            "concept": 0.05,
            "place": 0.05,
        }
        weight += type_bonus.get(entity.get("type", ""), 0)

        # Is in a conflict pair?
        in_conflict = any(
            edge["from"] == name or edge["to"] == name
            for edge in graph.conflict_pairs
        )
        if in_conflict:
            weight += 0.2

        entity["dramatic_weight"] = round(min(weight, 1.0), 2)

    # Normalize so the top entity is always 1.0
    max_weight = max(
        (e["dramatic_weight"] for e in graph.entities.values()),
        default=1.0,
    )
    if max_weight > 0:
        for entity in graph.entities.values():
            entity["dramatic_weight"] = round(
                entity["dramatic_weight"] / max_weight, 2
            )
