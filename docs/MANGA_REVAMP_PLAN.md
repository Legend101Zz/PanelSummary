# PanelSummary Manga Revamp — Critical Analysis & Plan

> **Author:** Comreton (with Mrigesh)
> **Date:** 2026-05-04
> **Scope:** Make the PDF→Manga generation actually feel like manga.

---

## TL;DR

We have **two parallel manga pipelines** in this repo. The user-facing
"Generate Summary" button still drives the **legacy** stack
(`agents/orchestrator.py` + `generate_living_panels.py` +
`living_panel_prompts.py` + `v4_dsl_generator.py` ≈ 6 KLOC). The new clean
revamp (`manga_pipeline/` + `domain/manga/` + `services/manga/`) is only
reachable through the side panel "MANGA V2 LAB". Even the new pipeline,
while well-architected, does each creative job in **one shot**, has **no
global book understanding**, **regenerates the character bible per slice**
(visual drift), throws away most of the storyboard richness when it maps to
the V4 DSL, and renders panels as "colored boxes with a character avatar
and a text bubble". That's why the manga feels like a slideshow, not manga.

The plan: **delete the legacy pipeline**, **promote `manga_pipeline/` v2 to
the only path**, and surgically upgrade the seven things that actually
drive manga quality (book-level plan, stable bible, per-character voice,
reference-locked sprites, expressive storyboard, real V4 layout/inking,
critique-and-rewrite loops).

---

## 1. Current State Map

### 1.1 The two pipelines

| Pipeline | Entry point | Files | Purpose | Status |
|---|---|---|---|---|
| **Legacy** (V2 + V4 DSL) | `celery_worker.generate_summary_task` → `MangaOrchestrator` | `agents/orchestrator.py` (849), `agents/planner.py` (890), `agents/dsl_generator.py` (739), `generate_living_panels.py` (740), `living_panel_prompts.py` (537), `v4_dsl_generator.py` (349), `stage_book_synopsis.py`, `stage_document_understanding.py`, `stage_manga_story_design.py` (~1 KLOC), `prompts.py` (25 KB), `panel_templates.py`, `narrative_arc.py`, `knowledge_graph.py`, `scene_composer.py` | "Old" main flow. Drives `BookSummary` + `LivingPanelDoc`. Still rendered by `MangaReader.tsx`. | **TO BE SUNSETTED** |
| **Revamp v2** | `celery_manga_tasks.generate_manga_slice_task` → `services/manga/generation_service.generate_project_slice` | `manga_pipeline/stages/*` (10 stages), `domain/manga/*` (typed artifacts), `services/manga/*`, `manga_models.py`, `rendering/v4/storyboard_mapper.py` | "New" pipeline. Project + slice + page documents. Reachable only from `MangaV2ProjectPanel.tsx`. | **KEEP & UPGRADE** |

Both share the V4 DSL + `frontend/components/V4Engine/` renderer. The
legacy pipeline produces V4 pages directly with `v4_dsl_generator.py`; the
revamp produces them deterministically with `rendering/v4/storyboard_mapper.py`.

### 1.2 The revamp pipeline today

`build_v2_generation_stages()` in `services/manga/generation_service.py`:

```
source_fact_extraction → adaptation_plan → character_world_bible
  → beat_sheet → manga_script → storyboard
  → quality_gate → quality_repair → quality_gate
  → character_asset_plan → storyboard_to_v4
```

Architecture wins worth keeping:
- Typed `domain/manga` artifacts with Pydantic validators that enforce
  storytelling discipline (protagonist contract, beat-must-do-something,
  no wall-of-text dialogue lines, contiguous page indices, etc.).
- `manga_pipeline/llm_contracts.py` retries with **schema-aware repair
  prompts** instead of a silent fallback. This is *good*. Keep this pattern.
- `ContinuityLedger` persists across slices.
- `MangaSliceDoc` records LLM traces (cost + tokens + content preview).
- Strict image-asset generation (`asset_image_service.py`): no placeholder
  fallback, fails loudly if the image model failed.

### 1.3 The frontend renderer

