# Living Manga Panels — System Design Document

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         ORCHESTRATION LAYER                          │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐  │
│  │ Book Pipeline  │   │ DSL Generator  │   │ Asset Manager  │  │
│  │ (existing)     │──▶│ (LLM Agent)    │──▶│ (cache/CDN)    │  │
│  └─────────────────┘   └─────────────────┘   └─────────────────┘  │
│       │                      │                      │             │
│       ▼                      ▼                      ▼             │
│  Chapter Summary      LivingPanelDSL v2.0       Sprite/BG        │
│  + Manga Bible        (JSON document)            Assets           │
└──────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         RENDERING ENGINE                            │
│                                                                      │
│  DSL JSON ──▶ Act Scheduler ──▶ Layout Engine ──▶ Layer Compositor    │
│                                  │                   │              │
│                            Sub-Panel Grid        Animation System   │
│                            (CSS Grid)            (Timeline + Motion) │
│                                  │                   │              │
│                            Layer Renderers       Event System       │
│                            (React components)    (click/hover)      │
│                                  │                                  │
│                                  ▼                                  │
│                           ┌─────────────────┐                       │
│                           │  Screen Output  │                       │
│                           │  (DOM/CSS/SVG)  │                       │
│                           └─────────────────┘                       │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 1. DSL Design (v2.0) — The Language

### Core Concept: Acts, Not Layers

The v1.0 DSL was a flat layer stack with a single timeline — basically After Effects.
v2.0 introduces **Acts**: temporal scenes within a panel. A panel is a **scene** that
plays through acts sequentially, like frames in a storyboard.

**Why acts?**
- A panel can start as a single dark void with text, then *crack* into 4 sub-panels
- Each act can have a completely different spatial layout
- Sub-panels within an act have their own independent animation timelines
- Transitions between acts create cinematic moments (crack, morph, iris, whip-pan)

### Schema Structure

```
LivingPanelDSL
├─ version: "2.0"
├─ canvas: { width, height, background, mood }
├─ acts[]
│   ├─ id, duration_ms
│   ├─ transition_in: { type, duration_ms, easing }
│   ├─ layout: { type, gap, stagger_ms }
│   ├─ layers[]: Act-level layers (backgrounds, effects)
│   ├─ cells[]: Sub-panels
│   │   ├─ id, position
│   │   ├─ style: { background, border, clipPath }
│   │   ├─ layers[]: Cell-local layers
│   │   └─ timeline[]: Cell-local animations
│   ├─ timeline[]: Act-level animations
│   └─ events[]: Interactive behaviors
└─ meta: { panel_id, narrative_beat, duration_ms }
```

### Design Principles
1. **Max 3 levels deep** — LLM-friendly, no recursive nesting
2. **Timeline-based** — keyframes, not imperative code
3. **Act-driven** — temporal structure drives spatial composition
4. **Flat within cells** — each sub-panel is a simple layer stack
5. **Transitions are first-class** — how you enter an act matters

### Available Layout Types
| Layout | Positions | Use Case |
|--------|-----------|----------|
| `full` | main | Single canvas, splash |
| `split-h` | left, right | Contrast, dialogue |
| `split-v` | top, bottom | Before/after, reveal |
| `grid-2x2` | tl, tr, bl, br | Examples, montage |
| `grid-3` | left, top-right, bottom-right | Focus + detail |
| `l-shape` | main, side-top, side-bottom | Main + sidebar |
| `t-shape` | top, bottom-left, bottom-right | Wide + details |
| `diagonal` | top-left, bottom-right | Dynamic tension |
| `overlap` | back, front | Layered depth |

### Available Transitions
| Transition | Effect |
|------------|--------|
| `cut` | Hard cut (instant) |
| `fade` | Opacity crossfade |
| `crack` | Panel shatters/cracks open |
| `morph` | Smooth shape transformation |
| `iris` | Circle wipe in/out |
| `zoom_through` | Camera pushes through |
| `slide_left/up` | Directional slide |
| `whip_pan` | Fast blur-pan |
| `ink_wash` | Ink spreading effect |
| `dissolve` | Pixel dissolve |

---

## 2. Example DSL JSON

See `frontend/lib/sample-living-book.ts` for 5 complete panels.

Here's the conceptual flow of Panel 1 ("The Opening"):

**Act 1 (4.5s): The Void**
- Black screen, single question fades in word-by-word
- "What if the smallest thing you do today changes everything tomorrow?"
- A tiny blue dot pulses at the bottom

**Act 2 (8s): The Crack** _(transition: crack)_
- Panel SHATTERS into a 2×2 grid
- Each cell reveals a habit example with staggered entry:
  - ☀️ 5:30 AM / One pushup. Then two. Then ten.
  - 📖 One page before bed. 50 books a year.
  - ✏️ One sentence each morning. A novel in 18 months.
  - 1% better every day = 37× in a year (pulses)

---

## 3. Rendering Engine Architecture

### Key Modules

