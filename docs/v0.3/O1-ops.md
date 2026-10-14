# v0.3 track O1: ops measurements (issues #88, #84, #85)

Date: 2026-10-14. Branch `v03/o1-ops`, from `release/v0.3` at 185526a.
Language: Simplified Technical English.

No model call was made in this track. Every number comes from files that the v0.2 runs saved.
The scripts and raw output are in `Book-Reel-scratch/v03/o1/` on the build machine
(`collect.py`, `fit.py`, `fit2.py`, `an84.py`, `tables.py`, `price-check.out`, `pricing/`).

## Decisions

| Issue | Decision | Code change |
|---|---|---|
| #88 preflight estimates | Re-fit on 12 runs that have the current policy (Flash on every goal, D13). The first-page range for a 9,419-word book changes from 4 to 38 min to 1 to 9 min. The total range changes from 9 to 73 min to 4 to 25 min. | `backend/app/preflight.py`, `backend/tests/test_preflight.py` |
| #84 wall-clock limit | No new limit (D35). The longest page attempt in 388 attempts is 126 s. A limit of 180 s or more changes no attempt. | None |
| #85 Flash price | MiniMax still publishes no price for MiniMax-M3.1-Flash-Preview (checked 2026-10-14). The basis proposal is in section 3. No second host in v0.3 (D36). | None |

## 1. Issue #88: re-fit of the preflight estimates

### 1.1 Data

The source is `edition.json`, `units.json` and `receipts.json` of each run (exports under `Book-Reel-scratch/v02/`).
Words and sections are the sums over `units.json`. PDF pages are from the PDF (`pdfinfo`).
"First page" is `timings.created_to_first_page_s`. "All pages" is `timings.created_to_finished_s`.
Cost is `totals.cost_usd` (M3 rates, not a bill). "Page receipts" is the sum of the `MANGA_PAGE` receipts.
All 11 runs below used Flash on every goal (`policy` in `edition.json`).
Live 7 and 10 in `docs/v0.2/PLAN.md` section 6 are the two final journeys.
The 12th fit run is the v0.1 run "understanding A/B, all Flash" (5,794 words, 22 pages, $0.59, first page 427 s, all pages 795 s).
The owner's private book is in the table with numbers only. Its text was not read.

| Run | PDF pages | Words | Sections | Planned pages | Failed | Understanding s | Plan s | First page s | All pages s | s per further page | Cost usd | Page receipts usd |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| live 1 (gate 0, two tales) | 26 | 5,794 | 2 | 21 | 0 | 82 | 112 | 211 | 517 | 15.3 | 0.75 | 0.691 |
| live 2 (gate 1, two tales) | 26 | 5,794 | 2 | 22 | 0 | 84 | 79 | 187 | 447 | 12.4 | 0.69 | 0.626 |
| live 3 (gate 2, 68 pages) | 68 | 16,159 | 5 | 61 | 1 | 144 | 132 | 292 | 882 | 9.8 | 1.88 | 1.763 |
| live 4 (self-reliance) | 36 | 10,031 | 3 | 38 | 0 | 76 | 83 | 188 | 534 | 9.4 | 0.86 | 0.814 |
| live 5 (civil disobedience) | 34 | 9,339 | 3 | 36 | 0 | 38 | 88 | 149 | 491 | 9.8 | 0.81 | 0.747 |
| live 6 (just-so) | 38 | 9,419 | 3 | 34 | 0 | 92 | 80 | 189 | 550 | 11.0 | 0.99 | 0.919 |
| live 8 (self-reliance) | 36 | 10,031 | 3 | 36 | 0 | 62 | 49 | 131 | 401 | 7.7 | 0.82 | 0.769 |
| final journey (just-so) | 38 | 9,419 | 3 | 35 | 0 | 60 | 40 | 131 | 464 | 9.8 | 0.99 | 0.941 |
| final journey 2 (just-so) | 38 | 9,419 | 3 | 29 | 0 | 56 | 21 | 104 | 367 | 9.4 | 0.80 | 0.756 |
| v0.1.0 hold-out (just-so) | 38 | 9,419 | 3 | 30 | 0 | 58 | 30 | 121 | 427 | 10.5 | 0.80 | 0.743 |
| private book (numbers only) | 39 | 11,339 | 3 | 44 | 0 | 87 | 87 | 197 | 551 | 8.2 | 1.01 | 0.941 |

