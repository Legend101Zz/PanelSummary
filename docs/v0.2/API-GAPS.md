# PanelSummary v0.2: API gaps for the redesign

Scope: read only, at v0.1.0 (ae959fa). No file in any repo was changed. No server was started. No number below was measured in a run. Each row comes from reading the code.

Sources read: `SCREENS-AND-STATES.md` (all sections), the design frames 5-round-2b (Book-B), 6-round-2c (Book-DEF), 8-round-3b (Settings), 9-round-3c (Book-B2), `backend/app/api/library.py`, `api/editions.py`, `documents.py`, `jobs/generate.py`, `jobs/runner.py`, `jobs/parse.py`, `preflight.py`, `settings.py`, `runner.py`, `main.py`, `worker_client.py`, `frontend/lib/api.ts`, `frontend/lib/words.ts`, `apps/agent-worker/src/index.ts` and `server.ts`.

Words used:
- OK: the field exists and the frontend can show it as it is.
- DERIVABLE: the data exists. The frontend computes the value. The "how" is in the table.
- GAP: the backend must add something. The smallest change is in the section "Backend changes needed".

Notation: `ED` = `GET /editions/{id}`. `BK` = `GET /books/{id}`. `LIST` = `GET /books`. `PF` = `GET /books/{id}/preflight`.

## Facts that affect many rows

- The frontend type `Edition` in `frontend/lib/api.ts` has no `timings` field. The API already sends `timings` (`edition_view`). The type must get it. This is a frontend change, not a gap.
- `timings` has three keys: `generate_started_at`, `drawing_started_at`, `first_page_at`. A key is absent until it happens. The first value stays when a job is resumed. `finished_at` is overwritten when a resumed job ends (`finalize`). So "Took" on a resumed run includes the idle time. See G-T3.
- `first_page_at` is the time of the first accepted page of ANY number (pages run 4 at a time). It is not the time of page 1.
- Date strings are timezone-aware (`tz_aware=True` in `db.py`), so the browser parses them correctly.
- Page rows (`pages[]`) and `page_total` exist only after the plan is accepted and drawing starts. Before that `pages` is empty and `page_total` is 0. This matches the design ("No pages planned yet").
- `ED.book` (title, logline, cast, sections) exists only after the understanding artifact is accepted. `ED.has_plan` is true after the plan is accepted.

## Table

