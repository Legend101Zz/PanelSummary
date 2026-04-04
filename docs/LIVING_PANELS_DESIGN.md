# Living Manga Panels — System Design & Architecture

## What This Is

Living Manga Panels transform static comic panels into **interactive, animated reading experiences**.
Each panel is driven by a DSL (Domain-Specific Language) that an LLM generates
and a browser-based rendering engine interprets.

Instead of expensive image generation for every panel, we use:
- **Code-rendered sprites** (character silhouettes, expressions)
- **Typography as art** (typewriter reveals, slam-in text, staggered lists)
- **Animation timelines** (keyframe sequences with easing)
- **Manga patterns** (screentone, crosshatch, speed lines)
- **Reader-controlled pacing** (tap to advance between acts)

---

## 1. DSL Design (v2.0)

### Core Principles
- **LLM-friendly**: Flat-ish JSON, no excessive nesting, clear field names
- **Act-based**: Each panel has 1–3 "acts" — temporal states the reader taps through
- **Composition-aware**: Panels on the same page are generated together
- **Extensible**: New layer types and effects can be added without schema changes

### Top-Level Structure
```json
{
  "version": "2.0",
  "canvas": {
    "width": 800,
    "height": 600,
    "background": "#F2E8D5",
    "mood": "light"
  },
  "acts": [ ... ],
  "meta": {
    "panel_id": "ch0-pg0-p0",
    "chapter_index": 0,
    "content_type": "dialogue",
    "narrative_beat": "The mentor reveals the truth",
    "duration_ms": 5000
  }
}
```

### Act Structure
Each act is a self-contained scene with:
- **Layout**: How the panel is subdivided (full, split, cuts)
- **Layers**: Visual elements (background, sprites, text, effects)
- **Cells**: Sub-panels within cut layouts, each with own layers + timeline
- **Timeline**: Animation sequence for the act
- **Transition**: How to enter this act (fade, cut, iris, etc.)

### Layer Types
| Type | Purpose | Key Props |
|------|---------|----------|
| `background` | Panel backdrop | gradient, pattern, patternOpacity |
| `sprite` | Character visual | character, expression, size, silhouette |
| `text` | Narration/title | content, fontSize, fontFamily, typewriter |
| `speech_bubble` | Dialogue | text, character, style, tailDirection |
| `effect` | Visual FX | effect type, intensity, direction |
| `shape` | Geometric | shape, fill, stroke |
| `data_block` | Info display | items[], accentColor, animateIn |
| `scene_transition` | Scene change | color, text |
| `image` | AI-generated image | (expensive, budget-limited) |

### Layout System: Cuts
The cut system is manga-native: start with one panel, cut it recursively:
```json
"layout": {
  "type": "cuts",
  "cuts": [
    { "direction": "h", "position": 0.55, "angle": 1.5 },
    { "direction": "v", "position": 0.65, "angle": -1, "target": 0 }
  ],
  "gap": 5,
  "stagger_ms": 200
}
```

The slight `angle` (1–2°) gives the hand-ruled manga feel.

---

## 2. Example DSL JSON

See `living_panel_prompts.py` for two complete examples embedded in the LLM prompt:
1. **DRAMATIC SPLASH** — speed lines + SFX + sprite + text slam-in
2. **QUIET DIALOGUE** — cut layout + 2 acts + typewriter bubbles

---

## 3. Engine Architecture

### Data Flow
```
DSL JSON → LivingPanelEngine (React)
  └─ ActRenderer
      ├─ ActLayerStack (act-level layers + timeline)
      ├─ CutLayout (if layout.type === 'cuts')
      │   └─ CellRenderer (per-cell layers + timeline)
      └─ GridLayout (if layout.type === 'split-h', etc.)
          └─ CellRenderer

Animation: AnimationSystem.ts (scheduleTimeline, easing)
Rendering: LayerRenderers.tsx (per-type components)
Aesthetics: MangaInk.tsx (PaperTexture, InkBorder)
Cuts: CutLayoutEngine.tsx (recursive subdivision)
```

