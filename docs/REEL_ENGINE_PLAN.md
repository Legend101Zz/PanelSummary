# 🎬 PanelSummary — Reel Engine: Plan of Action

> **Author**: Mrigesh Thakur × Comreton  
> **Date**: 2026-04-07  
> **Status**: BRAINSTORM → READY FOR EXECUTION  
> **Goal**: Replace doom-scrolling with knowledge-scrolling

---

## The Vision

You've read a book. PanelSummary already turns it into a living manga.
Now it also generates **short-form video reels** (30–60s) — catchy,
beautifully animated, knowledge-dense micro-videos built from the book's
knowledge graph, narrative arc, and key insights.

**Dual-swipe UX:**
- ↕ Vertical swipe = reel from a **different book**
- ↔ Horizontal swipe = next reel from the **same book**
- This is the TikTok/Reels/Shorts interaction model, but for learning

**Memory system:** Each time you generate a reel, the engine remembers
what content was used. Next request → fresh content from a different
part of the book. No repeats until the book is exhausted.

---

## Research: Remotion vs Revideo

### Remotion (https://github.com/remotion-dev/remotion)
| Aspect | Details |
|--------|---------|
| Paradigm | React components → video frames |
| Maturity | 4+ years, 21k+ stars |
| Rendering | Server (CLI/Lambda) or browser |
| Player | `@remotion/player` — inline preview |
| Output | MP4, WebM, GIF |
| Stack fit | **Perfect** — we're already React/Next |
| Pricing | Free OSS, paid cloud rendering |
| Audio | Built-in audio support |

### Revideo (https://github.com/redotvideo/revideo)
| Aspect | Details |
|--------|---------|
| Paradigm | Generator functions, Motion Canvas |
| Maturity | ~1 year, 1.5k stars |
| Rendering | Node.js server-side |
| Player | Custom player |
| Output | MP4, WebM |
| Stack fit | Different paradigm, separate learn |
| Pricing | Free OSS |
| Audio | Yes |

### ✅ Decision: **Remotion**

Why:
1. **React-native** — we reuse all our existing design system, fonts,
   colors, manga panels, speed lines, halftone textures
2. **`@remotion/player`** — zero-latency preview in the browser, no
   pre-rendering needed for the player. Render to MP4 only for download/share
3. **Composition model** — each reel is a React `<Composition>`, we can
   have multiple visual templates (typography-heavy, data-viz, quote-splash,
   entity-relationship animated, etc.)
4. **Server rendering** — when user wants to download/share, we render
   server-side via Remotion CLI or Lambda
5. **Ecosystem** — `@remotion/transitions`, `@remotion/noise`,
   `@remotion/paths`, `@remotion/shapes` — free visual building blocks

---

## Architecture

```
                      ┌──────────────────────────────────────┐
                      │         EXISTING DATA                │
                      │  knowledge_doc (core_thesis,         │
                      │    entities, clusters, quotes,       │
                      │    emotional_arc, data_points)       │
                      │  knowledge_graph (entities, edges,   │
                      │    conflicts, dramatic_weight)       │
                      │  narrative_arc (3-act beats)         │
                      │  canonical_chapters                  │
                      │  manga_bible (characters, motifs)    │
                      └──────────────┬───────────────────────┘
                                     │
                          ┌──────────▼──────────┐
                          │  REEL CONTENT PICKER │ (LLM)
                          │  "What's catchy?"    │
                          │  - Checks memory     │
                          │  - Avoids repeats    │
                          │  - Picks from:       │
                          │    • quotable_moments │
                          │    • conflict_pairs   │
                          │    • data_points      │
                          │    • key arguments    │
                          │    • emotional beats  │
                          │  Outputs: ReelScript  │
                          └──────────┬───────────┘
                                     │
                          ┌──────────▼──────────┐
                          │  REEL SCRIPT         │
                          │  (structured JSON)   │
                          │  - scenes[]          │
                          │    - type (quote/     │
                          │      data/entity/    │
                          │      argument/hook)  │
                          │    - content         │
                          │    - duration_ms     │
                          │    - visual_style    │
                          │    - animation       │
                          │  - transitions[]     │
                          │  - audio_mood        │
                          │  - color_palette     │
                          │  - total_duration_s  │
                          └──────────┬───────────┘
                                     │
                   ┌─────────────────┼─────────────────┐
                   ▼                 ▼                  ▼
          ┌────────────┐   ┌──────────────┐   ┌──────────────┐
          │  REMOTION   │   │  REMOTION    │   │  REMOTION    │
          │  Template:  │   │  Template:   │   │  Template:   │
          │  KINETIC    │   │  DATA VIZ    │   │  STORY ARC   │
          │  TYPOGRAPHY │   │  ANIMATED    │   │  CINEMATIC   │
          └──────┬──────┘   └──────┬───────┘   └──────┬───────┘
                 │                 │                   │
                 └────────────────┬┘───────────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │       DELIVERY              │
                    │                             │
                    │  ① @remotion/player          │
                    │     → in-browser preview     │
                    │     → instant, no render     │
                    │                             │
                    │  ② Remotion CLI render       │
                    │     → MP4 for download       │
                    │     → share to social        │
                    └─────────────────────────────┘
```

