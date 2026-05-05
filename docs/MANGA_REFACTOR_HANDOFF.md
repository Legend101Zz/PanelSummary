# Manga Refactor Handoff — Status, Remaining Work, Next Prompt

_Last updated: 2026-05-05 by `code-puppy-c30264`._

This is the fast-read handoff for the production-level manga refactor.
It does not replace the canonical roadmap (`MANGA_PHASE_PLAN.md`) or
the detailed running log (`SESSION_NOTES_2026-05-04_phase4_panel_dsl.md`).
It exists so the next session can understand the state in one read
instead of spelunking 900+ lines of session archaeology. Tiny mercy.

---

## Executive state

The refactor is structurally complete through **Phase 4.5c**.

The big architectural migration is done:

- `RenderedPage` is the canonical page contract.
- The backend no longer writes or serves `v4_page`.
- `context.v4_pages` is gone from the pipeline.
- `storyboard_to_v4_stage` is deleted.
- `app/v4_types.py` and `app/rendering/v4/` are deleted.
- The frontend v2 reader was already cut over to `MangaReader`.
- Tests were green when committed:
  - backend: `389 passed`
  - frontend: `npx tsc --noEmit` clean

What remains is **production hardening**, not the core refactor:

1. Decide how to handle old persisted `MangaPageDoc`s whose
   `rendered_page` is still `{}`.
2. Do a tiny frontend type cleanup for stale v4 fields/aliases.
3. Run a manual end-to-end visual smoke test.
4. Optionally start Phase 5 lettering/page-polish work.

---

## What we have been doing

The original complaint was not "one bug is broken". It was that the
manga output felt average: weak story spine, incoherent dialogue,
flat panels, drifting characters, and too many loose parallel code
paths. The refactor has been making the manga pipeline behave more
like a real manga production pipeline:

1. understand the book first,
2. ground every scene in source facts,
3. build recognisable characters and sprites,
4. author deliberate panels,
5. render and letter pages from one typed contract.

The major cleanup theme was deleting the old split-brain panel system.
Before this phase, the code carried both:

- `StoryboardPanel` — rich LLM-authored DSL, and
- `V4Panel` / `v4_page` — lossy renderer wire format.

That projection dropped important intent (`shot_type`, `purpose`,
`composition`, source grounding). The refactor moved the system to one
contract: `RenderedPage`, which contains the storyboard plus render
artifacts.

---

## What is done

### Phase 1 — Book spine

Shipped. The pipeline now builds book-level understanding before slice
generation:

- synopsis,
- fact registry,
- adaptation plan,
- character/world bible,
- arc outline,
- voice cards.

Why it matters: manga generation no longer starts blind on a random
slice. It has a spine.

### Phase 2 — Grounding and continuity

Shipped. Script lines cite source facts and slices carry recap memory
forward.

Why it matters: dialogue and scene beats have a factual anchor instead
of free-floating LLM vibes. Vibes are fun; ungrounded vibes are bugs.

### Phase 3 — Sprite and character polish

Shipped. Character library and sprite selection got stronger:

- expression coverage checks,
- outfit coverage score,
- pinned asset selector,
- sprite-bank hit-rate warning.

Why it matters: characters are more likely to stay recognisable and
on-model across panels.

### Phase 4.1 — RenderedPage domain model

Shipped. Added the typed page contract:

- `RenderedPage`,
- `PanelRenderArtifact`,
- `empty_rendered_page`,
- shot-type based aspect ratio helpers.

Why it matters: render output is no longer jammed back into the
creative storyboard object.

### Phase 4.2 — Pipeline reads RenderedPage

Shipped. `panel_rendering_stage` and `panel_quality_gate_stage` were
rewired around typed `RenderedPage`. A small
`rendered_page_assembly_stage` zips storyboard + composition into the
runtime page object.

Why it matters: render and quality checks operate on the same typed
shape the frontend now reads.

### Phase 4.3 — Shot-variety validators

Shipped. Added `shot_variety.py` as a sibling module instead of
bloated `manga_dsl.py` further.

Validators shipped:

- `DSL_SHOT_TYPE_DOMINANCE`
- `DSL_NO_ESTABLISHING_SHOT`

Why it matters: the storyboarder gets pushed away from "wall of medium
shots" syndrome.

### Phase 4.4 — Storyboarder prompt upgrade

Shipped. The system prompt now teaches:

- shot rotation,
- establishing beats,
- purpose-driven shot choice,
- per-panel composition prose.

Why it matters: the validators are the floor; the LLM prompt is the
creative steering wheel.

### Phase 4.5a — Backend storage decoupling

Shipped. Added `rendered_page` beside `v4_page` so the backend could
dual-write safely for one release.

Why it matters: Beanie schema changes and frontend rewrites did not
land in the same risky commit. Boring and safe, exactly how migrations
should be. Annoying? Yes. Correct? Also yes.

### Phase 4.5b — Frontend cutover

Shipped. Added `MangaReader/` typed against `RenderedPage` and wired
the v2 reader through it.

Why it matters: the frontend stopped needing the lossy v4 projection.
Rollback stayed simple while both API fields existed.

### Phase 4.5c — Delete v4

Shipped in two commits:

- `b23e015` — folded V4Engine chrome into MangaReader and removed the
  old frontend engine.
- `df226b1` — deleted the backend v4 surface end-to-end.

Removed:

- `MangaPageDoc.v4_page`,
- `MangaPageArtifact.v4_page`,
- `PipelineContext.v4_pages`,
- `PipelineResult.v4_pages`,
- `storyboard_to_v4_stage.py`,
- `app/v4_types.py`,
- `app/rendering/v4/`,
- v4 shadow sync in `panel_rendering_stage`,
- dict-based v4 panel quality checks,
- v4 API response key,
- v4-only tests.

