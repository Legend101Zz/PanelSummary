# Acceptance scripts

| Script | Use |
|---|---|
| `journey.mjs` | Live journey in Chrome (spends MiniMax tokens) |
| `ui-retry.mjs` | Press "Retry failed pages" in the UI |
| `export_run.py` | Export one edition for the judges (added by the CI track) |
| `judge/` | Quality judge panel and aggregation (this page) |

Full guide: `docs/launch/EVAL.md`.

## From a live journey to a score

```sh
# 1. live journey (spends tokens)
node scripts/acceptance/journey.mjs --pdf book.pdf --out OUT --full

# 2. export the edition
python scripts/acceptance/export_run.py --mongo URL --db NAME [--edition ID] --out DIR

# 3. draw the PNGs
(cd packages/manga-render && npx tsx scripts/svg-dir-to-png.ts DIR/judge 1000)

# 4. judge panel: Workflow tool, scriptPath = scripts/acceptance/judge/judge-workflow.js
#    args = {"judgeDir":"DIR/judge","pages":[1,46],"judges":3,"groupSize":6,"model":"sonnet","label":"launch1"}
#    Save the returned list as DIR/judgments.json

# 5. aggregate and compare with the run-8 baseline
python3 scripts/acceptance/judge/aggregate.py DIR/judgments.json \
  --judge-dir DIR/judge --plan DIR/plan.json \
  --baseline docs/rebuild/baselines/run8.json --label launch1 \
  --out-json DIR/aggregate.json --out-md DIR/aggregate.md
```

`export_run.py` writes `understanding.json`, `plan.json`, `units.json`, `edition.json`,
`receipts.json`, `egress.json` and `judge/page-NN.{json,svg}`.

## Score a CI live run

```sh
gh run download RUN_ID -n live-run -D DIR
```

Then do steps 3 to 5. Skip step 3 if `DIR/judge/` already has the PNG files.

## Live lane in CI

The workflow `.github/workflows/live-journey.yml` runs steps 1 to 3 on a GitHub runner with the
repository secret `MINIMAX_API_KEY`. It spends real MiniMax money. The models per goal come from
`scripts/acceptance/live-config.json`. A manual run (`gh workflow run live-journey.yml --ref <branch>`), or
the act of adding the label `run-live` to a pull request, starts it. A push does not start it (#47). The artifact `live-run` holds the export. Then do steps 4 and 5.
The full description is in `docs/launch/CI.md`.

## Judge workflow arguments

| Argument | Default | Meaning |
|---|---|---|
| `judgeDir` | (required) | Directory with `page-NN.json` and `page-NN.png` |
| `pages` | (required) | `[first, last]` |
| `judges` | 3 | Independent judges per page group |
| `groupSize` | 6 | Pages per agent |
| `model` | `sonnet` | Model of the judge agents |
| `bookTitle` | the Wilde tales | Text after "adaptation of" in the prompt |
| `label` | `judge` | Agent labels: `label:jN:pA-B` |
| `rubric` | `craft.md` in the main checkout | Path of the rubric file |

The result is a flat list. Each item has `judge` (1 to N), `page`, `scores`, `ships`,
`what_works` and `defects`. The prompt is the run-8 text. A test verifies that the script and
`judge/prompt.md` are the same.

## Offline checks (no model call)

```sh
python3 -m unittest discover -s scripts/acceptance/judge   # aggregate.py, prompt copy, baseline numbers
node scripts/acceptance/judge/check-workflow.mjs           # parse and fake run of judge-workflow.js
(cd packages/manga-render && npx tsx scripts/structural-metrics.ts --fixtures)
```

## Failed pages

A page that is not `accepted` never ships. Its scores count as 0 in the means. The report
lists it and shows the accepted-only mean beside the overall mean.