Three facts from this table drive the re-fit:

- The page receipts are 92 to 95 percent of the cost. The understanding and the plan cost $0.04 to $0.12 for a book.
- The first page needs the understanding, the plan and one page: 104 to 211 s in the v0.2 runs. Page 1 itself needs 16 to 33 s after the plan.
- Further pages take 7.7 to 17.5 s each (4 pages in parallel). The old model said 16 to 30 s.

### 1.2 Method

1. Rule: a range is the envelope of the measured runs, widened outward by a stated margin. The margin is 10 percent (`MARGIN` in `preflight.py`). A bound is rounded outward.
2. Only runs with the current policy are in the ranges (`FIT_RUNS`, 12 runs). M3 and mixed-policy runs are slower and dearer. They are kept in `EARLIER_RUNS` (11 runs) for the record. They are not in the ranges (section 1.5).
3. Pages: pages per 1,000 words, measured 3.08 to 3.88. The bounds are 2.75 and 4.3.
4. Cost: the model is `a * kwords + b * pages`. The understanding and the plan cost 0.0044 to 0.0104 usd per 1,000 words. The page receipts cost 0.0208 to 0.0329 usd per page. The model uses `a = 0.0075` and `b = 0.0265` (the middle of each). The low and high factors are the smallest and the largest ratio of measured cost to the model at the low and high page count of the range: 1.04 and 1.20. With the margin they are 0.93 and 1.32. A least-squares fit and a search for the narrowest band gave the same width (mean 0.66 usd) for all coefficient pairs that were tried. The page count range causes most of the width. A coefficient pair with a physical meaning was chosen.
5. Time to first page: `0.008 * words + base`. The base was 28 to 165 s in the 11 v0.2 runs. The one v0.1 Flash run needed 220 s more (a slow understanding hour: 132 s for 5,794 words, 0.023 s per word; the v0.2 runs were 0.004 to 0.015). That extra stays in the high bound as a flat value. The margin widens both ends.
6. Time for further pages: 6.9 to 19.3 s each (7.7 and 17.5, widened). A page that fails twice adds at most 270 s to the high end (245 s measured: gate 2, page 42).
7. Draw cost (plan review, D24): 0.0187 to 0.0363 usd per page, from the page receipts (0.0208 to 0.0329, widened).

### 1.3 Constants, old and new

| Constant | Old | New |
|---|---|---|
| `PAGES_PER_KWORD_LOW` / `HIGH` | 2.5 / 4.0 | 2.75 / 4.3 |
| `COST_PER_KWORD` | 0.0125 | 0.0075 |
| `COST_PER_PAGE` | 0.0302 | 0.0265 |
| `COST_LOW_FACTOR` / `HIGH` | 0.85 / 1.25 | 0.93 / 1.32 |
| Understanding seconds per word, low / high | 0.016 / 0.082 | removed (replaced by `FIRST_PAGE_S_PER_WORD`) |
| `FIRST_PAGE_S_PER_WORD` | none | 0.008 |
| First page base, low / high (seconds) | plan 60 + page 35 / plan 450 + page 200 | 28 / 165 |
| `UNDERSTANDING_SLOW_HOUR_EXTRA_S` | 800 | 220 |
| `PAGE_S_LOW` / `HIGH` | 16 / 30 | 6.9 / 19.3 |
| `FAILED_PAGE_TAIL_S_HIGH` | 1100 | 270 |
| `MARGIN` | none | 0.10 |
| `DRAW_COST_PER_PAGE_LOW` / `HIGH` | none (used `COST_PER_PAGE` and the factors) | 0.0187 / 0.0363 |
| `UNDERSTANDING_S_PER_WORD_HIGH` | 0.082 | 0.082 (kept only for the word-limit guard test, M3 slow hour) |

### 1.4 Before and after, run by run

"Old" is `preflight.py` at 185526a. "New" is this branch. The measured value is inside the range when the line says "in".
The minutes the UI shows are the floor of the low bound and the ceiling of the high bound.

