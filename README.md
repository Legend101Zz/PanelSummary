# PanelSummary (BookReel)

Upload a book PDF, press **Generate**, and read a source-grounded manga adaptation of it.

PanelSummary reads the whole book, plans how it becomes pages, and writes each page as a
structured plan (panels, camera, characters, lettering). A deterministic renderer draws
every page as ink-and-screentone SVG: characters, places, props, effects, balloons and
lettering are all code. No image-generation model is used. Every page records which parts
of the book it adapts, and the reader can show them.

## How it works

```text
PDF ──► parse job ──────────► sections + page-true source units          backend (PyMuPDF)
          │
Generate ─┼─► BOOK_UNDERSTANDING  cast + looks, places, claims            ┐
          ├─► ADAPTATION_PLAN     pages, beats, claim → page ledger       │ MiniMax through the
          └─► MANGA_PAGE × N      one session per page, 4 in parallel:    │ sealed Pi harness
                                  preview (rendered PNG, vision) → submit ┘ (apps/agent-worker)
                                  submit = validate + render SVG           packages/manga-render
          ▼
MongoDB: edition, artifacts, pages (spec + SVG + panel geometry + receipts)
          ▼
Reader: shows the persisted SVG; panel mode moves the camera over the stored geometry
```

- **One path to the model.** Every MiniMax call goes through `apps/agent-worker`, which runs
  a sealed Pi session (`packages/agent-runtime`, Pi 0.80.10 pinned): no built-in tools, no
  ambient files, only the goal's domain tools, source text tagged as untrusted data, and
  limits on turns, tool calls, submissions, cost and time. The backend never holds the key.
