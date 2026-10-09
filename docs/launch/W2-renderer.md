# W2 renderer: legibility of heroes, key props, tails and settings

Branch `w2/renderer-legibility`, from `release/v0.1` at a53378e. Renderer version `manga-render/0.5.0` (was 0.4.0).
Status: PARTIAL. All offline checks pass. No live model call was made. Nothing here is a live journey.

All numbers come from offline re-renders of the saved judged specs (no model call) with the old code (0.4.0, a `git archive` copy of a53378e) and the new code.
The Mac was loaded: load averages 5 to 10 during the runs (`uptime`, for example "load averages: 9.17 10.57 8.47" at 12:59). Timings are not reported for that reason.

Saved specs used: Phase 0 (`p0-baseline/export`, 15 judged pages), CI live run (`orchestrator/ci-live-p0/live-run/export`, 13 pages) and run 8 (`acceptance/run8`, 46 pages). Judge findings: the three `judgments.json` files in the launch scratch dir.

## 1. What changed, per kind

### hero_tiny (renderer side)

- Check A. `HERO_MIN_HEAD_RADIUS = 16` and `HERO_SMALL_MIN_HEAD_RADIUS = 12` (new, `scene/compose.ts`). The hero of a panel is the figure the beat names (cast name, or its last word of 4 letters or more), else the only figure.
  - A person who is a hero gets the same wide-shot rule as a speaker (the camera may take the top of the shot band to reach the floor).
  - A small creature (or a figure under 45 units tall, such as a daisy) that is a hero is enlarged to the floor at any depth (before: only at depth "fore").
  - A small hero at the feet, hand or shoulder of another figure is drawn up to 2.6 times true scale (the same limit as a small speaker) so it is no speck beside a figure ten times its size. The statue's own head also gets the floor when the beat names it.
  - Establishing shots are exempt: a figure that is small there is small on purpose.
- Check B. Key prop floor: `KEY_PROP_MIN_HEIGHT = 0.12` of the panel height (`0.06` in an establishing shot), capped at 40% of the panel width. It overrides the "no taller than the tallest figure" cap. The rose and the dead bird are no longer specks.
- Check C (clipped speaker): not changed. Calibration shows no judged-good page is helped by a stricter clip rule (section 3), and the existing speaker floor (error) already keeps speakers in frame in the saved pages.
- New warning `HERO_TOO_SMALL`: a hero that the floors could not enlarge is still under a head radius of 8 in a non-establishing shot. It flags r8 page 5 panel p3 (a sick boy in a bed: the bed fixes his scale) and r8 page 23 panel p1 (children in a wide garden). Warning only.

### tail_wrong (renderer side)

- New warning `TAIL_CROSSES_PROP` (`lettering/index.ts`): the tail line (balloon edge to the aim point) crosses a prop box shrunk by 10%. The speaker's own held prop is skipped. Off-panel tails are skipped. Prop boxes now reach `checkLettering` through `LetterPanelInput.props`.
- New warning `SPEAKER_OFF_PANEL_LIMIT` (`validate/page.ts`): a page has more than one spoken line whose speaker is not drawn in its panel, or has an off-panel speaker that the page never draws. It keeps the old per-line `SPEAKER_OFF_PANEL` warning.
- Tail aim at the mouth: no change. Measured on 220 tails, the tip is 1.1 / 1.7 / 2.9 head radii from the mouth at the 10th / 50th / 90th percentile (maximum 5.9, r8 page 38 panel p1). Speakers are at least 22 units by the speaker floor, so the long-tail branch (`gap - near`) does not apply to them. T2 already found that a shorter tail caused TAIL_CROSSES_TEXT.

### statue_staging (renderer fallback)

- `statueColumnFallback` (`scene/compose.ts`): in an establishing or wide panel, a statue-material figure (gold, stone, bronze; not lying, not falling, no `on`, the beat does not say the column is empty) in a place with no `statue_column` is drawn at the book's first place that has one. The page gets the warning `STATUE_LOCATION_SWAPPED`, which tells the writer to use that location.
- Full, medium, close and extreme-close shots are NOT swapped. A first version swapped every non-insert shot. On r8 page 7 panel p1 (a full shot) it drew a bare grey slab with a white block (the r8/4 defect pattern), so it was limited to establishing and wide shots. See section 4, row r8/7.

### setting_wrong (renderer part)

