# Living Manga Panel System — Design Document
## v2.0 — The Agentic Architecture

---

## 1. DSL DESIGN — Living Panel DSL v2.0

### Philosophy
The DSL is designed around the concept of **ACTS** — temporal scenes within a single panel.
A panel is NOT a static image. It's a **programmable canvas** that plays through acts,
each with its own layout, layers, animations, and transitions.

### Core Structure
```
LivingPanelDSL
  ├─ version: "2.0"
  ├─ canvas: { width, height, background, mood }
  ├─ acts[]
  │   ├─ id, duration_ms
  │   ├─ transition_in: { type, duration_ms }
  │   ├─ layout: { type, cuts[], gap }
  │   ├─ layers[]
  │   │   ├─ type: background | text | sprite | speech_bubble | effect | data_block | shape
  │   │   ├─ id, x, y, opacity
  │   │   └─ props: { ...type-specific }
  │   ├─ cells[] (sub-panels)
  │   │   ├─ id, layers[], timeline[]
  │   │   └─ border: { color, width, style }
  │   ├─ timeline[]
  │   │   └─ { at, target, animate: { prop: [from, to] }, duration, easing }
  │   └─ events[]
  │       └─ { trigger, action, target }
  └─ meta: { panel_id, chapter_index, narrative_beat, content_type }
```

### Layer Types
| Type | Purpose | Key Props |
|------|---------|----------|
| `background` | Canvas bg | gradient[], pattern, patternOpacity |
| `text` | Story narration | content, fontSize, typewriter, typewriterSpeed |
| `sprite` | Character | name, expression, size, silhouette, facing |
| `speech_bubble` | Dialogue | text, character, style (speech/thought/shout), tailDirection |
| `effect` | Visual FX | effect (speed_lines, screentone, vignette, sfx, particles, ink_splash) |
| `data_block` | Info display | items [{label, value}], accentColor, animateIn |
| `shape` | Geometry | shape (circle/rect/line), fill, stroke |

### Layout Types
| Layout | Description |
|--------|------------|
| `full` | Single panel, full canvas |
| `cuts` | Manga-style diagonal/straight cuts |
| `split-h` | Left/right |
| `split-v` | Top/bottom |
| `grid-2x2` | 4 equal panels |
| `diagonal` | Angled split |
| `overlap` | Layered panels |

---

## 2. EXAMPLE DSL JSON

See `frontend/lib/sample-living-book.ts` for a full multi-panel example.
See Section 6 below for a sample panel.

---

## 3. RENDERING ENGINE ARCHITECTURE

```
┌─────────────────────────────────────────────────────────┐
│                  LivingPanelEngine                      │
│                  (React Component)                       │
├──────────────────┬──────────────────┬──────────────────┤
│   Act Manager      │  Layout Engine     │  Layer Renderers  │
│   - Act sequencing  │  - Cut geometry    │  - BackgroundLayer│
│   - Transition mgr  │  - Grid splits     │  - TextLayer      │
│   - User tap/click  │  - Overlap stacks  │  - SpriteLayer    │
│                     │  - Cell rendering  │  - BubbleLayer    │
│                     │                    │  - EffectLayer    │
│                     │                    │  - DataBlockLayer │
├──────────────────┴──────────────────┴──────────────────┤
│                  Animation System                        │
│  - Timeline scheduler (step-based)                       │
│  - Keyframe interpolation                                │
│  - Typewriter text effect                                │
│  - CSS transitions + Framer Motion                       │
└─────────────────────────────────────────────────────────┘
```

### Data Flow
```
DSL JSON ─▶ Parse & Validate ─▶ Act Manager ─▶ Current Act
                                                    │
                           ┌──────────────────────┘
                           ▼
              Layout Engine ─▶ Cell Regions ─▶ Layer Renderers
                                                    │
                           ┌──────────────────────┘
                           ▼
              Animation System ─▶ DOM/Canvas Updates
```

### Key Modules
1. **LivingPanelEngine** — Root React component, manages acts + user interaction
2. **ActRenderer** — Renders one act (layout + layers + animations)
3. **CutLayoutEngine** — Computes cell geometry for manga-style cuts
4. **Layer renderers** — One component per layer type
5. **TimelineScheduler** — Steps through animation keyframes
6. **TypewriterEffect** — Character-by-character text reveal

### Tech Stack
- **React** (component rendering)
- **Framer Motion** (transitions between acts)
- **CSS animations** (layer-level keyframes)
- **DOM-based** (no Canvas/WebGL needed — manga is fundamentally about layout + typography)

---

## 4. LLM GENERATION STRATEGY

### Architecture: Agentic Pipeline

```
┌───────────────────────────────────────────────────┐
│              ORCHESTRATOR                         │
│  Coordinates all agents + manages state            │
├────────────────┬───────────────┬────────────────┤
│  1. PLANNER     │ 2. DSL AGENTS  │ 3. VALIDATOR    │
│  Single LLM    │ Parallel LLMs  │ Programmatic    │
│  Plans manga   │ Generate DSLs  │ Validates DSLs  │
│  structure     │ per-panel      │ Fixes issues    │
└────────────────┴───────────────┴────────────────┘
```

### Agent 1: Planner
- **Input**: Book synopsis + chapter summaries + manga bible
- **Output**: MangaPlan (panel assignments with creative direction)
- **Single call**: One LLM invocation plans the entire book

