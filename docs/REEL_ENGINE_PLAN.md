# 🎬 PanelSummary — Reel Engine v2: The REAL Plan

> **Author**: Mrigesh Thakur × Comreton  
> **Date**: 2026-04-07  
> **Status**: BRAINSTORM → CRITIQUED → READY  
> **Principle**: No templates. The LLM is the director.

---

## Why v1 Plan Was Wrong

The first plan proposed 6 fixed visual templates (KineticType, DataStory,
QuoteSplash, etc.). That's a creative prison. It's the equivalent of
giving a filmmaker 6 preset After Effects templates and saying "pick one."

The right approach: give the LLM a **vocabulary of visual primitives**
and let it compose ANYTHING. We already proved this works — it's exactly
what the Living Panel DSL v2.0 does for manga panels. Acts, layers,
timeline keyframes, effects. The LLM designs freely; the renderer
interprets faithfully.

**Video DSL = Living Panel DSL evolved for time.**

---

## Key Architecture Decisions

### 1. No Templates — The DSL IS the Medium

Instead of `template: "kinetic_type"`, the LLM gets a vocabulary:

| Primitive | What it does |
|-----------|-------------|
| `text` layer | Any text, any font, any size, any position |
| `counter` layer | Animated number counting up (73% → shown) |
| `speech_bubble` | Dialogue with character attribution |
| `data_block` | Staggered bullet list |
| `effect` | Speed lines, particles, halftone, ink splash |
| `shape` | Circles, rectangles, lines, dividers |
| `sprite` | Character silhouettes with expressions |
| `background` | Gradients, patterns, solid colors |
| `illustration` | SVG scene backgrounds |
| `camera` | Pan, zoom, rotate the whole scene |
| Scene transitions | Cut, fade, wipe, zoom, glitch, ink_wash |

The LLM composes these into whatever it wants. A data-heavy reel
uses counters + data_blocks. A quote reel uses large text + fade
transitions. A story reel uses sprites + speech bubbles + speed lines.
An experimental reel uses shapes + camera movement + glitch transitions.

**No two reels need to look alike.** The DSL is expressive enough for
infinite variety, constrained enough for reliable rendering.

### 2. Server-Side Rendering → MP4 → `/storage/`

No Remotion player in the browser. No in-app editor. The pipeline:

```
LLM generates Video DSL (JSON)
    ↓
Backend validates + auto-fixes (same pattern as manga)
    ↓
Backend calls reel-renderer (Node.js + Remotion CLI)
    ↓
Remotion renders headless: React → Chrome frames → ffmpeg → MP4
    ↓
MP4 saved to /storage/reels/{book_id}/{reel_id}.mp4
    ↓
Frontend plays <video> with dual-swipe player
```

Why this approach:
- **Deterministic** — Remotion renders frame-by-frame, no timing drift
- **Cacheable** — MP4 files served directly, no computation on playback
- **Shareable** — Users can download and share actual video files
- **Decoupled** — Frontend is just a video player, zero Remotion deps

### 3. Separate Renderer Project

```
PanelSummary/
├── backend/          # Python + FastAPI (generates DSL, orchestrates)
├── frontend/         # Next.js (video player, no Remotion)
├── reel-renderer/    # Node.js + Remotion (renders DSL → MP4)
└── storage/
    └── reels/        # Output MP4 files
```

The reel-renderer is a headless service. Backend POSTs a DSL JSON,
renderer outputs an MP4. Clean separation of concerns.

---

## The Video DSL Specification

### Evolution from Living Panel DSL

| Living Panel DSL | Video DSL | Why |
|-----------------|-----------|-----|
| `acts[]` (tap to advance) | `scenes[]` (auto-flow) | No user interaction |
| Canvas 800×600 | Canvas 1080×1920 | Portrait video |
| No fps | `fps: 30` | Frame rate control |
| No font declaration | `fonts[]` | Google Fonts loaded |
| No palette | `palette{}` | Global color system |
| `transition_in` per act | `transition` per scene | Same concept |
| 3-8s per act | 3-12s per scene | Longer scenes OK |
| Total ~10-30s | Total 30-60s | Full reel length |
| New: — | `counter` layer type | Animated numbers |
| New: — | `camera` per scene | Pan/zoom/rotate |