| Screen § | What the design shows | API field (endpoint → path) | Status |
|---|---|---|---|
| 3 first run | Server reachable | `GET /health` → `status` | OK (shows only that the API process answers; it does not touch Mongo). A fetch error gives "Can't reach the PanelSummary server". |
| 3, 8 | Job runner running | none | GAP G-S1 |
| 3, 8 | Drawing service has a key set | Worker `GET /readyz` → `ready` exists on port 8788, but the browser cannot reach it through the API | GAP G-S1 (the API must ask the worker) |
| 3, 8 | "Never show key valid" | not applicable | OK (`ready` only checks that `MINIMAX_API_KEY` is set) |
| 3, 5, 8 | All limits (60 MB, 75 PDF pages, 17,500 words) before upload | `PF` → `limits.max_pdf_pages`, `limits.max_source_words` exist only for a parsed book. `max_pdf_size_mb` is in no response. | GAP G-S2 (the UI can hard-code the three numbers, but they will drift from `settings.py`) |
| 5 | "English", "selectable text" limits | No language check in the code. No-text PDFs fail with `BK.error` "The PDF has no extractable text." | OK for text. "English" is copy only: the API does not check it. |
| 3 | Estimate and real run side by side for the sample | The sample book does not exist in the API | GAP G-M1 (then OK: see the run rows below) |
| 3, 2 | Sample manga ready to open | none | GAP G-M1 |
| 4 | Shelf: title, author | `LIST` → `title`, `author` | OK |
| 4 | Shelf cover = first drawn page | `LIST` → `latest_edition.id`; page 1 via `GET /editions/{id}/pages/1` → `svg` | OK (existing behaviour) |
| 4 | Status band, 15 states | `LIST` → `status`, `error`, `latest_edition.{status,page_total,pages_accepted,provider_stop.code}` | DERIVABLE for all 15; `shelfStatus()` in `words.ts` already does it. See the next 15 rows and G-O1. |
| 4 | 1 PDF not readable | `LIST` → `status == "failed"` | OK |
| 4 | 2 PDF being read | `status` in `uploaded`, `parsing` | OK |
| 4 | 3 Parsed, not drawn | `status == "parsed"` and `latest_edition == null` | OK |
| 4 | 4 Queued | `latest_edition.status == "queued"` | OK |
| 4 | 5 Reading the book | `latest_edition.status == "understanding"` | OK |
| 4 | 6 Planning | `latest_edition.status == "planning"` | OK |
| 4 | 7 Drawing "6 of 16" + thin line | `latest_edition.status == "drawing"`, `pages_accepted`, `page_total` | OK. `pages_accepted` is updated on each accepted page. |
| 4 | 8 Complete "18 manga pages" | `status == "complete"`, `page_total` | OK |
| 4 | 9 Completed with failures "14 of 16, 2 missing" | `status == "completed_with_failures"`, `page_total - pages_accepted` | DERIVABLE. Edge case G-O1: the status can be `completed_with_failures` with 0 missing pages (a core claim not conveyed). The band then says "16 of 16 drawn, 0 missing". |
| 4 | 10 Stopped, some pages drawn | `status == "cancelled"`, `page_total > 0` | OK |
| 4 | 11 Stopped before any page | `status == "cancelled"`, `page_total == 0` | OK |
| 4 | 12 MiniMax limit (with or without pages) | `status == "failed"`, `provider_stop.code == "PROVIDER_LIMIT"` | OK |
| 4 | 13 Key refused | `provider_stop.code == "PROVIDER_AUTH"` | OK |
| 4 | 14 Not answering | `provider_stop.code == "PROVIDER_UNAVAILABLE"` (any other code falls to this text in `providerStopShort`) | OK |
| 4 | 15 Failed, no reason | `status == "failed"`, `provider_stop == null` | OK |
| 4 | Optional tile menu: rename, delete | none | GAP G-O3 (optional; design marks it optional) |
| 4 | Optional quick Resume / Retry on tile | `POST /editions/{id}/resume` exists; `LIST` has `latest_edition.id` | OK |
| 5 | Upload progress "42%" | Client-side XHR `upload.onprogress` in `uploadPdf()` | OK |
| 5 | Cancel upload | `uploadPdf(file, onProgress, signal)` already aborts | OK (add a button) |
| 5 | Several files dropped, drag-over | Client only | OK |
| 5 | "Already on the shelf" | `POST /upload` → `cached: true` | OK. Caveat: `cached` is true only when the old book is `parsed`, `parsing` or `uploaded`. A failed book is parsed again and returns `cached: false`. |
| 5 | Step 2 job text "Parsed 22 pages into 4 sections and 10 source units" | `GET /jobs/{id}` → `message` | DERIVABLE. The design wants "Read 22 PDF pages and found 4 sections." Use `BK.page_count` and `BK.section_count` after the book is `parsed`. Do not show `job.message` (it says "source units"). |
| 5 | "Waiting to read the PDF" | `GET /jobs/{id}` → `message` | OK (the parse job starts with this message) |
| 5 | Slow after 20 s: "check the job runner" | Client timer; with G-S1 the UI can say whether the runner is up | OK now; better with G-S1 |
| 5 | Errors: not a PDF, too large, no text, no job, read failed | `POST /upload` 400/413 `detail`; `BK.error`; `GET /jobs/{id}` → `status` | OK |
| 6 hero | Title, author, "PDF: 22 pages, 4 sections, 4,775 words" | `BK` → `title`, `author`, `page_count`, `section_count`, `word_count` | OK (`bookFacts()`) |
| 6 hero | Logline | `ED` → `book.logline` | OK (after understanding) |
| 6 0 | PDF not readable / still read / not found | `BK.status`, `BK.error`, 404 | OK |
| 6 0 | No estimate available | `getPreflight()` returns null on error | OK |
| 6A | Manga pages "11 to 18" | `PF` → `estimated_manga_pages.{low,high}` | OK |
| 6A | Page 1 ready in "2 to 31 min" | `PF` → `estimated_minutes.first_page.{low,high}` | OK |
| 6A | Whole book in "5 to 58 min" | `PF` → `estimated_minutes.total.{low,high}` | OK |
| 6A | Cost "$0.33 to $0.75" | `PF` → `estimated_cost_usd.{low,high}` | OK |
| 6A | Cost basis (short form "Estimate at MiniMax-M3 rates") | `PF` → `estimated_cost_usd.basis` is one long string with "Pi catalog" | GAP G-O2 (small: split the string in the frontend with `splitCostBasis`, or return a short `basis_short`). The UI can live without a backend change. |
| 6A | "Inside the limit" / over limit block | `PF` → `within_limits`, `blocking_reasons`, `limits` | OK. The reason text says "BookReel v0.1" (see G-O4). |
| 6A | Over-limit text "150 PDF pages … in one run" | `PF` → `blocking_reasons[]` | OK after text fix G-O4. `test_preflight.py` pins the old strings. |
| 6A | Generate refused "Generate did not start. {reason}" | `POST /books/{id}/editions` → 422/409 `detail` | OK |
| 6A | Generate already running | `POST /books/{id}/editions` → `already_running` | OK |
| 6A scope | Choose sections, each with word count | `BK` → `sections[].{id,title,page_start,page_end,word_count}` | OK for the list |
| 6A scope | Meter: share of the limit the choice uses | Sum of chosen `word_count` over `PF.limits.max_source_words` | DERIVABLE in the frontend |
| 6A scope | Estimate for the chosen sections | `PF` takes the whole book only | GAP G-S1a |
| 6A scope | Draw only the chosen sections (Generate with scope) | `POST /books/{id}/editions` has no body | GAP G-S1a |
| 6A scope | PDF page range "PDF pages 3 to 40" and its word count | Only section word counts exist; no words per PDF page | GAP G-S1b |
| 6A scope | Limits checked on the chosen scope, not on the book | `generate()` calls `check_limits(book.page_count, book.word_count, …)` | GAP G-S1a |
| 6A scope | "Continue with the next section", reuse cast and looks | none; every edition starts from nothing | GAP G-S1c |
| 6A scope | Which sections are already drawn | Editions list `GET /books/{id}/editions`; no scope stored | GAP G-S1a (store `scope` on the edition) |
| 6B | Planned page count | `ED` → `page_total` | OK (after the plan) |
| 6B | Cast: name and role | `ED` → `book.cast[].{name,role}` | OK |
| 6B | One beat per page | `ED` → `pages[].{page_number,beat,section_id}` | OK (page rows exist before drawing starts) |
| 6B | Run waits for approval | none; the job goes from plan to drawing at once | GAP G-S2a (blocks 6B) |
| 6B | "To draw the pages about $0.42" | none | GAP G-S2b |
| 6B | "Spent so far about $0.04 (estimate)" | `ED` → `totals.cost_usd` | OK (`$inc` after each receipt, so it is live) |
| 6B | "Draw the pages" / "Stop" | `POST /editions/{id}/resume` could be the approve; `POST /editions/{id}/cancel` is the stop | Approve: GAP G-S2a. Stop: OK. |
| 6B | Omitted claims with reasons at review time | Plan content is not exposed; `coverage` is written at the end only | GAP G-S2c (UI can live without) |
| 6B | Setting is off by default | none | GAP G-S2a |
| 6B headline | "Waiting to start" | `ED.status == "queued"` | OK |
| 6B headline | "Reading the book" | `ED.status == "understanding"` | OK |
| 6B headline | "Planning the pages" | `ED.status == "planning"` | OK |
| 6B headline | "Drawing pages 7, 8 and 9 of 16" | `ED` → `pages[].status == "drawing"` and `pages[].page_number`; `page_total` | DERIVABLE. `stageLine()` already does it. Each page row is saved as `drawing` at the start of an attempt and set back to `pending` on a stop. The data is a snapshot at the poll, so a page can show for less than one poll. |
| 6B headline | "Finishing N pages" | `status == "drawing"` and no page `drawing` or `pending` | DERIVABLE (`stageLine()`) |
| 6B headline | "Stopping after the pages in progress" | `cancel_requested` is on the job in Mongo but not in `job_view` | GAP G-T4 (the UI can show "Stopping" from the button press only; it is lost on reload) |
| 6B steps | Reading / Planning / Drawing done, current, next | `ED.status`; `ED.book` present = reading done; `ED.has_plan` = planning done | DERIVABLE |
| 6B progress | One segment per planned page; waiting, drawing, drawn, failed | `ED` → `pages[].status` (`pending`, `drawing`, `accepted`, `failed`) | OK |
| 6B progress | "6 pages drawn of 16, 2 could not be drawn" | `ED` → `pages_accepted`, `page_total`, `pages_failed`; or count `pages[]` | OK. `pages_failed` is updated live. |
| 6B progress | Indeterminate bar before the plan | `ED.page_total == 0` | OK |
| 6B time | "Running for 4 min 12 s" | `ED` → `timings.generate_started_at` (fall back to `created_at`); `now` from the browser | DERIVABLE. Browser clock skew is small on one computer. |
| 6B time | Started | `ED` → `created_at`, `timings.generate_started_at` | OK (`generate_started_at` is the time the runner took the job; `created_at` is the press of Generate) |
| 6B time | Drawing started | `ED` → `timings.drawing_started_at` | OK (add to the TS type) |
| 6B time | FIRST PAGE DRAWN (any page) | `ED` → `timings.first_page_at` | OK |
| 6B time | PAGE 1 READY (the moment "Start reading" works) | none | GAP G-T1 |
| 6B time | Finished | `ED` → `finished_at` | OK |
| 6B time | Took "7 min 08 s" | `finished_at − timings.generate_started_at` | DERIVABLE. For a resumed run, `finished_at` is the end of the last job, so it includes the idle time. See G-T3. |
| 6B time | Page 1 "after 3 min 58 s" | `page_1_at − generate_started_at` | needs G-T1 |
| 6B actions | "Start reading" once page 1 ready | `ED` → `pages[0].status == "accepted"` | OK |
| 6B actions | "Continue from page n" | Browser position (`lib/position.ts`) | OK (client) |
| 6B actions | "Stop drawing" | `POST /editions/{id}/cancel` | OK |
| 6B actions | Cancel of a queued job | `cancel` sets edition `cancelled` at once only when the job is `queued` | OK |
| 6B | "Stopping" after Stop | see headline row | GAP G-T4 |
| 6C | Cost "$0.46" | `ED` → `totals.cost_usd` | OK (a Pi catalog estimate; the design says "not a bill") |
| 6C | Model calls "20" | `ED` → `totals.calls` (and `totals.failed_calls`) | OK |
| 6C | Tokens "715,490" | `ED` → `totals.input_tokens + totals.output_tokens` | OK |
| 6C | Estimate range next to the actual | `PF` (before) and `ED.totals` (after) | OK, if the UI calls `PF` after the run. `PF` needs `book.status == "parsed"`, which stays true. For a scoped run, `PF` must use the stored scope (G-S1a). |
| 6C | Model per step | `ED` → `policy.{understanding_model,plan_model,page_model}` | OK (policy is recorded on the edition) |
| 6C | Thinking sent per step | `GET /editions/{id}/receipts` → `calls[].thinking_sent` (for example "adaptive:low"), with `calls[].artifact` or goal type to name the step. `ED.policy.*_thinking` is what was asked ("off"), not what was sent ("low" on Flash). | DERIVABLE (one extra request; the response also includes `worker_egress`) |
| 6C | Failure panel: one row per failed page, plain reason, raw text | `ED` → `pages[].error` (message string only), `status == "failed"`; `GET /editions/{id}/pages/{n}` → `error {code, message}` | OK. `plainReason()` maps the text. |
| 6C | Per page attempts | `ED` → `pages[].attempts` | OK |
| 6C | "Retry failed pages" | `POST /editions/{id}/resume` (failed pages are reset to pending with attempts 0 at job start) | OK. The test hook name is a frontend label. |
| 6C | Resume after stop or error | `POST /editions/{id}/resume` | OK |
| 6C | Failed: name the stage ("while reading the book") | `ED.error` is a free text; no stage field | DERIVABLE: no `book` = reading; `book` and no `has_plan` = planning; `has_plan` = drawing. For a provider stop use `provider_stop.stage`. |
| 6C | Provider stop: code (limit / auth / unavailable) | `ED` → `provider_stop.code` | OK |
| 6C | Provider stop: provider text for "Technical detail" | `ED` → `provider_stop.{type,http_status,message}` | OK |
| 6C | Provider stop: where it stopped | `ED` → `provider_stop.{stage,page,at}` | OK |
| 6C | "11 pages were not tried yet" | `ED` → count `pages[]` with `status == "pending"` (`providerStopLines(stop, pendingPages)`) | DERIVABLE. Caveat: the page that met the refusal also goes back to `pending` (attempts 1). For the exact count use `pending` with `attempts == 0`. |
| 6D | Pages grid thumbnails | `ED.pages[]`, page SVG via `GET /editions/{id}/pages/{n}` → `svg` | OK |
| 6D | "18 of 18 pages ready" | `editionSummary()` | OK |
| 6D | Page beats (touch / keyboard list) | `ED` → `pages[].beat` | OK |
| 6D | Draw one page again | `POST /editions/{id}/pages/{n}/redraw` exists; `api.ts` has no client function | OK (add `redrawPage()` in `api.ts`). Caveats: it calls `resume`, so the whole edition goes to `queued`, and every failed page is retried too. The shelf band shows "Starting" during the redraw. 409 while a run is active. |
| 6D | Redraw cost "about $0.02" | none in the API | DERIVABLE as a constant. `COST_PER_PAGE = 0.0302` is in `preflight.py`. The frontend can use "about $0.03" or G-S2b can return it. |
| 6E | Contents: number, title, PDF pages | `BK` → `sections[].{title,page_start,page_end}` | OK |
| 6E | Contents: word count per section | `BK` → `sections[].word_count` | OK |
| 6E | Contents: manga pages per section ("1–6") | `ED` → `pages[].section_id`, `page_number`; `BK.sections[].id` | DERIVABLE: group pages by `section_id`, take min and max. The ids agree (`finalize` compares both sets). Only after the plan. |
| 6F | Coverage "51 of 54" | `ED` → `coverage.conveyed.length`, `coverage.claims_total` | OK (empty `coverage` until the run ends: the design copy covers this) |
| 6F | Coverage after a provider stop or cancel | `coverage` is `{}` (only `finalize` writes it) | OK by design: "reported when every page has been attempted" |
| 6F | Left out on purpose, with reasons | `ED` → `coverage.omitted_by_plan[].{claim,reason}` | OK for the reason. The claim is an id only. See G-O5. |
| 6F | Lost with failed pages | `ED` → `coverage.lost_to_failed_pages[]` (ids) | OK for ids. Text: G-O5. |
| 6F | Not planned into any page | `ED` → `coverage.not_planned[]` (ids) | OK for ids. Text: G-O5. |
| 6F | Claim text for those three lists | `GET /editions/{id}/pages/{n}` → `claim_details[]` only for claims on that page | GAP G-O5 (the UI can show ids or counts only) |
| 6F | "How it was made": model, no image model, tokens | `ED.policy.{…_model}`, `policy.image_models`, `policy.harness`, `totals` | OK |
| 6 | Cast list | `ED` → `book.cast[]` | OK |
| 7 | PDF viewer: page count, page image | `GET /books/{id}/pdf/info` → `total_pages`, `…/pdf/page/{n}` | OK |
| 8 | Models per step (no edition yet) | Only `ED.policy` (an edition must exist). `Settings` has the values but no endpoint. | GAP G-S1 |
| 8 | Thinking (sent) per step | See 6C row; also no edition on a fresh install | GAP G-S1 |
| 8 | Limits, 2 tries, 4 at a time | `PF.limits` (two of the limits); `page_attempts` is in `ED.policy`; `page_concurrency` is in no response | GAP G-S2 |
| 8 | Version "v0.2" | `FastAPI(version="3.0.0")` in `main.py`, not exposed | GAP G-S2 (the UI can hard-code the version) |
| 8 | Controls to change settings | none | GAP G-O6 (design says read-only in v0.2; no work needed) |
| 9/10 | Sample manga, "read a sample" | none | GAP G-M1 |

