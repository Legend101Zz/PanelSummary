# PanelSummary v0.2.0

PanelSummary turns a born-digital PDF book into a manga that you read in the browser. v0.2 has a new
app UI, lets you draw part of a book, can stop for a plan review, ships a built-in sample, and draws
better pages. Every model call still goes to MiniMax through one sealed harness, and no image-generation
model is used: the art is deterministic SVG.

## What is new

### The app (new design)

- **A new look, in light and dark.** Light is a cool print room (off-white ground, white cards, ink
  outlines, one blue action colour). Dark is the reader's own graphite reading room, so the app and the
  reader feel like one room. Choose Light, Dark or "Use the system setting" (default). The theme is
  applied before the first paint, so there is no flash of the wrong theme.
- **One typeface, self-hosted.** Bricolage Grotesque (variable, SIL OFL) is served by your own server.
  The app makes no third-party request at run time (verified with a network capture of the final
  journey: only `127.0.0.1`).
- **First run.** An empty shelf shows one screen: the server status, the drop zone with every limit,
  the real numbers of the sample run, and "Or read the sample first".
- **The sample.** "Four Tales by Hans Christian Andersen" (18 pages, the v0.1 final-journey run) ships
  with the app. It is installed only when you open it. Every number about it is the real run's.
- **Add a book** shows every limit before you upload (60 MB, 75 PDF pages, 17,500 words, selectable
  text, English) (#49), every error with its next step, and a cancel.
- **The book page** ("the control room"): the estimate before you start; one **Generate manga** button;
  a run card that tells the truth while it draws (the stage, the steps, the **tone strip** with one
  segment per planned page, pages drawn, time); **the page 1 moment** (a yellow band, the one authored
  motion in the app) when page 1 is ready; Stop with no confirmation; Resume; Retry failed pages; the
  three MiniMax stops in plain words; the Pages grid with page beats and "Draw this page again"; Contents
  with manga page ranges; About this adaptation (coverage, what was left out and why, how it was made).
- **Draw part of a book (#40).** Choose sections, or a PDF page range when the sections look wrong. The
  size limits (D19) apply to the part you choose, so a longer book can be drawn one part at a time.
- **Review the plan before drawing (#49).** A setting (off by default). The run stops after planning and
  shows the planned pages, the cast, one line per page, what was left out, the money spent so far and
  the estimate to draw the pages. **Draw the pages** or **Stop**.
- **The reader (#53, #49).** On a desktop the page now fills the width up to a read size: balloon text is
  about 16.8 px at 1440×900 (v0.1: about 9–11 px). "Whole page" gives the old view back. A page picker
  ("All pages") works for 40–60 pages, with every target at least 44 px and failed pages marked. The
  reader keeps its v0.1 look otherwise.
- **Settings**: the theme, the plan review setting, the server status (reachable, job runner, key set),
  the models per step with the thinking that is sent, the limits, where your data is, what leaves your
  computer, and credits.
- **404, error page, loading states, offline banner, PDF viewer** in the new design.

### The pages (quality)

- **Renderer 0.6.0 (#41, #42).** New looks (underclothes, undressed), props (pot, stove, roast goose,
  heart, angel, loom, sledge) and backdrops (foundry, dustheap, paradise). The camera pushes in so the
  hero, a speaker or a key prop is not a speck; heads stay in frame; tails aim at the speaker.
- **Writer checks (#43, #45).** Every page check was re-measured on 319 judged pages, and a numeric
  calibration rule decides which checks repair a page (D26). `PROSE_WALL` now asks the writer to repair
  a caption wall. New warnings: `SAME_SHOT_TWICE`, `QUOTE_CLIPPED`.
- **Continuity (#44).** Places per source unit, a location check against the plan (a warning), a panel
  flag for afterlife, dream and memory scenes, and minor figures that the page text names (D21–D23).
- **Statue guard (#48)** reads an appositive ("A prince, a gilded statue …") without flagging a sculptor
  or a statue restorer.

### Operations

- CI runs on `release/v0.2`; the shared-copy tests now run in CI; CI was seen to fail on a planted error.
- The live lane starts one paid run per explicit request (a manual dispatch or adding the `run-live`
  label), never on a push (#47). `start.sh` uses `npm ci` and turns Next.js telemetry off.
- `GET /status` (D25), edition scope, plan review (D24), page-1 time, active time, `cancel_requested`.
- An offline **replay worker** replays a saved run through the real backend and UI with no model call
  (for tests and demos): `PANELSUMMARY_REPLAY_WORKER=<package> ./start.sh`.
- Two hold-out test books (Kipling, *Just So Stories*; Emerson, *Self-Reliance*) (#50).

## Quality, measured

A panel of 3 Sonnet judges scored every page on 8 criteria (1–5), as in v0.1. Strict ship bar: no
criterion below 3, legibility and fidelity of 4 or more, mean of 3.5 or more. A failed page counts as 0.

| Book | Run | Pages | Strict ship bar | Mean | Continuity | Legibility |
|---|---|---|---|---|---|---|
| Two-tale book (26 PDF pp) | v0.1, two runs | 22 | 2 and 4 | 3.42 and 3.49 | 3.11 and 2.94 | 3.33 and 3.44 |
| Two-tale book | **v0.2 (Gate 1)** | 22 | **6** | **3.60** | 3.08 | **3.65** |
| 68-page acceptance book | v0.1 (Gate 2 bar) | 46 | 7 | 3.52 | 2.94 | 3.43 |
| 68-page acceptance book | **v0.2 (Gate 2)** | 61 | **20** | **3.55** | **2.99** | **3.61** |
| *Self-Reliance* (hold-out, nonfiction) | v0.2, two runs | 38 and 36 | 11 and 8 | 3.55 and 3.60 | 3.26 and 3.40 | 3.60 and 3.69 |
| *Civil Disobedience* (nonfiction) | v0.2 | 36 | 11 | 3.53 | 3.34 | 3.74 |
| *Just So Stories* (hold-out, fiction) | **v0.1.0, same panel (controlled)** | 30 | 4 | 3.38 | 2.68 | 3.33 |
| *Just So Stories* (hold-out, fiction) | v0.2, three runs | 34, 35 and 29 | 2, 1 and 2 | 3.44, 3.41 and 3.40 | 2.59, 2.50 and 2.64 | 3.42, 3.43 and 3.41 |

Defects the v0.2 work aimed at (blocker + major per judge-page, 68-page book, v0.1 → v0.2): hero a
speck or cropped 0.62 → 0.35; tail at the wrong figure 0.22 → 0.11; label clutter 0.20 → 0.08;
repeated panels 0.17 → 0.08.

**On a book that was not used for tuning, v0.2 is not yet better than v0.1.** On *Just So Stories*, run once
with v0.1.0 and three times with v0.2 and judged by the same panel, the mean is about the same (3.38 against
3.44, 3.41 and 3.40, inside run-to-run noise) and fewer pages pass the strict bar (4 of 30 against 2, 1 and 2). The writer
changes carry over (label clutter 0.43 → 0.16 and 0.10; beat without prose wall 3.18 → 3.35), but missing
key props (0.59 → 0.73 and 0.86) and wrong settings (0.09 → 0.18 and 0.15) are worse on this book.

**Read these numbers with their limits.** The judges are AI (Sonnet), not readers. Each book has one or
two runs. The two Wilde books were used for tuning; the hold-out books were not. On the fiction hold-out
the gains do not fully carry over: continuity 2.59 and few pages at the strict bar, mostly because the
closed drawing vocabulary has no cave or bone (a cave is drawn as a modern room; a mutton blade-bone as
a sword). Page turn is the weakest criterion (3.35 on the 68-page book, 0.19 below v0.1).

## Cost and time

Costs are estimates at MiniMax-M3 rates (MiniMax publishes no price for the Flash model), not a bill.
Two-tale book: 22 pages in 7 min 27 s, about $0.69. 68-page book: 60 of 61 pages in 14 min 42 s, about
$1.88. Final journey on the release head (*Just So Stories*, 38 PDF pages, real worker, fresh database, new
UI): 29 pages in 6 min 7 s, page 1 after 2 min 0 s, about $0.80. Total live spend for the v0.2 build:
about $9.40 for 10 paid runs (cap $50).

The full gate record, with the evidence, is in `docs/v0.2/GATES.md`.

## Known limits

- On a book that was not used for tuning (fiction), v0.2 is not yet better than v0.1 (see above).

- Born-digital PDFs with selectable text, English, up to 75 PDF pages and 17,500 words per run (a longer
  book can be drawn one part at a time).
- The closed drawing vocabulary does not cover every book (see above).
- The estimate ranges are wide, and v0.2 runs often finish below the low end.
- "Continue with the next section" with a reused cast (project memory) is not in v0.2.
- No hosted deploy (#52): run it on your computer with `./start.sh`.

## Moved to v0.3

See the v0.3 issues: project memory and continuing with the next section; a wall-clock limit for a
failing page attempt (#46: measured, no benefit now); MiniMax plan headroom (its endpoint is on a second
host); the Flash price; a deploy; vocabulary gaps on unseen books; page turn; the reader's 40 px controls.
