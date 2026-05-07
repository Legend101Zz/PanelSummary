# PanelSummary Architecture

PanelSummary turns a parsed PDF into a manga adaptation. The current product is
not a generic summary app and not a reel app. The core surface is:

1. upload a PDF,
2. parse it into a structured `Book`,
3. create a manga project,
4. build book-level manga understanding,
5. generate source-grounded manga slices,
6. read the persisted `RenderedPage` output in the frontend manga reader.

The design bias is boring on purpose: one API surface, one page contract, and
small pipeline stages. Cleverness is where migrations go to hide with a fake
moustache.

---

## Runtime components

```text
Browser / Next.js
  ↓ HTTP JSON + file upload
FastAPI backend
  ↓ queues slow work
Celery worker
  ↓ reads/writes
MongoDB via Beanie
  ↓ job broker
Redis
  ↓ local files
storage/pdfs + storage/images
```

### Frontend

- Next.js app router.
- Tailwind styling.
- `frontend/lib/api.ts` owns all HTTP calls.
- `frontend/lib/types.ts` mirrors backend response contracts.
- `frontend/components/MangaReader/` renders persisted manga pages.

### Backend

- FastAPI HTTP API.
- Beanie document models on MongoDB.
- Celery for PDF parsing and manga generation jobs.
- Redis broker/backend for Celery.
- Typed manga domain models under `backend/app/domain/manga/`.
- Pipeline stages under `backend/app/manga_pipeline/stages/`.

### Storage

- Mongo stores book metadata, project artifacts, slices, pages, assets, and job
  status.
- PDF uploads live under `storage/pdfs` in local dev.
- Generated image artifacts live under `storage/images` in local dev.
- Docker uses a named `storage_data` volume mounted at `/storage`.

---

## Primary data contracts

### `Book`

Created by `/upload` and filled by the PDF parser task. It contains:

- title/author/status,
- total pages/chapters/words,
- chapter and section boundaries,
- parse progress and error state.

### `MangaProjectDoc`

The long-lived adaptation workspace for one book. It stores:

- style/options,
- book-level understanding artifacts,
- fact registry,
- character/world bible,
- character art direction,
- voice cards,
- arc outline,
- continuity ledger.

### `MangaSliceDoc`

One generated source slice. It stores:

- source range,
- role/index/status,
- new fact ids,
- storyboard snapshots,
- quality report,
- compact LLM traces.

### `MangaPageDoc`

One persisted manga reader page. The canonical payload is `rendered_page`.
That payload is a `RenderedPage` domain model serialized to JSON.

### `MangaAssetDoc`

A character library asset. It can be prompt-only or backed by an image path. It
also stores QA fields like pinned status, silhouette score, outfit score, and
last quality checks.

### `JobStatus`

A small polling document keyed by Celery task id. The UI reads it through
`GET /status/{task_id}` to render progress, phase, cost, and errors.

---

## End-to-end flows

### 1. Upload and parse PDF

```text
Upload page
  → POST /upload
  → Book inserted or cache hit returned
  → parse_pdf_task queued
  → Celery parses chapters/sections/images
  → Book status becomes parsed/failed
  → UI polls /status/{task_id}
```

The upload endpoint is idempotent on SHA-256 of the PDF bytes. Re-uploading the
same parsed PDF returns the cached book instead of re-parsing.

### 2. Create manga project

```text
Book page
  → POST /books/{book_id}/manga-projects
  → MangaProjectDoc created or reused
  → UI renders Manga V2 Lab controls
```

Project creation does not itself guarantee book understanding is ready. The UI
can start or poll book understanding separately.

### 3. Book understanding

```text
Manga V2 Lab
  → POST /manga-projects/{project_id}/book-understanding
  → generate_book_understanding_task queued
  → book-level stages run once per project
  → project stores synopsis, facts, bible, arc, voices
```

This is the expensive global pass. Slice generation refuses to run until it is
ready because slice-level manga without a book spine is just expensive confetti.

### 4. Generate source slice

```text
Manga V2 Lab
  → POST /manga-projects/{project_id}/generate-slice
  → generate_manga_slice_task queued
  → source range chosen
  → typed pipeline stages run in order
  → MangaSliceDoc + MangaPageDoc records are persisted
```

The slice pipeline is responsible for grounding, script quality, storyboard DSL,
page composition, character asset planning, optional panel rendering, and page
assembly.

### 5. Read manga

```text
Reader page
  → list project/pages/slices/assets
  → narrow page.rendered_page to RenderedPage
  → MangaPageRenderer lays out page
  → MangaPanelRenderer renders panel type + bubbles + fallback art
```

The reader does not rebuild old formats. If `rendered_page` is missing or empty,
it shows the empty state. Old data is handled by the migration helper, not by
client-side archaeology.

### 6. Character library

```text
Character library page
  → GET /manga-projects/{project_id}/assets
  → coverage gaps computed from bible + persisted assets
  → user can materialize, regenerate, or pin assets
```

Pinning is a user override for renderer asset selection. Regeneration costs an
image model call; pinning does not.

---

## Pipeline shape

The backend keeps two orchestration levels:

| Level | Purpose | Orchestrator |
|---|---|---|
| Book | Global understanding for a project | `book_orchestrator.py` |
| Slice | Generate the next adapted manga slice | `orchestrator.py` |

Stages are deliberately small functions. The orchestrators only run ordered
stage lists and emit progress. Persistence stays in services/tasks; domain code
stays I/O-free.

---

## Current production hardening gate

Code is structurally complete, but two checks require a DB-capable environment:

1. Run the `RenderedPage` migration helper dry-run and decide apply vs
   regenerate/delete old docs.
2. Generate one real slice and manually smoke the reader.

Those instructions live in [`NEXT_STEPS.md`](NEXT_STEPS.md).

---

## Related docs

- [`BACKEND_FLOW.md`](BACKEND_FLOW.md) — backend modules, APIs, pipeline stages.
- [`FRONTEND_FLOW.md`](FRONTEND_FLOW.md) — routes, components, reader flow.
- [`NEXT_STEPS.md`](NEXT_STEPS.md) — DB migration and manual smoke handoff.
- [`REEL_RENDERER.md`](REEL_RENDERER.md) — future reel renderer placeholder.
