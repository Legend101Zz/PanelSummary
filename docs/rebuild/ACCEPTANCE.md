# Acceptance (live product proof)

Book: *The Happy Prince and Other Tales* (Oscar Wilde, 1888, public domain; Project
Gutenberg text typeset into a 68-page, 5-section PDF by
`Book-Reel-scratch/books/build_pdfs.py`). Stack: `./start.sh` with a disposable local
MongoDB (`127.0.0.1:27018`, a fresh database per run: `panelsummary_acceptance`,
`panelsummary_acceptance2` ... `panelsummary_acceptance5`); the owner's Atlas database was
never used.

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

## Run 4 (2026-09-26, fresh database `panelsummary_acceptance4`)

| Measure | Value |
|---|---|
| Upload → book page | 2.7 s |
| Understanding | 259 s (M3, thinking low; the sticky statue guard rejected six versions until the model gave the Prince `material: gold`; each fix was a small `revise_understanding` patch) |
| Generate → page 1 readable | 397 s |
| Generate → finished | 26.3 min |
| Pages | 58 planned (99 claims: 52 core, 46 supporting), 57 accepted in the first pass, 1 failed (page 17: attempt 1 hit the submit limit on TAIL_CROSSES_TEXT, attempt 2 ran into the output cap) → shown as failed with its reason; coverage listed k29, k30 as lost and core k30 as not conveyed; edition `completed_with_failures`. "Retry failed pages" in the UI drew page 17 in 76 s → `complete`, 58/58, 99/99 claims conveyed |
| Model calls (after the retry) | 62 (2 failed attempts), all MiniMax-M3 through the harness |
| Tokens / cost (after the retry) | 1,954,661 in · 789,077 out · 8,164,620 cache-read · $2.02 (catalog estimate) |
| **Worker egress (whole run)** | {"api.minimax.io/anthropic/v1/messages": 366} — zero image-model calls |
| Journey | first pass 131/131; re-verify after the retry 132/132 |

Judge panel (same rubric and prompt): **9 of 58 pages met the strict ship bar** (run 3: 6 of
60); 12 of 58 had a mean ≥ 3.5 with no criterion below 3. Means: reading flow 4.40, speaker
attribution 3.59, variety 3.52, legibility 3.47, page turn 3.40, beat 3.33, fidelity 2.72,
continuity 2.53 (overall 3.37; run 3: 3.35). Continuity rose (the Prince stays a gold statue
on his column), fidelity fell, and pages with fidelity < 3 went from 17 to 26. Defects: 308
(writer 161, renderer 96, plan 36, understanding 15); blockers: writer 25, understanding 6,
renderer 3, plan 1.

The judges' blockers, by cause:

- **Claims not conveyed** (the most common): a core fact held back for a page-turn hook and
  never paid off (the thorn and heart's-blood price), a death never said, the Giant's high
  wall never built on screen, the Christ child's nail prints in a face close-up.
- **A real quote in the wrong mouth** (pages 1, 2, 36, 48, 49, 57, 58): the Charity
  Children's "just like an angel" given to the Town Councillors, the Page's line to the
  bridegroom, the Squib's to the Bengal Light, the Goose's to the White Duck.
- **Speaking characters missing from the cast**, so pages borrowed another figure: the
  Squib, the two boys, the Christ child (drawn as the garden-children crowd).
- **State continuity**: the Prince's sapphire eyes back in place after he gave them away.
- **A missing-glyph box** inside a quote on page 12: the PDF's "ﬀ" ligature (U+FB00).

Changed in response: the parser folds Latin ligatures and the lettering rejects characters
the font cannot draw (TEXT_GLYPH_MISSING); QUOTE_WRONG_SPEAKER (page) and
SPEAKER_NOT_IN_CAST (understanding) read the book's own attributions ("said the Goose"). On
run 4's pages the speaker check flags 1, 2, 48, 49, 57 and 58 (every flag confirmed by the
judges; page 36's line is attributed only by "she", so it is not caught) and none of the
shipped pages; on the nonfiction book it flags nothing.

## Run 5 (2026-09-26, `panelsummary_acceptance5`): aborted in the understanding

With SPEAKER_NOT_IN_CAST as an error, the first understanding submission came back with 11
errors (10 missing speakers and the statue guard). After one patch the model spent a whole
64k-token turn (cut off at the cap, then nudged) and the attempt hit its 18-minute timeout
at about 93 output tokens/s. Attempt 2 would have run with the same settings, so the edition
was cancelled from the API and the journey reported FAIL (as it should for a cancelled run).
Cost: 1 call, 104,944 in · 100,888 out.

Changed in response: the speaker list goes into the understanding prompt up front (data
derived from the book, not instructions) and SPEAKER_NOT_IN_CAST is a warning; the page goal
still refuses to hand such a speaker's quote to someone else. The understanding timeout is
25 minutes (the worker HTTP timeout 30), because MiniMax output speed varied from about 93 to
324 tokens/s across these runs and the understanding writes 70-100k tokens. The run also
exposed an accounting bug: a failed understanding or plan attempt was added to the totals
during the run but dropped when the totals were recomputed at the end. Failed stage attempts
are now stored on the edition (`stage_failures`), counted, and listed in the receipts; the
offline journey test times out the first understanding attempt and asserts the totals.

## Run 6 (2026-09-26, `panelsummary_acceptance6`): journey passed, product proof failed

| Measure | Value |
|---|---|
| Understanding | 625 s, accepted on the first attempt (1 submit + 1 full resubmit + 4 patches) |
| Generate → page 1 readable / finished | 813 s / 28.6 min |
| Pages | 56 planned, 56 accepted (1 page needed its second attempt), `complete` |
| Model calls / tokens / cost | 59 (1 failed attempt) · 1,632,682 in · 670,512 out · 6,111,214 cache-read · $1.66 |
| Worker egress | {"api.minimax.io/anthropic/v1/messages": 313} |
| Journey | 128/128 checks passed |

The journey passed, but the product did not: the accepted understanding had **no cast for
tales 4 and 5 and no claims at all for tale 5** (26 cast members, 68 claims; run 4 had 39
and 99). The plan still gave tale 5 nine pages; they were drawn with nothing to convey, and
tale 4's pages borrowed the Mayor's figure for the Miller. Coverage could not report claims
that were never extracted, so the edition ended `complete`. The judges scored it 4 of 56
pages at the ship bar, mean 3.09: tales 1-3 held or improved (tale 1: 3.53, speaker
attribution 3.69, against 3.27 and 3.20 in run 4) while tales 4-5 collapsed (2.66, 2.60;
continuity 1.79 and 1.33). Two more defects came from this rebuild's own guards: the sticky statue guard
fired on descriptions that only mention the statue, so the model made the Town Councillors,
the Charity Children and the match-girl stone; and the speaker check let the Swallow keep the
Prince's line because the Swallow's role said "the Prince's messenger".

Changed in response: SECTION_MISSING and SECTION_CLAIMS_THIN (at least one claim per 700
words; healthy runs have one per 118-313) and SPEAKER_NOT_IN_CAST as an error for speakers
with 5+ lines are understanding errors; coverage reports `sections_without_claims` and such
an edition is `completed_with_failures`; the journey fails on it. The statue guard ignores
mentions of a statue; a role match cannot take a line the book gives to someone named.

## Run 7 (2026-09-26, `panelsummary_acceptance7`): cancelled in the understanding

Started with the section guards, then cancelled from the API after about 10 minutes to pick
up the statue-guard and speaker-precedence fixes, so the final run tests the final code. The
cancel exposed one more accounting gap: the edition recorded 0 calls and $0 although the
understanding had been running, because the backend dropped the in-flight request on cancel.
A cancelled call now waits for the worker's CANCELLED reply and records its receipt (new test).

## Run 8 (2026-09-26, `panelsummary_acceptance8`): final run, final code

The first pass ran at `7c315cf` (the cancel-receipt fix `3e23995` landed while it ran and
does not affect an uncancelled run); the page-36 retry ran at `6b15f38`.

| Measure | Value |
|---|---|
| Upload → book page | 4.5 s |
| Understanding | 1,166 s, accepted on the first attempt: 1 submit (9 errors, among them missing speakers) + 6 patches. 47 cast members covering all five tales, 74 claims in every section (s1 28, s2 10, s3 10, s4 13, s5 13); only the Prince is gold. MiniMax ran at about 31 output tokens/s this hour (36k output tokens took 19.5 min). |
| Generate → page 1 readable / finished | 1,823 s / 48.5 min (provider speed; see above) |
| Pages | 46 planned, 45 accepted in the first pass, 1 failed (page 36) → shown as failed, coverage listed k60 and k61 as lost, edition `completed_with_failures` |
| Page 36 | Retry in the UI failed again (2 more attempts): the claim quoted the Duck as 'Ah! that [telling a story with a moral] is always a very dangerous thing to do', so QUOTE_CLAIM_MISSING demanded the bracketed words while QUOTE_NOT_IN_SOURCE forbade them. Fixed (bracketed insertions are not the book's words, `6b15f38`), worker restarted on the same database, "Retry failed pages" again → accepted in 43 s → `complete`, 46/46, 74/74 claims conveyed |
| Model calls (after the retries) | 52 (4 failed attempts), all MiniMax-M3 through the harness |
| Tokens / cost | 1,579,684 in · 638,097 out · 6,761,709 cache-read · $1.65 (catalog estimate) |
| Worker egress | first pass {"api.minimax.io/anthropic/v1/messages": 262}; after the worker restart, the second retry {"...": 4} — zero image-model calls |
| Journey | first pass 108/108; re-verify after the retry 109/109 (includes the new section-coverage check) |

Judge panel (same rubric and prompt): **5 of 46 pages met the strict ship bar**; 13 of 46 had a
mean ≥ 3.5 with no criterion below 3. Means: reading flow 4.41, speaker attribution **3.83**
(best of all runs; pages below 3: 3, against 8 in run 4 and 17 in run 6), variety 3.57, page
turn 3.43, legibility 3.30, beat 3.09, fidelity **2.93** (best; pages below 3: 13 of 46,
against 26 of 58 in run 4), continuity 2.43 (overall 3.37). By tale: 3.24, 3.48, 3.06, 3.57,
3.46: no tale collapsed. Defects 258 (writer 133, renderer 93, plan 19, understanding 13);
blockers: writer 12 (run 4: 25), understanding 8, renderer 6, plan 2.

Remaining blockers, by kind (not fixed in this rebuild):

- **State continuity across pages**: the Prince's sapphire eyes return a page after he gave
  them away; the stripped statue is still gold. The writer must set the look variant on
  every later page; nothing checks it yet.
- **One-line characters the cast leaves out**: the little boy of *The Selfish Giant* (the
  Christ child) and the workmen of *The Remarkable Rocket* speak once or are named once, below
  the 5-line threshold for SPEAKER_NOT_IN_CAST errors, so pages use a crowd or leave them out.
- **Renderer props and scale**: the red Rose-tree drawn in full bloom when it has no roses, a
  held rose falling off the frame, the Giant drawn man-sized in one panel, the moor drawn blank,
  a caption over the subject, a Roman Candle drawn as a wax candle.
- **Claims only partly shown**: a death implied but never said, a sack never carried, the
  climax placed before its set-up.

## Summary across runs (same book, same rubric)

| Run | Pages | Ship bar | Mean | Fidelity | Speaker attr. | Continuity | Calls | Cost | What changed before it |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 40 | 1 | – | 2.60 | 3.42 | 2.40 | 44 | $0.81 | first product run |
| 2 | 38 | 2 | – | 2.45 | 3.39 | 2.26 | 42 | $1.26 | renderer 0.3.0, quote/section/claim-map checks |
| 3 | 60 | 6 | 3.35 | 2.85 | 3.50 | 2.33 | 68 | $2.17 | understanding back to thinking low + look guards |
| 4 | 58 | 9 | 3.37 | 2.72 | 3.59 | 2.53 | 62 | $2.02 | patch tool, quote-claim and statue-staging checks |
| 5 | – | – | – | – | – | – | 1 | $0.16 | aborted: speaker check as an error timed out the understanding |
| 6 | 56 | 4 | 3.09 | 2.79 | 3.12 | 2.16 | 59 | $1.66 | speaker checks, ligatures; understanding dropped two tales |
| 7 | – | – | – | – | – | – | – | (not recorded; the gap it exposed is fixed) | cancelled to test the final code |
| 8 | 46 | 5 | 3.37 | **2.93** | **3.83** | 2.43 | 52 | $1.65 | section coverage, statue guard and speaker precedence fixes |

Nonfiction (*Civil Disobedience*, run alongside run 3): 29/29 pages, 31 calls, $0.73, not
judged. Acceptance spend recorded in total: $10.46 (Pi catalog estimates, not a bill).
