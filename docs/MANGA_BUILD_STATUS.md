# Manga Creation System — Phase 1–7 + 10 Build Status

**Last updated:** 2026-05-04 (Phase 7 + Phase 10 + UI refactor pass)
**Companion plan:** `MANGA_CREATION_SYSTEM_REVIEW_AND_PLAN.md` (the 6-doc deep-dive)

This file is the single-page progress/status view for the rebuild that
follows the deep-dive plan. The deep-dive plan slices the rebuild into
small, well-defined pieces; this file tracks **what's actually been
shipped** so the next session knows exactly where to pick up.

---

## TL;DR

| Phase | Theme | Status |
| --- | --- | --- |
| 1 | LLM-authored Adaptation Plan + Character Bible | ✅ shipped, locked |
| 2 | Source-fact extraction + first quality gate | ✅ shipped |
| 3 | Character art-direction (LLM authored) + library idempotency | ✅ shipped |
| 4 | **Multimodal panel rendering** (sprite-conditioned image gen) | ✅ shipped |
| 4.1 | Front-end V4 painted-panel layer + text scrim | ✅ shipped |
| 7 | **Storyboarder character precision** (full character_ids end-to-end) | ✅ shipped |
| 10 | **Panel-level structural quality gate** | ✅ shipped |
| UI | Targeted refactor pass (DRY + size budget) | 🟡 partial — see audit |

Test count went from **332 → 366 → 381** (+15 across Phase 7 + 10).
No regressions. Front-end `tsc --noEmit` clean.

---

## Phase 4 — what landed

The user's exact ask: _"the manga we generate is what I would say very
average... characters we generate like the sprite are not good even when we
have the capability to generate using image models — not the whole panels
as that would be costly but characters and develop a mechanism so we can
use these nicely and then we have our panel designed."_

We did exactly that. Here is the new pipeline shape:

```
                     ┌──────────────────────────────────┐
                     │ book_understanding (book level)  │
                     │  ├ synopsis                      │
                     │  ├ adaptation_plan               │
                     │  ├ character_world_bible         │
                     │  └ character_art_direction (LLM) │  ← Phase 3
                     │                                  │
                     │ ensure_book_character_sheets     │
                     │  → MangaAssetDoc per character   │  ← Phase 3
                     └───────────────┬──────────────────┘
                                     │
                                     ▼
        ┌────────────────────────────────────────────────────────────┐
        │ per-slice pipeline (build_v2_generation_stages)            │
        │                                                            │
        │  fact_extraction → adaptation_plan (read-through)         │
        │   → character_bible (read-through)                         │
        │   → beat_sheet → manga_script → storyboard                 │
        │   → DSL validation × 2  (with quality_repair between)      │
        │   → character_asset_plan_stage (uses art_direction)        │
        │   → storyboard_to_v4_stage                                 │
        │   → panel_rendering_stage (NEW, Phase 4)                   │
        └────────────────────────────────────────────────────────────┘
```

### New module: `services/manga/panel_rendering_service.py`

Composes a per-panel prompt mechanically (no LLM call at this layer — the
LLM has authored everything upstream) and dispatches to the **multimodal**
image model with the relevant character reference sheets attached as
`image_url` parts. Concurrency is bounded with a semaphore so OpenRouter
rate limits are respected.

Public API:

* `build_panel_prompt(panel, bible, art_direction, style)` — composes
  storyboard intent + art-direction recipes + bible visual_lock into one
  prompt. Pure, testable.
* `select_reference_paths_for_characters(...)` — prefers `reference_sheet`
  over `expression`; deterministic.
* `render_pages(pages, ..., panel_renderer=...)` — orchestrates the call,
  mutates pages in place to set `image_path` and `image_aspect_ratio`,
  returns a structured `PageRenderingSummary`.

### New helper: `image_generator.generate_image_with_references`

