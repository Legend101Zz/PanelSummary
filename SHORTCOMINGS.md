# Shortcomings, Known Issues & Planned Improvements

> Last reviewed: 2026-04-04
> These are honest notes from reading the code — not guesses.

---

## 0. Architecture & Design (Strategic)

### 0.1 The DSL is a creative canvas — the delivery mechanism is the bottleneck

**The DSL's expressiveness is the product.** The LLM should be a manga artist with full creative freedom — like building in Minecraft, where simple primitives compose into anything. The current DSL (7 layer types, cut layouts, timeline animations, effects) is the right direction.

**But the delivery is wrong.** The full DSL v2.0 spec (~1,500 tokens) is stuffed into the system prompt of *every* panel call. For 25 panels, that's 37.5K tokens just repeating the same reference card. And despite all those tokens, the LLM still produces repetitive fade-in + typewriter patterns because the spec tells it WHAT tools exist, not HOW to think creatively.

**Three delivery improvements (all preserve full expressiveness):**

**A. Prompt caching / prefix caching.** Anthropic and OpenRouter support it — the system prompt is cached after the first call, subsequent calls pay near-zero for it. This alone eliminates the 37.5K overhead while keeping the full spec available to every panel. Check if the current LLM provider supports `anthropic-beta: prompt-caching-2024-07-31` or OpenRouter's equivalent.

**B. Example-driven prompting over spec-driven.** Instead of 1,500 tokens of schema tables, include 2-3 *diverse* example panels (a dramatic splash, a quiet dialogue, a data reveal). LLMs learn patterns from examples far more effectively than from specs — and they *extrapolate creatively* from examples rather than *mechanically following* a schema. The spec becomes a compact 400-token reference card; the examples do the actual teaching.

**C. Emotion-to-technique mapping instead of feature catalog.** The current creative mandate says "think about pacing, effects, typography." A manga artist thinks: "this is a tense reveal → slow zoom, vignette, sparse dialogue, heavy screentone." Replace the generic bullet list with a mood→technique lookup:

```
TENSION  → slow timeline (6-8s), vignette, screentone, sparse text, dark palette
TRIUMPH  → fast slam-in (200ms), speed lines, impact_burst, large display font
MYSTERY  → fade-in (1200ms), halftone, particles, muted colors, whisper bubbles
HUMOR    → bounce/elastic easing, shout bubbles, SFX text, warm palette
SORROW   → very slow typewriter (60ms), no effects, desaturated, minimal layers
DATA     → stagger reveal, data_block, grid cuts, clean lines, academic colors
```

This doesn't limit the LLM — it *inspires* it. The LLM can still do anything, but now it has creative heuristics to start from.

---

### 0.2 DSL could be MORE expressive, not less

The DSL is good but has structural limits that actually *constrain* the LLM's creativity:

**A. No composable groups.** You can't nest elements or create reusable groups. A `group` layer type with `children[]` would let the LLM compose complex scenes: a "character card" group (sprite + name label + stat bars), a "conversation cluster" group (2 sprites + bubbles), etc. Composition = more creative output from fewer primitives.

**B. Closed element type enum.** `VALID_LAYER_TYPES` is a fixed set of 9. If the LLM invents `"type": "countdown_timer"` or `"type": "progress_bar"`, validation rejects it. Consider an `"unknown"` fallback that renders as a styled div with the props — graceful degradation instead of rejection. This lets the LLM experiment.

**C. No conditional/reactive layers.** The LIVING_MANGA_SYSTEM_DESIGN.md describes reader-reactive panels (scroll speed → animation speed, tap for internal monologue) but the DSL has no way to express conditions. A `"visible_if"` or `"trigger_on"` prop on layers would unlock this without a DSL redesign.

**D. No style inheritance.** Every layer specifies its own colors, fonts, opacity. A `"theme"` block at the canvas level (like CSS variables) would let the LLM define a panel's aesthetic once and have layers inherit it. Less output tokens, more consistent panels.

**E. Timeline is underutilized.** The LLM defaults to simple `opacity: [0,1]` fades. The timeline supports property animation on *any* numeric prop (`x`, `y`, `scale`, `rotation`, `fontSize`). The examples in the prompt should demonstrate choreographed multi-property animations (e.g., a sprite sliding in from x:-20% to x:15% while scaling from 0.8 to 1.0 over 800ms with spring easing).

---

