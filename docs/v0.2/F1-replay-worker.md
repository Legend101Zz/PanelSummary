# F1: the replay worker

Track F1 (test infrastructure). A stand-in for `apps/agent-worker` that answers the same HTTP API from a
saved real run. The whole journey (upload, parse, Generate, understanding, plan, pages, reader) then runs
through the real backend and the real UI with no model call and no spend.

Use it for:

- Gate 1: run `scripts/acceptance/journey.mjs --replay` against a new UI.
- UI review: watch the run card change state live, at a pace you choose.
- Test the failure screens: failed pages, "Retry failed pages", a provider stop and "Resume drawing".

## What it is

| Part | Path |
|---|---|
| Entry point | `apps/agent-worker/scripts/replay-worker.ts` |
| Code (options, package, handler, HTTP server) | `apps/agent-worker/src/replay/` |
| Tests | `apps/agent-worker/test/replay-worker.test.ts` |
| Two replay packages | `scripts/fixtures/replays/happy-prince-two-tales/` (22 pages), `scripts/fixtures/replays/andersen-18/` (18 pages) |
| Opt-in switch | `PANELSUMMARY_REPLAY_WORKER` in `start.sh` (and a label in `check.sh`) |

The replay worker serves `POST /internal/v2/runs`, `POST /internal/v2/runs/{id}/cancel`,
`GET /internal/v2/egress`, `GET /readyz` and `GET /healthz`. It checks the bearer token like the real worker.
`/readyz` says ready without a key and adds `"replay": true`. The egress list is always empty.

## What each goal returns

| Goal | Answer |
|---|---|
| `BOOK_UNDERSTANDING` | The saved understanding. The request must be the same book: the section ids and unit ids must equal the saved ones. If not, the goal fails with `REPLAY_BOOK_MISMATCH` and the message names the ids that differ. A unit whose text differs is only a warning in the receipt. |
| `ADAPTATION_PLAN` | The saved plan and its `page_budget`. The same book check applies. |
| `MANGA_PAGE n` | The saved spec of page n. The spec goes through the page goal's own `submit_page` tool, so today's checks and today's renderer (`packages/manga-render`) make the SVG, the hash, the panels and the texts. The page goal rejects the first submit once for `repair_once` issues, so the replay submits the same spec a second time, as a writer does. If today's checks still reject the page and the page is structurally valid, it is drawn anyway and the receipt warning says which codes. If the page is not valid for the current contract, the goal fails with `REPLAY_INVALID_SPEC`. A page with no saved spec fails with `REPLAY_NO_SPEC`. |

Every receipt is marked as a replay: `provider` is `replay`, `thinking_sent` is `replay`, `stop_reason` is
`replay`, and `cost_basis` says that nothing was spent now. The model name and thinking level are the ones
in the request. With `REPLAY_COSTS=zero` (the default) the tokens and cost are all zero, because a replay spends nothing.
With `REPLAY_COSTS=saved` they are copied from the saved receipt of the same call, so the cost screens show a
realistic number. That number is not a spend.

## Build a replay package

A replay package is a saved run export (made by `scripts/acceptance/export_run.py`). Copy only the JSON
files. The PNG and SVG files are not needed.

```sh
SRC=/path/to/export                      # holds understanding.json, plan.json, units.json, receipts.json, judge/
DST=scripts/fixtures/replays/my-book
mkdir -p "$DST/judge"
cp "$SRC"/{understanding,plan,units,receipts}.json "$DST/"
cp "$SRC"/judge/page-*.json "$DST/judge/"
```

`receipts.json` is optional (without it every receipt has zero tokens and cost). A page whose
`judge/page-NN.json` has no `spec` (it failed in the saved run) has no saved spec.
Use an export of a run with `complete` status when you want all pages.

## Start the stack with it

```sh
PANELSUMMARY_REPLAY_WORKER=scripts/fixtures/replays/happy-prince-two-tales ./start.sh
./check.sh      # prints that the worker is the REPLAY worker
./stop.sh       # stops it with the rest (same pid and marker handling)
```

The path may be absolute or relative to the repository. With the variable set, `start.sh` does not look up,
read or pass on a MiniMax key. Without it, `start.sh` behaves as before. Upload the PDF the package was
made from:

| Package | PDF |
|---|---|
| `happy-prince-two-tales` | `scripts/acceptance/books/happy-prince-two-tales.pdf` |
| `andersen-18` | the Andersen "Four Tales" PDF of the final launch run (not in the repository) |