| Module | Responsibility |
|--------|---------------|
| `LivingPanelEngine` | Root orchestrator: act scheduling, transitions |
| `ActRenderer` | Renders one act: background layers + cell grid |
| `SubPanelRenderer` | Renders one cell with stagger delay |
| `ActLayerStack` | Reusable layer stack with timeline scheduling |
| `LayerWrapper` | Positioning + motion animation per layer |
| `LayerContent` | Dispatches to type-specific renderers |
| `AnimationSystem` | Timeline scheduler, easing maps, typewriter |
| `LayerRenderers` | Background, Sprite, Text, SpeechBubble, Image |
| `EffectRenderers` | Speed lines, particles, sparkle, vignette |

### Data Flow

```
DSL JSON
  │
  ▼
LivingPanelEngine
  ├─ Extracts acts[]
  ├─ Manages actIndex (auto-advance via setTimeout)
  ├─ AnimatePresence wraps act transitions
  │
  ▼
ActRenderer (per act)
  ├─ ActLayerStack for act-level layers
  ├─ CSS Grid from layout.type
  │
  ▼
SubPanelRenderer (per cell)
  ├─ Stagger delay from layout.stagger_ms
  ├─ ActLayerStack for cell-level layers
  │
  ▼
ActLayerStack (reusable)
  ├─ buildInitialStates() from layers + timeline
  ├─ scheduleTimeline() → setTimeout per step
  ├─ LayerWrapper (positioning + motion)
  └─ LayerContent (type dispatch)
```

### Tech Stack
- **React** — component tree
- **Motion (Framer Motion)** — animation interpolation, springs, transitions
- **CSS Grid** — sub-panel layouts
- **SVG** — speed lines, shapes
- **CSS keyframes** — particles, sparkles, shake
- **No Canvas/WebGL** — DOM-based for accessibility + SEO

---

## 4. LLM Generation Strategy

### Prompt Structure

```
You are a Living Manga Panel Director.

Given a narrative beat from a book chapter, generate a LivingPanelDSL v2.0
JSON that creates a cinematic, animated manga panel.

## INPUTS PROVIDED
- Chapter summary (what happens)
- Manga Bible (character names, visual style, color palette)
- Panel context (where this panel sits in the page, content_type)
- Previous panel's narrative_beat (for continuity)

## YOUR JOB
Design 1-3 acts that tell this narrative beat through:
1. Spatial composition (layouts that change between acts)
2. Temporal reveals (what appears when, in what order)
3. Character interaction (sprites + speech bubbles with typewriter)
4. Typography as emotion (font size, color, shadow = mood)
5. Effects as punctuation (speed lines for impact, sparkles for wonder)

## RULES
- Each act has ONE clear purpose (setup, reveal, punchline)
- Transitions between acts should feel intentional (crack = surprise, morph = evolution)
- Timeline: stagger elements 300-800ms apart for readability
- Never more than 3 acts per panel
- Never more than 6 layers per cell
- Sub-panels: max 4 cells per act
- Typewriter speed: 25-50ms per character
- Total panel duration: 5-15 seconds
- Use the character names and colors from the Manga Bible

## OUTPUT
Return ONLY valid JSON conforming to LivingPanelDSL v2.0 schema.
```

### Guardrails

1. **JSON Schema validation** — Validate against TypeScript types after generation
2. **Duration bounds** — Reject if total duration < 3s or > 20s
3. **Layer count limits** — Max 8 layers per act, max 6 per cell
4. **Timeline ordering** — Verify `at` values are monotonically reasonable
5. **Character consistency** — Cross-reference character names against Manga Bible
6. **Retry with feedback** — If validation fails, send error back to LLM with fix instructions

### Generation Pipeline

```
Chapter Summary + Manga Bible + Panel Context
                  │
                  ▼
          System Prompt (template above)
                  │
                  ▼
            LLM Generation
                  │
                  ▼
          JSON Parse + Schema Validate
                  │
          ┌─────┴─────┐
          │ Valid?     │
          ├─Yes─▶ Store in MongoDB
          └─No──▶ Retry with error feedback (max 2 retries)
```

---

## 5. Orchestration System

### Full Pipeline Flow

```
┌───────────────────────────────────────────────────┐
│              EXISTING PIPELINE                   │
│  PDF → Chapter Summaries → Manga Bible → Pages   │
└────────────────────────┬──────────────────────────┘
                         │
                         ▼
┌───────────────────────────────────────────────────┐
│          LIVING PANEL PIPELINE (NEW)               │
│                                                     │
│  For each page in manga_chapters:                   │
│    For each panel in page.panels:                   │
│      1. Build context (chapter summary, manga       │
│         bible, panel type, position, neighbors)     │
│      2. Check cache (MongoDB: living_panels          │
│         collection, keyed by panel_id)              │
│      3. If not cached:                              │
│         a. Send to LLM with DSL generation prompt   │
│         b. Validate response                        │
│         c. Store in MongoDB                         │
│      4. Return DSL JSON to frontend                 │
│                                                     │
│  Cost control:                                      │
│  - Cache aggressively (one generation per panel)    │
│  - Batch panels per page (parallel LLM calls)       │
│  - Use cheaper models for simpler panel types       │
│    (narration = GPT-4o-mini, splash = GPT-4o)      │
│  - No image generation in living panels             │
│    (sprites are code-rendered, not AI images)       │
└───────────────────────────────────────────────────┘
                         │
                         ▼
┌───────────────────────────────────────────────────┐
│                FRONTEND                             │
│  /books/{id}/manga/living?summary={id}              │
│                                                     │
│  LivingPanelEngine receives DSL JSON                │
│  → Schedules acts → Renders layers → Animates      │
└───────────────────────────────────────────────────┘
```

