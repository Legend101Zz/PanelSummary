# U1: app screens (shelf, first run, Add a book, landing, Settings, error pages, PDF viewer)

Track U1 built every app screen except the book page (U2) and the reader (U3). Every screen is made from the shared components in `frontend/components/ui`. No shared component was changed.

## 1. Screens and states built

| Screen | Route | Files | States built |
|---|---|---|---|
| Shelf | `/` | `components/shelf/ShelfScreen.tsx`, `BookTile.tsx`, `bandForBook.ts` | Loading (skeleton), error "The shelf could not be loaded." with "Try again", server not reachable (band), books (grid), the 15 band states, "Sample" marker, "Add a book" tile (the one dashed tile). |
| First run | `/` (empty shelf) | `components/shelf/FirstRun.tsx`, `SampleCard.tsx`, `useSample.ts` | Status in one line (server, job runner, key); full block for "not reachable" and "no key"; drop zone with all limits; one sentence for the sample run; "Or read the sample first". |
| Add a book | `/upload` | `components/shelf/AddBookScreen.tsx`, `UploadPanel.tsx`, `useUploadFlow.ts` | Idle, drag-over, several files, uploading (3 steps, %), cancel, reading ("Read 22 PDF pages and found 4 sections."), slow after 20 s, done ("Opening the book", then the move to `/books/{id}`), already on the shelf, every error with its next step, server not reachable. |
| Landing (local) | `/welcome` | `components/landing/*` | First screen (opening phrase, working drop zone, "Read a sample", proof), How it works, The facts, The sample, The limits. |
| Settings and about | `/settings` | `components/settings/*` | Theme (three-way), plan review switch, server status, models, limits, data, what leaves the computer, cost, version and GitHub link, credits. "Check again" and "Change models" are off with "Not available in this version". |
| 404 | any unknown URL | `app/not-found.tsx`, `components/shelf/NotFoundScreen.tsx` | One state. Shows the address. |
| Error page | a crash while a page renders | `app/error.tsx`, `app/global-error.tsx`, `components/shelf/ErrorScreen.tsx` | One state: one sentence, "Reload the page", "Go to your shelf", "Report it on GitHub". `global-error.tsx` is for a failure of the root layout: it has no router, so it uses plain links. |
| Route loading | all `(app)` routes | `app/(app)/loading.tsx` | A quiet skeleton (no edge, no text). |
| PDF viewer | `/books/{id}/source?page=N&from=` | `app/(reader)/books/[id]/source/*` | Page shown, loading ("Loading PDF page 3"), "This book's PDF is not available.", "The PDF could not be loaded." (Try again), "This page could not be shown." (Try again), out-of-range number. Keys, URL contract and `from=` check are as in v0.1. |

Tab titles: "Your shelf", "Add a book", "Settings and about", "Your book's PDF, drawn as a manga", "Page not found", "Error", and "{book}, PDF page {n}" (each with " | PanelSummary").

## 2. Data and rules that the screens follow

- Limits on Add a book, the first run and the landing come from `GET /status` `limits`. If the server cannot answer, `FALLBACK_LIMITS` in `lib/words.ts` (60 MB, 75 pages, 17,500 words) are shown.
- The status line never says "key valid". It says "MiniMax key set" or "MiniMax key not set".
- The first run does not install the sample by itself. An installed sample would end the empty shelf. Until the person presses "Read the sample", the sentence uses `components/shelf/sampleFacts.ts`. Those are the real numbers of the shipped sample (measured on 10 October 2026, listed in the file). When the sample is installed, the screen reads the live edition and estimate.
- The landing installs the sample (idempotent, no model call) so that the proof is real data: manga page 1, panel 2, the lines of that panel from the page API, and the PDF page from `sources` (PDF page 3). The sample sentence is computed from the sample edition: 4 sections, 22 PDF pages, 18 manga pages, drawn in 7 min 08 s, estimate 5 to 58 min. The three page thumbnails are manga pages 13, 17 and 18 of the sample.
- Plan review preference: `lib/prefs.ts` (the exact bytes of the shared file). The Settings switch shows the stored choice. Without a stored choice it shows `plan_review_default` of `GET /status`.
- A third-party request: none. A network capture of `/`, `/welcome`, `/upload` and `/settings` showed only `127.0.0.1` hosts.

## 3. Evidence

All evidence is in `/Volumes/Mrigesh SSD/Book-Reel-scratch/v02/u1/`.