**Time to first page and total time (minutes)**

| Run | Words | Pages | First page measured | Old range | New range | Total measured | Old range | New range |
|---|---|---|---|---|---|---|---|---|
| understanding A/B, all Flash | 5,794 | 22 | 7.1 | 3.1 to 32.1 (in) | 1.1 to 7.9 (in) | 13.2 | 6.6 to 60.9 (in) | 2.7 to 19.2 (in) |
| v0.2 live 1, two tales | 5,794 | 21 | 3.5 | 3.1 to 32.1 (in) | 1.1 to 7.9 (in) | 8.6 | 6.6 to 60.9 (in) | 2.7 to 19.2 (in) |
| v0.2 live 2, two tales (gate 1) | 5,794 | 22 | 3.1 | 3.1 to 32.1 (OUT) | 1.1 to 7.9 (in) | 7.5 | 6.6 to 60.9 (in) | 2.7 to 19.2 (in) |
| v0.2 live 3, 68-page book (gate 2) | 16,159 | 61 | 4.9 | 5.9 to 46.3 (OUT) | 2.4 to 9.4 (in) | 14.7 | 16.3 to 95.1 (OUT) | 7.3 to 33.5 (in) |
| v0.2 live 4, self-reliance | 10,031 | 38 | 3.1 | 4.3 to 37.9 (OUT) | 1.6 to 8.5 (in) | 8.9 | 10.7 to 75.2 (OUT) | 4.6 to 25.3 (in) |
| v0.2 live 5, civil disobedience | 9,339 | 36 | 2.5 | 4.1 to 36.9 (OUT) | 1.5 to 8.4 (in) | 8.2 | 9.9 to 72.8 (OUT) | 4.3 to 24.2 (in) |
| v0.2 live 6, just-so | 9,419 | 34 | 3.1 | 4.1 to 37.0 (OUT) | 1.6 to 8.4 (in) | 9.2 | 10.0 to 72.9 (OUT) | 4.3 to 24.2 (in) |
| v0.2 live 8, self-reliance | 10,031 | 36 | 2.2 | 4.3 to 37.9 (OUT) | 1.6 to 8.5 (in) | 6.7 | 10.7 to 75.2 (OUT) | 4.6 to 25.3 (in) |
| v0.2 final journey, just-so | 9,419 | 35 | 2.2 | 4.1 to 37.0 (OUT) | 1.6 to 8.4 (in) | 7.7 | 10.0 to 72.9 (OUT) | 4.3 to 24.2 (in) |
| v0.2 final journey 2, just-so | 9,419 | 29 | 1.7 | 4.1 to 37.0 (OUT) | 1.6 to 8.4 (in) | 6.1 | 10.0 to 72.9 (OUT) | 4.3 to 24.2 (in) |
| v0.1.0 hold-out, just-so | 9,419 | 30 | 2.0 | 4.1 to 37.0 (OUT) | 1.6 to 8.4 (in) | 7.1 | 10.0 to 72.9 (OUT) | 4.3 to 24.2 (in) |
| v0.2 private book (numbers only) | 11,339 | 44 | 3.3 | 4.6 to 39.7 (OUT) | 1.8 to 8.7 (in) | 9.2 | 11.8 to 79.5 (OUT) | 5.2 to 27.1 (in) |

**Manga pages and cost (usd, M3 rates)**

