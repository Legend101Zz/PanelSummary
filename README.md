# PanelSummary (BookReel)

**Turn any PDF into a manga story and TikTok-style lesson reels.**

---

## Why we built this

Reading a long book is hard. Dense text, no visual reward, no "aha moment" that sticks.

We wanted something different — what if the key ideas from any book came alive as manga pages you could read in minutes? What if the insights felt like a story rather than a summary?

PanelSummary takes a PDF and runs it through a multi-agent pipeline that:

1. Understands the book as a whole narrative arc
2. Designs consistent manga characters and a visual world for it
3. Lays out manga pages like a real mangaka would — deciding which ideas get dialogue, which get a dramatic splash panel, which deserve a narrator box
4. Optionally generates lesson reels, Living Panel animations, and AI images

The result is a manga adaptation of your book — not bullet points, but a reading experience.

---

## What it does

| Feature            | Description                                                                        |
| ------------------ | ---------------------------------------------------------------------------------- |
| **PDF Upload**     | Drop any PDF — parsed and chunked into chapters                                    |
| **Manga Reader**   | Page-based CSS-grid layout, 7 layout types, character sprites, mood backgrounds    |
| **Living Panels**  | Animated panels — typewriter text, speed lines, act-by-act reveals, tap to advance |
| **Reels Feed**     | TikTok-style vertical lesson cards, one key insight each                           |
| **5 Styles**       | Manga, Noir, Minimalist, Comedy, Academic                                          |
| **Cost-conscious** | Max 4 AI images per book — everything else is CSS + typography                     |

---

## Run it

**Prerequisites:** Python 3.12+, Node 24, Redis, MongoDB Atlas (or local)

```bash
# Set up backend env
cp backend/.env.example backend/.env
# Fill in MONGODB_URL and OPENROUTER_API_KEY

# Start everything
./start.sh

# Open
open http://localhost:3000
```

Logs:

```bash
tail -f /tmp/backend.log
tail -f /tmp/celery.log
tail -f /tmp/frontend.log
```

Stop: `./stop.sh`

---

## Workflow

1. **Upload** a PDF → parsed in the background (Docling + PyMuPDF)
2. **Generate** → enter your OpenRouter API key, pick a model and style
3. **Read** the manga → flip through pages, each chapter is 3-6 manga pages
4. **Living Panels** → same content animated, tap to advance each act
5. **Generate Reels** (on-demand button) → 2-4 lesson cards per chapter
6. **Browse Reels** → vertical TikTok-style feed

---

## Tech stack

| Layer           | Tech                                            |
| --------------- | ----------------------------------------------- |
| Backend         | FastAPI + Python 3.12, Beanie ODM               |
| Background jobs | Celery + Redis (`--pool=solo` on macOS)         |
| Database        | MongoDB Atlas                                   |
| PDF parsing     | Docling (IBM) + PyMuPDF                         |
| LLM             | OpenRouter — user's own key, never stored       |
| Image gen       | Gemini Flash / Flux via OpenRouter (max 4/book) |
| Frontend        | Next.js 15 App Router + TypeScript              |
| Animation       | Motion.dev, custom Living Panel engine          |
| Fonts           | Dela Gothic One, Outfit, DotGothic16, Boogaloo  |

---

## Docs

- [`TECHNICAL.md`](./TECHNICAL.md) — Agent pipeline, DSL engine, Mermaid diagrams
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — Pipeline stages, layout system, cost model
- [`SHORTCOMINGS.md`](./SHORTCOMINGS.md) — Known issues and planned improvements

  cd /Users/comreton/Desktop/Book-Reel/backend
  .venv/bin/python3 app/scripts/delete_summaries.py 69c970df322df14b9aa7add1