- **Goals and tools.** Understanding and plan submit one JSON candidate each; a validator
  replies `ACCEPTED` or lists every error to fix. A page goal can `preview_page` (the
  renderer's issues plus the rendered PNG for M3 vision) before `submit_page`.
- **Visible failure.** A page that fails every attempt is stored as `failed` with its
  reason and shown as a failed page. An edition with failed pages ends
  `completed_with_failures`, and the coverage report lists the claims those pages carried.
  Resume redraws only failed or pending pages; nothing accepted is paid for twice.
- **Faithfulness.** Every lettered line is labelled `quote`, `paraphrase`, `dramatized` or
  `metaphor`, and every panel cites its source units and PDF pages. The reader's Sources
  drawer shows them.

The generation policy (models per goal, thinking levels, retries) came from measured
experiments: [`docs/rebuild/EXPERIMENTS.md`](docs/rebuild/EXPERIMENTS.md). The current policy is
decision D13 in [`docs/decisions.md`](docs/decisions.md). That file also holds every other
decision and its reason. The launch notes are indexed in
[`docs/launch/README.md`](docs/launch/README.md).

## Requirements

- macOS or Linux.
- Node 22.19 or newer, and pnpm 10.15.1 (`corepack enable` gives you the pinned pnpm).
- Python 3.12 and `uv`. Use 3.12 exactly. See step 2 below.
- `mongod` (for example `brew install mongodb-community`), unless you set
  `PANELSUMMARY_MONGODB_URL`.
- A MiniMax API key (Anthropic-compatible endpoint). `start.sh` looks for it in this order:
  `$MINIMAX_API_KEY`, then `backend/.env` (`MINIMAX_API_KEY=`), then the macOS Keychain item
  `minimax_api_key`. It passes the key only to the agent worker and never prints it.
  `start.sh` stops with an error if it finds no key.

## Run it

```sh
git clone https://github.com/Legend101Zz/PanelSummary
cd PanelSummary
git checkout release/v0.1                                   # the v0.1 launch branch

# 1. Install the workspace and the frontend (start.sh does this too if you skip it)
pnpm install --frozen-lockfile
(cd frontend && npm ci)

# 2. Make the backend environment with Python 3.12
(cd backend && uv venv -p 3.12 && uv pip install -r requirements.txt)

# 3. Start, verify, stop
./start.sh     # starts everything, prints the URL
./check.sh     # status of worker, API, runner, frontend
./stop.sh      # stops only what start.sh started
```

Step 2 is not optional. If `backend/.venv` does not exist, `start.sh` runs a plain `uv venv`.
`uv` then picks the newest Python on your machine. With Python 3.14 the install of
`pydantic-core` fails to build. If a failed `start.sh` left a `backend/.venv` behind, remove it
(`rm -rf backend/.venv`) and do step 2. A later `start.sh` would skip the install because the
directory exists.

After `start.sh` prints the URL, open it. The shelf page ("Your shelf") must show. Also open
`http://127.0.0.1:8000/docs` (the API) and run `curl http://127.0.0.1:8000/health`. It must
answer `{"status":"ok", ...}`.

| Service | Where |
|---|---|
| Frontend (reader) | http://localhost:3100 |
| API | http://127.0.0.1:8000 (docs at `/docs`) |
| Agent worker (MiniMax harness) | 127.0.0.1:8788 (token-protected, loopback only) |
| Job runner | `python -m app.runner` (no port) |
| MongoDB | 127.0.0.1:27018, data in `.dev/mongo` |

### Change the ports

Another program can use these ports. Set these variables to move the stack. Use the same values
for `./check.sh`, because it reads the same variables. `./stop.sh` needs none: it stops the
processes by the pid files in `.dev/pids`.

```sh
export PANELSUMMARY_WEB_PORT=3240 PANELSUMMARY_API_PORT=8140 \
       PANELSUMMARY_WORKER_PORT=8804 PANELSUMMARY_MONGO_PORT=27036
./start.sh
```

You can also set `PANELSUMMARY_DB_NAME` to use a different database name. Never use port 3000.
`start.sh` refuses it as the web port. Do not stop or probe the process on it.

### Database

The stack uses its own local MongoDB. To use another database, set `PANELSUMMARY_MONGODB_URL`
(and optionally `PANELSUMMARY_DB_NAME`) before `./start.sh`. Never use the Atlas URL that can
be in `backend/.env`. Logs are in `.dev/logs/`.

Generation policy lives in `backend/app/settings.py` (environment-overridable, for example
`PAGE_MODEL`, `PAGE_THINKING`, `PAGE_VISION`, `PAGE_CONCURRENCY`) and is recorded on every
edition. See D13 in `docs/decisions.md` for the current values and the reasons.

## Using it

1. **Upload** a born-digital PDF on the shelf page (up to 60 MB). Parsing takes seconds. A
   scanned PDF with no text layer is rejected with a clear message.
2. **Read the estimate.** The book page shows a "Before you start" panel: the size of the book,
   the limits, and low and high estimates of pages, cost and time. The estimate is a range
   fitted to measured runs. It is not a quote. If the book is over a limit, Generate is off and
   the panel says why.
3. **Generate manga** on the book page. You see the stage (reading the book, planning pages,
   drawing page N of M), the running time, and pages appear as they are drawn. The first page
   appears once the whole book has been read and planned. In the acceptance runs (a book of
   16,000 words) that took 4 to 30 minutes, depending on MiniMax's output speed at the time.
4. **Read.** Page mode on wide screens, panel mode (the camera steps panel by panel) on
   phones. Arrow keys, swipe, tap zones, zoom, and reduced motion are supported. The page
   number is in the URL.
5. **Sources.** The drawer lists what the page conveys, each panel's PDF pages (links to the
   source viewer), and every line with its fidelity label.
6. **Stop, resume, redraw.** Stop a run, resume it later, or redraw a single page.

### What a failed page looks like

A page that fails every attempt is never hidden. On the book page it shows in the list of failed
pages with a plain reason and the technical detail. The shelf card and the progress text show a
red "N of M drawn, K missing" and the edition ends `completed_with_failures`. In the reader, the
page shows "This page could not be drawn", the reason, the number of failed pages, a "Retry
failed pages" button and a link back to the book. Retry redraws only the failed pages.

