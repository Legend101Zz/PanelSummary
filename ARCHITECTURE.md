# PanelSummary — Architecture

> **Author**: Mrigesh Thakur
> **Updated**: 2026-04-07
> **Stack**: Python + FastAPI + Celery + MongoDB | Next.js + Tailwind

---

## What This Is

Upload a PDF → AI reads it → generates a **living manga** (animated comic panels)
that tells the document's story visually. Two rendering engines: V2 (verbose DSL)
and V4 (semantic intent). User picks from the UI.

---

## Pipeline Overview

```
PDF Upload
    │
    ▼
┌─────────────────────────────────────────────────┐
│  Phase 1: Document Understanding (LLM)          │
│  Reads ALL chapters at once → knowledge_doc     │
│  core_thesis, key_entities, data_points,        │
│  argument_structure, emotional_arc, clusters     │
└─────────────────────┬───────────────────────────┘
                      │
    ┌─────────────────┴──────────────────┐
    ▼                                    ▼
┌──────────────────┐   ┌──────────────────────────┐
│ Phase 1b:        │   │ Phase 1c:                │
│ Knowledge Graph  │   │ Narrative Arc            │
│ (rule-based)     │   │ (rule-based)             │
│ entities + edges │   │ 3-act structure          │
│ no LLM call      │   │ tension/beats per act    │
└────────┬─────────┘   └────────────┬─────────────┘
         └──────────┬───────────────┘
                    ▼
┌─────────────────────────────────────────────────┐
│  Phase 2: Manga Story Design (LLM)              │
│  Designs the COMPLETE manga from understanding   │
│  manga_title, logline, world, characters,        │
│  scenes with emotional arcs, visual motifs       │
│  Outputs → blueprint (converted to synopsis +    │
│  bible for backward compat)                      │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  Phase 3: Panel Planner (LLM)                   │
│  Blueprint + synopsis + bible → panel list      │
│  Each panel: content_type, dialogue, character,  │
│  layout_hint, visual_mood, expression            │
│  Budget: max(n*4, min(words//35, n*8))           │
└─────────────────────┬───────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
┌──────────────────┐   ┌──────────────────────────┐
│  V2 DSL Engine   │   │  V4 Semantic Engine      │
│  (verbose JSON)  │   │  (intent JSON)           │
│  ~1000 tok/panel │   │  ~150 tok/panel          │
│  Full animation  │   │  Engine decides visuals  │
│  control         │   │  6 typed renders       │
└──────────────────┘   └──────────────────────────┘
```

**Key principle**: The agent understands the WHOLE document first, designs a
complete manga story, THEN generates individual panels. No page-specific
summaries — the story emerges from holistic understanding.

---

## Backend Structure

```
backend/app/
├── main.py                          # FastAPI routes
├── celery_worker.py                 # Async task processing
├── models.py                        # MongoDB documents (Beanie ODM)
├── config.py                        # Settings + env vars
├── llm_client.py                    # OpenRouter LLM wrapper
├── pdf_parser.py                    # PDF → chapters extraction
│
├── stage_document_understanding.py  # Phase 1: deep doc analysis
├── knowledge_graph.py               # Phase 1b: entity graph (no LLM)
├── narrative_arc.py                 # Phase 1c: 3-act structure (no LLM)
├── scene_composer.py                # Scene scoring + arc awareness
│
├── stage_manga_story_design.py      # Phase 2: full story blueprint
├── stage_manga_planner.py           # Phase 3: panel assignment list
├── stage_book_synopsis.py           # Legacy synopsis (fallback)
│
├── generate_living_panels.py        # V2 DSL validation + fixing + contrast
├── living_panel_prompts.py          # V2 DSL system/user prompt builder
├── v4_types.py                      # V4 panel types + Pydantic models
├── v4_dsl_generator.py              # V4 semantic DSL generator
│
├── image_generator.py               # AI image generation for panels
├── generate_reels.py                # Short-form video generation
├── prompts.py                       # Misc prompt templates
│
└── agents/
    ├── orchestrator.py              # Pipeline coordinator
    ├── planner.py                   # Panel planning logic
    ├── dsl_generator.py             # V2 DSL generation + content injection
    └── credit_tracker.py            # Cost tracking + budget enforcement
```

---

## Frontend Structure

