# T3: v0.1 scope for large books, preflight and latency

Date: 2026-10-09. Branch: `t3/scope-latency`. Decisions: D19 and D20 in `docs/decisions.md`.
Issues: #4 (chapter scope and project memory) and #13 (large books, cost and time preflight).

Every number below was measured by this track from a file named in the text, or comes from
`docs/rebuild/ACCEPTANCE.md`. The load average is given with each timing that this track measured.

## 1. Decision

v0.1 has two things for large books:

1. A size limit. Generate refuses a book over the limit.
2. A preflight. It shows the size, the limits, and a range for pages, cost and time, before the user starts Generate.

Chapter-scoped generation, resumable project memory and chunked continuation move to v0.2.

### Why scope is not in v0.1

- The whole book goes into one understanding call. The call has no scope input.
  The understanding is the base of the plan and of every page. A scope needs its own understanding.
- A scope needs a table of contents that the user can pick from. The parser makes sections, and
  the section titles of the test books are good. But the section list for a PDF without an outline
  comes from font-size guesses (D14). A wrong cut would break the source grounding, and that is the
  core promise of the product.
- A second scope must keep the same cast, the same look of each character and the same claims.
  That is "project memory". It needs a stored, versioned understanding, a merge rule and a rule
  for a character that crosses scopes. None of these exists in the rebuilt path.
- A scope that is cheap to build only by skipping these parts would give two editions of one book
  that do not match. This is a quiet wrong result, and D11 forbids it.
- The size limit and the preflight solve the real v0.1 problem: the user must not pay 25 minutes
  and a failed understanding for a book that is too large.

## 2. Limits and their evidence

The parser measured these books (`parse_pdf`, load average 5 to 6, 0.1 to 0.3 s each):

| Book | PDF pages | Words | Sections | Units |
|---|---|---|---|---|
| `happy-prince-and-other-tales.pdf` (acceptance book) | 68 | 16,159 | 5 | 35 |
| `civil-disobedience.pdf` | 34 | 9,339 | 3 | 20 |
| `happy-prince-two-tales.pdf` (Phase 0) | 26 | 5,794 | 2 | 13 |
| `final/andersen-four-tales.pdf` | 22 | 4,775 | 4 | 10 |

Understanding runs on the 16,159-word book (all with the shipped configuration: M3, thinking low):

| Run | Understanding | Share of the 25-minute timeout |
|---|---|---|
| 4 | 259 s | 17 % |
| 6 | 625 s | 42 % |
| 3 | about 660 s | 44 % |
| 8 | 1,166 s (31 output tokens/s that hour) | 78 % |

Other facts:

- The understanding goal limits are 64,000 output tokens per turn, 16 turns, and 25 minutes
  (`apps/agent-worker/src/goals/book-understanding.ts`, read only).
- Phase 0 (5,794 words): 78,692 output tokens in 472 s (167 tokens/s, 15 turns, many
  `revise_understanding` patches). Run 8: about 36,000 output tokens in 1,166 s.
  The output size does not follow the word count. It follows the number of revision turns.
- Run 5 (16,159 words, a stricter guard) wrote about 100,000 output tokens and timed out
  at 18 minutes. The guard was changed, but this run shows the failure mode.
- The worker accepts up to 250,000 words in one pass (`MAX_WORDS_SINGLE_PASS`). That figure is a
  parse guard. It is not a tested limit.

Chosen limits (configuration in `backend/app/settings.py`; environment `MAX_PDF_PAGES`, `MAX_SOURCE_WORDS`):

| Limit | Value | Rule |
|---|---|---|
| `max_source_words` | 17,500 | the largest tested book (16,159) plus 8 % |
| `max_pdf_pages` | 75 | the largest tested book (68) plus 10 % |

Safety margin, stated honestly:

- The margin is small and it points upward from the tested size. Only one book of this size was
  run, and it was run four times. Evidence for a larger book does not exist.
- Words are the real driver. Pages guard against a PDF that has few words per page.
- At the slowest understanding speed measured (0.082 s per word, from the Phase 0 run),
  a book at the word limit needs 1,435 s. This is 96 % of the 1,500 s timeout. A unit test
  (`test_default_limits_admit_the_largest_tested_book_and_stay_under_the_timeout`) fails if the limit
  or the timeout change so that this no longer holds.
- A slow hour can still time out the understanding of a book that is inside the limits. The edition
  then fails with a visible reason (D11), and a second attempt runs. The limits do not remove this risk.
  The preflight "high" figure shows it.
- The 60 MB upload limit stays. Upload accepts every parsed PDF. Generate refuses a book over a limit
  with HTTP 422, and it creates no edition, no job and no model call.

