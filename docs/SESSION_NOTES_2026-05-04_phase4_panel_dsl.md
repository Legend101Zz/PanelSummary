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

## Next session pickup point
* If this session ends mid-phase, the pickup is whichever of 4.1–4.6 is
  open — each deliverable is independently green and committable. The
  hardest one is 4.5 (wire flip + frontend); start fresh on it if it
  hasn't been begun, never half-flip the wire.
