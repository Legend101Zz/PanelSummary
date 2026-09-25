# PanelSummary

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
          ├─► ADAPTATION_PLAN     pages, beats, claim → page ledger       │ MiniMax-M3 through the
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

The generation policy (models, thinking levels, retries) came from measured experiments:
[`docs/rebuild/EXPERIMENTS.md`](docs/rebuild/EXPERIMENTS.md). Decisions and their reasons:
[`docs/decisions.md`](docs/decisions.md).

## Requirements

- macOS or Linux, Node ≥ 22.19, pnpm 10, Python 3.12 with `uv`, and `mongod` (for example
  `brew install mongodb-community`).
- A MiniMax API key (Anthropic-compatible endpoint). `start.sh` looks for it in
  `$MINIMAX_API_KEY`, then `backend/.env` (`MINIMAX_API_KEY=`), then the macOS Keychain item
  `minimax_api_key`. It passes the key only to the agent worker and never prints it.

## Run it

```sh
./start.sh     # installs missing deps, starts everything, prints the URL
./check.sh     # status of worker, API, runner, frontend
./stop.sh      # stops only what start.sh started
```

| Service | Where |
|---|---|
| Frontend (reader) | http://localhost:3100 |
| API | http://127.0.0.1:8000 (docs at `/docs`) |
| Agent worker (MiniMax harness) | 127.0.0.1:8788 (token-protected, loopback only) |
| Job runner | `python -m app.runner` (no port) |
| MongoDB | 127.0.0.1:27018, data in `.dev/mongo` |

The stack uses its own local MongoDB. To use another database, set
`PANELSUMMARY_MONGODB_URL` (and optionally `PANELSUMMARY_DB_NAME`) before `./start.sh`. Logs
are in `.dev/logs/`. Port 3000 is never used.

Generation policy lives in `backend/app/settings.py` (environment-overridable, for example
`PAGE_MODEL`, `PAGE_THINKING`, `PAGE_VISION`, `PAGE_CONCURRENCY`) and is recorded on every
edition.

## Using it

1. **Upload** a born-digital PDF on the shelf page. Parsing takes seconds; a scanned PDF with
   no text layer is rejected with a clear message.
2. **Generate manga** on the book page. You see the stage (reading the book, planning pages,
   drawing page N of M) and pages appear as they are drawn. Page 1 is usually readable a few
   minutes after pressing Generate.
3. **Read.** Page mode on wide screens, panel mode (the camera steps panel by panel) on
   phones. Arrow keys, swipe, tap zones, zoom, and reduced motion are supported. The page
   number is in the URL.
4. **Sources.** The drawer lists what the page conveys, each panel's PDF pages (links to the
   source viewer), and every line with its fidelity label.
5. **Stop, resume, redraw.** Stop a run, resume it later, or redraw a single page.

## Verify

No model calls, no spend:

```sh
cd backend && .venv/bin/python -m pytest tests -q          # parser, static guards, offline journey
cd apps/agent-worker && npx tsc --noEmit && npx vitest run
cd packages/agent-runtime && npx tsc --noEmit && npx vitest run
cd packages/manga-render && npx tsc --noEmit && npx vitest run
cd frontend && npx tsc --noEmit && npm run build
```

- `backend/tests/test_generate_journey.py` drives upload → parse → Generate → page API against
  a fake worker and fails if Generate bypasses the worker, if the page API serves anything but
  the worker's exact SVG and geometry, if a failed page's claims vanish from coverage, if resume
  repeats accepted work, or if the backend contacts any other host.
- `backend/tests/test_static_guards.py` fails if an image-generation surface or a direct LLM SDK
  appears in the backend.
- A live acceptance check against a running stack (real MiniMax calls) is described in
  [`docs/rebuild/ACCEPTANCE.md`](docs/rebuild/ACCEPTANCE.md).

## Repository layout

```text
backend/            FastAPI API, job runner, PDF parser (Python)
apps/agent-worker/  MiniMax goals, skills, local tools, experiment CLI (TypeScript)
packages/agent-runtime/  sealed Pi session runtime (the only Pi import)
packages/manga-render/   deterministic renderer: contracts, validators, layout, rigs,
                         environments, props, fx, lettering, SVG, PNG preview
frontend/           Next.js shelf, book page, reader, source viewer
docs/               decisions.md and the rebuild evidence in docs/rebuild/
```

## Limits

- Books up to about 250,000 words (single-pass understanding). Longer books are refused with
  a clear error.
- Born-digital PDFs only (no OCR).
- The drawn vocabulary is closed: characters, places, props and effects must map to what the
  renderer can draw; the model is told the vocabulary and validation rejects anything else.
- English, left-to-right pages by default (the layout compiler also supports right-to-left).
