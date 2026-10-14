# v0.3 gates: results and evidence

This file records the v0.3 gate results. Every number was measured during the v0.3 build on 2026-10-14. The
quality judges are the same panel as in v0.2: 3 Sonnet judges with the run-8 rubric (`docs/launch/EVAL.md`). They
are AI judges, not readers. The tables come from `scripts/acceptance/judge/compare_runs.py` (a failed page counts as
0; defect rates are blocker plus major defects per judge-page with the v0.1 classifier `kinds.py`). Evidence paths are
on the build machine's SSD (`/Volumes/Mrigesh SSD/Book-Reel-scratch/v03/`); they are not in the repository.

The book classes and the sealed commitment are in `PLAN.md` §2 and `HOLDOUT.md`.

## 1. CI

Every track merged by pull request into `release/v0.3` with green CI and an independent review (PRs #100–#117).
One CI failure was seen and fixed before a merge: a test timeout in PR #117 (8.7 s against the 5 s default on the
runner).

## 2. Baseline: v0.2.0 on the sealed books (Phase 0)

Tag `v0.2.0`, local stack, real worker, two runs per book (`baseline/`).

The three sealed books (titles revealed at the release, `HOLDOUT.md`): sealed fiction 1 = *Jataka Tales* (Ellen C. Babbitt, 13 tales), sealed fiction 2 = *Indian Why Stories* (Frank B. Linderman, 8 stories), sealed nonfiction = *On a Piece of Chalk* (T. H. Huxley).

| Book | Run | Pages | Mean | Strict | Continuity | Key prop not drawn | Wrong setting | Hero a speck or cropped |
|---|---|---|---|---|---|---|---|---|
| sealed fiction 1 | r1 | 34 | 3.48 | 1 | 2.75 | 0.74 | 0.14 | 0.82 |
| sealed fiction 1 | r2 | 28 | 3.44 | 7 | 2.77 | 0.85 | 0.23 | 0.67 |
| sealed fiction 2 | r1 | 41 | 3.44 | 6 | 2.75 | 0.66 | 0.18 | 0.62 |
| sealed fiction 2 | r2 | 36 | 3.44 | 5 | 2.68 | 0.85 | 0.24 | 0.67 |
| sealed nonfiction | r1 | 33 | 3.49 | 6 | 3.03 | 0.51 | 0.21 | 0.47 |
| sealed nonfiction | r2 | 28 | 3.35 | 2 | 2.82 | 0.45 | 0.26 | 0.49 |
| **fiction pooled** | 4 runs | 139 | **3.45** (3.44–3.48) | 19 | 2.74 | 0.76 | 0.19 | 0.69 |

## 3. Gate 1: tuning books

### 3.1 First pass (`release/v0.3` `b02bc17`, renderer 0.7.0)

| Book | Run | Pages | Mean | Strict | Continuity | Key prop | Setting | Hero | Label clutter | Repeated |
|---|---|---|---|---|---|---|---|---|---|---|
| two-tale (v0.2 Gate 1) | 1 | 22 | 3.60 | 6 | 3.08 | 0.50 | 0.14 | 0.55 | 0.08 | 0.12 |
| two-tale (v0.3) | GH 38576965161 | 22 | 3.53 | 4 | 2.82 | 0.70 | 0.27 | 0.61 | 0.20 | 0.21 |

*Just So* (GH 38577002483) stopped at page 20 on a MiniMax outage (2064/529, "server cluster under high load"); 18 of
35 pages were drawn. On pages 1–19 the v0.3 pages scored 3.29 against 3.31–3.37 for the three v0.2 runs, with
continuity 2.70 against 2.31–2.59 and hero a speck or cropped 0.65 against 0.74–0.85.

The analysis (`gate1/analysis/GATE1-twotale.md`) found three v0.3 causes: `look.scale` used as a real-world size (small
birds became specks on 65 panels), a page-turn hook on 18 of 22 pages (repeats across the turn), and labels on named
props. Wave 2 (PRs #112, #113, #114) fixed them.

### 3.2 Gate 1b (`839d032`, renderer 0.7.2, after Wave 2)

| Book | Version | Runs | Mean | Strict per run | Continuity | Key prop | Setting | Hero | Repeated |
|---|---|---|---|---|---|---|---|---|---|
| two-tale | v0.2 | 1 | 3.60 | 6 | 3.08 | 0.50 | 0.14 | 0.55 | 0.12 |
| two-tale | v0.3 | 1 (GH 38585510402) | **3.43** | 4 | 2.77 | 0.74 | 0.35 | 0.62 | 0.27 |
| *Just So* | v0.2 | 3 | 3.42 (3.40–3.44) | 2/1/2 | 2.57 | 0.75 | 0.15 | 0.65 | 0.12 |
| *Just So* | v0.1.0 | 1 | 3.38 | 4 | 2.68 | 0.59 | 0.09 | 0.78 | 0.16 |
| *Just So* | v0.3 | 1 (GH 38585554450) | **3.46** | 4 | 2.70 | 0.62 | 0.19 | 0.52 | 0.19 |

Verdict: *Just So* (the #81 diagnosis book) improves a little (mean +0.04 against the v0.2 spread 3.40–3.44; strict 4
against 1–2; key prop not drawn −0.13; hero a speck or cropped −0.13; continuity +0.13). The two-tale book falls 0.17
below v0.2 (more than the run spread): **the Gate 1 tuning-book guard did not hold on this run.** The analysis
(`gate1b-analysis/GATE1B-twotale.md`) traced it mostly to this run's understanding and plan (77 claims against 56–57;
3 claims on 19 of 22 pages; those 7 plan-driven pages scored 3.14, the other 15 scored 3.56), not to the Wave 2 code.
v0.2 itself gave 3.54 and 3.60 on this book. PR #116 added plan warnings for dense pages and missing places (no check
passed D26 to become an error).