| Run | Pages measured | Old range | New range | Cost measured | Old range | New range |
|---|---|---|---|---|---|---|
| understanding A/B, all Flash | 22 | 14 to 22 (in) | 15 to 22 (in) | 0.59 | 0.42 to 0.92 (in) | 0.41 to 0.83 (in) |
| v0.2 live 1, two tales | 21 | 14 to 22 (in) | 15 to 22 (in) | 0.75 | 0.42 to 0.92 (in) | 0.41 to 0.83 (in) |
| v0.2 live 2, two tales (gate 1) | 22 | 14 to 22 (in) | 15 to 22 (in) | 0.69 | 0.42 to 0.92 (in) | 0.41 to 0.83 (in) |
| v0.2 live 3, 68-page book (gate 2) | 61 | 40 to 62 (in) | 44 to 62 (in) | 1.88 | 1.20 to 2.59 (in) | 1.20 to 2.33 (in) |
| v0.2 live 4, self-reliance | 38 | 25 to 39 (in) | 27 to 39 (in) | 0.86 | 0.75 to 1.63 (in) | 0.74 to 1.46 (in) |
| v0.2 live 5, civil disobedience | 36 | 23 to 36 (in) | 25 to 36 (in) | 0.81 | 0.69 to 1.50 (in) | 0.68 to 1.35 (in) |
| v0.2 live 6, just-so | 34 | 23 to 36 (in) | 25 to 36 (in) | 0.99 | 0.69 to 1.51 (in) | 0.68 to 1.35 (in) |
| v0.2 live 8, self-reliance | 36 | 25 to 39 (in) | 27 to 39 (in) | 0.82 | 0.75 to 1.63 (in) | 0.74 to 1.46 (in) |
| v0.2 final journey, just-so | 35 | 23 to 36 (in) | 25 to 36 (in) | 0.99 | 0.69 to 1.51 (in) | 0.68 to 1.35 (in) |
| v0.2 final journey 2, just-so | 29 | 23 to 36 (in) | 25 to 36 (in) | 0.80 | 0.69 to 1.51 (in) | 0.68 to 1.35 (in) |
| v0.1.0 hold-out, just-so | 30 | 23 to 36 (in) | 25 to 36 (in) | 0.80 | 0.69 to 1.51 (in) | 0.68 to 1.35 (in) |
| v0.2 private book (numbers only) | 44 | 28 to 44 (in) | 31 to 44 (in) | 1.01 | 0.84 to 1.84 (in) | 0.84 to 1.65 (in) |


Result: with the old model, 9 of the 12 runs finished below the low end of the total time, and 10 of 12 below the low end of the first-page time. With the new model all 12 are inside every range (pages, cost, first page, total, draw cost).

**Width of the ranges for typical books (minutes, pages, usd)**

| Book | Words | Sections | Old first page (min) | New first page | Old total (min) | New total | Old pages | New pages | Old cost | New cost |
|---|---|---|---|---|---|---|---|---|---|---|
| two tales | 5,794 | 2 | 3 to 33 | 1 to 8 | 6 to 61 | 2 to 20 | 14 to 22 | 15 to 22 | 0.42 to 0.92 | 0.41 to 0.83 |
| civil disobedience | 9,339 | 3 | 4 to 37 | 1 to 9 | 9 to 73 | 4 to 25 | 23 to 36 | 25 to 36 | 0.69 to 1.50 | 0.68 to 1.35 |
| just-so | 9,419 | 3 | 4 to 38 | 1 to 9 | 9 to 73 | 4 to 25 | 23 to 36 | 25 to 36 | 0.69 to 1.51 | 0.68 to 1.35 |
| self-reliance | 10,031 | 3 | 4 to 38 | 1 to 9 | 10 to 76 | 4 to 26 | 25 to 39 | 27 to 39 | 0.75 to 1.63 | 0.74 to 1.46 |
| 68-page book | 16,159 | 5 | 5 to 47 | 2 to 10 | 16 to 96 | 7 to 34 | 40 to 62 | 44 to 62 | 1.20 to 2.59 | 1.20 to 2.33 |

The UI shows these ranges (`GET /books/{id}/preflight`). Check with the replay worker, the two-tale book (26 PDF pages, 5,794 words, 2 sections):

| | Old | New |
|---|---|---|
| Pages | 14 to 22 | 15 to 22 |
| Cost | $0.42 to $0.92 | $0.41 to $0.83 |
| First page | 3 to 33 min | 1 to 8 min |
| All pages | 6 to 61 min | 2 to 20 min |

(Files: `preflight-before.json`, `preflight-after.json` in the scratch directory.)

### 1.5 Runs not in the fit

New ranges, applied to the earlier runs:

| Run | Policy | Pages | Cost | First page | Total | Pages in new range | Cost in new range | First page in | Total in |
|---|---|---|---|---|---|---|---|---|---|
| phase0 two tales | M3/M3/M3 | 16 | 0.81 | 795 s | 2115 | in | in | in | in |
| civil disobedience | M3/M3/M3 | 29 | 0.73 | 569 s | - | in | in | in | - |
| acceptance run 3 | M3/M3/M3 | 60 | 2.17 | 787 s | 2502 | in | in | in | in |
| acceptance run 4 | M3/M3/M3 | 58 | 2.02 | 397 s | 1578 | in | in | OUT | OUT |
| acceptance run 6 | M3/M3/M3 | 56 | 1.66 | 813 s | 1716 | in | in | in | OUT |
| acceptance run 8 | M3/M3/M3 | 46 | 1.65 | 1823 s | 2910 | in | in | in | in |
| ci live, all M3 | M3/M3/M3 | 14 | 0.60 | 940 s | 1747 | OUT | in | in | in |
| A/B M3 plan, Flash pages | M3/M3/M3F | 16 | 0.53 | 954 s | 1363 | in | in | in | in |
| A/B Flash plan and pages | M3/M3F/M3F | 21 | 0.59 | 744 s | 1087 | in | in | in | OUT |
| gate 1, Flash plan and pages | M3/M3F/M3F | 22 | 0.87 | 1361 s | 2094 | in | OUT | in | in |
| understanding A/B, M3 understanding | M3/M3F/M3F | 22 | 0.65 | 945 s | 1337 | in | in | in | in |


These 11 runs used MiniMax-M3 for the understanding, the plan or the pages. M3 is slower. The model policy is Flash on every goal (D13) and `cost_basis` says "not measured again" for any other policy.
The pages and cost ranges still contain most of them. The time ranges do not. This is expected and is not a defect.
The pre-F1 run with a page that failed twice for 1,114 s is also in this group. The tail value of 270 s does not cover it.

### 1.6 Limits of this fit

- 12 runs, 6 books (26 to 68 PDF pages). Nothing is known for a book of 75 PDF pages (the limit) or 17,500 words.
- MiniMax speed changes with the load of the day. The fit covers runs of 2026-10-09 and 2026-10-10.
- The high bound of the first page depends on one run (the v0.1 slow hour). Without it the high bound of the first page for the 9,419-word book would be 4.4 min, not 8.4 min.
- One page failed twice in 388 attempts. The tail value rests on that single page.
- The orchestrator adds the v0.3 runs at the end of the build (add a `FitRun` to `FIT_RUNS`; the tests then check the new run).

### 1.7 Copy that the UI shows

`cost_basis()` (the text under the cost range) no longer says "7 with MiniMax-M3 on every goal, 4 with Flash on the plan..." because the ranges no longer rest on those runs. It now says: "The range comes from 12 measured runs with Flash on every goal (the current model policy), on 6 books of 26 to 68 PDF pages." The numbers are computed from `FIT_RUNS`. `basis_short` ("Estimate at MiniMax-M3 rates, not a bill.") is unchanged. No frontend file was changed. `frontend/lib/words.ts` does not contain the basis text. The UI track must check that its screens fit the shorter text and the lower minute values ("1 to 8 min").

Other changes outside the owned paths (one line each):
- `backend/tests/test_generate_journey.py` line 539: the plan-review draw estimate for 3 pages is now `{"low": 0.06, "high": 0.11}` (was 0.08 and 0.11), because the draw range is measured per page now.
- `docs/decisions.md` D24 (not edited, owner rule: only D35 and D36 may be appended) says the draw estimate is `COST_PER_PAGE` with the low and high factors. The code now uses `DRAW_COST_PER_PAGE_LOW` and `_HIGH`. The orchestrator must amend D24. Reason: with the cost-model factors the draw range of the cheapest runs (0.0208 usd per page) was below the low bound.

## 2. Issue #84: wall-clock limit for a failing page attempt

### 2.1 Method

The method of `Book-Reel-scratch/v02/g0/46-MEASURE.md` was repeated on the 11 runs above (script `an84.py`).
The duration of an attempt is `latency_ms` of its `MANGA_PAGE` receipt. The score of a page is the mean of the 8 criteria over the 3 judges (`judgments.json`).
All 388 attempts used MiniMax-M3.1-Flash-Preview.