- `shots/{screen}-{width}-{theme}.png`: `shelf`, `upload`, `welcome`, `settings`, `notfound` at 1440 and 390, light and dark. `firstrun-*` the same (taken on an empty database). `pdf-*` at 1440 and 390 (dark only). `error-*` and `loading-*` at 1440 and 390 in both themes.
- Files with `MOCK` in the name used a Playwright request route for one request (no server, no key, error answer, a delayed answer). The page code ran as in use. They are not a live state.
- `frames/*.png`: the design frames (rendered with Chrome) to compare.
- `tools/`: the scripts (`shot.mjs`, `states.mjs`, `interact.mjs`, `upload-test.mjs`, `stack.sh`).
- `impeccable-*.json`: scan results.

## 4. Deviations from the frames

| Frame | Build | Reason |
|---|---|---|
| Landing has its own header (How it works, The sample, GitHub). | The landing uses the app header. | The app layout draws one header for every `(app)` route. |
| Landing proof: the whole page 13 plus a small callout. | One panel (page 1, panel 2) next to the PDF page 3. | The task says to show one panel joined to its PDF page, with real data. The panel is the page SVG with a changed `viewBox`; the SVG itself is not restyled. |
| First run: the sample cover is the real page 1. | The cover is a blank sheet until the sample is installed. | The app must not install the sample before the person asks. The API has no preview image for an uninstalled sample. |
| First run sentence: "page 1 after 3 min 58 s". | "the first page drawn after 3 min 47 s". | The shipped sample has no `page_1_at`, only `first_page_at` (3 min 47 s after the start of generation). The screens show the measured value and say "first page", not "page 1". |
| Settings column "Thinking (sent)" shows low, low, low. | The column is "Thinking (asked)" and shows low, off, off. | `GET /status` gives the level asked. The note under the table says what is sent (the Flash model cannot turn thinking off, so it gets "low"). |
| First run "Check again" is a plain button. | It runs `GET /status` again. | The endpoint exists now. In Settings it stays off, as the design default says. |
| Shelf: a "Drawing now" feature card with "Start reading" and "See progress". | Not built. | It is not in `SCREENS-AND-STATES.md` section 4. The tile band says the state. |
| A run with `completed_with_failures` and no missing page shows "16 of 16 drawn, 0 missing" in `shelfStatus()`. | The tile shows "16 manga pages" in the drawn family. | `bandForBook()` uses `pages_failed` of S1 (no change to `shelfStatus()`, which U2 owns). |
| The PDF viewer: "Page [3] of 22" at 390. | The label "Go to PDF page" is visually hidden at 390; "of 22" stays. | Room in the 60 px bar. The name stays for assistive technology. |

## 5. Copy waiting for owner approval

- The opening phrase "Your book's PDF, drawn as a manga" (set without a full stop, as in the frame).
- The 404 lines ("Error 404", "This page does not exist.", "Check the link, or go back to your shelf.", "The address was").
- The crash page lines, including "Your books and drawn pages are safe on your computer" and "Report it on GitHub" (links to `/issues/new` of the project).
- The tab titles.
- The limits line on the landing: "Version 0.2 lets you choose sections of a longer book." (true only if track U2 ships section choice).
- First run: "Nothing is on the shelf yet. ..." with "sections", and the sample sentence.
- New words in `lib/words.ts` (U1 block): "Read {n} PDF pages and found {n} sections.", "Use a PDF with selectable text.", "The PDF could not be read. The file may be damaged. Choose another PDF." (for a parser error text such as `FileDataError`), "You can leave this page. The book stays on your shelf.", "This choice is kept in this browser only.", "Review the plan before drawing" and its note, "In your browser, the app talks only to your own PanelSummary server.", "Sample" marker, "A first draft." beside the sample.

## 6. Notes for track U2 and the orchestrator

- Server not reachable on the book page: `import { OfflineGate } from "@/components/shelf/OfflineGate"` and show `<OfflineGate onRetry={load} />` at the top of `<main>` when a request fails with `ApiError.status === 0`.
- `lib/api.ts`: U1 does not change it any more. The S2 calls (`is_sample`, `listSamples`, `installSample`) came in with S2 (#66) and the rebase.
- `lib/prefs.ts` is the shared file. Its content must stay byte for byte the same in U1 and U2.
- `next dev` shows a "1 error" badge on the error page. A production build does not.

## 7. Open questions

1. Should the first run show the real page 1 of the sample before it is installed? It needs a preview endpoint, or a copy of one page SVG in `public/`.
2. Should the landing install the sample when a person only looks at it? Now it does (it adds one "Sample" book to the shelf).
3. Should the first run mention the plan review switch?
4. `/dev/components` is still in the production build (it is listed in the route table). The shared README says it answers 404. Not a U1 file.

## 8. Not done

- No live run, no Generate, no model call. Uploads used the fake-key worker and the offline parser only.
- The frames and the build were compared by looking at the screenshots one by one. No pixel diff was made.
