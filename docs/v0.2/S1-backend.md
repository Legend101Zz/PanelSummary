# S1 backend: scope, plan review, status, timings

This page describes the API that track S1 added for v0.2. It follows `PLAN.md` section 3.3 and `API-GAPS.md`.
The rule for every change: **no body and no query keep the v0.1 behaviour.** `journey.mjs` and the live lane do not change.

Decisions: D19 (amended), D20 (amended), D24 (new), D25 (new) in `docs/decisions.md`.

## 1. Scope (issue #40)

A scope is a part of the book. It is one of:

| Form | Stored on the edition as |
|---|---|
| Sections | `{"section_ids": ["s1", "s3"]}` |
| PDF page range | `{"pdf_page_from": 3, "pdf_page_to": 40}` (1-based, inclusive) |
| Whole book | `null` |

Rules:
- The D19 limits (75 PDF pages, 17,500 words) apply to the scope. The values do not change.
- With sections, the pages are the pages that the chosen sections cover. The words are the words of their source units.
- With a page range, a source unit is in the scope when its pages overlap the range. No text in the range is lost, and no unit is cut. A unit at the edge can bring a few words from outside the range.
- Sections are used in book order, not in request order. A repeated id counts once.

### `GET /books/{id}/preflight`

Query: `?section_ids=s1,s2` or `?page_from=3&page_to=40`. Without a query the answer is the v0.1 answer for the whole book, with `scope: null` added.

```text
GET /books/6aca4207a63247492bc59192/preflight?section_ids=s1
{
  "book_id": "6aca4207a63247492bc59192",
  "scope": {"section_ids": ["s1"]},
  "pdf_pages": 14, "source_words": 3471, "sections": 1,
  "estimated_manga_pages": {"low": 8, "high": 13},
  "estimated_cost_usd": {"low": ..., "high": ..., "basis_short": "Estimate at MiniMax-M3 rates, not a bill.", "basis": "..."},
  "estimated_minutes": {...}, "limits": {...},
  "within_limits": true, "blocking_reasons": []
}
```

(The page and word numbers are from the smoke run on `happy-prince-two-tales.pdf`.)

### `POST /books/{id}/editions`

Optional JSON body. Unknown keys give 422.

```json
{"section_ids": ["s2"], "review_plan": true}
{"pdf_page_from": 3, "pdf_page_to": 40}
```

| Case | Answer |
|---|---|
| No body, or `{}`, or only `review_plan` | The whole book. The v0.1 limit check on the book. |
| A valid scope inside the limits | 200. The edition stores `scope`. |
| Unknown section id | 422 `This book has no section 's9'.` |
| Empty scope (`section_ids: []`, or a range with no text) | 422 `The scope is empty. ...` |
| Sections and a range together | 422 `Choose sections or a page range, not both.` |
| Only one end of a range | 422 `A page range needs both a first page and a last page.` |
| First page after last page | 422 `The first page of the range comes after the last page.` |
| Range outside the book | 422 `The page range must be inside the book: pages 1 to N.` |
| Scope over a limit | 422 `This selection has 20,000 words. PanelSummary can adapt up to 17,500 words in one run.` and the same for pages, then `Choose fewer sections or a shorter page range.` |

A 422 creates no edition and no job, and the worker gets no call. If an edition is active or waits for a plan review, the answer is that edition with `already_running: true`, as in v0.1.

Every edition view (`POST`, `GET /editions/{id}`, `GET /books/{id}/editions`) has `scope`. The Generate job builds the book from the scoped sections and units only. A resume uses the same scope. Coverage (`sections_without_claims`) is judged on the scope.

### `GET /books/{id}`

New field `page_words: number[]`. Index = PDF page - 1. The length is the page count of the PDF. The sum is `word_count`. The parser keeps the page span of a unit, not of each paragraph, so a unit across several pages is spread evenly over them. A page with no body text is 0. The array is empty while the book is not parsed.

## 2. Plan review (issue #49)

Setting: `PLAN_REVIEW_DEFAULT` (default `false`). A request with `review_plan` true or false overrides it. The choice is in `policy.review_plan`.

Flow:
1. Generate with `review_plan: true`. The job reads the book, makes the plan, creates the page rows and the beats. It then ends `succeeded` with the message `Plan ready to review: N pages`.
2. The edition status is `awaiting_plan_review`. No page call was made.
3. `POST /editions/{id}/approve-plan` records `policy.plan_approved` and queues a resume job. The job reuses the understanding and the plan, and draws the pages. 409 when the edition does not wait.
4. Or `POST /editions/{id}/cancel`. The edition becomes `cancelled`. A new Generate can start.

While the edition waits:
- `draw_estimate_usd {low, high}` is in the edition view (`page_total` x the page cost, with the low and high factors). Otherwise it is `null`.
- `GET /editions/{id}` has `plan_omitted [{claim, reason}]` (claim ids; the text is in `book.claims`). Otherwise `null`.
- Spent so far is `totals.cost_usd`.
- `POST /books/{id}/editions` returns this edition with `already_running: true`. `resume` and page redraw give 409.
- `awaiting_plan_review` is not in `ACTIVE` (the runner is idle) and must not be in `ACTIVE_EDITION` in `api.ts`.

## 3. `GET /status`