## Backend changes needed

Each change is small. "Test" means the test that covers it. "Blocks" means a screen cannot ship as designed without it. "UI can live without" means the screen ships with less.

### S1 scope + plan review

**G-S1a. Scope on Generate, on the estimate and on the limit check (blocks 6A "choose sections").**
- Endpoints: `POST /books/{id}/editions` accepts an optional JSON body `{"section_ids": ["s1","s2"]}` or `{"pdf_page_from": 3, "pdf_page_to": 40}`. `GET /books/{id}/preflight` accepts the same as query parameters (`section_ids=s1,s2` or `page_from`, `page_to`).
- Fields: `Edition.scope` (`{section_ids}` or `{pdf_page_from, pdf_page_to}`), echoed in `edition_view`. `PF` returns the scoped `pdf_pages`, `source_words`, `sections`.
- Where: `library.py` (preflight), `editions.py` (`generate`, calls `check_limits` on the scoped numbers), `documents.py` (field). `generate.py` `_book_payload` must filter `source.units` and `source.sections` to the scope. `BookSource.units` already carry PDF page numbers.
- No body = the whole book, so v0.1 behaviour and the acceptance script do not change.
- Test: `test_preflight.py` (scoped estimate; a 150-page book over the limit becomes inside the limit with one section); `test_generate_journey.py` (scoped run draws only the chosen sections; an empty or unknown scope gives 422).

