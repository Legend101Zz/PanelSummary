# Manga Quality & Codebase Cleanup Plan

**Author:** Comreton 🐶
**Date:** 2026-05-04
**Companion docs:** `MANGA_BUILD_STATUS.md`, `MANGA_REVAMP_PLAN.md`,
`MANGA_DSL_SPEC.md`, `manga_creation_system_review_and_plan/*.md`

> **TL;DR.** The new pipeline already exists and works (Phases 1, 2, 3, 4,
> 4.1, 7, 10 are shipped). The reason your output still feels "average" is
> not that the architecture is wrong — it's that **(a)** the old V2/legacy
> code has not been deleted so the codebase looks scattered, **(b)** four
> specific *quality* gaps still let mediocre dialogue, off-model sprites,
> and weak page composition slip through, and **(c)** there is no
> human-in-the-loop / regenerate-this-panel surface, so a single bad LLM
> draft poisons the whole slice.
>
> This plan is a) a critical layer-by-layer audit, b) a side-by-side
> against how real manga editors work, c) a sequenced, scoped backlog of
> the next ~6 phases, and d) a cleanup track to delete legacy crud.

---

## 0. What's actually in the repo right now

I read the code, not the plan docs. Here is the honest snapshot.

### Backend — present **and wired**

* `backend/app/manga_pipeline/` — **the new pipeline.** Stages exist for:
  source-fact extraction → adaptation plan → character bible →
  beat sheet → manga script → storyboard → DSL validation → quality gate
  → quality repair → DSL validation (again) → quality gate (again) →
  character asset plan → storyboard → V4 (→ optional panel rendering →
  panel quality gate). Defined in
  `services/manga/generation_service.py::build_v2_generation_stages`.
* `backend/app/manga_pipeline/stages/book/` — book-level (run-once-per-
  project) stages: synopsis, fact registry, adaptation plan, character
  world bible, character art direction, arc outline.
* `backend/app/manga_pipeline/manga_dsl.py` — executable DSL constraints
  (panel/page/dialogue budgets per Ki-Sho-Ten-Ketsu role, anchor-fact
  validation, shot variety). Validators return `QualityIssue` objects
  the repair stage already understands.
* `backend/app/services/manga/panel_rendering_service.py` — multimodal
  panel rendering with character reference sheets attached to the image
  call. Aspect ratio per panel role. Bounded concurrency.
* `backend/app/services/manga/character_sheet_planner.py` — composes
  reference sheet + expression sheet specs from the bible AND the LLM-
  authored art direction. Bible visual_lock is mechanically appended to
  every prompt.
* `backend/app/api/routes/manga_projects.py` — control plane:
  create project → run book understanding → preview source slice →
  generate slice → list slices/pages/assets → materialize character
  sheets.
* `backend/app/celery_manga_tasks.py` — background worker tasks for the
  new pipeline (separate from the legacy `celery_worker.py`).

### Backend — present **but legacy / cruft**

These are alive (still imported somewhere) and should be retired:

| File | Size | Status | Notes |
| --- | ---: | --- | --- |
| `app/agents/orchestrator.py` | 35 KB | Legacy | The pre-pipeline orchestrator. Not on the new path. |
| `app/agents/planner.py` | 36 KB | Legacy | Same. |
| `app/agents/dsl_generator.py` | 26 KB | Legacy | Old V2 DSL generator; superseded by `manga_pipeline/manga_dsl.py` + `rendering/v4/storyboard_mapper.py`. |
| `app/generate_living_panels.py` | 27 KB | Legacy | Living-panel DSL generator. Used by `api/routes/living_panels.py`. |
| `app/living_panel_prompts.py` | 28 KB | Legacy | Prompts for Living Panel — old engine. |
| `app/stage_book_synopsis.py` | 3.4 KB | **Duplicate** | Replaced by `manga_pipeline/stages/book/whole_book_synopsis_stage.py`. |
| `app/stage_document_understanding.py` | 12 KB | **Duplicate** | Replaced by book-understanding stages. |
| `app/stage_manga_story_design.py` | 25 KB | **Duplicate** | Replaced by `adaptation_plan_stage` + `beat_sheet_stage` + `manga_script_stage` + `storyboard_stage`. |
| `app/narrative_arc.py` | 16 KB | Legacy | Replaced by `arc_outline_stage`. |
| `app/scene_composer.py` | 8 KB | Legacy | Pre-V4 composer. |
| `app/panel_templates.py` | 14 KB | Half-legacy | Still has DSL v2.0 template helpers; only used by legacy paths. |
| `app/celery_worker.py::generate_summary_task` | — | Legacy | Old summary path. Still wired via `app/main.py`. |
| `app/api/routes/living_panels.py` | — | Legacy | Living-panel API surface. |

