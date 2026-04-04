# Architecture Deep Dive — Will This Actually Work?

> Date: 2026-04-04 | Author: Comreton 🐶 | Mood: Brutally honest
>
> This document answers: "Is the core hypothesis sound? Where are we wrong?"

---

## The Numbers (from the actual log)

| Metric | Value |
|--------|-------|
| Input document | 3-page resume/portfolio PDF |
| LLM calls | **43 total** |
| Input tokens | **131,277** |
| Output tokens | **84,194** |
| Total tokens | **215,471** |
| Wall time | **318 seconds (5.3 minutes)** |
| Result | **40 panels** (all identical pattern) |
| Cost (Haiku) | **~$0.10** |

### Token Spend by Phase

| Phase | Calls | Input | Output | Total | % of Spend |
|-------|-------|-------|--------|-------|------------|
| Chapter summaries | 10 | ~5.7K | ~6K | ~11.7K | **5%** |
| Synopsis + Bible | 2 | ~2.4K | ~4.4K | ~6.8K | **3%** |
| Planner | 1 | ~3.4K | ~8K | ~11.4K | **5%** |
| **DSL generation** | **30** | **~120K** | **~66K** | **~186K** | **86%** |

**86% of all tokens are spent generating DSL panels.** And every single one
of those panels came out looking the same: gradient background → vignette →
text with typewriter animation. Zero sprites. Zero speech bubbles.
Zero cuts layouts. Zero data blocks.

---

## The Core Hypotheses — Tested Against Reality

### Hypothesis 1: "An LLM can compose visual manga panels via DSL"

**VERDICT: Partially wrong.**

The LLM *can* generate valid DSL JSON. The parsing works, the rendering
works, the engine is solid. But **composing visual storytelling is not
the same as generating valid JSON.**

What the LLM actually does:
1. Picks a safe gradient background (dark = dramatic, light = calm)
2. Adds a vignette effect (always)
3. Puts text at y=40% with typewriter animation (always)
4. Maybe adds speed_lines if the prompt says "dramatic" (sometimes)

What a manga artist does:
1. Decides what the READER NEEDS TO SEE at this story beat
2. Chooses a camera angle (close-up for emotion, wide for establishing)
3. Draws characters with body language that conveys the scene
4. Places speech bubbles with intentional reading flow
5. Uses panel borders, gutters, and composition to control pacing
6. Employs visual metaphor (speed lines MEAN something, not decoration)

The LLM has no visual imagination. It can't "see" the panel it's creating.
It's generating JSON keys and values, not composing art.
**Our DSL has 15+ layer types, 8 layout modes, timeline animations, cut
engines — and the LLM uses 3 of them.**

### Hypothesis 2: "Manga is a better medium for book summaries than text"

**VERDICT: Wrong for how we're doing it. Could be right if done differently.**

What we're producing is **text on a gradient with effects**. That's not
manga — it's an animated PowerPoint slide. Worse: the text is LESS
readable than a clean summary because:

- It's displayed in small panels with overflow clipping
- The typewriter animation forces the user to wait to read
- 40 panels for a 3-page resume = worse information density than the original
- The "dramatic" style inflates the content beyond recognition

A user who reads the canonical chapter summaries directly gets:
- All the key concepts, one-liners, action items
- In 30 seconds instead of 5+ minutes
- For $0 instead of $0.10
- Without hallucinated temple visits

**The manga format would add value IF we had actual visual storytelling:**
character interactions, scene composition, visual metaphors that
communicate meaning faster than words. But we don't have that.
We have text with decorative effects.

### Hypothesis 3: "Per-panel LLM calls create variety"

**VERDICT: Wrong.**

Every DSL generation call gets the same ~3,500-token system prompt.
The system prompt dominates the output pattern. The LLM converges to
the same solution every time because:

1. The prompt examples (even our new 5 examples) are the strongest signal
2. The per-panel content is ~200 tokens of variation in a ~4000-token prompt
3. Temperature 0.75-0.9 isn't enough to break out of the dominant pattern
4. JSON mode further constrains creative freedom

