# Session notes — 2026-05-04 — Phase 4: Panel-Craft DSL Upgrade

Agent: `code-puppy-5ef9b7` (continuing from `code-puppy-0c26ab`).
Driver: Mrigesh.

## Goal for this session

Open Phase 4 — collapse the v2/v4 panel surface into ONE structured DSL the
storyboarder LLM emits, the page-composition stage consumes, and the panel
renderer treats as gospel. Within that, force deliberate shot-type variety
the way pro manga editors do.

## Pre-flight (boring but required)

* `pytest tests/ -q` → **330 passed** ✅ (matches README scoreboard).
* `npx tsc --noEmit` → **clean** ✅.
* Read `README.md` + `docs/MANGA_PHASE_PLAN.md` + `docs/MANGA_V2_LLM_ORCHESTRATION_ADR.md`. No other planning docs exist (the 2026-05-04 cleanup deleted the rest).

## Audit findings — current panel surface

### Two parallel panel representations, lossy bridge between them

| Layer | Type | Lives in | Carries |
| --- | --- | --- | --- |
| Storyboard (LLM-authored, validated) | `StoryboardPanel` (Pydantic) | `app/domain/manga/artifacts.py` | `purpose`, `shot_type`, `composition` prose, `action`, `dialogue`, `narration`, `character_ids`, `source_fact_ids` |
| Renderer / viewer wire format | `V4Panel` (dataclass) | `app/v4_types.py` | `type` (splash/dialogue/narration/data/montage/concept/transition), `mood`, `scene`, `pose`, `expression`, `effects`, `emphasis`, `image_path` |
| Bridge | `storyboard_page_to_v4` | `app/rendering/v4/storyboard_mapper.py` | LOSES `shot_type`, `purpose`, `source_fact_ids`, `composition` prose. Folds them into a 3-token `emphasis` and a 7-token `type` and throws the rest away. |

### Concrete defects this creates

1. **Shot type is invisible to the renderer.** `panel_rendering_service.aspect_ratio_for_panel` keys aspect off `V4Panel.type` (panel role), not `shot_type`. An `EXTREME_WIDE` framed `dialogue` panel renders at 1:1. The storyboarder's framing intent is silently discarded.
2. **`composition` prose is dropped on the floor.** The storyboarder writes a sentence about how the panel should be staged. The renderer never sees it — the prompt is composed from V4's `pose` / `expression` / `mood` instead.
3. **Two enums fighting over one job.** `StoryboardPanel.purpose` and `V4Panel.type` are both trying to say "what is this panel for?" with overlapping vocab. Repair-stage routing keys off purpose; renderer routing keys off type; they drift.
4. **Shot-type variety enforcement is too weak.** Only check is slice-wide `MIN_DISTINCT_SHOT_TYPES_PER_SLICE = 3` (in `manga_dsl.py`). Nothing stops three consecutive medium shots, nothing forces a punch shot at the page-turn cell, nothing prevents a flat 4-medium-shot page.
5. **Storyboarder prompt names shot types but never says when to pick which.** The `SYSTEM_PROMPT` in `storyboard_stage.py` says "vary shot types"; nothing tells the LLM "page-turn → close-up/symbolic; emotional turn → close-up; establishing → wide".

### Wire-format / frontend ripple

* `frontend/components/V4Engine/types.ts::V4Panel` mirrors the backend dataclass, so any backend wire change ripples here.
* The frontend currently has no concept of `shot_type` or `purpose` — it lives entirely in the V4 vocabulary.

### Stale-doc cleanup needed

`docs/MANGA_PHASE_PLAN.md` references `MANGA_QUALITY_AND_CLEANUP_PLAN.md`,
`MANGA_QUALITY_AND_CLEANUP_TRACKER.md`, and `manga_creation_system_review_and_plan/`,
which were all deleted in `5c49054`. The Phase 4 section in particular says
"the DSL already exists (`manga_dsl.py`); make it the *only* way panels are
specified" — half-true. The cap/budget DSL exists; the *panel* DSL is split.
This needs a rewrite, not just an expansion.

## Proposed Phase 4 deliverable breakdown

Five small commits, each green and pinned by tests. Order is renderer-first
because the lossy bridge is the structural defect — fix that and the variety
rules have somewhere to land.

### 4.1 — Make StoryboardPanel the renderer's input contract
* New pure helper `app/domain/manga/render_view.py` (or co-locate in `panel_rendering_service`) returning a `RenderPanelView` projection of `StoryboardPanel` — the renderer reads StoryboardPanel directly via this view, never V4.
* `aspect_ratio_for_panel` keys off `shot_type`, with a per-shot table:
  - `EXTREME_WIDE` / `WIDE` → 3:2
  - `MEDIUM` → 1:1
  - `CLOSE_UP` → 4:5
  - `EXTREME_CLOSE_UP` → 9:16
  - `INSERT` / `SYMBOLIC` → 1:1
* `build_panel_prompt` includes the storyboard's `composition` prose verbatim and the `purpose` label so the model sees both.
* Tests pin: shot_type drives aspect; composition prose appears in the prompt; purpose label appears in the prompt.

### 4.2 — Wire `panel_rendering_stage` off `storyboard_pages`, not `v4_pages`
* `panel_rendering_stage.run` reads `context.storyboard_pages` + `context.slice_composition`; renders in the storyboard panel order from composition.
* `image_path` / `image_aspect_ratio` move onto `StoryboardPanel` as optional post-render fields (or a parallel `panel_render_artifacts` map; will pick whichever keeps domain cleaner once I prototype).
* `panel_quality_gate_stage` reads from the storyboard panels directly; V4-shaped checks are translated 1:1.
* Tests pin: rendered panel ids round-trip into storyboard, panel-quality gate still flags the same defects on the new surface.

### 4.3 — Shot-type variety as DSL validators
Three new validators in `app/manga_pipeline/manga_dsl.py`:
* `DSL_REPEATED_SHOT_RUN` — error when ≥3 consecutive panels (in slice reading order) share a `shot_type`.
* `DSL_PAGE_TURN_NO_PUNCH` — warning when a `page_turn_panel_id` panel's `shot_type` is not in `{CLOSE_UP, EXTREME_CLOSE_UP, SYMBOLIC, INSERT, EXTREME_WIDE}`. Bottom-left earns the reveal.
* `DSL_PAGE_FLAT_SHOTS` — warning when a page with ≥3 panels uses only one `shot_type`.
* Update `render_dsl_prompt_fragment` to give per-shot **when-to-pick** guidance, not just a comma-list.
* Tests pin each validator with positive + negative cases.

### 4.4 — V4Page becomes a thin viewer DTO (or dies)
Decision point I want to flag for you (`Mrigesh`) before I commit code:
* **Option A (low-risk):** keep `V4Page` as a *viewer-only* projection. Rename internally so it's clear it's not authoritative. Add `shot_type` and `purpose` onto `V4Panel` so the frontend can show framing badges and use shot-aware sizing. The renderer no longer touches V4.
* **Option B (clean-slate):** delete V4 entirely; serialize `StoryboardPage` directly on the wire; migrate the frontend types + components.
* **My recommendation: A this session, B as a follow-up.** B is the right end-state but it's a 200-line frontend churn that doesn't move the user's needle on quality. A removes the lossy renderer bridge (the actual defect) and surfaces shot info to the FE.

### 4.5 — Docs + scoreboard
* Rewrite the Phase 4 section in `MANGA_PHASE_PLAN.md` with the deliverables above.
* Strip dead refs to `MANGA_QUALITY_AND_CLEANUP_*` and `manga_creation_system_review_and_plan/`.
* Update test scoreboard at the end of the phase.

## Decisions log (locked 2026-05-04 with Mrigesh)

* **Option B confirmed.** V4 dies completely. The wire format IS the
  storyboard (`StoryboardPage` + `PageComposition` + per-panel render
  artifacts), not a translated derivative. No shallow projection layer.
