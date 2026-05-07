# PanelSummary

PanelSummary turns a PDF into a source-grounded manga adaptation.

Upload a book, let the backend parse it, build a manga project, run a book-level
understanding pass, generate manga slices, and read the result in a Next.js
manga reader. The current app is focused on manga generation; legacy summary,
living-panel, and reel UI surfaces are not part of the active product.

Tiny slogan: **PDF in, manga out, fewer hallucinated nonsense goblins.**

---

## What the app does

PanelSummary is built around one production flow:

1. **Upload PDF** — parse and cache a book by file hash.
2. **Create manga project** — persistent adaptation workspace for that book.
3. **Build book spine** — synopsis, facts, character/world bible, art direction,
   arc outline, and voice cards.
4. **Generate manga slice** — pick the next source page range and adapt it into
   grounded script, storyboard, page composition, assets, and pages.
5. **Read manga** — render persisted `RenderedPage` payloads in the frontend.
6. **Manage character assets** — materialize, regenerate, pin, and QA character
   library entries.

The system is intentionally pipeline-shaped. Each stage has one job, and the
reader consumes one page contract. DRY, YAGNI, SOLID — yes, even for comics.

---

## Current status

- Backend/API page contract: `RenderedPage`.
- Frontend reader: `frontend/components/MangaReader/`.
- Core refactor code: complete and green locally.
- Remaining production handoff: DB migration decision + real visual smoke.

Operational next steps live in [`docs/NEXT_STEPS.md`](docs/NEXT_STEPS.md) so
this README can stay focused on project setup and day-to-day development.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15, React 19, Tailwind, TypeScript |
| Backend | Python 3.12, FastAPI, Pydantic, Beanie |
| Jobs | Celery |
| Broker/cache | Redis |
| Database | MongoDB |
| Package managers | `uv`, `npm` |
| Optional future video | Remotion under `reel-renderer/` |

---

## Repository layout

```text
PanelSummary/
  backend/
    app/
      main.py                     FastAPI app
      api/routes/                 HTTP routers
      domain/manga/               I/O-free manga domain models
      manga_pipeline/             contexts, orchestrators, stages
      services/manga/             persistence-aware manga services
      scripts/                    admin scripts
    tests/                        backend test suite
    Dockerfile
  frontend/
    app/                          Next.js routes
    components/                   UI components and MangaReader
    lib/                          API client and DTO types
    Dockerfile
  docs/
    ARCHITECTURE.md               system overview
    BACKEND_FLOW.md               backend in depth
    FRONTEND_FLOW.md              frontend in depth
    NEXT_STEPS.md                 DB/manual-smoke handoff
    REEL_RENDERER.md              future reel renderer notes
  reel-renderer/                  parked Remotion experiment
  storage/                        local PDFs/images
  start.sh                        local dev starter
  stop.sh                         local dev stopper
  docker-compose.yml              local container stack
```

---

## Prerequisites

For local development without Docker:

- macOS or Linux shell with `zsh`,
- Python 3.12,
- [`uv`](https://github.com/astral-sh/uv),
- Node 20+; Node 24 is recommended,
- npm,
- Redis,
- MongoDB reachable from `MONGODB_URL`,
- LLM provider API key supplied in the UI when generating.

Walmart environment note: use the Walmart Python index for `uv` commands:

```bash
--index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple \
--allow-insecure-host pypi.ci.artifacts.walmart.com
```

Do not install dependencies into the Code Puppy venv. This repo owns its own
`backend/.venv`. Yes, dependency isolation is boring. Boring is how weekends
survive.

---

## Quick start: local scripts

From the repo root:

```bash
./start.sh
```

This starts:

- Redis, if available through Homebrew and not already running,
- FastAPI at <http://localhost:8000>,
- API docs at <http://localhost:8000/docs>,
- Celery worker,
- Next.js at <http://localhost:3000>.

Logs:

```bash
tail -f /tmp/panelsummary-backend.log
tail -f /tmp/panelsummary-celery.log
tail -f /tmp/panelsummary-frontend.log
```

Stop local services:

```bash
./stop.sh
```

`stop.sh` stops only app PIDs and ports 8000/3000. It intentionally does not
kill port 8080, Teams, or Code Puppy. We are trying to run software, not start a
workplace incident.

---

## Manual local setup

Use this if you do not want the helper scripts.

### Backend

```bash
cd backend
uv venv .venv --python 3.12
uv pip install \
  --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple \
  --allow-insecure-host pypi.ci.artifacts.walmart.com \
  -r requirements.txt
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

In a second terminal:

```bash
cd backend
source .venv/bin/activate
celery -A app.celery_worker worker --loglevel=info --pool=solo
```

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

Open <http://localhost:3000>.

---

## Docker setup

Docker Compose starts Mongo, Redis, backend, Celery, and frontend:

```bash
docker compose up --build
```

Open:

- frontend: <http://localhost:3000>,
- backend: <http://localhost:8000>,
- API docs: <http://localhost:8000/docs>.

Stop containers:

```bash
docker compose down
```

Remove local Docker data volumes only when you intentionally want to wipe local
Mongo/storage state:

```bash
docker compose down -v
```

The compose file mounts:

- Mongo data in `mongo_data`,
- generated PDFs/images in `storage_data`,
- temporary uploads in `pdf_uploads`.

---

## Environment variables

The backend reads settings from environment variables or `backend/.env`.

| Variable | Default | Description |
|---|---|---|
| `MONGODB_URL` | `mongodb://localhost:27017` | Mongo connection string |
| `DB_NAME` | `panelsummary` | database name |
| `REDIS_URL` | `redis://localhost:6379` | Celery broker/backend URL |
| `CORS_ORIGINS` | `http://localhost:3000` | comma-separated allowed origins |
| `STORAGE_DIR` | auto-detected `storage/` | generated PDFs/images base |
| `UPLOAD_DIR` | `/tmp/uploads` | temporary upload location |
| `SECRET_KEY` | dev value | app secret for local use |
| `OPENROUTER_API_KEY` | empty | model-list proxy key, optional |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | frontend API base URL |

Example `backend/.env`:

```env
MONGODB_URL=mongodb://localhost:27017
DB_NAME=panelsummary
REDIS_URL=redis://localhost:6379
CORS_ORIGINS=http://localhost:3000
STORAGE_DIR=../storage
UPLOAD_DIR=/tmp/uploads
SECRET_KEY=dev-secret-change-me
```

Never commit real API keys or sensitive PDFs. The `.gitignore` excludes common
env and generated dependency folders, but humans still have to human.

---

## Common user workflow

1. Start the stack.
2. Open <http://localhost:3000>.
3. Upload a PDF.
4. Wait for parsing to complete.
5. Open the book page.
6. Create or load a manga project.
7. Run book understanding.
8. Generate a source slice.
9. Open the manga reader.
10. Review the character library if assets need repair/pinning.

If manga generation fails, check:

- `/tmp/panelsummary-celery.log`,
- `/tmp/panelsummary-backend.log`,
- job status in the UI,
- API docs for the exact endpoint response.

---

## Testing and validation

### Backend

```bash
cd backend
uv run \
  --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple \
  --allow-insecure-host pypi.ci.artifacts.walmart.com \
  pytest tests/ -q
```

### Frontend

```bash
cd frontend
npx tsc --noEmit
npm run build
```

### Scripts and Docker config

```bash
zsh -n start.sh
zsh -n stop.sh
docker compose config
```

`docker compose config` requires Docker locally. If Docker is unavailable, at
least keep the YAML readable and review the service names/ports.

---

## Documentation

Start here:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system architecture.
- [`docs/BACKEND_FLOW.md`](docs/BACKEND_FLOW.md) — backend flow in depth.
- [`docs/FRONTEND_FLOW.md`](docs/FRONTEND_FLOW.md) — frontend flow in depth.
- [`docs/NEXT_STEPS.md`](docs/NEXT_STEPS.md) — current DB/manual-smoke handoff.
- [`docs/REEL_RENDERER.md`](docs/REEL_RENDERER.md) — future reel renderer notes.

The old phase/session archaeology docs were intentionally removed. Git history
still has them if you need the museum tour.

---

## Development principles

- Keep production code cohesive and small.
- Prefer pure helpers over stateful classes unless state earns its keep.
- Domain models stay I/O-free.
- Do not add compatibility branches for deleted contracts.
- Every behavior change gets a focused test.
- Run backend and frontend checks before committing.
- Commit green states only.
- Never force-push.

If a future feature is not wired end-to-end, document it as future work instead
of advertising a button that leads nowhere. Dead buttons are UX jump scares.

---

## Future reel renderer

A Remotion experiment lives under `reel-renderer/`, but it is not wired into the
current app. See [`docs/REEL_RENDERER.md`](docs/REEL_RENDERER.md) before adding
any reel UI, startup script, or backend job.