- `V4PageRenderer.tsx` picks a CSS layout from a 6-key dictionary based on
  panel **count** (1=full, 2=vertical, 3=asymmetric, 4=grid-4). Manga
  panel rhythm is ignored.
- `V4PanelRenderer.tsx` dispatches to `SplashPanel`, `DialoguePanel`,
  `NarrationPanel`, `DataPanel`, `TransitionPanel`. Each one is basically
  *colored background + text + a sprite thumbnail*. No real ink/screentone
  treatment, no panel-border art, no reading order arrows, no vertical
  reading.
- `findPanelAsset()` matches the panel's `character` to a `MangaAssetDoc`
  by `character_id` + `expression`. Falls back to first asset for that
  character. Reuses the asset's `image_url` everywhere — **but the asset
  catalog is per-project, not per-pose-and-angle**, so the same neutral
  half-body shows up over and over.

---

## 2. Why the manga sucks today (root causes)

These are ranked by user-visible impact on manga quality:

### 2.1 No book-level story spine ⛔
`adaptation_plan_stage`, `character_world_bible_stage`, and
`beat_sheet_stage` all run **per slice**, with only the previous slice's
recap and last-page hook as continuity. So:
- The "protagonist" can be defined differently in slice 1 vs slice 3.
- The Ki-Sho-Ten-Ketsu structure is local-only; the whole book has no arc.
- Important facts the LLM picks for "logline" change every 10 pages.

A real adaptation needs **one book-level adaptation plan** that the per-slice
plans descend from.

### 2.2 The bible is regenerated every slice ⛔
`character_world_bible_stage.run` is in the slice stage list. Every new
slice produces a fresh `CharacterWorldBible` with no instruction to keep
character IDs/names/visual locks identical to the saved one. The
persistence side does store `character_world_bible` on `MangaProjectDoc`,
but the stage doesn't read it — it just gets `prior_continuity.character_state`
which is a thin `CharacterContinuityState` map, not the visual bible.

Result: characters drift. Sprites generated for slice 1 use `character_id =
"sage_inquirer"`; in slice 2 the bible suddenly calls them
`"the_seeker"`, asset lookup misses, and we render a placeholder avatar.

### 2.3 The character asset library is not a real library ⛔
`character_asset_plan_stage` produces ~2 prompts per character (neutral +
1 expression). That's it. Real manga uses:
- A **turnaround sheet** (front, ¾, side, back) as a visual reference.
- An **expression sheet** (8–12 emotions).
- Possibly a **costume sheet** for outfit changes.

We don't generate any of this. We don't reference-image lock either —
Gemini accepts reference images, we never use them. Each asset is a fresh
text-to-image roll of the dice. Visual consistency is therefore hope-based.

### 2.4 The storyboard → V4 mapping is lossy 🪦
`rendering/v4/storyboard_mapper.py`:
- `panel.composition`, `panel.action`, `panel.shot_type` → a single
  `narration` field truncated to 200 chars.
- `pose` is hardcoded to `"standing"` if any character is named.
- `expression` is hardcoded to `"determined"` (REVEAL panels) or
  `"neutral"` (everything else).
- Page **layout** is selected purely by panel count, ignoring `purpose`
  (REVEAL deserves a splash; TRANSITION deserves a thin strip; etc.).

So even if the LLM writes a beautiful storyboard, the renderer flattens it
to a wall of speech bubbles in colored boxes.

### 2.5 The V4 frontend renderer is "PowerPoint-with-bubbles" 😬
- No screentones, hatching, ink lines, panel-border weight.
- No "dramatic gutter" between panels.
- Splash panels render the title in a webfont, not a hand-drawn-feel
  display face.
- Reading order is left-to-right; manga is right-to-left.
- No page-turn rhythm (a strong panel should sit on a right-page reveal).

### 2.6 Dialogue is one-shot ✏️
`manga_script_stage` is a single LLM call with temp 0.8 and no critique
loop. No "voice-of-character" pass. No "is this readable in a bubble?" pass.
The quality gate only checks length (warning at 120 chars) — nothing about
voice, beat coverage, redundancy, or whether the dialogue even *sounds* like
a person.