### DSL Schema

```json
{
  "version": "1.0",

  "canvas": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "background": "#0F0E17"
  },

  "fonts": [
    "Dela Gothic One",
    "Outfit",
    "DotGothic16"
  ],

  "palette": {
    "bg": "#0F0E17",
    "fg": "#F0EEE8",
    "accent": "#F5A623",
    "accent2": "#E8191A",
    "muted": "#5E5C78"
  },

  "scenes": [
    {
      "id": "hook",
      "duration_ms": 4000,
      "transition": { "type": "cut" },
      "camera": {
        "zoom": [1.0, 1.05],
        "pan": { "x": [0, 0], "y": [0, -20] }
      },
      "layers": [
        {
          "id": "bg",
          "type": "background",
          "props": {
            "gradient": ["#0F0E17", "#1A0A2E"],
            "gradientAngle": 160,
            "pattern": "halftone",
            "patternOpacity": 0.06
          }
        },
        {
          "id": "hook-text",
          "type": "text",
          "x": "10%",
          "y": "35%",
          "props": {
            "content": "What if everything you knew about habits was wrong?",
            "fontSize": "clamp(2rem, 7vw, 3.5rem)",
            "fontFamily": "Dela Gothic One",
            "color": "#F0EEE8",
            "maxWidth": "80%",
            "lineHeight": 1.15
          }
        },
        {
          "id": "speed",
          "type": "effect",
          "props": {
            "effect": "speed_lines",
            "color": "#F5A623",
            "intensity": 0.4,
            "direction": "radial"
          }
        }
      ],
      "timeline": [
        {
          "at": 0,
          "target": "speed",
          "animate": { "opacity": [0, 0.6] },
          "duration": 400,
          "easing": "ease-out"
        },
        {
          "at": 300,
          "target": "hook-text",
          "animate": { "opacity": [0, 1], "y": ["38%", "35%"] },
          "duration": 600,
          "easing": "spring"
        }
      ]
    },
    {
      "id": "stat-reveal",
      "duration_ms": 6000,
      "transition": {
        "type": "wipe",
        "direction": "up",
        "duration_ms": 500
      },
      "layers": [
        {
          "id": "bg2",
          "type": "background",
          "props": {
            "gradient": ["#F2E8D5", "#EDE0CC"],
            "pattern": "crosshatch",
            "patternOpacity": 0.04
          }
        },
        {
          "id": "big-number",
          "type": "counter",
          "x": "50%",
          "y": "30%",
          "props": {
            "from": 0,
            "to": 73,
            "suffix": "%",
            "fontSize": "8rem",
            "fontFamily": "Dela Gothic One",
            "color": "#E8191A",
            "textAlign": "center",
            "duration_ms": 2000
          }
        },
        {
          "id": "stat-label",
          "type": "text",
          "x": "50%",
          "y": "52%",
          "props": {
            "content": "of habit changes fail in the first week",
            "fontSize": "1.4rem",
            "fontFamily": "Outfit",
            "color": "#1A1825",
            "textAlign": "center",
            "maxWidth": "70%"
          }
        }
      ],
      "timeline": [
        {
          "at": 200,
          "target": "big-number",
          "animate": { "opacity": [0, 1], "scale": [0.8, 1.0] },
          "duration": 400,
          "easing": "spring"
        },
        {
          "at": 300,
          "target": "big-number",
          "animate": { "countUp": true },
          "duration": 2000,
          "easing": "ease-out"
        },
        {
          "at": 2500,
          "target": "stat-label",
          "animate": { "opacity": [0, 1], "y": ["55%", "52%"] },
          "duration": 500,
          "easing": "ease-out"
        }
      ]
    }
  ],

  "meta": {
    "title": "The 73% Problem",
    "book_title": "Atomic Habits",
    "book_id": "abc123",
    "summary_id": "def456",
    "source_content_ids": ["quote-3", "data-7", "cluster-2"],
    "total_duration_ms": 42000,
    "mood": "revelatory"
  }
}
```

