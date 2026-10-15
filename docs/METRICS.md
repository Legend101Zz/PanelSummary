# Metrics by release

This file shows how each release changed the quality, the speed and the cost of the manga. It compares each release
with the release before it. It shows what got better, what got worse and what was not measured. Update it at each release
(see "How to update this file").

## How we measure

- **Judges.** A panel of 3 Sonnet judges scores every page on 8 criteria from 1 to 5 (legibility, reading flow, speaker
  attribution, continuity, variety, page turn, fidelity, beat without a prose wall). The page score is the mean of the
  criteria and the judges. A failed page counts as 0. The judges are AI models, not readers.
- **Strict bar.** A page passes the strict bar when no criterion is below 3, legibility and fidelity are 4 or more, and
  the mean is 3.5 or more.
- **Defect rates.** Blocker and major defects per judge-page, by kind (`scripts/acceptance/judge/kinds.py`). Lower is
  better. The kinds are: key prop not drawn, wrong setting, a key figure (hero) a speck or cropped, a balloon tail at the
  wrong figure, label clutter and repeated panels.
- **Same book, same panel.** Compare a release only with another release on the same book, judged by the same panel.
  Two runs of the same code on the same book can differ by up to about 0.15 in the mean (for example 3.44 and 3.48, or
  3.35 and 3.49). A difference of that size in one run can be noise; more runs per book make a result more certain.
- **Time.** From the edition record: from the start of the edition to its first accepted page, and to its end.
- **Cost.** Pi catalog estimates at MiniMax-M3 rates (MiniMax publishes no price for the Flash model). This is not a
  bill. **Tokens** are input, output and cache-read tokens of all calls, per accepted page.
- **Recompute** every judged number in this file from the fixtures in the repository:

  ```sh
  python3 scripts/acceptance/judge/compare_runs.py --spec scripts/acceptance/judge/release-history.json \
      --group sealed-fiction=jataka-tales-thirteen,indian-why-stories-eight --base-version v0.2 --out-md cmp.md
  ```

## The releases at a glance

| | Run 8 (Sept. 2026, before v0.1) | v0.1.0 (2026-10-09) | v0.2.0 (2026-10-10) | v0.3.0 (2026-10-14) |
|---|---|---|---|---|
| Goal of the release | the rebuilt pipeline | one path from a PDF to a manga; a run card that tells the truth | a new app; draw part of a book; better pages | better pages on books nobody tuned on |
| **68-page tuning book** (the same book in every release) | | | | |
| Mean (1–5) | 3.47 | 3.54 | 3.55 | 3.54 |
| Pages at the strict bar | 7 of 46 | 12 of 60 | **20 of 61** | 9 of 61 |
| Pages accepted | 46 judged | 60 of 60 | 60 of 61 | **61 of 61** |
| First page | 30 min ¹ | 5.0 min | 4.9 min | 4.9 min |
| All pages | 48.5 min ¹ | 15.6 min | 14.7 min | **13.1 min** |
| Cost (estimate) | $1.65 | $1.72 | $1.88 | $1.98 |
| Tokens per page | — | 176k | 199k | 206k |
| **Fiction nobody tuned on** | | | | |
| *Just So Stories*, mean (runs) | — | 3.38 (1) | 3.42 (3) | 3.46 (1) ² |
| Two sealed fiction books, mean (runs) | — | not run | 3.45 (4) ³ | **3.51** (3) |
| Key prop not drawn (sealed fiction) | — | — | 0.76 | **0.58** |
| Wrong setting (sealed fiction) | — | — | 0.19 | **0.13** |
| Key figure a speck or cropped (sealed fiction) | — | — | 0.69 | 0.70 |
| **Final journey** (a book through the real UI, fresh database) | — | Andersen tales: 18 of 18 pages, first page 3.8 min, mean 3.53 | *Just So Stories*: 29 of 29, first page 1.7 min, mean 3.40 | *Jataka Tales* (sealed): 28 of 28 after a provider stop and one resume, first page 4.9 min, mean 3.54 |
| Live spend for the build (estimate) | — | $11.61 (cap $25) | $9.4 (cap $50) | $17.77 (cap $50) |

