# PanelSummary

PanelSummary turns a PDF into a source-grounded manga adaptation.

Upload a book, let the backend parse it, build a manga project, run a book-level
understanding pass, generate manga slices, and read the result in a Next.js
manga reader. The current app is focused on manga generation; legacy summary,
living-panel, and reel UI surfaces are not part of the active product.

Tiny slogan: **PDF in, manga out, grounded panels first.**

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

- v1 pipeline (the flow above) is the live product surface and is unchanged.
- v2 architecture is complete on the `v2-architecture` branch and fully
  flag-guarded: `use_compiled_context` and `agentic_manga_pipeline_v1`
  default OFF, so v1 behavior is byte-identical until they are enabled.
- Current implementation handoff and merge-readiness map: `NEXT_SESSION.md`.

---

## v2 architecture (flag-guarded)

The v2 lane, ported from the ScrollStack donor repo (ADR-010) and extended
over an 8-session roadmap, adds:

- **Typed contracts** (`backend/app/contracts/`, mirrored in
  `packages/contracts/`) — 30 pydantic models exported to JSON Schema and
  TypeScript, with fixture parity tests.
- **Durable context system** (`backend/app/persistence/`,
  `backend/app/services/`) — source units, scope manifests, project memory
  snapshots with a MemoryDelta merge protocol, artifacts, and idempotent
  generation runs / stage records. MongoDB is the durable authority (ADR-002).
- **Agent plane** (`apps/agent-worker/`, `packages/agent-runtime/`) — a
  Pi-SDK runtime (exact-pinned) behind a domain-tool broker with injection
  walls (ADR-012). Two workers: speed (MiniMax-M2.7-highspeed) and quality
  (MiniMax-M3); model modes are config per purpose, vision is locked to M3,
  and every provider call persists a receipt.
- **Manga rendering lanes** (`docs/research/rendering-lane-matrix.md`) —
  the measured winner for standard pages is lane B: one generated key panel
  per page, deterministically assembled into compiled page geometry
  (`paste_panel_art`), text lettered in code — panel binding 1.0 at
  ~$0.039/page.
- **Whole-book chain** — scope chain planner + executor with cost preflight,
  crash-resume at $0 re-spend, and rolling canon.

Decisions live in `docs/adr/001–012`; per-session evidence in
`docs/evidence/`.

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
      services/manga/             persistence-aware manga services (v1)
      contracts/                  v2 typed contracts (30 pydantic models)
      persistence/                v2 durable-context documents + repositories
      services/                   v2 services (source units, scopes, memory,
                                  context compiler, generation runs, whole book)
      scripts/                    admin scripts
    scripts/                      contract exporter, chain + bake-off scripts
    tests/                        backend test suite
    Dockerfile
  frontend/
    app/                          Next.js routes
    components/                   UI components and MangaReader
    lib/                          API client and DTO types
    Dockerfile
  apps/
    agent-worker/                 v2 agent worker HTTP service (Fastify + Pi)
  packages/
    contracts/                    TS contracts + generated JSON Schemas
    agent-runtime/                Pi-SDK runtime wrapper (pinned)
    fixtures/                     canonical + invalid contract fixtures
  docs/
    adr/                          ADRs 001–012
    evidence/                     per-session receipts, scorecards, seam dumps
    research/                     rendering-lane matrix, art economics
    ARCHITECTURE.md               system overview
    BACKEND_FLOW.md               backend in depth
    FRONTEND_FLOW.md              frontend in depth
    renderer-analysis/            live renderer diagnosis and screenshots
    next-prompt.md                post-roadmap merge checklist + runbook
    REEL_RENDERER.md              future reel renderer notes
  NEXT_SESSION.md                 root implementation handoff + merge-readiness
  reel-renderer/                  parked Remotion experiment
  storage/                        local PDFs/images
  start.sh                        local dev starter (full stack)
  check.sh                        local dev status check
  stop.sh                         local dev stopper
  docker-compose.yml              local container stack
```

---

## Prerequisites

For local development without Docker:

- macOS or Linux shell with `zsh`,
- Python 3.12,
- [`uv`](https://github.com/astral-sh/uv),
- Node 22.19+ (required by the agent workers; the frontend needs 20+),
- npm and pnpm,
- Redis,
- MongoDB reachable from `MONGODB_URL`,
- `MINIMAX_API_KEY` in `backend/.env` for the v2 agent workers.

This repo owns its own `backend/.venv`. Yes, dependency isolation is boring.
Boring is how weekends survive.

---

## Quick start: local scripts

From the repo root:

```bash
./start.sh
```

This starts the full local stack:

- Redis, if available through Homebrew and not already running,
- FastAPI backend at <http://localhost:8000> (API docs at `/docs`),
- Celery worker,
- Next.js at <http://localhost:3000>,
- v2 domain-tool broker at <http://127.0.0.1:8010>,
- v2 agent workers: speed (MiniMax-M2.7-highspeed) at `:8788` and quality
  (MiniMax-M3) at `:8789`.

The agent plane is free to run idle — workers only call MiniMax when a chain
script submits a run. Service tokens are generated once into
`.dev/agent-tokens.env` (gitignored); chain runs reuse them via
`source .dev/agent-tokens.env`.

Check what is up:

```bash
./check.sh
```

Read-only status of every service, including who actually holds each port.
Exit codes: `0` all up, `2` stack stopped, `1` partial.

Logs:

```bash
tail -f .dev/logs/<service>.log   # backend, celery, frontend, broker, worker-speed, worker-quality
```

Stop local services:

```bash
./stop.sh
```

`stop.sh` stops only the PIDs it started plus this app's dev ports
(8000/3000/8010/8788/8789). It never kills Docker itself — if a container
holds a port it tells you which one to stop. Redis is left running because it
may be shared.

---

## Manual local setup

Use this if you do not want the helper scripts.

### Backend

```bash
cd backend
uv venv .venv --python 3.12
uv pip install -r requirements.txt
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

- `.dev/logs/celery.log`,
- `.dev/logs/backend.log`,
- job status in the UI,
- API docs for the exact endpoint response.

---

## Testing and validation

### Backend

```bash
cd backend
uv run pytest tests/ -q
```

### Frontend

```bash
cd frontend
npx tsc --noEmit
npm run build
```

### v2 packages (contracts, agent runtime, agent worker)

```bash
pnpm --filter @scrollstack/contracts test
pnpm --filter @scrollstack/agent-runtime test
pnpm --filter @scrollstack/agent-runtime typecheck
pnpm --filter agent-worker test
node scripts/generate.mjs --check
cd backend && PYTHONPATH=. uv run python scripts/export_contracts.py --check
```

### Scripts and Docker config

```bash
zsh -n start.sh
zsh -n stop.sh
zsh -n check.sh
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
- [`docs/renderer-analysis/findings.md`](docs/renderer-analysis/findings.md) — current manga renderer diagnosis.
- [`docs/next-prompt.md`](docs/next-prompt.md) — paste-ready implementation prompt.
- [`NEXT_SESSION.md`](NEXT_SESSION.md) — root implementation handoff.
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
