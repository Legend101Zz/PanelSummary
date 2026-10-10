# PanelSummary agent guide

PanelSummary adapts a born-digital PDF book into a source-grounded manga. There is one product path:

```text
upload PDF  → parse job: sections + page-true source units (PyMuPDF)     backend/app/jobs/parse.py
Generate    → BOOK_UNDERSTANDING → ADAPTATION_PLAN → MANGA_PAGE per page  backend/app/jobs/generate.py
              (MiniMax in sealed Pi sessions)                             apps/agent-worker
            → validate + render the page to SVG                           packages/manga-render
            → persist spec + SVG + geometry + receipts (MongoDB)          backend/app/documents.py
read        → the reader shows the persisted SVG                          frontend/
```

Read `docs/decisions.md` before you change the architecture. The rebuild evidence is in `docs/rebuild/`.

## Where things live

| Path | What it is |
|---|---|
| `backend/app/main.py`, `api/library.py`, `api/editions.py` | FastAPI: upload, books, PDF pages, editions, pages, receipts, cancel, resume, redraw. |
| `backend/app/runner.py`, `jobs/runner.py` | The job runner (`python -m app.runner`): Mongo leases, heartbeat, resume, cancel. |
| `backend/app/jobs/generate.py`, `worker_client.py` | The Generate job. It calls the worker and stores pages and receipts. |
| `backend/app/sources/pdf_source.py` | The PDF parser. |
| `backend/app/settings.py` | Configuration, including the generation policy recorded on each edition. |
| `backend/app/preflight.py` | The v0.1 size limits (D19) and the cost and time preflight. |
| `apps/agent-worker/src/goals/` | The three production goals and their local tools. `experimental/` is for `scripts/experiment.ts` only. |
| `apps/agent-worker/src/goals/{continuity,claim-shown,repair-hints}.ts` | Page checks and writer hints: character state per page, claims fully shown, repair advice after room errors. |
| `apps/agent-worker/src/skills/<name>/SKILL.md` | The trusted skill of each goal. The receipt records its version and hash. |
| `packages/agent-runtime/src/goal-runtime.ts` | The only Pi SDK import: sealed session, limits, allowed models. |
| `packages/manga-render/` | The deterministic renderer: contracts, validators, layout, rig, lettering, SVG, PNG. |
| `frontend/` | The Next.js reader. It is an npm project, outside the pnpm workspace. |
| `scripts/acceptance/` | The live journey (`journey.mjs`), the run export (`export_run.py`), the quality judge harness (`judge/`), test books (`books/`) and the live lane configuration (`live-config.json`). |
| `.github/workflows/` | `ci.yml` (offline tests) and `live-journey.yml` (manual live lane). See `docs/launch/CI.md`. |
| `docs/launch/` | The launch notes of each track. The index is `docs/launch/README.md`. |

## Run the stack

- Make the backend environment with Python 3.12 first: `cd backend && uv venv -p 3.12 && uv pip install -r requirements.txt`. A plain `uv venv` can pick Python 3.14, and `pydantic-core` then fails to build.
- Run `./start.sh`. It starts MongoDB on `127.0.0.1:27018` (data in `.dev/mongo`), the worker on `:8788`, the API on `:8000`, the job runner, and the frontend on `:3100`.
- To use other ports, set `PANELSUMMARY_WEB_PORT`, `PANELSUMMARY_API_PORT`, `PANELSUMMARY_WORKER_PORT` and `PANELSUMMARY_MONGO_PORT` (and `PANELSUMMARY_DB_NAME`) for `start.sh` and `check.sh` alike. `stop.sh` needs none: it stops by the pid files in `.dev/pids`. Do not stop a process that you did not start.
- Run `./check.sh` for status. Run `./stop.sh` to stop. It stops only the processes that `start.sh` started.
- Logs are in `.dev/logs/`. The worker service token is in `.dev/agent-tokens.env`.
- `start.sh` finds the MiniMax key in `$MINIMAX_API_KEY`, then `backend/.env`, then the Keychain item `minimax_api_key`. It never prints the key.