The refusal text is, for example: "This book has 20,000 words. BookReel v0.1 can adapt books up to
17,500 words in one run. You can still read the PDF here. Longer books are planned for a later version."

## 3. The preflight

`GET /books/{book_id}/preflight` returns this shape. Field names are fixed (T5 builds the UI on them).
The endpoint answers 404 for an unknown book and 409 for a book that is not parsed.

```json
{"book_id": "...", "pdf_pages": 26, "source_words": 5794, "sections": 2,
 "estimated_manga_pages": {"low": 14, "high": 22},
 "estimated_cost_usd": {"low": 0.42, "high": 0.85, "basis": "Pi catalog estimate on MiniMax-M3 rates from measured runs; not a bill. MiniMax speed varies, so time is the weakest figure."},
 "estimated_minutes": {"first_page": {"low": 3, "high": 19}, "total": {"low": 6, "high": 48}},
 "limits": {"max_pdf_pages": 75, "max_source_words": 17500},
 "within_limits": true, "blocking_reasons": []}
```

If the policy models are not all `MiniMax-M3`, the `basis` text adds that the numbers were measured
on M3 and not measured again for the current policy. This is the case after T0 changes the model.

### The model (`backend/app/preflight.py`)

All inputs are the parsed size: words `W`, sections `S`. `kw = W / 1000`.

| Figure | Rule |
|---|---|
| Manga pages | low = `2.5 * kw`, high = `4.0 * kw`. Both are bounded by the plan goal's page budget (`pageBudget` in `adaptation-plan.ts`): minimum `max(2 * S, W / 650, 3)`, maximum `max(min + 2, min(140, W / 260))`. |
| Cost (usd) | `0.0125 * kw + 0.0302 * pages`, times 0.85 for low (at the low page count) and 1.15 for high (at the high page count). |
| Understanding | `0.016 * W` s (fast hour) to `0.082 * W` s (slow hour). |
| Plan | 60 s to 450 s (this includes a slow-hour wait). |
| First page after the plan | 35 s to 200 s. |
| Drawing | 16 s to 30 s per page with 4 pages in parallel, plus up to 1,100 s for one page that fails twice (high only). |
| First page | understanding + plan + first page. |
| Total | first page + (pages - 1) * seconds per page (+ the failed-page tail for high). |

Minutes round outward (low down, high up). Cost rounds to cents.

### Fit data

| Run | Words | Manga pages | Cost (usd) | First page (s) | Finish (s) |
|---|---|---|---|---|---|
| Phase 0, two tales | 5,794 | 16 | 0.81 | 795 | 2,115 |
| Civil Disobedience | 9,339 | 29 | 0.73 | 569 | not recorded |
| Acceptance run 3 | 16,159 | 60 | 2.17 | 787 | 2,502 |
| Acceptance run 4 | 16,159 | 58 | 2.02 | 397 | 1,578 |
| Acceptance run 6 | 16,159 | 56 | 1.66 | 813 | 1,716 |
| Acceptance run 8 | 16,159 | 46 | 1.65 | 1,823 | 2,910 |

Runs 1 and 2 are not in the fit. They used the understanding with thinking off, which D13 replaced.
Cost is the sum of the receipts (Pi catalog estimate, not a bill).

### Error on the known runs

The ranges below come from `estimate()` and are verified for every run in the table by
`test_ranges_contain_the_measured_run`.

| Run | Pages: range / actual | Cost: range / actual | First page (min): range / actual | Total (min): range / actual |
|---|---|---|---|---|
| Phase 0 | 14-22 / 16 | 0.42-0.85 / 0.81 | 3-19 / 13.2 | 6-48 / 35.2 |
| Civil Disobedience | 23-36 / 29 | 0.69-1.38 / 0.73 | 4-24 / 9.5 | 9-60 / not recorded |
| Run 3 | 40-62 / 60 | 1.20-2.39 / 2.17 | 5-33 / 13.1 | 16-82 / 41.7 |
| Run 4 | 40-62 / 58 | 1.20-2.39 / 2.02 | 5-33 / 6.6 | 16-82 / 26.3 |
| Run 6 | 40-62 / 56 | 1.20-2.39 / 1.66 | 5-33 / 13.6 | 16-82 / 28.6 |
| Run 8 | 40-62 / 46 | 1.20-2.39 / 1.65 | 5-33 / 30.4 | 16-82 / 48.5 |

The central cost fit (before the 0.85 and 1.15 factors) is off by +46 % (Phase 0, which paid for a
78,692-token understanding and two failed pages) to -26 % (Civil Disobedience) on single runs.
That is why the cost range is wide.