* **Stale-doc nuke approved.** Strip every reference to
  `MANGA_QUALITY_AND_CLEANUP_PLAN.md`,
  `MANGA_QUALITY_AND_CLEANUP_TRACKER.md`, and
  `manga_creation_system_review_and_plan/` from `MANGA_PHASE_PLAN.md`.
* **LLM-first design.** Where there's a choice between a tight heuristic
  and an LLM-grade creative judgement, choose the LLM. Specifically:
  the storyboarder prompt gets production-grade shot-type guidance
  (when to pick each shot, page-turn punch, rhythm rules, per-arc-role
  examples) instead of just "vary shot types".
* **Production-scale persistence.** Rename `MangaPageDoc.v4_page` to
  `rendered_page` carrying a typed `RenderedPage` model_dump
  (storyboard + composition + per-panel render artifacts). Ship a
  one-shot migration script in `scripts/` for any existing dev data
  rather than accumulating a dual-read codepath.
* **Commit prefix:** `v2 Phase 4:` per README rule 8.
* **YAGNI guard:** an LLM-driven shot-design critic stage is *parked*
  for after Phase 4 ships; the DSL validators + upgraded storyboarder
  prompt are the enforcement floor. We add the critic only if variety
  still drifts on real generations.

## Refined deliverable breakdown (Option B)

Six commits. Each commit leaves the suite green and `tsc --noEmit` clean.

### 4.1 — `RenderedPage` domain model + storyboard-shaped renderer contract
* New Pydantic model `RenderedPage` in `app/domain/manga/render_view.py`:
  composes `StoryboardPage`, `PageComposition`, and a typed
  `PanelRenderArtifact` (per-panel `image_path`, `image_aspect_ratio`,
  `used_reference_assets`). Validators ensure every panel id in
  `storyboard_page` has a matching artifact slot (even if empty).
* Add optional `image_path` / `image_aspect_ratio` to `StoryboardPanel`?
  **No** — they live on `PanelRenderArtifact` so the LLM-authored
  artifact (`StoryboardArtifact`) stays creative-only and the post-render
  artifact stays structural. This is the SOLID boundary: storyboard =
  pre-render contract; render_view = post-render contract.
* `panel_rendering_service.build_panel_prompt` rewritten to consume
  `StoryboardPanel` + `PageComposition | None` + bible + art_direction
  directly. Returns a string. Includes the storyboard's `composition`
  prose verbatim and the `purpose` label.
* `aspect_ratio_for_panel(panel: StoryboardPanel) -> str` keys off
  `shot_type`:
  - `EXTREME_WIDE` → 21:9   (cinematic establishing)
  - `WIDE` → 16:9            (room-scale staging)
  - `MEDIUM` → 4:3           (conversational)
  - `CLOSE_UP` → 4:5         (tall portrait)
  - `EXTREME_CLOSE_UP` → 9:16 (extreme tall, eye/lips)
  - `INSERT` → 1:1           (object/text inserts)
  - `SYMBOLIC` → 3:2         (motif beat)
* Tests pin the shot→aspect table, prompt-includes-composition-prose,
  and `RenderedPage` round-trips through `model_dump`/`model_validate`.

### 4.2 — `panel_rendering_stage` + `panel_quality_gate_stage` consume StoryboardPage
* `PipelineContext.v4_pages` → `PipelineContext.rendered_pages: list[RenderedPage]`.
* Delete `storyboard_to_v4_stage`. The new flow is:
  `storyboard_stage` → `page_composition_stage` → `rendered_page_assembly_stage`
  (a tiny pure stage that zips StoryboardPage + PageComposition into
  RenderedPage with empty render artifacts) → `panel_rendering_stage`
  (mutates the artifacts) → `panel_quality_gate_stage`.
* `panel_quality_gate_stage.evaluate_v4_pages` → `evaluate_rendered_pages`,
  reading `RenderedPage.storyboard_page.panels` and the artifacts map.
* Tests pin: `rendered_pages` populated by the new assembly stage;
  panel rendering mutates artifacts in place; the quality gate flags
  the SAME defects (unknown character, no reference attached, etc.) on
  the new shape.

### 4.3 — Shot-variety DSL validators (the editorial floor)
* `manga_dsl.py`:
  - `DSL_REPEATED_SHOT_RUN` (error): >2 consecutive panels in slice
    reading order share a `shot_type`. Reading order respects
    `SliceComposition.panel_order` when present.
  - `DSL_PAGE_TURN_NO_PUNCH` (error): the panel at the
    `page_turn_panel_id` cell has a `shot_type` not in
    `{CLOSE_UP, EXTREME_CLOSE_UP, SYMBOLIC, EXTREME_WIDE}`.
    Page-turns must earn the reveal.
  - `DSL_PAGE_FLAT_SHOTS` (warning): a page with ≥3 panels uses only
    one `shot_type`. Warning because some emotional-escalation pages
    intentionally stack close-ups.
* Tests pin each validator with positive + negative cases, including
  the panel-order-respecting-composition case.

### 4.4 — Production-grade storyboarder prompt (LLM-first shot design)
* `storyboard_stage.SYSTEM_PROMPT` rewritten to give the model real
  shot-design guidance, not platitudes:
  - When to use each shot type (with one-phrase justification per panel
    required in `composition`).
  - Page-turn cell punch rule.
  - Shot rhythm rules (no >2 same in a row; vary across pages).
  - Per-arc-role exemplars (KI: open wide, contract on antagonist;
    SHO: medium-heavy with one close-up per page; TEN: build to extreme
    close-up at reveal; KETSU: settle with mediums into a wide).
* `render_dsl_prompt_fragment` extended with the new validator codes so
  the LLM sees both the rules AND the per-rule failure surface.
* Tests pin: prompt contains shot-rhythm guidance; prompt mentions every
  validator code; prompt asks for per-panel shot justification in
  `composition`.

### 4.5 — Wire-format flip + frontend rebuild
* `MangaPageDoc.v4_page` → `MangaPageDoc.rendered_page`. New field is a
  `RenderedPage`-shaped dict (model_dump output). Old field deleted.
* `MangaPageArtifact.v4_page` → `MangaPageArtifact.rendered_page`.
* `app/services/manga/generation_service.py` writes
  `RenderedPage.model_dump()` instead of v4 dicts.
* `app/api/routes/manga_projects.py` exposes `rendered_page` instead of
  `v4_page`.
* `scripts/migrate_v4_to_rendered_page.py` — one-shot Beanie migration
  for any existing dev data. Idempotent. README of the script explains
  rollback (drop the new field, restore the backup collection it makes).
