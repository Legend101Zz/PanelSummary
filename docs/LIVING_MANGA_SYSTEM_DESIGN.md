# Living Manga System Design

> **Status**: Production (v2 architecture)  
> **Last Updated**: 2026-04-04  
> **Author**: Mrigesh Thakur

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [DSL Design](#2-dsl-design)
3. [Example JSON](#3-example-json)
4. [Rendering Engine Architecture](#4-rendering-engine-architecture)
5. [LLM Generation Strategy](#5-llm-generation-strategy)
6. [Orchestration System](#6-orchestration-system)
7. [Creative Ideas / New Medium Exploration](#7-creative-ideas)

---

## 1. Architecture Overview

### v2 Pipeline: "Understand First, Design Second"

```
┌──────────────────────────────────────────────────────────────────┐
│                    PIPELINE (Celery Worker)                       │
│                                                                  │
│  PDF → Parse → Compress Chapters → ORCHESTRATOR (THE BRAIN)      │
│                                       │                          │
│                                       ├─ Phase 0: Credit Check   │
│                                       │                          │
│                                       ├─ Phase 1: Document       │
│                                       │   Understanding          │
│                                       │   (Knowledge Document:   │
│                                       │    entities, relations,  │
│                                       │    data, quotes, arc)    │
│                                       │                          │
│                                       ├─ Phase 2: Story Design   │
│                                       │   (Blueprint: chars,     │
│                                       │    scenes, world, facts) │
│                                       │                          │
│                                       ├─ Phase 3: Planning       │
│                                       │   (panel assignments,    │
│                                       │    budgets, layout map)  │
│                                       │                          │
│                                       ├─ Phase 4: DSL Gen        │
│                                       │   (per-page, parallel,   │
│                                       │    semaphore-limited)    │
│                                       │                          │
│                                       └─ Phase 5: Assembly       │
│                                                                  │
│                              Optional: Image Generation          │
│                              (splash panels only, max 5/book)    │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 15)                          │
│                                                                  │
│  DSL JSON → Living Panel Engine                                  │
│               │                                                  │
│               ├─ Act Progression (tap to advance)               │
│               ├─ Cut Layout Engine (manga-native subdivisions)  │
│               ├─ Animation System (timelines + easing)          │
│               ├─ Layer Renderers (sprites, text, bubbles, FX)   │
│               ├─ Manga Ink (paper textures, borders)            │
│               └─ Effect Renderers (speed lines, screentone)     │
└──────────────────────────────────────────────────────────────────┘
```

### Why v2?

The old pipeline (v1) generated synopsis and bible **in parallel** — the bible
never even saw the synopsis. Each stage worked from lossy compressed summaries.
The result was sparse manga with generic content.

v2 flips this: **understand everything first**, then design a story from that
understanding. The Knowledge Document is the single source of truth. The
Story Blueprint maps every character to a real entity and every scene to
specific content from the document.

---

## 2. DSL Design

### Design Principles

1. **LLM-friendly**: Flat-ish JSON, no deep nesting (max 3 levels)
2. **Declarative**: Describe WHAT happens, not HOW to render
3. **Timeline-driven**: Everything is a sequence of moments
4. **Composable**: Elements reference other elements
5. **Extensible**: Unknown element types degrade gracefully

### Schema Overview

```
LivingPanel
├── meta (panel_id, chapter, page, mood, duration)
├── canvas (width, height, background)
├── layers[] (z-ordered rendering layers)
│   └── Layer
│       ├── id, type, z_index
│       └── elements[] (things to render)
│           └── Element
│               ├── id, type, position, size
│               ├── style (colors, fonts, opacity)
│               ├── content (text, sprite_id, shape)
│               └── animations[] (timeline keyframes)
│                   └── Animation
│                       ├── property (x, y, opacity, scale, rotation)
│                       ├── keyframes[] (time, value, easing)
│                       └── trigger (onLoad, onClick, onScroll)
├── events[] (panel-level interactions)
└── transitions (enter, exit effects)
```

### Element Types

| Type | Description | Key Properties |
|------|-------------|----------------|
| `text` | Typography block | content, font, wrap, effect |
| `dialogue` | Speech bubble | character, text, bubble_style |
| `sprite` | Character/object visual | sprite_id, pose, flip |
| `shape` | Geometric element | shape_type, fill, stroke |
| `particle` | Particle emitter | particle_type, rate, spread |
| `background` | Full-panel backdrop | gradient, pattern, parallax |
| `data_block` | Data visualization | data_type, values, chart |
| `effect` | Visual effect overlay | effect_type, intensity |
| `sketch` | Hand-drawn line art | strokes, draw_speed |

### Animation Types

| Type | Description | Example |
|------|-------------|----------|
| `fade` | Opacity transition | Character fade-in |
| `slide` | Position movement | Enter from left |
| `scale` | Size change | Emphasis zoom |
| `rotate` | Rotation | Spinning object |
| `typewriter` | Text reveal | Word-by-word dialogue |
| `shake` | Rapid oscillation | Impact/earthquake |
| `float` | Gentle oscillation | Dreamy atmosphere |
| `draw` | SVG path drawing | Sketch reveal |
| `parallax` | Depth-based movement | Background layers |
| `pulse` | Rhythmic scale | Heartbeat effect |
| `glitch` | Digital distortion | Tech/horror mood |
| `morph` | Shape transformation | Metamorphosis |

### Easing Functions

`linear`, `ease-in`, `ease-out`, `ease-in-out`, `bounce`,
`elastic`, `spring`, `step`

### Trigger Types

| Trigger | When it fires |
|---------|---------------|
| `onLoad` | Panel becomes visible |
| `onClick` | User taps/clicks the element |
| `onScroll` | Scroll-linked (0-1 progress) |
| `afterPrevious` | After previous animation ends |
| `withPrevious` | Same time as previous animation |
| `onHover` | Mouse hover (desktop) |
| `delay` | After N seconds |

---

## 3. Example JSON

A non-trivial panel: Character enters, speaks with typewriter effect,
background has parallax, particles float, emphasis shake on key word.

```json
{
  "panel_id": "ch1_p2_panel3",
  "meta": {
    "chapter_index": 0,
    "page_index": 1,
    "panel_index": 2,
    "content_type": "dialogue",
    "mood": "tense",
    "duration_s": 8,
    "narrative_beat": "Hero confronts the truth about the experiment"
  },
  "canvas": {
    "width": 800,
    "height": 500,
    "background": {
      "type": "gradient",
      "colors": ["#1a0a2e", "#16213e", "#0f3460"],
      "angle": 180
    }
  },
  "layers": [
    {
      "id": "bg_layer",
      "z_index": 0,
      "elements": [
        {
          "id": "bg_particles",
          "type": "particle",
          "position": { "x": 0, "y": 0 },
          "size": { "w": "100%", "h": "100%" },
          "content": {
            "particle_type": "dust",
            "count": 30,
            "color": "rgba(255,255,255,0.15)",
            "speed": 0.3,
            "direction": "up"
          },
          "animations": [
            {
              "property": "opacity",
              "trigger": "onLoad",
              "keyframes": [
                { "time": 0, "value": 0 },
                { "time": 1.5, "value": 1, "easing": "ease-in" }
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "character_layer",
      "z_index": 1,
      "elements": [
        {
          "id": "hero_sprite",
          "type": "sprite",
          "position": { "x": "-20%", "y": "60%" },
          "size": { "w": 200, "h": 350 },
          "content": {
            "sprite_id": "hero_silhouette",
            "pose": "standing_tense",
            "style": "manga_ink"
          },
          "style": {
            "filter": "drop-shadow(0 0 20px rgba(245,166,35,0.3))"
          },
          "animations": [
            {
              "property": "x",
              "trigger": "onLoad",
              "keyframes": [
                { "time": 0, "value": "-20%" },
                { "time": 1.2, "value": "15%", "easing": "ease-out" }
              ]
            },
            {
              "property": "opacity",
              "trigger": "onLoad",
              "keyframes": [
                { "time": 0, "value": 0 },
                { "time": 0.8, "value": 1, "easing": "ease-in" }
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "dialogue_layer",
      "z_index": 2,
      "elements": [
        {
          "id": "speech_bubble",
          "type": "dialogue",
          "position": { "x": "40%", "y": "15%" },
          "size": { "w": "50%", "h": "auto" },
          "content": {
            "character": "Dr. Aiko",
            "text": "The results were never meant to be published. They changed everything we knew about consciousness.",
            "bubble_style": "sharp",
            "tail_direction": "bottom-left"
          },
          "style": {
            "font_family": "manga-dialogue",
            "font_size": 16,
            "color": "#F0EEE8",
            "background": "rgba(15,14,23,0.85)",
            "border": "2px solid rgba(245,166,35,0.4)",
            "border_radius": 12,
            "padding": 16
          },
          "animations": [
            {
              "property": "text_reveal",
              "trigger": { "type": "delay", "seconds": 1.5 },
              "keyframes": [
                { "time": 0, "value": 0 },
                { "time": 3, "value": 1, "easing": "linear" }
              ],
              "effect": "typewriter",
              "sound": "typing_soft"
            },
            {
              "property": "scale",
              "trigger": { "type": "delay", "seconds": 1.3 },
              "keyframes": [
                { "time": 0, "value": 0.9 },
                { "time": 0.3, "value": 1, "easing": "spring" }
              ]
            }
          ]
        },
        {
          "id": "emphasis_word",
          "type": "text",
          "position": { "x": "62%", "y": "42%" },
          "content": {
            "text": "CONSCIOUSNESS",
            "effect": "shake"
          },
          "style": {
            "font_family": "manga-impact",
            "font_size": 28,
            "color": "#F5A623",
            "text_shadow": "0 0 30px rgba(245,166,35,0.6)"
          },
          "animations": [
            {
              "property": "shake",
              "trigger": { "type": "delay", "seconds": 4.2 },
              "keyframes": [
                { "time": 0, "value": 0 },
                { "time": 0.1, "value": 3, "easing": "linear" },
                { "time": 0.8, "value": 0, "easing": "ease-out" }
              ],
              "intensity": 5
            },
            {
              "property": "opacity",
              "trigger": { "type": "delay", "seconds": 4.0 },
              "keyframes": [
                { "time": 0, "value": 0 },
                { "time": 0.3, "value": 1, "easing": "ease-in" }
              ]
            }
          ]
        }
      ]
    }
  ],
  "transitions": {
    "enter": { "type": "fade", "duration": 0.5 },
    "exit": { "type": "slide_up", "duration": 0.4 }
  },
  "events": [
    {
      "trigger": "onClick",
      "target": "hero_sprite",
      "action": {
        "type": "animate",
        "property": "scale",
        "to": 1.1,
        "duration": 0.3,
        "revert": true
      }
    }
  ]
}
```

---

## 4. Rendering Engine Architecture

### Tech Stack

- **React** for component lifecycle
- **Canvas 2D / PixiJS** for hardware-accelerated rendering
- **CSS animations** for simple text/UI elements (better perf)
- **Hybrid approach**: Simple panels → CSS/DOM; Complex panels → Canvas

### Key Modules

```
┌─────────────────────────────────────────────┐
│              LivingPanelRenderer             │
│  (React component, entry point)             │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ DSL Parser  │  │  Asset Manager       │  │
│  │ (validate + │  │  (sprites, fonts,    │  │
│  │  normalize) │  │   audio preload)     │  │
│  └──────┬──────┘  └──────────┬───────────┘  │
│         │                    │              │
│         ▼                    ▼              │
│  ┌──────────────────────────────────────┐   │
│  │         Scene Graph                  │   │
│  │  (tree of entities, z-ordered)       │   │
│  │  Entity { id, type, transform,       │   │
│  │           style, children }          │   │
│  └──────────────────┬───────────────────┘   │
│                     │                       │
│         ┌───────────┼───────────┐           │
│         ▼           ▼           ▼           │
│  ┌────────────┐ ┌─────────┐ ┌──────────┐   │
│  │ Animation  │ │ Render  │ │ Event    │   │
│  │ Scheduler  │ │ Pipeline│ │ System   │   │
│  │            │ │         │ │          │   │
│  │ Timeline   │ │ Text    │ │ onClick  │   │
│  │ Easing     │ │ Sprite  │ │ onScroll │   │
│  │ Sequencing │ │ Shape   │ │ onHover  │   │
│  │ Physics    │ │ Particle│ │ Autoplay │   │
│  └────────────┘ └─────────┘ └──────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

### Data Flow

```
DSL JSON
  │
  ▼
┌──────────────┐
│  DSL Parser  │ → Validate against schema
│              │ → Resolve references
│              │ → Normalize units (%, px)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Asset Loader │ → Preload sprites, fonts
│              │ → Generate CSS sprites
│              │ → Prepare audio buffers
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Scene Graph  │ → Build entity tree
│  Builder     │ → Assign z-indices
│              │ → Calculate layout
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Animation   │ → Parse timelines
│  Scheduler   │ → Register triggers
│              │ → Build easing curves
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Render     │ → requestAnimationFrame loop
│   Loop       │ → Update animations
│              │ → Render entities
│              │ → Handle events
└──────────────┘
```

### Rendering Strategy (Hybrid)

| Complexity | Renderer | Use Case |
|-----------|----------|----------|
| Low | DOM + CSS | Text panels, simple fades |
| Medium | DOM + CSS Animations | Dialogue with typewriter |
| High | Canvas 2D | Particles, complex sprites |
| Very High | PixiJS/WebGL | Physics, heavy animation |

The `LivingPanelRenderer` auto-selects based on panel complexity:
- Count animations, particles, sprites
- If > threshold → upgrade to Canvas
- If particles or physics → use PixiJS

### Mobile Optimization

- Reduce particle count on mobile
- Use CSS transforms (GPU-accelerated) over JS position updates
- Lazy-load panels (IntersectionObserver)
- Pause off-screen animations
- Touch events → gesture system (swipe, tap, long-press)

---

## 5. LLM Generation Strategy

### Prompt Architecture

The orchestrator uses a **3-layer prompt** for DSL generation:

```
┌─────────────────────────────────────────┐
│  LAYER 1: SYSTEM PROMPT (constant)      │
│  - DSL schema definition                │
│  - Element type catalog                 │
│  - Animation primitives                 │
│  - Quality guidelines                   │
│  - Anti-patterns to avoid               │
└─────────────────────────────────────────┘
            +
┌─────────────────────────────────────────┐
│  LAYER 2: BOOK CONTEXT (per-book)       │
│  - Manga Bible (characters, world)      │
│  - Book synopsis (narrative arc)        │
│  - Color palette, visual mood           │
│  - Character descriptions               │
└─────────────────────────────────────────┘
            +
┌─────────────────────────────────────────┐
│  LAYER 3: PANEL ASSIGNMENT (per-panel)  │
│  - Content type, narrative beat         │
│  - Text content, dialogue              │
│  - Character, expression, mood          │
│  - Layout hint from planner             │
│  - Adjacent panel context (pacing)      │
│  - Creative direction                   │
└─────────────────────────────────────────┘
```

### Schema Enforcement

1. **JSON Schema in prompt**: Include the exact schema so the LLM
   knows the structure
2. **Post-validation**: Parse output → validate against Pydantic model
3. **Fallback generation**: If invalid, generate a safe static panel
4. **Retry with feedback**: If partially valid, retry with error msg

### Guardrails

```python
# Validation checks on every generated DSL:
1. panel_id matches expected format
2. All element IDs are unique within panel
3. Animation timelines don't exceed duration_s
4. Trigger references point to existing elements
5. No more than MAX_ELEMENTS per panel (perf)
6. No more than MAX_PARTICLES per panel (mobile)
7. Text content matches assignment text
8. Character names match manga bible
9. Colors are valid CSS/hex
10. Positions are valid (%, px, or relative)
```

### Example System Prompt (Layer 1)

```
You are a Living Manga Panel Designer. You create animated,
interactive manga panels using a structured DSL.

Your output is a JSON object following this schema:
[schema here]

GUIDELINES:
- Prefer typography + animation over images
- Use particles sparingly (max 50 per panel)
- Every panel must have at least one animation
- Dialogue should use typewriter effect
- Vary layouts between adjacent panels
- Use the character's established color from the bible
- Emotion drives everything: match animations to mood

ANTI-PATTERNS (avoid):
- Static panels with no animation
- More than 3 layers (performance)
- Animations longer than 10 seconds
- Nesting elements more than 2 levels deep
```

---

## 6. Orchestration System

### Current Implementation

The orchestrator (`backend/app/agents/orchestrator.py`) already
implements most of this. Here's the flow:

```
┌─────────────────────────────────────────────────────┐
│                  CELERY WORKER                       │
│                                                     │
│  Stage 1: Compress chapters (parallel, N chapters)  │
│     │                                               │
│     ▼                                               │
│  Stage 2: ORCHESTRATOR.run()                        │
│     │                                               │
│     ├─ Phase 0: Credit check                        │
│     │     └─ Abort if no credits                    │
│     │                                               │
│     ├─ Phase 1: Book analysis                       │
│     │     ├─ generate_book_synopsis()               │
│     │     └─ generate_manga_bible()                 │
│     │                                               │
│     ├─ Phase 2: Plan manga structure                │
│     │     └─ plan_manga() → MangaPlan               │
│     │         (panel assignments, parallel groups)   │
│     │                                               │
│     ├─ Phase 3: Cost estimation                     │
│     │     └─ Warn if est. cost > 90% of budget      │
│     │                                               │
│     ├─ Phase 4: Parallel DSL generation             │
│     │     ├─ asyncio.gather(all panels)              │
│     │     ├─ Semaphore limits concurrency            │
│     │     ├─ Cancel check between panels             │
│     │     └─ Fallback on failure                     │
│     │                                               │
│     └─ Phase 5: Assembly                            │
│           ├─ Order panels by chapter/page/panel     │
│           ├─ Collect image_panel_ids                 │
│           └─ Return OrchestratorResult              │
│     │                                               │
│     ▼                                               │
│  Stage 3: Image generation (optional)               │
│     └─ Only for panels with image_budget=true       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Caching Strategy

- **Chapter summaries**: Cached in MongoDB (canonical_chapters)
- **Synopsis + Bible**: Stored in BookSummary document
- **Living panels**: Stored as JSON array in BookSummary
- **Panel-level cache**: Keyed by (content_hash + style)
- **Incremental regen**: Can re-run single chapters

### Cost Control

- CreditTracker monitors spend in real-time
- Auto-cancel if budget exceeded
- Image budget (default 5) limits expensive gen
- Fallback panels are free (no LLM call)

---

## 7. Creative Ideas / New Medium Exploration

### Beyond Traditional Manga

This system enables things impossible in print or static digital:

#### 1. **Emotional Resonance Panels**
The mood of a panel affects its physics.
- Anxious scene → elements jitter slightly
- Peaceful scene → everything floats gently
- Rage → elements vibrate, colors intensify
- Sadness → everything moves in slow motion, desaturates

#### 2. **Data-Driven Storytelling**
Panels that visualize information AS story:
- A character explains market trends → actual chart animates in
- Battle statistics appear as floating data blocks
- Memory sequences show timeline scrubbers

#### 3. **Reader-Reactive Panels**
- Scroll speed affects animation speed
- Time of day changes panel lighting
- Reading history affects panel mood ("you've been here before")
- Tap a character to see their internal monologue

#### 4. **Typographic Theater**
Text IS the visual:
- Words physically construct the scene
- Dialogue text forms the shape of the speaker
- Whispers are tiny, shouts are massive
- Multiple voices overlap visually (cacophony effect)

#### 5. **Sketch-to-Life Panels**
Hand-drawn aesthetic that builds in real-time:
- Ink lines draw themselves
- Watercolor washes spread
- Pencil sketches that resolve into clarity
- Erasure effects for memory/dream sequences

#### 6. **Musical Panels**
Visual rhythm:
- Elements animate to an implicit beat
- Colors pulse in rhythm
- Dialogue appears synced to musical timing
- Action panels have staccato movements

#### 7. **Dimensional Panels**
Pseudo-3D without 3D rendering:
- Parallax layers (3-5 depth layers)
- Elements scale with depth
- Camera "moves" through the scene
- Perspective shifts on device tilt (gyroscope)

#### 8. **Montage Sequences**
Multiple micro-panels in rapid succession:
- Quick cuts between scenes
- Split-screen emotional contrasts
- Time-lapse within a single panel
- Photo-booth style memory sequences

#### 9. **Living Backgrounds**
Environments that breathe:
- Rain that actually falls
- Clouds that drift
- City lights that twinkle
- Foliage that sways
- All done with particles + CSS — no images needed

#### 10. **Dialogue as Architecture**
Conversations build the scene:
- First character's words form the floor
- Second character's words form the walls
- Argument = words collide and shatter
- Agreement = words merge and solidify

### What Makes This a New Medium

This isn't "manga with animations" — it's a new format:

| Traditional Manga | Living Manga |
|---|---|
| Static layouts | Programmable canvases |
| Fixed reading pace | Reader-controlled timing |
| Visual-only storytelling | Multi-sensory (visual + motion + audio) |
| One reading experience | Different each time |
| Image-dependent | Typography + animation first |
| Artist bottleneck | LLM-generatable |
| Print-constrained | Web-native, interactive |

---

## Implementation Status

- [x] Orchestrator architecture (backend/app/agents/orchestrator.py)
- [x] Planner agent (backend/app/agents/planner.py)
- [x] DSL generator agent (backend/app/agents/dsl_generator.py)
- [x] Credit tracking system (backend/app/agents/credit_tracker.py)
- [x] Celery worker integration (single brain, no Stage 4)
- [x] Frontend Living Panel renderer (basic)
- [ ] Full DSL v2 schema implementation
- [ ] Particle system
- [ ] Audio cue system
- [ ] Sketch-to-life renderer
- [ ] Gyroscope/tilt support
- [ ] Reader-reactive panels