### 2.7 Source slicing is naive 🍰
`choose_next_page_slice` cuts every 10 pages from the cover. It ignores:
- chapter boundaries (you'd rather end on a chapter end),
- section semantic boundaries (sometimes a 3-page section is a complete
  beat),
- whether the last slice ended on a strong cliffhanger.

This means random page cuts produce stories that start mid-thought and end
mid-thought.

### 2.8 No "whole book read" before generation 📚
`source_fact_extraction_stage` only sees the slice's text. The LLM that
extracts facts does not know what the *book* is about. So it grades fact
importance with no anchor. Important threads die early because slice 1
didn't know that slice 7 needed them.

### 2.9 Quality gate is too forgiving ⚠️
`quality_service.run_quality_gate` only catches: missing required facts,
long dialogue lines, missing TBC panel, dense pages. It misses: character
consistency, voice consistency, beat-script-storyboard alignment, visual
variety (e.g. all panels are medium shots), panel-purpose progression
(every page needs at least one EMOTIONAL_TURN or REVEAL).

### 2.10 Two pipelines = double maintenance + confused users 🤷
The "Generate Summary" CTA on `/books/[id]` runs the **legacy** flow that
produces a `BookSummary`, not a `MangaProjectDoc`. The "MANGA V2 LAB"
panel is the only place to reach the new pipeline. Code & UX both bleed.

---

## 3. North-Star Architecture

```
PDF
 │
 ▼  (existing, fine)
pdf_parser → Book + chapters + sections
 │
 ▼  ──── BOOK-LEVEL UNDERSTANDING (run ONCE per project) ────
 │  • whole_book_synopsis_stage   (1 LLM call over compressed chapters)
 │  • book_fact_registry_stage    (extract & rank facts ACROSS the book)
 │  • global_adaptation_plan_stage(one logline, one protagonist contract)
 │  • global_character_world_bible_stage (one bible, frozen visual locks)
 │  • global_arc_outline_stage    (Ki-Sho-Ten-Ketsu spanning whole book,
 │                                 mapped to source ranges = "slice plan")
 │  • character_asset_library_stage (turnaround + expression sheets,
 │                                   reference-locked image generation)
 │
 ▼  ──── PER-SLICE GENERATION (replays per slice the plan dictates) ────
 │  • slice_planner               (pick the next planned slice)
 │  • slice_fact_extraction       (refines book facts for this slice)
 │  • slice_beat_sheet            (reads global plan + this slice)
 │  • slice_manga_script          (with character voice cards)
 │  • script_critique_and_revise  (NEW: dialogue editor pass)
 │  • slice_storyboard            (with shot variety + panel purpose mix)
 │  • storyboard_critique         (NEW: visual variety + voice check)
 │  • slice_quality_gate          (richer rules, see §5)
 │  • slice_quality_repair        (existing, kept)
 │  • storyboard_to_v4            (NEW: purpose-aware layout, expressive
 │                                 pose/expression mapping, lettering plan)
 │
 ▼
V4Page docs + asset references
 │
 ▼
Frontend V4Engine (UPGRADED: real manga page renderer, see §6)
```

Two big shifts:
1. **Book-level work is done once** and stored on the project document. Per-slice
   stages descend from it (read-only) and never regenerate the bible/plan.
2. **Critique loops** sit between creative stages. We already pay for retries
   on schema validation; we should also pay for explicit "make this better"
   passes on the highest-impact artifacts.

---

## 4. Data Model Changes

`MangaProjectDoc` already has `adaptation_plan`, `character_world_bible`,
`fact_registry`, `coverage`, and `continuity_ledger`. We add:

| Field | Type | Why |
|---|---|---|
| `book_synopsis` | `dict` | Single global book understanding artifact. Reused by every slice. |
| `arc_outline` | `dict` | Global Ki-Sho-Ten-Ketsu plan: list of `{slice_id, role, source_range, beats_outline}`. Drives slice ordering. |
| `character_voice_cards` | `list[dict]` | Per-character speech examples + register + tics. Loaded into script stage. |
| `asset_library_status` | `str` | `pending | building | ready` so per-slice flow can wait for sprites. |
| `bible_locked` | `bool` | True after first slice. Bible cannot be regenerated; only **augmented** by an explicit `bible_diff_stage`. |

New stage names in `LLMStageName`:
`WHOLE_BOOK_SYNOPSIS`, `BOOK_FACT_REGISTRY`, `GLOBAL_ADAPTATION_PLAN`,
`GLOBAL_CHARACTER_BIBLE`, `ARC_OUTLINE`, `CHARACTER_VOICE_CARDS`,
`SCRIPT_CRITIQUE`, `STORYBOARD_CRITIQUE`, `BIBLE_AUGMENT`.

New `domain/manga` types:
- `BookSynopsis`
- `ArcOutline` + `ArcSliceEntry`
- `CharacterVoiceCard`
- `CharacterAssetSheet` (groups multiple `MangaAssetSpec` per character:
  turnaround + expressions + costumes).

---

## 5. Stage-by-Stage Upgrades

### 5.1 New: `whole_book_synopsis_stage`
Input: full canonical chapter summaries + chapter ToC.
Output: `BookSynopsis { title, logline, central_thesis, themes,
intended_reader, structure_signal }`.
Run **once** at project creation. Stored on `MangaProjectDoc.book_synopsis`.

### 5.2 New: `book_fact_registry_stage`
Run **once** at project creation, over compressed canonical chapters (not
raw text — we already have `canonical_chapters` from the legacy pipeline,
and we'll port that compression into the revamp as a deterministic
upstream stage). Produces a single `SourceFactExtraction` covering the
whole book. Per-slice fact stage becomes a **filter + refine** pass over
the global registry, not a fresh extraction.

### 5.3 Upgrade: `adaptation_plan_stage` → `global_adaptation_plan_stage`
Run **once**, given the synopsis + global facts. Stored on the project.
Per-slice adaptation plans are deleted; per-slice stages directly read
this one.

### 5.4 Upgrade: `character_world_bible_stage` → `global_character_world_bible_stage`
Run **once**, given the global plan. Stored. Replace the per-slice run
with `bible_augment_stage` that only runs when a new slice introduces a
character that wasn't in the bible (input includes the locked bible and
asks the LLM to *append* characters preserving existing visual locks).

