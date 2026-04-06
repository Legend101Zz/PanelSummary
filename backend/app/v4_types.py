"""
v4_types.py — V4 Engine DSL Types
===================================
Semantic-intent DSL. The LLM describes WHAT to show,
the engine decides HOW to render it.

V2 DSL: ~1000 tokens/panel (every pixel specified)
V4 DSL: ~150 tokens/panel (semantic intent only)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class V4DialogueLine:
    """A single line of dialogue."""
    who: str
    says: str
    emotion: str = "neutral"


@dataclass
class V4DataItem:
    """A data point for data panels."""
    label: str
    value: str = ""


@dataclass
class V4Panel:
    """
    A single manga panel — semantic intent only.

    The engine interprets this into full visual rendering.
    No pixel positions, no animation keyframes, no layer IDs.
    """
    type: str  # splash | dialogue | narration | data | montage | concept | transition
    scene: str = ""            # SceneLibrary key
    mood: str = ""             # drives palette + effects
    title: str = ""            # for splash/transition panels
    narration: str = ""        # caption text (max 120 chars)
    lines: list[V4DialogueLine] = field(default_factory=list)
    data_items: list[V4DataItem] = field(default_factory=list)
    character: str = ""        # primary character shown
    pose: str = ""             # character pose key
    expression: str = ""       # character expression
    effects: list[str] = field(default_factory=list)
    emphasis: str = "medium"   # high | medium | low → controls size weight

    # These are set by the engine, not the LLM
    panel_id: str = ""
    chapter_index: int = 0

    def to_dict(self) -> dict:
        d: dict = {
            "type": self.type,
            "panel_id": self.panel_id,
            "chapter_index": self.chapter_index,
            "emphasis": self.emphasis,
        }
        if self.scene:
            d["scene"] = self.scene
        if self.mood:
            d["mood"] = self.mood
        if self.title:
            d["title"] = self.title
        if self.narration:
            d["narration"] = self.narration
        if self.lines:
            d["lines"] = [
                {"who": l.who, "says": l.says, "emotion": l.emotion}
                for l in self.lines
            ]
        if self.data_items:
            d["data_items"] = [
                {"label": di.label, "value": di.value}
                for di in self.data_items
            ]
        if self.character:
            d["character"] = self.character
        if self.pose:
            d["pose"] = self.pose
        if self.expression:
            d["expression"] = self.expression
        if self.effects:
            d["effects"] = self.effects
        return d


# Valid panel types
PANEL_TYPES = {
    "splash", "dialogue", "narration", "data",
    "montage", "concept", "transition",
}

# Valid emphasis levels
EMPHASIS_LEVELS = {"high", "medium", "low"}

# Valid layout types
PAGE_LAYOUTS = {
    "vertical",    # stack panels vertically
    "grid-2",      # 2 panels side by side
    "grid-3",      # 3 panels (1 tall + 2 stacked)
    "grid-4",      # 2x2 grid
    "asymmetric",  # 1 large + 2 small
    "full",        # single panel fills page
}


@dataclass
class V4Page:
    """
    A manga page containing 1-4 panels.

    Layout is determined by panel count and emphasis:
    - 1 panel → full
    - 2 panels → vertical or grid-2
    - 3 panels → grid-3 or asymmetric
    - 4 panels → grid-4
    """
    page_index: int
    chapter_index: int
    layout: str = "vertical"  # one of PAGE_LAYOUTS
    panels: list[V4Panel] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "version": "4.0",
            "page_index": self.page_index,
            "chapter_index": self.chapter_index,
            "layout": self.layout,
            "panels": [p.to_dict() for p in self.panels],
        }


def validate_v4_panel(d: dict) -> V4Panel:
    """Parse and validate a V4 panel dict from LLM output."""
    panel_type = d.get("type", "narration")
    if panel_type not in PANEL_TYPES:
        panel_type = "narration"

    emphasis = d.get("emphasis", "medium")
    if emphasis not in EMPHASIS_LEVELS:
        emphasis = "medium"

    lines = []
    for line in d.get("lines", []):
        if isinstance(line, dict) and "who" in line and "says" in line:
            lines.append(V4DialogueLine(
                who=str(line["who"])[:30],
                says=str(line["says"])[:200],
                emotion=str(line.get("emotion", "neutral")),
            ))

    data_items = []
    for item in d.get("data_items", []):
        if isinstance(item, dict) and "label" in item:
            data_items.append(V4DataItem(
                label=str(item["label"])[:80],
                value=str(item.get("value", ""))[:40],
            ))

    return V4Panel(
        type=panel_type,
        scene=str(d.get("scene", ""))[:30],
        mood=str(d.get("mood", ""))[:30],
        title=str(d.get("title", ""))[:80],
        narration=str(d.get("narration", ""))[:200],
        lines=lines,
        data_items=data_items,
        character=str(d.get("character", ""))[:30],
        pose=str(d.get("pose", ""))[:20],
        expression=str(d.get("expression", ""))[:20],
        effects=[str(e)[:20] for e in d.get("effects", [])[:5]],
        emphasis=emphasis,
        panel_id=str(d.get("panel_id", "")),
        chapter_index=d.get("chapter_index", 0),
    )


def validate_v4_page(d: dict, page_index: int = 0) -> V4Page:
    """Parse and validate a V4 page dict from LLM output."""
    layout = d.get("layout", "vertical")
    if layout not in PAGE_LAYOUTS:
        layout = "vertical"

    panels = []
    for p in d.get("panels", []):
        if isinstance(p, dict):
            panels.append(validate_v4_panel(p))

    if not panels:
        # Fallback: create one narration panel
        panels.append(V4Panel(
            type="narration",
            narration="Content could not be rendered.",
            emphasis="medium",
        ))

    # Auto-assign layout based on panel count if not sensible
    n = len(panels)
    if layout == "full" and n > 1:
        layout = "vertical"
    if n == 1:
        layout = "full"

    return V4Page(
        page_index=page_index,
        chapter_index=d.get("chapter_index", 0),
        layout=layout,
        panels=panels,
    )
