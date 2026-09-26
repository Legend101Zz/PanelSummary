# @panelsummary/agent-worker

The agent worker runs the production goals in sealed Pi sessions on MiniMax. It is the only process that holds `MINIMAX_API_KEY`. The backend job runner calls it; nothing else calls it.

## Goals

| Goal | Input | Result |
|---|---|---|
| `BOOK_UNDERSTANDING` | the parsed book | cast with looks, locations, sections, claims |
| `ADAPTATION_PLAN` | book + understanding | pages, beats, claim-to-page ledger |
| `MANGA_PAGE` | understanding + plan + page number + source units | the accepted `manga-page.v1` spec and its SVG |

Each goal has tools that run in this process: `preview_page` and a submit tool. The tools validate and render with `@panelsummary/manga-render`. A submit tool accepts one `candidate_json` string and returns every validator error to the model.

`src/goals/experimental/` holds goals that only `scripts/experiment.ts` runs (a review pass and a whole-section pass). The HTTP server does not serve them.

## HTTP

All `/internal/*` routes need `Authorization: Bearer $AGENT_WORKER_TOKEN`.

| Route | Purpose |
|---|---|
| `POST /internal/v2/runs` | Run a goal: `{run_id, goal_type, input, model?, thinking?, vision?}`. A repeated `run_id` returns the first result and does not run again. `429` when the worker is at capacity. |
| `GET /internal/v2/runs/:id` | The state of one run. |
| `POST /internal/v2/runs/:id/cancel` | Abort a running goal. |
| `GET /internal/v2/egress` | Every outbound `host/path` this process called, with counts. |
| `GET /healthz`, `GET /readyz` | Liveness; readiness (the key is present). |

## Run and test

```sh
AGENT_WORKER_TOKEN=... MINIMAX_API_KEY=... pnpm start   # 127.0.0.1:8788 (./start.sh does this)
npx tsc --noEmit && npx vitest run                      # no model calls
npx tsx scripts/experiment.ts --book X.units.json --out DIR --stage understanding   # spends MiniMax tokens
```

Configuration: `AGENT_WORKER_HOST` (default `127.0.0.1`), `AGENT_WORKER_PORT` (default `8788`), `AGENT_MAX_CONCURRENCY` (default `4`).