**G-S1b. Words per PDF page (blocks the page-range fallback; UI can live without it by showing the range without a meter).**
- Endpoint: `GET /books/{id}` adds `page_words: [int, …]` (index = PDF page − 1).
- Where: `library.py` `get_book`, computed from `BookSource.units` (sum of words per `page`). If the units have no per-page word count, count words in the unit text.
- Test: a new test in `test_pdf_source.py` that sums `page_words` and compares with `word_count`.

**G-S1c. Continue with the next section, reusing the cast (UI can live without; do not ship in the first build).**
- Field: `POST /books/{id}/editions` body `{"continue_from": "<edition_id>"}`. The new edition copies the earlier `cast` (and the page looks) into the understanding input, and the page numbers continue.
- This changes the prompt contract with the worker (`BOOK_UNDERSTANDING`), so it is the largest gap. Treat it as a later change; the "Continue" button can start a normal scoped run (G-S1a) until then.
- Test: `test_generate_journey.py`.

**G-S2a. Review the plan before drawing (blocks 6B).**
- Request: `POST /books/{id}/editions` body adds `"review_plan": true` (default false, so the acceptance script stays valid). Stored in `Edition.policy.review_plan`.
- Status: new `EditionStatus` value `awaiting_approval`. In `run_generate_job`, after the page rows are created and before `_mark_timing("drawing_started_at")`, if `policy.review_plan` and the edition was not approved yet, the job ends with status `succeeded` and message "Plan ready", and the edition status becomes `awaiting_approval`. Page rows and beats already exist at that point, so `ED.pages[].beat` and `ED.book.cast` fill the review screen.
- Approve: `POST /editions/{id}/approve` sets `policy.approved = true` and starts a resume job (the same code as `resume`). Resume already reuses the understanding and the plan.
- Stop at review: `cancel` must accept `awaiting_approval` (today it acts on the job; with no running job it does nothing). Set the edition to `cancelled`.
- Effects to handle: `ACTIVE` in `editions.py` and `ACTIVE_EDITION` in `api.ts` must NOT contain the new status (the runner is idle) but `generate()` must not start a second edition while one awaits approval. Add the status to `EditionStatus` in `documents.py` and `api.ts`, to `stageLine()`, and to `shelfStatus()` (a 16th band state, for example "Plan ready to review"). `words.test.ts` pins the strings, so the same pull request updates it.
- Test: `test_generate_journey.py` with a fake worker: with `review_plan` the edition stops at `awaiting_approval` with 0 drawing calls; `approve` completes it; a run without the flag is unchanged.