## Verify

No model calls, no spend. The backend tests need a MongoDB. They use
`$TEST_MONGODB_URL` (default `mongodb://127.0.0.1:27018`) and create their own databases.

```sh
cd backend && .venv/bin/python -m pytest tests -q          # parser, static guards, offline journey, preflight
cd apps/agent-worker && npx tsc --noEmit && npx vitest run
cd packages/agent-runtime && npx tsc --noEmit && npx vitest run
cd packages/manga-render && npx tsc --noEmit && npx vitest run
cd frontend && npx tsc --noEmit && npm run build
```

GitHub Actions runs the same checks on every pull request into `release/v0.1`, `release/v0.2` and `main`. It
also has a manual lane for a live run with real MiniMax calls. See
[`docs/launch/CI.md`](docs/launch/CI.md).

- `backend/tests/test_generate_journey.py` drives upload → parse → Generate → page API against
  a fake worker and fails if Generate bypasses the worker, if the page API serves anything but
  the worker's exact SVG and geometry, if a failed page's claims vanish from coverage, if resume
  repeats accepted work, or if the backend contacts any other host.
- `backend/tests/test_static_guards.py` fails if an image-generation surface or a direct LLM SDK
  appears in the backend.
- `backend/tests/test_preflight.py` verifies the size limits and the preflight estimates
  against the measured runs.
- A live acceptance check against a running stack (real MiniMax calls) is described in
  [`docs/rebuild/ACCEPTANCE.md`](docs/rebuild/ACCEPTANCE.md). The quality judge harness is in
  [`docs/launch/EVAL.md`](docs/launch/EVAL.md).

## Repository layout

```text
backend/            FastAPI API, job runner, PDF parser (Python)
apps/agent-worker/  MiniMax goals, skills, local tools, experiment CLI (TypeScript)
packages/agent-runtime/  sealed Pi session runtime (the only Pi import)
packages/manga-render/   deterministic renderer: contracts, validators, layout, rigs,
                         environments, props, fx, lettering, SVG, PNG preview
frontend/           Next.js shelf, book page, reader, source viewer
scripts/acceptance/ live journey, run export and the quality judge harness
.github/workflows/  CI (ci.yml) and the manual live lane (live-journey.yml)
docs/               decisions.md, the rebuild evidence in docs/rebuild/, launch notes in docs/launch/
```

## Limits

The limits that the launch tracks measured are listed here. The detail is in
[`docs/launch/`](docs/launch/README.md).

- **Book size.** A book up to 75 PDF pages and 17,500 words (decision D19). The largest book
  that finished end to end has 68 PDF pages and 16,159 words. `POST /books/{id}/editions` refuses a
  larger book with HTTP 422 and a plain reason. It starts no job and spends nothing. Upload accepts
  any PDF that parses, up to 60 MB. The limits are configuration (`MAX_PDF_PAGES`,
  `MAX_SOURCE_WORDS`). A slow MiniMax hour can still time out the understanding of a book that is
  inside the limits. The edition then fails with a visible reason.
- **Chapters.** Chapter-scoped generation and resumable project memory are not in v0.1.
- **Estimates.** Time and cost estimates are ranges. MiniMax output speed varied from 31 to
  324 tokens per second across the runs.
- Born-digital PDFs only (no OCR).
- The drawn vocabulary is closed: characters, places, props and effects must map to what the
  renderer can draw. The model is told the vocabulary and validation rejects anything else.
- English, left-to-right pages by default (the layout compiler also supports right-to-left).
- **Page quality is uneven.** In the acceptance runs a panel of judge agents rated a minority of
  pages at the strict ship bar. The common faults are claims only partly shown, a character's state
  across pages, and props that the closed vocabulary draws loosely. See
  [`docs/rebuild/ACCEPTANCE.md`](docs/rebuild/ACCEPTANCE.md) and the track notes in `docs/launch/`.
  Live measurements of the launch changes are not final yet.
