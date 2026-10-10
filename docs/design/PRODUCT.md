# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is one person: the owner of the PanelSummary server. They have a book as a PDF and want to read it as a manga. They want the story fast, or they want to give a book to someone who does not read long text.

They run PanelSummary on their own computer and use it on a laptop. In v0.1 a phone cannot reach the app, because the server listens only on this computer. v0.2 has no hosted setup (owner decision, 10 October 2026), but every screen must still work at 390 px, because a later hosted setup can change this.

## Product Purpose

PanelSummary changes a born-digital PDF book into a black-and-white manga that you read in the browser. A language model reads the text of the book and plans the pages. For each page it writes a page plan: the panels, the figures and the lettering. The PanelSummary renderer then draws each plan as SVG.

Success means four things:
- A person adds a book and sees the estimated cost and time before they start.
- They see the pages arrive.
- They can start to read when page 1 is ready.
- They read a manga that stays close to the book and shows where each part comes from.

## Positioning

No image-generation model makes the art: PanelSummary's own code draws every page. In the reader, the Sources drawer lists each panel with its lines. It links each panel to the PDF pages it comes from, and it marks each line as quoted, paraphrased, dramatized or an added metaphor. The app shows a cost estimate before the run and keeps a receipt for each model call.

## Operating Context

- Local first. `./start.sh` starts the PanelSummary server on this computer and prints the app address, http://localhost:3100.
- The model key is only in the drawing service, one process of the PanelSummary server.
- There is one flow:
  1. Add a book (a PDF).
  2. The book page shows the estimate.
  3. Generate manga.
  4. Watch the progress.
  5. Read.
- A run takes from about 7 minutes to about an hour.
  - The Andersen book (22 PDF pages, 18 manga pages) was the fastest measured run: page 1 after 3 min 58 s and all pages after 7 min 08 s. Its estimate before the run was 5 to 58 min.
  - The 68-page book took 16 to 49 min.
- A run uses the owner's MiniMax plan. The app computes a cost in US dollars from the token counts at MiniMax-M3 rates, because MiniMax publishes no price for the Flash model. This cost is an estimate, not a bill. For the 18-page Andersen manga it was $0.46.
- The plan can run out (error 2056). The app then stops the run. The user can resume it later.

### Owner decisions for v0.2 (10 October 2026)

