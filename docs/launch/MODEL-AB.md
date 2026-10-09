# Model A/B: M3 and Flash (2026-10-09)

This file holds the evidence for decision D13 (revised 2026-10-09). It records what was run,
what was measured, the rule and the decision per goal. Numbers are from the run artifacts under
`Book-Reel-scratch/launch/` on the build SSD. They were not measured again for this file, except
the cost, page and time columns of the preflight fit, which were recomputed from each run's
`receipts.json`, `edition.json` and `journey-report.json`.

## Question and rule

Owner direction, 2026-10-09: prefer `MiniMax-M3.1-Flash-Preview` where it holds quality, use M3
less, and measure and record every switch. Rule: Flash becomes the default for a goal where it is
at least as good as M3 on judged quality and on validation. M3 stays where Flash measurably loses.

## Method

- Book: `happy-prince-two-tales.pdf`, 26 PDF pages, 5,794 words, 2 tales.
- Judges: 3 independent Sonnet judges per page, with the run 8 prompt (rubric: `docs/rebuild/research/craft.md` section g). "Mean accepted" is the mean over accepted pages. "Mean all" counts a failed page as 0.
- Understanding is MiniMax-M3 at thinking low in every arm.
- Calibration: the run 8 pages (68-page book) judged again by the same panel scored 7 of 46 at the ship bar, mean 3.47, legibility 3.48, speaker 3.64, continuity 2.88, fidelity 3.34. The single judge of the original run gave 5 of 46, 3.38, 3.30, 3.83, 2.43, 2.93. Single-judge and panel numbers are not comparable. Both reports are in `docs/rebuild/baselines/` (`run8.md`, `run8-panel.md`, `run8-panel.json`).

## Arms

| Arm (plan / pages) | Code | Config | Run |
|---|---|---|---|
| M3 / M3 | main `fd5a326`, local | all M3 | `p0-baseline` |
| M3 / M3 | CI branch `7312d4a` | all M3 | CI run 37891706723, `orchestrator/ci-live-p0` |
| M3 / Flash | `217d4e6` (main + CI + T0), local | `PAGE_MODEL=MiniMax-M3.1-Flash-Preview`, `RETRY_THINKING=medium` | `ab-m3plan-flashpages` |
| Flash / Flash | `217d4e6` | plan and pages on Flash | CI run 37895361596, `ab-flash-old` |
| Flash / Flash | release `a53378e` (new code, T1 and T2) | plan and pages on Flash | CI run 37895870904, `gate1-flash-ci` |

## Results

| Arm | Pages | Failed | Ship bar | Mean all | Mean accepted | Legibility | Speaker | Continuity | Fidelity | Generate to page 1 / finished | Cost (Pi est.) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| M3 / M3, local | 16 | 1 | 2 | 3.31 | 3.53 | 3.60 | 3.51 | 3.04 | 3.29 | 795 s / 2,115 s | $0.81 |
| M3 / M3, CI | 14 | 1 | 3 | 3.20 | 3.45 | 3.46 | 3.44 | 2.95 | 3.36 | 940 s / 1,747 s | $0.60 |
| M3 / Flash, local | 16 | 0 | 2 | 3.40 | 3.40 | 3.31 | 3.38 | 3.04 | 3.08 | 954 s / 1,363 s | $0.53 |
| Flash / Flash, CI | 21 | 0 | 0 | 3.40 | 3.40 | 3.29 | 3.29 | 2.87 | 3.38 | 744 s / 1,087 s | $0.59 |
| Flash / Flash, CI, new code | 22 | 0 (1 page needed its retry) | 2 | 3.42 | 3.42 | 3.33 | 3.35 | 3.11 | 3.26 | 1,361 s / 2,094 s | $0.87 |

Judge reports: `launch/<dir>/aggregate.md` for each directory above. The last arm was judged after this file was first written;
its row shows that report (continuity rose from 2.87 to 3.11 with the T1 state checks). Timings: the journey's observed seconds from Generate. The
edition's own clock gave 1,358 s and 2,066 s for the last arm. The load average of the CI runs is not available to this track. The local M3 / Flash run started at load 11.65 (a shared and
busy Mac), so its times are the weakest numbers here.

Other measurements:
- Plan latency: Flash 34 to 69 s (two runs; later Flash runs took 69 to 198 s). M3 16 s (CI run) to 235 s (baseline), 79 s (local A/B).
- Understanding (M3, low) latency in the five runs: 472, 793, 826, 633 and 1,259 s. The same model and book varied by a factor of 2.7.
- Pages with Flash: median 61 s per page. 18 of 21 pages were accepted at the first submit.
- The journey check "every model call is a receipted harness goal on an allowed MiniMax model" failed in the three Flash runs above. The reason was a hard-coded model list without Flash in the journey code of that time. Release `v0.1` already lists Flash (F2), so this track changes nothing in `journey.mjs`.

## Decision per goal