### 2.2 Result

| Outcome | Attempts | Min s | Median s | P90 s | Max s | Sum s |
|---|---|---|---|---|---|---|
| Succeeded | 385 | 13 | 34 | 60 | 126 | 14,327 |
| Failed | 3 | 93 | 119 | 126 | 126 | 338 |

- 384 pages were accepted at attempt 1. One page (live 3, page 42) failed at attempt 1 (119 s) and at attempt 2 (126 s). Both stopped on the submit limit (`limit`), not on time. One page (v0.1.0 hold-out, page 19) failed at attempt 1 (93 s, submit limit) and was accepted at attempt 2.
- Mean judged score of the 385 accepted attempts: 3.52.

| Limit (s) | Successes above | Share | Mean score of those | Mean score of the rest | Failed attempts above | Seconds of failed attempts above the limit |
|---|---|---|---|---|---|---|
| 120 | 1 | 0.3 % | 3.75 | 3.52 | 1 | 6 |
| 180 | 0 | 0.0 % | - | 3.52 | 0 | 0 |
| 240 | 0 | 0.0 % | - | 3.52 | 0 | 0 |
| 300 | 0 | 0.0 % | - | 3.52 | 0 | 0 |
| 420 | 0 | 0.0 % | - | 3.52 | 0 | 0 |

Saving in wall-clock seconds per run (Model A of 46-MEASURE.md: only the attempts that failed are cut; queue effects ignored): 0 s in all 11 runs for every limit from 120 s to 600 s. At 120 s one failed attempt (126 s) would be cut, which saves 6 s, and one accepted page (live 1, page 15, 126 s, score 3.75) would be lost.

The existing limit is `PAGE_LIMITS.timeoutMs` = 720 s (`apps/agent-worker/src/goals/manga-page.ts`). No attempt came near it.

For comparison, the v0.1 measurement (11 runs, 362 attempts, `46-MEASURE.md`) found a longest success of 313 s and a longest failure of 611 s, in two runs before the F1 fix (6 submits per page). In the 11 v0.2 runs the longest attempt is 126 s. Page 42 of live 3 and page 19 of the hold-out are the only failures. A tail of the F1 kind did not appear again.

### 2.3 Decision

D35: no new limit. The saving is 0 s at every limit from 120 s to 600 s, and a limit at 120 s costs an accepted page. See `docs/decisions.md`.
Re-open it only if a measured run has a page attempt above 300 s that then fails.

Limits of this measurement: 11 runs, 6 books, all Flash; the durations depend on the load of MiniMax on the day; an attempt that a limit would have cut is not observed, so the cost of a limit on a success is a bound.

## 3. Issue #85: Flash price and plan headroom

### 3.1 Price check (2026-10-14, 12:36 UTC)

| Page | URL | Result |
|---|---|---|
| Pay-as-you-go prices | https://platform.minimax.io/docs/guides/pricing-paygo.md (same as https://platform.minimax.io/docs/pricing/overview.md) | LLM table lists MiniMax-M3 only (Standard up to 512k input: $0.30 input, $1.20 output, $0.06 cache read per million tokens, "Permanent 50% off" from $0.60, $2.40, $0.12; Priority 1.5x) and the M2.x models. No line for MiniMax-M3.1-Flash-Preview. |
| Rate limits | https://platform.minimax.io/docs/guides/rate-limits.md | No Flash line. |
| M Plan overview | https://platform.minimax.io/docs/token-plan/intro.md | The text model of all three tiers (Go, Explore, Build) is "M3.1 Flash Preview". Tiers are relative (Go 1x, Explore 3x, Build 7.5x). No price per token. |
| M Plan FAQ | https://platform.minimax.io/docs/token-plan/faq.md | Credit packs support "M3.1 Flash Preview". Use depends on thinking depth. No price per token. Gives the `token_plan/remains` endpoint on `https://www.minimax.io`. |
| Site pricing page | https://www.minimax.io/pricing | A client-side page. The server answers the same 699 KB shell for every path. It has no readable price in the HTML. |