---

## Data Model: New Entities

### ReelScript (Backend — stored in MongoDB)

```python
class ReelScene(BaseModel):
    """A single scene within a reel (2-10s)"""
    scene_index: int
    scene_type: str          # "hook" | "quote" | "data" | "entity_reveal"
                             # | "argument" | "conflict" | "takeaway" | "cta"
    headline: str            # Big text on screen (max 8 words)
    body: str                # Supporting text (max 25 words)
    entity_names: list[str]  # Entities to visualize in this scene
    data_value: str | None   # For data scenes: "73%" or "$4.2B"
    quote_text: str | None   # For quote scenes
    quote_attribution: str | None
    duration_ms: int         # 2000-8000ms
    animation: str           # "typewriter" | "slam" | "fade_up" | "count_up"
                             # | "orbit" | "split_reveal" | "glitch"
    visual_emphasis: str     # "high" | "medium" | "low"

class ReelScript(BaseModel):
    """Complete script for one video reel"""
    reel_id: str             # UUID
    book_id: str
    summary_id: str
    
    # Content identity
    title: str               # Internal title for management
    hook_line: str            # The scroll-stopping opener
    source_content_ids: list[str]  # Which knowledge bits were used (for memory)
    
    # Visual design
    color_palette: dict       # {bg, text, accent, accent2}
    visual_template: str      # "kinetic_type" | "data_story" | "quote_splash"
                              # | "entity_web" | "argument_flow" | "manga_panels"
    font_pairing: dict        # {display, body, accent}
    
    # Scenes
    scenes: list[ReelScene]
    total_duration_ms: int    # Sum of scene durations + transitions
    
    # Audio
    audio_mood: str           # "epic" | "contemplative" | "urgent" | "playful"
    
    # Metadata
    chapter_refs: list[int]   # Which chapters contributed
    generated_at: datetime
    render_status: str        # "script" | "preview" | "rendered"
    video_url: str | None     # GridFS or S3 URL once rendered

class BookReelMemory(BaseModel):
    """Tracks what content has been used in reels for a book"""
    book_id: str
    summary_id: str
    used_quote_indices: list[int]        # Indices into knowledge_doc.quotable_moments
    used_data_point_indices: list[int]
    used_cluster_themes: list[str]
    used_entity_names: list[str]         # Entities already featured
    used_beat_ids: list[str]             # Narrative beats already used
    used_argument_indices: list[int]
    total_reels_generated: int
    last_generated_at: datetime
```

### ReelScript MongoDB Document

```python
class ReelScriptDoc(Document):
    """Individual reel script stored in MongoDB"""
    reel_id: str
    book_id: Indexed(str)
    summary_id: Indexed(str)
    script: dict              # Full ReelScript as dict
    render_status: str        # "script" | "rendered"
    video_gridfs_id: str | None
    created_at: datetime
    
    class Settings:
        name = "reel_scripts"
        indexes = [
            [("book_id", 1), ("created_at", -1)],
        ]

class BookReelMemoryDoc(Document):
    """Memory of what's been used per book"""
    book_id: Indexed(str, unique=True)
    summary_id: str
    used_content: dict        # BookReelMemory as dict
    updated_at: datetime
    
    class Settings:
        name = "reel_memory"
```

