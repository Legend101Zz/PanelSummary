# Acceptance scripts

| Script | Use |
|---|---|
| `journey.mjs` | Live journey in Chrome (spends MiniMax tokens) |
| `ui-retry.mjs` | Press "Retry failed pages" in the UI (`--web`, `--api`; default `http://127.0.0.1:3100` and `http://127.0.0.1:8000`) |
| `export_run.py` | Export one edition for the judges (added by the CI track) |
| `judge/` | Quality judge panel, aggregation, defect kinds and run comparison (this page) |

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

## Offline checks (no model call, no spend)

```sh
python3 -m unittest discover -s scripts/acceptance/judge -v   # aggregate, kinds, rates, comparison (CI runs this)
node scripts/acceptance/judge/check-workflow.mjs               # the judge workflow with a fake agent
python3 scripts/acceptance/judge/kinds_rates.py scripts/acceptance/judge/fixtures/*.json.gz
```

## Defect kinds and the v0.3 protocol

`judge/kinds.py` sorts the defect texts of the judges into 21 kinds with keyword rules. These are the
v0.1 rules, unchanged: every published defect rate is measured with them. Do not edit a rule (a changed
rule breaks the comparison with old runs).

`judge/kinds_rates.py` gives the rate of each kind: blocker plus major defects, divided by the number of
judge-pages (one judge's judgment of one page). One defect can match several kinds. Options:
`--kinds a,b` (select kinds), `--severity blocker,major,minor` (default `blocker,major`, the measure of the
gates), `--json` (machine output). Input: `judgments.json` files or fixtures, optionally `LABEL=PATH`.

| Gate measure (`docs/v0.2/GATES.md`) | Kind name |
|---|---|
| Hero, speaker or key prop a speck or cropped (figure clipped) | `hero_tiny` |
| Key prop not drawn | `key_prop_not_drawn` |
| Wrong setting | `setting_wrong` |
| Tail at the wrong figure | `tail_wrong` |
| Label clutter | `label_clutter` |
| Repeated near-identical panels | `repeat_variety` |

`judge/fixtures/` holds the judgments of the 13 runs behind the v0.1 and v0.2 numbers (see
`fixtures/README.md`). `judge/make_fixture.py` makes a new one.

`judge/compare_runs.py` is the table of the v0.3 hold-out protocol (issue #96). Each `--run` is a fixture
or a `judgments.json` with `file=,label=,version=,book=` and, for failed pages, `judge_dir=` or
`aggregate=`. It reuses `aggregate.py`, so a failed page counts as 0. It writes a Markdown and a JSON table
per run and per book and version (runs pooled): pages, failed pages, mean, spread (min-max of the run
means, 2 or more runs), strict ship-bar pages, the 8 criterion means and the six defect rates above. It
then writes the delta against the base version (`--base-version`, default the first version in the input)
per book and per `--group NAME=BOOK1,BOOK2`.

```sh
python3 scripts/acceptance/judge/compare_runs.py \
  --run scripts/acceptance/judge/fixtures/v01-justso.json.gz \
  --run scripts/acceptance/judge/fixtures/v02-justso-1.json.gz \
  --run file=OUT/judgments.json,label=v0.3-justso-1,version=v0.3,book=just-so-three-tales,judge_dir=OUT/judge \
  --group fiction=just-so-three-tales --out-md cmp.md --out-json cmp.json
```

A pooled strict count depends on the number of runs; read "strict per run" when the run counts differ.

## Check that the app calls no third party

Add `--check-hosts` to `journey.mjs`. The journey records the host of every http, https and ws request that
the browser makes. It adds one check and fails if a host is not the host of `--web` or `--api` (fonts,
telemetry and other third-party calls). The check is off by default, so the live lane is unchanged. Use the
same host name in `--web` as the browser really uses (`127.0.0.1` and `localhost` are different hosts).

```sh
node scripts/acceptance/journey.mjs --pdf book.pdf --out OUT --web http://127.0.0.1:3100 --check-hosts
```

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