- The `void` backdrop (the fallback for a place the book did not describe) is no longer a blank white sheet: a light wash at the top, a horizon line, a ground band and grass ticks.
- Heaven and dust heap: no new environment value (that would change the closed vocabulary that the writer and the plan use). Instead `scene/places.ts` maps a stand-in place (`abstract`, `void`, `country_road`, `meadow`) whose name or description says heaven, paradise, dust heap, rubbish heap or midden to `sky` and `ditch`. Riverbank, moor, ditch and forge already existed in 0.4.0.
- Giant and trees: `EnvironmentRequest.treeScale` (new, optional). In a ground shot with a giant, environment trees are drawn at 0.4 of their height (`GIANT_TREE_SCALE`), so the giant is taller than the trees.

Other: `RENDERER_VERSION` is `manga-render/0.5.0`. The catalog lists the new warnings and the new limits' constants are exported from `scene/index.ts`. New script `scripts/legibility-calibration.ts` (per-panel log used for section 3). New tests `test/legibility.test.ts` (11 tests). `test/core-acceptance.test.ts` expects 0.5.0.

## 2. Compatibility

All 74 judged specs from the three runs, and the 46 run-8 fixtures, validate and render with no crash and no new error code (`test/core-acceptance.test.ts`, `test/core.test.ts` and the calibration log: 0 crashes old, 0 crashes new).

## 3. Calibration table (offline, no model call)

Unit: pages. A judged-bad page has at least 2 renderer-owned hero-type findings in the panel's judgments (keyword join, see limits). A judged-good page has 0. There are only 5 judged-good pages, so no check can earn error level here. Every new check is therefore a warning.

Hero head radius below a threshold, hero in a non-establishing shot (345 hero figures in 74 pages):

| Code | Threshold | Pages flagged (old 0.4.0) | good flagged | bad flagged | Pages flagged (new 0.5.0) | good flagged | bad flagged |
|---|---|---|---|---|---|---|---|
| hero head radius | under 8 | 10 | 0 | 9 | 2 | 0 | 1 |
| hero head radius | under 12 | 14 | 0 | 12 | 2 | 0 | 1 |
| hero head radius | under 16 | 22 | 1 | 17 | 16 | 0 | 13 |

`HERO_TOO_SMALL` uses the under-8 line (new: 2 pages, 0 good). Hero figures under 12 units (non-establishing): 18 old, 3 new. Under 16: 27 old, 20 new (the floor for small creatures is 12.5, so they stay under 16 by design).

Key props (47 in non-establishing panels): height under 0.12 of the panel: 9 old, 1 new (minimum 0.03 old, 0.06 new). Examples fixed: the rose in ci page 13 panel p5 (0.03 to 0.12), the gem and the bread on p0 pages 5, 7, 8.

Tails (220 tails with a speaker): undrawn speaker 2, off-panel tail 3, `TAIL_CROSSES_PROP` 0 flags on the saved pages (nothing to compare; it stays a warning). `SPEAKER_OFF_PANEL_LIMIT`: flags p0 page 14 (the Rose-tree speaks and is never drawn; judged a blocker) and no other page. r8 page 3 (a blocker) has one off-panel line whose speaker is drawn in the previous panel, so it is not flagged. Only 2 pages have any off-panel line in the saved runs, so this check also stays a warning.

Statue fallback: `STATUE_LOCATION_SWAPPED` fires on ci page 7 panel p5 and ci page 8 panel p3 (both judged statue defects, both wide shots). With the first version it also fired on r8 page 7 panels p1 and p2 (judged "Prince inside a garret"); the final version does not. It fires on no judged-good page.

Limits of the join: the judges' findings are free text per page, not per panel. The join is by page, with keywords (tiny, speck, blob, cropped, ...) on renderer-owned findings. It is a screen, not a score. The numbers above are measured by `scripts/legibility-calibration.ts` and a join script in the scratch dir (`launch/w2r-impl/join.py`, `an1.py`).

## 4. Before and after images (looked at with the Read tool)

Side by side, old (left) and new (right). Set a: `/Volumes/Mrigesh SSD/Book-Reel-scratch/launch/w2r-impl/img/a/pairs/`. Set b: `.../img/b/pairs/`. Files are `<run>-page-NN.png` (run: p0, ci, r8).

