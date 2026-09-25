# Acceptance (live product proof)

Book: *The Happy Prince and Other Tales* (Oscar Wilde, 1888, public domain; Project
Gutenberg text typeset into a 68-page, 5-section PDF by
`Book-Reel-scratch/books/build_pdfs.py`). Stack: `./start.sh` with a disposable local
MongoDB (`127.0.0.1:27018`, databases `panelsummary_acceptance` and
`panelsummary_acceptance2`); the owner's Atlas database was never used.

## How to run it

```sh
PANELSUMMARY_DB_NAME=panelsummary_acceptance ./start.sh
node scripts/acceptance/journey.mjs --pdf book.pdf --out OUT --full      # spends MiniMax tokens
node scripts/acceptance/journey.mjs --edition EDITION_ID --out OUT --full # re-verify, no spend
node scripts/acceptance/ui-retry.mjs BOOK_ID OUT                          # press "Retry failed pages"
```

The journey drives Google Chrome (Playwright, headless): upload through the UI, press
**Generate manga**, read every accepted page in the main reader, open the Sources drawer,
step panels on a 390 px phone viewport, then audit the evidence. It fails if a model call is
not a receipted harness goal on an allowed MiniMax model, if the worker contacted any host
other than `api.minimax.io` (so an image endpoint would fail it), if the reader's SVG element
tree differs from the stored page (and the stored SVG from its `svg_hash`), if stored panel
geometry is missing or not framed in panel mode, or if a required claim is silently lost.

## Run 1 (2026-09-26)

| Measure | Value |
|---|---|
| Upload → book page | 6.4 s (parse: 68 PDF pages → 5 sections, 35 units) |
| Generate → understanding done | 142 s (M3, thinking off, whole book in one session) |
| → plan done | 214 s (40 pages, 61 claims planned, 0 omitted) |
| Generate → **page 1 readable** | **232 s** |
| Whole book | 40 pages; 39 accepted in the first pass (~6 min of drawing at 4 in parallel) |
| Failure (visible) | page 32 failed twice: both attempts ran to the 32,000-token output cap in one turn without a tool call. The edition ended `completed_with_failures`; coverage listed claims k48, k49 as lost. Reproduced 3/3 accepted with identical inputs; fixed by a one-shot in-session nudge on truncated turns and a 16k page cap. "Retry failed pages" in the UI then drew page 32 in 44 s; the edition became `complete`. |
| Model calls | 44 (1 understanding, 1 plan, 40 accepted pages, 2 failed page attempts), all `provider: minimax`, `model: MiniMax-M3` |
| Tokens | 957,067 in · 324,723 out · 2,280,040 cache-read |
| Cost | $0.81 (Pi catalog estimate; not a bill) |
| Reader checks | 94 checks; all passed except one over-strict panel-framing check (fixed in the script) |
| Egress | the worker restarted before the audit, so run 1's egress covers only the retry (6 calls, all `api.minimax.io/anthropic/v1/messages`). Run 2 captures a whole run. |

Bugs found by run 1 and fixed: edition token totals were overwritten by status saves
(now partial updates + exact totals from receipts, asserted in the offline test); the journey
kept typing → into a failed page and then printed PASS after crashing (now URL navigation,
a failed-page check, and crash = FAIL).

### Judge panel, run 1

Five independent editor agents scored all 40 pages at full size against the rubric in
`research/craft.md` §(g), with each page's plan, claims and exact source text. Only **1 of
40** pages met the strict ship bar (no score < 3, legibility ≥ 4, fidelity ≥ 4, mean ≥ 3.5).
Means: reading flow 4.35, speaker attribution 3.42, variety 3.40, page turn 3.33,
legibility 3.23, beat-without-prose-wall 3.05, fidelity 2.60, continuity 2.40.
Defects: 260 (writer 135, renderer 77, plan 25, understanding 23; blockers, majors and minors).

What was changed in response (all committed):

- Renderer 0.3.0: statue staged up high in every shot; look variants (blind/stone statue, dead
  bird); speaker-too-small, tail-crosses-face/text, misdirected tails are errors; props drawn
  once and carried; real lie/kneel/carry poses; fireworks; lighter speed lines; plant tones.
- Harness: verbatim quote check against the page's source text; section-title check;
  `claim_map` coverage check; speech-in-narration and 180-degree-rule warnings; scene-not-drawn
  and planned-cast-missing errors.
- Skills: understanding 1.3 (every speaking/acting character including personified forces,
  finer claims, every distinct place, no cartoon emblems for sacred figures); plan 1.2 (open
  every section, no skipped middles, state changes get pages); page 1.4 (state variants,
  speakers large, quotes verbatim, drawn weather).