- **Deploy (issue #52):** there is no deploy in v0.2. The release is a GitHub release plus a local `./start.sh`. The landing page at `/welcome` is the local variant, with the working drop zone. The showcase frames stay in the design for later.
- **Choose sections (issue #40) and review the plan (issue #49):** both are built in v0.2. Plan review is a setting. It is off by default.
- **Built-in sample manga:** yes. The v0.1 final-journey Andersen edition ("Four Tales by Hans Christian Andersen", 18 manga pages) ships as a seeded sample. The first run shows "Or read the sample first". The landing page shows "Read a sample" as a secondary action next to the drop zone.
- **Live spend cap for v0.2:** $50.

## Capabilities and Constraints

- **Input:** a born-digital PDF with selectable text, in English. The limits in v0.1 are 60 MB, 75 PDF pages and 17,500 words. The app refuses a larger book before it spends money. v0.2 adds the choice of sections of a longer book (issue #40).
- **Output:** manga pages with a 2:3 ratio (SVG viewBox 1000 x 1500), black and white with screentone, on paper colour #fbfaf6. The lettering uses Comic Neue and Bangers. The renderer sets the page art, and the UI must not change it.
- **Reader and page art (out of scope):** the manga reader (`/books/{id}/read`) and the generated page SVG are out of scope for restyling. They stay as they are. Issues #53 (page size on a desktop) and #49 (page picker) change the behaviour of the reader, not its look. The reader keeps its own tokens (graphite, pencil, redpen, sheet, ink) in `frontend/app/globals.css`. The tools that read this file (impeccable) must not edit `frontend/components/reader/**`, `frontend/app/books/[id]/read/**`, `frontend/components/SvgPage.tsx` or `packages/manga-render/**`.
- **Run states:** queued, reading the book, planning the pages, drawing the pages, complete, completed with failures (some pages could not be drawn), stopped by the user, failed, and stopped by MiniMax (usage limit, refused key, or no answer).
- **What leaves the computer:** the book text and a PNG preview of each page while it is drawn. Both go to MiniMax (api.minimax.io) and to no other host. The model looks at the preview to check the page.
- **Not available today:** accounts, payments and sharing; delete or rename of a book; a status check that the browser can read (the API has only /health). A built-in sample manga is a v0.2 build task (owner decision above).
- **Not in v0.2:** a public, read-only showcase of finished manga for visitors (issue #52). The visitor for the landing page is "a person who found PanelSummary on X, Instagram or a similar site, as a product they want to use" (owner, 9 October 2026).
- **Stack:** Next.js 15 App Router and React 19. Styles use CSS Modules and one `globals.css` with CSS custom properties. Fonts are self-hosted under the SIL OFL. There is no UI library.
- **Terms:** use one term for each concept.

  | Term | Meaning |
  |---|---|
  | book | The PDF that the user adds. |
  | manga | The drawn result. |
  | manga page | A page of the manga. Write "page" when only manga pages are on the screen. |
  | PDF page | A page of the source PDF. When a line names both kinds of page, write "PDF page" and "manga page". |
  | section | A part of the book as the PDF's contents list shows it (a chapter or a tale). Use "section" in all copy. |
  | shelf | The list of the user's books. |
  | key point | A claim from the book that the plan tries to show. |
  | draw | Make the manga pages. This is the user's word for the whole run. The button "Generate manga" keeps its name because a test reads it. |
  | PanelSummary server | All PanelSummary processes on the owner's computer. Do not write "backend" in copy. |
  | job runner | The process that reads PDFs and runs the steps. |
  | drawing service | The process that holds the MiniMax key and calls MiniMax. Do not write "worker" in copy. |
  | edition | One run. This is an internal word, so do not show it to users. |

## Brand Commitments

- The name is PanelSummary. The GitHub repository is Legend101Zz/PanelSummary.
- Some places still say "BookReel": the local folder, some older documents, the v0.1.0 release title and some backend text. v0.2 changes the backend text.
- The voice is plain, calm and exact. All copy and documents use Simplified Technical English:
  - Short sentences in the active voice.
  - One term for each concept.
  - No idioms and no hype.
  - Say what happened, why it happened, and what to do next.
- The manga pages are the hero. Nothing in the interface competes with a page for attention.
- Every number is honest:
  - Label each estimate as an estimate.
  - A computed cost is "an estimate, not a bill".
  - A model's report about its own work says that it is the model's report.

## Evidence on Hand

- **Real finished manga:** "Four Tales by Hans Christian Andersen" (22 PDF pages, 18 manga pages).
  - The model marked 51 of the 54 key points as shown on the pages. This is the model's own report, and nobody checked each point.
  - PNG renders of the 18 pages are in the design kit at `/Volumes/Mrigesh SSD/Book-Reel-scratch/design-v02/kit/manga-pages/`, not in the repository.
- **Measured quality (v0.1.0 release notes):** three AI judges (Claude Sonnet models) scored each page from 1 to 5 on 8 criteria. No person scored the pages.
  - The strict quality bar is: no criterion below 3, legibility and fidelity 4 or more, and a mean of 3.5 or more.
  - Only some pages pass it: 12 of 60 on the 68-page book and 3 of 18 on the Andersen book.
  - The mean is about 3.5 of 5, and fidelity on the Andersen book is 3.48.
  - Do not claim "perfect" or "publication quality". It is honest to call a result "a first draft of the book as manga".
- **Lines on the Andersen pages:** 135 lines in total. 37 are quoted, 92 paraphrased and 6 dramatized.
- **Test books:**
  - The Happy Prince and Other Tales (Oscar Wilde, 68 PDF pages, 16,159 words).
  - The Happy Prince, two tales (26 PDF pages).
  - On the Duty of Civil Disobedience (Thoreau, 34 PDF pages).
- **What does not exist:** users, testimonials, press, customer logos and usage numbers. Do not invent them.

## Product Principles

1. The manga is the most important thing on every screen. The interface helps the person reach it and does not compete with it.
2. Before the run, show the estimated cost and time. After the run, show the measured time and the cost that the app computed. Label that cost as an estimate, not a bill.
3. Every state has words: what is happening, what happened, and what to do next.
4. Stay close to the book, and show where each part of a page comes from.
5. Nothing is lost: drawn pages stay, and a stopped run can resume.
6. The frame never restyles the manga. The reader and the page SVG are out of scope: the interface changes around them, not in them.

## Accessibility & Inclusion

Follow WCAG 2.2 AA. Two rules are stricter than AA: the 44 x 44 px tap target, and 3:1 for every page edge and progress segment that carries a state.
- Text contrast is at least 4.5:1 (3:1 for large text).
- Controls, focus rings, progress segments, page edges that carry a state, and status marks reach at least 3:1 against what is next to them.
- Tap targets are at least 44 x 44 px. This is our own rule; AA needs 24 x 24.
- Keyboard focus is visible.
- Status is never shown by colour alone.
- Animations respect the reduced-motion setting.
- Screen readers announce progress (aria-live).
- Every screen works at 390 px wide with no horizontal scroll.