* Frontend:
  - Delete `frontend/components/V4Engine/` entirely.
  - New `frontend/components/MangaReader/` with `RenderedPageRenderer`,
    `PanelRenderer`, `panel_layout.ts`, `assetLookup.ts`, sub-renderers
    keyed off `purpose` (the storyboard's existing field) instead of
    the V4 `type` enum.
  - `frontend/lib/types.ts` `v4_page` → `rendered_page` with proper
    typed shape (matching backend Pydantic).
  - The reader page (`app/books/[id]/manga/v2/page.tsx`) imports the
    new component tree.
  - The painted-panel backdrop logic (the bit that actually mattered)
    moves into the new `PanelRenderer` unchanged.

### 4.6 — Docs + scoreboard + commit
* Rewrite Phase 4 in `MANGA_PHASE_PLAN.md` as the *shipped* breakdown.
* Update README test scoreboard.
* Final commit closes the phase.

## Blockers
* None — proceeding with 4.1.

## Progress log

### 4.1 — RenderedPage domain model + tests ✅
* `app/domain/manga/render_view.py`: `PanelRenderArtifact`,
  `RenderedPage`, `empty_rendered_page`. Pure Pydantic, I/O-free.
* `app/domain/manga/__init__.py` re-exports the new symbols.
* `tests/test_render_view_v2.py`: 13 invariants pinned (artifact slot
  for every panel, no extras, composition page-index match, panel-order
  permutation, RTL reading order from composition, dedup of
  requested_character_count, model_dump round-trip).
* Test count 330 → 343. tsc clean. No callers yet — the model is dead
  code on its own; 4.2 wires it through the pipeline.
* Convention noted: this repo has no `conftest.py`; every test file
  hand-inserts `backend/` onto `sys.path`. Followed the pattern.

### 4.2 — storyboard-panel renderer + gate read RenderedPage ✅

**Files added**
* `app/services/manga/storyboard_panel_renderer.py` (354 lines) —
  the new render path. Sits next to (not inside) the legacy
  `panel_rendering_service.py` because that file is at 503 lines and
  inlining the new path would push it past 600. The two are NOT
  parallel APIs serving the same caller — legacy is the deprecated
  path, the new file is the migration target. Both vanish into one
  module again in 4.5 once the legacy path is deleted.
  * `_SHOT_TYPE_ASPECT_RATIO`: 21:9 EXTREME_WIDE / 16:9 WIDE / 4:3
    MEDIUM / 4:5 CLOSE_UP / 9:16 EXTREME_CLOSE_UP / 1:1 INSERT /
    3:2 SYMBOLIC. Unknown shot types raise instead of defaulting to
    1:1 — the entire reason 4.2 exists is that the old role-keyed
    table silently flattened framing intent.
  * `aspect_ratio_for_storyboard_panel(panel)` is the only allowed
    accessor; the table itself is private.
  * `build_storyboard_panel_prompt` includes `panel.purpose`,
    `panel.shot_type`, AND `panel.composition` verbatim — the three
    fields the V4 projection used to drop. Stable section order so
    prompt diffs in production logs are content diffs, not layout
    diffs.
  * `render_rendered_pages` mutates each `PanelRenderArtifact` in
    place AND returns the same `PageRenderingSummary` shape the QA
    gate already consumes (so summary plumbing is unchanged).
  * Helpers (`build_asset_lookup`,
    `select_reference_paths_for_characters`, `build_panel_relative_path`,
    `_bible_lock_block`, `_art_direction_recipe_block`,
    `PanelRenderResult`, `PageRenderingSummary`) imported from the
    legacy module — single source of truth, deleted in 4.5.

* `tests/test_panel_pipeline_phase4_2_v2.py` (27 new tests):
  * Assembly stage — 1:1 mapping, artifact slot per panel,
    composition lookup by `page_index` (not list order), missing
    composition tolerated, empty `storyboard_pages` raises.
  * Aspect-ratio table — every `ShotType` enum value covered, table
    keys equal the enum set (a coverage invariant; adding a variant
    without updating the table fails the test).
  * Prompt content — purpose/shot included, composition prose
    verbatim, dialogue rendered with speaker + intent, bible lock
    present per-character, unknown characters silently omitted (the
    QA gate flags those, not the prompt builder).
  * `evaluate_rendered_pages` — unknown character (error), no
    reference attached (warning, not error — panel still ships),
    success-without-path (error — wiring bug), failure-with-path
    (error — wiring bug), clean render emits zero issues.
  * `panel_rendering_stage` end-to-end (monkeypatched renderer +
    tmp image_dir) — verifies artifacts get image_path AND the v4
    shadow sync mirrors that path back onto the legacy v4 dict by
    panel_id. Also verifies the stage raises when `rendered_pages`
    is empty (wiring-bug guard, not a silent no-op).
  * `panel_quality_gate_stage` — short-circuit fires when every
    artifact is in default state (image gen was off), runs when any
    artifact has been touched.

**Files rewritten / extended**
* `app/manga_pipeline/stages/panel_rendering_stage.py` (~135 lines) —
  consumes `context.rendered_pages` directly. New `_sync_v4_shadow`
  tail mirrors per-panel image_path / aspect_ratio onto
  `context.v4_pages` keyed by `panel_id`. Both the helper and the
  shadow are deleted in 4.5 alongside `context.v4_pages`. The stage
  raises `ValueError` when `rendered_pages` is empty rather than
  silently no-opping — 4.2 makes the assembly stage mandatory.
* `app/manga_pipeline/stages/panel_quality_gate_stage.py` — added
  `_evaluate_storyboard_panel` and `evaluate_rendered_pages` (typed
  twins of the v4-shape evaluators, kept around so 4.5 has a clean
  lift-and-delete). Rewrote `run()` to read from `rendered_pages`;
  the short-circuit triggers off any artifact whose `is_rendered` or
  `error` flag is set, so 'image gen was disabled' (every artifact in
  default state) still no-ops the gate the same way the old
  `_renderer_results` empty check did.
* `app/services/manga/generation_service.py` — wired
  `rendered_page_assembly_stage` into `build_v2_generation_stages`
  AFTER `storyboard_to_v4_stage` (the legacy projection still runs
  during the migration window so persistence + V4 frontend keep
  working).

**Test churn (existing tests adjusted, not deleted)**
* `tests/test_panel_quality_gate_stage_v2.py`: helper
  `_context_with_v4_pages_and_bible` now also populates a typed
  `RenderedPage` mirroring the v4 panel — same input shape, both
  surfaces. Added `_rendered_page_for_test` builder. Legacy v4-shape
  unit tests for `_evaluate_panel` / `evaluate_v4_pages` keep
  running (they pin the legacy helpers we keep until 4.5).
* `tests/test_manga_generation_service_v2.py`: stage-order
  expectation updated to include `rendered_page_assembly_stage`.

**Result**
* 370 passed (up from 343 baseline; +27 new). tsc clean.
* No frontend changes — the v4 shadow keeps the V4 viewer happy.

## Next session pickup point

See `/docs/HANDOFF_PROMPT_2026-05-05_phase_4_5a.md` — it has the
ready-to-paste prompt for the next puppy session AND the reading
material for Mrigesh (final checks, eyeball-test recommendation,
queue after 4.5a).

**TL;DR for the next session: Phase 4.5a (backend storage
decoupling).** Phase 4.5 was vetoed as a single PR because a
Beanie-schema migration + frontend rewrite + orchestrator stage
deletion cannot all be one green commit. Decomposed into:

* **4.5a** — add `rendered_page` field on `MangaPageDoc` /
  `PipelineResult` / API alongside the existing `v4_page`. No
  deletions, no frontend changes, no Beanie migration (default
  factory means legacy docs load fine). This is the next session.
* **4.5b** — frontend cutover to `RenderedPage` DTO. Backend
  untouched. Rollback = swap one prop.
* **4.5c** — delete `v4_page` / `storyboard_to_v4_stage` /
  `app/v4_types.py` / `app/rendering/v4/` / frontend `V4Engine/`.
  One-shot Beanie migration script for any prod docs that pre-date
  4.5a. The no-going-back commit.

**Eyeball-test reminder before kicking off the next session:** run
one real generation with the 4.4 prompt active and check the slice's
`QualityReport` for `DSL_SHOT_TYPE_DOMINANCE` / `DSL_NO_ESTABLISHING_SHOT`
warning frequency. If they still fire on representative slices, queue
a "4.4.1 prompt re-tune" before 4.5c (which removes the v4 safety
net). 4.5a itself does NOT depend on this and can ship regardless.

### Watch list (carry forward)
* `backend/app/manga_pipeline/manga_dsl.py` is at **595 lines**, five
  lines under the 600 ceiling. Any further additions there must go
  into sibling modules (the `shot_variety.py` precedent works well).
  Splitting `manga_dsl.py` for its own sake hurts cohesion — don't
  do it just to hit a number.

### 4.4 — storyboarder prompt rev (the editorial intervention) ✅

**The gap 4.4 closed**
* Pre-4.4 the LLM was told only "at least 3 distinct shot types". The
  4.3 dominance + establishing-coverage validators were enforcing
  rules the storyboarder had never seen — so compliance only happened
  via the repair loop, after a wasted generation.
* 4.4 puts the same thresholds into the prompt the storyboarder reads,
  so the first-pass output is closer to what the validators want.

**Files extended**
* `app/manga_pipeline/shot_variety.py` (+50 lines):
  * `MAX_CONSECUTIVE_SAME_SHOT_TYPE = 2` — LLM-only rule (no
    validator; consecutive runs are noisy on short sli
  * `render_shot_variety_prompt_fragment()` — returns a four-bullet
    block: rotation cap, dominance ceiling (referencing
    `DOMINANCE_THRESHOLD` so a future tweak updates prompt + validator
    in one edit), establishing-beat requirement, and the
    purpose-drives-shot pairing rules. No leading/trailing newline so
    the caller controls join behaviour.
* `app/manga_pipeline/manga_dsl.py` (+9 lines, now 595/600 — see
  watch list above):
  * `render_dsl_prompt_fragment` composes
    `render_shot_variety_prompt_fragment()` after the legacy
    cardinality line. Lazy import keeps the import graph unchanged.
* `app/manga_pipeline/stages/storyboard_stage.py` (~10 line edit):
  * `SYSTEM_PROMPT` rewritten to include shot rotation, establishing-
    beat-with-in-medias-res-exception, purpose-drives-shot, AND a
    'each panel needs a one-sentence composition framing note'
    requirement that backs the Phase 4.2 prompt builder (which reads
    composition prose verbatim and cannot recover it from
    action/dialogue).

**Files added**
* `tests/test_storyboarder_prompt_v2.py` (12 tests). Pinned by
  *substring* not whole-text snapshot — verbatim snapshots train
  reviewers to rubber-stamp diffs; substring asserts only break when
  a specific invariant gets dropped. Pins:
  * `render_shot_variety_prompt_fragment` mentions rotation with the
    `MAX_CONSECUTIVE_SAME_SHOT_TYPE` value, dominance ceiling with
 `DOMINANCE_THRESHOLD` percent, establishing beat with
    WIDE/EXTREME_WIDE, purpose-drives-shot pairings.
  * Style: no leading/trailing newline, every line starts with `- `.
  * `render_dsl_prompt_fragment` composes the shot-variety fragment
    AND keeps the legacy 'distinct shot types' line (backwards
    compat — the cardinality validator still fires).
  * `storyboard_stage.SYSTEM_PROMPT` mentions shot rotation,
    establishing beat (with in-medias-res exception), purpose-driven
    shot, and per-panel composition framing.

**Result**
* 397 passed (was 385; +12 new). tsc clean. No frontend changes.
* Zero behaviour changes outside the prompt copy — every existing test
  passed unchanged, which means no test had been pinning the prompt
  text. That hole is now closed.
* Commit: `v2 Phase 4: 4.4 — storyboarder prompt teaches the LLM the 4.3 rules`

**Eyeball-test reminder**
Before starting 4.5, run one real generation with 4.4 active and
check the slice's QualityReport for `DSL_SHOT_TYPE_DOMINANCE` /
`DSL_NO_ESTABLISHING_SHOT` warnings. If the warnings still fire on
representative slices, the prompt needs another tuning pass before
the v4 shadow comes down — you want the safety net while you iterate.

### 4.3 — shot-variety editorial floor ✅

**Files added**
* `app/manga_pipeline/shot_variety.py` (133 lines) — sibling to
  `manga_dsl.py` because that file is at 588 lines and the new
  checks are a different signal from the existing
  `_validate_shot_variety` (which counts *distinct* shot types).
  Pure functions:
  * `evaluate_shot_dominance(pages, threshold=0.70, min_panels=5)` —
    warns when one ShotType > 70% of slice panels. Strictly
    greater-than (7/10 = 70% ships, 8/10 = 80% warns). Skips
    slices < 5 panels because the dominance signal collapses to
    'all panels distinct' on tiny slices, overlapping the
    cardinality check.
  * `evaluate_establishing_coverage(pages)` — warns when zero
    panels in the slice are WIDE or EXTREME_WIDE. Per-slice
    floor, not per-scene; in-medias-res openings stay legal.
  * `evaluate_shot_variety(pages)` — single entry point for
    `validate_storyboard_against_dsl` to call.
  * Constants: `DOMINANCE_THRESHOLD = 0.70`,
    `MIN_PANELS_FOR_DOMINANCE_CHECK = 5`,
    `ESTABLISHING_SHOT_TYPES = {WIDE, EXTREME_WIDE}`.
* `tests/test_shot_variety_dsl_v2.py` (15 tests):
  * Dominance — warns at 80%, silent at 70% (boundary), silent at
    60%, skipped on 4-panel slice, kwarg threshold tunable, kwarg
    default matches module constant (drift guard).
  * Establishing — warns when no WIDE/EXTREME_WIDE present, silent
    with a single WIDE, silent with a single EXTREME_WIDE, silent
    on empty slice. (Cannot construct a page with zero panels —
    StoryboardPage's own validator forbids that, noted in the test.)
  * Entry point — chains both checks, silent on a balanced slice.
  * End-to-end — pinned through `validate_storyboard_against_dsl`
    so a future refactor that forgets to call the new helper from
    the DSL validator entry point fails a wiring test, not just
    the unit tests.

**Files extended**
* `app/manga_pipeline/manga_dsl.py` — wired
  `evaluate_shot_variety` into `validate_storyboard_against_dsl`
  alongside the existing cardinality check. Lazy import inside the
  function to keep `manga_dsl`'s import graph unchanged.

**Result**
* 385 passed (was 370; +15 new). tsc clean. No frontend changes —
  warnings flow through `QualityReport` so the editor UI picks them
  up via the existing dashboard wiring.
* All existing storyboard fixtures already use varied shots, so
  the new warnings are backwards-compatible (no existing test had
  to be updated for content).
* Commit: `v2 Phase 4: 4.3 — shot-variety editorial floor (dominance + establishing)`

---

## Session 2026-05-05 — Phase 4.5a: backend storage decoupling ✅

Agent: `code-puppy-b6a8a2` (continuing from `code-puppy-5ef9b7`).
Driver: Mrigesh.

### Goal

Add a typed `rendered_page` field on `MangaPageDoc` + `PipelineResult`
+ the API response, populated from the typed `RenderedPage`, without
touching the frontend or deleting anything. The safe-foundation step
of the locked 4.5a / 4.5b / 4.5c decomposition. (Recap of why we
decomposed: see "Phase 4.5 sub-decomposition (locked)" in
`MANGA_PHASE_PLAN.md` — full 4.5 in one PR was vetoed because a
Beanie-schema migration + frontend rewrite + orchestrator stage
deletion can't all be one green commit.)

### Pre-flight
* `pytest tests/ -q` → **397 passed** ✅. `npx tsc --noEmit` → clean ✅.
  Matches the end-of-4.4 scoreboard above.
* Read `README.md` (12 rules, layout cheat-sheet) +
  `MANGA_PHASE_PLAN.md` (north-star manga-writer mapping + locked 4.5
  decomposition) + this session notes file end-to-end. No surprises.

### Files extended (no new files except the test)

* `app/manga_pipeline/context.py` — `PipelineResult` gains
  `rendered_pages: list[dict[str, Any]]` (default empty list);
  `PipelineContext.result()` now serialises every entry of
  `context.rendered_pages` via `model_dump(mode="json")` so enums
  (`ShotType.WIDE`, `PanelPurpose.SETUP`) hit Beanie / FastAPI as
  strings without further coercion. Empty-list default is the
  legitimate steady state when image generation is disabled.
* `app/domain/manga/types.py` — `MangaPageArtifact.rendered_page:
  dict[str, Any] = Field(default_factory=dict)` next to the existing
  `v4_page`. The domain-layer twin of `MangaPageDoc` so the
  storage-agnostic shape stays consistent with the Beanie shape.
* `app/manga_models.py` — `MangaPageDoc.rendered_page: dict[str, Any]
  = Field(default_factory=dict)`. The `default_factory` is the whole
  point — every doc that pre-dates 4.5a loads cleanly without a
  migration script. (Migration belongs to 4.5c, alongside the
  `v4_page` removal.)
* `app/services/manga/generation_service.py` — persistence loop now
  pre-computes `rendered_page_dumps = [rp.model_dump(mode="json") for
  rp in final_context.rendered_pages]` once, then writes both
  `v4_page=v4_page` and `rendered_page=rendered_page_dump` on every
  `MangaPageDoc(...)`. Index-aligned with `v4_pages` (both are seeded
  from the same `storyboard_pages` list); short-circuits to `{}` when
  `rendered_pages` is shorter than `v4_pages` so any code path that
  skips the 4.2 assembly stage stays backwards-compatible rather than
  index-erroring.
* `app/api/routes/manga_projects.py` — `_serialize_page_doc` adds the
  `"rendered_page": page.rendered_page` key. Adding a key (vs.
  swapping) keeps the V4 reader's contract stable during the
  migration window; rollback for 4.5b is literally swapping which
  prop the new MangaReader reads.

### Files added

* `tests/test_phase4_5a_rendered_page_persistence_v2.py` (9 tests).
  Each test has a one-sentence docstring per README rule 11. Pins:
  * Default-factory invariants on `MangaPageDoc`,
    `MangaPageArtifact`, `PipelineResult`. `MangaPageDoc` uses
    `model_construct` to bypass Beanie's `init_beanie` guard so the
    test stays a pure unit test (no Mongo, no event loop).
  * `RenderedPage.model_dump(mode="json")` round-trips losslessly
    through `model_validate`; `ShotType` / `PanelPurpose` emit as
    `"wide"` / `"setup"` strings (the actual coercion the persistence
    layer relies on).
  * `MangaPageDoc(rendered_page=<dump>)` is a transparent dict
    carrier — stored byte-for-byte, no mutation.
  * `PipelineContext.result()` actually performs the dump on every
    page in `context.rendered_pages`; empty list still produces a
    valid `PipelineResult`.
  * **Wire-guard via `inspect.getsource(generation_service)`** — both
    `v4_page=v4_page,` and `rendered_page=rendered_page_dump,` appear
    in the source. Cheaper than mocking out half of Mongo to drive
    the full `generate_slice_artifacts` orchestration function. Drop
    either kwarg and the test fails loudly with the exact missing
    string.
  * `_serialize_page_doc` surfaces both keys side-by-side in the API
    payload.

### Commit-by-commit (5 commits, each green at HEAD)

1. `v2 Phase 4: 4.5a — domain layer carries rendered_page next to v4_page`
   (`MangaPageArtifact` + `PipelineResult` + the dump in `result()`).
2. `v2 Phase 4: 4.5a — MangaPageDoc carries rendered_page next to v4_page`
   (Beanie field + WHY-comment naming the migration boundary at 4.5c).
3. `v2 Phase 4: 4.5a — generation service writes both v4_page and rendered_page`
   (the only behavioural change in the session).
4. `v2 Phase 4: 4.5a — API exposes rendered_page next to v4_page`
   (one-line addition to `_serialize_page_doc`).
5. `v2 Phase 4: 4.5a — pin rendered_page persistence invariants (+9 tests)`
   (the focused test file).

### Result

* **406 backend tests passed** (was 397; +9 new). `tsc --noEmit` clean.
* Zero behaviour change for existing readers — V4 frontend untouched
  and still consumes `v4_page` exactly as before. New field is purely
  additive at every layer (domain, persistence, API).
* 4.5a's contract is now provable from the test file alone: legacy
  docs load, new docs round-trip, both fields ship on the wire.

### Watch list (carried forward, plus an addition)

* `backend/app/manga_pipeline/manga_dsl.py` is **still at 595 lines**
  — we did not touch it this session (no DSL changes in 4.5a). The
  `shot_variety.py` precedent remains the established pattern for new
  validators; 4.5a had no need.
* **New watch item:** the persistence loop in
  `app/services/manga/generation_service.py` writes both fields in
  parallel for now. When 4.5c lands, the loop should collapse back to
  `rendered_page=` only and the `rendered_page_dumps` pre-compute can
  go inline if the resulting body still fits comfortably. Don't
  forget to delete the legacy `v4_page=v4_page,` substring guard in
  `tests/test_phase4_5a_rendered_page_persistence_v2.py` at the same
  time — it's a 4.5a-specific invariant and would falsely fail post-4.5c.

### Next session pickup point

**Phase 4.5b — frontend cutover.** Backend stays untouched. Rename
`frontend/components/V4Engine/` to `MangaReader/` and re-type against
the `RenderedPage`-shaped DTO that 4.5a now ships on the API. WCAG
2.2 AA still applies. API still returns BOTH fields, so rollback is
"swap one prop on the page". After 4.5b is green, 4.5c does the
no-going-back deletes (`v4_page` field, `storyboard_to_v4_stage`,
`app/v4_types.py`, `app/rendering/v4/`, the v4 shadow in
`panel_rendering_stage`, and a one-shot Beanie migration script for
prod docs that pre-date 4.5a).

**Eyeball-test reminder still applies before 4.5c (NOT before 4.5b):**
run one real generation with the 4.4 prompt active and check the
slice's `QualityReport` for `DSL_SHOT_TYPE_DOMINANCE` /
`DSL_NO_ESTABLISHING_SHOT` warning frequency. If they still fire on
representative slices, queue a "4.4.1 prompt re-tune" before 4.5c
(which removes the v4 safety net). 4.5b itself does NOT depend on this.

---

## Session 2026-05-05 (cont.) — Phase 4.5b: frontend cutover ✅

Same agent (`code-puppy-b6a8a2`), same session. Mrigesh asked to keep
going through 4.5b after 4.5a landed.

### Goal

Build a `MangaReader/` component tree that consumes the typed
`RenderedPage` field 4.5a now ships on every API response, then wire
the v2 reader page through it. Backend untouched. V4Engine kept
in-tree so legacy docs keep rendering and rollback is a one-line prop
swap.

### Pre-flight
* `pytest tests/ -q` → **406 passed** ✅. `npx tsc --noEmit` → clean ✅.

### Files added (all under `frontend/components/MangaReader/`)

* `types.ts` (80 lines) — local visual constants: `PaletteKey`,
  `MANGA_PALETTES`, `EMPHASIS_WEIGHTS`, `PanelKind`. Forked from
  `V4Engine/types.ts` rather than imported so 4.5c can `rm -r
  V4Engine/` without a frontend co-edit. `PanelKind` is the
  four-entry union (`dialogue | narration | concept | transition`)
  the dispatcher exhausts; intentionally no `splash` because the
  legacy `storyboard_mapper` never emitted it from storyboard panels
  and 4.5b is a behaviour-preserving cutover.
* `derived_visuals.ts` (178 lines) — pure helpers mirroring the
  backend `storyboard_mapper` rules: `derivePanelKind`,
  `deriveEmphasis`, `emphasisOverrideFor`, `deriveEffects`,
  `derivePaletteKey`, `artifactFor`, `primaryCharacter`. Each
  function has a one-paragraph WHY pointing at the matching backend
  invariant. `derivePaletteKey` is a single-return until a future
  enrichment phase (the V4 reader's palette mapping was always
  default-only too — preserving that visually for the cutover).
* `page_layout.ts` (268 lines) — composition path + legacy
  panel-count fallback, both reading from `RenderedPage`. Defensive
  validator falls back to legacy on any malformed `gutter_grid`
  (sums != 100, cell-count mismatch) — the same JSON might come from
  a hand-edited dev fixture and a torn grid is worse than a default
  vertical stack.
* `asset_lookup.ts` (54 lines) — character-asset matching, forked
  from V4Engine for the same 4.5c-deletion reason. Imports
  `V4CharacterAsset` from V4Engine for now (4.5c renames + moves it).
* `MangaPanelRenderer.tsx` (184 lines) — the dispatcher. `switch`
  on `PanelKind` is exhaustive at the type level, so a future kind
  addition surfaces as a tsc error here, never a silent fall-through.
  Painted-backdrop short-circuit + `SfxLayer` + screentone match V4
  verbatim.
* `MangaPageRenderer.tsx` (161 lines) — top-level. RTL gutter-grid
  path + legacy panel-count path + QA page-turn highlight. Same
  `role` / `aria-label` hooks as `V4PageRenderer` so screen-reader
  navigation is unchanged (WCAG 2.2 AA preserved).
* `panels/{Dialogue,Narration,Concept,Transition}Panel.tsx` — four
  sub-renderers consuming `StoryboardPanel` directly:
  * `DialoguePanel` — `speaker_id` / `text` / `intent` (vs. V4's
    `who` / `says` / `emotion`); same SVG bubble + avatar disc
    treatment, same intent → variant table.
  * `NarrationPanel` — atmospheric blockquote, primary character
    name tag, optional `vignette` / `ink_wash` effects.
  * `ConceptPanel` — symbolic / insert reveals. **Surfaces
    `panel.composition` (the storyboarder's editorial intent prose)
    as a small caption.** That field had no home in the V4 projection
    and was lost; now it reaches the screen. Net new editorial
    information visible to the reader, but rendered subtly so it
    reads as a caption, not chrome.
  * `TransitionPanel` — chapter / `to_be_continued` beats.

### Files extended

* `frontend/lib/types.ts` — adds the TS mirror of `RenderedPage`
  and friends (`StoryboardPanel`, `StoryboardScriptLine`,
  `StoryboardPage`, `PageGridRow`, `PageComposition`,
  `PanelRenderArtifact`). Plus `MangaProjectPageDoc.rendered_page`
  next to the existing `v4_page`. Loose `Record<string, unknown>`
  on the wire, narrowed at the consumer — 4.5c will tighten to
  `RenderedPage` once legacy docs are migrated. Now 523 lines
  (was 404).
* `frontend/app/books/[id]/manga/v2/page.tsx` — primary consumer
  swapped:
  * New `narrowRenderedPage(value)` helper: structural narrow from
    the loose API payload. Returns a `RenderedPage` only when
    `storyboard_page.panels` is a non-empty array; null for legacy
    `{}` docs that pre-date 4.5a.
  * `renderedPage` and `legacyV4Page` derived as memoised, mutually
    exclusive `useMemo`s. JSX is a clean three-branch switch:
    rendered → V4 fallback → empty state. **Rollback = swap one
    expression in the JSX condition, every page falls back to
    `V4PageRenderer`.**
  * Imports reorganised; `V4PageRenderer` import kept under a
    clearly-labelled legacy comment naming the 4.5c removal point.
  * Now 337 lines (was 304; +33 for the narrow + fallback branch +
    comments).

### Files NOT touched (intentionally)

* `frontend/components/V4Engine/` — still in-tree, still imported by
  `MangaReader` for the shared `SpeechBubble` / `SfxLayer` /
  `PaintedPanelBackdrop` primitives. 4.5c folds these into the new
  tree atomically when V4Engine is removed. Forking them today would
  double the cleanup at 4.5c.
* Backend, anywhere. 4.5b is frontend-only.

### Commit-by-commit (3 commits for 4.5b, each green at HEAD)

1. `v2 Phase 4: 4.5b — TS mirror of RenderedPage contract`
   (types only; no JSX, no behaviour change).
2. `v2 Phase 4: 4.5b — MangaReader component tree (typed against RenderedPage)`
   (component tree built but not wired; tsc clean).
3. `v2 Phase 4: 4.5b — wire v2 reader page through MangaPageRenderer`
   (the cutover; 1 line is all rollback needs to revert).

### Result

* **406 backend tests still green** (no backend changes). `tsc
  --noEmit` clean. Visual behaviour preserved for all panels except
  the new ConceptPanel caption surfacing `panel.composition` —
  arguably an editorial *improvement* (intent reaches the screen)
  but worth eyeball-confirming in the next manual smoke.
* New code: 1450 lines across 11 MangaReader files + 119 lines of
  TS types + 49 lines of consumer wiring/narrow. Every file ≤ 268
  lines (largest is `page_layout.ts`).

### Watch list (carried forward, with updates)

* `backend/app/manga_pipeline/manga_dsl.py` — still 595/600 lines,
  still untouched. No DSL work in 4.5a or 4.5b; the `shot_variety.py`
  precedent remains the established pattern.
* `app/services/manga/generation_service.py` dual-write loop — still
  flagged for 4.5c collapse alongside the test substring guard
  cleanup.
* **New watch item:** the `ConceptPanel` composition-prose caption is
  the only behaviourally-new element in 4.5b. If it visually competes
  with the painted backdrop or the action headline, dial down the
  opacity (currently `${palette.text}55`) or fence it behind a flag
  before 4.5c lands. This is the only thing the eyeball test below
  needs to actively look for.

### Next session pickup point

**Phase 4.5c — delete the v4 surface (no going back).** Concrete
deliverables:

1. Delete `backend/app/v4_types.py`, `backend/app/rendering/v4/`, the
   v4 shadow in `panel_rendering_stage`, and
   `backend/app/manga_pipeline/stages/storyboard_to_v4_stage.py`.
2. Drop `MangaPageDoc.v4_page` (and the dual-write loop in
   `generation_service.py` — collapse to `rendered_page=` only).
3. Drop `MangaProjectPageDoc.v4_page` and the API key in
   `_serialize_page_doc`.
4. Remove the legacy V4 fallback in
   `frontend/app/books/[id]/manga/v2/page.tsx` and the V4Engine
   import. `rm -rf frontend/components/V4Engine/` after folding
   `SpeechBubble` / `SfxLayer` / `PaintedPanelBackdrop` into
   `frontend/components/MangaReader/chrome/` (or similar shared
   home).
5. Delete the 4.5a test substring guard in
   `tests/test_phase4_5a_rendered_page_persistence_v2.py` for
   `v4_page=v4_page,` — it would falsely fail.
6. **One-shot Beanie migration script** for prod docs that pre-date
   4.5a: walk every `MangaPageDoc` with empty `rendered_page`,
   reconstruct from the existing storyboard + composition (the
   storyboard is the LLM's authoritative artifact and is already
   persisted). Or accept a small dataset loss and document it. TBD
   when 4.5c starts — depends on prod-data state.

**Eyeball-test reminder still applies before 4.5c (NOT urgent before
the next coding session, but required before the v4 deletion):**

* The 4.4 `QualityReport` shot-variety check (DSL_SHOT_TYPE_DOMINANCE
  / DSL_NO_ESTABLISHING_SHOT) on a representative slice.
* The new `ConceptPanel` composition-prose caption — does it read as
  a caption or fight for attention?
* End-to-end: generate one slice, open the v2 reader, confirm the new
  `MangaPageRenderer` path is what's actually firing (network panel:
  the page response should include `rendered_page` with non-empty
  `storyboard_page.panels`; the reader should render through
  MangaPageRenderer — toggle the React DevTools to confirm).

If the eyeball test surfaces a regression, queue a **4.5b.1 fix-up
session** before 4.5c. The dual-write + V4 fallback means we are not
under any pressure to ship 4.5c immediately.


## Session 2026-05-05 (cont.) — Phase 4.5c: delete v4 backend surface ✅

Same agent (`code-puppy-b6a8a2`), same session. Mrigesh asked to keep
going through 4.5c after 4.5b landed and the V4Engine frontend
chrome was folded into MangaReader (`b23e015`).

### Process screw-up (own it)

The handoff prompt this session received was the **stale 4.5a brief**
— it asked for storage decoupling that 4.5a already shipped. I
started typing into `manga_projects.py` before I read `git log`,
which is exactly the wrong order. The tools picked up the in-flight
4.5c working-tree changes from the prior session and I extended
them coherently, but only because the in-flight work happened to
match the documented 4.5c plan. **Lesson written here so the next
session reads it: `git log --oneline` is the first read, before the
prompt, before the README, before anything.**

### Goal

Close 4.5c steps 1, 2, 3, and 5 from the prior pickup-point
checklist. (Step 4 — `rm -rf V4Engine` and chrome fold — already
shipped in `b23e015`. Step 6 — Beanie migration script — is the
sole carry-forward, see below.)

### Pre-flight

* `pytest tests/ -q` → **397 passed** ✅ (the 4.5b post-state).
* `npx tsc --noEmit` → clean ✅.

### Decision: 1 backend commit, not 4

The pickup-point notes implied a per-checklist-item commit series
(4 commits). Reality: the pieces are tightly coupled —
`PipelineContext.v4_pages`, the `panel_rendering_stage` shadow
loop, the `generation_service` dual-write, `storyboard_to_v4_stage`,
`MangaPageDoc.v4_page`, and the API key all reference each other.
A multi-step series would require either (a) staging tests against
half-applied production code, or (b) red intermediate commits.
Both violate "every commit green". One atomic backend commit + one
session-notes commit is the honest answer; the commit message
itemises the 4 checklist items it closes.

### Files changed (one atomic backend commit, `df226b1`)

**Storage / wire surface**

* `app/manga_models.py` — drop `MangaPageDoc.v4_page`. Default
  factory on `rendered_page` keeps pre-4.5a docs loading cleanly;
  they surface as empty `rendered_page` and are expected to be
  regenerated rather than migrated in place (see step 6).
* `app/domain/manga/types.py` — drop `MangaPageArtifact.v4_page`
  (the snapshot twin of `MangaPageDoc`).
* `app/services/manga/generation_service.py` — collapse the
  dual-write loop to `rendered_page=rendered_page_dump,` only. The
  4.5a wire-guard test now flips polarity and asserts
  `v4_page=v4_page,` is **gone** from the source.
* `app/api/routes/manga_projects.py` — drop the `v4_page` key from
  `_serialize_page_doc`. The HTTP response carries `rendered_page`
  exclusively; 4.5b's `MangaPageRenderer` is the only reader.

**Pipeline**

* `app/manga_pipeline/context.py` — drop `v4_pages` from both
  `PipelineContext` and `PipelineResult`. `result()` no longer
  serialises a v4 list.
* `app/manga_pipeline/stages/storyboard_to_v4_stage.py` — **deleted.**
  Removed from `build_v2_generation_stages`; the storyboard now
  flows directly into `rendered_page_assembly_stage`.
* `app/manga_pipeline/stages/panel_rendering_stage.py` — strip the
  v4 shadow-mirror loop. The typed `PanelRenderArtifact` mutation
  is the only contract.
* `app/manga_pipeline/stages/panel_quality_gate_stage.py` — strip
  the dict-walking helpers (`_evaluate_panel`, `_renderer_results`,
  `_result_lookup`, `evaluate_v4_pages`). `evaluate_rendered_pages`
  (the typed walker shipped in 4.2) is now the only path. **From
  225 lines down to ~88.**

**Module sweep**

* `app/v4_types.py` — **deleted** (255 lines).
* `app/rendering/v4/storyboard_mapper.py` — **deleted** (194 lines).
* `app/rendering/v4/__init__.py` — **deleted**.
* `app/rendering/__init__.py` — **deleted** (now-empty package; YAGNI).

**Tests**

* `tests/test_storyboard_to_v4_v2.py` — **deleted.**
* `tests/test_storyboard_to_v4_composition_v2.py` — **deleted.**
* `tests/test_panel_pipeline_phase4_2_v2.py` — drop the v4-shadow-
  mirror test + the `v4_pages=` plumbing on `_ctx`.
* `tests/test_manga_generation_service_v2.py` — drop
  `storyboard_to_v4_stage` from the expected stage order.
* `tests/test_panel_quality_gate_stage_v2.py` — drop the dict-based
  `_evaluate_panel` unit tests + the `evaluate_v4_pages` test + the
  v4 mapper round-trip tests; rename the helper to
  `_context_with_rendered_pages_and_bible`. **From ~478 lines down
  to ~302.**
* `tests/test_phase4_5a_rendered_page_persistence_v2.py` —
  rewritten so the default-factory, round-trip, and wire-guard
  invariants pin the post-4.5c shape. Wire guard now asserts
  `v4_page=v4_page,` is **not** in source and `rendered_page=rendered_page_dump,`
  **is**. API serialiser test asserts `"v4_page" not in payload`.
* `tests/test_manga_pipeline_orchestrator_v2.py` — drop
  `context.v4_pages.append`; use `context.options` to prove the
  second stage ran (still mutable, still observable).
* `tests/test_manga_pipeline_stages_v2.py` — drop the two
  `storyboard_to_v4_stage` tests.

### Result

* **389 backend tests green.** Delta from 397: −8, which is exactly
  the v4-only test count deleted above.
* `npx tsc --noEmit` clean (no frontend changes — the 4.5b
  `rendered_page` wire was already in place; deleting the parallel
  `v4_page` key on the response object is a no-op for the v2 reader
  which never read it).
* Diffstat: **21 files, +144 / −1244.** Net −1100 lines of dead
  code retired.

### Watch list (carried forward)

* `backend/app/manga_pipeline/manga_dsl.py` — still 595/600 lines,
  still untouched. No DSL work happened in 4.5a / 4.5b / 4.5c. The
  `shot_variety.py` precedent remains the documented split pattern.
* `frontend/lib/types.ts` — TS still has `MangaProjectPageDoc.v4_page`
  alongside `rendered_page`. Harmless (just a type that never gets a
  value any more), but a tidy-up belongs in a 4.6 cleanup pass with
  the rest of the legacy `V4*` type aliases that 4.5b forked from
  rather than imported.

### Carry-forward — 4.5c step 6 (Beanie migration script)

**Not shipped this session.** The session-notes pickup point flagged
this as "TBD when 4.5c starts — depends on prod-data state", and
neither the agent nor the ad-hoc handoff has insight into the prod
`MangaPageDoc` collection's distribution of pre-4.5a vs. post-4.5a
docs. The harness for picking the right approach:

* **If most prod docs are post-4.5a** (i.e. were generated after the
  4.5a dual-write landed): the migration is a no-op for those, and
  the small pre-4.5a residue can be either (a) regenerated by
  re-running the slice, or (b) deleted outright. The session-notes
  pickup point explicitly listed "accept a small dataset loss and
  document it" as an option.
* **If a meaningful fraction is pre-4.5a**: write a one-shot script
  that walks `MangaPageDoc` where `rendered_page == {}`, looks up
  the corresponding storyboard + composition (both still persisted
  via `MangaSliceDoc.snapshot`), and reconstructs the
  `RenderedPage` via the same `empty_rendered_page` +
  `panel_rendering_stage` mutation path the live pipeline uses.
  Image artifacts already on disk would be reattached by `panel_id`.

Recommend Mrigesh check the prod collection distribution (
`db.manga_pages.countDocuments({rendered_page: {}})` vs total)
before deciding which path to ship as **4.5c.1**. Either is small
(<150 lines) and isolated; this is a pure operations call, not a
pipeline-design call.

### Eyeball test (still owed before declaring 4.5 done)

The 4.5b notes flagged three things to confirm visually before 4.5c.
**Two of those are now moot** because the V4 fallback is gone —
either MangaPageRenderer fires or the page is blank, and the
network-tab check is replaced by "any v2 reader page that loads is
proof". The remaining one is still owed:

* **End-to-end: generate one slice, open the v2 reader, confirm the
  `MangaPageRenderer` path renders a non-blank page with a bubble,
  a backdrop, and (where applicable) the new `ConceptPanel`
  composition-prose caption.** The shot-variety / DSL_SHOT_TYPE_DOMINANCE
  / DSL_NO_ESTABLISHING_SHOT QualityReport check is also still
  unverified-by-eye.

### Next session pickup point

**Phase 4.5c.1** — pick exactly one of:

1. **Beanie migration script** (data) — see "Carry-forward" above.
   Probably 30 minutes once the prod-data distribution is known.
2. **Frontend type tidy-up** — drop `MangaProjectPageDoc.v4_page`
   from `frontend/lib/types.ts` and any other legacy `V4*` aliases
   the 4.5b fork left behind. ~15 minutes, zero behaviour change,
   tsc-clean is the only check.

Or skip 4.5c.1 entirely and move to **Phase 5** if the manga
phase plan opens a new chapter — the v4 surface is gone, the
foundation is clean, and nothing in 4.5c blocks new feature work.

---

## 2026-05-05 — Phase 4.5c.1 cleanup (`code-puppy-52d940`)

### Required startup ritual

* `git status --short` showed a pre-existing modified
  `docs/MANGA_REFACTOR_HANDOFF.md` (the suggested next-session prompt
  had been removed). I preserved that change and layered this session's
  handoff edits on top.
* `git log --oneline -12` head was `cc46963 v2 Phase 4: 4.6 — document
  refactor status and next-session handoff`.
* Read end-to-end: `README.md`, `docs/MANGA_PHASE_PLAN.md`, and
  `docs/MANGA_REFACTOR_HANDOFF.md`.
* Read the last 120 lines of this running log.
* Baseline checks before coding:
  * backend: `389 passed, 1 warning`
  * frontend: `npx tsc --noEmit` clean

### Data story

Attempted a read-only Mongo probe using the app settings with a short
server-selection timeout. Result:

```text
DB_AVAILABLE=false
DB_URL=mongodb+srv://appcluster.jbd00.mongodb.net/BookReel?retryWrites=true&w=majority
DB_NAME=panelsummary
ERROR=ServerSelectionTimeoutError: No replica set members found yet
```

So no real empty-vs-total production count was available from this
workspace. I did **not** pretend otherwise. Tiny bar, important bar.

### Migration decision

Because the DB was unavailable, this session shipped a safe dry-run
migration helper instead of applying anything:

* New script: `backend/app/scripts/migrate_rendered_pages.py`
* Focused tests: `backend/tests/test_migrate_rendered_pages_v2.py`

The helper:

* defaults to dry-run;
* counts total pages and empty/missing `rendered_page` candidates;
* groups candidates by `slice_id`;
* rebuilds a typed `RenderedPage` from the owning
  `MangaSliceDoc.storyboard_pages` snapshot;
* seeds one empty `PanelRenderArtifact` per storyboard panel id;
* validates through the domain model;
* skips invalid/missing snapshots with a report instead of guessing;
* only writes when explicitly run with `--apply`.

Important limitation: `MangaSliceDoc` currently persists
`storyboard_pages` but **not** `slice_composition`, so rebuilt pages use
`composition: null` and the reader's deterministic fallback layout. No
LLM calls, image generation, or filesystem artifact recovery happen in
this migration. That is deliberate: boring migration > cursed data
spaghetti.

Run from `backend/`:

```bash
uv run --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple \
  --allow-insecure-host pypi.ci.artifacts.walmart.com \
  python -m app.scripts.migrate_rendered_pages
```

Apply only after reviewing dry-run output:

```bash
uv run --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple \
  --allow-insecure-host pypi.ci.artifacts.walmart.com \
  python -m app.scripts.migrate_rendered_pages --apply
```

### Frontend type tidy

`frontend/lib/types.ts` now has no `v4_page`, `V4*`, `V4Engine`,
`V4Page`, `V4Panel`, or `storyboard_mapper` residue. The API-facing
page type carries `rendered_page` only, and `MangaProject.engine` is now
a plain `string` instead of a stale literal union.

### Docs updated

* `docs/MANGA_REFACTOR_HANDOFF.md` now reflects 4.5c.1 status:
  dry-run migration helper shipped, frontend type tidy done, visual
  smoke still owed.
* This running log was appended with the exact DB/test outcome.

### Verification

* Focused migration tests: `5 passed`.
* Full backend suite:
  * command: `cd backend && uv run --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple --allow-insecure-host pypi.ci.artifacts.walmart.com pytest tests/ -q`
  * result: **394 passed, 1 warning**.
* Frontend typecheck:
  * command: `cd frontend && npx tsc --noEmit`
  * result: **clean**.

### Next session pickup point

1. From an environment that can reach Mongo, run the migration helper in
   dry-run mode and capture the empty `rendered_page` count vs total.
2. If dry-run shows valuable old docs, run `--apply`; if the old docs
   are disposable, delete/regenerate them and document that decision.
3. Run the manual visual smoke: generate one slice, open the v2 reader,
   confirm non-blank page, bubbles, painted backdrop/fallback,
   composition caption where applicable, RTL flow, and shot-variety QA.
4. Then Phase 5 can start. No Phase 5 until the eyeball check, because
   pytest still has no taste. Rude but true.

---

## 2026-05-05 — Phase 4.5c.1 README handoff + local smoke (`code-puppy-52d940`)

### User direction

Mrigesh confirmed Mongo will not be reachable from this VPN/workspace
and asked to store migration instructions in a README so another
DB-capable session agent can run them later, then do whatever remains
after that.

### README handoff added

Updated the top-level `README.md` with a dedicated
`Mongo RenderedPage migration handoff` section. It includes:

* dry-run command for `python -m app.scripts.migrate_rendered_pages`,
* `--apply` command,
* optional `--project-id` scoped command,
* explanation of `Total manga_pages`, `Empty rendered_page`,
  `Planned rebuilds`, and `Skipped candidates`,
* explicit warning not to claim the migration ran unless Mongo is
  reachable and the command reports counts,
* limitation that migrated pages use `composition: null` because
  `slice_composition` was not persisted on `MangaSliceDoc`.

Also refreshed stale README status copy so it now says Phase 4.5c.1 is
shipped and the remaining work is DB apply/regenerate decision + real
visual smoke.

### What could be done locally after delegating DB migration

The true manual visual smoke still needs a real generated slice from a
reachable backend/DB. This workspace cannot produce that because Mongo
is unavailable. I did the strongest non-DB local smoke instead:

```bash
cd frontend && npx tsc --noEmit && npm run build
```

Result:

* `npx tsc --noEmit` clean.
* `next build` completed successfully.
* Dynamic route `/books/[id]/manga/v2` built successfully.

This does **not** replace the real visual smoke. It only proves the v2
reader compiles and builds in production mode after the type tidy and
README/docs changes.

### Handoff updated

`docs/MANGA_REFACTOR_HANDOFF.md` now points DB-capable agents to the
README commands and records that local frontend build smoke passed while
real generated-slice visual smoke remains owed.

---

## 2026-05-05 — explicit Mrigesh pickup instructions (`code-puppy-52d940`)

Mrigesh confirmed there is nothing else useful to verify from this
workspace because Mongo access and real generated-slice visual smoke are
blocked here. Added a `Mrigesh next-step instructions` section to
`docs/MANGA_REFACTOR_HANDOFF.md`.

The next DB-capable session should:

1. Read the README section `Mongo RenderedPage migration handoff`.
2. Run the migration helper in dry-run mode.
3. Capture total `manga_pages` vs empty `rendered_page` count.
4. Decide with Mrigesh whether to run `--apply` or delete/regenerate old
   docs.
5. Generate one slice and manually smoke the v2 reader.
6. Only then start Phase 5.

No code changes were made in this note-only follow-up.