¹ From the v0.1 release notes; that run used other models (MiniMax-M3) and another clock.
² In v0.3 this book was the diagnosis book for issue #81, so it is not unseen for v0.3.
³ v0.2.0 was run on the sealed books during v0.3, with the tag `v0.2.0`.

## What got better, release by release

### v0.1.0, against run 8 of the September rebuild

Same 68-page book, same judge panel.

- **Speed.** The first page came after 5.0 min, not 30 min. All pages were done after 15.6 min, not 48.5 min. Cause: one
  model (`MiniMax-M3.1-Flash-Preview`) on every step with low or no thinking (D13), and four pages drawn at the same time.
- **Quality.** Mean 3.47 → 3.54. Pages at the strict bar 7 of 46 → 12 of 60. Continuity 2.88 → 3.02. Fidelity 3.34 →
  3.51. Cause: the single sealed harness, the continuity and writer fixes, renderer 0.5.0.
- **Trust.** Every model call has a receipt. A failed page shows as failed. A provider stop stops the run where you can
  see it, and **Resume drawing** continues it.
- **Not better.** Cost is about the same ($1.65 → $1.72). Reading flow and speaker attribution are lower than the
  single-judge numbers of run 8; most of that gap comes from the change of judge.

### v0.2.0, against v0.1

- **68-page book.** Pages at the strict bar 12 → 20. Key figure a speck or cropped 0.48 → 0.35 ⁴. Tail at the wrong
  figure 0.20 → 0.11. Label clutter 0.16 → 0.08. Speaker attribution 3.53 → 3.68. Fidelity 3.51 → 3.61. All pages
  15.6 → 14.7 min. Cause: renderer 0.6.0 (camera push, tails aimed at the speaker, new props and looks) and writer checks
  calibrated on 319 judged pages (D26).
- **Two-tale book.** Mean 3.46 (2 runs) → 3.60. Pages at the strict bar 2 and 4 → 6.
- **The reader.** Balloon text at 1440×900 is about 16.8 px, not 9–11 px.
- **New.** The new app UI, draw part of a book, the plan review, the built-in sample.
- **Not better or worse.** On *Just So Stories* (not tuned on) the mean is the same within noise (3.38 → 3.42). Key prop
  not drawn 0.59 → 0.75 and wrong setting 0.09 → 0.15 are worse there. Pages at the strict bar per run 4 → 1–2. Page turn
  on the 68-page book 3.51 → 3.35. Tokens per page on the 68-page book +13%; cost $1.72 → $1.88.

⁴ The v0.2 notes give 0.62 → 0.35. That compares with the v0.1 Gate 2 run that the token plan cut at 46 pages. Against
the complete v0.1 run of the same book (60 pages) it is 0.48 → 0.35.

### v0.3.0, against v0.2.0

- **Books nobody tuned on (the v0.3 goal).** On two sealed fiction books, v0.2.0 and v0.3 judged by the same panel:
  mean 3.45 → 3.51. Key prop not drawn 0.76 → 0.58 (−24%). Wrong setting 0.19 → 0.13 (−32%). Continuity 2.74 → 2.85.
  Fidelity 3.41 → 3.59. Beat without a prose wall 3.30 → 3.48. Cause: neutral stand-ins for animals, places and props
  (D29, D30) and writer guidance (D32–D34).
- ***Jataka Tales* (animal fables).** Mean 3.46 → 3.57 over two runs each. The run ranges do not overlap (3.44–3.48
  against 3.54–3.59).
  Continuity 2.76 → 2.96. Fidelity 3.43 → 3.71.
