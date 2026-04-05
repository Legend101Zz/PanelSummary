# PanelSummary

**Turn any PDF into an animated manga story.**

Upload a PDF. Get back a manga — with characters, dialogue, speed lines,
and act-by-act animated panels you tap through like reading a real comic.

Not bullet-point summaries. Not AI-generated images slapped on slides.
A *reading experience* built from code-rendered sprites, typography,
and a DSL engine that turns narrative beats into programmable canvases.

---

## How It Works

```
PDF → Parse chapters → Compress each chapter (LLM)
                           │
                           ▼
                  ┌─────────────────────┐
                  │  Document           │ ← Extracts entities, relationships,
                  │  Understanding      │   data points, quotes, emotional arc
                  └────────┬────────────┘
                           │
                           ▼
                  ┌─────────────────────┐
                  │  Manga Story        │ ← Characters mapped to real entities,
                  │  Design             │   8-20 scenes with dialogue beats,
                  └────────┬────────────┘   visual world, must-include facts
                           │
                           ▼
                  ┌─────────────────────┐
                  │  Planner            │ ← Panel assignments: type, mood,
                  │                     │   layout, dialogue, image budget
                  └────────┬────────────┘
                           │
                           ▼
                  ┌─────────────────────┐
                  │  DSL Generator      │ ← Living Panel DSL v2.0 JSON
                  │  (per-page,         │   (parallel, semaphore-limited)
                  │   parallel)         │
                  └────────┬────────────┘
                           │
                           ▼
                  ┌─────────────────────┐
                  │  Living Panel       │ ← Browser rendering engine:
                  │  Engine (frontend)  │   sprites, effects, timelines,
                  └─────────────────────┘   cut layouts, act progression
```

### The "Understand First, Design Second" Architecture

The old pipeline built manga from lossy compressed summaries — each stage
lost information. The v2 pipeline flips this:

1. **Document Understanding** — a single deep pass over ALL chapter summaries.
   Produces a Knowledge Document: entities, relationships, argument structure,
   data points, quotable moments, emotional arc. This is the single source of
   truth for everything downstream.

2. **Manga Story Design** — takes the Knowledge Document and designs the
   complete story. Characters are mapped to real entities from the document.
   Scenes reference specific content, not generic filler. The blueprint
   includes dialogue beats, visual direction, and must-include facts.

3. **Planning** — maps scenes to panel assignments with budgets. Panel count
   is guaranteed to match the number of designed scenes (no more skeleton manga).

4. **DSL Generation** — per-page (not per-panel) generation so panels on
   the same page compose as a visual unit. Parallel with semaphore limits.

---

## Features

| Feature              | Details                                                          |
| -------------------- | ---------------------------------------------------------------- |
| **PDF Upload**       | Any PDF — parsed via Docling + PyMuPDF                           |
| **Living Panels**    | Animated DSL panels: typewriter, speed lines, tap-to-advance     |
| **5 Styles**         | Manga, Noir, Minimalist, Comedy, Academic                        |
| **Manga Reader**     | Page-based CSS grid, 7 layout types, cut-based manga layouts     |
| **Reels Feed**       | TikTok-style vertical lesson cards                               |
| **Cost-conscious**   | Max 5 AI images per book — everything else is code-rendered      |
| **Credit tracking**  | Real-time OpenRouter credit monitoring + cost estimates           |

---

## Run It

**Prerequisites:** Python 3.12+, Node 24+, Redis, MongoDB Atlas (or local)

```bash
# Clone and configure
cp backend/.env.example backend/.env
# Fill in MONGODB_URL and OPENROUTER_API_KEY

# Start everything (backend + celery + frontend)
./start.sh

# Open
open http://localhost:3000
```

**Logs:**
```bash
tail -f /tmp/backend.log
tail -f /tmp/celery.log
tail -f /tmp/frontend.log
```

**Stop:** `./stop.sh`

---

## User Flow

1. **Upload** a PDF → parsed in background
2. **Generate** → enter OpenRouter API key, pick model + style
3. **Read** the manga → flip through pages, each chapter is 3–6 pages
4. **Tap** through Living Panels → animated acts reveal one by one
5. **Generate Reels** (optional) → 2–4 lesson cards per chapter

---

## Tech Stack

| Layer           | Tech                                              |
| --------------- | ------------------------------------------------- |
| Backend         | FastAPI + Python 3.12, Beanie ODM                 |
| Background jobs | Celery + Redis (`--pool=solo` on macOS)           |
| Database        | MongoDB Atlas                                     |
| PDF parsing     | Docling (IBM) + PyMuPDF fallback                  |
| LLM             | OpenRouter — user's own key, never stored         |
| Image gen       | Gemini Flash via OpenRouter (max 5/book)          |
| Frontend        | Next.js 15 App Router + TypeScript                |
| Animation       | Motion.dev + custom Living Panel engine           |
| DSL             | Living Panel DSL v2.0 (act-based, cut layouts)    |
| Fonts           | Dela Gothic One, Outfit, DotGothic16, Boogaloo   |

---

## Docs

| Document | What it covers |
| --- | --- |
| [`docs/LIVING_MANGA_SYSTEM_DESIGN.md`](docs/LIVING_MANGA_SYSTEM_DESIGN.md) | Full system architecture, orchestrator, pipeline phases |
| [`docs/LIVING_PANELS_DESIGN.md`](docs/LIVING_PANELS_DESIGN.md) | DSL v2.0 spec, layer types, layouts, animation system |
| [`docs/SUMMARIZATION_ANALYSIS.md`](docs/SUMMARIZATION_ANALYSIS.md) | Research analysis (BooookScore, FABLES), pipeline design |
| [`docs/DB_ARCHITECTURE.md`](docs/DB_ARCHITECTURE.md) | MongoDB schema, God Document refactor |
| [`docs/SHORTCOMINGS_AUDIT.md`](docs/SHORTCOMINGS_AUDIT.md) | Known issues audit with fix status |

---

## Project Structure

```
PanelSummary/
├── backend/
│   ├── app/
│   │   ├── agents/              # Orchestrator, planner, DSL generator
│   │   ├── stage_document_understanding.py   # v2: deep analysis
│   │   ├── stage_manga_story_design.py       # v2: story blueprint
│   │   ├── stage_book_synopsis.py            # synopsis generation
│   │   ├── generate_living_panels.py         # DSL validation + fixing
│   │   ├── living_panel_prompts.py           # LLM prompts for DSL
│   │   ├── llm_client.py                     # OpenRouter client
│   │   ├── celery_worker.py                  # background task runner
│   │   ├── main.py                           # FastAPI app
│   │   └── models.py                         # Beanie ODM models
│   └── tests/                   # 86 tests
├── frontend/
│   ├── app/                     # Next.js pages
│   └── components/
│       └── LivingPanel/         # DSL rendering engine
│           ├── LivingPanelEngine.tsx
│           ├── CutLayoutEngine.tsx
│           ├── AnimationSystem.ts
│           ├── EffectRenderers.tsx
│           ├── LayerRenderers.tsx
│           └── MangaInk.tsx
├── docs/                        # Architecture docs
├── scripts/                     # Utility scripts
├── start.sh / stop.sh           # Dev server management
└── docker-compose.yml           # Redis + MongoDB
```
