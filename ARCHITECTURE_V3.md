# PanelSummary v3 Architecture: From PPT to Manga

## Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 0 | ✅ DONE | Bug fixes: token limits, JSON recovery, text overflow, empty cells |
| Phase 1 | ✅ DONE | Narrative-first planner prompt rewrite |
| Phase 2 | ✅ DONE | SVG Illustration Engine with 7-scene library |
| Phase 3 | ✅ DONE | Knowledge Graph → Narrative Arc → Scene Composer |
| Phase 4 | ✅ DONE | Richer characters: 8 poses, auras, signature colors |

## Deep Analysis of Current State

### What's Actually Happening (Evidence from `new-log.md`)

**Root Cause 1: The entire v2 brain is being thrown away.**

Both v2 stages (document understanding + manga story design) are generating
_excellent_ content that gets silently discarded:

```
[21:05:16] [LLM] ← claude-haiku-4.5 | 7500 out tokens | 60.0s
[21:05:16] Unwrapped list→dict from LLM response
[21:05:16] Document understanding failed — using fallback     ← DISCARDED
```

The LLM generated a rich knowledge document with `core_thesis`, 10 entities,
argument structure, emotional arc, etc. But it hit exactly 7500 tokens
(the `max_tokens` cap of `min(8000, 2500 + 10*500) = 7500`), truncating the
JSON mid-stream. The parser extracted a partial structure that lacked
`core_thesis`, triggering the fallback.

Same story for manga story design:
```
[21:06:47] [LLM] ← claude-haiku-4.5 | 11000 out tokens | 88.9s
[21:06:47] Manga story design failed — using fallback         ← DISCARDED
```

The LLM designed an incredible manga story — "Evolution Unleashed" with
detailed characters, world-building, visual style guides, recurring motifs —
then hit the 11000 token cap. JSON truncated. Fallback used.

**So the manga is being built from a skeleton, not from understanding.**
The fallback produces 2 generic characters and basic scene stubs. The entire
narrative depth, the character dynamics, the visual style guide — all gone.

**Root Cause 2: The planner is generating slide-deck content, not manga.**

Look at what the planner outputs as `text_content`:
```json
"text_content": "Tools aren't pre-built libraries.\n\nThey're executable
scripts the agent generates on-the-fly, tailored to the exact problem at
hand.\n\nThe breakthrough is architectural:\n\nBy framing tools as simple
shell scripts with cle..."
```

This reads like a slide deck. It's long, structured, informational text that
the DSL generator then wraps in text layers. The planner should be creating
_narrative_ content — dialogue between characters, short dramatic narration,
visual scene descriptions — not paragraphs of explanation.

**Root Cause 3: The DSL has no illustration layer.**

Current sprite system: 3 SVG paths (standing, thinking, action) at 32x32px.
That's it. Characters are tiny silhouettes with expression marks (a `?` for
curious, `!` for excited). There's no way to render:
- Scene illustrations (lab, battlefield, city)
- Character detail (faces, clothing, equipment)
- Visual metaphors (the "warrior forging weapons" the LLM keeps describing)
- Dynamic poses beyond "standing", "sitting", "arms out"

**Root Cause 4: Text overflows because the DSL doesn't enforce content limits.**

The LLM generates 200+ character text blocks in panels with `maxWidth: "90%"`,
which overflows in narrow sub-cells. No server-side validation caps text length
per panel. No client-side truncation with "..." for overflow.

---

## Evaluation: p5.js vs Remotion vs Extended DSL

### p5.js (Processing for the web)

**Pros:**
- Full canvas drawing — can render any illustration procedurally
- LLM can generate p5 sketch code for scene-specific illustrations
- 2D primitives perfect for manga line art (bezier curves, strokes)
- Community has manga/anime style libraries
- Runs client-side, no extra infra

**Cons:**
- LLM-generated code = security risk (eval/sandbox needed)
- Every panel needs a different sketch = expensive token-wise
- Inconsistent quality — LLM sometimes generates broken canvas code
- No declarative structure — harder to validate/fix than JSON DSL
- Performance: canvas per panel × 28 panels = potential jank

**Verdict:** Too risky for production. Good for a specific "illustration layer"
within our DSL, sandboxed.

### Remotion

**Pros:**
- React-based video composition — we already use React
- Beautiful sequencing and timing
- Can export to video for sharing

**Cons:**
- Designed for VIDEO rendering (server-side Node.js + ffmpeg)
- Requires headless Chrome or Lambda for rendering — heavy infra
- Overkill for interactive reading experience
- Our DSL + Motion already does what Remotion would, but interactively

**Verdict:** Wrong tool. We want interactive reading, not video export.