## 4. Gate 2: the sealed books (the v0.3 claim)

### 4.1 Gate 2a: candidate 1 (`f58801b`), one run per sealed book

| Book | v0.2.0 (2 runs) | v0.3 run | Δ mean | Strict per run | Key prop | Setting | Hero |
|---|---|---|---|---|---|---|---|
| sealed fiction 1 | 3.46 (3.44–3.48) | 3.59 | +0.12 | 1/7 → 6 | 0.78 → 0.62 | 0.18 → 0.13 | 0.75 → 0.76 |
| sealed fiction 2 | 3.44 (3.44–3.44) | 3.43 | −0.01 | 6/5 → 1 | 0.75 → 0.59 | 0.21 → 0.15 | 0.64 → 0.67 |
| sealed nonfiction | 3.43 (3.35–3.49) | 3.37 | −0.06 | 6/2 → 3 | 0.48 → 0.45 | 0.23 → 0.22 | 0.48 → 0.46 |
| **fiction pooled** | 3.45 | **3.49** | **+0.04** | 4.75 → 3.5 per run | **−21%** | **−26%** | **+3%** |

Pass bar (PLAN §6) against this candidate: mean +0.08 — not met (+0.04); more strict pages — not met; key prop not
drawn down 25% — not met (−21%); wrong setting down 25% — met (−26%); hero a speck or cropped down 25% — not met
(flat); no criterion more than 0.2 below — met for fiction (nonfiction page turn −0.29). Continuity +0.10 and fidelity
+0.16 improve.

The largest remaining defect on every book is a key figure that is tiny or cropped. D31 stopped the push from
cropping figures, but bounded pushes leave them small. A fix from tuning data only (PR #117, `FIGURE_TOO_SMALL` in
`repair_once`, D26: E 53, P 83%, L +27, C 9%) made the final candidate `45ab575`.

### 4.2 Gate 2b: the final candidate (`45ab575`)

The token plan limit (§6) stopped most Gate 2b runs. What was measured on the final code (`26dfd3b`, the same drawing
code as `45ab575`):

**68-page tuning guard** (GH 38616099546, 61/61 pages, 0 failed calls, $1.98):

| Run | Pages | Mean | Strict | Continuity | Page turn | Key prop | Setting | Hero | Repeated |
|---|---|---|---|---|---|---|---|---|---|
| v0.1 Gate 2 (46 pages) | 46 | 3.52 | 7 | 2.94 | 3.54 | 0.51 | 0.17 | 0.62 | 0.17 |
| v0.1 complete run | 60 | 3.54 | 12 | 3.02 | 3.51 | 0.55 | 0.21 | 0.48 | 0.09 |
| v0.2 Gate 2 | 61 | 3.55 | 20 | 2.99 | 3.35 | 0.43 | 0.20 | 0.35 | 0.08 |
| **v0.3 final** | 61 | **3.54** | **9** | 3.03 | 3.45 | 0.51 | 0.20 | 0.43 | 0.18 |

Guard (PLAN §6): mean not below 3.50 — met (3.54); strict count not below 16/61 — **not met (9/61)**.

**Sealed fiction 1, the final journey's 18 drawn pages** (attempt 2, §5), against the same page span of the other runs:

| Run | Pages | Mean | Strict | Key prop | Setting | Hero |
|---|---|---|---|---|---|---|
| v0.2.0 run 1 | 1–18 | 3.49 | 1 | 0.81 | 0.19 | 0.69 |
| v0.2.0 run 2 | 1–18 | 3.43 | 4 | 0.89 | 0.30 | 0.65 |
| v0.3 candidate 1 | 1–18 | 3.60 | 4 | 0.67 | 0.20 | 0.70 |
| **v0.3 final** | 1–18 | **3.55** | 4 | **0.59** | **0.07** | 0.74 |

**Sealed fiction 1, the complete final journey** (attempt 2 + the resume, 27 judged pages): mean **3.54**, strict 4, key
prop not drawn 0.53, wrong setting 0.09, hero a speck or cropped 0.69. With candidate 1 this gives two full v0.3 runs on
this book: **3.57 (3.54–3.59) against 3.46 (3.44–3.48) for v0.2.0 (+0.10, beyond the spread).**

