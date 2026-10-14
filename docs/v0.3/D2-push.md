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
