# U1 UI: reader first view, book page and run card fixes, the #94 UI defaults

Track U1 of v0.3. Issues: #93 (all six items), #89 (items a to f) and the UI part of #94.
Evidence is on the build machine in `/Volumes/Mrigesh SSD/Book-Reel-scratch/v03/u1/` (not in the repository). Every number below was measured in this run on the replay worker (no MiniMax call, no spend).

Ports and database of this track: web 3240, API 8140, worker 8840, MongoDB 27140, database `v03_u1`.
The seeded states used database `fixture_v03u1` on the same MongoDB (`seed_states.py` refuses other names). The stack ran against it only for those screenshots.

## #93 item 1: the reader first view at 1440x900

Measured with the replay run (22 pages), `tools/measure-reader.mjs`: the smallest text of a balloon or caption (22 page units) in screen pixels, over all 22 pages. The page number (15 units, hidden from readers) is not counted.

| Option | Scale | Smallest balloon or caption text |
|---|---|---|
| A: fit the page height on open | 0.486 px per unit | **10.68 px** |
| B: keep the read size | 0.700 px per unit | **15.4 px** |

Rule: choose A only if the smallest text stays at 14 px or more. It does not (10.68 px). **Choice: B.** The v0.2 final journey measured 15.4 px at the read size too. See decision D37.

What changed (reader files: `Reader.tsx`, `camera.ts`, `reader.module.css`; no token and no page SVG changed):
- The page still opens at the read size, at the top of the page.
- The "Whole page" chip floats at the right edge only when the graphite beside the page is at least 176 px wide (`CHIP_ROOM`, `chipBesidePage`). At 1440x900 that room is 370 px, so the chip is beside the art. On a narrower stage (1024 wide: 162 px; 768 wide: 34 px) the chip is in the bottom bar, next to "All pages". It never covers the art.
- While the page is at its top, a hint under the chip says "Top of the page. Scroll down to read on." The chip has the page icon. The label is still "Whole page" or "Read size".
- The "Reset zoom" button of a zoomed page is unchanged (a zoomed page fills the stage).

Measured chip box (x, y, w, h): 1440x900 chip at (1297, 780, 127, 44), the page art spans x 370 to 1070, so the chip is 227 px right of the art. 1024x768 and 768x1024: the chip is in the bottom bar (before, it covered the art at 768x1024).

Screenshots: `shots/before/reader-p1_*.png` and `shots/after/reader-p1_*.png` (1440x900, 1024x768, 768x1024, 390x844; the reader has one theme, graphite).

## #93 item 2: page 1 band latency

Measured with `tools/band-latency.mjs`: the API edition shows page 1 as accepted (polled every 40 ms), against the first time the text "Page 1 is ready." is in the book page (MutationObserver), 5 new books, replay worker, Chrome.

| Run | Latency |
|---|---|
| 1 | 822 ms |
| 2 | 327 ms |
| 3 | 1922 ms |
| 4 | 660 ms |
| 5 | 275 ms |
| **Median** | **660 ms** (range 275 to 1922 ms) |

The median is under 2.5 s, so the rule says to leave the poll at 2 s. **No change** (no faster poll, no push). The error of the method is at most 40 ms (API poll step). The band also needs 400 ms to fill. File: `band-latency-before.json`.

## #93 item 3: the time strip marker outside the estimate

`ResultLine` holds the mark inside the strip (3 px inset, so the whole mark is inside the bar edge) and the label never leaves the strip. A value outside the range is said in words next to the number: "Faster than the estimate" or "Slower than the estimate" (cost: "Lower than the estimate", "Higher than the estimate"), and a screen reader hears "This run was faster than the estimate." Pure logic `rangeSide` in `format.ts`. Tests: `format.test.ts`, `ResultLine.test.tsx` (new).

