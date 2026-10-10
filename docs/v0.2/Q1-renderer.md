# Q1 renderer: story vocabulary (#41) and small heroes and tails (#42)

Branch `v02/q1`. Renderer `manga-render/0.6.0` (was 0.5.0).
Status: PARTIAL. All offline tests pass. No live run was made and no model was called. The effect on the judged defect rates is a prediction (section 6).

## 1. What changed for #41

New names in the closed vocabulary. Each one is drawn by code in the black-and-white style.

| Kind | Names |
|---|---|
| Outfits | `underclothes` (shirt, elbow sleeves, knee drawers, bare shins and feet), `undressed` (bare chest and arms, short drawers) |
| Props | `pot` (kitchen pot with lugs and lid, not a bell), `stove`, `roast_goose`, `heart` (lead heart), `angel`, `loom`, `sledge` |
| Environments | `foundry` (the forge room set for casting: crucible on a stand, pour, moulds, hoist chain), `dustheap`, `paradise` (rays, glow, cloud floor, stars) |

- A person can change clothes in one panel: `figure.variant.outfit` (the catalog lists it for people only). The understanding sets it in `states` (`{"outfit": "underclothes"}`).
- A place that the writer stood in `abstract`, `void`, `country_road` or `meadow` but named a foundry, a dust heap or Paradise is drawn as it.
- `apps/agent-worker/src/goals/vocabulary.ts` is built from the renderer contracts: no change was needed, and a new test (`vocabulary-sync.test.ts`) fails if the lists differ. One line was added to each of the two SKILL.md files. Versions: `manga-page` 1.11.0, `book-understanding` 1.9.0. The skills size cap went from 1.22 to 1.23 (measured 42198 / 34494 = 1.2233). The decision entry is D28 in `docs/decisions.md`. `repair-once.ts` has no trigger words for the new props: not added, because that would change a calibrated check without a new measurement. `continuity.ts` got one line (`outfit` in the state value list).
- Tests: `test/story-vocab.test.ts` (38 tests): each prop and backdrop is inside its stated bounds, is deterministic, is in the panel at medium, full and wide shots, and no lettering covers it.
- Looked at (Read tool): `sheets-v2/props.png`, `sheets-v2/envs.png`, `sheets-v2/envs-night.png`, and in context `sheets-v2/page-01.png` to `page-03.png` (all under `/Volumes/Mrigesh SSD/Book-Reel-scratch/v02/q1/`). The pot reads as a pot beside the bell; the first foundry drawing was a black box and was redrawn.

## 2. What changed for #42

1. Camera push-in (`scene/compose.ts`, before the figures are drawn). Subjects are the hero (named in the beat, else the only figure) and every speaker. A subject below `SUBJECT_MIN_SIZE` (0.30; establishing 0.15) triggers a push of at most 3 (establishing 2.4) about it: every figure and the set scale about the subject. Limits: every subject, speaker and name-tagged head stays in the panel (with a 2.5 percent margin); a subject that is a small creature stays whole; other figures stay at least half in; the ground line stays in the panel (so props are seen); a statue on the set's own column follows the column. If the push stops early, a small creature is drawn up to 1.8 times larger. Figures cropped by the push are not reported as `FIGURE_CLIPPED`.
2. A speaking statue seen from its feet keeps its head (and so its mouth) in the panel. Before, six judged panels had a speaker with no head and a tail that ran off the panel edge.
3. Tails: if the halfway tail would end between two faces (margin under 0.5 speaker head radii), the placement may use a full-reach tail that ends just outside its own speaker's head. The cost keeps the old tail first.
4. `HERO_TOO_SMALL` (warning) now means: under 25 percent of the panel after the push (or head radius under 8). `TAIL_CROSSES_PROP` is unchanged: it checks the line from the balloon to the aim point, which is the same line for both tail lengths. The test `expectTailToward` allows the full-reach tail.

## 3. Calibration (old = origin/release/v0.2, 0.5.0; new = this branch, 0.6.0)

124 judged pages (18 final journey, 46 Gate 2 flash, 60 Gate 2b), 581 panels, 597 hero figures outside establishing shots, 353 tails. The same specs and the same code path; 0 crashes. Script: `scripts/calibrate-q1.ts` and `scripts/calibrate-q1-report.py`. Full output: `/Volumes/Mrigesh SSD/Book-Reel-scratch/v02/q1/cal/report.md`. 60 pages are flagged hero_tiny and 18 tail_wrong by at least two of three judges (the regexes of `launch/clusters/kinds2.py`).

Hero body share of the panel (clipped):

| | p10 | median | p90 |
|---|---|---|---|
| old | 0.049 | 0.227 | 0.590 |
| new | 0.056 | 0.228 | 0.581 |

| Hero figures under | old | new |
|---|---|---|
| share of panel area 0.03 | 30 (5.0%) | 10 (1.7%) |
| share of panel area 0.05 | 61 (10.2%) | 39 (6.5%) |
| head radius 12 | 13 (2.2%) | 6 (1.0%) |
| head radius 16 | 37 (6.2%) | 25 (4.2%) |

