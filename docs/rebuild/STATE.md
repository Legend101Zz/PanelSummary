# Product rebuild: running state

Updated 2026-10-09 for the branch `release/v0.1`. The first brief (2026-09-25) was: finish
PanelSummary (BookReel) as a working PDF → manga product. MiniMax through the application
harness is the only generation intelligence. No image-generation models. The art is
deterministic SVG. Generate → harness → persisted pages → main reader.

## Workspace

- The rebuild branch `product/harness-manga` was merged into `main` as PR #16 (`7c14501`) on
  2026-09-26. The v0.1 launch work is tracked in issue #17.
- The launch branch is `release/v0.1`. It holds `main`, CI, the tracks T0 to T5, W2-renderer,
  F1 and F2. Other tracks (F3, W2-writer, POL) can still be open. See `docs/launch/README.md`.
- Disposable MongoDB for tests: `mongodb://127.0.0.1:27018`. The Atlas URL in `backend/.env` is
  the owner's database and is not used by this work.
- Port 3000 belongs to the owner's Hermes WhatsApp bridge. The frontend must use another port.
- Test books (public domain, Project Gutenberg) are in `scripts/acceptance/books/`:
  - `happy-prince-and-other-tales.pdf`: 68 pages, 5 tales (fiction, dialogue, multiple
    characters). The acceptance book.
  - `happy-prince-two-tales.pdf`: 26 pages, the first 2 tales. The default of the live lane.
  - `civil-disobedience.pdf`: 34 pages, 3 parts (nonfiction, argument, one narrative episode).

## The system at release/v0.1

The product path is the one in `CLAUDE.md`: upload → parse → Generate (understanding, plan, one
session per page) → validate and render → persist → read. These pieces are new since the
2026-09-26 state.

| Piece | What it does | Where to read |
|---|---|---|
| Size limits and preflight (D19) | `POST /books/{id}/editions` refuses a book over 75 PDF pages or 17,500 words with HTTP 422. `GET /books/{id}/preflight` shows ranges for pages, cost and time. | `backend/app/preflight.py`, `docs/launch/T3-scope.md` |
| Honest latency (D20) | The edition stores `timings.generate_started_at`, `drawing_started_at` and `first_page_at`. | `docs/launch/T3-scope.md` |
| Continuity states | The cast records how a character looks at each source unit. The page goal computes the expected look of every figure per page and flags a contradiction. | `apps/agent-worker/src/goals/continuity.ts`, `docs/launch/T1-continuity.md` |
| Claims fully shown | Warnings for plan order, claim order inside a page, and a death or marriage that the lettering never says. | `apps/agent-worker/src/goals/claim-shown.ts`, `docs/launch/T1-continuity.md` |
| Repair hints | When a page keeps failing with room errors or with changing errors, the writer gets page-level advice. | `apps/agent-worker/src/goals/repair-hints.ts`, `docs/launch/F1-dense-page.md` |
| Renderer 0.5.0 | New props, scale, places, captions and story-state looks (T2). More legible heroes, key props, tails and settings (W2). A change to renderer output needs a new `RENDERER_VERSION`. | `docs/launch/T2-renderer.md`, `docs/launch/W2-renderer.md` |
| Model per goal | `MiniMax-M3.1-Flash-Preview` is registered and selectable per goal. The current policy is decision D13. | `docs/decisions.md`, `docs/launch/T0-model.md` |
| Product surface | The estimate panel, the step list with running time, the link to page 1, plain failure reasons, red status for an edition with failed pages. | `docs/launch/T5-product.md`, `docs/launch/F2-integration.md` |
| Judge harness | Export an edition, draw the pages, score them with a judge panel, compare with the run-8 baseline. | `scripts/acceptance/`, `docs/launch/EVAL.md` |
| CI | `ci.yml` runs the offline checks. `live-journey.yml` is the manual live lane. | `docs/launch/CI.md` |

The renderer version is the constant `RENDERER_VERSION` in `packages/manga-render/src/render.ts`.

## Phases of the first rebuild (done; evidence in this folder)

1. Truth audit: `phase1/`.
2. Architecture decision: `DECISION-architecture.md` and `../decisions.md`.
3. MiniMax experiments: `EXPERIMENTS.md`.
4. Manga craft and visual system: `research/craft.md` (the rubric is in section (g)) and
   `packages/manga-render`.
5. Clean and implement: one harness path, Mongo-leased job runner, rebuilt reader. About 142k
   lines of v1, reel, image and Celery code and stale docs were removed.
6. Product proof: `ACCEPTANCE.md` (eight live runs, judge-panel scores per run).

## Where quality stands

The product path works end to end and fails visibly. Run 8 is the measured baseline in
`docs/rebuild/baselines/run8.json`: 5 of 46 pages met the strict ship bar, and the mean was 3.37 of
5. State continuity (2.43) and claims only partly shown were the weakest scores. The launch
tracks changed code against these faults. They were verified with unit tests and with offline
replays of saved runs. No judge panel has scored a run of the changed code yet. So the quality
of release/v0.1 is not measured. Do not report the run-8 numbers as the numbers of v0.1.

## Known limits

| Limit | Where to read |
|---|---|
| A book over 75 PDF pages or 17,500 words is refused. Chapter-scoped generation moves to v0.2. A slow provider hour can still time out the understanding. | `docs/launch/T3-scope.md`, D19 |
| Time and cost estimates are ranges. Output speed varied from 31 to 324 tokens per second. | `docs/launch/T3-scope.md` |
| A page that fails twice is shown as failed. Page 12 of the two-tale book failed in two live runs. The repair hints are verified. A better success rate is not proven. | `docs/launch/F1-dense-page.md` |
| The retry thinking level for the M3 model needs an owner decision and a measurement. | `docs/launch/F1-dense-page.md`, D13 |
| The renderer cannot draw some states (for example one jewel eye). Some checks are warnings, because too few judged pages exist to make them errors. | `docs/launch/T1-continuity.md`, `docs/launch/W2-renderer.md` |
| The checks were calibrated on one book (five tales). Their precision on other books is unknown. | `docs/launch/T1-continuity.md` |
| The writer does not yet read some renderer warnings as retry hints. | `docs/launch/W2-renderer.md` |
| The page picker of the reader is narrow for 40 or more pages. The upload page does not show the limits. | `docs/launch/T5-product.md` |
| Born-digital PDFs only. A closed drawing vocabulary. English, left to right. | `README.md` |
| The live lane runs from `live/**` branches, from the `run-live` label, or from a manual run once the file is on `main`. | `docs/launch/CI.md` |

## Open (owner decisions)

- Owner-only files: the `CLAUDE.md` Language section and `.claude/skills/simple-english/`.
- Backups outside the repository: `/Volumes/Mrigesh SSD/Book-Reel-backups/`.
- The model policy for each goal (D13) and the retry thinking level.
- Where to deploy v0.1.