Limits of this model:

- The check is in-sample. The ranges were fitted to these six runs, and the runs come from three
  books. There is no hold-out run. The ranges are an envelope of what was seen, widened outward.
  They are not a confidence interval.
- Five of the six runs use the 16,159-word book. The model is weakest for a book above that size.
- The time range is very wide (for example 6 to 48 minutes). This is the honest width. MiniMax
  speed varied 31 to 324 output tokens/s across the runs.
- Cost depends on the model. After T0 changes the policy model, the cost basis is not valid until
  a run measures it again.

## 4. Latency: the critical path

### Measured: Phase 0 baseline (2026-10-09, `p0-baseline/journey-report.json` and `export/receipts.json`)

Book: 26 PDF pages, 5,794 words, 2 sections. All calls on MiniMax-M3. Load average 2.72 at the
start and 6.45 at the end of the run (shared Mac).

Times are seconds after the journey started. Generate was clicked about 3 s after that.

| Step | Start | End | Duration | Evidence |
|---|---|---|---|---|
| Understanding | 6 | 479 | 472 s | receipt: 78,692 output tokens, 15 turns, $0.18 |
| Plan | 479 | 714 | 235 s | receipt: 16,129 output tokens, 16 pages |
| First page accepted | 714 | 768 | 54 s | stage log: "drawing 1/16" at 767.9 s |
| 15 pages accepted | 714 | 1,313 | 599 s | stage log: "drawing 15/16" at 1,313.3 s |
| Page 12, attempts 1 and 2 | about 977 | 2,090 | 611 s + 502 s | receipts: both failed, 59,888 and 48,429 output tokens |
| Finished | | 2,115 | | journey report |

Findings:

1. The first page was readable at 768 s. The journey report says 795 s. The journey measures the
   moment its own check ran, and at that time 3 pages were ready. The report overstates the first page
   by 27 s. The new `timings.first_page_at` removes this problem.
2. The understanding and the plan take 707 s (33 % of the run). Nothing can start before them. The plan
   needs the full understanding, and a page needs the plan.
3. There is no idle gap. The time from plan end to the first accepted page is 54 s. The shortest
   successful page call in this run took 34 s, and the first page took 54 s. Page rows are written in a
   short loop before the first call, which takes milliseconds.
4. Pages run in reading order. A test (`test_latency.py`) verifies that pages 1 to N start first and that
   no later page starts early. The first page is already scheduled first.
5. The tail is a failed page. All other pages were ready at 1,313 s. The edition then waited 777 s for
   the second attempt of page 12. This is 37 % of the run. The sum of the 15 successful page calls is
   1,891 s (mean 126 s, range 34 to 313 s). With 4 slots, that is 473 s of work. The drawing took 599 s
   because the failing page held one slot from about 977 s.
6. Two attempts at page 12 used 108,317 output tokens and $0.20. Attempt 1 stopped at the submit
   limit (6 submits, 11 turns). Attempt 2 ran into the output token limit without a submission (5 turns).
   Neither reached the 12-minute goal timeout.

### Measured: acceptance book, 68 pages (`docs/rebuild/ACCEPTANCE.md`)

| Run | Pages | Understanding | Plan + first page | First page | Finish |
|---|---|---|---|---|---|
| 4 | 58 | 259 s | 138 s | 397 s | 26.3 min |
| 6 | 56 | 625 s | 188 s | 813 s | 28.6 min |
| 8 | 46 | 1,166 s | 657 s | 1,823 s | 48.5 min |

The understanding is 61 % to 77 % of the time to the first page (Phase 0 and runs 4, 6 and 8).
Drawing takes about 17 s to 29 s of wall time per page with 4 in parallel.

### Wins evaluated