Why it matters: there is now one page contract. No shadow writes. No
projection layer. No dead frontend engine pretending to be useful.

---

## Current quality signals

Latest verified state at the 4.5c backend deletion commit:

```bash
cd backend && uv run \
  --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple \
  --allow-insecure-host pypi.ci.artifacts.walmart.com \
  pytest tests/ -q
# 389 passed

cd frontend && npx tsc --noEmit
# clean
```

Test count dropped from 397 to 389 because eight v4-only tests were
deleted with the code they pinned. That is expected, not regression.

---

## What is left for production-level cleanliness

### P0 — data migration decision

Some docs generated before 4.5a may have:

```json
{"rendered_page": {}}
```

The code loads them safely because `rendered_page` has a default empty
dict. But the reader needs a real `RenderedPage` to render old pages.

Next decision:

- If old manga docs do not matter, delete/regenerate them.
- If they matter, write a one-shot migration script.

Suggested prod/preprod check:

```javascript
db.manga_pages.countDocuments({ rendered_page: {} })
db.manga_pages.countDocuments({})
```

If migration is needed, rebuild `rendered_page` from the persisted
`MangaSliceDoc.snapshot` storyboard + composition where possible, then
reattach image artifacts by `panel_id`.

### P0 — manual visual smoke

Generate one slice and open the v2 reader.

Confirm:

- page is not blank,
- speech bubbles render,
- painted backdrops render,
- `ConceptPanel` composition caption looks subtle,
- RTL/page flow still reads correctly,
- shot-variety warnings still make sense.

Automated tests can prove the DTO shape. They cannot prove the page
looks good. Sadly, pytest has no taste. Yet.

### P1 — frontend type cleanup

`frontend/lib/types.ts` still contains stale v4-era fields/aliases such
as `MangaProjectPageDoc.v4_page`. Runtime no longer uses them, but they
are now misleading.

Do this after the migration decision or as a tiny standalone cleanup:

- drop `MangaProjectPageDoc.v4_page`,
- remove unused `V4*` type aliases,
- run `npx tsc --noEmit`.

### P1 — update any external docs/screenshots

If product docs, demo notes, or screenshots still mention V4Engine or
`v4_page`, update them. None were found in `/docs` besides historical
session notes.

### P2 — Phase 5 production polish

Once migration + smoke are done, move to Phase 5:

- SFX font catalogue,
- bubble-tail aiming,
- collision-aware lettering,
- automatic line breaks for narrow panels,
- page-level vision critic,
- optional expression-sheet generation.

That is feature polish, not a blocker for the v4 migration.

---

## Do not regress these rules

- Keep files under 600 lines.
- `manga_dsl.py` is still at roughly 595/600 lines; add sibling
  modules instead of stuffing more into it.
- Domain layer stays I/O-free.
- Prefer pure helpers over new classes unless state earns its keep.
- Every behaviour change gets a focused test with a one-sentence
  docstring.
- Backend test command uses `uv` with the Walmart index flags.
- Run `npx tsc --noEmit` for frontend changes.
- Commit only green states.

---

## Suggested next-session prompt

Copy/paste this into the next Code Puppy session:

```text
Hey buddy — continue the PanelSummary manga refactor cleanup.
Project root: /Users/m0t0hu6/Library/CloudStorage/OneDrive-WalmartInc/Desktop/PanelSummary

Before coding, do these in order:
1. Run `git status --short` and `git log --oneline -12` so you know the real repo state.
2. Read `/README.md` end-to-end.
3. Read `/docs/MANGA_PHASE_PLAN.md` end-to-end.
4. Read `/docs/MANGA_REFACTOR_HANDOFF.md` end-to-end.
5. Read the last 120 lines of `/docs/SESSION_NOTES_2026-05-04_phase4_panel_dsl.md`.
6. Run backend tests:
   cd backend && uv run \
     --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple \
     --allow-insecure-host pypi.ci.artifacts.walmart.com \
     pytest tests/ -q
7. Run frontend typecheck:
   cd frontend && npx tsc --noEmit

Context:
- Phase 4.5c code deletion is shipped.
- `RenderedPage` is now the only backend/API page contract.
- v4 backend/frontend surface is deleted.
- The remaining production cleanup is data migration decision + frontend type tidy + manual visual smoke.

Your task:
A. First, inspect the data story. If a DB is available, count `MangaPageDoc`s with empty `rendered_page` vs total. If DB is not available, write a safe dry-run migration script but do not pretend it was executed.
B. Based on that, either:
   - write a one-shot migration script that rebuilds `rendered_page` from persisted slice snapshots, OR
   - document the decision to delete/regenerate old docs.
C. Then do the frontend type tidy: remove stale `v4_page` / unused V4 type aliases from `frontend/lib/types.ts`, with `tsc --noEmit` clean.
D. Append results to `/docs/SESSION_NOTES_2026-05-04_phase4_panel_dsl.md` and update `/docs/MANGA_REFACTOR_HANDOFF.md`.

Rules:
- Do not reintroduce `v4_page`, `v4_pages`, `V4Engine`, `app/v4_types.py`, or `app/rendering/v4/`.
- Do not touch `manga_dsl.py` unless absolutely required; it is at the 600-line watch limit.
- Every commit must be green.
- Commit prefix: `v2 Phase 4: 4.5c.1 — ...`.
- Be informal, but be pedantic about DRY/YAGNI/SOLID. No cursed migration spaghetti.

When done, tell Mrigesh:
- whether old docs need migration,
- what script/cleanup shipped,
- exact test results,
- what remains before Phase 5.
```

---

## Bottom line

The hard part — deleting the split v4/rendered-page architecture — is
done. What remains is the responsible adult work: data migration choice,
visual smoke, and small type/doc polish.
