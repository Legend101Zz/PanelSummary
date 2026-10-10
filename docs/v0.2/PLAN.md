# PanelSummary v0.2: build plan

This file is the plan of the v0.2 build. The orchestrator (Claude Opus 5.5) keeps it up to date.
The workers are Claude Sonnet agents in workflows. Tracker issue: "v0.2 build" (it links #40–#53).

v0.2 is judged by one journey, observed for real, through the new UI:

```text
open the app (first run, then the shelf)
   ↓
Add a book → the estimate → click Generate manga
   ↓
does the run card tell the truth while it draws (tone strip, page 1 moment, stop/resume, failures)?
   ↓
Start reading → is the manga better than v0.1, and is it readable on a desktop?
```

Goal: every v0.2 issue closed (done, or moved to v0.3 with a written reason and evidence),
`release/v0.2` merged into `main`, tag `v0.2.0` with release notes.

## 1. Owner decisions (2026-10-10)

| Question | Decision |
|---|---|
| Deploy (#52) | No deploy in v0.2. GitHub release and local `./start.sh`. The landing at `/welcome` is the local variant (the working drop zone). |
| Choose sections (#40, design 6A) and review the plan (#49, design 6B) | Build both. Plan review is a setting, off by default. "Continue with the next section" only if the scope track finishes early. |
| Built-in sample manga | Yes. The v0.1 final-journey edition "Four Tales by Hans Christian Andersen" (18 pages) ships as a seeded sample. The first run shows "Or read the sample first". The landing shows "Read a sample". |
| Live spend | Cap $50. At most about 12 full runs in any 5 hours (MiniMax token plan). |
| Old v0.1 stack on `:3100`/`:8788` | Keep it running. Use other ports. |
| Design | Finished (round 4b). Claude Design is closed. Design fixes happen in code and in `docs/design/DESIGN.md`. The defaults for the open design points are in `docs/design/README.md`. |
| Model policy D13 | Stays, unless an A/B run says otherwise. |

## 2. Tracks

Each track works in its own worktree on the SSD (`/Volumes/Mrigesh SSD/Book-Reel-worktrees/v02-<track>`),
on its own branch (`v02/<track>`), with its own ports and database. A track lands by a pull request into
`release/v0.2` with green CI and an independent review. Only the orchestrator merges.

| Track | Issues | Owned paths | Depends on |
|---|---|---|---|
| P0 ops (#55) | #47 (live lane, `npm ci`) | `.github/`, `start.sh`, `docs/launch/CI.md` | — |
| P0 skeleton | — | route groups `frontend/app/(app)`, `frontend/app/(reader)`; `docs/v0.2/` | P0 ops |
| P0 design docs (#56) | — | `docs/design/`, root `PRODUCT.md`/`DESIGN.md` (links), `.impeccable/` | — |
| G0 | #48; #46 and #47 measurement | `apps/agent-worker/src/goals/book-understanding.ts` (+ test) | — |
| U0 foundation | — | `frontend/app/layout.tsx`, `frontend/app/(app)/layout.tsx`, `frontend/app/tokens.css`, `frontend/app/globals.css`, `frontend/components/ui/**`, `frontend/components/SiteHeader.tsx`, `frontend/public/fonts/BricolageGrotesque*`, `frontend/app/(app)/dev/**`, `frontend/lib/theme.ts` | skeleton, design docs |
| S1 scope backend | #40 (scope), #49 (plan review, upload limits), API gaps | `backend/app/**`, `backend/tests/**`, `frontend/lib/api.ts` (types and calls), `scripts/acceptance/journey.mjs` | skeleton |
| S2 sample and fixtures | sample (owner decision) | `backend/samples/**`, `backend/app/samples.py`, `scripts/fixtures/**`, `backend/tests/test_samples.py` | S1 (route registration) |
| Q1 renderer | #41, #42 | `packages/manga-render/**` | — |
| Q2 writer and continuity | #43, #44, #45 | `apps/agent-worker/src/goals/**`, `apps/agent-worker/src/skills/**` | G0 (#48 file) |
| U3 reader | #53, #49 (page picker) | `frontend/components/reader/**`, `frontend/app/(reader)/books/[id]/read/**` | skeleton |
| U1 screens | #49 (limits on upload) | `frontend/app/(app)/page.tsx`, `library.module.css`, `frontend/app/(app)/upload/**`, `frontend/app/(app)/welcome/**`, `frontend/app/(app)/settings/**`, `frontend/app/not-found.tsx`, `frontend/app/error.tsx`, `frontend/app/(app)/loading.tsx`, `frontend/app/(reader)/books/[id]/source/**`, `frontend/components/shelf/**` | U0, S1, S2 |
| U2 book page | #40 and #49 UI (6A, 6B) | `frontend/app/(app)/books/[id]/**`, `frontend/components/book/**`, `frontend/components/PageThumb.tsx`, `frontend/lib/words.ts` (+ `words.test.ts`), `frontend/lib/hooks.ts` | U0, S1 |

Shared files with an owner and an append rule:
- `frontend/lib/api.ts`: S1 owns it. Other tracks only append new types or calls at the end.
- `frontend/lib/words.ts`: U2 owns the existing functions. U1 appends new exports at the end.
- `docs/decisions.md`: each track appends its own decision entry.

## 3. Contracts

### 3.1 Routes and frame

- Root layout `frontend/app/layout.tsx`: `<html>`, `<body>`, the theme script, fonts. No app frame.
- `frontend/app/(app)/layout.tsx`: `.app-root`, header, footer, skip link. All app screens.
- `frontend/app/(reader)/`: the reader (`/books/{id}/read`) and the PDF viewer (`/books/{id}/source`). They never get `.app-root`. The PDF viewer uses `.app-reading-room`.
- Root `not-found.tsx` and `error.tsx` render outside `(app)`, so they put `.app-root` on their own wrapper.
- Routes: shelf and first run at `/`, landing at `/welcome`, Settings at `/settings`, `/upload`, `/books/{id}`.

### 3.2 Test hooks (SCREENS-AND-STATES §0, keep exactly)

- Book page before a run: exactly one `<button>` whose name contains "Generate manga". It shows as soon as the upload lands. While busy its name is "Generate manga: starting" (visible label "Starting").
- A `<button>` "Retry failed pages" (busy: "Retry failed pages: retrying", visible "Retrying").
- `/upload` has a real `<input type="file">` and opens `/books/{id}` by itself.
- Reader: "could not be drawn", the "Sources" button, `#source-drawer`.
- URLs: `/upload`, `/books/{id}`, `/books/{id}/read?edition={id}&page={n}`, `/books/{id}/source?page={n}&from={reader URL}`.
- `scripts/acceptance/journey.mjs` and `ui-retry.mjs` must pass against the new UI.

### 3.3 Backend API additions (S1)

From `docs/v0.2/API-GAPS.md`. No body and no query keep the v0.1 behaviour.

| Change | Contract |
|---|---|
| Scope on the estimate | `GET /books/{id}/preflight?section_ids=a,b` or `?page_from=3&page_to=40`. Same shape, numbers for the scope, plus `scope`. |
| Scope on Generate | `POST /books/{id}/editions` with an optional JSON body `{section_ids?, pdf_page_from?, pdf_page_to?, review_plan?}`. A bad scope or a scope over the limit gives 422 with reasons. `Edition.scope` (null = whole book) is in every edition view. |
| Words per PDF page | `GET /books/{id}` adds `page_words: number[]` (index = PDF page − 1). |
| Plan review | New status `awaiting_plan_review` after planning, when `review_plan` is true (server default `PLAN_REVIEW_DEFAULT=false`). `POST /editions/{id}/approve-plan` starts the drawing. `POST /editions/{id}/cancel` stops it. The edition view adds `draw_estimate_usd {low, high}` and `plan_omitted [{claim, reason}]`. Spent so far is `totals.cost_usd`. |
| Server status | `GET /status` → `{api, version, runner {running, last_seen}, worker {reachable, key_set}, models [{step, model, thinking}], limits {max_pdf_size_mb, max_pdf_pages, max_source_words, page_attempts, page_concurrency}, plan_review_default}`. Never a key, a token or a database URL. |
| Timings | `timings.page_1_at` (page 1 accepted), `active_seconds` (sum of job run times), job view `cancel_requested`. |
| Shelf | `latest_edition.pages_failed`. |
| Cost basis | `estimated_cost_usd.basis_short` = "Estimate at MiniMax-M3 rates, not a bill." |
| Coverage text | Edition view `book.claims [{id, text, importance, section_id}]` when coverage is set or the plan waits for review. |

### 3.4 Sample (S2)

- `GET /samples` → `[{id, title, installed, book_id?, edition_id?}]`. `POST /samples/{id}` installs it (idempotent) → `{book_id, edition_id}`.
- `LibraryBook.is_sample: boolean`. The data is the real v0.1 final-journey run (18 pages, real timings, cost and coverage). No model call.

## 4. Ports and databases

Every agent that runs a stack uses its own ports and database name. Never use `:3000`, `:3100`, `:8788`.

| Agent | Web | API | Worker | Mongo | Database |
|---|---|---|---|---|---|
| p0-baseline | 3200 | 8100 | 8790 | 27019 | `v02_p0_baseline` |
| u0 / u0 review | 3210 / 3215 | 8110 / 8115 | 8810 / 8815 | 27110 / 27115 | `v02_u0` / `v02_u0r` |
| s1 / s1 review | 3220 / 3225 | 8120 / 8125 | 8820 / 8825 | 27120 / 27125 | `v02_s1` / `v02_s1r` |
| q1 / q1 review | 3230 / 3235 | 8130 / 8135 | 8830 / 8835 | 27130 / 27135 | `v02_q1` / `v02_q1r` |
| u3 / u3 review | 3240 / 3245 | 8140 / 8145 | 8840 / 8845 | 27140 / 27145 | `v02_u3` / `v02_u3r` |
| u1 / u1 review | 3250 / 3255 | 8150 / 8155 | 8850 / 8855 | 27150 / 27155 | `v02_u1` / `v02_u1r` |
| u2 / u2 review | 3260 / 3265 | 8160 / 8165 | 8860 / 8865 | 27160 / 27165 | `v02_u2` / `v02_u2r` |
| s2 / s2 review | 3270 / 3275 | 8170 / 8175 | 8870 / 8875 | 27170 / 27175 | `v02_s2` / `v02_s2r` |
| q2 / q2 review | 3280 / 3285 | 8180 / 8185 | 8880 / 8885 | 27180 / 27185 | `v02_q2` / `v02_q2r` |
| gates and final journey | 3290 | 8190 | 8890 | 27190 | `v02_final_<n>` |

## 5. Gates

**Gate 1 (UI and quality):**
- Every screen in `docs/design/SCREENS-AND-STATES.md` is built. Screenshots side by side with the frames at 1440 and 390, in both themes, looked at by the orchestrator and by a reviewer.
- `npx impeccable@4.5.2 detect` is clean on the app routes, or each finding has a reason.
- 44 px targets, no horizontal scroll at 390, text contrast and 3:1 non-text contrast, focus ring, reduced motion.
- `journey.mjs` passes against a fixture run with the fake worker. Offline checks and the frontend build are green in CI.
- One live run on the 26-page two-tale book with Q1 and Q2 merged, judged by the 3-judge panel, compared with the v0.1 runs of the same book.

**Gate 2 (quality, 68-page acceptance book, same panel).** Pass bar against Gate 2 of v0.1 (`release/v0.1` `d1a2286`):
mean ≥ 3.52; ship-bar pages ≥ 7/46; continuity > 2.94; legibility ≥ 3.43; defect rates per judge-page down
(hero a speck or cropped < 0.62, tail at the wrong figure < 0.22, label clutter < 0.20, repeated panels < 0.17);
no criterion more than 0.2 below v0.1; zero image-model egress; every failure visible.

**Release gate (all must hold to merge `release/v0.2` into `main` and tag `v0.2.0`):**
1. CI green on the final `release/v0.2` head (CI was seen to fail once on a planted error: PR #55).
2. Every screen and state built and compared with its frame at 1440 and 390 in both themes; impeccable findings fixed or justified; the reader unchanged except #53 and #49.
3. The final journey observed end to end in a real browser, on a fresh database and an untuned PDF, through the new UI, with the architecture and egress evidence.
4. Quality judged by the panel and reported against v0.1.
5. Every v0.2 issue closed or moved to v0.3 with a reason; release notes published; spend inside the cap.

## 6. Live runs and spend ledger

Live runs go to GitHub Actions (`gh workflow run live-journey.yml --ref <branch> -f book=<book>`), one at a time.
The cost is the run's own estimate at MiniMax-M3 rates (`totals.cost_usd`), not a bill.

| # | Started (UTC) | Run | Branch @ commit | Book | Purpose | Pages and time | Estimated cost | Result |
|---|---|---|---|---|---|---|---|---|
| 1 | 2026-10-10 14:18 | 38059054224 | release/v0.2 @ 3aaf6cb | happy-prince-two-tales | early Q2 check (G0+Q2a+Q2b, no Q1; renderer 0.5.0) | 21/21, 0 failed; first page 211 s, all 516 s; 23 calls | $0.75 | journey PASSED; egress api.minimax.io only; coverage 59/66 conveyed, 7 omitted, 0 lost |
| 2 | 2026-10-10 14:58 | 38061258863 | release/v0.2 @ d373d8f | happy-prince-two-tales | GATE 1 (Q1 renderer 0.6.0 + Q2a + Q2b + G0) | 22/22, 0 failed; first page 187 s, all 447 s; 24 calls | $0.69 | journey PASSED; egress api.minimax.io only; coverage 54/57 conveyed, 3 omitted, 0 lost |
| 3 | 2026-10-10 14:52 (queued) | 38061300872 | release/v0.2 @ d373d8f | happy-prince-and-other-tales (68 pp) | GATE 2 acceptance book (same code as Gate 1) | 60/61, 1 failed (p42, submit limit); first page 292 s, all 882 s; 64 calls | $1.88 | journey PASSED; egress api.minimax.io only; coverage 126/138 conveyed, 7 omitted, 3 lost (k97,k98 core not conveyed, accounted) |
| 4 | 2026-10-10 15:43 | 38064770960 | release/v0.2 @ dcd9d9c | self-reliance (hold-out, nonfiction) | #50 hold-out run 1 | 38/38, 0 failed; first page 188 s, all 534 s; 40 calls | $0.86 | journey PASSED (new UI) |
| - | 2026-10-10 15:43 | 38064776577 | release/v0.2 @ dcd9d9c | just-so-three-tales | #50 hold-out | 0 | $0 | CANCELLED by GitHub concurrency (a newer queued run replaces a pending one); not run |
| 5 | 2026-10-10 15:43 (queued) | 38064781814 | release/v0.2 @ dcd9d9c | civil-disobedience (nonfiction) | nonfiction | 36/36, 0 failed; first page 149 s, all 491 s; 38 calls | $0.81 | journey PASSED (new UI) |
| 6 | 2026-10-10 16:13 | 38066788100 | release/v0.2 @ dcd9d9c | just-so-three-tales (hold-out, fiction) | #50 hold-out run 1 | 34/34, 0 failed; first page 189 s, all 550 s; 36 calls | $0.99 | journey PASSED (new UI) |
| 7 | 2026-10-10 ~16:50 | local (headed Chrome) | release/v0.2 @ a5b4a5c | just-so-three-tales (hold-out, fiction) | FINAL JOURNEY (fresh DB v02_final_1, new UI, real worker) | 35/35, 0 failed; first page 131 s, page 1 ~135 s, all 464 s; 37 calls | $0.99 | 4 journey questions PASS; egress api.minimax.io only; browser hosts 127.0.0.1 only |
| 8 | 2026-10-10 17:07 | 38070441034 | release/v0.2 @ a5b4a5c | self-reliance (hold-out, nonfiction) | #50 hold-out run 2 | 36/36, 0 failed; first page 131 s, all 401 s; 38 calls | $0.83 | journey PASSED (new UI) |
| 9 | 2026-10-10 17:16 | local (v0.1.0 worktree) | tag v0.1.0 @ ae959fa | just-so-three-tales (hold-out, fiction) | CONTROLLED v0.1 BASELINE on the hold-out | 30/30, 0 failed; first page 121 s, all 427 s; 33 calls (1 failed) | $0.80 | journey PASSED (v0.1 UI) |
| 10 | 2026-10-10 ~18:25 | local (headed Chrome) | release/v0.2 @ 3113fc3 (release head) | just-so-three-tales (hold-out, fiction) | FINAL JOURNEY 2 on the release head (fresh DB v02_final_2, real worker) | 29/29, 0 failed; first page 104 s, page 1 120 s, all 367 s; 31 calls | $0.80 | 4 journey questions PASS; truth 14/14 OK; egress api.minimax.io only; browser hosts 127.0.0.1 only |

Running total: $9.40 of $50 (10 paid runs: 7 in the live lane, 3 local: two v0.2 final journeys and the v0.1.0 hold-out baseline). All costs are estimates at MiniMax-M3 rates, not a bill.

## 7. Cut list (drop in this order if the build is late)

1. Project memory / "Continue with the next section" (#40 part 2).
2. The public showcase landing (not built: the owner chose no deploy).
3. Hold-out repeat runs beyond one per book (#50).
4. #46 (wall-clock limit for a failing attempt).
5. `/dev/components` polish.
6. Q1 backdrops beyond the ones the test books need.
7. Plan review 6B (keep 6A).
8. 6A (then the scope UI is hidden and #40 moves to v0.3 whole).

The final journey and honest reporting are never cut.

## 8. Status log

| Time (UTC) | Event |
|---|---|
| 2026-10-10 13:10 | `release/v0.2` made from `main` (`ae959fa`, `v0.1.0`). |
| 2026-10-10 13:23 | CI red on the planted error (run 38055517882, PR #55), then green after the revert. |
| 2026-10-10 13:30 | Phase 0 baseline: all offline checks green on `main`; 32 v0.1 screenshots; impeccable 0 findings on v0.1. |
| 2026-10-10 13:40–14:20 | Merged #55, #58, #56, #57 (Phase 0, #48). Tracks U0, S1, Q1, Q2a, Q2b started. |
| 2026-10-10 14:20–15:00 | Merged #61 (Q2b), #60 (S1), #63 (U0), #62 (Q2a), #64 (U3), #66 (S2), #65 (Q1). Live run 1 (Q2 only) and Gate 1 run. |
| 2026-10-10 15:00–15:45 | Gate 1 quality PASS. Merged #68 (F1 replay worker), #69 (hold-out books), #67 (U1), #70 (U2). Gate 2 run: PASS. |
| 2026-10-10 15:45–17:00 | Gate 1 UI review (journey 61/61 offline); fix wave #71, #72, #73. Hold-out runs. Final journey on `a5b4a5c`: 4 of 4 PASS. |
| 2026-10-10 17:00–18:40 | v0.1.0 baseline run on the fiction hold-out; #74 (docs, README verified on a clean clone), #75, #76. Final journey 2 on the release head `3113fc3`: 4 of 4 PASS. |

## 9. Outcome

The gate results and their evidence are in `docs/v0.2/GATES.md`. The release notes are in
`docs/launch/RELEASE-NOTES-v0.2.0.md`. Work moved to v0.3 is in the issues with the label `v0.3`.
