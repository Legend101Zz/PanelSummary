# UI state fixtures

`seed_states.py` fills a database with one book for every UI state. Use it for UI work, reviews and gates.
It calls no model and spends nothing. The full description is in `docs/v0.2/S2-sample-and-fixtures.md`.

## Run

```sh
cd "<worktree>"
export STORAGE_DIR="<scratch>/storage"        # the same value the API runs with
backend/.venv/bin/python scripts/fixtures/seed_states.py \
  --db v02_<track> --mongo-url mongodb://127.0.0.1:<mongo port> \
  --storage "$STORAGE_DIR" --web http://127.0.0.1:<web port> --out <dir for the table>
```

- The database name MUST start with `v02_` or `fixture_`. Other names are refused. The script EMPTIES that database first.
- The Mongo URL must be on this computer and have no password. It never reads `backend/.env`.
- `--exports <dir>` (default `/Volumes/Mrigesh SSD/Book-Reel-scratch/launch`) holds saved run exports. Pass `--exports none` to use only
  the committed Andersen run. Then the Wilde books use Andersen pages and the 60-page book is left out.
- `--plan-review auto` (default) adds the `awaiting_plan_review` book only when the backend knows that status (track S1).
- Run it again to reset. The ids are stable, so URLs survive a re-seed (the installed sample gets a new id).
- The script writes `states.md` and `states.json` (book id, state, URL) to `--out` and prints the table.

## What you get

24 books (23 until track S1 is in): the 15 shelf states, plan review, a `completed_with_failures` edition with 0 missing pages,
the stress cases (long title, long author, failed book with no author), a 60-page edition with mixed page states, a 150-page
book over the limit, the 68-page Happy Prince book with its five sections, and the installed Andersen sample.

## Rules

- Page art is only a real saved SVG. Never draw fake art for a fixture.
- No job is left for the runner: an active state has a job with status `running` and a lease that ends in 2099.
  `backend/tests/test_samples.py` proves that `claim_job` finds nothing.
- Titles, authors and error texts are fixture data. The PDF behind a book is one of the real test PDFs.

## Other files

- `export_sample.py` made `backend/samples/andersen/sample.json.gz` from a copy of the v0.1 database.
- `render_export_pages.ts` makes the panel and text geometry of export pages. It stops if the renderer does not reproduce the saved SVG.