Evidence: 40 panels, 40 identical structures. We spent 186K tokens
on 30 LLM calls to produce the same panel 40 times.

### Hypothesis 4: "DSL is the right intermediate representation"

**VERDICT: Right idea, wrong granularity.**

DSL as a concept is excellent:
- Declarative (easy to validate, easy to render)
- Versionable (can evolve the schema without breaking old panels)
- Renderable without AI (the frontend engine is pure code)
- Composable (layers, acts, timelines)

But **having the LLM compose every pixel's position is the wrong granularity.**
The LLM shouldn't be deciding that text goes at "x: 8%, y: 40%". It should
be choosing from higher-level templates: "this is a dramatic reveal panel"
or "this is a two-character dialogue exchange."

### Hypothesis 5: "Code-rendered characters are sufficient"

**VERDICT: Wrong for manga. Right for infographics.**

`MangaCharacter` renders as a 32x32 SVG silhouette with expression marks
(sweat drops, sparkle, etc). It's a black blob. You can tell it's a person
but you can't tell WHO it is or what they FEEL.

Real manga characters have:
- Distinct visual designs (hair, clothes, body type)
- Facial expressions that carry emotional weight
- Body language and pose that tells the story
- Visual consistency across panels

Our silhouettes are interchangeable. Swapping "Alice" and "Bob" sprites
changes nothing visually. The character names label underneath are doing
all the work — which means it's still text-based storytelling.

---

## Where We're Actually Wrong (Core Failures)

### Wrong Belief #1: "More DSL features = better manga"

We keep adding DSL capabilities (data_blocks, scene_transitions,
cut layouts, effect types) thinking the LLM will use them.
**It won't.** The LLM gravitates to the simplest pattern that satisfies
the prompt. Adding more DSL types is like giving a toddler 64 crayons
when they only use 3.

The enforcement layer (Tier 2C) is a band-aid: we generate simple DSL,
then we programmatically inject sprites and bubbles. But if the code
can add the right sprites and bubbles, **why do we need the LLM at all
for this step?**

### Wrong Belief #2: "The LLM should be the visual director"

The LLM is good at:
- Understanding content and extracting meaning
- Choosing what's dramatic, funny, important
- Writing dialogue and narration
- Structuring a narrative arc

The LLM is bad at:
- Spatial composition (where things go on a 2D canvas)
- Visual rhythm (how panels flow across a page)
- Typography decisions (font sizes, line heights)
- Color theory (it just picks "dark = dramatic")

We're using the LLM for what it's BAD at (visual composition)
and underusing it for what it's GOOD at (content understanding).

### Wrong Belief #3: "Each panel needs a unique LLM-generated layout"

This is the most expensive wrong belief. We're spending 86% of tokens
generating unique DSL for each panel, and they all come out the same.

Most manga artists use **templates**:
- Splash page template (big image, title text, dramatic effect)
- Dialogue template (two characters, speech bubbles, simple background)
- Narration template (landscape panel, text overlay, mood lighting)
- Data template (structured layout, labeled items, clean typography)
- Transition template (single line, atmospheric, scene change)

The variety in manga comes from WHICH template is chosen and WHAT content
fills it, not from inventing a new layout for every panel.

---

## What Actually Works (Don't Throw Away)

| Component | Verdict | Why |
|-----------|---------|-----|
| Canonical summaries | ✅ Excellent | Structured extraction, running context, narrative state |
| Synopsis + Bible | ✅ Good | Gives downstream coherence, character consistency |
| Planner | ✅ Good concept | Content-type routing, pacing decisions, layout hints |
| DSL schema | ✅ Good design | Declarative, versionable, well-typed |
| Frontend engine | ✅ Impressive | Timeline, transitions, cut layouts, responsive |
| MangaInk primitives | ✅ Beautiful | Paper texture, screentone, ink borders — real manga feel |
| Tier 1-3 guardrails | ✅ Essential | Budget caps, enforcement, anti-hallucination |

