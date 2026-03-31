# Living Manga Panels — Architecture & Design Document

> **Evolving static manga panels into animated, interactive, programmable canvases.**

---

## 1. DSL Design (Living Panel DSL v1.0)

### Philosophy
The DSL is a **JSON document** that describes a single animated panel.
It's designed to be:
- **LLM-friendly**: Flat structure, max 3 levels of nesting, preset-based
- **Expressive**: Supports sprites, text, effects, data, transitions
- **Timeline-based**: Animations are declarative keyframe sequences
- **Extensible**: New layer types and effects can be added without breaking existing DSL

### Schema Overview

```
LivingPanelDSL
├── version: "1.0"
├── canvas: { width, height, background, mood }
├── layers: Layer[]          ← visual elements, rendered in z-order
├── timeline: TimelineStep[] ← animation sequence
├── events: EventBinding[]   ← interactive behaviors
└── meta: PanelMeta          ← context for orchestration
```

### Layer Types

| Type | Purpose | Image? | Cost |
|------|---------|--------|------|
| `background` | Gradient + pattern | No | Free |
| `sprite` | Character avatar (code-rendered) | No | Free |
| `text` | Typography block (typewriter support) | No | Free |
| `speech_bubble` | Dialogue with tail + typing effect | No | Free |
| `effect` | VFX: particles, speed lines, vignette | No | Free |
| `shape` | SVG geometric elements | No | Free |
| `data_block` | Staggered list of key concepts | No | Free |
| `scene_transition` | Decorative divider | No | Free |

**Key insight**: ZERO image generation needed. Everything is code-rendered.

### Animation System

Timeline-based with declarative keyframes:

```json
{
  "at": 1200,
  "target": "char-kai",
  "animate": { "opacity": [0, 1], "x": ["-10%", "20%"] },
  "duration": 600,
  "easing": "ease-out"
}
```

Supported easings: linear, ease-in, ease-out, ease-in-out, spring, bounce, elastic, sharp

Special animations:
- `typewriter: true` — character-by-character text reveal
- `shake: { intensity, count }` — screen shake
- `pulse: { minScale, maxScale }` — breathing effect
- `float: { distance, speed }` — gentle hovering
- `glow: { color, minOpacity, maxOpacity }` — pulsing glow

### Event System

```json
{
  "trigger": "onClick",
  "target": "char-kai",
  "actions": [
    { "type": "animate", "animate": { "shake": { "intensity": 4, "count": 3 } }, "duration": 400 }
  ]
}
```

Triggers: `onClick`, `onVisible` (intersection observer), `onHover`, `onScroll`
Actions: `animate`, `show`, `hide`, `toggle`, `playTimeline`

---

## 2. Example DSL JSON (Non-Trivial Panel)

See `frontend/lib/living-panel-types.ts` → `createSampleLivingPanel()` for the full example.

Here's a condensed version showing the concept:

```json
{
  "version": "1.0",
  "canvas": { "width": 800, "height": 600, "background": "#0a0a1a", "mood": "dramatic-dark" },
  "layers": [
    {
      "id": "bg", "type": "background",
      "props": { "gradient": ["#0a0a1a", "#1a1025"], "pattern": "halftone", "patternColor": "#8080ff" }
    },
    {
      "id": "speed-lines", "type": "effect", "opacity": 0,
      "props": { "effect": "speed_lines", "color": "#00f5ff", "intensity": 0.6 }
    },
    {
      "id": "title", "type": "text", "x": "50%", "y": "25%", "opacity": 0,
      "props": {
        "content": "THE POWER OF HABITS",
        "fontSize": "clamp(2rem, 6vw, 4rem)",
        "fontFamily": "display", "color": "#ffffff",
        "textShadow": "3px 3px 0 #00f5ff60"
      }
    },
    {
      "id": "kai", "type": "sprite", "x": "20%", "y": "60%", "opacity": 0,
      "props": { "character": "Kai", "expression": "curious", "size": 64 }
    },
    {
      "id": "bubble-kai", "type": "speech_bubble", "x": "10%", "y": "42%", "opacity": 0,
      "props": {
        "text": "How can something so small change everything?!",
        "character": "Kai", "style": "speech",
        "typewriter": true, "typewriterSpeed": 35
      }
    },
    {
      "id": "data-concepts", "type": "data_block", "x": "50%", "y": "85%", "opacity": 0,
      "props": {
        "items": [
          { "label": "Cue → Craving → Response → Reward", "highlight": true },
          { "label": "1% better every day = 37x in a year" },
          { "label": "Systems > Goals" }
        ],
        "layout": "stack", "accentColor": "#00f5ff",
        "animateIn": "stagger", "staggerDelay": 200
      }
    }
  ],
  "timeline": [
    { "at": 0, "target": "bg", "animate": { "opacity": [0, 1] }, "duration": 600 },
    { "at": 200, "target": "speed-lines", "animate": { "opacity": [0, 0.4] }, "duration": 400 },
    { "at": 300, "target": "title", "animate": { "opacity": [0, 1], "scale": [1.3, 1] }, "duration": 800, "easing": "spring" },
    { "at": 1200, "target": "kai", "animate": { "opacity": [0, 1], "x": ["-10%", "20%"] }, "duration": 600 },
    { "at": 2200, "target": "bubble-kai", "animate": { "opacity": [0, 1], "typewriter": true }, "duration": 1200 },
    { "at": 5500, "target": "data-concepts", "animate": { "opacity": [0, 1], "y": ["95%", "85%"] }, "duration": 600 }
  ],
  "events": [
    {
      "trigger": "onClick", "target": "kai",
      "actions": [{ "type": "animate", "animate": { "shake": { "intensity": 4, "count": 3 } }, "duration": 400 }]
    }
  ]
}
```

---

## 3. Engine Architecture

### High-Level Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    LivingPanelEngine                        │
│  (React Component — takes DSL JSON as prop)                 │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  DSL Parser → Layer Tree → Initial States               │  │
│  └───────────────────────────────────────────────────────┘  │
│                       │                                      │
│          ┌───────────┴────────────────┐                     │
│          │                              │                     │
│   ┌──────┴────────┐   ┌─────────────┴──┐                 │
│   │ Animation     │   │ Layer Renderer │                 │
│   │ System        │   │ Dispatcher     │                 │
│   │ (Timeline     │   │                │                 │
│   │  Scheduler)   │   │ ┌────────────┐ │                 │
│   └───────────────┘   │ │ Background │ │                 │
│          │              │ │ Sprite     │ │                 │
│   ┌──────┴────────┐   │ │ Text       │ │                 │
│   │ Event System  │   │ │ Bubble     │ │                 │
│   │ (Click/Hover/ │   │ │ Effect     │ │                 │
│   │  Visibility)  │   │ │ Shape      │ │                 │
│   └───────────────┘   │ │ DataBlock  │ │                 │
│                        │ │ Transition │ │                 │
│                        │ └────────────┘ │                 │
│                        └────────────────┘                 │
└────────────────────────────────────────────────────────────┘
```

### Key Modules

| Module | File | Responsibility |
|--------|------|----------------|
| **LivingPanelEngine** | `LivingPanelEngine.tsx` | Main React component. Parses DSL, manages state, coordinates animation + rendering. |
| **AnimationSystem** | `AnimationSystem.ts` | Timeline scheduler, easing maps, preset resolver, typewriter utility. |
| **LayerRenderers** | `LayerRenderers.tsx` | Individual renderers for each layer type. Pure presentational. |
| **DSL Types** | `living-panel-types.ts` | TypeScript type definitions for the entire DSL schema. |

### Data Flow

```
DSL JSON
  │
  └→ buildInitialStates(dsl)        → Record<string, LayerAnimState>
  └→ sortLayers(dsl.layers)          → Layer[] (z-ordered)
  └→ scheduleTimeline(dsl.timeline)   → setTimeout chain
       │
       └→ onAnimate(step) fires        → setLayerStates({...})
            │
            └→ React re-render            → Motion.div animates
                 │
                 └→ LayerContent(layer)    → Specific renderer