### 0.3 Per-panel DSL generation kills page composition (THE #1 quality issue)

**Files:** `orchestrator.py:286-296`, `dsl_generator.py`

Panels are generated independently. A `T-shape` page with 3 panels makes 3 independent LLM calls. Panel B doesn't know what Panel A looks like.

**Why this matters for the creative canvas vision:** A manga page is a *composition*. The panels work together — a quiet close-up next to an explosive splash creates contrast. Independent generation can't produce this. It's like asking an artist to paint the left half and right half of a painting separately.

**Impact:**
- Panels on the same page feel disconnected
- Animations and timing can't coordinate (two panels might both use slow typewriter)
- No visual contrast design (adjacent panels end up with similar moods)
- 25 API calls × system prompt overhead vs. ~8 page calls

**Fix:** Generate DSL per-page. The LLM receives ALL panel assignments for that page and produces coordinated output. The `format_full_page_for_living()` function already exists in `living_panel_prompts.py:238` — it's just never called from the orchestrator.

---

### 0.4 Pipeline has too many sequential LLM calls

Current: 10 compressions → 1 synopsis → 1 bible → 1 planner → 25 DSL panels = **38 calls**

**Synopsis + Bible should be ONE call.** They use overlapping input (chapter summaries), produce complementary outputs (narrative arc + visual world), and neither depends on the other. Currently they're run in parallel (good for wall time) but could be a single structured output call (good for token efficiency — no duplicated chapter context).

**Fix:** Merge into `generate_book_analysis()` returning `{ synopsis: {...}, manga_bible: {...} }`.

Combined with per-page generation: ~10 compressions + 1 analysis + 1 plan + ~8 page DSLs = **~20 calls** (47% reduction).

---

### 0.5 No streaming — user waits for entire pipeline

The pipeline takes 2-5 minutes. User sees a progress bar but can't read anything until 100%.

**Fix:** Stream panels to MongoDB as they're generated. Frontend polls for new panels incrementally. User starts reading chapter 1 while chapter 5 generates. Each `LivingPanelDoc` is already an independent document — the architecture supports this today.

---

## 1. Token Waste (Cost Optimization)

These are all about reducing cost WITHOUT reducing the creative canvas.

### 1.1 Full manga bible sent to every panel call (~14K wasted tokens)

**File:** `dsl_generator.py:133-137`

Every panel gets world description + top 3 characters (~800-1000 tokens), even narration/data/concept panels that have no character. Only ~30% of panels feature named characters.

**Fix:** Only inject character block when `assignment.character is not None`. Always pass a one-line world description (~50 tokens) for mood context.

**Savings:** ~14K tokens/book

---

### 1.2 Creative direction sent twice per panel (~5K wasted)

**File:** `dsl_generator.py:129-131`

The planner writes `creative_direction` into `PanelAssignment`. The context builder then injects it again as a separate `=== CREATIVE DIRECTION ===` section. The LLM sees it twice.

**Fix:** Remove the re-injection block. It's already in the assignment.

**Savings:** ~5K tokens/book

---

### 1.3 Adjacent panel context provides weak value (~6.25K wasted)

**File:** `orchestrator.py:391-418`

Each panel gets ~250 tokens describing previous/next panel type, mood, layout. But since panels generate independently, this doesn't actually produce coordination — it just adds tokens. Per-page generation (0.3) makes this entirely unnecessary.

**Fix:** Remove. Per-page generation replaces this with real composition.

**Savings:** ~6.25K tokens/book

---

### 1.4 Synopsis agent gets over-detailed chapter input (~2K wasted)

**File:** `stage_book_synopsis.py`

`format_all_summaries_for_synopsis()` includes `narrative_summary` (300 chars each) for every chapter. The synopsis agent only needs one-liners and key concepts to find the thesis.

**Fix:** Pass only `title`, `one_liner`, `key_concepts`.

**Savings:** ~2K tokens/book

---

### 1.5 Two duplicate DSL system prompts exist

**Files:** `dsl_generator.py:28-99` (DSL_AGENT_SYSTEM_PROMPT) and `living_panel_prompts.py:55-176` (get_living_panel_prompt)

Two versions of essentially the same prompt. The `living_panel_prompts.py` version is more detailed (~2K tokens), style-aware, and better structured. The `dsl_generator.py` version (~1.5K tokens) is what actually gets used by the orchestrator. This creates drift — improvements to one don't reach the other.