**Dead config flag:** `Settings.manga_pipeline_version = "legacy"` in
`app/config.py` is read by *nobody*. We never finished the feature flag.

### Frontend — present **and wired**

* `frontend/components/V4Engine/*` — V4 page/panel renderer with the
  PaintedPanelBackdrop (Phase 4.1) and per-type sub-renderers
  (Splash/Dialogue/Narration/Data/Transition). DRY-ed via
  `assetLookup.ts`.
* `frontend/components/MangaReader.tsx` — primary reader (522 LOC).
* `frontend/components/MangaV2ProjectPanel.tsx` — project dashboard for
  the new pipeline.
* `frontend/components/GeneratePanel.tsx` — book → manga generate form
  (recently extracted out of `app/books/[id]/page.tsx`).
* `frontend/app/books/[id]/manga/v2/page.tsx` — V2 (new pipeline) reader
  route.

### Frontend — present **but legacy / cruft**

| File | Size | Status | Notes |
| --- | ---: | --- | --- |
| `frontend/app/books/[id]/manga/page.tsx` | 13 KB | Legacy | Old per-summary manga reader. Should redirect to v2. |
| `frontend/app/books/[id]/manga/living/page.tsx` | 14 KB | Legacy | Living Panel viewer. |
| `frontend/components/LivingPanel/*` | ~91 KB | Legacy | Old engine. |

### What *is not yet built* (the real work this plan adds)

1. **Script "table read" pass.** No LLM-as-editor stage that critiques
   dialogue voice consistency before the script reaches storyboarding.
   This is the single biggest reason dialogue feels generic.
2. **Character voice validators.** The bible defines `speech_style` per
   character but nothing checks the script honours it.
3. **Character sheet quality gate.** No gate verifies the generated
   sprite actually looks like a manga character vs a blurry blob. No
   reference-sheet review/regenerate UX.
4. **Per-page composition stage.** Layout is picked from a 4-entry
   lookup table (`full / vertical / asymmetric / grid-4`). Real manga
   pages are composed (variable gutters, splash + 3-panel mix, page
   turn rhythm). No thumbnail/composition stage.
5. **Right-to-left flow validator.** The DSL prompt fragment claims
   "manga reads top-right to bottom-left" but the validator does not
   enforce reading-order on V4 pages, and the frontend renders LTR.
6. **Per-panel regenerate API + UI.** Bad panel? Tough. You re-run the
   whole slice. Costly and discouraging.
7. **Multimodal panel context.** The renderer attaches character
   sheets but ignores **adjacent panels in the same page**, so adjacent
   panels of the same scene end up with different lighting / line
   weight.
8. **Lettering pass.** Speech bubbles are HTML overlays; they don't
   wrap, taper, or follow the painted character's mouth position.
9. **The dead feature flag.** `manga_pipeline_version` is unused, which
   is why nobody can answer "are we on legacy or revamp?" with
   confidence.

---

## 1. Critical analysis — current pipeline vs how real manga is written

Mapping your reference workflow to what we actually do today:

| Real-manga step | Pipeline stage today | Honest verdict |
| --- | --- | --- |
| **Define key elements** (who, what, why, what-do-they-do) | `whole_book_synopsis_stage` writes `protagonist_arc` + `central_thesis`. | ✅ Captured. But the protagonist contract is not re-asserted in every per-slice prompt, so the slice script can quietly forget who the protagonist is. |
| **Logline** (one-sentence story) | `BookSynopsis.logline` field. | ✅ Captured. |
| **Plot outline (Ki-Sho-Ten-Ketsu)** | `arc_outline_stage` produces `ArcOutline` of 4–12 entries with role + page range + must-cover facts. | ✅ Captured. This is genuinely good. |
| **Detailed script** (scene + panel + dialogue) | `manga_script_stage` then `storyboard_stage`. | 🟡 Two-step is correct. **But:** there is no editorial pass between them. No LLM-as-editor sanity-checks the script for voice / tension / cliché before it goes to thumbnails. |
| **Character profiles** (look, personality, strengths, flaws) | `global_character_world_bible_stage` produces `CharacterDesign` rows with visual_lock, silhouette, outfit, hair/face, speech_style, role. | ✅ Captured. |
| **Visually distinct characters** | DSL-style guidance in the bible system prompt; nothing enforces silhouette uniqueness. | 🟡 Aspirational. We do not validate the bible for actually-distinct silhouettes. |
| **Character sheets** (front/side/back, expressions) | `character_sheet_planner.py` builds a single reference sheet (neutral pose, front view) plus N expression sheets per LLM-authored repertoire. | 🟡 Half there. **Missing: side and back angles** (the real "model sheet"). |
| **Thumbnails** (rough sketches before final art) | None. We jump from storyboard text straight to painted panels. | ❌ Missing. This is why composition feels weak. |
| **Panel-flow / reading direction** | DSL fragment claims RTL. No validator. Frontend reads LTR. | ❌ Lip service, not enforced. |
| **Vary shot types** | DSL: `MIN_DISTINCT_SHOT_TYPES_PER_SLICE = 3`, validated. | ✅ Captured. |
| **Penciling / inking** | Painted by the multimodal model (Gemini Nano-Banana family). | 🟡 Quality is bound by the image model. We do not run a "ink-pass" / line-clean step. |
| **Screentones** | DSL-level effect flag (`screentone`); frontend overlays a CSS dot pattern. | 🟡 Decorative, not painted. |
| **Lettering / SFX** | `DialoguePanel.tsx` HTML bubbles + name tag. No SFX. | 🟡 Functional but not authentically manga. |
| **Get feedback** (ask others) | None. | ❌ Missing. No regenerate-this-panel, no thumbs-up/down on a page, no critic LLM. |

**The pattern:** the *creative* stages are present and the *structural*
DSL gates are present, but the **editorial** layer (taste, voice,
composition) is thin or missing.

---

## 2. Root-cause table for "the manga we generate is average"

| Symptom you described | Root cause in code | Where it lives | Fix phase below |
| --- | --- | --- | --- |
| "dialogues sometimes incoherent" | `manga_script_stage` has temperature 0.8 and no editor pass. Bible's `speech_style` never validated against generated lines. | `manga_pipeline/stages/manga_script_stage.py` | Phase A |
| "story dialogues not coherent" between slices | Per-slice script does not re-read prior slice's recap as a hard constraint, only as soft context. Continuity ledger is a hint, not a gate. | `services/manga/quality_service.py` (no continuity check) | Phase A |
| "characters / sprite are not good" | (i) Single neutral reference, no turnaround. (ii) No quality gate on the rendered sprite. (iii) Image model is the cheap multimodal Gemini Nano. (iv) No regenerate-this-sheet UI. | `services/manga/character_sheet_planner.py`, `services/manga/character_library_service.py` | Phase B |
| "panels designed weakly" | Page layout is `_layout_for_panel_count()` — 4 strings hard-coded. No composition stage. No thumbnail. | `rendering/v4/storyboard_mapper.py` | Phase C |
| "code scattered / V2 vs V4" | Legacy modules listed in §0 still imported by `main.py` and `living_panels` route. Naming collision: "V2" = "v2 of the pipeline", "V4" = "v4 of the rendering DSL" — same project, different version axes. | All over | Phase D (cleanup) |
| "DSL approach right?" | **Yes, the DSL is correct.** It is the right level of abstraction (story intent, not pixels) and is already where editorial constraints live. We just need MORE constraints, not a different architecture. | `manga_pipeline/manga_dsl.py` | Phase A + C |

