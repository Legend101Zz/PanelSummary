# v0.2 gates: results and evidence

This file records the v0.2 gate results. Every number was measured during the v0.2 build on 2026-10-10.
The quality judges are a panel of 3 Sonnet judges with the run-8 rubric (`docs/launch/EVAL.md`). They are
AI judges, not readers. Evidence paths are on the build machine's SSD
(`/Volumes/Mrigesh SSD/Book-Reel-scratch/v02/`); they are not in the repository.

## 1. CI

- CI was seen to fail on a planted error (PR #55, run 38055517882) and then pass after the revert.
- The frontend shared-copy tests (`npm test`) run in CI since PR #58.
- Every track merged by pull request into `release/v0.2` with green CI and an independent review.

## 2. Gate 1: UI

Three reviewers checked the integrated `release/v0.2` (`dcd9d9c`) against the design frames at 1440 and 390,
in light and dark (`g1a`, `g1b`, `g1j`).

| Check | Result |
|---|---|
| `scripts/acceptance/journey.mjs` through the new UI, replay worker, no spend | PASS, 61 of 61 checks |
| Retry hook (`Retry failed pages`, busy name) | PASS |
| `Generate manga` visible after the upload | PASS, 796 ms after the move to `/books/{id}` |
| Exactly one `Generate manga` button | PASS at 1440 and 390, in every state |
| Browser hosts | only `127.0.0.1` |
| Targets under 44 px, horizontal scroll at 390 | none on the app screens (the reader's v0.1 controls are 40 px) |
| impeccable 4.5.2 | 0 findings after the fixes (light theme scans; dark checked by a contrast measure) |
| Must-fix defects found | 3 (landing link contrast in dark, the skip link over the reader after "Start reading", the run card during a retry): all fixed in PR #72 and #73 and verified |

Fix waves after Gate 1: PR #71 (tooling), #72 (screens), #73 (book page and reader handover). After the final
journey: PR #75 (the page 1 band inside the first screen at 1440×900 and 1440×820; a safe "Continue from
page N"), #76 (honest status with the replay worker).

## 3. Gate 1: quality (26-page two-tale book, tuning book)

Live run 2 (GitHub Actions 38061258863, `release/v0.2` `d373d8f`): 22 of 22 pages, first page 187 s, all
447 s, about $0.69.

| Run | Pages | Strict ship bar | Mean | Legibility | Continuity | Fidelity | Beat without prose wall |
|---|---|---|---|---|---|---|---|
| v0.1 gate1-flash-ci | 22 | 2 | 3.42 | 3.33 | 3.11 | 3.26 | 3.36 |
| v0.1 uab-flash-ci | 22 | 4 | 3.49 | 3.44 | 2.94 | 3.38 | 3.35 |
| v0.2 run 1 (writer changes only, renderer 0.5.0) | 21 | 5 | 3.54 | 3.62 | 3.11 | 3.51 | 3.56 |
| **v0.2 Gate 1** | 22 | **6** | **3.60** | **3.65** | 3.08 | **3.64** | **3.64** |

Verdict: PASS. No criterion is more than 0.2 below the best v0.1 Flash run (page turn −0.17).

## 4. Gate 2: quality (68-page acceptance book, tuning book)

Live run 3 (38061300872, `d373d8f`): 60 of 61 pages (page 42 failed after the submit limit and is shown as
failed with its reason), first page 292 s, all 882 s, about $1.88.

| Bar (v0.1 Gate 2, 46 pages) | v0.1 | v0.2 (61 pages) | Result |
|---|---|---|---|
| Mean | ≥ 3.52 | 3.55 (failed page counted as 0) | PASS |
| Strict ship-bar pages | ≥ 7/46 | 20/61 | PASS |
| Continuity | > 2.94 | 2.99 | PASS |
| Legibility | ≥ 3.43 | 3.61 | PASS |
| Hero, speaker or key prop a speck or cropped (per judge-page) | < 0.62 | 0.35 | PASS |
| Tail at the wrong figure | < 0.22 | 0.11 | PASS |
| Label clutter | < 0.20 | 0.08 | PASS |
| Repeated near-identical panels | < 0.17 | 0.08 | PASS |
| No criterion more than 0.2 below v0.1 | | page turn −0.19 (3.35 against 3.54) | PASS (close) |
| Image-model egress | zero | zero (only `api.minimax.io`) | PASS |
| Every failure visible | | page 42 failed, shown with its reason | PASS |

The defect rates are blocker plus major defects per judge-page, with the v0.1 classifier
(`launch/clusters/kinds2.py`). The script `gates/kinds_rates.py` reproduces the v0.1 report's numbers for
`gate2-flash-ci` exactly (0.62, 0.22, 0.20, 0.17).

## 5. Hold-out and nonfiction books (#50)

| Book | Code | Pages | Strict ship bar | Mean | Continuity | Legibility |
|---|---|---|---|---|---|---|
| *Self-Reliance* (hold-out, nonfiction), run 1 | v0.2 | 38 | 11 | 3.55 | 3.26 | 3.60 |
| *Self-Reliance*, run 2 | v0.2 | 36 | 8 | 3.60 | 3.40 | 3.69 |
| *Civil Disobedience* (nonfiction) | v0.2 | 36 | 11 | 3.53 | 3.34 | 3.74 |
| *Just So Stories* (hold-out, fiction) | **v0.1.0 (controlled baseline)** | 30 | 4 | 3.38 | 2.68 | 3.33 |
| *Just So Stories*, run 1 | v0.2 | 34 | 2 | 3.44 | 2.59 | 3.42 |
| *Just So Stories*, run 2 (final journey) | v0.2 | 35 | 1 | 3.41 | 2.50 | 3.43 |
| *Just So Stories*, run 3 (final journey on the release head) | v0.2 | 29 | 2 | 3.40 | 2.64 | 3.41 |

On the fiction hold-out, v0.2 is not better than v0.1: over three v0.2 runs the mean is about the same
(3.40–3.44 against 3.38) and fewer pages pass the strict bar (1–2 against 4). The writer changes carry over (label clutter 0.43 → 0.16 and 0.10). The closed drawing
vocabulary does not: the book needs an elephant, a cave and a mutton bone, so the Elephant's Child is drawn
as a human boy, a cave as a modern room and a bone as a sword (key prop not drawn 0.59 → 0.73 and 0.86;
wrong setting 0.09 → 0.18 and 0.15). This is a v0.3 problem (a general fallback, not a fix tuned on the
hold-out).

## 6. The final journey

Run on the real worker, in a real foreground Chrome window, on a fresh database, with the untuned
*Just So Stories* PDF, through the new UI. Evidence: `final-journey/REPORT.md` (release candidate
`a5b4a5c`) and `final-journey-2/REPORT.md` (release head `3113fc3`).

| Question | `a5b4a5c` | `3113fc3` |
|---|---|---|
| 1. Open the app (first run, then the shelf) | PASS | PASS |
| 2. Add a book → the estimate → Generate manga | PASS (auto-move 2.4 s; Generate visible 0.69 s later) | PASS (auto-move 3.4 s; one Generate button, visible at once) |
| 3. Does the run card tell the truth while it draws? | PASS (17 of 18 moments OK; 1 moment 0.5 s behind the API because the page polls every 2 s; the page 1 band fired on page 1, not on page 4 that was drawn first) | PASS (14 of 14 moments OK; the page 1 band showed with page 1, not with page 2 that was drawn first) |
| 4. Start reading → readable on a desktop? | PASS (balloon text 15.4–25.2 px at 1440×900, median 16.8; the reader shows the exact persisted SVG) | PASS (smallest balloon or caption text 15.4 px, dialogue 21 px at 1440×900; the reader shows the exact persisted SVG) |
| Is the manga better than v0.1? | On the tuning books, yes (Gates 1 and 2). On this untuned fiction book, not yet (section 5). | |
| Pages, time, cost | 35/35, first page 131 s, page 1 about 135 s, all 464 s, $0.99 (estimate $0.69–$1.51) | 29/29, first page 104 s, page 1 120 s, all 367 s, $0.80 (estimate $0.69–$1.51) |
| Architecture | job and stage records; 37 receipts (all `MiniMax-M3.1-Flash-Preview`, image models none); worker egress only `api.minimax.io`; 35 `edition_pages` with SVG, hash and `manga-render/0.6.0`; the reader shows the persisted SVG | job and stage records; 31 receipts (all `MiniMax-M3.1-Flash-Preview`, image models none); worker egress only `api.minimax.io` (185 requests); 29 `edition_pages` with SVG, hash and `manga-render/0.6.0`; the reader shows the persisted SVG |
| Browser hosts | only `127.0.0.1` | only `127.0.0.1` |

## 7. Spend

Ten paid runs, about $9.40 in total (estimates at MiniMax-M3 rates, not a bill), against the cap of $50:
seven in the live lane, two v0.2 final journeys and one v0.1.0 baseline run on the hold-out book. The ledger is in `docs/v0.2/PLAN.md` §6.
