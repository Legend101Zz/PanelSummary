# Manga Creation System — Phase 1–4 Build Status

**Last updated:** 2026-05-04
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

Test count went from **332 → 366** during Phase 4 (no regressions).

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

* **Phase 7 storyboarder upgrade** — add panel-level `appearing_characters`
  with confidence scoring so the renderer's character selection is even
  more precise (today the storyboard's `character_ids` list is honoured
  as-is).
* **Phase 10 panel-level quality gate** — once we have rendered panels,
  add an OCR/CLIP-style check that the rendered panel actually contains
  the characters it should.
* **Frontend V4 upgrade (Phase 11)** — render the new `image_path` field
  in the page viewer; today the field is emitted but the front-end ignores it.

When picking the next phase, run `pytest -q` first to confirm 366 still
pass; that's the green baseline you're starting from.