### Layer Types (Full Vocabulary)

**Inherited from Living Panel DSL (already proven):**

| Type | Purpose | Key Props |
|------|---------|-----------|
| `background` | Gradients, patterns, solid | gradient, pattern, patternOpacity |
| `text` | Any text on screen | content, fontSize, fontFamily, color, typewriter |
| `speech_bubble` | Dialogue with tail | text, character, style, tailDirection |
| `effect` | Visual FX | effect, color, intensity, direction |
| `sprite` | Character silhouette | character, expression, pose, silhouette |
| `data_block` | Bullet list | items[], accentColor, animateIn |
| `shape` | Geometric primitives | shape, fill, stroke, strokeWidth |
| `illustration` | SVG scene bg | scene, style, primaryColor |

**New for Video DSL:**

| Type | Purpose | Key Props |
|------|---------|-----------|
| `counter` | Animated number | from, to, suffix, prefix, duration_ms |

That's it. ONE new layer type. Everything else is composition of
existing primitives. The power isn't in having more types — it's in
the LLM's freedom to COMBINE them in unexpected ways.

### Scene-Level Camera

Each scene can optionally have camera movement:

```json
"camera": {
  "zoom": [1.0, 1.15],           // start → end scale
  "pan": { "x": [0, -30], "y": [0, 20] },  // px offset
  "rotate": [0, 2],              // degrees
  "easing": "ease-in-out"
}
```

This wraps ALL layers in the scene. A slow zoom-in creates tension.
A pan reveals off-screen content. Rotate adds dynamism.

### Scene Transitions

```json
"transition": {
  "type": "cut|fade|wipe|zoom|glitch|ink_wash|slide|iris",
  "duration_ms": 400,
  "direction": "up|down|left|right",
  "color": "#000000"
}
```

| Transition | Effect | Best For |
|-----------|--------|----------|
| `cut` | Instant switch | High energy, fast pacing |
| `fade` | Crossfade | Gentle, contemplative |
| `wipe` | Directional reveal | Scene change, topic shift |
| `zoom` | Scale in/out | Focus, emphasis |
| `glitch` | Digital distortion | Surprising, tech content |
| `ink_wash` | Ink bleeding across | Manga-native, beautiful |
| `slide` | Push old scene away | Sequential content |
| `iris` | Circular reveal | Dramatic reveal |

### Animation System (Inherited from Living Panel DSL)

```json
{
  "at": 300,              // ms from scene start
  "target": "layer-id",   // which layer to animate
  "animate": {
    "opacity": [0, 1],    // from → to
    "scale": [0.8, 1.0],
    "x": ["10%", "15%"],
    "y": ["40%", "35%"],
    "rotate": [0, 5],
    "typewriter": true,    // character-by-character reveal
    "countUp": true        // for counter layers
  },
  "duration": 600,        // ms
  "easing": "spring"      // linear|ease-in|ease-out|ease-in-out|spring|bounce
}
```

Same proven system. The LLM already knows how to use this from
Living Panel generation. Zero learning curve.

---

## Content Pipeline: What Gets Put in Reels

### Available Data (already exists in the pipeline):

```
knowledge_doc:
  ├── core_thesis           → hook material
  ├── key_entities[]        → character content
  ├── argument_structure    → logical flow content
  ├── knowledge_clusters[]  → themed content groups
  ├── emotional_arc         → dramatic moments
  ├── quotable_moments[]    → quote scenes
  ├── data_points[]         → counter/data scenes
  ├── relationships[]       → entity relationship content
  └── what_makes_interesting → hook material

knowledge_graph:
  ├── central_entities      → who matters most
  ├── conflict_pairs        → dramatic tension
  ├── mentor_pairs          → wisdom moments
  └── dramatic_weight       → importance scoring

narrative_arc:
  ├── acts[1,2,3]           → story structure
  ├── beats[]               → individual story moments
  ├── theme                 → overarching message
  └── central_question      → the hook
```

### Memory System