---

## Remotion Visual Templates

We'll build **6 distinct Remotion compositions** (visual templates).
Each creates a completely different video aesthetic. The LLM picks the
best template for the content, but user can override.

### 1. `KineticType` — Kinetic Typography
Big words slamming onto screen. Think Apple keynote energy.
- Full-bleed color backgrounds
- Words animate: slam, typewriter, split, glitch
- Manga speed lines on dramatic reveals
- Best for: arguments, key points, takeaways

### 2. `DataStory` — Animated Data Visualization
Numbers counting up, charts drawing themselves, stats flying in.
- Dark bg, neon accent numbers
- Count-up animations for statistics
- Bar/line charts that draw on-screen
- Best for: data_points, metrics, comparisons

### 3. `QuoteSplash` — Quote-Driven Narrative
Beautiful typographic quotes with atmospheric backgrounds.
- Large serif quote text, centered
- Attribution fades in below
- Subtle parallax background motion
- Best for: quotable_moments, memorable lines

### 4. `EntityWeb` — Knowledge Graph Animation
Entities and relationships animating, orbiting, connecting.
- Nodes (entities) appear and orbit
- Edges (relationships) draw between them
- Labels fade in with significance text
- Best for: knowledge_graph visualization, relationships

### 5. `StoryArc` — Cinematic Narrative Flow
3-act mini-story with chapter-like transitions.
- "Act I / Act II / Act III" title cards
- Each beat as a scene with mood lighting
- Emotional gradient background shifts
- Best for: narrative_arc beats, emotional journey

### 6. `MangaPanels` — Animated Manga Page
Brings our existing manga panel aesthetic to video.
- Panels appear with crack-in animation
- Speech bubbles type out
- Speed lines, halftone textures
- Best for: dialogue-heavy content, character insights

---

## Reel Content Picker: How It Works

The **Content Picker** is the brain that decides what to put in each reel.
It gets the full knowledge graph + memory of what's been used.

### Content Sources (priority order):

1. **Quotable Moments** (highest impact, most shareable)
   - Each becomes a `QuoteSplash` or `KineticType` scene
   
2. **Conflict Pairs** from knowledge graph
   - "X vs Y" — always dramatic, always catchy
   - Becomes `EntityWeb` or `KineticType` scene

3. **Data Points** (specific numbers are scroll-stoppers)
   - "73% of companies that..." — `DataStory` scene
   
4. **Knowledge Cluster Insights** (non-obvious connections)
   - The "insights" field in clusters — often the best content
   
5. **Emotional Arc Beats** (turning points, climax)
   - Dramatic moments → `StoryArc` or `MangaPanels`

6. **Key Arguments** from argument_structure
   - Structured logic flow → `KineticType`

### Content Selection Algorithm:

```python
def pick_reel_content(knowledge_doc, graph, arc, memory):
    """Pick content for the next reel, avoiding repeats."""
    
    available = []
    
    # 1. Unused quotes
    for i, quote in enumerate(knowledge_doc["quotable_moments"]):
        if i not in memory.used_quote_indices:
            available.append({
                "type": "quote",
                "index": i,
                "content": quote,
                "catchiness": score_catchiness(quote),
                "template": "quote_splash",
            })
    
    # 2. Unused conflict pairs
    for pair in graph.conflict_pairs:
        pair_key = f"{pair['from']}:{pair['to']}"
        if pair_key not in memory.used_entity_names:
            available.append({
                "type": "conflict",
                "content": pair,
                "catchiness": 0.9,  # Conflicts are always catchy
                "template": "entity_web",
            })
    
    # 3. Unused data points
    for i, dp in enumerate(knowledge_doc["data_points"]):
        if i not in memory.used_data_point_indices:
            available.append({
                "type": "data",
                "index": i,
                "content": dp,
                "catchiness": score_data_catchiness(dp),
                "template": "data_story",
            })
    
    # ... similar for clusters, beats, arguments
    
    # Sort by catchiness, take top content for one reel
    available.sort(key=lambda x: x["catchiness"], reverse=True)
    
    # Pick 4-6 items for a 30-60s reel
    selected = available[:6]
    
    # Send to LLM to craft into a coherent reel script
    return selected
```

