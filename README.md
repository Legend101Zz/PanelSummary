# PanelSummary

**Turn any PDF into an animated manga story.**

Upload a PDF. AI reads the whole thing deeply, designs a manga story with
characters mapped to real entities, then generates living manga panels —
animated, tappable, code-rendered. No AI image spam. A real reading experience.

Two engines: **V2** (verbose DSL, full animation control) and **V4** (semantic
intent, engine decides visuals — 6x cheaper, zero formatting bugs).

---

## How It Works

```
PDF → Parse → Deep Understanding (whole doc) → Story Design → Panel Plan
                                                                  │
                                                         ┌────────┴────────┐
                                                         ▼                 ▼
                                                    V2 DSL Engine    V4 Semantic Engine
                                                         │                 │
                                                         ▼                 ▼
                                                    Living Panels    Typed Panels
                                                    (canvas/acts)    (splash/dialogue/
                                                                      narration/data)
```

### Understand First, Design Second

1. **Document Understanding** — single deep pass over ALL chapters. Extracts
   core thesis, entities, relationships, data points, emotional arc, quotes.
2. **Knowledge Graph** — entity graph with edges (rule-based, no LLM).
3. **Narrative Arc** — 3-act structure with tension beats (rule-based, no LLM).
4. **Manga Story Design** — full story blueprint: title, logline, characters
   mapped to real entities, scenes with dialogue beats, visual motifs.
5. **Panel Planning** — maps scenes to typed panels with budgets.
6. **DSL Generation** — parallel per-page, V2 or V4 depending on user choice.

No page-specific summaries. The story emerges from holistic understanding.

---

## Run It

```bash
# Prerequisites: Python 3.12+, Node 24+, Redis, MongoDB Atlas
cp backend/.env.example backend/.env   # Fill MONGODB_URL + OPENROUTER_API_KEY

# Start everything
./start.sh    # → http://localhost:3000

# Stop
./stop.sh
```

---

## User Flow

1. **Upload** a PDF
2. **Generate** → pick model, style, engine (V2 or V4)
3. **Read** manga → flip pages, tap through animated panels
4. **Generate Reels** (optional) → TikTok-style lesson cards

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI + Python 3.12, Beanie ODM |
| Tasks | Celery + Redis |
| Database | MongoDB Atlas |
| PDF | Docling (IBM) + PyMuPDF fallback |
| LLM | OpenRouter (user's own key) |
| Images | Gemini Flash (max 5/book) |
| Frontend | Next.js 15 + TypeScript + Motion.dev |
| DSL | V2 (act-based) + V4 (semantic intent) |

---

## Docs

| Document | What |
|----------|------|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Full system architecture + pipeline |
| [`docs/DB_ARCHITECTURE.md`](docs/DB_ARCHITECTURE.md) | MongoDB schema |

---

## Tests

```bash
cd backend && python -m pytest tests/ -q   # 144 tests
```