OpenRouter chat-completions call with `modalities=["image","text"]` and
**multiple `image_url` parts** (one per character reference). Validates
the image model is on the multimodal allow-list (Gemini family today);
fails loudly if a reference path is missing.

### New stage: `manga_pipeline/stages/panel_rendering_stage.py`

Strict — requires `image_api_key` in `context.options`; if every panel
fails it raises rather than persist text-only pages. The orchestrator
decides whether to schedule this stage at all (toggled by `with_panel_rendering`
in `build_v2_generation_stages`).

### Schema additions

* `V4Panel.image_path` / `V4Panel.image_aspect_ratio` (stable JSON keys; the
  front-end reads these to render the painted panel under the dialogue
  layer).
* `PipelineContext.art_direction` so the per-slice stages can read the
  book-level art direction the LLM authored once.

### Aspect ratio per panel role

Mechanical mapping (no LLM round-trip needed):

| Panel type | Ratio | Why |
| --- | --- | --- |
| splash / title / transition | 2:3 | tall hero framing |
| dialogue / narration | 1:1 | tight close-ups |
| concept / montage / data | 3:2 | wider for cognitive density |

### Tests added (17 new, all green)

`tests/test_panel_rendering_service_v2.py` covers:

* aspect ratio mapping (incl. unmapped-type default)
* asset lookup grouping (by character then by asset_type)
* reference selection (prefer reference_sheet, fall back to expression,
  skip unknown characters, dedupe repeated character_ids)
* prompt composition (visual_lock appended; art-direction recipe surfaces;
  unknown characters degrade gracefully; works with no art direction)