```python
class BookReelMemory:
    """What content has been used in reels for this book."""
    book_id: str
    summary_id: str
    used_content_ids: list[str]    # IDs like "quote-3", "data-7"
    total_reels_generated: int
    exhausted: bool                # True when all content used
    last_generated_at: datetime
```

Each piece of content gets an ID (e.g., `quote-0`, `data-3`,
`cluster-habit-stacking`, `beat-climax`). When a reel uses content,
its IDs are added to `used_content_ids`. Next reel generation
filters out used content.

### Content Selection (Rule-Based, Not LLM)

```python
def select_reel_content(knowledge_doc, graph, arc, memory):
    """Pick unused content for the next reel. No LLM needed."""
    
    pool = []
    
    # Quotable moments (high catchiness)
    for i, q in enumerate(knowledge_doc["quotable_moments"]):
        cid = f"quote-{i}"
        if cid not in memory.used_content_ids:
            pool.append({"id": cid, "type": "quote", "data": q, "weight": 0.9})
    
    # Data points (scroll-stopping numbers)
    for i, d in enumerate(knowledge_doc["data_points"]):
        cid = f"data-{i}"
        if cid not in memory.used_content_ids:
            pool.append({"id": cid, "type": "data", "data": d, "weight": 0.85})
    
    # Conflict pairs from graph (always dramatic)
    for pair in graph.conflict_pairs:
        cid = f"conflict-{pair['from']}-{pair['to']}"
        if cid not in memory.used_content_ids:
            pool.append({"id": cid, "type": "conflict", "data": pair, "weight": 0.9})
    
    # Narrative beats (story moments)
    for beat in arc.all_beats:
        if beat.beat_id not in memory.used_content_ids:
            pool.append({
                "id": beat.beat_id, "type": "beat",
                "data": beat.to_dict(), "weight": beat.dramatic_weight
            })
    
    # Knowledge cluster insights
    for i, cluster in enumerate(knowledge_doc["knowledge_clusters"]):
        cid = f"cluster-{i}"
        if cid not in memory.used_content_ids:
            pool.append({
                "id": cid, "type": "cluster",
                "data": cluster, "weight": 0.7
            })
    
    # Sort by weight, pick top 4-8 items for one reel
    pool.sort(key=lambda x: x["weight"], reverse=True)
    return pool[:8]
```

The selected content is then passed to the LLM along with the
Video DSL spec. The LLM arranges it into a reel and generates
the full DSL JSON.

---

## Rendering Pipeline

### Step-by-Step Flow

```
1. User clicks "Generate Reel" on book detail page
    ↓
2. Backend: select_reel_content() picks unused content
    ↓
3. Backend: LLM generates Video DSL JSON (~800-1200 tokens)
    ↓
4. Backend: validate + auto-fix DSL (same as manga panels)
    ↓
5. Backend: write DSL to temp file
    ↓
6. Backend: subprocess → reel-renderer CLI
   $ cd reel-renderer && npx remotion render \
       src/index.ts ReelComposition \
       /storage/reels/{book_id}/{reel_id}.mp4 \
       --props=/tmp/{reel_id}.json \
       --width=1080 --height=1920 --fps=30
    ↓
7. Remotion: headless Chrome renders each frame
   - Loads fonts from Google Fonts
   - Renders layers per frame using interpolate()
   - Applies scene transitions
   - Encodes via ffmpeg → MP4
    ↓
8. Backend: update MongoDB with render status + video path
    ↓
9. Frontend: GET /api/reels/{reel_id}/video → serves MP4
```

### Render Performance

For a 45-second reel at 30fps = 1,350 frames.
Remotion renders ~10-20 frames/sec on modern hardware.
Total render time: **~1-2 minutes**.

This is acceptable because:
- Generation is async (Celery task, like manga)
- User gets progress updates via SSE
- Once rendered, playback is instant
- Videos are cached (no re-rendering)

### Dependencies

```
reel-renderer/
  - Node.js v18+ ✓ (already have v18.20.8)
  - @remotion/cli
  - @remotion/transitions
  - @remotion/noise (procedural backgrounds)
  - ffmpeg (needs install: brew install ffmpeg)
```

