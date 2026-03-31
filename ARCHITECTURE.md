# PanelSummary — Architecture & Flow

## Core Philosophy

**We are not generating images — we are generating a structured storytelling system
where visuals are just one component, not the core.**

Most manga panels are text-based (narration, dialogue, data visualization).
Only ~1 image per chapter is AI-generated (the "splash" panel for the dramatic moment).
Everything else is CSS art: mood gradients, character sprites, typography, and grid layouts.

---

## Generation Pipeline (6 Stages)

```
PDF Upload
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│  STAGE 1: Per-Chapter Canonical Summaries    [0 → 40%]   │
│  One LLM call per chapter → structured JSON:             │
│  one_liner, key_concepts, narrative_summary,             │
│  dramatic_moment, metaphor                               │
└──────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│  STAGE 2: Book Synopsis (1 LLM call)         [40 → 46%]  │
│  Reads ALL chapter summaries → extracts:                 │
│  book_thesis, narrative_arc, 3-act structure,            │
│  protagonist_arc, core_metaphor, emotional_journey       │
└──────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│  STAGE 3: Manga Bible (1 LLM call)          [46 → 55%]  │
│  Creates the visual "bible" for the entire manga:        │
│  • Named characters with visual descriptions             │
│  • World setting and color palette                       │
│  • Per-chapter mood, dramatic_beat, image_theme          │
│  • Recurring visual motifs                               │
│                                                          │
│  This ensures EVERY chapter panel references the same    │
│  characters, world, and visual vocabulary.               │
└──────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│  STAGE 4: Manga Pages (1 LLM call/chapter)   [55 → 70%] │
│  The LLM acts as a mangaka laying out PAGES:             │
│                                                          │
│  Each page = CSS grid layout + panel cells               │
│  Layouts: full, 2-row, 3-row, 2-col, L-shape,          │
│           T-shape, grid-4                                │
│                                                          │
│  Panel types:                                            │
│  • narration  — text over mood gradient (no image)       │
│  • dialogue   — character sprite + speech bubbles        │
│  • splash     — THE one AI image per chapter             │
│  • data       — bold typography for stats/concepts       │
│  • transition — scene break / chapter divider            │
│                                                          │
│  Result: 3-6 pages per chapter, ~1 splash image each    │
└──────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│  STAGE 5: Reel Scripts (1 LLM call/chapter)  [70 → 98%]  │
│  TikTok-style lesson cards derived from canonical        │
│  summaries. 2-4 reels per chapter.                       │
└──────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│  STAGE 6: Splash Image Generation (optional)  [98→100%]  │
│  Only generates images for "splash" panels.              │
│  Budget: max 4 images per entire book.                   │
│  Uses OpenRouter image gen (Gemini / Flux).              │
└──────────────────────────────────────────────────────────┘
```

---

## Page Layout System

The LLM outputs a JSON structure where each chapter has 3-6 **pages**.
Each page specifies a **CSS grid layout** and fills each grid cell with content.

### Available Layouts

```
┌─────────┐   ┌────┬────┐   ┌─────────┐   ┌────┬────┐
│         │   │    │    │   │   top   │   │ tl │ tr │
│  main   │   │ L  │  R │   ├─────────┤   ├────┼────┤
│  (full) │   │    │    │   │  middle │   │ bl │ br │
│         │   │    │    │   ├─────────┤   │    │    │
└─────────┘   └────┴────┘   │ bottom  │   └────┴────┘
   full          2-col       └─────────┘      grid-4
                                3-row

┌──────────┬─────┐   ┌──────────────────┐
│          │ s-t │   │       top        │
│   main   ├─────┤   ├────────┬─────────┤
│          │ s-b │   │  b-l   │   b-r   │
└──────────┴─────┘   └────────┴─────────┘
     L-shape               T-shape
```

### Panel Content Types

| Type | What renders | Image? | Cost |
|------|-------------|--------|------|
| `narration` | Narrator text box over mood gradient | No | Free |
| `dialogue` | Character sprite + speech bubbles | No | Free |
| `splash` | AI-generated image + text overlay | Yes | ~$0.01 |
| `data` | Bold typography, stats, concept list | No | Free |
| `transition` | Decorative divider line | No | Free |

### Character Sprites

Characters are NOT AI images. They're rendered in CSS:
- Colored circle with initial letter
- Expression emoji indicator
- Name label below
- Deterministic color from character name

This gives infinite "character appearances" at zero cost.

---

## File Structure

```
backend/app/
├── main.py                 # FastAPI endpoints (includes double-gen guard)
├── models.py               # MongoDB schemas (PagePanel, MangaPage, MangaBible, etc.)
├── config.py               # Settings (MongoDB, Redis, storage paths)
├── celery_worker.py        # Background task orchestrator (6 stages)
├── llm_client.py           # OpenAI/OpenRouter API client
├── pdf_parser.py           # Docling + PyMuPDF PDF parsing
├── prompts.py              # All LLM system prompts
├── stage_book_synopsis.py  # Stage 2: whole-book narrative arc
├── stage_manga_planner.py  # Stage 3: manga bible (characters, world, plans)
├── generate_manga.py       # Stage 4: page-based manga generation
├── generate_reels.py       # Stage 5: reel scripts
└── image_generator.py      # Stage 6: budget-limited splash image gen

frontend/
├── components/
│   ├── MangaReader.tsx     # Page-based manga reader (CSS grid layouts)
│   ├── ReelsFeed.tsx       # Vertical scroll reel experience
│   └── ...
├── lib/
│   ├── types.ts            # TypeScript types (MangaPage, PagePanel, etc.)
│   ├── api.ts              # Backend API calls
│   └── store.ts            # Zustand state
└── app/
    ├── books/[id]/
    │   ├── page.tsx         # Book detail + generate panel
    │   ├── manga/page.tsx   # Manga reader route
    │   └── read/page.tsx    # PDF reader
    └── reels/page.tsx       # Reels feed
```

---

## Cost Model

For a typical 10-chapter book:

| Stage | LLM Calls | Est. Cost |
|-------|-----------|-----------|
| Canonical summaries | 10 | ~$0.001 |
| Book synopsis | 1 | ~$0.0001 |
| Manga bible | 1 | ~$0.0002 |
| Manga pages | 10 | ~$0.002 |
| Reel scripts | 10 | ~$0.001 |
| Splash images (4 max) | 4 | ~$0.04 |
| **Total** | **36** | **~$0.05** |

Compare to old system: 40-45 images at ~$0.15/image = **$6+**

---

## Safety: Double-Generation Guard

The `/books/{id}/summarize` endpoint checks for active summaries before creating new ones.
If a summary is already `pending`, `summarizing`, or `generating` for the same book,
the existing task_id is returned instead of launching a duplicate.