Check with the new O1 numbers (PR #101 is in the base): the replay run took 38 s. The strip reads "6 min" to "1 h 01 min" with the mark at the left end, inside the bar, and "38 s · Faster than the estimate". Screenshots: `shots/after/book-complete_*`, before: `shots/before/book-complete_*`.

## #93 item 4: one label rule for the read button

The reading place is stored per browser (`localStorage`). Rule: the book page says "Continue from page N" only when this browser has a saved place on a drawn page 2 or later, and then it adds "Your place is saved in this browser only." Otherwise it says "Start reading", with no hint. One function, `readButton()` in `lib/words.ts`, tested in `words.test.ts`.

## #93 item 5: the bottom bar and the content

The v0.2 page used a fixed 112 px spacer inside `<main>`. The footer sat below it, so at the end of the page the footer was under a taller bar. Now `BottomBar` measures its own height and sets `--app-bar-h` on the document. The app frame (`frame.module.css`) pads its bottom by that value. Measured at 390x844 with the estimate disclosure open, scrolled to the end: footer bottom 766, bar top 766, bar 78 px, in light and dark. A bar with two buttons is taller and the padding follows it. Above 768 px the bar is hidden and the padding is 0.

## #93 item 6: impeccable in both themes

The theme is `data-theme` on `<html>` (`ps-theme` in `localStorage`); with no value it follows `prefers-color-scheme`. The detector's own browser cannot set the value, so `tools/snap.mjs` saves the rendered page (scripts removed, `<base>` set) with `data-theme="light"` or `"dark"`, and `npx impeccable@4.5.2 detect --json --viewport <size> file://...` scans it. Pages: shelf, welcome, upload, settings, a book page with an estimate, a book page with a finished run. Sizes 1440x900 and 390x844. Result: **0 findings in all 24 scans** (12 light, 12 dark). The same detector on a copy with a planted low-contrast text and a gradient text reported 2 findings, so the scan is live. A scan of `http://127.0.0.1:3240/` (light) also gave 0. Limits: the snapshots have no running scripts, so states that exist only after a click are not scanned. Files: `impeccable/*.json`.

## #89

a. **Deferred to v0.4.** The reader's Page, Panels and Sources controls stay at 40 px. The reader is frozen in v0.3 except #93 item 1 (owner rule), and a change would move the header of the reader.

b. **Page 1 band at 1440x820 with a two-line title.** While a run is active the logline is hidden on a screen 768 px or wider (`.top[data-live] .logline`). It shows again when the run is over. Measured (title of two lines, book page, band bottom in px):

| Viewport | Before | After |
|---|---|---|
| 1440x900 light | 855 | 737 |
| 1440x820 light | 855 (out of the screen) | 737 (83 px spare) |
| 1440x820 dark | 859 (out) | 739 (81 px spare) |

The title came from the PDF metadata (two lines at 44 px) for the live runs. The `*-2line` sets also answer `GET /books/{id}` with a longer title through a Playwright route; nothing else is mocked. At 390 the layout is unchanged (the band is in the bottom bar).

c. **Status bands.** Measured: mint `#5CC6A0` on white 2.09:1, mint on the ground `#F4F5F0` 1.91:1, coral `#EE6A45` on the ground 2.83:1 (coral on white 3.10:1). `StatusBand` (families drawn and needs) and the cover label "Couldn't read this PDF" now have a 1.5 px edge in `--app-line-strong` (ink `#121212` on the ground 17:1). Dark: mint `#4FB591` on `#26272A` is 5.94:1 and coral `#E8704C` 4.87:1, so the fill already passes; the edge is the same in both themes, so the bands look the same. Not changed: the yellow `MomentBand` is 1.24:1 on the ground. It is a large block with 24 px text on it, not a state mark, so it is left as designed (owner question below).

d. **Plan ready to review, and the stopped run card.** There is no design frame for a shelf band of a plan that waits, so the nearest band is the outline band. It is its own family now, `review` (`StatusBand`): outline band with a 2 px action-colour edge and the action wash, so it differs from "Not drawn yet" and "Stopped at" by weight as well as colour. The words stay "Plan ready to review". The "Drawing now" card says "Drawing now" only for an active run. A run the viewer stopped says "Stopped by you" and "Stopped at 3 of 16 pages."; a run that ended with a problem says "Stopped with a problem" and the reason (`drawingNowWords`, tests in `drawingNowLogic.test.ts`). The card has no "Drawing stopped" any more. The gallery at `/dev/components` shows the review band.

e. Done in PR #91 (dark tone strip).

f. The section control stays closed for a book inside the limit (default of #94). Unchanged.

## #94 UI defaults

| Default | Result |
|---|---|
| Keep the shipped copy | Kept. Recorded in `docs/design/README.md`: "Accepted by default in v0.3 (#94)". |
| "Retry failed pages" also for `completed_with_failures` with no page missing | Done. It is a secondary button next to the primary "Start reading", with the line "Retry failed pages tries the run again. The pages that are drawn stay as they are." The resume call works for any stopped edition (no API change). Measured on the seeded state `failures-16-of-16`: 1 retry button; on `failures-14-of-16`: 1. |
| `/dev/components` answers 404 in production | Not true in v0.2.0: the page called `notFound()` but a production build answered HTTP 200 with the 404 text. Fixed with `frontend/middleware.ts` (only for `/dev/*` and only when `NODE_ENV` is production). Measured on `next start`: `/dev/components` 404, `/dev/x` 404, `/settings` 200. In dev the gallery still works. |
| The first run does not mention plan review | Verified: no such text in the first-run, landing or shelf code. Unchanged. |
| No sample preview before install | Unchanged. |
| The landing keeps installing the sample when a person only looks | Unchanged. |
| Keep "sections" in the scope label | Unchanged. |

## Verification

- `cd frontend && npx tsc --noEmit`: no output (clean).
- `cd frontend && npm test`: 13 test files, 134 tests, all pass. New: `ResultLine.test.tsx` (5), `camera.test.ts` (3), and cases in `format.test.ts`, `words.test.ts`, `bandForBook.test.ts`, `drawingNowLogic.test.ts`. `frontend/vitest.config.ts` is new (automatic JSX transform for the render tests).
- `cd frontend && npm run build` (dev server stopped): passes.
- `node scripts/acceptance/journey.mjs --pdf <copy of happy-prince-two-tales.pdf> --out journey-after --full --replay --check-hosts --web http://127.0.0.1:3240 --api http://127.0.0.1:8140`: **62 of 62 PASS**, host check: only 127.0.0.1:3240 and 127.0.0.1:8140. The baseline on the unchanged base was also 62 of 62. The PDF is a copy with one extra comment line, because the upload dedupes by hash and the baseline run had already used the original.
- Test hooks: the journey checks one "Generate manga" button, the upload input and the automatic move, "could not be drawn", "Sources" and `#source-drawer`, and the URLs. `tokens.css` is untouched.
- 44 px targets and horizontal scroll (`shots/*/audit-*.json`): at 1440 and 390, light and dark, on the estimate, running, finished and shelf pages, no link, button or input under 44 px except the "Skip to content" link (1 px until focused, by design); no horizontal scroll at 390.
- Not run: `scripts/acceptance/ui-retry.mjs` (it needs a real failed page; the replay run has none). Backend tests (no backend file changed).

## Not done

- No live run. No MiniMax call. A replay and a seed are not the live journey.
- Reader controls at 44 px (#89 a): v0.4.
- The yellow band edge (see c).
- The "Drawing now" card for a stopped run was verified by unit tests; it shows only when no active run is on the shelf (two cards at most, active first), and the seeded shelf had active runs, so there is no screenshot of it.
- Retry for a run with no missing page asks the server to resume; the effect on key points left out was not measured.