### 5.5 New: `arc_outline_stage`
Input: global plan + bible + book-level facts + total page count.
Output: `ArcOutline` listing every slice's role (KI/SHO/TEN/KETSU/RECAP),
its target source range, its emotional turn, and a beat outline.
Replaces today's naive `choose_next_page_slice`. The slicer becomes
"return next entry from `arc_outline.entries` that hasn't been generated".

### 5.6 New: `character_voice_cards_stage`
Input: bible + 3–5 short source quotes per character (keyword-matched).
Output: per-character `CharacterVoiceCard { speech_register,
sentence_length, vocabulary_tics, do_say_examples, dont_say_examples }`.
Loaded into `manga_script_stage` and `script_critique_stage`.

### 5.7 New: `character_asset_library_stage` (replaces single-prompt asset plan)
Two-step:

a) **Plan** — for every character in the bible, produce
`CharacterAssetSheet` with:
   - 1 character-sheet prompt (T-pose, neutral, white background — the
     "reference" image).
   - 8 expression-sheet prompts (neutral, happy, sad, surprised, angry,
     thoughtful, fearful, triumphant) generated **with the reference image
     attached** to lock features.
   - Optional costume variants (only if bible says so).

b) **Generate** — run image model strictly. The reference image is
generated first, then ALL expression prompts are sent with the reference
attached (`google/gemini-3.1-flash-image-preview` supports image input).
Persist each as a `MangaAssetDoc` keyed by
`(character_id, asset_type, expression)`.

This is the single biggest visual-quality win available without changing
the renderer.

### 5.8 Upgrade: `manga_script_stage`
Add `character_voice_cards` to the prompt. Add an explicit "scene contract"
to the system prompt: each scene **must** advance the protagonist's want,
or change the reader's understanding, or change the emotional position.