---

## Frontend: Video Player

### No Remotion in the Browser

The frontend has ZERO Remotion dependencies. It's a plain video player
with a TikTok-style dual-swipe interaction model.

```
frontend/
├── app/
│   └── reels/
│       └── page.tsx              # Entry (fetches reel list)
│
└── components/
    └── ReelVideoPlayer/
        ├── ReelVideoPlayer.tsx   # Main container
        │   - Vertical scroll-snap (book-to-book)
        │   - Horizontal swipe (within-book)
        │   - IntersectionObserver for auto-play
        │
        ├── VideoCard.tsx         # Single reel card
        │   - <video> element
        │   - Play/pause on visibility
        │   - Progress bar overlay
        │   - Double-tap to skip/replay
        │
        ├── ReelOverlay.tsx       # UI overlay
        │   - Book info (top)
        │   - Action buttons (right rail)
        │   - Horizontal position dots
        │   - "Generate More" at end
        │
        └── ReelActions.tsx       # Action buttons
            - ❤️ Save
            - 📖 Open in manga reader
            - ⬇️ Download MP4
            - ↗️ Share
```

### Interaction Model

```
┌──────────────────────────┐
│   📚 Book Title          │ ← top bar (book info)
│   by Author              │
│                          │
│  ┌────────────────────┐  │
│  │                    │  │
│  │                    │  │
│  │    <video>         │  │ ← auto-playing MP4
│  │                    │  │
│  │                    │  │
│  │                    │  │   ← tap to pause/play
│  │                    │  │
│  │                    │  │
│  └────────────────────┘  │
│                          │
│  • • ━━ •               │ ← horizontal position (same book)
│  ═══════════════         │ ← playback progress bar
│                          │
│  ↕ scroll for more books │
└──────────────────────────┘

   Right rail:              │ ❤️
   (TikTok-style            │ 💬
    floating buttons)        │ ⬇️
                             │ ↗️
```

**Vertical scroll** = CSS scroll-snap → different book's reel  
**Horizontal swipe** = motion drag → same book, next reel  
**Tap** = pause/resume video  
**Double-tap right** = skip 5s forward  
**Double-tap left** = replay from start  

### Why This Is Better Than @remotion/player

| @remotion/player (v1 plan) | <video> element (v2 plan) |
|---------------------------|--------------------------|
| Remotion deps in frontend | Zero extra deps |
| Renders on-the-fly (CPU) | Plays cached MP4 (GPU) |
| Can't share the "video" | Real MP4, downloadable |
| Complex client bundle | Tiny client footprint |
| No offline playback | Videos cached by browser |

---

## Critique & Risk Analysis

### Risk 1: LLM Can't See the Video

**Problem:** The LLM generates a DSL without seeing the result.
It might create invisible text, overlapping elements, or ugly palettes.

**Mitigation (proven):** Same approach as manga panels:
- `validate_reel_dsl()` — structural validation
- `fix_common_dsl_issues()` — auto-repair missing IDs, bad positions
- `enforce_text_contrast()` — WCAG AA compliance
- `LAYER_TYPE_ALIASES` — normalize LLM-invented types
- Default palette fallback — if LLM's colors are unreadable
- Position clamping — elements can't be off-screen

**This already works for manga.** The same validator pattern applies.

### Risk 2: Remotion CLI Render Time

**Problem:** 1-2 minutes per reel. Users might not wait.

**Mitigation:**
- Async task (Celery) — same as manga generation
- SSE progress updates — "Rendering frame 847/1350..."
- **Batch pre-generation** — when manga is generated, auto-queue
  2-3 reels in the background. User sees them ready when they visit.
- Once rendered, instant playback forever

### Risk 3: ffmpeg Dependency

**Problem:** ffmpeg not installed on this machine.

**Mitigation:** `brew install ffmpeg`. Or Docker container for the
reel-renderer with ffmpeg pre-installed. Remotion officially
documents this setup.

### Risk 4: Remotion Licensing

