# BookReel v0.1.0

BookReel (PanelSummary) turns a born-digital PDF book into a manga that you can read in the browser.
There is one path: upload the PDF, read the preflight, click Generate, watch the pages arrive, read them.
Every model call goes to MiniMax through one sealed harness. No image-generation model is used: the art
is deterministic SVG.

## What works

1. Upload a PDF. The book page shows the parsed sections and a preflight: the expected number of manga
   pages, the time to page 1 and to the end, a cost estimate with its basis, and the size limits.
2. Click **Generate manga**. The page shows the step (reading the book, planning the pages, drawing the
   pages), which pages are being drawn, "page N of M", the running time, and a link to page 1 as soon as
   it is ready.
3. Read the pages in the reader, page by page or panel by panel (phone). The reader shows the exact SVG
   that was accepted and stored.
4. A page that fails twice is shown as failed, with the reason in plain words and a way to try it again.
   An edition with a failed page ends `completed_with_failures`, never `complete`.
5. If MiniMax refuses (for example a plan limit), the job stops at once, says so in plain words, keeps
   the pages that are drawn, and **Resume drawing** continues later. Accepted pages are never paid twice.

## Architecture as shipped

PDF (PyMuPDF) → `BOOK_UNDERSTANDING` → `ADAPTATION_PLAN` → one `MANGA_PAGE` goal for each page (four in
parallel, with a PNG preview for the model) → `packages/manga-render` 0.5.0 (deterministic SVG) →
MongoDB `edition_pages` → reader. The goals run in sealed Pi sessions (`packages/agent-runtime`) inside
`apps/agent-worker`, the only process that holds the MiniMax key. A Mongo-leased job runner drives the
work. Every call has a receipt (model, thinking asked and sent, tokens, cost basis, latency, skill hash).

Model policy (D13, measured): `MiniMax-M3.1-Flash-Preview` on all three goals (understanding thinking
`low`, plan and pages `off`, sent as adaptive effort `low` because Flash cannot turn thinking off; retries
`medium`). `MiniMax-M3` is the fallback for every goal through environment settings. The A/B evidence is
in `docs/launch/MODEL-AB.md`.

## Quality, measured

A panel of 3 Sonnet judges scored every page against the run-8 rubric (8 criteria, 1 to 5; the strict
ship bar needs no criterion below 3, legibility and fidelity of 4 or more, and a mean of 3.5 or more).
The panel is a different instrument from the single judge of earlier runs, so run 8 was judged again
by the same panel.

| Run | Pages | Ship bar | Mean | Continuity | Fidelity | Page 1 / done | Cost (estimate) |
|---|---|---|---|---|---|---|---|
| Run 8 (Sept.), single judge | 46 | 5 | 3.37 | 2.43 | 2.93 | 30 min / 48.5 min | $1.65 |
| Run 8, same panel | 46 | 7 | 3.47 | 2.88 | 3.34 | | |
| Gate 2: the same 68-page book on v0.1 | 60 | 12 | 3.54 | 3.02 | 3.51 | 5.6 min / 16.4 min | $1.72 |
| Final journey: an untuned book (four Andersen tales, 22 PDF pages), fresh database, real browser | 18 | 3 | 3.53 | 2.76 | 3.48 | 4.2 min / 7.3 min (walk log) | $0.46 |

Gate 2 (the same 68-page book as run 8, all 60 pages accepted):

- Against run 8 judged by the same panel, every condition holds. Ship bar 12 against 7. Mean 3.54 against
  3.47. Continuity 3.02 against 2.88. No criterion is more than 0.2 lower (the worst is speaker
  attribution, -0.11).
- Against the single-judge numbers of run 8, the bar is not met on one condition. The ship bar (12 against
  5), the mean and continuity pass. Reading flow is 3.97 against 4.41 (-0.44), and speaker attribution is
  3.53 against 3.83 (-0.30). The same panel gives run 8 itself 3.97 and 3.64 on these two criteria, so
  most of the gap comes from the instrument. The page sets are not the same (60 pages against 46).

On the final journey, all 18 pages were accepted, 51 of 54 claims were shown (3 were left out with a
reason), the reader showed the stored SVG on every page, and the worker talked only to
`api.minimax.io` (zero image-model calls).

## Known limits

- **Size:** a book over 75 PDF pages or 17,500 words is refused before any spend (D19). Chapter scoping
  is v0.2.
- **Drawing vocabulary:** the renderer cannot draw some things a story needs (an undressed person, a
  kitchen pot, a stove, a roast goose, a heart, an angel). Such beats end up in captions. This caused
  the worst pages of the final journey (the Emperor stays clothed).
- **Weakest criteria:** continuity across pages and pages that tell a beat in captions. Tiny figures and
  balloon tails did not improve in this release.
- **Cost:** Flash has no published price; every Flash cost is an estimate on M3 rates. Costs are Pi
  catalog estimates, not a bill. The real limit can be the MiniMax account's token plan.
- **Evidence size:** one or two runs per A/B arm, mostly one book. The judge panel is not the single
  judge of the old baseline.
- Born-digital PDFs only. English, left to right.

## Run it

See `README.md`: `./start.sh` starts MongoDB, the worker, the API, the job runner and the reader on
`http://127.0.0.1:3100`; `./stop.sh` stops only what it started. CI runs on every pull request; a live
journey runs from a `live/**` branch (`docs/launch/CI.md`).

## Deferred to v0.2

Chapter-scoped generation and chunked continuation, resumable project memory, more renderer props and
looks, scale and tail fixes, caption-wall limits, a wider page picker, and the items listed in the v0.2
issues.