```

### Tech Stack (MVP)
- **React 19** — component tree
- **Motion.dev (Framer Motion)** — animation interpolation & spring physics
- **CSS animations** — particles, sparkles, continuous effects
- **SVG** — speed lines, shapes

### Future: Canvas/WebGL Migration Path
The architecture is renderer-agnostic. The `LayerContent` dispatcher can be swapped
to render to a PixiJS canvas or Three.js scene instead of DOM elements.
The DSL and timeline scheduling remain unchanged.

---

## 4. LLM Generation Strategy

### Prompt Structure

The LLM receives a **constrained system prompt** that:
1. Defines ALL valid layer types, props, and animation parameters
2. Shows the exact JSON schema expected
3. Provides style-specific animation guidance (manga=fast, noir=slow, etc.)
4. Lists hard rules (unique IDs, timeline ordering, layer requirements)

### How We Constrain Outputs

1. **Schema enforcement**: `json_mode=True` in LLM call
2. **Post-validation**: `validate_living_panel_dsl()` checks structure
3. **Auto-fix**: `fix_common_dsl_issues()` repairs common LLM mistakes
4. **Fallback**: `generate_fallback_living_panel()` creates valid DSL without LLM

### Context Injection

```
System Prompt (style-aware DSL spec)
  +
User Message:
  ├── Panel data (type, text, dialogue, mood)
  ├── Manga Bible (characters, world, motifs)
  └── Chapter summary (context, dramatic moment)
```

### Example Prompt (condensed)

```
You are a Living Manga Panel Director.
Generate a Living Panel DSL v1.0 for this panel:

PANEL TYPE: dialogue
TEXT: "But how does that work?!"
CHARACTER: Kai (curious)

AVAILABLE CHARACTERS:
  • Kai (protagonist): eager student
  • The Sage (mentor): wise teacher

Return ONLY valid JSON. Canvas is always 800x600.
Timeline: 3-8 seconds. Background layer required.
```

### Guardrails

| Check | What | Action |
|-------|------|--------|
| Version | Must be "1.0" | Auto-fix |
| Canvas | Must have width/height | Default to 800x600 |
| Layers | Must be non-empty array | Fall to fallback |
| Layer IDs | Must be unique | Deduplicate |
| Layer types | Must be in valid set | Drop invalid layers |
| Timeline | Steps must have at/target/duration | Default missing fields |
| Props | Each layer must have props dict | Auto-add empty |

---

## 5. Orchestration System

### System Flow

```
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  PDF Upload   │ → → │ Parse + Canon │ → → │ Manga Bible   │
│               │     │ Summaries     │     │ (characters   │
└───────────────┘     └───────────────┘     │ + world)      │
                                              └───────────────┘
                                                     │
                                              ┌──────┴────────┐
                                              │ Static Manga │
                                              │ Pages (JSON) │
                                              └──────┬────────┘
                                                     │
                              ┌───────────────────┴───────────────────┐
                              │                                        │
                       ┌─────┴─────────────┐        ┌────────┴──────────┐
                       │  FALLBACK PATH       │        │  LLM PATH             │
                       │  (instant, free)      │        │  (creative, costs)    │
                       │                       │        │                       │
                       │  Static panel data    │        │  Panel + Bible +      │
                       │  → Deterministic DSL │        │  Summary → LLM call  │
                       │  (auto-generated)     │        │  → Validated DSL      │
                       └──────┬──────────────┘        └────────┬──────────┘
                              │                                │
                              └─────────┬──────────────────┘
                                        │
                                ┌───────┴────────┐
                                │ Living Panel  │
                                │ DSL JSON      │
                                └───────┬────────┘
                                        │
                                ┌───────┴────────┐
                                │ LivingPanel   │
                                │ Engine        │
                                │ (React)       │
                                └───────┬────────┘
                                        │
                                ┌───────┴────────┐
                                │  Animated     │
                                │  Panel in     │
                                │  Browser      │
                                └────────────────┘