**Fix:** Single source of truth. Delete DSL_AGENT_SYSTEM_PROMPT and have `dsl_generator.py` import from `living_panel_prompts.py`. The style parameter is already available in the orchestrator.

---

### Token waste summary

| Source | Tokens wasted/book |
|--------|-------------------|
| System prompt repeated 25× (no caching) | 37,500 |
| Full bible to every panel (1.1) | 14,000 |
| Adjacent panel context (1.3) | 6,250 |
| Creative direction duplication (1.2) | 5,000 |
| Synopsis over-context (1.4) | 2,000 |
| **Addressable total** | **~64,750** |

With prompt caching (0.1A), the 37.5K drops to near-zero. With per-page generation (0.3), call count drops from 25 to ~8, amplifying all per-call savings.

---

## 2. Quality & Creativity Issues

### 2.1 LLM produces repetitive panel patterns

Despite the rich DSL, most generated panels follow the same formula: gradient background → typewriter text → fade-in sprite. The creative mandate section is too generic ("think about pacing, effects, typography") to inspire variety.

**Root causes:**
- No mood→technique examples in the prompt (see 0.1C)
- No diverse reference panels showing what "creative" looks like
- Temperature fixed at 0.85 for all panels (see 2.4)
- No negative examples ("DON'T just put text on a gradient — that's the fallback's job")

**Fix:** Add 2-3 diverse example panels to the system prompt (or better, use few-shot examples in the user message). Include one dramatic splash with speed_lines + SFX + impact_burst, one moody dialogue with cut layout + screentone, one data panel with stagger animation + particles. Show the LLM what *great* looks like.

---

### 2.2 Fallback DSL ignores page layout

**File:** `generate_living_panels.py:246`

Fallback always uses `"layout": {"type": "full"}`. Panels in a `T-shape` or `grid-2x2` page get the wrong layout.

**Fix:** Pass parent page layout to fallback generator.

---

### 2.3 Speech bubbles overlap with 3+ dialogue lines

**File:** `generate_living_panels.py:314-334`

Positioning formula (`y: 8 + i*10%`) creates overlaps with 3+ lines on mobile.

**Fix:** Cap at 2 lines per act, use multiple acts for longer conversations.

---

### 2.4 Temperature fixed across all panel types

**File:** `dsl_generator.py:168`

All panels use `temperature=0.85`. Splash panels (dramatic creative moments) could benefit from 0.9. Data panels need precision at 0.6.

**Fix:**
```python
temp_map = {"splash": 0.9, "dialogue": 0.75, "narration": 0.7, "data": 0.6, "montage": 0.85, "concept": 0.9}
```

---

### 2.5 No act count limit in prompt

**File:** `living_panel_prompts.py`

LLM sometimes generates 8+ acts (30+ seconds of tapping). 1-3 acts is the right range.

Note: `dsl_generator.py:96` says "1-3 acts" but `living_panel_prompts.py` doesn't cap it. Need consistency.

---

### 2.6 No coherence between consecutive chapters

**File:** `orchestrator.py`

Each chapter's panels are generated without context about how the previous chapter ended. No visual continuity.

**Fix:** Pass a one-sentence "previous chapter ended with [narrative_beat]" to the first panel of each chapter.

---

## 3. Reliability Issues

### 3.1 Bible chapter plans may not cover all chapters

**File:** `stage_manga_planner.py` → `_ensure_all_chapters_covered()`

Fallback assigns `mood: "reflective"` to every missing chapter — correct but boring.

**Fix:** Pass exact chapter count and indices as a numbered checklist in the prompt.

---

### 3.2 Synopsis and Bible failures are silent

**File:** `celery_worker.py`

If either fails, pipeline continues with empty dicts. Quality degrades with no user indication.

**Fix:** Track `bible_used: bool` in summary doc, surface as warning badge in frontend.

---

### 3.3 No retry budget tracking across agents

**File:** `celery_worker.py`, `llm_client.py`

Token/cost tracking is partially implemented — manga and reel stages don't accumulate into the summary doc's cost fields. Cost summary is always zeros.

**Fix:** Return actual token counts from `chat_with_retry` and accumulate across all stages.

---

### 3.4 CutLayoutEngine angles are random, not seeded

**File:** `frontend/components/LivingPanel/CutLayoutEngine.tsx`

`Math.random()` causes layout shift on re-render.

