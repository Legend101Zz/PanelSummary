# F4 UI check: the provider-stop screens

Date: 2026-10-09. Branch `fix/provider-stop-ui`. No model call was made. Load average at the checks: 3 to 11 (shared Mac).

## Method

- Own stack on ports 3270 / 8170 / 8808 / 27040, database `launch_ui4`.
- The test PDF `happy-prince-two-tales.pdf` was uploaded through the API (parsing makes no model call).
- A stopped edition was written straight into the database with the backend document classes. It has 22 planned pages,
  5 accepted pages (spec and SVG from `uab-flash-ci/live-run/export/judge`), 17 pending pages, status `failed`, and
  `provider_stop` with the real text "Token Plan usage limit reached: ... (2056)".
  The seed has no `panels` and no `texts` for the accepted pages, so Panels mode and Sources were not checked.
  The page view (full SVG) was checked.
- Playwright with system Chrome at 1440x900 and 390x844. Every screenshot was looked at.
- Script and seed: `/Volumes/Mrigesh SSD/Book-Reel-scratch/launch/ui4-impl/shots.mjs` and `seed.py`.

## What I saw before the fix

| Screen | Result |
|---|---|
| Shelf cover band | Only "Drawing stopped". It did not say why. |
| Book page | Reason, "nothing more was sent", next step, technical detail and Resume drawing were all visible. The headline above them was the generic "Drawing stopped with an error". The cover band again said only "Drawing stopped". |
| Reader, accepted page | Reads normally. |
| Reader, pending page | Reason and next step were present, but the card said the same thing twice ("MiniMax stopped the drawing before this page" and then "MiniMax stopped the drawing: usage limit reached"). At 390 px the title touched the top of the frame. |
| Horizontal scroll | None, at both sizes, on all four screens. |
| Raw JSON as main text | None. The provider text is a small "Technical detail" line. |

## What changed

- `backend/app/api/library.py`: the shelf view of the latest edition now has `provider_stop: {code}` (only the code, not the provider text).
- `frontend/lib/api.ts`, `frontend/lib/words.ts`: new `providerStopShort()`. The band says "MiniMax limit reached, 5 of 22 drawn" (or "MiniMax refused the key", "MiniMax not answering"). A failed edition without a provider stop still says "Drawing stopped".
- `frontend/app/books/[id]/page.tsx`: the cover band gets the same text. The status headline says "Drawing stopped: MiniMax usage limit reached".
- `frontend/components/reader/Reader.tsx`: the pending-page card has one reason sentence that also says "Nothing was sent for this page", then the next step.
- `frontend/components/reader/Reader.module.css`: smaller gap and text on narrow screens, so the card does not crowd the frame.
- Tests: `backend/tests/test_provider_stop.py` (new case: shelf view, and cleared after resume), `frontend/lib/words.test.ts` (new case).

## Checks

- Backend: 52 passed. Frontend: `npx tsc --noEmit` clean, vitest on `lib` 6 passed, production build in a scratch copy passed.

## Screenshots

Before: `/Volumes/Mrigesh SSD/Book-Reel-scratch/launch/ui4-impl/shots-before/`
After: `/Volumes/Mrigesh SSD/Book-Reel-scratch/launch/ui4-impl/shots-after/`
Files: `shelf`, `book`, `reader-accepted`, `reader-pending`, each with `-desktop.png` and `-mobile.png`.

## Not checked

- The Resume button was not pressed (no live call is allowed). Only that it is visible and enabled was checked.
- A stop in the understanding or plan stage (no pages) and the PROVIDER_AUTH / PROVIDER_UNAVAILABLE wording were not shown on screen.
