# CI and the live journey lane

This page describes the two GitHub Actions workflows in `.github/workflows/`. The repository is
public. Every fact here comes from `ci.yml` and `live-journey.yml` at the commit of this branch.

## ci.yml: the offline tests (no spend)

`ci.yml` runs no model call. It needs no secret.

| When | Rule |
|---|---|
| Pull request | Into `release/v0.1`, `release/v0.2` or `main` |
| Push | To `release/v0.1` or `release/v0.2` |
| Manual | `workflow_dispatch` (works only after the file is on the default branch, see below) |

A new push to the same pull request or branch cancels the run that is still going. Every job has
a 20-minute timeout.

| Job | What it runs |
|---|---|
| `backend (pytest)` | Python 3.12, a `mongo:7` service, `uv pip install -r backend/requirements.txt`, then `python -m pytest tests -q` in `backend/` with `TEST_MONGODB_URL=mongodb://127.0.0.1:27017`. |
| `typescript (tsc + vitest)` | Node 22.19.0, `pnpm install --frozen-lockfile`, then `npx tsc --noEmit && npx vitest run` in `packages/agent-runtime`, `packages/manga-render` and `apps/agent-worker`. |
| `frontend (tsc + build)` | Node 22.19.0, `npm ci`, `npx tsc --noEmit`, `npm run build` in `frontend/`. |

To get the same result on your Mac, use the commands in the "Verify" section of `README.md`.

## live-journey.yml: the live lane (real MiniMax spend)

The live lane runs the full journey (upload, Generate, read) against a real MiniMax key. The
comment in the file puts the cost at about 1 USD for the 26-page book. The orchestrator or the
owner starts it. Do not start it to test a documentation change.

### Two ways to start a run

Each run spends money. Each explicit request starts exactly one run (#47). A push does not start a run.

1. **`workflow_dispatch`.** The workflow file is on `main`, so the Actions page shows "Run workflow".
   From the terminal, choose the branch with `--ref`. The workflow file and
   `scripts/acceptance/live-config.json` come from that branch. The inputs (book, and a model and
   thinking level per goal) replace the values in the JSON file. An empty input keeps the file value.
   ```sh
   gh workflow run live-journey.yml --ref release/v0.2 -f book=happy-prince-two-tales
   ```
2. **The `run-live` label on a pull request.** The pull request head must be in this repository
   (a fork never runs). The workflow reads `live-config.json` from the pull request head. Only the
   act of adding the label starts a run. A new push to the pull request does not start a run. To
   run again on a new head, remove the label and add it again.

v0.1 also started a run on each push to a `live/**` branch and on each push to a labelled pull
request. v0.2 removed these two triggers (#47).

### What `live-config.json` holds

| Field | Meaning |
|---|---|
| `book` | A name in `scripts/acceptance/books/` (without `.pdf`), or a path to a PDF in the repository. |
| `understanding_model`, `plan_model`, `page_model` | The model of each goal. |
| `understanding_thinking`, `plan_thinking`, `page_thinking` | The thinking level of each goal. |
| `retry_thinking` | The thinking level of a page retry. |

For the values to use, see decision D13 in `docs/decisions.md`. Do not copy numbers from this
page. The workflow rejects a value with a character outside letters, digits, `.`, `_`, `/` and
`-`. It also rejects a book path that does not exist. The values go to the backend as
`UNDERSTANDING_MODEL`, `PLAN_MODEL`, `PAGE_MODEL` and the matching `*_THINKING` variables. The
edition records them as its policy.

### Limits of a run

- **One run at a time.** The job is in the concurrency group `live-journey` with
  `cancel-in-progress: false`. A second run waits in the queue. It does not cancel the first.
- **Timeout.** 120 minutes for the job. The journey script itself stops after 100 minutes
  (`--timeout-min 100`).
- **Services.** A `mongo:7` service, the agent worker, the API, the job runner and the built
  frontend, all on the loopback interface of the runner. The database name is `live_ci`.

### The secret and the key guard

- The secret is named `MINIMAX_API_KEY` (repository secret). Never write its value in a file, a
  log or a comment.
- The job stops at once if the secret is empty. A pull request from a fork has no access to it.
- Only the worker process gets the key. The step that starts the worker passes it through
  `env -i`. The API, the runner and the frontend never receive it.
- The repository is public and artifacts are public to anyone who can read it. So a guard step
  runs after the services stop. It searches `run/` and `logs/` for the exact key text. If it finds
  the key, the job fails and uploads nothing. The job also fails if there is no key to search for.

### What a run produces

- A job summary on the run page: the commit, the book, journey passed or failed, the edition
  status, pages accepted and failed, the policy per goal, model calls, tokens, cost estimate,
  time to the first page and to the end, the egress hosts and every failed step of the journey.
- Artifact `live-run` (30 days): the journey report (`journey-report.json`), the other files the journey writes, and `export/` with
  `edition.json`, `receipts.json`, `egress.json`, `understanding.json`, `plan.json`,
  `units.json` and `judge/page-NN.{json,svg,png}`. The step "Export the run" also draws the PNG
  files when an export exists.
- Artifact `live-logs` (30 days): the logs of the worker, API, runner and frontend.

The workflow finishes with a pass or a fail of the journey. It does not judge page quality.

## Download and judge a run

```sh
gh run list --workflow live-journey.yml
gh run download RUN_ID -n live-run -D DIR
```

Then run the judge panel and the aggregate step. The steps, the arguments and the meaning of
the numbers are in `docs/launch/EVAL.md`. The short command list is in
`scripts/acceptance/README.md`. Read the job summary and `aggregate.md` together. A passed
journey with a low judge score is a quality problem, not a pass.

## Queue the next run only after the previous one has started

GitHub keeps only ONE pending run in the live-journey concurrency group. A newer dispatch cancels the
older run that is still pending. This happened on 2026-10-10: run 38064776577 was cancelled. Queue the next
run only after the previous one has started (check with `gh run list --workflow live-journey.yml`).

## Known limits of this lane

- This page comes from the workflow files. The documentation track made no live run.
- One run uses one book. One book is a weak sample (see EVAL.md).
- The cost line in the summary is the estimate that the receipts record. It is not a bill.
