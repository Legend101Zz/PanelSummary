"""
living_panel_prompts.py — LLM Prompts for Living Panel DSL v2.0
=================================================================
Prompts for generating act-based Living Panel DSL with:
- Cut-based manga layouts
- Ink-on-paper aesthetic
- Character silhouettes
- Screentone / crosshatch effects
- User-controlled act progression
"""

from app.models import SummaryStyle


STYLE_GUIDANCE = {
    SummaryStyle.MANGA: """
STYLE: MANGA — High energy, dramatic pacing.
- Fast reveals (200-400ms), speed lines on splash panels
- Use cuts with slight angles (1-2 degrees) for dynamic layouts
- Dialogue: punchy typewriter speed (25-35ms)
- Use screentone and crosshatch patterns for depth
- Ink on paper colors: cream backgrounds (#F2E8D5), black ink (#1A1825)
- Red accent (#E8191A) for emphasis moments
""",
    SummaryStyle.NOIR: """
STYLE: NOIR — Slow, moody, atmospheric.
- Slow fades (800-1200ms), heavy vignette
- Dark backgrounds with halftone patterns
- Dialogue: mostly whisper/narrator, slow typewriter (50-70ms)
- Minimal cuts — prefer full layouts with layered text
""",
    SummaryStyle.MINIMALIST: """
STYLE: MINIMALIST — Clean, typographic.
- Medium timing (400-600ms), no particle effects
- Typography IS the art. Large fonts, bold text layers.
- Simple 2-panel cuts at most. Lots of white space.
- Paper backgrounds, minimal patterns.
""",
    SummaryStyle.COMEDY: """
STYLE: COMEDY — Bouncy, playful.
- Bounce/elastic easing, exaggerated movements
- Characters bounce in, fast typewriter (20-30ms)
- Use shout bubbles and SFX text for punchlines
- Warm backgrounds, dots pattern.
""",
    SummaryStyle.ACADEMIC: """
STYLE: ACADEMIC — Structured, data-driven.
- Staggered list reveals. Data blocks as primary content.
- Clean grid cuts. Crosshatch patterns for scholarly feel.
- Medium typewriter (40-50ms). Narrator style bubbles.
""",
}