### LLM's Role:

The Content Picker selects WHAT content to use. The LLM then:
1. Arranges it into a compelling narrative order
2. Writes the hook line (scroll-stopper)
3. Writes tight headlines and body text for each scene
4. Chooses animations that match the energy
5. Sets the color palette and mood
6. Decides duration per scene

---

## Frontend: Reel Player Design

### Player Architecture

```
frontend/
├── app/
│   └── reels/
│       └── page.tsx                    # Entry point, fetches reels
│
├── components/
│   └── ReelPlayer/
│       ├── ReelPlayer.tsx              # Main player container
│       │   - Vertical scroll-snap for between-books
│       │   - Horizontal drag for within-book
│       │   - IntersectionObserver for active tracking
│       │
│       ├── ReelVideoCard.tsx           # Single reel card wrapper
│       │   - @remotion/player instance
│       │   - Play/pause on visibility
│       │   - Progress bar
│       │   - Action buttons (save, share, download)
│       │
│       ├── ReelOverlay.tsx             # Top/bottom overlay UI
│       │   - Book info strip (top)
│       │   - Action buttons (right side, TikTok-style)
│       │   - Progress dots for horizontal position
│       │   - Caption/description (bottom)
│       │
│       └── ReelGenerateButton.tsx      # "Generate New Reel" CTA
│           - Shows when no more reels for a book
│           - Triggers backend generation
│
├── remotion/                           # Remotion compositions
│   ├── Root.tsx                        # Remotion entry point
│   ├── compositions/
│   │   ├── KineticType.tsx             # Template 1
│   │   ├── DataStory.tsx               # Template 2
│   │   ├── QuoteSplash.tsx             # Template 3
│   │   ├── EntityWeb.tsx               # Template 4
│   │   ├── StoryArc.tsx                # Template 5
│   │   └── MangaPanels.tsx             # Template 6
│   │
│   ├── elements/                       # Reusable animated elements
│   │   ├── SlamText.tsx                # Text that slams in
│   │   ├── TypewriterText.tsx          # Character-by-character
│   │   ├── CountUpNumber.tsx           # Number counting up
│   │   ├── GlitchReveal.tsx            # Glitch effect text reveal
│   │   ├── SpeedLinesBackground.tsx    # Manga speed lines
│   │   ├── HalftoneOverlay.tsx         # Halftone dot texture
│   │   ├── NodeGraph.tsx               # Animated entity nodes
│   │   ├── DrawingChart.tsx            # Self-drawing chart
│   │   └── PanelCrack.tsx              # Manga panel crack-in
│   │
│   └── utils/
│       ├── timing.ts                   # Scene timing helpers
│       ├── easing.ts                   # Custom easing curves
│       └── colors.ts                   # Palette from ReelScript
```

### Player UX Details

**Vertical Navigation (between books):**
- CSS `scroll-snap-type: y mandatory` (same as current)
- Each "snap point" is a book's reel
- Smooth 60fps native scrolling
- Auto-play on snap (IntersectionObserver)
- Auto-pause when off-screen

**Horizontal Navigation (within book):**
- `motion.div` with `drag="x"` + `dragConstraints`
- Swipe left = next reel from same book
- Swipe right = previous reel
- Dot indicators show position
- "Generate More" card at end of book's reels

**Player Controls:**
- Tap to pause/resume
- Double-tap right = skip forward 5s
- Double-tap left = replay
- Long press = 2x speed (knowledge speed-run)
- Progress bar at bottom (thin, accent-colored)

**Action Buttons (right rail, TikTok-style):**
- ❤️ Save to collection
- 💬 View in book context (links to manga reader at relevant chapter)
- ⬇️ Download MP4 (triggers server render)
- ↗️ Share (native share API)
- 📖 Book info popup

---

## Backend: API Endpoints

### New Endpoints

