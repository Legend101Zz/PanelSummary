# Hand-off prompt for the next Code Puppy session

Mrigesh \u2014 paste the block between the `===` lines into a fresh Code
Puppy session. Everything outside the block is just your reading
material; the puppy reads only what's inside.

---

```
================================================================================

Hey buddy! Picking up the PanelSummary manga-generation refactor mid-flight.
Project root: /Users/m0t0hu6/Library/CloudStorage/OneDrive-WalmartInc/Desktop/PanelSummary

Before you write a single line of code, do these in order:

1. Read /README.md end-to-end \u2014 12 non-negotiable refactor rules + the
   exact `uv run` test command + layout cheat-sheet.
2. Read /docs/MANGA_PHASE_PLAN.md end-to-end. The "Manga-writer's process
   \u2192 pipeline mapping" section near the bottom is the north-star editorial
   checklist. The "Phase 4.5 sub-decomposition (locked)" section under
   Phase 4 is what you're shipping today \u2014 specifically Sub-phase 4.5a.
3. Read /docs/SESSION_NOTES_2026-05-04_phase4_panel_dsl.md end-to-end.
   That's the running log of every decision made across Phases 4.1\u20134.4.
   THE PRIOR SESSION ENDED WITH A WATCH-LIST: `manga_dsl.py` is at 595/600
   lines. Any new code goes into sibling modules \u2014 the `shot_variety.py`
   precedent is the pattern.
4. Run the test suite to confirm green before touching anything:
   cd backend && uv run \\
     --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple \\
     --allow-insecure-host pypi.ci.artifacts.walmart.com \\
     pytest tests/ -q
   Expected: 397 passed.
   Also: cd frontend && npx tsc --noEmit \u2192 expected: clean.
5. Append to the existing session notes file:
   /docs/SESSION_NOTES_2026-05-04_phase4_panel_dsl.md
   (do NOT create a new notes file; we keep all Phase 4 sub-phase notes
   in the same doc so the running log stays one read.)

------------------------------------------------------------
WHAT YOU'RE SHIPPING THIS SESSION: Phase 4.5a \u2014 backend storage decoupling
------------------------------------------------------------

Goal in one sentence: add a typed `rendered_page` field on `MangaPageDoc`
+ `PipelineResult` + the API response, populated from the typed
`RenderedPage`, without touching the frontend or deleting anything.

Why this shape: the prior session attempted full 4.5 (delete v4 +
rebuild frontend in one PR) and explicitly vetoed it because "every
commit green" + "Beanie schema migration in the same diff as a frontend
rewrite" cannot coexist. 4.5a is the safe foundation step. 4.5b
(fntend cutover) and 4.5c (delete v4) ride on it in later sessions.

Concrete deliverables (each in its own commit, each green):

* `MangaPageDoc.rendered_page: dict[str, Any] = Field(default_factory=dict)`
  added alongside the existing `v4_page`. Default factory means legacy
  docs load fine \u2014 no Beanie migration script needed yet (4.5c does that).
* `PipelineResult` (in `app/domain/manga/types.py`) gets the same
  `rendered_page` field next to `v4_page`.
* The persistence path that writes `MangaPageDoc` (look in
  `app/services/manga/generation_service.py` and friends \u2014 grep for
  `v4_page=` and `MangaPageDoc(`) is updated to write BOTH fields:
    - `v4_page` exactly as today (zero behaviour change for existing
      readers)
    - `rendered_page` derived from `context.rendered_pages` (the typed
      `RenderedPage` already produced by `rendered_page_assembly_stage`
      since 4.2). Use `model_dump(mode="json")` so it round-trips.
* The API response in `app/api/routes/manga_projects.py` (line ~210
  is the current `"v4_page": page.v4_page` dict) surfaces BOTH fields
  side-by-side. Frontend ignores the new one for now \u2014 that's 4.5b.
* New focused test file `tests/test_phase4_5a_rendered_page_persistence_v2.py`
  pinning:
    - `MangaPageDoc.rendered_page` defaults to `{}` (legacy doc compat).
    - When the pipeline writes a page, both `v4_page` AND `rendered_page`
      are populated AND `rendered_page` round-trips through
      `RenderedPage.model_validate(...).model_dump(mode="json")` losslessly.
    - The API serialiser surfaces both keys.

Workflow rules (recap from README \u2014 deal-breakers):

* Files <= 600 lines.
* Domain layer (`app/domain/manga/`) stays I/O-free.
* Pure functions over classes unless the class earns its keep with state.
* Comments explain WHY, not WHAT. Voice reference:
  `app/services/manga/expression_coverage.py` and
  `app/manga_pipeline/shot_variety.py`.
* Every behavioural change is pinned by a test with one-sentence
  docstrings explaining the invariant.
* Commit early, commit often, with prefix `v2 Phase 4: 4.5a \u2014 ...`.
* Never force-push. Tests + tsc must be green BEFORE every commit.
* Do NOT touch the frontend in this session \u2014 4.5b owns that.
* Do NOT delete `v4_page` / `storyboard_to_v4_stage` / `app/v4_types.py`
  in this session \u2014 4.5c owns that. Adding `rendered_page` next to v4
  is the entire job.
* Do NOT reduce LLM usage to save cost \u2014 design around the model's
  strengths. (See the "Working agreement" in MANGA_PHASE_PLAN.md.)

I'm Mrigesh. Be informal. Push back if I ask for something that violates
the rules above (the prior session pushed back on full 4.5 and we agreed
on this decomposition \u2014 follow that pattern).

Confirm you've read README + MANGA_PHASE_PLAN.md + the session notes
file, summarise 4.5a back to me in 3 sentences, then propose your
commit-by-commit breakdown before writing code. Go!

================================================================================
```

---

## Reading material (for you, Mrigesh, not the puppy)

### What shipped in the 2026-05-04 session

Five commits, every one green:

1. `v2 Phase 4: open phase with audit, plan, and session notes` \u2014 audit
   of the v2/v4 panel surface; carved Phase 4 into 4.1\u20134.6.
2. `v2 Phase 4.1: RenderedPage domain model` \u2014 typed `RenderedPage` +
   `PanelRenderArtifact` + aspect-ratio-from-shot-type table.
3. `v2 Phase 4: 4.2 \u2014 storyboard-panel renderer + gate read RenderedPage`
   \u2014 pipeline now produces typed `RenderedPage` AND the legacy
   `v4_pages` shadow side-by-side. Shadow stays until 4.5c.
4. `v2 Phase 4: 4.3 \u2014 shot-variety editorial floor` \u2014 new
   `app/manga_pipeline/shot_variety.py` sibling module with
   `DSL_SHOT_TYPE_DOMINANCE` + `DSL_NO_ESTABLISHING_SHOT` validators.
   Shipped 2 of the originally planned 3 (delta documented in the
   phase plan); other 3 in parking lot.
5. `v2 Phase 4: 4.4 \u2014 storyboarder prompt teaches the LLM the 4.3 rules`
   \u2014 `render_shot_variety_prompt_fragment()` co-located with the
   validators (drift impossible); `storyboard_stage.SYSTEM_PROMPT`
   rewritten to teach rotation / establishing-beat / purpose-drives-shot
   / per-panel composition prose; 12 substring-snapshot tests.

Test count: 330 \u2192 397 (+67 across the session).

### Final checks before you start the next session

Run these to confirm we're handing off a clean tree:

```
cd /Users/m0t0hu6/Library/CloudStorage/OneDrive-WalmartInc/Desktop/PanelSummary
git status                                  # expect: clean
git log --oneline | head -10                # expect: a6a551b at top
cd backend && uv run --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple --allow-insecure-host pypi.ci.artifacts.walmart.com pytest tests/ -q
                                            # expect: 397 passed
cd ../frontend && npx tsc --noEmit          # expect: clean
```

### One eyeball-test recommendation before 4.5a

Before kicking off 4.5a, run ONE real generation against a real book
with the 4.4 prompt active and check the slice's `QualityReport` in
the QA dashboard for these warning codes:

* `DSL_SHOT_TYPE_DOMINANCE`
* `DSL_NO_ESTABLISHING_SHOT`
* `DSL_LOW_SHOT_VARIETY` (the legacy cardinality check)

If any of these fire on representative slices despite the 4.4 prompt
update, the prompt copy needs another tuning pass BEFORE 4.5c (which
deletes the v4 shadow and the safety net for A/B comparison). 4.5a
itself doesn't depend on this \u2014 you can safely ship 4.5a regardless \u2014
but the result tells you whether to also queue a "4.4.1 prompt
re-tune" before 4.5c.

### After 4.5a ships, the queue is

* **4.5b** \u2014 frontend cutover. `frontend/components/V4Engine/` renamed
  to `MangaReader/`, re-typed against `RenderedPage` DTO. WCAG 2.2 AA
  applies. Backend untouched. Rollback = swap one prop.
* **4.5c** \u2014 delete v4. The no-going-back commit. One-shot Beanie
  migration script for any prod docs that pre-date 4.5a.
* **4.6** \u2014 docs + scoreboard close-out for Phase 4.
* **Phase 5** \u2014 Page Composition & Lettering (vision-LLM page critic,
  deterministic bubble-tail aim, SFX font catalogue).
