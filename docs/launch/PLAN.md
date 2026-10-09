# v0.1 launch plan

This page is the working plan of the v0.1 launch session (tracker #17). The orchestrator keeps it current.
The prompt of the session is `docs/launch/V0.1-ULTRACODE-PROMPT.md`.

- Start: 2026-10-09 05:37 UTC (11:07 IST). Hard stop: 15:37 UTC (21:07 IST).
- Base: `main` = `fd5a326`. `release/v0.1` was made from it.
- Deploy target (owner, 2026-10-09): a GitHub release `v0.1.0` and a verified local `./start.sh`. No server deploy.
- The orchestrator (Opus 5.5) plans, keeps the contracts, merges and runs the gates.
  Workflow agents on Sonnet implement, review, test and judge.

## The journey that decides the launch

```
Upload PDF → click Generate → does THIS architecture run? → does the resulting manga look right?
```

## Tracks

Each track has its own branch and its own worktree in `/Volumes/Mrigesh SSD/Book-Reel-worktrees/`.
Each track goes: implement → independent adversarial review (re-runs, mutation checks) → fix the must-fix items → PR into `release/v0.1`.
The orchestrator merges a PR only with green CI and an approved review.

| Track | Branch | Owns (other tracks do not change these paths) | Issues |
|---|---|---|---|
| CI | `ci/github-actions` | `.github/**`, `scripts/acceptance/export_run.py`, `scripts/acceptance/books/**`, `scripts/acceptance/live-config.json`, `scripts/ci/**` | #17, #10 |
| T0 model | `model/m31-flash` | `packages/agent-runtime/**`, `apps/agent-worker/src/run-goal.ts`, `server.ts`, the default-model lines of the goals, model fields of `backend/app/settings.py`, receipt lines of `generate.py`, D2 and D13 | #17 |
| T1 continuity | `t1/continuity-cast` | `apps/agent-worker/src/goals/**` (not `vocabulary.ts`, not the model lines), `apps/agent-worker/src/skills/**`, worker goal tests | #17, #6 |
| T2 renderer | `t2/renderer-props` | `packages/manga-render/**` (not the T4 files), `apps/agent-worker/src/goals/vocabulary.ts` | #17, #5 |
| T3 scope | `t3/scope-latency` | backend preflight, limits, sources, latency in `generate.py`, new decision entries | #4, #13 |
| T4 eval | `t4/eval-harness` | `scripts/acceptance/judge/**`, `docs/launch/EVAL.md`, `docs/rebuild/baselines/**`, renderer structural metrics | #10 |
| T5 product | `t5/product-surface` | `frontend/**` | #17 |

Wave A (CI, T0) and wave B (T1, T2, T4) started at 05:50 UTC. Wave C (T3, T5) starts when wave A ends.
At most five long agents run at the same time (the account session limit).

## Contracts between tracks

### Live journey configuration (CI ↔ T0 ↔ orchestrator)

`live-journey.yml` runs on `workflow_dispatch` (only after the file is on `main`), on a push to `live/**`, and on a PR with the label `run-live`.
It reads `scripts/acceptance/live-config.json` from the commit. Dispatch inputs override the file.

```json
{"book": "happy-prince-two-tales",
 "understanding_model": "MiniMax-M3", "understanding_thinking": "low",
 "plan_model": "MiniMax-M3", "plan_thinking": "off",
 "page_model": "MiniMax-M3", "page_thinking": "off", "retry_thinking": "low"}
```

The values go to the backend as `UNDERSTANDING_MODEL`, `PLAN_MODEL`, `PAGE_MODEL` and the `*_THINKING` variables.
The edition records them in `policy`. One live run at a time (concurrency group `live-journey`), 120 minutes at most.

### Run export (CI ↔ T4)

`python scripts/acceptance/export_run.py --mongo URL --db NAME [--edition ID] --out DIR` writes
`understanding.json`, `plan.json`, `units.json`, `edition.json`, `receipts.json`, `egress.json` and `judge/page-NN.{json,svg}`.
PNG: `cd packages/manga-render && npx tsx scripts/svg-dir-to-png.ts DIR/judge 1000`.

### Preflight (T3 ↔ T5)

`GET /books/{book_id}/preflight` returns:

```json
{"book_id": "…", "pdf_pages": 26, "source_words": 12000, "sections": 2,
 "estimated_manga_pages": {"low": 15, "high": 22},
 "estimated_cost_usd": {"low": 0.5, "high": 1.0, "basis": "…"},
 "estimated_minutes": {"first_page": {"low": 8, "high": 20}, "total": {"low": 20, "high": 45}},
 "limits": {"max_pdf_pages": 0, "max_source_words": 0},
 "within_limits": true, "blocking_reasons": []}
```

Generate refuses a book that is not within the limits, with a reason the reader can see.

### Model wiring (T0 → everyone)

`MiniMax-M3.1-Flash-Preview` is an allowed model with vision. The defaults stay `MiniMax-M3` until the A/B decides each goal (D13).

## Gates

- **Gate 0 (CI is real):** CI fails on a planted error in every job, then passes. The live job succeeds once on the 26-page book.
- **Model A/B:** on the 26-page book, Flash against M3 with the same code. Flash becomes the default for each goal where it is at least as good. The result goes into D13 and `docs/rebuild/EXPERIMENTS.md`.
- **Gate 1:** CI green on `release/v0.1` with T0-T5 merged. A live run on the 26-page book with the chosen models. A panel of 3 Sonnet judges for each page, plus the orchestrator's own look at every page. Compared with run 8 (tales 1-2) and with the Phase 0 baseline.
- **Gate 2:** CI green. The 68-page acceptance book judged by the same panel. Pass bar: more than 5/46 pages at the ship bar, mean > 3.37, continuity > 2.43, and no criterion more than 0.2 below run 8. Zero image-model egress. Every failure visible.
- **Launch gate:** the final journey in a real browser, on a fresh database, with a PDF that no track used for tuning. Then `release/v0.1` → `main`, tag `v0.1.0`, release notes, and every open issue closed or deferred with a reason.

Judging note: run 8 had one judge for each page. The launch uses three Sonnet judges for each page. To compare like with like, the orchestrator also judges the run-8 pages again with the same panel and reports both numbers.

## Status (11:15 UTC)

- `release/v0.1` holds 19 merged PRs (#20-#34, #36-#39), each with green CI and an independent review.
  Draft #35 (`release/v0.1` -> `main`) is the launch merge.
- Model policy (D13): `MiniMax-M3.1-Flash-Preview` on every goal; M3 is the fallback (`docs/launch/MODEL-AB.md`).
- Gate 0: CI failed on a planted error in all three jobs, then passed; the live job passed.
- Gate 1 (26-page book, newest code): 22/22 pages, ship bar 4-6/22, mean 3.49-3.53.
- Gate 2 (68-page book, complete rerun, `d19dca9`): 60/60 pages, ship bar 12/60, mean 3.54, continuity 3.02,
  fidelity 3.51, done in 16.4 min (run 8: 48.5 min).
- Gate 2 against run 8 judged by the same panel: PASS on every condition (worst criterion -0.11).
- Gate 2 against the single-judge numbers of run 8: NOT MET on one condition. Reading flow is 3.97 against
  4.41 (-0.44). Speaker attribution is 3.53 against 3.83 (-0.30). The panel gives run 8 itself 3.97 and
  3.64 on these two criteria, so most of the gap comes from the instrument. The owner approved the release
  with this result.
- Launch gate final journey (`0fa10d7`, fresh database, untuned Andersen PDF, headed Chrome): upload, preflight,
  Generate, 18/18 pages `complete` after 439 s (walk log), reader = stored SVG on 18/18, receipts for 20 calls,
  egress `api.minimax.io` only; panel: 3/18 at the ship bar, mean 3.53. Journey checks: 53 of 53 passed.
- v0.2 issues: #40-#50.

## Cut list (in this order if the session is late)

1. T5 polish beyond correctness.
2. Latency work.
3. Chapter scoping for #4 (defer).
4. The nonfiction run.
5. T2 cosmetic defects that judges scored 3 or more.

The final journey and honest reporting are never cut.

## Live spend ledger (cap: $25)

Costs are Pi catalog estimates from the edition receipts, not a bill.

| When (UTC) | Run | Where | Book | Models (understanding / plan / pages) | Cost |
|---|---|---|---|---|---|
| 05:38 | Phase 0 baseline, `main` `fd5a326` | local | two tales (26 pp) | M3 / M3 / M3 | $0.81 |
| 06:05 | CI live check, `7312d4a` | CI | two tales | M3 / M3 / M3 | $0.60 |
| 06:00 | T0 smoke: Flash on each goal, one M3 page | local | two tales; run-8 input | mixed | $0.39 |
| 06:47 | A/B arm, `217d4e6` | CI | two tales | M3 / Flash / Flash | $0.59 |
| 06:52 | Gate-1 arm, `a53378e` | CI | two tales | M3 / Flash / Flash | $0.87 |
| 06:53 | `a53378e`, failed in the understanding (statue guard) | local | two tales | M3 / M3 / M3 | $0.31 |
| 07:00 | F1 page-12 replays (17) | local | two tales | M3, Flash | $0.91 |
| 07:23 | A/B arm, `217d4e6` | local | two tales | M3 / M3 / Flash | $0.53 |
| 07:30 | F3 understanding replays | local | two tales | M3, Flash | $0.46 |
| 07:55 | W2-writer page replays (25) | local | two tales | Flash | $0.49 |
| 08:08 | Understanding A/B, release + F3 | CI | two tales | Flash / Flash / Flash | $0.59 |
| 08:08 | Understanding A/B, release + F3 | local | two tales | M3 / Flash / Flash | $0.65 |
| 08:35 | Gate 2, `d1a2286` (cut by the plan limit: 46/56 pages) | CI | 68 pp | Flash / Flash / Flash | $1.39 |
| 08:41 | Gate 2, `d1a2286` (cut by the plan limit: 18/50 pages) | local | 68 pp | M3 / Flash / Flash | $0.84 |
| 10:07 | Final journey, `0fa10d7`, fresh database, headed browser | local | Andersen (22 pp, untuned) | Flash / Flash / Flash | $0.46 |
| 10:23 | Gate 2 complete rerun, `d19dca9` | CI | 68 pp | Flash / Flash / Flash | $1.72 |
| | **Total (Pi catalog estimates, not a bill)** | | | | **$11.61** |

From about 08:50 to 10:06 UTC the MiniMax account answered every call with "Token Plan usage limit
reached" (2056). The real constraint was the account's token plan, not the $25 estimate cap.