```
POST /api/books/{book_id}/reels/generate
  - Body: { api_key, provider, model, count?: 1 }
  - Picks content, calls LLM, creates ReelScript(s)
  - Returns: { reel_scripts: [...], task_id }
  
GET /api/books/{book_id}/reels
  - Returns all reel scripts for a book
  - Sorted by created_at desc
  
GET /api/reels/feed
  - Returns mixed reels from all books
  - For the vertical feed (one per book, interleaved)
  - Pagination: offset + limit

POST /api/reels/{reel_id}/render
  - Triggers server-side MP4 render
  - Returns: { task_id }
  - On completion: stores video in GridFS

GET /api/reels/{reel_id}/video
  - Serves rendered MP4 from GridFS
  
GET /api/books/{book_id}/reel-memory
  - Returns what content has been used
  - For debug/transparency
```

### Backend File Structure

```
backend/app/
├── reel_engine/
│   ├── __init__.py
│   ├── content_picker.py       # Selects catchy content, checks memory
│   ├── script_generator.py     # LLM → ReelScript conversion
│   ├── memory.py               # BookReelMemory CRUD
│   ├── renderer.py             # Remotion CLI render trigger
│   └── prompts.py              # Reel-specific LLM prompts
│
├── models.py                   # + ReelScriptDoc, BookReelMemoryDoc
└── main.py                     # + new reel endpoints
```

---

## Execution Plan: Phases

### Phase 1: Foundation (Days 1-2)
**Goal:** Data models + content picker + LLM script generation

- [ ] Add `ReelScriptDoc` and `BookReelMemoryDoc` to `models.py`
- [ ] Create `backend/app/reel_engine/` package
- [ ] Build `content_picker.py` — selects content from knowledge_doc/graph
- [ ] Build `memory.py` — tracks used content per book
- [ ] Build `script_generator.py` — LLM prompt → ReelScript
- [ ] Build `prompts.py` — system prompt for reel script creation
- [ ] Add API endpoints to `main.py`
- [ ] Tests for content picker + memory

### Phase 2: Remotion Setup (Days 2-3)
**Goal:** Remotion project + first 2 visual templates

- [ ] Install Remotion in the project (separate `remotion/` directory or inside frontend)
- [ ] Create `Root.tsx` with composition registration
- [ ] Build reusable elements: `SlamText`, `TypewriterText`, `CountUpNumber`
- [ ] Build `SpeedLinesBackground` + `HalftoneOverlay` (port from CSS)
- [ ] Build Template 1: `KineticType` composition
- [ ] Build Template 2: `QuoteSplash` composition
- [ ] Test with sample ReelScript data

### Phase 3: Player (Days 3-4)
**Goal:** Production-grade dual-swipe player

- [ ] Build `ReelPlayer.tsx` — vertical scroll-snap container
- [ ] Build `ReelVideoCard.tsx` — wraps `@remotion/player`
- [ ] Build `ReelOverlay.tsx` — book info, actions, progress
- [ ] Wire horizontal swipe for same-book navigation
- [ ] IntersectionObserver for auto-play/pause
- [ ] Connect to backend API for reel data
- [ ] "Generate New Reel" button + flow

### Phase 4: More Templates (Days 4-5)
**Goal:** Remaining visual templates + polish

- [ ] Build `DataStory` composition (count-up numbers, charts)
- [ ] Build `EntityWeb` composition (animated knowledge graph)
- [ ] Build `StoryArc` composition (3-act mini-narrative)
- [ ] Build `MangaPanels` composition (animated manga page)
- [ ] Template selection logic (LLM picks + user override)

### Phase 5: Server Rendering + Polish (Days 5-6)
**Goal:** Download/share + final polish

- [ ] Set up Remotion CLI rendering in backend
- [ ] MP4 render endpoint + GridFS storage
- [ ] Download button in player
- [ ] Share functionality (native share API)
- [ ] Performance optimization (lazy-load compositions)
- [ ] Accessibility review (captions, reduced motion)
- [ ] Integration with book detail page ("Generate Reels" button)
- [ ] Update ARCHITECTURE.md

---

## Design Language: NOT AI Slop

### Typography Choices (per template):

| Template | Display | Body | Accent |
|----------|---------|------|--------|
| KineticType | **Dela Gothic One** | Outfit | DotGothic16 |
| QuoteSplash | **Playfair Display** | Lora | — |
| DataStory | **Instrument Sans** | Outfit | JetBrains Mono |
| EntityWeb | **Space Mono** | Outfit | — |
| StoryArc | **Cormorant Garamond** | Libre Baskerville | — |
| MangaPanels | **Boogaloo** | Outfit | DotGothic16 |

