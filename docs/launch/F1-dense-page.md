# F1: the dense-page failure loop

Date: 2026-10-09. Branch: `fix/dense-page`, made from `release/v0.1` at a53378e.
Status: PARTIAL. The mechanism is verified and the hints work. A better success rate is not proven.
Every number below was measured by this track from a file named in the text.
Each timing has the load average (`uptime`, 1 minute) from the start of that run.
Cost is the Pi catalog estimate from the receipts. Flash has no published price,
so its cost is an estimate at MiniMax-M3 rates (D13).

## 1. The problem

In both live M3 runs of the two-tale book, page 12 failed both attempts. The runs are the Phase 0
local run and the CI live run. The edition ended `completed_with_failures` with
"output cut off at the token limit without a submission" (`NO_SUBMISSION`).
Page 12 is the same beat in both runs: the Nightingale flies to three Rose-trees,
and the third names the price.

Receipts (`p0-baseline/export/receipts.json`, `ci-live-p0/live-run/export/receipts.json`):

| Run | Attempt | Thinking | Submits | Cut-off turns | Output tokens | Stop |
|---|---|---|---|---|---|---|
| Phase 0 | 1 | off | 7 | 1 | 59,888 | `LIMIT` submit limit (6) |
| Phase 0 | 2 | low | 3 | 2 | 48,429 | `NO_SUBMISSION` |
| CI | 1 | off | 7 | 0 | 27,916 | `LIMIT` submit limit (6) |
| CI | 2 | low | 2 | 2 | 36,161 | `NO_SUBMISSION` |

The other 28 page attempts of the two runs needed 1 to 4 submits, and none was cut off more than once.

## 2. Root cause

There are three causes. They act together. The first two make attempt 1 hit the submit limit.
The third makes attempt 2 end with `NO_SUBMISSION`.

### 2.1 The error texts say "give this panel more room", but the cause is the whole page

The first drafts of M3 put about 10 lines in 4 or 5 panels (replay `before`, P0, M3 off: `stacked_to_tall_3` with 8 texts, then `establish_4` with 8 texts;
replay `v1`, CI, M3 off: `staggered_5` with 10 texts and 117 words).
The room errors are `TEXT_DOES_NOT_FIT`, `BALLOON_TALL`, `TAIL_CROSSES_TEXT` and `KEY_PROP_COVERED`.
Each message tells the writer to "give this panel more room" or "shorten it". The writer fixes one panel,
and the next panel fails. A page with three Rose-tree visits, each with a request and an answer, needs
6 panels. No judged page of the three test sets has 6 panels (table 4). The skill says 6 or 7 panels
are for "a rapid exchange or a montage". So the writer does not try them.

### 2.2 Validators pull in opposite directions

The receipts and the replays show these pairs. Each fix of one makes the other.