**Fix:** Seed from `panel_id + page_index`.

---

## 4. Image Generation

### 4.1 Image budget is global, not distributed

**File:** `image_generator.py`

First 4 eligible splash panels get images. Chapters 5-10 never get images.

**Fix:** Pick most dramatic chapter per narrative act (~25%, 50%, 75%, 100% position) or use bible's `dramatic_beat` to score.

---

### 4.2 Failed image generation is silent

No retry, no fallback model, no failure count reported.

**Fix:** Primary → retry → fallback model. Report `failed_images`.

---

## 5. Frontend

### 5.1 Legacy panel format adapter uses wrong visual moods

**File:** `frontend/components/MangaReader.tsx`

All legacy panels get `dramatic-dark`. Old panel types lose their visual treatment.

---

### 5.2 Reel generation uses stale API key from store

Needs inline key input in REELS flow.

---

### 5.3 No progress indicator between acts

User doesn't know when to tap. Needs "playing / ready" indicator.

---

## 6. Infrastructure

### 6.1 No job timeout on hung Celery tasks

Hung LLM calls leave tasks in "progress" forever.

**Fix:** `task_soft_time_limit=600`, `task_time_limit=700`.

---

### 6.2 Storage directory not checked on startup

Silent failure if `storage/` doesn't exist.

---

## Priority Ranking

| Priority | Issue | Why | Effort |
|----------|-------|-----|--------|
| **P0** | Per-page DSL generation (0.3) | Quality + cost + speed — single biggest impact | Medium |
| **P1** | Prompt caching (0.1A) | 37.5K tokens/book saved, zero code change if provider supports it | Low |
| **P2** | Example-driven prompting (0.1B) | Better creative output, naturally compresses spec | Medium |
| **P3** | Emotion→technique mapping (0.1C) | Breaks repetitive panel syndrome | Low |
| **P4** | Merge synopsis+bible call (0.4) | 1 fewer call + less context duplication | Medium |
| **P5** | Conditionalize bible injection (1.1) | 14K tokens/book saved | Low |
| **P6** | Remove creative direction dupe (1.2) | 5K tokens/book saved | Very low |
| **P7** | Remove adjacent panel context (1.3) | 6.25K tokens/book saved (redundant with P0) | Very low |
| **P8** | Add diverse few-shot examples (2.1) | Directly improves panel variety | Medium |
| **P9** | Composable groups in DSL (0.2A) | Unlocks complex compositions | Medium-High |
| **P10** | Style inheritance / theme block (0.2D) | Less output tokens, more consistent panels | Medium |
| **P11** | Temperature mapping (2.4) | Better quality at zero cost | Very low |
| **P12** | Streaming to frontend (0.5) | UX — user reads while generating | High |
| **P13** | Image budget distribution (4.1) | Quality — even coverage | Low |
| **P14** | Single DSL prompt source (1.5) | Prevents drift, easier to improve | Low |
| **P15** | Job timeout (6.1) | Reliability | Low |

**P0-P3 together: fewer calls, cheaper calls, better creative output. The DSL stays fully expressive.**


Prompt caching in open-router:

***