- **Camera push.** Figures lost or cut by a camera push: 21 → 0 (290 judged v0.2 pages drawn again offline, D31).
- **68-page book.** 61 of 61 pages accepted (v0.2: 60 of 61). All pages 14.7 → 13.1 min. Page turn 3.35 → 3.45.
- **New.** Continue with the next section, with the same cast, looks and places.
- **Not better or worse.**
  - The v0.3 bar was not met: it asked for +0.08 on the sealed fiction books and a quarter fewer tiny or cropped key
    figures. Key figure a speck or cropped is flat (0.69 → 0.70).
  - 68-page book: pages at the strict bar 20 → 9; repeated panels 0.08 → 0.18; key prop not drawn 0.43 → 0.51.
  - Two-tale book: mean 3.60 → 3.48 (2 runs); wrong setting 0.14 → 0.31.
  - Legibility on the sealed fiction books 3.44 → 3.32. *Indian Why Stories* is flat (3.44 → 3.43). *On a Piece of
    Chalk* 3.43 → 3.37 (inside the v0.2.0 spread of 3.35–3.49).
  - Tokens per page: +16% pooled over the six books that both versions ran (from −6% to +28% per book); cost per page
    +13%. The MiniMax token plan stopped 7 runs during the build.
- **Not measured** (the token plan stopped the runs): *Self-Reliance*, the private Cheese PDF, and the second runs of
  *Indian Why Stories* and *On a Piece of Chalk* (#126).

## Details by book

Columns: Leg = legibility, Flow = reading flow, Spk = speaker attribution, Cont = continuity, Var = variety, Turn = page
turn, Fid = fidelity, Beat = beat without a prose wall. Defects per judge-page: Prop = key prop not drawn, Set = wrong
setting, Hero = key figure a speck or cropped, Tail = tail at the wrong figure, Lab = label clutter, Rep = repeated
panels. Runs of one version are pooled; "Strict" is per run.

### 68-page tuning book (*The Happy Prince and Other Tales*)

| Release | Pages | Mean | Strict | Leg | Flow | Spk | Cont | Var | Turn | Fid | Beat | Prop | Set | Hero | Tail | Lab | Rep |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| v0.1 | 60 | 3.54 | 12 | 3.58 | 3.97 | 3.53 | 3.02 | 3.68 | 3.51 | 3.51 | 3.53 | 0.55 | 0.21 | 0.48 | 0.20 | 0.16 | 0.09 |
| v0.2 | 61 (1 failed) | 3.55 | 20 | 3.61 | 3.92 | 3.68 | 2.99 | 3.62 | 3.35 | 3.61 | 3.57 | 0.43 | 0.20 | 0.35 | 0.11 | 0.08 | 0.08 |
| v0.3 | 61 | 3.54 | 9 | 3.60 | 3.97 | 3.65 | 3.03 | 3.54 | 3.45 | 3.55 | 3.57 | 0.51 | 0.20 | 0.43 | 0.15 | 0.11 | 0.18 |

### Two-tale tuning book (*The Happy Prince*, *The Selfish Giant*)

| Release | Runs | Mean (runs) | Strict | Leg | Flow | Spk | Cont | Var | Turn | Fid | Beat | Prop | Set | Hero | Tail | Lab | Rep |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| v0.1 | 2 | 3.46 (3.42, 3.49) | 2, 4 | 3.39 | 3.80 | 3.41 | 3.02 | 3.70 | 3.65 | 3.32 | 3.36 | 0.61 | 0.15 | 0.68 | 0.27 | 0.26 | 0.08 |
| v0.2 | 1 | 3.60 | 6 | 3.65 | 4.02 | 3.55 | 3.08 | 3.65 | 3.56 | 3.64 | 3.64 | 0.50 | 0.14 | 0.55 | 0.24 | 0.08 | 0.12 |
| v0.3 | 2 | 3.48 (3.53, 3.43) | 4, 4 | 3.55 | 3.96 | 3.56 | 2.80 | 3.52 | 3.43 | 3.55 | 3.44 | 0.72 | 0.31 | 0.61 | 0.17 | 0.20 | 0.24 |

### *Just So Stories* (three tales; not tuned on in v0.1 and v0.2)

| Release | Runs | Mean (runs) | Strict | Leg | Flow | Spk | Cont | Var | Turn | Fid | Beat | Prop | Set | Hero | Tail | Lab | Rep |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| v0.1.0 | 1 | 3.38 | 4 | 3.33 | 3.97 | 3.42 | 2.68 | 3.64 | 3.37 | 3.44 | 3.18 | 0.59 | 0.09 | 0.78 | 0.26 | 0.43 | 0.16 |
| v0.2 | 3 | 3.42 (3.44, 3.41, 3.40) | 2, 1, 2 | 3.42 | 3.87 | 3.53 | 2.57 | 3.73 | 3.45 | 3.39 | 3.37 | 0.75 | 0.15 | 0.65 | 0.19 | 0.12 | 0.12 |
| v0.3 | 1 | 3.46 | 4 | 3.36 | 3.97 | 3.67 | 2.70 | 3.64 | 3.41 | 3.54 | 3.40 | 0.62 | 0.19 | 0.52 | 0.15 | 0.21 | 0.19 |

### Sealed books of v0.3 (nobody saw them during the v0.3 build; `docs/v0.3/HOLDOUT.md`)

| Book | Release | Runs | Mean (runs) | Strict | Leg | Flow | Spk | Cont | Var | Turn | Fid | Beat | Prop | Set | Hero | Tail | Lab | Rep |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| *Jataka Tales* | v0.2.0 | 2 | 3.46 (3.48, 3.44) | 1, 7 | 3.38 | 4.01 | 3.51 | 2.76 | 3.61 | 3.56 | 3.43 | 3.45 | 0.78 | 0.18 | 0.75 | 0.18 | 0.16 | 0.12 |
| *Jataka Tales* | v0.3 | 2 | **3.57** (3.59, 3.54) | 6, 4 | 3.30 | 4.05 | 3.59 | 2.96 | 3.68 | 3.62 | 3.71 | 3.59 | 0.58 | 0.11 | 0.73 | 0.23 | 0.18 | 0.10 |
| *Indian Why Stories* | v0.2.0 | 2 | 3.44 (3.44, 3.44) | 6, 5 | 3.49 | 4.00 | 3.68 | 2.71 | 3.57 | 3.48 | 3.39 | 3.19 | 0.75 | 0.21 | 0.64 | 0.11 | 0.15 | 0.10 |
| *Indian Why Stories* | v0.3 | 1 | 3.43 | 1 | 3.34 | 4.01 | 3.75 | 2.71 | 3.52 | 3.37 | 3.43 | 3.33 | 0.59 | 0.15 | 0.67 | 0.16 | 0.14 | 0.18 |
| *On a Piece of Chalk* (nonfiction) | v0.2.0 | 2 | 3.43 (3.49, 3.35) | 6, 2 | 3.52 | 3.98 | 3.75 | 2.93 | 3.44 | 3.38 | 3.44 | 2.99 | 0.48 | 0.23 | 0.48 | 0.14 | 0.16 | 0.16 |
| *On a Piece of Chalk* (nonfiction) | v0.3 | 1 | 3.37 | 3 | 3.40 | 3.94 | 3.68 | 2.92 | 3.52 | 3.10 | 3.45 | 2.95 | 0.45 | 0.22 | 0.46 | 0.14 | 0.23 | 0.15 |
| **Sealed fiction pooled** | v0.2.0 | 4 | 3.45 | 1, 7, 6, 5 | 3.44 | 4.00 | 3.60 | 2.74 | 3.59 | 3.51 | 3.41 | 3.30 | 0.76 | 0.19 | 0.69 | 0.14 | 0.16 | 0.11 |
| **Sealed fiction pooled** | v0.3 | 3 | **3.51** | 6, 4, 1 | 3.32 | 4.03 | 3.66 | 2.85 | 3.61 | 3.51 | 3.59 | 3.48 | 0.58 | 0.13 | 0.70 | 0.20 | 0.16 | 0.13 |

The first v0.3 run of each sealed book used `release/v0.3` at `f58801b`, before the last two fixes (#117, #118). The
second *Jataka Tales* run is the final journey on the final code (27 of its 28 pages judged).

### Other books (v0.2 only)

| Book | Release | Runs | Mean (runs) | Strict | Cont | Fid | Prop | Set | Hero |
|---|---|---|---|---|---|---|---|---|---|
| *Self-Reliance* (nonfiction) | v0.2 | 2 | 3.57 (3.55, 3.60) | 11, 8 | 3.33 | 3.68 | 0.27 | 0.13 | 0.38 |
| *Civil Disobedience* (nonfiction) | v0.2 | 1 | 3.53 | 11 | 3.34 | 3.47 | 0.30 | 0.14 | 0.27 |

## Speed, cost and tokens per run

From the edition records. "First page" is the first accepted page (often not page 1).

| Book | Release | Pages | First page | All pages | Cost | Tokens per page |
|---|---|---|---|---|---|---|
| 68-page tuning book | v0.1 | 60 of 60 | 298 s | 935 s | $1.72 | 176k |
| 68-page tuning book | v0.2 | 60 of 61 | 292 s | 882 s | $1.88 | 199k |
| 68-page tuning book | v0.3 | 61 of 61 | 296 s | 789 s | $1.98 | 206k |
| Two-tale book | v0.1 ⁶ | 22 of 22 | 1,358 s | 2,066 s | $0.87 | 212k |
| Two-tale book | v0.2 | 22 of 22 | 187 s | 447 s | $0.69 | 180k |
| Two-tale book | v0.3 (Gate 1, Gate 1b) | 22, 22 | 179 s, 245 s | 483 s, 676 s | $0.71, $1.03 | 180k, 280k |
| *Just So Stories* | v0.1.0 | 30 of 30 | 121 s | 427 s | $0.80 | 152k |
| *Just So Stories* | v0.2 (3 runs) | 34, 35, 29 | 189 s, 131 s, 104 s | 550 s, 464 s, 367 s | $0.99, $0.99, $0.80 | 170k, 163k, 160k |
| *Just So Stories* | v0.3 | 35 of 35 | 153 s | 456 s | $0.94 | 154k |
| *Jataka Tales* | v0.2.0 (2 runs) | 34, 28 | 428 s, 566 s | 799 s, 978 s | $1.06, $1.12 | 180k, 232k |
| *Jataka Tales* | v0.3 (2 runs) | 28, 28 | 463 s, 291 s | 857 s, — ⁵ | $1.18, $0.97 | 267k, 199k |
| *Indian Why Stories* | v0.2.0 (2 runs) | 41, 36 | 421 s, 267 s | 869 s, 605 s | $1.19, $0.90 | 163k, 137k |
| *Indian Why Stories* | v0.3 | 41 of 41 | 309 s | 679 s | $1.13 | 160k |
| *On a Piece of Chalk* | v0.2.0 (2 runs) | 33, 28 | 268 s, 139 s | 575 s, 609 s | $0.76, $0.73 | 127k, 144k |
| *On a Piece of Chalk* | v0.3 | 31 of 31 | 156 s | 473 s | $0.89 | 168k |

⁵ The MiniMax token plan stopped this run at page 18. One **Resume drawing** press finished it 121 s after the press.
⁶ This v0.1 run used MiniMax-M3 for the understanding step (a model A/B arm), which is slower.

Per page on the same six books, v0.3 used +16% tokens and +13% cost against v0.2 (pooled). The page step uses 96% of the
tokens. It went from 164k to 190k tokens per page with about the same number of turns (6.59 and 6.65 for each page call),
so each turn sends more text. The understanding and the plan steps together use less than 4%.

## How to update this file

Do these steps at each release, before the release pull request into `main`:

1. Make a fixture of every judged gate run of the release (`scripts/acceptance/judge/make_fixture.py`; see
   `scripts/acceptance/judge/fixtures/README.md`). Do not make a fixture of a private or copyrighted book.
2. Add the fixtures to `scripts/acceptance/judge/release-history.json` with the release version.
3. Run the command in "How we measure". Copy the new rows into "Details by book".
4. Add the speed, cost and token numbers from the edition records.
5. Add a column to "The releases at a glance".
6. Write "What got better" for the release, against the release before it: the numbers, the change that caused each
   one, what got worse and what was not measured.
7. Put the same comparison into the release notes (`docs/launch/RELEASE-NOTES-vX.Y.Z.md`, section "Metrics: what
   changed since vX.Y") and into the GitHub release.