Subjects (hero or speaker) under their floor: 51 of 663 before, 38 after. On pages the judges flagged hero_tiny, hero figures under 0.05 of the panel: 37 before, 24 after. 62 panels changed (figure sizes or tails).

Heads cut by the panel edge (not deliberate): 5 before, 5 after. Speakers drawn with their head out of the panel and an off-panel tail: 6 before, 0 after. Deliberately cropped heads: 15 (6 speakers) before, 9 (0 speakers) after.

Tails (speaker drawn, not off-panel): tip to the mouth, in head radii, median 1.65 before, 1.63 after; p90 2.78 before, 2.72 after. Tails ending nearly as near another head as the speaker (margin under 0.5): 7 of 179 before, 0 of 186 after. Nearest head to the tip is not the speaker: 12 before, 9 after (most are small creatures; the metric divides by head radius and over-counts them).

`HERO_TOO_SMALL` threshold: at 0.25 the new code flags 4 pages (3 judged hero_tiny by at least two judges, 0 judged clean); the old code at the same line would flag 19 pages (13 of them judged). Warning only: only 44 pages have no hero_tiny finding, and one judge panel is a weak oracle.
Issue codes, old to new: `FIGURE_CLIPPED` 2 to 6, `HERO_TOO_SMALL` 0 to 4, `TEXT_DOES_NOT_FIT` 0 to 1, no other change, no new error.

Re-run on 2026-10-10 after the rebase onto `origin/release/v0.2` (4adfd39): the renderer logs of the final journey (87 panels), Gate 2 flash (209) and Gate 2b (285) are identical to the logs above (compared panel by panel), so every number in this section holds.

## 4. Before and after (looked at with the Read tool)

Pairs of whole pages: `img/g2/pairs/page-NN.png`, `img/final/pairs/` (NN = 4, 5, 8, 12, 13, 20, 21, 22, 23 for Gate 2; 1, 3, 4, 9, 11 for the final journey). Every changed panel, side by side: `img/changed/sheet-01.png` to `sheet-13.png`.

- Better: Gate 2 page 22 (the Nightingale beside the thorn is a bird, not a sliver; the rose-tree speaker is large), page 5 p1 and page 12 p1 (the Swallow at the Prince's feet is readable), page 8 p4 and page 5 p2 (the speaking Prince has a head, the tails reach it), final page 1 p3 (the tail reaches the bowed first knave instead of ending between two faces).
- Worse or mixed: Gate 2 page 8 p4 and page 4 p5 (the statue is smaller and the Swallow is still small: the speaker rule trades size for a visible head); page 13 p2 (the Prince's head is cropped out on purpose, the dead Swallow is larger).
- Not fixed: establishing shots where the hero is a few pixels (page 20 and 21 p1: pushed 2.4 times at most); the dead Nightingale in a tall thin panel (page 23 p5), which fills the panel width but not its height.

## 5. Known limits

- The push uses the panel only. The writer still chooses shots; a hero that must be read needs a medium or close shot.
- Big hosts limit the push: a bird at a statue's feet with the statue speaking cannot get both big.
- Key props are not pushed; their floor (0.12 of the panel height) is unchanged.
- The angel prop is drawn plainly. The skill still tells the understanding not to cast sacred figures; an angel is allowed only as a prop (owner question in the PR).
- `repair-once.ts` has no trigger words for the new props (KEY_PROP_NOT_DRAWN will not fire for them).

## 6. Predicted effect on the judged rates (the orchestrator verifies it with a live run)

- hero_tiny (0.62 per judge-page): about one third of the pages that carried it had a small creature or a statue-side hero under the floor; the new code removes or reduces about 25 percent of those subjects (51 to 38 under the floor, hero figures under 0.03 of the panel 30 to 10). Prediction: 0.62 to 0.50 to 0.55. Not expected to reach zero: many findings in this class are about wrong settings and balloons that cover figures.
- tail_wrong (0.22): the six speakers without a head and all seven ambiguous tails are gone from the saved pages (13 of the 346 tails, about 4 percent). Prediction: 0.22 to 0.17 to 0.20. The rest are writer findings (speaker not drawn, wrong speaker).
- Risk: more balloon cover on pushed panels (`TEXT_DOES_NOT_FIT` 0 to 1); watch `label_clutter` and `balloon_covers`.

## 7. Commands

```
cd packages/manga-render && npx tsc --noEmit && npx vitest run     # 13 files, 772 tests pass
cd apps/agent-worker      && npx tsc --noEmit && npx vitest run     # 9 files, 166 tests pass
npx tsx scripts/calibrate-q1.ts --src <old or new dir> --run <run dir> --tag <t> --out <file>
python3 scripts/calibrate-q1-report.py <cal dir>
npx tsx scripts/q1-panel-pairs.ts --old <dir> --new <dir> --list <list.json> --out <dir> && python3 scripts/q1-panel-pairs.py <dir>
npx tsx scripts/sheet-v02.ts <dir> ; npx tsx scripts/sheet-v02-items.ts <dir> all
```
