# PanelSummary v0.2 design

This folder holds the finished v0.2 redesign as documents. The design was made in Claude Design (rounds 1 to 4b, 9 to 10 October 2026). The frames are on the SSD, not in this repository. This folder has no UI code.

| File | What it is |
|---|---|
| `PRODUCT.md` | Who uses PanelSummary, what it does, the terms, the limits and the owner decisions. |
| `DESIGN.md` | The design system: colours, type, layout, shapes, components, do and don't. The YAML front matter holds the token values. |
| `tokens.css` | The normative token file. The UI foundation imports it. |
| `SCREENS-AND-STATES.md` | Every screen, every state, the copy, the test hooks and the build notes. |
| `PAGES.md` | The real Andersen page beats. Use these as test data. Never invent beats. |

The root files `PRODUCT.md` and `DESIGN.md` are symbolic links to the two files here. The impeccable tool reads the root files. The links keep both copies the same.

## Where the frames are

The frames are on the SSD. Do not commit them or the zips.

- Final design (round 4b, 62 standalone pages): `/Volumes/Mrigesh SSD/Book-Reel-scratch/design-v02/from-claude-design/round-4b/round-4b/`
- The zip of it: `/Volumes/Mrigesh SSD/Book-Reel-scratch/design-v02/from-claude-design/round-4b.zip`
- Kit (inputs to the design, real manga page PNGs in `manga-pages/`): `/Volumes/Mrigesh SSD/Book-Reel-scratch/design-v02/kit/`
- Chat replies and the run log: `/Volumes/Mrigesh SSD/Book-Reel-scratch/design-v02/from-claude-design/chat-log/`

## Open the prototype offline

1. Mount the SSD.
2. Open this file in Chrome: `/Volumes/Mrigesh SSD/Book-Reel-scratch/design-v02/from-claude-design/round-4b/round-4b/0-prototype/Prototype.html`
3. Open `index.html` in the same folder to see the list of every board.

No server and no network are needed. Do not use `localhost` for the app pages (Chrome has a saved zoom for it). Use `http://127.0.0.1:<port>`.

## Frame folder to screen

Folders are under `round-4b/round-4b/`.

| Frame folder | Screens |
|---|---|
| `0-prototype/` | The click-through prototype of the full flow (offline). |
| `1-final/` | Final shelf (light, dark), final book page (light, dark, 390), landing (light), handover, tokens. |
| `2-components/` | Run card, run strip (tone strip), other parts. |
| `3-directions/` | Round 1 directions A to F. Direction F won. For history only. |
| `4-round-2a/` | Shell (header menu, skip link, footer), shelf, Add a book, component library sheet. |
| `5-round-2b/` | Book page: loading, not found, errors, estimate, over the limit, refused, starting, run states, the page 1 moment. |
| `6-round-2c/` | Book page end states (`Book-C`: complete, completed with failures, MiniMax usage limit; `Book-C2`: retrying, stopped, failed, MiniMax key and no-answer stops, action errors; `Book-DEF`: About, Contents, page beats, the 60-page Pages grid). |
| `7-round-3a/` | Landing page and first run. |
| `8-round-3b/` | Settings, PDF viewer (dark only), 404, crash page, "Server not reachable" band. |
| `9-round-3c/` | Choose sections (6A), review the plan (6B), reader page-picker idea (reference only). |
| `10-design-system/` | `DS-foundations.html`, `DS-states.html`, `DS-components.html`, plus `DESIGN.md` and `tokens.css`. |

The landing page frames show the showcase variant too. v0.2 builds the local variant only.

## Decisions

The design decided these. Do not open them again.

- Light theme from direction F: ground #F4F5F0, white cards, ink outlines, one blue action #2F43D9, mint for done #5CC6A0, coral for needs-you #EE6A45 (a fill only), yellow #F7DD5A only for the page 1 moment.
- Dark theme is the reader's graphite reading room: ground #26272A, cards #2E2F33, text #ECEBE6. No near-black and no pure white.
- One family: Bricolage Grotesque, self-hosted, with tabular figures for every time and cost.
- Signature move: the tone strip (one segment for each planned page).
- Theme setting: Light, Dark or "Use the system setting". The default is the system setting.
- Routes: the shelf is at `/`. The first run replaces the empty shelf at `/`. The landing page is at `/welcome`. Settings is at `/settings`.