### 5.9 New: `script_critique_stage`
Input: script + voice cards + adaptation plan.
Output: `MangaScript` (full replacement). System prompt: "You are a
manga editor. For each dialogue line, check it against the speaker's voice
card. Rewrite lines that violate it. Tighten any line >100 chars. Cut any
line that doesn't carry information or emotion." Skip when temperature
budget says we should.

### 5.10 Upgrade: `storyboard_stage`
Add to the prompt:
- *"At least one panel per page must be CLOSE_UP or EXTREME_CLOSE_UP."*
- *"At least one panel per slice must be SYMBOLIC."*
- *"Across the slice, at least 4 distinct shot types must appear."*
- *"For every dialogue line, set `expression` to one of the 8 trained
  expressions: neutral|happy|sad|surprised|angry|thoughtful|fearful|triumphant."*

Tighten the validator: enforce shot-type variety in `StoryboardArtifact`
model validator.

### 5.11 New: `storyboard_critique_stage`
Same shape as `quality_repair_stage` but always runs. Receives the
storyboard + asset library inventory and is told to rewrite any panel
whose `(character_id, expression)` does not match an available asset, or
any page that is monotone (all medium shots), or any panel whose
composition note is generic (e.g. "two characters talking").

### 5.12 Upgrade: `quality_gate_stage`
Add rules:
- Every slice has ≥ 1 REVEAL panel.
- Every slice has ≥ 1 EMOTIONAL_TURN panel.
- For each `panel.character_ids[i]`, the character_id exists in the
  locked bible.
- For each dialogue line's `speaker_id`, the speaker exists in the
  bible.
- Shot-type entropy ≥ 0.6 (information-theoretic across the slice).
- No two consecutive panels share the same `(character, expression)`.

These are deterministic and cheap.

### 5.13 Upgrade: `storyboard_to_v4`
- **Layout selection** uses panel `purpose` and `emphasis`, not just
  count: REVEAL → splash; consecutive TRANSITION → thin strip; mixed
  page with one REVEAL → asymmetric with the REVEAL on top-right (manga
  reading order start point).
- **Pose** map: `purpose=REVEAL` → `dramatic`; `purpose=EMOTIONAL_TURN`
  → `thinking`; `purpose=EXPLANATION` → `presenting`; etc.
- **Expression** comes from the panel's first dialogue line emotion or
  panel `purpose` — no hardcoded "determined".
- **Lettering plan**: V4 panel gets a `lettering_hint` that the renderer
  uses to size text, pick bubble shape (oval=neutral, jagged=shock,
  cloud=thought), and stack bubbles in reading order.
- Carry `panel.composition` and `panel.action` into a new
  `V4Panel.composition_note` field rendered in dev mode (for debugging)
  but available to the renderer for layout decisions like "is the
  character on the left or right?".

---

## 6. Frontend Renderer Upgrades

`frontend/components/V4Engine/` — make it look like manga.

### 6.1 Page chrome
- Off-white paper background (`#F5EFE3`) + subtle paper grain SVG.
- Black panel borders, weight scaled by emphasis (`high=4px`,
  `medium=2px`, `low=1.5px`).
- Real gutters: 12px white between panels; on splash pages, 0px and a
  bleed effect.

### 6.2 Reading order (right-to-left optional)
Add a project option `reading_direction: ltr | rtl`. When `rtl`:
- Reverse panel order at render time.
- Page flip animation goes from left-edge to right-edge.
- Page indicator dots reverse.

### 6.3 Panel renderers
- `SplashPanel`: real ink-style title with `font-display: "ZenAntique"`
  or similar, drop shadow, halftone dots, character asset rendered at 70%
  opacity behind the title (when present).
- `DialoguePanel`: bubbles sized by text length, tail pointing toward the
  speaker's sprite, shape switched on emotion (cloud=thought,
  jagged=shout). Use the **expression sheet asset** (`character_id +
  emotion`) — fall back to the neutral asset, then to initials.
- `NarrationPanel`: rectangular caption box at top-left, italic display
  font, screentone behind.
- `DataPanel`: minimalist hand-drawn-feel chart (CSS only, no image).
- `TransitionPanel`: black page with stylized ideogram + small Japanese-
  style chapter label.

