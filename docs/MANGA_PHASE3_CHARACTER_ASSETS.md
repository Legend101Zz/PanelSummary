# Phase 3 — Character & Asset Pipeline

**Status:** Active
**Owner:** Manga generation pipeline
**Companion:** ``MANGA_DSL_SPEC.md`` (Phase 2), ``MANGA_REVAMP_PLAN.md`` (overall roadmap)

---

## 1. The problem Phase 3 fixes

The original pipeline regenerated character asset prompts every slice. Three
real problems came out of that:

1. **Cost** — every slice paid for an LLM round-trip to "invent" prompts the
   bible already specified.
2. **Drift** — the same character ended up with subtly different prompts each
   slice; the image model produced subtly different sprites; the reader saw
   the protagonist change between scenes.
3. **No mechanical visual lock** — the bible's ``visual_lock``,
   ``silhouette_notes``, ``outfit_notes``, and ``hair_or_face_notes`` were
   trusted to the LLM's memory rather than spliced into the prompt as bytes.

Phase 3 replaces all of that with a **deterministic planner**, an
**idempotent library service**, and a **mechanical visual-lock injector**.

---

## 2. The three pieces

### 2.1 Deterministic planner — ``services/manga/character_sheet_planner.py``

Pure function. Given the locked ``CharacterWorldBible`` and a project id,
returns a ``CharacterAssetPlan`` containing, per character:

* ONE reference sheet (front view, neutral, full body — the "model sheet" a
  manga artist draws first).
* N expression sheets (default: ``neutral``, ``determined``, ``distress``).

Every prompt mechanically includes the bible's visual-lock fields. Same
bible → same plan, every time. Zero LLM calls.

### 2.2 Library service — ``services/manga/character_library_service.py``

Owns the project-scoped ``MangaAssetDoc`` rows. The single invariant: **never
regenerate an asset that already exists**. Asset id is the planner's
deterministic id, stored in ``MangaAssetDoc.metadata['asset_id']`` so dedupe is
exact, not fuzzy.

Surface:

* ``list_project_assets(project_id)`` — read the library.
* ``existing_asset_id_set(project_id)`` — set of stable ids.
* ``specs_missing_from_library(planned, existing)`` — pure filter for the
  short-circuit.
* ``ensure_book_character_sheets(project, bible, image_api_key=None)`` —
  idempotent materializer. Generates only what is missing; persists prompt-only
  docs when image generation is disabled so the library is COMPLETE either way.

### 2.3 Mechanical visual-lock injector — ``asset_image_service.build_asset_prompt``

Takes an optional ``character_design`` parameter. When supplied, appends a
``Visual continuity (must be honoured): …`` block built from the design's
visual-lock fields. The LLM-authored prompt cannot lose the character's
identity because the identity is concatenated in afterward.

---

## 3. Pipeline integration

### 3.1 During book understanding

Right after the bible is locked, ``generate_book_understanding`` calls
``ensure_book_character_sheets``. The library populates immediately so by the
time a user clicks "generate slice", the sheets are already there.

### 3.2 During per-slice generation

The per-slice ``character_asset_plan_stage`` is now a thin shim over the
deterministic planner. It exists to populate ``context.asset_specs`` for the
renderer downstream; it makes ZERO LLM calls.

The slice-level ``_build_asset_docs`` checks the library before doing any I/O:
every spec already in the library is skipped. This is the second line of
defense against duplicate generation.

### 3.3 New API endpoint

``POST /manga-projects/{id}/character-sheets`` lets the UI:

* Retry sheet generation after an image-model outage without rerunning the
  expensive book-understanding pipeline.
* Switch a project from prompt-only to image-generating without re-planning
  prompts.

It returns the full library plus ``generated_count`` so the UI can tell whether
real work happened (fully idempotent calls return ``generated_count=0``).

---

## 4. The decision tree, end-to-end

```
User uploads PDF -> Book is parsed -> User creates project
                                      |
                                      v
                        POST /book-understanding
                                      |
                          (LLM-heavy phase, runs ONCE)
                                      |
                                      v
                Bible locked + character library auto-materialized
                                      |
                                      v
                        POST /generate-slice (per slice, many times)
                                      |
                          slice pipeline runs:
                          beat -> script -> storyboard -> DSL gate
                          -> character_asset_plan (deterministic, no LLM)
                          -> _build_asset_docs (skips library hits)
                          -> storyboard_to_v4 -> persist
                                      |
                                      v
                        User reads the manga
```

---

## 5. Tests pinning Phase 3 contracts

* ``test_character_sheet_planner_v2.py`` (15 tests) — determinism, coverage,
  visual-lock injection, optional-block omission, guardrails.
* ``test_character_library_service_v2.py`` (5 tests) — pure dedupe filter
  (``specs_missing_from_library``).
* ``test_asset_prompt_visual_lock_v2.py`` (5 tests) — build_asset_prompt
  appends the visual-lock block when a design is supplied; preserves backwards
  compatibility when not.
* ``test_manga_pipeline_character_asset_plan_stage_v2.py`` (4 tests, rewritten
  for Phase 3) — stage uses planner + does not touch LLM (pinned by an
  ``ExplodingLLMClient`` that asserts on any chat call).

---

## 6. What Phase 3 deliberately does NOT do

* **Panel art generation.** Phase 3 ends at reusable character assets.
  Per-panel rendering (composite the sprite into a scene background) is a
  future phase that uses the asset library as image-model conditioning input.
* **Style transfer.** ``visual_style`` is included in prompts but Phase 3
  does not model image-model-side style training.
* **Asset versioning.** Today, regenerating with ``force=True`` would
  re-create assets with the same ids, replacing the rows. A future phase could
  introduce explicit version pins if a project wants to roll back an asset.

---

## 7. Adding a new expression to the default set

1. Add the expression label to
   ``character_sheet_planner.DEFAULT_EXPRESSIONS``.
2. Update the coverage assertion in
   ``test_character_sheet_planner_v2::test_each_character_gets_every_default_expression``.
3. Decide whether existing projects should backfill the new expression. They
   will NOT automatically — call ``POST /character-sheets`` to materialize the
   missing one (it's idempotent for the others).
