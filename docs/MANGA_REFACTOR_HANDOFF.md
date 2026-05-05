# Manga Refactor Handoff — Status and Remaining Work

_Last updated: 2026-05-05 by `code-puppy-52d940`._

This is the fast-read handoff for the production-level manga refactor.
It does not replace the canonical roadmap (`MANGA_PHASE_PLAN.md`) or
the detailed running log (`SESSION_NOTES_2026-05-04_phase4_panel_dsl.md`).
It exists so the next session can understand the state in one read
instead of spelunking 900+ lines of session archaeology. Tiny mercy.

---

## Executive state

The refactor is structurally complete through **Phase 4.5c** and the
safe Phase **4.5c.1** cleanup pass is partially shipped.

The big architectural migration is done:

- `RenderedPage` is the canonical page contract.
- The backend no longer writes or serves `v4_page`.
- `context.v4_pages` is gone from the pipeline.
- `storyboard_to_v4_stage` is deleted.
- `app/v4_types.py` and `app/rendering/v4/` are deleted.
- The frontend v2 reader was already cut over to `MangaReader`.
- A dry-run-first one-shot migration helper exists for old pages with
  empty `rendered_page` payloads.
- `frontend/lib/types.ts` has no stale page fallback field or legacy V4
  type aliases.
- Tests were green in this cleanup pass:
  - backend: `394 passed`
  - frontend: `npx tsc --noEmit` clean

What remains is **production hardening**, not the core refactor:

1. Run the migration helper against a reachable DB in dry-run mode and
   decide whether to apply it or regenerate/delete old docs.
2. Run a manual end-to-end visual smoke test.
3. Optionally start Phase 5 lettering/page-polish work.

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

Latest verified state in the 4.5c.1 cleanup pass:

```bash
cd backend && uv run \
  --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple \
  --allow-insecure-host pypi.ci.artifacts.walmart.com \
  pytest tests/ -q
# 394 passed

cd frontend && npx tsc --noEmit
# clean
```

Test count is now 394: 389 post-4.5c tests plus 5 focused tests for
the dry-run migration helper. The earlier 397 → 389 drop was the
expected deletion of eight v4-only tests with the code they pinned.

---

## What is left for production-level cleanliness

### P0 — data migration decision

A DB probe from this workspace could not reach MongoDB:

```text
DB_AVAILABLE=false
ERROR=ServerSelectionTimeoutError: No replica set members found yet
```

So 4.5c.1 shipped a **safe dry-run migration helper** instead of
pretending the data check ran:

```bash
cd backend
uv run --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple \
  --allow-insecure-host pypi.ci.artifacts.walmart.com \
  python -m app.scripts.migrate_rendered_pages
```

Apply only after reviewing dry-run output:

```bash
cd backend
uv run --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple \
  --allow-insecure-host pypi.ci.artifacts.walmart.com \
  python -m app.scripts.migrate_rendered_pages --apply
```

What it does:

- counts total pages and empty/missing `rendered_page` candidates,
- groups candidates by `slice_id`,
- rebuilds `RenderedPage` from persisted `MangaSliceDoc.storyboard_pages`,
- creates empty `PanelRenderArtifact` slots by panel id,
- validates through the domain model,
- skips invalid/missing snapshots with a report instead of guessing.

Important limitation: the current `MangaSliceDoc` schema persists
`storyboard_pages` but not `slice_composition`, so rebuilt pages use
`composition: null` and the reader's deterministic fallback layout.
No image generation or filesystem artifact recovery is attempted.

Decision still required once a DB is reachable: if dry-run reports a
small/irrelevant old-doc set, delete/regenerate them; if it reports
valuable old docs, review and run `--apply`.

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

### P1 — frontend type cleanup ✅

Done in 4.5c.1. `frontend/lib/types.ts` now mirrors the post-v4 API
surface: `MangaProjectPageDoc` carries `rendered_page` only, the
project `engine` field is plain `string`, and the file has no `V4*`
type aliases or stale page fallback wording. `npx tsc --noEmit` is
clean.

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

## Bottom line

The hard part — deleting the split v4/rendered-page architecture — is
done. 4.5c.1 added the safe migration tool and cleaned the frontend
types. What remains before Phase 5 is operational: run the migration
helper against a reachable DB, choose apply vs regenerate/delete, and
finish the manual visual smoke.