### 6.4 Sprite display
`findPanelAsset` should look up by `(character_id, expression)` first.
If asset lookup fails, render the **initials chip** we already have, but
also log a warning so we can fix the script/storyboard mismatch.

### 6.5 Page rhythm
Add a `page.purpose` derived field: if any panel is `REVEAL` or
`TO_BE_CONTINUED`, mark the page `dramatic` and apply a subtle camera
zoom-in animation. Otherwise no animation, just a clean fade — keep it
calm so the reveals hit harder.

---

## 7. Sunset the Legacy Pipeline

This is the painful but essential cleanup. The legacy code is not "older
v2", it's a parallel universe that confuses every newcomer.

### 7.1 Files to delete (after re-routing)
- `backend/app/agents/orchestrator.py`
- `backend/app/agents/planner.py`
- `backend/app/agents/dsl_generator.py`
- `backend/app/generate_living_panels.py`
- `backend/app/living_panel_prompts.py`
- `backend/app/v4_dsl_generator.py`
- `backend/app/stage_book_synopsis.py`
- `backend/app/stage_document_understanding.py`
- `backend/app/stage_manga_story_design.py`
- `backend/app/scene_composer.py`
- `backend/app/panel_templates.py`
- `backend/app/narrative_arc.py`
- `backend/app/knowledge_graph.py`
- `backend/app/prompts.py` *(after porting `format_chapter_for_llm` and
  the canonical-summary prompt to the revamp pipeline)*
- `backend/app/celery_worker.py::generate_summary_task`
- `backend/app/models.py::BookSummary` *(once UI no longer references it)*
- `backend/app/api/routes/living_panels.py`
- `frontend/components/LivingPanel/` *(unless we keep the animated
  effects; see 7.3)*
- `frontend/app/books/[id]/manga/living/page.tsx`

### 7.2 Routes to merge
- "Generate Summary" CTA on `/books/[id]/page.tsx` becomes "Generate
  Manga" and calls `POST /books/{id}/manga-projects` then
  `POST /manga-projects/{id}/generate-slice`.
- `/books/[id]/manga/page.tsx` becomes a redirect to
  `/books/[id]/manga/v2`.

### 7.3 Salvage from `LivingPanel/`
Some of the SVG scene illustrations in
`frontend/components/LivingPanel/illustrations/SceneLibrary.tsx` are
genuinely nice. Move whichever ones we want to keep into
`V4Engine/illustrations/` and reference them from the new
`V4Panel.scene` field.

### 7.4 `BookSummary` migration
Add a migration script under `backend/app/scripts/` that walks every
`BookSummary` and creates a one-shot `MangaProjectDoc` so old links keep
working (read-only).

---

## 8. New Folder Layout (post-cleanup)

```
backend/app/
├── api/
│   └── routes/
│       ├── jobs.py
│       ├── manga_projects.py        # the single manga API
│       ├── media.py
│       └── reels.py
├── celery_worker.py                 # parse_pdf + reels only
├── celery_manga_tasks.py            # generate_manga_project + generate_slice
├── domain/
│   └── manga/                       # +book_synopsis.py, arc_outline.py,
│                                    #  voice_cards.py, asset_sheets.py
├── manga_pipeline/
│   ├── orchestrator.py
│   ├── context.py
│   ├── llm_contracts.py
│   └── stages/
│       ├── book/                    # NEW: run-once stages
│       │   ├── whole_book_synopsis_stage.py
│       │   ├── book_fact_registry_stage.py
│       │   ├── global_adaptation_plan_stage.py
│       │   ├── global_character_world_bible_stage.py
│       │   ├── arc_outline_stage.py
│       │   ├── character_voice_cards_stage.py
│       │   └── character_asset_library_stage.py
│       └── slice/                   # per-slice stages
│           ├── slice_fact_refine_stage.py
│           ├── beat_sheet_stage.py
│           ├── manga_script_stage.py
│           ├── script_critique_stage.py
│           ├── storyboard_stage.py
│           ├── storyboard_critique_stage.py
│           ├── quality_gate_stage.py
│           ├── quality_repair_stage.py
│           ├── bible_augment_stage.py
│           └── storyboard_to_v4_stage.py
├── rendering/
│   └── v4/
│       ├── storyboard_mapper.py     # purpose+emphasis aware
│       └── lettering.py             # NEW: bubble plan
├── services/
│   └── manga/
│       ├── project_service.py       # +ensure_book_understanding()
│       ├── generation_service.py    # split book vs slice generation
│       ├── source_slice_service.py  # backed by ArcOutline
│       ├── asset_library_service.py # NEW: turnaround+expression sheets
│       └── quality_service.py       # richer rules
└── manga_models.py
```

