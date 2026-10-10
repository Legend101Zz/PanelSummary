# U3: the reader (#53 page size, #49 page picker)

The reader is frozen except two changes. Both keep the dark graphite look. The stored page SVG is not changed (D4). No renderer change, so no new RENDERER_VERSION.

## 1. Measurements (#53)

Method: a Playwright script opens a real page in the production build and reads the SVG scale (px on screen per page unit). Text size on screen = `font_px` x scale. The pages are the 18 real pages of the final journey (`Book-Reel-scratch/launch/final-journey/export/judge`), drawn by the current renderer (all 18 are byte-equal to the exported SVG). In these 18 pages the smallest caption is 22 units, the smallest speech balloon is 24 units, and a typical balloon is 28 units.

Page mode, before (release/v0.2) and after:

| Viewport | Page box before | Caption (22) before | Balloon (24) before | Page box after | Caption (22) after | Balloon (24) after | Scrolls after |
|---|---|---|---|---|---|---|---|
| 1440x900 | 485x728 | 10.7 px | 11.6 px | 700x1050 | 15.4 px | 16.8 px | yes |
| 1280x800 | 419x628 | 9.2 px | 10.0 px | 700x1050 | 15.4 px | 16.8 px | yes |
| 1920x1080 | 605x908 | 13.3 px | 14.5 px | 700x1050 | 15.4 px | 16.8 px | yes |
| 1024x768 | 397x596 | 8.7 px | 9.5 px | 700x1050 | 15.4 px | 16.8 px | yes |
| 390x844 | 370x555 | 8.1 px | 8.9 px | 370x555 | 8.1 px | 8.9 px | no |

At 1440x900 the page used the full stage height (784 px minus 2 x 28 px padding), so it could not be larger without scrolling. The numbers are in `Book-Reel-scratch/v02/u3/measure-before.json` and `measure-after.json`.

Panels mode is not changed. It already frames one panel at a time. At the 1440x900 stage the smallest non-SFX text in the 18 pages is 17.3 px (131 texts, none below 14 px). At the 390 stage it is 8.5 px (28 of 131 texts below 14 px). That phone value is the same as before; this change does not make it worse and does not fix it.

## 2. The choice

Candidates:

- Fill the height and allow zoom: at 1440x900 the page cannot be larger than 485x728 without scrolling, so text stays about 11 px. It does not reach 14 px.
- Two-page spread: each page is smaller, so the text is smaller. Rejected.
- Fit width with vertical scroll: the page can be as wide as the screen allows. Chosen.

The chosen view is called "read size". The page scale is `min(stage width fit, 0.7)`, and never less than the whole-page fit. At 0.7 the smallest caption (22 units) is 15.4 px. A larger value gives more text size but more scrolling, so 0.7 is the smallest round value with a margin above 14 px.

Why this is the least friction: the reader still reads in order, panels top to bottom. The page is 1050 px high in a 784 px stage, so it needs two screens. The Space key moves down 85 percent of a screen; at the end of the page Space turns to the next page. The next page starts at the top. Shift + Space goes back the same way.

On a phone the width limits the whole-page fit, so "read size" equals the whole-page fit: no change (measured above).

How to move the page (page mode, when it is taller than the stage):

- Mouse wheel or trackpad: moves the page up and down.
- Drag: moves the page.
- Arrow Down / Arrow Up: move 25 percent of a screen.
- Space / Shift + Space: move 85 percent of a screen, then turn the page at the end.
- "Whole page" button (bottom right of the stage): shows the whole page, as in v0.1. It changes to "Read size". The choice is saved in this browser (`localStorage` key `ps:pref:reader-view`, in try/catch). The button shows only when the page does not fit at read size.
- "Reset zoom" appears after a zoom (it was "Fit page"; in the whole-page view it still says "Fit page").

Zoom limit: the highest zoom is the same absolute scale as before (5 x the whole-page fit). The camera can show 28 px (10 px on a phone) of graphite beyond the page edge, so the page does not touch the bars.

Kept: the Page / Panels / Sources modes, all keys (arrows, Page Up/Down, Home, End, + - 0, Escape), tap zones, swipe, double tap, pinch, and the URL `?page=` sync.

## 3. The page picker (#49)

A button in the bottom bar opens "All pages". Desktop: "All pages". Phone: "Page 25 of 60". The design reference is `Reader-idea.html` (ReaderPicker).

- Every page is a 44x44 px button, grouped by section (the book's sections when the edition has them; one group when it has not). Measured at 1440, 1920, 1280 and 390 wide: 60 buttons, 0 smaller than 44x44.
- Accessible names: "Page 12", "Page 13, could not be drawn", "Page 58, not drawn yet". The current page has `aria-current="page"` and a light fill.
- A page that could not be drawn has the red pen colour and a diagonal line, so colour is not the only sign. A page not drawn yet has a dashed pencil border. A legend explains the three marks.
- Keyboard: the dialog opens with focus on the current page. One tab stop (roving focus). Arrow keys, Home and End move; Enter chooses; Escape closes and returns focus to the button. The reader's own keys (turn page, scroll) do not run while the picker is open.
- It does not cover the page while reading: it is closed until the viewer opens it, and it closes on choice, on Escape, on the close button and on a click outside.
- The bottom bar keeps the previous / next buttons. The ticks stay only where each tick can be 44 px wide (an 8-page book at 1440: 8 ticks, 48x44 px each). When they would be narrower, the ticks become a picture of the book that is hidden from assistive tools and cannot be clicked; the picker button is the control. On a phone the picture is hidden.
- Only graphite room tokens are used (`--graphite*`, `--on-graphite*`, `--pencil`, and the reader's local red pen tone). No app tokens, and `.app-root` is not in the reader DOM (checked at 4 sizes, page and panels mode).

Pure logic is in `components/reader/picker.ts` (grouping, labels, grid moves, tick mode) and `camera.ts` (`restScale`, `overflows`, `maxZoom`, `scrollStep`, `zoomCam`), with tests in `picker.test.ts`.

## 4. What did not change

- The stored SVG, the renderer, `RENDERER_VERSION`, the decisions (D2, D3, D4, D11, D12, D13).
- Reader tokens and `.btn` classes in `globals.css`; `Paper.tsx`; the reader icons in `Icons.tsx` (the picker uses two small inline icons).
- Test hooks: "could not be drawn" on a failed page, the Sources button, `#source-drawer`, the URLs, `lib/words.ts`.
- Panels mode and the phone page view.

## 5. How this was checked

Test data is a fixture: a small server (`Book-Reel-scratch/v02/u3/tools/mock-api.mjs`) that serves real exported pages. The 60-page edition repeats the 18 real pages and is marked "TEST FIXTURE" (invented tale names, pages 12 and 19 failed, pages 58 to 60 not drawn). It is not the backend and not a live run. The journey script (`scripts/acceptance/journey.mjs`) was not run: it needs the full stack. The phone step of that script (tap at (360, 420) moves to the next panel) was reproduced against the fixture and the camera moved.

Before and after pictures: `Book-Reel-scratch/v02/u3/shots/` (`before-*` and `after-*`).