| Goal | Model | Thinking | Retry thinking | Why |
|---|---|---|---|---|
| BOOK_UNDERSTANDING | MiniMax-M3.1-Flash-Preview (since the second A/B below; first decision: MiniMax-M3) | low | medium | First decision: Flash failed 3 of 3 in the T0 smoke on the statue guard. The guard was wrong (#33). After the fix, Flash passed in its first goal attempt in 3 of 3 runs, did not measurably lose to M3 (a little lower, inside the run-to-run spread), and was 2.5 to 6 times faster. See "Second A/B: the understanding". |
| ADAPTATION_PLAN | MiniMax-M3.1-Flash-Preview | off (adaptive low is sent) | medium | Flash plans in 34 to 198 s against 79 to 235 s. No plan failure in 3 Flash runs. Page quality with a Flash plan is the same as with an M3 plan on continuity (2.87 to 3.04) and fidelity. |
| MANGA_PAGE | MiniMax-M3.1-Flash-Preview | off (adaptive low is sent) | medium | No failed page in 3 Flash runs (59 pages). Book-level mean 3.40 against 3.20 and 3.31. Cost: $0.53, $0.59 and $0.87 for Flash pages against $0.81 and $0.60 for M3 (the $0.87 run had a 1,259 s understanding). See the caveat. |

M3 is the fallback for each goal (environment settings in D13). If pages return to M3, set
`PAGE_RETRY_THINKING=off`: for M3 pages a retry at `low` was cut off by runaway thinking in 6 of 7
recorded runs (F1).

## Caveat

- One or two runs per arm, on one book of 26 PDF pages. The differences between arms (about 0.1 on the mean) are inside the spread of two runs of the same arm (M3 / M3: 3.31 and 3.20).
- Per-page legibility with Flash pages is about 0.2 lower in both Flash runs (3.29 and 3.31 against 3.46 and 3.60). Flash's higher book-level mean comes from having no failed page, and not from better accepted pages (mean accepted 3.40 against 3.53 and 3.45).
- Flash arms had 0 and 2 pages at the ship bar of 16 to 21 pages. M3 arms had 2 and 3.
- Cost and time estimates in the preflight now rest on 10 runs. Only 3 of them use Flash, all on this one book. See `backend/app/preflight.py`.
- Gate 2 (the 68-page book) checks this again. If Flash pages are below M3 pages on accepted-page quality there, the pages go back to M3 by the settings in D13.

## What this track changed

- `backend/app/settings.py`: per-goal models and retry thinking; `policy_fields()`.
- `backend/app/jobs/generate.py`: each stage uses its own retry thinking; the edition policy gets every per-goal key at the start of the job (older editions keep the values they recorded).
- `backend/app/preflight.py`: four more measured runs, a wider cost high factor (1.25), a flat slow-hour term for understanding time (800 s), and a basis text that says what the range rests on.
- `scripts/acceptance/live-config.json`: the new defaults. The CI workflow reads only `retry_thinking` (not the per-goal keys), so that key is `medium`, and the workflow applies it as `RETRY_THINKING`. In the backend this old setting changes the plan and page retries only. (Since the second A/B the understanding retry default is `medium` too; see below.)

## Second A/B: the understanding (2026-10-09, after the statue-guard fix #33)

The first decision kept the understanding on M3 because Flash failed it 3 of 3 times in the T0 smoke
test. Track F3 (#33) then found that the statue guard was wrong: it flagged any cast member whose text
mentions a statue, and the flag was sticky. In the Flash smoke run it flagged the Swallow ("sleeps
between the statue's feet"). In M3 runs it flagged the Mayor and the Art Professor, and the model gave
in and drew them in stone. So the 3 of 3 failures were not evidence about Flash.

Same code (`release/v0.1` with #33), same book (26 PDF pages), plan and pages on Flash in both arms.

| Understanding | Where | Pages | Failed | Ship bar | Mean | Legibility | Speaker | Continuity | Fidelity | Beat | Understanding | Page 1 / finished | Cost (Pi est.) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MiniMax-M3 | local | 22 | 0 | 6 | 3.53 | 3.47 | 3.50 | 3.05 | 3.33 | 3.55 | 801 s, 2 submits | 945 s / 1,337 s | $0.65 |
| Flash | CI run 37903122403 | 22 | 0 | 4 | 3.49 | 3.44 | 3.47 | 2.94 | 3.38 | 3.35 | 132 s, 1 submit + 1 patch | 427 s / 795 s | $0.59 |

Reports: `launch/uab-m3-local/aggregate.md` and `launch/uab-flash-ci/aggregate.md` in the scratch
directory. The Flash understanding had 69 claims and 18 locations (M3 in this A/B: 38 claims and 9 locations;
earlier M3 runs of this book: 32 to 39 claims, 7 to 11 locations). Only the Prince was cast as a statue in both.

Gate 2 (the 68-page book, `release/v0.1` `d1a2286`) ran both understanding models at the same time
(CI: all Flash; local: M3 understanding). At about 08:50 UTC the MiniMax account reached its plan limit
("Token Plan usage limit reached", error 2056), so both runs stopped drawing pages:

| Understanding | Pages drawn | Ship bar | Mean (drawn pages) | Tale 1 mean | Understanding | Page 1 / finished |
|---|---|---|---|---|---|---|
| Flash (CI run 37906337189) | 46 of 56 (tales 1-4 and 2 pages of tale 5) | 7 of 46 | 3.52 (all 46 drawn pages) | 3.53 (15 pages) | 221 s | 382 s / 1,231 s |
| MiniMax-M3 (local) | 18 of 50 (32 not drawn or failed after the plan limit) | 2 of 20 judged (2 failed) | 3.48 (18 accepted pages; 3.14 with failed pages as 0) | 3.40 (11 pages) | 545 s | 771 s / 1,575 s |

Run 8 judged by the same panel: 7 of 46, mean 3.47 (tales 1-4 only: 4 of 36, 3.44).

Result: the Flash understanding does not measurably lose. In the matched 26-page A/B it was a little
lower on every headline number (mean 3.49 against 3.53, ship bar 4 against 6), inside the spread of two
panel-judged M3 runs of one configuration (3.31 and 3.20). The Gate 2 tale-1 comparison (3.53 against
3.40) is not a matched page set. Flash passed the understanding in its first goal attempt in 3 of 3 runs
after #33 and is 2.5 to 6 times faster. The owner's rule keeps M3 only where Flash measurably loses, so
the understanding moves to Flash. M3 stays the fallback (`UNDERSTANDING_MODEL=MiniMax-M3`,
`UNDERSTANDING_RETRY_THINKING=low`).
