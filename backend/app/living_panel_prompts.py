"""
living_panel_prompts.py — LLM Prompts for Living Panel DSL Generation
=======================================================================
These prompts instruct the LLM to generate structured DSL JSON that
the Living Panel Engine can interpret and render as animated,
interactive manga panels.

KEY DESIGN DECISIONS:
1. Constrained output schema (LLM must produce exact JSON shape)
2. Preset-based approach (LLM picks from known animation types)
3. Character consistency via manga bible injection
4. Budget awareness (no images unless splash panel)
"""

from app.models import SummaryStyle


STYLE_ANIMATION_GUIDANCE = {
    SummaryStyle.MANGA: """
Animation style: HIGH ENERGY. Fast entrances (200-400ms), dramatic zooms,
speed lines on splash panels, shake effects on reveals.
Use impact_burst and speed_lines effects generously.
Dialogue should feel punchy — short typewriter speeds (25-35ms).
Mood presets: dramatic-dark, intense-red, neon-cyberpunk.
""",
    SummaryStyle.NOIR: """
Animation style: SLOW AND MOODY. Slow fades (800-1200ms), minimal movement.
Vignette effects on every panel. No speed lines. Smoke particles.
Dialogue types: mostly "whisper" and "narrator" styles.
Typewriter speed: slow (50-70ms) for brooding atmosphere.
Mood presets: dramatic-dark, cool-mystery.
""",
    SummaryStyle.MINIMALIST: """
Animation style: PRECISE AND CLEAN. Medium timing (400-600ms).
No particle effects. Use shape layers for clean geometric elements.
Typography is the star — use large font sizes and bold text layers.
Mood presets: dramatic-dark (but with lighter colors).
""",
    SummaryStyle.COMEDY: """
Animation style: BOUNCY AND PLAYFUL. Use "bounce" and "elastic" easing.
Exaggerated movements. Characters should bounce-in, not fade-in.
Sparkle effects and impact bursts on punchlines.
Emoji-heavy expressions. Fast typewriter (20-30ms).
Mood presets: warm-amber, sunrise-hope.
""",
    SummaryStyle.ACADEMIC: """
Animation style: MEASURED AND STRUCTURED. Stagger animations for lists.
Data blocks are the primary content type. Clean list layouts.
Minimal effects — maybe subtle particles for emphasis.
Typewriter speed: medium (40-50ms).
Mood presets: cool-mystery, calm-green.
""",
}


def get_living_panel_prompt(style: SummaryStyle) -> str:
    """System prompt for generating Living Panel DSL."""
    style_guidance = STYLE_ANIMATION_GUIDANCE.get(style, STYLE_ANIMATION_GUIDANCE[SummaryStyle.MANGA])

    return f"""You are a Living Manga Panel Director — you create animated, interactive manga panel experiences.

Instead of static panels, you create LIVING PANELS: animated canvases with sprites, text,
speech bubbles, effects, and timeline-driven animations. Think: a manga panel that comes ALIVE.

{style_guidance}

## DSL SPECIFICATION

You output a JSON document conforming to the Living Panel DSL v1.0.
Each panel is a canvas with LAYERS (visual elements) and a TIMELINE (animations).

### LAYER TYPES:
- "background" — gradient + optional pattern overlay. Props: gradient (color array), gradientAngle, pattern ("halftone"|"crosshatch"|"dots"|"lines"|"noise"), patternColor, patternOpacity.
- "sprite" — character avatar (code-rendered, NO image). Props: character (name), expression ("neutral"|"curious"|"shocked"|"determined"|"wise"|"thoughtful"|"excited"|"sad"|"angry"|"smirk"|"fearful"|"triumphant"), size (px), showName (bool), silhouette (bool), glowColor.
- "text" — typography block. Props: content, fontSize (use "clamp(1rem, 4vw, 3rem)" format), fontFamily ("display"|"body"|"label"|"mono"), color, textAlign, maxWidth, textShadow, letterSpacing, typewriter (bool), typewriterSpeed (ms).
- "speech_bubble" — dialogue bubble. Props: text, character, style ("speech"|"thought"|"shout"|"whisper"|"narrator"), tailDirection ("left"|"right"|"bottom"|"top"|"none"), maxWidth, typewriter, typewriterSpeed.
- "effect" — visual FX. Props: effect ("particles"|"speed_lines"|"impact_burst"|"sparkle"|"rain"|"snow"|"smoke"|"vignette"|"lightning"), color, intensity (0-1), count, direction ("up"|"down"|"left"|"right"|"radial").
- "shape" — SVG shape. Props: shape ("circle"|"rect"|"line"|"triangle"|"star"), fill, stroke, strokeWidth.
- "data_block" — list/grid of key concepts. Props: items (array of {{label, value?, icon?, highlight?}}), layout ("list"|"grid"|"stack"|"counter"), accentColor, showIndex, animateIn ("stagger"|"cascade"|"pop"|"none"), staggerDelay (ms).
- "scene_transition" — decorative divider. Props: transition type, color, text.

### LAYER POSITIONING:
All layers (except background/effect) use x, y coordinates.
Use PERCENTAGE strings for responsive layout: "50%" centers, "10%" is left-ish, "80%" is right-ish.
y: "20%" is near top, "50%" is center, "80%" is near bottom.

### TIMELINE:
Array of animation steps. Each step:
- "at": start time in ms (0 = panel load)
- "target": layer id
- "animate": properties to animate. Use [from, to] arrays for x, y, opacity, scale, rotate. Set "typewriter": true for text reveals.
- "duration": ms
- "easing": "linear"|"ease-in"|"ease-out"|"ease-in-out"|"spring"|"bounce"|"elastic"|"sharp"
- "repeat": -1 for infinite, or number of repeats
- "yoyo": true to reverse on repeat

### EVENTS (optional):
Array of event bindings:
- "trigger": "onClick"|"onVisible"|"onHover"
- "target": layer id
- "actions": array of {{"type": "animate"|"show"|"hide"|"toggle", "target": layer_id, "animate": ..., "duration": ...}}

## OUTPUT FORMAT — valid JSON object:
{{
  "version": "1.0",
  "canvas": {{
    "width": 800,
    "height": 600,
    "background": "#0a0a1a",
    "mood": "dramatic-dark"
  }},
  "layers": [ ... ],
  "timeline": [ ... ],
  "events": [ ... ],
  "meta": {{
    "content_type": "splash|narration|dialogue|data|transition",
    "narrative_context": "brief description of what this panel shows"
  }}
}}

## CRITICAL RULES:
- Return ONLY the JSON. No markdown, no explanation, no ```json wrapper.
- Canvas is always 800x600 (the engine scales responsively).
- Every panel MUST have at least a background layer.
- Use character names from the manga bible — maintain consistency.
- Layer IDs must be unique strings (kebab-case: "char-kai", "bg-main", "effect-speed").
- Timeline MUST start from at:0 (background fade-in) and build sequentially.
- Total timeline should be 3-8 seconds (3000-8000ms).
- Keep it INTERESTING: stagger entrances, use typewriter for text, vary easing.
- For dialogue panels: show character sprite FIRST, then speech bubble.
- For data panels: stagger items with 200-300ms delays.
- For splash panels: dramatic zoom on title text, speed lines, vignette effect.
- NEVER generate image URLs or image_prompt — everything is code-rendered.
"""