```

### Two Rendering Paths

1. **Fallback (GET endpoint)** — Instant, free, deterministic
   - Takes existing static panel data
   - Maps content_type → appropriate layers + timeline
   - No LLM call needed
   - Good enough for immediate viewing

2. **LLM-generated (POST endpoint)** — Creative, costs tokens
   - Sends panel context + manga bible + chapter summary to LLM
   - Gets back creative, tailored DSL
   - More interesting animations and compositions
   - Cached after first generation

### Cost Control

- Default view uses **fallback** (zero cost)
- LLM generation is **opt-in** (user clicks "Enhance")
- Per-panel generation (not per-book batch)
- DSL generation is CHEAP (~500 tokens per panel)
- Zero image generation in living panels

### API Endpoints

| Method | Path | Cost | Description |
|--------|------|------|-------------|
| GET | `/summary/{id}/living-panels/{ch}/{pg}` | Free | Auto-generated DSL |
| POST | `/summary/{id}/living-panels/{ch}/{pg}/generate` | ~$0.001 | LLM-generated DSL |

---

## 6. Creative Ideas / New Medium Exploration

### Novel Panel Types

1. **"Inner Monologue" Panel** — Thought bubbles that appear and dissolve like actual thoughts. Multiple overlapping translucent bubbles that shift and morph.

2. **"Time Lapse" Panel** — A data_block that counts up with an animated counter ("Day 1... Day 30... Day 365") showing character transformation over time.

3. **"Debate" Panel** — Two characters with speech bubbles that literally collide and bounce off each other. The "winning" argument gets bigger.

4. **"Revelation" Panel** — Text starts blurry/scrambled, then resolves into clarity as the key insight "crystallizes". Uses typewriter + scale animation.

5. **"Memory Flashback" Panel** — Sepia-toned background with vignette effect. Elements float in with a dreamlike slow-motion quality.

6. **"Data Storm" Panel** — Numbers and concepts rain down (particle effect) and coalesce into a central insight. For chapters with lots of statistics.

7. **"Choose Your Focus" Panel** — Multiple paths/concepts shown. Reader clicks one to expand it (event-driven). Non-linear exploration.

8. **"Emotional Spectrum" Panel** — Background color shifts continuously based on the emotional tone of the text. Happy=warm amber, tense=intense red, etc.

### Unique Storytelling Mechanics

1. **Progressive Reveal** — Panels within a page unlock sequentially. You can't see panel 3 until you've "experienced" panel 2's timeline completion.

2. **Character Growth System** — The character sprite's appearance changes across chapters (glowing brighter, more confident expression) as the reader progresses.

3. **Parallax Depth** — Background layers move at different speeds as the reader scrolls between panels, creating a 3D depth illusion.

4. **Sound Design via Typography** — "Loud" dialogue has bigger, bolder text with shake. "Whispers" are small, italic, fading. No actual audio needed.

5. **Rhythm-Based Reading** — Timeline animations create a RHYTHM. Fast panels for action, slow fades for reflection. The reading pace IS the experience.

6. **Annotation Mode** — Tap any concept in a data_block to get a mini-panel explanation. The panel "zooms" into that concept.

7. **Mood Persistence** — A chapter's mood carries over between pages via the background gradient. Transitions between moods are animated.

### What Makes This a New Medium

This isn't "manga with animations". It's:

- **Temporal storytelling** — The ORDER and TIMING of reveals IS the narrative
- **Programmable literature** — Every panel is a small program, not a picture
- **Zero-cost visuals** — Typography + animation + layout = infinite visual variety without image generation
- **Interactive reading** — The reader influences the experience through clicks and scroll
- **LLM-authored experiences** — The AI doesn't just write text, it DIRECTS a visual performance

This is closer to a **motion design studio controlled by language** than traditional manga.

---

## File Structure

```
frontend/
├── lib/
│   └── living-panel-types.ts      # DSL type definitions + sample
├── components/
│   └── LivingPanel/
│       ├── index.ts                # Barrel export
│       ├── LivingPanelEngine.tsx   # Main rendering engine (React)
│       ├── AnimationSystem.ts      # Timeline scheduler + easing
│       └── LayerRenderers.tsx      # Layer type renderers
└── app/books/[id]/manga/
    └── living/page.tsx             # Living panels viewer page

backend/app/
├── living_panel_prompts.py         # LLM prompts for DSL generation
└── generate_living_panels.py       # DSL generation + validation
```

---

## Next Steps

1. **Enhance the engine** — Add PixiJS/Canvas rendering path for smoother animations
2. **Cache generated DSLs** — Store in MongoDB alongside panel data
3. **Batch generation** — Celery task to pre-generate living panels for entire chapters
4. **Asset system** — Pre-generate SVG sprites for characters instead of circle avatars
5. **Sound design** — Optional ambient audio triggered by panel mood
6. **Export** — Record panel animations as video/GIF for sharing
7. **A/B testing** — Compare engagement between static and living panels
