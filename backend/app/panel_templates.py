"""Legacy Living Panel template compatibility.

The product is moving toward the V4 manga/storyboard pipeline, but a few
legacy tests still validate the old DSL v2.0 template contract. Keep this file
small, deterministic, and boring. Boring compatibility code is good code. Tiny
software goblins hate boring code.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any

CanvasPalette = dict[str, str]
TemplateDsl = dict[str, Any]

MOOD_PALETTES: dict[str, CanvasPalette] = {
    "dramatic-dark": {
        "bg": "#1A1825",
        "bg2": "#2A2740",
        "ink": "#FFFFFF",
        "muted": "#B8B3D1",
        "accent": "#FFC220",
        "mood": "dramatic-dark",
    },
    "warm-amber": {
        "bg": "#FFF7E3",
        "bg2": "#FFE4A8",
        "ink": "#2E2416",
        "muted": "#7A5A1F",
        "accent": "#995213",
        "mood": "warm-amber",
    },
    "cool-mystery": {
        "bg": "#EAF2FF",
        "bg2": "#C7DAFF",
        "ink": "#102A43",
        "muted": "#486581",
        "accent": "#0053E2",
        "mood": "cool-mystery",
    },
    "light": {
        "bg": "#FFFFFF",
        "bg2": "#F2F8FD",
        "ink": "#1F2937",
        "muted": "#6B7280",
        "accent": "#0053E2",
        "mood": "light",
    },
}


def _palette(mood: str | None) -> CanvasPalette:
    """Return a known palette, falling back to the legacy default."""
    return MOOD_PALETTES.get(mood or "", MOOD_PALETTES["dramatic-dark"])


def _text(value: str | None, fallback: str) -> str:
    return (value or "").strip() or fallback


def _dialogue_text(line: Any, fallback_character: str) -> tuple[str, str]:
    if isinstance(line, str):
        return fallback_character, _text(line, "...")
    if isinstance(line, dict):
        return _text(str(line.get("character") or fallback_character), "Narrator"), _text(
            str(line.get("text") or ""),
            "...",
        )
    return fallback_character, "..."


def _normalise_items(items: Iterable[Any] | None, fallback: list[str]) -> list[str]:
    values = [str(item).strip() for item in (items or []) if str(item).strip()]
    return values or fallback


def _layer(layer_id: str, layer_type: str, **props: Any) -> dict[str, Any]:
    return {"id": layer_id, "type": layer_type, "props": props}


def _base_dsl(
    *,
    content_type: str,
    palette: CanvasPalette,
    layers: list[dict[str, Any]],
    layout_type: str = "single",
    duration_ms: int = 4000,
    cells: list[dict[str, Any]] | None = None,
) -> TemplateDsl:
    act: dict[str, Any] = {
        "id": "act_1",
        "duration_ms": duration_ms,
        "layout": {"type": layout_type},
        "layers": layers,
        "timeline": [],
    }
    if cells:
        act["cells"] = cells

    return {
        "version": "2.0",
        "canvas": {
            "width": 1080,
            "height": 1440,
            "background": palette["bg"],
        },
        "acts": [act],
        "meta": {
            "source": "template",
            "content_type": content_type,
            "palette": palette["mood"],
        },
    }


def _splash_center(title: str, pal: CanvasPalette, beat: str | None = None) -> TemplateDsl:
    return _base_dsl(
        content_type="splash",
        palette=pal,
        layers=[
            _layer("bg", "background", fill=pal["bg"], gradientTo=pal["bg2"]),
            _layer("burst", "effect", kind="speed_lines", color=pal["accent"], opacity=0.35),
            _layer(
                "title",
                "text",
                text=_text(title, "Opening Scene"),
                fontFamily="display",
                fontSize=76,
                color=pal["ink"],
                align="center",
                x=120,
                y=520,
                width=840,
            ),
            _layer(
                "beat",
                "text",
                text=_text(beat, "A new idea appears."),
                fontFamily="body",
                fontSize=30,
                color=pal["muted"],
                align="center",
                x=160,
                y=680,
                width=760,
            ),
        ],
    )


def _splash_diagonal(title: str, pal: CanvasPalette, beat: str | None = None) -> TemplateDsl:
    return _base_dsl(
        content_type="splash",
        palette=pal,
        layers=[
            _layer("bg", "background", fill=pal["bg2"]),
            _layer("slash", "shape", shape="diagonal_band", fill=pal["accent"], opacity=0.22),
            _layer(
                "title",
                "text",
                text=_text(title, "The Premise"),
                fontFamily="display",
                fontSize=68,
                color=pal["ink"],
                x=96,
                y=470,
                width=850,
            ),
            _layer("caption", "text", text=_text(beat, "The page turns."), fontSize=28, color=pal["muted"], x=96, y=640, width=850),
        ],
    )


def _dialogue_two_shot(
    dialogue: list[Any] | None,
    character: str | None,
    expression: str | None,
    pal: CanvasPalette,
    beat: str | None = None,
) -> TemplateDsl:
    speaker, line = _dialogue_text((dialogue or [None])[0], _text(character, "Narrator"))
    return _base_dsl(
        content_type="dialogue",
        palette=pal,
        layout_type="two-shot",
        layers=[
            _layer("bg", "background", fill=pal["bg"]),
            _layer("character", "sprite", name=speaker, expression=_text(expression, "thoughtful"), x=120, y=420),
            _layer("bubble", "speech_bubble", text=line, speaker=speaker, x=360, y=260, width=560, height=220),
            _layer("beat", "text", text=_text(beat, "A conversation turns the idea."), color=pal["muted"], fontSize=24, x=120, y=1180, width=840),
        ],
    )


def _dialogue_split(
    dialogue: list[Any] | None,
    character: str | None,
    expression: str | None,
    pal: CanvasPalette,
    beat: str | None = None,
) -> TemplateDsl:
    lines = list(dialogue or [])[:2] or [{"character": character or "Narrator", "text": "..."}]
    cells = []
    for index, raw in enumerate(lines):
        speaker, line = _dialogue_text(raw, _text(character, "Narrator"))
        cells.append(
            {
                "id": f"cell_{index + 1}",
                "layers": [
                    _layer(f"sprite_{index}", "sprite", name=speaker, expression=_text(expression, "curious")),
                    _layer(f"bubble_{index}", "speech_bubble", text=line, speaker=speaker),
                ],
            }
        )
    return _base_dsl(
        content_type="dialogue",
        palette=pal,
        layout_type="split",
        layers=[_layer("bg", "background", fill=pal["bg"]), _layer("note", "text", text=_text(beat, "Dialogue"), color=pal["muted"], fontSize=22)],
        cells=cells,
    )


def _narration_card(text: str, pal: CanvasPalette, beat: str | None = None) -> TemplateDsl:
    return _base_dsl(
        content_type="narration",
        palette=pal,
        layers=[
            _layer("bg", "background", fill=pal["bg"]),
            _layer("panel", "shape", shape="rounded_rect", fill=pal["bg2"], x=90, y=300, width=900, height=620),
            _layer("body", "text", text=_text(text, "A key idea takes shape."), fontSize=42, color=pal["ink"], x=150, y=380, width=780),
            _layer("beat", "text", text=_text(beat, "Narration"), fontSize=24, color=pal["muted"], x=150, y=880, width=780),
        ],
    )


def _narration_wide(text: str, pal: CanvasPalette, beat: str | None = None) -> TemplateDsl:
    return _base_dsl(
        content_type="narration",
        palette=pal,
        layout_type="wide",
        layers=[
            _layer("bg", "background", fill=pal["bg2"]),
            _layer("caption", "text", text=_text(text, "The evidence becomes clear."), fontSize=38, color=pal["ink"], x=120, y=460, width=840),
            _layer("accent", "shape", shape="underline", fill=pal["accent"], x=120, y=720, width=360, height=12),
        ],
    )


def _narration_focus(text: str, pal: CanvasPalette, beat: str | None = None) -> TemplateDsl:
    return _base_dsl(
        content_type="narration",
        palette=pal,
        layout_type="focus",
        layers=[
            _layer("bg", "background", fill=pal["bg"]),
            _layer("spotlight", "effect", kind="spotlight", color=pal["accent"], opacity=0.2),
            _layer("line", "text", text=_text(text, "One thing matters most."), fontSize=48, color=pal["ink"], align="center", x=120, y=540, width=840),
        ],
    )


def _data_board(title: str, items: list[str] | None, pal: CanvasPalette, beat: str | None = None) -> TemplateDsl:
    values = _normalise_items(items, ["Key idea", "Supporting fact", "Why it matters"])
    return _base_dsl(
        content_type="data",
        palette=pal,
        layers=[
            _layer("bg", "background", fill=pal["bg"]),
            _layer("title", "text", text=_text(title, "Key Concepts"), fontSize=46, color=pal["ink"], x=100, y=210, width=880),
            _layer("data", "data_block", title=_text(beat, "Evidence"), items=values, x=100, y=340, width=880, height=620),
        ],
    )


def _data_cards(title: str, items: list[str] | None, pal: CanvasPalette, beat: str | None = None) -> TemplateDsl:
    values = _normalise_items(items, ["Point A", "Point B", "Point C"])
    return _base_dsl(
        content_type="data",
        palette=pal,
        layout_type="cards",
        layers=[
            _layer("bg", "background", fill=pal["bg2"]),
            _layer("heading", "text", text=_text(title, "Concept Map"), fontSize=42, color=pal["ink"], x=100, y=180, width=880),
            _layer("data", "data_block", title=_text(beat, "Breakdown"), items=values, style="cards", x=100, y=320, width=880),
        ],
    )


def _montage_cuts(items: list[str] | None, pal: CanvasPalette, beat: str | None = None) -> TemplateDsl:
    values = _normalise_items(items, ["Moment one", "Moment two", "Moment three"])
    cells = [
        {
            "id": f"cut_{index + 1}",
            "layers": [
                _layer(f"cut_bg_{index}", "background", fill=pal["bg2"]),
                _layer(f"cut_text_{index}", "text", text=value, fontSize=28, color=pal["ink"]),
            ],
        }
        for index, value in enumerate(values[:4])
    ]
    return _base_dsl(
        content_type="montage",
        palette=pal,
        layout_type="cuts",
        layers=[_layer("bg", "background", fill=pal["bg"]), _layer("beat", "text", text=_text(beat, "Montage"), color=pal["muted"], fontSize=22)],
        cells=cells,
    )


def _transition_gate(text: str, pal: CanvasPalette, beat: str | None = None) -> TemplateDsl:
    return _base_dsl(
        content_type="transition",
        palette=pal,
        layers=[
            _layer("bg", "background", fill=pal["bg"]),
            _layer("gate", "scene_transition", kind="page_turn", color=pal["accent"]),
            _layer("caption", "text", text=_text(text, "To the next idea..."), fontSize=44, color=pal["ink"], align="center", x=120, y=560, width=840),
        ],
    )


def _transition_bridge(text: str, pal: CanvasPalette, beat: str | None = None) -> TemplateDsl:
    return _base_dsl(
        content_type="transition",
        palette=pal,
        layout_type="bridge",
        layers=[
            _layer("bg", "background", fill=pal["bg2"]),
            _layer("line", "scene_transition", kind="bridge", color=pal["accent"]),
            _layer("caption", "text", text=_text(text, "Meanwhile..."), fontSize=40, color=pal["ink"], x=140, y=610, width=800),
        ],
    )


def _concept_symbol(text: str, items: list[str] | None, pal: CanvasPalette, beat: str | None = None) -> TemplateDsl:
    values = _normalise_items(items, [_text(text, "Core concept")])
    return _base_dsl(
        content_type="concept",
        palette=pal,
        layout_type="symbolic",
        layers=[
            _layer("bg", "background", fill=pal["bg"]),
            _layer("symbol", "shape", shape="circle", fill=pal["accent"], opacity=0.18, x=290, y=350, width=500, height=500),
            _layer("concept", "text", text=values[0], fontSize=48, color=pal["ink"], align="center", x=160, y=555, width=760),
        ],
    )


SPLASH_TEMPLATES: list[Callable[..., TemplateDsl]] = [_splash_center, _splash_diagonal]
DIALOGUE_TEMPLATES: list[Callable[..., TemplateDsl]] = [_dialogue_two_shot, _dialogue_split]
NARRATION_TEMPLATES: list[Callable[..., TemplateDsl]] = [_narration_card, _narration_wide, _narration_focus]
DATA_TEMPLATES: list[Callable[..., TemplateDsl]] = [_data_board, _data_cards]
MONTAGE_TEMPLATES: list[Callable[..., TemplateDsl]] = [_montage_cuts]
TRANSITION_TEMPLATES: list[Callable[..., TemplateDsl]] = [_transition_gate, _transition_bridge]
CONCEPT_TEMPLATES: list[Callable[..., TemplateDsl]] = [_concept_symbol]


def fill_template(
    *,
    panel_index: int,
    content_type: str,
    text: str = "",
    dialogue: list[Any] | None = None,
    character: str | None = None,
    expression: str | None = None,
    visual_mood: str | None = None,
    narrative_beat: str | None = None,
    key_concepts: list[str] | None = None,
) -> TemplateDsl:
    """Fill a deterministic legacy panel template.

    Unknown content types fall back to narration to preserve older callers.
    """
    pal = _palette(visual_mood)
    kind = content_type if content_type in _TEMPLATE_BY_TYPE else "narration"
    templates = _TEMPLATE_BY_TYPE[kind]
    template = templates[panel_index % len(templates)]

    if kind == "splash":
        return template(text, pal, narrative_beat)
    if kind == "dialogue":
        return template(dialogue, character, expression, pal, narrative_beat)
    if kind == "data":
        return template(text, key_concepts, pal, narrative_beat)
    if kind == "montage":
        return template(key_concepts, pal, narrative_beat)
    if kind == "transition":
        return template(text, pal, narrative_beat)
    if kind == "concept":
        return template(text, key_concepts, pal, narrative_beat)
    return template(text, pal, narrative_beat)


_TEMPLATE_BY_TYPE: dict[str, list[Callable[..., TemplateDsl]]] = {
    "splash": SPLASH_TEMPLATES,
    "dialogue": DIALOGUE_TEMPLATES,
    "narration": NARRATION_TEMPLATES,
    "data": DATA_TEMPLATES,
    "montage": MONTAGE_TEMPLATES,
    "transition": TRANSITION_TEMPLATES,
    "concept": CONCEPT_TEMPLATES,
}