| Idea | Result |
|---|---|
| Schedule page 1 first | Already true. Verified by test. |
| Remove an idle gap between plan and first call | No gap exists (54 s is the first page's own time). |
| Dispatch in reading order | Already true. Verified by test. |
| Store the "first page readable" moment | Implemented (section 5). |
| Write the page rows in one bulk call | Not done. The saving is milliseconds. The risk is not zero. |
| Let a retry give up its slot and queue behind other pages | Not done. In Phase 0 it would save about 25 s of 2,115 s. It changes the order of attempts and the idempotent run ids. |
| Shorter wall-clock limit for a page attempt | Not done here. It lives in `apps/agent-worker/src/goals/manga-page.ts` (12 minutes), outside this track. It would cut the 777 s tail only for a slow attempt. The two attempts of page 12 ended before that limit (finding 6), so a shorter limit would need a value below 8 minutes, and it trades the chance that a slow page still succeeds. The orchestrator must decide. |

Result: no scheduling change is safe and worth doing in `generate.py` in v0.1. The only change is
the timing record.

## 5. What this track implemented

| Path | Change |
|---|---|
| `backend/app/settings.py` | `max_pdf_pages` (75) and `max_source_words` (17,500). |
| `backend/app/preflight.py` (new) | The fit data, the estimator, the limit check and the preflight builder. |
| `backend/app/api/library.py` | `GET /books/{book_id}/preflight`. |
| `backend/app/api/editions.py` | The Generate guard: HTTP 422 over a limit, before any edition or job exists. |
| `backend/app/jobs/generate.py` | `_mark_timing`. It stores `timings.generate_started_at`, `timings.drawing_started_at` and `timings.first_page_at` on the edition. The first value stays after a resume. No receipt line changed. |
| `backend/tests/test_preflight.py` (new) | Estimator against the six runs, limits, configuration, shape, endpoint, Generate refusal (the fake worker gets no call, no edition, no job). |
| `backend/tests/test_latency.py` (new) | Reading-order dispatch with 1 and 3 slots. Timing order. A resume keeps the first values. |
| `docs/decisions.md` | D19 and D20. |

Mutation checks (private `git archive` copy, scratch dir): removing the Generate guard, reversing the
dispatch order, overwriting the timings and changing a cost coefficient each make a test fail.

### Open points for the orchestrator (outside this track's paths)

- `edition_view` in `backend/app/api/editions.py` does not show `timings` yet. The values are in the
  database (`editions.timings`). Add `"timings": ...` to `edition_view` so that the UI and the journey
  can read them. The `Edition` model in `backend/app/documents.py` can get a `timings` field at the
  same time. The stored values survive `edition.save()` without it (verified).
- The acceptance journey should measure "page 1 readable" from `timings.first_page_at`.
- The frontend must show `blocking_reasons` when Generate answers 422 (the `detail` is a plain string,
  which `lib/api.ts` already reads).

## 6. Deferred to v0.2

| Item | Reason |
|---|---|
| Chapter or section scope chosen by the user | Needs a table of contents the user can trust, and an understanding per scope. |
| Resumable project memory (cast, looks and claims kept across sessions) | Needs a stored, versioned understanding and a merge rule. |
| Chunked continuation ("3 chapters today, continue next week") | Depends on both items above. |
| Automatic scope planner for 300-page books | Depends on all of the above. |
| A larger limit | Needs runs of larger books with measured understanding time. |
| A shorter wall-clock limit for a failing page attempt | Measured tail of 777 s in Phase 0. Needs a quality measurement first. |

### Text to paste when closing #4

> Closed for v0.1 by decision D19 (docs/decisions.md). v0.1 does not have chapter or section
> scope. The whole book goes into one understanding call, and a scope needs its own understanding,
> a table of contents the user can pick from, and a rule for characters that cross scopes.
> None of these exists in the rebuilt path, and a wrong cut would break source grounding.
> v0.1 has a size limit (75 PDF pages, 17,500 words) and a preflight instead. The work moves to
> v0.2 in the issue "v0.2: chapter scope and resumable project memory".

### Text to paste when closing #13

> Closed for v0.1 by decisions D19 and D20 (docs/decisions.md; details in docs/launch/T3-scope.md).
> Done in v0.1: Generate refuses a book over 75 PDF pages or 17,500 words with HTTP 422 and a plain
> reason. `GET /books/{id}/preflight` shows size, limits and low and high estimates of pages, cost and
> time before Generate. The estimates are fitted to six measured runs and the basis text says they are
> not a bill. Not done and moved to v0.2: chunked continuation and an automatic scope planner for books
> of 300+ pages.

### Text for the new v0.2 issues

> Title: v0.2: chapter scope and resumable project memory
> Body: Let the user pick sections of a book to adapt. Store the understanding as a versioned
> project memory (cast, looks, claims) so that a later scope keeps the same characters. Needs: a
> reliable table of contents, an understanding per scope, a merge rule, and a test that two scopes of
> one book keep the same cast. Replaces the open parts of #4.

> Title: v0.2: chunked continuation and larger books
> Body: Adapt a book in chunks ("3 chapters today, continue next week"). Raise the size limit only
> after runs of larger books measure the understanding time. Consider a shorter wall-clock limit for a
> page attempt: in the Phase 0 run one page that failed twice made the edition wait 777 s (37 % of the
> run). Replaces the open parts of #13.
