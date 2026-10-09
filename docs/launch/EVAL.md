# Quality evaluation harness

This page shows how to score the quality of one generated book. It uses the same rubric
and the same judge prompt as acceptance run 8. The tools are in `scripts/acceptance/judge/`.
The short command list is in `scripts/acceptance/README.md`.

## What it measures

A panel of 3 or more independent Sonnet judges scores every page on 8 criteria from 1 to 5
(rubric: `docs/rebuild/research/craft.md`, section "(g) Acceptance rubric"):
legibility, reading flow, speaker attribution, continuity, variety, page turn, fidelity, and
beat without prose wall. Every judge gets the same prompt and the same schema.

A page meets the strict ship bar when:

- no criterion is below 3;
- legibility is 4 or more;
- fidelity is 4 or more;
- the mean of the 8 criteria is 3.5 or more.

With a panel, the bar applies to the panel mean of each criterion (the mean over the judges).
The report also shows how many pages a majority of the judges marked `ships`.

## Steps

1. **Run a live journey** (spends MiniMax tokens; the orchestrator runs it).
   Locally: `node scripts/acceptance/journey.mjs --pdf book.pdf --out OUT --full`.
   In CI: the `live-journey` workflow.
2. **Export the edition** with `scripts/acceptance/export_run.py`
   (`--mongo URL --db NAME [--edition ID] --out DIR`). It writes `understanding.json`,
   `plan.json`, `units.json`, `edition.json`, `receipts.json`, `egress.json` and
   `judge/page-NN.{json,svg}`. A CI run uploads this export as the `live-run` artifact.
3. **Draw the PNGs**: `cd packages/manga-render && npx tsx scripts/svg-dir-to-png.ts DIR/judge 1000`.
4. **Run the judge workflow** with the Workflow tool: `scriptPath` is
   `scripts/acceptance/judge/judge-workflow.js` and `args` is
   `{ "judgeDir": "DIR/judge", "pages": [1, 46], "judges": 3, "groupSize": 6, "model": "sonnet", "label": "launch1" }`.
   Add `bookTitle` for a book other than the Wilde tales. Save the returned list as
   `DIR/judgments.json`.
5. **Aggregate**:
   `python3 scripts/acceptance/judge/aggregate.py DIR/judgments.json --judge-dir DIR/judge --plan DIR/plan.json --baseline docs/rebuild/baselines/run8.json --label launch1 --out-json DIR/aggregate.json --out-md DIR/aggregate.md`
6. **Read `DIR/aggregate.md`.** The last section is the Gate 2 verdict.
7. Optional, no model call: `cd packages/manga-render && npx tsx scripts/structural-metrics.ts --run DIR --out DIR/structure.json`.

## Score a CI live run

1. Find the run: `gh run list --workflow live-journey.yml`.
2. Download the artifact: `gh run download RUN_ID -n live-run -D DIR`.
3. If `DIR/judge/` has no `page-NN.png` files, do step 3 above.
4. Do steps 4 to 6 above.

## How the numbers are made

- **Panel mean.** For each page and criterion, the mean over the judges. The page mean is the
  mean of the 8 panel means. The overall mean is the mean of the page means.
- **Failed pages.** A page whose status is not `accepted` never ships. Its scores count as 0 in
  every mean, because a failed page is a gap that the reader sees (decision D11). The report
  lists these pages and also shows the overall mean for accepted pages only. Run 8 has no failed
  page in the judged set (page 36 was judged after its retry), so the baseline is the same
  either way.
- **Defects.** The report counts the defects of all judges. With 3 judges the total is about 3
  times the total of one judge. Compare `per_judge` with the baseline, not `total`.
- **Sections.** The mean per tale comes from `section_id` in `plan.json`.

## Gate 2 pass bar

All four must hold against `docs/rebuild/baselines/run8.json`:

1. strict ship-bar pages: more than 5;
2. overall mean: more than 3.37;
3. continuity: more than 2.43;
4. no criterion more than 0.2 below its baseline mean.

Note: the exact run-8 overall mean is 3.375. `ACCEPTANCE.md` shows 3.37 because it cuts the
number instead of rounding it. The bar uses 3.37 as written, so run 8 itself passes bar 2.
Bar 1 and bar 3 are the real tests.

## Baseline

`docs/rebuild/baselines/run8.json` is the output of `aggregate.py` on the run-8 judge scores
(one judge, 46 pages). It matches `docs/rebuild/ACCEPTANCE.md`: 5 of 46 pages ship; mean 3.37;
reading flow 4.41, speaker attribution 3.83, variety 3.57, page turn 3.43, legibility 3.30,
beat 3.09, fidelity 2.93, continuity 2.43; 258 defects (writer 133, renderer 93, plan 19,
understanding 13); by tale 3.24, 3.48, 3.06, 3.57, 3.46. A unit test verifies these numbers.

A panel of 3 judges is not the same instrument as 1 judge. A change in score can come from
the panel. For a fair comparison, judge a fresh run of the old code with the same panel, or
read the deltas with that limit in mind.

## Structural metrics

`packages/manga-render/scripts/structural-metrics.ts` renders stored page specs with the
public API of the renderer package. It reports, per page: panel count, words per page, per
panel and per balloon, balloon count, text over a figure head, text boxes that overlap, text
that did not fit, panels with no figure and no environment, figures outside their panel, and
reading-order breaks. The same input gives the same output. The numbers do not replace the
judges. The test `packages/manga-render/test/structural-metrics.test.ts` uses the 46 run-8 specs
in `test/fixtures/run8/`. It verifies determinism and valid ranges. It does not compare exact
geometry, so a renderer change does not break it.

A new deterministic check must be calibrated on judged pages before it becomes an error
(run 6: a too-strict guard collapsed two tales).

## Files

| File | Use |
|---|---|
| `scripts/acceptance/judge/judge-workflow.js` | Workflow script: the judge panel |
| `scripts/acceptance/judge/prompt.md` | The judge prompt (run 8 text, with placeholders) |
| `scripts/acceptance/judge/aggregate.py` | Panel means, ship bar, defects, comparison |
| `scripts/acceptance/judge/test_aggregate.py` | Unit tests, including the prompt copy and the baseline |
| `scripts/acceptance/judge/check-workflow.mjs` | Offline run of the workflow script with a fake agent |
| `docs/rebuild/baselines/run8.{json,md}` | Baseline |
