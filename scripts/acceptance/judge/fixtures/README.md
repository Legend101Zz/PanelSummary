# Judge fixtures

Each file is one judged run, trimmed to what `kinds.py`, `kinds_rates.py`, `aggregate.py` and
`compare_runs.py` need: for each judge-page, `judge`, `page`, `scores`, `ships` and the defects
(`owner`, `severity`, `what`). `what_works` and the `fix` texts are removed. The files are gzip
JSON (schema `bookreel-judge-fixture.v1`); a field `page_statuses` lists pages that are not
`accepted`. They were made with `make_fixture.py`.

Check done when they were made: for every file, the kind rates, the strict count, the overall
mean, the failed pages and the defect totals equal the ones computed from the original
`judgments.json` and `aggregate.json`.

The source paths are on the build machine's SSD (`/Volumes/Mrigesh SSD/Book-Reel-scratch/`).
They are not in the repository. Every run used a panel of 3 Sonnet judges with the run-8 rubric.
The code commit is the one that GitHub Actions or the local run used; the run's `edition.json`
has no commit field, so the commits come from `docs/v0.2/PLAN.md` (section 6 ledger), `docs/launch/`
and the aggregate labels.

| File | Run | Book | Version | Pages (judge-pages) | Source (under `Book-Reel-scratch/`) | Made by |
|---|---|---|---|---|---|---|
| `v01-gate1-flash` | v0.1 Gate 1 | happy-prince-two-tales | v0.1 | 22 (66) | `launch/gate1-flash-ci` | `release/v0.1` `a53378e`, CI run 37895870904 |
| `v01-uab-flash` | v0.1 two-tale book, F3 | happy-prince-two-tales | v0.1 | 22 (66) | `launch/uab-flash-ci` | `release/v0.1` plus F3, CI run 37903122403 |
| `v01-gate2-flash` | v0.1 Gate 2 bar (pages 1-46 of the 68-page book) | happy-prince-and-other-tales | v0.1 | 46 (138) | `launch/gate2-flash-ci` | `release/v0.1`, CI run 37906337189 (`docs/launch/MODEL-AB.md`) |
| `v01-gate2b` | v0.1 complete run | happy-prince-and-other-tales | v0.1 | 60 (180) | `launch/gate2b-ci` | `release/v0.1` `d19dca9` |
| `v02-gate1` | v0.2 Gate 1 (live run 2) | happy-prince-two-tales | v0.2 | 22 (66) | `v02/live/run2` | `release/v0.2` `d373d8f`, CI run 38061258863 |
| `v02-gate2` | v0.2 Gate 2 (live run 3) | happy-prince-and-other-tales | v0.2 | 61 (183), page 42 failed | `v02/live/run3` | `release/v0.2` `d373d8f`, CI run 38061300872 |
| `v02-selfreliance-1` | v0.2 hold-out (live run 4) | self-reliance | v0.2 | 38 (114) | `v02/live/run4` | `release/v0.2` `dcd9d9c`, CI run 38064770960 |
| `v02-selfreliance-2` | v0.2 hold-out (live run 8) | self-reliance | v0.2 | 36 (108) | `v02/live/run8` | `release/v0.2` `a5b4a5c`, CI run 38070441034 |
| `v02-civil-disobedience` | v0.2 nonfiction (live run 5) | civil-disobedience | v0.2 | 36 (108) | `v02/live/run5` | `release/v0.2` `dcd9d9c`, CI run 38064781814 |
| `v02-justso-1` | v0.2 hold-out (live run 6) | just-so-three-tales | v0.2 | 34 (102) | `v02/live/run6` | `release/v0.2` `dcd9d9c`, CI run 38066788100 |
| `v02-justso-2` | v0.2 final journey | just-so-three-tales | v0.2 | 35 (105) | `v02/final-journey` | `release/v0.2` `a5b4a5c`, local, real worker |
| `v02-justso-3` | v0.2 final journey 2 | just-so-three-tales | v0.2 | 29 (87) | `v02/final-journey-2` | `release/v0.2` `3113fc3`, local, real worker |
| `v01-justso` | v0.1.0 controlled baseline | just-so-three-tales | v0.1.0 | 30 (90) | `v02/v01-holdout` | tag `v0.1.0` `ae959fa`, local |

Not here on purpose: the run on *Who Moved My Cheese?* (an owner's private, copyrighted book; its
defect texts quote it).

Make a new fixture from a run directory that has `judgments.json`:

```sh
python3 scripts/acceptance/judge/make_fixture.py RUN_DIR --run v0.3-justso-1 --book just-so-three-tales \
  --version v0.3 --source "path or CI run id" --out scripts/acceptance/judge/fixtures/v03-justso-1.json
```

Add a `.gz` only if the file is large (`gzip -9n`). Do not make a fixture of a private book.