**G-S2b. Estimate to draw the pages and money spent (blocks the "$0.42" line; UI can live without that line by showing spent only).**
- Field: when `status == "awaiting_approval"`, `edition_view` adds `draw_estimate_usd: {low, high}` = `page_total × COST_PER_PAGE × COST_LOW_FACTOR` and `× COST_HIGH_FACTOR`.
- Where: `preflight.py` (new small function `draw_cost_range(pages)`), `editions.py`.
- Spent so far needs no change: `totals.cost_usd` is already live.
- Test: `test_preflight.py` (the range for 16 pages).

**G-S2c. Omitted claims at review time (UI can live without).**
- Field: `ED.plan_omitted: [{claim, reason}]` read from the plan artifact (`plan.content["omitted"]`), set when `has_plan`.
- Where: `editions.py` `get_edition` (the plan artifact is already loaded there). Pair it with G-O5 so the claim text is shown.
- Test: `test_generate_journey.py`.

### Status and health

**G-S1. `GET /status` (blocks the first-run "no key" block and the Settings server-status block; the shelf and book page work without it).**
- Response: `{ "api": "ok", "runner": {"running": bool, "last_seen": iso|null}, "worker": {"reachable": bool, "key_set": bool, "active_runs": int|null}, "models": [{"step": "understanding"|"plan"|"pages", "model": str, "thinking_asked": str, "thinking_sent": str}], "limits": {…G-S2…} }`.
- Where:
  - `main.py` adds the route (or a new `api/status.py`).
  - Worker: the API calls `GET {agent_worker_url}/readyz` (no token needed) and maps `ready` to `key_set`. A connection error gives `reachable: false`. Use a 2 s timeout. This is a read; it spends nothing.
  - Runner: `run_forever` in `jobs/runner.py` upserts one document (new collection `runner_heartbeat`, field `at`) every poll. The API says `running` when `at` is newer than 3 × `job_poll_seconds` + a margin (the loop also runs while jobs run, so the beat does not stop). Do not use the job lease: it is empty when the runner is idle.
  - Models: from `get_settings()` (`understanding_model`, `plan_model`, `page_model`, and the thinking fields). `thinking_sent` is a rule ("Flash cannot turn thinking off, so `off` is sent as `low`"). Put the rule in one function and cite `goal-runtime.ts`; a wrong rule here would show a false value, so label it "expected" if the rule is not read from the worker.