**Problem:** Remotion requires a paid "Company License" for companies
with $10M+ revenue. Walmart qualifies.

**Mitigation options:**
1. **Check if internal-tool exemption applies** — Remotion's license
   distinguishes between customer-facing products and internal tools
2. **Alternative: use Puppeteer + ffmpeg directly** — skip Remotion,
   render our own React components in headless Chrome, capture frames
   with Puppeteer's `page.screenshot()`, encode with ffmpeg
3. **Alternative: use MotionCanvas/Revideo** — MIT licensed, no
   revenue restrictions

**Recommendation:** Start with Remotion for fastest MVP. If licensing
is a blocker, the DSL is renderer-agnostic — we can swap Remotion
for Puppeteer+ffmpeg without changing the DSL or backend at all.
The DSL ↔ Renderer boundary is clean.

### Risk 5: Storage Growth

**Problem:** 45s MP4 at 1080×1920 = ~5-15MB per reel.
100 reels = 500MB-1.5GB.

**Mitigation:**
- `/storage/reels/` with cleanup policy (delete after 30 days)
- Compress with H.265 (smaller files, same quality)
- Regenerate on demand (DSL is stored, re-render is cheap)
- Future: move to S3/GCS for production scale

### Risk 6: Token Cost

**Analysis:** A 45-second reel with 6 scenes ≈ 800-1200 output tokens.
At Gemini 2.5 Flash pricing (~$0.15/1M output tokens):
- One reel ≈ $0.0002
- 100 reels ≈ $0.02

**Negligible.** Cheaper than a single manga panel.

---

## Comparison: Remotion vs Alternatives

### Why Not Just Use Canvas + MediaRecorder?

We already render manga panels in the browser. Could we just record
the LivingPanelEngine playing?

| Canvas Recording | Remotion CLI |
|-----------------|-------------|
| Timing drift (real-time) | Frame-accurate |
| Browser-dependent output | Deterministic |
| No ffmpeg integration | Built-in encoding |
| Must run in browser | Headless server |
| Flaky MediaRecorder API | Battle-tested pipeline |

**Verdict:** Remotion is purpose-built for this. Don't reinvent it.

### Why Not Revideo?

| Revideo | Remotion |
|---------|----------|
| MIT license (free) | Company license needed |
| Generator functions | React components |
| 1.5k stars, ~1 year | 21k stars, 4+ years |
| Different paradigm | Same React stack |
| Smaller ecosystem | Rich plugin ecosystem |

**Verdict:** Remotion is better for our stack. If licensing blocks us,
Revideo is the fallback. Or Puppeteer+ffmpeg as escape hatch.

### Why Not a Cloud API (Creatomate, Shotstack)?

| Cloud API | Self-Hosted Remotion |
|-----------|---------------------|
| Per-render cost ($0.05-0.50) | Free (after setup) |
| External dependency | Self-contained |
| Limited customization | Full control |
| Data leaves network | Data stays local |

**Verdict:** Self-hosted. We're Walmart — data stays inside.

---

## File Structure (Final)