---

## The Path Forward (3 Options)

### Option A: Template-Driven Panels (Recommended)

**Kill per-panel LLM DSL generation entirely.**

Instead:
1. **LLM picks a template** for each panel (splash/dialogue/narration/data/transition)
2. **Code fills the template** with content from the canonical summary
3. **Templates are hand-crafted** by us — guaranteed to look good

```
BEFORE (current):
  Planner → [per-panel LLM calls to generate DSL JSON] → Render
  Cost: 186K tokens, 30 API calls, identical results

AFTER (template):
  Planner → [code picks template + fills content] → Render
  Cost: 0 tokens, 0 API calls, guaranteed quality
```

The LLM's role shrinks to:
- Summarization (keep as-is — it's good)
- Planning (keep — content-type and pacing decisions are valuable)
- Dialogue writing (keep — LLM is great at this)

Token savings: **86% reduction** (186K → 0 for DSL generation)

The planner already outputs `content_type`, `layout_hint`, `visual_mood`,
`dialogue`, `character`, `expression`. That's enough info to select and
fill a template. No DSL generation LLM call needed.

### Option B: Hybrid (Template + LLM for special panels)

Use templates for 80% of panels (narration, data, dialogue, transition).
Keep LLM DSL generation ONLY for splash panels (~1-2 per manga) where
unique composition actually matters.

Token savings: **~70% reduction**

### Option C: Image Generation Focus

Accept that text-based manga doesn't work. Invest in AI image generation
(DALL-E, Flux, Midjourney API) for key panels. Use the manga bible's
character descriptions as image prompts. Keep text panels for narration
but use actual generated art for character moments.

Token savings: **Negative** (image gen is more expensive than text)
Quality improvement: **Massive** (actual visual storytelling)

---

## Recommendation

**Start with Option A (templates), add Option C (images) later.**

### Why templates first:

1. **Immediate quality improvement** — hand-crafted templates ALWAYS
   look better than LLM-composed layouts
2. **86% cost reduction** — DSL generation is the biggest expense
3. **Speed** — 318s → ~60s (no DSL generation wait)
4. **Reliability** — templates never have overlapping text or
   out-of-bounds elements
5. **The foundation already exists** — `generate_fallback_living_panel()`
   is basically a template system. It just needs to be promoted from
   "fallback" to "primary."

### What to build:

1. **5-7 panel templates** (splash, dialogue, narration, data, montage,
   transition, character-intro) — each a hand-crafted DSL with
   placeholder slots
2. **Template filler** — pure code that takes planner output +
   canonical summary and fills the template slots
3. **Template variety** — 2-3 variants per template type (different
   layouts, different moods) to prevent monotony
4. **Keep LLM for content** — summarization, planning, dialogue
   writing stay as-is

### Estimated final pipeline:

```
PDF → Parse (0 tokens)
    → Summarize chapters (12K tokens, 10 calls)
    → Synopsis + Bible (7K tokens, 2 calls)
    → Plan panels (11K tokens, 1 call)
    → Fill templates (0 tokens, 0 calls)
    → Render
    Total: ~30K tokens, 13 calls, ~$0.015
    Time: ~60 seconds
```

Compare to current: 215K tokens, 43 calls, ~$0.10, 318 seconds.

**That's 7x cheaper, 3x faster, and better looking.**

---

## TL;DR

The summarization pipeline is genuinely good. The DSL engine and
renderer are well-built. The MangaInk visual system is beautiful.

But **we're burning 86% of our tokens asking an LLM to do something
it fundamentally can't do: compose visual art.** The LLM is a writer,
not an artist. Let it write. Let hand-crafted templates handle the art.

The product isn't broken — it's mis-allocated. Move the LLM's job from
"compose every pixel" to "choose the right template and write the words,"
and suddenly everything clicks.