```json
{
  "api": "ok", "version": "0.2.0",
  "runner": {"running": true, "last_seen": "2026-10-10T13:47:58.976000+00:00"},
  "worker": {"reachable": true, "key_set": true, "replay": false},
  "models": [{"step": "understanding", "model": "MiniMax-M3.1-Flash-Preview", "thinking": "low"},
             {"step": "plan", "model": "...", "thinking": "off"}, {"step": "pages", "model": "...", "thinking": "off"}],
  "limits": {"max_pdf_size_mb": 60, "max_pdf_pages": 75, "max_source_words": 17500, "page_attempts": 2, "page_concurrency": 4},
  "plan_review_default": false
}
```

- `runner.running`: the runner writes one heartbeat document (`runner_heartbeat`) on every poll. It is running when the last beat is younger than 3 polls + 5 s (9.5 s at the default poll of 1.5 s). The job lease is not used.
- `worker`: the API calls the worker's `/readyz` (free, no token, 2 s timeout). `ready` there is `key_set`. The worker needed no change: its `/readyz` already says `ready` only when `MINIMAX_API_KEY` is set. No answer in 2 s, or a connection error: `reachable: false`. An answer without `ready: true`: `key_set: false`.
- `worker.replay`: true when `/readyz` says `ready: true` and `replay: true` (the replay worker, F1). The replay worker uses no key, so `key_set` is then `false`. The screens show "Replay worker: no MiniMax key is used; pages come from a saved run." and never "key set". Any other answer: `replay: false`. A new field is appended; `reachable` and `key_set` keep their meaning.
- `key_set` cannot say that MiniMax accepts the key. Do not show "key valid".
- `models[].thinking` is the level asked. The level sent is on the receipts.
- The response never has a key, a token or a database URL.

## 4. Timings and small fields

| Field | Meaning |
|---|---|
| `timings.page_1_at` | Page 1 accepted. The first value stays. `first_page_at` is the first accepted page of any number. v0.1 editions have no `page_1_at`: fall back to `first_page_at`. |
| `active_seconds` | Sum of the run times of the edition's jobs. The pause before a resume does not count. `null` when not recorded (v0.1 editions): fall back to `finished_at - created_at`. |
| Job `cancel_requested` | True after Stop, until the job ends. It survives a reload. |
| `latest_edition.pages_failed` | In `GET /books`. Tells "all pages drawn, key points left out" from "pages missing". |
| `estimated_cost_usd.basis_short` | `Estimate at MiniMax-M3 rates, not a bill.` The long `basis` stays for the disclosure. |
| `book.claims [{id, text, importance, section_id}]` | In `GET /editions/{id}`, when `coverage` is set or the plan waits. |

## 5. Frontend types and calls (`frontend/lib/api.ts`)

Types: `EditionStatus` has `awaiting_plan_review`; `Edition.timings`, `scope`, `active_seconds`, `draw_estimate_usd`; `EditionDetail.plan_omitted`; `EditionBook.claims`; `Job.cancel_requested`; `EditionSummary.pages_failed`; `Preflight.scope` and `basis_short`; `BookDetail.page_words`; `ServerStatus`; `GenerateBody`; `EditionScope`; `Timings`.
Calls: `getStatus()` (null when the server cannot be reached), `getPreflight(bookId, scope?)`, `generateEdition(bookId, body?)` (the call without a body still works), `approvePlan(editionId)`, `redrawPage(editionId, n)`.

`frontend/lib/words.ts`: the new status reads `Plan ready to review` in `stageLine` and on the shelf. Family: **Not started** (outline band, tone `quiet`). Reason: "Needs you" has the problem icon and the red tone in `SCREENS-AND-STATES.md`, and a plan that waits is not a fault. The U2 track may change the family if the design asks for it; `words.test.ts` pins the text and the tone.

## 6. Tests

| File | What it verifies |
|---|---|
| `tests/test_scope.py` | Cutting a book to sections or pages; every bad scope; `page_words` sums. |
| `tests/test_preflight.py` | Basis text and shape; the draw cost range for 16 pages; a 150-page book is outside the limit and one section is inside; scoped numbers; 422 on bad scopes; `page_words` in `GET /books/{id}`. |
| `tests/test_generate_journey.py` | A scoped run sends only the chosen sections to the worker; bad scopes create nothing; a scope over the limit; plan review stops with 0 drawing calls, approve completes with only the pages paid for; cancel at review; the server default; `cancel_requested`. The v0.1 journey test is unchanged. |
| `tests/test_status.py` | Worker with key, without key, down, without `/readyz`, slow; runner heartbeat fresh, stale and missing; models and limits equal the settings; no secret field name or value. |
| `tests/test_edition_timings.py` | `page_1_at` after `first_page_at` when page 1 is slow; `active_seconds` across a resume. |
| `tests/test_static_guards.py` | `api/status.py` never reads the token, the database URL or the key. |

One line of the v0.1 fake worker changed: it asked for at least 2 source units in the understanding input. A scoped run of one short section has one unit, so the check is now at least 1.

## 7. What the UI can rely on

- Every v0.2 field above is present in every v0.2 answer. Old editions miss `page_1_at`, `active_seconds` (null) and `scope` (null).
- A waiting edition always has its page rows, so the review screen reads `pages[].beat` and `book.cast`.
- A 422 from Generate or preflight has a plain `detail` string.

## 8. Not done in this track

- **"Continue with the next section" and project memory (G-S1c, #40 part 2): not built.** `continue_from` does not exist. The UI can start a normal scoped run for the next section.
- Rename and delete a book (G-O3), the controls to change settings (G-O6): not built.
- Samples (G-M1): track S2.
- A live run was not made. Nothing here called MiniMax.
- `page_words` is an estimate by page span for units that cross pages, as described above.