```
PanelSummary/
├── backend/
│   └── app/
│       ├── reel_engine/              # NEW
│       │   ├── __init__.py
│       │   ├── content_picker.py     # Selects content, checks memory
│       │   ├── script_generator.py   # LLM → Video DSL JSON
│       │   ├── dsl_validator.py      # Validate + auto-fix DSL
│       │   ├── memory.py             # BookReelMemory CRUD
│       │   ├── renderer.py           # Calls reel-renderer subprocess
│       │   └── prompts.py            # LLM system prompt (DSL spec)
│       ├── models.py                 # + ReelScriptDoc, BookReelMemoryDoc
│       └── main.py                   # + new API endpoints
│
├── reel-renderer/                    # NEW (standalone Node.js)
│   ├── package.json
│   ├── remotion.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                  # Remotion entry + composition
│       ├── ReelComposition.tsx       # Reads DSL → renders scenes
│       ├── SceneRenderer.tsx         # Single scene with layers
│       ├── layers/                   # One renderer per layer type
│       │   ├── BackgroundLayer.tsx
│       │   ├── TextLayer.tsx
│       │   ├── CounterLayer.tsx
│       │   ├── SpeechBubbleLayer.tsx
│       │   ├── EffectLayer.tsx
│       │   ├── SpriteLayer.tsx
│       │   ├── DataBlockLayer.tsx
│       │   ├── ShapeLayer.tsx
│       │   └── IllustrationLayer.tsx
│       ├── transitions/
│       │   └── SceneTransition.tsx   # All transition types
│       ├── effects/                  # Visual FX renderers
│       │   ├── SpeedLines.tsx
│       │   ├── Particles.tsx
│       │   ├── Halftone.tsx
│       │   └── InkSplash.tsx
│       └── utils/
│           ├── timing.ts             # Frame ↔ ms conversion
│           ├── interpolation.ts      # Custom easing
│           └── fonts.ts              # Google Fonts loader
│
├── frontend/
│   ├── app/
│   │   └── reels/
│   │       └── page.tsx              # Video reel page
│   └── components/
│       ├── ReelVideoPlayer/          # NEW
│       │   ├── ReelVideoPlayer.tsx   # Dual-swipe container
│       │   ├── VideoCard.tsx         # Single video card
│       │   ├── ReelOverlay.tsx       # UI overlay
│       │   └── ReelActions.tsx       # Action buttons
│       └── ReelsFeed.tsx             # OLD (text reels, kept)
│
└── storage/
    └── reels/                        # Rendered MP4 files
        └── {book_id}/
            └── {reel_id}.mp4
```

---

## Execution Plan (Revised)

### Phase 1: Backend Engine (Days 1-2)
- [ ] Create `reel_engine/` package
- [ ] `models.py` additions (ReelScriptDoc, BookReelMemoryDoc)
- [ ] `content_picker.py` — select content, check memory
- [ ] `memory.py` — CRUD for BookReelMemory
- [ ] `prompts.py` — Video DSL spec as LLM system prompt
- [ ] `script_generator.py` — LLM call → Video DSL
- [ ] `dsl_validator.py` — validate + auto-fix (port from manga)
- [ ] API endpoints in `main.py`
- [ ] Tests for content picker, validator, memory

### Phase 2: Reel Renderer (Days 2-3)
- [ ] `brew install ffmpeg`
- [ ] Init `reel-renderer/` project with Remotion
- [ ] `ReelComposition.tsx` — DSL interpreter
- [ ] `SceneRenderer.tsx` — per-scene rendering
- [ ] Layer renderers (text, background, counter, effect, etc.)
- [ ] Scene transitions
- [ ] Camera (pan/zoom/rotate)
- [ ] `renderer.py` — backend subprocess integration
- [ ] Test: sample DSL → MP4 output

### Phase 3: Video Player (Days 3-4)
- [ ] `ReelVideoPlayer.tsx` — dual-swipe container
- [ ] `VideoCard.tsx` — video playback with overlay
- [ ] `ReelOverlay.tsx` — book info, actions
- [ ] `ReelActions.tsx` — save, download, share
- [ ] Horizontal swipe for same-book reels
- [ ] IntersectionObserver for auto-play/pause
- [ ] "Generate Reel" button on book detail page
- [ ] Video serving endpoint in backend

### Phase 4: Polish (Days 4-5)
- [ ] Batch pre-generation (auto-queue reels after manga)
- [ ] Download MP4 functionality
- [ ] Share via native share API
- [ ] Progress tracking during render (SSE)
- [ ] Edge cases: empty books, failed renders, disk space
- [ ] Accessibility: reduced motion, captions
- [ ] Update ARCHITECTURE.md

---

## The Philosophy

> "The LLM is the director. The DSL is the screenplay.
>  Remotion is the camera crew. The viewer just sees the film."

No templates. No presets. No "AI slop aesthetic."
The same DSL can produce a slow, contemplative quote reel with
Playfair Display on a paper-cream background... or a high-energy
data barrage with speed lines and impact bursts... or an animated
knowledge graph with orbiting nodes... or something we haven't
imagined yet.

The vocabulary is fixed. The compositions are infinite.