- Never return the key, the token or the Atlas URL.
- Test: new `test_status.py` with a fake worker app: key set, key missing, worker down; runner heartbeat fresh and stale. Add a guard in `test_static_guards.py` that no secret field name is in the response.

**G-S2. Limits and facts for the Upload and Settings screens (UI can live without; hard-code the numbers).**
- Fields in `/status.limits`: `max_pdf_size_mb`, `max_pdf_pages`, `max_source_words`, `page_attempts`, `page_concurrency`, plus `version` (a string constant, for the footer and Settings).
- Where: same route as G-S1.
- Test: `test_status.py` asserts the values equal `Settings`.

### Timings

**G-T1. PAGE 1 READY time (blocks the result line "Page 1 was ready after 3 min 58 s"; UI can live without by showing `first_page_at` with the words "first page drawn").**
- Field: `timings.page_1_at`. Stamp it in `generate.py` where `first_page_at` is stamped, when `number == 1` (`_mark_timing(edition_id, "page_1_at")`). The `_mark_timing` helper keeps the first value.
- No frontend type change except adding the key.
- Old editions (v0.1 data) have no `page_1_at`; the UI must fall back to `first_page_at`.
- Test: `test_edition_timings.py` (page 1 accepted after page 3 gives `first_page_at` earlier than `page_1_at`).