### Agent 2: DSL Generator (x N, parallel)
- **Input**: PanelAssignment + manga bible + chapter context
- **Output**: Living Panel DSL v2.0 JSON
- **Concurrency**: Up to 4 simultaneous panels (configurable)
- **Fallback**: Auto-generated DSL if LLM fails

### Agent 3: Validator (programmatic, no LLM)
- **Input**: DSL JSON
- **Output**: Valid DSL + list of issues fixed
- **Checks**: Required fields, valid layer types, timeline refs

### Prompt Architecture
Each DSL agent gets:
1. **System prompt**: DSL spec + creative mandate + rules
2. **User message**: Panel assignment + world context + creative direction
3. **JSON mode**: Forces structured output

### Guardrails
- JSON schema validation post-generation
- `fix_common_dsl_issues()` auto-repairs missing fields
- Fallback to programmatic DSL if validation fails
- Max retry: 2 attempts before fallback
- Credit tracking prevents runaway costs

---

## 5. ORCHESTRATION SYSTEM

### Data Flow
```
Book PDF
    │
    ▼
[Parse PDF] ─▶ Raw Chapters
    │
    ▼
[Stage 1: Chapter Summaries] ─▶ canonical_chapters[]
    │
    ▼
[Stage 2: Book Synopsis] ─▶ book_synopsis
    │
    ▼
[Stage 3: Manga Bible] ─▶ manga_bible (characters, motifs)
    │
    ▼
[Stage 4: Static Manga Pages] ─▶ manga_chapters[] (PagePanels)
    │
    ▼
[Stage 5: LIVING PANELS] ─▶ living_panels[] (DSL v2.0)
  ┌─┴─────────────────────┐
  │ Orchestrator             │
  │  ├─ Credit Check          │
  │  ├─ Planner Agent (1x)   │
  │  ├─ DSL Agents (Nx)      │  ← asyncio.gather
  │  ├─ Validation           │
  │  └─ Assembly             │
  └───────────────────────┘
    │
    ▼
[Stage 6: Image Gen] ─▶ splash images (optional, $$)
    │
    ▼
[COMPLETE] ─▶ Stored in MongoDB (BookSummary.living_panels)
```

### Cost Control
- **Pre-flight**: Check OpenRouter credits before starting
- **Per-call**: Track input/output tokens and estimated cost
- **Budget limit**: Configurable max spend per run
- **95% guard**: Auto-cancel if approaching credit limit
- **Cancel endpoint**: User can abort via `/jobs/{task_id}/cancel`

### Caching Strategy
- Living panels stored in `BookSummary.living_panels`
- Subsequent loads read from MongoDB (zero LLM cost)
- Re-generation available via explicit `/generate` endpoint

---

## 6. CREATIVE IDEAS — New Medium Exploration

### Novel Panel Types

| Type | Description | DSL Implementation |
|------|-------------|-------------------|
| **Breathing Panel** | Subtle pulsing opacity/scale | Looping timeline with ease-in-out |
| **Glitch Panel** | Digital artifact aesthetic | Rapid x-offset jitter + color shift effects |
| **Data Cascade** | Scrolling matrix of concepts | data_block with stagger animation |
| **Mood Shift** | BG gradient morphs as act progresses | Multi-act with transition crossfades |
| **Echo Panel** | Same text repeated at decreasing opacity | Multiple text layers with stagger |
| **Split Second** | 4-cell cuts that slam in sequence | cuts layout with 200ms stagger |
| **Whisper Panel** | Nearly invisible text, forces lean-in | Very low contrast text, slow typewriter |
| **Impact Frame** | Full-screen SFX with shake | effect:impact_burst + effect:sfx |
| **Parallax Scene** | BG + FG layers at different speeds | Multiple bg layers, offset timeline |

### Unique Storytelling Mechanics

1. **Temporal Panels**: Same panel plays different acts on revisit
2. **Choice Panels**: onClick events branch to different acts
3. **Rhythm Panels**: Animations sync to a beat (timed reveals)
4. **Accumulation**: Data blocks that grow across chapters
5. **Character Memory**: Same sprite evolves across panels
6. **Emotional Gradient**: Mood shifts within a single panel
7. **Typography as Character**: Font size/weight carries emotion
8. **Negative Space**: Strategic use of empty cells
9. **Meta-Commentary**: Panels that break the 4th wall
10. **Data Storytelling**: Charts/graphs as narrative devices

### What Makes This a NEW MEDIUM

This isn't just animated manga. It's **programmable storytelling**:
- Every panel is a **tiny program** (the DSL)
- An AI **writes the program** based on narrative context
- The program **executes in the browser** as an interactive experience
- The reader **participates** by tapping to advance acts
- The system **scales** to any content (books, reports, data)

It's the intersection of:
- **Manga** (visual storytelling, panel layouts)
- **Animation** (temporal, kinetic)
- **Programming** (DSL-driven, composable)
- **AI** (generated, context-aware)

---

## Files Created

| File | Purpose |
|------|---------|
| `backend/app/agents/__init__.py` | Agent package |
| `backend/app/agents/planner.py` | Manga Planner Agent |
| `backend/app/agents/dsl_generator.py` | DSL Generator Agent |
| `backend/app/agents/credit_tracker.py` | Cost tracking |
| `backend/app/agents/orchestrator.py` | Main orchestrator |
| `backend/app/models.py` | Added `living_panels` field |
| `backend/app/celery_worker.py` | Integrated Stage 5 |
| `backend/app/main.py` | New endpoints |
| `frontend/lib/api.ts` | New API functions |
| `frontend/app/.../living/page.tsx` | Uses stored panels |
