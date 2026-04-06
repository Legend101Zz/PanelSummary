# V4 Engine: Design Document
## Authored by Comreton 🐶 — rainy weekend, April 2026

---

## 1. Why V4? (Evidence-Based)

### Token Usage Profile (from `new-log.md`)

| Stage | Tokens Out | Cost Impact |
|-------|:---:|---|
| Chapter summarization | 500–1,600 | Fine |
| Document understanding | **7,500** (truncated!) | Broke the brain |
| Manga story design | **11,000** (truncated!) | Broke the story |
| Planning | 1,790–1,920 | Fine |
| **DSL per page (v2)** | **2,500–5,200** | ← THE PROBLEM |

A single page's v2 DSL is **15,566 chars** — that's an entire essay
just to describe "two characters talking in a lab." Across 10 pages
that's **~40K output tokens** for DSL alone. No wonder things truncate.

### Why V2 DSL Is Too Verbose

V2 makes the LLM specify EVERYTHING:
- Every layer's exact x%, y%, width, height
- Every animation keyframe: `{"at": 300, "target": "char-a", "animate": {"opacity": [0,1]}}`
- Every color, font size, opacity, transition curve
- Full props for every sprite, bubble, effect

**One dialogue panel in v2 = ~1,000 tokens.**

### V4 Core Insight: "LLM Directs, Engine Acts"

V4 makes the LLM specify INTENT only:
```json
{
  "type": "dialogue",
  "scene": "laboratory",
  "mood": "tense",
  "lines": [
    {"who": "Dr. Chen", "says": "Every other agent is fixed.", "emotion": "frustrated"},
    {"who": "LIVE-SWE-AGENT", "says": "But I can learn while fighting.", "emotion": "determined"}
  ]
}
```
**One dialogue panel in v4 = ~150 tokens.** That's 7x cheaper.

The engine handles layout, positioning, animation, effects.

---

## 2. Why NOT Canvas/p5.js/PixiJS Per Panel

### Challenge: "What about p5.js sketches per panel?"

| Issue | Severity | Detail |
|-------|----------|--------|
| WebGL context limit | 🔴 CRITICAL | Chrome allows ~16 WebGL contexts. 28 panels = crash. |
| Bundle size | 🟡 HIGH | p5.js = 1.3MB minified. Per panel import = bloat. |
| SSR incompatible | 🟡 HIGH | Canvas needs `window` — breaks Next.js SSR. |
| Text rendering | 🟡 HIGH | No ligatures, no CSS fonts, no line-wrap, no `<br/>`. |
| Accessibility | 🔴 CRITICAL | Canvas is invisible to screen readers. WCAG 2.2 AA fail. |
| Text selection | 🟡 MEDIUM | Users can't copy text from canvas panels. |
| LLM code quality | 🔴 CRITICAL | LLM generates broken canvas code ~30-40% of the time. |
| Token cost | 🟡 HIGH | p5 sketch ≈ 500 tokens × 28 panels = 14K tokens of code. |
| Security | 🔴 CRITICAL | eval() or Function() needed to run LLM code = XSS vector. |

### What We Actually Render

Let's be honest about what a manga panel IS:
- **Text** in speech bubbles (DOM handles this perfectly)
- **Character silhouettes** as SVG paths (we already have 8 poses)
- **Background scenes** as SVG (SceneLibrary already has 7 scenes)
- **Effects** as CSS animations (GPU-accelerated, zero JS overhead)
- **Data blocks** as styled divs

None of this needs WebGL. None of this needs canvas. None of this
needs a 1.3MB rendering framework.

### What IF we need advanced effects?

For rare cases (particle storms, dynamic fractals):
- ONE shared OffscreenCanvas per PAGE (not per panel)
- Composited as a CSS layer ABOVE the DOM
- Only spawned when an effect requires it
- This is the escape hatch, not the default

---

## 3. V4 Architecture

```
V2: LLM → [verbose DSL with every pixel] → LivingPanelEngine
V4: LLM → [semantic intent: who, says, scene] → V4Engine → [full visual]
```

### Frontend Rendering Stack