Every file stays under 600 lines; nothing here even comes close.

---

## 9. Image-Model Strategy (the sprite-quality fix)

### 9.1 Reference-locked generation
- Generate the **character sheet** image first. Store its bytes (not just
  the path) so we can pass it as a reference for follow-up generations.
- For every expression / pose, send: prompt + reference image. The
  Gemini image API accepts `messages[*].content = [{type:"image_url",
  image_url:{...}}, {type:"text", text: prompt}]`. We're already on that
  endpoint in `image_generator.generate_image_with_model`; we just need to
  add multi-modal content support.
- Fail loudly if the reference image is missing — never silently fall
  back to text-only.

### 9.2 Background removal
For dialogue/sprite use, transparent backgrounds matter. Either:
- ask the model to generate "isolated character on white", and chroma-key
  in the renderer (cheap, ugly), or
- use the model's image-edit endpoint to mask if available (better,
  vendor-dependent).

Document the choice; don't silently flip-flop.

### 9.3 Cost control
- Generate the asset library **once per project**, before the first
  slice. ~9 calls per character (1 sheet + 8 expressions), so 5
  characters ≈ 45 image calls. At Gemini Flash $2.50/1M tokens this is
  manageable. Surface it in the UI as an upfront cost estimate.
- Cache aggressively: hash `(prompt + reference image hash + model)` and
  short-circuit re-generation.

---

## 10. Implementation Plan (phased)

Each phase is intended to ship independently and not break the existing
"v2 lab" flow.

### Phase 0 — Stop the bleeding (1 day)
- Add a feature flag `USE_LEGACY_MANGA = False` (default).
- Re-route the main "Generate" CTA to call the revamp pipeline. The
  legacy code stays compiled-but-cold so we can A/B if needed.
- Add a deprecation banner to `/books/[id]/manga/living/`.

### Phase 1 — Book-level understanding (2–3 days)
- New domain types: `BookSynopsis`, `ArcOutline`, `CharacterVoiceCard`,
  `CharacterAssetSheet`.
- New stages under `manga_pipeline/stages/book/`.
- New service `services/manga/book_understanding_service.py` that runs
  the book stages once and persists to `MangaProjectDoc`.
- New Celery task `generate_manga_project_understanding_task` that fires
  on project creation.
- API: `POST /books/{id}/manga-projects` triggers it; UI shows
  "Preparing the book…" before the slice generator unlocks.
- **Result:** every slice from now on shares one logline, one bible, one
  arc.

### Phase 2 — Asset library (2 days)
- `character_asset_library_stage` (plan + execute).
- Multi-modal image generation in `image_generator.py` (add ref-image
  support).
- Expression coverage enforced in storyboard validator.
- Frontend: `findPanelAsset` strict on `(character_id, expression)`.
- **Result:** characters look like the same person across panels.

### Phase 3 — Critique loops (1–2 days)
- `script_critique_stage`, `storyboard_critique_stage`.
- Each is "always-on" but cheap (smaller `max_tokens` than the original
  generative pass).
- Quality gate gets the new deterministic rules.
- **Result:** dialogue stops sounding like Wikipedia paragraphs.

### Phase 4 — Storyboard → V4 fidelity (2 days)
- Rewrite `storyboard_mapper.py` with purpose-aware layout & expression
  mapping.
- New `rendering/v4/lettering.py` to plan bubble shapes/sizes.
- Extend `V4Panel` with `composition_note` and `lettering`.
- Tests in `backend/tests/rendering/test_storyboard_mapper.py`.
- **Result:** the V4 page shape actually reflects the storyboard.