**G-T2. Types only (not a backend gap).** Add `timings?: Record<string, string>` to `Edition` in `frontend/lib/api.ts`.

**G-T3. Run duration for a resumed run (UI can live without).**
- Problem: `finished_at` is overwritten at the end of each job. A stop at 3 pages, a pause of one hour and a resume gives "Took 1 h 07 min".
- Smallest change: `totals.model_ms` is the sum of model time over parallel calls, not wall time, so it cannot serve. Add `Edition.active_seconds`, increased by the job runner at the end of each job (`finished_at − started_at`). `edition_view` returns it. The UI shows "Took" from `active_seconds` when present.
- Test: `test_edition_timings.py`.

**G-T4. `cancel_requested` in the job view (UI can live without).**
- Field: `job_view` adds `cancel_requested: bool`. The "Stopping after the pages in progress" headline and the disabled "Stopping" button then survive a page reload.
- Where: `editions.py` `job_view` (one line).
- Test: `test_provider_stop.py` style test or `test_generate_journey.py`: press cancel, read `ED.job.cancel_requested`.

### Sample

**G-M1. Sample manga: Four Tales by Hans Christian Andersen (blocks the first-run sample, the landing "Read a sample" and the "estimate vs real run" sentence; the owner may also decide to ship no sample).**
- Data: a fixture committed in the repo, for example `backend/samples/andersen/` with the PDF (Project Gutenberg, public domain), one `library_books` document (status `parsed`), one `book_sources` document, one `editions` document (status `complete`, with `totals`, `timings`, `coverage`, `policy`, `page_total` 18), the two artifacts and 18 `edition_pages` with SVG. Export these from the real v0.1 run so every number on screen is a measured value.
- Endpoint: `POST /samples/andersen` is idempotent. It inserts the documents when the book (by `pdf_hash`) is not on the shelf and returns `{book_id, edition_id}`. `GET /samples` lists the available samples and whether each is installed. The book view gets `is_sample: true` (new field on `LibraryBook`), so the UI can mark it "Sample".
- Spend: none. No worker call is made.
- Showcase variant (read only, no upload): a config flag `PUBLIC_SHOWCASE=1` that makes `POST /upload`, `POST /books/*/editions`, `resume`, `cancel` and `redraw` return 403. Only needed if issue #52 is chosen.
- Test: new `test_samples.py` (install twice gives one book; `GET /editions/{id}` of the sample returns 18 accepted pages; the preflight of the sample book still works). Add a check that the sample files contain no path with `/Users/` and no key.