def get_living_panel_prompt(style: SummaryStyle) -> str:
    """System prompt for generating Living Panel DSL v2.0."""
    guidance = STYLE_GUIDANCE.get(style, STYLE_GUIDANCE[SummaryStyle.MANGA])

    return f"""You are a Living Manga Panel Director. You create animated manga panel experiences
using a structured DSL that a rendering engine interprets.

{guidance}

## DSL v2.0 SPECIFICATION

Each panel is a SCENE with ACTS. Acts are temporal states — the reader
taps to advance between acts. Within each act, a timeline auto-plays
animations for layers.

### TOP-LEVEL STRUCTURE:
{{
  "version": "2.0",
  "canvas": {{ "width": 800, "height": 600, "background": "#F2E8D5", "mood": "light" }},
  "acts": [ ... ],
  "meta": {{
    "panel_id": "unique-id",
    "chapter_index": 0,
    "content_type": "dialogue|narration|splash|data|concept",
    "narrative_beat": "brief description",
    "duration_ms": 5000
  }}
}}

### CANVAS MOODS:
- "light" → cream paper (#F2E8D5), black ink (#1A1825)
- "dark" → dark ink (#1A1825), light text (#F0EEE8)

### ACT STRUCTURE:
{{
  "id": "act-name",
  "duration_ms": 5000,
  "transition_in": {{ "type": "fade", "duration_ms": 400 }},
  "layout": {{ "type": "full" }},
  "layers": [ ... ],
  "cells": [],
  "timeline": [ ... ]
}}

### LAYOUT TYPES:

1. SIMPLE LAYOUTS:
   - "full" — single panel, no sub-divisions
   - "split-h" — left + right (cells: position "left", "right")
   - "split-v" — top + bottom (cells: position "top", "bottom")
   - "grid-2x2" — 4 panels (cells: position "tl", "tr", "bl", "br")

2. CUT-BASED LAYOUTS (manga-native!):
   - "cuts" — define cuts[] to recursively subdivide the page
   - Each cut: {{ "direction": "h"|"v", "position": 0.0-1.0, "angle": -4 to 4, "target": 0 }}
   - Algorithm: starts with 1 full region (index 0)
     - First cut splits region 0 into regions 0 and 1
     - Second cut can target region 0, 1, etc.
   - Cells correspond to final regions by index (position: "0", "1", "2", ...)
   - Use angle: 1-2 degrees for that hand-ruled manga feel

   Example — 3-panel layout (top-left wide, top-right narrow, bottom full):
   "layout": {{
     "type": "cuts",
     "cuts": [
       {{ "direction": "h", "position": 0.55, "angle": 1.5 }},
       {{ "direction": "v", "position": 0.65, "angle": -1, "target": 0 }}
     ],
     "gap": 5,
     "stagger_ms": 200
   }}

### LAYER TYPES:
- "background" — props: gradient (color[]), gradientAngle, pattern ("halftone"|"crosshatch"|"dots"|"lines"|"manga_screen"), patternOpacity
- "sprite" — props: character (name), expression ("neutral"|"curious"|"shocked"|"wise"|"thoughtful"|"excited"|"sad"|"angry"), size (px), showName, silhouette, facing ("left"|"right")
- "text" — props: content, fontSize (use clamp()), fontFamily ("display"|"body"|"label"), color, textAlign, maxWidth, lineHeight, typewriter, typewriterSpeed
- "speech_bubble" — props: text, character, style ("speech"|"thought"|"shout"|"whisper"|"narrator"), tailDirection ("left"|"right"|"bottom"|"top"|"none"), maxWidth, typewriter, typewriterSpeed
- "effect" — props: effect ("speed_lines"|"screentone"|"crosshatch"|"vignette"|"sfx"|"impact_burst"|"particles"), color, intensity, direction
  - For "sfx": sfxText, sfxSize, sfxRotate
- "shape" — props: shape ("circle"|"rect"|"line"), fill, stroke, strokeWidth
- "data_block" — props: items (array of {{label, value?, icon?}}), accentColor, showIndex, animateIn ("stagger"), staggerDelay

### LAYER POSITIONING:
Use percentage strings: x: "15%", y: "30%"
- Characters (sprites) go BELOW dialogue bubbles. Place at y: 60-75%.
- Speech bubbles go ABOVE characters. Place at y: 5-30%.
- Never overlap text on sprites.

### TIMELINE:
Array of {{ at: ms, target: layerId, animate: {{ opacity: [0,1], ... }}, duration: ms, easing: "ease-out" }}
- Easing: "linear"|"ease-in"|"ease-out"|"ease-in-out"|"spring"|"bounce"
- Use typewriter: true for text reveals
- Total timeline: 3-8 seconds

### TRANSITIONS BETWEEN ACTS:
- "fade" — gentle crossfade (most common)
- "cut" — instant switch
- "slide_left" — slides in from right
- "iris" — circular reveal
- "morph" — scale transform

### COLOR PALETTE (manga ink-on-paper):
- Paper cream: #F2E8D5, warm: #EDE0CC
- Ink black: #1A1825
- Accent red: #E8191A (danger, emphasis)
- Accent amber: #F5A623 (warmth, gold)
- Muted text: #1A182570 or #A8A6C0

## CRITICAL RULES:
- Return ONLY valid JSON. No markdown.
- Canvas is 800x600. Engine scales responsively.
- Every act MUST have a background layer.
- Use version: "2.0".
- Mood: use "light" for cream paper, "dark" for ink backgrounds.
- Place sprites at y: 60-75% and bubbles at y: 5-35% — NEVER overlap.
- For dialogue: show sprites first (at: 200-400ms), then bubbles (at: 600ms+).
- For cut layouts: cells[] must have as many entries as resulting regions.
- Use 1-3 acts per panel. First act always plays on load. Reader taps for next.
- Total duration should be 3-8 seconds per act.
- NEVER generate image URLs. Everything is code-rendered.
- Prefer screentone/crosshatch patterns over gradient effects.
"""


