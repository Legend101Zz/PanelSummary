# S2: built-in sample and state fixtures

Track S2 adds two things: a built-in sample manga, and a seeder that makes a book for every UI state.

## A. The built-in sample

- It is the v0.1 final-journey edition "Four Tales by Hans Christian Andersen": 22 PDF pages, 4 sections, 18 manga pages.
- Files in `backend/samples/andersen/`:
  - `andersen-four-tales.pdf` (265,120 bytes). Public domain text from Project Gutenberg eBook #1597.
  - `sample.json.gz` (1,581,222 bytes; 6,066,246 bytes as JSON). The book, its source, the edition, the two artifacts, the 18 pages with SVG, panels, texts, sources and receipts, and the two finished jobs.
  - `manifest.json` (id, title, PDF hash, hash of the understanding) and `NOTICE.md` (source and licence).
  - Size added to the repository: about 1.85 MB.
- The data was read from a copy of the v0.1 database. The only change is that the machine path of the PDF is removed. The PDF hash was verified against the book.
- Real values in it: 20 model calls, $0.460227, 54 key points (51 shown, 3 left out with reasons), the policy and the timings.
  The timings hold `generate_started_at`, `drawing_started_at` and `first_page_at`. The new key `page_1_at` (track S1) does not exist in v0.1 data. The UI must fall back to `first_page_at`.

### API

| Call | Result |
|---|---|
| `GET /samples` | `[{id, title, installed, book_id?, edition_id?}]` |
| `POST /samples/{id}` | `{book_id, edition_id}`. It installs the sample. A second call returns the same ids. An unknown id gives 404. |
| `GET /books`, `GET /books/{id}` | Both carry `is_sample` (true when the PDF hash is a sample hash). |

- Install is idempotent by `pdf_hash`. The unique index makes two parallel requests safe. The edition is found by the hash of its understanding.
- New ObjectIds are made. The references inside the documents (book, edition, artifacts, jobs) are set to the new ids.
- If the user already uploaded the same PDF, the sample joins that book.
- The PDF is stored in the configured PDF directory under its hash, like an upload. No worker call, no spend.
- No job is left queued. The installed sample behaves like any book: shelf, book page, reader, Sources, PDF viewer, preflight and receipts.

## B. The state seeder

`scripts/fixtures/seed_states.py`. Usage and rules are in `scripts/fixtures/README.md`.

| # | State | Notes |
|---|---|---|
| 01 | PDF not readable | no author, title "scanned no text" |
| 02 | Reading the PDF | parse job `running` with a lease to 2099 |
| 03 | Not drawn yet | Happy Prince 68 pages, 5 sections (3,471 / 2,323 / 1,652 / 4,332 / 4,381 words) |
| 04 | Over the limit | "Sample: A Long Book (150 pages)", real parse of four test PDFs joined |
| 05 | Queued | |
| 06 | Reading the book | long title |
| 07 | Planning | understanding stored |
| 08 | Drawing 6 of 16 | pages: 6 accepted, 1 failed, 3 drawing, 6 pending; long author |
| 09 | Complete, 18 pages | the installed sample |
| 10 | Completed with failures, 14 of 16 | pages 6 and 11 failed, with reasons |
| 11 | Stopped at 3 of 16 | |
| 12 | Stopped before drawing | |
| 13 | MiniMax limit, 5 of 16 | `PROVIDER_LIMIT` |
| 14 | MiniMax limit, no plan | `PROVIDER_LIMIT`, 0 pages |
| 15 | Key refused, 4 of 16 | `PROVIDER_AUTH` |
| 16 | MiniMax not answering, 7 of 16 | `PROVIDER_UNAVAILABLE` |
| 17 | Failed, no reason | 3 pages drawn |
| 18 | Failed while reading | |
| 19 | Failed while planning | |
| 20 | Failed while drawing, 9 of 16 | |
| 21 | Plan ready to review | `awaiting_plan_review`. Left out until the backend has track S1. Page rows pending; the spend so far is the two receipts. |
| 22 | `completed_with_failures`, 16 of 16, 0 missing | key points not shown (G-O1), computed by the `finalize` formula |
| 23 | 60-page edition, mixed | 36 accepted, 2 failed, 4 drawing, 18 pending. Needs the export of the 60-page run. |
| 24 | Drawing, 0 of 16 | cover is the plain sheet |

### What is real and what is fixture data

- Real: every page SVG, spec, claim, beat, cast and receipt, and the PDFs.
- The art of the 60-page run and of the two-tale books is from saved exports. The geometry (panels, texts) is made again from the saved spec.
  The renderer reproduces each saved SVG byte for byte; the helper stops with an error if it does not (60 of 60 and 22 of 22 pages matched).
- Fixture data: titles, authors, which pages are failed, drawing or pending, provider stops and error texts, and the timings of partial runs.
  A fixture run is a partial copy of a real run: the first N pages, with the plan cut to N pages. Its totals are the sum of the receipts it holds.
  Failed fixture pages have no receipts, because no real call exists for them.
- A partial timing is scaled from the real run in proportion to the pages drawn. Exports without stage timings give only `first_page_at`.
- The PDF behind a book is one of the real test PDFs. It need not match the title.

### Safety

- The database name must start with `v02_` or `fixture_`. The URL must be local, with no password. The seeder never reads `backend/.env`.
- The runner cannot take any seeded job: an active job is `running` with `lease_expires_at` in 2099 and owner `fixture:static`.
  `test_seeder_makes_every_state_and_leaves_no_job_for_the_runner` verifies that `claim_job` returns nothing.

## Not done

- Book 21 was not seeded or screenshot here, because this branch does not have the status `awaiting_plan_review`. The document shape follows the S1 code (page rows pending, understanding and plan stored, job `succeeded`, `policy.review_plan`), and the status is a valid value there. Verify after the rebase on S1.
- No screenshot of the new UI. The screens shown are the v0.1 look. They prove that the data loads.
