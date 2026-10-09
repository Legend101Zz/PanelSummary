# T5: the product surface

Track T5 of the v0.1 launch. Branch `t5/product-surface`. Only `frontend/**` and this page changed.

All screenshots are in `/Volumes/Mrigesh SSD/Book-Reel-scratch/launch/t5-impl/`. They are at 1440x900 (`-d`) and 390x844 (`-m`). Load average when the work ran: about 6 to 8 (`uptime`). No timing in this page is a measurement. The elapsed times in the screenshots come from seeded data.

## How this was verified

- Before: the orchestrator's finished edition on port 3100 (read only), in `before/orch/`. The edition has 15 accepted pages and 1 failed page.
- After: the code in this branch on a private stack (ports 3150, 8050, 27025, database `launch_t5`). The stack has seeded editions, with no model call. The states are: reading, planning, drawing, cancelled, failed, and finished with failures. The screenshots are in `before/own/` and `after/final/`, `after/own/`, `after/own2/`, `after/own3/`, `after/pre/`.
- The after screenshots of the orchestrator's edition do not exist. Port 3100 serves the main checkout, not this branch.
- The preflight screenshots use a mocked `GET /books/{id}/preflight` (browser route). The backend track T3 had not delivered the endpoint here. The 422 screenshot uses a mocked `POST`. The real `POST` never ran.

## Problems found

1. No estimate before Generate. A reader started a run without knowing its cost or time.
2. Progress showed one line and a bar. It had no step list, no elapsed time, and no wait hint during the long reading and planning steps.
3. Page 1 had no direct link while the run continued. Only the Start reading button showed.
4. Failure reasons were raw worker text. An example is "output cut off at the token limit without a submission".
5. A finished run with failed pages looked like a normal finished book. The cover band was black, the same as a complete book. The shelf said "15 of 16 pages drawn" in the same style.
6. Errors from Generate showed only the server text. A 422 with an object or a list as `detail` showed "The server answered 422".
7. A failed page in the reader had no link back to the book, and no count of the other failed pages.
8. A load error in the reader had no action.
9. At 390 px: no horizontal scroll on any screen. But the text links on the book page (Your shelf, contents pages, About) were 22 to 29 px high.

## What changed

- `frontend/lib/api.ts`: `Preflight` type and `getPreflight()`. It returns `null` on 404 or any failure, so the panel is hidden and Generate still works. `detailText()` reads a string, a list, or an object `detail` (message, `blocking_reasons`, `reasons`).
- `frontend/lib/words.ts`: `plainReason()` (plain words for known raw failures, the raw text kept as a technical detail; a full sentence is kept as it is), `formatElapsed()`, range wording for the preflight, and a red "N of M drawn, K missing" shelf band for `completed_with_failures`.
- `frontend/lib/hooks.ts`: `useNow()` for the running clock.
- Book page (`frontend/app/books/[id]/page.tsx`):
  - Panel "Before you start": manga pages, time to page 1, time to the end, cost estimate, and the basis. It shows only before the first Generate.
  - If `within_limits` is false, Generate is off. The panel shows `blocking_reasons`, or the limits if the list is empty, and a link to add a shorter book.
  - A refused Generate shows what happened and what to do next. It states that nothing was started.
  - Progress: the stage in plain words, three steps (reading, planning, drawing), "N pages drawn of M", the running time ("Running for ..."), and "Took ..." at the end. A wait hint shows during reading and planning. A link "Page 1 is ready. Read it now" shows as soon as page 1 is accepted.
  - Failed pages: each one has a link to the page, a plain reason, and the technical detail. A finished run with failures reads "Finished, but N pages are missing" in red. A hint points to Retry failed pages.
- Reader (`frontend/components/reader/Reader.tsx`): a failed page shows the plain reason, the technical detail, the number of failed pages, Retry failed pages, and Back to the book. A load error has a Reload button. A retry error says what happened.
- 44 px tap targets on the book page at phone width.
- Seed scripts accept a private `launch_t5*` database on a local port other than 27018 (`SEED_MONGODB_URL`, `SEED_DB_NAME`). The old defaults and the refusal of other targets stay.

The reader still shows the persisted SVG. No page layout code changed.

## Journey script (`scripts/acceptance/journey.mjs`)

No selector changed. Still present: the button "Generate manga", the URLs `/books/<id>` and `/books/<id>/read?edition=..&page=..`, the text "could not be drawn" on a failed page, the Sources button and `#source-drawer`, and the shadow-root SVG hosts. This was verified by reading the script and the code, and by the screenshots. The journey itself was not run, because it calls Generate.

## Checks

- `npx tsc --noEmit` in `frontend/`: passes.
- `npm run build` in a scratch copy: passes.
- No horizontal scroll at 390 px on library, upload, book (every state) and reader screens (the script prints `HSCROLL` on overflow; it never did).

## What remains

- The page-jump ticks at the bottom of the reader are 30 px wide at 8 pages. They get narrower with 40 or more pages. The Previous and Next buttons are 44 px. A better page picker is not done.
- The preflight panel was seen only with a mocked response. The real endpoint shape is the one in the task text. Verify it against the T3 backend after merge.
- Failure wording covers the messages seen so far. Unknown messages show as written.
- The 46-page book (grid at 390 px) was not seen after the change. Seeded editions have 8 pages. The step list and bar are built for any count.
- The upload page does not show the limits. They show only on the book page after parsing.