### Extended DSL with SVG Illustration Layer (Recommended)

**Pros:**
- Incremental — extend what works, don't rewrite
- SVG is declarative (like our JSON DSL) — easy to validate/fix
- Claude can generate clean SVG for simple line-art illustrations
- Can build a component library (poses, scenes, props) the LLM composes
- No security risk — it's just SVG markup in the DSL
- Renders natively in React — no canvas/WebGL overhead

**Cons:**
- SVG illustrations from LLMs are sometimes crude
- Complex scenes require many tokens
- Need to balance quality vs token cost

**Verdict:** Best fit. We add an `illustration` layer type that accepts
SVG markup, backed by a component library + LLM-generated customizations.

---

## v3 Architecture Proposal

### Phase 0: Fix the Bleeding (immediate, no architecture changes)

These are bugs, not architecture issues. Fix them now:

1. **Raise token limits** — document understanding: 12000, story design: 16000
2. **Robust JSON recovery** — when truncated, attempt to close open brackets
3. **Text length enforcement** — cap text content per layer based on panel size
4. **Empty cell prevention** — if a cell has no layers, inject a placeholder

### Phase 1: Narrative-First Content (prompt engineering, 1-2 days)

The biggest bang-for-buck. The content itself needs to change from
"information presentation" to "visual storytelling":

**Current planner output:**
```
"text_content": "Modern agents now:\n📂 Navigate repositories\n✓ Run tests\n🔧 Submit patches\n⚙ Make decisions"
```

**What it should be:**
```json
{
  "dialogue": [
    {"character": "Narrator", "text": "In the old world, agents were blind."},
    {"character": "LIVE-SWE-AGENT", "text": "But I can see the whole repository."},
    {"character": "Narrator", "text": "Navigate. Test. Patch. Decide. All without stopping."}
  ],
  "scene_description": "Split panel: left shows old agent stumbling in darkness, right shows LIVE-SWE-AGENT surveying a vast codebase landscape from above."
}
```

Changes:
- Rewrite planner prompt to enforce DIALOGUE over exposition
- Limit text_content to max 80 chars per panel (narrative, not paragraphs)
- Require `scene_description` field for visual direction
- Add `visual_metaphor` field the DSL generator can render
- Enforce "show don't tell" — if a fact can be a dialogue, make it dialogue

### Phase 2: SVG Illustration Engine (3-5 days)

Add a new layer type `illustration` to the DSL:

```json
{
  "id": "scene-illustration",
  "type": "illustration",
  "x": "0%", "y": "0%",
  "opacity": 0,
  "props": {
    "svg": "<svg viewBox='0 0 800 600'>...</svg>",
    "style": "manga-ink",
    "description": "Lab scene with glowing monitors"
  }
}
```

**Component library approach:**

Rather than generating full SVG from scratch each time, we build a
reusable component library:

```
/frontend/components/LivingPanel/illustrations/
  characters/
    researcher.svg      # Multiple poses via CSS classes
    agent-avatar.svg    # The AI character
    mentor.svg
  scenes/
    laboratory.svg      # Research lab background
    digital-realm.svg   # Abstract code landscape
    battlefield.svg     # Competition/benchmark arena
  props/
    monitor.svg
    code-block.svg
    chart-rising.svg
    weapon-forge.svg    # Visual metaphor
  effects/
    energy-burst.svg
    data-flow.svg
```

The LLM selects components and customizes colors/positioning:
```json
{
  "type": "illustration",
  "props": {
    "component": "scenes/laboratory",
    "characters": [
      {"component": "characters/researcher", "pose": "standing", "x": "30%", "y": "60%"},
      {"component": "characters/agent-avatar", "pose": "action", "x": "65%", "y": "55%"}
    ],
    "props": [
      {"component": "props/monitor", "x": "20%", "y": "40%", "glow": "#00ff88"}
    ],
    "colorOverrides": {"primary": "#1A1825", "accent": "#E8191A"}
  }
}
```

**Hybrid: LLM-generated SVG for simple elements:**

For visual metaphors and unique scenes, the LLM can generate simple SVG:
```json
{
  "type": "illustration",
  "props": {
    "svg_inline": true,
    "svg": "<svg viewBox='0 0 200 200'><circle cx='100' cy='100' r='80' fill='none' stroke='#1A1825' stroke-width='3'/><path d='M60,100 Q100,40 140,100' fill='none' stroke='#E8191A' stroke-width='2'/></svg>",
    "description": "Abstract: evolution cycle"
  }
}
```

### Phase 3: Knowledge Graph → Narrative Arc (3-5 days)

Replace the current "understand → design" with a more structured approach:

```
Document → Knowledge Graph → Narrative Arc → Scene Composition → DSL
```

**Knowledge Graph** (replaces document understanding):
- Extract entities programmatically (not just LLM) using spaCy/regex
- Build relationship map: who/what connects to who/what
- Identify "dramatic potential" in each relationship
- Store as a lightweight graph structure

**Narrative Arc** (replaces manga story design):
- Map knowledge graph to a 3-act structure automatically
- Act 1: Setup — introduce key entities and the problem
- Act 2: Confrontation — present arguments, evidence, conflicts
- Act 3: Resolution — conclusions, impact, call to action
- Each act gets 30-40% of panels

**Scene Composition** (new stage between planning and DSL):
- For each planned panel, generate a detailed scene description
- Include: characters present, their poses, background scene, effects
- This is the "director's notes" the DSL generator works from
- Separate LLM call, focused purely on visual composition

### Phase 4: Richer Character System (2-3 days)

Current: 3 SVG silhouette paths + expression marks.
Target: Full manga character kit.

```typescript
// Character definition in the manga bible
interface MangaCharacter {
  id: string;
  name: string;
  visualDescription: string;
  // Multiple SVG poses generated once at story-design time
  poses: {
    standing: string;    // SVG path data
    action: string;
    thinking: string;
    dramatic: string;
    defeated: string;
  };
  expressions: {
    neutral: ExpressionOverlay;
    shocked: ExpressionOverlay;
    determined: ExpressionOverlay;
    // ... etc
  };
  // Visual signature elements
  signature: {
    color: string;       // Character's accent color
    symbol: string;      // SVG symbol (e.g., lightning bolt for LIVE-SWE-AGENT)
    aura: string;        // Effect type when this character appears
  };
}
```

The character SVGs would be generated ONCE during the story design phase
(a single LLM call focused on character art), then reused across all panels.
This ensures visual consistency throughout the manga.

---

## Implementation Strategy

### Parallel Flow (v3 alongside v2)

Create a new orchestration path that doesn't touch v2:

```
backend/app/
  agents/
    orchestrator.py          # v2 (existing, untouched)
    orchestrator_v3.py       # v3 (new)
    knowledge_graph.py       # Entity extraction + relationships
    narrative_arc.py         # 3-act structure from knowledge graph
    scene_composer.py        # Visual scene descriptions
    illustration_generator.py # SVG generation from scene descriptions
```

Switch between v2 and v3 via a feature flag in the API:
```python
orchestrator_version = request.query_params.get("engine", "v2")
if orchestrator_version == "v3":
    orchestrator = MangaOrchestratorV3(...)
else:
    orchestrator = MangaOrchestrator(...)
```

### Rollout

1. **Week 1:** Phase 0 (bug fixes) + Phase 1 (prompt rewrite)
   → Immediate quality improvement, no architecture risk
2. **Week 2:** Phase 2 (SVG illustration layer) + Phase 4 (character system)
   → Visual richness, still incremental
3. **Week 3:** Phase 3 (knowledge graph + narrative arc)
   → Full v3 pipeline, behind feature flag

### Cost Implications

Current run: ~$0.15 per manga (28 panels, ~355s)

v3 estimate:
- Knowledge graph extraction: +$0.01 (mostly regex, small LLM call)
- Narrative arc: +$0.02 (one focused call)
- Scene composition: +$0.03 (28 short calls, batched)
- Character SVG generation: +$0.02 (once per manga)
- Total: ~$0.23 per manga (+53%)
- But quality jumps from "okayish" to "wow" — worth it.

---

## Summary

The current system is 80% of the way there architecturally. The pipeline
(understand → design → plan → generate) is correct. But:

1. **The brain is disconnected** — both v2 stages silently fail, so panels
   are built from a skeleton. Fix: raise token limits, fix JSON recovery.

2. **Content is informational, not narrative** — the planner outputs text
   paragraphs instead of dialogue and visual scenes. Fix: prompt engineering.

3. **No illustration capability** — the DSL can only render text, effects,
   and tiny silhouettes. Fix: SVG illustration layer with component library.

4. **Text formatting is uncontrolled** — overflow, empty cells, unreadable
   narrow text. Fix: server-side content limits + client-side overflow handling.

**The recommended path is NOT a rewrite.** It's a series of targeted
improvements that compound. Phase 0+1 alone (2-3 days) will make the
current system noticeably better. Phase 2+4 (another week) will add
the visual richness that creates the "wow factor." Phase 3 is the
architectural upgrade that makes it truly intelligent.

p5.js and Remotion are interesting technologies but wrong for this use case.
SVG illustration within our existing DSL gives us the visual richness we need
without the complexity, security risk, or performance overhead.