### Key Modules
| Module | Responsibility |
|--------|---------------|
| `LivingPanelEngine.tsx` | Act state machine, tap-to-advance, transitions |
| `AnimationSystem.ts` | Timeline scheduler, easing functions, keyframe interpolation |
| `LayerRenderers.tsx` | Per-type rendering (sprite, text, bubble, effect) |
| `CutLayoutEngine.tsx` | Manga cut subdivision algorithm + CSS clip-path |
| `MangaInk.tsx` | Paper textures, ink borders, screentone patterns |

### Reader Interaction Model
1. Panel loads → Act 1 auto-plays its timeline
2. Timeline completes → "tap ▶" hint appears
3. Reader taps → Transition to Act 2
4. Final act completes → Panel is "done"
5. Act dots at bottom show progress

---

## 4. LLM Generation Strategy

### Per-Page Generation (Primary Path)
Panels on the same page are generated in a **single LLM call**.
This lets the model compose panels that work together:
- Vary pacing (slow panel next to fast panel)
- Vary layout types (don't give every panel the same layout)
- Create visual contrast (light/dark, busy/sparse)

### Prompt Structure
```
[System] Living Manga Panel Director prompt
  ├─ DSL v2.0 specification (schema reference)
  ├─ Emotion→Technique mapping (mood → creative choices)
  ├─ 2 diverse example panels (learn style, not content)
  └─ Critical rules (constraints, validation)

[User] Page context
  ├─ Panel assignments (type, mood, text, dialogue, characters)
  ├─ Relevant characters from manga bible (only those on this page)
  ├─ Chapter context (title, theme)
  └─ Previous chapter ending (for cross-chapter continuity)
```

### Temperature Mapping
Content type drives creativity level:
| Type | Temperature | Rationale |
|------|-------------|----------|
| `splash` | 0.9 | Maximum creativity |
| `concept` | 0.9 | Abstract, needs imagination |
| `montage` | 0.85 | Creative sequencing |
| `dialogue` | 0.75 | Balanced creativity |
| `narration` | 0.7 | Consistent pacing |
| `data` | 0.6 | Structured, accurate |

### Guardrails
1. **Schema validation** after every generation (validate_living_panel_dsl)
2. **Auto-fix** common LLM mistakes (fix_common_dsl_issues)
3. **Per-panel fallback** if page generation returns fewer panels than expected
4. **JSON mode** in OpenAI calls; robust parsing for OpenRouter
5. **Retry with stricter instructions** on JSON parse failure
6. **Max 3 acts** enforced in prompt (prevents runaway complexity)

---

## 5. Orchestration System

### Pipeline Flow
```
┌───────────────────────────────────────────────────────┐
│  PHASE 0: Credit Check                               │
│  Check OpenRouter balance, abort if $0               │
└───────────────────────────────────────────────────────┘
                           │
┌─────────────────────────┬─────────────────────────────┐
│  PHASE 1a: Synopsis       │  PHASE 1b: Manga Bible        │
│  (Book thesis, arc,      │  (Characters, motifs,          │
│   emotional journey)     │   visual style per chapter)    │
└─────────────────────────┴─────────────────────────────┘
               │ (parallel)                     │
               └─────────────────────────────┘
                           │
┌───────────────────────────────────────────────────────┐
│  PHASE 2: Planner                                    │
│  Creates PanelAssignment list                        │
│  (chapter → page → panel structure)                  │
│  Sets content types, moods, image budget              │
└───────────────────────────────────────────────────────┘
                           │
┌───────────────────────────────────────────────────────┐
│  PHASE 3: Per-Page DSL Generation                    │
│  Group panels by (chapter, page)                     │
│  One LLM call per page (2-4 panels)                  │
│  Semaphore limits to 4 concurrent calls               │
│  Previous chapter ending for continuity               │
└───────────────────────────────────────────────────────┘
                           │
┌───────────────────────────────────────────────────────┐
│  PHASE 4: Assembly                                   │
│  Validate each panel DSL                             │
│  Collect image-eligible panels                       │
│  Store to MongoDB (LivingPanelDoc collection)        │
└───────────────────────────────────────────────────────┘
```

### Cost Control
- **Per-page generation** cuts API calls by ~3x (25 panels → 8 pages)
- **Image budget** limits expensive image generation (default: 5 per book)
- **Credit tracking** with pre-flight estimate and real-time updates
- **Cancellation** via DB flag check (5-second cache)
- **Task timeout** (10 min hard limit via Celery)

### Caching Strategy
- Generated DSLs stored in MongoDB `living_panels` collection
- Manga Bible and Synopsis stored on BookSummary document
- Frontend caches panel DSLs in React state
- No re-generation if panels already exist (unless explicitly requested)

---

## 6. Creative Ideas / New Medium Exploration

### Novel Panel Types
1. **Data Reveal Panels**: Key statistics animate in as data_blocks with stagger reveals. Numbers count up. Charts build bar-by-bar. The data IS the drama.

2. **Echo Panels**: Same layout, 2 acts, different text. First act shows what was said. Second act shows what was meant. Visual mood shifts between acts.

3. **Perspective Split**: Cut layout where each cell shows the same moment from a different character's POV. Same event, different speech bubbles, different expressions.

4. **Ambient Panels**: No text at all. Just background patterns evolving over time — rain particles, floating kanji, shifting screentone density. Mood as content.

5. **Choice Panels**: Interactive branch point. Two speech bubbles appear; reader taps one to advance to a different act. (Not just linear tap-through.)

### Unique Storytelling Mechanics

1. **Pacing as Meaning**: Slow typewriter = gravity. Fast slam-in = urgency. The reader FEELS the emotional weight through animation timing, not just words.

2. **Composition Contrast**: Because we generate per-page, adjacent panels can create visual dialectic — a cramped, dark dialogue panel next to a wide-open splash. The contrast is intentional.

3. **Progressive Revelation**: Information arrives in layers. Background first, then character, then context, then the punchline. Each layer adds meaning. The reader watches understanding build.

4. **SFX as Language**: Onomatopoeia isn't decoration — it's storytelling. A "CRACK" SFX at 48px rotated -8° communicates differently than "crack" in a speech bubble.

5. **Screentone Storytelling**: Manga patterns (screentone, crosshatch, speed lines) aren't just aesthetic — they encode mood. Dense crosshatch = scholarly weight. Speed lines = urgency. Halftone = mystery.

### What Makes This a New Medium

Traditional manga: static, ink on paper, reader controls pacing by eye movement.
Traditional animation: temporal, creator controls pacing.

**Living Manga Panels**: The reader controls MACRO pacing (tap between acts)
but the creator controls MICRO pacing (animation timing within acts).
This is a new medium: **reader-directed animation**.

The reader gets the deliberate pacing of manga with the emotional impact of animation.
No video player. No scrubbing. Just tap, watch, feel, tap.

---

## Changes Made

### Backend
1. **`living_panel_prompts.py`** — Added emotion→technique mapping, 2 diverse example panels, act count limit (max 3), and anti-laziness instruction
2. **`agents/dsl_generator.py`** — Complete rewrite. Single prompt source (no more duplicate DSL_AGENT_SYSTEM_PROMPT). Per-page and per-panel generation. Temperature mapping. Conditionalized bible injection.
3. **`agents/orchestrator.py`** — Complete rewrite. Per-page generation (group by chapter+page, one LLM call per page). Previous chapter ending context. Semaphore-limited concurrency.
4. **`generate_living_panels.py`** — Fixed fallback: accepts layout_hint, caps dialogue at 2 lines per act to prevent bubble overlap
5. **`prompts.py`** — Trimmed `format_all_summaries_for_synopsis` to skip narrative_summary (saves ~40% tokens)
6. **`celery_worker.py`** — Added task time limits (10 min hard, 9 min soft)