* render path sanitisation
* `render_pages` happy path (mutates panels, attaches references)
* failure isolation (one panel failure doesn't kill the page)
* explicit `image_api_key` requirement

---

## Strict invariants now enforced

1. **No silent regeneration.** `ensure_book_character_sheets` is idempotent
   keyed by planner-stable `asset_id`.
2. **No silent visual drift.** Bible `visual_lock` is mechanically appended
   to every asset prompt AND every panel prompt — defense in depth.
3. **No silent fallback to text-only.** `panel_rendering_stage` raises if
   every panel fails; partial failures are logged with structured per-panel
   results.
4. **No silent multimodal misuse.** `generate_image_with_references` rejects
   non-Gemini models because they would drop the references and produce a
   panel that ignores the character library.
5. **Orchestration over branching.** Whether to render panels is decided
   in one place (the stage list), not via in-stage `if`s.

---

## What's next (Phase 5+ candidates)

Pick from the deep-dive plan:

* **Phase 7 storyboarder upgrade** — ✅ **shipped**. See section below.
* **Phase 10 panel-level quality gate** — ✅ **shipped (structural cut)**. See
  section below. The vision-based check ("does the painted panel actually
  contain the right characters?") is deferred to Phase 11 where it belongs.
* **Frontend V4 upgrade (Phase 11)** — ✅ **shipped**. The viewer now
  layers `image_path` as a panel backdrop with a bottom-aligned text scrim
  for legibility, and suppresses the redundant synthetic placeholder
  avatars when painted art is present.

When picking the next phase, run `pytest -q` first to confirm 381 still
pass; that's the green baseline you're starting from.

---

## Phase 7 — storyboarder character precision (shipped)

**The bug we found.** `services/manga/panel_rendering_service.py` reads
`panel["character_ids"]` to decide which character reference sheets to
attach to the multimodal call. But `V4Panel.to_dict()` only wrote the
legacy singular `character` field. So in production the renderer was
attaching **zero or one** reference sheet per panel — the secondary
speaker in a two-character dialogue panel had no conditioning, which is
exactly the "sometimes the character is off-model" symptom you described.

**The fix has four touch-points, all small:**

1. **`StoryboardPanel` validator** auto-includes every dialogue speaker in
   `character_ids`. Speaking implies presence; if the LLM forgets to list a
   speaker, the validator deterministically adds them. No reliance on
   model self-discipline.
2. **Storyboard system prompt** now spells out the contract: `character_ids`
   means *visually present*, not *mentioned by name*. Every id must match a
   character_id in the bible. The renderer auto-adds speakers; the LLM
   only needs to add silent on-stage characters.
3. **`V4Panel.character_ids: list[str]`** is a real field with stable JSON
   serialization. `to_dict()` writes it; `validate_v4_panel()` parses it.
4. **`storyboard_page_to_v4`** forwards `panel.character_ids` end-to-end
   instead of computing only the primary speaker.

**Frontend.** `V4Panel` TypeScript type gets the new `character_ids?: string[]`
field. Rendering does not consume it yet (the painted panel image already
does the right thing now that the renderer sees the full list); we expose
it for future viewer features (e.g. "who's in this panel" tooltip).

**Tests added (5).** `test_panel_quality_gate_stage_v2.py` (the file is
shared with Phase 10 because the data flow is shared) covers:

* dialogue speakers auto-merge into `character_ids`
* explicitly-listed silent characters survive the merge
* duplicate speakers are deduped, order preserved
* `storyboard_to_v4` forwards the full list
* `validate_v4_panel` round-trips the list through JSON

**DRY win.** `frontend/components/V4Engine/assetLookup.ts` consolidates the
`normalizeAssetKey` + `findAssetForCharacter` helpers that were duplicated
in `V4PanelRenderer.tsx` and `panels/DialoguePanel.tsx`. If one copy had
drifted (different whitespace handling, say) we'd have shipped
inconsistent character matching between dialogue bubbles and panel
backdrops without noticing.

---

## Phase 10 — panel-level structural quality gate (shipped)

**Scope of this cut.** A *structural* check, not a vision check. It runs
immediately after `panel_rendering_stage` and walks `context.v4_pages`
plus the renderer's `panel_rendering_summary` to surface defects we can
see deterministically from the artifacts in hand. Vision-based
verification ("does the painted character look like the bible reference?")
is a Phase 11 problem and is intentionally **not** in this stage — mixing
the two would conflate "renderer wired wrong" with "image model drifted."

**New module.** `manga_pipeline/stages/panel_quality_gate_stage.py`

* Pure functions for issue evaluation (`_evaluate_panel`,
  `evaluate_v4_pages`) so they're trivially testable without I/O.
* Issues are **merged into the same `QualityReport`** the upstream
  `quality_gate_stage` produced — no parallel report type.
* No-op when `panel_rendering_stage` was not scheduled (image gen off);
  the orchestrator can include it unconditionally.
* The gate **never re-renders** — it can only flag.

**Issue codes:**

| code | severity | meaning |
| --- | --- | --- |
| `panel_unknown_character` | error | `character_ids` references a character not in the bible (storyboarder hallucination — renderer could never have found a sheet) |
| `panel_no_reference_attached` | warning | panel claimed visible characters but renderer attached zero reference sheets (painted character will drift) |
| `panel_failed_but_has_path` | error | renderer reported failure yet `image_path` is set (persistence-layer bug) |
| `panel_rendered_without_path` | error | renderer reported success but `image_path` is missing (persistence-layer bug) |

**Pipeline wiring.** `build_v2_generation_stages(with_panel_rendering=True)`
now returns `... → storyboard_to_v4 → panel_rendering → panel_quality_gate`.
The condition is single-source-of-truth: the gate is added in the same
`if with_panel_rendering` branch as the renderer, so it is impossible to
schedule one without the other.

**Tests added (10).** Pure-function tests for each issue code, the
renderer-summary-absent no-op, the report merge into an existing report,
and pipeline-wiring assertions for both `with_panel_rendering=True/False`.

---

## UI architecture audit — honest answer

**Short answer: it's improving but not all the way there.** Here is the
actual line-count receipt for the largest `.tsx` files (after this
session's refactor):

| file | lines | budget | verdict |
| --- | ---: | ---: | --- |
| `app/video-reels/page.tsx` | 656 | 600 | ❌ over budget; one big `VideoReelsContent` |
| `components/ReelVideoPlayer/dsl-engine/LayerRenderer.tsx` | 614 | 600 | ❌ over; legitimately complex but split-able |
| `components/LivingPanel/MangaInk.tsx` | 600 | 600 | 🟡 right at the line |
| `components/HomePage/AttentionGame.tsx` | 587 | 600 | 🟡 close |
| `components/MangaReader.tsx` | 519 | 600 | ✅ ok |
| `components/HomePage/MangaPivotSection.tsx` | 509 | 600 | ✅ ok |
| `components/LivingPanel/LivingPanelEngine.tsx` | 508 | 600 | ✅ ok |
| `components/ModelSelector.tsx` | 483 | 600 | ✅ ok |
| `app/books/[id]/page.tsx` | **373** (was 747) | 600 | ✅ ok after this session |
| `components/GeneratePanel.tsx` | **423** (new) | 600 | ✅ ok |

**What we just did this session:**

1. **Extracted `GeneratePanel` from `app/books/[id]/page.tsx`** (747 → 373).
   The page route now does what a route should: fetch + compose. The
   complex provider/key/style/engine/range form lives in a feature
   component under `components/`.
2. **Pruned `app/books/[id]/page.tsx` imports** that came along with the
   removed `GeneratePanel` (Lock, EyeOff, ImageIcon, ModelSelector,
   PipelineTracker, LogFeed, LargePdfWarning, etc.) — dead-code free.
3. **Created `frontend/components/V4Engine/assetLookup.ts`** to dedupe the
   character-asset lookup that lived in two files with identical
   normalization rules.

**What still owes work (recommended order):**

1. **`app/video-reels/page.tsx` (656).** Same shape as the old
   `app/books/[id]/page.tsx`: a route file containing one giant
   `VideoReelsContent`. Apply the same recipe: extract feed/grid/filter
   pieces into `components/VideoReels/`. Estimate: ~2 hours.
2. **`LayerRenderer.tsx` (614).** This is the reel-engine layer dispatcher.
   It almost certainly has one switch over `layer.type` that begs to be a
   strategy map (`Record<LayerType, LayerRendererFn>`) with each strategy
   in its own file under `dsl-engine/layers/`. SOLID open/closed wins.
   Estimate: ~3 hours.
3. **`MangaInk.tsx` (600).** Right at the line; the ink renderer has
   distinct concerns (palette decisions, brush strokes, page composition)
   that could split. Lower priority because cohesion is genuinely high.
4. **`AttentionGame.tsx` (587).** Home-page mini-game; same story — close
   to the line, cohesive enough that splitting purely to hit a number
   would be the kind of "aesthetic refactor" the Zen of Python warns
   against. Defer unless touching it for product reasons.

**Architectural hygiene that is already good:**

* Single `lib/api.ts` for all backend calls (clean axios layer with one
  interceptor for errors).
* Typed everything (`tsc --noEmit` returns clean output — no `any`-soup).
* `lib/store.ts` is a thin Zustand store; no fat reducers.
* The V4 engine is split sensibly under `components/V4Engine/` with one
  panel type per file in `panels/`.
* The reel engine has a similar layer-per-file ambition under
  `ReelVideoPlayer/dsl-engine/` (the LayerRenderer being the unfinished
  half of that idea).

**Architectural debt worth naming:**

* No story-level `useReducer` for the multi-step generation flow. Today
  `GeneratePanel` carries 14+ `useState` hooks. That's not an emergency
  but if it grows another field, switch to a reducer.
* `ReelVideoPlayer/` and `LivingPanel/` have parallel "engine + renderer"
  trees that could share a small common runtime if we ever do a 3rd
  engine. YAGNI for now.

---
