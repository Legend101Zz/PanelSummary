# PanelSummary: screens and states

This file lists every screen, every state and the copy. It started as the checklist for the design. The design is finished (round 4b). Now it is the checklist for the v0.2 build. The design frames are the source of truth for the look; this file is the source of truth for states, copy and test hooks. See `docs/design/README.md` for the frames.

## Owner decisions and applied defaults (10 October 2026)

**Owner decisions.**
- **Deploy (#52):** no deploy in v0.2. The release is a GitHub release plus a local `./start.sh`. The landing page at `/welcome` is the LOCAL variant (the working drop zone). The showcase frames are kept for later.
- **Choose sections (#40) and review the plan (#49):** both are built. Plan review is a setting. It is off by default.
- **Built-in sample manga:** yes. The v0.1 final-journey Andersen edition ("Four Tales by Hans Christian Andersen", 18 manga pages) ships as a seeded sample. The first run shows "Or read the sample first". The landing page shows "Read a sample" as a secondary action next to the drop zone. The sample is BUILT. The marker "[needs backend]" does not apply to it any more.
- **Live spend cap for v0.2:** $50.

**Defaults applied to open design points.**
- **Default 2 (choose sections at 390):** the ONE "Generate manga" button stays in the fixed bottom bar at 390 while sections are being chosen. It never falls below the first screen.
- **Default 5 (hook names while busy):** while a request runs, the button names are "Generate manga: starting" and "Retry failed pages: retrying". The visible labels are "Starting" and "Retrying". Once a run exists, there is no "Generate manga" button (one run for each book).
- **Default 7 (copy):** copy marked [suggested], and copy that the designer wrote (the Not found sentence, the No estimate line, the crash page lines, the opening phrase "Your book's PDF, drawn as a manga", the tab titles), is kept. `docs/design/README.md` lists each one under "Copy waiting for owner approval". Cast names, beats, coverage and timings come from real API data in the build, never from the frames.
- **Default 9 (Settings):** "Check again" and "Change models" are disabled and carry the text "Not available in this version".
- **Default 10 (landing):** the GitHub link goes to https://github.com/Legend101Zz/PanelSummary.
- **Defaults 1, 3, 4, 6, 8** are in `docs/design/DESIGN.md` (cover with no art, the phone page 1 band, the dark tone strip, the 22 px drop places, the token table).

**Copy markers.**
- Text "in quotes" is the copy shipped in v0.1.0. You can make it better, but keep its meaning and the plain voice.
- A string marked **[suggested]** is new copy. You can change it.
- `{x}` is a value that is filled in when the app runs.

**Feature markers.**
- **[NEW]** is a new surface.
- **[v0.2]** is a v0.2 feature.
- **[needs backend]** means that no API exists for it today. Design it, and the build adds the API.
- **[data exists]** means that the API has the data but no screen shows it.

Product name: **PanelSummary**, on every screen.

---

## 0. Fixed: do not redesign

### The manga pages

- Black and white, with screentone, on paper colour #fbfaf6, with a 2:3 ratio (1000 x 1500).
- The lettering uses Comic Neue for balloons and captions and Bangers for sound effects.
- Covers and thumbnails in the app ARE these pages at a small size.
- Use only the real PNGs in `manga-pages/`, and never draw fake manga art.

### The reader

The reader (`/books/{id}/read`) is in `screens/fixed-reader/`. It is a dark room:
- Background graphite #26272a, with #333438 and #45474c for raised surfaces.
- Text #ecebe6, and #a9abaf for secondary text.
- A top bar with back, the book title, "Page {n} of {total}" and the Page / Panels / Sources buttons.
- A bottom bar with previous, next and the page ticks.
- A light Sources drawer on paper.

The app links into the reader from "Start reading", "Page 1 is ready. Read it now" and each page thumbnail. The new app pages must hand over to this room in a natural way.

### Tokens the reader reads

The reader reads these tokens from `globals.css`, also in its light Sources drawer and its page-state cards:

| Group | Tokens |
|---|---|
| Graphite | `--graphite` #26272a, `--graphite-2` #333438, `--graphite-3` #45474c, `--on-graphite` #ecebe6, `--on-graphite-2` #a9abaf |
| Pencil | `--pencil` #69b7dd, `--pencil-ink` #1b6590, `--pencil-wash` #dcedf6 |
| Red pen | `--redpen` #c22e21 |
| Paper and ink | `--sheet` #fbfaf6, `--ink` #141414, `--ink-2` #464a4f, `--ink-3` #62666c, `--rule` #c9ced1, `--board` #eceeef |
| Fonts | `--font-title` (Shippori Mincho B1), `--font-ui` (Zen Kaku Gothic New) |
| Other | `--ease`, `--page-ratio`, the classes `.btn`, `.btn-ink` and `.btn-redpen`, the Sheet card (`components/Paper.tsx`) and the line icons |

**Rule:** give the new app its OWN token names (for example `--app-surface`, `--app-text`). Leave every reader token with its name and value. Do not redraw or restyle the reader.

### Test hooks: keep these exactly

The acceptance scripts click or read these:
- **On the book page:** exactly ONE `<button>` whose name contains "Generate manga". No second button may contain that phrase. It is visible as soon as the upload lands on the book page, with no step in between.
- **On the book page:** a `<button>` named "Retry failed pages".
- **Busy names (default 5):** while the request runs, the accessible names are "Generate manga: starting" and "Retry failed pages: retrying". The visible labels are "Starting" and "Retrying". Both names still contain the hook phrase.
- **On `/upload`:** a real `<input type="file">`. It may be visually hidden. When the PDF is read, the app opens `/books/{id}` by itself.
- **In the reader (fixed, so these stay):** "could not be drawn", the "Sources" button and `#source-drawer`.
- **Shared copy:** the reader shows the same plain failure reasons, stage lines and MiniMax stop texts as the book page (`frontend/lib/words.ts`: `plainReason`, `stageLine`, `providerStopLines`). A **[suggested]** change to these strings also changes the reader's text. This is allowed, because it changes copy, not the look. Keep "could not be drawn".
- **URLs:** `/upload`, `/books/{id}`, `/books/{id}/read?edition={id}&page={n}` and `/books/{id}/source?page={n}&from={reader URL}`.
- **Copy tests:** `frontend/lib/words.test.ts` and `backend/tests/test_preflight.py` pin some exact status strings. A copy change updates those tests in the same pull request.

---

## 1. Global shell

**Theme setting.** Settings has a theme choice: Light, Dark or "Use the system setting". The default is the system setting. The reader and the PDF viewer ignore the theme (they are always the graphite room).

**Live spend cap.** The v0.2 live spend cap is $50. The cap limits what the owner spends on live runs while the build and the tests run. How the app enforces it is a build decision.

**Today:**
- A wordmark "PanelSummary" with a small mark (a page split into panels), linked to the shelf.
- Only the shelf has a right-hand button, "Add a book".
- No other navigation and no footer.
- Only the PDF viewer sets a browser tab title ("{title}, PDF page {n} | PanelSummary"). The other pages read "PanelSummary".

**Redesign:**
- A header with the wordmark (propose a mark) and navigation: Shelf, Add a book, Settings.
- A small footer with the version (v0.2), Settings / About, and the line "PanelSummary runs on your computer. Only MiniMax gets the book text and page previews." **[suggested]**
- A skip link "Skip to content".
- A tab title for each page, e.g. "Four Tales by Hans Christian Andersen | PanelSummary" **[suggested]**.
- **404 [NEW]:** an app-styled page with a way back to the shelf. Today it is the stock Next.js page (white, system font, no way back).
- **Error page [NEW]:** for a crash while a page renders. One plain sentence and two actions: reload, and go to the shelf.
- **Route loading [NEW]:** a quiet skeleton for the shelf and the book page. It must look clearly different from a cover that has no art yet.
- **Server not reachable** (any screen): today "Can't reach the PanelSummary server. Check that the backend is running." **[suggested]** "Can't reach the PanelSummary server. Check that it is running (./start.sh)."

**Routes.** The owner decides these before Round 2. The recommended default:
- The shelf stays at `/`.
- The first run replaces the empty shelf at `/`.
- The landing page is at `/welcome`. A public showcase can show it at `/`.

---

## 2. Landing page [NEW]

**Visitor (owner, 9 October 2026):** a person who found PanelSummary on X, Instagram or a similar site, as a product they want to use.

**Variants.** v0.2 builds the LOCAL variant at `/welcome`: the action is the working drop zone, and "Read a sample" is a secondary action next to it. The public showcase variant (#52; the action is "Read a sample", with no upload, and the manga leads from the first screen) is NOT built in v0.2. Its frames stay in the design for later.

**The first screen does three things:**
1. It says what PanelSummary is in one short line. Do not set a full sentence at display size. For example **[suggested]**: "Your book's PDF, drawn as a manga." (the designer's phrase; waiting for owner approval)
2. It holds the action in its working form.
   - Local: the real drop zone, with all the limits.
   - Showcase: page 1 of the sample, readable. "Read a sample" opens the reader at page 1.
3. It shows the proof that only PanelSummary has. Take one panel of a real page and join it to the PDF page it comes from, with each line's label (quoted, paraphrased or dramatized). The reader's Sources drawer shows this today. Use real data only:
   - Manga page 1, panel 2 comes from PDF page 3. Its lines are the caption "The Emperor" (paraphrased) and the narration "All his money went on dress; soldiers, theatre and chase went untended." (paraphrased).
   - Or manga page 3, panel 1, as the Sources drawer screenshot shows it: PDF pages 5 and 6, "The second officer" (paraphrased) and "I certainly am not stupid!" (quoted).

**Below the first screen:**
- **How it works** in three steps, set as plain text in the page's own rhythm:
  1. You add the PDF.
  2. A language model reads the text and writes a plan for each page.
  3. PanelSummary's own code draws each page.
- **The facts**, as plain sentences:
  - No image-generation model: code draws every page.
  - Each panel links to the PDF pages it comes from, and each line says if it is quoted, paraphrased or dramatized.
  - You see the estimated cost and time before you start.
  - It runs on your own computer. The code is on GitHub (https://github.com/Legend101Zz/PanelSummary).
- **The sample:** "Four Tales by Hans Christian Andersen": 4 tales, 22 PDF pages, 18 manga pages, drawn in 7 min 08 s. The estimate before the run was 5 to 58 min. Set this as one sentence, not as number tiles.
- **The limits, stated honestly:** born-digital PDFs with selectable text, English, up to 75 PDF pages and 17,500 words in v0.1. Version 0.2 lets you choose sections of a longer book **[suggested]**.

**Hero page.** Use only real Andersen pages, under the title "Four Tales by Hans Christian Andersen".
- Pages 13, 17 and 18 pass the strict quality bar.
- Page 6 ("But the Emperor has nothing at all on!") has the best score. Its last panel still shows the Emperor in a robe, which is a known renderer limit. If you use it, call the manga "a first draft".

**Do not:**
- Use a split hero (copy on one side, the page on the other, a row of badges below) or a centred headline over a row of cards.
- Use stat tiles, or "X. Just Y." lines.
- Invent testimonials, user counts, logos, press or ratings.
- Use "AI-powered" slogans or quality claims.
- Put the "51 of 54 key points" number here.

**The sample manga (BUILT in v0.2):** the app ships the Andersen edition as a seeded sample book. "Read a sample" opens the reader at page 1 of the sample. The build seeds the sample from the v0.1 final-journey edition. The sample is a normal book on the shelf in every way, except that it needs no run and no model key.

---

## 3. First run [NEW]

The first run is ONE screen, not a step-by-step wizard. It replaces the empty shelf. Its job is to get the person to a real manga page quickly. It never blocks `/upload` or the book page: it is a page, not a redirect.

**What it shows:**
- **The server status in one line.** Show a full block only when something is wrong:
  - Not reachable: "Can't reach the PanelSummary server. Check that it is running (./start.sh)." **[suggested]**
  - No model key **[needs backend: a status endpoint the browser can read]**: "PanelSummary has no MiniMax key. Put MINIMAX_API_KEY in backend/.env, or in the macOS Keychain item minimax_api_key. Then run ./stop.sh and ./start.sh." **[suggested]**

    This state shows only when the drawing service was started without `./start.sh`, because `./start.sh` stops when no key is found. The check can see that a key is set. It cannot see if MiniMax accepts the key, so never show "key valid". A refused key shows during a run as "MiniMax refused the key".
- **The drop zone with all the limits:** a PDF with selectable text (not a scan), in English, up to 60 MB, 75 PDF pages and 17,500 words.
- **One sentence on cost and time** for the Andersen book (22 PDF pages), with the estimate and the real run side by side. For example **[suggested]**: "Before the run, the estimate was 11 to 18 manga pages, page 1 in 2 to 31 min, all pages in 5 to 58 min and $0.33 to $0.75. The real run made 18 pages: page 1 after 3 min 58 s, all pages after 7 min 08 s, an estimated $0.46 (not a bill)."
- **The sample manga**, ready to open: "Or read the sample first" (the sample ships in v0.2).

Do not show a carousel, "Next" steps or a tour.

---

## 4. Shelf (`/`)

**Copy:** heading "Your shelf". Lede: "Books you have added, and the manga drawn from them."

**Page states:**
- **Loading:** faded placeholders. They must look different from a cover with no art.
- **Error:** "The shelf could not be loaded." with the button "Try again".
- **Empty:** the first run (section 3) replaces this state. The v0.1 copy: "Nothing on the shelf yet". "Add a book as a PDF with selectable text. PanelSummary reads its chapters, and you choose when to draw it as manga." The word "chapters" becomes "sections" **[suggested]**.
- **With books:** a grid of book tiles.

### Book tile

- The cover is the first drawn manga page. Before page 1 is drawn, the cover is a plain sheet with a solid 1 px edge, with NO text and NO screentone. The title and author are set once, under it, as for every tile. The loading skeleton has no edge and no text, so it looks different.
- Below the cover: the title (up to 3 lines) and the author.
- The whole tile is a link to the book.

**Covers and thumbnails.** The page paper is #fbfaf6, and next to any light ground it gives only about 1.1:1, so the page needs an edge. Choose ONE:
- a 1 px edge, or
- a soft shadow with an offset and a blur.

Never use both on every tile in a row. Put the status band, the page number and labels outside the page art, never over it (today the band covers the bottom fifth of page 1). Minimum widths at 390: a shelf cover 160 px (2 columns) and a Pages-grid thumbnail 96 px, also at 60 pages.

### Status band: 15 states

| State | Copy | Family |
|---|---|---|
| The PDF is not readable | "Couldn't read this PDF" | Needs you |
| The PDF is being read | "Reading the PDF" | In progress |
| Parsed, not drawn | "Not drawn yet" | Not started |
| Queued | "Starting" | In progress |
| Reading the book | "Reading the book" | In progress |
| Planning | "Planning pages" | In progress |
| Drawing | "{6} of {16} pages drawn", with a thin progress line | In progress |
| Complete | "{18} manga pages" ("1 manga page") | Drawn |
| Completed with failures | "{14} of {16} drawn, {2} missing" | Needs you |
| Stopped by the user, some pages drawn | "Stopped at {3} of {16} pages" | Stopped by you |
| Stopped before any page | "Stopped before drawing" | Stopped by you |
| MiniMax limit | "MiniMax limit reached, {5} of {16} drawn", or "MiniMax limit reached" when no page was planned | Needs you |
| Key refused | "MiniMax refused the key, {a} of {t} drawn" | Needs you |
| MiniMax not answering | "MiniMax not answering, {a} of {t} drawn" | Needs you |
| Failed, no reason | "Drawing stopped". **[suggested]** "Stopped with an error" | Needs you |

The words carry the state, and the colour and a mark repeat it. Each of the four families has its own mark as well as its own colour:

| Family | Mark |
|---|---|
| Drawn | A solid band. |
| In progress | A thin progress line: filled to the fraction while pages are drawn, indeterminate before. |
| Needs you | A problem icon. |
| Not started, or stopped by you | An outline band. |

The band text is at least 13 px. It fits a 160 px cover at 390 on two lines, and it never cuts off the numbers.

**Stress cases:**
- A long title: "The Happy Prince and Other Tales (first two tales)".
- An author with a suffix: "Hans Christian Andersen (Project Gutenberg eBook #1597)".
- A failed book with no author ("scanned no text").
- 24 books.

**Optional [needs backend]:** a tile menu (rename, delete), and a quick "Resume drawing" or "Retry failed pages" on the tile.

---

## 5. Add a book (`/upload`)

**Copy:**
- Heading: "Add a book".
- Lede: "Choose a PDF with selectable text, up to 60 MB. It is uploaded to your PanelSummary server, which reads its text and finds its chapters." Change "chapters" to "sections" **[suggested]**.
- Note: "Nothing is drawn yet. You start the manga from the book's page when you are ready."

**Drop zone:** "Drop a PDF here", with the button "Choose a PDF". It needs a real `<input type="file">` (see the test hooks).

**[v0.2 #49]:** show ALL the limits here, before the upload: 60 MB, 75 PDF pages, 17,500 words, selectable text, English. Today only the 60 MB limit shows here. The other limits show only after the PDF is read.

**States:**
- **Idle.**
- **Drag-over:** today only the tint changes. **[suggested]** "Drop to add".
- **Several files dropped:** the app uses the first file only. Say so **[suggested]**.
- **Uploading:** the file name, the size "{4.2} MB" and 3 steps:
  - "Uploading, {42}%" with a bar.
  - "Read the text and chapters". **[suggested]** "Read the text and find the sections".
  - "Open the book".

  There is no cancel today. Propose one.
- **Reading the PDF:** step 1 shows "Uploaded". Step 2 shows "Waiting to read the PDF", then the job message, e.g. "Parsed 22 pages into 4 sections and 10 source units". **[suggested]** Show it as "Read 22 PDF pages and found 4 sections." ("Source unit" is an internal word.)
- **Slow:** after 20 s, show "Still waiting. The PDF is read by the PanelSummary job runner; check that it is running."
- **Done:** "Opening the book". The app then opens the book page by itself.
- **Already on the shelf:** "This book is already on your shelf."

**Errors.** Each error tells the problem and the next step:

| Problem | Copy |
|---|---|
| Not a PDF (by file name) | "{notes.txt} is not a PDF. Choose a .pdf file." |
| Too large | "{file} is {72} MB. The limit is 60 MB." |
| A scan with no text | "The PDF has no extractable text." or "The PDF has no extractable body text." Add a next step **[suggested]**: "Use a PDF with selectable text." |
| Not a PDF (by content, server) | "That file is not a PDF". The server also says "Only PDF files are supported" and "PDF too large (max 60 MB)". |
| No job started | "The server accepted the file but did not start reading it." |
| Read failed | "The PDF could not be read." |
| Other server answer | "The server answered {status}" |
| Other failure | "The upload failed." |
| No connection | "Can't reach the PanelSummary server. …" (see section 1) |

---

## 6. The book page (`/books/{id}`)

We call this page "the control room". That is a name, not a look: no cockpit, dial or console styling.

**Parts:**
- **The hero:** the cover, the title, the author, and the facts line "PDF: 22 pages, 4 sections, 4,775 words". After a run starts, the hero also shows the logline that the model wrote, e.g. "In four fairy tales, a vain Emperor, a shallow Princess, a doubtful Prince and a starving match girl each meet a test of true worth…"
- **The status area:** the stage, the progress, the actions and the notes.
- **The Pages grid.**
- **Contents.**
- **About this adaptation.**

**Reading order at 390.** The first screen after the header shows these, in this order. The cover, the Pages grid, Contents and About come after.

| Phase | First screen |
|---|---|
| Before a run | The title, the estimate, and Generate. |
| While it runs | The stage headline, the progress, "Start reading" (once page 1 is ready) and "Stop drawing". |
| When it ends | The result line (time, and the computed cost against the estimate), "Start reading", and Resume or Retry when needed. |

### 0. Whole-page states

- **Loading:** a cover placeholder and an empty title.
- **Not found:** "This book is not on your shelf." with a way back to the shelf.
- **Other load error:** "The book could not be loaded."
- **The PDF is not readable:** "This PDF could not be read. The PDF has no extractable text." Add **[suggested]** "Use a PDF with selectable text." Generate is off.
- **The PDF is still being read:** the facts line and the cover band say "Reading the PDF". Generate is shown but off.
- **No estimate available:** the "Before you start" panel is hidden, and Generate still works.

### A. Parsed, not drawn yet: the estimate and Generate

**Panel "Before you start" (the estimate):**
- Manga pages: "11 to 18 pages".
- Page 1 is ready in: "2 to 31 min".
- The whole book is ready in: "5 to 58 min".
- Cost (estimate): "$0.33 to $0.75".

Set this as a short labelled list, not as number tiles.

**Notes:**
- "This version adapts books up to 75 PDF pages and 17,500 words. This book is inside the limit."
- "These are estimates. Cost basis: Pi catalog estimate, not a bill. … Real times change with how busy the model is."

  Today this text is long and grey. **[suggested]** Make the short form "Estimate at MiniMax-M3 rates, not a bill." with the detail behind a disclosure. Remove the internal name "Pi catalog".

**Button:** "Generate manga" (a test hook). While the request runs, the label is "Starting". Under the button: "MiniMax reads the book's text and plans the pages; PanelSummary draws them. Pages appear here as they are drawn, and you can start reading as soon as the first one is ready."

**Over the limit:**
- A block: "This book is too large to draw".
- The reasons, e.g. **[suggested]** "This book has 150 PDF pages. PanelSummary can adapt books up to 75 PDF pages in one run." (the v0.1 text says "BookReel v0.1" and "75 pages") and "You can still read the PDF here. Longer books are planned for a later version."
- Generate is off: "Generate is off. [Add a shorter book] or go back to your shelf."

Screenshots `08` and `09` show a limit of 30 PDF pages because the test lowered the limit; the real limit is 75. `09` shows a 34-page book, and its backend text still says "BookReel v0.1".

**Generate refused:** "Generate did not start. {reason}" and then one of:
- "Nothing was started and nothing was spent. Choose a different book, or change the book and try again." (refused by the server)
- " Check that the server is running, then try again." (no connection)
- " Try again in a moment." (other errors)

**[v0.2 #40, BUILT in v0.2, needs backend] Choose sections of the book.**
- The user picks one or more sections from Contents.
- Each section shows its word count, and a meter shows how much of the limit the choice uses. The sections of the Andersen book have 1,869, 1,480, 411 and 1,015 words. The Happy Prince and Other Tales has 16,159 words in 5 tales: The Happy Prince 3,471 words (PDF pages 3–16), The Nightingale and the Rose 2,323 (17–26), The Selfish Giant 1,652 (27–33), The Devoted Friend 4,332 (34–50) and The Remarkable Rocket 4,381 (51–68).
- At 390 px, the ONE "Generate manga" button stays in the fixed bottom bar while sections are being chosen, so it is on the first screen (default 2).
- Keep ONE "Generate manga" button. Make the choice of sections a control above it, or name the section action differently, e.g. "Draw these sections" **[suggested]**.
- Later the user continues with the next section: "Continue with the next section" **[suggested]**. The next run reuses the cast and the looks of the sections already drawn.
- The app guesses sections from heading sizes, so they can be wrong. Design a fallback: choose a PDF page range, e.g. "PDF pages 3 to 40", when Contents has one section or looks wrong.
- Show two cases:
  - A 150-page book that is over the limit, where the user must choose. This book is an invented example: mark its title and numbers "sample".
  - "The Happy Prince and Other Tales" (68 PDF pages, 5 tales), which is inside the limit, where the user draws one section (one tale) to save time and money.

### B. While it runs

**Headline** (an aria-live region):
- "Waiting to start".
- "Reading the book".
- "Planning the pages".
- "Drawing page 7 of 16". With several pages at a time: "Drawing pages 7, 8 and 9 of 16". At the end: "Finishing {N} pages".
- "Stopping after the pages in progress".

**Steps:** "Reading the book", "Planning the pages", "Drawing the pages". Each step is done, current or next. Show the step state with a word or an icon as well as colour. The numbers 1, 2 and 3 are fine here, because the order is information.

**Progress:**
- One segment for each planned page. A segment is waiting, drawing, drawn or failed. Every segment state reaches 3:1 against its neighbour.
- Before the plan exists, an indeterminate bar.
- The line "6 pages drawn of 16", with ", {k} could not be drawn" when pages failed.
- **Stress:** 60 pages at 390 gives about 5 px for each segment. Show how the drawing and failed segments stay easy to find.

**Time:** "Running for 4 min 12 s".
- While the app reads and plans: "Reading and planning a long book can take 10 minutes or more. This page updates itself, so you can leave it open."
- Before page 1: "Page 1 comes first. This page updates itself."

**The page 1 moment:** "Page 1 is ready. Read it now while the rest is drawn." This is the most important moment of a run, and the ONE authored motion in the app (see the motion rule in the prompts).

**Actions:**
- Before page 1: "Page 1 not drawn yet" (disabled, tooltip "Available when page 1 is drawn") and "Stop drawing".
- After page 1: "Start reading" (or "Continue from page {n}") and "Stop drawing".
- After Stop is pressed: "Stopping" (disabled).

**[v0.2 #49, BUILT in v0.2, needs backend] Review the plan before drawing.** Issue #49 asks for a preview-and-approve step "before Generate". It sits after planning, because the plan must exist first. The owner decided on 10 October 2026: build it as a setting that is OFF by default.
- After "Planning the pages", the run waits.
- It shows:
  - The number of planned pages.
  - The cast, e.g. "The Emperor: the city's Emperor, vainly fond of new clothes".
  - One line for each page (the page beat; real beats are in `manga-pages/PAGES.md`).
  - The estimate to draw the pages, about $0.42 for the Andersen book.
  - "Spent so far: about $0.04 (estimate)" **[suggested]**. On the Andersen run, reading and planning took about 3 min.
- Buttons: "Draw the pages" and "Stop" **[suggested]**. Keep "Draw the pages" stable once it is chosen, because the test script must click it.
- This step is a setting that is off by default (owner decision), so the test script does not change. A "Checking the plan" step appears only when the setting is on.

### C. When it ends

**Complete:**
- "All 18 pages are drawn".
- "Took 7 min 08 s".
- "Start reading".
- **[suggested]** The result line: "Took 7 min 08 s. Page 1 was ready after 3 min 58 s. Estimated cost $0.46 (the estimate before the run was $0.33 to $0.75). Not a bill." Set it as one line or one range strip with the actual value marked, not as tiles. **[needs backend]** The API stores only the time of the first page drawn (`timings.first_page_at`: page 3, after 3 min 47 s, on this run), not the time of page 1.

**Completed with failures:**
- Headline: "Finished, but 2 pages are missing".
- Red segments for the failed pages.
- A failure panel: "2 pages could not be drawn", with one row for each failed page. A row has a link, a plain reason, and the raw text behind "Technical detail".
- Plain reason, e.g. "The model's drawings for this page were rejected every time they were checked." **[suggested]** "Each version of this page that the model wrote failed the page checks."
- Buttons: "Start reading" and "Retry failed pages" (a test hook). While the request runs, the label is "Retrying".
- Footnotes:
  - "Choose Retry failed pages above to try them again. The pages that are drawn stay as they are."
  - While pages are still drawing: "You can retry failed pages when the rest are drawn."
  - While a retry runs: "Drawing is starting again, and these pages will be tried again."

**Stopped by the user:** "Drawing stopped", "Stopped at 3 of 16 pages", and "Resume drawing" ("Resuming" while the request runs).

**Failed:**
- Today the headline is "Drawing stopped with an error", and the raw error shows, e.g. "understanding failed after 2 attempts: NO_SUBMISSION: …".
- **[suggested]** Name the stage: "Stopped with an error while reading the book", "…while planning the pages" or "…while drawing the pages". Give a plain sentence, with the raw text behind "Technical detail". The button is "Resume drawing".

**MiniMax stop: usage limit**

| Part | Copy |
|---|---|
| Headline | "Drawing stopped: MiniMax usage limit reached" |
| Title | "MiniMax stopped the drawing: usage limit reached" |
| Text | "MiniMax says the usage limit is reached (the plan limit or a short rate limit). Nothing more was sent, so nothing more was spent. The pages already drawn stay as they are, and 11 pages were not tried yet." |
| Next step | "Wait for the limit to reset, or add credits to the plan. Then press Resume drawing." |
| Technical detail | "rate_limit_error: Token Plan usage limit reached: Upgrade your Token Plan or purchase Credits for more usage. (2056)" |
| Buttons | "Start reading" and "Resume drawing" |

**MiniMax stop: key refused**

| Part | Copy |
|---|---|
| Headline | "Drawing stopped: MiniMax refused the key" |
| Title | "MiniMax did not accept the key or the plan" |
| Text | "MiniMax refused the request, so the drawing stopped. Nothing more was sent." |
| Next step | **[suggested]** "Check the MiniMax key on the PanelSummary server (MINIMAX_API_KEY) and your MiniMax plan. Then press Resume drawing." |

**MiniMax stop: not answering**

| Part | Copy |
|---|---|
| Headline | "Drawing stopped: MiniMax not answering" |
| Title | "MiniMax was not answering" |
| Text | "MiniMax did not answer after several tries, so the drawing stopped. Nothing more was sent." |
| Next step | "Wait a few minutes. Then press Resume drawing." |

**At 390,** the headline, the plain sentence, the next step and both buttons fit in the first screen, with "Technical detail" closed. The whole stop takes at most about 1,700 px before the Pages grid. Today the limit screen is about 3,000 px tall.

**Action errors:**
- "Drawing could not be stopped." or "Drawing could not be resumed."
- Then the server reason.
- Then " Try again in a moment." (or " Check that the server is running, then try again." when there is no connection).

### D. Pages grid

A heading "Pages" and "18 of 18 pages ready." Each page has a thumbnail and its page number.

| Thumbnail state | What shows | Link |
|---|---|---|
| Drawn | The real page. | Opens the reader. |
| Failed | Today: "Could not be drawn". | Opens the reader, which shows the reason. |
| Drawing | Today: an animated frame with "Drawing". | None. |
| Waiting | Today: "Waiting". | None. |

**Say a repeated state once.** Today "Waiting" repeats on 9 cells. Do not put "Waiting", "Drawing" or "Could not be drawn" on every cell. For example, write one line "Pages 8 to 16 are waiting", and show a plain sheet with only the page number.

**[data exists] Page beats.** Show the page beat in a way that works with touch and keyboard. For example, a "Show page beats" switch turns the grid into a list with one line for each page. You can also show the beat on focus as well as on hover. Do not use a long press.

**[data exists, no UI] Draw one page again.** The API can draw one page again when no run is active (`POST /editions/{id}/pages/{n}/redraw`). It replaces that page and costs about $0.02. Design "Draw this page again" **[suggested]** on a drawn page, with that cost note.

**Stress:** 60 pages (the 68-page book gave 60 pages), on a phone.

### E. Contents

- A heading "Contents" and "As found in the PDF".
- One row for each section: the number, the title and a link to the PDF viewer. The numbers are fine here, because the order is information.
- Today the link reads "pages 3–9". **[suggested]** "PDF pages 3–9".
- **[data exists] [suggested]** Also show the manga pages of each section. The manga page ranges show only after planning (Round 2d), because the plan sets them.

The rows for the Andersen book:

| Section | PDF pages | Manga pages |
|---|---|---|
| The Emperor's New Clothes | 3–9 | 1–6 |
| The Swineherd | 10–16 | 7–12 |
| The Real Princess | 17–18 | 13–14 |
| The Little Match Girl | 19–22 | 15–18 |

### F. About this adaptation

A disclosure, closed by default. It shows after a run.

- **Coverage:** today "The pages convey 51 of the 54 key points PanelSummary found in the book." **[suggested]** "The model marked 51 of the 54 key points as shown on the pages." Before every page is attempted: "Coverage is reported when every page has been attempted."
- **Lists:**
  - "Left out on purpose", with the planner's reasons ("No reason was given." when there is none).
  - "Lost with the pages that could not be drawn".
  - "Not planned into any page".
- **How it was made:** today "written and planned by MiniMax-M3.1-Flash-Preview through apps/agent-worker (Pi sealed session) → MiniMax, drawn by the PanelSummary renderer. Image models: none. 715,490 tokens." **[suggested]** "MiniMax ({model}) read the book, planned the pages and wrote the lettering. The PanelSummary renderer drew each page as SVG. No image-generation model was used." The `{model}` value comes from the run.

---

## 7. PDF viewer (`/books/{id}/source?page=N`)

You can restyle it, but it must stay in the same family as the dark reader.

- **Layout:** a full-screen dark room with a 56 px top bar and a 60 px bottom bar. The PDF page is a white image, up to 900 px wide.
- **Top bar:** "Back to the manga" (when the user came from the reader) or "Back to {book title}", and the counter "PDF page {3} of {22}".
- **Bottom bar:** previous and next (44 x 44), and a number box "Go to PDF page". The keys are Left and Right, Page Up and Page Down, Home and End.
- **States:**
  - Loading.
  - "This book's PDF is not available."
  - "The PDF could not be loaded."
  - "This page could not be shown."

---

## 8. Settings / About [NEW]

This page is read-only in v0.2, except where it says **[needs backend]**. Show where a future control would sit.

**Server status [needs backend]:** the PanelSummary server is reachable, the job runner is running, and the drawing service has a key set. "Set" is the most the check can say, not "valid".

**Models for each step:**

| Step | Model | Thinking (sent) |
|---|---|---|
| Book understanding | MiniMax-M3.1-Flash-Preview | low |
| Page plan | MiniMax-M3.1-Flash-Preview | low |
| Page drawing | MiniMax-M3.1-Flash-Preview | low |

The note under the table **[suggested]**: "The server asks for no thinking on the plan and the pages, but the Flash model cannot turn thinking off, so it gets 'low'. A retry uses 'medium'. The owner can set any step to MiniMax-M3 with an environment setting. The app does not change models by itself. Each page gets a PNG preview of itself to check."

**Controls to change these settings** are not built. Show "Check again" (server status) and "Change models" as DISABLED controls with the text "Not available in this version" (default 9). Do not write "Needs backend" in the interface.

**Other content:**
- **Limits:** 60 MB, 75 PDF pages and 17,500 words. A page gets 2 tries, and 4 pages are drawn at the same time.
- **Where the data is:** on your computer, in MongoDB and the stored PDFs.
- **What leaves your computer [suggested]:** "The book text and a PNG preview of each drawn page go to MiniMax (api.minimax.io). In the final v0.1 test run, the drawing service contacted no other host. No image-generation model is used."
- **Cost note [suggested]:** "Costs are estimates at MiniMax-M3 rates, because MiniMax publishes no price for the M3.1 Flash model. They are not a bill."
- **Version:** v0.2. v0.1.0 was released on 9 October 2026. Add a link to the GitHub project: https://github.com/Legend101Zz/PanelSummary.
- **Credits:** the UI fonts of this design, plus Comic Neue and Bangers (the manga lettering), all under the SIL Open Font License. The sample texts are from Project Gutenberg.

---

## 9. The reader (reference only)

Do not redesign the reader. The v0.2 build changes these things in its current look:
- **#53:** the page fills more of a desktop screen. Today the page is about 485 x 728 px at 1440 x 900, so the balloon text is about 9 to 11 px.
- **#49:** a page picker that works for 40 to 60 pages. Today each tick is 11 px wide on a phone.

Optional, clearly separate from the rest: one idea for the page picker at 60 pages, in the reader's CURRENT dark style.

---

## 10. Data you can show (it exists in the API today)

- **For each book:** the title, the author, the PDF pages, the words, the sections (with a word count each) and the status.
- **The estimate:** the manga pages (low to high), the minutes to page 1 and to the end, the cost (low to high), the limits, and whether the book is within the limits, with the reasons.
- **For each run:**
  - The status and the stage.
  - Pages done of total, and the status of each page.
  - The time it started, the start of drawing, the first page drawn (any page number, not always page 1) and the end.
  - The computed cost (e.g. $0.46, an estimate) and the model calls (e.g. 20).
  - The model for each step.
  - Coverage as the model reports it: 54 key points, of which 51 are marked as shown and 3 are left out with reasons.
  - The cast (name and role), a one-line beat for each page, and the manga pages of each section.
- **Not available:** user accounts, more than one run for each book in the UI, and delete or rename (no API).
- **Out of scope (the owner chose this):** a full receipts or "behind the scenes" screen. A short "How it was made" line is enough.

---

## 11. Notes for the v0.2 build (not for the design)

- Set `NEXT_TELEMETRY_DISABLED=1` in `start.sh`. Without it, the Next.js development server can send anonymous usage data to Vercel, and then the "What leaves your computer" sentence is not true.
- Change the backend sentences that say "BookReel v0.1" to "PanelSummary".