```
frontend/
├── app/
│   ├── page.tsx                     # Home — upload + book list
│   ├── upload/page.tsx              # PDF upload flow
│   ├── books/[id]/page.tsx          # Book detail — generate + read
│   └── reels/page.tsx               # Short-form video feed
│
└── components/
    ├── MangaReader.tsx              # Main reader (dispatches V2/V4)
    ├── LivingPanel/                 # V2 engine renderers
    │   ├── LivingPanelCanvas.tsx    # Act/layer/timeline renderer
    │   └── illustrations/           # SVG scene library (7 scenes)
    │
    ├── V4Engine/                    # V4 engine renderers
    │   ├── V4PageRenderer.tsx       # Page layout (1-4 panels)
    │   ├── V4PanelRenderer.tsx      # Type dispatcher
    │   └── panels/
    │       ├── SplashPanel.tsx      # Full-bleed title + scene
    │       ├── DialoguePanel.tsx    # Character bubbles + sprites
    │       ├── NarrationPanel.tsx   # Caption + atmosphere
    │       ├── DataPanel.tsx        # Charts + metrics
    │       └── TransitionPanel.tsx  # Scene/chapter breaks
    │
    ├── PipelineTracker.tsx          # Live progress during generation
    ├── LogFeed.tsx                  # Real-time log streaming
    ├── ModelSelector.tsx            # LLM model picker
    ├── StyleSelector.tsx            # Manga style picker
    └── ApiKeyModal.tsx              # OpenRouter key management
```

---

## Two Rendering Engines

### V2 — Verbose DSL (original)

The LLM generates a full JSON DSL per panel: canvas, acts, layers, timeline
keyframes, transitions. The frontend interprets every field literally.

**Pros**: Full creative control, complex animations, multi-act panels.
**Cons**: ~1000 tokens/panel, formatting-sensitive, LLM invents invalid types.

Safety nets:
- `fix_common_dsl_issues()` — repairs missing IDs, layouts, timeline refs
- `ensure_content_layers()` — injects text/bubbles/data if LLM forgot them
- `enforce_text_contrast()` — WCAG AA compliance
- `LAYER_TYPE_ALIASES` — normalizes LLM-invented types (illustration→background)
- `validate_living_panel_dsl()` — structural validation

### V4 — Semantic Intent (new)

The LLM generates a tiny intent JSON (~150 tokens): panel_type, scene
description, mood, dialogue lines. The **frontend decides** all visuals.

**Pros**: 6-7x cheaper, no formatting bugs, consistent rendering.
**Cons**: Less LLM creative control, fixed visual vocabulary.

```
V4 panel types: splash | dialogue | narration | data | transition | concept
```

**UI toggle**: On the book/:id page, user picks "V2" or "V4" before generating.
The engine choice flows through: `page.tsx → API → celery → orchestrator`.

---

## Key Bug Fixes (2026-04-07)

### 1. Triple Content Loss

Three `max_tokens` ceilings were silently truncating LLM output:

| Stage | Old Limit | New Limit | Impact |
|-------|-----------|-----------|--------|
| Story Design | 17,000 | 28,000 | Blueprint was truncated |
| Planner | 13,000 | 20,000 | Panel list incomplete |
| Panel Budget | 26 panels | 40+ | 2.6→4+ panels/chapter |

### 2. Empty Panels

The LLM generated 51 background layers but only 1 text layer across 26 panels.
Now `ensure_content_layers()` injects:
- Title text for splash panels with no text
- Narration captions for panels with no readable content
- Character tags when a character is assigned but invisible

### 3. Layer Type Aliasing

LLMs consistently use `illustration` instead of `background`. Instead of
rejecting, we normalize: illustration→background, dialog→speech_bubble,
char→sprite, fx→effect, etc. (13 aliases)

---

## Data Flow

```
MongoDB Collections:
  books          → uploaded PDF metadata
  booksummaries  → generation results (panels, synopsis, bible, v4_pages)
  job_statuses   → celery task tracking
  (panels stored inline — see docs/DB_ARCHITECTURE.md for schema)

Redis: celery broker + result backend

API: FastAPI on :8000
  POST /api/books/{id}/summarize  → kicks off celery task
  GET  /api/books/{id}/summary    → returns panels + metadata
  GET  /api/books/{id}/status     → SSE progress stream

Frontend: Next.js on :3000
  Engine toggle on books/[id] page (V2 | V4)
  MangaReader dispatches to LivingPanel or V4PageRenderer
```

---

## Running Locally

```bash
# Terminal 1: Redis
redis-server

# Terminal 2: Backend
cd backend && source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 3: Celery worker
cd backend && source .venv/bin/activate
celery -A app.celery_worker worker --loglevel=info --pool=solo

# Terminal 4: Frontend
cd frontend && npm run dev
```

Needs: MongoDB Atlas connection, OpenRouter API key.

---

## Tests

```bash
cd backend && source .venv/bin/activate
python -m pytest tests/ -q          # 144 tests

# Key test files:
# tests/test_dsl_fixer.py           — DSL fixing + contrast + layer aliasing
# tests/test_knowledge_graph.py     — entity extraction + graph building
# tests/test_narrative_arc.py       — 3-act structure + beat generation
# tests/test_scene_composer.py      — scene scoring
# tests/test_v4_types.py            — V4 panel type validation
```