**Sealed fiction pooled** (v0.3: 3 runs, 96 pages; v0.2.0: 4 runs, 139 pages): mean **3.51 against 3.45 (+0.06)**;
strict per run 6/1/4 against 1/7/6/5; key prop not drawn 0.58 against 0.76 (**−24%**); wrong setting 0.13 against 0.19
(**−32%**); hero a speck or cropped 0.70 against 0.69 (flat); continuity +0.12; fidelity +0.19; no criterion more than
0.2 below v0.2.0 (legibility −0.12 is the largest drop).

Not measured on the final code (stopped by the token plan): the second runs of sealed fiction 2 and the sealed
nonfiction book, the Cheese PDF and *Self-Reliance*.

### 4.3 Gate 2 verdict

**The pass bar is not met.** What the measurements support:
- On sealed fiction 1 (animal fables) v0.3 is better than v0.2.0 in two independent full runs (3.59 and 3.54 against
  3.44–3.48; +0.10), with fewer key props left undrawn and fewer wrong settings.
- On sealed fiction 2 v0.3 is equal (3.43 against 3.44), with fewer key props left undrawn (0.59 against 0.75) but
  fewer pages at the strict bar.
- On the sealed nonfiction book v0.3 is 0.06 lower, inside v0.2.0's own spread.
- Over the sealed fiction books (3 v0.3 runs): mean +0.06 (the bar is +0.08); key prop not drawn −24% and wrong
  setting −32% (the bar is −25% each); a key figure tiny or cropped is not lower; fewer pages at the strict bar.
- On the 68-page tuning book the mean holds (3.54 against 3.55) but fewer pages pass the strict bar (9 against 20).
- The release notes say this plainly. Under §7.2 the owner decides before the tag.

## 5. The final journey

Attempt 1 (`45ab575`, 17:32 UTC): the token plan limit (2062) stopped the edition at page 11 of 38. Attempt 2
(`26dfd3b`, 18:47 UTC, fresh DB `v03_final_2`, headed system Chrome, *Jataka Tales*, real worker, one Generate press):
the token plan limit (2056) stopped it at 18 of 28 pages. A resume through the UI (one press of "Resume drawing",
19:30 UTC) was refused on its first call by the same limit. **A second resume press at 21:03 UTC was accepted: the edition
finished complete, 28 of 28 pages, 0 failed, 121 s after the press ($0.97 for the whole edition).** The journey therefore
also shows the product's failure path end to end: a visible provider stop, then a resume through the UI.

| Question | Verdict | Evidence (`gates/final-journey-2/REPORT.md`) |
|---|---|---|
| 1. Open the app (first run, then the shelf) | PASS | status line, drop zone with the limits, sample card |
| 2. Add a book → the estimate → Generate manga | PASS | the app moved to the book page by itself in 3.5 s; exactly 1 "Generate manga" button at 1440 and 390; the estimate says "not a bill" |
| 3. Does the run card tell the truth? | PASS | truth table 22 of 24 moments OK (2 were 0.6–0.7 s poll lag); the page 1 band showed 0.3–0.7 s after page 1 was accepted; the provider stop is shown honestly (one wording problem: "10 pages were not tried yet" although page 18 was tried and refused) |
| 4. Start reading → the book's own cast, places and props (or labelled stand-ins), readable on a desktop | PARTIAL (reader PASS, drawing weak) | the reader works: the first view at 1440×900 as D37, text 15–21 px, Sources drawer, picker, ArrowRight, tap-to-advance at 390, Back; the reader shows the persisted SVG (DOM SVG = stored SVG on pages 1, 19, 20 and 25; 28 of 28 stored hashes match). The drawing is weak: animals are generic stand-ins that the judges read as other animals (a monkey as a goat, crocodiles as salamanders on land) and the places are European towns for a tale set in ancient India. Worst pages: 15, 3, 26, 23/24, 17; best: 28, 20. |

Architecture (all 28 pages): the parse and generate jobs with stage events; receipts all
`MiniMax-M3.1-Flash-Preview`, `image_models` none; worker egress only `api.minimax.io`; `edition_pages` with SVG,
`svg_hash` = sha256(svg), `manga-render/0.7.2`; the reader shows the persisted SVG; browser hosts only `127.0.0.1:3285` and
`127.0.0.1:8185`. Dark theme checked on the shelf, the book page and the reader handover. Judged: 27 of the 28 pages (page 18 was drawn during the resume and not judged); the numbers are in §4.2.

## 6. Provider limits seen in this build

- 14:12: MiniMax "server cluster under high load" (2064/529) stopped the first Gate 1 run of *Just So* at page 20.
- 17:40: the MiniMax token plan limit (2062, "Token Plan rate limit reached") stopped every run in flight: the first
  final journey (11 of 38 pages), two Gate 2b runs, the 68-page guard and *Self-Reliance*. Each edition stopped with the
  visible message "Resume when the limit resets"; no failure was hidden (D11). v0.3 runs use 30–60% more tokens than v0.2
  runs (longer skill text and more repair rounds), so the plan window filled faster than the run count suggested.

## 7. Spend

25 paid run starts and 2 resumes, about $17.77 at MiniMax-M3 rates (not a bill), against the cap of $50. The ledger is
in `PLAN.md` §7. The binding limit was the MiniMax token plan.
