# Backend Flow

The backend is a FastAPI + Celery + MongoDB application. It owns file upload,
PDF parsing, manga project persistence, LLM orchestration, image/artifact
storage, and job progress.

---

## Directory map

```text
backend/app/
  main.py                         FastAPI app, upload, books, status
  api/routes/
    jobs.py                       job cancellation/control
    manga_projects.py             manga project control plane
    media.py                      image/model/credit helper endpoints
  celery_worker.py                Celery app + PDF parse task helpers
  celery_manga_tasks.py           book/slice manga tasks
  config.py                       environment settings
  models.py                       Book + JobStatus documents
  manga_models.py                 MangaProject/Slice/Page/Asset documents
  domain/manga/                   I/O-free domain models + helpers
  manga_pipeline/                 contexts, stage orchestrators, stages
  services/manga/                 persistence-aware orchestration services
  scripts/                        safe one-shot admin scripts
```

Rule of thumb: domain models do not know about Mongo, Celery, FastAPI, or the
filesystem. Services are allowed to coordinate those things. Stages mutate typed
contexts; they do not secretly save random documents behind your back. Sneaky
I/O is how codebases get haunted.

---

## Settings

`app/config.py` reads environment variables through Pydantic settings.
Important variables:

| Variable | Default | Purpose |
|---|---|---|
| `MONGODB_URL` | `mongodb://localhost:27017` | Mongo connection string |
| `DB_NAME` | `panelsummary` | Mongo database name |
| `REDIS_URL` | `redis://localhost:6379` | Celery broker/backend |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed frontend origins |
| `STORAGE_DIR` | auto-detected `storage/` | PDF/image storage base |
| `UPLOAD_DIR` | `/tmp/uploads` | Temporary upload volume |
| `OPENROUTER_API_KEY` | empty | server-side model-list proxy key |

User-supplied LLM/image keys are passed per request; they are not stored as
project secrets.

---

## FastAPI startup

`main.py` creates the app, installs CORS, registers routers, initializes Beanie,
and ensures storage directories exist.

Registered document models:

- `Book`
- `JobStatus`
- `MangaProjectDoc`
- `MangaSliceDoc`
- `MangaPageDoc`
- `MangaAssetDoc`

Primary routers:

- `/jobs/*` for job control.
- `/manga-projects/*` and `/books/{id}/manga-projects` for manga generation.
- `/images/*`, `/image-models`, `/credits`, `/openrouter/models` from media.

---

## API flow

### Upload and parse

`POST /upload`

1. Validate `.pdf` filename and size.
2. Read bytes and compute SHA-256.
3. Return cached parsed book if the hash already exists.
4. Save PDF to storage.
5. Insert or reset a `Book` document.
6. Queue `parse_pdf_task`.
7. Insert `JobStatus` for polling.

`GET /status/{task_id}` returns status/progress/phase/error/cost fields for PDF
parse and manga generation jobs.

### Book reads

- `GET /books`
- `GET /books/{book_id}`
- `PATCH /books/{book_id}`

These endpoints expose parsed book metadata and lightweight chapter summaries.
They do not return all section text to the frontend.

### Manga project endpoints

Owned by `api/routes/manga_projects.py`:

| Endpoint | Purpose |
|---|---|
| `POST /books/{book_id}/manga-projects` | create or reuse a project |
| `GET /books/{book_id}/manga-projects` | list book projects |
| `GET /manga-projects/{project_id}` | load project state |
| `GET /manga-projects/{project_id}/slices` | list generated slices |
| `GET /manga-projects/{project_id}/pages` | list persisted pages |
| `GET /manga-projects/{project_id}/assets` | list assets + coverage gaps |
| `POST /manga-projects/{project_id}/book-understanding` | queue global book pass |
| `POST /manga-projects/{project_id}/generate-slice` | queue next slice |
| `POST /manga-projects/{project_id}/next-source-slice` | preview next source range |
| `POST /manga-projects/{project_id}/character-sheets` | idempotently materialize assets |
| `POST /manga-projects/{project_id}/assets/{asset_id}/regenerate` | regenerate one asset |
| `POST /manga-projects/{project_id}/assets/{asset_id}/pin` | pin/unpin one asset |