| Fix of | Makes |
|---|---|
| `LAYOUT_PANEL_ASPECT` (a sliver panel) | `TEXT_DOES_NOT_FIT` (a bigger panel for a long line makes its neighbour thin) |
| `SPEAKER_TOO_SMALL` (the speaker must be in a medium or close shot) | the guideline "never three equal shots in a row", and then `TEXT_DOES_NOT_FIT` |
| `QUOTE_NOT_IN_SOURCE` (use the book's exact words) | `BALLOON_TALL` (the exact words of the price speech are 60 words) |
| `CHARACTER_NOT_INTRODUCED` (name the Rose-tree) | `TEXT_DOES_NOT_FIT` (a caption takes room) |

The writer cut a quote by joining two pieces of the book without "...". The error then showed only the closest
source sentence. It did not say that the first words were right and where the join was.
Example, replay `after2-ci`: three rounds of `QUOTE_NOT_IN_SOURCE`, `BALLOON_TALL+QUOTE_NOT_IN_SOURCE`,
`BALLOON_TALL+KEY_PROP_COVERED`.

The writer was one error from done on three submits in a row, and then hit the limit
(Phase 0 attempt 1: 1 `CHARACTER_NOT_INTRODUCED`, 1 `SPEAKER_TOO_SMALL`, 1 `TEXT_DOES_NOT_FIT`, 1 `LAYOUT_PANEL_ASPECT`).
A page with 6 or 7 panels and 10 lines needs about 8 submits to converge (replay `after3-ci`, M3 off: accepted at submit 8).

### 2.3 The retry at thinking "low" is cut off by thinking, and a higher cap does not help

Attempt 2 runs at thinking `low`. The worker sends `enabled:2048` (a budget of 2,048 thinking tokens).
M3 thinks far beyond that budget. Thinking tokens count against `maxOutputTokens`, which is the cap of one turn
(16,000 for a page). In four replays on the CI page, M3 `low` was cut off 4 of 4 times. In the two replays that recorded
the last reply (`v2` and `final`), the visible reply was empty (`last_output_excerpt` is empty): the whole turn was thinking.
We raised the cap to 32,000 for runs with thinking (`after-ci`, `after2-ci`). They were cut off as well
(55,415 and 45,451 output tokens in 3 or 4 turns). So the cap is not the cause, and the final code keeps 16,000.

M3 at thinking `off` is cut off for a different reason. It writes a long plan as visible text
("Major room problem ... New plan (7 panels ...)") and re-argues shot sizes until the cap
(replay `after2-ci`, M3 off: 2 cut-off turns, 35,469 output tokens). The skill told the writer to
"plan before writing JSON", and every rejection said only "fix every error".

### 2.4 The plan is not the cause (checked, not fixed)

The page-12 beat is one of the larger beats, but it is not larger than judged pages.
Source words and dialogue turns per page (a unit shared by N pages counts 1/N for each page; a "turn" is a
quoted span of the source). Script: the per-page share of the units listed in `plan.json`, computed from `units.json`.

| Set | Page | Words | Quoted words | Turns | Result |
|---|---|---|---|---|---|
| Phase 0 | 12 | 505 | 315 | 25 | failed |
| CI | 12 | 738 | 450 | 29 | failed |
| run 8 | 15 (the same beat as Phase 0 page 12) | 505 | 315 | 25 | accepted, judge mean 3.00 |
| run 8 | 40 | 818 | 568 | 27 | accepted, judge mean 3.75 |
| Phase 0 | 6 | 760 | 409 | 26.5 | accepted, judge mean 3.67 |
| Phase 0 | 5 | 462 | 360 | 15 | accepted, judge mean 3.21 |

No threshold on words, quoted words or turns flags page 12 of Phase 0 without flagging judged pages.
The same beat was accepted in run 8. So a density budget in `ADAPTATION_PLAN` would be an error on a good page.
By the calibration rule it cannot be an error. As a warning it would only be written after the plan is accepted, so nobody would act on it.
We did not add it. The plan is not changed, and we did not replay `ADAPTATION_PLAN`.

## 3. The fix

All in `apps/agent-worker` (code `90e56e6`). The renderer is not changed, so `RENDERER_VERSION` is not changed.

1. `PAGE_TOO_FULL` (warning). When 2 or more room errors are on a page, and 2 or more panels have errors or the page has
   2 or more texts per panel, the writer gets one message. It says the page, not the panel, is the problem. It lists the
   templates with 1 or 2 more panels (or says "cut words" at 7 panels), and 4 moves: 2 balloons and about 12 words per panel,
   cut long speeches with "...", split them, and letter a refrain in full once.
2. `REPAIR_LOOP` (warning). The last 3 rejected tries each had 3 errors or fewer, and the set of error codes changed
   twice. The message lists all codes seen with one concrete move for each (`MOVES` in `repair-hints.ts`),
   and says to fix them together.
3. `LAYOUT_PANEL_ASPECT` now names the ready templates with the page's panel count and says why a hand-made tree fails.
4. `QUOTE_NOT_IN_SOURCE` says where the writer joined two pieces of the book: which words are in the book, which words
   do not follow them, and to write "..." where words are skipped.
5. `maxSubmits` is 8 (was 6), `maxTurns` and `maxToolCalls` are 20 (were 16). The cost limit (0.8 USD) and the 12 minute limit are not changed.
   A page that still fails shows as failed (D11).
6. After every rejection and every preview with errors, the writer is told to reply with the tool call and keep notes to 5 lines.
7. Skill `manga-page` 1.6.0 to 1.7.0: count the lines before the template (more than 8 lines or 90 words means a 6 or 7 panel template),
   letter a refrain once, plan in 5 lines, repair the page and not the panel. The skill grew from 18,383 to 19,269 bytes. The three skills together are 6.9 percent
   above the pre-T1 baseline, below the 8 percent limit of the T1 size test.

None of the new checks is an error. The hints are warnings, and they appear only on a try that already has errors.
They never block a page and never appear on an accepted page.

## 4. Calibration

Script: `apps/agent-worker/scripts/calibrate-f1.ts`. It runs every judged accepted page of the three sets through `submit_page`
of the current code. Output: `f1-impl/calibration.json`.

| Set | Pages | Panels (3 / 4 / 5 / 6+) | Texts per panel: max, mean | Words per page: max |
|---|---|---|---|---|
| Phase 0 | 15 | 0 / 8 / 7 / 0 | 2.25, 1.49 | 78 |
| CI | 13 | 1 / 6 / 6 / 0 | 2.25, 1.49 | 56 |
| run 8 | 46 | 3 / 20 / 23 / 0 | 2.40, 1.44 | 78 |
| Total | 74 | 4 / 34 / 36 / 0 | 2.40 | 78 |

- All 74 pages are still accepted by the current validators.
- `PAGE_TOO_FULL` and `REPAIR_LOOP` fired on 0 of 74 pages. They need errors, and these pages have none.
- Volume alone does not separate the pages. Texts per panel is 2.0 to 2.25 in the failing drafts and up to 2.40 in accepted pages.
  So the hint depends on the room errors and not on the volume. This is why it is a warning.

## 5. Live verification

Spend: 0.913 USD of the 1.00 USD cap (17 live runs of one page, Pi estimates).
Method: `apps/agent-worker/scripts/replay-page.ts` runs the real `MANGA_PAGE` goal (the same `executeDefinition` path as the worker)
on page 12 with the inputs of an export. The key came from the Keychain in the same shell command and was not printed.
Replay files: `/Volumes/Mrigesh SSD/Book-Reel-scratch/launch/f1-impl/<variant>/` (`*.trace.json`, `*.calls.jsonl` with every reply the model received, `*.png`).

Code variants:

- `before`: `release/v0.1` at a53378e, skill 1.6.0, 6 submits, cap 16,000.
- `v1` (`after-ci`): hints 1 to 3 and the 32,000 cap for runs with thinking.
- `v2` (`after2-ci`): v1 and the quote hint and 8 submits.
- `final` (`after3`, `after3-ci`): the committed code. The cap is back to 16,000, with terse repair and skill 1.7.0.

"P0" is the Phase 0 export input (1 unit, 3 claims in the plan, cast of 2). "CI" is the CI export input (2 units, 971 words, cast of 3).
CI is the harder input. Thinking sent is what the harness put on the wire (`trace.thinking_sent`).

| Variant | Input | Model | Thinking sent | Outcome | Submits | Turns | Cut-off turns | Output tokens | Latency | Cost USD | Load avg |
|---|---|---|---|---|---|---|---|---|---|---|---|
| before | P0 | M3 | disabled | SUCCEEDED | 3 | 10 | 1 | 38,408 | 376 s | 0.069 | 3.41 |
| before | P0 | M3 | enabled:2048 | SUCCEEDED | 3 | 5 | 1 | 22,700 | 188 s | 0.042 | 3.41 |
| before | P0 | Flash | adaptive:low | SUCCEEDED | 1 | 6 | 0 | 8,598 | 54 s | 0.023 | 3.41 |
| before | CI | M3 | disabled | SUCCEEDED | 2 | 8 | 0 | 13,026 | 88 s | 0.028 | 4.41 |
| before | CI | M3 | enabled:2048 | FAILED `NO_SUBMISSION` | 2 | 4 | 2 | 34,928 | 275 s | 0.058 | 4.41 |
| before | CI | Flash | adaptive:low | FAILED `LIMIT` (7 submits) | 7 | 13 | 0 | 27,752 | 269 s | 0.071 | 4.41 |
| v1 | CI | M3 | disabled | FAILED `LIMIT` | 7 | 13 | 0 | 25,990 | 367 s | 0.065 | 6.01 |
| v1 | CI | M3 | enabled:2048 | FAILED `NO_SUBMISSION` | 2 | 4 | 1 | 55,415 | 581 s | 0.094 | 6.01 |
| v1 | CI | Flash | adaptive:low | SUCCEEDED | 4 | 10 | 0 | 17,220 | 145 s | 0.043 | 6.01 |
| v2 | CI | M3 | disabled | FAILED `NO_SUBMISSION` | 2 | 4 | 2 | 35,469 | 375 s | 0.062 | 5.50 |
| v2 | CI | M3 | enabled:2048 | FAILED `NO_SUBMISSION` | 1 | 3 | 1 | 45,451 | 336 s | 0.073 | 5.50 |
| v2 | CI | Flash | adaptive:low | SUCCEEDED | 4 | 10 | 0 | 20,021 | 258 s | 0.046 | 5.50 |
| final | CI | M3 | disabled | SUCCEEDED | 8 | 14 | 0 | 30,415 | 229 s | 0.078 | 9.27 |
| final | CI | M3 | enabled:2048 | FAILED `NO_SUBMISSION` | 2 | 4 | 2 | 34,867 | 304 s | 0.058 | 9.27 |
| final | CI | Flash | adaptive:low | SUCCEEDED | 1 | 6 | 0 | 8,655 | 60 s | 0.023 | 9.27 |
| final | P0 | M3 | disabled | SUCCEEDED | 2 | 8 | 0 | 17,629 | 253 s | 0.040 | 10.44 |
| final | P0 | Flash | adaptive:low | SUCCEEDED | 3 | 9 | 0 | 15,117 | 118 s | 0.039 | 10.44 |

Latency depends on the load. Compare latencies only inside one row group with similar load.

### What the table shows

- With the code at a53378e, the P0 input did not fail in any of 3 replays (the live runs of the same input failed 2 of 2 attempts).
  The failure is not deterministic, and the P0 input is the milder case. We did not reproduce the exact P0 failure.
- The CI input reproduces both failure types with the old code: the submit limit (Flash) and the cut-off (M3 `low`).
- M3 `low` on the CI input failed in 4 of 4 replays, with every variant, and failed in 2 of 2 live attempts.
  On P0 it succeeded 1 of 1. The cap change did not help.
- M3 `off` on the CI input: `before` 1 of 1, `v1` 0 of 1, `v2` 0 of 1, `final` 1 of 1. One run per cell is too small to show a gain.
  The `final` run needed 8 submits and would have failed at the old limit of 6. The `before` run succeeded at 2 submits, so the page is not always hard.
- Flash on the CI input: 0 of 1 with the old code, 3 of 3 with v1, v2 and final. Flash needed 1 to 4 submits.
- In `v1` (M3 off), the hint appeared in the replies (`PAGE_TOO_FULL` on the third preview and the first submit, `REPAIR_LOOP` on the last two submits)
  and the writer then changed from 5 panels to 7 and then 6 panels, and the errors went from 10 to 1 or 2 per try. The limit of 6 stopped it. This is the case that made us raise the limit.
- We cannot say that the hints raise the success rate. The sample is 1 run per cell. The mechanism (the hint is shown, the writer restructures) is verified in the call logs.

### Accepted pages

We looked at `final/CI` pages with the Read tool (`after3-ci/p12-MiniMax-M3-off.png`, `after3-ci/p12-MiniMax-M3.1-Flash-Preview-off.png`).
Both are 6 panel pages, readable, with the Nightingale and the Rose-tree as speakers and the tails pointing to the right figure.
The M3 page puts the price in two lines and a caption ("A thorn... and a price"). The long price speech of the book is cut to "Build it out of music by moonlight, stain it with your blood",
so the detail "breast against a thorn" is only a caption in the thorn panel. The Flash page letters "You must sing to me with your breast against a thorn".
We did not run the judge panel on these pages, so we make no claim about their judged score.

## 6. Not done and open

- Reading note: a `Submits` value of 7 on an attempt that stopped at the limit of 6 counts the rejected seventh call (it is the counter value at the stop, as in the receipts).
- Cost note: the limit change (6 to 8 submits, 16 to 20 turns and tool calls) adds up to about 30 percent worst-case cost and latency on a page that keeps failing. The cost limit of 0.8 USD still bounds one page.
- Before launch the owner should decide D13 for the M3 retry (`retry_thinking` off, or a measured Flash at `low`) and run at least 5 live replays per cell.

- `backend/app/settings.py` has `retry_thinking: str = "low"` (and `scripts/acceptance/live-config.json`). For M3, attempt 2 at `low` was cut off
  in 6 of 7 recorded runs (2 live, 4 CI replays; the 7th, a P0 replay, succeeded). Setting `retry_thinking` to `off` for M3 would remove the main cause of `NO_SUBMISSION`.
  This is outside the paths of this track. It needs an owner decision (D13 allows no silent model switches) and a measurement of Flash at `low`.
- `ADAPTATION_PLAN` was not changed and not replayed (section 2.4).
- No judge panel was run on the new pages.
- The runtime nudge text (`packages/agent-runtime`) says "Keep every text short". We did not touch it.

## 7. Checks

- `apps/agent-worker`: `npx tsc --noEmit` and `npx vitest run`: 82 tests pass (14 new in `test/dense-page.test.ts`).
- New tests: the hints (fire, stay silent, ignore warnings), the aspect hint, the loop tracker, the quote join point,
  the limits, the terse repair, and a run through `submit_page` that shows `PAGE_TOO_FULL` and no hint on an accepted page.
- `test/continuity.test.ts` now expects `manga-page` 1.7.0. The 8 percent growth test still passes (the three skills are 6.9 percent above the pre-T1 baseline).