### Phase 5 — Frontend manga look-and-feel (3–4 days)
- Restyle the five panel renderers per §6.
- Real RTL reading direction (project option).
- Animated page-turn (Motion).
- Page-rhythm logic (`dramatic` page detection).
- **Result:** it stops looking like a Tailwind dashboard.

### Phase 6 — Sunset legacy (1–2 days)
- Migration script for old `BookSummary` docs.
- Delete the file list from §7.1.
- Squash imports; update `backend/app/main.py` and `celery_worker.py`.
- Drop `LivingPanelDoc` collection (after archive).
- **Result:** one canonical pipeline, ~6 KLOC removed, sanity restored.

### Phase 7 — Polish (ongoing)
- Tune temperatures and `max_tokens` per stage based on production
  traces.
- Track `slice.quality_report` over time; auto-tune storyboard
  validator thresholds.
- Add a `/manga-projects/{id}/regenerate-slice/{slice_id}` endpoint that
  re-runs only the per-slice path against the locked book artifacts.

---

## 11. Test Strategy

- **Unit:** every stage gets a fake `LLMModelClient` that returns a
  hand-written valid artifact. Validate that `PipelineContext` updates
  exactly as expected.
- **Integration (per stage):** golden-test JSON inputs + outputs in
  `backend/tests/fixtures/manga/`.
- **Pipeline integration:** record a real run's `LLMInvocationTrace` for
  one short PDF (`tests/fixtures/short_book.pdf`) and replay it through
  the pipeline using a `ReplayLLMClient` so we have a hermetic end-to-end
  test that doesn't burn tokens in CI.
- **Renderer (Playwright):** snapshot test 5 representative
  `MangaPageDoc` JSONs into screenshots. CI fails on diff > 2%.
- **Quality regression:** keep a corpus of 10 "good slice" outputs and
  fail PRs that drop a metric (shot-type entropy, expression coverage,
  required-fact grounding) below threshold.

---

## 12. Done Definition (per the brief)

A user uploads a PDF and gets a manga where:

- ✅ The story has a single coherent protagonist contract and arc that
  spans the whole book.
- ✅ Characters are visually identical across pages and slices because
  every sprite is reference-locked to one character sheet.
- ✅ Dialogue sounds like the character speaking, not the LLM lecturing,
  thanks to voice cards + critique.
- ✅ Pages have shot variety (close-ups + reveals + symbolic + transition)
  and at least one emotional turn per slice.
- ✅ Reveal panels actually look like reveals (splash layout, ink, big
  type), not "panel #3 of 4 in a grid".
- ✅ The reading experience supports right-to-left and respects
  page-turn rhythm.
- ✅ One pipeline. One CTA. One reader. Codebase 6 KLOC lighter.
- ✅ Failures are loud (no silent fallback) and the QA gate catches the
  manga-y problems, not just "did the JSON parse".

---

## 13. Open Questions (call out before we build)

1. **Cost ceiling for the asset library?** ~45 image calls per
   project on first generation. Confirm budget or reduce expression set
   to 5 (neutral/happy/sad/surprised/angry).
2. **Reading direction default?** RTL for the manga vibe, LTR for first-
   time readers. I'd default to LTR with an obvious "Read like manga"
   toggle in the project options.
3. **How many slices per book on average?** The arc outline stage needs
   a target slice count. Heuristic: `max(4, total_pages // 12)` capped
   at 12 slices, but should be informed by chapter count.
4. **Do we keep V2 DSL anywhere?** Recommend hard no — `V2 living
   panels` adds complexity for a feature nobody uses on the new path.
   The "living/animated" tag in the UI can survive as a small in-page
   animation flag on V4 panels.
5. **Do we want a `regenerate this character only` UX?** Useful for
   creators tuning sprites. Easy to add once the asset library lives in
   its own service.

---

*That's the whole plan, buddy. Phase 1 + Phase 2 alone — book-level
understanding plus a real character-asset library — will make the
generated manga look and read **dramatically** better, even before we
touch the renderer. Ping me which phase you want to start chewing on
first.*