### Color Palettes (sampled, not the same every time):

The LLM picks from these + can invent:
- **Manga Ink**: `#0F0E17` bg, `#F5A623` accent, `#E8191A` secondary
- **Deep Ocean**: `#0A192F` bg, `#64FFDA` accent, `#CCD6F6` text
- **Desert Dusk**: `#1A0A00` bg, `#FF6B35` accent, `#FFE0B2` text
- **Neon Void**: `#0D0221` bg, `#FF2D95` accent, `#00F0FF` secondary
- **Paper & Ink**: `#F2E8D5` bg, `#1A1825` text, `#E8191A` accent
- **Midnight Lab**: `#050510` bg, `#7B68EE` accent, `#98FB98` secondary

### Animation Principles:
- **Purposeful motion** — every animation serves the content
- **30fps for cinematic feel** (not 60 — this isn't a game)
- **Stagger reveals** — don't show everything at once
- **Breathing room** — 300-500ms between scene transitions
- **Exit before enter** — old content leaves before new arrives

---

## Integration Points

### Book Detail Page (`books/[id]/page.tsx`)

After manga is generated, show a new section:

```
┌─────────────────────────────────────────┐
│  🎬 VIDEO REELS                         │
│                                         │
│  [Generate First Reel]                  │
│  ─── or ───                             │
│  3 reels generated                      │
│  ┌─────┐ ┌─────┐ ┌─────┐               │
│  │ ▶   │ │ ▶   │ │ ▶   │  [+ More]    │
│  │Reel1│ │Reel2│ │Reel3│               │
│  └─────┘ └─────┘ └─────┘               │
└─────────────────────────────────────────┘
```

### Knowledge Graph → Reel Mapping

The existing `knowledge_graph.py` already has:
- `central_entities` → protagonist entities for EntityWeb
- `conflict_pairs` → dramatic conflict reels
- `mentor_pairs` → wisdom/teaching reels
- `dramatic_weight` → which entities deserve spotlight

The existing `narrative_arc.py` already has:
- 3-act beats → StoryArc template
- `suggested_panel_type` → maps to visual template
- `dramatic_weight` → content priority

This means our Content Picker has RICH data to work with — we're not
starting from scratch, we're building on the deep understanding
pipeline that already exists.

---

## Migration Path: Old Reels → New Reels

The current `ReelLesson` model is text-only (title, hook, key_points).
We keep backward compat:

1. Old `/reels` page still works with `ReelsFeed.tsx` (text cards)
2. New `/reels/video` page uses `ReelPlayer.tsx` (video reels)
3. Book detail page shows both options
4. Eventually phase out text reels in favor of video reels

---

## Open Questions

1. **Audio**: Do we want background music? Remotion supports it.
   Options: royalty-free ambient tracks, or generate via AI music.
   Recommendation: Start without, add later as enhancement.

2. **Voiceover**: Text-to-speech narration?
   Could use browser TTS or a service like ElevenLabs.
   Recommendation: V2 feature — start with text-only, visual-heavy.

3. **Render farm**: For server-side rendering at scale.
   Remotion Lambda is the easy path but costs $$.
   Alternative: Docker container with Remotion CLI + headless Chrome.
   Recommendation: Start with CLI rendering, evaluate Lambda later.

4. **Storage**: Rendered MP4s can be 2-10MB each.
   GridFS works for small scale, S3 for production.
   Recommendation: GridFS for now (same as existing image storage).

---

## Why This Will Work

1. **We already have the hard part** — deep document understanding,
   knowledge graphs, narrative arcs. The reel engine is just a new
   OUTPUT FORMAT from the same understanding.

2. **Remotion is battle-tested** — used by Shopify, GitHub, and others
   for programmatic video. Not experimental.

3. **The content is inherently viral** — book insights are the kind of
   content people share. We're just packaging it beautifully.

4. **Dual-swipe is proven** — TikTok, Reels, Shorts all prove this
   interaction model works for content consumption.

5. **Memory system prevents fatigue** — fresh content every time means
   users come back. This is the "one more episode" of learning.

---

## Let's Build This. 🐶⚡