def format_panel_context_for_living(
    panel_data: dict,
    manga_bible: dict = None,
    chapter_summary: dict = None,
) -> str:
    """Format context for a single panel's Living Panel DSL generation."""
    context = f"""Generate a Living Panel DSL v2.0 for this manga panel:

PANEL TYPE: {panel_data.get('content_type', 'narration')}
POSITION: {panel_data.get('position', 'main')}
VISUAL MOOD: {panel_data.get('visual_mood', 'dramatic-dark')}
"""

    if panel_data.get('text'):
        context += f"\nTEXT CONTENT: {panel_data['text']}"

    if panel_data.get('dialogue'):
        lines = panel_data['dialogue']
        dialogue_str = "\n".join(
            f"  {d.get('character', '?')}: \"{d.get('text', '')}\""
            for d in lines
        )
        context += f"\nDIALOGUE:\n{dialogue_str}"

    if panel_data.get('character'):
        context += f"\nFEATURED CHARACTER: {panel_data['character']}"
        context += f"\nEXPRESSION: {panel_data.get('expression', 'neutral')}"

    if manga_bible:
        characters = manga_bible.get('characters', [])
        char_lines = "\n".join(
            f"  \u2022 {c['name']} ({c['role']}): {c.get('visual_description', '')}"
            for c in characters
        )
        motifs = manga_bible.get('recurring_motifs', [])
        motif_lines = "\n".join(f"  \u2022 {m}" for m in motifs)

        context += f"""

\u2501\u2501\u2501 MANGA BIBLE \u2501\u2501\u2501
World: {manga_bible.get('world_description', '')}
Characters:
{char_lines}
Motifs:
{motif_lines}
"""

    if chapter_summary:
        context += f"""
\u2501\u2501\u2501 CHAPTER CONTEXT \u2501\u2501\u2501
Chapter: {chapter_summary.get('chapter_title', '')}
One-liner: {chapter_summary.get('one_liner', '')}
Dramatic moment: {chapter_summary.get('dramatic_moment', '')}
"""

    context += "\nGenerate the Living Panel DSL v2.0 JSON."
    return context


def format_full_page_for_living(
    page_data: dict,
    manga_bible: dict = None,
    chapter_summary: dict = None,
) -> str:
    """Format context for generating Living Panels for ALL panels in a page."""
    context = f"""Generate Living Panel DSLs for EACH panel in this manga page.
Return a JSON object with a \"panels\" array, each a complete Living Panel DSL v2.0.

PAGE LAYOUT: {page_data.get('layout', 'full')}
NUMBER OF PANELS: {len(page_data.get('panels', []))}

PANELS:
"""

    for i, panel in enumerate(page_data.get('panels', [])):
        context += f"\n--- Panel {i + 1} ---\n"
        context += f"Type: {panel.get('content_type', 'narration')}\n"
        context += f"Mood: {panel.get('visual_mood', 'dramatic-dark')}\n"
        if panel.get('text'):
            context += f"Text: {panel['text']}\n"
        if panel.get('dialogue'):
            for d in panel['dialogue']:
                if isinstance(d, str):
                    d = {"text": d, "character": "?"}
                context += f"  {d.get('character', '?')}: \"{d.get('text', '')}\"\n"
        if panel.get('character'):
            context += f"Character: {panel['character']} ({panel.get('expression', 'neutral')})\n"

    if manga_bible:
        characters = manga_bible.get('characters', [])
        char_lines = "\n".join(f"  \u2022 {c['name']} ({c['role']})" for c in characters)
        context += f"\nCHARACTERS:\n{char_lines}"

    if chapter_summary:
        context += f"\nCHAPTER: {chapter_summary.get('chapter_title', '')}"

    context += "\n\nReturn: {{ \"panels\": [ <DSL v2.0>, ... ] }}"
    return context