Run the acceptance journey against it. The `--replay` flag changes only two checks: the receipts must say
provider `replay`, and the worker egress list must be empty.

```sh
node scripts/acceptance/journey.mjs --pdf scripts/acceptance/books/happy-prince-two-tales.pdf \
  --out OUT --full --replay --web http://127.0.0.1:3100 --api http://127.0.0.1:8000
```

## Options

`start.sh` passes these on when they are set. Run `replay-worker.ts` directly and a flag wins over the
environment.

| Environment | Flag | Meaning | Default |
|---|---|---|---|
| `REPLAY_PACKAGE` | `--package DIR` | The saved run. | (set by `start.sh`) |
| `REPLAY_DELAYS` | `--delays` | Seconds per goal, `understanding=8,plan=5,page=3-6`. A range gives a jitter that is the same on every run for the same page. | `understanding=8,plan=5,page=3-6` |
| `REPLAY_FAST=1` | `--fast` | All delays zero (tests). | off |
| `FAIL_PAGES` | `--fail-pages` | Pages that fail like a real `NO_SUBMISSION`, for example `7,12` or `7-9`. | none |
| `FAIL_TIMES` | `--fail-times` | How many calls of a failing page fail before it succeeds. The backend tries a page twice per Generate, so `2` ends in `completed_with_failures` and the retry succeeds. | `2` |
| `PROVIDER_STOP` | `--provider-stop` | `limit`, `auth` or `unavailable`, then `@page=N`, `@understanding` or `@plan`. The error has the shape of a real MiniMax refusal, so the backend stops the job with `provider_stop` (D11). | none |
| `PROVIDER_STOP_TIMES` | | How many calls meet the refusal. After that, work goes on, so Resume continues. | `1` (`2` for `unavailable`, which the backend retries once) |
| `REPLAY_COSTS` | `--costs` | `zero` or `saved`. | `zero` |
| `AGENT_WORKER_TOKEN`, `AGENT_WORKER_HOST`, `AGENT_WORKER_PORT` | | As the real worker. | |

Cancel is honoured: the call ends at once with `CANCELLED`. A dropped connection from the backend also stops it.

## What was measured

Stack on the F1 ports (web 3280, API 8180, worker 8880, MongoDB 27180, database `v02_f1`). Evidence is in
`/Volumes/Mrigesh SSD/Book-Reel-scratch/v02/f1/evidence/`.

| Run | Result |
|---|---|
| A. Two-tale package, default delays, `journey.mjs --full --replay` | JOURNEY PASSED, 61 of 61 checks, edition `complete`, 22 of 22 pages, 24 calls, egress `{}`. 79 seconds from Generate to finished. |
| B. Andersen package, `FAIL_PAGES=7` | `completed_with_failures` (17 accepted, 1 failed), page 7 receipts `NO_SUBMISSION` twice. Pressing "Retry failed pages" in the UI: `complete`, 18 of 18. |
| C. Andersen package, `PROVIDER_STOP=limit@page=5` | The edition `failed` with `provider_stop` `PROVIDER_LIMIT` (429, stage `drawing`, page 5). Pressing "Resume drawing": `complete`, 18 of 18. Page 5 has a refused receipt and, after Resume, a successful one under run id `...-page5-a1-r1`. |

## Limits

- It replays one saved run. It cannot make a page the saved run did not make.
- The uploaded PDF must be the same book. The check is on section ids and unit ids, not on the page text.
- It shows today's renderer on yesterday's specs. It says nothing about model quality, cost or speed of the
  model, and its latency is the delay you set.
- With `REPLAY_COSTS=saved` the edition totals show the saved run's cost, but nothing was spent. The receipt
  `cost_basis` says so. The default is `zero`.
- Page checks that look at the previous page use what the backend sends, as in a real run.
- The retry of a failing page succeeds by design. To test a page that never succeeds, set `FAIL_TIMES` high.
- The provider refusal counters are in the memory of the worker. A restart of the worker resets them.

## Note after the rebase on renderer 0.6.0 (Q1)

With `manga-render/0.6.0` (track Q1), today's checks reject 2 of the 22 saved pages of the two-tale run:
page 2 (`TAIL_CROSSES_TEXT`) and page 7 (`TEXT_DOES_NOT_FIT`). Before Q1, all saved pages passed. The
replay still draws these pages and names the codes in the receipt warning. The test now verifies that
every page succeeds and that each drawn-anyway warning names its codes, because the set of rejected
saved pages changes with the renderer. In a live run the writer gets these errors and repairs the page.