### Other

**G-O1. Completed with failures but no missing page (UI can live without).**
- Problem: `finalize` sets `completed_with_failures` when a core claim is not conveyed or a section has no claims, even if every page is accepted. The band and headline then say "0 missing".
- Smallest change: in the frontend, if `page_total == pages_accepted` and the status is `completed_with_failures`, use "Drawn, {n} key points left out". The count is `coverage.core_not_conveyed.length`. Note that `ED.coverage` also has `required_not_planned` and `sections_without_claims`, but `LIST.latest_edition` has none of them. For the shelf band the backend must add `latest_edition.pages_failed` (one field in `list_books`) so the shelf can tell the two cases apart. A shelf-only fallback is the plain "Finished with gaps".
- Test: `words.test.ts`; a backend assertion on `list_books`.

**G-O2. Short cost basis text (UI can live without).** `preflight.py` `cost_basis()` says "Pi catalog estimate". Return `basis_short: "Estimate at MiniMax-M3 rates, not a bill."` next to `basis`, and keep the long text for the disclosure. Test: `test_preflight.py`.

**G-O3. Rename and delete book (optional in the design; UI can live without).** `PATCH /books/{id}` (title, author) and `DELETE /books/{id}` (remove the book, source, editions, pages, artifacts, stored PDF and cache). Delete must refuse while an edition is active. Test: new test file. Not part of the first build.

**G-O4. Backend sentences say "BookReel v0.1" (text, UI can live without but the design shows the new text).** `preflight.py` `check_limits()` produces "BookReel v0.1 can adapt books …". Change to "PanelSummary can adapt books up to {n} PDF pages in one run." The 422 body of `generate()` uses the same function. `test_preflight.py` and `words.test.ts` pin the old strings, so the same pull request updates them.

**G-O5. Claim text for the coverage lists (UI can live without by showing the reasons and counts only).**
- Field: `ED.book.claims: [{id, text, importance, section_id}]` next to `cast`, from the understanding artifact that `get_edition` already loads.
- Where: `editions.py` `get_edition` (the `view["book"]` block).
- Size: for a 60-page book the claims list is long, so send it only when `coverage` is not empty or the edition is `awaiting_approval`.
- Test: `test_generate_journey.py`.

**G-O6. Controls to change settings (design marks it as "would sit here, read only").** No work in v0.2.

### Summary by effect on the UI

Blocks a screen:
- G-S1a (6A choose sections)
- G-S2a (6B review the plan)
- G-S1 (first-run "no key" block, Settings server status)
- G-M1 (sample, landing "Read a sample", first-run sentence)

The UI can live without (show less):
- G-S1b, G-S1c, G-S2b, G-S2c, G-S2 (limits can be hard-coded), G-T1 (fall back to "first page drawn"), G-T3, G-T4, G-O1, G-O2, G-O3, G-O4, G-O5, G-O6

## Not gaps, but the build must remember

- Add `redrawPage()` and the `timings` type to `frontend/lib/api.ts`.
- `GET /editions/{id}/receipts` is the only source of `thinking_sent`. It is also the only call that asks the worker for egress hosts, and it can be slow if the worker is down (the code catches the error).
- The shelf `LIST` makes one query per book for the latest edition (N+1). With 24 books it is 25 queries. It works; do not rely on it for a much longer shelf.
- English is not checked by the API. The upload copy must say "English" as advice, not as a check.
- `uploaded` and `parsing` look the same on the shelf ("Reading the PDF"); this is as designed.
- I did not run the app, read `backend/.env` or `frontend/.env.local`, call MiniMax, or open a port.
