# Next Steps

This document is the operational handoff. It intentionally lives outside the
root README so setup docs stay clean and future work does not get buried under
project introduction fluff.

---

## Current status

Code cleanup is complete for the current manga refactor. The remaining work
requires a DB-capable session and a real generated manga slice.

Last verified local checks from the non-DB workspace:

```text
backend: 394 passed, 1 warning
frontend: npx tsc --noEmit clean
frontend: npm run build clean
```

Mongo was not reachable from that workspace, so the migration was not executed.
Do not claim it ran unless a DB-capable session actually captures counts.
Honesty: still undefeated.

---

## Step 1 — run migration dry-run from DB-capable environment

From `backend/`:

```bash
uv run --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple \
  --allow-insecure-host pypi.ci.artifacts.walmart.com \
  python -m app.scripts.migrate_rendered_pages
```

Capture these values from the report:

- `Total manga_pages`
- `Empty rendered_page`
- `Planned rebuilds`
- `Skipped candidates`

Optional scoped dry-run:

```bash
uv run --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple \
  --allow-insecure-host pypi.ci.artifacts.walmart.com \
  python -m app.scripts.migrate_rendered_pages --project-id <manga_project_id>
```

---

## Step 2 — decide migrate vs regenerate

Use the dry-run report to choose:

### Option A: apply migration

Use when the old docs are valuable and `Planned rebuilds` covers the candidates
you care about.

```bash
uv run --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple \
  --allow-insecure-host pypi.ci.artifacts.walmart.com \
  python -m app.scripts.migrate_rendered_pages --apply
```

What the script does:

- rebuilds `RenderedPage` from persisted storyboard snapshots,
- creates empty panel artifact slots keyed by panel id,
- validates through the domain model,
- skips missing/invalid snapshots instead of guessing.

Known limitation: older slices did not persist page composition, so migrated
pages use `composition: null` and rely on deterministic fallback layout.

### Option B: delete/regenerate old docs

Use when the old docs are disposable or the dry-run reports too many skipped
candidates. Regeneration is cleaner than preserving questionable artifacts just
because they exist. Data nostalgia is not architecture.

If deleting docs, record exactly what was deleted and why.

---

## Step 3 — manual visual smoke

After migration or regeneration, generate one real manga slice and open the v2
reader.

Confirm:

- page is not blank,
- speech bubbles render,
- painted fallback/backdrop renders,
- composition caption appears subtly where applicable,
- right-to-left page flow still reads correctly,
- shot-variety warnings still make sense,
- character assets appear when present,
- empty/prompt-only assets degrade gracefully.

Record the book/project/slice used for the smoke. A screenshot is helpful.

---

## Step 4 — only then start Phase 5 polish

Do not start lettering/page-polish work until the DB decision and real visual
smoke are recorded.

Planned Phase 5 candidates:

- bubble-tail aiming,
- collision-aware lettering,
- automatic line breaks for narrow panels,
- SFX font catalogue,
- page-level visual critic,
- optional expression-sheet generation polish.

---

## Prompt for the next agent

```text
Read README.md, docs/ARCHITECTURE.md, docs/BACKEND_FLOW.md,
docs/FRONTEND_FLOW.md, and docs/NEXT_STEPS.md. Run the RenderedPage
migration helper in dry-run mode from an environment that can reach Mongo.
Capture total manga_pages vs empty rendered_page counts. Decide with Mrigesh
whether to run --apply or delete/regenerate old docs. Then generate one manga
slice and manually smoke the v2 reader. Do not start Phase 5 until that smoke
is recorded.
```