title: Prompt Caching
subtitle: Cache prompt messages
headline: Prompt Caching | Reduce AI Model Costs with OpenRouter
canonical-url: '[https://openrouter.ai/docs/guides/best-practices/prompt-caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching)'
'og:site\_name': OpenRouter Documentation
'og:title': Prompt Caching - Optimize AI Model Costs with Smart Caching
'og:description': >-
Reduce your AI model costs with OpenRouter's prompt caching feature. Learn how
to cache and reuse responses across OpenAI, Anthropic Claude, and DeepSeek
models.
'og:image':
type: url
value: >-
[https://openrouter.ai/dynamic-og?title=Prompt%20Caching\&description=Optimize%20AI%20model%20costs%20with%20OpenRouter](https://openrouter.ai/dynamic-og?title=Prompt%20Caching\&description=Optimize%20AI%20model%20costs%20with%20OpenRouter)
'og:image:width': 1200
'og:image:height': 630
'twitter:card': summary\_large\_image
'twitter:site': '@OpenRouter'
noindex: false
nofollow: false
---------------

To save on inference costs, you can enable prompt caching on supported providers and models.

Most providers automatically enable prompt caching, but note that some (see Anthropic below) require you to enable it on a per-message basis.

When using caching (whether automatically in supported models, or via the `cache_control` property), OpenRouter uses provider sticky routing to maximize cache hits — see [Provider Sticky Routing](#provider-sticky-routing) below for details.

## Provider Sticky Routing

To maximize cache hit rates, OpenRouter uses **provider sticky routing** to route your subsequent requests to the same provider endpoint after a cached request. This works automatically with both implicit caching (e.g. OpenAI, DeepSeek, Gemini 2.5) and explicit caching (e.g. Anthropic `cache_control` breakpoints).

**How it works:**

* After a request that uses prompt caching, OpenRouter remembers which provider served your request.
* Subsequent requests for the same model are routed to the same provider, keeping your cache warm.
* Sticky routing only activates when the provider's cache read pricing is cheaper than regular prompt pricing, ensuring you always benefit from cost savings.
* If the sticky provider becomes unavailable, OpenRouter automatically falls back to the next-best provider.
* Sticky routing is not used when you specify a manual [provider order](/docs/api-reference/provider-preferences) via `provider.order` — in that case, your explicit ordering takes priority.

**Sticky routing granularity:**

Sticky routing is tracked at the account level, per model, and per conversation. OpenRouter identifies conversations by hashing the first system (or developer) message and the first non-system message in each request, so requests that share the same opening messages are routed to the same provider. This means different conversations naturally stick to different providers, improving load-balancing and throughput while keeping caches warm within each conversation.

## Inspecting cache usage

To see how much caching saved on each generation, you can:

1. Click the detail button on the [Activity](/activity) page
2. Use the `/api/v1/generation` API, [documented here](/docs/api/api-reference/generations/get-generation)
3. Check the `prompt_tokens_details` object in the [usage response](/docs/guides/administration/usage-accounting) included with every API response

The `cache_discount` field in the response body will tell you how much the response saved on cache usage. Some providers, like Anthropic, will have a negative discount on cache writes, but a positive discount (which reduces total cost) on cache reads.

### Usage object fields

The usage object in API responses includes detailed cache metrics in the `prompt_tokens_details` field:

```json
{
  "usage": {
    "prompt_tokens": 10339,
    "completion_tokens": 60,
    "total_tokens": 10399,
    "prompt_tokens_details": {
      "cached_tokens": 10318,
      "cache_write_tokens": 0
    }
  }
}
```

The key fields are:

* `cached_tokens`: Number of tokens read from the cache (cache hit). When this is greater than zero, you're benefiting from cached content.
* `cache_write_tokens`: Number of tokens written to the cache. This appears on the first request when establishing a new cache entry.

## OpenAI

Caching price changes:

* **Cache writes**: no cost
* **Cache reads**: (depending on the model) charged at 0.25x or 0.50x the price of the original input pricing

[Click here to view OpenAI's cache pricing per model.](https://platform.openai.com/docs/pricing)

Prompt caching with OpenAI is automated and does not require any additional configuration. There is a minimum prompt size of 1024 tokens.

[Click here to read more about OpenAI prompt caching and its limitation.](https://platform.openai.com/docs/guides/prompt-caching)

## Grok

Caching price changes:

* **Cache writes**: no cost
* **Cache reads**: charged at {GROK_CACHE_READ_MULTIPLIER}x the price of the original input pricing

[Click here to view Grok's cache pricing per model.](https://docs.x.ai/docs/models#models-and-pricing)

Prompt caching with Grok is automated and does not require any additional configuration.

## Moonshot AI

Caching price changes:

* **Cache writes**: no cost
* **Cache reads**: charged at {MOONSHOT_CACHE_READ_MULTIPLIER}x the price of the original input pricing

Prompt caching with Moonshot AI is automated and does not require any additional configuration.

## Groq

Caching price changes:

* **Cache writes**: no cost
* **Cache reads**: charged at {GROQ_CACHE_READ_MULTIPLIER}x the price of the original input pricing

Prompt caching with Groq is automated and does not require any additional configuration. Currently available on Kimi K2 models.

[Click here to view Groq's documentation.](https://console.groq.com/docs/prompt-caching)

## Anthropic Claude

Caching price changes:

* **Cache writes (5-minute TTL)**: charged at {ANTHROPIC_CACHE_WRITE_MULTIPLIER}x the price of the original input pricing
* **Cache writes (1-hour TTL)**: charged at 2x the price of the original input pricing
* **Cache reads**: charged at {ANTHROPIC_CACHE_READ_MULTIPLIER}x the price of the original input pricing

There are two ways to enable prompt caching with Anthropic:

* **Automatic caching**: Add a single `cache_control` field at the top level of your request. The system automatically applies the cache breakpoint to the last cacheable block and advances it forward as conversations grow. Best for multi-turn conversations.
* **Explicit cache breakpoints**: Place `cache_control` directly on individual content blocks for fine-grained control over exactly what gets cached. There is a limit of four explicit breakpoints. It is recommended to reserve the cache breakpoints for large bodies of text, such as character cards, CSV data, RAG data, book chapters, etc.

<Note>
  **Automatic caching** (top-level `cache_control`) is only supported when requests are routed to the **Anthropic** provider directly. Amazon Bedrock and Google Vertex AI currently do not support top-level `cache_control` — when it is present, OpenRouter will only route to the Anthropic provider and exclude Bedrock and Vertex endpoints. Explicit per-block `cache_control` breakpoints work across all Anthropic-compatible providers including Bedrock and Vertex.
</Note>

By default, the cache expires after 5 minutes, but you can extend this to 1 hour by specifying `"ttl": "1h"` in the `cache_control` object.

[Click here to read more about Anthropic prompt caching and its limitation.](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

### Supported models

The following Claude models support prompt caching (both automatic and explicit):

* Claude Opus 4.6
* Claude Opus 4.5
* Claude Opus 4.1
* Claude Opus 4
* Claude Sonnet 4.6
* Claude Sonnet 4.5
* Claude Sonnet 4
* Claude Sonnet 3.7 (deprecated)
* Claude Haiku 4.5
* Claude Haiku 3.5

### Minimum token requirements

Each model has a minimum cacheable prompt length:

* **4096 tokens**: Claude Opus 4.6, Claude Opus 4.5, Claude Haiku 4.5
* **2048 tokens**: Claude Sonnet 4.6, Claude Haiku 3.5
* **1024 tokens**: Claude Sonnet 4.5, Claude Opus 4.1, Claude Opus 4, Claude Sonnet 4, Claude Sonnet 3.7

Prompts shorter than these minimums will not be cached.

### Cache TTL Options

OpenRouter supports two cache TTL values for Anthropic:

* **5 minutes** (default): `"cache_control": { "type": "ephemeral" }`
* **1 hour**: `"cache_control": { "type": "ephemeral", "ttl": "1h" }`

The 1-hour TTL is useful for longer sessions where you want to maintain cached content across multiple requests without incurring repeated cache write costs. The 1-hour TTL costs more for cache writes (2x base input price vs 1.25x for 5-minute TTL) but can save money over extended sessions by avoiding repeated cache writes. The 1-hour TTL for explicit cache breakpoints is supported across all Claude model providers (Anthropic, Amazon Bedrock, and Google Vertex AI).

### Examples

#### Automatic caching (recommended for multi-turn conversations)

With automatic caching, add `cache_control` at the top level of the request. The system automatically caches all content up to the last cacheable block:

```json
{
  "model": "anthropic/claude-sonnet-4.6",
  "cache_control": { "type": "ephemeral" },
  "messages": [
    {
      "role": "system",
      "content": "You are a historian studying the fall of the Roman Empire. You know the following book very well: HUGE TEXT BODY"
    },
    {
      "role": "user",
      "content": "What triggered the collapse?"
    }
  ]
}
```

As the conversation grows, the cache breakpoint automatically advances to cover the growing message history.

Automatic caching with 1-hour TTL:

```json
{
  "model": "anthropic/claude-sonnet-4.6",
  "cache_control": { "type": "ephemeral", "ttl": "1h" },
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "What is the meaning of life?"
    }
  ]
}
```

#### Explicit cache breakpoints (fine-grained control)

System message caching example (default 5-minute TTL):

```json
{
  "messages": [
    {
      "role": "system",
      "content": [
        {
          "type": "text",
          "text": "You are a historian studying the fall of the Roman Empire. You know the following book very well:"
        },
        {
          "type": "text",
          "text": "HUGE TEXT BODY",
          "cache_control": {
            "type": "ephemeral"
          }
        }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What triggered the collapse?"
        }
      ]
    }
  ]
}
```

User message caching example with 1-hour TTL:

```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Given the book below:"
        },
        {
          "type": "text",
          "text": "HUGE TEXT BODY",
          "cache_control": {
            "type": "ephemeral",
            "ttl": "1h"
          }
        },
        {
          "type": "text",
          "text": "Name all the characters in the above book"
        }
      ]
    }
  ]
}
```

## DeepSeek

Caching price changes:

* **Cache writes**: charged at the same price as the original input pricing
* **Cache reads**: charged at {DEEPSEEK_CACHE_READ_MULTIPLIER}x the price of the original input pricing

Prompt caching with DeepSeek is automated and does not require any additional configuration.

## Google Gemini

### Implicit Caching

Gemini 2.5 Pro and 2.5 Flash models now support **implicit caching**, providing automatic caching functionality similar to OpenAI’s automatic caching. Implicit caching works seamlessly — no manual setup or additional `cache_control` breakpoints required.

Pricing Changes:

* No cache write or storage costs.
* Cached tokens are charged at {GOOGLE_CACHE_READ_MULTIPLIER}x the original input token cost.

Note that the TTL is on average 3-5 minutes, but will vary. There is a minimum of {GOOGLE_CACHE_MIN_TOKENS_2_5_FLASH} tokens for Gemini 2.5 Flash, and {GOOGLE_CACHE_MIN_TOKENS_2_5_PRO} tokens for Gemini 2.5 Pro for requests to be eligible for caching.

[Official announcement from Google](https://developers.googleblog.com/en/gemini-2-5-models-now-support-implicit-caching/)

<Tip>
  To maximize implicit cache hits, keep the initial portion of your message
  arrays consistent between requests. Push variations (such as user questions or
  dynamic context elements) toward the end of your prompt/requests.
</Tip>

### Pricing Changes for Cached Requests:

* **Cache Writes:** Charged at the input token cost plus 5 minutes of cache storage, calculated as follows:

```
Cache write cost = Input token price + (Cache storage price × (5 minutes / 60 minutes))
```

* **Cache Reads:** Charged at {GOOGLE_CACHE_READ_MULTIPLIER}× the original input token cost.

### Supported Models and Limitations:

Only certain Gemini models support caching. Please consult Google's [Gemini API Pricing Documentation](https://ai.google.dev/gemini-api/docs/pricing) for the most current details.

Cache Writes have a 5 minute Time-to-Live (TTL) that does not update. After 5 minutes, the cache expires and a new cache must be written.

Gemini models have typically have a 4096 token minimum for cache write to occur. Cached tokens count towards the model's maximum token usage. Gemini 2.5 Pro has a minimum of {GOOGLE_CACHE_MIN_TOKENS_2_5_PRO} tokens, and Gemini 2.5 Flash has a minimum of {GOOGLE_CACHE_MIN_TOKENS_2_5_FLASH} tokens.

### How Gemini Prompt Caching works on OpenRouter:

OpenRouter simplifies Gemini cache management, abstracting away complexities:

* You **do not** need to manually create, update, or delete caches.
* You **do not** need to manage cache names or TTL explicitly.

### How to Enable Gemini Prompt Caching:

Gemini caching in OpenRouter requires you to insert `cache_control` breakpoints explicitly within message content, similar to Anthropic. We recommend using caching primarily for large content pieces (such as CSV files, lengthy character cards, retrieval augmented generation (RAG) data, or extensive textual sources).

<Tip>
  There is not a limit on the number of `cache_control` breakpoints you can
  include in your request. OpenRouter will use only the last breakpoint for
  Gemini caching. Including multiple breakpoints is safe and can help maintain
  compatibility with Anthropic, but only the final one will be used for Gemini.
</Tip>

### Examples:

#### System Message Caching Example

```json
{
  "messages": [
    {
      "role": "system",
      "content": [
        {
          "type": "text",
          "text": "You are a historian studying the fall of the Roman Empire. Below is an extensive reference book:"
        },
        {
          "type": "text",
          "text": "HUGE TEXT BODY HERE",
          "cache_control": {
            "type": "ephemeral"
          }
        }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What triggered the collapse?"
        }
      ]
    }
  ]
}
```

#### User Message Caching Example

```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Based on the book text below:"
        },
        {
          "type": "text",
          "text": "HUGE TEXT BODY HERE",
          "cache_control": {
            "type": "ephemeral"
          }
        },
        {
          "type": "text",
          "text": "List all main characters mentioned in the text above."
        }
      ]
    }
  ]
}
```

