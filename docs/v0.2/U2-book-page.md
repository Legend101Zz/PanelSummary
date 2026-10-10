# U2 book page (the control room)

This page describes track U2. It covers the book page at `/books/{id}`: every state, how it is built, what was verified and what is open.
The look comes from the finished design (`docs/design/`). The states and the copy come from `docs/design/SCREENS-AND-STATES.md` section 6.

## What was built

| Part | Where | Notes |
|---|---|---|
| Page and state logic | `frontend/app/(app)/books/[id]/page.tsx` | Loads the book and the latest edition, polls while a run is active, starts every action. |
| Loading skeleton | `.../[id]/loading.tsx`, `components/book/BookSkeleton.tsx` | No edge and no text, so it does not look like a cover with no art. |
| Pure logic with tests | `components/book/bookLogic.ts` | Times, page counts, the failed stage, scope and limits, action error text. |
| Estimate card (A) | `components/book/EstimateCard.tsx` | Estimate, limit note, the one Generate button, refusal notice. |
| Choose what to draw (6A, #40) | `components/book/ChooseSections.tsx` | Segmented control, section list, PDF page range, two meters. |
| Run card (B and C) | `components/book/RunPanel.tsx` | Headline, steps, tone strip, time, actions, page 1 band, result line, failure panel, MiniMax stops. |
| Review the plan (6B, #49) | `components/book/PlanReview.tsx` | Page count, cost lines, cast, one line for each page, left-out key points, Draw the pages, Stop. |
| Pages grid (D) | `components/book/PagesGrid.tsx` | Real page art, one state line, "Show page beats" list, "Draw this page again". |
| Contents and About (E, F) | `components/book/ContentsAbout.tsx` | PDF pages and manga pages for each section. About is closed by default. |
| Viewer preference | `frontend/lib/prefs.ts` | The same bytes as the file of track U1. |
| Shared copy | `frontend/lib/words.ts`, `words.test.ts` | See "Copy changes". |

`components/PageThumb.tsx` and the v0.1 `book.module.css` are removed. The new styles are in `components/book/Book.module.css` and use `--app-*` tokens only.

## States built

Whole page: loading, not found, load error, PDF not readable, PDF still being read, no estimate.
A: estimate, scoped estimate, over the limit (the viewer must choose), refused (server, no connection, other), starting.
6A: whole book, one section, several sections, over the limit by choice, a PDF page range, an invalid range.
B: waiting to start, reading, planning, plan ready to review (6B), drawing with page 1 not drawn yet, drawing with page 1 ready (the band), several pages at a time, finishing, stopping (also after a reload), a scoped run label.
C: complete (result lines), completed with failures (failure panel, retry), completed with all pages drawn and key points left out (G-O1), stopped, failed (three stages), the three MiniMax stops, action errors (stop, resume, redraw, approve).
D, E, F: Pages grid at 18 and 60 pages, page beats list, Contents with manga pages, About.

## How the hooks stay

- One `<button>` with "Generate manga" in its name before a run. It is in the card on desktop and in the bottom bar at 390 (never both). The section control never contains the phrase.
- Busy names: "Generate manga: starting" (visible "Starting") and "Retry failed pages: retrying" (visible "Retrying").
- "Retry failed pages" shows only when pages are missing. With no missing page the status is still `completed_with_failures` (G-O1), and the page offers only "Start reading".
- Reader links use `/books/{id}/read?edition={id}&page={n}`. Contents links use `/books/{id}/source?page={n}`.
- `Generate` sends `review_plan` from `readReviewPlan()`, else from `GET /status` (`plan_review_default`). Default is off.

## Deviations from the frames, with reasons

1. **The section control starts closed when the whole book is inside the limit.** A quiet button "Draw only part of the book" opens it. Reason: the reading-order rule says that the estimate and Generate are on the first screen at 390. The control is open at once when the book is over the limit.
2. **Estimate and Generate sit in two columns on desktop only when the control is closed.** With the control open, the card has the control on the left and the estimate and Generate on the right, as in frame 6A.
3. **Section words say "sections".** The frames say "tales" for the Andersen book. The app cannot know the word, so the run card says "Drawing 1 of 5 sections".
4. **The MiniMax stop shows no "Title" line at 390.** It repeats the headline. Desktop keeps the title (the copy is in `SCREENS-AND-STATES.md`). The reader still shows the title.
5. **Cast list of a long book is closed.** The plan review opens the cast list when it has 8 characters or fewer (the Andersen run has 30).
6. **Stop on a phone in the plan review.** "Draw the pages" is in the bottom bar and "Stop" is in the card.
7. **The page 1 band is in the bottom bar at 390** (default 3). The frame `Final-Book-390` shows it in the page with both buttons in the bar. The task text and the README default put the band in the bar. "Stop drawing" stays in the card.
8. **"Show page beats" list shows "Draw this page again" only in the list.** The grid cells have no room. The cost note reads "About $0.02 (estimate)".
9. **Shared component changes (kept small).** `MomentBand`: the live region is the line only (the buttons are no longer announced), and with reduced motion the band is full from the first frame (before, one frame was empty). `components/ui/README.md` has the matching note. `lib/api.ts`: two optional fields on `Coverage`.

## Copy changes (shared with the reader)

| String | Before | After |
|---|---|---|
| Plain reason for a page that failed every check | "The model's drawings for this page were rejected every time they were checked." | "Each version of this page that the model wrote failed the page checks." |
| Next step of the key refused stop | "Check the MiniMax key and plan in the drawing service settings. Then press Resume drawing." | "Check the MiniMax key on the PanelSummary server (MINIMAX_API_KEY) and your MiniMax plan. Then press Resume drawing." |
| `stageLine` of a finished run with no missing page | "Finished, with pages missing" | "Drawn, {n} key points left out" |

New functions: `failedStageLine`, `scopeLabel`. `words.test.ts` pins all of them. No backend string changed.

## Verification

Commands and counts are in the pull request. Evidence is in `/Volumes/Mrigesh SSD/Book-Reel-scratch/v02/u2/`:

- `shots/{state}_{desktop|phone}_{light|dark}.png`: every seeded state at 1440 x 900 and 390 x 844 (full page).
- `shots/6a_*`, `shots/w_*`, `shots/moment_*`, `shots/starting_*`: choose sections, whole-page states and errors, the page 1 band, the busy button.
- `compare/`: side by side with the matching design frames. The design boards are in `frames/` (rendered with Playwright).
- `tools/seed.py`: seeds database `v02_u2` (127.0.0.1:27160) with every state from the real Andersen run (`launch/final-journey/export`). It starts no job runner and no worker. Two books are invented and marked "sample" or "Scanned notes" (a 150-page book, an unreadable PDF).
- `impeccable-*.json`: detector output.

Measured in this run: exactly one Generate button before a run (desktop and phone), the busy names, the request bodies (`section_ids`, page range, `review_plan`), 44 px targets (no target under 44 px on the states listed in the pull request), no horizontal scroll at 390, the band motion (400 ms, 10 intermediate frames; reduced motion 0 intermediate frames), the live regions, and the fold positions at 390.

## Not done and open

- No live run. No call went to MiniMax. The screens use seeded data, not a real run. A fixture is not the live journey.
- "Continue with the next section" (G-S1c) has no API, so it is not built.
- The 60-page grid uses the 18 real Andersen pages repeated. The beats repeat too.
- Dark tone strip questions 1 and 2 of the design stay as drawn (owner questions).
- Owner questions: (a) Is a closed section control acceptable for books inside the limit? (b) Should "Retry failed pages" also show when the status is `completed_with_failures` with no missing page? (c) Keep "sections" in the scope label, or ask the parser for a word such as "tales"?

## Fix wave after Gate 1 (track fx2)

| # | Problem found at Gate 1 | Change |
|---|---|---|
| 1 | After "Start reading" the reader's "Skip to content" link had focus and was visible over the back arrow and the title. | The skip link shows on `:focus-visible` only. The reader has a main region (`id="main"`, `tabIndex -1`). After a client navigation, focus moves from the skip link to that region. A direct load is not changed, so Tab from the top still shows the skip link. If the viewer presses Tab on the page, focus is not moved. |
| 2 | After "Retry failed pages" the card said "Waiting to start", "Running for 1 min 04 s" and "Reading and planning a long book can take 10 minutes or more". | A queued run on an edition with a plan has the headline "Drawing is starting again" (retry, and Resume after a stop or a MiniMax stop). The reading and planning note is not shown when the plan exists. The time line says "Running for … in all" when earlier jobs have time. |
| 3 | A page opened before Generate did not see the run. | While no edition exists, the page asks for the editions every 5 s, and when the tab becomes visible or gets focus. When Generate is pressed in a stale tab, the server returns the running edition (`already_running`) and the page shows it, with no error. |
| 4 | The stopped state had no "Stopped at 3 of 16 pages". | The card says "Stopped at {n} of {total} pages" (or "Stopped before drawing") and what Resume does. |
| 5 | At 390 the card and the bottom bar both had "Page 1 not drawn yet". | At 390 only the bottom bar has it. The card has "Stop drawing". |
| 6 | An accepted page looked like a waiting page until its SVG loaded. | A neutral loading tile (`Skeleton`) shows in the grid and in the beats list. |
| 7 | One failed page said "Page N could not be drawn" twice. An unknown raw error was shown as the plain reason. | One failed page: the heading says it, the link says "Open page N in the reader". `plainReason` shows a generic sentence for a text it does not know, and the raw text is behind "Technical detail". The reader uses the same function, so it shows the same generic sentence. |
| 8 | Plan review (6B): headline, cast and strip. | Headline "The plan is ready: {N} pages". The cast shows name and role for the first 12 characters, then a disclosure for the others. A tone strip of waiting segments shows the planned pages. |
| 9 | The busy name "Retry failed pages: retrying" was not seen 800 ms after the click. | The busy state is set before the request and stays until the response and the reload of the edition. It is as long as the request. With the resume request delayed by 1.5 s it showed from 19 ms to 1.6 s. With no delay the request is fast and the button is gone soon after the click. No artificial delay was added. |

Copy changes in `frontend/lib/words.ts` (pinned in `words.test.ts`): `stageLine("awaiting_plan_review")`, new `DRAWING_AGAIN`, `stoppedLine`, `stoppedNote`, `UNKNOWN_PAGE_REASON`, and a second argument of `plainReason`.
Other files touched: `frontend/app/globals.css` (`.skip-link` only) and `frontend/components/reader/Reader.tsx` (focus on entry, and `id="main"` on the existing body element).