| # | Page | Verdict | Note |
|---|---|---|---|
| 1 | ci 13 (a) | fixed | Dead Nightingale and rose in p5 are readable; the p1 bird is bigger. The conifer-shaped rose-tree is a state_continuity defect, not changed. |
| 2 | p0 2 (a) | partly fixed | p4: the Swallow is readable (head 3 to 12.5). The tall p1 still has a large empty sky. |
| 3 | p0 9 (a) | partly fixed | The dead Swallow at the Prince's feet is bigger; the statue head in p1 is bigger; the column is still short in p1. |
| 4 | p0 11 (a) | fixed | The Daisy in p5 is readable (3.2 to 12.5). The lizard balloon moved. |
| 5 | p0 8 (a) | partly fixed, one warning added | The Swallow and the bread in p3 are bigger. A new FIGURE_CLIPPED warning: a child is 69% inside the frame. |
| 6 | r8 2 (a) | partly fixed | p1: the Swallow is bigger. The tail of "Will you come away with me?" still runs near the Reed: not fixed. |
| 7 | r8 11 (a) | partly fixed | p4: the dead Swallow is bigger. The swallow in the tall p1 is unchanged. |
| 8 | ci 7 (b) | fixed | p5: the Prince stands on a column over the rooftops (was at street level). |
| 9 | ci 8 (b) | fixed | p3: the Prince stands on his column (was in the street). |
| 10 | r8 7 (b) | not fixed | Prince in a garret in a full shot. The swap is limited to establishing and wide shots, so this stays. First version: made worse (grey slab), so it was removed. |
| 11 | r8 21 (b) | partly fixed | Trees in the establishing shot are now shorter than the Giant; they look like shrubs. |
| 12 | r8 23 (b) | partly fixed | Same tree change. The children in p1 are still small (HERO_TOO_SMALL warns). |

12 pages. Made worse: 0 in the final code (r8 7 got worse only in the discarded first version). Not looked at in pairs: r8 5, r8 10, r8 27, r8 13, r8 32, ci 6, ci 14, p0 5, p0 7 (rendered, no crash; r8 5 p3 is the boy in the bed, hero head 6.9, flagged by HERO_TOO_SMALL).

## 5. Structural metrics (T4 script, before and after)

`npx tsx scripts/structural-metrics.ts --run <dir>`, same inputs, old and new:

| Run | pages | panels | text over head | text overlaps | overflow | figures outside panel | order breaks |
|---|---|---|---|---|---|---|---|
| p0 | 15 | 67 | 8 / 8 | 2 / 2 | 0 / 0 | 0 / 0 | 0 / 0 |
| ci | 13 | 57 | 3 / 3 | 4 / 4 | 0 / 0 | 0 / 0 | 0 / 0 |
| r8 | 46 | 204 | 26 / 26 | 11 / 11 | 0 / 0 | 0 / 0 | 5 / 5 |

(old / new.) No delta. Issue codes per panel (all three runs): FIGURE_CLIPPED 1 to 2 (p0 page 8 panel p3, above), SUBJECT_TOO_SMALL 1 to 0, FACE_COVERED 0 to 0; new: SPEAKER_OFF_PANEL_LIMIT 1, STATUE_LOCATION_SWAPPED 2, HERO_TOO_SMALL 2. No new error code.

## 6. Offline checks

`packages/manga-render`: `npx tsc --noEmit` and `npx vitest run`: 11 files, 709 tests pass (698 before; 11 new). `apps/agent-worker`: `npx tsc --noEmit` clean, 68 tests pass.

## 7. What remains

- Writer side (later track): shot choice (close or medium for the payoff beat), one speaker per balloon, draw the speaker or use a caption, a statue panel uses the column location. The renderer now warns (HERO_TOO_SMALL, SPEAKER_OFF_PANEL_LIMIT, STATUE_LOCATION_SWAPPED) but the writer does not yet read these as retry hints.
- Statue in a full or close shot in a place with no column (r8 page 7): needs the writer or a validator, not the renderer.
- A hero in a bed (r8 page 5): the bed sets the scale. Wide establishing scenes with a tiny crowd of children (r8 pages 23, 22).
- Tail aimed over a huge headless figure (the Reed, r8 page 2): the tail checks use head circles only; `TAIL_CROSSES_PROP` does not cover figures without a head entry.
- Empty sky or empty column area in establishing shots: not capped.
- Error level for any new check needs more judged-good pages than the 5 available. Re-run the calibration when the next judged run exists.
- No live run was made (rule 6): the live effect on judge scores is unmeasured.