### Incremental Generation
- Living panels are generated **lazily** — only when a user views a page
- First view triggers generation, subsequent views hit cache
- Panels on the same page can be generated in parallel
- Celery worker handles background generation

### Cost Model
- DSL generation: ~500-1000 tokens per panel (GPT-4o-mini: ~$0.001/panel)
- A typical book: 10 chapters × 5 pages × 3 panels = 150 panels
- Total cost: ~$0.15 per book for living panels
- Zero image generation cost (all code-rendered)

---

## 6. Creative Ideas — New Medium Exploration

### What makes this different from "animated comics"?

Traditional motion comics just add motion to static panels. We're building
something fundamentally different: **panels that think about how to tell
their story through spatial and temporal composition.**

### Novel Panel Types

#### 1. 🌊 The Breathing Panel
The panel subtly expands and contracts with the reader's scroll speed.
Faster scrolling = faster breathing = more tension. Slow down = calm.

#### 2. ⏳ The Time-Lapse Cell
A sub-panel that shows compressed time: a plant growing, a habit
tracker filling up day by day, seasons changing in the background.
Done with CSS animations + SVG, zero AI images.

#### 3. 📊 The Data Revelation
A panel that starts as narrative prose, then morphs into a data
visualization. "Habits compound" becomes a visible exponential curve
drawn in real-time. Numbers animate up. The typography IS the chart.

#### 4. 🌀 The Perspective Shift
Panel splits in half: left side shows the character's internal
monologue (dark, thought bubbles), right side shows external
reality (bright, speech bubbles). Both timelines play simultaneously.

#### 5. 🎭 The Mask Panel
Character sprite starts with one expression, but on click/tap,
the "mask" peels away to reveal a different expression underneath.
"What they show" vs "what they feel".

#### 6. 💥 The Impact Frame
A single word or phrase fills the entire panel with increasing
scale, then SLAMS to final position with screen shake and speed lines.
Think manga emphasis frames but programmatic.

#### 7. 🌍 The Parallax Scene
Multiple background layers at different scroll speeds create depth.
Character sprites move at foreground speed, landscapes at background
speed. Creates a 2.5D effect without any 3D rendering.

#### 8. 📝 The Live Annotation
As the narrative plays, annotations appear on the side like a
teacher's marginalia. Clickable annotations reveal deeper insights.
The panel becomes a learning surface, not just a story surface.

#### 9. 🎵 The Rhythm Panel
Elements appear to a beat. Speech bubbles pop in on rhythm.
Data points land on beats. The panel has a musical quality.
Implemented via carefully timed timeline steps.

#### 10. ♾️ The Loop Panel
The last frame's ending state becomes the first frame's beginning
state, creating an infinite loop. Perfect for illustrating cycles
(habit loops, feedback loops, compound growth).

### Storytelling Mechanics

#### Spatial Narrative
- Panel splits don't just show content — they mean something
- Left/right splits = comparison, contrast, choice
- Top/bottom splits = before/after, cause/effect
- 2×2 grids = parallel examples, montage
- Full canvas = emphasis, immersion, impact

#### Temporal Narrative
- The ORDER things appear conveys meaning
- A question appears before the answer (tension)
- Characters enter before they speak (presence)
- Data appears after the claim (evidence)
- The punchline is always last (impact)

#### Emotional Typography
- Font size = volume (small = whisper, huge = scream)
- Color temperature = emotion (warm = comfort, cold = fear)
- Letter spacing = pacing (tight = fast, wide = slow)
- Text shadow = weight (heavy shadow = important)
- Typewriter speed = urgency (fast = excited, slow = thoughtful)

---

## Files Modified/Created

| File | Purpose |
|------|--------|
| `frontend/lib/living-panel-types.ts` | DSL v2.0 type definitions |
| `frontend/lib/sample-living-book.ts` | 5 handcrafted sample panels |
| `frontend/components/LivingPanel/LivingPanelEngine.tsx` | Act-based rendering engine |
| `frontend/components/LivingPanel/LayerRenderers.tsx` | Layer dispatching + image type |
| `frontend/components/LivingPanel/index.ts` | Exports |
| `frontend/app/books/[id]/manga/living/page.tsx` | Viewer page with demo mode |

## What's Working Now

The living panel viewer at:
```
http://localhost:3000/books/{any-id}/manga/living?summary={any-id}
```

Shows 5 animated panels you can navigate with arrow keys:
1. **The Opening** — void → crack into 4 habit examples
2. **The Habit Loop** — mentor dialogue → loop diagram + examples
3. **The Identity Shift** — wrong way (red) → right way (gold) → contrast
4. **The Environment** — dramatic quote with speed lines
5. **The Two-Minute Rule** — progressive dialogue reveal