Owner decisions of 10 October 2026:

- No deploy in v0.2 (issue #52). The release is a GitHub release plus a local `./start.sh`. Build the local landing variant at `/welcome`. Keep the showcase frames for later.
- Build "Choose sections" (issue #40, frame 6A) and "Review the plan" (issue #49, frame 6B). Plan review is a setting. It is off by default.
- Ship the built-in sample manga: the Andersen edition from the v0.1 final journey ("Four Tales by Hans Christian Andersen", 18 manga pages). The first run shows "Or read the sample first". The landing page shows "Read a sample" next to the drop zone. The sample is built, so it carries no "needs backend" mark.
- The live spend cap for v0.2 is $50.

## Defaults applied to open design points

| # | Point | Default applied | Where |
|---|---|---|---|
| 1 | Cover with no art | A plain sheet with a solid 1 px edge, no text, no screentone. Title and author once, under it. The skeleton (no edge, no text) looks different. This follows Choice 2, item 5. | `DESIGN.md` Components, Skeleton |
| 2 | Choose sections at 390 | The one "Generate manga" button stays in the fixed bottom bar while sections are chosen. | `DESIGN.md`, `SCREENS-AND-STATES.md` |
| 3 | Phone page 1 band | It lives in the bottom bar (Round 2b). | `DESIGN.md` Moment band |
| 4 | Dark tone strip | Drawn is solid app-text. Waiting is fine tone inside an edge. Two questions stay open (below). | `DESIGN.md` Progress strip |
| 5 | Hook names while busy | "Generate manga: starting" and "Retry failed pages: retrying". Visible labels: "Starting", "Retrying". | `SCREENS-AND-STATES.md` Test hooks |
| 6 | Drop place corners | 22 px everywhere. The "Add a book" tile was 12 px. | `DESIGN.md` Shapes |
| 7 | Designer copy | Kept. Listed below. Cast names, beats, coverage and timings come from real API data. | this file |
| 8 | Old-token table | Checked against `frontend/app/globals.css` and fixed. | `tokens.css` header |
| 9 | Settings "Check again", "Change models" | Disabled, with "Not available in this version". | `SCREENS-AND-STATES.md` section 8 |
| 10 | Landing GitHub link | https://github.com/Legend101Zz/PanelSummary | `SCREENS-AND-STATES.md` section 2 |
| 11 | Build notes | Kept as build tasks: `NEXT_TELEMETRY_DISABLED=1` in `start.sh`, and "BookReel v0.1" to "PanelSummary" in `backend/app/preflight.py`. A separate track does the code. | `SCREENS-AND-STATES.md` section 11 |

Other build notes: `tokens.css` expects the font file at `/fonts/BricolageGrotesque-VF.woff2`. Put `.app-root` on the app layout and never on the reader. The PDF viewer uses `.app-reading-room`.

## The open points from the design run, and how each one ended

Source: `chat-log/RUN-LOG.md`, section "Open points for the owner". "Default" means a default above. "Owner" means an owner decision of 10 October 2026. "Open" means nobody has decided.

| # | Round | Point | Status |
|---|---|---|---|
| 1 | Choice 1 | Dark drawn segments #B4B5B8 instead of paper #ECEBE6 (not answered) | Open (owner question 1) |
| 2 | 2a | A cover with no art: text on the sheet (Round 2a) or none (Choice 2, item 5) | Default 1 |
| 3 | 2a | Two shorter band labels: "MiniMax: key refused", "MiniMax: no answer" | Default 7 (kept, listed below) |
| 4 | 2a | Earlier frames not rebuilt from the new components; the ink focus ring in the yellow band is left for the build | Build task. `tokens.css` has `--app-focus-on-moment` |
| 5 | 2b | The page 1 band moves to the bottom bar on a phone | Default 3 |
| 6 | 2b | In the "Starting" frame no button holds "Generate manga" | Default 5 |
| 7 | 2b | Designer copy: the Not found sentence, the No estimate line, run card B note | Default 7 (listed below) |
| 8 | 2b | The Wilde estimate uses v0.1 screenshot numbers and the 75-page limit; "Pi catalog" removed | The build uses real API data. "Pi catalog" stays out |
| 9 | 2c | 11 Andersen thumbnails are cut from the v0.1 screenshot and are soft | Design only. The build uses the real sample pages |
| 10 | 2c | Copy changes: the MiniMax stop has no "Title" line; one short sentence at 390; the retry and read buttons sit above the failure panel | Default 7 (kept) |
| 11 | 2c | Invented text: "Left out on purpose" points, raw error texts, server reasons, the 8 min 40 s run time | Default 7. The build shows real data only |
| 12 | 2d | A drawing segment next to a waiting one is under 3:1 by colour alone; outline-only waiting segments in dark | Open (owner question 2) |
| 13 | 2d | Test hooks "Generate manga: starting" and "Retry failed pages: retrying"; no "Generate manga" once a run exists; the `&from=` link form is only in the reader | Default 5 |
| 14 | 3a | Opening phrase "Your book's PDF, drawn as a manga" | Default 7 (listed below) |
| 15 | 3a | GitHub link target | Default 10 |
| 16 | 3a | "Check again" is a secondary button; the limits line reads "Choosing sections of a longer book is planned" | "Check again" is disabled (default 9). The limits line needs new words, because sections are built in v0.2 (listed below) |
| 17 | 3a | The sample is marked "needs backend"; the public showcase is undecided (#52) | Owner: sample built; no deploy |
| 18 | 3b | Copy: the crash page lines, the "Report it on GitHub" link, the tab titles | Default 7 (listed below) |
| 19 | 3b | Settings shows two disabled controls with "Needs backend: ..." reasons | Default 9 |
| 20 | 3b | The range bars in the run card are an outline inside an outline | Fixed in Round 4b |
| 21 | 3c | At 390 the card is long and "Generate manga" falls below the first screen | Default 2 |
| 22 | 3c | Cast names and roles are the designer's | Default 7. The build uses the real cast from the API |
| 23 | 3c | Plan review assumed to be a setting, off by default | Owner: confirmed |
| 24 | 3c | The meter fill is ink, not blue; the estimate panel labels can change | Accepted, in `DESIGN.md` |
| 25 | 4a | The old-token table was written without the v0.1 code | Default 8 |
| 26 | 4a | The wdth axis is held at 100; the font path; `.app-root`; `.app-reading-room` | Recorded in `DESIGN.md` and `tokens.css` |
| 27 | 4a | New tokens and changed values (hover, pressed, wash-2, drag-over fill, dark track, meter edge) | Accepted, in `tokens.css` |
| 28 | 4b | Claude no longer had the original Round 1 and Choice wording after the compactions and checked "against the rules as I have them recorded" | Open. No fix is possible. The build review checks the screens against `SCREENS-AND-STATES.md` |
| 30 | 2d | Contents shows manga page ranges only after planning | Kept as designed; recorded in `SCREENS-AND-STATES.md` §6 E |
| 29 | after 4b | Claude's open questions in the chat, the HTML export that failed, no handoff file | Not needed. The zip has every board as a standalone page |

## Copy waiting for owner approval

Keep this copy in the build. The owner has not approved it yet. The exact words are in the frames and in `SCREENS-AND-STATES.md` (marked **[suggested]**).

- The Not found sentence on the book page (frame `5-round-2b/Book-0-A.html`, "Not found").
- The No estimate line: "There is no estimate for this book, so the time and the cost are known only after the run."
- Run card B note: "Four pages are drawn at the same time."
- The crash page lines, including "Your books and drawn pages are safe on your computer" and the "Report it on GitHub" link.
- The opening phrase on the landing page: "Your book's PDF, drawn as a manga".
- The tab titles of every page.
- The two shorter band labels: "MiniMax: key refused" and "MiniMax: no answer".
- The "Left out on purpose" points in About, the raw error texts, and the server reasons in the action errors (the build shows real values).
- The limits line on the landing page. Its frame text says "Choosing sections of a longer book is planned". Sections are built in v0.2, so the words need a change.
- Every other string marked **[suggested]** in `SCREENS-AND-STATES.md`.

## Open owner questions

1. In the dark theme, should drawn tone-strip segments be grey #B4B5B8 instead of paper #ECEBE6?
2. In the dark theme, should waiting tone-strip segments be outline-only with no dots? (A drawing segment next to a waiting one is under 3:1 by colour alone.)

Until the owner answers, the build keeps the design as drawn: drawn is solid app-text, waiting is fine tone inside an edge.