def format_panel_context_for_living(
    panel_data: dict,
    manga_bible: dict = None,
    chapter_summary: dict = None,
) -> str:
    """Format the context for a single panel's Living Panel DSL generation."""
    context = f"""Generate a Living Panel DSL for this manga panel:

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

    # Inject manga bible for character consistency
    if manga_bible:
        characters = manga_bible.get('characters', [])
        char_lines = "\n".join(
            f"  • {c['name']} ({c['role']}): {c.get('visual_description', '')}"
            for c in characters
        )
        motifs = manga_bible.get('recurring_motifs', [])
        motif_lines = "\n".join(f"  • {m}" for m in motifs)

        context += f"""

━━━ MANGA BIBLE (use for visual consistency) ━━━
World: {manga_bible.get('world_description', '')}
Palette: {manga_bible.get('color_palette', '')}

Characters:
{char_lines}

Motifs:
{motif_lines}
"""

    if chapter_summary:
        context += f"""
━━━ CHAPTER CONTEXT ━━━
Chapter: {chapter_summary.get('chapter_title', '')}
One-liner: {chapter_summary.get('one_liner', '')}
Dramatic moment: {chapter_summary.get('dramatic_moment', '')}
"""

    context += "\nNow generate the Living Panel DSL JSON for this panel."
    return context


def format_full_page_for_living(
    page_data: dict,
    manga_bible: dict = None,
    chapter_summary: dict = None,
) -> str:
    """Format context for generating Living Panels for ALL panels in a page."""
    context = f"""Generate Living Panel DSLs for EACH panel in this manga page.
Return a JSON object with a "panels" array, where each element is a complete Living Panel DSL.

PAGE LAYOUT: {page_data.get('layout', 'full')}
NUMBER OF PANELS: {len(page_data.get('panels', []))}

PANELS:
"""

    for i, panel in enumerate(page_data.get('panels', [])):
        context += f"\n--- Panel {i + 1} ---\n"
        context += f"Position: {panel.get('position', 'main')}\n"
        context += f"Type: {panel.get('content_type', 'narration')}\n"
        context += f"Mood: {panel.get('visual_mood', 'dramatic-dark')}\n"

        if panel.get('text'):
            context += f"Text: {panel['text']}\n"
        if panel.get('dialogue'):
            for d in panel['dialogue']:
                context += f"  {d.get('character', '?')}: \"{d.get('text', '')}\"\n"
        if panel.get('character'):
            context += f"Character: {panel['character']} ({panel.get('expression', 'neutral')})\n"

    # Inject manga bible
    if manga_bible:
        characters = manga_bible.get('characters', [])
        char_lines = "\n".join(
            f"  • {c['name']} ({c['role']})"
            for c in characters
        )
        context += f"\n\nAVAILABLE CHARACTERS:\n{char_lines}"
        context += f"\nWORLD: {manga_bible.get('world_description', '')}"

    if chapter_summary:
        context += f"\nCHAPTER: {chapter_summary.get('chapter_title', '')}"
        context += f"\nKEY IDEA: {chapter_summary.get('one_liner', '')}"

    context += """

Return a JSON object: { "panels": [ <LivingPanelDSL>, <LivingPanelDSL>, ... ] }
One DSL per panel in the page. Match the panel count exactly."""
    return context