```
┌─ V4PageRenderer (CSS Grid — arranges panels on a page)
│  ├─ V4PanelRenderer (one per panel)
│  │  ├─ SceneLayer (SVG — from SceneLibrary, already built)
│  │  ├─ CharacterLayer (SVG — MangaCharacter with pose/aura)
│  │  ├─ ContentLayer (DOM — bubbles, narration, data blocks)
│  │  └─ EffectLayer (CSS — speed lines, screentone, vignette)
│  ├─ V4PanelRenderer ...
│  └─ V4PanelRenderer ...
└─ (Optional) EffectsCanvas — ONE canvas for page-level particles
```

### Panel Type Templates

Each `content_type` maps to a FIXED rendering template:

| Type | Layout | Characters | Content | Effects |
|------|--------|------------|---------|---------|
| splash | Full page | 1 centered, large | Title text overlay | speed_lines, impact |
| dialogue | 2-3 cells (cuts) | 1-2 in cells | Speech bubbles | screentone |
| narration | Full or split-v | 0-1 small | Caption text | vignette |
| data | Grid or split-h | 1 reacting | Data blocks | none |
| montage | 3-4 rapid cuts | Various | Short captions | speed_lines |
| concept | Full page | 0-1 | Metaphor text | illustration |
| transition | Full page | 0 | Chapter title | ink_wash |

The LLM picks the type. The engine decides everything else.

### V4 DSL Schema (Backend Output)

```typescript
interface V4Page {
  page_index: number;
  chapter_index: number;
  layout: "vertical" | "grid-2" | "grid-3" | "grid-4" | "asymmetric";
  panels: V4Panel[];
}

interface V4Panel {
  type: "splash" | "dialogue" | "narration" | "data" | "montage" | "concept" | "transition";
  scene?: string;           // SceneLibrary key: "laboratory", "battlefield", etc.
  mood?: string;            // drives color palette + effects
  title?: string;           // for splash/transition panels
  narration?: string;       // short caption (max 80 chars)
  lines?: DialogueLine[];   // for dialogue panels
  data_items?: DataItem[];  // for data panels
  character?: string;       // primary character shown
  pose?: string;            // character pose
  expression?: string;      // character expression
  effects?: string[];       // effect names: "speed_lines", "screentone", etc.
  emphasis?: "high" | "medium" | "low";  // panel size weight
}

interface DialogueLine {
  who: string;
  says: string;
  emotion?: string;
}

interface DataItem {
  label: string;
  value?: string;
}
```

### Cost Comparison

| Metric | V2 | V4 |
|--------|:---:|:---:|
| Tokens per panel | ~1,000 | ~150 |
| Tokens per page (3 panels) | ~3,500 | ~500 |
| Total DSL tokens (28 panels) | ~35,000 | ~5,000 |
| Parse failures | ~15% | ~2% (simpler JSON) |
| Cost per manga | ~$0.15 | ~$0.04 |
| Truncation risk | HIGH | LOW |

---

## 4. Implementation Plan

### Backend

1. `v4_types.py` — Pydantic models for V4 DSL
2. `v4_dsl_generator.py` — Generates slim DSL from PanelAssignments
3. `v4_page_templates.py` — Panel type → rendering hints

### Frontend

1. `V4Engine/types.ts` — TypeScript types
2. `V4Engine/V4PageRenderer.tsx` — Page layout + panel arrangement
3. `V4Engine/V4PanelRenderer.tsx` — Individual panel rendering
4. `V4Engine/panels/` — Per-type renderers (SplashPanel, DialoguePanel, etc.)

### Integration

- Add `engine: "v2" | "v4"` to SummarizeRequest
- Orchestrator routes to correct DSL generator
- Frontend detects DSL version and picks renderer
- UI toggle on the summarize form

### What Stays The Same (No Duplication)

- Phase 1-3 pipeline (understanding → graph → arc → story design → planning)
- SceneLibrary (Phase 2) — reused by both engines
- MangaCharacter (Phase 4) — reused by both engines
- MangaInk primitives — reused by both engines
- Planner (same PanelAssignments for both engines)

Only the DSL generator and renderer are new.