## Run 2 (2026-09-26, fresh database, no restart during the run)

| Measure | Value |
|---|---|
| Upload → book page | 5.0 s |
| Generate → page 1 readable | 228 s |
| Generate → finished | 17.1 min |
| Pages | 39 planned, 38 accepted, 1 failed (page 34: first attempt hit the submit limit on repeated QUOTE_NOT_IN_SOURCE/TEXT_DOES_NOT_FIT; the retry ran into the output cap). Shown as failed; coverage lists its 2 claims as lost; edition `completed_with_failures`. Reproduced 2/2 accepted. |
| Claims | 82 (finer than run 1's 61); 80 conveyed, 2 lost to the failed page, 0 omitted, 0 required-not-planned |
| Model calls | 42 ({"ADAPTATION_PLAN": 1, "BOOK_UNDERSTANDING": 1, "MANGA_PAGE": 40}), all MiniMax-M3 through the harness |
| Tokens / cost | 1,317,898 in · 492,501 out · 4,637,356 cache-read · $1.26 (catalog estimate) |
| **Worker egress (whole run)** | **{"api.minimax.io/anthropic/v1/messages": 216}** — every outbound request went to the MiniMax messages endpoint; zero image-model calls |
| Journey | 92/92 checks passed |

Judge panel (same rubric): 2 of 38 pages met the strict ship bar. Means: reading flow 4.37,
variety 3.47, speaker attribution 3.39, page turn 3.37, legibility 3.29, beat 3.00,
fidelity 2.45, continuity 2.26. Run 2's understanding (thinking off) cast the Happy Prince
statue as a gold "rocket" object, which broke continuity on every Happy Prince page and
explains most of the continuity drop; it also merged the two students of different tales
and drew ducklings as human children.

Changed in response: understanding back to thinking low (+ STATUE_NOT_HUMAN, CAST_SECTIONS,
CROWD_NOT_PEOPLE, GIANT_NOT_GIANT guards; plan CAST_WRONG_SECTION); FACE_COVERED, TAILS_CROSS,
BALLOON_TALL are errors; claim-evidence check (CLAIM_NOT_EVIDENT/CLAIM_THIN) calibrated on the
run-2 pages; quote errors show the closest source sentence; page goals get 4 previews and 6
submits.

## Run 3 (2026-09-26)

| Measure | Value |
|---|---|
| Upload → book page | 4.0 s |
| Generate → page 1 readable | 787 s (understanding with thinking low, before the patch tool: 11 min) |
| Generate → finished | 41.7 min |
| Pages | 60 planned (92 claims), 58 accepted in the first pass, 2 failed (page 50: output cap; page 57: submit limit) — both shown as failed; "Retry failed pages" in the UI then drew both in 85 s → `complete`, 60/60 |
| Model calls (after the retry) | 68 (6 failed attempts), all MiniMax-M3 through the harness |
| Tokens / cost (after the retry) | 1,956,837 in · 913,988 out · 8,045,672 cache-read · $2.17 (catalog estimate) |
| **Worker egress (whole run)** | {"api.minimax.io/anthropic/v1/messages": 349} — zero image-model calls |
| Journey | first pass 116/117 (one panel-framing reading taken mid-camera-move); re-verify after the fix 134/134 |

Judge panel: **6 of 60 pages met the strict ship bar**; 19 of 60 had a mean ≥ 3.5 with no
criterion below 3. Means: reading flow 4.62, speaker attribution 3.50, variety 3.48, legibility
3.47, page turn 3.42, beat 3.15, fidelity 2.85, continuity 2.33 (overall 3.35). The statue now
stands on its column, the Reed is by the river, the spirits and rose-trees speak. Remaining
fidelity complaints: key quotes and sub-points of claims dropped; continuity: the writer placing
the statue among people at street level. Changed in response: QUOTE_CLAIM_MISSING,
STATUE_AMONG_PEOPLE, the revise tool and the sticky statue guard.

## Nonfiction run (2026-09-26): *On the Duty of Civil Disobedience*

| Measure | Value |
|---|---|
| Pages | 29 planned, 29 accepted, 0 failed — `complete` in one pass |
| Claims | 59: 57 conveyed, 2 omitted by the plan with reasons, 0 lost |
| Generate → page 1 | 569 s |
| Model calls | 31, all MiniMax-M3 through the harness |
| Worker egress | {"api.minimax.io/anthropic/v1/messages": 515} (cumulative for the worker process since it started, including run 3) |
| Journey | 73/73 checks passed |

Pages dramatise the argument with Thoreau in concrete places (Concord, the jail), the State as a
labelled emblem (its lines are `metaphor`), and the book's formulations as quotes.

## Run 4

(pending)