---

## 3. The plan — phases, in priority order

Each phase is **independently shippable** (own PR, own tests, own
rollback). Order is by impact-on-output ÷ effort.

### Phase A — Story coherence: editor pass + voice validators (1 sprint)

**Goal:** stop generating dialogue that sounds like every other slice.

**Scope.**

* **A1. Add `script_review_stage`** between `manga_script_stage` and
  `storyboard_stage`. This is an LLM-as-editor pass that takes the
  `MangaScript` + `CharacterWorldBible` + arc entry + prior slice's
  closing hook, and returns a `ScriptReviewReport` with:
  * `voice_violations` — lines where speaker drifts off the bible's
    speech_style;
  * `tension_notes` — beats that lack stakes;
  * `cliche_warnings` — generic phrases ("we have to do something",
    "I won't give up").
  Loop with a `script_repair_stage` (mirroring the existing
  `quality_repair_stage`) that rewrites flagged lines only.
* **A2. Voice validator** in `services/manga/quality_service.py`:
  given each `ScriptLine.speaker_id`, look up the bible's
  `speech_style`, run a simple heuristic (line length, formality,
  first-person verb tics) AND ask the LLM editor to confirm. Issues
  feed the same `QualityReport` (don't invent a parallel type).
* **A3. Continuity gate.** Add `continuity_gate_stage` after
  `quality_gate_stage`. It cross-checks: did the script honour
  `prior_continuity.last_page_hook`? Did it use `must_cover_fact_ids`
  in the right beat (Ki vs Ketsu)? Hook violations become
  warnings; missing facts already become errors via DSL.
* **A4. Protagonist contract.** Re-stamp the synopsis's
  `protagonist_arc` + `central_thesis` in the system prompt of
  `manga_script_stage` and `storyboard_stage`. Today the protagonist
  identity is in the bible; nothing forces the script to keep them on
  stage.

**Files to touch.**

* New: `manga_pipeline/stages/script_review_stage.py`,
  `script_repair_stage.py`, `continuity_gate_stage.py`.
* New: `services/manga/voice_validator.py`.
* Edit: `services/manga/generation_service.py::build_v2_generation_stages`
  to insert the new stages.
* Edit: `manga_pipeline/llm_contracts.py::LLMStageName` to add the new
  enum entries.
* Edit: `domain/manga/types.py` to add `ScriptReviewReport` + new
  `QualityIssue` codes (`SCRIPT_VOICE_DRIFT`, `SCRIPT_CLICHE`,
  `CONTINUITY_HOOK_DROPPED`).

**Exit criteria.**

* New tests cover voice-drift detection and continuity-hook check.
* Sample slice from a known book (we'll snapshot one from the suite)
  shows measurable improvement in dialogue distinctness — even just
  read aloud against a bible's `speech_style`.
* Existing 381 tests still pass.

**Cost note.** Adds 1 LLM call per slice (script_review). Repair only
fires on failure, so amortized cost is roughly +25 % per slice. Worth it
for the dialogue uplift.

---

### Phase B — Character sprite quality (1 sprint)

**Goal:** the sprites the user sees are recognizably manga characters,
not blurry blobs, AND there's a way to ask for a redo.

**Scope.**

* **B1. Multi-angle reference sheet.** Today
  `_specs_for_character` emits ONE `reference_sheet` (neutral pose,
  front). Replace with three: `reference_front`, `reference_side`,
  `reference_back`. Each gets the same bible visual_lock; the prompt
  rotates the framing. Stable asset_id per angle so re-runs are
  idempotent.
* **B2. Image-model quality gate.** New `sprite_quality_gate` that runs
  a cheap *vision* check on each generated sheet:
  * Is the image at least 768 px on the short side?
  * Does a vision LLM (`gemini-flash` is fine) say "this depicts a
    single character on a plain background, no text"?
  * Does the silhouette match the bible's `silhouette_notes` keywords?

  Failures get re-queued automatically up to N=2 retries. After that, a
  `MangaAssetDoc.status = "review_required"` is persisted and surfaced
  in the UI.
* **B3. Bible silhouette uniqueness check.** When the bible is
  authored, validate that no two characters share more than M
  silhouette descriptor tokens. This is a cheap text overlap check on
  `silhouette_notes` + `outfit_notes`.
* **B4. UX — Character Library page.** New route
  `frontend/app/books/[id]/manga-projects/[projectId]/characters/page.tsx`
  shows every asset, lets the user click "regenerate" on any one,
  optionally tweak the prompt, and pin a preferred reference. A pin
  is read by `select_reference_paths_for_characters` to override the
  default selection.
* **B5. Image-model selector.** `GeneratePanel.tsx` already exposes
  model selection for text. Add a *separate* image-model selector
  surfaced when `generate_images=true`, defaulting to the strongest
  multimodal Gemini we are entitled to.

**Files to touch.**

* Edit: `services/manga/character_sheet_planner.py` (multi-angle).
* New: `services/manga/sprite_quality_service.py`.
* New: `manga_pipeline/stages/book/sprite_quality_gate_stage.py` (runs
  in book understanding flow after sheets are generated).
* Edit: `manga_models.py::MangaAssetDoc` add `status`, `pinned`,
  `regen_count` fields.
* Edit: `api/routes/manga_projects.py` add `POST
  /manga-projects/{id}/characters/{character_id}/assets/{asset_id}/regenerate`
  and `POST .../pin`.
* New frontend: `components/CharacterLibrary/*` and the route page.

**Exit criteria.**

* Every locked bible character has front/side/back AND ≥3 expressions.
* A failed sheet shows up as `review_required` in the UI, not silently
  shipped.
* User can click → regenerate → see new asset within 1 minute.

---

### Phase C — Page composition: thumbnails + lettering (1 sprint)

**Goal:** pages read like a *page*, not a flat grid.

**Scope.**

* **C1. Thumbnail/composition stage.** New `page_composition_stage`
  between `storyboard_stage` and `storyboard_to_v4_stage`. Input:
  storyboard pages. Output: per-page `PageComposition` with:
  * `gutter_grid` — variable cell sizes (e.g. `[[60,40],[100],[33,33,34]]`).
  * `panel_emphasis_overrides` — promote one panel per page to
    splash-emphasis when narrative justifies.
  * `page_turn_panel_id` — which panel anchors the right-edge bottom
    (the page-turn beat).
  Driven by an LLM call with a prompt that's literally a
  manga-composition cheat sheet (rule of thirds, splash placement,
  Z-pattern eye flow).
* **C2. RTL reading-order validator.** Add
  `validate_reading_flow(page)` to `manga_dsl.py`. For each pair of
  adjacent panels, verify that panel\[i+1\]'s top-left is to the
  bottom-or-left of panel\[i\]'s top-right (RTL natural flow). Issues
  go in the same `QualityReport`.
* **C3. Frontend RTL composition.** Update `V4PageRenderer.tsx` to
  read the new `gutter_grid` and render with CSS Grid, populating
  cells in RTL order (`direction: rtl` on the page container).
  Existing per-panel renderers stay LTR (text inside the bubble is
  still LTR English).
* **C4. Lettering upgrade.** Replace the current pure-CSS speech
  bubble with a lightweight SVG bubble that:
  * tapers a tail toward the painted character's centroid (we
    estimate centroid from the painted image's bounding box of
    non-background pixels, computed once per asset and cached);
  * supports thought bubbles (cloud) vs spoken bubbles (oval) vs
    yelled bubbles (jagged);
  * respects emotion: the existing `EMOTION_STYLES` table maps to
    bubble shapes, not just border color.
* **C5. SFX layer.** Storyboard already supports
  `panel.effects = ["impact", "page_turn", "zoom"]`. Add a stylized
  text-SFX renderer (`BAM`, `WHRR`, etc) painted as decorative SVG
  text inside the panel, pulled from a small named-effect lookup.

**Files to touch.**

* New: `manga_pipeline/stages/page_composition_stage.py`.
* New: `domain/manga/types.py::PageComposition`.
* Edit: `rendering/v4/storyboard_mapper.py` to forward composition.
* Edit: `manga_pipeline/manga_dsl.py` (add reading-order validator).
* Edit: `frontend/components/V4Engine/V4PageRenderer.tsx`.
* New: `frontend/components/V4Engine/SpeechBubble.tsx` (SVG).
* New: `frontend/components/V4Engine/SfxLayer.tsx`.

**Exit criteria.**

* A test sample page renders with mixed panel sizes and reads RTL.
* Speech bubble tails point at the speaker, not at random.
* No regression on existing painted panel tests.

---

### Phase D — Codebase cleanup & feature flag retirement (0.5 sprint)

**Goal:** delete the duplicate / legacy modules so the architecture
*looks* as clean as it has actually become.

**Scope.**

* **D1. Wire and honour the feature flag.** Make
  `Settings.manga_pipeline_version` actually do something:
  * `revamp` is the new default;
  * `legacy` keeps the old `generate_summary_task` route alive for
    rollback;
  * `app/main.py` reads the flag once at startup and refuses to
    register both routes for the same path.
* **D2. Mark legacy modules with `# DEPRECATED`** docstring + log
  warning on import. Modules in scope:
  `app/agents/*`, `app/generate_living_panels.py`,
  `app/living_panel_prompts.py`, `app/stage_book_synopsis.py`,
  `app/stage_document_understanding.py`,
  `app/stage_manga_story_design.py`, `app/narrative_arc.py`,
  `app/scene_composer.py`, `app/panel_templates.py`,
  legacy frontend `app/books/[id]/manga/page.tsx`,
  `app/books/[id]/manga/living/page.tsx`,
  `frontend/components/LivingPanel/*`.
* **D3. Migrate** the one bit of legacy still load-bearing
  (`api/routes/living_panels.py`) under
  `api/routes/legacy/living_panels.py`. Behind the legacy flag, it
  serves the old reader for already-existing summaries. New summaries
  go through the new pipeline.
* **D4. Delete.** After one release with the deprecation warning and a
  green smoke run on revamp:
  * Delete `app/agents/{orchestrator,planner,dsl_generator}.py`.
  * Delete `app/stage_manga_story_design.py`,
    `app/stage_document_understanding.py`,
    `app/stage_book_synopsis.py`,
    `app/narrative_arc.py`,
    `app/scene_composer.py`.
  * Delete `app/generate_living_panels.py`,
    `app/living_panel_prompts.py`.
  * Delete `frontend/components/LivingPanel/*`,
    `frontend/app/books/[id]/manga/living/`.
* **D5. Rename for clarity.** "v2 pipeline" vs "v4 rendering" is
  confusing. Rename `build_v2_generation_stages` →
  `build_revamp_generation_stages` (or simply `build_generation_stages`
  once legacy is gone). Rename `frontend/app/books/[id]/manga/v2/`
  → `frontend/app/books/[id]/manga/` (after legacy reader is killed).

**Exit criteria.**

* `git ls-files | xargs wc -l` is materially smaller.
* `grep -r 'generate_living_panels\|stage_manga_story_design'` returns
  zero hits in `backend/app/` (excluding tests we keep for regression).
* `manga_pipeline_version` env var actually changes behaviour and is
  documented in `README.md`.

---

### Phase E — Per-panel regenerate + critic loop (1 sprint)

**Goal:** when one panel is bad, the user fixes that panel, not the
whole slice. Encourages iteration instead of throwing the slice away.

**Scope.**

* **E1. API.** `POST /manga-projects/{id}/pages/{page_id}/panels/{panel_id}/regenerate`
  that takes optional `note: str` (the user's nudge), an optional
  alternative `image_model`, and re-runs only `panel_rendering_service`
  for that panel. The new image overwrites the previous one and
  appends a `RegenerationLog` entry.
* **E2. UI.** Hover any painted panel in `V4PanelRenderer` → small
  "↻ regenerate" affordance. Click → modal with note field + model
  picker → optimistic UI updates as job completes.
* **E3. Critic LLM (optional toggle).** A `panel_critique_stage` can
  be enabled per-project: after rendering, a vision LLM scores each
  panel 1–5 on (a) character on-model? (b) composition? (c) clarity?
  Anything ≤2 auto-regenerates once. This closes the loop without
  needing the user to babysit.

**Files to touch.**

* New: `services/manga/panel_regeneration_service.py`.
* New: `api/routes/manga_panels.py` (split out of `manga_projects.py`).
* New: `manga_models.py::RegenerationLog` field on `MangaPageDoc`.
* New: `manga_pipeline/stages/panel_critique_stage.py`.
* New: frontend `components/V4Engine/PanelActionsOverlay.tsx`.

**Exit criteria.**

* User can regenerate one panel without touching anything else.
* Cost surfaced in the modal so the user understands what they're
  spending.

---

### Phase F — Cross-panel visual coherence (stretch, 1 sprint)

**Goal:** adjacent panels in the same scene share lighting and line
weight, so a page reads like one artist drew it.

**Scope.**

* **F1. Page-level rendering plan.** Before rendering panels,
  compute a per-page `PageVisualPlan` (palette, key-light direction,
  line weight) authored by an LLM from the page's storyboard. Pass it
  into every `build_panel_prompt` for that page so the renders share
  recipe.
* **F2. Multimodal "previous panel" hint.** When rendering panel
  `n+1`, attach panel `n`'s image as a reference (in addition to the
  character sheets). Gemini multimodal will continue the same look.
* **F3. Tests.** Snapshot test that two panels of the same page have
  similar dominant-color histograms (a cheap proxy for coherence).

This is a stretch because the cost goes up linearly per panel
(2× references vs 1×), and the value is incremental. Defer until A–C
have shipped and we have real user reactions.

---

## 4. Sequenced backlog (8 weeks)

| Week | Phase | Deliverable | Risk |
| ---: | --- | --- | --- |
| 1 | A1, A2 | script_review_stage + voice_validator + tests | medium — adds LLM calls; budget |
| 2 | A3, A4 | continuity_gate + protagonist contract; sample run on 1 book | low |
| 3 | B1, B3 | multi-angle reference sheets; bible silhouette uniqueness | low |
| 4 | B2, B5 | sprite_quality_gate + image-model selector | medium — vision LLM cost |
| 5 | B4, D1, D2 | character library UI + feature flag wired + deprecation warnings | low |
| 6 | C1, C2 | page_composition_stage + RTL flow validator | medium — composition prompts need iteration |
| 7 | C3, C4, C5 | RTL grid + SVG speech bubble + SFX | low |
| 8 | D3, D4, D5, E1, E2 | legacy delete + per-panel regenerate API/UI | low |

Phase E3 (critic LLM) and all of Phase F roll into the next quarter.

---

## 5. Architecture diagram — what the pipeline will look like after Phase C

```text
BOOK UNDERSTANDING (run once per project)
─────────────────────────────────────────
 whole_book_synopsis
   → book_fact_registry
     → global_adaptation_plan
       → global_character_world_bible          [bible_locked = true]
         → bible_silhouette_uniqueness_check   ← Phase B3
           → character_art_direction
             → arc_outline
               → ensure_book_character_sheets  (front/side/back +
                                                expressions)            ← Phase B1
                 → sprite_quality_gate (vision)                         ← Phase B2

PER-SLICE PIPELINE  (run per Ki/Sho/Ten/Ketsu entry from the arc outline)
─────────────────────────────────────────────────────────────────────────
 source_fact_extraction (read-through; book registry already populated)
   → adaptation_plan       (read-through)
     → character_world_bible (read-through)
       → beat_sheet
         → manga_script
           → script_review                 ← Phase A1
             → script_repair               ← Phase A1 (only if review failed)
               → storyboard
                 → page_composition        ← Phase C1
                   → dsl_validation
                     → continuity_gate     ← Phase A3
                       → quality_gate
                         → quality_repair  (only if failed)
                           → dsl_validation (round 2)
                             → quality_gate (round 2)
                               → character_asset_plan
                                 → storyboard_to_v4 (now uses gutter_grid + RTL)
                                   → panel_rendering (multimodal w/ refs)
                                     → panel_quality_gate
                                       → [optional] panel_critique  ← Phase E3
                                         → persistence
```

Things removed (legacy): `agents/orchestrator.py`, `agents/planner.py`,
`agents/dsl_generator.py`, `generate_living_panels.py`,
`living_panel_prompts.py`, all `stage_*.py` shims, `narrative_arc.py`,
`scene_composer.py`, `panel_templates.py` (legacy half),
`api/routes/living_panels.py` (move to legacy/).

---

## 6. Cost & risk notes

| Risk | Mitigation |
| --- | --- |
| Phase A doubles LLM calls per slice | Use a smaller/cheaper model for the editor pass; reserve the strong model for primary script. Track via existing `LLMInvocationTrace`. |
| Phase B vision check costs per asset | Vision call only fires on first generation; cache result in `MangaAssetDoc`. Manual regenerate = explicit user spend. |
| Page composition LLM may overcomplicate layouts | Cap `gutter_grid` complexity in the schema (max 5 cells per row, max 5 rows). Validator rejects out-of-bounds layouts. |
| Deleting legacy might break old projects | Phase D2 ships deprecation warnings first, with a release of grace. Old `BookSummary` rows stay; the legacy reader stays gated behind the flag. |
| RTL frontend break for existing readers | Toggle is per-project (`project_options.reading_direction = "rtl"|"ltr"`). Default `rtl` for new projects, `ltr` for existing. |

---

## 7. Definition of "good enough" — how we know we're done

When a user uploads a 60-page nonfiction PDF and clicks "Generate
manga", the produced project should:

1. Have a frozen bible with 2–4 visually distinct characters whose
   sprites pass the sprite quality gate on the first try ≥ 80 % of the
   time.
2. Generate slices that follow a Ki-Sho-Ten-Ketsu arc the user can see
   in the project dashboard.
3. Produce dialogue where each character's voice is *recognisably
   different* when read aloud (subjective but testable via the voice
   validator).
4. Render pages that read top-right → bottom-left, with at least one
   non-grid layout per slice, and speech-bubble tails pointing at the
   speaker.
5. Let the user fix any single panel without re-running the slice.
6. Cost the user a predictable amount per slice with a visible cost
   breakdown.
7. Live in a codebase where `tree backend/app` does not include the
   word "legacy" outside an explicit `legacy/` folder.

---

## 8. Things we explicitly *do not* change

* **The DSL is right.** Story intent → structural validation → render.
  We add validators, we don't replace the DSL.
* **The V4 rendering schema is right.** Painted backdrop + HTML/SVG
  text overlay is the correct separation of concerns. We just give it
  better composition + lettering.
* **The MangaProject / MangaSlice / MangaPage / MangaAsset data model is
  right.** Already proven in Phases 1–4.
* **Reel renderer.** Untouched, per the existing plan in
  `05_architecture_next_steps.md`.

---

## 9. First commit, after this plan

1. Create the cleanup branch: `git checkout -b manga-quality-and-cleanup`.
2. Commit this doc.
3. Tag the baseline: `git tag pre-manga-quality-baseline`.
4. Open a draft PR titled "Manga quality + cleanup — Phase A start".
5. Start with **A1 (`script_review_stage`)** because it touches the
   smallest surface and gives the most visible dialogue uplift.

That's the plan, boss. The architecture you have is solid; what's
missing is *editorial taste, sprite quality control, page-level
composition, and a janitor with a broom.* Phases A–D address all four,
in roughly that order of pain.