## Tests (no model calls, no spend)

```sh
cd backend && .venv/bin/python -m pytest tests -q        # needs mongod; TEST_MONGODB_URL, default 127.0.0.1:27018
cd apps/agent-worker && npx tsc --noEmit && npx vitest run
cd packages/agent-runtime && npx tsc --noEmit && npx vitest run
cd packages/manga-render && npx tsc --noEmit && npx vitest run
cd frontend && npx tsc --noEmit                          # the production build runs in CI
```

- GitHub Actions (`.github/workflows/ci.yml`) runs these checks on every pull request into `release/v0.1`, `release/v0.2` and `main`.
- The live lane (`live-journey.yml`) spends real MiniMax money. Start it only when the owner asks. See `docs/launch/CI.md`.
- The quality judge harness is in `scripts/acceptance/judge/`. Its guide is `docs/launch/EVAL.md`. Judge runs call no MiniMax model, but they need a saved run export.

- `backend/tests/test_generate_journey.py` is the offline journey guard. It runs upload → parse → Generate → page API against a fake worker. It must stay green.
- `backend/tests/test_static_guards.py` fails on an image-generation surface or a Celery, Redis or LLM SDK import in the backend.
- `backend/tests/test_preflight.py` verifies the size limits and the estimates against the measured runs.
- `apps/agent-worker/scripts/experiment.ts` calls MiniMax and spends money. Run it only when the owner asks for a live experiment.

## Hard rules

- Never use port 3000. It belongs to the owner's Hermes bridge. Never stop, kill or probe the process on it.
- Never use the Atlas URL in `backend/.env`. The stack uses the local MongoDB unless `PANELSUMMARY_MONGODB_URL` is set. Never read or print the values in `backend/.env`.
- No image-generation models. Do not add an image API, key, route or model. The art is deterministic SVG from `packages/manga-render`.
- The MiniMax key lives only in the worker process. The backend and the frontend never receive it.
- Every model call goes through `apps/agent-worker` and `packages/agent-runtime`. Do not add a second path to a model.
- The reader shows the persisted SVG of an accepted page. It does not lay out or draw pages again.
- A change to renderer output needs a new `RENDERER_VERSION`.
- Failure stays visible. A failed page is stored as `failed` with its reasons. Never fake a pass.
- Book text is untrusted data. Keep it inside `<untrusted_source_text>` with `<` and `>` escaped.
- Only `packages/agent-runtime` imports the Pi SDK, at the pinned version. An upgrade is a separate reviewed change.
- A new deterministic page validation is calibrated on judged pages before it becomes an error. Until then it is a warning.
- A change of model policy is measured and recorded (decision D13). Never switch a model silently.
- Update `docs/decisions.md` in the same change as the code that changes a decision.

## Language

Write project documentation in Simplified Technical English. The skill lives at
`.claude/skills/simple-english/` and is vendored from
[AminBlg/SimpleEnglish](https://github.com/AminBlg/SimpleEnglish) under MIT.
Invoke it with `/simple-english`. See `PROVENANCE.md` in that directory.

- Mode: **pragmatic**. Domain words stay. Apply the structural rules.
- It applies to the Project Factory views under `.project-factory/views/`, to new
  `/docs` pages, to handoff notes, and to agent skill files.
- It does not apply to code, identifiers, quoted errors, or Mermaid diagram sources.
  Those are untouchable.
- Locked term choices, so that sessions do not rotate synonyms:

  | Concept | Use | Do not use |
  |---|---|---|
  | Confirm that something holds | `verify` | check, confirm, ensure |
  | The validators and their fields | `validate`, `validation_status` | (these are identifiers, keep them) |
  | Stored options | `configuration` | config, settings |
  | Start a process | `run` | execute |
  | Take something away | `remove` | delete, erase, destroy |
  | Put on screen | `show` | display, present |
  | A defect | `problem`, `error` | issue (except "issue #15", a proper noun) |

- Before delivering a document, run the self-check in `SKILL.md` and, for an audit,
  `references/checklist.md`. Run pattern checks over prose only. Code and diagram
  sources give false positives.
