# D2: the camera push keeps every planned figure and speaker in the panel (#90)

Branch `v03/d2-push`. Renderer `manga-render/0.6.1` (was 0.6.0). The orchestrator sets the final version at merge (track D1a moves to 0.7.0 in parallel).
Decision: D31 in `docs/decisions.md`. No model call, no MiniMax spend.

## 1. Cause (from the diagnosis)

The renderer has two camera pushes. Push A (speaker readability, old) had no bound on the other figures. Push B (subject size floor, #42) had a bound, but it kept only the subjects and the speakers. The diagnosis is in `/Volumes/Mrigesh SSD/Book-Reel-scratch/v03/d2-diagnosis/D2-diagnosis.md`. 19 of the 21 figures that a push lost or cut came from push A.

## 2. What changed

All code is in `packages/manga-render/src/scene/compose.ts`.

1. One search for both pushes (`pushSearch`). It goes down from the wanted factor in small steps (0.05 for push A, 0.04 for push B, as before). It accepts the largest factor at which every head of the kept figures is inside the panel with the margins push B used (2.5 percent, heads 0.95 wide, 1.05 up, 1.1 down). If no factor works, the camera does not push.
2. Push A keeps every planned figure that is drawn (all speakers, the hero and every other planned figure). Push A also tries the factor that is just enough for the speaker floor (22 units).
3. `fitHeads` fails loudly. When no translation keeps every must-head inside, it returns false and the framings are restored. It no longer uses "the middle of an empty window".
4. Push B: in a medium or close panel every planned figure is a must-head. In an establishing, wide or full panel the must-heads are the subjects, the labelled figures and every head that is inside the panel now (a push never removes a head).
5. A planned figure is never added to `headCropped` by a push. Only the statue top on its column stays "cropped on purpose".
6. Room before the push (re-slotting). If push A cannot reach the speaker floor, the figures are moved closer together horizontally about the smallest speaker (factors 0.9 down to 0.2 of the distance; order and facing kept; a move that makes a new face cover or head touch is refused). The least move that reaches the floor is used; if none reaches it, the move that gives the largest factor is used. This turned 20 `SPEAKER_TOO_SMALL` panels into 15.
7. New warning `FIGURE_HEAD_PARTLY_CLIPPED`: less than 60 percent of the head circle of a planned figure is inside the panel (not for extreme_close, not when `FIGURE_CLIPPED` or `FIGURE_HEAD_CLIPPED` fires). It is a warning (D26: calibrate before an error). `FIGURE_HEAD_CLIPPED` is unchanged.
8. `SPEAKER_TOO_SMALL` stays an error. Its message and its repair hint (`apps/agent-worker/src/goals/repair-hints.ts`) now say: a closer shot of the speaker, or fewer figures in the panel.

## 3. Measurement

Same method and same pages as the diagnosis: 290 judged pages, 1396 panels (the exports of run2, run3, run4, run5, run6, run8, final-journey, final-journey-2 under `Book-Reel-scratch/v02`). Script `measure2.mts`, analysis `analyze_d2.py`, in `Book-Reel-scratch/v03/d2/`. "Both pushes off" is the 0.6.0 code with the diagnosis switches.

| Measure | 0.6.0 | 0.6.1 | both pushes off |
|---|---|---|---|
| Panels whose figures differ from "both pushes off" | 139 | 128 | 0 |
| `FIGURE_CLIPPED` (panels / pages) | 9 / 8 | 5 / 5 | 4 / 4 |
| `FIGURE_HEAD_CLIPPED` | 7 / 6 | 1 / 1 | 1 / 1 |
| `FIGURE_HEAD_PARTLY_CLIPPED` (new) | 0 | 1 / 1 | 0 |
| `SPEAKER_TOO_SMALL` (error) | 0 | 15 / 13 | 67 / 51 |
| `HERO_TOO_SMALL` | 0 | 1 / 1 | 35 / 32 |
| Figures lost or cut by a push (the 21 of the diagnosis) | 21 (4 lost, 7 head out, 10 head cut) | 0 | n/a |
| Balloon tails off the panel | 9 | 7 | 7 |
| Pages whose SVG changes (0.6.0 to 0.6.1) | | 34 of 290 (43 panels) | |

The 5 `FIGURE_CLIPPED` and 1 `FIGURE_HEAD_CLIPPED` that remain: 3 `FIGURE_CLIPPED` and 1 `FIGURE_HEAD_CLIPPED` are wide or establishing panels that have the same flag with both pushes off (run6 pages 19 and 24, final-journey-2 page 15). The other 2 `FIGURE_CLIPPED` (run2 page 17 p4, a full shot, and run3 page 26 p4, a wide shot) are not flagged with both pushes off, and I did not look into them. The 1 `FIGURE_HEAD_PARTLY_CLIPPED` is final-journey page 11 p4 (a wide shot).

### Residual SPEAKER_TOO_SMALL: 15 panels on 13 pages (4.5 percent of the pages)

This is more than 6 pages (2 percent). The orchestrator decides. Cause: a small-headed speaker (the python, head radius 8 to 18) beside a big head (the Elephant's Child, radius 42 to 92). The camera cannot come in to the speaker size without losing the big head, and moving the figures together does not help because the heads are too wide for the panel. Before D31 these panels were "fixed" by losing the Child (a `FIGURE_CLIPPED` warning that the judges named on 3 of 3 pages in the worked examples). Now the page writer sees the error in its preview and repairs it (a closer shot of the speaker, or fewer figures). Pages: final-journey 7, 9; final-journey-2 1, 3, 4, 6, 7, 8, 11; run6 5, 7, 8, 9. Without the re-slotting the count was 20 panels.

Options if 13 pages is too many: make the case a warning only for a speaker whose head is under half the floor beside a big head; or let the writer-side plan check (D24) warn before drawing; or draw the speaker larger than true scale (the `SMALL_SPEAKER_BOOST` convention).

### Other measured effects

- `apps/agent-worker` and the replay journey are green (section 5).
- `structural-metrics --fixtures` (46 run-8 pages): 204 panels, 1933 words, 144 balloons, text over head 29 (0.6.0: 28), text overlaps 13, order breaks 5, figures outside panel 0. One page (run8 page 15 p3) gets a speaker at head radius 22.1 instead of 22.5 (the margins of the bound are stricter), and one balloon touches a head.
- Existing floor tests in `q1-reframe.test.ts` (page 7 p3, 44 p1, 17 p2, 8 p1) pass unchanged.

## 4. Tests

`packages/manga-render/test/push-bounds.test.ts` (15 tests) with the fixture `test/fixtures/push-bounds-pages.json` (44 judged pages of the tuning-book runs: the page spec, the cast and the places it needs, and the head shares with both pushes off). No Cheese book.

- The six worked examples (final-journey-2 page 7 p2, p3 and page 1 p2, run3 page 23 p4, run6 page 7 p1, page 9 p3, p5): every planned head in the panel, body at least 15 percent in, no tail off the panel, no `FIGURE_CLIPPED`, no `FIGURE_HEAD_CLIPPED`.
- Property: over the 44 pages, no head that was 90 percent inside with both pushes off is lost. On 0.6.0 the same fixture has 21 violations (measured); on 0.6.1 it has none.
- The empty window: the two speakers of final-journey-2 page 1 p2 in all 20 ordered slot pairs keep both heads in the panel.
- The partial-head warning: `circleShareInside`, the 0.6 threshold, severity warning, and the code appears exactly when a planned head is under 60 percent in.
- Determinism: two renders give the same SVG.

## 5. Verification commands

```
cd packages/manga-render && npx tsc --noEmit && npx vitest run                 # 14 files, 787 tests pass
cd apps/agent-worker && npx tsc --noEmit && npx vitest run                     # 10 files, 191 tests pass
cd packages/manga-render && npx tsx scripts/structural-metrics.ts --fixtures
PANELSUMMARY_WEB_PORT=3220 PANELSUMMARY_API_PORT=8120 PANELSUMMARY_WORKER_PORT=8820 PANELSUMMARY_MONGO_PORT=27120 PANELSUMMARY_DB_NAME=v03_d2 \
  PANELSUMMARY_REPLAY_WORKER=scripts/fixtures/replays/happy-prince-two-tales ./start.sh
node scripts/acceptance/journey.mjs --pdf scripts/acceptance/books/happy-prince-two-tales.pdf --out OUT --full --replay --web http://127.0.0.1:3220 --api http://127.0.0.1:8120
```

The replay journey: JOURNEY PASSED, 61 of 61 checks, edition complete, 22 of 22 pages, 24 calls. No stored hash needed a refresh (the replay draws with today's renderer).

## 6. Looked at

Before and after of the six worked panels (and page 9 p5): `/Volumes/Mrigesh SSD/Book-Reel-scratch/v03/d2/visual/sheet-01.png` (left 0.6.0, right 0.6.1; the caption text on the sheet says 0.5.0 and 0.6.0 because the script label is old). After: the Elephant's Child head is in every panel, the Ostrich is drawn with its tail, the Student is drawn. The python is still small where it speaks beside the Child: the cost in section 3.

## 7. Not done

- The new warning is not an error. It has 1 flagged page; the D26 rule needs at least 10 before it can become one.
- Push B has no re-slotting step (only push A).
- No live run and no judge panel: the effect on judged rates is not measured.

## Gate 2a: tiny figures (track hero, part of #90 and #81)

Branch `v03/hero-size`. Renderer `manga-render/0.7.2` is unchanged (the drawing is the same; only a warning is added). No model call, no MiniMax spend.

### 1. The problem

The judge kind `hero_tiny` ("key figure tiny, a speck, or cropped") is the biggest judged defect that is left. On the 370 judged pages used here (1110 judge-pages) there are 540 blocker or major `hero_tiny` defects: 0.49 per judge-page. 223 of the 370 pages have at least one. D31 stops the camera from cropping a planned figure, but a bounded push leaves the figure small. `HERO_TOO_SMALL` only names the subject of the beat when it fills under a quarter of the panel (or its head radius is under 8), so together with `SPEAKER_TOO_SMALL` it flags 11 of the 370 judged pages.

### 2. Method

- Script `packages/manga-render/scripts/tiny-figures-measure.ts`: renders every saved judge page spec with the current renderer and writes one row per drawn planned figure: shot, role (speaker, named in the beat, labelled, other), body height as a share of the panel height (`hShare`), the share in the tighter dimension (`tight`), head radius in units (the page is 1000 units wide, so units are px at 1000 px).
- Script `packages/manga-render/scripts/tiny-figures-join.py`: joins the rows with the judges' defects (kind rules of `scripts/acceptance/judge/kinds.py`, unchanged) and prints the D26 numbers (E, P, L, C) for a set of rules.
- Pages: v0.2 runs 2, 3, 4, 5, 6, 8, final-journey, final-journey-2 (291 judged pages) and v0.3 tuning two-tale, two-tale-1b, justso-1b (79 judged pages). `justso` (partial) has no judgments, so it is measured for firing only. 2623 figures on 387 rendered pages, 1704 panels. No sealed, gates, baseline or Cheese page.
- A hit (D26): a judge listed a major or blocker `hero_tiny` defect on the page. A judged-good page: the mean of each criterion is 3 or more and the mean of the eight means is 3.5 or more (176 pages). Raw output: `Book-Reel-scratch/v03/hero/join-before.txt`.

### 3. How big are the figures

Height share of the panel (p10 / median) and head radius (median) by shot and role:

| Shot | Role | n | p10 | median | head |
|---|---|---|---|---|---|
| establishing | named | 151 | 0.11 | 0.21 | 8.2 |
| wide | speaker | 33 | 0.21 | 0.34 | 26.4 |
| wide | named | 126 | 0.18 | 0.34 | 19.3 |
| wide | other | 136 | 0.09 | 0.37 | 16.5 |
| full | speaker | 171 | 0.40 | 0.56 | 32.9 |
| full | named | 71 | 0.18 | 0.48 | 30.4 |
| full | other | 104 | 0.14 | 0.46 | 24.9 |
| medium | speaker | 682 | 0.36 | 1.00 | 46.4 |
| medium | named | 197 | 0.28 | 0.77 | 51.3 |
| medium | other | 255 | 0.26 | 0.98 | 47.3 |
| close | speaker | 296 | 0.65 | 1.00 | 71.2 |

Speakers and named figures already meet the existing floors (`SUBJECT_MIN_SIZE` 0.3 in the tighter dimension): `tight` under 0.25 happens for 2 figures. The complaints are about HEIGHT. A bird, a snake or a crocodile is wide but low.

### 4. Candidate rules (D26)

A page is flagged when any figure meets the rule. Not establishing, no cropped head, unless the row says otherwise. Hit rate of all 370 judged pages: 60%.

| Rule | E | P | base | L | C | recall | firings |
|---|---|---|---|---|---|---|---|
| any planned figure, height share under 0.12 | 36 | 86% | 57% | +29 | 5% | 14% | 48 |
| **any planned figure, height share under 0.15** | **53** | **83%** | **56%** | **+27** | **9%** | **20%** | **69** |
| any planned figure, height share under 0.20 | 90 | 80% | 54% | +26 | 16% | 32% | 120 |
| speaker or named, height share under 0.15 | 16 | 81% | 59% | +22 | 3% | 6% | 16 |
| speaker or named, height share under 0.20 | 47 | 77% | 58% | +19 | 9% | 16% | 49 |
| speaker or named, height share under 0.25 | 76 | 75% | 56% | +19 | 15% | 26% | 97 |
| speaker or named, height share under 0.30 | 120 | 76% | 53% | +23 | 26% | 41% | 170 |
| speaker or named, height share under 0.30, medium, close or full only | 89 | 79% | 54% | +24 | 20% | 31% | 120 |
| speaker or named, tighter dimension under 0.30 | 62 | 69% | 58% | +11 | 14% | 19% | 75 |
| any planned figure, head radius under 12 | 44 | 86% | 57% | +30 | 7% | 17% | 57 |
| any planned figure, head radius under 16 | 94 | 74% | 55% | +19 | 22% | 31% | 152 |
| speaker or named, head radius under 16 | 37 | 68% | 59% | +8 | 9% | 11% | 45 |
| speaker or named, head radius under 22 | 100 | 73% | 56% | +17 | 25% | 33% | 131 |
| existing `HERO_TOO_SMALL` or `SPEAKER_TOO_SMALL` | 11 | 91% | 59% | +32 | 1% | 4% | 26 |

Reading it:

- The base rate is high (the `hero_tiny` words are loose, 56 to 60% of the unflagged pages match), so L is the hard test. Rules on the head radius and on the speaker or named figure alone fail L, or fail C or E at the thresholds that would find more pages.
- The rule that works best is general: ANY planned figure (also the ones that only stand in the scene) under a share of the panel height. Judges complain about every small figure, not only about the subject. It passes at 0.12, 0.15 and 0.20.
- Per group at 0.15 (only a check of stability): the v0.2 runs, 39 flagged pages, P 85% against a base of 53%. The v0.3 tuning books, 14 flagged pages, P 79% against a base of 71% (the base is high there, so L is +8 only). The v0.3 sample is small and does not alone pass L.
- Defects per judge-page (blocker and major `hero_tiny`): 0.79 on the 53 flagged pages against 0.44 on the 317 other pages.
- The rule is cheap in rounds. At 0.15: 53 of 370 judged pages (14%), 65 panels of 1704 (3.8%), and `repair_once` gives each flagged page at most one extra round. At 0.20 it is 24% of the pages. Recall is low (20%): the rule finds one fifth of the pages with a `hero_tiny` hit. It is not the whole cure.
- Who is small at 0.15 (80 figures in shots that are not establishing): 62 are "other" figures, mostly the swallow, nightingale, python, crocodile, elephant's child at depth. The python and the swallow are small creatures by nature.

### 5. Decision

(a) New warning `FIGURE_TOO_SMALL`: a planned figure whose body is under 15% (`FIGURE_MIN_HEIGHT_SHARE`) of the panel height, in a shot that is not establishing, extreme close or insert, with a head that is not cropped. A figure that `HERO_TOO_SMALL` or `SPEAKER_TOO_SMALL` already names is not named twice. 0.15 passes E, P, L and C. 0.20 also passes and finds more (32% recall) but flags 24% of the pages, and the writer cannot always make a swallow big; I took the cheaper threshold. The owner can move it (one constant). The message offers a closer shot, fewer figures, or a panel of its own. It is in `REPAIR_ONCE_CODES` and in step 6 of the `manga-page` skill (1.15.0): the first full check rejects, the next stays a warning.

(b) Renderer: no change, no 0.7.3. The speaker and named figures already pass the size floors in the tighter dimension. The small figures are small because of their kind (a bird or a snake is low), their depth, or because a bounded push (D31) may not come closer without cutting a planned head. A size floor on height would crop heads, which D31 forbids, or draw a creature larger than its scale. I did not find a deterministic cause that can be fixed without breaking D31. The code only adds an issue to the result; it does not touch the drawing code (the test checks that two renders give the same SVG).

(c) Skill: only the code name was added to step 6. No new shot guidance: the skill already says to use a closer shot for the subject and fewer figures per panel.

### 6. Tests and numbers

- `packages/manga-render/test/figure-too-small.test.ts` (5 tests, on the 44 judged pages of `push-bounds-pages.json`): the code exists in the catalog; it fires as a warning with the repair words; it names a figure exactly when its body is under 15% of the panel (and never in an establishing, extreme close or insert shot); it is not named twice with `HERO_TOO_SMALL` or `SPEAKER_TOO_SMALL`; two renders give the same SVG.
- Mutation check: threshold 0.15 changed to 0.05 makes 2 tests fail (the constant and the "is a speck" direction). Dropping the establishing exemption makes 2 tests fail.
- Before and after (all 387 rendered pages, new code): `FIGURE_TOO_SMALL` 0 pages before, 61 after (53 judged, 8 on the partial `justso`); `HERO_TOO_SMALL` 2 and `SPEAKER_TOO_SMALL` 9 pages, `FIGURE_CLIPPED` 11, `FIGURE_HEAD_CLIPPED` 1: all unchanged. No new error code.
- `apps/agent-worker/test/repair-once.test.ts` pins the class (now 9 codes) and the skill list; the skill version pins moved to 1.15.0.

### 7. Not done

- No live run and no judge panel: the effect on the judged rate is not measured. The prediction is at most the recall of the rule (20% of the pages with a hit) times the fraction of the repairs that work; I did not measure the repair rate.
- The v0.3 tuning books alone give a lift of +8 points on 14 pages: the pass rests mostly on the v0.2 runs.
- No renderer change: the "stays small" cost of D31 is not reduced.
- A look at re-rendered pages was not needed because the drawing does not change.