The page endpoint returns `rendered_page` as the only reader payload.

---

## Celery tasks

### PDF parse task

Defined in `celery_worker.py`. It parses the uploaded PDF and updates the `Book`
and `JobStatus` documents.

### Book understanding task

Defined in `celery_manga_tasks.py` as `generate_book_understanding_task`.

Flow:

```text
load project + book
  → skip if already ready and not forced
  → create LLM client
  → run book-understanding service
  → persist project-level artifacts
  → mark JobStatus success/failure
```

### Manga slice task

Defined in `celery_manga_tasks.py` as `generate_manga_slice_task`.

Flow:

```text
load project + book
  → require parsed book and ready understanding
  → create LLM client
  → run generate_project_slice
  → persist slice/pages/assets
  → mark JobStatus success/failure
```

Progress callbacks write human-readable phase labels to `JobStatus` so the UI
can show useful progress instead of a spinner with trust issues.

---

## Book-understanding pipeline

The run-once book pass produces the spine that later slices reuse.

Stages live under `manga_pipeline/stages/book/`:

1. whole-book synopsis,
2. fact registry,
3. global adaptation plan,
4. global character/world bible,
5. silhouette uniqueness check,
6. character art direction,
7. arc outline,
8. character voice cards.

Persisted outputs live on `MangaProjectDoc`. Slice stages hydrate them into
`PipelineContext` as read-only creative context.

---

## Slice-generation pipeline

`services/manga/generation_service.py` builds the stage list.

Current ordered stages:

1. `source_fact_extraction_stage`
2. `adaptation_plan_stage`
3. `character_world_bible_stage`
4. `beat_sheet_stage`
5. `manga_script_stage`
6. `script_review_stage`
7. `script_repair_stage`
8. `storyboard_stage`
9. `dsl_validation_stage`
10. `continuity_gate_stage`
11. `quality_gate_stage`
12. `quality_repair_stage`
13. `dsl_validation_stage` again after repair
14. `continuity_gate_stage` again after repair
15. `quality_gate_stage` again after repair
16. `page_composition_stage`
17. `rtl_composition_validation_stage`
18. `character_asset_plan_stage`
19. `rendered_page_assembly_stage`
20. optional `panel_rendering_stage`
21. optional `panel_quality_gate_stage`

Why the repetition? Repairs can change the storyboard/script, so validators run
again after repair. Yes, it is slightly annoying. It is also correct.

---

## Rendered page contract

The persisted reader payload is assembled by `rendered_page_assembly_stage`.
It combines:

- `StoryboardPage` creative intent,
- optional `PageComposition`,
- panel render artifacts keyed by panel id.

The frontend reads that payload directly. Old empty page payloads are handled by
the dry-run migration helper, not by frontend fallback code.

---

## Character assets

Asset planning is project-level but can be materialized or repaired after the
fact.

Important services:

- `character_sheet_planner.py` plans required expressions/angles.
- `character_library_service.py` persists and mutates library docs.
- `sprite_quality_service.py` performs vision checks.
- `sprite_quality_gate.py` writes QA status back to assets.
- `panel_rendering_service.py` selects pinned/best assets for panels.

Pinned assets win over automatic selection because the user is allowed to be
right. Occasionally. Maybe.

---

## Admin scripts

`app/scripts/migrate_rendered_pages.py` is the current operational script.
It defaults to dry-run and only writes with `--apply`.

Run from `backend/`:

```bash
uv run --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple \
  --allow-insecure-host pypi.ci.artifacts.walmart.com \
  python -m app.scripts.migrate_rendered_pages
```

See [`NEXT_STEPS.md`](NEXT_STEPS.md) for the production handoff.

---

## Tests

Run the backend suite from `backend/`:

```bash
uv run --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple \
  --allow-insecure-host pypi.ci.artifacts.walmart.com \
  pytest tests/ -q
```

Test conventions:

- pure helpers get focused `_v2` test files,
- stage tests build a context, run the stage, assert the mutation,
- serializer/API shape changes get explicit invariant tests,
- every behavioral change should have a test before commit.