Result: there is no published price per token for MiniMax-M3.1-Flash-Preview. It is offered through M Plan and credit packs. The price of a run on the pay-as-you-go API for this model is unknown.

### 3.2 What the v0.2 runs cost

The recorded cost is exact at the M3 Standard rates. Check: `input * 0.30 + output * 1.20 + cache_read * 0.06` per million tokens gives the recorded `totals.cost_usd` to the cent for all 11 runs (`price-check.out`). The 11 runs together used 12,150,938 input, 3,392,349 output and 44,549,214 cache-read tokens. At M3 rates that is $3.65 + $4.07 + $2.67 = $10.39.

Cost scales with the rate. If MiniMax publishes a Flash price, the cost of a run is the table below at that share of the M3 rates (it assumes the same split between input, output and cache read):

| Run | Recorded (M3 rates) | At 50 % | At 25 % | At 150 % (Priority) |
|---|---|---|---|---|
| live 1 | 0.750 | 0.375 | 0.188 | 1.125 |
| live 3 (68 pages) | 1.878 | 0.939 | 0.469 | 2.816 |
| live 6 / final journey (just-so) | 0.993 / 0.988 | 0.497 / 0.494 | 0.248 / 0.247 | 1.490 / 1.482 |
| private book | 1.008 | 0.504 | 0.252 | 1.511 |

(The full table of 11 runs is in `price-check.out`.)

### 3.3 Proposal for the orchestrator (not applied)

Not changed: the basis copy, D13, `FLASH_COST_BASIS`.

- While no price exists: keep "Estimate at MiniMax-M3 rates, not a bill." The basis sentence is true: the recorded cost equals the M3 rates exactly. Optionally add one clause to `cost_basis`: "MiniMax publishes no price for the Flash model; a bill may be lower or higher." The preflight test would need one assertion for it.
- When MiniMax publishes a Flash price: set the Flash rates where Pi gets the model cost, change `FLASH_COST_BASIS` in `packages/agent-runtime/src/goal-runtime.ts` to name the price and the page, and re-compute the cost columns of `FIT_RUNS` from the token totals (the formula in 3.2; the token totals are in each run's `edition.json`). The cost ranges then scale by the rate ratio. `COST_PER_KWORD`, `COST_PER_PAGE` and `DRAW_COST_PER_PAGE_*` scale in the same way.
- If the owner runs on M Plan (no per-token bill): the cost range has no meaning in dollars. The honest figure then is a share of the 5-hour and the weekly window, which needs the headroom endpoint (D36).

### 3.4 Plan headroom endpoint: D36

`GET https://www.minimax.io/v1/token_plan/remains` is on `www.minimax.io`, not on `api.minimax.io`. The owner did not approve a second host. No call to it was added. D36 records: no second host in v0.3; the claim "the worker talks only to api.minimax.io" stays.
For v0.4 the owner must decide:

1. Is a second host acceptable, with the claim changed to "api.minimax.io and www.minimax.io, read-only, only the plan endpoint"?
2. If yes: the call goes in the worker only (never the backend or the browser), uses the existing key handling, never logs the key or headers, and its host is listed in `/internal/v2/egress`. The preflight then shows the remaining share of the 5-hour and weekly windows next to the range.
3. If no: the preflight stays an estimate, and the owner reads the usage page (https://platform.minimax.io/console/usage) or runs `mmx quota` by hand.

## 4. How this was verified

Commands and counts are in the PR body. Short form:

- `cd backend && TEST_MONGODB_URL=mongodb://127.0.0.1:27150 .venv/bin/python -m pytest -q`: 112 passed.
- `... pytest tests/test_preflight.py -q`: 37 passed, 0 skipped (the 2 API tests ran against the owned mongod).
- Replay stack on ports 3250, 8150, 8850, 27150 (`PANELSUMMARY_REPLAY_WORKER=scripts/fixtures/replays/happy-prince-two-tales ./start.sh`), the two-tale PDF uploaded through `POST /upload`, `GET /books/{id}/preflight` before and after (section 1.4). The stack was stopped with `./stop.sh`; ports 3250, 8150, 8850 and 27150 were free afterwards.
