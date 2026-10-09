# F2: integration of the merged tracks

Date: 2026-10-09. Branch: `fix/integration` (from `release/v0.1` at a53378e).
No model call was made. Stack: ports 3190, 8090, 8799, 27029; stopped at the end.
Load average at the time of the screenshots: 3.46 5.99 6.70.

## What was wrong

1. The API did not return the stage timings. T3 stores `timings.generate_started_at`, `timings.drawing_started_at` and `timings.first_page_at` on the edition document, but `edition_view` did not send them. `Edition` had no field for them.
2. The journey report had one clock only: its own polling (3-second steps). In Phase 0 it said 795 s for page 1. The database said 768 s.
3. The journey allowlist of models did not contain `MiniMax-M3.1-Flash-Preview`. A Flash run would fail the check "every model call is on an allowed MiniMax model", although the backend allows Flash.
4. Preflight panel: the cost basis text ends with a full stop, and the page added another one ("for this policy.. Real times"). The note that the numbers were measured on M3 was joined to the cost sentence and hard to see. The panel did not show the limit for a book that is inside it.
5. The refusal and the preflight pair correctly (see below). One gap: the disabled Generate button had no link to the reason.

## What changed

- `backend/app/documents.py`: `Edition.timings` (optional, default empty).
- `backend/app/api/editions.py`: `edition_view` returns `timings` as ISO strings. A key is absent until it happened. Test: `backend/tests/test_edition_timings.py`.
- `scripts/acceptance/journey.mjs`: `journey-report.json` has two clearly named groups.
  - `db_timings`: from the edition document. `generate_to_first_page_accepted_s` and `generate_to_finished_s` (from `created_at`), plus `queue_wait_s`, `generate_to_drawing_started_s`, `job_start_to_first_page_accepted_s` and the raw stamps.
  - `timings.observed_generate_to_first_page_s` and `timings.observed_generate_to_finished_s`: the journey's own polling. The old names `generate_to_first_page_s` and `generate_to_finished_s` stay with the observed values for older readers.
  - The Flash model is on the allowlist. No other check or selector changed.
- `frontend/lib/words.ts`: `splitCostBasis` separates the model note from the cost basis and removes the double full stop.
- `frontend/app/books/[id]/page.tsx`: the panel shows the limit and "This book is inside the limit", the cost basis, and (when the policy is not all M3) a separate "Note on the models" paragraph. The disabled Generate button has `aria-describedby` on the blocked panel.

## The real pairing (T3 backend with T5 frontend)

- Stack limits: `MAX_PDF_PAGES=30`, `PAGE_MODEL=MiniMax-M3.1-Flash-Preview`.
- `GET /books/{id}/preflight` for the 34-page book: `within_limits: false`, two `blocking_reasons`. The 26-page book: `within_limits: true`.
- `POST /books/{id}/editions` for the 34-page book: HTTP 422, body `{"detail": "This book has 34 PDF pages. BookReel v0.1 can adapt books up to 30 pages in one run. You can still read the PDF here. Longer books are planned for a later version."}` (a plain string). `detailText` in `frontend/lib/api.ts` reads it. No edition and no job existed afterwards (`GET /books/{id}/editions` returned `[]`).
- Generate is disabled for the 34-page book. React ignores a click on a disabled button, so the refusal was reached with the preflight request blocked in the browser (button enabled, as for an older backend). The real backend answered 422 and the page showed: "Generate did not start. This book has 34 PDF pages ... Nothing was started and nothing was spent."
- Generate was never clicked on a book inside the limits.

## Screenshots (scratch dir `/Volumes/Mrigesh SSD/Book-Reel-scratch/launch/f2-impl/shots/`)

Prefix `before-` is the state before the frontend changes, `final-` the last state.
- `final-ok-desktop.png`, `final-ok-phone.png`: book inside the limits (limit line, estimates, cost basis, model note).
- `final-over-desktop.png`, `final-over-phone.png`: book over the limit, Generate disabled, reasons shown.
- `final-over-refused-desktop.png`, `final-over-refused-phone.png`: the 422 refusal text after the click.
- `before-ok-desktop.png` shows the double full stop.

## Limits of this check

- This is a local stack with a fake low limit, not a live journey. Timings in `db_timings` are proven by the API test with fixed stamps, not by a live run.
- The model note depends on the T3 sentence "The current policy uses ...". If T3 changes that wording, the note is shown inside the cost basis text (no information is lost).
